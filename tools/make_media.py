"""
Regenerate the OG image and the README screenshots from the running production previews.

    npm run build && npx vite preview --port 4173          (root)
    cd public-app && npm run build && npx vite preview --port 4175
    python tools/make_media.py

Writes public/og.png and public-app/public/og.png (1200x630) and assets/readme/*.png.
"""

import json
import sys
import tempfile
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "node_modules"
CARD = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Barlow;src:url("%(barlow)s") format("woff2");font-weight:800}
@font-face{font-family:Inst;src:url("%(inst)s") format("woff2");font-weight:100 900}
@font-face{font-family:Mono;src:url("%(mono)s") format("woff2");font-weight:100 900}
:root{--paper:oklch(0.962 0.004 250);--ink:oklch(0.215 0.012 262);--ink2:oklch(0.385 0.012 262);--ink3:oklch(0.505 0.010 262);
--paint:oklch(0.865 0.165 92);--asphalt:oklch(0.228 0.010 262)}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:var(--paper);color:var(--ink);font-family:Inst,sans-serif;position:relative;overflow:hidden}
.kerb{position:absolute;inset:0 0 auto 0;height:10px;background:repeating-linear-gradient(90deg,var(--ink) 0 36px,var(--paint) 36px 72px)}
.text{position:absolute;left:64px;top:70px;width:%(width)spx}
.wordmark{height:40px}
h1{margin-top:44px;font-family:Barlow;font-weight:800;font-size:86px;line-height:.9;letter-spacing:-.01em}
h1 span{box-shadow:inset 0 -13px 0 var(--paint)}
p{margin-top:26px;font-size:23px;line-height:1.4;color:var(--ink2)}
.meta{position:absolute;left:64px;bottom:44px;font-family:Mono;font-size:15px;color:var(--ink3)}
.art{position:absolute;right:56px;top:66px;height:500px;display:flex;align-items:center;justify-content:center}
.photo{width:500px;height:500px;border-radius:10px;overflow:hidden;background:var(--asphalt)}
.phone{height:500px;padding:10px;border-radius:30px;background:var(--asphalt)}
.art img{display:block;width:100%%;height:100%%;object-fit:cover}
.phone img{width:auto;border-radius:22px}
</style></head><body><div class="kerb"></div>
<div class="text"><img class="wordmark" src="%(wordmark)s" alt=""><h1>%(headline)s</h1><p>%(lede)s</p></div>
<div class="meta">%(meta)s</div>
<div class="art"><div class="%(frame)s"><img src="%(art)s" alt=""></div></div>
</body></html>"""


def og_cards(browser, tmp: Path) -> None:
    """Designed 1200x630 share cards for both apps, from the real fonts, tokens, wordmark and marked photo."""
    fonts = {
        "barlow": (FONTS / "@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2").as_uri(),
        "inst": (FONTS / "@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2").as_uri(),
        "mono": (FONTS / "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2").as_uri(),
    }
    page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    page.goto(CONSOLE + "/", wait_until="networkidle")
    page.wait_for_timeout(1800)
    page.locator("header a[href='/']").first.screenshot(path=str(tmp / "wordmark.png"), omit_background=True)
    handle = page.get_by_role("slider").first
    handle.focus()
    handle.press("Home")  # survey the whole frame
    page.wait_for_timeout(900)
    plate = page.locator("section[aria-labelledby='hero-title'] figure > div").first
    # The card shows the surveyed photo alone: hide the compare handle, its line and the two corner labels.
    plate.evaluate("""el => el.querySelectorAll(':scope > [role=slider], :scope > span, :scope > div.pointer-events-none')
                         .forEach((n) => { n.style.display = 'none'; })""")
    plate.screenshot(path=str(tmp / "hero.png"))
    phone = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    phone.goto(CITIZEN + "/", wait_until="networkidle")
    phone.wait_for_timeout(1500)
    phone.screenshot(path=str(tmp / "phone.png"))

    cards = [
        (ROOT / "public" / "og.png", "photo", tmp / "hero.png", "Every pothole,<br>on the <span>record.</span>",
         "Photograph a damaged road. Every pothole and crack is marked, scored, costed and sent to the ward office, "
         "and stays on a public ledger until it is fixed.",
         "YOLO26s fine-tuned on RDD2022 · Mumbai &amp; Navi Mumbai"),
        (ROOT / "public-app" / "public" / "og.png", "phone", tmp / "phone.png", "See a pothole?<br>Put it on the <span>record.</span>",
         "Photograph it, confirm where it is, send. See what was found before you leave the spot, then follow the repair.",
         "RoadGuard citizen app · any phone browser"),
    ]
    card = browser.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
    for out, frame, art, headline, lede, meta in cards:
        html = tmp / f"card-{frame}.html"
        width = 540 if frame == "photo" else 760  # the phone frame is narrow, so its card gets a wider text column
        html.write_text(CARD % {**fonts, "wordmark": (tmp / "wordmark.png").as_uri(), "art": art.as_uri(), "frame": frame, "width": width,
                                "headline": headline, "lede": lede, "meta": meta}, encoding="utf-8")
        card.goto(html.as_uri(), wait_until="load")
        card.evaluate("document.fonts.ready")
        card.wait_for_timeout(300)
        card.screenshot(path=str(out))
    page.close()
    phone.close()
    card.close()
CONSOLE = "http://localhost:4173"
CITIZEN = "http://localhost:4175"
OUT = ROOT / "assets" / "readme"
PHOTO = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "backend" / "seed" / "images")
GOV = {"token": "media", "role": "government", "name": "Inspector Kumar", "department": "PWD Mumbai", "username": "admin"}
CIT = {"token": "media", "role": "citizen", "name": "Asha Kulkarni", "username": "citizen_media"}


def first_photo() -> str:
    p = Path(PHOTO)
    return str(sorted(p.glob("*.jpg"))[0]) if p.is_dir() else str(p)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        with tempfile.TemporaryDirectory() as tmp:
            og_cards(b, Path(tmp))

        page = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page.goto(CONSOLE + "/", wait_until="networkidle")
        page.wait_for_timeout(2200)
        page.screenshot(path=str(OUT / "landing.png"))

        page.evaluate(f"localStorage.setItem('roadguard_user', JSON.stringify({json.dumps(GOV)}))")
        page.goto(CONSOLE + "/console", wait_until="networkidle")
        page.wait_for_timeout(2500)
        page.screenshot(path=str(OUT / "console-today.png"))

        page.goto(CONSOLE + "/console/scan", wait_until="networkidle")
        page.locator('input[type="file"][accept="image/*"]').first.set_input_files(first_photo())
        page.get_by_text("Evidence sheet").wait_for(timeout=60000)
        page.wait_for_timeout(1500)
        page.screenshot(path=str(OUT / "console-scan.png"))

        shots = []
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1)
        cp = ctx.new_page()
        cp.goto(CITIZEN + "/", wait_until="networkidle")
        cp.wait_for_timeout(1200)
        shots.append(cp.screenshot())
        cp.evaluate(f"localStorage.setItem('roadguard_citizen', JSON.stringify({json.dumps(CIT)}))")
        for tab in ("map", "report", "ledger"):
            cp.goto(f"{CITIZEN}/?tab={tab}", wait_until="networkidle")
            cp.wait_for_timeout(2200)
            shots.append(cp.screenshot())
        b.close()

    import io
    tiles = [Image.open(io.BytesIO(s)) for s in shots]
    gap = 28
    sheet = Image.new("RGB", (len(tiles) * 390 + (len(tiles) + 1) * gap, 844 + 2 * gap), (42, 45, 52))
    for i, t in enumerate(tiles):
        sheet.paste(t, (gap + i * (390 + gap), gap))
    sheet.save(OUT / "citizen.png", optimize=True)
    for f in OUT.glob("*.png"):
        Image.open(f).save(f, optimize=True)
    print("media written:", ", ".join(sorted(x.name for x in OUT.glob("*.png"))), "+ public/og.png, public-app/public/og.png")


if __name__ == "__main__":
    main()
