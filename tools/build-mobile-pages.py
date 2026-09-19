"""Generate lightweight WebP pages without modifying the original JPEGs.

Requires Pillow: python -m pip install Pillow
Run from any directory: python tools/build-mobile-pages.py
"""
from pathlib import Path
from PIL import Image

pages = Path(__file__).resolve().parents[1] / 'books' / '0927' / 'pages'
destination = pages / 'mobile'
destination.mkdir(exist_ok=True)
original_bytes = mobile_bytes = 0
for source in sorted(pages.glob('page-*.jpg')):
    with Image.open(source) as image:
        image = image.convert('RGB')
        image.thumbnail((640, 2000), Image.Resampling.LANCZOS)
        target = destination / (source.stem + '.webp')
        image.save(target, 'WEBP', quality=75, method=6)
    original_bytes += source.stat().st_size
    mobile_bytes += target.stat().st_size
print(f'Original: {original_bytes:,} bytes; mobile: {mobile_bytes:,} bytes')
