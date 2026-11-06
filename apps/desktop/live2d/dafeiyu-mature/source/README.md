# Dafeiyu mature Live2D source

This directory holds local modeling inputs derived from the AAAAGENT whale-girl design resources and subject to its upstream noncommercial attribution/share-alike terms.

- `whale-layers.psd`: upstream file retained unchanged for provenance. Its merged-image data is truncated, so Cubism 5.3 cannot import it.
- `whale-layers-cubism.psd`: rebuilt from all 44 pixel layers using 8-bit RGBA and RLE compression. This is the file to import into Cubism Editor.
- `layer-report.json`: machine-readable layer inventory.

The rebuilt PSD was checked by composing both files from their individual layers with preview data ignored. The resulting 1117×1858 RGBA images are pixel-identical.
