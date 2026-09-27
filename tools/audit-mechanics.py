"""Audit the automation of the compendium data (data/*.json).

Finds entries whose rules text describes mechanics (numeric bonuses, damage, healing, conditions)
that have no automation fields, and automation fields that cannot work (unknown modifier keys,
self modifiers on spells cast on others, amounts without power/fixed value...).

    python tools/audit-mechanics.py            # summary per file + every finding
    python tools/audit-mechanics.py --summary  # counts only
    python tools/audit-mechanics.py --json out.json

Exit code 1 when an "error" finding exists (invalid data that the system cannot use).
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
CONFIG = os.path.join(ROOT, "swordworld25", "module", "config.mjs")

# --------------------------------------------------------------------------- vocabulary


def _config_block(name):
    src = open(CONFIG, encoding="utf-8").read()
    m = re.search(r"SW25\.%s = \{(.*?)\n\};" % re.escape(name), src, re.S)
    return m.group(1) if m else ""


MODIFIER_KEYS = set(re.findall(r'^\s{2}"?([\w.]+)"?:', _config_block("modifierKeys"), re.M))
CHECK_KEYS = set(re.findall(r"^\s{2}(\w+):", _config_block("checks"), re.M))
STATUS_IDS = set(re.findall(r'\{ id: "(\w+)"', open(os.path.join(ROOT, "swordworld25", "module", "helpers", "conditions.mjs"), encoding="utf-8").read()))


def valid_key(key):
    if key in MODIFIER_KEYS:
        return True
    if key.startswith("check."):
        return key[6:] in CHECK_KEYS
    return False


# --------------------------------------------------------------------------- text signals

# "+2 to Evasion", "Evasion +1", "Accuracy checks -2", "-1 penalty", "Defense +3"
STAT_WORDS = (r"accuracy|evasion|defen[cs]e|damage|critical value|magic power|fortitude|willpower|resistance checks?|"
              r"spellcasting|action checks?|all checks|initiative|movement|max(?:imum)? hp|max(?:imum)? mp|"
              r"strength|dexterity|agility|vitality|intelligence|spirit|checks?|knowledge|search|danger sense|"
              r"stealth|hide|listen|notice|performance|riding|power")
RX_NUMERIC = re.compile(
    r"(?:\b(?:%s)\b[^.;:()\n]{0,25}?[+\-−]\s?\d+)|(?:[+\-−]\s?\d+\s*(?:bonus |penalty )?(?:to |on |for )?(?:the )?(?:%s)\b)"
    % (STAT_WORDS, STAT_WORDS), re.I)
# Conditions a spell/item can put on its target
STATUS_WORDS = {
    "sleep": r"\bsleep|\basleep",
    "paralyzed": r"paraly[sz]",
    "blind": r"\bblind",
    "deaf": r"\bdeaf",
    "silenced": r"\bsilenc",
    "charmed": r"\bcharm",
    "confused": r"\bconfus",
    "frightened": r"\bfear\b|frighten|terror",
    "prone": r"\bprone\b|knock(?:ed|s)? (?:down|over)",
    "petrified": r"petrif|turn(?:s|ed)? to stone",
    "entangled": r"entangl|bound\b|restrain",
    "invisible": r"invisib",
    "poisoned": r"\bpoisoned\b",
    "diseased": r"\bdiseased\b",
    "cursed": r"\bcursed\b",
    "fly": r"\bfly\b|\bflight\b|levitat",
    "unconscious": r"unconscious",
}
RX_DAMAGE = re.compile(r"\b(?:magic|physical)? ?damage\b", re.I)
RX_HEAL = re.compile(r"\b(?:recovers?|restores?|heals?)\b[^.]{0,30}\b(?:HP|MP)\b", re.I)


def text_of(entry):
    return " ".join(str(entry.get(k) or "") for k in ("summary", "description"))


def numeric_hits(text):
    return [m.group(0).strip() for m in RX_NUMERIC.finditer(text)]


def status_hits(text):
    return [k for k, rx in STATUS_WORDS.items() if re.search(rx, text, re.I)]


# --------------------------------------------------------------------------- reviewed entries

# Rules checked by hand whose numbers are situational or depend on things the system does not model: they stay in
# the description (and, for spells with a duration, in the timed effect put on the target).
REVIEWED = {
    "Charm": "+4 Willpower against the same spell afterwards",
    "Command": "+4 to the target's Willpower against this spell only",
    "Drive Away": "stacking penalty per hostile action within a round",
    "Call God": "maximum MP -50 for 7 days after a Minor God version",
    "Daemonthresher": "on a hit against daemons only (Fortitude or prone, Evasion -1)",
    "Dontrecia's Armor of Perseverance": "Defense +2 per physical hit until the wearer's turn",
    "Dontrecia's Great Armor of Perseverance": "Defense +2 per physical hit until the wearer's turn",
    "Dontrecia's Stiff Armor of Perseverance": "Defense +2 per physical hit until the wearer's turn",
    "Scout's Tools": "penalty when the tools are missing",
    "Musical Instrument": "penalty for instruments that cannot play a melody",
    "Bear Claws": "strengthens the [Bear Muscle] technique",
    "Spinel Horn": "golem skill (Charge)",
    "Lapis Lazuli Weight": "golem skill (Tail Swing I)",
    "Garnet of Vitality": "golem skill: +5/+10/+15 by the grade of the golem",
    "Focused Garnet of Vitality": "golem skill: +5/+10/+15 by the grade of the golem",
    "Apothecary's Tools": "handled by the item use workflow (herbs roll 1d+4)",
    "Big Gloves": "changes the Strength requirement of equipment",
    "Green Bullet (12)": "Power +10 for [Healing Bullet]/[Treat Bullet] only",
    "Improved Throw I": "the Throw attack of Grapplers is resolved by the GM",
    "Improved Throw II": "the Throw attack of Grapplers is resolved by the GM",
    "Dual Technique": "removes the [Dual Wielding] penalty (resolved by the player)",
    "Chain Attack": "an extra attack",
    "Weakness Exploit": "doubles the weak point bonus for the master only",
    "Shukuchi": "movement rule",
    "Dragon Tail": "grows a weapon; the bonus replaces it when the user already has a tail",
    "Wide Wings": "grows wings; the bonus replaces it when the user already flies",
    "Fenrir's Bite": "grows a weapon; the bonus replaces it when the user already has a bite",
    "Tandem": "passenger rule",
    "Charge": "Extra Damage by the distance moved",
    "Lion's Fury": "Evasion -2 after two sections acted",
    "Super Charge": "movement rule",
    "Orochi's Fury": "Evasion -2 after several sections acted",
    "Balance": "[Steady Command] rule",
    "Bind Ability": "penalty to the success values of monster unique skills",
    "Mana Sprout": "temporary MP kept apart from the target's own",
    "Dispel Needle": "forced removal check",
}

# Spells whose text names a condition only as an exception ("stays prone", "can't take off even if it can fly")
STATUS_WORDS_OK = {
    "Awaken", "Frenzy", "Rescue from Shallow Abyss", "Holy Tree", "Entrapment", "Silent Move", "Sound Pocket",
    "Air Walking", "Down Burst", "Evil Dream", "Prism Effect", "Petri-Cloud", "Wraith Form", "Copy Doll", "Nap",
}

# --------------------------------------------------------------------------- audit

FINDINGS = []


def add(file, entry, level, code, message):
    reason = REVIEWED.get(entry.get("name"))
    if reason and level in ("gap", "hint"):
        level, code, message = "info", "reviewed", f"{reason} ({code})"
    FINDINGS.append({
        "file": os.path.relpath(file, ROOT).replace("\\", "/"),
        "name": entry.get("name", "?"),
        "page": f"{(entry.get('source') or {}).get('book', '')} p.{(entry.get('source') or {}).get('page', '')}",
        "level": level,
        "code": code,
        "message": message,
    })


def check_modifiers(file, entry, mods, where="modifiers"):
    for m in mods or []:
        key = m.get("key", "")
        if not valid_key(key):
            add(file, entry, "error", "bad-key", f"{where}: unknown modifier key {key!r}")
        if not isinstance(m.get("value"), (int, float)):
            add(file, entry, "error", "bad-value", f"{where}: value {m.get('value')!r} of {key!r} is not a number")
        if m.get("scope", "effect") not in ("effect", "use"):
            add(file, entry, "error", "bad-scope", f"{where}: scope {m.get('scope')!r}")
        if m.get("target", "self") not in ("self", "target"):
            add(file, entry, "error", "bad-target", f"{where}: target {m.get('target')!r}")


def check_statuses(file, entry, statuses):
    for s in statuses or []:
        if s not in STATUS_IDS:
            add(file, entry, "error", "bad-status", f"unknown status {s!r}")


def audit_spell(file, e):
    eff = e.get("effect") or {}
    kind = eff.get("kind")
    variants = eff.get("variants") or []
    mods = (e.get("modifiers") or []) + [m for v in variants for m in (v.get("modifiers") or [])]
    statuses = (eff.get("statuses") or []) + [s for v in variants for s in (v.get("statuses") or [])]
    handled = statuses + (eff.get("removeStatuses") or [])
    text = text_of(e)
    check_modifiers(file, e, e.get("modifiers"))
    for v in variants:
        check_modifiers(file, e, v.get("modifiers"), f"variant {v.get('label')}")
        check_statuses(file, e, v.get("statuses"))
    check_statuses(file, e, eff.get("statuses"))
    check_statuses(file, e, eff.get("removeStatuses"))
    if kind in ("damage", "heal", "mpHeal"):
        has_amount = isinstance(eff.get("power"), int) or isinstance(eff.get("fixed"), int) \
            or re.fullmatch(r"\s*(\d+|magic power\s*[x×*]\s*\d+|.*@\w+.*)\s*", str(eff.get("formula") or ""), re.I)
        if not has_amount and not variants:
            add(file, e, "gap", "amount", f"{kind} without power/fixed/formula ({eff.get('formula')!r})")
    unit = (e.get("duration") or {}).get("unit")
    timed = unit not in ("instant", "special", None)
    if kind in ("buff", "debuff") and not mods and not statuses:
        if timed:
            add(file, e, "info", "tracker", f"{kind}: timed effect without numbers (tracked on the target)")
        else:
            add(file, e, "gap", "buff-empty", f"{kind} without modifiers or statuses and no duration")
    nums = numeric_hits(text)
    if nums and not mods and kind not in ("damage", "heal", "mpHeal", "bullet"):
        add(file, e, "gap", "numbers", f"numbers in text but no modifiers: {nums[:4]}")
    sts = [s for s in status_hits(text) if s not in handled]
    if sts and kind not in ("damage", "heal", "mpHeal", "bullet") and e.get("name") not in STATUS_WORDS_OK:
        add(file, e, "hint", "status-words", f"status words {sts} (statuses: {handled})")
    tkind = (e.get("target") or {}).get("kind")
    selfmods = [m for m in (e.get("modifiers") or []) if m.get("target", "self") == "self" and m.get("scope") != "use"]
    if selfmods and tkind not in ("caster",):
        add(file, e, "warn", "self-on-other", f"self modifiers on a spell targeting {tkind!r}: {[m['key'] for m in selfmods]}")
    lasting = [m for m in (e.get("modifiers") or []) if m.get("scope") != "use"]
    if lasting and unit == "instant":
        add(file, e, "warn", "instant-effect", "lasting modifiers on an Instant spell (the effect never expires)")


def audit_gear(file, e):
    use = e.get("use") or {}
    kind = use.get("kind")
    mods = e.get("modifiers") or []
    text = text_of(e)
    check_modifiers(file, e, mods)
    check_statuses(file, e, e.get("statuses"))
    fixed_heal = kind in ("healHP", "healMP") and (use.get("extra") or use.get("bonus"))
    if kind in ("healHP", "healMP", "damage") and not isinstance(use.get("power"), int) and not fixed_heal:
        add(file, e, "gap", "amount", f"use {kind} without power or a fixed amount")
    nums = numeric_hits(text)
    if nums and not mods and kind not in ("healHP", "healMP", "damage"):
        add(file, e, "gap", "numbers", f"numbers in text but no modifiers: {nums[:4]}")
    ammo = e.get("itemType") == "ammo"
    if e.get("consumable") and not ammo and kind in (None, "none") and not mods \
            and (RX_HEAL.search(text) or re.search(r"\bdamage\b", text, re.I)):
        add(file, e, "gap", "consumable", "consumable that heals/damages but use.kind is none")
    lasting = [m for m in mods if not m.get("condition")]
    if lasting and e.get("consumable") and not ammo and not (e.get("duration") or {}).get("unit"):
        add(file, e, "hint", "duration", "consumable modifiers without a duration (18 rounds assumed)")


RX_STAT = re.compile(r"(evasion|defen[cs]e|accuracy|power|crit)\w*\D{0,12}?([+\-−]?\s?\d+)|([+\-−]\s?\d+)\s*(evasion|defen[cs]e|accuracy)", re.I)


def stat_numbers(e, kind):
    """Numbers of the text already held by the item's own stat fields (armor Evasion/Defense, weapon rows)."""
    known = set()
    if kind == "armor":
        known |= {("evas", e.get("evasion")), ("defe", e.get("defense"))}
    if kind == "weapons":
        known.add(("defe", e.get("defenseBonus")))
        for m in e.get("modes") or []:
            known |= {("accu", m.get("accuracy")), ("powe", m.get("power")), ("crit", m.get("critical"))}
    return {k for k in known if k[1] is not None}


