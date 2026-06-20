from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "assets" / "animations" / "holiday-gift-box"
FRAMES_DIR = OUT_DIR / "frames"

SLUG = "holiday-gift-box"
DISPLAY_NAME = "节日礼物盒"
FRAME_W = 384
FRAME_H = 256
COLS = 4
ROWS = 4
FRAME_COUNT = 16
FPS = 16


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def ease_out_cubic(t: float) -> float:
    return 1 - (1 - t) ** 3


def ease_in_out_sine(t: float) -> float:
    return -(math.cos(math.pi * t) - 1) / 2


def rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    hex_color = hex_color.lstrip("#")
    return (
        int(hex_color[0:2], 16),
        int(hex_color[2:4], 16),
        int(hex_color[4:6], 16),
        alpha,
    )


def blank() -> Image.Image:
    return Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))


def draw_soft_ellipse(
    base: Image.Image,
    box: tuple[float, float, float, float],
    color: tuple[int, int, int, int],
    blur: float,
) -> None:
    layer = blank()
    draw = ImageDraw.Draw(layer)
    draw.ellipse(tuple(round(v) for v in box), fill=color)
    if blur:
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(layer)


def draw_diamond(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    r: float,
    fill: tuple[int, int, int, int],
) -> None:
    draw.polygon(
        [
            (round(cx), round(cy - r)),
            (round(cx + r), round(cy)),
            (round(cx), round(cy + r)),
            (round(cx - r), round(cy)),
        ],
        fill=fill,
    )


def draw_club(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    s: float,
    fill: tuple[int, int, int, int],
    outline: tuple[int, int, int, int] | None = None,
) -> None:
    if outline:
        draw_club(draw, cx, cy, s + 1.0, outline, None)
    draw.ellipse((cx - s * 0.45, cy - s * 0.82, cx + s * 0.45, cy + s * 0.08), fill=fill)
    draw.ellipse((cx - s * 0.92, cy - s * 0.22, cx - s * 0.02, cy + s * 0.68), fill=fill)
    draw.ellipse((cx + s * 0.02, cy - s * 0.22, cx + s * 0.92, cy + s * 0.68), fill=fill)
    draw.polygon(
        [
            (cx - s * 0.22, cy + s * 0.55),
            (cx + s * 0.22, cy + s * 0.55),
            (cx + s * 0.38, cy + s * 1.08),
            (cx - s * 0.38, cy + s * 1.08),
        ],
        fill=fill,
    )


def draw_spade(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    s: float,
    fill: tuple[int, int, int, int],
    outline: tuple[int, int, int, int] | None = None,
) -> None:
    if outline:
        draw_spade(draw, cx, cy, s + 1.0, outline, None)
    draw.polygon(
        [
            (cx, cy - s * 1.0),
            (cx + s * 0.82, cy - s * 0.12),
            (cx + s * 0.34, cy + s * 0.52),
            (cx, cy + s * 0.26),
            (cx - s * 0.34, cy + s * 0.52),
            (cx - s * 0.82, cy - s * 0.12),
        ],
        fill=fill,
    )
    draw.polygon(
        [
            (cx - s * 0.22, cy + s * 0.38),
            (cx + s * 0.22, cy + s * 0.38),
            (cx + s * 0.42, cy + s * 1.0),
            (cx - s * 0.42, cy + s * 1.0),
        ],
        fill=fill,
    )


def draw_gold_ribbon(draw: ImageDraw.ImageDraw, x: float, y: float, w: float, h: float, alpha: int = 255) -> None:
    draw.rounded_rectangle((x, y, x + w, y + h), radius=5, fill=rgba("#ffc928", alpha))
    draw.rectangle((x + w * 0.18, y, x + w * 0.42, y + h), fill=rgba("#ffe36b", round(alpha * 0.58)))
    draw.rectangle((x + w * 0.70, y, x + w * 0.82, y + h), fill=rgba("#d79a05", round(alpha * 0.34)))


