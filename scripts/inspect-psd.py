import json
from pathlib import Path
from psd_tools import PSDImage

source = Path(__file__).parents[1] / "apps" / "desktop" / "live2d" / "dafeiyu-mature" / "source" / "whale-layers.psd"
psd = PSDImage.open(source)


def serialize(layer, depth=0):
    item = {
        "name": layer.name,
        "kind": layer.kind,
        "visible": layer.is_visible(),
        "bbox": [layer.left, layer.top, layer.right, layer.bottom],
        "depth": depth,
    }
    if layer.is_group():
        item["children"] = [serialize(child, depth + 1) for child in layer]
    return item

report = {
    "source": str(source),
    "canvas": {"width": psd.width, "height": psd.height},
    "colorMode": str(psd.color_mode),
    "topLevelLayers": len(psd),
    "layers": [serialize(layer) for layer in psd],
}
output = source.parent / "layer-report.json"
output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"canvas": report["canvas"], "topLevelLayers": len(psd), "report": str(output)}, ensure_ascii=False))
