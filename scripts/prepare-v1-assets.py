"""Create local WebP viewing copies; never crop, rotate, or recolor the originals.

Requires Pillow with WebP support. The generated viewing copies are committed;
the publicly sourced originals remain local and are not part of the website.
"""
from pathlib import Path
from PIL import Image
import json

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'assets/photos/v1'
DEST.mkdir(parents=True, exist_ok=True)
manifest = {}
for photo_id in ['hibi-2025-03', 'hibi-2025-01', 'hibi-2025-02', 'hibi-2024-01', 'hibi-2024-02']:
    original = Image.open(ROOT / 'assets/reference' / f'{photo_id}.jpeg')
    profile = original.info.get('icc_profile')
    options = {'icc_profile': profile} if profile else {}
    variants = []
    for edge in [800, 1400, 2200]:
        scale = edge / max(original.size)
        dimensions = tuple(round(n * scale) for n in original.size)
        image = original.resize(dimensions, Image.Resampling.LANCZOS)
        path = DEST / f'{photo_id}-{edge}.webp'
        image.save(path, 'WEBP', quality=92, method=6, **options)
        variants.append({'src': str(path.relative_to(ROOT)), 'width': image.width, 'height': image.height})
    scale = 480 / max(original.size)
    thumb = original.resize(tuple(round(n * scale) for n in original.size), Image.Resampling.LANCZOS)
    thumbnail = DEST / f'{photo_id}-thumb.webp'
    thumb.save(thumbnail, 'WEBP', quality=90, method=6, **options)
    manifest[photo_id] = {**variants[-1], 'thumbnail': str(thumbnail.relative_to(ROOT)), 'variants': variants}
    if photo_id == 'hibi-2025-03':
        scale = 1200 / original.width
        original.resize((1200, round(original.height * scale)), Image.Resampling.LANCZOS).save(ROOT / 'assets/share.jpg', 'JPEG', quality=88, **options)
    print(photo_id, ' '.join(f'{v["width"]}x{v["height"]}' for v in variants))
(ROOT / 'artifacts').mkdir(exist_ok=True)
(ROOT / 'artifacts/image-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
