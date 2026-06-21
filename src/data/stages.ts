import type { StageConfig } from '../game/types';

/**
 * 线性关卡配置 — 横版卷轴闯关
 * monsterKind 映射：稻草人(1级) → 半兽人(2级) → 骷髅战士(3级) → 沃玛卫士(4级) → 赤月恶魔(Boss)
 */
export const STAGES: StageConfig[] = [
  {
    id: 'stage_001',
    name: '霓虹荒原 I',
    index: 1,
    recommendedLevel: 1,
    width: 1800,
    groundY: 520,
    theme: 'plain',
    bossStage: false,

    clearCondition: {
      type: 'kill_all_and_reach_end',
      targetX: 1750,
    },

    waves: [
      {
        id: 's1_w1',
        trigger: { type: 'position', x: 280 },
        blockAdvance: true,
        message: '前方出现游荡数据兽',
        spawns: [
          { monsterKind: '稻草人', count: 3, levelOffset: 0, spacing: 50, offsetX: 240 },
        ],
      },
      {
        id: 's1_w2',
        trigger: { type: 'position', x: 850 },
        blockAdvance: true,
        spawns: [
          { monsterKind: '半兽人', count: 4, levelOffset: 0, spacing: 55, offsetX: 260 },
        ],
      },
      {
        id: 's1_w3',
        trigger: { type: 'position', x: 1350 },
        blockAdvance: true,
        spawns: [
          { monsterKind: '稻草人', count: 2, levelOffset: 1, spacing: 50, offsetX: 230 },
          { monsterKind: '半兽人', count: 2, levelOffset: 1, spacing: 60, offsetX: 340 },
        ],
      },
    ],

    reward: {
      gold: 35,
      exp: 45,
      chest: { rarityBonus: 0, itemCount: 1 },
      firstClearBonus: { gold: 50, exp: 60, guaranteedItemRarity: '精良' },
    },

    unlock: {},

    offline: { baseGoldPerMin: 4, baseExpPerMin: 5 },

    difficulty: {
      monsterHpMultiplier: 1,
      monsterAtkMultiplier: 1,
      monsterDefMultiplier: 1,
      monsterExpMultiplier: 1,
    },
  },

  {
    id: 'stage_002',
    name: '霓虹荒原 II',
    index: 2,
    recommendedLevel: 3,
    width: 2200,
    groundY: 520,
    theme: 'plain',
    bossStage: false,

    clearCondition: {
      type: 'kill_all_and_reach_end',
      targetX: 2150,
    },

    waves: [
      {
        id: 's2_w1',
        trigger: { type: 'position', x: 350 },
        blockAdvance: true,
        spawns: [
          { monsterKind: '半兽人', count: 4, levelOffset: 0, spacing: 60, offsetX: 260 },
        ],
      },
      {
        id: 's2_w2',
        trigger: { type: 'position', x: 950 },
        blockAdvance: true,
        message: '精英信号接近',
        spawns: [
          { monsterKind: '骷髅战士', count: 3, levelOffset: 1, eliteChance: 0.15, spacing: 70, offsetX: 260 },
        ],
      },
      {
        id: 's2_w3',
        trigger: { type: 'position', x: 1600 },
        blockAdvance: true,
        spawns: [
          { monsterKind: '半兽人', count: 3, levelOffset: 1, spacing: 55, offsetX: 250 },
          { monsterKind: '骷髅战士', count: 2, levelOffset: 1, spacing: 80, offsetX: 430 },
        ],
      },
    ],

    reward: {
      gold: 55,
      exp: 80,
      chest: { rarityBonus: 0.05, itemCount: 1 },
      firstClearBonus: { gold: 80, exp: 100, guaranteedItemRarity: '精良' },
    },

    unlock: { previousStageId: 'stage_001' },

    offline: { baseGoldPerMin: 6, baseExpPerMin: 8 },

    difficulty: {
      monsterHpMultiplier: 1.15,
      monsterAtkMultiplier: 1.1,
      monsterDefMultiplier: 1.05,
      monsterExpMultiplier: 1.15,
    },
  },

  {
    id: 'stage_003',
    name: '废弃数据林',
    index: 3,
    recommendedLevel: 5,
    width: 2600,
    groundY: 520,
    theme: 'forest',
    bossStage: false,

    clearCondition: {
      type: 'kill_all_and_reach_end',
      targetX: 2550,
    },

    waves: [
      {
        id: 's3_w1',
        trigger: { type: 'position', x: 420 },
        blockAdvance: true,
        spawns: [
          { monsterKind: '骷髅战士', count: 5, levelOffset: 0, eliteChance: 0.1, spacing: 65, offsetX: 270 },
        ],
      },
      {
        id: 's3_w2',
        trigger: { type: 'position', x: 1180 },
        blockAdvance: true,
        spawns: [
          { monsterKind: '沃玛卫士', count: 3, levelOffset: 1, eliteChance: 0.12, spacing: 80, offsetX: 280 },
          { monsterKind: '骷髅战士', count: 2, levelOffset: 1, spacing: 70, offsetX: 500 },
        ],
      },
      {
        id: 's3_w3',
        trigger: { type: 'position', x: 2000 },
        blockAdvance: true,
        message: '数据林深处传来异常波动',
        spawns: [
          { monsterKind: '沃玛卫士', count: 4, levelOffset: 2, eliteChance: 0.2, spacing: 85, offsetX: 280 },
        ],
      },
    ],

    reward: {
      gold: 85,
      exp: 130,
      chest: { rarityBonus: 0.08, itemCount: 1 },
      firstClearBonus: { gold: 130, exp: 160, guaranteedItemRarity: '稀有' },
    },

    unlock: { previousStageId: 'stage_002', requiredLevel: 4 },

    offline: { baseGoldPerMin: 9, baseExpPerMin: 13 },

    difficulty: {
      monsterHpMultiplier: 1.35,
      monsterAtkMultiplier: 1.25,
      monsterDefMultiplier: 1.15,
      monsterExpMultiplier: 1.35,
    },
  },

  {
    id: 'stage_004',
    name: '旧城防线',
    index: 4,
    recommendedLevel: 8,
    width: 2800,
    groundY: 520,
    theme: 'ruin',
    bossStage: false,

    clearCondition: {
      type: 'kill_all_and_reach_end',
      targetX: 2750,
    },

    waves: [
      {
        id: 's4_w1',
        trigger: { type: 'position', x: 450 },
        blockAdvance: true,
        spawns: [
          { monsterKind: '沃玛卫士', count: 4, levelOffset: 0, eliteChance: 0.15, spacing: 85, offsetX: 300 },
        ],
      },
      {
        id: 's4_w2',
        trigger: { type: 'position', x: 1250 },
        blockAdvance: true,
        spawns: [
          { monsterKind: '沃玛卫士', count: 3, levelOffset: 1, eliteChance: 0.12, spacing: 90, offsetX: 320 },
          { monsterKind: '骷髅战士', count: 2, levelOffset: 1, spacing: 85, offsetX: 560 },
        ],
      },
      {
        id: 's4_w3',
        trigger: { type: 'position', x: 2200 },
        blockAdvance: true,
        spawns: [
          { monsterKind: '沃玛卫士', count: 4, levelOffset: 2, eliteChance: 0.18, spacing: 90, offsetX: 320 },
        ],
      },
    ],

    reward: {
      gold: 120,
      exp: 190,
      chest: { rarityBonus: 0.12, itemCount: 2 },
      firstClearBonus: { gold: 200, exp: 250, guaranteedItemRarity: '稀有' },
    },

    unlock: { previousStageId: 'stage_003', requiredLevel: 7 },

    offline: { baseGoldPerMin: 13, baseExpPerMin: 19 },

    difficulty: {
      monsterHpMultiplier: 1.65,
      monsterAtkMultiplier: 1.45,
      monsterDefMultiplier: 1.25,
      monsterExpMultiplier: 1.55,
    },
  },

  {
    id: 'stage_005',
    name: '终端守门者',
    index: 5,
    recommendedLevel: 10,
    width: 3200,
    groundY: 520,
    theme: 'castle',
    bossStage: true,

    clearCondition: {
      type: 'kill_boss',
      bossId: 'stage_005_boss',
    },

    waves: [
      {
        id: 's5_w1',
        trigger: { type: 'position', x: 500 },
        blockAdvance: true,
        spawns: [
          { monsterKind: '沃玛卫士', count: 4, levelOffset: 0, eliteChance: 0.2, spacing: 85, offsetX: 300 },
        ],
      },
      {
        id: 's5_w2',
        trigger: { type: 'position', x: 1450 },
        blockAdvance: true,
        spawns: [
          { monsterKind: '沃玛卫士', count: 4, levelOffset: 1, eliteChance: 0.2, spacing: 90, offsetX: 320 },
        ],
      },
      {
        id: 's5_boss',
        trigger: { type: 'boss_zone', x: 2600 },
        blockAdvance: true,
        message: 'Boss：终端守门者 Ω 出现',
        spawns: [
          { monsterKind: '赤月恶魔', count: 1, levelOffset: 3, boss: true, offsetX: 420 },
        ],
      },
    ],

    reward: {
      gold: 260,
      exp: 420,
      chest: { rarityBonus: 0.25, itemCount: 3 },
      firstClearBonus: { gold: 500, exp: 700, guaranteedItemRarity: '史诗' },
    },

    unlock: { previousStageId: 'stage_004', requiredLevel: 9 },

    offline: { baseGoldPerMin: 20, baseExpPerMin: 30 },

    difficulty: {
      monsterHpMultiplier: 2.2,
      monsterAtkMultiplier: 1.8,
      monsterDefMultiplier: 1.5,
      monsterExpMultiplier: 2,
    },
  },
];

/** 根据 ID 查找关卡 */
export function getStageById(id: string): StageConfig | undefined {
  return STAGES.find(s => s.id === id);
}

/** 获取指定关卡的下一关 */
export function getNextStage(currentId: string): StageConfig | undefined {
  const idx = STAGES.findIndex(s => s.id === currentId);
  return idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : undefined;
}

/** 默认起始关卡 */
export const DEFAULT_STAGE_ID = 'stage_001';
