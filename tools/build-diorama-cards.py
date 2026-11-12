#!/usr/bin/env python3
"""Bake the NES dioramas into square 'glass case' cards for the Achievements tab.

The source art (rool-drive/Dioramas) is isometric pixel work generated on a dark
grey/navy checkerboard (or, for a few, a painted backdrop). The checker is baked
into the pixels, not an alpha channel, so this script:

  1. reads the board's two tones off the border,
  2. flood-fills from the edge through anything within tolerance of either tone
     (8-connected, with a few nibble passes for the noisy blocks),
  3. composites what is left over a dark card with a soft centre glow,
  4. fades the outer edge of the card back to its own colour, so any leftover
     checker or a hard rectangle edge disappears instead of framing the art.

Output: img/dioramas/<slug>-420.webp (rail) and -900.webp (stage).
Re-runnable. Sources are never modified.
"""
from PIL import Image, ImageFilter, ImageDraw
import numpy as np, os
from collections import deque

SRC = "/rool-drive/Dioramas"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "img", "dioramas")
BG = (11, 14, 23)

MAP = {
    "Contra": "Contra Diorama.png",
    "Super Mario Bros. 3": "SMB3 Diorama.png",
    "Mega Man 2": "Mega Man 2 Diorama.png",
    "Ninja Gaiden": "Ninja Gaiden Diorama.png",
    "Castlevania III": "Castlevania III Diorama.png",
    "Double Dragon II": "Double Dragon II Diorama.png",
    "Bionic Commando": "Bionic Commando Diorama.png",
    "Duck Tales": "DuckTales Diorama.png",
    "Blaster Master": "Blaster Master Diorama.png",
    "River City Ransom": "River City Ransom Diorama.png",
    "Life Force": "Life Force Diorama.png",
    "Gradius": "Gradius Diorama.png",
    "Jackal": "Jackal Diorama.png",
    "Skate or Die!": "Skate or Die! Diorama.png",
    "Punch-Out!!": "Punch-Out!! Diorama.png",
    "Bubble Bobble": "Bubble Bobble Diorama.png",
    "Rygar": "Rygar Diorama.png",
    "Ikari Warriors": "Ikari Warriors Diorama.png",
    "Strider": "Strider Diorama.png",
    "Section Z": "Section Z Diorama.png",
}


def slug(title):
    s = title.lower().replace("!!", "").replace("!", "").replace(".", "")
    out = []
    for ch in s:
        if ch.isalnum():
            out.append(ch)
        elif out and out[-1] != "-":
            out.append("-")
    return "".join(out).strip("-")


def key_out(path, tol=32):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    h, w, _ = a.shape
    border = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3),
                             a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    cols, counts = np.unique(border, axis=0, return_counts=True)
    tones = []
    for i in np.argsort(-counts):
        c = cols[i]
        if all(np.linalg.norm(c - t) > 18 for t in tones):
            tones.append(c)
        if len(tones) == 2:
            break
    dist = np.minimum.reduce([np.linalg.norm(a - t, axis=2) for t in tones])
    bg = dist < tol

    seen = np.zeros((h, w), bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bg[y, x] and not seen[y, x]:
                seen[y, x] = True; dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if bg[y, x] and not seen[y, x]:
                seen[y, x] = True; dq.append((y, x))
    nbrs = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))
    while dq:
        y, x = dq.popleft()
        for dy, dx in nbrs:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and bg[ny, nx]:
                seen[ny, nx] = True; dq.append((ny, nx))
    for _ in range(4):                      # the checker is noisy: nibble the crumbs
        grow = seen.copy()
        grow[1:, :] |= seen[:-1, :]; grow[:-1, :] |= seen[1:, :]
        grow[:, 1:] |= seen[:, :-1]; grow[:, :-1] |= seen[:, 1:]
        add = (~seen) & grow & bg
        if not add.any():
            break
        seen |= add

    frac = float(seen.mean())
    if frac < 0.02:                         # painted background, nothing to cut
        return im
    alpha = np.where(seen, 0, 255).astype(np.uint8)
    img = Image.fromarray(np.dstack([np.asarray(im), alpha]), "RGBA")
    img.putalpha(img.getchannel("A").filter(ImageFilter.GaussianBlur(0.8)))
    bb = img.getchannel("A").getbbox()
    return img.crop(bb) if bb else img


def card(art, size, inset=0.045):
    bg = Image.new("RGB", (size, size), BG)
    glowmask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(glowmask).ellipse((-size * .25, size * .18, size * 1.25, size * 1.15), fill=255)
    glowmask = glowmask.filter(ImageFilter.GaussianBlur(size * .12))
    bg = Image.composite(Image.new("RGB", (size, size), (24, 30, 52)), bg, glowmask)

    box = int(size * (1 - 2 * inset))
    fit = art.copy()
    fit.thumbnail((box, box), Image.LANCZOS)
    bg.paste(fit, ((size - fit.width) // 2, (size - fit.height) // 2),
             fit if fit.mode == "RGBA" else None)

    # fade the outer edge back to plain card colour: hides leftover checker and
    # stops a painted rectangle reading as a hard frame.
    edge = Image.new("L", (size, size), 0)
    m = int(size * .085)
    ImageDraw.Draw(edge).rounded_rectangle((m, m, size - m, size - m), radius=int(size * .04), fill=255)
    edge = edge.filter(ImageFilter.GaussianBlur(size * .045))
    return Image.composite(bg, Image.new("RGB", (size, size), BG), edge)


def main():
    os.makedirs(OUT, exist_ok=True)
    for title, fn in MAP.items():
        art = key_out(os.path.join(SRC, fn))
        s = slug(title)
        for px, q in ((420, 80), (900, 84)):
            card(art, px).save(os.path.join(OUT, f"{s}-{px}.webp"), "WEBP", quality=q, method=6)
        print(f"{s:22s} {art.size}")


if __name__ == "__main__":
    main()
