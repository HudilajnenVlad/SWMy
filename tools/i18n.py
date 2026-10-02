"""
Generate swordworld25/lang/en.json and ru.json from a single table.
Run: python tools/i18n.py
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
LANG = ROOT / "swordworld25" / "lang"

T = {}


def add(key, en, ru):
    T[key] = (en, ru)


def group(prefix, rows):
    for k, en, ru in rows:
        add(f"{prefix}.{k}" if prefix else k, en, ru)


# --- Document types -----------------------------------------------------------
group("TYPES.Actor", [
    ("character", "Character", "Персонаж"),
    ("monster", "Monster", "Монстр"),
    ("mount", "Mount", "Скакун"),
    ("party", "Party", "Отряд"),
])
group("TYPES.Item", [
    ("race", "Race", "Раса"), ("class", "Class", "Класс"), ("weapon", "Weapon", "Оружие"),
    ("armor", "Armor / Shield", "Броня / щит"), ("gear", "Item", "Предмет"), ("spell", "Spell", "Заклинание"),
    ("feat", "Combat Feat", "Боевое умение"), ("technique", "Technique", "Техника"),
    ("spellsong", "Spellsong", "Песнь силы"), ("finale", "Finale", "Финал"), ("stunt", "Stunt", "Трюк"),
    ("evocation", "Evocation", "Эвокация"), ("ability", "Unique Skill", "Особое умение"),
    ("effect", "Effect", "Эффект"),
])

# --- Abilities ----------------------------------------------------------------
group("SW25.Base", [
    ("skill", "Skill", "Техника"), ("body", "Body", "Тело"), ("mind", "Mind", "Разум"), ("short", "Base", "База"),
])
group("SW25.Ability", [
    ("dex", "Dexterity", "Ловкость"), ("agi", "Agility", "Проворство"), ("str", "Strength", "Сила"),
    ("vit", "Vitality", "Живучесть"), ("int", "Intelligence", "Интеллект"), ("spi", "Spirit", "Дух"),
    ("label", "Ability", "Характеристика"), ("rolled", "Dice", "Кубы"), ("growth", "Growth", "Рост"),
    ("other", "Other", "Прочее"), ("score", "Score", "Значение"), ("mod", "Mod", "Мод."),
    ("BaseHint", "Base score (Skill / Body / Mind) from the background", "Базовое значение (Техника / Тело / Разум) из предыстории"),
    ("RolledHint", "Result of the A–F dice rolled at creation", "Результат бросков A–F при создании"),
    ("GrowthHint", "Growth from sessions (2d growth rolls)", "Рост после сессий (броски роста 2d)"),
    ("OtherHint", "Other permanent adjustments", "Прочие постоянные поправки"),
])
group("SW25.AbilityAbbr", [
    ("dex", "DEX", "ЛОВ"), ("agi", "AGI", "ПРВ"), ("str", "STR", "СИЛ"), ("vit", "VIT", "ЖИВ"),
    ("int", "INT", "ИНТ"), ("spi", "SPI", "ДУХ"),
])
add("SW25.Abilities", "Abilities", "Характеристики")

# --- Classes ------------------------------------------------------------------
group("SW25.Class", [
    ("fighter", "Fighter", "Воин"), ("grappler", "Grappler", "Борец"), ("fencer", "Fencer", "Фехтовальщик"),
    ("marksman", "Marksman", "Стрелок"), ("sorcerer", "Sorcerer", "Чародей"), ("conjurer", "Conjurer", "Заклинатель"),
    ("priest", "Priest", "Жрец"), ("artificer", "Artificer", "Магитехник"), ("fairytamer", "Fairy Tamer", "Укротитель фей"),
    ("scout", "Scout", "Разведчик"), ("ranger", "Ranger", "Следопыт"), ("sage", "Sage", "Мудрец"),
    ("enhancer", "Enhancer", "Энхансер"), ("bard", "Bard", "Бард"), ("rider", "Rider", "Наездник"),
    ("alchemist", "Alchemist", "Алхимик"),
    ("AbilityType", "Learned ability type", "Тип изучаемых способностей"),
    ("AutoFeats", "Automatic feats", "Автоматические умения"),
    ("Category", "Category", "Категория"), ("Track", "Growth", "Рост"),
    ("CriticalMod", "Critical modifier", "Модификатор крита"),
    ("DropHint", "Drop a class from the compendium to learn it (spends experience; Shift-drop is free).",
     "Перетащите класс из компендиума, чтобы изучить его (тратит опыт; с Shift — бесплатно)."),
    ("Evasion", "Can evade", "Уклонение"), ("ExpTable", "Experience per level", "Опыт на уровень"),
    ("HalfStrength", "Half Strength (Fencer)", "Половина Силы (фехтовальщик)"),
    ("LevelDown", "Lower level (refund)", "Понизить уровень (возврат опыта)"),
    ("LevelUpHint", "Raise level (spends experience; Shift: free)", "Повысить уровень (тратит опыт; Shift — бесплатно)"),
    ("LeveledUp", "{name} is now level {level}", "{name}: теперь уровень {level}"),
    ("Magic", "Magic system", "Система магии"), ("Max", "Max level", "Макс. уровень"),
    ("Melee", "Melee attacks", "Ближние атаки"), ("Thrown", "Thrown attacks", "Метательные атаки"),
    ("Shooting", "Shooting attacks", "Стрельба"), ("WrestlingOnly", "Wrestling only", "Только борьба"),
    ("NextCost", "Next: {cost} EXP", "След.: {cost} оп."), ("None", "No classes yet", "Классов пока нет"),
])
group("SW25.ClassCategory", [("warrior", "Warrior", "Воинский"), ("wizard", "Wizard", "Магический"), ("other", "Other", "Прочий")])
group("SW25.ClassTrack", [("major", "Major", "Основной"), ("minor", "Minor", "Второстепенный")])
add("SW25.Classes", "Classes", "Классы")

# --- Checks -------------------------------------------------------------------
checks = [
    ("conceal", "Conceal", "Сокрытие"), ("firstAid", "First Aid", "Первая помощь"),
    ("disableDevice", "Disable Device", "Взлом/обезвреживание"), ("pickpocket", "Pickpocket", "Карманная кража"),
    ("disguise", "Disguise", "Маскировка"), ("setTrap", "Set Trap", "Установка ловушек"),
    ("tumble", "Tumble", "Группировка"), ("hide", "Hide", "Скрытность"), ("acrobatics", "Acrobatics", "Акробатика"),
    ("climb", "Climb", "Лазание"), ("follow", "Follow", "Слежка"), ("jump", "Jump", "Прыжок"), ("swim", "Swim", "Плавание"),
    ("riding", "Riding", "Верховая езда"), ("climbStr", "Climb (Adventurer)", "Лазание (авантюрист)"),
    ("strength", "Strength", "Проверка силы"),
    ("track", "Track", "Выслеживание"), ("notice", "Notice", "Замечание"), ("listen", "Listen", "Слух"),
    ("dangerSense", "Danger Sense", "Чувство опасности"), ("search", "Search", "Поиск"),
    ("spotTrap", "Spot Trap", "Обнаружение ловушек"), ("meteorology", "Meteorology", "Метеорология"),
    ("insight", "Insight", "Проницательность"), ("literature", "Literature", "Литература"),
    ("engineering", "Engineering", "Инженерия"), ("cartography", "Cartography", "Картография"),
    ("pathology", "Pathology", "Патология"), ("herbology", "Herbology", "Травничество"),
    ("appraise", "Appraise", "Оценка"), ("monsterKnowledge", "Monster Knowledge", "Знание монстров"),
    ("weakness", "Weakness", "Слабое место скакуна"), ("detect", "Detect", "Распознание"),
    ("investigation", "Investigation", "Расследование"), ("evocation", "Evocation", "Эвокация"),
    ("initiative", "Initiative", "Инициатива"), ("performance", "Performance", "Исполнение"),
    ("willpower", "Willpower", "Сила воли"), ("fortitude", "Fortitude", "Стойкость"), ("death", "Death Check", "Проверка смерти"),
    ("accuracy", "Accuracy", "Точность"), ("evasion", "Evasion", "Уклонение"), ("spellcasting", "Spellcasting", "Колдовство"),
    ("label", "Check", "Проверка"), ("other", "Other", "Другое"),
]
group("SW25.Check", checks)
add("SW25.Checks.Hint", "Click a check to roll it (Shift-click skips the dialog). Greyed checks are straight rolls (2d only).",
    "Нажмите на проверку, чтобы бросить (Shift — без диалога). Серые — «прямые» броски (только 2d).")
group("SW25.Package", [
    ("technique", "Technique", "Техника"), ("movement", "Movement", "Движение"),
    ("observation", "Observation", "Наблюдение"), ("knowledge", "Knowledge", "Знание"),
])
add("SW25.Packages", "Check Packages", "Пакеты проверок")
add("SW25.StraightRoll", "Straight roll", "Прямой бросок")
group("SW25.Window", [("Collapse", "Collapse to the title bar", "Свернуть в полоску"), ("Expand", "Expand", "Развернуть")])

# --- Magic --------------------------------------------------------------------
group("SW25.Magic", [
    ("truespeech", "Truespeech Magic", "Истинная речь"), ("spiritualism", "Spiritualism Magic", "Спиритуализм"),
    ("divine", "Divine Magic", "Божественная магия"), ("magitech", "Magitech", "Магитех"),
    ("fairy", "Fairy Magic", "Магия фей"), ("Item", "Magic item", "Магический предмет"),
    ("NoCaster", "This character has no Wizard-type class.", "У персонажа нет магического класса."),
    ("Subsystem", "Sub-system", "Подсистема"), ("System", "Magic system", "Система магии"),
])
group("SW25.Divine", [("basic", "Basic", "Базовая"), ("special", "Specialized", "Особая (бог)")])
group("SW25.Fairy", [
    ("earth", "Earth", "Земля"), ("water", "Water/Ice", "Вода/лёд"), ("fire", "Fire", "Огонь"),
    ("wind", "Wind", "Ветер"), ("light", "Light", "Свет"), ("dark", "Darkness", "Тьма"), ("basic", "Basic", "Базовая"),
    ("Elements", "Contracted fairy types (4)", "Выбранные стихии фей (4)"),
])
group("SW25.Magisphere", [("small", "Small", "Малая"), ("medium", "Medium", "Средняя"), ("large", "Large", "Большая"), ("label", "Magisphere", "Магисфера")])
add("SW25.MagicPower", "Magic Power", "Сила магии")
add("SW25.BardicPower", "Bardic Power", "Сила барда")
add("SW25.AlchemyPower", "Alchemy Power", "Сила алхимии")
add("SW25.ArmorPenalty", "Armor penalty", "Штраф брони")
add("SW25.Deity", "Deity", "Божество")

group("SW25.Resistance", [
    ("cant", "Can't", "Нельзя"), ("optional", "Optional", "По желанию"), ("none", "N/A", "Нет"),
    ("neg", "Negate", "Отменяет"), ("half", "Half", "Половина"), ("temporary", "Temporary", "Временно"),
    ("special", "Special", "Особое"), ("label", "Resistance", "Сопротивление"),
])
group("SW25.Target", [
    ("caster", "Caster", "Заклинатель"), ("character", "1 Character", "1 персонаж"),
    ("entireCharacter", "1 Entire Character", "1 персонаж целиком"), ("characterX", "1 Character X", "1 персонаж X"),
    ("object", "Object", "Объект"), ("point", "Any Point", "Любая точка"), ("touch", "Touch", "Касание"),
    ("area", "Area", "Область"), ("spell", "Spell", "Заклинание"), ("bullet", "Bullet", "Пуля"),
    ("bullets3", "3 Bullets", "3 пули"), ("label", "Target", "Цель"), ("kind", "Target type", "Тип цели"),
])
group("SW25.Range", [("caster", "Caster", "Заклинатель"), ("touch", "Touch", "Касание"), ("ranged", "Ranged", "Дистанция"), ("label", "Range", "Дальность")])
group("SW25.Area", [
    ("none", "—", "—"), ("shot", "Shot", "Выстрел"), ("target", "Target", "Цель"), ("line", "Line", "Линия"),
    ("breakthrough", "Breakthrough", "Прорыв"), ("label", "Area", "Область"),
])
add("SW25.RangeArea", "Range/Area", "Дальность/область")
add("SW25.Targeting", "Target, range and duration", "Цель, дальность и длительность")
group("SW25.Duration", [
    ("instant", "Instant", "Мгновенно"), ("rounds", "Rounds", "Раунды"), ("instantRounds", "Instant/rounds", "Мгновенно/раунды"),
    ("minutes", "Minutes", "Минуты"), ("hours", "Hours", "Часы"), ("days", "Days", "Дни"), ("permanent", "Permanent", "Постоянно"),
    ("special", "Special", "Особая"), ("label", "Duration", "Длительность"), ("unit", "Duration unit", "Единица длительности"),
    ("value", "Duration value", "Значение длительности"),
])
group("SW25.EffectKind", [
    ("damage", "Damage", "Урон"), ("heal", "Healing", "Лечение"), ("mpHeal", "MP recovery", "Восстановление MP"),
    ("buff", "Buff", "Усиление"), ("debuff", "Debuff", "Ослабление"), ("utility", "Utility", "Полезное"),
    ("summon", "Summon", "Призыв"), ("bullet", "Bullet", "Пуля"), ("label", "Effect", "Эффект"),
])
group("SW25.Spell", [
    ("AddMagicPower", "Add Magic Power", "Добавлять силу магии"), ("CastAsMajor", "Cast as Major Action (roll)", "Как основное действие (с броском)"),
    ("CostText", "Cost text", "Стоимость (текст)"), ("Fixed", "Fixed amount", "Фикс. значение"), ("Level", "Level", "Уровень"),
    ("MPMultiplier", "MP multiplier (targets, metamagic)", "Множитель MP (цели, метамагия)"),
    ("ExtraMP", "Extra MP paid (transferred)", "Доп. MP (передаётся)"), ("Statuses", "Conditions", "Состояния"),
    ("StatusesHint", "Conditions put on the targets that fail to resist (on the caster for Target: Caster), for the spell's duration.",
     "Состояния, накладываемые на не устоявшие цели (на заклинателя при цели «Заклинатель») на время действия."),
    ("Formula", "Amount formula", "Формула величины"),
    ("FormulaHint", "Amount without the power table: a number, or a formula with @magicPower, @level, @extraMp (extra MP paid).",
     "Величина без таблицы силы: число или формула с @magicPower, @level, @extraMp (доп. MP)."),
    ("MakoPoints", "Points from the mako stone", "Очки из камня маны"), ("MakoStone", "Mako stone", "Камень маны"),
    ("Minor", "Minor Action (⏩)", "Малое действие (⏩)"), ("Prep", "Combat Preparation (△)", "Подготовка к бою (△)"),
    ("Version", "Version", "Вариант"), ("BaseVersion", "Base", "Основной"),
])

# --- Damage -------------------------------------------------------------------
group("SW25.DamageKind", [("physical", "Physical", "Физический"), ("magic", "Magic", "Магический"), ("fixed", "Fixed", "Фиксированный"), ("label", "Damage kind", "Вид урона")])
group("SW25.DamageType", [
    ("earth", "Earth", "Земля"), ("water", "Water/Ice", "Вода/лёд"), ("fire", "Fire", "Огонь"), ("wind", "Wind", "Ветер"),
    ("lightning", "Lightning", "Молния"), ("energy", "Energy", "Энергия"), ("slashing", "Slashing", "Режущий"),
    ("bludgeoning", "Bludgeoning", "Дробящий"), ("poison", "Poison", "Яд"), ("disease", "Disease", "Болезнь"),
    ("psychic", "Psychic", "Психический"), ("psychicWeak", "Psychic (Weak)", "Психический (слабый)"), ("curse", "Curse", "Проклятие"),
    ("silver", "Silver", "Серебро"), ("hpRecovery", "HP recovery", "Восстановление HP"),
])
group("SW25.Damage", [
    ("Calculated", "Calculated", "Расчётный"), ("Immune", "Immune", "Иммунитет"), ("label", "Damage", "Урон"),
])
add("SW25.Power", "Power", "Сила")
add("SW25.CritValue", "Critical Value", "Порог крита")
add("SW25.CritShort", "Crit", "Крит")
add("SW25.Critical", "Critical!", "Крит!")
add("SW25.ExtraDamage", "Extra Damage", "Доп. урон")
add("SW25.ExtraDamageShort", "+Dmg", "+Урон")
add("SW25.DamageShort", "Dmg", "Урон")
add("SW25.AccuracyShort", "Acc.", "Точн.")
add("SW25.Accuracy", "Accuracy", "Точность")
add("SW25.Evasion", "Evasion", "Уклонение")
add("SW25.EvasionClass", "Evasion class", "Класс уклонения")
add("SW25.Defense", "Defense", "Защита")
add("SW25.DefenseShort", "Def.", "Защ.")
add("SW25.Movement", "Movement (limited / normal / full)", "Движение (огр. / обычное / полное)")
add("SW25.Resistances", "Resistances & combat values", "Сопротивления и боевые значения")
add("SW25.StrPenalty", "STR penalty", "Штраф СИЛ")
add("SW25.Attack", "Attack", "Атака")
add("SW25.AttackClass", "Attack class", "Класс атаки")

# --- Equipment ----------------------------------------------------------------
group("SW25.WeaponCategory", [
    ("sword", "Sword", "Меч"), ("axe", "Axe", "Топор"), ("spear", "Spear", "Копьё"), ("mace", "Mace", "Булава"),
    ("staff", "Staff", "Посох"), ("flail", "Flail", "Кистень"), ("warhammer", "Warhammer", "Боевой молот"),
    ("wrestling", "Wrestling", "Борьба"), ("throw", "Thrown", "Метательное"), ("bow", "Bow", "Лук"),
    ("crossbow", "Crossbow", "Арбалет"), ("blowgun", "Blowgun", "Духовая трубка"), ("gun", "Gun", "Огнестрел"),
])
group("SW25.ArmorType", [("nonmetal", "Non-metallic armor", "Неметаллическая броня"), ("metal", "Metal armor", "Металлическая броня"), ("shield", "Shield", "Щит"), ("label", "Armor type", "Тип брони")])
group("SW25.Grappler", [("may", "Grapplers may equip", "Борцы могут носить"), ("only", "Grappler only", "Только для борцов"), ("label", "Grapplers", "Борцы")])
group("SW25.Slot", [
    ("head", "Head", "Голова"), ("face", "Face", "Лицо"), ("ear", "Ear", "Уши"), ("neck", "Neck", "Шея"), ("back", "Back", "Спина"),
    ("rightHand", "Right hand", "Правая рука"), ("leftHand", "Left hand", "Левая рука"), ("hand", "Hand", "Рука"),
    ("waist", "Waist", "Пояс"), ("feet", "Feet", "Ноги"), ("other", "Other", "Прочее"), ("any", "Any", "Любой"),
    ("label", "Accessory slots", "Слоты аксессуаров"),
])
group("SW25.GearType", [
    ("accessory", "Accessories", "Аксессуары"), ("classItem", "Class-specific items", "Классовые предметы"),
    ("herb", "Herbs", "Травы"), ("potion", "Potions", "Зелья"), ("ammo", "Ammunition", "Боеприпасы"),
    ("tool", "Adventure tools", "Инструменты приключенца"), ("gear", "General equipment", "Общее снаряжение"),
    ("improvement", "Improvements", "Улучшения"), ("golemItem", "Golem enhancing items", "Усилители големов"),
    ("mountItem", "Mount equipment", "Снаряжение скакуна"), ("card", "Material cards", "Карты материалов"),
    ("loot", "Loot", "Добыча"), ("label", "Item type", "Тип предмета"),
])
group("SW25.UseKind", [("none", "—", "—"), ("healHP", "Heal HP", "Лечение HP"), ("healMP", "Restore MP", "Восстановление MP"), ("damage", "Damage", "Урон"), ("effect", "Effect", "Эффект"), ("label", "Use", "Применение")])
group("SW25.UseBonus", [
    ("rangerDex", "+ Ranger level + DEX mod (herbs)", "+ ур. следопыта + мод. ЛОВ (травы)"),
    ("rangerInt", "+ Ranger level + INT mod (potions)", "+ ур. следопыта + мод. ИНТ (зелья)"),
    ("riderDex", "+ Rider level + DEX mod", "+ ур. наездника + мод. ЛОВ"), ("label", "Class bonus", "Бонус класса"),
])
group("SW25.Weapon", [
    ("AttackClass", "Attack with class", "Атаковать классом"), ("Blunt", "Blunt", "Дробящее"), ("Edged", "Edged", "Режущее"),
    ("CurrentCategory", "Use as", "Использовать как"), ("DefenseBonus", "Defense bonus", "Бонус защиты"),
    ("GrapplerOnly", "Grappler only", "Только для борцов"), ("Implement", "Magical implement", "Магический инструмент"),
    ("Modes", "Usage modes", "Режимы использования"), ("None", "No weapons", "Оружия нет"), ("Silver", "Silvered", "Посеребрённое"),
])
group("SW25.Gun", [("Bullet", "Bullet spell", "Заклинание пули"), ("ByBullet", "by bullet", "по пуле"), ("Magazine", "Loaded / magazine", "Заряжено / магазин")])
group("SW25.Gear", [
    ("ClassReq", "Requires class", "Требует класс"), ("Consumable", "Consumable", "Расходуемый"), ("Extra", "Extra", "Доп. значение"),
    ("Mako", "Mako stone MP", "MP камня маны"), ("Popularity", "Popularity (Appraise TN)", "Известность (СЛ оценки)"),
    ("UseEffect", "Use effect", "Эффект применения"), ("Uses", "Uses", "Заряды"),
])
add("SW25.Weapons", "Weapons", "Оружие")
add("SW25.WeaponsAndArmor", "Weapons & armor", "Оружие и броня")
add("SW25.ArmorAndShields", "Armor & shields", "Броня и щиты")
add("SW25.Accessories", "Accessories", "Аксессуары")
add("SW25.Category", "Category", "Категория")
add("SW25.Rank", "Rank", "Ранг")
add("SW25.Stance", "Stance", "Хват")
add("SW25.MinStr", "Min STR", "Мин. СИЛ")
add("SW25.Mode", "Mode", "Режим")
add("SW25.Price", "Price", "Цена")
add("SW25.PriceText", "Price (text)", "Цена (текст)")
add("SW25.Quantity", "Quantity", "Количество")
add("SW25.Equip", "Equip / unequip", "Надеть / снять")
add("SW25.Equipped", "Equipped", "Экипировано")
add("SW25.Items", "Items", "Предметы")
add("SW25.Money", "Money (Gamels)", "Деньги (гамели)")
add("SW25.Debt", "Debt", "Долг")

# --- Feats & learned ----------------------------------------------------------
group("SW25.FeatType", [("passive", "Passive", "Пассивное"), ("active", "Declared (active)", "Объявляемое (активное)"), ("major", "Major Action", "Основное действие")])
group("SW25.Feat", [
    ("Acquisition", "Acquisition", "Получение"), ("Application", "Application", "Применение"), ("AutoGain", "Gained at", "Получается на"),
    ("Automatic", "Automatically acquired", "Автоматические"), ("Selective", "Selectively acquired", "Выбираемые"),
    ("Choice", "Choice", "Выбор"), ("Declarable", "Declarable feats", "Объявляемые умения"),
    ("DeclareHint", "Declared feats are selected in the attack / spell dialog; their risk is applied automatically.",
     "Объявляемые умения выбираются в диалоге атаки/заклинания; их риск применяется автоматически."),
    ("Prerequisites", "Prerequisites", "Требования"), ("Risk", "Risk", "Риск"), ("RiskModifiers", "Risk modifiers", "Модификаторы риска"),
    ("Type", "Feat type", "Тип умения"), ("Use", "Use", "Использование"),
])
add("SW25.Feats", "Combat Feats", "Боевые умения")
add("SW25.Prereq.advLevel", "Adventurer level {level}+", "Уровень авантюриста {level}+")
group("SW25.Technique", [("OncePerRound", "Once per round", "Раз в раунд")])
group("SW25.Song", [
    ("BaseRhythm", "Base rhythm", "Базовый ритм"), ("Condition", "Effect condition", "Условие эффекта"),
    ("ExtraRhythm", "Extra rhythm", "Доп. ритм"), ("Flourish", "Flourish value", "Порог блеска"),
    ("RhythmGained", "Rhythm gained", "Получен ритм"), ("Singing", "Singing required", "Требуется пение"),
])
group("SW25.Finale", [("Targets", "Targets", "Цели")])
group("SW25.Stunt", [
    ("Action", "Action", "Действие"), ("Area", "Mount part", "Часть скакуна"), ("AreaAll", "All", "Весь"),
    ("AreaMain", "Main", "Основная часть"), ("AreaNone", "None (rider)", "Нет (наездник)"), ("Mounts", "Compatible mounts", "Подходящие скакуны"),
])
group("SW25.Rhythm", [("up", "Uplifting", "Воодушевляющий"), ("down", "Calming", "Успокаивающий"), ("heart", "Enchanting", "Очаровывающий"), ("label", "Rhythm", "Ритм")])
group("SW25.Card", [
    ("red", "Red", "Красные"), ("green", "Green", "Зелёные"), ("black", "Black", "Чёрные"), ("white", "White", "Белые"), ("gold", "Gold", "Золотые"),
    ("Rank", "Card rank", "Ранг карты"), ("Count", "Cards per use", "Карт за использование"), ("Cards", "Cards", "Карты"),
    ("MaterialCards", "Material cards", "Карты материалов"), ("NotEnough", "not enough", "недостаточно"),
    ("Hint", "Shift-click changes by 5.", "Shift — изменить на 5."),
    ("Against", "vs.", "против"), ("Applied", "Applied", "Применено"), ("Apply", "Apply damage", "Нанести урон"),
    ("ApplyAsHeal", "Apply as healing", "Применить как лечение"), ("ApplyDouble", "Apply double", "Двойной урон"),
    ("ApplyEffect", "Apply effect", "Наложить эффект"), ("ApplyEffectAll", "Apply effect to affected targets", "Наложить эффект на поражённые цели"),
    ("ApplyEffectTargets", "Apply effect to the targeted tokens (T)", "Наложить эффект на цели (T)"),
    ("ApplyHalf", "Apply half", "Половина урона"), ("ApplyHeal", "Apply healing", "Вылечить"),
    ("Damage", "Damage", "Урон"), ("EffectApplied", "{name} applied to {count} target(s)", "{name}: наложено на целей: {count}"),
    ("EffectsRemoved", "Ended: {list}", "Сняты эффекты: {list}"), ("NothingToRemove", "No matching effect to end.", "Подходящих эффектов нет."),
    ("ForceHit", "Force hit / affected", "Засчитать попадание"), ("ForceMiss", "Force miss / resisted", "Засчитать промах"),
    ("Fumble", "Double 1s: no damage (+50 EXP)", "Две единицы: урона нет (+50 оп.)"),
    ("Healing", "Healing", "Лечение"), ("MPHealing", "MP recovery", "Восстановление MP"),
    ("MonsterAttack", "Monster attack", "Атака монстра"), ("NoRoll", "no roll (success value 0)", "без броска (успех 0)"),
    ("NoValidTargets", "No valid targets (all missed or resisted).", "Нет подходящих целей (все уклонились или сопротивились)."),
    ("Override", "GM", "ГМ"), ("OverrideHint", "Outcome set by the GM", "Исход задан ГМом"),
    ("RollDamage", "Roll damage", "Бросить урон"), ("RollHeal", "Roll healing", "Бросить лечение"), ("RollMPHeal", "Roll MP recovery", "Бросить восстановление MP"),
    ("Selected", "Selected tokens", "Выбранные токены"), ("Targeted", "Targets (T)", "Цели (T)"), ("AddTargets", "Add targets", "Добавить цели"),
    ("AddTargetsHint", "Add the tokens targeted now (T): the targets already on the card keep their results", "Добавить цели, выбранные сейчас (T): у уже стоящих в карточке результаты сохранятся"),
    ("TargetsAdded", "Targets added: {count}", "Добавлено целей: {count}"), ("TargetsAlreadyIn", "The targeted tokens are already on the card.", "Выбранные цели уже есть в карточке."),
    ("DamageAlreadyRolled", "Damage is already rolled for every target on the card; add new targets first.", "Урон уже брошен по всем целям карточки; сначала добавьте новые цели."),
    ("EffectAlreadyOn", "The effect is already on every affected target of the card.", "Эффект уже наложен на все поражённые цели карточки."),
    ("EffectOn", "Effect applied", "Эффект наложен"), ("ToggleDescription", "Show description", "Показать описание"),
    ("WeaponAttack", "Weapon attack", "Атака оружием"),
])
group("SW25.Evocation", [("Major", "Major Action (roll, several targets)", "Основное действие (бросок, неск. целей)"), ("TargetCount", "Targets", "Целей")])

# --- Monsters -----------------------------------------------------------------
group("SW25.MonsterType", [
    ("barbarous", "Barbarous", "Варвары"), ("animal", "Animal", "Животное"), ("plant", "Plant", "Растение"),
    ("undead", "Undead", "Нежить"), ("construct", "Construct", "Конструкт"), ("magitech", "Magitech", "Магитех"),
    ("mythicalBeast", "Mythical Beast", "Мифический зверь"), ("fairy", "Fairy", "Фея"), ("daemon", "Daemon", "Демон"),
    ("humanoid", "Humanoid", "Гуманоид"), ("golem", "Golem", "Голем"), ("familiar", "Familiar", "Фамильяр"),
])
group("SW25.Monster", [
    ("BaseMax", "Base maximum (without sword shards)", "Базовый максимум (без осколков)"),
    ("Disposition", "Disposition", "Отношение"), ("ExpHint", "Experience for defeating it (level × sections × 10)", "Опыт за победу (уровень × секции × 10)"),
    ("FixedAlways", "Always fixed values", "Всегда фикс. значения"), ("FixedDefault", "Use world setting", "Как в настройках мира"),
    ("FixedValues", "Fixed values", "Фиксированные значения"), ("RollAlways", "Always roll", "Всегда бросать"),
    ("FullHeal", "Restore all sections", "Восстановить все секции"), ("Habitat", "Habitat", "Обитание"),
    ("Identified", "Identified (Monster Knowledge success)", "Опознан (успех знания монстров)"),
    ("Intelligence", "Intelligence", "Интеллект"), ("Level", "Monster level", "Уровень монстра"),
    ("MaxHint", "Maximum (including sword shards)", "Максимум (с осколками мечей)"), ("NoSkills", "No unique skills", "Нет особых умений"),
    ("Perception", "Perception", "Восприятие"), ("RepWeak", "Rep/Weak", "Изв./Слаб."),
    ("RepWeakHint", "Monster Knowledge target numbers: reputation / weak point", "СЛ знания монстров: известность / слабое место"),
    ("Reputation", "Reputation (TN)", "Известность (СЛ)"), ("Weakness", "Weak point (TN)", "Слабое место (СЛ)"),
    ("ShardHint", "Sword shards: +5 HP and +1 MP each, bonus to resistances", "Осколки мечей: +5 HP и +1 MP каждый, бонус к сопротивлениям"),
    ("Style", "Fighting style", "Способ атаки"), ("Unidentified", "This creature has not been identified yet.", "Существо ещё не опознано."),
    ("UniqueSkills", "Unique skills", "Особые умения"), ("WeakPointRevealed", "Weak point revealed", "Слабое место раскрыто"),
])
group("SW25.WeakPoint", [
    ("accuracy", "Accuracy +1", "Точность +1"), ("damage", "Extra damage", "Доп. урон"), ("label", "Weak point", "Слабое место"),
    ("TypeHint", "physical / magic / fire ...", "physical / magic / fire ..."),
])
group("SW25.AbilityTag", [
    ("passive", "Always active", "Всегда активно"), ("major", "Major Action", "Основное действие"), ("minor", "Minor Action", "Малое действие"),
    ("prep", "Combat Preparation", "Подготовка к бою"), ("declared", "Declared", "Объявляемое"),
])
group("SW25.AbilityItem", [("CheckValue", "Check value (standard)", "Значение проверки (стандарт)"), ("Prerequisite", "Required stunt", "Требуемый трюк"), ("Vs", "Resisted with", "Сопротивление через")])
group("SW25.Disposition", [("friendly", "Friendly", "Дружелюбный"), ("neutral", "Neutral", "Нейтральный"), ("hostile", "Hostile", "Враждебный"), ("hungry", "Hungry", "Голодный"), ("instructed", "Instructed", "По приказу")])
group("SW25.Intelligence", [("none", "None", "Нет"), ("animal", "Animal", "Животный"), ("low", "Low", "Низкий"), ("average", "Average", "Средний"), ("high", "High", "Высокий"), ("servant", "Servant", "Слуга")])
add("SW25.Section.label", "Section", "Секция")
add("SW25.Sections", "Sections", "Секции")
add("SW25.MainSection", "Main section", "Основная секция")
group("SW25.Section", [
    ("Choose", "Choose a section", "Выберите секцию"), ("ChooseHint", "Which section of {name}?", "Какая секция {name}?"),
    ("ChooseTarget", "Target section of {name}", "Целевая секция: {name}"),
])
group("SW25.Mount", [
    ("AutoLevel", "Level from jockey", "Уровень по жокею"), ("DropJockey", "Drop a character here", "Перетащите персонажа сюда"),
    ("Jockey", "Jockey", "Жокей"), ("LevelTable", "Stats by level", "Показатели по уровням"), ("Price", "Price (buy / rent)", "Цена (покупка / аренда)"),
    ("Proprietary", "Owned (+10 HP)", "Собственный (+10 HP)"), ("Range", "Appropriate level", "Подходящий уровень"), ("Title", "Mount", "Скакун"),
    ("Unqualified", "Needs Rider level {level}+", "Нужен уровень Наездника {level}+"),
])
group("SW25.Loot", [
    ("Always", "Always", "Всегда"), ("Cards", "Alchemist cards", "Карты алхимика"),
    ("Hint", "Roll ranges like 2-7, 8+ or Always. The roll uses the looter's bonuses (select their token).",
     "Диапазоны вида 2-7, 8+ или Always. Бонусы берутся у выбранного токена персонажа."),
    ("Item", "Item", "Предмет"), ("None", "This creature has no loot table.", "У существа нет таблицы добычи."),
    ("Nothing", "Nothing", "Ничего"), ("Price", "Price", "Цена"), ("Quantity", "Qty", "Кол-во"),
    ("Roll", "Roll loot", "Бросить добычу"), ("RollColumn", "2d", "2d"), ("Title", "Loot: {name}", "Добыча: {name}"), ("label", "Loot", "Добыча"),
])
add("SW25.SwordShards", "Sword shards", "Осколки мечей")
add("SW25.AbyssShards", "Abyss shards", "Осколки Бездны")
add("SW25.Soulscars", "Soulscars", "Шрамы души")

# --- Character ----------------------------------------------------------------
add("SW25.AdventurerLevel", "Adventurer level", "Уровень авантюриста")
add("SW25.AdventurerLevelShort", "Adv. Lv", "Ур. ав.")
add("SW25.Level", "Level", "Уровень")
add("SW25.HP", "HP", "HP")
add("SW25.MP", "MP", "MP")
group("SW25.Exp", [
    ("label", "EXP", "Опыт"), ("total", "Total EXP earned", "Всего получено опыта"), ("Unspent", "Unspent experience", "Нерастраченный опыт"),
    ("Award", "Award experience", "Выдать опыт"), ("Amount", "Amount", "Количество"),
])
group("SW25.Reputation", [("label", "Reputation & rewards", "Репутация и награды"), ("current", "Reputation", "Репутация"), ("total", "Total reputation", "Общая репутация")])
add("SW25.Disgrace", "Disgrace", "Позор")
add("SW25.Background", "Background", "Предыстория")
add("SW25.Languages", "Languages", "Языки")
add("SW25.Language", "Language", "Язык")
add("SW25.Speak", "Speak", "Речь")
add("SW25.Write", "Write", "Письмо")
group("SW25.Race", [
    ("AbilityDice", "Ability dice (A–F)", "Кубы характеристик (A–F)"), ("Backgrounds", "Backgrounds", "Предыстории"),
    ("ChangeFateUsed", "Sword's Grace / Change Fate used today", "Милость меча / Смена судьбы использована сегодня"),
    ("Darkvision", "Darkvision", "Тёмное зрение"), ("NoMP", "No MP (Mana Interference)", "Нет MP (помехи маны)"),
    ("None", "No race — drop one from the compendium", "Расы нет — перетащите из компендиума"),
    ("Set", "Race set to {name}", "Раса: {name}"), ("TraitLevel", "Adventurer level required", "Требуемый уровень авантюриста"),
    ("Traits", "Racial abilities", "Расовые способности"),
])
group("SW25.Generation", [
    ("Apply", "Apply", "Применить"), ("Background", "Choose background", "Выбрать предысторию"),
    ("BackgroundHint", "Sets base Skill/Body/Mind, starting experience and starting classes.", "Задаёт базовые Технику/Тело/Разум, стартовый опыт и классы."),
    ("RollAbilities", "Roll ability dice (A–F)", "Бросить кубы характеристик (A–F)"),
    ("RollAbilitiesHint", "Three sets rolled with the {race} dice. Choose one.", "Три набора по кубам расы {race}. Выберите один."),
    ("RollBackground", "Roll 2d instead", "Бросить 2d вместо выбора"), ("StartingClass", "Starting class", "Стартовый класс"),
])
group("SW25.Pregen", [
    ("Choose", "Choose a pregen", "Выбрать преген"),
    ("ChooseHint", "Easy Creation: take a ready-made sample character from the rulebooks", "Быстрое создание: взять готового персонажа из книг правил"),
    ("Title", "Sample characters", "Прегены"),
    ("Hint", "Easy Creation (CR I p.20): pick a ready-made character from the rulebooks, then give it a name, age, gender and a bit of history. A card opens the full character.",
     "Быстрое создание (CR I с.20): выберите готового персонажа из книг правил, затем дайте ему имя, возраст, пол и немного истории. Карточка открывает персонажа целиком."),
    ("None", "No sample characters found — build them with: node tools/build-packs.mjs pregens", "Прегены не найдены — соберите их: node tools/build-packs.mjs pregens"),
    ("Back", "Back to the list", "К списку"),
    ("Use", "Take this character", "Взять этого персонажа"),
    ("Tips", "How to play", "Как играть"),
    ("Classes", "Classes", "Классы"),
    ("ClassAbilities", "Techniques, songs, stunts, evocations", "Техники, песни, трюки, эвокации"),
    ("Equipment", "Equipment", "Снаряжение"),
    ("Spare", "spare", "запасное"),
    ("Money", "Money", "Деньги"),
    ("Fortitude", "Fortitude", "Стойкость"),
    ("Willpower", "Willpower", "Сила воли"),
    ("Move", "Move", "Движение"),
    ("WithMount", "Also create the mount ({name})", "Создать и скакуна ({name})"),
    ("MountNoPermissionShort", "You may not create actors: the GM can add the mount from the Mounts compendium", "Вы не можете создавать акторов: ГМ может добавить скакуна из компендиума скакунов"),
    ("MountNoPermission", "You may not create actors: ask the GM to add {name} from the Mounts compendium.", "Вы не можете создавать акторов: попросите ГМа добавить {name} из компендиума скакунов."),
    ("MountCreated", "{name} created; {actor} is its rider.", "{name} создан; {actor} — его наездник."),
    ("ReplaceWarn", "Replaces the race, classes and items of this character", "Заменит расу, классы и предметы этого персонажа"),
    ("ConfirmTitle", "Replace the character?", "Заменить персонажа?"),
    ("ConfirmText", "{actor} already has a race, classes or items. Taking {pregen} removes all of them and replaces abilities, experience, money and languages. Name, portrait and biography stay.",
     "У {actor} уже есть раса, классы или предметы. Если взять {pregen}, всё это будет удалено, а характеристики, опыт, деньги и языки заменены. Имя, портрет и биография останутся."),
    ("Applied", "{actor} is now the {pregen}. Give them a name, age and a bit of history!", "{actor} теперь {pregen}. Дайте персонажу имя, возраст и немного истории!"),
    ("Missing", "Not in the compendiums, added as plain items: {names}", "Нет в компендиумах, добавлено простыми предметами: {names}"),
    ("MissingHint", "Not in the compendiums (added as plain items):", "Нет в компендиумах (будут простыми предметами):"),
    ("Tier.all", "All", "Все"),
    ("Tier.starting", "Starting characters", "Стартовые"),
    ("Tier.advanced", "Level 10–11", "10–11 уровень"),
    ("TierHint.starting", "Easy Creation, CR I–III", "Быстрое создание, CR I–III"),
    ("TierHint.advanced", "grown-up versions for high-level play, CR III p.25–64", "выросшие версии для высоких уровней, CR III с.25–64"),
    ("Line.front", "Frontline", "Передний ряд"),
    ("Line.frontSupport", "Frontline (support)", "Передний ряд (поддержка)"),
    ("Line.rear", "Rearguard", "Задний ряд"),
    ("Role.healer", "Healer", "Лекарь"),
    ("Role.explorer", "Explorer", "Разведчик"),
    ("Role.knowledge", "Knowledge", "Знания"),
    ("Aptitude.0", "no aptitude", "не умеет"),
    ("Aptitude.1", "limited aptitude", "немного"),
    ("Aptitude.2", "high aptitude", "хорошо"),
    ("Aptitude.3", "particularly high aptitude", "отлично"),
])
group("SW25.Growth", [
    ("Roll", "Ability growth (2d)", "Рост характеристик (2d)"), ("Choose", "Choose growth", "Выбор роста"),
    ("ChooseHint", "Choose which ability grows by 1.", "Выберите характеристику, которая вырастет на 1."), ("Done", "{ability} +1", "{ability} +1"),
])
group("SW25.Bio", [
    ("Age", "Age", "Возраст"), ("Biography", "Biography", "Биография"), ("Eyes", "Eyes", "Глаза"), ("Gender", "Gender", "Пол"),
    ("Hair", "Hair", "Волосы"), ("Height", "Height", "Рост"), ("Notes", "Notes", "Заметки"), ("Player", "Player", "Игрок"),
    ("Skin", "Skin", "Кожа"), ("Weight", "Weight", "Вес"),
])
group("SW25.Rest", [
    ("Title", "Rest", "Отдых"), ("Hint", "3 hours: 10% HP and half MP. 6 hours: 20% HP and all MP.", "3 часа: 10% HP и половина MP. 6 часов: 20% HP и все MP."),
    ("Short", "3 hours", "3 часа"), ("Long", "6 hours", "6 часов"), ("Party", "Party rest", "Отдых группы"),
    ("NewDay", "New day", "Новый день"), ("NewDayDone", "Once-per-day abilities refreshed.", "Ежедневные способности обновлены."),
    ("Message", "{name} rested {hours} h: +{hp} HP, +{mp} MP.", "{name} отдохнул(а) {hours} ч: +{hp} HP, +{mp} MP."),
])
add("SW25.Death.Flavor", "Death check (TN {tn})", "Проверка смерти (СЛ {tn})")
add("SW25.Resources.label", "Resource trackers", "Трекеры ресурсов")
group("SW25.Resources", [
    ("Add", "Add tracker", "Добавить трекер"), ("New", "New resource", "Новый ресурс"),
    ("Hint", "Custom counters (ammo, uses, charges...). They can be shown as token bars.", "Свои счётчики (боеприпасы, заряды...). Их можно вывести полосой на токене."),
    ("MaxHint", "Maximum (0 = no maximum)", "Максимум (0 = без максимума)"),
])
add("SW25.Conditions", "Conditions", "Состояния")
add("SW25.Effects", "Effects", "Эффекты")
group("SW25.Effect", [
    ("Create", "Create effect", "Создать эффект"), ("Inactive", "Inactive", "Неактивные"), ("New", "New effect", "Новый эффект"),
    ("Passive", "Passive", "Постоянные"), ("Temporary", "Temporary", "Временные"), ("Toggle", "Enable / disable", "Вкл. / выкл."),
    ("ItemHint", "Effects with 'transfer' apply to the owner while the item is active (equipped).", "Эффекты с переносом действуют на владельца, пока предмет активен (экипирован)."),
])
group("SW25.EffectItem", [
    ("Hint", "Effect presets create an Active Effect on the target when dropped on a token or sheet.", "Пресет эффекта создаёт активный эффект на цели при перетаскивании на токен или лист."),
    ("Stackable", "Stackable", "Суммируется"), ("Statuses", "Statuses", "Статусы"),
])
add("SW25.Key", "Key", "Ключ")
add("SW25.Name", "Name", "Название")
add("SW25.Description", "Description", "Описание")
add("SW25.Source", "Source", "Источник")
add("SW25.Page", "Page", "Страница")
add("SW25.Available", "Available", "Доступно")
add("SW25.Other", "Other", "Другое")
add("SW25.Auto", "Automatic", "Автоматически")
add("SW25.Use", "Use", "Использовать")
add("SW25.ToChat", "Post to chat", "В чат")
add("SW25.Edit", "Edit", "Редактировать")
add("SW25.Delete", "Delete", "Удалить")
add("SW25.Item.Create", "Create item", "Создать предмет")
add("SW25.Item.SummaryPlaceholder", "Short summary shown in lists and chat", "Краткое описание для списков и чата")
add("SW25.Compendium.Open", "Open compendium", "Открыть компендиум")
add("SW25.Fixed", "fixed", "фикс.")
add("SW25.FixedValueHint", "Fixed value = standard value + 7 (no dice)", "Фикс. значение = стандарт + 7 (без броска)")
add("SW25.AutoSuccess", "Automatic success", "Автоуспех")
add("SW25.AutoFailure", "Automatic failure", "Автопровал")
add("SW25.AutoFailureExp", "Automatic failure grants 50 experience", "Автопровал даёт 50 опыта")
add("SW25.TN", "TN", "СЛ")
add("SW25.Success", "success", "успех")
add("SW25.Failure", "failure", "провал")
group("SW25.Outcome", [("hit", "Hit", "Попадание"), ("miss", "Missed", "Промах"), ("affected", "Affected", "Подействовало"), ("resisted", "Resisted", "Сопротивился"), ("failed", "No effect", "Без эффекта")])
group("SW25.Faction", [("pc", "the PCs", "игроки"), ("enemy", "the enemies", "противники")])
add("SW25.Initiative.First", "{side} act first", "Первыми ходят {side}")
group("SW25.Roll", [
    ("Bonuses", "Bonuses", "Бонусы"), ("Declare", "Declare combat feat", "Объявить боевое умение"), ("Manual", "Situational modifier", "Ситуативный модификатор"),
    ("Roll", "Roll", "Бросить"), ("RollMode", "Roll mode", "Режим броска"), ("Situational", "Situational modifiers", "Ситуативные модификаторы"),
    ("StandardValue", "Standard value", "Базовое значение"), ("UseFixed", "Use fixed value (standard + 7)", "Фикс. значение (стандарт + 7)"),
    ("Consumed", "uses the item up", "расходует предмет"), ("ItemConsumed", "{name} used up", "{name}: израсходован"),
])
group("SW25.Migration", [
    ("AutomationRefreshed", "Sword World 2.5: the automation of {count} item(s) was updated from the compendiums.",
     "Sword World 2.5: автоматизация {count} предмет(ов) обновлена из компендиумов."),
])
group("SW25.Ammo", [
    ("label", "Ammunition", "Боеприпасы"), ("None", "No ammunition", "Без боеприпасов"), ("Spend", "Use up one", "Израсходовать один"),
])
group("SW25.Mod", [
    ("Title", "Automation modifiers", "Модификаторы автоматизации"),
    ("Hint", "Numeric bonuses applied automatically. A condition makes it an optional toggle in roll dialogs.",
     "Числовые бонусы, применяемые автоматически. С условием — становятся переключателем в диалоге броска."),
    ("Always", "always", "всегда"), ("Condition", "Condition", "Условие"), ("Key", "Modifies", "Изменяет"), ("Scope", "Scope", "Область"),
    ("ScopeEffect", "While active", "Пока активно"), ("ScopeUse", "Single use", "Одно применение"), ("Target", "Applies to", "Применяется к"),
    ("TargetSelf", "Self", "Себе"), ("TargetTarget", "Targets", "Целям"), ("Value", "Value", "Значение"),
    ("accuracy", "Accuracy", "Точность"), ("accuracyMelee", "Accuracy (melee)", "Точность (ближний бой)"), ("accuracyRanged", "Accuracy (ranged)", "Точность (дальний бой)"),
    ("evasion", "Evasion", "Уклонение"), ("defense", "Defense", "Защита"), ("damage", "Physical damage dealt", "Наносимый физ. урон"),
    ("damageMelee", "Damage (melee)", "Урон (ближний бой)"), ("damageRanged", "Damage (ranged)", "Урон (дальний бой)"),
    ("damageMagic", "Magic damage dealt", "Наносимый маг. урон"), ("damageTaken", "Damage taken", "Получаемый урон"),
    ("damageTakenPhysical", "Physical damage taken", "Получаемый физ. урон"), ("damageTakenMagic", "Magic damage taken", "Получаемый маг. урон"),
    ("critical", "Critical value (weapons)", "Порог крита (оружие)"), ("criticalSpell", "Critical value (spells)", "Порог крита (заклинания)"),
    ("powerRoll", "Power table roll", "Бросок таблицы силы"), ("fortitude", "Fortitude", "Стойкость"), ("willpower", "Willpower", "Сила воли"),
    ("spellcasting", "Spellcasting checks", "Проверки колдовства"), ("magicPower", "Magic Power", "Сила магии"),
    ("actionChecks", "All action checks", "Все проверки действий"), ("allChecks", "All checks", "Все проверки"),
    ("initiative", "Initiative", "Инициатива"), ("monsterKnowledge", "Monster Knowledge", "Знание монстров"),
    ("technique", "Technique package", "Пакет техники"), ("movementCheck", "Movement package", "Пакет движения"),
    ("observation", "Observation package", "Пакет наблюдения"), ("knowledge", "Knowledge package", "Пакет знания"),
    ("movement", "Movement speed", "Скорость"), ("hpMax", "Max HP", "Макс. HP"), ("mpMax", "Max MP", "Макс. MP"),
    ("abilityDex", "Dexterity score", "Ловкость (значение)"), ("abilityAgi", "Agility score", "Проворство (значение)"),
    ("abilityStr", "Strength score", "Сила (значение)"), ("abilityVit", "Vitality score", "Живучесть (значение)"),
    ("abilityInt", "Intelligence score", "Интеллект (значение)"), ("abilitySpi", "Spirit score", "Дух (значение)"),
    ("modDex", "Dexterity modifier", "Мод. Ловкости"), ("modAgi", "Agility modifier", "Мод. Проворства"),
    ("modStr", "Strength modifier", "Мод. Силы"), ("modVit", "Vitality modifier", "Мод. Живучести"),
    ("modInt", "Intelligence modifier", "Мод. Интеллекта"), ("modSpi", "Spirit modifier", "Мод. Духа"),
    ("performance", "Performance", "Исполнение"), ("evocation", "Evocation", "Эвокация"), ("riding", "Riding", "Верховая езда"),
    ("loot", "Loot roll", "Бросок добычи"), ("mpCost", "MP cost", "Стоимость MP"),
    ("criticalTaken", "Critical value of attacks against it", "Порог крита атак по нему"),
    ("powerPerCrit", "Power per critical", "Сила за каждый крит"),
    ("weaponPower", "Power of weapon attacks", "Сила атак оружием"), ("finalePower", "Power of finales", "Сила финалов"),
    ("regenTurn", "HP regained at the end of own turn", "HP в конце своего хода"),
    ("regenRound", "HP regained at the end of each round", "HP в конце каждого раунда"),
    ("damageTurn", "Magic damage at the end of own turn", "Маг. урон в конце своего хода"),
    ("Formula", "+ Formula", "+ Формула"),
    ("FormulaHint", "Added to the value when the effect is created: @magicPower, @level, @bardicPower, @alchemyPower",
     "Прибавляется к значению при создании эффекта: @magicPower, @level, @bardicPower, @alchemyPower"),
    ("ActorType", "Only for", "Только для"), ("ActorAny", "anyone", "всех"),
    ("ActorCharacter", "characters", "персонажей"), ("ActorMonster", "monsters (fixed values)", "монстров (фикс. значения)"),
    ("TurnRegen", "{name}: regeneration", "{name}: регенерация"), ("TurnDamage", "{name}: damage over time", "{name}: урон со временем"),
])

# --- Statuses -----------------------------------------------------------------
statuses = [
    ("dead", "Dead", "Мёртв", "Defeated: removed from the fight.", "Повержен: выбывает из боя."),
    ("unconscious", "Unconscious", "Без сознания", "HP 0 or less: cannot act; Death Check when HP drops and every 10 minutes.", "HP 0 и ниже: не действует; проверка смерти при потере HP и каждые 10 минут."),
    ("prone", "Prone", "Лежит", "−2 to action checks. Standing up is a Minor Action.", "−2 к проверкам действий. Встать — малое действие."),
    ("stoodUp", "Just stood up", "Только что встал", "−2 to action checks until the end of the turn.", "−2 к проверкам действий до конца хода."),
    ("surprised", "Surprised", "Застигнут врасплох", "No combat preparation; −2 to all checks until the next turn.", "Нет подготовки к бою; −2 ко всем проверкам до следующего хода."),
    ("fullMove", "Full move", "Полное движение", "−4 to Evasion until the start of the next turn.", "−4 к уклонению до начала следующего хода."),
    ("withdrawing", "Preparing to withdraw", "Готовится выйти из боя", "−4 to Evasion until the start of the next turn.", "−4 к уклонению до начала следующего хода."),
    ("engaged", "In melee", "В ближнем бою", "Engaged in a skirmish: cannot move freely.", "В схватке: не может свободно перемещаться."),
    ("sleep", "Asleep", "Спит", "Cannot act; −4 to checks if forced. Ends when touched (Psychic, weak).", "Не действует; −4 к проверкам. Прекращается от касания (психическое, слабое)."),
    ("paralyzed", "Paralyzed", "Парализован", "See the source effect.", "См. эффект-источник."),
    ("entangled", "Entangled", "Опутан", "Cannot move; escape with a de-bonding check (Adv. level + STR mod vs. TN).", "Не может двигаться; освобождение: ур. ав. + мод. СИЛ против СЛ."),
    ("blind", "Blind", "Ослеплён", "−4 to action checks; everyone counts as invisible.", "−4 к проверкам действий; все считаются невидимыми."),
    ("deaf", "Deaf", "Оглох", "Penalties to hearing checks; resists spellsongs.", "Штрафы к слуху; сопротивляется песням силы."),
    ("invisible", "Invisible", "Невидим", "Attacks against it −4; its attacks impose −4 on Evasion.", "Атаки по нему −4; его атаки дают −4 к уклонению."),
    ("hidden", "Hidden", "Скрыт", "Hiding (Hide check).", "Прячется (проверка скрытности)."),
    ("darkness", "Darkness", "Темнота", "−4 to action checks without darkvision.", "−4 к проверкам действий без тёмного зрения."),
    ("dimLight", "Dim light", "Сумерки", "−2 to action checks without darkvision.", "−2 к проверкам действий без тёмного зрения."),
    ("badFooting", "Poor footing", "Плохая опора", "−2 to action checks.", "−2 к проверкам действий."),
    ("waistDeep", "Waist-deep water", "В воде по пояс", "−2 to action checks, half movement, no full move.", "−2 к проверкам действий, половина скорости, без полного движения."),
    ("underwater", "Underwater", "Под водой", "−4 to action checks, ¼ movement, no ranged attacks.", "−4 к проверкам действий, ¼ скорости, без дальних атак."),
    ("fly", "Flying", "Летит", "Flying.", "В полёте."),
    ("mounted", "Mounted", "Верхом", "Riding a mount.", "Верхом на скакуне."),
    ("hungry", "Hungry / sleepless", "Голоден / не выспался", "−1 to all checks and −1 max HP/MP per missed day.", "−1 ко всем проверкам и −1 к макс. HP/MP за пропущенный день."),
    ("poisoned", "Poisoned", "Отравлен", "Under a poison-type effect.", "Под действием яда."),
    ("diseased", "Diseased", "Болен", "Under a disease-type effect.", "Под действием болезни."),
    ("cursed", "Cursed", "Проклят", "Under a curse (only curse removal ends it).", "Под проклятием (снимается только снятием проклятия)."),
    ("charmed", "Charmed", "Очарован", "Psychic effect.", "Психический эффект."),
    ("confused", "Confused", "Растерян", "Psychic effect.", "Психический эффект."),
    ("frightened", "Frightened", "Напуган", "Psychic effect.", "Психический эффект."),
    ("silenced", "Silenced", "Безмолвие", "Cannot vocalize: no spellcasting.", "Не может говорить: нельзя колдовать."),
    ("petrifying", "Petrifying", "Каменеет", "Ability score reduced step by step; petrified at 0.", "Характеристика снижается; при 0 — окаменение."),
    ("petrified", "Petrified", "Окаменел", "Cannot act; needs a cure.", "Не действует; требуется исцеление."),
    ("alternateForm", "Alternate Form (Nightmare)", "Иная форма (кошмар)", "No armor penalty to spellcasting; no vocalization needed.", "Нет штрафа брони к колдовству; не нужно произносить заклинания."),
    ("beastForm", "Beast Form (Lykant)", "Звериная форма (ликант)", "+2 Strength modifier; only Lykant speech, no Truespeech/Spiritualism/Magitech.", "+2 к мод. Силы; только ликантская речь, без Истинной речи/Спиритуализма/Магитеха."),
    ("weakPoint", "Weak point revealed", "Слабое место раскрыто", "Attacks use the monster's weak point bonus.", "Атаки получают бонус слабого места."),
]
for k, en, ru, ren, rru in statuses:
    add(f"SW25.Status.{k}", en, ru)
    add(f"SW25.StatusRule.{k}", ren, rru)

# --- Spellbook ----------------------------------------------------------------
group("SW25.Spellbook", [
    ("Title", "Spellbook", "Книга заклинаний"), ("Open", "Open spellbook", "Открыть книгу заклинаний"),
    ("Barbarous", "Barbarous priests only", "Только для варварских жрецов"), ("Cast", "Cast", "Колдовать"),
    ("ElementNotChosen", "type not chosen today", "стихия не выбрана сегодня"), ("Empty", "No spells or class abilities.", "Нет заклинаний и классовых способностей."),
    ("Favorite", "Add to sheet", "Добавить на лист"), ("Unfavorite", "Remove from sheet", "Убрать с листа"),
    ("Favorites", "on sheet", "на листе"), ("Forget", "Forget", "Забыть"), ("Known", "Known", "Изученные"),
    ("Learn", "Learn new", "Изучить новые"), ("LearnButton", "Learn", "Изучить"),
    ("LearnHint", "Add to the character (one per class level; Shift ignores the limit)", "Добавить персонажу (одна за уровень класса; Shift — без лимита)"),
    ("Learnable", "Available to learn", "Доступно для изучения"), ("Learned", "Learned", "Изучено"),
    ("LevelN", "Level {level}", "Уровень {level}"), ("NoneKnown", "Nothing learned yet", "Пока ничего не изучено"),
    ("Other", "Other spells", "Прочие заклинания"), ("OtherDeity", "god: {deity}", "бог: {deity}"),
    ("Search", "Search…", "Поиск…"), ("ShowAll", "Show unavailable", "Показать недоступные"),
    ("TooHigh", "level {level}: above your class level", "уровень {level}: выше уровня класса"),
    ("NothingFound", "Nothing found", "Ничего не найдено"),
    ("CheckHint", "Spellcasting check = Magic Power + bonuses (armor penalties included)", "Проверка колдовства = сила магии + бонусы (со штрафами брони)"),
])

# --- Entry cards (items as printed in the rulebooks) --------------------------------
group("SW25.Entry", [
    ("Target", "Tar.", "Цель"), ("RangeArea", "Range/Area", "Дальн./обл."), ("Duration", "Duration", "Длительность"),
    ("Resistance", "Resistance", "Сопротивление"), ("Cost", "Cost", "Цена"), ("Type", "Type", "Тип"),
    ("Summary", "Sum.", "Кратко"), ("SummaryLong", "Summary", "Краткое описание"),
    ("Effect", "Eff.", "Эффект"), ("EffectLong", "Effect (description)", "Эффект (описание)"),
    ("Element", "Element", "Стихия"), ("Note", "Note", "Примечание"),
    ("PlusMagicPower", "+ Magic Power", "+ сила магии"), ("PlusBardicPower", "+ Bardic Power", "+ сила барда"),
    ("Limit", "Limit", "Ограничение"), ("Singing", "Singing", "Пение"), ("Required", "Required", "Требуется"),
    ("NotRequired", "Not required", "Не требуется"), ("Pet", "Pet", "Питомцы"), ("Condition", "Effect Condition", "Условие эффекта"),
    ("None", "None", "Нет"), ("BaseRhythm", "Base Rhythm", "Базовый ритм"), ("Flourish", "Flourish Value", "Порог блеска"),
    ("ExtraRhythm", "Extra Rhythm", "Доп. ритм"), ("Prereq", "Prer.", "Требования"), ("Use", "Use", "Использование"),
    ("Cards", "Cards", "Карты"), ("Check", "Check", "Проверка"), ("Spellcasting", "Spellcasting", "Колдовство"),
    ("Properties", "Properties", "Свойства"), ("CritShort", "Crit", "Крит"), ("Slots", "Slots", "Места"),
    ("Attacks", "Attacks", "Атаки"), ("Yes", "Yes", "Да"), ("No", "No", "Нет"), ("Marks", "Action marks", "Отметки действия"),
    ("NotEquipped", "Not equipped", "Не экипировано"), ("ApplyToTargets", "Apply to targeted tokens", "Наложить на цели"),
    ("OpenSource", "Open the compendium original", "Открыть оригинал в компендиуме"),
    ("SourceMissing", "The compendium original was not found.", "Оригинал в компендиуме не найден."),
    ("EditMode", "Edit mode", "Режим редактирования"),
    ("EmptyHint", "This entry is still empty. Switch to edit mode to fill it in.", "Запись пока пуста. Переключитесь в режим редактирования, чтобы заполнить её."),
    ("Transfer", "on the owner", "на владельце"), ("View", "View", "Просмотр"), ("NoEffects", "No effects", "Эффектов нет"),
    ("AddModifier", "Add modifier", "Добавить модификатор"), ("NoModifiers", "No modifiers", "Модификаторов нет"),
    ("AddRow", "Add row", "Добавить строку"), ("NoModes", "No usage modes", "Режимов нет"),
    ("LevelShort", "Lv", "Ур."),
])

# --- Tracker / sheets / tabs ------------------------------------------------------
group("SW25.Tracker", [
    ("Title", "Resource tracker", "Трекер ресурсов"), ("Amount", "Amount", "Величина"), ("Damage", "Damage (fixed)", "Урон (фикс.)"),
    ("Heal", "Heal", "Лечение"), ("ShiftHint", "Shift: direct change", "Shift: прямое изменение"),
    ("OpenSheet", "Open the sheet", "Открыть лист"), ("SectionHint", "Damage and healing go to this section", "Урон и лечение идут в эту секцию"),
    ("SpendMP", "Spend MP", "Потратить MP"), ("RestoreMP", "Restore MP", "Восстановить MP"),
    ("EvasionShort", "Eva", "Укл"), ("DefenseShort", "Def", "Защ"), ("FortitudeShort", "Fort", "Стойк"), ("WillpowerShort", "Will", "Воля"),
    ("RemoveHint", "click to remove", "клик — снять"),
    ("Toggle", "Resource tracker", "Трекер ресурсов"),
    ("CollapseHint", "Collapse to a translucent title bar (expand it with its arrow or a double click)",
     "Свернуть в полупрозрачную полоску (развернуть — стрелкой или двойным кликом)"),
    ("CloseHint", "Close the tracker (the heart of the Token Controls opens it again)",
     "Закрыть трекер (кнопка с сердцем на панели токенов откроет его снова)"),
    ("HPDown", "Lower HP by", "Уменьшить HP на"), ("HPUp", "Raise HP by", "Увеличить HP на"),
    ("MPDown", "Lower MP by", "Уменьшить MP на"), ("MPUp", "Raise MP by", "Увеличить MP на"),
    ("Decrease", "Decrease by", "Уменьшить на"), ("Increase", "Increase by", "Увеличить на"),
    ("ManyHint", "type the amount (Enter to apply)", "введите величину (Enter — применить)"),
    ("Apply", "Apply", "Применить"),
    ("Attacks", "Attacks", "Атаки"), ("AttackHint", "Attack (Accuracy check against the targets)", "Атака (проверка точности по целям)"),
    ("DamageHint", "Roll the damage without an Accuracy check", "Бросить урон без проверки точности"),
    ("SkillHint", "Use the unique skill", "Применить особое умение"), ("PowerShort", "P", "С"),
])
group("SW25.Combat", [
    ("Title", "Combat panel", "Боевая панель"),
    ("Toggle", "Combat panel: attacks, spells, checks, resources", "Боевая панель: атаки, заклинания, проверки, ресурсы"),
    ("CloseHint", "Close the combat panel (the swords of the Token Controls open it again)",
     "Закрыть боевую панель (кнопка с мечами на панели токенов откроет её снова)"),
    ("NoActor", "Select a token (or assign yourself a character) to see what it can do in combat.",
     "Выберите токен (или назначьте себе персонажа), чтобы увидеть его боевые возможности."),
    ("Magic", "Magic", "Магия"), ("ClassAbilities", "Class abilities", "Способности классов"), ("Items", "Items", "Предметы"),
    ("PowerShort", "Power", "Сила"), ("CheckShort", "Check", "Проверка"),
    ("NoSpells", "No favorite spells: mark them with ★ in the spellbook.", "Нет избранных заклинаний: отметьте их ★ в книге заклинаний."),
    ("InitiativeToTracker", "Roll the initiative into the combat tracker", "Бросить инициативу в трекер боя"),
])
group("SW25.EffectsPanel", [
    ("Hint", "Click: turn off / on · Right-click: remove · Shift-click: open", "Клик — выключить / включить · ПКМ — снять · Shift+клик — открыть"),
    ("Off", "Turned off", "Выключен"), ("Expired", "Expired", "Истёк"), ("Unlimited", "No time limit", "Без срока"),
    ("Rounds", "{n}r", "{n}р"), ("Minutes", "{n}m", "{n}м"), ("Hours", "{n}h", "{n}ч"), ("Days", "{n}d", "{n}д"),
])
group("SW25.Breakdown", [
    ("Total", "Total", "Итого"), ("Other", "Other modifiers", "Прочие модификаторы"),
    ("Fixed", "Fixed value (+7)", "Фиксированное значение (+7)"), ("NotBelowZero", "Not below 0", "Не ниже 0"),
    ("MetalArmor", "Metal armor", "Металлическая броня"), ("StatBlock", "Stat block", "Статблок"),
    ("SwordShards", "Sword shards", "Осколки меча"), ("Jockey", "Jockey (Rider + ability)", "Жокей (Наездник + характеристика)"),
    ("CardRank", "Card rank", "Ранг карты"),
])
group("SW25.Wealth", [
    ("Items", "Items value", "Стоимость вещей"), ("Total", "Total wealth", "Общее богатство"),
    ("Formula", "Money {money} + deposit {deposit} + items {items} − debt {debt} = {total}",
     "Деньги {money} + вклад {deposit} + вещи {items} − долг {debt} = {total}"),
    ("Unpriced", "Not counted: {count} item(s) without a fixed price.", "Не учтены предметы без фиксированной цены: {count}."),
    ("Stack", "{quantity} pcs: {value}", "{quantity} шт.: {value}"),
])
group("SW25.Sheet", [("Character", "SW2.5 Character", "SW2.5 Персонаж"), ("Monster", "SW2.5 Monster", "SW2.5 Монстр"), ("Item", "SW2.5 Item", "SW2.5 Предмет"), ("Party", "SW2.5 Party", "SW2.5 Отряд")])
group("SW25.Tab", [
    ("main", "Character", "Персонаж"), ("classes", "Classes & Feats", "Классы и умения"), ("combat", "Combat", "Бой"),
    ("skills", "Checks", "Проверки"), ("magic", "Magic", "Магия"), ("inventory", "Inventory", "Инвентарь"),
    ("effects", "Effects", "Эффекты"), ("bio", "Biography", "Биография"), ("stats", "Stat block", "Статблок"),
    ("abilities", "Unique skills", "Умения"), ("loot", "Loot", "Добыча"), ("notes", "Notes", "Заметки"),
    ("description", "Description", "Описание"), ("details", "Details", "Детали"), ("automation", "Automation", "Автоматизация"),
    ("overview", "Overview", "Обзор"), ("stash", "Stash", "Общее снаряжение"),
])

# --- Bestiary browser ---------------------------------------------------------------
group("SW25.Bestiary", [
    ("Title", "Bestiary", "Бестиарий"), ("Search", "Name…", "Название…"),
    ("SearchDeep", "Also search skills and loot", "Искать и в умениях, и в добыче"),
    ("RepMax", "Reputation up to", "Репутация до"),
    ("RepMaxHint", "Monsters that a Monster Knowledge result of this value identifies (their Reputation is not higher)", "Монстры, которых опознаёт такой результат проверки знания монстров (их репутация не выше)"),
    ("Classification", "Classification", "Классификация"), ("Traits", "Traits", "Особенности"), ("Immunities", "Immunities", "Иммунитеты"),
    ("WeakPoint", "Weak point", "Слабое место"),
    ("DamageDealt", "Damage dealt", "Наносимый урон"),
    ("DamageDealtHint", "Damage types of the monster's attacks, breaths and skills", "Типы урона атак, дыханий и навыков монстра"), ("AllOfHint", "Monsters must have every selected one", "У монстра должны быть все выбранные"),
    ("SectionsTitle", "Sections", "Секции"), ("SectionsShort", "Sec.", "Секц."), ("Any", "Any", "Любой"), ("Book", "Book", "Книга"),
    ("Reset", "Reset filters", "Сбросить фильтры"), ("Found", "Found {found} of {total}", "Найдено: {found} из {total}"),
    ("OpenPack", "Open the compendium", "Открыть компендиум"), ("Open", "Open", "Открыть"), ("Import", "Import into the world", "Импортировать в мир"),
    ("Imported", "{name} imported into the world", "{name}: импортирован в мир"),
    ("DragHint", "Drag a row onto the scene to place the monster.", "Перетащите строку на сцену, чтобы поставить монстра."),
    ("NothingFound", "No monster matches the filters.", "Ни один монстр не подходит под фильтры."),
])
group("SW25.Browser", [
    ("Title", "Compendium browser", "Браузер компендиумов"),
    ("Spells", "Spells", "Заклинания"), ("Feats", "Combat feats", "Боевые умения"), ("Abilities", "Class abilities", "Способности классов"),
    ("Equipment", "Equipment", "Снаряжение"),
    ("Search", "Name…", "Название…"), ("SearchName", "Name…", "Название…"), ("SearchText", "Also search the rules text", "Искать и в тексте правил"),
    ("CastableBy", "Castable by {name}", "Доступно {name}"), ("MagicSystem", "Magic system", "Школа магии"),
    ("FairyElement", "Fairy element", "Стихия фей"), ("Types", "Types", "Типы"), ("Properties", "Properties", "Свойства"),
    ("PrereqMet", "Prerequisites met by {name}", "Требования выполнены у {name}"),
    ("Acquisition", "Acquisition", "Получение"), ("Selective", "Chosen", "По выбору"), ("Automatic", "Automatic", "Автоматически"),
    ("Classes", "Class", "Класс"), ("AnyWizard", "Any wizard-type class", "Любой класс-маг"),
    ("AdvLevel", "Adventurer level required", "Требуемый уровень авантюриста"),
    ("LearnableBy", "Learnable by {name}", "Может изучить {name}"), ("Kind", "Kind", "Вид"), ("Timing", "Timing", "Когда"),
    ("Mounts", "Mounts", "Скакуны"), ("Details", "Details", "Детали"),
    ("StrengthFor", "Strength enough for {name}", "Хватает Силы у {name}"), ("AffordableFor", "Affordable for {name}", "По карману {name}"),
    ("ItemType", "Type", "Тип"), ("Hands", "Hands", "Хват"), ("MinStr", "Minimum Strength", "Мин. Сила"), ("MinStrShort", "Min STR", "Мин. СИЛ"),
    ("Price", "Price", "Цена"), ("Slot", "Accessory slot", "Место аксессуара"), ("Stats", "Stats", "Показатели"),
    ("Open", "Open", "Открыть"), ("AddTo", "Add to {name}", "Добавить {name}"), ("Added", "{name} added to {actor}", "{name}: добавлено {actor}"),
    ("RefHint", "Character the filters \"for …\" and the add button refer to (the sheet the browser was opened from, else the selected token or your character)",
     "Персонаж, к которому относятся фильтры «для …» и кнопка добавления (лист, из которого открыт браузер, иначе выбранный токен или ваш персонаж)"),
    ("DragHint", "Drag a row onto a sheet (or a monster onto the scene).", "Перетащите строку на лист (а монстра — на сцену)."),
    ("NothingFound", "Nothing matches the filters.", "Ничего не подходит под фильтры."),
])
group("SW25.Browser.Flag", [
    ("minorAction", "Minor action", "Малое действие"), ("combatPrep", "Combat preparation", "Подготовка к бою"),
    ("powerTable", "Power table", "Таблица силы"), ("versions", "Several versions", "Несколько версий"),
    ("removes", "Ends conditions", "Снимает состояния"), ("automation", "Automated", "Автоматизировано"),
    ("choice", "Chosen category", "С выбором категории"), ("magic", "Magic item", "Магический"), ("silver", "Silver", "Серебряный"),
    ("consumable", "Consumable", "Расходуемый"), ("usable", "Can be used", "Применяемый"), ("grappler", "Grappler", "Для борца"),
    ("classReq", "Class requirement", "Требует класс"),
])
group("SW25.Browser.Apply", [
    ("melee", "Melee attack", "Атака в ближнем бою"), ("ranged", "Ranged attack", "Дальняя атака"), ("weapon", "Any weapon attack", "Любая атака оружием"),
    ("spell", "Spell", "Заклинание"), ("round", "Lasts the round", "На весь раунд"), ("bard", "Songs and finales", "Песни и финалы"),
    ("evocation", "Evocation", "Эвокация"),
])
group("SW25.Bestiary.Sections", [("any", "Any", "Любое"), ("single", "One", "Одна"), ("multi", "Several", "Несколько")])
group("SW25.Bestiary.Trait", [
    ("flight", "Flight", "Полёт"), ("swim", "Swimming", "Плавание"), ("burrow", "Burrowing", "Роет"), ("magic", "Magic", "Магия"),
    ("breath", "Breath", "Дыхание"), ("regeneration", "Regeneration", "Регенерация"), ("poison", "Poison", "Яд"), ("curse", "Curse", "Проклятие"),
    ("gaze", "Gaze / eyes", "Взгляд"), ("invisible", "Invisibility", "Невидимость"), ("actions", "Several actions", "Несколько действий"),
    ("shapeshift", "Shape change", "Смена облика"), ("noLoot", "No loot", "Без добычи"),
])
group("SW25.Bestiary.Immunity", [
    ("poison", "Poison", "Яд"), ("psychic", "Psychic", "Психическое"), ("disease", "Disease", "Болезни"), ("normalWeapon", "Normal weapons", "Обычное оружие"),
    ("fire", "Fire", "Огонь"), ("ice", "Water/Ice", "Вода/лёд"), ("slashing", "Slashing", "Режущее"), ("earth", "Earth", "Земля"),
    ("wind", "Wind", "Ветер"), ("lightning", "Lightning", "Молния"), ("energy", "Energy", "Энергия"), ("curse", "Curse", "Проклятие"),
])
group("SW25.Bestiary.Weak", [
    ("physical", "Physical damage", "Физический урон"), ("magic", "Magic damage", "Магический урон"),
    ("hpRecovery", "HP recovery", "Лечение HP"), ("silver", "Silver", "Серебро"), ("accuracy", "Accuracy +1", "Меткость +1"),
])
group("SW25.Bestiary.Perception", [
    ("Fivesenses", "Five senses", "Пять чувств"), ("FivesensesDarkvision", "Five senses (darkvision)", "Пять чувств (тёмное зрение)"),
    ("Magic", "Magic", "Магическое"), ("Mechanical", "Mechanical", "Механическое"), ("SharedwithCaster", "Shared with the caster", "Общее с хозяином"),
])
group("SW25.Bestiary.Disposition", [
    ("Hostile", "Hostile", "Враждебное"), ("Instructed", "Instructed", "По приказу"), ("Neutral", "Neutral", "Нейтральное"),
    ("Hungry", "Hungry", "Голодное"), ("Friendly", "Friendly", "Дружелюбное"),
])
group("SW25.Bestiary.Magic", [("spellsong", "Spellsongs", "Песни силы")])

# --- Party ------------------------------------------------------------------------
group("SW25.Party", [
    ("DefaultName", "The Party", "Отряд"), ("OpenSheet", "Open the party sheet", "Открыть лист отряда"),
    ("MemberCount", "Party members", "Участники отряда"), ("DropHint", "Drag characters here", "Перетащите сюда персонажей"),
    ("Create", "Create party", "Создать отряд"), ("Bestiary", "Bestiary", "Бестиарий"),
    ("CreateMember", "Create a character in this party", "Создать персонажа в этом отряде"),
    ("AvgLevelHint", "Average adventurer level of the characters", "Средний уровень авантюриста у персонажей"),
    ("MaxLevel", "Max", "Макс."), ("MaxLevelHint", "Highest adventurer level", "Наивысший уровень авантюриста"),
    ("TotalMoneyHint", "Gamels of the characters and the party fund", "Гамели персонажей и общая казна"),
    ("SlowestHint", "Movement of the slowest member: the party travels at its pace", "Скорость самого медленного участника: отряд идёт с его скоростью"),
    ("SceneHint", "Current scene", "Текущая сцена"),
    ("NewDayHint", "6:00 a.m.: once-per-day abilities are refreshed", "6:00 утра: восстанавливаются ежедневные способности"),
    ("NewDayDone", "Once-per-day abilities refreshed: {names}", "Ежедневные способности восстановлены: {names}"),
    ("Reward", "Session reward", "Награда за сессию"),
    ("RewardHint", "Experience, reputation and gamels for every character of the party", "Опыт, репутация и гамели каждому персонажу отряда"),
    ("RewardDone", "{reward} for each: {names}", "{reward} каждому: {names}"),
    ("Gamels", "Gamels", "Гамели"), ("Give", "Give", "Выдать"),
    ("PlaceTokens", "Place tokens", "Расставить токены"),
    ("PlaceTokensHint", "Place the tokens of the members missing from the current scene in the middle of the view", "Поставить токены участников, которых нет на текущей сцене, в центр экрана"),
    ("SelectTokens", "Select tokens", "Выделить токены"),
    ("SelectTokensHint", "Select the members' tokens on the scene and centre the view on them (Shift: add to the selection)", "Выделить токены участников на сцене и навести на них камеру (Shift — добавить к выделению)"),
    ("AddPCs", "Add player characters", "Добавить персонажей игроков"),
    ("Checks", "Party checks", "Навыки отряда"), ("Languages", "Languages", "Языки"),
    ("NoLanguages", "No languages learned yet.", "Языки пока не изучены."),
    ("LanguagesHint", "Black: every character speaks it. The number shows how many speak it, the pen how many read and write it.", "Чёрным — язык, на котором говорят все. Число — сколько говорят, перо — сколько читают и пишут."),
    ("NoChecks", "Nobody is trained in any check yet.", "Пока никто не владеет проверками."),
    ("ChecksHint", "The best value in the party and whose it is (the tooltip lists everyone). Click to roll it for that character. Checks nobody is trained in are rolled straight (2d).", "Лучшее значение в отряде и чьё оно (в подсказке — все участники). Клик — бросок за этого персонажа. Проверки, которыми никто не владеет, бросаются чистым 2d."),
    ("OtherChecks", "Other", "Прочие"), ("LevelHint", "Adventurer level", "Уровень авантюриста"), ("OpenMember", "Open the sheet", "Открыть лист"),
    ("ShowToken", "Show the token on the scene (Shift: add to the selection)", "Показать токен на сцене (Shift — добавить к выделению)"),
    ("PlaceToken", "Place the token on the scene", "Поставить токен на сцену"), ("Remove", "Remove from the party", "Убрать из отряда"),
    ("TokenArt", "Token art", "Изображение токена"), ("Limited", "You cannot see this character's details.", "Подробности этого персонажа вам недоступны."),
    ("InitiativeShort", "Init", "Иниц"), ("MoveShort", "Move", "Скор"), ("MoveHint", "Movement: normal / full", "Скорость: обычная / полная"),
    ("Grace", "Sword's Grace", "Милость меча"),
    ("AddHint", "Drag a character or a creature from the Actors directory to add it to the party.", "Перетащите персонажа или существо из каталога актёров, чтобы добавить его в отряд."),
    ("Purse", "Money", "Деньги"), ("Fund", "Party fund", "Общая казна"), ("FundHint", "Money the party keeps together", "Деньги, которые отряд хранит вместе"),
    ("Total", "Total", "Всего"), ("StashItems", "Shared equipment", "Общее снаряжение"),
    ("StashHint", "Drag weapons, armor and items here. From a character's sheet the item moves into the stash.", "Перетащите сюда оружие, броню и предметы. С листа персонажа предмет переезжает в общее снаряжение."),
    ("StashMoveHint", "Drag an item onto a character's sheet, or click the hand, to hand it over.", "Перетащите предмет на лист персонажа или нажмите на руку, чтобы передать его."),
    ("GiveTo", "Give to…", "Передать…"), ("GiveTitle", "Give {name}", "Передать: {name}"),
    ("WorldActorsOnly", "Only actors of this world can join the party: import it from the compendium first.", "В отряд можно добавить только актёров этого мира: сначала импортируйте его из компендиума."),
    ("StashOnly", "Only weapons, armor and items can go into the stash.", "В общее снаряжение можно положить только оружие, броню и предметы."),
    ("NoScene", "There is no active scene.", "Нет активной сцены."),
    ("AllPlaced", "Every member already has a token on this scene.", "У всех участников уже есть токены на этой сцене."),
    ("NoTokens", "No member tokens on this scene.", "На этой сцене нет токенов участников."),
    ("Notes", "Party notes", "Заметки отряда"),
    ("NotesHint", "Quests, promises, debts and rumours the party keeps track of.", "Задания, обещания, долги и слухи, которые отряд держит в памяти."),
])

# --- Character sheet (layout of the official sheet) ------------------------------
group("SW25.Sheet", [
    ("AdventurerLevel", "Adventurer Level", "Уровень"),
    ("CharacterName", "Character Name", "Имя персонажа"),
    ("RacialAbilities", "Racial Abilities", "Расовые способности"),
    ("ChangeFate", "Change Fate", "Смена судьбы"),
    ("DropRace", "Drop a race here", "Перетащите расу"),
    ("BaseAbility", "Base Ability", "База"),
    ("Correction", "Correction", "Кубы A–F"),
    ("AbilityScores", "Ability Scores", "Характеристики"),
    ("Modifiers", "Modifiers", "Модифи­каторы"),
    ("GrowthFace", "Growth die face (2d growth roll)", "Грань куба роста (бросок 2d)"),
    ("ExperiencePoints", "Experience Points", "Опыт"),
    ("ExpSpent", "Spent on classes:", "Потрачено на классы:"),
    ("ExpNext", "Next level from:", "Следующий уровень от:"),
    ("Class", "Class", "Класс"),
    ("LearnClass", "+ Learn a class (EXP cost)…", "+ Изучить класс (цена в опыте)…"),
    ("PackageNote", "class level + ability modifier · click a value for its checks", "уровень класса + модификатор · нажмите на значение, чтобы увидеть проверки"),
    ("PackageExpand", "Show the checks of this package", "Показать проверки пакета"),
    ("FeatSlots", "Selected feats / slots (one per odd adventurer level)", "Выбрано умений / слотов (по одному на нечётный уровень авантюриста)"),
    ("FeatSlotHint", "Adventurer level at which this slot opens", "Уровень авантюриста, на котором открывается слот"),
    ("FeatLocked", "Opens at adventurer level {level}", "Откроется на {level} уровне авантюриста"),
    ("FeatEmpty", "Free slot — drop a combat feat", "Свободный слот — перетащите боевое умение"),
    ("AutoFeats", "Automatically acquired, etc.", "Получено автоматически и пр."),
    ("LearnedAbilities", "Techniques, Spellsongs, Stunts, etc.", "Техники, песни, трюки и пр."),
    ("NoneLearned", "Nothing learned yet", "Пока ничего не изучено"),
    ("NoLearnedClasses", "Enhancer, Bard, Rider and Alchemist abilities appear here", "Здесь появятся способности энхансера, барда, наездника и алхимика"),
    ("Talk", "Talk", "Речь"),
    ("Read", "Read", "Письмо"),
    ("AddLanguage", "+ Add a language…", "+ Добавить язык…"),
    ("OtherLanguage", "Other language…", "Другой язык…"),
    ("Points", "points", "очк."),
    ("AutoFailures", "Automatic Failures", "Автопровалы"),
    ("FumbleHint", "Automatic failures this session: +50 EXP each at the end of the session. Shift-click clears.",
     "Автопровалы за сессию: +50 опыта за каждый в конце сессии. Shift-клик — очистить."),
    ("FumbleHintAuto", "Automatic failures this session (their +50 EXP is already granted). Shift-click clears.",
     "Автопровалы за сессию (их +50 опыта уже начислены). Shift-клик — очистить."),
    ("SoulscarHint", "Soulscars from resurrection. Click a box to mark it.", "Шрамы души от воскрешения. Нажмите на клетку, чтобы отметить."),
    ("ClassLevels", "Class Levels", "Уровни классов"),
    ("MonsterKnowledgeHint", "Roll Monster Knowledge against the targeted monsters", "Знание монстров против выбранных целей"),
    ("LimitedMove", "Limited Move", "Огранич."),
    ("NormalMove", "Normal Move", "Обычное"),
    ("FullMove", "Full Move", "Полное"),
    ("MovementEnhancements", "Movement enhancements", "Изменения скорости"),
    ("BaseAccuracy", "Base Accuracy", "Базовая точность"),
    ("WeaponName", "Weapon Name / Notes", "Оружие / заметки"),
    ("Stance", "Stance", "Хват"),
    ("WeaponAccuracy", "Weapon Accuracy", "Точн. оружия"),
    ("TotalAccuracy", "Total Accuracy", "Итог. точность"),
    ("TotalExtraDamage", "Total Extra Damage", "Итог. доп. урон"),
    ("SwitchStance", "Switch grip mode", "Сменить хват"),
    ("RollDamage", "Roll damage without an accuracy check", "Бросить урон без проверки точности"),
    ("DropWeapon", "Drop weapons here", "Перетащите оружие сюда"),
    ("AttackEnhancements", "Accuracy, Extra Damage enhancements, etc.", "Модификаторы точности, урона и пр."),
    ("Section", "Section", "Место"),
    ("AccessoryName", "Name of Accessory, Effect", "Аксессуар, эффект"),
    ("Wear", "Wear…", "Надеть…"),
    ("TakeOff", "Take off", "Снять"),
    ("SlotOver", "More than one accessory in this section", "Больше одного аксессуара в этом месте"),
    ("Hands", "Hands", "Руки"), ("HeldItems", "Held weapon, shield or item", "Оружие, щит или предмет в руке"),
    ("HandsHint", "What the character holds (CR I p.147): weapons, shields (usually in the left hand) and hand-held items such as a torch or a wand. A two-handed item fills both hands. The sections below are for accessories only: their «Right/Left hand» are rings, bracelets and gloves. A magical implement is either held (wand, staff) or worn as a ring (CR I p.176): drop it on a hand or on a section.",
     "Что персонаж держит в руках (CR I p.147): оружие, щиты (обычно в левой руке) и ручные предметы — факел, жезл. Двуручный предмет занимает обе руки. Места ниже — только для аксессуаров: их «Правая/Левая рука» — это кольца, браслеты и перчатки. Магический инструмент либо держат в руке (жезл, посох), либо носят как кольцо (CR I p.176): перетащите его на руку или на место."),
    ("Hold", "Hold…", "Взять…"), ("PutAway", "Put away", "Убрать из рук"),
    ("HandOver", "This hand holds more than one item", "В этой руке больше одного предмета"),
    ("BothHands", "Both hands", "Обе руки"), ("Held", "Held", "В руках"), ("Worn", "Worn", "Надето"),
    ("HoldToggle", "Hold in a hand / put away", "Взять в руку / убрать"),
    ("HoldOrWear", "Hold it in a hand (wand) or, dropped on a section, wear it (ring)", "Взять в руку (жезл) или, перетащив на место, надеть (кольцо)"),
    ("BaseEvasion", "Base Evasion", "Базовое уклонение"),
    ("ArmorName", "Armor Name / Notes", "Броня / заметки"),
    ("DropArmor", "Drop armor and shields here", "Перетащите броню и щиты сюда"),
    ("MagicPower", "Magic Power (class level + Int modifier), etc.", "Сила магии (уровень класса + мод. Интеллекта) и пр."),
    ("OpenSpellbookFor", "Open the spellbook: {name}", "Открыть книгу заклинаний: {name}"),
    ("TotalEvasion", "Total Evasion", "Итог. уклонение"),
    ("TotalDefense", "Total Defense", "Итог. защита"),
    ("DefenseEnhancements", "Evasion, Defense enhancements, etc.", "Модификаторы уклонения, защиты и пр."),
    ("AmountHint", "Amount to apply (fixed damage, logged). Shift-click a button: change the value directly.",
     "Сколько применить (фиксированный урон, с записью в журнал). Shift-клик по кнопке — просто изменить значение."),
    ("TakeDamage", "Take damage", "Получить урон"),
    ("Heal", "Heal", "Лечение"),
    ("SpendMP", "Spend MP", "Потратить MP"),
    ("RestoreMP", "Restore MP", "Восстановить MP"),
    ("Formulas", "HP = Adventurer Level ×3 + Vitality · MP = Wizard-type class levels ×3 + Spirit · Fortitude = Adventurer Level + Vitality mod · Willpower = Adventurer Level + Spirit mod",
     "HP = уровень авантюриста ×3 + Живучесть · MP = уровни классов-заклинателей ×3 + Дух · Стойкость = уровень авантюриста + мод. Живучести · Воля = уровень авантюриста + мод. Духа"),
    ("StandardFrom", "Standard value from", "Базовое значение от"),
    ("CastingCheck", "Casting", "Колдовство"),
    ("SpellCompendium", "Spell compendium", "Компендиум заклинаний"),
    ("Cost", "Cost", "Цена"),
    ("Target", "Target", "Цель"),
    ("RangeArea", "Range / Area", "Дальн. / обл."),
    ("Duration", "Duration", "Длит."),
    ("NoFavoriteSpells", "No spells on the sheet — add favorites from the spellbook", "Заклинаний на листе нет — добавьте избранное из книги заклинаний"),
    ("MoneyDepositDebt", "Money / Deposit / Debt", "Деньги / вклад / долг"),
    ("Money", "Money", "Деньги"),
    ("Deposit", "Deposit", "Вклад"),
    ("AdventurerSet", "Adventurer Set", "Набор авантюриста"),
    ("AddAdventurerSet", "Buy the Adventurer Set (Shift: add it for free)", "Купить набор авантюриста (Shift — бесплатно)"),
    ("AdventurerSetContents", "Backpack, Waterskin, Blanket, 6 Torches, Tinderbox, 10 m Rope, Small Knife",
     "Рюкзак, бурдюк, одеяло, 6 факелов, огниво, верёвка 10 м, нож"),
    ("Consumables", "Consumables", "Расходники"),
    ("ItemsInPossession", "Items in Possession, etc.", "Имущество"),
    ("Qty", "Qty", "Кол."),
    ("Uses", "Uses", "Заряды"),
    ("Price", "Price", "Цена"),
    ("DropItems", "Drop items here", "Перетащите предметы сюда"),
    ("DropEffects", "No effects — drop a condition preset here", "Эффектов нет — перетащите пресет состояния"),
    ("HistoryProfile", "History, Profile", "История, профиль"),
    ("Details", "Details", "Подробности"),
    ("NoDescription", "No description.", "Нет описания."),
])
group("SW25.AdvRank", [
    ("label", "Adventurer Rank", "Ранг авантюриста"),
    ("none", "None", "Нет"), ("dagger", "Dagger", "Кинжал"), ("rapier", "Rapier", "Рапира"),
    ("broadSword", "Broad Sword", "Палаш"), ("greatSword", "Great Sword", "Двуручный меч"), ("flamberge", "Flamberge", "Фламберг"),
    ("sentinel", "Sentinel", "Сентинел"), ("hyperion", "Hyperion", "Гиперион"), ("genesis", "Sword of Genesis", "Меч Творения"),
    ("FreeHint", "Renowned Items costing up to {free} Reputation are free at this rank", "На этом ранге именные предметы стоимостью до {free} репутации бесплатны"),
    ("UpHint", "Promote to {rank} for {cost} Reputation (Shift: free)", "Повысить до ранга «{rank}» за {cost} репутации (Shift — бесплатно)"),
    ("DownHint", "Step the rank down, refunding its Reputation (Shift: no refund)", "Понизить ранг с возвратом репутации (Shift — без возврата)"),
    ("Promoted", "{name} is now {rank}", "{name}: новый ранг — {rank}"),
])
group("SW25.Lang", [
    ("tradeCommon", "Trade Common", "Торговый общий"), ("regional", "Regional", "Региональный"),
    ("ancientCelestial", "Ancient Celestial", "Древний небесный"), ("arcana", "Arcana", "Аркана"), ("magitech", "Magitech", "Магитех"),
    ("sylvan", "Sylvan", "Сильван"), ("daemonic", "Daemonic", "Демонический"), ("barbaric", "Barbaric", "Варварский"),
    ("elven", "Elven", "Эльфийский"), ("dwarven", "Dwarven", "Дварфийский"), ("grassrunner", "Grassrunner", "Грассраннерский"),
    ("lycant", "Lycant", "Ликантский"), ("giantish", "Giantish", "Великаний"), ("drakish", "Drakish", "Дрейкский"),
    ("dragonic", "Dragonic", "Драконий"), ("youma", "Youma", "Ёма"), ("seaAnimal", "Sea Animal", "Морских зверей"),
    ("nosferatu", "Nosferatu", "Носферату"), ("basilisk", "Basilisk", "Василисков"), ("aviary", "Aviary", "Птичий"),
    ("lizardman", "Lizardman", "Ящеролюдов"),
])
add("SW25.PowerTable.Title", "Power Table", "Таблица силы")
add("SW25.Checks.Combat", "Resistances & combat", "Сопротивления и бой")

# --- Monster sheet & template ---------------------------------------------------
group("SW25.Monster", [
    ("AddSection", "Add fighting style (section)", "Добавить способ атаки (секцию)"),
    ("AddSkill", "Add unique skill", "Добавить особое умение"),
    ("Classification", "Classification", "Классификация"),
    ("EditMode", "Edit the stat block", "Редактировать статблок"),
    ("GMOnly", "GM only", "только ГМ"),
    ("MovementSpeed", "Movement speed", "Скорость"),
    ("NoSections", "No fighting styles yet — add one in edit mode", "Способов атаки нет — добавьте в режиме редактирования"),
    ("SectionCount", "Number of sections", "Число секций"),
    ("SectionNameHint", "Section name (Head, Body…). Parts with the same name are numbered: Wing 1, Wing 2", "Название секции (Голова, Тело…). Части с одним названием нумеруются: Крыло 1, Крыло 2"),
    ("SectionOrdinalHint", "Number of this part among the sections with the same name", "Номер этой части среди секций с тем же названием"),
    ("DuplicateSection", "Duplicate: another identical part with its own HP and MP", "Дублировать: ещё одна такая же часть со своими HP и MP"),
    ("MainSectionPlaceholder", "as marked with the crown", "по отметкам короной"),
    ("MainSectionHint", "Book text of the main section. “None”: defeated when every section falls; “(All)”: when every main section (crown) falls; otherwise when any main section falls.",
     "Текст главной секции из книги. «None» — побеждён, когда падают все секции; «(All)» — когда падают все главные (с короной); иначе — когда падает любая главная."),
    ("StyleSection", "Fight. Style (section)", "Способ атаки (секция)"),
    ("TotalHint", "Sum of all sections", "Сумма по всем секциям"),
])
add("SW25.Loot.Add", "Add loot row", "Добавить строку добычи")
group("SW25.Mount", [
    ("AddLevel", "Add level row", "Добавить уровень"),
    ("ClearJockey", "Remove jockey", "Убрать жокея"),
    ("CurrentLevel", "Current level (from the jockey's adventurer level)", "Текущий уровень (по уровню авантюриста жокея)"),
    ("FortShort", "Fort", "Стойк."),
    ("WillShort", "Will", "Воля"),
    ("LevelMin", "Appropriate level from", "Подходящий уровень от"),
    ("LevelMax", "to", "до"),
    ("NoLevels", "No level rows yet — add one in edit mode", "Строк уровней нет — добавьте в режиме редактирования"),
    ("PriceBuy", "Price", "Цена"),
    ("PriceRent", "Rent", "Аренда"),
    ("ProprietaryHint", "Owned mount: +10 HP", "Собственный скакун: +10 HP"),
])
group("SW25.WeakPoint", [
    ("Kind", "Weak point type", "Тип слабого места"), ("DamageType", "Damage type", "Тип урона"), ("Value", "Value", "Величина"),
])
group("SW25.Template", [
    ("Title", "Monster from template", "Монстр по шаблону"),
    ("TitleApply", "Template: {name}", "Шаблон: {name}"),
    ("Sidebar", "Monster (template)", "Монстр по шаблону"),
    ("Apply", "Fill the stat block from a template", "Заполнить статблок по шаблону"),
    ("ApplyButton", "Apply", "Применить"),
    ("CreateButton", "Create monster", "Создать монстра"),
    ("BlankHint", "Blank stat block: fill it in by hand, or start from the typical values of a level.",
     "Пустой статблок: заполните вручную или начните с типичных значений для уровня."),
    ("Use", "Use a template…", "Шаблон…"),
    ("ConfirmTitle", "Apply template", "Применить шаблон"),
    ("ConfirmApply", "Replace the stats of {name} (sections, resistances, target numbers)? Unique skills, loot and description are kept.",
     "Заменить показатели «{name}» (секции, сопротивления, СЛ)? Особые умения, добыча и описание сохранятся."),
    ("Hint", "Typical values for the level come from the bestiary (medians of its 303 monsters); the role shifts them a little. Everything stays editable afterwards.",
     "Типичные значения уровня взяты из бестиария (медианы по 303 монстрам), роль немного их смещает. Всё можно поправить потом."),
    ("Identity", "Also use the classification's usual intelligence, perception, languages, weak point and movement",
     "Также взять обычные для классификации интеллект, восприятие, языки, слабое место и скорость"),
    ("NewName", "New monster", "Новый монстр"),
    ("Preview", "Preview", "Предпросмотр"),
    ("PreviewHint", "Values in parentheses are fixed values (standard + 7).", "В скобках — фиксированные значения (стандарт + 7)."),
    ("RoleLabel", "Role", "Роль"),
    ("SectionCount", "Sections", "Секций"),
    ("SectionNames", "Section names", "Названия секций"),
    ("SectionNamesHint", "Head, Body, Wing (the first is the main one)", "Голова, Тело, Крыло (первая — основная)"),
    ("ShardHint", "Sword shards (boss enhancement): +5 HP and +1 MP each to the main section, bonus to resistances",
     "Осколки мечей (усиление босса): +5 HP и +1 MP основной секции за каждый, бонус к сопротивлениям"),
    ("ShardSummary", "{shards} sword shards: +{hp} HP, resistances +{resist}", "Осколков мечей: {shards} — +{hp} HP, сопротивления +{resist}"),
])
group("SW25.Template.Role", [
    ("standard", "Standard", "Обычный"),
    ("brute", "Brute (more HP and damage)", "Громила (больше HP и урона)"),
    ("skirmisher", "Skirmisher (evasive, accurate)", "Ловкач (уклонение и точность)"),
    ("tank", "Defender (defense and HP)", "Защитник (защита и HP)"),
    ("caster", "Caster (MP and willpower)", "Заклинатель (MP и воля)"),
])

# --- Warnings -----------------------------------------------------------------
group("SW25.Warn", [
    ("NotEnoughReputation", "Not enough Reputation: {cost} needed, {have} available.", "Не хватает репутации: нужно {cost}, есть {have}."),
    ("NotEnoughMoney", "Not enough money: {cost} G needed, {have} G available.", "Не хватает денег: нужно {cost} G, есть {have} G."),
    ("WrongSlot", "{name} cannot be worn there.", "{name} нельзя надеть сюда."),
    ("NotHoldable", "{name} is not held in the hands.", "{name} не держат в руках."),
    ("HandsFull", "{name}: the hands hold more than they can (see Hands on the Combat tab).", "{name}: в руках больше, чем они могут удержать (см. «Руки» на вкладке боя)."),
    ("AbilityLevel", "{name} requires a higher class level.", "{name} требует более высокий уровень класса."),
    ("CannotCast", "This actor cannot cast {system}.", "Этот персонаж не владеет: {system}."),
    ("FairyElements", "Only four fairy types can be chosen.", "Можно выбрать только четыре стихии фей."),
    ("MaxLevel", "This class is already at the maximum level.", "Класс уже максимального уровня."),
    ("NoBackgrounds", "The race has no background table.", "У расы нет таблицы предысторий."),
    ("NoBullets", "No bullet spells available (Artificer level too low?).", "Нет доступных заклинаний пуль (низкий уровень магитехника?)."),
    ("NoControlled", "Select at least one token.", "Выберите хотя бы один токен."),
    ("NoGM", "No GM is connected to perform this action.", "Нет подключённого ГМа для этого действия."),
    ("NoRace", "Add a race first.", "Сначала добавьте расу."),
    ("NoTargetsForEffect", "Target tokens (T) to apply the effect.", "Выберите цели (T), чтобы наложить эффект."),
    ("NoTargets", "Target tokens (T) first.", "Сначала выберите цели (T)."),
    ("GMApplies", "Only the GM applies this.", "Это применяет только ГМ."),
    ("NotSourceOwner", "Only the owner of {name} (or the GM) applies its effects.", "Эффекты {name} применяет только его владелец (или ГМ)."),
    ("SelectSource", "Select the token of {name} to apply its effect.", "Выделите токен {name}, чтобы применить его эффект."),
    ("NotEnoughCards", "Not enough {color} cards of rank {rank}.", "Недостаточно карт ({color}) ранга {rank}."),
    ("NotEnoughExp", "Not enough experience: {cost} needed, {have} available.", "Недостаточно опыта: нужно {cost}, есть {have}."),
    ("NotEnoughMP", "Not enough MP for {name}.", "Недостаточно MP для {name}."),
    ("NotEnoughRhythm", "Not enough rhythm for {name}.", "Недостаточно ритма для {name}."),
    ("NotEquipped", "{name} is not equipped.", "{name} не экипировано."),
    ("NotOwner", "You don't own this actor.", "Вы не владеете этим персонажем."),
    ("Prerequisites", "{name}: prerequisites not met ({missing}).", "{name}: требования не выполнены ({missing})."),
    ("RestrictedClass", "This race cannot learn {name}.", "Эта раса не может изучить {name}."),
    ("SpellLevel", "{name} is above your class level.", "{name} выше уровня вашего класса."),
    ("TooManyLearned", "Learning {name} exceeds the number allowed by the class level.", "Изучение {name} превышает лимит по уровню класса."),
])

# --- Settings -----------------------------------------------------------------
settings = [
    ("monsterFixedValues", "Monsters use fixed values", "Монстры используют фикс. значения",
     "Monster checks use fixed values (standard + 7) by default instead of rolling.", "Проверки монстров по умолчанию используют фикс. значения (стандарт + 7) вместо броска."),
    ("skipRollDialog", "Skip roll dialogs", "Пропускать диалоги бросков",
     "Roll immediately; hold Shift to show the dialog.", "Бросать сразу; удерживайте Shift, чтобы открыть диалог."),
    ("autoFailureExp", "Automatic failure grants 50 EXP", "Автопровал даёт 50 опыта",
     "Add 50 experience to a character who rolls double 1s.", "Начислять 50 опыта персонажу при двух единицах."),
    ("autoStatus", "Automatic unconscious / defeated", "Авто-статусы «без сознания» / «повержен»",
     "Toggle statuses when HP drops to 0 or below.", "Включать статусы при падении HP до 0 и ниже."),
    ("autoIdentify", "Monster Knowledge identifies targets", "Знание монстров опознаёт цели",
     "A Monster Knowledge check marks targeted monsters as identified / weak point revealed.", "Проверка знания монстров отмечает цели опознанными / со слабым местом."),
    ("autoFeats", "Grant automatic combat feats", "Выдавать автоматические боевые умения",
     "Add feats gained at class levels (e.g. Chain Attack) automatically.", "Автоматически добавлять умения, получаемые на уровнях классов (например, Chain Attack)."),
    ("sharedDamageRoll", "Share damage roll between targets", "Общий бросок урона для целей",
     "Roll damage once for all unresisted targets (the rules roll separately).", "Бросать урон один раз для всех целей без сопротивления (по правилам — отдельно)."),
    ("hideMonsterDamage", "Whisper monster damage to the GM", "Урон монстрам — только ГМу", "", ""),
    ("hideUnidentified", "Hide unidentified monster stats", "Скрывать данные неопознанных монстров",
     "Players can't see stats of monsters that were not identified.", "Игроки не видят показатели неопознанных монстров."),
    ("damageLog", "Damage log in chat", "Журнал урона в чате", "", ""),
    ("showResourceTracker", "Show resource tracker", "Показывать трекер ресурсов",
     "Floating panel with the selected token's HP/MP and trackers. Also turned on and off by the heart of the Token Controls and the X of its window.",
     "Плавающая панель с HP/MP и ресурсами выбранного токена. Включается и выключается и кнопкой с сердцем на панели токенов, и крестиком окна."),
    ("showCombatPanel", "Show combat panel", "Показывать боевую панель",
     "Floating panel of the selected token for combat: defenses and combat checks, attacks, spells, class abilities, usable items and resources. While open it replaces the resource tracker. Also opened by the swords of the Token Controls.",
     "Плавающая панель выбранного токена для боя: защита и боевые проверки, атаки, заклинания, способности классов, расходники и ресурсы. Пока она открыта, она заменяет трекер ресурсов. Открывается и кнопкой с мечами на панели токенов."),
    ("showEffectsPanel", "Show effects panel", "Показывать панель эффектов",
     "Icons of the effects and conditions of the selected token (or your character) in the top right corner of the canvas: click turns an effect off or on, right-click removes it.",
     "Значки эффектов и состояний выбранного токена (или вашего персонажа) в правом верхнем углу поля: клик выключает или включает эффект, правый клик снимает его."),
]
for k, en, ru, hen, hru in settings:
    add(f"SW25.Setting.{k}.Name", en, ru)
    add(f"SW25.Setting.{k}.Hint", hen, hru)
group("SW25.Setting.damageLog", [("All", "Everyone", "Всем"), ("GM", "GM only", "Только ГМу"), ("None", "Off", "Выключено")])

# --- Log ----------------------------------------------------------------------
group("SW25.Log", [
    ("Took", "takes {amount} {resource} damage", "получает {amount} урона ({resource})"),
    ("Healed", "recovers {amount} {resource}", "восстанавливает {amount} {resource}"),
    ("Unconscious", "falls unconscious — Death Check!", "теряет сознание — проверка смерти!"),
    ("Down", "is down.", "повержен."), ("Undo", "Undo", "Отменить"),
])

# --- Misc -----------------------------------------------------------------------

# ------------------------------------------------------------------------------


def nest(lang_index):
    out = {}
    for key, pair in sorted(T.items()):
        parts = key.split(".")
        node = out
        for p in parts[:-1]:
            if p in node and not isinstance(node[p], dict):
                # A leaf and a branch share a name: keep the leaf as "label" of the branch
                node[p] = {"_": node[p]}
            node = node.setdefault(p, {})
        leaf = parts[-1]
        if leaf in node and isinstance(node[leaf], dict):
            node[leaf]["_"] = pair[lang_index]
        else:
            node[leaf] = pair[lang_index]
    return out


def flatten_conflicts(tree):
    # Foundry resolves "a.b" as nested lookups; a key that is both leaf and branch cannot exist.
    # We keep branches and move the leaf to "<key>" at the parent using the branch's "_" entry.
    for k, v in list(tree.items()):
        if isinstance(v, dict):
            flatten_conflicts(v)
    return tree


def main():
    LANG.mkdir(parents=True, exist_ok=True)
    for idx, name in ((0, "en"), (1, "ru")):
        data = flatten_conflicts(nest(idx))
        (LANG / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    # Report conflicts (leaf+branch)
    conflicts = []

    def walk(node, path):
        for k, v in node.items():
            if isinstance(v, dict):
                if "_" in v:
                    conflicts.append(".".join(path + [k]))
                walk(v, path + [k])
    walk(nest(0), [])
    print(f"{len(T)} keys written")
    if conflicts:
        print("Leaf/branch conflicts (use a different key):", conflicts)


if __name__ == "__main__":
    main()
