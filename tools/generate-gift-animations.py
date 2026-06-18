from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "assets" / "gifts"
FRAME_SIZE = 256
FRAMES = 16
FPS = 16


GIF_PALETTE = Image.new("P", (1, 1))
palette = []
for i in range(256):
    palette.extend((i, i, i))
GIF_PALETTE.putpalette(palette)


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


def transparent() -> Image.Image:
    return Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))


def draw_soft_ellipse(
    base: Image.Image,
    box: tuple[float, float, float, float],
    color: tuple[int, int, int, int],
    blur: float = 5,
) -> None:
    layer = transparent()
    draw = ImageDraw.Draw(layer)
    draw.ellipse(tuple(round(v) for v in box), fill=color)
    if blur:
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(layer)


def draw_polygon(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[float, float]],
    fill: tuple[int, int, int, int],
    outline: tuple[int, int, int, int] | None = None,
    width: int = 1,
) -> None:
    rounded = [(round(x), round(y)) for x, y in points]
    draw.polygon(rounded, fill=fill)
    if outline:
        draw.line(rounded + [rounded[0]], fill=outline, width=width, joint="curve")


def draw_arc_stroke(
    base: Image.Image,
    box: tuple[float, float, float, float],
    start: float,
    end: float,
    color: tuple[int, int, int, int],
    width: int,
    blur: float = 0,
) -> None:
    layer = transparent()
    draw = ImageDraw.Draw(layer)
    draw.arc(tuple(round(v) for v in box), start=start, end=end, fill=color, width=width)
    if blur:
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(layer)


def draw_cup(base: Image.Image, x: float, y: float, scale: float, tilt: float, alpha: int) -> None:
    cup = Image.new("RGBA", (140, 120), (0, 0, 0, 0))
    d = ImageDraw.Draw(cup)
    a = alpha
    d.ellipse((28, 30, 100, 54), fill=(245, 250, 255, a), outline=(104, 128, 151, a), width=4)
    d.rounded_rectangle((28, 40, 100, 96), radius=18, fill=(236, 246, 255, a), outline=(104, 128, 151, a), width=4)
    d.ellipse((42, 39, 89, 50), fill=(90, 48, 26, a))
    d.arc((88, 48, 126, 84), start=-70, end=110, fill=(104, 128, 151, a), width=7)
    d.arc((94, 54, 116, 78), start=-70, end=110, fill=(236, 246, 255, a), width=6)
    d.rounded_rectangle((45, 94, 86, 102), radius=4, fill=(196, 213, 227, max(0, a - 20)))
    if abs(tilt) > 1:
        cup = cup.rotate(tilt, resample=Image.Resampling.BICUBIC, expand=True)
    size = (round(cup.width * scale), round(cup.height * scale))
    cup = cup.resize(size, Image.Resampling.LANCZOS)
    base.alpha_composite(cup, (round(x - cup.width / 2), round(y - cup.height / 2)))


