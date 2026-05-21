import argparse
from pathlib import Path
from PIL import Image


DEFAULT_FRAME_COUNT = 8
DEFAULT_CELL_SIZE = 256
DEFAULT_BOTTOM_MARGIN = 18
DEFAULT_SIDE_PADDING = 18
DEFAULT_TOP_PADDING = 18


def crop_alpha(img: Image.Image) -> Image.Image:
    bbox = img.getbbox()
    if bbox is None:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    return img.crop(bbox)


def normalize_sheet(path: Path, frame_count: int, cell_size: int, bottom_margin: int, side_padding: int, top_padding: int) -> None:
    sheet = Image.open(path).convert("RGBA")
    frame_width = sheet.width // frame_count
    frames = []
    for index in range(frame_count):
        frame = sheet.crop((index * frame_width, 0, (index + 1) * frame_width, sheet.height))
        frames.append(crop_alpha(frame))

    max_w = max(frame.width for frame in frames)
    max_h = max(frame.height for frame in frames)

    available_w = max(1, cell_size - side_padding * 2)
    available_h = max(1, cell_size - top_padding - bottom_margin)
    scale = min(available_w / max_w, available_h / max_h)

    normalized = Image.new("RGBA", (cell_size * frame_count, cell_size), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        resized = frame.resize(
            (max(1, round(frame.width * scale)), max(1, round(frame.height * scale))),
            Image.Resampling.LANCZOS,
        )
        cell = Image.new("RGBA", (cell_size, cell_size), (0, 0, 0, 0))
        x = (cell_size - resized.width) // 2
        y = cell_size - bottom_margin - resized.height
        cell.alpha_composite(resized, (x, y))
        normalized.alpha_composite(cell, (index * cell_size, 0))

    normalized.save(path)
    print(path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize 8-direction character sheets without background removal.")
    parser.add_argument("paths", nargs="+", help="One or more sheet file paths to normalize.")
    parser.add_argument("--frame-count", type=int, default=DEFAULT_FRAME_COUNT)
    parser.add_argument("--cell-size", type=int, default=DEFAULT_CELL_SIZE)
    parser.add_argument("--bottom-margin", type=int, default=DEFAULT_BOTTOM_MARGIN)
    parser.add_argument("--side-padding", type=int, default=DEFAULT_SIDE_PADDING)
    parser.add_argument("--top-padding", type=int, default=DEFAULT_TOP_PADDING)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    paths = [Path(path).resolve() for path in args.paths]

    for path in paths:
        normalize_sheet(path, args.frame_count, args.cell_size, args.bottom_margin, args.side_padding, args.top_padding)


if __name__ == "__main__":
    main()
