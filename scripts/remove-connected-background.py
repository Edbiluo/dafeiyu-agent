import argparse
from collections import deque
from pathlib import Path
from PIL import Image, ImageFilter

parser = argparse.ArgumentParser(description="Remove a connected near-white background.")
parser.add_argument("source", type=Path)
parser.add_argument("target", type=Path)
parser.add_argument("--threshold", type=int, default=58)
args = parser.parse_args()

image = Image.open(args.source).convert("RGBA")
width, height = image.size
pixels = image.load()
reference = pixels[0, 0][:3]
visited = bytearray(width * height)
background = bytearray(width * height)
queue: deque[tuple[int, int]] = deque()


def is_background_candidate(x: int, y: int) -> bool:
    red, green, blue, _ = pixels[x, y]
    distance = max(
        abs(red - reference[0]),
        abs(green - reference[1]),
        abs(blue - reference[2]),
    )
    chroma = max(red, green, blue) - min(red, green, blue)
    return distance <= args.threshold and chroma <= 24


def enqueue(x: int, y: int) -> None:
    index = y * width + x
    if visited[index]:
        return
    visited[index] = 1
    if is_background_candidate(x, y):
        queue.append((x, y))


for x in range(width):
    enqueue(x, 0)
    enqueue(x, height - 1)
for y in range(height):
    enqueue(0, y)
    enqueue(width - 1, y)

while queue:
    x, y = queue.popleft()
    background[y * width + x] = 1
    if x > 0:
        enqueue(x - 1, y)
    if x + 1 < width:
        enqueue(x + 1, y)
    if y > 0:
        enqueue(x, y - 1)
    if y + 1 < height:
        enqueue(x, y + 1)

alpha = Image.new("L", (width, height), 255)
alpha_pixels = alpha.load()
for y in range(height):
    row = y * width
    for x in range(width):
        if background[row + x]:
            alpha_pixels[x, y] = 0

alpha = alpha.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.45))
image.putalpha(alpha)
args.target.parent.mkdir(parents=True, exist_ok=True)
image.save(args.target, optimize=True)
print(
    f"saved={args.target} size={width}x{height} "
    f"corner_alpha={image.getpixel((0, 0))[3]} threshold={args.threshold}"
)
