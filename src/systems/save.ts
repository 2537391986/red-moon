import type { GameState, Player, Stats } from '../game/types';
import { TALENTS } from '../data/skills';

const KEY = 'mir-pwa-save-v1';

export function totalStats(player: Player): Stats {
  const stats: Stats = { ...player.base };
  // 装备基础属性
  for (const item of Object.values(player.equipment)) {
    if (!item) continue;
    stats.maxHp += item.stats.maxHp ?? 0;
    stats.attack += item.stats.attack ?? 0;
    stats.defense += item.stats.defense ?? 0;
    stats.crit += item.stats.crit ?? 0;
    stats.lifeSteal += item.stats.lifeSteal ?? 0;
  }
  // 天赋加成 (stat_boost 类型按百分比叠加)
  if (player.talents) {
    for (const [tid, rank] of Object.entries(player.talents)) {
      if (rank <= 0) continue;
      const node = TALENTS[tid];
      if (!node) continue;
      if (node.effect.kind === 'stat_boost') {
        const base = player.base[node.effect.stat] as number;
        (stats as Record<string, number>)[node.effect.stat] += Math.round(base * node.effect.value * rank);
      }
    }
  }
  return stats;
}

export function saveGame(state: GameState): void {
  const data = {
    player: state.player,
    skills: state.skills.map((skill) => ({ ...skill, remaining: 0 })),
    time: state.time
  };
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function loadGame(): Partial<GameState> | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<GameState>;
    // 向后兼容: 旧存档补默认值
    if (data.player) {
      if (data.player.talentPoints === undefined) data.player.talentPoints = 0;
      if (!data.player.talents) data.player.talents = {};
      if (data.player.regenTimer === undefined) data.player.regenTimer = 0;
      // 装备补 affixes
      for (const item of Object.values(data.player.equipment)) {
        if (item && !item.affixes) item.affixes = [];
      }
      for (const item of data.player.inventory) {
        if (item && item.type === 'equipment' && !item.affixes) item.affixes = [];
      }
    }
    return data;
  } catch {
    localStorage.removeItem(KEY);
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(KEY);
}
