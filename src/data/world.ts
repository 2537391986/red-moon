import type { Zone } from '../game/types';

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
