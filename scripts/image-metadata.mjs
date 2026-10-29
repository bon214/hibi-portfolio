import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const xmpPrefixes = [
  Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'ascii'),
  Buffer.from('http://ns.adobe.com/xmp/extension/\0', 'ascii'),
];
function invalid(message) { throw new Error(`Invalid image structure: ${message}`); }
function hasPrefix(buffer, prefix) { return buffer.length >= prefix.length && buffer.subarray(0, prefix.length).equals(prefix); }
function scanWebP(bytes) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') invalid('WebP signature');
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) invalid('WebP RIFF length');
  let position = 12, image = false;
  while (position < bytes.length) {
    if (position + 8 > bytes.length) invalid('truncated WebP chunk header');
    const type = bytes.toString('ascii', position, position + 4);
    const length = bytes.readUInt32LE(position + 4);
    const begin = position + 8, end = begin + length, next = end + (length & 1);
    if (next > bytes.length) invalid('truncated WebP chunk');
    if (type === 'EXIF' || type === 'XMP ') throw new Error(`Prohibited image metadata: ${type.trim()}`);
    if (type === 'VP8X') {
      if (length !== 10) invalid('WebP VP8X length');
      if (bytes[begin] & 0x0c) throw new Error('Prohibited image metadata: WebP EXIF/XMP flag');
    }
    if (type === 'VP8 ') {
      if (length < 10 || !bytes.subarray(begin + 3, begin + 6).equals(Buffer.from([0x9d, 0x01, 0x2a])) || !(bytes.readUInt16LE(begin + 6) & 0x3fff) || !(bytes.readUInt16LE(begin + 8) & 0x3fff)) invalid('WebP VP8 header');
      image = true;
    } else if (type === 'VP8L') {
      if (length < 5 || bytes[begin] !== 0x2f) invalid('WebP VP8L header');
      image = true;
    } else if (type === 'ANMF') {
      if (length < 16) invalid('WebP animation frame');
      image = true;
    }
    position = next;
  }
  if (!image) invalid('missing WebP image data');
}
function scanJPEG(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) invalid('JPEG signature');
  let position = 2, inScan = false, image = false, frame = false, ended = false;
  while (position < bytes.length) {
    if (inScan) {
      while (position < bytes.length && bytes[position] !== 0xff) position++;
      if (position >= bytes.length) invalid('unterminated JPEG scan');
    } else if (bytes[position] !== 0xff) invalid('JPEG marker expected');
    while (position < bytes.length && bytes[position] === 0xff) position++;
    if (position >= bytes.length) invalid('truncated JPEG marker');
    const marker = bytes[position++];
    if (inScan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue;
    inScan = false;
    if (marker === 0xd9) { ended = true; break; }
    if (marker === 0xd8 || marker === 0 || (marker >= 0xd0 && marker <= 0xd7)) invalid('unexpected JPEG marker');
    if (marker === 0x01) continue;
    if (position + 2 > bytes.length) invalid('truncated JPEG segment header');
    const length = bytes.readUInt16BE(position);
    if (length < 2 || position + length > bytes.length) invalid('truncated JPEG segment');
    const content = bytes.subarray(position + 2, position + length);
    if (marker === 0xe1 && (hasPrefix(content, Buffer.from('Exif\0\0', 'ascii')) || xmpPrefixes.some((prefix) => hasPrefix(content, prefix)))) {
      throw new Error('Prohibited image metadata: JPEG EXIF/XMP');
    }
    if ((marker >= 0xc0 && marker <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (content.length < 6 || content.readUInt16BE(1) === 0 || content.readUInt16BE(3) === 0) invalid('JPEG frame dimensions');
      frame = true;
    }
    position += length;
    if (marker === 0xda) { if (!frame || content.length < 4) invalid('JPEG scan header'); image = true; inScan = true; }
  }
  if (!image || !ended || position !== bytes.length) invalid('JPEG missing image data or end marker');
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function scanPNG(bytes) {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(pngSignature)) invalid('PNG signature');
  let position = 8, header = false, imageBytes = 0, ended = false;
  while (position < bytes.length) {
    if (position + 12 > bytes.length) invalid('truncated PNG chunk header');
    const length = bytes.readUInt32BE(position), typeStart = position + 4, begin = position + 8, end = begin + length;
    if (end + 4 > bytes.length) invalid('truncated PNG chunk');
    const type = bytes.toString('ascii', typeStart, begin), content = bytes.subarray(begin, end);
    if (bytes.readUInt32BE(end) !== crc32(bytes.subarray(typeStart, end))) invalid('PNG chunk checksum');
    if (!header) { if (type !== 'IHDR' || length !== 13 || content.readUInt32BE(0) === 0 || content.readUInt32BE(4) === 0) invalid('PNG IHDR'); header = true; }
    else if (type === 'IHDR') invalid('duplicate PNG IHDR');
    if (type === 'eXIf') throw new Error('Prohibited image metadata: PNG EXIF');
    if (['iTXt', 'tEXt', 'zTXt'].includes(type)) {
      const zero = content.indexOf(0);
      if (zero < 1 || zero > 79) invalid('PNG text keyword');
      if (content.toString('latin1', 0, zero).toLowerCase() === 'xml:com.adobe.xmp') throw new Error('Prohibited image metadata: PNG XMP');
    }
    if (type === 'IDAT') imageBytes += length;
    position = end + 4;
    if (type === 'IEND') { if (length !== 0) invalid('PNG IEND'); ended = true; break; }
  }
  if (!imageBytes || !ended || position !== bytes.length) invalid('PNG missing image data or end marker');
}

// Detect metadata in container structures rather than matching compressed photo bytes.
export function checkImageMetadata(bytes, format) {
  const extension = format.toLowerCase();
  if (extension === '.webp') scanWebP(bytes);
  else if (extension === '.jpg' || extension === '.jpeg') scanJPEG(bytes);
  else if (extension === '.png') scanPNG(bytes);
  else throw new Error(`Unsupported image format: ${format}`);
}

export async function checkAssetImageMetadata(root) {
  const base = join(root, 'assets');
  let count = 0;
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isSymbolicLink()) throw new Error(`Symbolic link in assets is not supported: ${relative(root, path)}`);
      else if (entry.isFile() && ['.webp', '.jpg', '.jpeg', '.png'].includes(extname(entry.name).toLowerCase())) {
        try { checkImageMetadata(await readFile(path), extname(entry.name)); }
        catch (error) { throw new Error(`${relative(root, path)}: ${error.message}`, { cause: error }); }
        count++;
      }
    }
  }
  await walk(base);
  return count;
}
