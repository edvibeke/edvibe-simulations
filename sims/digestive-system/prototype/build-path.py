#!/usr/bin/env python3
import json
import math
import re
from pathlib import Path

from lxml import etree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SVG_PATH = ROOT / "Digestive_system_diagram_en.svg"
SCRIPT_PATH = ROOT / "script.js"
ANCHORS_PATH = HERE / "anchors.json"
BOUNDARY = [297.7, 728.2]
HEADROOM = 40.0
STEP = 0.02

NS = {"s": "http://www.w3.org/2000/svg"}
UNSURE_TAGS = {
    "detail", "liver_detail", "colon_detail", "annotation", "outline",
    "mouth", "salivary", "teeth", "stomach_fundus",
}
LUMEN_IDS = {
    "rect4987", "path6063", "rect7359", "path2174", "path10149",
    "path10151", "path10145", "path10147", "path10143",
}
ORGS = [
    ("mouth", None, "oesophagus"),
    ("oesophagus", "oesophagus", "cardia"),
    ("stomach", "cardia", "pylorus"),
    ("duodenum", "pylorus", "jejunum"),
    ("small intestine", "jejunum", "caecum"),
    ("colon", "caecum", "rectum"),
    ("rectum", "rectum", None),
]
LANDMARK_SEGMENTS = {
    "mouth": ("mouth", None, "oesophagus"),
    "oesophagus": ("oesophagus", "oesophagus", "cardia"),
    "cardia": ("oesophagus", "oesophagus", "cardia"),
    "stomach": ("stomach", "cardia", "pylorus"),
    "pylorus": ("duodenum", "pylorus", "jejunum"),
    "duodenum": ("duodenum", "pylorus", "jejunum"),
    "flexure": ("duodenum", "pylorus", "jejunum"),
    "jejunum": ("small intestine", "jejunum", "caecum"),
    "ileum": ("small intestine", "jejunum", "caecum"),
    "caecum": ("colon", "caecum", "rectum"),
    "hepatic": ("colon", "caecum", "rectum"),
    "transverse": ("colon", "caecum", "rectum"),
    "splenic": ("colon", "caecum", "rectum"),
    "descending": ("colon", "caecum", "rectum"),
    "rectum": ("rectum", "rectum", None),
}
LANDMARK_DEFS = {
    "mouth": ("arch", 2),
    "oesophagus": ("oesophagus", 10),
    "cardia": ("stomach", 0),
    "stomach": ("stomach", 9),
    "pylorus": ("duodenum", 0),
    "duodenum": ("duodenum", 4),
    "flexure": ("small", 0),
    "jejunum": ("small", 3),
    "ileum": ("small", 41),
    "caecum": ("colon", 0),
    "hepatic": ("colon", 6),
    "transverse": ("colon", 8),
    "splenic": ("colon", 11),
    "descending": ("colon", 16),
    "rectum": ("rectum", 0),
}
TRACE_ORDER = ["oesophagus", "stomach", "duodenum", "small", "colon", "rectum"]
MAX_ANCHOR_GAP = 35.0
SHOTS = [
    ("", "full-view.png"),
    ("?overlay=1", "centreline-overlay.png"),
    ("?view=tags", "tags-view.png"),
    ("?view=liver", "liver-stomach-zoom.png"),
    ("?view=small", "small-intestine-zoom.png"),
    ("?view=colon", "colon-zoom.png"),
]


