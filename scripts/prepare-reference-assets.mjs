import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const originals = resolve(root, 'assets/reference');
const output = resolve(root, 'assets/photos/reference');
// Public exhibition references. See docs/asset-sources.md for attribution.
const sources = [
  ['hibi-2025-01', '59f1cd_582cb400d6bc409fa1305cd3c8d646fb~mv2.jpeg', '02bf45125c0a4884d9572d8f65d3fc0a9965202c510b7e05a37a600792e6f97e'],
  ['hibi-2025-02', '59f1cd_7f8805be04014b33ac66f0aedd1f7cc0~mv2.jpeg', '807d089ff197fb153c84e3eb255737ebb2f6301f5d7f45d41935893d75335d86'],
  ['hibi-2025-03', '59f1cd_a2457f393e2e42ac9dcb4e6377424b27~mv2.jpeg', 'ffc85321cbd09d5f546f62d7828da8650019f5fdf1c0bf68fb13ee4bdb0fceef'],
  ['hibi-2024-01', '59f1cd_fac47f3989fb43fcac045c2c058ea7e5~mv2.jpeg', 'bb1b15555052cfad5efb3105225810f986145939ca61b698d9ea0491fceaabe2'],
  ['hibi-2024-02', '59f1cd_4c6ca8463aca4327b8b3d5850d85858d~mv2.jpeg', '977e8977b7e0a06751175bf046b4d3b44015ccd81b361bd9110edb78e449d71d'],
];

if (process.platform !== 'darwin') throw new Error('Reference preparation uses macOS sips. On another OS, provide local reference copies as described in docs/update-guide.md.');
await mkdir(originals, { recursive: true });
await mkdir(output, { recursive: true });
for (const [id, filename, expected] of sources) {
  const sourcePath = resolve(originals, `${id}.jpeg`);
  if (!existsSync(sourcePath)) {
    const response = await fetch(`https://static.wixstatic.com/media/${filename}`);
    if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`${id}: source changed; inspect it before updating the reference.`);
    await writeFile(sourcePath, bytes);
  }
  const bytes = await readFile(sourcePath);
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`${id}: local reference differs from its recorded source.`);
  for (const [suffix, edge, quality] of [['', 2200, 88], ['-thumb', 480, 82]]) {
    execFileSync('sips', ['-Z', String(edge), '-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), sourcePath, '--out', resolve(output, `${id}${suffix}.jpg`)], { stdio: 'pipe' });
  }
  console.log(`${id}: full-size viewing copy + thumbnail prepared`);
}
console.log('Reference copies are local review materials and excluded from Git. Final image selection is pending.');
