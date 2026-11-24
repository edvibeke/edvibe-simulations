#!/usr/bin/env python3
import json
import math
import re
import sys
from pathlib import Path

from lxml import etree
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SVG_PATH = ROOT / "Digestive_system_diagram_en.svg"
GEOM_PATH = ROOT / "geometry.generated.json"
SHOT_PATH = HERE / "screenshots" / "full-view.png"
OUT_PATH = HERE / "routes-extracted.json"
DEFAULTS_PATH = HERE / "route-defaults.js"
OVERLAY_PATH = HERE / "screenshots" / "routes-extracted.png"
NS = {"s": "http://www.w3.org/2000/svg", "inkscape": "http://www.inkscape.org/namespaces/inkscape"}
TOKEN = re.compile(r"[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?")

BILE_ID = "path2533"
GALL_ID = "_223737152_1_"
PANCREATIC_IDS = [
    "path3954-8-2", "path3954-8-2-9", "path3954-05-1", "path3954-8",
    "path3954-05", "path3954-05-1-4-1", "path3954-2",
    "path3954-05-1-4-2", "path3954-0", "path3954-05-1-4-5",
    "path3954-6", "path3954-05-1-4", "path3954",
]
PORTAL_SVG = [
    [322.1, 596.4], [325.1, 573.8], [299.4, 595.2], [280.7, 596.9],
    [264.3, 593.7], [248.1, 584.6], [232.0, 559.6], [231.2, 526.7],
    [243.7, 502.7], [258.9, 494.3], [277.3, 494.3], [289.7, 502.7],
    [302.5, 504.9], [318.2, 506.6], [322.9, 498.6], [321.3, 486.1],
    [318.9, 476.9], [313.2, 469.9],
]
LYMPH_SVG = [
    [338.5, 588.0], [320.6, 565.0], [303.9, 520.5], [293.0, 474.3],
    [288.6, 430.1], [292.9, 405.2], [295.0, 380.0], [300.0, 340.0],
    [299.0, 300.0], [288.0, 246.8], [295.0, 209.1], [303.2, 183.2],
]


