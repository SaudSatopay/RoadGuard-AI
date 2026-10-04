"""
Regenerate the OG image and the README screenshots from the running production previews.

    npm run build && npx vite preview --port 4173          (root)
    cd public-app && npm run build && npx vite preview --port 4175
    python tools/make_media.py

Writes public/og.png (1200x630) and assets/readme/*.png.
"""

import json
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
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

        page = b.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
        page.goto(CONSOLE + "/", wait_until="networkidle")
        page.wait_for_timeout(2200)
        page.screenshot(path=str(ROOT / "public" / "og.png"))

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
    print("media written:", ", ".join(sorted(x.name for x in OUT.glob("*.png"))), "+ public/og.png")


if __name__ == "__main__":
    main()