def is_stat(hit, known):
    m = RX_STAT.search(hit)
    if not m:
        return False
    word = (m.group(1) or m.group(4)).lower()[:4]
    num = int((m.group(2) or m.group(3)).replace(" ", "").replace("−", "-"))
    return (word, num) in known


def audit_generic(file, e, kind=""):
    mods = e.get("modifiers") or []
    check_modifiers(file, e, mods)
    risk = e.get("risk") or {}
    check_modifiers(file, e, risk.get("modifiers"), "risk")
    text = text_of(e)
    known = stat_numbers(e, kind)
    nums = [h for h in numeric_hits(text) if not is_stat(h, known)]
    if nums and not mods:
        add(file, e, "gap", "numbers", f"numbers in text but no modifiers: {nums[:4]}")
    if risk.get("text") and re.search(r"[+\-−]\s?\d", risk["text"]) and not risk.get("modifiers"):
        add(file, e, "gap", "risk", f"risk {risk['text']!r} without modifiers")


def audit_evocation(file, e):
    check_modifiers(file, e, e.get("modifiers"))
    ranks = e.get("ranks") or {}
    valued = [r for r, v in ranks.items() if v and isinstance(v.get("value"), int)]
    powered = [r for r, v in ranks.items() if v and isinstance(v.get("power"), int)]
    uses_rank = e.get("rankEffect") or any("@rankValue" in (m.get("formula") or "") for m in e.get("modifiers") or [])
    if valued and not e.get("modifierKey") and not uses_rank:
        add(file, e, "gap", "rank-key", f"ranks {valued} have values but no modifierKey")
    if e.get("modifierKey") and not valid_key(e["modifierKey"]):
        add(file, e, "error", "bad-key", f"modifierKey {e['modifierKey']!r}")
    if not valued and not powered and not e.get("modifiers") and not uses_rank:
        nums = numeric_hits(text_of(e) + " " + " ".join((v or {}).get("text", "") for v in ranks.values()))
        if nums:
            add(file, e, "gap", "numbers", f"numbers in ranks/text but no automation: {nums[:4]}")


