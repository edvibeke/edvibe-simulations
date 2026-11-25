#!/usr/bin/env python3
import hashlib
import json
import math
import re
from datetime import datetime
from pathlib import Path

from lxml import etree

HERE = Path(__file__).resolve().parent
ROOT = HERE
SVG_PATH = ROOT / "Digestive_system_diagram_en.svg"
BASELINE_PATH = HERE / "prototype" / "baseline-old.json"
ANCHORS_PATH = HERE / "anchors.json"
ROUTE_ANCHORS_PATH = HERE / "prototype" / "anchors.json"
EXTRACTED_ROUTES_PATH = HERE / "prototype" / "routes-extracted.json"
ROUTE_NAMES = ["portal", "lymph", "bile", "pancreatic"]
BOUNDARY = [297.7, 728.2]
OLD_AREA_H = 372.0
NEW_AREA_H = 446.0
AREA_Y = 80.0
LAYOUT_K = NEW_AREA_H / OLD_AREA_H
HEADROOM = 40.0 * LAYOUT_K
STEP = 0.02
SMALL_ILEUM_FRACTION = 0.42
SELF_CROSS_MIN_GAP = 40.0
ORGAN_COLOURS = {
    "mouth": "#f9bb9d",
    "oesophagus": "#f9bb9d",
    "stomach": "#f26522",
    "duodenum": "#e89e55",
    "small intestine": "#f69161",
    "colon": "#8cc63f",
    "rectum": "#8cc63f",
}
TUBE_TAG_ORGAN = {
    "oesophagus": "oesophagus",
    "stomach": "stomach",
    "stomach_fundus": "stomach",
    "duodenum": "duodenum",
    "small": "small intestine",
    "colon": "colon",
}
ART_COLOURS = {
    "mouth": "#f9bb9d",
    "salivary": "#f9bb9d",
    "teeth": "#fde68a",
    "oesophagus": "#f9bb9d",
    "stomach": "#f26522",
    "stomach_fundus": "#f26522",
    "duodenum": "#e89e55",
    "small": "#f69161",
    "colon": "#8cc63f",
    "rectum": "#8cc63f",
    "liver": "#9f1239",
    "liver_detail": "#fb7185",
    "liver_glow": "#fb7185",
    "gallbladder": "#a3e635",
    "pancreas": "#f0abfc",
    "portal": "#60a5fa",
    "lymph": "#fcd34d",
    "outline": "#64748b",
    "annotation": "#64748b",
    "detail": "#94a3b8",
}

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
    "pylorus": ("stomach", "cardia", "pylorus"),
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
    "pylorus": ("stomach", 18),
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


def svg_viewbox():
    root = etree.parse(str(SVG_PATH)).getroot()
    values = [float(value) for value in root.get("viewBox").replace(",", " ").split()]
    if len(values) != 4:
        raise ValueError("SVG viewBox is not a rectangle")
    return values


