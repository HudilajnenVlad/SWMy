"""
Derive typical monster values by level (and defaults by classification) from the bundled bestiary data.
Writes swordworld25/module/data/monster-benchmarks.mjs, used by the "monster from template" tool.

Run: python tools/monster-benchmarks.py
"""
import glob
import json
import pathlib
import re
import statistics
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "swordworld25" / "module" / "data" / "monster-benchmarks.mjs"
MAX_LEVEL = 25

monsters = []
for f in sorted(glob.glob(str(ROOT / "data" / "monsters" / "*.json"))):
    monsters += json.loads(pathlib.Path(f).read_text(encoding="utf-8"))


def damage_bonus(text):
    m = re.match(r"^\s*2d\s*([+-]\s*\d+)?\s*$", text or "")
    return int((m.group(1) or "0").replace(" ", "")) if m else None


# --- Data points per stat: (level, value) ------------------------------------------
points = defaultdict(list)
for m in monsters:
    level = m["level"]
    if level < 1:
        continue
    for key in ("reputation", "weakness", "initiative", "fortitude", "willpower"):
        if isinstance(m.get(key), int):
            points[key].append((level, m[key]))
    sections = m["sections"]
    if len(sections) != 1:
        continue
    s = sections[0]
    for key in ("accuracy", "evasion", "defense", "hp", "mp"):
        if isinstance(s.get(key), int):
            points[key].append((level, s[key]))
    bonus = damage_bonus(s.get("damage"))
    if bonus is not None:
        points["damage"].append((level, bonus))

for m in monsters:
    if (m["classification"] == "barbarous") and isinstance(m.get("soulscars"), int) and (m["level"] >= 1):
        points["soulscars"].append((m["level"], m["soulscars"]))


def linear_fit(pts):
    n = len(pts)
    sx = sum(x for x, _ in pts)
    sy = sum(y for _, y in pts)
    sxx = sum(x * x for x, _ in pts)
    sxy = sum(x * y for x, y in pts)
    a = (n * sxy - sx * sy) / (n * sxx - sx * sx)
    return a, (sy - a * sx) / n


def quantile(values, q):
    values = sorted(values)
    if len(values) == 1:
        return values[0]
    return statistics.quantiles(values, n=100, method="inclusive")[int(q * 100) - 1] if 0 < q < 1 else statistics.median(values)


def series(key, q=0.5):
    """Smoothed (level ± 1) quantile per level, linear fit where data is sparse, never decreasing."""
    pts = points[key]
    a, b = linear_fit(pts)
    out = {}
    for level in range(1, MAX_LEVEL + 1):
        window = [v for (l, v) in pts if abs(l - level) <= 1]
        value = quantile(window, q) if len(window) >= 6 else a * level + b
        out[level] = value
    running = None
    for level in range(1, MAX_LEVEL + 1):
        v = max(0, round(out[level]))
        running = v if running is None else max(running, v)
        out[level] = running
    return out


table = {}
columns = {
    "reputation": series("reputation"), "weakness": series("weakness"), "initiative": series("initiative"),
    "fortitude": series("fortitude"), "willpower": series("willpower"), "accuracy": series("accuracy"),
    "damage": series("damage"), "evasion": series("evasion"), "defense": series("defense"), "hp": series("hp"),
    "mpLow": series("mp", 0.25), "mpHigh": series("mp", 0.75),
    "soulscars": {level: min(4, max(1, v)) for level, v in series("soulscars").items()}
}
for level in range(1, MAX_LEVEL + 1):
    table[level] = {key: col[level] for key, col in columns.items()}

# --- Defaults by classification ------------------------------------------------------
by_class = defaultdict(list)
for m in monsters:
    by_class[m["classification"]].append(m)


def mode(values, fallback="", keep_empty=False):
    values = [("" if v is None else v) for v in values] if keep_empty else [v for v in values if v not in (None, "")]
    return Counter(values).most_common(1)[0][0] if values else fallback


defaults = {}
for cls, ms in sorted(by_class.items()):
    weak = Counter()
    weak_example = {}
    for m in ms:
        wp = m.get("weakPoint") or {}
        if not wp.get("text"):
            continue
        k = (wp.get("kind"), wp.get("damageType"), wp.get("value"))
        weak[k] += 1
        weak_example.setdefault(k, wp)
    top_weak = weak_example[weak.most_common(1)[0][0]] if weak else None
    grounds = [m["movement"]["ground"] for m in ms if isinstance((m.get("movement") or {}).get("ground"), int)]
    airs = [m["movement"]["air"] for m in ms if isinstance((m.get("movement") or {}).get("air"), int)]
    ground_mode = mode([(m.get("movement") or {}).get("groundMode") for m in ms if isinstance((m.get("movement") or {}).get("ground"), int)], None, keep_empty=True)
    ground = round(statistics.median(grounds)) if len(grounds) >= len(ms) / 2 else None
    air = round(statistics.median(airs)) if len(airs) > len(ms) / 2 else None
    movement = f"{ground if ground is not None else '-'}{f' ({ground_mode})' if (ground is not None and ground_mode) else ''}/{air if air is not None else '-'}{' (Flying)' if air is not None else ''}"
    styles = [s.get("style") for m in ms if len(m["sections"]) == 1 for s in m["sections"]]
    defaults[cls] = {
        "intelligence": mode([m.get("intelligence") for m in ms]),
        "perception": mode([m.get("perception") for m in ms]),
        "disposition": mode([m.get("disposition") for m in ms]),
        "languages": mode([", ".join(m.get("languages") or []) for m in ms], keep_empty=True),
        "style": mode(styles, "Weapon"),
        "movement": movement,
        "weakPoint": {
            "text": top_weak.get("text") or "", "kind": top_weak.get("kind") or "",
            "damageType": top_weak.get("damageType") or "", "value": top_weak.get("value") or 0
        } if top_weak else None
    }

header = f"""/**
 * Typical monster values by level and defaults by classification, derived from the {len(monsters)} bundled
 * bestiary monsters (smoothed medians; linear fit where the data is sparse). Generated by
 * tools/monster-benchmarks.py — do not edit by hand.
 */
"""
body = "export const MONSTER_BENCHMARKS = " + json.dumps({str(k): v for k, v in table.items()}, indent=2) + ";\n\n"
body += "export const CLASSIFICATION_DEFAULTS = " + json.dumps(defaults, indent=2, ensure_ascii=False) + ";\n"
OUT.write_text(header + "\n" + body, encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}: levels 1-{MAX_LEVEL}, {len(defaults)} classifications")
for level in (1, 3, 5, 7, 10, 13, 15, 20, 25):
    print(level, table[level])