def coffee_frame(i: int) -> Image.Image:
    frame = transparent()
    d = ImageDraw.Draw(frame)
    t = i / (FRAMES - 1)
    pour = ease_in_out_sine(clamp((t - 0.12) / 0.62, 0, 1))
    fade = 1 - ease_out_cubic(clamp((t - 0.78) / 0.22, 0, 1))
    alpha = round(255 * fade)
    draw_soft_ellipse(frame, (76, 200, 184, 222), (58, 30, 15, round(55 * fade)), 6)
    cup_x = 98 + 18 * math.sin(t * math.pi)
    cup_y = 86 + 6 * math.sin(t * math.pi * 2)
    tilt = -8 - 48 * pour
    draw_cup(frame, cup_x, cup_y, 0.92, tilt, alpha)

    if pour > 0.04 and fade > 0.05:
        stream_alpha = round(230 * fade * clamp(pour * 1.2, 0, 1))
        sx = 122 + 44 * pour
        sy = 112 + 18 * pour
        ex = 156 + 6 * math.sin(t * math.pi * 4)
        ey = 190
        width = round(5 + 10 * pour)
        d.line((sx, sy, ex, ey), fill=(88, 43, 20, stream_alpha), width=width)
        d.line((sx + 4, sy + 8, ex + 3, ey - 10), fill=(139, 76, 35, round(stream_alpha * 0.72)), width=max(3, width // 2))
        splash = max(0, math.sin(clamp((t - 0.28) / 0.48, 0, 1) * math.pi))
        for n in range(8):
            angle = (n / 8) * math.tau + t * 3
            radius = 12 + 18 * splash
            px = ex + math.cos(angle) * radius
            py = ey + math.sin(angle) * radius * 0.42
            r = 2.5 + 2.5 * (1 - n / 8) * splash
            d.ellipse((px - r, py - r, px + r, py + r), fill=(110, 58, 28, round(170 * fade * splash)))
        d.ellipse((114, 184, 198, 213), fill=(91, 47, 22, round(155 * fade * pour)))
        d.ellipse((128, 187, 184, 205), fill=(130, 78, 40, round(165 * fade * pour)))

    for n in range(3):
        phase = clamp((t - 0.1 - n * 0.1) / 0.65, 0, 1)
        if phase > 0 and fade > 0:
            sx = 122 + n * 18
            sy = 76 - phase * 38
            draw_arc_stroke(
                frame,
                (sx - 16, sy - 28, sx + 16, sy + 30),
                265,
                85,
                (255, 255, 255, round(74 * (1 - phase) * fade)),
                3,
                1.2,
            )
    return frame


def draw_rose(base: Image.Image, x: float, y: float, scale: float, angle: float, bloom: float, alpha: int) -> None:
    rose = Image.new("RGBA", (132, 162), (0, 0, 0, 0))
    d = ImageDraw.Draw(rose)
    a = alpha
    d.line((62, 56, 43, 132), fill=(34, 128, 74, a), width=7)
    d.line((68, 58, 49, 135), fill=(81, 184, 111, max(0, a - 45)), width=3)
    draw_polygon(d, [(49, 92), (18, 78), (42, 112)], rgba("#38a763", a), rgba("#1d7044", a), 2)
    draw_polygon(d, [(52, 106), (86, 94), (66, 125)], rgba("#4cbc77", a), rgba("#1d7044", a), 2)

    cx, cy = 70, 44
    petal_alpha = a
    petal_count = 8
    for n in range(petal_count):
        ang = (n / petal_count) * math.tau + 0.25
        spread = 13 + 14 * bloom
        px = cx + math.cos(ang) * spread * 0.58
        py = cy + math.sin(ang) * spread * 0.48
        w = 20 + 12 * bloom
        h = 16 + 9 * bloom
        color = rgba("#e72e63", petal_alpha) if n % 2 else rgba("#ff5a7e", petal_alpha)
        d.ellipse((px - w / 2, py - h / 2, px + w / 2, py + h / 2), fill=color, outline=rgba("#a81742", a), width=2)
    d.ellipse((52, 27, 88, 62), fill=rgba("#c71847", a), outline=rgba("#941036", a), width=2)
    d.arc((56, 31, 85, 59), start=190, end=500, fill=rgba("#ffb0c4", round(160 * alpha / 255)), width=3)
    d.ellipse((64, 36, 78, 50), fill=rgba("#ff7b99", a))

    rose = rose.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    rose = rose.resize((round(rose.width * scale), round(rose.height * scale)), Image.Resampling.LANCZOS)
    base.alpha_composite(rose, (round(x - rose.width / 2), round(y - rose.height / 2)))


def rose_frame(i: int) -> Image.Image:
    frame = transparent()
    d = ImageDraw.Draw(frame)
    t = i / (FRAMES - 1)
    enter = ease_out_cubic(clamp(t / 0.34, 0, 1))
    bloom = ease_out_cubic(clamp((t - 0.22) / 0.38, 0, 1))
    fade = 1 - ease_out_cubic(clamp((t - 0.82) / 0.18, 0, 1))
    scale = 0.74 + 0.26 * enter + 0.08 * math.sin(t * math.pi) * fade
    x = 58 + 92 * enter
    y = 188 - 58 * math.sin(enter * math.pi / 2) + 9 * math.sin(t * math.pi * 4)
    angle = -36 + 34 * enter + 6 * math.sin(t * math.pi * 2)
    alpha = round(255 * fade)

    for n in range(11):
        p = clamp((t - n * 0.028) / 0.82, 0, 1)
        if p > 0:
            hx = 150 + math.cos(n * 2.22) * (18 + 38 * p)
            hy = 93 + math.sin(n * 1.72) * (16 + 28 * p) - 12 * p
            size = 5 + 4 * (1 - p)
            a = round(130 * (1 - p) * fade)
            draw_polygon(
                d,
                [(hx, hy - size), (hx + size, hy), (hx, hy + size), (hx - size, hy)],
                rgba("#ff6d92", a),
            )

    draw_rose(frame, x, y, scale, angle, bloom, alpha)
    return frame


def laughing_face_frame(i: int) -> Image.Image:
    frame = transparent()
    d = ImageDraw.Draw(frame)
    t = i / (FRAMES - 1)
    pop = ease_out_cubic(clamp(t / 0.22, 0, 1))
    fade = 1 - ease_out_cubic(clamp((t - 0.86) / 0.14, 0, 1))
    wobble = math.sin(t * math.tau * 2.2)
    scale = 0.75 + 0.25 * pop + 0.05 * wobble * fade
    cx = 128 + 3 * math.sin(t * math.tau * 3)
    cy = 124 + 5 * math.sin(t * math.tau * 2 + 0.8)
    r = 58 * scale
    a = round(255 * fade)

    draw_soft_ellipse(frame, (cx - r * 0.85, cy + r * 0.72, cx + r * 0.85, cy + r * 1.02), (148, 99, 12, round(54 * fade)), 8)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 207, 45, a), outline=(199, 124, 18, a), width=max(2, round(5 * scale)))
    d.ellipse((cx - r * 0.68, cy - r * 0.55, cx - r * 0.19, cy - r * 0.17), fill=(68, 45, 31, a))
    d.ellipse((cx + r * 0.19, cy - r * 0.55, cx + r * 0.68, cy - r * 0.17), fill=(68, 45, 31, a))
    d.arc((cx - r * 0.62, cy - r * 0.58, cx - r * 0.19, cy - r * 0.05), start=198, end=338, fill=(255, 238, 92, a), width=round(6 * scale))
    d.arc((cx + r * 0.19, cy - r * 0.58, cx + r * 0.62, cy - r * 0.05), start=202, end=342, fill=(255, 238, 92, a), width=round(6 * scale))
    d.pieslice((cx - r * 0.45, cy - r * 0.08, cx + r * 0.45, cy + r * 0.65), start=0, end=180, fill=(104, 50, 39, a))
    d.arc((cx - r * 0.45, cy - r * 0.08, cx + r * 0.45, cy + r * 0.65), start=0, end=180, fill=(69, 36, 30, a), width=round(4 * scale))
    d.pieslice((cx - r * 0.24, cy + r * 0.22, cx + r * 0.24, cy + r * 0.75), start=180, end=360, fill=(235, 84, 88, a))

    tear_swing = math.sin(t * math.tau * 2)
    for side in (-1, 1):
        tx = cx + side * r * 0.72
        ty = cy - r * 0.02 + abs(tear_swing) * 4
        drop = 18 + 16 * clamp(math.sin(t * math.tau * 1.25 + (side + 1) * 0.5), 0, 1)
        d.ellipse((tx - 12 * scale, ty - 3 * scale, tx + 12 * scale, ty + drop), fill=(91, 207, 255, round(220 * fade)))
        d.ellipse((tx - 5 * scale, ty + 2 * scale, tx + 5 * scale, ty + 14 * scale), fill=(214, 247, 255, round(170 * fade)))

    for n in range(7):
        p = clamp((t - n * 0.035) / 0.62, 0, 1)
        if p > 0:
            side = -1 if n % 2 else 1
            sx = cx + side * (r * 0.75 + 14 + p * 28)
            sy = cy + 14 + math.sin(p * math.pi) * 15 + n * 2
            rr = 3 + 4 * (1 - p)
            d.ellipse((sx - rr, sy - rr, sx + rr, sy + rr), fill=(91, 207, 255, round(135 * (1 - p) * fade)))
    return frame


