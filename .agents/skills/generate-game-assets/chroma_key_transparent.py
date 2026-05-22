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
    sample_points = [
        (0, 0),
        (width - 1, 0),
        (0, height - 1),
        (width - 1, height - 1),
        (width // 2, 0),
        (width // 2, height - 1),
        (0, height // 2),
        (width - 1, height // 2),
    ]
    counts: dict[tuple[int, int, int], int] = {}
    for x, y in sample_points:
        rgb = rgba.getpixel((x, y))[:3]
        counts[rgb] = counts.get(rgb, 0) + 1
    return max(counts.items(), key=lambda item: item[1])[0]


def remove_key_color(
    input_path: Path,
    output_path: Path,
    key_color: tuple[int, int, int] | None,
    tolerance: int,
    edge_softness: int,
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

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)


def recover_foreground_from_green_screen(
    input_path: Path,
    output_path: Path,
    *,
    cleanup_bias: int = 8,
    min_alpha: int = 6,
    normalize_edges: bool = True,
) -> None:
    image = Image.open(input_path).convert("RGBA")
    pixels = image.load()
    width, height = image.size

    for y in range(height):
        for x in range(width):
            r, g, b, _ = pixels[x, y]
            alpha = max(r, b, 255 - g)
            if alpha <= min_alpha:
                pixels[x, y] = (0, 0, 0, 0)
                continue

            a = alpha / 255.0
            out_r = clamp8(r / a)
            out_b = clamp8(b / a)
            out_g = clamp8((g - (255 * (1 - a))) / a)

            if out_g > max(out_r, out_b) + cleanup_bias:
                out_g = max(out_r, out_b)

            pixels[x, y] = (out_r, out_g, out_b, alpha)

    if normalize_edges:
        normalize_edge_colors(image)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Remove a chroma-key background and save a transparent PNG.")
    parser.add_argument("input", type=Path, help="Input image path")
    parser.add_argument("output", type=Path, help="Output PNG path")
    parser.add_argument("--method", choices=["simple", "greenscreen"], default="simple", help="Removal method. Default: simple")
    parser.add_argument("--key-color", help="RGB hex color like 00ff00 or #00ff00. Defaults to auto-detect from corners.")
    parser.add_argument("--tolerance", type=int, default=18, help="Exact color removal tolerance. Default: 18")
    parser.add_argument("--edge-softness", type=int, default=18, help="Fade range after tolerance. Default: 18")
    parser.add_argument("--cleanup-bias", type=int, default=8, help="How aggressively to neutralize green spill in greenscreen mode. Default: 8")
    parser.add_argument("--min-alpha", type=int, default=6, help="Discard very faint leftover pixels in greenscreen mode. Default: 6")
    parser.add_argument("--no-normalize-edges", action="store_true", help="Disable semi-transparent edge color cleanup in greenscreen mode")
    args = parser.parse_args()

    if args.method == "greenscreen":
        recover_foreground_from_green_screen(
            args.input,
            args.output,
            cleanup_bias=args.cleanup_bias,
            min_alpha=args.min_alpha,
            normalize_edges=not args.no_normalize_edges,
        )
        return

    key_color = parse_rgb(args.key_color) if args.key_color else None
    remove_key_color(args.input, args.output, key_color, args.tolerance, args.edge_softness)


if __name__ == "__main__":
    main()
