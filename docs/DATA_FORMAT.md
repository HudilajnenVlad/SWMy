# Source data format (`data/`)

All compendium content of the system is authored as plain JSON under `data/` and compiled into
Foundry LevelDB packs by `npm run build:packs` (`tools/build-packs.mjs`). This file is the
contract between the data files and the build script. It is also the reference for adding
homebrew content.

## General rules

* Every file is a JSON **array** of entries (UTF-8, 2-space indentation).
* Names are the English names as printed in the rulebooks. Remove action icons
  (`⏩ △ ◯ ► 🗨`) from names — they are represented by fields.
* **Never copy rulebook prose verbatim.** `summary` and `description` are short explanations
  of the *mechanics* written in your own words. Numbers, names, ranges, costs, durations,
  target numbers etc. must be exact. Flavor/lore text is not reproduced (at most one short
  sentence of your own describing what the thing is).
* `source` is mandatory: `{ "book": "CR1" | "CR2" | "CR3", "page": <printed page number> }`.
* Unknown / not applicable values: use `null` (not `""`, not `0`) unless stated otherwise.
* Keep the order of entries as in the book.

## Shared vocabularies

### Damage / effect types (`types`)
`earth`, `water` (Water/Ice), `fire`, `wind`, `lightning`, `energy`, `slashing`,
`bludgeoning`, `poison`, `disease`, `psychic`, `psychicWeak` (Psychic (Weak)), `curse`.
If the book uses a type that is not in this list, use a camelCase key and mention it in your
final report.

