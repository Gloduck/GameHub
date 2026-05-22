#!/usr/bin/env python3
import argparse
from pathlib import Path

from PIL import Image


TRANSPARENT_RGB = (255, 0, 255)


def fit_sheet_to_grid(sheet: Image.Image, rows: int, cols: int) -> Image.Image:
    width, height = sheet.size
    fitted_width = width - (width % cols)
    fitted_height = height - (height % rows)
    if fitted_width <= 0 or fitted_height <= 0:
        raise ValueError("spritesheet is too small for the requested grid")
    if fitted_width == width and fitted_height == height:
        return sheet

    left = (width - fitted_width) // 2
    top = (height - fitted_height) // 2
    return sheet.crop((left, top, left + fitted_width, top + fitted_height))


def split_sheet(sheet_path: Path, rows: int, cols: int, frames_dir: Path) -> list[Image.Image]:
    sheet = Image.open(sheet_path).convert("RGBA")
    sheet = fit_sheet_to_grid(sheet, rows, cols)
    width, height = sheet.size
    frame_width = width // cols
    frame_height = height // rows

    frames_dir.mkdir(parents=True, exist_ok=True)
    frames: list[Image.Image] = []
    index = 0
    for row in range(rows):
        for col in range(cols):
            left = col * frame_width
            upper = row * frame_height
            frame = sheet.crop((left, upper, left + frame_width, upper + frame_height))
            frame.save(frames_dir / f"frame_{index:02d}.png")
            frames.append(frame)
            index += 1
    return frames


def rgba_frame_to_gif_palette(frame: Image.Image, alpha_threshold: int = 96) -> Image.Image:
    rgba = frame.convert("RGBA")
    alpha = rgba.getchannel("A")

    matte = Image.new("RGBA", rgba.size, TRANSPARENT_RGB + (255,))
    matte.alpha_composite(rgba)
    quantized = matte.convert("RGB").quantize(colors=255, dither=Image.Dither.NONE)

    indexed_data = []
    alpha_data = alpha.getdata()
    for palette_index, alpha_value in zip(quantized.getdata(), alpha_data):
        if alpha_value < alpha_threshold:
            indexed_data.append(0)
        else:
            indexed_data.append(palette_index + 1)

    paletted = Image.new("P", rgba.size)
    paletted.putdata(indexed_data)

    source_palette = (quantized.getpalette() or [])[:255 * 3]
    padded_palette = list(source_palette) + [0] * max(0, (255 * 3) - len(source_palette))
    target_palette = list(TRANSPARENT_RGB) + padded_palette[:255 * 3]
    target_palette += [0] * max(0, 768 - len(target_palette))
    paletted.putpalette(target_palette[:768])
    paletted.info["transparency"] = 0
    paletted.info["background"] = 0
    return paletted


def write_gif(frames: list[Image.Image], output_path: Path, duration: int, loop: int, alpha_threshold: int) -> None:
    if not frames:
        raise ValueError("no frames to encode")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    paletted_frames = [rgba_frame_to_gif_palette(frame, alpha_threshold=alpha_threshold) for frame in frames]
    first, rest = paletted_frames[0], paletted_frames[1:]
    first.save(
        output_path,
        save_all=True,
        append_images=rest,
        duration=duration,
        loop=loop,
        disposal=2,
        transparency=0,
        background=0,
        optimize=False,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Split a spritesheet into frames and combine them into a GIF.")
    parser.add_argument("input", type=Path, help="Input spritesheet path")
    parser.add_argument("output", type=Path, help="Output GIF path")
    parser.add_argument("--rows", type=int, default=5, help="Grid rows. Default: 5")
    parser.add_argument("--cols", type=int, default=5, help="Grid columns. Default: 5")
    parser.add_argument("--duration", type=int, default=80, help="Frame duration in ms. Default: 80")
    parser.add_argument("--loop", type=int, default=0, help="GIF loop count. Default: 0 (infinite)")
    parser.add_argument("--alpha-threshold", type=int, default=96, help="Transparency cutoff for GIF export. Default: 96")
    parser.add_argument("--frames-dir", type=Path, default=Path("frames"), help="Directory to write extracted frames")
    args = parser.parse_args()

    frames = split_sheet(args.input, args.rows, args.cols, args.frames_dir)
    write_gif(frames, args.output, args.duration, args.loop, args.alpha_threshold)


if __name__ == "__main__":
    main()