def draw_box_base(draw: ImageDraw.ImageDraw, open_amount: float) -> None:
    x0, y0 = 118, 123
    w, h = 148, 79
    draw.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=5, fill=rgba("#151513"), outline=rgba("#070707"), width=2)
    draw.rectangle((x0 + 3, y0 + 3, x0 + w - 3, y0 + 18), fill=rgba("#24231e"))
    draw.rectangle((x0 + 66, y0, x0 + 94, y0 + h), fill=rgba("#ffc928"))
    draw.rectangle((x0 + 66, y0, x0 + 78, y0 + h), fill=rgba("#ffe36b", 150))
    draw.rectangle((x0 + 90, y0, x0 + 94, y0 + h), fill=rgba("#bb8207", 110))

    motif = rgba("#000000", 255)
    motif_edge = rgba("#e0ae2a", 255)
    draw_spade(draw, x0 + 31, y0 + 47, 8.2, motif, motif_edge)
    draw_club(draw, x0 + 51, y0 + 71, 6.4, motif, motif_edge)
    draw_club(draw, x0 + 119, y0 + 51, 6.8, motif, motif_edge)
    draw_spade(draw, x0 + 136, y0 + 73, 6.8, motif, motif_edge)

    if open_amount > 0.04:
        glow_alpha = round(170 * open_amount)
        draw.rectangle((x0 + 6, y0 - 4, x0 + w - 6, y0 + 8), fill=rgba("#ffd33a", glow_alpha))


def draw_closed_glint(base: Image.Image, t: float, open_amount: float) -> None:
    if open_amount > 0.02:
        return
    sweep = clamp(t / 0.2, 0, 1)
    if sweep <= 0:
        return
    layer = blank()
    d = ImageDraw.Draw(layer)
    x = 136 + 86 * sweep
    alpha = round(70 * (1 - abs(sweep - 0.5) * 1.2))
    d.polygon(
        [(x - 8, 88), (x + 5, 88), (x + 24, 200), (x + 11, 200)],
        fill=rgba("#fff0a3", max(0, alpha)),
    )
    layer = layer.filter(ImageFilter.GaussianBlur(1.2))
    base.alpha_composite(layer)


def make_lid(open_amount: float) -> Image.Image:
    lid = Image.new("RGBA", (176, 80), (0, 0, 0, 0))
    d = ImageDraw.Draw(lid)
    d.rounded_rectangle((11, 33, 165, 68), radius=5, fill=rgba("#151513"), outline=rgba("#050505"), width=2)
    d.rectangle((14, 36, 162, 45), fill=rgba("#25241f"))
    draw_gold_ribbon(d, 75, 17, 28, 51)
    d.rounded_rectangle((82, 12, 96, 31), radius=5, fill=rgba("#ffc928"), outline=rgba("#8e6205"), width=1)

    bow_shift = 1.6 * math.sin(open_amount * math.pi)
    left_loop = [(86, 16), (64, 0 + bow_shift), (39, 9 + bow_shift), (58, 25 + bow_shift)]
    right_loop = [(93, 16), (115, 0 - bow_shift), (141, 10 - bow_shift), (121, 25 - bow_shift)]
    d.polygon(left_loop, fill=rgba("#f1a900"), outline=rgba("#8e6205"))
    d.polygon(right_loop, fill=rgba("#f1a900"), outline=rgba("#8e6205"))
    d.polygon([(86, 16), (64, 4 + bow_shift), (48, 12 + bow_shift), (74, 21)], fill=rgba("#ffd13a"))
    d.polygon([(93, 16), (115, 4 - bow_shift), (132, 13 - bow_shift), (105, 21)], fill=rgba("#ffd13a"))
    d.polygon([(78, 22), (56, 30), (72, 36), (87, 26)], fill=rgba("#d89405"), outline=rgba("#8e6205"))
    d.polygon([(101, 22), (124, 31), (108, 36), (92, 26)], fill=rgba("#d89405"), outline=rgba("#8e6205"))
    d.rounded_rectangle((82, 10, 97, 25), radius=5, fill=rgba("#ffc928"), outline=rgba("#8e6205"), width=1)
    d.rectangle((86, 12, 91, 25), fill=rgba("#ffe36b", 150))
    return lid


def paste_rotated(base: Image.Image, sprite: Image.Image, cx: float, cy: float, angle: float, scale: float = 1.0) -> None:
    if scale != 1:
        sprite = sprite.resize((round(sprite.width * scale), round(sprite.height * scale)), Image.Resampling.LANCZOS)
    sprite = sprite.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    base.alpha_composite(sprite, (round(cx - sprite.width / 2), round(cy - sprite.height / 2)))


