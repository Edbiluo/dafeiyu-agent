from pathlib import Path
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer
from psd_tools.constants import Compression

root = Path(__file__).parents[1]
source = root / "apps" / "desktop" / "live2d" / "dafeiyu-mature" / "source" / "whale-layers.psd"
target = source.with_name("whale-layers-cubism.psd")

original = PSDImage.open(source)
rebuilt = PSDImage.new("RGBA", (original.width, original.height), color=(0, 0, 0, 0), depth=8)

for layer in original:
    if layer.is_group():
        raise RuntimeError(f"Unexpected group layer: {layer.name}")
    image = layer.topil()
    if image is None:
        print(f"skip empty layer: {layer.name}")
        continue
    new_layer = PixelLayer.frompil(
        image.convert("RGBA"),
        rebuilt,
        name=layer.name,
        top=layer.top,
        left=layer.left,
        compression=Compression.RLE,
    )
    new_layer.visible = layer.is_visible()
    rebuilt.append(new_layer)

rebuilt.save(target)
verification = PSDImage.open(target)
print(
    f"saved={target} canvas={verification.width}x{verification.height} "
    f"depth={verification.depth} channels={verification.channels} layers={len(verification)}"
)