def parse_transform(value):
    matrix = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
    if not value:
        return matrix
    for name, args in re.findall(r"(translate|matrix)\(([^)]*)\)", value):
        nums = [float(v) for v in re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", args)]
        if name == "translate":
            step = [1.0, 0.0, 0.0, 1.0, nums[0], nums[1] if len(nums) > 1 else 0.0]
        else:
            step = nums[:6]
        a, b, c, d, e, f = matrix
        a2, b2, c2, d2, e2, f2 = step
        matrix = [
            a * a2 + c * b2,
            b * a2 + d * b2,
            a * c2 + c * d2,
            b * c2 + d * d2,
            a * e2 + c * f2 + e,
            b * e2 + d * f2 + f,
        ]
    return matrix


def accumulation(el):
    chain = []
    node = el
    while node is not None:
        chain.append(node)
        node = node.getparent()
    matrix = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
    for node in reversed(chain):
        parent = parse_transform(node.get("transform"))
        a, b, c, d, e, f = matrix
        a2, b2, c2, d2, e2, f2 = parent
        matrix = [
            a2 * a + c2 * b,
            b2 * a + d2 * b,
            a2 * c + c2 * d,
            b2 * c + d2 * d,
            a2 * e + c2 * f + e2,
            b2 * e + d2 * f + f2,
        ]
    return matrix


def sample_path(d, steps=14):
    tokens = TOKEN.findall(d)
    pts = []
    index = 0
    command = None
    x = y = 0.0
    start = (0.0, 0.0)

    def num():
        nonlocal index
        value = float(tokens[index])
        index += 1
        return value

    while index < len(tokens):
        if tokens[index].isalpha():
            command = tokens[index]
            index += 1
        if command is None:
            break
        if command in ("M", "m"):
            dx, dy = num(), num()
            if command == "m":
                x += dx
                y += dy
            else:
                x, y = dx, dy
            start = (x, y)
            pts.append((x, y))
            command = "l" if command == "m" else "L"
        elif command in ("L", "l"):
            dx, dy = num(), num()
            if command == "l":
                x += dx
                y += dy
            else:
                x, y = dx, dy
            pts.append((x, y))
        elif command in ("H", "h"):
            dx = num()
            x = x + dx if command == "h" else dx
            pts.append((x, y))
        elif command in ("V", "v"):
            dy = num()
            y = y + dy if command == "v" else dy
            pts.append((x, y))
        elif command in ("C", "c"):
            x1, y1, x2, y2, x3, y3 = (num() for _ in range(6))
            if command == "c":
                x1, y1 = x + x1, y + y1
                x2, y2 = x + x2, y + y2
                x3, y3 = x + x3, y + y3
            for k in range(1, steps + 1):
                t = k / steps
                u = 1 - t
                pts.append((
                    u**3 * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t**3 * x3,
                    u**3 * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t**3 * y3,
                ))
            x, y = x3, y3
        elif command in ("Q", "q"):
            x1, y1, x2, y2 = (num() for _ in range(4))
            if command == "q":
                x1, y1 = x + x1, y + y1
                x2, y2 = x + x2, y + y2
            for k in range(1, steps + 1):
                t = k / steps
                u = 1 - t
                pts.append((
                    u * u * x + 2 * u * t * x1 + t * t * x2,
                    u * u * y + 2 * u * t * y1 + t * t * y2,
                ))
            x, y = x2, y2
        elif command in ("S", "s"):
            x2, y2, x3, y3 = (num() for _ in range(4))
            if command == "s":
                x2, y2 = x + x2, y + y2
                x3, y3 = x + x3, y + y3
            for k in range(1, steps + 1):
                t = k / steps
                u = 1 - t
                pts.append((
                    u**3 * x + 3 * u * u * t * x + 3 * u * t * t * x2 + t**3 * x3,
                    u**3 * y + 3 * u * u * t * y + 3 * u * t * t * y2 + t**3 * y3,
                ))
            x, y = x3, y3
        elif command in ("Z", "z"):
            pts.append(start)
            x, y = start
        else:
            raise ValueError("unsupported command " + command)
    return pts


def transform_points(points, matrix):
    a, b, c, d, e, f = matrix
    return [(a * x + c * y + e, b * x + d * y + f) for x, y in points]


def logical_points(points, layout):
    return [(layout["ox"] + (x - layout["x"]) * layout["scale"],
             layout["oy"] + (y - layout["y"]) * layout["scale"]) for x, y in points]


def items():
    tree = etree.parse(str(SVG_PATH))
    layer = tree.xpath("//s:g[@id='layer1']", namespaces=NS)[0]
    out = []
    for el in layer.iter():
        if el.tag.split("}")[-1] not in ("path", "rect", "ellipse"):
            continue
        ident = el.get("id") or "line-" + str(el.sourceline)
        d = el.get("d") or el.get("{http://www.inkscape.org/namespaces/inkscape}original-d")
        if not d:
            continue
        style = el.get("style") or ""
        out.append({
            "id": ident,
            "line": el.sourceline,
            "d": el.get("d"),
            "original": el.get("{http://www.inkscape.org/namespaces/inkscape}original-d"),
            "m": accumulation(el),
            "fill": style.split("fill:")[-1].split(";")[0] if "fill:" in style else el.get("fill"),
            "stroke": style.split("stroke:")[-1].split(";")[0] if "stroke:" in style else el.get("stroke"),
        })
    return out


def item_points(item, key, layout, steps=14):
    d = item.get(key)
    if not d:
        return []
    raw = sample_path(d, steps)
    return logical_points(transform_points(raw, item["m"]), layout)


def simplify(points, spacing):
    out = [list(points[0])]
    for p in points[1:]:
        if math.dist(p, out[-1]) >= spacing:
            out.append(list(p))
    if out[-1] != list(points[-1]):
        out.append(list(points[-1]))
    return out


def nearest_index(points, target):
    return min(range(len(points)), key=lambda i: math.dist(points[i], target))


def chain_pancreatic(by_id, layout):
    centre_points = {}
    for ident in PANCREATIC_IDS:
        item = by_id[ident]
        pts = item_points(item, "original", layout, 10)
        if pts:
            centre_points[ident] = pts
    ordered = []
    tail_id = max(centre_points, key=lambda ident: centre_points[ident][0][0])
    current_id = tail_id
    used = set()
    current = centre_points[current_id][0]
    while True:
        used.add(current_id)
        seg = centre_points[current_id]
        if math.dist(seg[-1], current) <= math.dist(seg[0], current):
            seg = list(reversed(seg))
        if seg[0] != current:
            ordered.append(list(current))
        ordered.extend([list(p) for p in seg])
        current = ordered[-1]
        candidates = []
        for ident, pts in centre_points.items():
            if ident in used:
                continue
            candidates.append((min(math.dist(current, pts[0]), math.dist(current, pts[-1])), ident))
        if not candidates:
            break
        distance, current_id = min(candidates)
        if distance > 18:
            break
        seg = centre_points[current_id]
        current = seg[-1] if math.dist(current, seg[-1]) < math.dist(current, seg[0]) else seg[0]
    return simplify(ordered, 2.0)


def build():
    layout = json.loads(GEOM_PATH.read_text())["layout"]
    by_id = {item["id"]: item for item in items()}
    bile = simplify(item_points(by_id[BILE_ID], "d", layout, 8), 2.0)
    papilla = [318.88, 310.14]
    cut = nearest_index(bile, papilla)
    bile = bile[: cut + 1]
    if bile[-1] != papilla:
        bile.append(papilla[:])
    gall = simplify([[255.0, 256.5], [270.0, 257.5], [285.0, 261.0], [297.0, 266.0], [298.0, 273.0]], 1.0)
    pancreatic = chain_pancreatic(by_id, layout)
    if pancreatic[-1] != papilla:
        pancreatic.append(papilla[:])
    liver_pts = item_points(by_id["path2176"], "d", layout, 8)
    liver = [
        round((min(p[0] for p in liver_pts) + max(p[0] for p in liver_pts)) / 2, 2),
        round((min(p[1] for p in liver_pts) + max(p[1] for p in liver_pts)) / 2, 2),
    ]
    portal = logical_points(PORTAL_SVG, layout)
    lymph = logical_points(LYMPH_SVG, layout)
    routes = {
        "bile": [[round(x, 2), round(y, 2)] for x, y in bile],
        "pancreatic": [[round(x, 2), round(y, 2)] for x, y in pancreatic],
        "cystic": [[round(x, 2), round(y, 2)] for x, y in gall],
        "portal": [[round(x, 2), round(y, 2)] for x, y in portal],
        "lymph": [[round(x, 2), round(y, 2)] for x, y in lymph],
    }
    payload = {
        "routes": routes,
        "points": {"liver": liver, "papilla": papilla, "gallbladderCentre": [270.0, 257.5]},
        "sources": {
            "bile": [BILE_ID],
            "cystic": [GALL_ID, "path7192", "path4783"],
            "pancreatic": PANCREATIC_IDS,
            "portal": ["path6309", "path4972"],
            "lymph": ["rect4987", "path6525"],
        },
        "notes": [
            "bile follows the fill:none stroke path2533 from the liver hilum, through the gallbladder junction and stops at the shared papilla; its short right-hand branch beyond the papilla is not used",
            "cystic and gallbladder centre is a hand-sampled centre through the filled gallbladder body _223737152_1_; the SVG stores a filled outline, not a clean centreline",
            "pancreatic main trunk is chained from the inkscape:original-d guide strokes of the path3954 family; several branch gaps are reconstructed by straight joins",
            "portal and lymph are free routes traced from the path6309 mesenteric veins and the rect4987/path6525 oesophageal field",
        ],
    }
    OUT_PATH.write_text(json.dumps(payload, indent=2) + "\n")
    defaults = {"portal": PORTAL_SVG, "lymph": LYMPH_SVG}
    DEFAULTS_PATH.write_text("window.ROUTE_DEFAULTS = " + json.dumps(defaults, separators=(",", ":")) + ";\n")
    draw_overlay(routes, payload["points"])
    return payload


def draw_overlay(routes, points):
    im = Image.open(SHOT_PATH).convert("RGBA").crop((0, 0, 900, 540))
    overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    colours = {
        "bile": "#84cc16",
        "pancreatic": "#f0abfc",
        "cystic": "#fbbf24",
        "portal": "#60a5fa",
        "lymph": "#fcd34d",
    }
    for name, colour in colours.items():
        pts = [(round(x), round(y)) for x, y in routes[name]]
        draw.line(pts, fill=colour, width=4, joint="curve")
        for idx in (0, len(pts) - 1):
            x, y = pts[idx]
            draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=colour, outline="#0f172a", width=2)
        x, y = pts[len(pts) // 2]
        draw.text((x + 6, y - 14), name, fill=colour)
    for name, colour in (("liver", "#fda4af"), ("papilla", "#f8fafc"), ("gallbladder", "#fbbf24")):
        x, y = points["liver"] if name == "liver" else (points["papilla"] if name == "papilla" else points["gallbladderCentre"])
        draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=colour, outline="#0f172a", width=2)
        draw.text((x + 6, y + 6), name, fill=colour)
    im = Image.alpha_composite(im, overlay).convert("RGB")
    im.save(OVERLAY_PATH)


