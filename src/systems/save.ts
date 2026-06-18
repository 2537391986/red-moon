import type { GameState, Player, Stats } from '../game/types';

const KEY = 'mir-pwa-save-v1';

export function totalStats(player: Player): Stats {
  const stats: Stats = { ...player.base };
  for (const item of Object.values(player.equipment)) {
    if (!item) continue;
    stats.maxHp += item.stats.maxHp ?? 0;
    stats.attack += item.stats.attack ?? 0;
    stats.defense += item.stats.defense ?? 0;
    stats.crit += item.stats.crit ?? 0;
    stats.lifeSteal += item.stats.lifeSteal ?? 0;
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
    return JSON.parse(raw) as Partial<GameState>;
  } catch {
    localStorage.removeItem(KEY);
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(KEY);
}
