import { t } from "../../../helpers/utils.mjs";
import {
  bookColumn, bookFacet, distinctOptions, entryDetail, esc, labelOf, levelColumn, levelFacet, nameColumn, optionsOf
} from "./common.mjs";

const SW25 = () => CONFIG.SW25;

/** Duration groups (Instant/X rounds counts as rounds). */
const durationGroup = unit => (unit === "instantRounds" ? "rounds" : (unit || "instant"));

/** Special properties of a spell. */
const FLAGS = {
  minor: "SW25.Browser.Flag.minorAction",
  prep: "SW25.Browser.Flag.combatPrep",
  power: "SW25.Browser.Flag.powerTable",
  versions: "SW25.Browser.Flag.versions",
  removes: "SW25.Browser.Flag.removes",
  automation: "SW25.Browser.Flag.automation",
  barbarous: "SW25.Spellbook.Barbarous"
};

/**
 * Can a character cast a spell (same rules as the spellbook)?
 * @param {Actor} actor
 * @param {object} r   Spell record
 * @returns {boolean}
 */
function castable(actor, r) {
  const casting = actor?.system.magic?.[r.magic];
  if ( !casting || (r.level > casting.level) ) return false;
  if ( (r.magic === "divine") && (r.subsystem === "special") ) {
    const deity = (actor.system.deity ?? "").toLowerCase();
    if ( !deity || !r.deity || !deity.includes(r.deity.toLowerCase()) ) return false;
  }
  if ( (r.magic === "divine") && r.flags.includes("barbarous") ) return false;
  if ( (r.magic === "fairy") && r.subsystem && (r.subsystem !== "basic") ) {
    if ( !(actor.system.fairyElements ?? []).includes(r.subsystem) ) return false;
  }
  return true;
}

