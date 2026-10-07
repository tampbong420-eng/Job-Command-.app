#!/usr/bin/env python3
"""
Build the iPhone app icon + splash from Eric's original logo (public/job-command-logo.jpg).
Exact logo pixels only: crop + resize + a soft fade at the splash edges. Nothing is redrawn.

  python3 native/ios/make-assets.py

Writes native/ios/assets/{icon-only.png, splash.png, splash-dark.png} — the file names
`npx @capacitor/assets generate --ios --assetPath native/ios/assets` expects.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "public" / "job-command-logo.jpg"
OUT = ROOT / "native" / "ios" / "assets"

# Shield-only square from the 1024x558 original (stops above the JOB COMMAND wordmark).
ICON_BOX = (296, 4, 728, 436)
# Whole lockup for the splash, trimmed left/right so the small sparkle mark at the bottom right is left out.
SPLASH_BOX = (150, 0, 874, 558)
BG = (14, 17, 21)  # the logo's own darkest corner color


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    logo = Image.open(SRC).convert("RGB")

    # App Store icon: 1024x1024, opaque, no rounded corners (iOS masks it).
    icon = logo.crop(ICON_BOX).resize((1024, 1024), Image.LANCZOS)
    icon.save(OUT / "icon-only.png", optimize=True)

    # Splash: 2732x2732. iPhones show the middle ~1260px (aspect fill), so the lockup is 1100px wide,
    # shown as-is as a rounded card on the logo's own darkest color. The logo pixels are untouched.
    lockup = logo.crop(SPLASH_BOX)
    width = 1100
    height = round(lockup.height * width / lockup.width)
    lockup = lockup.resize((width, height), Image.LANCZOS)
    mask = Image.new("L", lockup.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius=56, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.5))
    canvas = Image.new("RGB", (2732, 2732), BG)
    canvas.paste(lockup, ((2732 - width) // 2, (2732 - height) // 2), mask)
    canvas.save(OUT / "splash.png", optimize=True)
    canvas.save(OUT / "splash-dark.png", optimize=True)
    print("wrote", sorted(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main()
