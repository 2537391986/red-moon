import { AFFIX_DEFS, AFFIX_SLOTS, EQUIP_PREFIX } from '../data/tables';
import { SKILL_DEFS } from '../data/skills';
import type { Affix, Drop, EquipSlot, EquipmentItem, Item, Rarity, SkillBookItem, Stats } from '../game/types';

let nextId = 1;
const slots: EquipSlot[] = ['weapon', 'armor', 'helmet', 'necklace', 'ring'];
const rarities: Rarity[] = ['普通', '精良', '稀有', '史诗', '传说'];
const rarityBonus: Record<Rarity, number> = { 普通: 1, 精良: 1.35, 稀有: 1.8, 史诗: 2.45, 传说: 3.3 };

export function uid(prefix: string): string {
  nextId += 1;
  return `${prefix}-${Date.now().toString(36)}-${nextId.toString(36)}`;
}

function pickRarity(level: number, boss: boolean): Rarity {
  const roll = Math.random() + (boss ? 0.22 : 0) + Math.min(level / 160, 0.18);
  if (roll > 1.1) return '传说';
  if (roll > 0.92) return '史诗';
  if (roll > 0.72) return '稀有';
  if (roll > 0.42) return '精良';
  return '普通';
}

export function makePotion(level: number): Item {
  const heal = 80 + level * 16;
  return { id: uid('potion'), type: 'potion', name: `金创药(${heal})`, heal, price: Math.floor(heal * 0.55) };
}

function generateAffixes(rarity: Rarity, level: number): Affix[] {
  const maxSlots = AFFIX_SLOTS[rarity];
  if (maxSlots === 0) return [];
  const rank = rarities.indexOf(rarity);
  const pool = AFFIX_DEFS.filter((d) => rarities.indexOf(d.minRarity) <= rank);
  if (pool.length === 0) return [];

  const totalWeight = pool.reduce((s, d) => s + d.weight, 0);
  const picked: Affix[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < maxSlots && pool.length - usedIds.size > 0; i++) {
    let roll = Math.random() * totalWeight;
    for (const def of pool) {
      if (usedIds.has(def.id)) continue;
      roll -= def.weight;
      if (roll <= 0) {
        usedIds.add(def.id);
        // 数值范围: 基础值 × (1 + 稀有度加成 + 等级缩放)
        const base = 5 + rank * 3;
        const value = Math.round(base + Math.random() * level * 0.4);
        picked.push({ id: def.id, value });
        break;
      }
    }
  }
  return picked;
}

export function makeEquipment(level: number, boss = false): EquipmentItem {
  const slot = slots[Math.floor(Math.random() * slots.length)];
  const rarity = pickRarity(level, boss);
  const rank = rarities.indexOf(rarity);
  const names = EQUIP_PREFIX[slot];
  const name = `${rarity}${names[Math.min(rank, names.length - 1)]}`;
  const power = Math.max(1, Math.round(level * rarityBonus[rarity]));
  const stats: Partial<Stats> = {};

  if (slot === 'weapon') stats.attack = 4 + power * 2;
  if (slot === 'armor') stats.defense = 2 + power;
  if (slot === 'helmet') {
    stats.maxHp = 20 + power * 8;
    stats.defense = 1 + Math.floor(power / 2);
  }
  if (slot === 'necklace') {
    stats.attack = 1 + power;
    stats.crit = Math.min(0.22, 0.02 + rank * 0.025);
  }
  if (slot === 'ring') {
    stats.attack = 2 + power;
    stats.lifeSteal = rank >= 2 ? 0.02 + rank * 0.01 : 0;
  }

  if (rarity === '史诗' || rarity === '传说') {
    stats.maxHp = (stats.maxHp ?? 0) + power * 5;
  }

  const affixes = generateAffixes(rarity, level);
  return { id: uid('equip'), type: 'equipment', name, slot, rarity, level, stats, affixes, price: 35 + power * (12 + rank * 8) };
}

/** 生成技能书掉落 */
export function makeSkillBook(level: number): SkillBookItem {
  const ids = Object.keys(SKILL_DEFS);
  const skillId = ids[Math.floor(Math.random() * ids.length)];
  const def = SKILL_DEFS[skillId];
  return { id: uid('skillbook'), type: 'skillBook', name: `技能书·${def.name}`, skillId, price: 50 + level * 10 };
}

export function makeDrops(x: number, y: number, level: number, boss: boolean): Drop[] {
  const drops: Drop[] = [];
  const gold = Math.floor((boss ? 120 : 12) + level * (boss ? 16 : 4) + Math.random() * level * 8);
  drops.push({ id: uid('gold'), pos: { x: x + Math.random() * 36 - 18, y: y + Math.random() * 36 - 18 }, gold, ttl: 90 });

  const equipChance = boss ? 1 : 0.26 + level * 0.012;
  if (Math.random() < equipChance) {
    drops.push({ id: uid('drop'), pos: { x: x + Math.random() * 44 - 22, y: y + Math.random() * 44 - 22 }, item: makeEquipment(level, boss), ttl: 90 });
  }
  if (Math.random() < 0.38) {
    drops.push({ id: uid('drop'), pos: { x: x + Math.random() * 44 - 22, y: y + Math.random() * 44 - 22 }, item: makePotion(level), ttl: 90 });
  }
  // 技能书掉落: boss 25%, 普通怪 8%
  const bookChance = boss ? 0.25 : 0.08;
  if (Math.random() < bookChance) {
    drops.push({ id: uid('drop'), pos: { x: x + Math.random() * 44 - 22, y: y + Math.random() * 44 - 22 }, item: makeSkillBook(level), ttl: 90 });
  }
  return drops;
}
