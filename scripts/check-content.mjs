import assert from 'node:assert/strict';
import { stat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { artist, collections, works } from '../data/works.js';
const allowPreview = process.argv.includes('--allow-preview');
const root = fileURLToPath(new URL('../', import.meta.url));
const ids = new Set();
const checked = new Set();
const imageBytes = new Map();
const providedFilenames = new Set();
const providedHashes = new Set();
let totalBytes = 0;
function dimensions(bytes) {
  if (bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') {
    assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'WebP file is incomplete');
    for (let offset=12; offset+8<bytes.length;) {
      const chunk=bytes.toString('ascii',offset,offset+4), length=bytes.readUInt32LE(offset+4), data=offset+8;
      if(chunk==='VP8X') return {width:1+bytes.readUIntLE(data+4,3),height:1+bytes.readUIntLE(data+7,3)};
      if(chunk==='VP8 ') return {width:bytes.readUInt16LE(data+6)&0x3fff,height:bytes.readUInt16LE(data+8)&0x3fff};
      if(chunk==='VP8L') {const bits=bytes.readUInt32LE(data+1);return {width:1+(bits&0x3fff),height:1+((bits>>>14)&0x3fff)};}
      offset=data+length+(length%2);
    }
  }
  if(bytes[0]===0xff&&bytes[1]===0xd8) {
    assert(bytes.at(-2)===0xff&&bytes.at(-1)===0xd9,'JPEG file is incomplete');
    for(let offset=2;offset<bytes.length-9;) {
      assert(bytes[offset]===0xff,'Invalid JPEG marker');
      while(bytes[offset]===0xff) offset++;
      const marker=bytes[offset++],length=bytes.readUInt16BE(offset);
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) return {height:bytes.readUInt16BE(offset+3),width:bytes.readUInt16BE(offset+5)};
      if(length<2) break;
      offset+=length;
    }
  }
  throw new Error('Unsupported or incomplete viewing image');
}
async function checkImage(src, expected) {
  assert(src.startsWith('assets/photos/'),`Viewing image must be local: ${src}`);
  const absolute=resolve(root,src);
  assert(absolute.startsWith(resolve(root,'assets/photos')+sep),'Image path escapes the viewing directory');
  const bytes=await readFile(absolute);
  const size=dimensions(bytes);
  if(expected) assert.deepEqual(size,expected,`${src}: dimensions differ from data`);
  assert(bytes.length>0&&bytes.length<2_000_000,`${src}: image exceeds viewing budget`);
  imageBytes.set(absolute,bytes.length);
  if(!checked.has(absolute)){checked.add(absolute);totalBytes+=bytes.length;}
  return size;
}
function checkSource(work) {
  if(typeof work.source==='string') {
    if(allowPreview) return;
    const source=new URL(work.source);
    const collection=collections.find(item=>item.id===work.collection);
    assert.equal(source.origin,'https://www.instagram.com',`${work.id}: Instagram source required`);
    assert(source.pathname.startsWith(new URL(collection.instagram).pathname+'p/'),`${work.id}: source must belong to its collection account`);
    return;
  }
  const source=work.source;
  assert(source&&typeof source==='object'&&!Array.isArray(source)&&source.type==='provided',`${work.id}: provided source metadata required`);
  assert(typeof source.file==='string',`${work.id}: provided source filename required`);
  // Sources are provenance only: originals stay outside the published repository.
  // Require one filename below its collection folder, with no absolute or nested paths.
  const match=/^(color|monochrome)\/([^/\\\u0000-\u001f\u007f]+\.(?:jpe?g|png|webp))$/i.exec(source.file);
  assert(match&&match[0]===source.file,`${work.id}: provided source must be a safe collection-relative JPG, JPEG, PNG or WebP filename`);
  const folder={color:'color',mono:'monochrome'}[work.collection];
  assert.equal(match[1],folder,`${work.id}: provided source folder must match its collection`);
  assert(typeof source.sha256==='string'&&source.sha256.length===64&&/^[a-f0-9]{64}$/.test(source.sha256),`${work.id}: provided source SHA-256 must be 64 lowercase hexadecimal characters`);
  const filename=match[2].normalize('NFC').toLowerCase();
  assert(!providedFilenames.has(filename),`${work.id}: duplicate provided source filename`);
  assert(!providedHashes.has(source.sha256),`${work.id}: duplicate provided source SHA-256`);
  providedFilenames.add(filename);
  providedHashes.add(source.sha256);
}
assert(artist.name&&artist.designation&&artist.description,'Artist identity and factual description required');
assert(artist.essay?.label,'Artist source content required');
assert(artist.portrait.src.startsWith('assets/profile/'),'Profile image must be a local profile asset');
const portraitPath=resolve(root,artist.portrait.src);
assert(portraitPath.startsWith(resolve(root,'assets/profile')+sep),'Profile image path escapes its directory');
const portrait=await readFile(portraitPath);
assert.deepEqual(dimensions(portrait),{width:artist.portrait.width,height:artist.portrait.height},'Profile image dimensions differ from data');
assert(portrait.length<100_000&&artist.portrait.alt,'Profile image budget and description required');
for(const href of [artist.portrait.source,artist.essay.href,...artist.activities.map(item=>item.href).filter(Boolean),...artist.links.map(item=>item.href)]) assert(new URL(href).protocol==='https:','Artist source and external links must use HTTPS');
assert(works.length>0,'At least one work required');
assert(collections.length>0,'At least one collection required');
const collectionIds = new Set();
for (const collection of collections) {
  assert(/^[a-z0-9-]+$/.test(collection.id)&&!collectionIds.has(collection.id),'Invalid or duplicate collection');
  collectionIds.add(collection.id);
  assert(collection.label&&collection.name,'Collection labels required');
  assert(new URL(collection.instagram).hostname==='www.instagram.com','Collection source must be Instagram');
  if(!allowPreview) assert.equal(works.filter(work=>work.collection===collection.id).length,collection.targetCount,`${collection.id}: published collection count must match its target`);
}
for(const file of ['index.html','privacy.html','styles.css','analytics.js','app.js','assets/favicon.svg','assets/share.jpg','robots.txt','sitemap.xml','404.html','.nojekyll']) await stat(resolve(root,file));
for(const work of works) {
  assert(/^[a-z0-9-]+$/.test(work.id)&&!ids.has(work.id),`Invalid or duplicate ID: ${work.id}`);
  ids.add(work.id);
  assert(collectionIds.has(work.collection),`${work.id}: unknown collection`);
  assert(Number.isInteger(work.width)&&work.width>0&&Number.isInteger(work.height)&&work.height>0,`${work.id}: dimensions required`);
  assert(typeof work.alt==='string'&&work.alt.trim(),`${work.id}: alt required`);
  assert(['v1','approved',...(allowPreview?['preview']:[])].includes(work.selectionStatus),`${work.id}: preview image must be replaced with a selected original before publication (use check:preview for local review)`);
  checkSource(work);
  await checkImage(work.src,{width:work.width,height:work.height});
  await checkImage(work.thumbnail);
  assert(work.variants?.length>=2,`${work.id}: responsive viewing copies required`);
  for(const variant of work.variants) await checkImage(variant.src,{width:variant.width,height:variant.height});
  const workImages=new Set([work.thumbnail,...work.variants.map(variant=>variant.src)].map(src=>resolve(root,src)));
  const workBytes=[...workImages].reduce((sum,path)=>sum+imageBytes.get(path),0);
  assert(workBytes<2_000_000,`${work.id}: responsive viewing copies and thumbnail exceed the per-work budget`);
}
const html=await readFile(resolve(root,'index.html'),'utf8');
assert(!/noindex/i.test(html),'Publication entry must not contain noindex');
assert(html.includes('rel="canonical"')&&html.includes('property="og:image"'),'Canonical and sharing information required');
assert(totalBytes<works.length*2_000_000,'Viewing assets exceed the per-work library budget');
console.log(`${works.length} ${allowPreview?'review':'published'} works, ${checked.size} viewing images: IDs, collections, formats, exact dimensions and metadata pass.`);
for (const collection of collections) console.log(`${collection.name}: ${works.filter(w=>w.collection===collection.id).length} works (target approximately ${collection.targetCount||20}).`);
if (allowPreview) console.log(`Preview-only images: ${works.filter(w=>w.selectionStatus==='preview').length}. Do not deploy these review copies.`);
console.log(`Viewing assets: ${(totalBytes/1_000_000).toFixed(2)} MB in all responsive sizes. Originals excluded.`);