def draw_egg(base: Image.Image, x: float, y: float, scale: float, angle: float, crack: float, alpha: int) -> None:
    egg = Image.new("RGBA", (108, 128), (0, 0, 0, 0))
    d = ImageDraw.Draw(egg)
    a = alpha
    d.ellipse((25, 9, 86, 105), fill=(250, 246, 219, a), outline=(190, 175, 132, a), width=4)
    d.ellipse((40, 19, 65, 51), fill=(255, 255, 241, round(150 * a / 255)))
    if crack > 0.1:
        pts = [(55, 18), (49, 35), (61, 49), (51, 66), (60, 82)]
        d.line(pts, fill=(125, 100, 72, round(220 * a / 255 * crack)), width=3)
    egg = egg.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    egg = egg.resize((round(egg.width * scale), round(egg.height * scale)), Image.Resampling.LANCZOS)
    base.alpha_composite(egg, (round(x - egg.width / 2), round(y - egg.height / 2)))


def egg_frame(i: int) -> Image.Image:
    frame = transparent()
    d = ImageDraw.Draw(frame)
    t = i / (FRAMES - 1)
    travel = ease_in_out_sine(clamp(t / 0.52, 0, 1))
    impact = clamp((t - 0.48) / 0.18, 0, 1)
    fade = 1 - ease_out_cubic(clamp((t - 0.84) / 0.16, 0, 1))
    x = 54 + 100 * travel
    y = 70 + 98 * travel - 45 * math.sin(travel * math.pi)
    angle = -42 + 225 * travel
    if impact < 1:
        draw_egg(frame, x, y, 0.92 - 0.18 * impact, angle, impact, round(255 * fade))

    if impact > 0:
        burst = ease_out_cubic(impact)
        center_x, center_y = 153, 164
        d.ellipse((center_x - 38 * burst, center_y - 10, center_x + 46 * burst, center_y + 24), fill=(252, 246, 214, round(180 * fade)))
        d.ellipse((center_x - 20 * burst, center_y - 4, center_x + 27 * burst, center_y + 18), fill=(255, 188, 45, round(230 * fade)))
        for n in range(10):
            ang = n / 10 * math.tau
            dist = 18 + 46 * burst
            sx = center_x + math.cos(ang) * dist
            sy = center_y + math.sin(ang) * dist * 0.62
            shard = 8 * (1 - impact * 0.35)
            color = rgba("#fff3c7", round(210 * (1 - impact * 0.45) * fade))
            draw_polygon(
                d,
                [(sx, sy - shard), (sx + shard * 0.8, sy + shard * 0.2), (sx - shard * 0.6, sy + shard * 0.7)],
                color,
                rgba("#b9a269", round(170 * fade)),
            )
        for n in range(9):
            ang = n / 9 * math.tau + 0.3
            dist = 12 + 35 * burst
            px = center_x + math.cos(ang) * dist
            py = center_y + math.sin(ang) * dist * 0.5
            rr = 2.5 + 3.5 * (1 - impact)
            d.ellipse((px - rr, py - rr, px + rr, py + rr), fill=(255, 201, 62, round(190 * (1 - impact * 0.4) * fade)))
    else:
        draw_arc_stroke(frame, (42, 67, 136, 163), 205, 345, (255, 255, 255, 90), 4, 1)
    return frame