def point_segment_distance(point, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return math.dist(point, a)
    t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length_sq
    t = max(0.0, min(1.0, t))
    return math.dist(point, (a[0] + t * dx, a[1] + t * dy))


def polyline_distance(point, points):
    if len(points) == 1:
        return math.dist(point, points[0])
    return min(point_segment_distance(point, points[i], points[i + 1]) for i in range(len(points) - 1))


def route_polyline(points, mapper=None):
    out = []
    for point in points:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            raise ValueError("route point is not a pair")
        x, y = number(point[0]), number(point[1])
        if mapper:
            x, y = mapper((x, y))
        value = [round(x, 2), round(y, 2)]
        if out and math.dist(out[-1], value) < 0.01:
            continue
        out.append(value)
    if len(out) < 2:
        raise ValueError("route needs at least two points")
    cumulative = [0.0]
    for i in range(1, len(out)):
        cumulative.append(cumulative[-1] + math.dist(out[i - 1], out[i]))
    return {"points": out, "cumulative": cumulative, "length": cumulative[-1]}


def load_routes(mapper):
    route_anchors = {}
    if ROUTE_ANCHORS_PATH.exists():
        route_anchors = json.loads(ROUTE_ANCHORS_PATH.read_text())
    sources = route_anchors.get("routes", {})
    viewbox = svg_viewbox()
    min_x, min_y, max_x, max_y = viewbox[0], viewbox[1], viewbox[0] + viewbox[2], viewbox[1] + viewbox[3]
    routes = {}
    failures = []
    for name in ROUTE_NAMES:
        points = sources.get(name)
        if not isinstance(points, list) or len(points) < 3:
            failures.append("FAIL route missing: " + name + " needs at least 3 anchors")
            continue
        try:
            parsed = []
            for point in points:
                if not isinstance(point, (list, tuple)) or len(point) < 2:
                    raise ValueError("point is not a pair")
                x, y = number(point[0]), number(point[1])
                if not math.isfinite(x) or not math.isfinite(y):
                    raise ValueError("point is not finite")
                if not (min_x <= x <= max_x and min_y <= y <= max_y):
                    raise ValueError("point outside canvas")
                parsed.append([x, y])
            longest = max(math.dist(parsed[i], parsed[i + 1]) for i in range(len(parsed) - 1))
            if longest > 60:
                failures.append(f"FAIL route gap: {name} has a {longest:.2f} SVG unit gap over 60")
                continue
            routes[name] = route_polyline(parsed, mapper)
        except (TypeError, ValueError) as error:
            failures.append("FAIL route invalid: " + name + " (" + str(error) + ")")
    papilla = sources.get("papilla")
    if not isinstance(papilla, list) or len(papilla) != 1:
        failures.append("FAIL papilla: expected exactly 1 anchor")
    else:
        try:
            px, py = number(papilla[0][0]), number(papilla[0][1])
            if not (min_x <= px <= max_x and min_y <= py <= max_y):
                failures.append("FAIL papilla: point outside canvas")
            else:
                centreline = route_anchors["segments"]["duodenum"]["anchors"]
                distance = polyline_distance((px, py), centreline)
                if distance > 12:
                    failures.append(f"FAIL papilla: {distance:.2f} SVG units from duodenum centreline over 12")
        except (TypeError, ValueError, KeyError, IndexError) as error:
            failures.append("FAIL papilla invalid: " + str(error))
    return routes, failures


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


def choose_ileum_ref(ref_to_ordered, cumulative, small_count):
    start_s = cumulative[9 * ref_to_ordered[("small", 3)]]
    end_s = cumulative[9 * ref_to_ordered[("small", small_count - 1)]]
    target = start_s + SMALL_ILEUM_FRACTION * (end_s - start_s)
    candidates = range(4, small_count - 1)
    index = min(
        candidates,
        key=lambda i: abs(cumulative[9 * ref_to_ordered[("small", i)]] - target),
    )
    return ("small", index)


def parse_old_strides(text):
    wave = float(re.search(r"const\s+WAVE_STRIDE\s*=\s*([0-9.]+)", text).group(1))

    def loop_stride(name):
        start = text.index(f"function {name}(")
        end = text.index("\n  }", start)
        match = re.search(r"s\s*\+=\s*([0-9.]+)", text[start:end])
        return float(match.group(1))

    return {
        "WAVE_STRIDE": wave,
        "villus stride": loop_stride("drawVilli"),
        "haustra stride": loop_stride("drawHaustra"),
    }


def segments_cross(a, b, c, d):
    eps = 1e-9

    def cross(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    def straddles(u, v):
        return (u > eps and v < -eps) or (u < -eps and v > eps)

    def on(p, q, r):
        return (
            abs(cross(p, q, r)) < eps
            and min(p[0], q[0]) - eps <= r[0] <= max(p[0], q[0]) + eps
            and min(p[1], q[1]) - eps <= r[1] <= max(p[1], q[1]) + eps
        )

    d1, d2 = cross(a, b, c), cross(a, b, d)
    d3, d4 = cross(c, d, a), cross(c, d, b)
    if straddles(d1, d2) and straddles(d3, d4):
        return True
    return on(a, b, c) or on(a, b, d) or on(c, d, a) or on(c, d, b)


def geometry_crossings(path_points, cumulative, arc, tube_end):
    layers = [
        {"name": "upper tract", "s0": 0.0, "s1": arc["flexure"]},
        {"name": "colon frame", "s0": arc["caecum"], "s1": tube_end},
        {"name": "small intestine", "s0": arc["flexure"], "s1": arc["caecum"]},
    ]

    def layer_of(s):
        for index, layer in enumerate(layers):
            if layer["s0"] <= s <= layer["s1"]:
                return index
        return -1

    found = []
    failures = []
    for i in range(len(path_points) - 1):
        for j in range(i + 1, len(path_points) - 1):
            if cumulative[j] - cumulative[i] < SELF_CROSS_MIN_GAP:
                continue
            if not segments_cross(path_points[i], path_points[i + 1], path_points[j], path_points[j + 1]):
                continue
            li, lj = layer_of(cumulative[i]), layer_of(cumulative[j])
            names = [layers[li]["name"] if li >= 0 else "unknown", layers[lj]["name"] if lj >= 0 else "unknown"]
            crossing = {
                "s1": cumulative[i],
                "s2": cumulative[j],
                "layers": names,
                "point": path_points[i],
            }
            found.append(crossing)
            if li == lj or li < 0 or lj < 0:
                failures.append(
                    "self_crossing_same_layer: "
                    f"{names[0]} at {fmt(crossing['s1'], 1)}/{fmt(crossing['s2'], 1)}"
                )
                continue
            pair = set(names)
            upper_s = cumulative[i] if names[0] == "upper tract" else cumulative[j]
            colon_s = cumulative[i] if names[0] == "colon frame" else cumulative[j]
            allowed = pair == {"upper tract", "colon frame"} and upper_s < arc["hepatic"] < colon_s
            crossing["allowed"] = allowed
            if not allowed:
                failures.append(
                    "unexpected_self_crossing: "
                    f"{names[0]} x {names[1]} at {fmt(crossing['s1'], 1)}/{fmt(crossing['s2'], 1)}"
                )
    allowed_count = sum(1 for crossing in found if crossing.get("allowed"))
    return {"count": len(found), "crossings": found, "allowedCount": allowed_count, "failures": failures}


def svg_path_to_logical(d, matrix, crop):
    tokens = re.findall(r"[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?", d)
    output = []
    index = 0
    command = None
    x = y = 0.0
    start = (0.0, 0.0)

    def number():
        nonlocal index
        value = float(tokens[index])
        index += 1
        return value

    def transform(point):
        px, py = point
        a, b, c, dd, e, f = matrix
        sx = a * px + c * py + e
        sy = b * px + dd * py + f
        return (
            crop["ox"] + (sx - crop["x"]) * crop["scale"],
            crop["oy"] + (sy - crop["y"]) * crop["scale"],
        )

    def emit(prefix, points):
        parts = [f"{coord:.2f}" for point in points for coord in transform(point)]
        output.append(prefix + " ".join(parts))

    while index < len(tokens):
        if tokens[index].isalpha():
            command = tokens[index]
            index += 1
        if command is None:
            break
        if command in ("m", "M"):
            dx, dy = number(), number()
            if command == "m":
                x += dx
                y += dy
            else:
                x, y = dx, dy
            start = (x, y)
            emit("M ", [(x, y)])
            command = "l" if command == "m" else "L"
            while index < len(tokens) and not tokens[index].isalpha():
                dx, dy = number(), number()
                if command == "l":
                    x += dx
                    y += dy
                else:
                    x, y = dx, dy
                emit("L ", [(x, y)])
        elif command in ("l", "L"):
            while index < len(tokens) and not tokens[index].isalpha():
                dx, dy = number(), number()
                if command == "l":
                    x += dx
                    y += dy
                else:
                    x, y = dx, dy
                emit("L ", [(x, y)])
        elif command in ("h", "H"):
            while index < len(tokens) and not tokens[index].isalpha():
                value = number()
                x += value if command == "h" else value - x
                emit("L ", [(x, y)])
        elif command in ("v", "V"):
            while index < len(tokens) and not tokens[index].isalpha():
                value = number()
                y += value if command == "v" else value - y
                emit("L ", [(x, y)])
        elif command in ("c", "C"):
            while index < len(tokens) and not tokens[index].isalpha():
                x1, y1, x2, y2, x3, y3 = (number() for _ in range(6))
                if command == "c":
                    x1, y1 = x + x1, y + y1
                    x2, y2 = x + x2, y + y2
                    x3, y3 = x + x3, y + y3
                emit("C ", [(x1, y1), (x2, y2), (x3, y3)])
                x, y = x3, y3
        elif command in ("z", "Z"):
            output.append("Z")
            x, y = start
        else:
            raise ValueError(f"unsupported SVG path command: {command}")
    return " ".join(output)


def tube_paths(items, crop):
    paths = {}
    for item in items:
        organ = TUBE_TAG_ORGAN.get(item["tag"])
        if not item["lumen"] or not organ:
            continue
        paths.setdefault(organ, []).append(
            {
                "id": item["id"],
                "sourceTag": item["tag"],
                "d": svg_path_to_logical(item["d"], item["m"], crop),
                "fill": ORGAN_COLOURS[organ],
                "stroke": ORGAN_COLOURS[organ],
                "strokeWidth": round(item["sw"] * crop["scale"], 3),
                "sourceFill": item["fill"],
                "sourceStroke": item["stroke"],
            }
        )
    return paths


ART_ORDER = [
    "outline",
    "annotation",
    "liver_glow",
    "liver_detail",
    "liver",
    "salivary",
    "teeth",
    "mouth",
    "oesophagus",
    "stomach_fundus",
    "stomach",
    "gallbladder",
    "pancreas",
    "duodenum",
    "colon",
    "small",
    "rectum",
    "detail",
]


def svg_art(items, crop):
    groups = {}
    scale = crop["scale"]
    crop_matrix = (
        scale,
        0.0,
        0.0,
        scale,
        crop["ox"] - scale * crop["x"],
        crop["oy"] - scale * crop["y"],
    )
    for item in items:
        colour = ART_COLOURS.get(item["tag"], "#94a3b8")
        groups.setdefault(item["tag"], []).append(
            {
                "id": item["id"],
                "d": item["d"],
                "m": [round(v, 6) for v in mul(crop_matrix, item["m"])],
                "fill": colour,
                "stroke": colour,
                "strokeWidth": round(item["sw"] * scale, 3),
                "lumen": bool(item["lumen"]),
            }
        )
    return [
        {"tag": tag, "items": groups[tag]}
        for tag in ART_ORDER
        if tag in groups
    ]


def parse_old_script():
    data = json.loads(BASELINE_PATH.read_text())
    numeric = data["numericBaseline"]
    return {
        "quote": data["quote"],
        "arc": dict(numeric["arc"]),
        "end": numeric["end"],
        "breaks": [tuple(item) for item in numeric["breaks"]],
        "strides": dict(numeric["strides"]),
        "layout": dict(numeric["layout"]),
        "track": data["track"],
        "anchors": data["anchors"],
    }


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
    return items


def browser_report():
    report_path = HERE / "lumen-report.json"
    if report_path.exists():
        return json.loads(report_path.read_text())
    return {
        "stats": {"insidePct": 0.0},
        "runs": [],
        "rawRuns": [],
        "diagnostics": [],
        "segments": {},
    }


def fmt(value, digits=2):
    return f"{value:.{digits}f}"


def run_between_gap(run, gap):
    labels = run.get("nearestAnchors") or []
    first = f"{gap['segment']}[{gap['from']}]"
    second = f"{gap['segment']}[{gap['to']}]"
    return run.get("classification") == "TRULY OUTSIDE" and first in labels and second in labels


def run_checks(bundle, lumen):
    new = bundle["new"]
    failures = []
    warnings = []

    rectum_y = new["rectumEnd"][1]
    if rectum_y < 775:
        failures.append(f"rectum_end_y {fmt(rectum_y, 1)} < 775")

    arcs = new["arc"]
    names = list(LANDMARK_DEFS)
    for first, second in zip(names, names[1:]):
        if arcs[second] <= arcs[first]:
            failures.append(
                f"landmark_s_not_increasing: {first} {fmt(arcs[first], 2)} >= {second} {fmt(arcs[second], 2)}"
            )
            break

    long_runs = [
        f"{run['organ']} {run['sStart']}–{run['sEnd']} ({run['sEnd'] - run['sStart']} px)"
        for run in lumen["runs"]
        if run["sEnd"] - run["sStart"] > 6
    ]
    if long_runs:
        failures.append(f"catmull_outside_lumen>6px: {', '.join(long_runs)}")

    failures.extend(new["geometryChecks"]["failures"])

    low_segments = [
        f"{name} {fmt(st['pct'], 1)}%"
        for name, st in lumen["segments"].items()
        if st["pct"] < 95
    ]
    if low_segments:
        failures.append(f"segments<95%: {', '.join(low_segments)}")

    for diag in lumen["diagnostics"]:
        if diag["classification"] == "WRONG MASK":
            tubes = ", ".join(item["id"] for item in diag["containingTubes"])
            warnings.append(f"WARN wrong_mask_run: {diag['sStart']}–{diag['sEnd']} in {tubes}")

    for gap in new["maxGaps"]:
        if gap["distance"] <= MAX_ANCHOR_GAP:
            continue
        label = f"{gap['segment']}[{gap['from']}]→{gap['segment']}[{gap['to']}] {fmt(gap['distance'], 1)}"
        blocked = [run for run in lumen["diagnostics"] if run_between_gap(run, gap)]
        if blocked:
            spans = ", ".join(f"{run['sStart']}–{run['sEnd']}" for run in blocked)
            failures.append(f"anchor_gap_truly_outside: {label} ({spans})")
        else:
            warnings.append(f"WARN anchor_gap>{MAX_ANCHOR_GAP:g}px: {label}")

    return failures, warnings


def append_summary(lines, bundle):
    old = bundle["old"]
    new = bundle["new"]
    arcs = new["arc"]
    lines.append("## Summary")
    lines.append("")
    lines.append("### Landmark table")
    lines.append("")
    lines.append("| landmark | segment | anchor index | s | % along segment |")
    lines.append("|---|---|---:|---:|---:|")
    for name in LANDMARK_DEFS:
        seg, idx = new["landmarks"][name]["ref"]
        lm = new["landmarks"][name]
        lines.append(f"| {name} | {seg} | {idx} | {fmt(lm['s'], 2)} | {fmt(lm['pct'], 1)}% |")
    lines.append("")
    lines.append("### ARC values")
    lines.append("")
    lines.append("| ARC | old | new |")
    lines.append("|---|---:|---:|")
    for key in LANDMARK_DEFS:
        lines.append(f"| {key} | {fmt(old['arc'][key], 2)} | {fmt(arcs[key], 2)} |")
    lines.append("")
    lines.append("### SPEED options")
    lines.append("")
    lines.append("| breakpoint | one pylorus→caecum | extra jejunum breakpoint |")
    lines.append("|---|---:|---:|")
    for key in new["breaksSplit"]:
        one = new["breaksCombined"].get(key)
        two = new["breaksSplit"].get(key)
        lines.append(f"| {key} | {fmt(one, 4) if one is not None else '—'} | {fmt(two, 4)} |")
    lines.append("")
    lines.append("### Per-organ transit times")
    lines.append("")
    lines.append("| organ | old min | one speed min | one change | split min | split change |")
    lines.append("|---|---:|---:|---:|---:|---:|")
    for name, _, _ in ORGS:
        base = old["times"][name]
        one = new["timesCombined"][name]
        split = new["timesSplit"][name]
        lines.append(
            f"| {name} | {fmt(base, 4)} | {fmt(one, 4)} | {fmt((one / base - 1) * 100, 2)}% | "
            f"{fmt(split, 4)} | {fmt((split / base - 1) * 100, 2)}% |"
        )
    lines.append("")
    lines.append("### Strides for the new total")
    lines.append("")
    lines.append("| constant | old (from `baseline-old.json`) | proposed |")
    lines.append("|---|---:|---:|")
    for key, value in new["strides"].items():
        lines.append(f"| {key} | {fmt(old['strides'][key], 2)} | {fmt(value, 2)} |")
    lines.append("")


def write_report(bundle, lumen):
    source = bundle["source"]
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

    failures, warnings = run_checks(bundle, lumen)
    lines = []
    if failures:
        lines.append("FAIL " + " | ".join(failures))
    else:
        lines.append("CHECKS: PASS — all checks passed")
    raw_counts_text = ", ".join(f"{key}={value}" for key, value in source["rawCounts"].items())
    lines.append(f"ANCHORS FILE: `{source['path']}`")
    lines.append(f"MTIME: `{source['mtime']}`  MD5: `{source['md5']}`")
    lines.append(f"ANCHORS AS READ (before boundary move): {raw_counts_text}")
    counts_text = ", ".join(f"{key}={value}" for key, value in new["counts"].items())
    lines.append(f"Anchors after boundary move: {counts_text}. Last rectum anchor: `{new['rectumEnd']}`.")
    lines.append("")
    lines.append("# Digestive prototype — full rebuild report")
    lines.append("")
    append_summary(lines, bundle)
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
        lines.append("PASS — rectum end is at or below SVG y=775, landmark s values strictly increase, Catmull path leaves the lumen by at most 6 px, all segments are ≥95% inside, and self-crossings are limited to the intended duodenum/colon handoff.")
    if warnings:
        lines.append("")
        lines.append("Warnings (wrong-mask runs and large anchor gaps without a truly outside run):")
        lines.append("")
        for warning in warnings:
            lines.append(f"- {warning}")
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
    lines.append(f"Traced start `{new['startSvg']}` maps to `{new['startLogical']}`, {fmt(HEADROOM, 2)} logical px below the top of `AREA`.")
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
    lines.append(f"Raw assigned-mask outside runs (before mask/handoff fixes): {len(lumen['rawRuns'])}")
    lines.append(f"Remaining outside runs after re-score: {len(lumen['runs'])}")
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
    lines.append("Outside-run diagnosis for the raw runs (tube paths containing each run's samples):")
    lines.append("")
    lines.append("| # | s range | classification | containing SVG tube paths |")
    lines.append("|---:|---:|---|---|")
    for i, diag in enumerate(lumen["diagnostics"], 1):
        if diag["containingTubes"]:
            tubes = ", ".join(
                f"{item['id']} ({item['tag']}) ×{item['count']}" for item in diag["containingTubes"]
            )
        else:
            tubes = "none"
        lines.append(
            f"| {i} | {diag['sStart']}–{diag['sEnd']} | {diag['classification']} | {tubes} |"
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
    lines.append("| constant | old (from `baseline-old.json`) | proposed |")
    lines.append("|---|---:|---:|")
    for key, value in new["strides"].items():
        lines.append(f"| {key} | {fmt(old['strides'][key], 2)} | {fmt(value, 2)} |")
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
    anchor_bytes = ANCHORS_PATH.read_bytes()
    raw = json.loads(anchor_bytes)
    source = {
        "path": str(ANCHORS_PATH.resolve()),
        "mtime": datetime.fromtimestamp(ANCHORS_PATH.stat().st_mtime).astimezone().isoformat(timespec="seconds"),
        "md5": hashlib.md5(anchor_bytes).hexdigest(),
        "rawCounts": {key: len(value["anchors"]) for key, value in raw["segments"].items()},
    }
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
    scale = (NEW_AREA_H - HEADROOM) / (bottom - start[1])
    crop = {
        "x": 130.0,
        "y": start[1] - HEADROOM / scale,
        "w": 310.0,
        "h": NEW_AREA_H / scale,
        "scale": scale,
        "ox": 14.0 + (572.0 - 310.0 * scale) / 2.0,
        "oy": AREA_Y,
    }

    def to_logical(p):
        return (crop["ox"] + (p[0] - crop["x"]) * scale, crop["oy"] + (p[1] - crop["y"]) * scale)

    routes, route_failures = load_routes(to_logical)

    start_logical = to_logical(start)
    mx = start_logical[0]
    arch = [
        [mx, AREA_Y + 2.0 * LAYOUT_K],
        [mx - 10.0 * LAYOUT_K, AREA_Y + 4.0 * LAYOUT_K],
        [mx - 14.0 * LAYOUT_K, AREA_Y + 13.0 * LAYOUT_K],
        [mx - 10.0 * LAYOUT_K, AREA_Y + 24.0 * LAYOUT_K],
        [mx - 4.0 * LAYOUT_K, AREA_Y + 34.0 * LAYOUT_K],
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
    LANDMARK_DEFS["ileum"] = choose_ileum_ref(
        ref_to_ordered, cum, len(segments["small"]["anchors"])
    )

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
    geometry_checks = geometry_crossings(path, cum, arc, tube_end)
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
        "WAVE_STRIDE": old["strides"]["WAVE_STRIDE"] * tube_end / old["end"],
        "villus stride": old["strides"]["villus stride"] * (arc["caecum"] - arc["jejunum"]) / (old["arc"]["caecum"] - old["arc"]["jejunum"]),
        "haustra stride": old["strides"]["haustra stride"] * (arc["rectum"] - arc["caecum"]) / (old["arc"]["rectum"] - old["arc"]["caecum"]),
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

    anatomy_items = write_anatomy(crop)
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
        "geometryChecks": geometry_checks,
    }
    (HERE / "path-analysis.json").write_text(json.dumps(analysis, indent=2))
    (HERE / "path-analysis.js").write_text("window.PATH_ANALYSIS = " + json.dumps(analysis, separators=(",", ":")) + ";\n")
    bundle = {
        "source": source,
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
            "geometryChecks": geometry_checks,
        },
    }
    (HERE / "timing-analysis.json").write_text(json.dumps(bundle, indent=2))

    def to_design(point):
        return (
            crop["ox"] + (point[0] - crop["ox"]) / crop["scale"],
            crop["oy"] + (point[1] - crop["oy"]) / crop["scale"],
        )

    track_segments = {}
    for point, ref in zip(ordered, ordered_refs):
        track_segments.setdefault(ref[0], []).append([round(v, 3) for v in to_design(point)])
    geometry = {
        "option": "split",
        "track": [[round(v, 3) for v in to_design(point)] for point in ordered],
        "trackSegments": track_segments,
        "logicalTrack": ordered,
        "pathPoints": [[round(v, 3) for v in point] for point in path],
        "cumulative": cum,
        "TUBE_END": tube_end,
        "ARC": arc,
        "SPEED": breaks_split,
        "strides": strides,
        "oldStrides": old["strides"],
        "tubePaths": tube_paths(anatomy_items, crop),
        "svgArt": svg_art(anatomy_items, crop),
        "mouthArch": arch,
        "markers": markers,
        "layout": crop,
        "landmarks": landmark_meta,
        "landmarkDefs": LANDMARK_DEFS,
        "checks": geometry_checks,
        "routes": routes,
    }
    geometry_json = json.dumps(geometry, indent=2)
    geometry_js = "window.EV_GEOMETRY = " + json.dumps(geometry, separators=(",", ":")) + ";\n"
    (HERE / "geometry.generated.json").write_text(geometry_json)
    (HERE / "geometry.generated.js").write_text(geometry_js)
    (HERE / "prototype" / "geometry.generated.js").write_text(geometry_js)
    stride_text = " | ".join(
        f"{key} old={fmt(old['strides'][key], 2)} proposed={fmt(value, 2)}"
        for key, value in strides.items()
    )
    print("STRIDES " + stride_text)
    lumen = browser_report()
    write_report(bundle, lumen)
    if route_failures:
        report_path = HERE / "REPORT.md"
        report_path.write_text("\n".join(route_failures) + "\n\n" + report_path.read_text())
        for line in route_failures:
            print(line)
    print("built", HERE / "REPORT.md")
    print("full lumen", lumen["stats"]["insidePct"])


if __name__ == "__main__":
    main()
