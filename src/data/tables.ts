import type { AffixDef, EquipSlot, MonsterKind, Rarity } from '../game/types';

export const SLOT_NAMES: Record<EquipSlot, string> = {
  weapon: '武器',
  armor: '衣服',
  helmet: '头盔',
  necklace: '项链',
  ring: '戒指'
};

export const EQUIP_PREFIX: Record<EquipSlot, string[]> = {
  weapon: ['青铜剑', '修罗斧', '炼狱', '裁决之杖', '屠龙'],
  armor: ['布衣', '轻盔甲', '战神盔甲', '天魔神甲', '圣战宝甲'],
  helmet: ['青铜头盔', '祈祷头盔', '黑铁头盔', '圣战头盔', '赤月冠'],
  necklace: ['传统项链', '珊瑚项链', '绿色项链', '圣战项链', '赤月链'],
  ring: ['古铜戒指', '骷髅戒指', '力量戒指', '圣战戒指', '赤月戒']
};

export const MONSTER_BASE: Record<MonsterKind, { color: string; hp: number; attack: number; defense: number; speed: number; exp: number }> = {
  稻草人: { color: '#c8a45f', hp: 36, attack: 6, defense: 1, speed: 36, exp: 12 },
  半兽人: { color: '#7fac58', hp: 72, attack: 13, defense: 4, speed: 44, exp: 32 },
  骷髅战士: { color: '#d6d0c0', hp: 128, attack: 22, defense: 8, speed: 50, exp: 76 },
  沃玛卫士: { color: '#7e67bd', hp: 260, attack: 38, defense: 16, speed: 56, exp: 180 },
  赤月恶魔: { color: '#bf2a24', hp: 1600, attack: 88, defense: 36, speed: 42, exp: 1200 }
};

/** 特殊词条定义 —— 扩展只需追加条目 */
export const AFFIX_DEFS: AffixDef[] = [
  { id: 'crit_damage',     name: '暴击强化', description: '暴击时额外造成{v}%伤害',         minRarity: '稀有', weight: 10 },
  { id: 'double_strike',   name: '连击',     description: '攻击有{v}%概率追加一次普攻',     minRarity: '史诗', weight: 6 },
  { id: 'thorns',          name: '荆棘',     description: '受击时反弹{v}%伤害给攻击者',     minRarity: '稀有', weight: 8 },
  { id: 'hp_regen',        name: '生命回复', description: '每秒回复{v}点生命值',           minRarity: '精良', weight: 12 },
  { id: 'dodge',           name: '闪避',     description: '有{v}%概率闪避攻击',             minRarity: '史诗', weight: 5 },
  { id: 'execute',         name: '斩杀',     description: '对生命<30%的敌人伤害+{v}%',     minRarity: '传说', weight: 4 },
  { id: 'lifesteal_boost', name: '吸血强化', description: '生命偷取效果+{v}%',             minRarity: '稀有', weight: 7 },
];

/** 稀有度 → 最大词条数 */
export const AFFIX_SLOTS: Record<Rarity, number> = {
  普通: 0, 精良: 1, 稀有: 1, 史诗: 2, 传说: 3,
};