def audit_finale(file, e):
    eff = e.get("effect") or {}
    if eff.get("kind") in ("damage", "heal", "mpHeal") and not isinstance(eff.get("power"), int):
        add(file, e, "gap", "amount", f"{eff.get('kind')} without power")
    nums = numeric_hits(text_of(e))
    if eff.get("kind") not in ("damage", "heal", "mpHeal") and nums and not e.get("modifiers"):
        add(file, e, "gap", "numbers", f"numbers in text but no automation: {nums[:4]}")


def audit_effect(file, e):
    check_modifiers(file, e, e.get("modifiers"))
    check_statuses(file, e, e.get("statuses"))
    nums = numeric_hits(text_of(e))
    if nums and not e.get("modifiers"):
        add(file, e, "gap", "numbers", f"numbers in text but no modifiers: {nums[:4]}")


def audit_ability(file, monster, a):
    entry = {"name": f"{monster['name']} / {a.get('name')}", "source": monster.get("source")}
    check_modifiers(file, entry, a.get("modifiers"))
    dmg = a.get("damage") or {}
    if dmg.get("formula") and not re.fullmatch(r"[\dd+\-× x*()]+", str(dmg["formula"]).replace(" ", "")) and not isinstance(dmg.get("power"), int):
        add(file, entry, "hint", "ability-formula", f"damage formula {dmg['formula']!r} is not rollable")


