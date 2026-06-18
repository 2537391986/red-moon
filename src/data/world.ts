import type { Skill, Zone } from '../game/types';

export const WORLD = { width: 2400, height: 1600 };

export const ZONES: Zone[] = [
  { name: '盟重安全区', x: 900, y: 600, w: 520, h: 380, level: 1, color: '#31412a' },
  { name: '毒蛇山谷', x: 80, y: 120, w: 640, h: 460, level: 3, color: '#25361d' },
  { name: '兽人古道', x: 1500, y: 120, w: 720, h: 520, level: 8, color: '#3d2c1e' },
  { name: '沃玛寺庙', x: 160, y: 930, w: 700, h: 520, level: 15, color: '#2a243c' },
  { name: '赤月峡谷', x: 1430, y: 950, w: 760, h: 500, level: 25, color: '#421916' }
];

export const SHOP_POS = { x: 1160, y: 760 };
export const RESPAWN_POS = { x: 1160, y: 790 };

export const STARTER_SKILLS: Skill[] = [
  { id: 'fire', name: '烈火剑法', cooldown: 4, remaining: 0, range: 92, radius: 36, multiplier: 2.4, color: '#ff7733' },
  { id: 'thunder', name: '雷电术', cooldown: 6, remaining: 0, range: 210, radius: 52, multiplier: 1.8, color: '#77c8ff' },
  { id: 'moon', name: '半月弯刀', cooldown: 8, remaining: 0, range: 116, radius: 96, multiplier: 1.35, color: '#d8e6ff' }
];

export const RARITY_COLOR = {
  普通: '#e6d6ad',
  精良: '#74d67a',
  稀有: '#64a8ff',
  史诗: '#c57cff',
  传说: '#ffb13d'
} as const;
