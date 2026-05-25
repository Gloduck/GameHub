#!/usr/bin/env python3
import argparse
from pathlib import Path

from PIL import Image


def parse_rgb(value: str) -> tuple[int, int, int]:
    text = value.strip().lower()
    if text.startswith("#"):
        text = text[1:]
    if len(text) != 6:
        raise ValueError(f"invalid RGB color: {value}")
    return tuple(int(text[i:i + 2], 16) for i in (0, 2, 4))


def distance(rgb1: tuple[int, int, int], rgb2: tuple[int, int, int]) -> int:
    return sum(abs(a - b) for a, b in zip(rgb1, rgb2))


def clamp8(value: float) -> int:
    return max(0, min(255, int(round(value))))


def despill_key_color(image: Image.Image, key_color: tuple[int, int, int], cleanup_bias: int) -> None:
    dominant_value = max(key_color)
    dominant_indices = [index for index, value in enumerate(key_color) if value == dominant_value]
    if len(dominant_indices) != 1:
        return

    dominant_index = dominant_indices[0]
    pixels = image.load()
    width, height = image.size

    for y in range(height):
        for x in range(width):
            rgba = list(pixels[x, y])
            alpha = rgba[3]
            if alpha == 0:
                continue

            other_values = [rgba[index] for index in range(3) if index != dominant_index]
            channel_value = rgba[dominant_index]
            allowed_max = max(other_values) + cleanup_bias
            if channel_value > allowed_max:
                rgba[dominant_index] = allowed_max
                pixels[x, y] = tuple(rgba)


def normalize_edge_colors(image: Image.Image, radius: int = 1) -> None:
    src = image.load()
    width, height = image.size
    snapshot = list(image.getdata())

    def pixel_at(px: int, py: int) -> tuple[int, int, int, int]:
        return snapshot[py * width + px]

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixel_at(x, y)
            if a == 0 or a >= 255:
                continue

            total_weight = 0.0
            sum_r = 0.0
            sum_g = 0.0
            sum_b = 0.0
            for ny in range(max(0, y - radius), min(height, y + radius + 1)):
                for nx in range(max(0, x - radius), min(width, x + radius + 1)):
                    nr, ng, nb, na = pixel_at(nx, ny)
                    if na < 160:
                        continue
                    weight = na / 255.0
                    sum_r += nr * weight
                    sum_g += ng * weight
                    sum_b += nb * weight
                    total_weight += weight

            if total_weight == 0:
                continue

            avg_r = sum_r / total_weight
            avg_g = sum_g / total_weight
            avg_b = sum_b / total_weight
            blend = min(1.0, (255 - a) / 255.0)
            src[x, y] = (
                clamp8((r * (1.0 - blend)) + (avg_r * blend)),
                clamp8((g * (1.0 - blend)) + (avg_g * blend)),
                clamp8((b * (1.0 - blend)) + (avg_b * blend)),
                a,
            )


def auto_pick_key_color(image: Image.Image) -> tuple[int, int, int]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    stride = max(1, min(width, height) // 64)
    samples: list[tuple[int, int, int]] = []

    for x in range(0, width, stride):
        samples.append(rgba.getpixel((x, 0))[:3])
        samples.append(rgba.getpixel((x, height - 1))[:3])
    for y in range(0, height, stride):
        samples.append(rgba.getpixel((0, y))[:3])
        samples.append(rgba.getpixel((width - 1, y))[:3])

    avg_r = round(sum(rgb[0] for rgb in samples) / len(samples))
    avg_g = round(sum(rgb[1] for rgb in samples) / len(samples))
    avg_b = round(sum(rgb[2] for rgb in samples) / len(samples))
    return (avg_r, avg_g, avg_b)


def remove_key_color(
    input_path: Path,
    output_path: Path,
    key_color: tuple[int, int, int] | None,
    tolerance: int,
    edge_softness: int,
    cleanup_bias: int,
    normalize_edges: bool,
) -> None:
    image = Image.open(input_path).convert("RGBA")
    if key_color is None:
        key_color = auto_pick_key_color(image)

    pixels = image.load()
    width, height = image.size

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            diff = distance((r, g, b), key_color)
            if diff <= tolerance:
                pixels[x, y] = (r, g, b, 0)
            elif edge_softness > 0 and diff <= tolerance + edge_softness:
                alpha = int(255 * (diff - tolerance) / edge_softness)
                pixels[x, y] = (r, g, b, min(a, alpha))

    despill_key_color(image, key_color, cleanup_bias)

    if normalize_edges:
        normalize_edge_colors(image)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)


def resolve_key_color(method: str, explicit_key_color: tuple[int, int, int] | None) -> tuple[int, int, int] | None:
    if explicit_key_color is not None:
        return explicit_key_color
    if method == "greenscreen":
        return (0, 255, 0)
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Remove a chroma-key background and save a transparent PNG.")
    parser.add_argument("input", type=Path, help="Input image path")
    parser.add_argument("output", type=Path, help="Output PNG path")
    parser.add_argument("--method", choices=["direct", "simple", "greenscreen"], default="direct", help="Removal method. All modes directly clear the key color. Default: direct")
    parser.add_argument("--key-color", help="RGB hex color like 00ff00 or #00ff00. Defaults to auto-detect from corners.")
    parser.add_argument("--tolerance", type=int, default=48, help="Exact color removal tolerance. Default: 48")
    parser.add_argument("--edge-softness", type=int, default=12, help="Fade range after tolerance. Default: 12")
    parser.add_argument("--cleanup-bias", type=int, default=10, help="Clamp leftover key-color spill near visible edges. Default: 10")
    parser.add_argument("--no-normalize-edges", action="store_true", help="Disable semi-transparent edge color cleanup after key removal")
    args = parser.parse_args()

    key_color = resolve_key_color(args.method, parse_rgb(args.key_color) if args.key_color else None)
    remove_key_color(
        args.input,
        args.output,
        key_color,
        args.tolerance,
        args.edge_softness,
        args.cleanup_bias,
        normalize_edges=not args.no_normalize_edges,
    )


if __name__ == "__main__":
    main()
