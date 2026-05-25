#!/usr/bin/env python3
import argparse
import statistics
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


def split_sheet(sheet_path: Path, rows: int, cols: int) -> list[Image.Image]:
    sheet = Image.open(sheet_path).convert("RGBA")
    sheet = fit_sheet_to_grid(sheet, rows, cols)
    width, height = sheet.size
    frame_width = width // cols
    frame_height = height // rows

    frames: list[Image.Image] = []
    for row in range(rows):
        for col in range(cols):
            left = col * frame_width
            upper = row * frame_height
            frame = sheet.crop((left, upper, left + frame_width, upper + frame_height))
            frames.append(frame)
    return frames


def alpha_bbox(frame: Image.Image, alpha_threshold: int) -> tuple[int, int, int, int] | None:
    alpha = frame.convert("RGBA").getchannel("A")
    width, height = alpha.size
    mask = [1 if value >= alpha_threshold else 0 for value in alpha.getdata()]
    visited = bytearray(width * height)
    best_area = 0
    best_box: tuple[int, int, int, int] | None = None

    for start_y in range(height):
        for start_x in range(width):
            index = start_y * width + start_x
            if not mask[index] or visited[index]:
                continue

            stack = [(start_x, start_y)]
            visited[index] = 1
            min_x = max_x = start_x
            min_y = max_y = start_y
            area = 0

            while stack:
                x, y = stack.pop()
                area += 1
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

                for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if next_x < 0 or next_x >= width or next_y < 0 or next_y >= height:
                        continue
                    next_index = next_y * width + next_x
                    if not mask[next_index] or visited[next_index]:
                        continue
                    visited[next_index] = 1
                    stack.append((next_x, next_y))

            if area > best_area:
                best_area = area
                best_box = (min_x, min_y, max_x + 1, max_y + 1)

    return best_box


def align_frames(
    frames: list[Image.Image],
    mode: str,
    alpha_threshold: int,
) -> list[Image.Image]:
    if mode == "none" or not frames:
        return frames

    boxes = [alpha_bbox(frame, alpha_threshold) for frame in frames]
    valid_boxes = [box for box in boxes if box is not None]
    if not valid_boxes:
        return frames

    center_x_values = [((left + right) / 2.0) for left, _, right, _ in valid_boxes]
    center_y_values = [((top + bottom) / 2.0) for _, top, _, bottom in valid_boxes]
    bottom_values = [bottom for _, _, _, bottom in valid_boxes]
    reference_center_x = statistics.median(center_x_values)
    reference_center_y = statistics.median(center_y_values)
    reference_bottom = max(bottom_values)

    aligned_frames: list[Image.Image] = []
    for frame, box in zip(frames, boxes):
        if box is None:
            aligned_frames.append(frame.copy())
            continue

        left, top, right, bottom = box
        crop = frame.crop(box)
        canvas = Image.new("RGBA", frame.size, (0, 0, 0, 0))

        if mode == "center":
            paste_x = round(reference_center_x - (crop.width / 2.0))
            paste_y = round(reference_center_y - (crop.height / 2.0))
        else:
            paste_x = round(reference_center_x - (crop.width / 2.0))
            paste_y = round(reference_bottom - crop.height)

        canvas.alpha_composite(crop, (paste_x, paste_y))
        aligned_frames.append(canvas)

    return aligned_frames


def write_aligned_sheet(frames: list[Image.Image], output_path: Path, rows: int, cols: int) -> None:
    if not frames:
        raise ValueError("no frames to write")

    frame_width, frame_height = frames[0].size
    sheet = Image.new("RGBA", (frame_width * cols, frame_height * rows), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        row = index // cols
        col = index % cols
        sheet.alpha_composite(frame, (col * frame_width, row * frame_height))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path)


def save_frames(frames: list[Image.Image], frames_dir: Path) -> None:
    frames_dir.mkdir(parents=True, exist_ok=True)
    for index, frame in enumerate(frames):
        frame.save(frames_dir / f"frame_{index:02d}.png")


def rgba_frame_to_gif_palette(frame: Image.Image, alpha_threshold: int = 96) -> Image.Image:
    rgba = frame.convert("RGBA")
    alpha = rgba.getchannel("A")

    matte = Image.new("RGBA", rgba.size, TRANSPARENT_RGB + (255,))
    matte.alpha_composite(rgba)
    quantized = matte.convert("RGB").quantize(colors=255, dither=Image.Dither.NONE)

    indexed_data = []
    alpha_data = list(alpha.getdata())
    quantized_data = list(quantized.getdata())
    for palette_index, alpha_value in zip(quantized_data, alpha_data):
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
    parser.add_argument("--align", choices=["none", "bottom-center", "center"], default="bottom-center", help="Realign frames before writing PNGs and GIF. Default: bottom-center")
    parser.add_argument("--align-alpha-threshold", type=int, default=16, help="Alpha threshold used when detecting frame bounds for alignment. Default: 16")
    parser.add_argument("--aligned-sheet-output", type=Path, help="Optional path to write the aligned spritesheet PNG")
    args = parser.parse_args()

    frames = split_sheet(args.input, args.rows, args.cols)
    frames = align_frames(frames, args.align, args.align_alpha_threshold)
    save_frames(frames, args.frames_dir)
    if args.aligned_sheet_output:
        write_aligned_sheet(frames, args.aligned_sheet_output, args.rows, args.cols)
    write_gif(frames, args.output, args.duration, args.loop, args.alpha_threshold)


if __name__ == "__main__":
    main()
