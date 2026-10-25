import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Read-only HTTP verification. This script never publishes or retries a deployment.
const root = fileURLToPath(new URL('../', import.meta.url));
const reportPath = resolve(root, 'artifacts/public-verification.json');
const report = {
  schemaVersion: 1,
  verifiedAt: new Date().toISOString(),
  baseURL: process.argv[2] ?? null,
  pass: false,
  errors: [],
  htmlChecks: null,
  files: [],
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const mimeTypes = {
  '.html': ['text/html'],
  '.css': ['text/css'],
  '.js': ['text/javascript', 'application/javascript'],
  '.mjs': ['text/javascript', 'application/javascript'],
  '.json': ['application/json'],
  '.svg': ['image/svg+xml'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
  '.gif': ['image/gif'],
  '.avif': ['image/avif'],
  '.ico': ['image/x-icon', 'image/vnd.microsoft.icon'],
  '.txt': ['text/plain'],
  '.xml': ['application/xml', 'text/xml'],
  '.woff': ['font/woff', 'application/font-woff'],
  '.woff2': ['font/woff2'],
};

function attributes(tag) {
  const values = {};
  for (const match of tag.matchAll(/\b([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    values[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
  }
  return values;
}

function checkEntryHtml(html, baseURL) {
  const metaTags = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => attributes(tag));
  const robots = metaTags.filter((tag) => /^(?:robots|googlebot|bingbot)$/i.test(tag.name ?? ''));
  const canonicalLinks = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => attributes(tag))
    .filter((tag) => (tag.rel ?? '').toLowerCase().split(/\s+/).includes('canonical'));
  let canonicalMatches = false;
  if (canonicalLinks.length === 1) {
    try {
      const href = canonicalLinks[0].href;
      // A fully qualified canonical also works outside the current page context.
      canonicalMatches = /^https?:\/\//i.test(href ?? '') && new URL(href).href === baseURL.href;
    } catch { /* An invalid canonical is reported below. */ }
  }
  const checks = {
    noNoindex: !robots.some((tag) => /\bnoindex\b/i.test(tag.content ?? '')),
    noLocalhost: !/(?:\blocalhost\b|\b127\.0\.0\.1\b|\[::1\])/i.test(html),
    canonicalMatches,
    canonical: canonicalLinks.map((tag) => tag.href ?? null),
  };
  checks.pass = checks.noNoindex && checks.noLocalhost && checks.canonicalMatches;
  return checks;
}

async function main() {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/verify-public.mjs https://bon214.github.io/hibi-portfolio/');
  const baseURL = new URL(process.argv[2]);
  if (!['https:', 'http:'].includes(baseURL.protocol) || baseURL.username || baseURL.password || baseURL.search || baseURL.hash) {
    throw new Error('Base URL must be an HTTP(S) site URL without credentials, a query or a fragment.');
  }
  if (!baseURL.pathname.endsWith('/')) baseURL.pathname += '/';
  report.baseURL = baseURL.href;
  const files = new Map();
  const pending = [];

  function addFile(path) {
    if (!files.has(path)) {
      files.set(path, { path });
      pending.push(path);
    }
  }

  function addReference(reference, from = '', requiredLocal = false) {
    if (typeof reference !== 'string' || !reference.trim()) {
      if (requiredLocal) report.errors.push(`Invalid image reference in ${from || 'data/works.js'}.`);
      return;
    }
    const value = reference.trim().replaceAll('&amp;', '&');
    if (value.startsWith('#') || /^(?:data|blob|mailto|tel):/i.test(value)) return;
    let url;
    try { url = new URL(value, new URL(from || './', baseURL)); }
    catch {
      report.errors.push(`Invalid resource URL: ${reference} (${from || 'data/works.js'}).`);
      return;
    }
    if (url.origin !== baseURL.origin) {
      if (requiredLocal) report.errors.push(`Work image must be served from this site: ${reference}.`);
      return;
    }
    if (!url.pathname.startsWith(baseURL.pathname)) {
      report.errors.push(`Resource is outside the site's base path: ${reference} (${from || 'data/works.js'}).`);
      return;
    }
    let path;
    try { path = decodeURIComponent(url.pathname.slice(baseURL.pathname.length)); }
    catch {
      report.errors.push(`Resource path cannot be decoded: ${reference}.`);
      return;
    }
    if (!path || path.endsWith('/')) path += 'index.html';
    if (path.includes('\\') || path.split('/').some((segment) => segment === '..' || segment === '.git' || segment.includes('\0'))) {
      report.errors.push(`Unsafe local resource path: ${reference}.`);
      return;
    }
    const absolute = resolve(root, path);
    if (!absolute.startsWith(root.endsWith(sep) ? root : root + sep)) {
      report.errors.push(`Resource escapes the repository: ${reference}.`);
      return;
    }
    addFile(path);
  }

  let sharePath = 'assets/share.jpg';
  for (const candidate of ['assets/share.jpg', 'share.jpg']) {
    try { await readFile(resolve(root, candidate)); sharePath = candidate; break; }
    catch { /* The missing default is recorded in the normal file check. */ }
  }
  for (const path of ['index.html', 'styles.css', 'app.js', 'data/works.js', 'assets/favicon.svg', sharePath, 'robots.txt', 'sitemap.xml', '404.html']) addFile(path);

  try {
    const { works } = await import(pathToFileURL(resolve(root, 'data/works.js')).href);
    if (!Array.isArray(works) || works.length === 0) throw new Error('works must be a nonempty array.');
    for (const work of works) {
      addReference(work.src, '', true);
      if (work.thumbnail) addReference(work.thumbnail, '', true);
      if (work.variants !== undefined && !Array.isArray(work.variants)) {
        report.errors.push(`${work.id ?? 'Unknown work'}: variants must be an array.`);
      }
      for (const variant of Array.isArray(work.variants) ? work.variants : []) addReference(variant.src, '', true);
    }
  } catch (error) {
    report.errors.push(`Cannot collect work images: ${error.message}`);
  }

  // Discover local stylesheet/module dependencies and HTML image references as well.
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const path = pending[cursor];
    const entry = files.get(path);
    try {
      const bytes = await readFile(resolve(root, path));
      entry.local = { bytes: bytes.length, sha256: sha256(bytes) };
      const extension = extname(path).toLowerCase();
      if (!['.html', '.css', '.js', '.mjs'].includes(extension)) continue;
      const source = bytes.toString('utf8');
      if (extension === '.html') {
        for (const [tag] of source.matchAll(/<(?:link|script|img|source|video|audio|track|meta)\b[^>]*>/gi)) {
          const attrs = attributes(tag);
          const kind = tag.match(/^<(\w+)/)[1].toLowerCase();
          if (kind === 'link' && !(attrs.rel ?? '').toLowerCase().split(/\s+/).some((rel) => ['stylesheet', 'icon', 'preload', 'modulepreload', 'apple-touch-icon', 'manifest'].includes(rel))) continue;
          for (const name of ['src', 'href', 'poster']) if (attrs[name]) addReference(attrs[name], path);
          if (attrs.srcset) for (const item of attrs.srcset.split(',')) addReference(item.trim().split(/\s+/)[0], path);
          if (kind === 'meta' && /^(?:og:image|twitter:image)$/i.test(attrs.property ?? attrs.name ?? '')) addReference(attrs.content, path);
        }
      } else if (extension === '.css') {
        for (const match of source.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi)) addReference(match[1] ?? match[2] ?? match[3], path);
        for (const match of source.matchAll(/@import\s+["']([^"']+)["']/gi)) addReference(match[1], path);
      } else {
        for (const match of source.matchAll(/(?:\b(?:import|export)\s+(?:[^;"']*?\s+from\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\))/g)) {
          const reference = match[1] ?? match[2];
          if (/^(?:\.{0,2}\/|https?:\/\/)/i.test(reference)) addReference(reference, path);
        }
      }
    } catch (error) {
      entry.localError = error.message;
    }
  }

  const entries = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const entry = entries[next++];
      entry.url = entry.path === 'index.html' ? baseURL.href : new URL(entry.path.split('/').map(encodeURIComponent).join('/'), baseURL).href;
      entry.errors = [];
      if (entry.localError) entry.errors.push(`Local file unavailable: ${entry.localError}`);
      try {
        const response = await fetch(entry.url, { method: 'GET', signal: AbortSignal.timeout(15_000), cache: 'no-store' });
        const bytes = Buffer.from(await response.arrayBuffer());
        const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        entry.remote = {
          status: response.status,
          url: response.url,
          contentType,
          bytes: bytes.length,
          sha256: sha256(bytes),
        };
        if (response.status !== 200) entry.errors.push(`Expected HTTP 200, received ${response.status}.`);
        const allowed = mimeTypes[extname(entry.path).toLowerCase()];
        if (!allowed) entry.errors.push(`No expected Content-Type is defined for ${entry.path}.`);
        else if (!allowed.includes(contentType)) entry.errors.push(`Unexpected Content-Type: ${contentType || '(missing)'}; expected ${allowed.join(' or ')}.`);
        if (entry.local && entry.remote.sha256 !== entry.local.sha256) entry.errors.push('Public response SHA-256 does not match the local file.');
        if (entry.path === 'index.html') {
          report.htmlChecks = checkEntryHtml(bytes.toString('utf8'), baseURL);
          if (!report.htmlChecks.noNoindex) entry.errors.push('Public entry HTML contains a noindex directive.');
          if (!report.htmlChecks.noLocalhost) entry.errors.push('Public entry HTML contains localhost or a loopback address.');
          if (!report.htmlChecks.canonicalMatches) entry.errors.push('Public entry HTML must contain one absolute canonical URL matching the specified base URL.');
          if (/\bnoindex\b/i.test(response.headers.get('x-robots-tag') ?? '')) entry.errors.push('Public entry response has an X-Robots-Tag noindex directive.');
        }
      } catch (error) {
        entry.errors.push(`HTTP GET failed: ${error.message}`);
      }
      entry.pass = entry.errors.length === 0;
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, worker));
  report.files = entries;
  report.pass = report.errors.length === 0 && entries.length > 0 && entries.every((entry) => entry.pass) && report.htmlChecks?.pass === true;
}

try {
  await main();
} catch (error) {
  report.errors.push(error.message);
}
await mkdir(resolve(root, 'artifacts'), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
for (const entry of report.files) {
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} ${entry.path} | HTTP ${entry.remote?.status ?? 'unavailable'} | ${entry.remote?.contentType ?? 'unknown type'} | SHA-256 ${entry.remote?.sha256 ?? 'unavailable'}`);
  for (const error of entry.errors) console.error(`  ${error}`);
}
for (const error of report.errors) console.error(`FAIL ${error}`);
console.log(`${report.pass ? 'PASS' : 'FAIL'} public verification (${report.files.length} files). Report: ${reportPath}`);
process.exitCode = report.pass ? 0 : 1;
