import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

for (const page of ['index.html', 'privacy.html', '404.html']) {
  const html = await readFile(new URL(`../${page}`, import.meta.url), 'utf8');
  const meta = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)">/i);
  assert(meta, `${page}: CSP meta missing`);
  const rules = new Map(meta[1].split(';').map(part => part.trim().split(/\s+/)).filter(parts => parts[0]).map(([key, ...values]) => [key, values]));
  for (const [key, expected] of [['default-src', "'none'"], ['base-uri', "'none'"], ['object-src', "'none'"], ['form-action', "'none'"], ['frame-src', "'none'"]]) {
    assert.deepEqual(rules.get(key), [expected], `${page}: ${key} policy`);
  }
  const scripts = rules.get('script-src');
  assert(scripts?.includes("'self'") && scripts.includes('https://www.googletagmanager.com'), `${page}: expected script sources`);
  assert(!scripts.includes("'unsafe-inline'") && !scripts.includes("'unsafe-eval'"), `${page}: unsafe script source`);
  assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), `${page}: inline script`);
  assert(!/\son[a-z]+\s*=/i.test(html), `${page}: inline event handler`);
  assert(!/\sstyle\s*=/i.test(html), `${page}: inline style attribute`);
  assert(!rules.get('style-src')?.includes("'unsafe-inline'"), `${page}: unsafe style source`);
  for (const [, css] of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const hash = createHash('sha256').update(css).digest('base64');
    assert(rules.get('style-src')?.includes(`'sha256-${hash}'`), `${page}: inline stylesheet hash mismatch`);
  }
  if (page !== '404.html') {
    assert(rules.get('connect-src')?.includes('https://*.google-analytics.com'), `${page}: Analytics connect source`);
    assert(rules.get('img-src')?.includes('https://*.google-analytics.com'), `${page}: Analytics image source`);
  }
}
console.log('CSP checks pass on index, privacy and 404 pages.');
