import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { checkImageMetadata } from './image-metadata.mjs';

const webp = await readFile(new URL('../assets/profile/hibi.webp', import.meta.url));
const jpeg = await readFile(new URL('../assets/share.jpg', import.meta.url));
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, content) {
  const name = Buffer.from(type, 'ascii'), size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  size.writeUInt32BE(content.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, content])));
  return Buffer.concat([size, name, content, checksum]);
}
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
function png(extra = []) {
  return Buffer.concat([signature, pngChunk('IHDR', ihdr), ...extra, pngChunk('IDAT', deflateSync(Buffer.from([0, 255, 255, 255]))), pngChunk('IEND', Buffer.alloc(0))]);
}
function webpWith(type, content) {
  const header = Buffer.alloc(8); header.write(type, 0, 'ascii'); header.writeUInt32LE(content.length, 4);
  const copy = Buffer.concat([webp, header, content, Buffer.alloc(content.length & 1)]);
  copy.writeUInt32LE(copy.length - 8, 4);
  return copy;
}
function jpegWith(marker, content) {
  const header = Buffer.alloc(4); header[0] = 0xff; header[1] = marker; header.writeUInt16BE(content.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), header, content, jpeg.subarray(2)]);
}
const embeddedExif = Buffer.from('Exif\0\0sample', 'ascii');
const embeddedXmp = Buffer.from('http://ns.adobe.com/xap/1.0/\0<sample/>', 'ascii');
const pngXmp = Buffer.from('XML:com.adobe.xmp\0\0\0\0\0<sample/>', 'ascii');
for (const [data, ext] of [[webp, '.webp'], [jpeg, '.jpg'], [png(), '.png']]) assert.doesNotThrow(() => checkImageMetadata(data, ext));
for (const [data, ext] of [
  [webpWith('EXIF', embeddedExif), '.webp'], [webpWith('XMP ', embeddedXmp), '.webp'],
  [jpegWith(0xe1, embeddedExif), '.jpg'], [jpegWith(0xe1, embeddedXmp), '.jpg'],
  [jpegWith(0xe1, Buffer.from('http://ns.adobe.com/xmp/extension/\0sample', 'ascii')), '.jpeg'],
  [png([pngChunk('eXIf', embeddedExif)]), '.png'], [png([pngChunk('iTXt', pngXmp)]), '.png'],
  [png([pngChunk('tEXt', pngXmp)]), '.png'], [png([pngChunk('zTXt', pngXmp)]), '.png'],
]) assert.throws(() => checkImageMetadata(data, ext), /Prohibited image metadata/);
// ICC payloads may contain the same byte strings; only actual metadata containers are rejected.
for (const [data, ext] of [
  [webpWith('ICCP', embeddedExif), '.webp'], [jpegWith(0xe2, embeddedXmp), '.jpg'],
  [png([pngChunk('iCCP', embeddedExif)]), '.png'],
]) assert.doesNotThrow(() => checkImageMetadata(data, ext));
for (const [data, ext] of [[webp.subarray(0, webp.length - 1), '.webp'], [jpeg.subarray(0, jpeg.length - 1), '.jpg'], [png().subarray(0, -1), '.png']]) {
  assert.throws(() => checkImageMetadata(data, ext), /Invalid image structure/);
}
const corruptedPNG = png(); corruptedPNG[corruptedPNG.length - 1] ^= 1;
assert.throws(() => checkImageMetadata(corruptedPNG, '.png'), /checksum/);
console.log('19 image metadata checks pass: EXIF/XMP detection, ICC acceptance, corrupt files.');
