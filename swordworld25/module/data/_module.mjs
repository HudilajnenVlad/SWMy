import CharacterModel from "./actor/character.mjs";
import MonsterModel from "./actor/monster.mjs";
import MountModel from "./actor/mount.mjs";
import PartyModel from "./actor/party.mjs";
import TrapModel from "./actor/trap.mjs";
import { ClassModel, FeatModel, RaceModel } from "./item/character-options.mjs";
import { ArmorModel, GearModel, WeaponModel } from "./item/equipment.mjs";
import {
  AbilityModel, EffectModel, EvocationModel, FinaleModel, SpellModel, SpellsongModel, StuntModel, TechniqueModel
} from "./item/magic.mjs";

export const actorModels = {
  character: CharacterModel,
  monster: MonsterModel,
  mount: MountModel,
  party: PartyModel,
  trap: TrapModel
};

export const itemModels = {
  race: RaceModel,
  class: ClassModel,
  weapon: WeaponModel,
  armor: ArmorModel,
  gear: GearModel,
  spell: SpellModel,
  feat: FeatModel,
  technique: TechniqueModel,
  spellsong: SpellsongModel,
  finale: FinaleModel,
  stunt: StuntModel,
  evocation: EvocationModel,
  ability: AbilityModel,
  effect: EffectModel
};
