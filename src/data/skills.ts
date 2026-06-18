import type { ClassDef, SkillDef, TalentNode } from '../game/types';

/** 技能定义表 —— 新增技能只需追加条目 */
export const SKILL_DEFS: Record<string, SkillDef> = {
  fire:    { id: 'fire',    name: '烈火剑法', description: '聚火于刃，一击焚烧',     cooldown: 4, range: 92,  radius: 36, multiplier: 2.4,  color: '#ff7733', style: 'line',      tier: 1 },
  thunder: { id: 'thunder', name: '雷电术',   description: '召雷远击，贯穿敌群',     cooldown: 6, range: 210, radius: 52, multiplier: 1.8,  color: '#77c8ff', style: 'lightning', tier: 2 },
  moon:    { id: 'moon',    name: '半月弯刀', description: '弧光横扫，伤及周身',     cooldown: 8, range: 116, radius: 96, multiplier: 1.35, color: '#d8e6ff', style: 'arc',       tier: 2 },
};

/** 职业定义 —— 每个职业拥有初始技能和专属天赋树 */
export const CLASSES: Record<string, ClassDef> = {
  warrior: {
    id: 'warrior', name: '战士', description: '近战高攻，以力破敌',
    starterSkills: ['fire'],
    talents: ['power_strike', 'tough_skin', 'fire_mastery'],
  },
  mage: {
    id: 'mage', name: '法师', description: '远程法术，雷火无情',
    starterSkills: ['thunder'],
    talents: ['arcane_power', 'mana_shield', 'thunder_mastery'],
  },
};

/** 天赋节点 —— value 为每级加成比例 */
export const TALENTS: Record<string, TalentNode> = {
  power_strike:    { id: 'power_strike',    name: '强化打击', description: '攻击力+5%',  maxRank: 3, effect: { kind: 'stat_boost', stat: 'attack',    value: 0.05 } },
  tough_skin:      { id: 'tough_skin',      name: '铁布衫',   description: '防御力+8%',  maxRank: 3, effect: { kind: 'stat_boost', stat: 'defense',   value: 0.08 } },
  fire_mastery:    { id: 'fire_mastery',    name: '烈火精通', description: '烈火剑法伤害+15%', maxRank: 3, requires: ['power_strike'], effect: { kind: 'skill_boost', skillId: 'fire', stat: 'multiplier', value: 0.15 } },
  arcane_power:    { id: 'arcane_power',    name: '奥术之力', description: '攻击力+6%',  maxRank: 3, effect: { kind: 'stat_boost', stat: 'attack',    value: 0.06 } },
  mana_shield:     { id: 'mana_shield',     name: '法力护盾', description: '最大生命+8%', maxRank: 3, effect: { kind: 'stat_boost', stat: 'maxHp',     value: 0.08 } },
  thunder_mastery: { id: 'thunder_mastery', name: '雷电精通', description: '雷电术伤害+15%', maxRank: 3, requires: ['arcane_power'], effect: { kind: 'skill_boost', skillId: 'thunder', stat: 'multiplier', value: 0.15 } },
};
