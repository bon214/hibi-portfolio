#!/usr/bin/env python3
"""Prepare selected, locally supplied photographs; never fetch or publish.

Usage: python3 scripts/prepare-provided-assets.py --source-dir /path/to/originals
Selection: artifacts/provided-selection.json (array of id, collection, file,
sha256, alt). Paths in that private file are relative to --source-dir. The output
is assets/photos/provided/ plus artifacts/provided-image-manifest.json. It never
edits works.js. Originals are read only. Pillow with WebP support is required.

Only display-orientation correction and proportional downsampling are applied.
ICC profiles are retained byte-for-byte. EXIF, GPS and XMP are not copied.
"""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from io import BytesIO
import argparse
import json
from pathlib import Path
import re
import tempfile
from PIL import Image, ImageOps, features

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'assets/photos/provided'
EDGES = (400, 800, 1400, 2200)
QUALITIES = (92, 90, 88, 86, 84, 82, 80, 78, 76, 74, 72)
LIMIT = 2_000_000


def digest(raw):
    return sha256(raw).hexdigest()


def load_selection(selection, source_dir):
    entries = json.loads(selection.read_text(encoding='utf-8'))
    assert isinstance(entries, list) and entries, 'Selection must be a nonempty array'
    ids, hashes, files = set(), set(), set()
    for entry in entries:
        photo_id, collection, file = entry['id'], entry['collection'], entry['file']
        assert re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', photo_id), 'Invalid work ID'
        assert collection in ('color', 'mono'), 'Unknown collection'
        folder = 'color' if collection == 'color' else 'monochrome'
        parts = file.split('/')
        assert len(parts) == 2 and parts[0] == folder and parts[1] not in ('', '.', '..'), 'Invalid source file'
        assert '\\' not in file and '\0' not in file and Path(file).suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp'), 'Invalid image path'
        path = (source_dir / file).resolve()
        assert path.is_relative_to(source_dir) and path.is_file(), 'Source outside supplied folder or missing'
        assert re.fullmatch(r'[a-f0-9]{64}', entry['sha256']), 'Source hash required'
        assert isinstance(entry['alt'], str) and entry['alt'].strip(), 'Factual alt description required'
        assert photo_id not in ids and entry['sha256'] not in hashes and file not in files, 'Duplicate selection'
        ids.add(photo_id)
        hashes.add(entry['sha256'])
        files.add(file)
    assert all(sum(e['collection'] == c for e in entries) == 20 for c in ('color', 'mono')), 'Exactly 20 works per collection required'
    return entries


def encode(entry, source_dir, stage):
    raw = (source_dir / entry['file']).read_bytes()
    assert digest(raw) == entry['sha256'], f"{entry['id']}: source changed since selection"
    with Image.open(BytesIO(raw)) as source:
        source.load()
        assert getattr(source, 'n_frames', 1) == 1 and source.mode in ('RGB', 'RGBA', 'L', 'LA'), 'Unsupported source mode'
        profile = source.info.get('icc_profile', b'') or b''
        image = ImageOps.exif_transpose(source)
        assert max(image.size) > 400, 'Source too small for responsive copies'
        sizes, seen = [], set()
        for requested in EDGES:
            edge = min(requested, max(image.size))
            size = tuple(max(1, round(v * edge / max(image.size))) for v in image.size)
            if size not in seen:
                seen.add(size)
                sizes.append((edge, size, image.resize(size, Image.Resampling.LANCZOS)))
        options = {'icc_profile': profile} if profile else {}
        for quality in QUALITIES:
            encoded = []
            for edge, size, resized in sizes:
                buffer = BytesIO()
                resized.save(buffer, 'WEBP', quality=quality, method=6, exact=True, **options)
                encoded.append((edge, size, buffer.getvalue()))
            total = sum(len(data) for _, _, data in encoded) + len(encoded[0][2])
            if total < LIMIT:
                break
        else:
            raise ValueError(f"{entry['id']}: image exceeds viewing budget")
        variants = []
        for edge, size, data in encoded:
            filename = f"{entry['id']}-{edge}.webp"
            (stage / filename).write_bytes(data)
            with Image.open(BytesIO(data)) as check:
                check.load()
                assert check.size == size, 'Encoded size mismatch'
                assert (check.info.get('icc_profile', b'') or b'') == profile, 'ICC profile changed'
                assert not check.getexif() and not check.info.get('exif') and not check.info.get('xmp'), 'Private metadata present'
            variants.append({'src': f'assets/photos/provided/{filename}', 'width': size[0], 'height': size[1]})
        thumb = f"{entry['id']}-thumb.webp"
        (stage / thumb).write_bytes(encoded[0][2])
        largest = variants[-1]
        work = {
            'id': entry['id'], 'collection': entry['collection'],
            'src': largest['src'], 'thumbnail': f'assets/photos/provided/{thumb}',
            'width': largest['width'], 'height': largest['height'], 'alt': entry['alt'],
            'title': None, 'caption': None, 'selectionStatus': 'approved',
            'source': {'type': 'provided', 'file': entry['file'], 'sha256': entry['sha256']},
            'variants': variants,
        }
        return {'work': work, 'sourceWidth': image.width, 'sourceHeight': image.height,
                'iccSha256': digest(profile) if profile else None, 'quality': quality,
                'totalBytes': total, 'metadataStripped': True,
                'files': [{'path': f'assets/photos/provided/{name}', 'bytes': len(data), 'sha256': digest(data)}
                          for name, data in [(f"{entry['id']}-{edge}.webp", data) for edge, _, data in encoded] + [(thumb, encoded[0][2])]]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--selection', type=Path, default=ROOT / 'artifacts/provided-selection.json')
    args = parser.parse_args()
    assert features.check('webp'), 'Pillow WebP support required'
    source_dir = args.source_dir.resolve()
    assert source_dir.is_dir() and not OUTPUT.resolve().is_relative_to(source_dir), 'Original folder must be separate from outputs'
    entries = load_selection(args.selection, source_dir)
    with tempfile.TemporaryDirectory(prefix='hibi-provided-') as directory:
        stage = Path(directory)
        with ThreadPoolExecutor(max_workers=2) as pool:
            records = list(pool.map(lambda entry: encode(entry, source_dir, stage), entries))
        OUTPUT.mkdir(parents=True, exist_ok=True)
        for file in stage.glob('*.webp'):
            pending = OUTPUT / (file.name + '.tmp')
            pending.write_bytes(file.read_bytes())
            pending.replace(OUTPUT / file.name)
    manifest = {'schemaVersion': 1, 'works': [r['work'] for r in records], 'records': records,
                'totalBytes': sum(r['totalBytes'] for r in records)}
    target = ROOT / 'artifacts/provided-image-manifest.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Prepared {len(records)} works / {len(records)*5} viewing files, {manifest['totalBytes']/1_000_000:.2f} MB. Originals unchanged.")


if __name__ == '__main__':
    main()
