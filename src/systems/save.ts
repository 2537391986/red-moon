import type { GameState, Player, ProgressState, StageRuntime, StageConfig, OfflineReward, Stats } from '../game/types';
import { TALENTS } from '../data/skills';
import { GAME_CONFIG } from '../data/config';
import { STAGES, DEFAULT_STAGE_ID, getStageById } from '../data/stages';
import { makeEquipment } from './loot';

const KEY = 'mir-pwa-save-v1';

let _statsCache: { player: Player; result: Stats; affixCache: Record<string, number> } | null = null;

export function invalidateStatsCache(): void {
  _statsCache = null;
}

export function totalStats(player: Player): Stats {
  if (_statsCache && _statsCache.player === player) return _statsCache.result;
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
  _statsCache = { player, result: stats, affixCache: {} };
  return _statsCache.result;
}

/** 缓存版词条统计 — 避免每帧重复遍历装备槽位 */
export function getAffixTotal(player: Player, affixId: string): number {
  if (!_statsCache || _statsCache.player !== player) {
    // 未命中缓存时 fallback 到实时计算（低频路径）
    let total = 0;
    for (const item of Object.values(player.equipment)) {
      if (!item?.affixes) continue;
      for (const a of item.affixes) {
        if (a.id === affixId) total += a.value;
      }
    }
    return total;
  }
  if (!(affixId in _statsCache.affixCache)) {
    let total = 0;
    for (const item of Object.values(player.equipment)) {
      if (!item?.affixes) continue;
      for (const a of item.affixes) {
        if (a.id === affixId) total += a.value;
      }
    }
    _statsCache.affixCache[affixId] = total;
  }
  return _statsCache.affixCache[affixId];
}

export function saveGame(state: GameState): void {
  const data = {
    player: state.player,
    skills: state.skills.map((skill) => ({ ...skill, remaining: 0 })),
    time: state.time,
    progress: state.progress,
    lastOnlineTime: Date.now(),
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
      // 横版物理字段
      if (data.player.velY === undefined) data.player.velY = 0;
      if (data.player.grounded === undefined) data.player.grounded = true;
      if (data.player.coyoteTimer === undefined) data.player.coyoteTimer = 0;
      if (data.player.jumpCount === undefined) data.player.jumpCount = 0;
      if (data.player.maxJumpCount === undefined) data.player.maxJumpCount = 1;
      // 装备补 affixes
      for (const item of Object.values(data.player.equipment)) {
        if (item && !item.affixes) item.affixes = [];
      }
      for (const item of data.player.inventory) {
        if (item && item.type === 'equipment' && !item.affixes) item.affixes = [];
      }
    }
    // 关卡进度
    if (!data.progress) data.progress = makeDefaultProgress();
    if (data.lastOnlineTime === undefined) data.lastOnlineTime = Date.now();
    return data;
  } catch {
    localStorage.removeItem(KEY);
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(KEY);
}

/* ──────── 关卡系统辅助 ──────── */

/** 创建默认关卡进度 */
export function makeDefaultProgress(): ProgressState {
  return {
    currentStageId: DEFAULT_STAGE_ID,
    highestUnlockedStageId: DEFAULT_STAGE_ID,
    records: {},
    totalOfflineSeconds: 0,
    totalStagesCleared: 0,
  };
}

/** 创建关卡运行时状态 */
export function makeStageRuntime(stageId: string): StageRuntime {
  return {
    stageId,
    phase: 'running',
    elapsed: 0,
    playerX: 0,
    triggeredWaveIds: [],
    killedMonsterIds: [],
    spawnedTotal: 0,
    killedTotal: 0,
    bossSpawned: false,
    bossKilled: false,
    reachedEnd: false,
    clearTimer: 0,
    transitionTimer: 0,
  };
}

/* ──────── 离线收益 ──────── */

/** 估算离线每分钟击杀数 */
function getOfflineKillsPerMin(stage: StageConfig): number {
  const base = 6;
  const difficultyPenalty = 1 / Math.max(1, stage.difficulty.monsterHpMultiplier);
  return base * difficultyPenalty;
}

/** 计算离线收益 */
export function calculateOfflineReward(
  progress: ProgressState,
  lastOnlineTime: number,
  now: number,
): OfflineReward {
  const rawSeconds = Math.max(0, Math.floor((now - lastOnlineTime) / 1000));
  const cappedSeconds = Math.min(rawSeconds, GAME_CONFIG.OFFLINE.MAX_OFFLINE_SECONDS);
  const capped = rawSeconds > GAME_CONFIG.OFFLINE.MAX_OFFLINE_SECONDS;

  const stageId = progress.currentStageId || progress.highestUnlockedStageId || DEFAULT_STAGE_ID;
  const stage = getStageById(stageId) ?? STAGES[0];

  const minutes = cappedSeconds / 60;
  const rate = GAME_CONFIG.OFFLINE.EFFICIENCY_RATE;

  const gold = Math.floor(stage.offline.baseGoldPerMin * minutes * rate);
  const exp = Math.floor(stage.offline.baseExpPerMin * minutes * rate);

  const estimatedKills = Math.floor(minutes * getOfflineKillsPerMin(stage));
  const itemRolls = Math.min(20, Math.floor(estimatedKills / 15));

  const items = [];
  for (let i = 0; i < itemRolls; i++) {
    if (Math.random() < 0.35) {
      items.push(makeEquipment(stage.recommendedLevel));
    }
  }

  return {
    offlineSeconds: rawSeconds,
    cappedSeconds,
    stageId: stage.id,
    gold,
    exp,
    estimatedKills,
    itemRolls,
    items,
    capped,
  };
}

/** 发放离线收益到玩家 */
export function applyOfflineReward(player: Player, reward: OfflineReward): void {
  player.gold += reward.gold;
  player.exp += reward.exp;
  for (const item of reward.items) {
    if (player.inventory.length < GAME_CONFIG.INVENTORY_MAX_SIZE) {
      player.inventory.push(item);
    }
  }
}