export default {
  id: "spells",
  label: "SW25.Browser.Spells",
  icon: "fa-solid fa-wand-sparkles",
  documentName: "Item",
  packs: ["swordworld25.spells"],
  search: "SW25.Browser.SearchName",
  deep: "SW25.Browser.SearchText",
  defaultSort: { key: "level", dir: 1 },

  record(doc) {
    const s = doc.system;
    const eff = s.effect ?? {};
    const statuses = [...new Set([...(eff.statuses ?? []), ...(eff.variants ?? []).flatMap(v => v.statuses ?? [])])];
    const hasMods = (s.modifiers?.length > 0) || (eff.variants ?? []).some(v => v.modifiers?.length);
    const flags = [
      s.minorAction && "minor", s.combatPrep && "prep", Number.isInteger(eff.power) && "power",
      (eff.variants?.length > 0) && "versions", ((eff.removeStatuses?.length || eff.removeTypes?.length) > 0) && "removes",
      (hasMods || statuses.length > 0) && "automation", s.barbarous && "barbarous"
    ].filter(Boolean);
    const system = labelOf(SW25().magicSystems, s.magic);
    const sub = (s.magic === "divine") ? (s.subsystem === "special" ? (s.deity || labelOf(SW25().divineSubsystems, "special")) : "")
      : ((s.magic === "fairy") && s.subsystem && (s.subsystem !== "basic") ? labelOf(SW25().fairyElements, s.subsystem) : "");
    return {
      level: s.level ?? 0,
      magic: s.magic,
      subsystem: s.subsystem || "basic",
      deity: s.deity || "",
      cost: Number.isInteger(s.cost?.mp) ? s.cost.mp : null,
      costText: s.cost?.text || (Number.isInteger(s.cost?.mp) ? `MP${s.cost.mp}` : "—"),
      kind: eff.kind || "utility",
      power: Number.isInteger(eff.power) ? eff.power : null,
      types: s.types ?? [],
      resistance: s.resistance || "none",
      target: s.target?.kind || "other",
      duration: durationGroup(s.duration?.unit),
      durationText: s.duration?.text || "",
      statuses,
      flags,
      magisphere: s.magisphere || "",
      subtitle: [system, sub].filter(Boolean).join(" · "),
      searchText: [s.target?.text, s.rangeArea?.text, s.duration?.text, s.deity, (s.types ?? []).join(" ")].filter(Boolean).join(" ")
    };
  },

  facets: [
    { key: "castable", type: "toggle", label: "SW25.Browser.CastableBy", labelData: ref => ({ name: ref?.name ?? "" }),
      visible: ref => !!ref && Object.keys(ref.system.magic ?? {}).length > 0, test: (r, ref) => castable(ref, r) },
    { key: "magic", type: "chips", label: "SW25.Browser.MagicSystem", options: () => optionsOf(SW25().magicSystems), values: r => r.magic },
    levelFacet(15),
    { key: "divine", type: "chips", label: "SW25.Magic.divine", options: () => optionsOf(SW25().divineSubsystems),
      test: (r, v) => (r.magic === "divine") && (r.subsystem === v) },
    { key: "deity", type: "select", label: "SW25.Deity", options: records => distinctOptions(records.filter(r => r.deity), r => r.deity),
      values: r => r.deity },
    { key: "fairy", type: "chips", label: "SW25.Browser.FairyElement",
      options: () => [{ value: "basic", label: "SW25.Fairy.basic" }, ...optionsOf(SW25().fairyElements)],
      test: (r, v) => (r.magic === "fairy") && (r.subsystem === v) },
    { key: "magisphere", type: "chips", label: "SW25.Magisphere.label", options: () => optionsOf(SW25().magispheres), values: r => r.magisphere },
    { key: "kind", type: "chips", label: "SW25.EffectKind.label", options: () => optionsOf(SW25().effectKinds), values: r => r.kind },
    { key: "types", type: "chips", label: "SW25.Browser.Types", options: () => optionsOf(SW25().damageTypes), values: r => r.types, sortByLabel: true },
    { key: "statuses", type: "chips", label: "SW25.Spell.Statuses",
      options: records => distinctOptions(records, r => r.statuses, id => CONFIG.statusEffects.find(e => e.id === id)?.name ?? id),
      values: r => r.statuses, sortByLabel: true },
    { key: "resistance", type: "chips", label: "SW25.Resistance.label", options: () => optionsOf(SW25().resistance), values: r => r.resistance },
    { key: "target", type: "chips", label: "SW25.Target.label", options: () => optionsOf(SW25().targetKinds), values: r => r.target },
    { key: "duration", type: "chips", label: "SW25.Duration.label",
      options: () => optionsOf(SW25().durationUnits, ["instant", "rounds", "minutes", "hours", "days", "permanent", "special"]),
      values: r => r.duration },
    { key: "flags", type: "chips", mode: "all", label: "SW25.Browser.Properties", hint: "SW25.Bestiary.AllOfHint",
      options: () => Object.entries(FLAGS).map(([value, label]) => ({ value, label })), values: r => r.flags },
    bookFacet
  ],

  columns: [
    levelColumn,
    nameColumn,
    { key: "cost", label: "SW25.Entry.Cost", cls: "c cost", sort: r => r.cost, cell: r => ({ text: r.costText }) },
    { key: "effect", label: "SW25.EffectKind.label", cls: "c", sort: r => r.power,
      cell: r => ({ html: `${esc(labelOf(SW25().effectKinds, r.kind))}${Number.isInteger(r.power) ? ` <small>${t("SW25.Power")} ${r.power}</small>` : ""}` }) },
    { key: "resistance", label: "SW25.Resistance.label", cls: "c opt", sort: r => labelOf(SW25().resistance, r.resistance),
      cell: r => ({ text: labelOf(SW25().resistance, r.resistance) }) },
    { key: "duration", label: "SW25.Duration.label", cls: "c small opt", cell: r => ({ text: r.durationText }) },
    bookColumn
  ],

  detail: (record, doc) => entryDetail(doc)
};
