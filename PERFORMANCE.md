# Reader performance

- The 0927 entry page contains a responsive cover image and inline reader CSS, so the cover can paint before JavaScript or config.json finishes loading. Both reader scripts use defer.
- Viewports up to 700 CSS pixels wide use 640-pixel WebP pages from `mobilePagePattern`. Other books can omit that setting and keep the original JPEG reader behavior.
- Zooming above 100%, browser pinch zoom, or resizing to desktop requests the original image for the visible page(s). The lightweight image remains visible while the original downloads. Already loaded originals are reused.
- Only two page downloads are scheduled at once; obsolete background downloads are cancelled when jumping pages. Failed WebP downloads fall back to the original JPEG. Failed originals can be retried without hiding a previously displayed lightweight page.
- Original JPEGs and the PDF remain unchanged. Regenerate mobile pages with `python tools/build-mobile-pages.py` (Pillow required).
- If `assets/css/app.css` changes, synchronize its contents into the inline style block in `books/0927/index.html`, preserving the additional cover-preview styles. The inline copy avoids a render-blocking stylesheet request.

Validation: desktop/mobile cover display with scripts deliberately stalled; page jumps with old downloads stalled; WebP-to-original zoom while the original is stalled; image fallback and retry; rapid jumps; deep links after reload; orientation/viewport changes; browser console errors; visual comparison of source and compressed pages.
