from PIL import Image, ImageDraw

PINE = (46, 107, 79, 255)      # #2e6b4f — matches --primary / theme-color
CREAM = (246, 243, 234, 255)   # #f6f3ea — matches --bg / manifest background_color

# Same geometry as the in-app logoSVG (viewBox 0 0 40 40), just recolored:
#   background squircle: rect 40x40 rx=11
#   glyph: a vertical bar + two stacked lobes (the app's "b" mark)
BG_RX_RATIO = 11 / 40
BAR = (10, 9, 4.4, 22, 2.2)          # x, y, w, h, corner-radius
LOBE_TOP = (12.3, 9, 12.4, 9.8, 4.9)
LOBE_BOTTOM = (12.3, 21.2, 14, 9.8, 4.9)
GLYPH_SHAPES = [BAR, LOBE_TOP, LOBE_BOTTOM]
VIEWBOX = 40


def _rounded_rect(draw, x, y, w, h, r, fill):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=r, fill=fill)


def make_icon(size, out_path, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    scale = size / VIEWBOX

    if maskable:
        # Maskable: full-bleed flat fill (no baked corner rounding — the OS
        # applies its own circle/squircle mask on top), glyph shrunk and
        # centered so it survives inside the ~80%-diameter safe zone.
        draw.rectangle([0, 0, size, size], fill=PINE)

        xs = [s[0] for s in GLYPH_SHAPES] + [s[0] + s[2] for s in GLYPH_SHAPES]
        ys = [s[1] for s in GLYPH_SHAPES] + [s[1] + s[3] for s in GLYPH_SHAPES]
        bbox_cx, bbox_cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2

        safe_radius = 0.40 * size
        glyph_scale = scale
        for _ in range(200):
            ok = True
            for (x, y, w, h, r) in GLYPH_SHAPES:
                for cx_pt, cy_pt in [(x, y), (x + w, y), (x, y + h), (x + w, y + h)]:
                    dx = (cx_pt - bbox_cx) * glyph_scale
                    dy = (cy_pt - bbox_cy) * glyph_scale
                    if (dx ** 2 + dy ** 2) ** 0.5 > safe_radius:
                        ok = False
            if ok:
                break
            glyph_scale *= 0.97

        cx_canvas, cy_canvas = size / 2, size / 2
        for (x, y, w, h, r) in GLYPH_SHAPES:
            gx = cx_canvas + (x - bbox_cx) * glyph_scale
            gy = cy_canvas + (y - bbox_cy) * glyph_scale
            gw, gh, gr = w * glyph_scale, h * glyph_scale, r * glyph_scale
            _rounded_rect(draw, gx, gy, gw, gh, gr, CREAM)
    else:
        r_bg = BG_RX_RATIO * size
        _rounded_rect(draw, 0, 0, size, size, r_bg, PINE)
        for (x, y, w, h, r) in GLYPH_SHAPES:
            _rounded_rect(draw, x * scale, y * scale, w * scale, h * scale, r * scale, CREAM)

    img.save(out_path, "PNG")
    print(f"wrote {out_path} ({size}x{size}, maskable={maskable})")


make_icon(192, "icons/icon-192.png")
make_icon(512, "icons/icon-512.png")
make_icon(512, "icons/icon-512-maskable.png", maskable=True)
make_icon(180, "icons/apple-touch-icon.png")