def main():
    if sys.argv[1:] == ["routes"]:
        payload = build()
        for name, pts in payload["routes"].items():
            print(name, len(pts), [round(v, 1) for v in pts[0]], [round(v, 1) for v in pts[-1]])
        return
    layout = json.loads(GEOM_PATH.read_text())["layout"]
    wanted = sys.argv[1:] or [
        "path2533", "path7189", "path4622-7", "path7192", "path4783",
        "rect3997", "rect3998", "rect3997-8", "path4017-0", "path126",
    ]
    for item in items():
        if item["id"] not in wanted and not item["id"].startswith("path3954"):
            continue
        for key in ("d", "original"):
            d = item.get(key)
            if not d:
                continue
            raw = sample_path(d)
            svg = transform_points(raw, item["m"])
            logical = logical_points(svg, layout)
            xs = [p[0] for p in logical]
            ys = [p[1] for p in logical]
            print(json.dumps({
                "id": item["id"],
                "source": key,
                "line": item["line"],
                "fill": item["fill"],
                "stroke": item["stroke"],
                "n": len(logical),
                "svgStart": [round(v, 2) for v in svg[0]],
                "svgEnd": [round(v, 2) for v in svg[-1]],
                "logicalStart": [round(v, 2) for v in logical[0]],
                "logicalEnd": [round(v, 2) for v in logical[-1]],
                "logicalBox": [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)],
            }))


if __name__ == "__main__":
    main()
