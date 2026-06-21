import { MONSTER_BASE } from '../data/tables';
import { CLASSES, SKILL_DEFS, TALENTS } from '../data/skills';
import { RESPAWN_POS, WORLD } from '../data/world';
import { GAME_CONFIG } from '../data/config';
import { makeDrops, makeEquipment, makePotion, uid } from '../systems/loot';
import { clearSave, getAffixTotal, invalidateStatsCache, loadGame, saveGame, totalStats, makeDefaultProgress, makeStageRuntime, calculateOfflineReward, applyOfflineReward } from '../systems/save';
import { STAGES, getStageById, getNextStage } from '../data/stages';
import { Input } from './input';
import { render } from './render';
import type { AttackAction, Drop, GameState, Monster, MonsterKind, Player, Skill, StageConfig, Vec2, FloatingText, Item } from './types';

const C = GAME_CONFIG;

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(v: Vec2): Vec2 {
  const length = Math.hypot(v.x, v.y);
  return length > 0 ? { x: v.x / length, y: v.y / length } : { x: 1, y: 0 };
}

function makeAction(kind: AttackAction['kind'], duration: number, targetId?: string, skillIndex?: number): AttackAction {
  return { kind, phase: 'windup', timer: 0, duration, targetId, skillIndex, resolved: false };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 获取指定位置的地面 Y 坐标 — 当前只支持平地 */
function getGroundYAt(stage: StageConfig, _x: number): number {
  return stage.groundY;
}

function makePlayer(): Player {
  return {
    pos: { ...RESPAWN_POS },
    hp: 130,
    level: 1,
    exp: 0,
    nextExp: 60,
    gold: 80,
    base: { maxHp: 130, attack: 12, defense: 3, crit: 0.05, lifeSteal: 0 },
    equipment: {},
    inventory: [makePotion(1), makePotion(1)],
    attackCooldown: 0,
    facing: { x: 1, y: 0 },
    action: null,
    alive: true,
    invincible: false,
    invTimer: 0,
    playerClass: undefined,
    talentPoints: 0,
    talents: {},
    regenTimer: 0,
    // 横版物理
    velY: 0,
    grounded: true,
    coyoteTimer: 0,
    jumpCount: 0,
    maxJumpCount: 1,
  };
}

function spawnMonster(kind: MonsterKind, x: number, y: number, level: number, elite = false, boss = false): Monster {
  const base = MONSTER_BASE[kind];
  const scale = 1 + level * 0.12;
  const eliteScale = boss ? 4 : elite ? 2.1 : 1;
  return {
    id: uid('monster'),
    kind,
    pos: { x, y },
    spawn: { x, y },
    level,
    hp: Math.round(base.hp * scale * eliteScale),
    maxHp: Math.round(base.hp * scale * eliteScale),
    attack: Math.round(base.attack * scale * (boss ? 1.3 : elite ? 1.35 : 1)),
    defense: Math.round(base.defense * scale * (boss ? 1.2 : elite ? 1.4 : 1)),
    exp: Math.round(base.exp * scale * eliteScale),
    radius: boss ? C.BOSS_RADIUS : elite ? C.ELITE_RADIUS : C.NORMAL_RADIUS,
    speed: base.speed * (boss ? 1.1 : 1),
    elite,
    boss,
    respawn: 0,
    attackCooldown: 0,
    vel: { x: 0, y: 0 },
    facing: { x: -1, y: 0 },
    action: null,
    hitstun: 0,
    enraged: false,
    glyph: base.glyph,
    color: base.color,
  };
}

function createState(): GameState {
  const loaded = loadGame();
  const player = loaded?.player ?? makePlayer();
  player.alive = player.hp > 0;
  player.facing = { x: 1, y: 0 };
  player.action = null;
  player.invincible ??= false;
  player.invTimer ??= 0;
  player.talentPoints ??= 0;
  player.talents ??= {};
  player.regenTimer ??= 0;
  const isNewGame = !loaded;
  const progress = loaded?.progress ?? makeDefaultProgress();
  // 横版模式：设置玩家起始位置
  if (isNewGame) {
    const startStage = getStageById(progress.currentStageId) ?? STAGES[0];
    player.pos.x = 0;
    player.pos.y = getGroundYAt(startStage, 0);
    player.grounded = true;
    player.velY = 0;
  }
  const state: GameState = {
    player,
    monsters: [], // 横版模式：怪物由波次系统动态生成
    drops: [],
    skills: loaded?.skills ?? [],
    floats: [],
    messages: [{ text: isNewGame ? '选择你的职业开始冒险！' : '欢迎来到赤月孤城：WASD移动，空格攻击，1/2/3 技能，I 背包，E 商店，T 天赋。', timer: C.MESSAGE_DURATION * 2 }],
    time: loaded?.time ?? 0,
    camera: { x: 0, y: 0 },
    shake: 0,
    particles: [],
    slashes: [],
    ui: { panel: isNewGame ? 'classSelect' : 'none', selectedIndex: 0, scroll: 0 },
    showHelp: !isNewGame,
    resetConfirm: false,
    autoBattle: true,
    hitstop: 0,
    // 横版关卡系统
    stage: makeStageRuntime(progress.currentStageId),
    progress,
    lastOnlineTime: loaded?.lastOnlineTime ?? Date.now(),
  };

  // 离线收益检测：老玩家且离线时间超过最小阈值
  if (!isNewGame && loaded?.lastOnlineTime) {
    const now = Date.now();
    const offlineSec = (now - loaded.lastOnlineTime) / 1000;
    if (offlineSec >= C.OFFLINE.MIN_SECONDS_TO_SHOW) {
      const reward = calculateOfflineReward(progress, loaded.lastOnlineTime, now);
      state.ui.panel = 'offlineReward';
      state.ui.offlineReward = reward;
    }
  }

  return state;
}

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private input: Input;
  state: GameState;
  private last = performance.now();
  private accumulator = 0;
  private saveTimer = 0;
  private prevPointerY = 0;
  private scrollVelocity = 0;
  private resetConfirmTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    this.canvas = canvas;
    this.ctx = ctx;
    this.input = new Input(canvas);
    this.state = createState();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    window.addEventListener('beforeunload', () => saveGame(this.state));
  }

  start(): void {
    requestAnimationFrame((time) => this.frame(time));
  }

  private frame(time: number): void {
    const delta = Math.min(0.05, (time - this.last) / 1000);
    this.last = time;
    this.accumulator += delta;
    while (this.accumulator >= 1 / 60) {
      this.update(1 / 60);
      this.accumulator -= 1 / 60;
    }
    render(this.ctx, this.canvas, this.state, this.input.move);
    this.input.endFrame();
    requestAnimationFrame((next) => this.frame(next));
  }

  private update(dt: number): void {
    const state = this.state;
    state.time += dt;

    if (this.resetConfirmTimer > 0) this.resetConfirmTimer = Math.max(0, this.resetConfirmTimer - dt);
    state.resetConfirm = this.resetConfirmTimer > 0;
    this.input.uiBlocking = state.ui.panel !== 'none';
    this.input.update();

    // Hitstop freezes combat logic but NOT input, player movement, or stage physics
    if (state.hitstop > 0) {
      state.hitstop = Math.max(0, state.hitstop - dt);
    } else {
      this.handleActions();
      this.handleBagScroll();
      this.updateActions(dt);
      this.updateMonstersSideScroll(dt);
      this.updateAutoCombat(dt);
      this.updateDrops(dt);
      this.updatePhysics(dt);
      this.updateUi(dt);
    }

    // 横版关卡：波次、自动推进、跳跃物理（不受 hitstop 影响）
    this.updateStageWaves();
    this.updateAutoAdvance(dt);
    // 玩家锁定在地面线上（无跳跃）
    if (this.state.player.alive) {
      const stage = this.currentStage();
      this.state.player.pos.y = getGroundYAt(stage, this.state.player.pos.x);
      this.state.player.grounded = true;
    }

    if (state.player.alive) {
      this.updatePlayer(dt);
      // 检查通关条件（仅在活跃阶段）
      const phase = state.stage.phase;
      if (phase === 'running' || phase === 'combat' || phase === 'boss') {
        if (this.checkClearCondition()) {
          this.completeStage();
        }
      }
    } else {
      // 玩家死亡 → 关卡失败
      if (state.stage.phase !== 'failed' && state.stage.phase !== 'cleared') {
        this.failStage();
      }
    }

    // 通关结算计时
    if (state.stage.phase === 'clearing') {
      state.stage.clearTimer += dt;
      if (state.stage.clearTimer >= C.STAGE.CLEAR_PANEL_DELAY) {
        state.stage.phase = 'cleared';
        state.ui.panel = 'stageClear';
      }
    }

    // 关卡过渡计时
    if (state.stage.phase === 'transition') {
      state.stage.transitionTimer += dt;
      if (state.stage.transitionTimer >= C.STAGE.TRANSITION_DURATION) {
        state.stage.phase = 'running';
      }
    }

    // 横版相机：X 跟随玩家，Y 锁定地面
    const stage = this.currentStage();
    const screenRatio = C.SIDE_SCROLL.PLAYER_SCREEN_X_RATIO;
    const targetCamX = state.player.pos.x - this.canvas.width * screenRatio;
    const lerpFactor = 1 - Math.pow(1 - C.SIDE_SCROLL.CAMERA_LERP, dt * 60);
    state.camera.x += (targetCamX - state.camera.x) * lerpFactor;
    state.camera.x = clamp(state.camera.x, 0, Math.max(0, stage.width - this.canvas.width));
    state.camera.y = stage.groundY - this.canvas.height * 0.75;

    // 更新关卡运行时间（结算/过渡阶段不计时）
    if (state.stage.phase !== 'clearing' && state.stage.phase !== 'cleared' && state.stage.phase !== 'transition') {
      state.stage.elapsed += dt;
    }

    this.saveTimer += dt;
    if (this.saveTimer > C.STAGE.AUTO_SAVE_INTERVAL) {
      this.saveTimer = 0;
      saveGame(state);
    }
  }

  private handleActions(): void {
    const state = this.state;
    const ui = state.ui;

    if (this.input.consume('h')) state.showHelp = !state.showHelp;

    // Toggle bag
    if (this.input.consume('i') || this.input.consume('b')) {
      ui.panel = ui.panel === 'bag' ? 'none' : ui.panel === 'itemDetail' ? 'bag' : 'bag';
      if (ui.panel === 'bag') ui.scroll = 0;
    }

    // Toggle talents
    if (this.input.consume('t')) {
      if (ui.panel === 'talents') {
        ui.panel = 'none';
      } else if (state.player.playerClass) {
        ui.panel = 'talents';
        ui.scroll = 0;
      } else {
        this.say('请先选择职业。');
      }
    }

    // Save
    if (this.input.consume('s')) {
      saveGame(state);
      this.say('已手动保存。');
    }

    // Reset (double-tap confirmation)
    if (this.input.consume('r')) {
      if (this.resetConfirmTimer > 0) {
        clearSave();
        this.state = createState();
        this.resetConfirmTimer = 0;
        this.say('已重开新档。');
        return;
      } else {
        this.resetConfirmTimer = 3;
        this.say('再按一次 R 确认重置游戏！');
      }
    }

    // Death: tap retries in stage context, space always retries
    if (!state.player.alive) {
      if (this.input.consume(' ')) {
        if (state.stage.phase === 'failed' || state.ui.panel === 'death') this.retryStage();
        else this.revive();
      } else if (this.input.consume('tap')) {
        if (state.stage.phase === 'failed' || state.ui.panel === 'death') {
          this.handleStageTap(this.input.pointer.x, this.input.pointer.y);
        } else {
          this.revive();
        }
      }
    }

    // Space: use/equip item (if panel open)
    if (this.input.consume(' ') && ui.panel === 'itemDetail') {
      this.useOrEquipItem();
    }

    // Navigate inventory grid
    const cols = 4;
    if (this.input.consume('arrowup')) {
      ui.selectedIndex = Math.max(0, ui.selectedIndex - cols);
    }
    if (this.input.consume('arrowdown')) {
      ui.selectedIndex = Math.min(state.player.inventory.length - 1, ui.selectedIndex + cols);
    }
    if (this.input.consume('arrowleft')) {
      if (ui.selectedIndex % cols > 0) ui.selectedIndex -= 1;
    }
    if (this.input.consume('arrowright')) {
      if (ui.selectedIndex % cols < cols - 1 && ui.selectedIndex + 1 < state.player.inventory.length) {
        ui.selectedIndex += 1;
      }
    }

    // Enter key: context-dependent
    if (this.input.consume('enter')) {
      switch (ui.panel) {
        case 'itemDetail':
          this.useOrEquipItem();
          break;
        case 'bag':
          if (state.player.inventory[ui.selectedIndex]) {
            ui.panel = 'itemDetail';
          }
          break;
        case 'shop':
          this.buyPotion();
          break;
        case 'none':
          ui.panel = 'bag';
          break;
      }
    }

    // Buy potion shortcut
    if (this.input.consume('p')) this.buyPotion();

    // Tap: delegate to handleTap (skip if this gesture was a scroll)
    if (!this.input.scrolled && this.input.consume('tap')) this.handleTap(this.input.pointer.x, this.input.pointer.y);
  }

  private handleBagScroll(): void {
    const state = this.state;
    if (state.ui.panel !== 'bag') {
      this.prevPointerY = this.input.pointer.y;
      this.scrollVelocity = 0;
      return;
    }

    const w = this.canvas.width;
    const h = this.canvas.height;
    const compact = h > w * 1.12;

    // Momentum / inertia when pointer is released
    if (!this.input.pointer.down) {
      if (Math.abs(this.scrollVelocity) > 0.5) {
        state.ui.scroll -= this.scrollVelocity;
        this.scrollVelocity *= C.SCROLL_DECAY;
      } else {
        this.scrollVelocity = 0;
      }
      // Clamp scroll
      this.clampBagScroll(compact, h);
      this.prevPointerY = this.input.pointer.y;
      return;
    }

    // Active drag scrolling
    const py = this.input.pointer.y;
    const delta = py - this.prevPointerY;

    if (Math.abs(delta) > 1) {
      const panelX = compact ? 10 : Math.max(360, w - 360);
      const panelY = compact ? 100 : 16;
      const panelW = compact ? w - 20 : 340;
      const panelH = compact ? Math.min(h - 240, 460) : 440;
      const eqCount = Object.entries(state.player.equipment).length;
      const gridTop = panelY + 52 + eqCount * (compact ? 16 : 19) + 12 + 20;
      const px = this.input.pointer.x;

      // Only scroll if pointer is in the grid area
      if (px >= panelX && px <= panelX + panelW && py >= gridTop && py <= panelY + panelH) {
        state.ui.scroll -= delta;
        this.scrollVelocity = -delta;
        this.input.scrolled = true;
      }
    }

    this.clampBagScroll(compact, h);
    this.prevPointerY = py;
  }

  private clampBagScroll(compact: boolean, h: number): void {
    const state = this.state;
    const panelY = compact ? 100 : 16;
    const panelH = compact ? Math.min(h - 240, 460) : 440;
    const cellSize = compact ? 48 : 54;
    const gap = 5;
    const eqCount = Object.entries(state.player.equipment).length;
    const gridTop = panelY + 52 + eqCount * (compact ? 16 : 19) + 12 + 20;
    const gridBottom = panelY + panelH - 6;
    const rows = Math.ceil(state.player.inventory.length / 4);
    const contentH = rows * (cellSize + gap);
    const maxScroll = Math.max(0, contentH - (gridBottom - gridTop));
    state.ui.scroll = Math.max(0, Math.min(maxScroll, state.ui.scroll));
  }

  private updatePlayer(dt: number): void {
    const player = this.state.player;
    // X 轴由 updateAutoAdvance 控制，Y 轴锁定在地面线
    // 这里只保留冷却、无敌帧、生命回复等非移动逻辑
    player.attackCooldown = Math.max(0, player.attackCooldown - dt);
    for (const skill of this.state.skills) skill.remaining = Math.max(0, skill.remaining - dt);
    // Invincibility frames
    if (player.invTimer > 0) {
      player.invTimer = Math.max(0, player.invTimer - dt);
      if (player.invTimer <= 0) player.invincible = false;
    }
    if (player.hp <= 0) player.alive = false;
    // 词条: 生命回复 (hp_regen) — 每秒回复
    const regenValue = getAffixTotal(this.state.player, 'hp_regen');
    if (regenValue > 0 && player.hp > 0) {
      player.regenTimer += dt;
      if (player.regenTimer >= 1) {
        player.regenTimer -= 1;
        const maxHp = totalStats(player).maxHp;
        player.hp = Math.min(maxHp, player.hp + regenValue);
      }
    }
  }

  /* ──────── 横版关卡系统 ──────── */

  /** 获取当前关卡配置 */
  private currentStage(): StageConfig {
    return getStageById(this.state.stage.stageId) ?? STAGES[0];
  }

  /** 获取前方存活的怪物 */
  private getAliveMonstersInFront(playerX: number, range: number): Monster[] {
    return this.state.monsters.filter(m => {
      if (m.hp <= 0 || m.respawn > 0) return false;
      const dx = m.pos.x - playerX;
      return dx >= 0 && dx <= range;
    });
  }

  /** 是否存在阻挡波次的存活怪物 */
  private hasAliveMonsterFromBlockingWave(): boolean {
    const runtime = this.state.stage;
    const stage = this.currentStage();
    for (const wave of stage.waves) {
      if (!wave.blockAdvance) continue;
      if (!runtime.triggeredWaveIds.includes(wave.id)) continue;
      // 检查该波次是否还有活怪
      for (const m of this.state.monsters) {
        if (m.hp > 0 && m.respawn <= 0) return true;
      }
    }
    return false;
  }

  /** 自动向右推进，遇敌停止 */
  private updateAutoAdvance(dt: number): void {
    const player = this.state.player;
    const stage = this.currentStage();
    const runtime = this.state.stage;

    if (!player.alive) return;
    if (runtime.phase === 'cleared' || runtime.phase === 'failed') return;
    if (runtime.phase === 'clearing' || runtime.phase === 'transition') return;
    if (runtime.phase === 'idle') return;

    // 面向右方
    player.facing = { x: 1, y: 0 };

    const blockingEnemies = this.getAliveMonstersInFront(
      player.pos.x,
      C.SIDE_SCROLL.ENEMY_DETECT_RANGE,
    );

    const hasBlockingWaveAlive = this.hasAliveMonsterFromBlockingWave();

    const shouldStop =
      blockingEnemies.length > 0 ||
      hasBlockingWaveAlive ||
      runtime.phase === 'boss';

    if (shouldStop) {
      if (runtime.phase !== 'boss') runtime.phase = 'combat';
      return;
    }

    runtime.phase = 'running';

    const speed = player.autoRunSpeed ?? C.SIDE_SCROLL.AUTO_RUN_SPEED;
    player.pos.x += speed * dt;
    player.pos.x = clamp(player.pos.x, 0, stage.width);

    runtime.playerX = player.pos.x;

    if (player.pos.x >= stage.width - 20) {
      runtime.reachedEnd = true;
    }
  }

  /* ──────── 通关 / 失败 / 奖励 ──────── */

  /** 检查是否满足通关条件 */
  private checkClearCondition(): boolean {
    const stage = this.currentStage();
    const runtime = this.state.stage;
    const cond = stage.clearCondition;

    switch (cond.type) {
      case 'kill_all':
        return this.allMonstersCleared() && runtime.triggeredWaveIds.length >= stage.waves.length;
      case 'reach_end':
        return runtime.reachedEnd;
      case 'kill_boss':
        return runtime.bossSpawned && runtime.bossKilled;
      case 'kill_all_and_reach_end':
        return this.allMonstersCleared() && runtime.reachedEnd && runtime.triggeredWaveIds.length >= stage.waves.length;
      default:
        return false;
    }
  }

  /** 是否所有已生成的怪物都已击杀 */
  private allMonstersCleared(): boolean {
    return this.state.monsters.every(m => m.hp <= 0);
  }

  /** 通关：结算奖励、更新进度 */
  private completeStage(): void {
    const runtime = this.state.stage;
    const stage = this.currentStage();
    const player = this.state.player;
    const progress = this.state.progress;

    runtime.phase = 'clearing';
    runtime.clearTimer = 0;

    // 清除残留怪物和掉落
    for (const m of this.state.monsters) { m.hp = 0; m.action = null; }
    this.state.drops = [];

    const isFirstClear = !progress.records[stage.id]?.cleared;

    // 更新记录
    const record = progress.records[stage.id] ?? { cleared: false, clearCount: 0 };
    record.cleared = true;
    record.clearCount += 1;
    if (!record.bestTime || runtime.elapsed < record.bestTime) {
      record.bestTime = runtime.elapsed;
    }
    if (isFirstClear) record.firstClearedAt = Date.now();
    progress.records[stage.id] = record;
    progress.totalStagesCleared += 1;

    // 发放奖励
    const reward = stage.reward;
    player.gold += reward.gold;
    player.exp += reward.exp;

    const rewardItems: Item[] = [];

    // 宝箱掉落
    if (reward.chest) {
      for (let i = 0; i < reward.chest.itemCount; i++) {
        if (player.inventory.length < 28) {
          const item = makeEquipment(stage.recommendedLevel);
          player.inventory.push(item);
          rewardItems.push(item);
        }
      }
    }

    // 首通额外奖励
    if (isFirstClear && reward.firstClearBonus) {
      player.gold += reward.firstClearBonus.gold;
      player.exp += reward.firstClearBonus.exp;

      // 解锁下一关
      const next = getNextStage(stage.id);
      if (next) {
        const curIdx = STAGES.findIndex(s => s.id === progress.highestUnlockedStageId);
        const nextIdx = STAGES.findIndex(s => s.id === next.id);
        if (nextIdx > curIdx) {
          progress.highestUnlockedStageId = next.id;
        }
        progress.currentStageId = next.id;
      }
    }

    // 升级检查
    while (player.exp >= player.nextExp) {
      player.exp -= player.nextExp;
      player.level += 1;
      player.nextExp = Math.floor(player.nextExp * C.LEVEL_EXP_SCALE + C.LEVEL_EXP_OFFSET);
      player.base.maxHp += C.LEVEL_HP_GAIN;
      player.base.attack += C.LEVEL_ATK_GAIN;
      player.base.defense += C.LEVEL_DEF_GAIN;
      player.talentPoints += 1;
      invalidateStatsCache();
      player.hp = totalStats(player).maxHp;
      this.say(`升级到 ${player.level} 级！`);
    }

    this.state.ui.stageClear = {
      stageId: stage.id,
      reward,
      firstClear: isFirstClear,
      items: rewardItems,
    };

    saveGame(this.state);
    this.say(`通关 ${stage.name}！`);
  }

  /** 关卡失败 */
  private failStage(): void {
    if (this.state.stage.phase === 'failed' || this.state.stage.phase === 'cleared') return;
    this.state.stage.phase = 'failed';
    this.state.ui.panel = 'death';
    this.say('关卡失败…');
  }

  /** 重试当前关卡 */
  private retryStage(): void {
    const player = this.state.player;
    const stage = this.currentStage();
    const groundY = getGroundYAt(stage, 0);

    this.state.stage = makeStageRuntime(stage.id);
    player.pos = { x: 0, y: groundY };
    player.velY = 0;
    player.grounded = true;

    const stats = totalStats(player);
    player.hp = stats.maxHp;
    player.alive = true;
    player.action = null;
    player.invincible = true;
    player.invTimer = C.STAGE.REVIVE_INVINCIBLE_TIME;

    this.state.monsters = [];
    this.state.drops = [];
    this.state.particles = [];
    this.state.slashes = [];
    this.state.ui.panel = 'none';
    this.state.ui.stageClear = undefined;

    this.say(`重新挑战 ${stage.name}…`);
  }

  /** 推进到下一关 */
  private advanceToNextStage(): void {
    const stage = this.currentStage();
    const next = getNextStage(stage.id);
    const progress = this.state.progress;

    if (next) {
      progress.currentStageId = next.id;
      const curIdx = STAGES.findIndex(s => s.id === progress.highestUnlockedStageId);
      const nextIdx = STAGES.findIndex(s => s.id === next.id);
      if (nextIdx > curIdx) progress.highestUnlockedStageId = next.id;
    }

    const targetStage = next ?? stage;
    const groundY = getGroundYAt(targetStage, 0);
    const player = this.state.player;

    this.state.stage = makeStageRuntime(targetStage.id);
    this.state.stage.phase = 'transition';
    this.state.stage.transitionTimer = 0;

    player.pos = { x: 0, y: groundY };
    player.velY = 0;
    player.grounded = true;
    const stats = totalStats(player);
    player.hp = stats.maxHp;
    player.alive = true;
    player.action = null;
    player.invincible = true;
    player.invTimer = C.STAGE.REVIVE_INVINCIBLE_TIME;

    this.state.monsters = [];
    this.state.drops = [];
    this.state.particles = [];
    this.state.slashes = [];
    this.state.ui.panel = 'none';
    this.state.ui.stageClear = undefined;

    saveGame(this.state);
    if (next) {
      this.say(`进入下一关：${next.name}`);
    } else {
      this.say('已通关所有关卡！恭喜！');
    }
  }

  /** 返回关卡选择（回到最高解锁关卡起点） */
  private returnToStageSelect(): void {
    const progress = this.state.progress;
    const stage = getStageById(progress.highestUnlockedStageId) ?? STAGES[0];
    const groundY = getGroundYAt(stage, 0);
    const player = this.state.player;

    progress.currentStageId = progress.highestUnlockedStageId;
    this.state.stage = makeStageRuntime(stage.id);

    player.pos = { x: 0, y: groundY };
    player.velY = 0;
    player.grounded = true;
    const stats = totalStats(player);
    player.hp = stats.maxHp;
    player.alive = true;
    player.action = null;
    player.invincible = true;
    player.invTimer = C.STAGE.REVIVE_INVINCIBLE_TIME;

    this.state.monsters = [];
    this.state.drops = [];
    this.state.particles = [];
    this.state.slashes = [];
    this.state.ui.panel = 'none';
    this.state.ui.stageClear = undefined;

    this.say(`返回 ${stage.name}`);
  }

  /* ──────── 波次刷怪 ──────── */

  /** 检查并触发关卡波次 */
  private updateStageWaves(): void {
    const stage = this.currentStage();
    const runtime = this.state.stage;

    if (runtime.phase === 'cleared' || runtime.phase === 'failed') return;

    for (const wave of stage.waves) {
      if (runtime.triggeredWaveIds.includes(wave.id)) continue;
      if (!this.shouldTriggerWave(wave)) continue;

      this.spawnWave(wave);
      runtime.triggeredWaveIds.push(wave.id);

      if (wave.trigger.type === 'boss_zone') {
        runtime.phase = 'boss';
        runtime.bossSpawned = true;
      }

      if (wave.message) {
        this.say(wave.message);
      }
    }
  }

  /** 判断波次是否应该触发 */
  private shouldTriggerWave(wave: import('./types').StageWave): boolean {
    const trigger = wave.trigger;
    if (trigger.type === 'time') return this.state.stage.elapsed >= trigger.at;
    if (trigger.type === 'position') return this.state.player.pos.x >= trigger.x;
    if (trigger.type === 'boss_zone') return this.state.player.pos.x >= trigger.x;
    return false;
  }

  /** 根据波次配置生成怪物 */
  private spawnWave(wave: import('./types').StageWave): void {
    const stage = this.currentStage();
    const runtime = this.state.stage;

    for (const spawn of wave.spawns) {
      for (let i = 0; i < spawn.count; i++) {
        const spawnX = this.state.player.pos.x + (spawn.offsetX ?? 260) + i * (spawn.spacing ?? 60);
        const groundY = getGroundYAt(stage, spawnX);
        const isElite = Math.random() < (spawn.eliteChance ?? 0);
        const level = stage.recommendedLevel + (spawn.levelOffset ?? 0);

        const m = spawnMonster(spawn.monsterKind, spawnX, groundY, level, isElite, !!spawn.boss);
        m.spawn = { ...m.pos };
        m.facing = { x: -1, y: 0 };

        if (spawn.boss) {
          m.id = `${stage.id}_boss`;
        } else {
          m.id = `${wave.id}_${spawn.monsterKind}_${i}_${Date.now()}`;
        }

        // 应用关卡难度倍率
        const diff = stage.difficulty;
        m.hp = Math.round(m.hp * diff.monsterHpMultiplier);
        m.maxHp = m.hp;
        m.attack = Math.round(m.attack * diff.monsterAtkMultiplier);
        m.defense = Math.round(m.defense * diff.monsterDefMultiplier);
        m.exp = Math.round(m.exp * diff.monsterExpMultiplier);

        this.state.monsters.push(m);
        runtime.spawnedTotal++;
      }
    }
  }

  /* ──────── 横版怪物 AI ──────── */

  /** 横版模式怪物行为：面向玩家、靠近、攻击 */
  private updateMonstersSideScroll(dt: number): void {
    const player = this.state.player;
    const stage = this.currentStage();

    for (const monster of this.state.monsters) {
      if (monster.hp <= 0) {
        // 波次怪物不复活，直接跳过
        continue;
      }

      // Boss 狂暴
      if (monster.boss && !monster.enraged && monster.hp < monster.maxHp * C.BOSS_ENRAGE_HP_THRESHOLD) {
        monster.enraged = true;
        monster.attack = Math.round(monster.attack * C.BOSS_ENRAGE_ATTACK_MULT);
        this.float('狂暴!', monster.pos.x, monster.pos.y - monster.radius - 30, '#ff2020');
        this.spawnParticles(monster.pos.x, monster.pos.y, '#ff2020', 20);
      }

      const speed = monster.speed * (monster.enraged ? C.BOSS_ENRAGE_SPEED_MULT : 1);
      monster.hitstun = Math.max(0, monster.hitstun - dt);
      monster.attackCooldown = Math.max(0, monster.attackCooldown - dt);

      if (monster.hitstun > 0) continue;
      if (!player.alive) continue;

      const dx = player.pos.x - monster.pos.x;
      const absDx = Math.abs(dx);

      monster.facing = { x: dx >= 0 ? 1 : -1, y: 0 };

      const contactRange = monster.radius + 20;

      if (absDx > contactRange) {
        const dir = dx > 0 ? 1 : -1;
        monster.pos.x += dir * speed * dt;
      } else if (monster.attackCooldown <= 0) {
        // 接触伤害
        this.applyContactDamage(monster);
        monster.attackCooldown = monster.boss ? 1.5 : 1.0;
        // 怪物攻击后短暂后退
        monster.vel.x = -(dx > 0 ? 1 : -1) * 40;
      }

      // 锁定在地面线上
      monster.pos.y = getGroundYAt(stage, monster.pos.x);
    }
  }

  /** 怪物接触伤害 */
  private applyContactDamage(monster: Monster): void {
    const player = this.state.player;
    if (!player.alive) return;
    if (player.invincible) {
      this.float('MISS', player.pos.x, player.pos.y - 28, 'rgba(255,255,255,0.4)');
      return;
    }
    const dodgeChance = getAffixTotal(this.state.player, 'dodge');
    if (dodgeChance > 0 && Math.random() * 100 < dodgeChance) {
      this.float('闪避', player.pos.x, player.pos.y - 28, '#79e07d');
      return;
    }
    const playerStats = totalStats(player);
    const damage = Math.max(1, monster.attack - playerStats.defense + Math.floor(Math.random() * 6));
    player.hp -= damage;
    const thornsPercent = getAffixTotal(this.state.player, 'thorns');
    if (thornsPercent > 0) {
      const reflect = Math.max(1, Math.round(damage * thornsPercent / 100));
      monster.hp -= reflect;
      this.float(`荆棘-${reflect}`, monster.pos.x, monster.pos.y - monster.radius, '#c57cff');
      if (monster.hp <= 0) this.killMonster(monster);
    }
    player.invincible = true;
    player.invTimer = C.INVINCIBLE_FRAME_DURATION;
    this.float(`-${damage}`, player.pos.x, player.pos.y - 28, '#ff6868');
    this.spawnParticles(player.pos.x, player.pos.y, '#ff6868', monster.boss ? 12 : 6);
    this.state.shake = Math.min(C.SHAKE_MAX, this.state.shake + (monster.boss ? C.SHAKE_PLAYER_HIT_BOSS : C.SHAKE_PLAYER_HIT_NORMAL));
    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
      player.invincible = false;
      player.invTimer = 0;
      this.say('你倒下了。');
    }
  }

  /* ──────── 自动战斗 ──────── */

  /** 判断点是否在矩形内 */
  private static rectContainsPoint(rect: { x: number; y: number; w: number; h: number }, point: Vec2): boolean {
    return point.x >= rect.x && point.x <= rect.x + rect.w &&
           point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  /** 在前方矩形范围内查找自动攻击目标 */
  private findAutoTarget(): Monster | null {
    const player = this.state.player;
    const rect = {
      x: player.pos.x,
      y: player.pos.y - C.COMBAT_2D.BASIC_ATTACK_HEIGHT,
      w: C.COMBAT_2D.BASIC_ATTACK_WIDTH,
      h: C.COMBAT_2D.BASIC_ATTACK_HEIGHT,
    };

    const candidates = this.state.monsters.filter(m => {
      if (m.hp <= 0) return false;
      return Game.rectContainsPoint(rect, m.pos);
    });

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => Math.abs(a.pos.x - player.pos.x) - Math.abs(b.pos.x - player.pos.x));
    return candidates[0];
  }

  /** 自动战斗：普攻 + 技能释放 */
  private updateAutoCombat(dt: number): void {
    const player = this.state.player;
    if (!player.alive) return;

    player.attackCooldown = Math.max(0, player.attackCooldown - dt);

    // 如果正在执行动作，让 advancePlayerAction 处理
    if (player.action) return;

    const target = this.findAutoTarget();
    if (!target) return;

    if (player.attackCooldown <= 0) {
      // 开始普攻
      const attackSpeed = player.attackSpeed ?? C.COMBAT_2D.DEFAULT_ATTACK_SPEED;
      const cooldown = Math.max(C.COMBAT_2D.MIN_ATTACK_COOLDOWN, C.PLAYER_ATTACK_COOLDOWN / attackSpeed);
      player.attackCooldown = cooldown;
      player.action = makeAction('basic', C.BASIC_DURATION, target.id);
      player.facing = { x: 1, y: 0 };
    }

    // 自动释放技能
    this.updateAutoSkillCast();
  }

  /** 自动技能释放：冷却好且有目标就放 */
  private updateAutoSkillCast(): void {
    const player = this.state.player;
    if (player.action) return;

    for (let i = 0; i < this.state.skills.length; i++) {
      const skill = this.state.skills[i];
      if (skill.remaining > 0) continue;

      const enemies = this.getAliveMonstersInFront(player.pos.x, skill.range || 360);
      if (enemies.length === 0) continue;

      // 优先打 Boss 或最低血量
      enemies.sort((a, b) => {
        if (a.boss !== b.boss) return a.boss ? -1 : 1;
        return (a.hp / a.maxHp) - (b.hp / b.maxHp);
      });

      const target = enemies[0];
      player.facing = normalize({ x: target.pos.x - player.pos.x, y: target.pos.y - player.pos.y });
      player.action = makeAction('skill', C.SKILL_DURATION, target.id, i);
      skill.remaining = skill.cooldown;
      break;
    }
  }

  private updateActions(dt: number): void {
    const player = this.state.player;
    if (player.action) this.advancePlayerAction(player.action, dt);
  }

  private advancePlayerAction(action: AttackAction, dt: number): void {
    const player = this.state.player;
    action.timer += dt;
    const strikeAt = action.kind === 'basic' ? C.BASIC_WINDUP_STRIKE : C.SKILL_WINDUP_STRIKE;
    const recoveryAt = action.kind === 'basic' ? C.BASIC_RECOVERY : C.SKILL_RECOVERY;
    if (action.phase === 'windup' && action.timer >= strikeAt) {
      action.phase = 'strike';
      if (!action.resolved) {
        action.resolved = true;
        if (action.kind === 'basic') this.resolveBasicAttack(action.targetId);
        else this.resolveSkillAttack(action.skillIndex ?? 0, action.targetId);
      }
    }
    if (action.phase === 'strike' && action.timer >= recoveryAt) action.phase = 'recovery';
    if (action.timer >= action.duration) player.action = null;
  }

  private updateDrops(dt: number): void {
    const player = this.state.player;
    this.state.drops = this.state.drops.filter((drop) => {
      drop.ttl -= dt;
      if (drop.ttl <= 0) return false;
      if (player.alive && dist(drop.pos, player.pos) < C.PICKUP_RADIUS) {
        this.pickDrop(drop);
        return false;
      }
      return true;
    });
  }

  private updatePhysics(dt: number): void {
    const state = this.state;
    state.shake = Math.max(0, state.shake - dt * C.SHAKE_DECAY_RATE);
    this.resolveCollisions();
    for (const monster of state.monsters) {
      monster.vel.x *= Math.pow(C.VEL_DECAY_FACTOR, dt);
      monster.vel.y *= Math.pow(C.VEL_DECAY_FACTOR, dt);
      if (monster.hp > 0) {
        monster.pos.x = clamp(monster.pos.x, C.WORLD_MARGIN, WORLD.width - C.WORLD_MARGIN);
        monster.pos.y = clamp(monster.pos.y, C.WORLD_MARGIN, WORLD.height - C.WORLD_MARGIN);
      }
    }
    state.particles = state.particles.filter((particle) => {
      particle.ttl -= dt;
      particle.pos.x += particle.vel.x * dt;
      particle.pos.y += particle.vel.y * dt;
      particle.vel.x *= Math.pow(C.PARTICLE_FRICTION, dt);
      particle.vel.y = particle.vel.y * Math.pow(C.PARTICLE_FRICTION, dt) + C.PARTICLE_GRAVITY * dt;
      return particle.ttl > 0;
    });
    state.slashes = state.slashes.filter((slash) => {
      slash.ttl -= dt;
      return slash.ttl > 0;
    });
    // 清理死怪防止数组无限膨胀导致冻结
    state.monsters = state.monsters.filter((m) => m.hp > 0);
  }

  private resolveCollisions(): void {
    // 横版模式：无碰撞体积
  }

  private updateUi(dt: number): void {
    const state = this.state;
    // Message queue: decrement timers and remove expired
    for (const msg of state.messages) msg.timer = Math.max(0, msg.timer - dt);
    state.messages = state.messages.filter((msg) => msg.timer > 0);
    state.floats = state.floats.filter((text) => {
      text.ttl -= dt;
      text.pos.y -= 26 * dt;
      if (text.vel) {
        text.pos.x += text.vel.x * dt;
        text.pos.y += text.vel.y * dt;
        text.vel.y += C.FLOAT_GRAVITY * dt;
      }
      return text.ttl > 0;
    });
    if (state.ui.panel === 'shop' && dist(state.player.pos, RESPAWN_POS) >= C.SHOP_DISTANCE_PANEL) {
      state.ui.panel = 'none';
    }
  }

  private resolveBasicAttack(targetId?: string): void {
    const target = this.state.monsters.find((monster) => monster.id === targetId && monster.hp > 0) ?? this.nearestLiving(C.PLAYER_ATTACK_REACH);
    if (!target || dist(target.pos, this.state.player.pos) - target.radius > C.PLAYER_ATTACK_REACH) {
      this.swingAtAir('#6fffd2');
      return;
    }
    this.addSlash(this.state.player.pos, target.pos, '#6fffd2', '/');
    this.hitMonster(target, 1, 0);
  }

  private resolveSkillAttack(index: number, targetId?: string): void {
    const skill = this.state.skills[index];
    if (!skill) return;
    const target = this.state.monsters.find((monster) => monster.id === targetId && monster.hp > 0) ?? this.nearestLiving(skill.range);
    if (!target) return;
    const slashStyle = skill.style ?? 'line';
    const slashChar = slashStyle === 'lightning' ? '|' : slashStyle === 'arc' ? ')' : '>';
    this.addSlash(this.state.player.pos, target.pos, skill.color, slashChar, slashStyle);
    // 天赋 skill_boost 加成
    let multBonus = 0;
    for (const [tid, rank] of Object.entries(this.state.player.talents)) {
      if (rank <= 0) continue;
      const node = TALENTS[tid];
      if (node?.effect.kind === 'skill_boost' && node.effect.skillId === skill.id && node.effect.stat === 'multiplier') {
        multBonus += node.effect.value * rank;
      }
    }
    const effectiveMultiplier = skill.multiplier * (1 + multBonus);
    for (const monster of this.state.monsters) {
      if (monster.hp > 0 && dist(monster.pos, target.pos) <= skill.radius) this.hitMonster(monster, effectiveMultiplier, index + 1);
    }
    this.say(`释放 ${skill.name}`);
  }

  private hitMonster(monster: Monster, multiplier: number, skillIndex: number): void {
    const stats = totalStats(this.state.player);
    const crit = Math.random() < stats.crit;
    let raw = Math.round((stats.attack * multiplier + Math.random() * stats.attack * 0.35) * (crit ? 1.8 : 1));
    // 词条: 暴击强化 (crit_damage) — 暴击时额外百分比伤害
    if (crit) {
      const critBonus = getAffixTotal(this.state.player, 'crit_damage');
      if (critBonus > 0) raw = Math.round(raw * (1 + critBonus / 100));
    }
    // 词条: 斩杀 (execute) — 目标低血量时伤害加成
    const executePercent = getAffixTotal(this.state.player, 'execute');
    if (executePercent > 0 && monster.hp < monster.maxHp * 0.3) {
      raw = Math.round(raw * (1 + executePercent / 100));
    }
    const damage = Math.max(1, raw - monster.defense);
    const actualDamage = Math.max(0, Math.min(monster.hp, damage));
    monster.hp -= damage;
    monster.hitstun = monster.boss ? C.HITSTUN_BOSS : C.HITSTUN_NORMAL;

    // Trigger hitstop
    this.state.hitstop = C.HITSTOP_DURATION;

    this.float(`${crit ? '暴击 ' : ''}-${damage}`, monster.pos.x, monster.pos.y - monster.radius, crit ? '#ffd166' : '#fff1b8', true);
    const dx = monster.pos.x - this.state.player.pos.x;
    const dy = monster.pos.y - this.state.player.pos.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    monster.vel.x += (dx / length) * (C.KNOCKBACK_BASE + damage * C.KNOCKBACK_DAMAGE_SCALE);
    monster.vel.y += (dy / length) * (C.KNOCKBACK_BASE + damage * C.KNOCKBACK_DAMAGE_SCALE);
    this.state.shake = Math.min(C.SHAKE_MAX, this.state.shake + (monster.boss ? C.SHAKE_MONSTER_HIT_BOSS : C.SHAKE_MONSTER_HIT_NORMAL));
    this.spawnParticles(monster.pos.x, monster.pos.y, crit ? '#ffd166' : '#d8f3ff', crit ? 14 : 8);

    // 词条: 吸血强化 (lifesteal_boost)
    let effectiveLifeSteal = stats.lifeSteal;
    const lsBoost = getAffixTotal(this.state.player, 'lifesteal_boost');
    if (lsBoost > 0) effectiveLifeSteal *= (1 + lsBoost / 100);

    // 英雄联盟机制: 技能/范围攻击吸血效率衰减至 33%
    if (skillIndex > 0) {
      effectiveLifeSteal *= C.HERO_LIFESteAL_REDUCTION;
    }

    if (effectiveLifeSteal > 0 && actualDamage > 0) {
      this.state.player.hp = Math.min(stats.maxHp, this.state.player.hp + Math.ceil(actualDamage * effectiveLifeSteal));
    }

    if (skillIndex) this.burst(monster.pos.x, monster.pos.y, this.state.skills[skillIndex - 1]);
    if (monster.hp <= 0) { this.killMonster(monster); return; }
    // 词条: 连击 (double_strike) — 概率追加普攻
    const doubleStrikeChance = getAffixTotal(this.state.player, 'double_strike');
    if (doubleStrikeChance > 0 && Math.random() * 100 < doubleStrikeChance && monster.hp > 0) {
      const extraDmg = Math.max(1, Math.round(stats.attack * 0.8) - monster.defense);
      monster.hp -= extraDmg;
      this.float(`连击-${extraDmg}`, monster.pos.x, monster.pos.y - monster.radius - 16, '#6fffd2');
      if (monster.hp <= 0) this.killMonster(monster);
    }
  }

  private killMonster(monster: Monster): void {
    const player = this.state.player;
    monster.hp = 0;
    monster.respawn = monster.boss ? C.MONSTER_RESPAWN_BOSS : monster.elite ? C.MONSTER_RESPAWN_ELITE : C.MONSTER_RESPAWN_NORMAL;
    this.state.stage.killedTotal++;
    if (monster.boss) this.state.stage.bossKilled = true;
    player.exp += monster.exp;
    player.gold += monster.boss ? 80 : monster.elite ? 25 : 8;
    this.state.drops.push(...makeDrops(monster.pos.x, monster.pos.y, monster.level, monster.boss));
    this.float(`+${monster.exp}经验`, monster.pos.x, monster.pos.y - 40, '#79e07d');
    while (player.exp >= player.nextExp) {
      player.exp -= player.nextExp;
      player.level += 1;
      player.nextExp = Math.floor(player.nextExp * C.LEVEL_EXP_SCALE + C.LEVEL_EXP_OFFSET);
      player.base.maxHp += C.LEVEL_HP_GAIN;
      player.base.attack += C.LEVEL_ATK_GAIN;
      player.base.defense += C.LEVEL_DEF_GAIN;
      player.talentPoints += 1;
      invalidateStatsCache();
      player.hp = totalStats(player).maxHp;
      this.say(`升级到 ${player.level} 级！获得1天赋点。`);
    }
  }

  private pickDrop(drop: Drop): void {
    const player = this.state.player;
    if (drop.gold) {
      player.gold += drop.gold;
      this.say(`拾取 ${drop.gold} 金币。`);
    }
    if (drop.item) {
      // 技能书: 直接学习或拾取
      if (drop.item.type === 'skillBook') {
        const book = drop.item;
        const alreadyKnown = this.state.skills.some((s) => s.id === book.skillId);
        if (alreadyKnown) {
          this.say(`已掌握 ${SKILL_DEFS[book.skillId]?.name ?? book.skillId}，跳过。`);
          return;
        }
        this.learnSkill(book.skillId);
        return;
      }
      if (player.inventory.length >= 28) {
        this.say('背包已满，无法拾取。');
        return;
      }
      player.inventory.push(drop.item);
      this.say(`拾取 ${drop.item.name}`);
    }
  }

  private handleTap(x: number, y: number): void {
    const state = this.state;
    const ui = state.ui;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Death screen: any tap revives
    if (!state.player.alive) { this.revive(); return; }

    // Offline reward panel: claim button
    if (ui.panel === 'offlineReward') {
      const panelW = Math.min(340, w - 40);
      const panelH = Math.min(300, h - 60);
      const px = (w - panelW) / 2;
      const py = (h - panelH) / 2;
      const btnW = panelW - 48;
      const btnH = 42;
      const btnX = px + 24;
      const btnY = py + panelH - 58;
      if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
        this.claimOfflineReward();
      }
      return;
    }

    // Class select panel
    if (ui.panel === 'classSelect') {
      const classIds = Object.keys(CLASSES);
      const cardW = Math.min(260, w - 40);
      const cardH = 100;
      const gap = 14;
      const totalH = classIds.length * cardH + (classIds.length - 1) * gap;
      const startY = (h - totalH) / 2;
      const startX = (w - cardW) / 2;
      for (let i = 0; i < classIds.length; i++) {
        const cy = startY + i * (cardH + gap);
        if (x >= startX && x <= startX + cardW && y >= cy && y <= cy + cardH) {
          this.selectClass(classIds[i]);
          return;
        }
      }
      return;
    }

    // Talents panel
    if (ui.panel === 'talents') {
      const panelW = Math.min(360, w - 24);
      const panelH = Math.min(460, h - 80);
      const px = (w - panelW) / 2;
      const py = (h - panelH) / 2;

      // Outside panel → close
      if (x < px || x > px + panelW || y < py || y > py + panelH) {
        ui.panel = 'none';
        return;
      }

      // Close button
      if (x >= px + panelW - 32 && x <= px + panelW - 8 && y >= py + 6 && y <= py + 30) {
        ui.panel = 'none';
        return;
      }

      // Talent node buttons — each row is 44px tall starting at py + 60
      const rowH = 44;
      const nodeStartY = py + 60;
      const classId = state.player.playerClass;
      if (classId) {
        const talentIds = CLASSES[classId]?.talents ?? [];
        for (let i = 0; i < talentIds.length; i++) {
          const btnY = nodeStartY + i * rowH;
          // Allocate button: right side of row, 56px wide
          const btnX = px + panelW - 72;
          if (x >= btnX && x <= btnX + 56 && y >= btnY && y <= btnY + 34) {
            this.allocateTalent(talentIds[i]);
            return;
          }
        }
      }
      return;
    }

    // Item detail panel is open
    if (ui.panel === 'itemDetail') {
      const dw = Math.min(300, w - 32);
      const dh = 340;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;

      // Tapped outside detail panel → close back to bag
      if (x < dx || x > dx + dw || y < dy || y > dy + dh) {
        ui.panel = 'bag';
        return;
      }

      // Button row: 3 buttons at bottom of detail panel
      const btnY = dy + dh - 52;
      const gap = 4;
      const btnW = Math.floor((dw - 40) / 3);
      const btnH = 36;
      const btnX0 = dx + 16;

      for (let i = 0; i < 3; i++) {
        const bx = btnX0 + i * (btnW + gap);
        if (x >= bx && x <= bx + btnW && y >= btnY && y <= btnY + btnH) {
          if (i === 0) this.useOrEquipItem();       // Equip / Use
          else if (i === 1) this.sellItem();        // Sell
          else this.discardItem();                   // Discard
          return;
        }
      }

      // Close button (top-right X)
      const closeSize = 28;
      if (x >= dx + dw - closeSize - 8 && x <= dx + dw - 8 && y >= dy + 8 && y <= dy + 8 + closeSize) {
        ui.panel = 'bag';
        return;
      }

      // Tap elsewhere on panel → do nothing
      return;
    }

    // Shop panel is open
    if (ui.panel === 'shop') {
      const compact = h > w * 1.12;
      const panelW = compact ? w - 24 : 380;
      const panelH = compact ? 200 : 220;
      const px = compact ? 12 : w / 2 - 190;
      const py = compact ? h / 2 - 100 : h / 2 - 110;

      // Tapped outside shop panel → close
      if (x < px || x > px + panelW || y < py || y > py + panelH) {
        ui.panel = 'none';
        return;
      }

      // Buy potion button
      const buyBtnY = py + 54;
      const buyBtnH = 40;
      if (x >= px + 16 && x <= px + panelW - 16 && y >= buyBtnY && y <= buyBtnY + buyBtnH) {
        this.buyPotion();
        return;
      }

      // Sell button (only when item is selected)
      if (ui.selectedIndex >= 0 && ui.selectedIndex < state.player.inventory.length) {
        const sellBtnY = buyBtnY + buyBtnH + 10;
        if (x >= px + 16 && x <= px + panelW - 16 && y >= sellBtnY && y <= sellBtnY + buyBtnH) {
          this.sellItem();
          return;
        }
      }

      // Close button — match render: closeY = py + panelH - 46, height 34
      const closeBtnY = py + panelH - 46;
      if (x >= px + 16 && x <= px + panelW - 16 && y >= closeBtnY && y <= closeBtnY + 34) {
        ui.panel = 'none';
        return;
      }

      return;
    }

    // Bag panel is open → check grid cell taps
    if (ui.panel === 'bag') {
      const compact = h > w * 1.12;
      const panelX = compact ? 10 : Math.max(360, w - 360);
      const panelY = compact ? 100 : 16;
      const panelW = compact ? w - 20 : 340;
      const panelH = compact ? Math.min(h - 240, 460) : 440;

      // Tapped outside bag panel → close
      if (x < panelX || x > panelX + panelW || y < panelY || y > panelY + panelH) {
        ui.panel = 'none';
        return;
      }

      // Close button in bag header (top-right)
      const closeSize = 24;
      if (x >= panelX + panelW - closeSize - 8 && x <= panelX + panelW - 8 && y >= panelY + 6 && y <= panelY + 6 + closeSize) {
        ui.panel = 'none';
        return;
      }

      // Grid area — dynamically computed to match render.ts drawInventory
      const cols = 4;
      const cellSize = compact ? 48 : 54;
      const gap = 5;
      const eqCount = Object.entries(state.player.equipment).length;
      const gridStartY = panelY + 52 + eqCount * (compact ? 16 : 19) + 12 + 20;
      const gridX = panelX + 14;

      if (y < gridStartY) return; // Tapped in equipment section, ignore

      const col = Math.floor((x - gridX) / (cellSize + gap));
      const row = Math.floor((y - gridStartY + ui.scroll) / (cellSize + gap));
      if (col < 0 || col >= cols) return;

      const index = row * cols + col;
      if (index < 0 || index >= state.player.inventory.length) return;

      // Tap grid cell → open detail panel
      ui.selectedIndex = index;
      ui.panel = 'itemDetail';
      const item = state.player.inventory[index];
      this.say(`${item.name}`);
      return;
    }

    // No panel open → taps on game world do nothing special (handled by action buttons)
  }

  private useOrEquipItem(): void {
    const player = this.state.player;
    const item = player.inventory[this.state.ui.selectedIndex];
    if (!item) return;
    if (item.type === 'potion') {
      const stats = totalStats(player);
      player.hp = Math.min(stats.maxHp, player.hp + item.heal);
      player.inventory.splice(this.state.ui.selectedIndex, 1);
      this.say(`使用 ${item.name}，恢复 ${item.heal} HP`);
    } else if (item.type === 'skillBook') {
      const book = item;
      const alreadyKnown = this.state.skills.some((s) => s.id === book.skillId);
      if (alreadyKnown) {
        this.say(`已掌握该技能。`);
      } else {
        this.learnSkill(book.skillId);
      }
      player.inventory.splice(this.state.ui.selectedIndex, 1);
    } else {
      const old = player.equipment[item.slot];
      player.equipment[item.slot] = item;
      player.inventory.splice(this.state.ui.selectedIndex, 1);
      if (old) player.inventory.push(old);
      invalidateStatsCache();
      player.hp = Math.min(totalStats(player).maxHp, player.hp + 20);
      this.say(`装备 ${item.name}`);
    }
    this.state.ui.selectedIndex = clamp(this.state.ui.selectedIndex, 0, Math.max(0, player.inventory.length - 1));
    this.state.ui.panel = 'bag';
  }

  private sellItem(): void {
    const player = this.state.player;
    const item = player.inventory[this.state.ui.selectedIndex];
    if (!item) return;
    const gold = Math.floor(item.price * C.SELL_PRICE_RATIO);
    player.gold += gold;
    player.inventory.splice(this.state.ui.selectedIndex, 1);
    this.say(`出售 ${item.name}，获得 ${gold} 金币`);
    this.state.ui.selectedIndex = clamp(this.state.ui.selectedIndex, 0, Math.max(0, player.inventory.length - 1));
    if (player.inventory.length === 0 || this.state.ui.panel === 'itemDetail') {
      this.state.ui.panel = this.state.ui.panel === 'itemDetail' ? 'bag' : this.state.ui.panel;
    }
  }

  private discardItem(): void {
    const player = this.state.player;
    const item = player.inventory[this.state.ui.selectedIndex];
    if (!item) return;
    player.inventory.splice(this.state.ui.selectedIndex, 1);
    this.say(`丢弃 ${item.name}`);
    this.state.ui.selectedIndex = clamp(this.state.ui.selectedIndex, 0, Math.max(0, player.inventory.length - 1));
    this.state.ui.panel = 'bag';
  }

  buyPotion(): void {
    if (this.state.ui.panel !== 'shop') {
      this.say('需要靠近商人打开商店。');
      return;
    }
    const player = this.state.player;
    const potion = makePotion(player.level);
    if (player.gold < potion.price) {
      this.say('金币不足。');
      return;
    }
    if (player.inventory.length >= 28) {
      this.say('背包已满。');
      return;
    }
    player.gold -= potion.price;
    player.inventory.push(potion);
    this.say(`购买 ${potion.name}`);
  }

  private nearestLiving(range: number): Monster | null {
    const playerPos = this.state.player.pos;
    const maxDistSq = range * range;
    let best: Monster | null = null;
    let bestDistSq = maxDistSq;
    for (const monster of this.state.monsters) {
      if (monster.hp <= 0) continue;
      const dx = monster.pos.x - playerPos.x;
      const dy = monster.pos.y - playerPos.y;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestDistSq) {
        best = monster;
        bestDistSq = dSq;
      }
    }
    return best;
  }

  /** 处理通关/死亡面板的触摸交互 */
  private handleStageTap(x: number, y: number): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ui = this.state.ui;

    // 死亡面板：重试 / 返回
    if (ui.panel === 'death') {
      const panelW = Math.min(320, w - 40);
      const panelH = Math.min(240, h - 60);
      const px = (w - panelW) / 2;
      const py = (h - panelH) / 2;

      const btnW = Math.floor((panelW - 48) / 2);
      const btnH = 40;
      const btnY = py + panelH - 56;
      const retryX = px + 16;
      const returnX = px + 16 + btnW + 16;

      if (y >= btnY && y <= btnY + btnH) {
        if (x >= retryX && x <= retryX + btnW) {
          this.retryStage();
          return;
        }
        if (x >= returnX && x <= returnX + btnW) {
          this.returnToStageSelect();
          return;
        }
      }
      return;
    }

    // 通关面板：继续
    if (ui.panel === 'stageClear') {
      const panelW = Math.min(360, w - 40);
      const panelH = Math.min(320, h - 60);
      const px = (w - panelW) / 2;
      const py = (h - panelH) / 2;

      const btnW = panelW - 48;
      const btnH = 42;
      const btnX = px + 24;
      const btnY = py + panelH - 58;

      if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
        this.advanceToNextStage();
        return;
      }
      return;
    }
  }

  /** 领取离线收益 */
  private claimOfflineReward(): void {
    const reward = this.state.ui.offlineReward;
    if (reward) {
      applyOfflineReward(this.state.player, reward);
      this.say(`领取了离线收益：${reward.gold}金币 ${reward.exp}经验`);
    }
    this.state.ui.offlineReward = undefined;
    this.state.ui.panel = 'none';
    saveGame(this.state);
  }

  private revive(): void {
    const player = this.state.player;
    const stats = totalStats(player);
    player.pos = { ...RESPAWN_POS };
    player.hp = Math.ceil(stats.maxHp * C.REVIVE_HP_PERCENT);
    player.alive = true;
    this.say('你在安全区复活了。');
  }

  private swingAtAir(color: string): void {
    const from = this.state.player.pos;
    const to = { x: from.x + this.state.player.facing.x * C.AIR_SLASH_LENGTH, y: from.y + this.state.player.facing.y * C.AIR_SLASH_LENGTH };
    this.addSlash(from, to, color, '/');
  }

  private addSlash(from: Vec2, to: Vec2, color: string, char: string, style?: 'line' | 'arc' | 'lightning'): void {
    this.state.slashes.push({ from: { ...from }, to: { ...to }, color, char, ttl: C.SLASH_TTL, maxTtl: C.SLASH_TTL, style });
  }

  private spawnParticles(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = C.PARTICLE_SPEED_MIN + Math.random() * (C.PARTICLE_SPEED_MAX - C.PARTICLE_SPEED_MIN);
      this.state.particles.push({
        pos: { x, y },
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed - 35 },
        char: Math.random() > 0.5 ? '*' : '+',
        color,
        ttl: C.PARTICLE_TTL_MIN + Math.random() * (C.PARTICLE_TTL_MAX - C.PARTICLE_TTL_MIN)
      });
    }
  }

  private burst(x: number, y: number, skill: Skill): void {
    this.state.floats.push({ text: skill.name, pos: { x, y: y - 58 }, color: skill.color, ttl: 0.7 });
  }

  private float(text: string, x: number, y: number, color: string, bouncy = false): void {
    const float: FloatingText = { text, pos: { x, y }, color, ttl: bouncy ? C.FLOAT_DURATION_BOUNCY : C.FLOAT_DURATION_NORMAL };
    if (bouncy) {
      const angle = C.FLOAT_VELOCITY_ANGLE_CENTER + (Math.random() - 0.5) * C.FLOAT_VELOCITY_ANGLE_SPREAD;
      const speed = C.FLOAT_SPEED_MIN + Math.random() * (C.FLOAT_SPEED_MAX - C.FLOAT_SPEED_MIN);
      float.vel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
    }
    this.state.floats.push(float);
  }

  private say(message: string): void {
    this.state.messages.push({ text: message, timer: C.MESSAGE_DURATION });
    if (this.state.messages.length > C.MAX_MESSAGES) this.state.messages.shift();
  }

  /* ---- 职业 / 技能 / 天赋 ---- */

  selectClass(classId: string): void {
    const cls = CLASSES[classId];
    if (!cls) return;
    const player = this.state.player;
    player.playerClass = classId;
    player.talents = {};
    player.talentPoints = 1; // 选职业送1点天赋
    invalidateStatsCache();
    // 学习初始技能
    for (const skillId of cls.starterSkills) this.learnSkill(skillId);
    this.state.ui.panel = 'none';
    this.say(`选择了 ${cls.name}！获得初始技能和1天赋点。`);
  }

  private learnSkill(skillId: string): void {
    const def = SKILL_DEFS[skillId];
    if (!def) return;
    if (this.state.skills.some((s) => s.id === skillId)) return;
    const skill: Skill = {
      id: def.id,
      name: def.name,
      cooldown: def.cooldown,
      remaining: 0,
      range: def.range,
      radius: def.radius,
      multiplier: def.multiplier,
      color: def.color,
      style: def.style,
    };
    this.state.skills.push(skill);
    this.say(`学会了 ${def.name}！`);
  }

  allocateTalent(talentId: string): void {
    const player = this.state.player;
    if (player.talentPoints <= 0) {
      this.say('天赋点不足。');
      return;
    }
    const node = TALENTS[talentId];
    if (!node) return;
    const current = player.talents[talentId] ?? 0;
    if (current >= node.maxRank) {
      this.say(`${node.name} 已满级。`);
      return;
    }
    // 检查前置
    if (node.requires) {
      for (const req of node.requires) {
        if (!player.talents[req] || player.talents[req] <= 0) {
          const reqNode = TALENTS[req];
          this.say(`需要先解锁 ${reqNode?.name ?? req}。`);
          return;
        }
      }
    }
    player.talents[talentId] = current + 1;
    player.talentPoints -= 1;
    invalidateStatsCache();
    this.say(`${node.name} 升至 ${current + 1}/${node.maxRank} 级。`);
  }

  /* ---- 词条辅助 ---- */
  // getAffixTotal 已从 save.ts 导入（带缓存的版本），不再需要实例方法

  private resize(): void {
    const width = Math.floor(window.visualViewport?.width ?? window.innerWidth);
    const height = Math.floor(window.visualViewport?.height ?? window.innerHeight);
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

}