def draw_slipper(base: Image.Image, x: float, y: float, scale: float, angle: float, alpha: int) -> None:
    slipper = Image.new("RGBA", (152, 94), (0, 0, 0, 0))
    d = ImageDraw.Draw(slipper)
    a = alpha
    d.rounded_rectangle((22, 30, 130, 70), radius=22, fill=(80, 164, 205, a), outline=(37, 89, 124, a), width=5)
    d.ellipse((96, 31, 134, 69), fill=(101, 190, 225, a))
    d.arc((48, 28, 102, 80), start=195, end=345, fill=(255, 233, 126, a), width=11)
    d.arc((50, 34, 100, 75), start=200, end=340, fill=(196, 132, 45, round(170 * a / 255)), width=3)
    d.ellipse((32, 40, 56, 61), fill=(111, 207, 237, round(135 * a / 255)))
    slipper = slipper.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    slipper = slipper.resize((round(slipper.width * scale), round(slipper.height * scale)), Image.Resampling.LANCZOS)
    base.alpha_composite(slipper, (round(x - slipper.width / 2), round(y - slipper.height / 2)))


def slipper_frame(i: int) -> Image.Image:
    frame = transparent()
    d = ImageDraw.Draw(frame)
    t = i / (FRAMES - 1)
    travel = ease_in_out_sine(clamp(t / 0.66, 0, 1))
    recoil = clamp((t - 0.62) / 0.18, 0, 1)
    fade = 1 - ease_out_cubic(clamp((t - 0.86) / 0.14, 0, 1))
    x = 45 + 150 * travel - 20 * recoil
    y = 178 - 84 * math.sin(travel * math.pi) - 5 * recoil
    scale = 0.86 + 0.12 * math.sin(travel * math.pi)
    angle = -28 + 650 * travel
    draw_slipper(frame, x, y, scale, angle, round(255 * fade))

    for n in range(4):
        p = clamp((t - n * 0.035) / 0.45, 0, 1)
        if 0 < p < 1:
            sx = 49 + 90 * p - n * 2
            sy = 179 - 38 * math.sin(p * math.pi) + n * 8
            draw_arc_stroke(frame, (sx - 20, sy - 12, sx + 24, sy + 20), 195, 338, (255, 255, 255, round(80 * (1 - p))), 3, 0.8)

    if recoil > 0:
        cx, cy = 187, 143
        pulse = ease_out_cubic(recoil)
        for n in range(8):
            ang = n / 8 * math.tau
            inner = 14 + 6 * pulse
            outer = 28 + 28 * pulse
            p1 = (cx + math.cos(ang) * inner, cy + math.sin(ang) * inner)
            p2 = (cx + math.cos(ang) * outer, cy + math.sin(ang) * outer)
            d.line((p1[0], p1[1], p2[0], p2[1]), fill=(255, 222, 83, round(170 * (1 - recoil) * fade)), width=4)
        d.ellipse((cx - 11, cy - 11, cx + 11, cy + 11), fill=(255, 247, 146, round(180 * (1 - recoil) * fade)))
    return frame