def draw_light(base: Image.Image, t: float, open_amount: float, fade: float) -> None:
    if open_amount <= 0:
        return
    d = ImageDraw.Draw(base)
    cx, cy = 192, 130
    pulse = 0.75 + 0.25 * math.sin(t * math.tau * 2)
    draw_soft_ellipse(base, (112, 84, 272, 178), rgba("#ffcd28", round(95 * open_amount * fade)), 18)
    draw_soft_ellipse(base, (136, 102, 248, 151), rgba("#ffe88a", round(110 * open_amount * pulse * fade)), 11)

    for n in range(11):
        phase = clamp((t - 0.28 - n * 0.025) / 0.62, 0, 1)
        if phase <= 0 or phase >= 1:
            continue
        angle = -math.pi + n * (math.tau / 10.0)
        radius = 18 + 78 * phase
        x = cx + math.cos(angle) * radius * 0.88
        y = cy - 5 + math.sin(angle) * radius * 0.42 - 18 * phase
        size = (4 + 5 * (1 - phase)) * fade
        alpha = round(210 * (1 - phase) * open_amount * fade)
        draw_diamond(d, x, y, size, rgba("#ffd84c", alpha))

    for n in range(7):
        phase = clamp((t - 0.38 - n * 0.045) / 0.5, 0, 1)
        if phase <= 0 or phase >= 1:
            continue
        x = 145 + n * 16 + math.sin(n * 1.7) * 18
        y = 133 - 58 * phase
        alpha = round(115 * (1 - phase) * fade)
        d.line((x - 11, y, x + 11, y), fill=rgba("#ffe68a", alpha), width=2)
        d.line((x, y - 11, x, y + 11), fill=rgba("#ffe68a", alpha), width=2)


def draw_floor_shadow(base: Image.Image, fade: float) -> None:
    draw_soft_ellipse(base, (111, 199, 273, 219), rgba("#000000", round(70 * fade)), 7)


def frame(index: int) -> Image.Image:
    img = blank()
    t = index / (FRAME_COUNT - 1)
    open_amount = ease_out_cubic(clamp((t - 0.18) / 0.42, 0, 1))
    fly_amount = ease_in_out_sine(clamp((t - 0.42) / 0.43, 0, 1))
    fade = 1 - ease_out_cubic(clamp((t - 0.88) / 0.12, 0, 1))

    draw_floor_shadow(img, fade)
    draw_light(img, t, open_amount, fade)
    d = ImageDraw.Draw(img)
    draw_box_base(d, open_amount)
    draw_closed_glint(img, t, open_amount)

    lid = make_lid(open_amount)
    lid_x = 192 + 49 * fly_amount
    lid_y = 99 - 62 * fly_amount - 8 * math.sin(open_amount * math.pi)
    angle = -3 - 32 * open_amount - 16 * fly_amount
    paste_rotated(img, lid, lid_x, lid_y, angle, 1.0)

    return img


def save_transparent_gif(frames: list[Image.Image], path: Path) -> None:
    gif_frames = []
    for item in frames:
        paletted = item.convert("P", palette=Image.Palette.ADAPTIVE, colors=255)
        alpha = item.getchannel("A")
        paletted.info["transparency"] = 255
        paletted.paste(255, mask=alpha.point(lambda a: 255 if a <= 8 else 0))
        gif_frames.append(paletted)

    gif_frames[0].save(
        path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=round(1000 / FPS),
        loop=0,
        transparency=255,
        disposal=2,
    )


def write_metadata() -> None:
    metadata = {
        "slug": SLUG,
        "displayName": DISPLAY_NAME,
        "frameRate": FPS,
        "frameCount": FRAME_COUNT,
        "frameWidth": FRAME_W,
        "frameHeight": FRAME_H,
        "sheetColumns": COLS,
        "sheetRows": ROWS,
        "anchor": {
            "mode": "fixed-cell",
            "x": FRAME_W // 2,
            "y": 202,
            "note": "The base gift box keeps a fixed cell canvas and fixed bottom-center anchor to avoid jitter.",
        },
        "sheet": f"{SLUG}-sheet.png",
        "preview": f"{SLUG}-preview.gif",
        "frames": [f"frames/{SLUG}-{i + 1:02d}.png" for i in range(FRAME_COUNT)],
        "style": "flat business casino, black and gold palette, poker suit pattern, golden light reveal",
        "note": "Generated as a standalone holiday gift-box animation asset, separate from in-game gift assets.",
    }
    (OUT_DIR / "metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)

    frames = [frame(i) for i in range(FRAME_COUNT)]
    for index, item in enumerate(frames):
        item.save(FRAMES_DIR / f"{SLUG}-{index + 1:02d}.png")

    sheet = Image.new("RGBA", (FRAME_W * COLS, FRAME_H * ROWS), (0, 0, 0, 0))
    for index, item in enumerate(frames):
        sheet.alpha_composite(item, ((index % COLS) * FRAME_W, (index // COLS) * FRAME_H))
    sheet.save(OUT_DIR / f"{SLUG}-sheet.png")
    save_transparent_gif(frames, OUT_DIR / f"{SLUG}-preview.gif")
    write_metadata()


if __name__ == "__main__":
    main()
