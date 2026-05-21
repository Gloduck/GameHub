import argparse
from pathlib import Path
from PIL import Image


def remove_magenta(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    pixels = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            magenta_bias = min(r, b) - g
            if r > 170 and b > 170 and g < 140 and magenta_bias > 70:
                pixels[x, y] = (r, g, b, 0)
    return img


def process_png(path: Path) -> None:
    cleaned = remove_magenta(Image.open(path))
    cleaned.save(path)
    print(path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Remove magenta background from one or more PNG files in place.")
    parser.add_argument("paths", nargs="+", help="One or more PNG file paths.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    for path_str in args.paths:
        process_png(Path(path_str).resolve())


if __name__ == "__main__":
    main()