ASSETS = {
    "coffee": {
        "displayName": "倒咖啡",
        "frames": coffee_frame,
        "prompt": (
            "Clean HD 2D casual game gift animation, 4x4 sequence: a white coffee cup tilts, "
            "pours brown coffee into a splash, then fades. Transparent final output, centered, no text."
        ),
    },
    "rose": {
        "displayName": "送玫瑰花",
        "frames": rose_frame,
        "prompt": (
            "Clean HD 2D casual game gift animation, 4x4 sequence: a red rose flies in, blooms, "
            "heart-like petals sparkle, then settles and fades. Transparent final output, centered, no text."
        ),
    },
    "laugh-cry": {
        "displayName": "笑哭",
        "frames": laughing_face_frame,
        "prompt": (
            "Clean HD 2D casual game gift animation, 4x4 sequence: a laughing yellow emoji pops, "
            "wobbles with tears flying, then fades. Transparent final output, centered, no text."
        ),
    },
    "egg": {
        "displayName": "砸鸡蛋",
        "frames": egg_frame,
        "prompt": (
            "Clean HD 2D casual game gift animation, 4x4 sequence: an egg arcs across the frame, "
            "cracks on impact, yolk splashes and shell shards scatter, then fades. Transparent final output, centered, no text."
        ),
    },
    "slipper": {
        "displayName": "丢拖鞋",
        "frames": slipper_frame,
        "prompt": (
            "Clean HD 2D casual game gift animation, 4x4 sequence: a blue slipper spins through the air, "
            "hits with a comic impact flash, then fades. Transparent final output, centered, no text."
        ),
    },
}


def quantize_for_gif(frame: Image.Image) -> Image.Image:
    bg = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    bg.alpha_composite(frame)
    return bg.convert("RGB").quantize(palette=GIF_PALETTE, dither=Image.Dither.FLOYDSTEINBERG)


def save_asset(slug: str, spec: dict[str, object]) -> dict[str, object]:
    asset_dir = OUT_DIR / slug
    frames_dir = asset_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    frames = [spec["frames"](i) for i in range(FRAMES)]
    for i, frame in enumerate(frames):
        frame.save(frames_dir / f"{slug}-{i + 1:02d}.png")

    sheet = Image.new("RGBA", (FRAME_SIZE * 4, FRAME_SIZE * 4), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        col = index % 4
        row = index // 4
        sheet.alpha_composite(frame, (col * FRAME_SIZE, row * FRAME_SIZE))
    sheet_path = asset_dir / f"{slug}-sheet.png"
    sheet.save(sheet_path)

    gif_path = asset_dir / f"{slug}-preview.gif"
    gif_frames = [quantize_for_gif(frame) for frame in frames]
    gif_frames[0].save(
        gif_path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=round(1000 / FPS),
        loop=0,
        transparency=0,
        disposal=2,
    )

    metadata = {
        "slug": slug,
        "displayName": spec["displayName"],
        "frameRate": FPS,
        "frameCount": FRAMES,
        "frameWidth": FRAME_SIZE,
        "frameHeight": FRAME_SIZE,
        "sheetColumns": 4,
        "sheetRows": 4,
        "sheet": f"{slug}-sheet.png",
        "preview": f"{slug}-preview.gif",
        "frames": [f"frames/{slug}-{i + 1:02d}.png" for i in range(FRAMES)],
        "prompt": spec["prompt"],
        "note": "Generated as transparent PNG frame animation assets for the poker gift UI.",
    }
    (asset_dir / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    return metadata


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        "frameRate": FPS,
        "frameCount": FRAMES,
        "frameWidth": FRAME_SIZE,
        "frameHeight": FRAME_SIZE,
        "sheetColumns": 4,
        "sheetRows": 4,
        "assets": [],
    }
    for slug, spec in ASSETS.items():
        manifest["assets"].append(save_asset(slug, spec))
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