### Resistance (`resistance`)
`cant` (Can't), `optional`, `none` (N/A — targets objects/points), `neg` (Neg/Negate),
`half`, `temporary` (evocations with "Temporary"), `special` (anything else — explain in description).

### Checks resisted with (`vs`)
`evasion`, `fortitude`, `willpower`, `dangerSense`, `other`.

### Duration object
```json
{ "text": "3 minutes (18 r)", "unit": "rounds", "value": 18 }
```
`unit`: `instant`, `rounds`, `minutes`, `hours`, `days`, `permanent`, `special`,
`instantRounds` (for "Instant/X seconds (Z rounds)" → value = Z). Use rounds whenever the book
gives rounds (10 seconds = 1 round, 1 minute = 6 rounds, 3 minutes = 18 rounds).

### Range / area object (spells, evocations, abilities)
```json
{ "text": "2(30m)/Shot", "range": "ranged", "areas": 2, "meters": 30, "area": "shot",
  "radius": null, "count": null, "areaCount": null }
```
* `range`: `caster`, `touch`, `ranged`.
* `areas`: 1 or 2 for ranged (the X in "X(Ym)"), else `null`. `meters`: the Y.
* `area`: `none` ("-"), `shot`, `target`, `line`, `breakthrough`.
* For targets like "1 area (3m radius)/5": put `areaCount: "1" | "2-3" | "all"`,
  `radius: 3`, `count: "space" | "all" | 5 | 10 | 15 | 20` (these are usually in the Target
  field — see spells).

### Modifiers (automation)
Optional `modifiers` array on spells, feats, techniques, spellsongs, evocations, stunts, items,
abilities. Only add a modifier when the effect is a plain numeric bonus/penalty that applies
while the effect lasts. Everything else stays in `description`.

```json
{ "key": "evasion", "value": 1 }
{ "key": "fortitude", "value": 4, "condition": "vs poison or disease" }
{ "key": "damageMelee", "value": 4, "scope": "use" }
```
* `value`: number (negative for penalties).
* `formula`: optional, added to `value` when the effect is created from the user's numbers:
  `"@magicPower"`, `"@magicPower + 8"`, `"@level"` (spells), `"@rankValue"`, `"@alchemyPower"` (evocations).
  Feats use the character's highest Magic Power (Mana Strike: `damageMelee` + `@magicPower`, `scope: use`).
* `actorType`: optional `character` or `monster` — the modifier only applies to characters (ability scores) or
  only to monsters and mounts (fixed values). Bless, Shock Bomb, Insanity and Critical Ray give both versions.
* `condition`: optional text → the bonus becomes an optional toggle in roll dialogs. On a consumable item
  (charms) choosing the toggle uses the item up. Situational *damage* bonuses are offered in weapon attack dialogs.
* `scope`: `effect` (default: while the effect/feature is active) or `use` (only the single
  attack/spell/check it was declared for — e.g. Power Strike).
* `target`: `self` (default) or `target` (the effect is applied to the target(s) of the
  spell/ability — e.g. a debuff spell).

Allowed keys (all values add to the relevant check/stat):

| key | meaning |
|---|---|
| `accuracy` / `accuracyMelee` / `accuracyRanged` | Accuracy checks (all / melee / ranged) |
| `evasion` | Evasion checks |
| `defense` | Defense (physical damage reduction) |
| `damage` / `damageMelee` / `damageRanged` | physical damage dealt by weapon attacks |
| `damageMagic` | magic damage dealt (spells, guns, magical abilities) |
| `damageTaken` / `damageTakenPhysical` / `damageTakenMagic` | damage received (+ = more damage, − = less) |
| `critical` | Critical Value of weapon attacks (negative = crits more easily) |
| `fortitude`, `willpower` | resistance checks |
| `spellcasting` | Spellcasting checks (all systems) |
| `magicPower` | Magic Power (all systems; affects checks and spell damage) |
| `actionChecks` | all Action Checks (everything except Death/Fortitude/Willpower) |
| `allChecks` | every check |
| `initiative`, `monsterKnowledge` | those checks |
| `technique`, `movementCheck`, `observation`, `knowledge` | check packages |
| `check.<checkKey>` | one specific check, e.g. `check.search`, `check.dangerSense`, `check.swim` |
| `movement` | movement speed in meters |
| `hpMax`, `mpMax` | maximum HP / MP |
| `ability.dex` … `ability.spi` | ability **scores** (dex, agi, str, vit, int, spi) |
| `mod.dex` … `mod.spi` | ability **modifiers** |
| `performance`, `evocation`, `riding` | Bard / Alchemist / Rider checks |
| `loot` | loot determination roll |
| `mp.cost` | MP cost of spells (e.g. −1) |
| `criticalSpell` | Critical Value of the user's spells (Critical Cast: −1, `scope: use`) |
| `criticalTaken` | Critical Value of attacks against the character (Weak Point: −1, never below 8) |
| `powerRoll` | added to the 2d of power-table rolls, max 12 (Lethal Strike: +1, `scope: use`) |
| `powerPerCrit` | Power added for each further critical roll (Executioner's Blade: 5, `scope: use`) |
| `weaponPower` | Power of weapon attacks (Ignidite Processing +5, Piercing Arrow −5) |
| `finalePower` | Power of the user's finales (Intense Finale +10) |
| `regenTurn` | HP regained at the end of the character's own turn (Raging Earth) |
| `regenRound` | HP regained at the end of every round by each standing section ([Regeneration]) |
| `damageTurn` | magic damage suffered at the end of the character's own turn (Poison Cloud) |

On a **weapon**, modifiers with `scope: use` apply only to the attacks made with that weapon (with a `condition`
they are a toggle of its attack dialog: Arm Catcher). On **ammunition** they apply to the shot (the attack dialog
lets the player pick the ammunition and uses one up); `silver`, `magic` and `types` of the ammunition change the
damage. **Improvements** (Magic Weapon +1...) count only once marked as applied (equipped). **Race traits**
(`races.json`) may carry `modifiers` that count from the trait's adventurer `level` (Tabbit Sixth Sense +4). A race's
`extraCheckOptions` (`check`, `source` — default `adventurer`, `ability`, `minLevel`, `trait`) add a way to reach a
check's standard value; `trait` names the racial ability shown next to the source ("Adventurer level (Sixth Sense)").

`python tools/audit-mechanics.py` lists entries whose rules text has numbers or conditions without automation,
unknown keys and statuses; rules checked by hand and left to the GM are listed in its `REVIEWED` table.

Check keys: `conceal, firstAid, disableDevice, pickpocket, disguise, setTrap, tumble, hide,
acrobatics, climb, climbStr, follow, track, notice, listen, dangerSense, insight, search, cartography,
meteorology, pathology, literature, engineering, appraise, herbology, spotTrap, detect, jump,
strength, swim, investigation, performance, riding, weakness, evocation, initiative,
monsterKnowledge, death`.

---

## Spells — `data/spells/<system>.json`

```json
{
  "name": "Energy Bolt",
  "source": { "book": "CR1", "page": 219 },
  "system": "truespeech",
  "subsystem": null,
  "deity": null,
  "level": 1,
  "cost": { "mp": 5, "text": "MP5" },
  "minorAction": false,
  "combatPrep": false,
  "target": { "text": "1 Character", "kind": "character", "areaCount": null, "radius": null, "count": null },
  "rangeArea": { "text": "2(30m)/Shot", "range": "ranged", "areas": 2, "meters": 30, "area": "shot" },
  "duration": { "text": "Instant", "unit": "instant", "value": null },
  "resistance": "half",
  "types": ["energy"],
  "magisphere": null,
  "effect": { "kind": "damage", "power": 10, "critical": 10, "damageKind": "magic", "addMagicPower": true },
  "summary": "Deals Power 10 energy magic damage to one target.",
  "description": "Magic damage: Power 10 + Magic Power. Resisted with Willpower for half damage.",
  "modifiers": []
}
```
* `system`: `truespeech`, `spiritualism`, `divine`, `magitech`, `fairy`.
* `subsystem`: divine → `basic` | `special`; fairy → `basic` | `earth` | `water` | `fire` |
  `wind` | `light` | `dark`; others `null`.
* `deity`: name of the god for Specialized Divine Magic (e.g. `"Lyphos"`), else `null`.
* `level`: spell level (for typed Fairy Magic: the Rank).
* `cost.mp`: numeric MP if it is a plain number, else `null` and keep the text (e.g.
  `"MP6&Mako Stone 5 pts."` → `{ "mp": 6, "text": "MP6 & Mako Stone 5 pts." }`;
  "MP1 x Target" → `{ "mp": 1, "text": "MP1 × targets" }`).
* `target.kind`: `caster`, `character` (1 Character), `entireCharacter` (1 Entire Character),
  `characterX` (1 Character X), `object`, `point` (Any Point), `touch`, `area` (X area (Y radius)/Z),
  `spell`, `bullet`, `bullets3`, `other`.
* `magisphere`: magitech only — `small` | `medium` | `large` | `null`.
* `effect.kind`: `damage`, `heal` (HP), `mpHeal`, `buff`, `debuff`, `utility`, `summon`,
  `bullet` (magitech bullet spells: `power` is the bullet power), `other`.
  `power` = the Power column (number) if a power table is used, else `null`;
  `critical` = crit value (10 normally, `null` if "None"/cannot crit);
  `damageKind` = `magic` | `physical` | `null`; `addMagicPower` = true when the formula is
  "Power X + Magic Power".
* For magitech bullet spells ("Target: Bullet") set `target.kind: "bullet"`, `effect.kind`
  `bullet` (or `heal` for healing bullets) and `power` to the power used by the gun.
* Buff/debuff spells with plain numbers → `modifiers` (with `"target": "target"` when the
  spell affects its targets, not the caster; use `self` only for `Target: Caster`).
* `effect.undeadDamage: true` — healing that damages undead instead (Cure Wounds…).
* `effect.fixed` — a fixed amount without the power table ("recovers Magic Power + 4 HP" →
  `fixed: 4, addMagicPower: true`; "50 earth magic damage" → `fixed: 50`).
* `effect.formula` — other computed amounts: a number (`"30"`) or `"Magic Power x5"`; anything else is
  shown as text only.
* `effect.statuses` — condition ids (`module/helpers/conditions.mjs`) put on the targets that fail to resist (on
  the caster for "Target: Caster"), with the numbers of the condition (blind: −4 to action checks) unless the
  spell's modifiers already set that key. Buff/debuff spells with a duration always create a timed effect on
  their targets, numbers or not, and so do utility spells cast on a character.
* `effect.removeStatuses` / `effect.removeTypes` — conditions and effect types (`poison`, `disease`, `curse`,
  `psychic`) ended on the targets (Cure Poison, Remove Curse, Awaken, Calm...).
* `effect.raiseCurrent: true` — the current HP rise with the `hpMax` modifier (Virtual Toughness); HP above the
  maximum is lowered when the effect ends.
* `effect.perTurn: "target" | "caster"` — the power-table damage is dealt at the end of each turn of the target
  (Lightning Bind, Blade Barrier) or of the caster (Summon Insects) while the effect lasts, as a damage card.
* `effect.formula` also accepts `"@extraMp"` (Transfer Mana: the extra MP paid, asked when casting) and
  `"@toZero"` (Vital Force: negative HP rise to 0).
* `effect.variants` — versions with their own cost/power, chosen when casting:
  `[{ "label": "Major Deity", "deityCategory": "major", "mp": 10, "power": 30, "critical": 10 }]`.
  With `deityCategory` the caster's god (ancient/major/minor) picks the default; without it the base
  version stays available. A version can also carry its own `modifiers`, `statuses`, `duration` and `summary`
  (Bless: one version per ability; Banish/Fear/Insanity: one per result of the 2d table); such versions replace
  the spell's own and must be chosen.

## Combat feats — `data/feats.json`

```json
{
  "name": "Power Strike I",
  "source": { "book": "CR1", "page": 257 },
  "featType": "active",
  "acquisition": "selective",
  "combatPrep": false,
  "prerequisites": { "text": "None", "advLevel": null, "classes": [], "feats": [] },
  "autoGain": null,
  "use": null,
  "application": "1 melee attack",
  "risk": { "text": "Evasion check -2", "modifiers": [ { "key": "evasion", "value": -2 } ] },
  "summary": "Declare on a melee attack: +4 damage if it hits.",
  "description": "…",
  "modifiers": [ { "key": "damageMelee", "value": 4, "scope": "use" } ]
}
```
* `featType`: `passive`, `active` (declared), `major` (Major Action feat).
* `acquisition`: `selective` or `automatic`.
* `prerequisites.classes`: any-of list `[{ "class": "fighter", "level": 5 }]`; class keys:
  `fighter, grappler, fencer, marksman, sorcerer, conjurer, priest, artificer, fairytamer,
  scout, ranger, sage, enhancer, bard, rider, alchemist`, plus `wizard` for "any Wizard-type class".
* `prerequisites.feats`: names of required feats (Roman numeral stripped when the book means
  "any tier", e.g. `"Cover"`).
* `autoGain`: `{ "class": "grappler", "level": 1 }` for automatically acquired feats.
* `use`: the "Use" restriction text or `null` for "-".
* `risk`: `null` when "None".

## Enhancer techniques — `data/techniques.json`
```json
{
  "name": "Gazelle Feet", "source": { "book": "CR2", "page": 184 },
  "level": 1, "combatPrep": true, "mpCost": 3, "oncePerRound": false,
  "duration": { "text": "30 seconds (3 r)", "unit": "rounds", "value": 3 },
  "summary": "Evasion +1.", "description": "…",
  "modifiers": [ { "key": "evasion", "value": 1 } ]
}
```
`level` = required Enhancer level (section heading "Nth Level Enhancer Required").
`mpCost` is 3 unless the technique says otherwise.

## Bard spellsongs — `data/spellsongs.json`
```json
{
  "name": "Ambience", "source": { "book": "CR2", "page": 190 },
  "level": 1, "singing": false, "pets": ["frog", "insect"],
  "condition": { "text": "None", "up": 0, "down": 0, "heart": 0 },
  "resistance": "neg", "types": ["psychic"],
  "baseRhythm": { "up": 0, "down": 1, "heart": 0 },
  "flourish": 13,
  "extraRhythm": { "up": 0, "down": 1, "heart": 0 },
  "summary": "Listeners get Accuracy -1.", "description": "…",
  "modifiers": [ { "key": "accuracy", "value": -1, "target": "target" } ]
}
```
Rhythm icons: ⮭ = `up` (Uplifting), ⮯ = `down` (Calming), ♡ = `heart` (Enchanting).

## Bard finales — `data/finales.json`
```json
{
  "name": "Finale: Spring Breeze", "source": { "book": "CR2", "page": 197 },
  "level": 1, "cost": { "up": 2, "down": 0, "heart": 0 },
  "resistance": "half", "types": ["wind"], "targets": "1 character",
  "effect": { "kind": "damage", "power": 10, "critical": 10, "damageKind": "magic", "addMagicPower": true },
  "summary": "Power 10 wind magic damage to one target.", "description": "…"
}
```
`addMagicPower` means "+ Bardic Power" here.

## Rider stunts — `data/stunts.json`
```json
{
  "name": "Intimidation", "source": { "book": "CR3", "page": 181 },
  "level": 1, "action": "minor", "prerequisites": [],
  "mounts": ["animal", "mythicalBeast"], "area": "main",
  "summary": "…", "description": "…", "modifiers": []
}
```
`action`: `passive` (◯), `major` (►), `minor` (⏩). `mounts`: `animal`, `mythicalBeast`,
`magitech`. `area`: `none`, `main`, `all`.

## Alchemist evocations — `data/evocations.json`
```json
{
  "name": "Vorpal Weapon", "source": { "book": "CR3", "page": 191 },
  "level": 1, "minorAction": true, "combatPrep": false,
  "cards": { "colors": ["red"], "count": 1, "text": "Red" },
  "target": { "text": "1 Character", "kind": "character" },
  "rangeArea": { "text": "1(10m)/Target", "range": "ranged", "areas": 1, "meters": 10, "area": "target" },
  "duration": { "text": "3 minutes (18 r)", "unit": "rounds", "value": 18 },
  "resistance": "optional",
  "ranks": {
    "B":  { "text": "+1 damage",  "value": 1,  "power": null },
    "A":  { "text": "+2 damage",  "value": 2,  "power": null },
    "S":  { "text": "+3 damage",  "value": 3,  "power": null },
    "SS": { "text": "+6 damage",  "value": 6,  "power": null }
  },
  "modifierKey": "damage", "modifierTarget": "target",
  "summary": "…", "description": "…"
}
```
* Card colors: `red`, `green`, `black`, `white`, `gold`. `count` = cards per use (x2 → 2).
* `ranks.<R>` is `null` when that rank cannot be used ("-").
* When each rank simply gives a number for one stat, fill `value` and set `modifierKey`
  (modifier vocabulary), `modifierTarget` (`self`/`target`) and optionally `modifierCondition`. If a rank
  uses a power table, put the Power in `power`.
* `rankEffect`: `healHP` / `healMP` (the rank value is healed: Heal Spray, Vivid Liquid), `check` (the rank
  value is the success value of the check: Unlock Needle) or `duration` (the rank value is the duration in
  rounds: the fields). `modifiers` may use `"formula": "@rankValue"` (Critical Ray, Poison Needle).
* `turnOfUser: true` — effects acting at the end of the Alchemist's turns (Poison Needle); `types` — the
  evocation's damage/effect types.

## Weapons — `data/weapons.json`
```json
{
  "name": "Bastard Sword", "source": { "book": "CR1", "page": 271 },
  "categories": ["sword"], "rank": "B",
  "edged": true, "blunt": false, "magic": false, "silver": false, "grapplerOnly": false,
  "price": 560, "priceText": null, "reputation": null,
  "range": null, "defenseBonus": 0,
  "modes": [
    { "label": "1H", "stance": "1H†", "minStr": 17, "accuracy": 0, "power": 17, "critical": 10, "extraDamage": 0 },
    { "label": "2H", "stance": "2H",  "minStr": 17, "accuracy": 0, "power": 27, "critical": 10, "extraDamage": 0 }
  ],
  "summary": "…", "description": "…", "modifiers": []
}
```
* categories: `sword, axe, spear, mace, staff, flail, warhammer, wrestling, throw, bow,
  crossbow, blowgun, gun` (a weapon can be in several).
* Guns: `power: null` in modes (power comes from the bullet spell).
* `accuracy` / `extraDamage`: 0 for "-".
* `range`: "10m" etc. for thrown/ranged weapons.
* The power table row printed next to each weapon must match the Power value — you do not
  need to copy it.

## Armor & shields — `data/armor.json`
```json
{
  "name": "Soft Leather", "source": { "book": "CR1", "page": 287 },
  "armorType": "nonmetal", "rank": "B", "stance": null,
  "minStr": 7, "evasion": 0, "defense": 3, "price": 150,
  "grappler": null, "magic": false,
  "summary": "…", "description": "…", "modifiers": []
}
```
`armorType`: `nonmetal`, `metal`, `shield`. `stance` for shields ("1H"/"2H").
`grappler`: `may` ("Grapplers may equip"), `only` ("Grappler only") or `null`.

## Other items — `data/gear.json`
```json
{
  "name": "Healing Potion", "source": { "book": "CR1", "page": 294 },
  "itemType": "potion",
  "slot": [], "stance": null, "price": 100, "priceText": null, "magic": false,
  "consumable": true,
  "use": { "kind": "healHP", "power": 20, "critical": null, "extra": 0, "bonus": "rangerInt" },
  "classReq": null, "popularity": null,
  "summary": "…", "description": "…", "modifiers": []
}
```
* `itemType`: `accessory`, `classItem`, `herb`, `potion`, `ammo`, `tool` (adventure tools),
  `gear` (general equipment/supplies), `golemItem`, `mountItem`, `other`.
* `slot` (accessories): any of `head, face, ear, neck, back, rightHand, leftHand, hand, waist,
  feet, other, any`.
* `use.kind`: `healHP`, `healMP`, `damage`, `effect`, `none`. `bonus`: `rangerDex` (herbs),
  `rangerInt` (potions), `null`.
* `classReq`: `{ "class": "ranger", "level": 5 }` when the item only works for a class level.
* `types` (damage/effect types of the item's use, e.g. `["fire"]`) and `duration` (duration object, `null`
  when not applicable) are optional.

Combat feats that make the player pick something ("Weapon Proficiency A") carry
`"choice": "weaponCategory"` (or `"armorCategory"`); the chosen value is stored on the owned feat.

## Monsters — `data/monsters/<file>.json`
```json
{
  "name": "Goblin", "source": { "book": "CR1", "page": 397 },
  "level": 2, "classification": "barbarous",
  "intelligence": "Low", "perception": "Five senses (Darkvision)", "disposition": "Hostile",
  "soulscars": 2, "languages": ["Barbaric", "Youma"], "habitat": "Forests, Mountains, Caves",
  "reputation": 5, "weakness": 10,
  "weakPoint": { "text": "Magic Damage +2 points", "kind": "damage", "damageType": "magic", "value": 2 },
  "initiative": 11,
  "movement": { "text": "11/-", "ground": 11, "groundMode": null, "air": null, "airMode": null },
  "fortitude": 3, "willpower": 3,
  "sections": [
    { "name": null, "style": "Weapon", "accuracy": 3, "damage": "2d+2", "evasion": 3,
      "defense": 2, "hp": 16, "mp": 12, "count": 1, "main": false }
  ],
  "mainSection": null,
  "abilities": [
    {
      "name": "Bow", "tags": ["major"], "section": null,
      "check": { "value": 3, "vs": "evasion", "result": "neg" },
      "damage": { "formula": "2d+1", "kind": "physical", "types": [] },
      "spellcasting": null, "fairyTypes": null,
      "rangeArea": null, "prerequisite": null,
      "summary": "…", "description": "…", "modifiers": []
    }
  ],
  "loot": [
    { "roll": "2-3", "min": 2, "max": 3, "item": "Crude Weapon", "price": 10, "cards": "Black White B", "quantity": null },
    { "roll": "Always", "min": null, "max": null, "item": "…", "price": 20, "cards": "White B", "quantity": null }
  ],
  "description": "One or two sentences in your own words about what the creature is."
}
```
* `classification`: `barbarous, animal, plant, undead, construct, magitech, mythicalBeast,
  fairy, daemon, humanoid, golem, familiar`.
* Values in the book are "Standard(Fixed)" — store only the **standard** value (fixed = standard + 7).
  For `damage` store the formula text ("2d+2"). `-` → `null`.
* `soulscars`: only printed for Barbarous; `null` otherwise.
* `weakPoint.kind`: `accuracy` ("Accuracy +1"), `damage` (damage +X of `damageType`:
  `physical`, `magic`, or a type key like `fire`, `earth`, `slashing`), `other`.
* Multi-section monsters: one entry in `sections` per section (`name` = section name as in
  "Sections: 3 (Head/Body/Wing)", `style` = fighting style column). "Wing x2" → one section
  with `count: 2` **only if** the stat line is shared; `main: true` for the main section(s).
  `mainSection` = the text after "Main Section:" (e.g. `"Head"`, `"(All) Head/Body"`, `"None"`).
* `abilities[].tags` from icons: ◯ → `passive`, ► → `major`, ⏩ → `minor`, △ → `prep`,
  🗨/speech balloon → `declared`. Several allowed.
* `abilities[].section`: when the ability is listed under a specific section heading
  ("●Head"), put the section name; "●All Sections" or no heading → `null`.
* `abilities[].check`: from headings like "►Breath / 11(18) / Fortitude / Half" →
  `{ "value": 11, "vs": "fortitude", "result": "half" }`; "Name/Can't" → `{ "value": null,
  "vs": null, "result": "cant" }`. `null` when the ability has no check.
* `abilities[].damage`: when the ability deals damage/healing given as `"2d+X"` or a fixed
  number: `kind` = `physical`, `magic`, `fixed` (Fixed Damage), `heal`; else `null`.
* `abilities[].spellcasting`: for "►Truespeech Magic 2 Level/Magic Power 4(11)" →
  `{ "system": "truespeech", "level": 2, "power": 4, "deity": null }`. Divine magic may
  name a god. Fairy Magic: also `fairyTypes: ["earth","fire","wind","light"]`.
  "►Basic Spellsongs 1 Level/4(11)/…" → system `spellsong`.
* `loot[].cards`: the Alchemist card text after the price (e.g. `"Black White B"`), `null` if "-".
  "Nothing" rows are kept with `item: "Nothing"`, `price: null`. "x 1d" → `quantity: "1d"`.

### Monster conventions (settled during the CR I pilot)
* **Source text**: prefer per-page `pdftotext -raw -enc UTF-8 -f N -l N <pdf> out.txt` output (keeps icons,
  separates the two columns, keeps loot rows in order). `pdftotext` is at `C:\Program Files\Git\mingw64\bin\pdftotext.exe`
  (`/mingw64/bin/pdftotext` in Git Bash).
* **Movement**: the second slot ("/X") also holds Burrow and Swimming — keep using `air`/`airMode` and put the
  mode text ("Flying", "Burrow", "Swimming") in `airMode`.
* **Section count**: `count` may be a string range such as `"3-5"`; identical rows printed "x 2" → one section with
  `count: 2`. This is only the compact source form: `tools/build-packs.mjs` turns it into separate sections, one per
  part, each with its own HP and MP (the sheet numbers them "Horse 1", "Horse 2"). A range becomes its minimum
  number of sections, and the range is kept in `countRange` for the section line ("Petal ×3 (3–5)").
* **Two magic systems on one line** → one ability per system (e.g. "Truespeech Magic", "Spiritualism Magic").
* **Ability names**: drop the check suffix ("/ 11(18) / Fortitude / Half") and "N Level / Magic Power X(Y)"; keep
  "= X" parts ("Regeneration = 5 points").
* **Declared abilities with a drawback**: optional `risk: { "text": "...", "modifiers": [...] }` (same as feats).
* **Undead weak point** "HP Recovery Damage +X" → `weakPoint.kind: "damage"`, `damageType: "hpRecovery"`.
  Healing spells with `effect.undeadDamage` deal their amount to undead as magic damage typed `hpRecovery`,
  so the weak point applies automatically once revealed.
* **Area targets**: optional `target` object on abilities (same shape as spells: text/kind/areaCount/radius/count).
* **Fixed-only values** (a heading printing only a fixed number): store `value = fixed - 7`.
* **Template monsters** (stats "※" taken from another creature, e.g. Revenant): stats `null`, printed offsets as
  `modifiers` on the ability that defines the template.
* Minor text normalization is fine (’ → ', capitalization of languages / movement modes).

### Monster conventions added during the CR II / CR III extraction
* **Headings naming several sections** ("●Right Side/Left Side", "●All Hands") → `section: "Right Side/Left Side"`
  (the combined text as printed).
* **Several main sections** ("Main Section: Head, Body (All)") → keep the text in `mainSection` and set
  `main: true` on every named section. `"(All)"` means the creature falls only when all of them are down.
  "Special" (chosen secretly) → no section flagged.
* **One icon with several immunities** ("◯Fire Immunity, Psychic Immunity") → one ability per immunity; the
  system reads immunities from ability names ending in "Immunity".
* **Headings with only a success value** ("Evocations / 15(22)") → `check: { "value": 15, "vs": null, "result": null }`.
* **Damage that cannot be rolled** (depends on current HP or remaining sections) → `damage: null`, formula
  explained in the description.
* **Multi-type weak point** → comma-separated `damageType` (`"fire,earth"`); `"silver"` matches silvered weapons.
* **"All Skill Checks"** → modifier key `allChecks` (CR I p.114).
* **Loot with a computed price** ("Remaining MP x 300G") → `price: null`, `priceText: "Remaining MP x 300G"`.
* **Golems** (Conjurer creations, CR II p.418 / CR III p.433) carry a `golem` object; the build turns it into a
  table in the description:
  ```json
  "golem": {
    "conjurerLevel": 3, "mp": 4,
    "materials": { "normal": { "name": "Enchanted Oak Branch", "price": 50 },
                   "advanced": { "name": "Strongly Enchanted Oak Branch", "price": 100 } },
    "enhancingSlots": 4, "enhancingGrade": "small",
    "enhancingItems": ["Cat's Eye Rivet", "…"],
    "enhancingItemDetails": [ { "name": "Cat's Eye Rivet", "price": 200, "requires": null, "section": null, "grants": "Double Attack" } ]
  }
  ```
  Only enhancing-item skills with golem-specific numbers become abilities (`prerequisite` = the item name).

## Mounts — `data/mounts.json`
```json
{
  "name": "Horse", "source": { "book": "CR3", "page": 254 },
  "classification": "animal",
  "price": { "buy": 5000, "rent": 250, "regen": null, "reputation": null },
  "levelMin": 1, "levelMax": 4,
  "intelligence": "Animal", "perception": "Five Senses", "languages": [],
  "weakPoint": { "text": "Physical Damage +2 pts.", "kind": "damage", "damageType": "physical", "value": 2 },
  "movement": { "text": "30 (4 Legs)/-", "ground": 30, "groundMode": "4 Legs", "air": null, "airMode": null },
  "sections": [ { "name": null, "main": false } ],
  "mainSection": null,
  "levels": [
    { "level": 1, "fortitude": 4, "willpower": 3,
      "sections": [ { "style": "Hoof", "accuracy": 3, "damage": "2d", "evasion": 2, "defense": 1, "hp": 22, "mp": 8 } ] }
  ],
  "abilities": [ "… same shape as monster abilities, plus prerequisite / enhance stunt names …" ],
  "description": "…"
}
```
* The mount's level equals the jockey's adventurer level, clamped to `levelMin`–`levelMax`; `levelMin` is also the
  minimum Rider level needed (CR III p.251).
* Mount abilities whose numbers come from the jockey ("Rider Level + Intelligence Modifier") use
  `check: { "value": null, "base": "riderInt", … }` and `damage: { "power": 10, "critical": 10, "bonus": "riderInt", … }`.
  `base`/`bonus` keys: `riderDex`, `riderAgi`, `riderStr`, `riderVit`, `riderInt`, `riderSpi`.
* `mp: null` in a level row (mount without MP) is stored as 0.
