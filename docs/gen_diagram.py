"""Generate docs/boundary-{light,dark}.svg for the README.

The privacy-boundary round trip: redact -> AI sees only tokens -> reinstate.
Hand-tuned layout; run from the repo root after editing:
    python3 docs/gen_diagram.py
"""

import os

FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"
MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace"

THEMES = {
    "light": dict(
        text="#1f2328", muted="#59636e", border="#d0d7de", panel="#f6f8fa",
        node="#ffffff", accent="#8250df", accent_soft="#fbf0ff",
        red="#cf222e",
        green="#1a7f37", green_fill="#dafbe1", green_border="#aceebb",
        edge="#8c959f",
    ),
    "dark": dict(
        text="#e6edf3", muted="#9198a1", border="#3d444d", panel="#151b23",
        node="#212830", accent="#ab7df8", accent_soft="#2a2139",
        red="#f85149",
        green="#3fb950", green_fill="#122117", green_border="#2b5233",
        edge="#767d86",
    ),
}

W, H = 960, 520


def build(c: dict) -> str:
    s = []
    s.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
        f'font-family="{FONT}" role="img" '
        'aria-label="The Redacta privacy boundary: a clinical document is redacted '
        'inside your boundary — deterministic patterns plus reasoning plus a '
        'self-check — producing tokenised text and a token map; only the tokenised '
        'text crosses to the AI tool, the token map never leaves; the processed '
        'output comes back and reinstate restores the original identifiers locally. '
        'Raw identifiers never cross the boundary.">'
    )
    s.append(
        '<defs>'
        f'<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" '
        f'markerHeight="7" orient="auto-start-reverse">'
        f'<path d="M0,0 L10,5 L0,10 z" fill="{c["edge"]}"/></marker>'
        f'<marker id="arr-green" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" '
        f'markerHeight="7" orient="auto-start-reverse">'
        f'<path d="M0,0 L10,5 L0,10 z" fill="{c["green"]}"/></marker>'
        '</defs>'
    )

    def panel(x, y, w, h, title):
        s.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" '
            f'fill="{c["panel"]}" stroke="{c["border"]}"/>'
        )
        s.append(
            f'<text x="{x + 18}" y="{y + 26}" font-size="11" font-weight="600" '
            f'letter-spacing="1.5" fill="{c["muted"]}">{title}</text>'
        )

    def node(cx, y, w, h, title, sub=None, fill=None, stroke=None, tcol=None, mono=False):
        fill = fill or c["node"]
        stroke = stroke or c["border"]
        tcol = tcol or c["text"]
        x = cx - w / 2
        s.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" '
            f'fill="{fill}" stroke="{stroke}"/>'
        )
        if sub:
            s.append(
                f'<text x="{cx}" y="{y + 22}" font-size="13" font-weight="600" '
                f'text-anchor="middle" fill="{tcol}">{title}</text>'
            )
            fam = MONO if mono else FONT
            fs = 10.5 if mono else 11
            s.append(
                f'<text x="{cx}" y="{y + 40}" font-size="{fs}" font-family="{fam}" '
                f'text-anchor="middle" fill="{c["muted"]}">{sub}</text>'
            )
        else:
            s.append(
                f'<text x="{cx}" y="{y + h / 2 + 4.5}" font-size="13" font-weight="600" '
                f'text-anchor="middle" fill="{tcol}">{title}</text>'
            )

    def elbow(points, marker="arr", color=None):
        color = color or c["edge"]
        pts = " ".join(f"{x},{y}" for x, y in points)
        s.append(
            f'<polyline points="{pts}" fill="none" stroke="{color}" '
            f'stroke-width="1.5" marker-end="url(#{marker})"/>'
        )

    # ---------------- your boundary ----------------
    panel(16, 52, 600, 448, "YOUR BOUNDARY &#183; IDENTIFIERS STAY HERE")
    node(200, 92, 280, 48, "Clinical document",
         "names &#183; NHS numbers &#183; dates of birth")
    elbow([(200, 140), (200, 166)])
    node(200, 168, 300, 56, "Redacta engine",
         "deterministic patterns + reasoning + self-check",
         fill=c["accent_soft"], stroke=c["accent"], tcol=c["accent"])

    # split: token map stays, tokenised text goes out
    elbow([(150, 224), (150, 254)])
    node(130, 256, 200, 52, "Token map", "never leaves this boundary",
         fill=c["green_fill"], stroke=c["green_border"], tcol=c["green"])
    elbow([(250, 224), (250, 240), (430, 240), (430, 254)])
    node(430, 256, 260, 52, "Tokenised text",
         "[PATIENT_NAME_1] &#183; [NHS_NUMBER_1]", mono=True)

    # reinstate + restored
    node(430, 340, 260, 52, "Reinstate", "restore originals from the map")
    elbow([(430, 392), (430, 420)], marker="arr-green", color=c["green"])
    node(430, 424, 260, 52, "Restored document", "originals back &#8212; locally",
         fill=c["green_fill"], stroke=c["green_border"], tcol=c["green"])

    # token map -> reinstate
    elbow([(130, 308), (130, 366), (298, 366)])
    s.append(
        f'<text x="140" y="358" font-size="11" fill="{c["muted"]}">token map</text>'
    )

    # ---------------- outside ----------------
    panel(660, 52, 284, 448, "OUTSIDE &#183; ANY AI TOOL")
    node(802, 256, 240, 56, "LLM / agent", "sees only labelled tokens")
    s.append(
        '<text x="678" y="482" font-size="11" font-style="italic" '
        f'fill="{c["muted"]}">Claude &#183; GPT &#183; your internal model</text>'
    )

    # crossing arrows
    elbow([(560, 282), (680, 282)])
    s.append(
        f'<text x="620" y="274" font-size="11" fill="{c["muted"]}" '
        f'text-anchor="middle">tokens out</text>'
    )
    elbow([(802, 312), (802, 366), (562, 366)])
    s.append(
        f'<text x="700" y="358" font-size="11" fill="{c["muted"]}" '
        f'text-anchor="middle">processed output</text>'
    )

    # the boundary claim
    s.append(
        f'<text x="638" y="168" font-size="11" font-weight="600" fill="{c["red"]}" '
        f'text-anchor="middle" transform="rotate(-90 638 168)">'
        '&#10005; raw identifiers never cross</text>'
    )

    s.append("</svg>")
    return "\n".join(s)


os.makedirs("docs", exist_ok=True)
for name, palette in THEMES.items():
    path = f"docs/boundary-{name}.svg"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(build(palette))
    print("wrote", path)