def main():
    for f in sorted(glob.glob(os.path.join(DATA, "spells", "*.json"))):
        for e in json.load(open(f, encoding="utf-8")):
            audit_spell(f, e)
    for name in ("gear", "ammo", "improvements", "mount-gear"):
        f = os.path.join(DATA, f"{name}.json")
        for e in json.load(open(f, encoding="utf-8")):
            audit_gear(f, e)
    for name in ("weapons", "armor", "feats", "techniques", "spellsongs", "stunts", "races"):
        f = os.path.join(DATA, f"{name}.json")
        for e in json.load(open(f, encoding="utf-8")):
            audit_generic(f, e, name)
    f = os.path.join(DATA, "evocations.json")
    for e in json.load(open(f, encoding="utf-8")):
        audit_evocation(f, e)
    f = os.path.join(DATA, "finales.json")
    for e in json.load(open(f, encoding="utf-8")):
        audit_finale(f, e)
    f = os.path.join(DATA, "effects.json")
    for e in json.load(open(f, encoding="utf-8")):
        audit_effect(f, e)
    for f in sorted(glob.glob(os.path.join(DATA, "monsters", "*.json"))):
        for m in json.load(open(f, encoding="utf-8")):
            for a in m.get("abilities") or []:
                audit_ability(f, m, a)

    args = sys.argv[1:]
    if "--json" in args:
        out = args[args.index("--json") + 1]
        json.dump(FINDINGS, open(out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    counts = {}
    for x in FINDINGS:
        counts.setdefault(x["file"], {}).setdefault(f"{x['level']}:{x['code']}", 0)
        counts[x["file"]][f"{x['level']}:{x['code']}"] += 1
    for file, c in counts.items():
        print(f"{file}: " + ", ".join(f"{k}={v}" for k, v in sorted(c.items())))
    if "--summary" not in args and "--json" not in args:
        for x in FINDINGS:
            if x["level"] != "info" or "--info" in args:
                print(f"[{x['level']}] {x['file']} | {x['name']} ({x['page']}) | {x['code']}: {x['message']}")
    print(f"{len(FINDINGS)} findings, {sum(1 for x in FINDINGS if x['level'] == 'error')} errors")
    return 1 if any(x["level"] == "error" for x in FINDINGS) else 0


if __name__ == "__main__":
    sys.exit(main())
