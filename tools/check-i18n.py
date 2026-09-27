"""Report SW25.* localization keys used in code/templates but missing from lang/en.json."""
import json, pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent / "swordworld25"
en = json.loads((root / "lang" / "en.json").read_text(encoding="utf-8"))
def has(key):
    node = en
    for p in key.split("."):
        if not isinstance(node, dict) or p not in node: return False
        node = node[p]
    return isinstance(node, str)
used = set()
for f in list(root.rglob("*.mjs")) + list(root.rglob("*.hbs")):
    for m in re.finditer(r"(?:SW25|TYPES)\.[A-Za-z0-9_.]+[A-Za-z0-9_]", f.read_text(encoding="utf-8")):
        used.add(m.group(0))
config_like = ("SW25.abilities","SW25.checks","SW25.classes","SW25.FIXED_OFFSET")
missing = sorted(k for k in used if not has(k) and not re.match(r"SW25\.[a-z]", k) and k not in config_like)
print("\n".join(missing) if missing else "all keys present")
