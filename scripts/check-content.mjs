import assert from 'node:assert/strict';
import { stat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { artist, works } from '../data/works.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const ids = new Set();
function jpegDimensions(bytes) {
  let offset = 2;
  while (offset < bytes.length - 9) {
    if (bytes[offset] !== 0xff) throw new Error('Invalid JPEG marker');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    const length = bytes.readUInt16BE(offset);
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    if (length < 2) break;
    offset += length;
  }
  throw new Error('JPEG dimensions could not be read');
}
assert(artist.name && artist.designation, 'Artist name and designation are required');
assert(works.length > 0, 'At least one work is required');
for (const file of ['index.html', 'styles.css', 'app.js', 'assets/favicon.svg']) await stat(resolve(root, file));
for (const work of works) {
  assert(/^[a-z0-9-]+$/.test(work.id), `Invalid work ID: ${work.id}`);
  assert(!ids.has(work.id), `Duplicate work ID: ${work.id}`);
  ids.add(work.id);
  assert(Number.isInteger(work.width) && work.width > 0 && Number.isInteger(work.height) && work.height > 0, `${work.id}: dimensions required`);
  assert(typeof work.alt === 'string' && work.alt.length > 0, `${work.id}: alt text required`);
  assert(['reference', 'approved'].includes(work.selectionStatus), `${work.id}: selection status required`);
  for (const file of [work.src, work.thumbnail].filter(Boolean)) {
    assert(file.startsWith('assets/photos/'), `${work.id}: image must use a local viewing copy`);
    const absolute = resolve(root, file);
    assert(absolute.startsWith(resolve(root, 'assets/photos') + sep), `${work.id}: path escapes the image directory`);
    const info = await stat(absolute).catch(() => { throw new Error(`${file} is missing. Run npm run references, or add the selected viewing copy.`); });
    assert(info.isFile() && info.size > 0, `${file}: image is empty`);
    assert(info.size < 4_000_000, `${file}: viewing copy exceeds the 4MB review budget`);
    const bytes = await readFile(absolute);
    assert(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9, `${file}: JPEG is incomplete`);
    if (file === work.src) assert.deepEqual(jpegDimensions(bytes), { width: work.width, height: work.height }, `${work.id}: dimensions do not match the viewing copy`);
  }
}
console.log(`${works.length} works validated: stable IDs, local image paths, JPEG files, descriptions and selection status.`);
console.log(`${works.filter((w) => w.selectionStatus === 'reference').length} reference works remain provisional. Hosting and publication have not been configured.`);
