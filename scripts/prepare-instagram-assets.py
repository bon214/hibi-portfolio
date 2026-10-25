#!/usr/bin/env python3
"""Prepare local Instagram viewing images without fetching or publishing anything.

Input: artifacts/instagram-selection.json, an array or {"entries": [...]}.
Each entry needs id, collection (color/mono), originalPath, source, and alt.
Optional title, caption and selectionStatus are carried into the work record.
An entry in the explicit selection list defaults to selectionStatus="approved";
this is a selection state, not a claim of separate photographer approval.

Requires Pillow with WebP support. Original bytes are never modified. The only
pixel operation is proportional downsampling, followed by WebP compression.
Embedded ICC bytes are retained; EXIF/GPS and other metadata are not copied.
Non-default EXIF orientation is rejected rather than silently rotating a work.

Examples (run from any directory):
  python3 scripts/prepare-instagram-assets.py --dry-run
  python3 scripts/prepare-instagram-assets.py --expected-count 20 --require-selected

Defaults write only assets/photos/instagram/ and
artifacts/instagram-image-manifest.json. This script never updates data/works.js.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
from pathlib import Path
import re
import sys
import tempfile
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = "artifacts/instagram-selection.json"
PHOTO_DIR = ROOT / "assets/photos/instagram"
MANIFEST = ROOT / "artifacts/instagram-image-manifest.json"
EDGES = (400, 800, 1400, 2200)
QUALITIES = (92, 90, 88, 86, 84, 82, 80, 78, 76, 74, 72)
BYTE_LIMIT = 2_000_000
ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
POST_PATTERN = re.compile(r"^/(?:[A-Za-z0-9_.]+/)?(?:p|reel|tv)/[A-Za-z0-9_-]+/?$")
COLLECTIONS = ("color", "mono")


class PreparationError(Exception):
    """A source or selection cannot meet the documented image contract."""


def workspace_path(value: str, label: str) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise PreparationError(f"{label}: expected a workspace-relative path")
    relative = Path(value)
    if relative.is_absolute():
        raise PreparationError(f"{label}: absolute paths are not allowed")
    resolved = (ROOT / relative).resolve()
    try:
        resolved.relative_to(ROOT)
    except ValueError as exc:
        raise PreparationError(f"{label}: path escapes the workspace") from exc
    return resolved


def relative_path(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def post_url(value: object, photo_id: str) -> str:
    if not isinstance(value, str):
        raise PreparationError(f"{photo_id}: source must be an Instagram post URL")
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in ("instagram.com", "www.instagram.com")
        or parsed.username is not None
        or parsed.password is not None
        or parsed.netloc not in ("instagram.com", "www.instagram.com")
        or not POST_PATTERN.fullmatch(parsed.path)
    ):
        raise PreparationError(f"{photo_id}: source must be an HTTPS Instagram post URL")
    return f"https://www.instagram.com/{parsed.path.strip('/')}/"


def load_entries(input_path: Path, args: argparse.Namespace) -> list[dict]:
    try:
        raw = json.loads(input_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise PreparationError(f"Cannot read selection {relative_path(input_path)}: {exc}") from exc
    entries = raw.get("entries") if isinstance(raw, dict) else raw
    if not isinstance(entries, list) or not entries:
        raise PreparationError("Selection must be a nonempty array or an object with entries")
    seen_ids: set[str] = set()
    normalized: list[dict] = []
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise PreparationError(f"Entry {index + 1}: expected an object")
        photo_id = entry.get("id")
        if not isinstance(photo_id, str) or not ID_PATTERN.fullmatch(photo_id):
            raise PreparationError(f"Entry {index + 1}: id must be a lowercase slug")
        if photo_id in seen_ids:
            raise PreparationError(f"Duplicate work ID: {photo_id}")
        seen_ids.add(photo_id)
        if entry.get("collection") not in COLLECTIONS:
            raise PreparationError(f"{photo_id}: collection must be color or mono")
        alt = entry.get("alt")
        if not isinstance(alt, str) or not alt.strip():
            raise PreparationError(f"{photo_id}: a nonempty alt description is required")
        status = entry.get("selectionStatus", "approved")
        if status not in ("approved", "v1", "preview"):
            raise PreparationError(f"{photo_id}: unknown selectionStatus {status!r}")
        if entry.get("selected") is False:
            raise PreparationError(f"{photo_id}: selected=false cannot be included in the selection")
        if args.require_selected and status not in ("approved", "v1"):
            raise PreparationError(f"{photo_id}: preview image is not a selected publication work")
        for field in ("title", "caption"):
            if entry.get(field) is not None and not isinstance(entry[field], str):
                raise PreparationError(f"{photo_id}: {field} must be a string or null")
        original = workspace_path(entry.get("originalPath"), f"{photo_id}: originalPath")
        if not original.is_file():
            raise PreparationError(f"{photo_id}: original image does not exist: {original}")
        if original.is_relative_to(PHOTO_DIR.resolve()):
            raise PreparationError(f"{photo_id}: originalPath must not point to the output directory")
        normalized.append({
            **entry,
            "originalPath": relative_path(original),
            "source": post_url(entry.get("source"), photo_id),
            "alt": alt.strip(),
            "selectionStatus": status,
        })
    counts = Counter(entry["collection"] for entry in normalized)
    if args.expected_count is not None:
        for collection in COLLECTIONS:
            if counts[collection] != args.expected_count:
                raise PreparationError(
                    f"{collection}: expected exactly {args.expected_count} works; got {counts[collection]}"
                )
    return normalized


def viewing_sizes(size: tuple[int, int]) -> list[tuple[int, int, int]]:
    """Return distinct (long edge, width, height), clamped to the source size."""
    source_edge = max(size)
    result = []
    seen: set[tuple[int, int]] = set()
    for requested in EDGES:
        edge = min(requested, source_edge)
        dimensions = tuple(max(1, round(value * edge / source_edge)) for value in size)
        if dimensions not in seen:
            seen.add(dimensions)
            result.append((edge, *dimensions))
    return result


def inspect_sources(entries: list[dict], Image) -> list[dict]:
    inspected = []
    seen_hashes: dict[str, str] = {}
    for entry in entries:
        photo_id = entry["id"]
        path = ROOT / entry["originalPath"]
        data = path.read_bytes()
        digest = sha256(data)
        if digest in seen_hashes:
            raise PreparationError(
                f"{photo_id}: original bytes duplicate {seen_hashes[digest]} (SHA-256 {digest})"
            )
        seen_hashes[digest] = photo_id
        try:
            with Image.open(BytesIO(data)) as original:
                if getattr(original, "n_frames", 1) != 1:
                    raise PreparationError(f"{photo_id}: animated or multi-frame originals are unsupported")
                if original.mode not in ("RGB", "RGBA", "L", "LA"):
                    raise PreparationError(
                        f"{photo_id}: unsupported mode {original.mode}; automatic color conversion is disabled"
                    )
                orientation = original.getexif().get(274, 1)
                if orientation != 1:
                    raise PreparationError(
                        f"{photo_id}: EXIF orientation {orientation}; rotation requires an approved source"
                    )
                original.load()  # Reject truncated files before producing any output.
                sizes = viewing_sizes(original.size)
                if len(sizes) < 2:
                    raise PreparationError(
                        f"{photo_id}: source long edge must exceed 400px to create two sizes without upscaling"
                    )
                profile = original.info.get("icc_profile", b"") or b""
                inspected.append({
                    "entry": entry,
                    "bytes": len(data),
                    "sha256": digest,
                    "width": original.width,
                    "height": original.height,
                    "mode": original.mode,
                    "iccSha256": sha256(profile) if profile else None,
                    "sizes": sizes,
                })
        except (OSError, ValueError, Image.DecompressionBombError) as exc:
            raise PreparationError(f"{photo_id}: image cannot be decoded: {exc}") from exc
    return inspected


def encode_work(item: dict, staging: Path, Image) -> dict:
    entry = item["entry"]
    photo_id = entry["id"]
    original_path = ROOT / entry["originalPath"]
    # Detect an input replacement between inspection and conversion.
    original_bytes = original_path.read_bytes()
    if sha256(original_bytes) != item["sha256"]:
        raise PreparationError(f"{photo_id}: original changed after validation; rerun preparation")
    with Image.open(BytesIO(original_bytes)) as original:
        original.load()
        profile = original.info.get("icc_profile", b"") or b""
        options = {"icc_profile": profile} if profile else {}
        resized = []
        for edge, width, height in item["sizes"]:
            image = original.copy() if original.size == (width, height) else original.resize(
                (width, height), Image.Resampling.LANCZOS
            )
            resized.append((f"{photo_id}-{edge}.webp", image))
        # The thumbnail is an exact copy of the smallest encoded variant: no crop.
        for quality in QUALITIES:
            outputs = []
            for filename, image in resized:
                buffer = BytesIO()
                image.save(buffer, "WEBP", quality=quality, method=6, exact=True, **options)
                outputs.append((filename, buffer.getvalue(), image.size))
            thumb_bytes = outputs[0][1]
            total_bytes = sum(len(data) for _, data, _ in outputs) + len(thumb_bytes)
            if total_bytes < BYTE_LIMIT and all(len(data) < BYTE_LIMIT for _, data, _ in outputs):
                break
        else:
            raise PreparationError(
                f"{photo_id}: cannot meet the {BYTE_LIMIT}-byte total budget at quality >= {QUALITIES[-1]}; "
                "review this original instead of silently reducing its dimensions or quality further"
            )
        variants = []
        for filename, data, expected_size in outputs:
            path = staging / filename
            path.write_bytes(data)
            with Image.open(path) as check:
                check.load()
                if check.size != expected_size:
                    raise PreparationError(f"{photo_id}: encoded dimensions differ from the source ratio")
                if (check.info.get("icc_profile", b"") or b"") != profile:
                    raise PreparationError(f"{photo_id}: ICC bytes changed during encoding")
            variants.append({
                "src": relative_path(PHOTO_DIR / filename),
                "width": expected_size[0],
                "height": expected_size[1],
                "bytes": len(data),
                "sha256": sha256(data),
            })
        thumbnail_name = f"{photo_id}-thumb.webp"
        (staging / thumbnail_name).write_bytes(thumb_bytes)
        largest = variants[-1]
        return {
            "id": photo_id,
            "collection": entry["collection"],
            "src": largest["src"],
            "thumbnail": relative_path(PHOTO_DIR / thumbnail_name),
            "width": largest["width"],
            "height": largest["height"],
            "alt": entry["alt"],
            "title": entry.get("title"),
            "caption": entry.get("caption"),
            "selectionStatus": entry["selectionStatus"],
            "source": entry["source"],
            "variants": variants,
            "original": {
                "path": entry["originalPath"],
                "width": item["width"],
                "height": item["height"],
                "bytes": item["bytes"],
                "sha256": item["sha256"],
                "iccSha256": item["iccSha256"],
            },
            "encoding": {
                "format": "webp",
                "quality": quality,
                "method": 6,
                "totalBytes": total_bytes,
                "thumbnailBytes": len(thumb_bytes),
                "thumbnailSha256": sha256(thumb_bytes),
                "resizedOnly": True,
            },
        }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", default=DEFAULT_INPUT, help="Workspace-relative selection JSON")
    parser.add_argument("--dry-run", action="store_true", help="Validate sources and planned sizes; write nothing")
    parser.add_argument("--expected-count", type=int, help="Require exactly this many works in each collection")
    parser.add_argument("--require-selected", action="store_true", help="Reject preview selectionStatus")
    args = parser.parse_args()
    if args.expected_count is not None and args.expected_count < 1:
        parser.error("--expected-count must be a positive integer")
    try:
        from PIL import Image, features
    except ImportError:
        parser.exit(1, "Pillow with WebP support is required; use the existing local Pillow environment.\n")
    if not features.check("webp"):
        parser.exit(1, "This Pillow installation has no WebP encoder support.\n")
    try:
        input_path = workspace_path(args.input, "--input")
        entries = load_entries(input_path, args)
        inspected = inspect_sources(entries, Image)
        counts = Counter(entry["collection"] for entry in entries)
        print(f"Validated {len(entries)} originals: color={counts['color']}, mono={counts['mono']}")
        for item in inspected:
            sizes = ", ".join(f"{width}x{height}" for _, width, height in item["sizes"])
            print(f"{item['entry']['id']}: {item['width']}x{item['height']} -> {sizes}; ICC={bool(item['iccSha256'])}")
        if args.dry_run:
            print("Dry run: no files written. Encoded byte budgets are checked only during generation.")
            return 0
        # Stage every output first. A bad source/budget cannot leave half a generated set.
        with tempfile.TemporaryDirectory(prefix="hibi-instagram-") as temporary:
            staging = Path(temporary)
            works = [encode_work(item, staging, Image) for item in inspected]
            manifest = {
                "schemaVersion": 1,
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "selectionFile": relative_path(input_path),
                "counts": {collection: counts[collection] for collection in COLLECTIONS},
                "totalBytes": sum(work["encoding"]["totalBytes"] for work in works),
                "works": works,
            }
            staged_manifest = staging / "instagram-image-manifest.json"
            staged_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            PHOTO_DIR.mkdir(parents=True, exist_ok=True)
            MANIFEST.parent.mkdir(parents=True, exist_ok=True)
            # Write via siblings for atomic per-file replacement, including cross-volume temp dirs.
            for source in sorted(staging.glob("*.webp")):
                destination = PHOTO_DIR / source.name
                pending = destination.with_suffix(".webp.tmp")
                pending.write_bytes(source.read_bytes())
                pending.replace(destination)
            pending_manifest = MANIFEST.with_suffix(".json.tmp")
            pending_manifest.write_bytes(staged_manifest.read_bytes())
            pending_manifest.replace(MANIFEST)
        print(f"Wrote {len(works)} work records to {relative_path(MANIFEST)}")
        print(f"Viewing copies: {manifest['totalBytes'] / 1_000_000:.2f} MB; originals unchanged.")
        return 0
    except (PreparationError, OSError, ValueError) as exc:
        print(f"Preparation failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