def number(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def mul(m, n):
    a, b, c, d, e, f = m
    a2, b2, c2, d2, e2, f2 = n
    return (
        a * a2 + c * b2,
        b * a2 + d * b2,
        a * c2 + c * d2,
        b * c2 + d * d2,
        a * e2 + c * f2 + e,
        b * e2 + d * f2 + f,
    )


def parse_transform(value):
    matrix = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    if not value:
        return matrix
    for name, args in re.findall(r"(translate|matrix)\(([^)]*)\)", value):
        nums = [float(v) for v in re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", args)]
        if name == "translate":
            step = (1.0, 0.0, 0.0, 1.0, nums[0], nums[1] if len(nums) > 1 else 0.0)
        else:
            step = tuple(nums[:6])
        matrix = mul(matrix, step)
    return matrix


def accumulation(el):
    chain = []
    node = el
    while node is not None:
        chain.append(node)
        node = node.getparent()
    matrix = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    for node in reversed(chain):
        matrix = mul(matrix, parse_transform(node.get("transform")))
    return list(matrix)


def style_of(el):
    style = {}
    for item in (el.get("style") or "").split(";"):
        if ":" in item:
            k, v = item.split(":", 1)
            style[k.strip()] = v.strip()
    for key in ("fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity"):
        if el.get(key) is not None:
            style.setdefault(key, el.get(key))
    return style


def rect_path(el):
    x = number(el.get("x"))
    y = number(el.get("y"))
    w = number(el.get("width"))
    h = number(el.get("height"))
    return f"M {x:g} {y:g} H {x+w:g} V {y+h:g} H {x:g} Z"


def ellipse_path(el):
    cx = number(el.get("cx"))
    cy = number(el.get("cy"))
    rx = number(el.get("rx"))
    ry = number(el.get("ry"))
    return (
        f"M {cx-rx:g} {cy:g} a {rx:g} {ry:g} 0 1 0 {2*rx:g} 0 "
        f"a {rx:g} {ry:g} 0 1 0 {-2*rx:g} 0 Z"
    )


def part_tag(line):
    if line in (149, 220):
        return "oesophagus"
    if 151 <= line <= 158 or line in (171, 172, 173, 174):
        return "liver" if line in (151, 152, 171, 172, 195) else "gallbladder"
    if line == 159 or 213 <= line <= 215:
        return "duodenum"
    if 160 <= line <= 169 or line in (170, 175, 176):
        return "liver_detail"
    if 177 <= line <= 194:
        return "pancreas"
    if line == 195:
        return "liver_glow"
    if line in (196, 197):
        return "duodenum"
    if 198 <= line <= 200:
        return "pancreas"
    if 201 <= line <= 205:
        return "gallbladder"
    if line in (206, 212, 289):
        return "small"
    if 207 <= line <= 209 or line == 211:
        return "stomach"
    if line == 210:
        return "stomach_fundus"
    if 216 <= line <= 218:
        return "pancreas"
    if 222 <= line <= 240:
        return "salivary"
    if 242 <= line <= 275:
        return "mouth"
    if 276 <= line <= 284:
        return "outline"
    if 286 <= line <= 297:
        return "colon" if line != 289 else "small"
    if line in (299, 300):
        return "annotation"
    if 302 <= line <= 319:
        return "teeth"
    return "detail"


def catmull(anchors, mapper):
    pts = []
    cum = []
    total = 0.0

    def push(p):
        nonlocal total
        x, y = mapper(p)
        if pts:
            total += math.hypot(x - pts[-1][0], y - pts[-1][1])
        pts.append((x, y))
        cum.append(total)

    for i in range(len(anchors) - 1):
        p0 = anchors[max(0, i - 1)]
        p1 = anchors[i]
        p2 = anchors[i + 1]
        p3 = anchors[min(len(anchors) - 1, i + 2)]
        for j in range(9):
            t = j / 9.0
            t2 = t * t
            t3 = t2 * t
            x = 0.5 * (
                2 * p1[0]
                + (-p0[0] + p2[0]) * t
                + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
            )
            y = 0.5 * (
                2 * p1[1]
                + (-p0[1] + p2[1]) * t
                + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
            )
            push((x, y))
    push(anchors[-1])
    return pts, cum


def nearest_index(points, target):
    return min(range(len(points)), key=lambda i: (points[i][0] - target[0]) ** 2 + (points[i][1] - target[1]) ** 2)


def parse_old_script():
    text = SCRIPT_PATH.read_text()
    lines = text.splitlines()
    quote = "\n".join(f"{i + 1}: {lines[i]}" for i in range(426, min(440, len(lines))))
    track_txt = text[text.index("const TRACK = {") : text.index("const ANCHORS =")]
    blocks = {}
    keys = ["upper", "small", "colon"]
    for n, key in enumerate(keys):
        start = track_txt.index(key + ":")
        end = track_txt.index(keys[n + 1] + ":") if n + 1 < len(keys) else len(track_txt)
        chunk = track_txt[start:end]
        blocks[key] = [
            (float(a), float(b))
            for a, b in re.findall(r"\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]", chunk)
        ]
    anchors = blocks["upper"] + blocks["small"] + blocks["colon"]
    arc_points = {
        k: (float(x), float(y))
        for k, x, y in re.findall(r"at\('(\w+)',\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)", text)
    }
    area = {"x": 14, "y": 14, "w": 572, "h": 372}
    figure = {"x": 60, "y": 44, "w": 750, "h": 516}
    s = min(area["w"] / figure["w"], area["h"] / figure["h"])
    ox = (area["x"] + area["w"] / 2 - s * (figure["x"] + figure["w"] / 2)) / (1 - s)
    oy = (area["y"] + area["h"] / 2 - s * (figure["y"] + figure["h"] / 2)) / (1 - s)
    mapper = lambda p: (ox + (p[0] - ox) * s, oy + (p[1] - oy) * s)
    path, cum = catmull(anchors, mapper)
    arc = {}
    for key, p in arc_points.items():
        X, Y = mapper(p)
        arc[key] = cum[nearest_index(path, (X, Y))]
    speed_txt = text[text.index("const SPEED = [") : text.index("];", text.index("const SPEED = [")) + 2]
    entries = re.findall(r"\{\s*s:\s*([^,]+),\s*v:\s*([0-9.]+)\s*\}", speed_txt)
    breaks = []
    for expr, value in entries:
        expr = expr.strip()
        key = "0" if expr == "0" else expr.split(".")[-1]
        breaks.append((key, float(value)))
    return {"quote": quote, "arc": arc, "end": cum[-1], "breaks": breaks, "layout": {"S": s, "OX": ox, "OY": oy}}


def speed_fn(arc, breaks):
    base = breaks[0][1]

    def at(s):
        v = base
        for key, value in breaks:
            threshold = 0.0 if key == "0" else arc[key]
            if s >= threshold:
                v = value
        return v

    return at


def integrate(arc, end, breaks, step=STEP):
    at = speed_fn(arc, breaks)
    out = {}
    for name, lo, hi in ORGS:
        a = 0.0 if lo is None else arc[lo]
        b = end if hi is None else arc[hi]
        n = max(1, math.ceil((b - a) / step))
        ds = (b - a) / n
        out[name] = sum(ds / at(a + (i + 0.5) * ds) for i in range(n))
    return out


def pct_along(arc, end, key, lo, hi):
    a = 0.0 if lo is None else arc[lo]
    b = end if hi is None else arc[hi]
    return 100.0 * (arc[key] - a) / (b - a)


def write_anatomy(crop):
    tree = etree.parse(str(SVG_PATH))
    layer = tree.xpath("//s:g[@id='layer1']", namespaces=NS)[0]
    items = []
    for el in layer.iter():
        kind = el.tag.split("}")[-1]
        if kind not in ("path", "rect", "ellipse"):
            continue
        ident = el.get("id") or f"{kind}-{el.sourceline}"
        if kind == "path":
            d = el.get("d")
        elif kind == "rect":
            d = rect_path(el)
        else:
            d = ellipse_path(el)
        if not d:
            continue
        st = style_of(el)
        tag = part_tag(el.sourceline)
        items.append(
            {
                "id": ident,
                "tag": tag,
                "unsure": tag in UNSURE_TAGS,
                "lumen": ident in LUMEN_IDS,
                "d": d,
                "m": accumulation(el),
                "fill": st.get("fill", "#888888"),
                "stroke": st.get("stroke", "none"),
                "sw": number(st.get("stroke-width"), 1.0),
                "line": el.sourceline,
            }
        )
    legacy = [
        (260, 78), (300, 150), (297, 200), (297, 300), (296, 400),
        (305, 435), (350, 470), (320, 515), (285, 540), (265, 555),
        (250, 585), (270, 600), (310, 600), (360, 615), (380, 640),
        (330, 655), (270, 650), (240, 670), (280, 690), (340, 690),
        (350, 710), (300, 715), (265, 700), (245, 700), (230, 705),
        (210, 690), (210, 640), (215, 590), (235, 580), (290, 580),
        (345, 580), (390, 585), (395, 620), (392, 670), (388, 700),
        (365, 720), (330, 730), (300, 760), (298, 792),
    ]
    anchor_data = []
    for i, (x, y) in enumerate(legacy):
        lx = crop["ox"] + (x - crop["x"]) * crop["scale"]
        ly = crop["oy"] + (y - crop["y"]) * crop["scale"]
        anchor_data.append({"i": i, "svg": [x, y], "logical": [round(lx, 2), round(ly, 2)], "onCanvas": -4 <= lx <= 904 and -4 <= ly <= 544})
    payload = {"items": items, "anchors": anchor_data, "crop": crop}
    (HERE / "anatomy-data.js").write_text("window.ANATOMY_DATA = " + json.dumps(payload, separators=(",", ":")) + ";\n")
    lines = ["line  id                         tag               lumen  unsure", "----  --------------------------  ----------------  -----  ------"]
    for item in items:
        lines.append(
            f"{item['line']:>4}  {item['id']:<26}  {item['tag']:<16}  "
            f"{'yes' if item['lumen'] else '-':<5}  {'YES' if item['unsure'] else ''}"
        )
    (HERE / "part-tags.txt").write_text("\n".join(lines) + "\n")


def browser_report():
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.support.ui import WebDriverWait

    opts = Options()
    opts.add_argument("--headless")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--window-size=900,739")
    opts.add_argument("--hide-scrollbars")
    opts.binary_location = "/usr/bin/chromium"
    service = Service("/usr/bin/chromedriver")
    base = (HERE / "index.html").as_uri()
    (HERE / "screenshots").mkdir(exist_ok=True)
    data = None
    for query, out in SHOTS:
        drv = webdriver.Chrome(service=service, options=opts)
        drv.get(base + query)
        WebDriverWait(drv, 10).until(lambda d: d.execute_script("return window.__READY === true"))
        drv.save_screenshot(str(HERE / "screenshots" / out))
        if data is None:
            data = {
                "stats": drv.execute_script("return window.__LUMEN_STATS"),
                "runs": drv.execute_script("return window.__LUMEN_RUNS"),
                "segments": drv.execute_script("return window.__SEGMENT_STATS"),
            }
        drv.quit()
    (HERE / "lumen-report.json").write_text(json.dumps(data, indent=2))
    return data


def fmt(value, digits=2):
    return f"{value:.{digits}f}"


def run_checks(bundle, lumen):
    new = bundle["new"]
    failures = []

    rectum_y = new["rectumEnd"][1]
    if rectum_y < 775:
        failures.append(f"rectum_end_y {fmt(rectum_y, 1)} < 775")

    long_runs = [
        f"{run['organ']} {run['sStart']}–{run['sEnd']} ({run['sEnd'] - run['sStart']} px)"
        for run in lumen["runs"]
        if run["sEnd"] - run["sStart"] > 6
    ]
    if long_runs:
        failures.append(f"outside_runs>6px: {', '.join(long_runs)}")

    low_segments = [
        f"{name} {fmt(st['pct'], 1)}%"
        for name, st in lumen["segments"].items()
        if st["pct"] < 95
    ]
    if low_segments:
        failures.append(f"segments<95%: {', '.join(low_segments)}")

    wide_gaps = [
        f"{gap['segment']}[{gap['from']}]→{gap['segment']}[{gap['to']}] {fmt(gap['distance'], 1)}"
        for gap in new["maxGaps"]
        if gap["distance"] > MAX_ANCHOR_GAP
    ]
    if wide_gaps:
        failures.append(f"anchor_gaps>{MAX_ANCHOR_GAP:g}px: {', '.join(wide_gaps)}")

    return failures


def write_report(bundle, lumen):
    old = bundle["old"]
    new = bundle["new"]
    quote = old["quote"]
    old_arc = old["arc"]
    arc = new["arc"]
    old_end = old["end"]
    new_end = new["end"]
    times_old = old["times"]
    times_a = new["timesCombined"]
    times_b = new["timesSplit"]

    failures = run_checks(bundle, lumen)
    lines = []
    if failures:
        lines.append("FAIL " + " | ".join(failures))
    else:
        lines.append("CHECKS: PASS — all four checks passed")
    counts_text = ", ".join(f"{key}={value}" for key, value in new["counts"].items())
    lines.append(f"Anchors: {counts_text}. Last rectum anchor: `{new['rectumEnd']}`.")
    lines.append("")
    lines.append("# Digestive prototype — full rebuild report")
    lines.append("")
    lines.append("Re-run with:")
    lines.append("")
    lines.append("```bash")
    lines.append("python3 sims/digestive-system/prototype/build-path.py")
    lines.append("```")
    lines.append("")
    lines.append("Prototype folder only. `script.js`, tools and tests were not changed.")
    lines.append("")
    lines.append("## Checks")
    lines.append("")
    if failures:
        lines.append("Top-line FAIL is triggered by:")
        lines.append("")
        for failure in failures:
            lines.append(f"- FAIL {failure}")
    else:
        lines.append("PASS — rectum end is at or below SVG y=775, all outside runs are ≤6 px, all segments are ≥95% inside, and every neighbouring-anchor gap is ≤35 SVG units.")
    lines.append("")
    lines.append("## 1. `SPEED` and `speedAt()` in `script.js`")
    lines.append("")
    lines.append("```text")
    lines.append(quote)
    lines.append("```")
    lines.append("")
    lines.append("Speed is a **step per band**, not interpolated: the last step with `s >= step.s` wins.")
    lines.append("")
    lines.append("## 2. Anchors and boundary")
    lines.append("")
    lines.append(f"Boundary kept at `{BOUNDARY[0]}, {BOUNDARY[1]}`. Rectum ends at `{new['rectumEnd']}`.")
    lines.append("")
    lines.append("| segment | anchors |")
    lines.append("|---|---:|")
    for name, count in new["counts"].items():
        lines.append(f"| {name} | {count} |")
    lines.append("")
    lines.append("Largest neighbouring-anchor gap per segment:")
    lines.append("")
    lines.append("| segment | gap | distance |")
    lines.append("|---|---|---:|")
    for gap in new["maxGaps"]:
        lines.append(
            f"| {gap['segment']} | {gap['segment']}[{gap['from']}] → {gap['segment']}[{gap['to']}] | "
            f"{fmt(gap['distance'], 2)} |"
        )
    lines.append("")
    lines.append("## 3. Mouth headroom and layout")
    lines.append("")
    crop = new["crop"]
    lines.append(f"Traced start `{new['startSvg']}` maps to `{new['startLogical']}`, 40 logical px below the top of `AREA`.")
    lines.append("")
    lines.append("| value | result |")
    lines.append("|---|---:|")
    lines.append(f"| crop x | {fmt(crop['x'])} |")
    lines.append(f"| crop y | {fmt(crop['y'], 3)} |")
    lines.append(f"| crop w | {fmt(crop['w'])} |")
    lines.append(f"| crop h | {fmt(crop['h'], 3)} |")
    lines.append(f"| scale | {fmt(crop['scale'], 6)} |")
    lines.append(f"| figure width | {fmt(crop['w'] * crop['scale'], 3)} |")
    lines.append(f"| figure x | {fmt(crop['ox'], 3)} |")
    lines.append(f"| figure y | {fmt(crop['oy'], 3)} |")
    lines.append("")
    lines.append("| marker | s | logical point |")
    lines.append("|---|---:|---|")
    for name, marker in new["markers"].items():
        lines.append(f"| {name} | {fmt(marker['s'], 2)} | ({fmt(marker['x'], 2)}, {fmt(marker['y'], 2)}) |")
    lines.append("")
    lines.append("## 4. Lumen report")
    lines.append("")
    stats = lumen["stats"]
    lines.append(f"Full path: {fmt(stats['insidePct'], 1)}% inside, {stats['inside']}/{stats['samples']} samples, {stats['outsideRuns']} outside runs of 3+ samples.")
    lines.append("")
    lines.append("| segment | inside | samples | score |")
    lines.append("|---|---:|---:|---:|")
    for key in ["mouth", "oesophagus", "stomach", "duodenum", "small", "colon", "rectum"]:
        st = lumen["segments"].get(key)
        if not st:
            continue
        lines.append(f"| {key} | {st['inside']} | {st['samples']} | {fmt(st['pct'], 1)}% |")
    lines.append("")
    lines.append("| # | segment | s range | length | nearest anchors |")
    lines.append("|---:|---|---:|---:|---|")
    for i, run in enumerate(lumen["runs"], 1):
        length = run["sEnd"] - run["sStart"]
        lines.append(
            f"| {i} | {run['organ']} | {run['sStart']}–{run['sEnd']} | {length} px | "
            f"{', '.join(run['nearestAnchors'])} |"
        )
    lines.append("")
    lines.append("The editor reports individual traced segments; this score samples one continuous path at 2 px, including handoffs and crossings. The code-drawn mouth has no SVG lumen and is counted inside.")
    lines.append("")
    lines.append("## 5. Landmark overlay")
    lines.append("")
    lines.append("Landmark definitions at the top of `build-path.py`; `s` is taken from the exact Catmull sample at that anchor, with no nearest-point snapping:")
    lines.append("")
    lines.append("| landmark | segment | anchor index | resolved trace anchor | sample | s |")
    lines.append("|---|---|---:|---|---:|---:|")
    for name, lm in new["landmarks"].items():
        seg, idx = lm["ref"]
        resolved_seg, resolved_idx = lm["resolvedRef"]
        lines.append(
            f"| {name} | {seg} | {idx} | {resolved_seg}[{resolved_idx}] | {lm['sampleIndex']} | {fmt(lm['s'], 2)} |"
        )
    lines.append("")
    lines.append("`arch` is the code-drawn mouth centreline; shared handoff anchors resolve to the previous segment's last anchor.")
    lines.append("")
    lines.append("| landmark | new s | segment | % along | old s | old % |")
    lines.append("|---|---:|---|---:|---:|---:|")
    for name, lm in new["landmarks"].items():
        lines.append(
            f"| {name} | {fmt(lm['s'], 2)} | {lm['segment']} | {fmt(lm['pct'], 1)}% | "
            f"{fmt(lm['oldS'], 2)} | {fmt(lm['oldPct'], 1)}% |"
        )
    lines.append("")
    lines.append("All 15 are drawn as labelled dots on the art with their `s` values.")
    lines.append("")
    lines.append("## 6. Timing by numerical integration")
    lines.append("")
    lines.append(f"Old `TUBE_END = {fmt(old_end, 2)}`; new `TUBE_END = {fmt(new_end, 2)}`. Integration step `{STEP}` px using the step function from `script.js`.")
    lines.append("")
    lines.append("| ARC | old | new |")
    lines.append("|---|---:|---:|")
    for key in old_arc:
        lines.append(f"| {key} | {fmt(old_arc[key], 2)} | {fmt(arc[key], 2)} |")
    lines.append("")
    lines.append("### One pylorus→caecum speed")
    lines.append("")
    lines.append("| breakpoint | v |")
    lines.append("|---|---:|")
    for key, value in new["breaksCombined"].items():
        lines.append(f"| {key} | {fmt(value, 4)} |")
    lines.append("")
    lines.append("| organ | old min | new min | change |")
    lines.append("|---|---:|---:|---:|")
    for name, _, _ in ORGS:
        change = (times_a[name] / times_old[name] - 1) * 100
        lines.append(f"| {name} | {fmt(times_old[name], 4)} | {fmt(times_a[name], 4)} | {fmt(change, 2)}% |")
    lines.append("")
    lines.append("### Extra jejunum breakpoint")
    lines.append("")
    lines.append("| breakpoint | v |")
    lines.append("|---|---:|")
    for key, value in new["breaksSplit"].items():
        lines.append(f"| {key} | {fmt(value, 4)} |")
    lines.append("")
    lines.append("| organ | old min | new min | change |")
    lines.append("|---|---:|---:|---:|")
    for name, _, _ in ORGS:
        change = (times_b[name] / times_old[name] - 1) * 100
        lines.append(f"| {name} | {fmt(times_old[name], 4)} | {fmt(times_b[name], 4)} | {fmt(change, 2)}% |")
    lines.append("")
    lines.append("### Strides for the new total")
    lines.append("")
    lines.append("| constant | proposed |")
    lines.append("|---|---:|")
    for key, value in new["strides"].items():
        lines.append(f"| {key} | {fmt(value, 2)} |")
    lines.append("")
    lines.append("## 7. Screenshots")
    lines.append("")
    for _, out in SHOTS:
        lines.append(f"- `screenshots/{out}`")
    lines.append("")
    lines.append("STOPPED for approval. No simulation physiology changed.")
    lines.append("")
    (HERE / "REPORT.md").write_text("\n".join(lines))


def main():
    raw = json.loads(ANCHORS_PATH.read_text())
    segments = {key: {"anchors": [list(p) for p in value["anchors"]]} for key, value in raw["segments"].items()}
    rectum = segments["rectum"]["anchors"]
    bidx = next(i for i, p in enumerate(rectum) if all(abs(p[j] - BOUNDARY[j]) < 1e-6 for j in range(2)))
    segments["colon"]["anchors"] = segments["colon"]["anchors"] + rectum[1 : bidx + 1]
    segments["rectum"]["anchors"] = rectum[bidx:]

    oe = segments["oesophagus"]["anchors"]
    start_idx = min(range(len(oe)), key=lambda i: abs(oe[i][1] - 322))
    start = oe[start_idx]
    anus_y = segments["rectum"]["anchors"][-1][1]
    bottom = anus_y + 6.0
    scale = (372.0 - HEADROOM) / (bottom - start[1])
    crop = {
        "x": 130.0,
        "y": start[1] - HEADROOM / scale,
        "w": 310.0,
        "h": 372.0 / scale,
        "scale": scale,
        "ox": 14.0 + (572.0 - 310.0 * scale) / 2.0,
        "oy": 14.0,
    }

    def to_logical(p):
        return (crop["ox"] + (p[0] - crop["x"]) * scale, crop["oy"] + (p[1] - crop["y"]) * scale)

    start_logical = to_logical(start)
    mx = start_logical[0]
    arch = [
        [mx, 16.0],
        [mx - 10.0, 18.0],
        [mx - 14.0, 27.0],
        [mx - 10.0, 38.0],
        [mx - 4.0, 48.0],
        list(start_logical),
    ]
    ordered = []
    ordered_refs = []
    for i in range(len(arch) - 1):
        ordered.append(arch[i])
        ordered_refs.append(("arch", i))
    for i in range(start_idx, len(oe)):
        ordered.append(to_logical(oe[i]))
        ordered_refs.append(("oesophagus", i))
    for key in TRACE_ORDER[1:]:
        anchors = segments[key]["anchors"]
        for i in range(1, len(anchors)):
            ordered.append(to_logical(anchors[i]))
            ordered_refs.append((key, i))
    path, cum = catmull(ordered, lambda p: p)
    tube_end = cum[-1]

    ref_to_ordered = {ref: i for i, ref in enumerate(ordered_refs)}

    def resolve_ref(ref):
        seg, idx = ref
        if idx == 0 and seg in TRACE_ORDER[1:]:
            prev = TRACE_ORDER[TRACE_ORDER.index(seg) - 1]
            return (prev, len(segments[prev]["anchors"]) - 1)
        return ref

    arc = {}
    landmark_samples = {}
    resolved_refs = {}
    for key, ref in LANDMARK_DEFS.items():
        resolved = resolve_ref(ref)
        oi = ref_to_ordered[resolved]
        sample_idx = 9 * oi
        arc[key] = cum[sample_idx]
        landmark_samples[key] = sample_idx
        resolved_refs[key] = resolved
    landmark_meta = {}
    for key, ref in LANDMARK_DEFS.items():
        segment, lo, hi = LANDMARK_SEGMENTS[key]
        idx = landmark_samples[key]
        landmark_meta[key] = {
            "s": arc[key],
            "x": path[idx][0],
            "y": path[idx][1],
            "segment": segment,
            "pct": pct_along(arc, tube_end, key, lo, hi),
            "ref": list(ref),
            "resolvedRef": list(resolved_refs[key]),
            "orderedIndex": ref_to_ordered[resolved_refs[key]],
            "sampleIndex": idx,
        }

    max_gaps = []
    for seg in TRACE_ORDER:
        anchors = segments[seg]["anchors"]
        gaps = [math.dist(anchors[i], anchors[i + 1]) for i in range(len(anchors) - 1)]
        if not gaps:
            continue
        worst = max(range(len(gaps)), key=gaps.__getitem__)
        max_gaps.append({
            "segment": seg,
            "from": worst,
            "to": worst + 1,
            "distance": gaps[worst],
        })
    old = parse_old_script()
    old_times = integrate(old["arc"], old["end"], old["breaks"])
    for key in old["arc"]:
        segment, lo, hi = LANDMARK_SEGMENTS[key]
        landmark_meta[key]["oldS"] = old["arc"][key]
        landmark_meta[key]["oldPct"] = pct_along(old["arc"], old["end"], key, lo, hi)

    v0 = arc["oesophagus"] / old_times["mouth"]
    vo = (arc["cardia"] - arc["oesophagus"]) / old_times["oesophagus"]
    vs = (arc["pylorus"] - arc["stomach"]) / (
        old_times["stomach"] - (arc["stomach"] - arc["cardia"]) / vo
    )
    vsmall = (arc["caecum"] - arc["pylorus"]) / (old_times["duodenum"] + old_times["small intestine"])
    vd = (arc["jejunum"] - arc["pylorus"]) / old_times["duodenum"]
    vi = (arc["caecum"] - arc["jejunum"]) / old_times["small intestine"]
    vc = (arc["rectum"] - arc["caecum"]) / old_times["colon"]
    vr = (tube_end - arc["rectum"]) / old_times["rectum"]
    breaks_combined = {
        "0": v0,
        "ARC.oesophagus": vo,
        "ARC.stomach": vs,
        "ARC.pylorus": vsmall,
        "ARC.caecum": vc,
        "ARC.rectum": vr,
    }
    breaks_split = {
        "0": v0,
        "ARC.oesophagus": vo,
        "ARC.stomach": vs,
        "ARC.pylorus": vd,
        "ARC.jejunum": vi,
        "ARC.caecum": vc,
        "ARC.rectum": vr,
    }
    paired_combined = [("0", v0), ("oesophagus", vo), ("stomach", vs), ("pylorus", vsmall), ("caecum", vc), ("rectum", vr)]
    paired_split = [("0", v0), ("oesophagus", vo), ("stomach", vs), ("pylorus", vd), ("jejunum", vi), ("caecum", vc), ("rectum", vr)]
    times_combined = integrate(arc, tube_end, paired_combined)
    times_split = integrate(arc, tube_end, paired_split)
    strides = {
        "WAVE_STRIDE": 240.0 * tube_end / old["end"],
        "villus stride": 9.0 * (arc["caecum"] - arc["jejunum"]) / (old["arc"]["caecum"] - old["arc"]["jejunum"]),
        "haustra stride": 22.0 * (arc["rectum"] - arc["caecum"]) / (old["arc"]["rectum"] - old["arc"]["caecum"]),
    }
    spans = {
        "mouth": [0.0, arc["oesophagus"]],
        "oesophagus": [arc["oesophagus"], arc["cardia"]],
        "stomach": [arc["cardia"], arc["pylorus"]],
        "duodenum": [arc["pylorus"], arc["jejunum"]],
        "small intestine": [arc["jejunum"], arc["caecum"]],
        "colon incl sigmoid": [arc["caecum"], arc["rectum"]],
        "rectum": [arc["rectum"], tube_end],
    }
    markers = {}
    for name, s in [("feed first", 2.0), ("feed last", 18.0), ("Mouth badge", arc["mouth"])]:
        idx = min(range(len(cum)), key=lambda i: abs(cum[i] - s))
        markers[name] = {"s": s, "x": path[idx][0], "y": path[idx][1]}

    write_anatomy(crop)
    (HERE / "path-anchors.js").write_text(
        "window.PATH_ANCHORS = "
        + json.dumps(
            {
                "segments": {k: v["anchors"] for k, v in segments.items()},
                "boundarySvg": BOUNDARY,
                "oesophagusStartSvg": start,
                "archLogical": arch,
                "layout": crop,
            },
            separators=(",", ":"),
        )
        + ";\n"
    )
    analysis = {
        "ARC": arc,
        "TUBE_END": tube_end,
        "spans": spans,
        "breaksCombined": breaks_combined,
        "breaksSplit": breaks_split,
        "landmarks": landmark_meta,
        "landmarkDefs": LANDMARK_DEFS,
        "maxGaps": max_gaps,
        "crop": crop,
        "arch": arch,
        "old": {"arc": old["arc"], "end": old["end"], "times": old_times},
        "timesCombined": times_combined,
        "timesSplit": times_split,
        "strides": strides,
    }
    (HERE / "path-analysis.json").write_text(json.dumps(analysis, indent=2))
    (HERE / "path-analysis.js").write_text("window.PATH_ANALYSIS = " + json.dumps(analysis, separators=(",", ":")) + ";\n")
    bundle = {
        "old": {**old, "times": old_times},
        "new": {
            "arc": arc,
            "end": tube_end,
            "crop": crop,
            "counts": {k: len(v["anchors"]) for k, v in segments.items()},
            "startSvg": start,
            "startLogical": [start_logical[0], start_logical[1]],
            "rectumEnd": segments["rectum"]["anchors"][-1],
            "maxGaps": max_gaps,
            "landmarkDefs": LANDMARK_DEFS,
            "markers": markers,
            "landmarks": landmark_meta,
            "breaksCombined": breaks_combined,
            "breaksSplit": breaks_split,
            "timesCombined": times_combined,
            "timesSplit": times_split,
            "strides": strides,
        },
    }
    (HERE / "timing-analysis.json").write_text(json.dumps(bundle, indent=2))
    lumen = browser_report()
    write_report(bundle, lumen)
    print("built", HERE / "REPORT.md")
    print("full lumen", lumen["stats"]["insidePct"])


if __name__ == "__main__":
    main()
