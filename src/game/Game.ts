import { MONSTER_BASE } from '../data/tables';
import { CLASSES, SKILL_DEFS, TALENTS } from '../data/skills';
import { RESPAWN_POS, WORLD } from '../data/world';
import { makeDrops, makePotion, uid } from '../systems/loot';
import { clearSave, loadGame, saveGame, totalStats } from '../systems/save';
import { Input } from './input';
import { render } from './render';
import type { AttackAction, Drop, GameState, Monster, MonsterKind, Player, Skill, SkillBookItem, Vec2 } from './types';

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
    regenTimer: 0
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
    radius: boss ? 34 : elite ? 24 : 18,
    speed: base.speed * (boss ? 1.1 : 1),
    elite,
    boss,
    respawn: 0,
    attackCooldown: 0,
    vel: { x: 0, y: 0 },
    facing: { x: -1, y: 0 },
    action: null,
    hitstun: 0,
    enraged: false
  };
}

function createMonsters(): Monster[] {
  const monsters: Monster[] = [];
  const packs: Array<[MonsterKind, number, number, number, number]> = [
    ['稻草人', 12, 160, 190, 2],
    ['半兽人', 12, 1600, 230, 7],
    ['骷髅战士', 10, 270, 1040, 14],
    ['沃玛卫士', 9, 1620, 1090, 22]
  ];
  for (const [kind, count, cx, cy, level] of packs) {
    for (let i = 0; i < count; i += 1) {
      monsters.push(spawnMonster(kind, cx + Math.random() * 460, cy + Math.random() * 300, level + Math.floor(Math.random() * 4), i === 0));
    }
  }
  monsters.push(spawnMonster('赤月恶魔', 1840, 1200, 32, false, true));
  return monsters;
}

function createState(): GameState {
  const loaded = loadGame();
  const player = loaded?.player ?? makePlayer();
  player.alive = player.hp > 0;
  player.facing ??= { x: 1, y: 0 };
  player.action = null;
  player.invincible ??= false;
  player.invTimer ??= 0;
  player.talentPoints ??= 0;
  player.talents ??= {};
  player.regenTimer ??= 0;
  const isNewGame = !loaded;
  return {
    player,
    monsters: createMonsters(),
    drops: [],
    skills: loaded?.skills ?? [],
    floats: [],
    message: isNewGame ? '选择你的职业开始冒险！' : '欢迎来到赤月孤城：WASD/方向键移动，空格攻击，1/2/3 技能，I 背包，E 商店，T 天赋。',
    messageTimer: 8,
    time: loaded?.time ?? 0,
    camera: { x: 0, y: 0 },
    shake: 0,
    particles: [],
    slashes: [],
    ui: { panel: isNewGame ? 'classSelect' : 'none', selectedIndex: 0, scroll: 0 },
    showHelp: !isNewGame,
    resetConfirm: false
  };
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
    this.handleActions();
    this.handleBagScroll();
    if (state.player.alive) this.updatePlayer(dt);
    this.updateActions(dt);
    this.updateMonsters(dt);
    this.updateDrops(dt);
    this.updatePhysics(dt);
    this.updateUi(dt);
    state.camera.x = clamp(state.player.pos.x - this.canvas.width / 2, 0, WORLD.width - this.canvas.width);
    state.camera.y = clamp(state.player.pos.y - this.canvas.height / 2, 0, WORLD.height - this.canvas.height);
    this.saveTimer += dt;
    if (this.saveTimer > 8) {
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

    // Toggle shop (only near shop)
    if (this.input.consume('e')) {
      if (ui.panel === 'shop') {
        ui.panel = 'none';
      } else if (dist(state.player.pos, RESPAWN_POS) < 190) {
        ui.panel = 'shop';
      }
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

    // Death
    if (!state.player.alive && this.input.consumeAny([' ', 'tap'])) this.revive();

    // Attack
    if (this.input.consume(' ')) {
      if (ui.panel === 'itemDetail') {
        this.useOrEquipItem();
      } else {
        this.basicAttack();
      }
    }

    // Skills
    if (this.input.consume('1')) this.castSkill(0);
    if (this.input.consume('2')) this.castSkill(1);
    if (this.input.consume('3')) this.castSkill(2);

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
        this.scrollVelocity *= 0.92;
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
    const speed = player.action ? 72 : 160;
    player.pos.x = clamp(player.pos.x + this.input.move.x * speed * dt, 20, WORLD.width - 20);
    player.pos.y = clamp(player.pos.y + this.input.move.y * speed * dt, 20, WORLD.height - 20);
    if (Math.hypot(this.input.move.x, this.input.move.y) > 0.1) player.facing = normalize(this.input.move);
    player.attackCooldown = Math.max(0, player.attackCooldown - dt);
    for (const skill of this.state.skills) skill.remaining = Math.max(0, skill.remaining - dt);
    // Invincibility frames
    if (player.invTimer > 0) {
      player.invTimer = Math.max(0, player.invTimer - dt);
      if (player.invTimer <= 0) player.invincible = false;
    }
    if (player.hp <= 0) player.alive = false;
    // 词条: 生命回复 (hp_regen) — 每秒回复
    const regenValue = this.getAffixTotal('hp_regen');
    if (regenValue > 0 && player.hp > 0) {
      player.regenTimer += dt;
      if (player.regenTimer >= 1) {
        player.regenTimer -= 1;
        const maxHp = totalStats(player).maxHp;
        player.hp = Math.min(maxHp, player.hp + regenValue);
      }
    }
  }

  private updateActions(dt: number): void {
    const player = this.state.player;
    if (player.action) this.advancePlayerAction(player.action, dt);
    for (const monster of this.state.monsters) {
      if (monster.action) this.advanceMonsterAction(monster, monster.action, dt);
    }
  }

  private advancePlayerAction(action: AttackAction, dt: number): void {
    const player = this.state.player;
    action.timer += dt;
    const strikeAt = action.kind === 'basic' ? 0.16 : 0.24;
    const recoveryAt = action.kind === 'basic' ? 0.26 : 0.36;
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

  private advanceMonsterAction(monster: Monster, action: AttackAction, dt: number): void {
    action.timer += dt;
    const strikeAt = monster.boss ? 0.52 : 0.34;
    const recoveryAt = monster.boss ? 0.7 : 0.48;
    if (action.phase === 'windup' && action.timer >= strikeAt) {
      action.phase = 'strike';
      if (!action.resolved && monster.hp > 0) {
        action.resolved = true;
        this.resolveMonsterAttack(monster);
      }
    }
    if (action.phase === 'strike' && action.timer >= recoveryAt) action.phase = 'recovery';
    if (action.timer >= action.duration) monster.action = null;
  }

  private updateMonsters(dt: number): void {
    const player = this.state.player;
    for (const monster of this.state.monsters) {
      if (monster.hp <= 0) {
        monster.respawn -= dt;
        if (monster.respawn <= 0) this.respawnMonster(monster);
        continue;
      }
      // Boss enrage: below 30% HP → faster and stronger
      if (monster.boss && !monster.enraged && monster.hp < monster.maxHp * 0.3) {
        monster.enraged = true;
        monster.attack = Math.round(monster.attack * 1.4);
        this.float('狂暴!', monster.pos.x, monster.pos.y - monster.radius - 30, '#ff2020');
        this.spawnParticles(monster.pos.x, monster.pos.y, '#ff2020', 20);
        this.say('赤月恶魔陷入狂暴！');
      }
      const speed = monster.speed * (monster.enraged ? 1.4 : 1);
      monster.hitstun = Math.max(0, monster.hitstun - dt);
      if (monster.hitstun > 0) continue;
      monster.attackCooldown = Math.max(0, monster.attackCooldown - dt);
      if (monster.action) continue;
      if (!player.alive) continue;
      const d = dist(monster.pos, player.pos);
      if (d < 360) {
        const dx = (player.pos.x - monster.pos.x) / Math.max(1, d);
        const dy = (player.pos.y - monster.pos.y) / Math.max(1, d);
        monster.facing = { x: dx, y: dy };
        if (d > monster.radius + 24) {
          monster.pos.x += dx * speed * dt + monster.vel.x * dt;
          monster.pos.y += dy * speed * dt + monster.vel.y * dt;
        } else if (monster.attackCooldown <= 0) {
          monster.action = makeAction('monster', monster.boss ? 0.92 : 0.62);
          monster.attackCooldown = monster.boss ? (monster.enraged ? 1.2 : 1.7) : 1.25;
          this.float('!', monster.pos.x, monster.pos.y - monster.radius - 20, monster.boss ? '#ff3150' : '#ffd166');
        }
      } else if (d > 520) {
        const home = dist(monster.pos, monster.spawn);
        if (home > 8) {
          monster.pos.x += ((monster.spawn.x - monster.pos.x) / home) * speed * 0.45 * dt + monster.vel.x * dt;
          monster.pos.y += ((monster.spawn.y - monster.pos.y) / home) * speed * 0.45 * dt + monster.vel.y * dt;
        }
      }
    }
  }

  private updateDrops(dt: number): void {
    const player = this.state.player;
    this.state.drops = this.state.drops.filter((drop) => {
      drop.ttl -= dt;
      if (drop.ttl <= 0) return false;
      if (player.alive && dist(drop.pos, player.pos) < 42) {
        this.pickDrop(drop);
        return false;
      }
      return true;
    });
  }

  private updatePhysics(dt: number): void {
    const state = this.state;
    state.shake = Math.max(0, state.shake - dt * 14);
    this.resolveCollisions();
    for (const monster of state.monsters) {
      monster.vel.x *= Math.pow(0.02, dt);
      monster.vel.y *= Math.pow(0.02, dt);
      if (monster.hp > 0) {
        monster.pos.x = clamp(monster.pos.x, 20, WORLD.width - 20);
        monster.pos.y = clamp(monster.pos.y, 20, WORLD.height - 20);
      }
    }
    state.particles = state.particles.filter((particle) => {
      particle.ttl -= dt;
      particle.pos.x += particle.vel.x * dt;
      particle.pos.y += particle.vel.y * dt;
      particle.vel.x *= Math.pow(0.18, dt);
      particle.vel.y = particle.vel.y * Math.pow(0.18, dt) + 80 * dt;
      return particle.ttl > 0;
    });
    state.slashes = state.slashes.filter((slash) => {
      slash.ttl -= dt;
      return slash.ttl > 0;
    });
  }

  private resolveCollisions(): void {
    const monsters = this.state.monsters.filter((monster) => monster.hp > 0);
    for (let i = 0; i < monsters.length; i += 1) {
      const a = monsters[i];
      for (let j = i + 1; j < monsters.length; j += 1) {
        const b = monsters[j];
        this.separateBodies(a.pos, a.radius, b.pos, b.radius, a.boss ? 0.75 : 0.5);
      }
      if (this.state.player.alive) this.separateBodies(a.pos, a.radius, this.state.player.pos, 18, 0.65);
    }
  }

  private separateBodies(a: Vec2, ar: number, b: Vec2, br: number, aWeight: number): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.max(0.001, Math.hypot(dx, dy));
    const overlap = ar + br + 4 - d;
    if (overlap <= 0) return;
    const nx = dx / d;
    const ny = dy / d;
    const bWeight = 1 - aWeight;
    a.x = clamp(a.x - nx * overlap * bWeight, 20, WORLD.width - 20);
    a.y = clamp(a.y - ny * overlap * bWeight, 20, WORLD.height - 20);
    b.x = clamp(b.x + nx * overlap * aWeight, 20, WORLD.width - 20);
    b.y = clamp(b.y + ny * overlap * aWeight, 20, WORLD.height - 20);
  }

  private updateUi(dt: number): void {
    const state = this.state;
    state.messageTimer = Math.max(0, state.messageTimer - dt);
    state.floats = state.floats.filter((text) => {
      text.ttl -= dt;
      text.pos.y -= 26 * dt;
      return text.ttl > 0;
    });
    if (state.ui.panel === 'shop' && dist(state.player.pos, RESPAWN_POS) >= 220) {
      state.ui.panel = 'none';
    }
  }

  private basicAttack(): void {
    const player = this.state.player;
    if (!player.alive || player.attackCooldown > 0 || player.action) return;
    const target = this.nearestLiving(72);
    if (!target) {
      this.say('附近没有可攻击目标。');
      player.attackCooldown = 0.3;
      return;
    }
    player.facing = normalize({ x: target.pos.x - player.pos.x, y: target.pos.y - player.pos.y });
    player.action = makeAction('basic', 0.42, target.id);
    player.attackCooldown = 0.72;
  }

  private castSkill(index: number): void {
    const skill = this.state.skills[index];
    if (!skill || skill.remaining > 0 || !this.state.player.alive || this.state.player.action) return;
    const target = this.nearestLiving(skill.range);
    if (!target) {
      this.say(`${skill.name} 范围内没有目标。`);
      return;
    }
    this.state.player.facing = normalize({ x: target.pos.x - this.state.player.pos.x, y: target.pos.y - this.state.player.pos.y });
    this.state.player.action = makeAction('skill', 0.58, target.id, index);
    skill.remaining = skill.cooldown;
    this.say(`准备 ${skill.name}`);
  }

  private resolveBasicAttack(targetId?: string): void {
    const target = this.state.monsters.find((monster) => monster.id === targetId && monster.hp > 0) ?? this.nearestLiving(88);
    if (!target || dist(target.pos, this.state.player.pos) - target.radius > 88) {
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

  private resolveMonsterAttack(monster: Monster): void {
    const player = this.state.player;
    if (!player.alive) return;
    const reach = monster.radius + 32;
    if (dist(monster.pos, player.pos) > reach) return;
    // Invincibility frames — skip damage entirely
    if (player.invincible) {
      this.float('MISS', player.pos.x, player.pos.y - 28, 'rgba(255,255,255,0.4)');
      return;
    }
    // 词条: 闪避 (dodge)
    const dodgeChance = this.getAffixTotal('dodge');
    if (dodgeChance > 0 && Math.random() * 100 < dodgeChance) {
      this.float('闪避', player.pos.x, player.pos.y - 28, '#79e07d');
      return;
    }
    const playerStats = totalStats(player);
    const damage = Math.max(1, monster.attack - playerStats.defense + Math.floor(Math.random() * 6));
    player.hp -= damage;
    // 词条: 荆棘 (thorns) — 反弹伤害
    const thornsPercent = this.getAffixTotal('thorns');
    if (thornsPercent > 0) {
      const reflect = Math.max(1, Math.round(damage * thornsPercent / 100));
      monster.hp -= reflect;
      this.float(`荆棘-${reflect}`, monster.pos.x, monster.pos.y - monster.radius, '#c57cff');
      if (monster.hp <= 0) this.killMonster(monster);
    }
    // Grant i-frames after being hit (0.5s)
    player.invincible = true;
    player.invTimer = 0.5;
    this.addSlash(monster.pos, player.pos, monster.boss ? '#ff3150' : '#ffd166', '!');
    this.float(`-${damage}`, player.pos.x, player.pos.y - 28, '#ff6868');
    this.spawnParticles(player.pos.x, player.pos.y, '#ff6868', monster.boss ? 16 : 8);
    this.state.shake = Math.min(1.4, this.state.shake + (monster.boss ? 0.65 : 0.22));
    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
      player.invincible = false;
      player.invTimer = 0;
      this.say('你倒下了。按空格或攻击键回城复活。');
    }
  }

  private hitMonster(monster: Monster, multiplier: number, skillIndex: number): void {
    const stats = totalStats(this.state.player);
    const crit = Math.random() < stats.crit;
    let raw = Math.round((stats.attack * multiplier + Math.random() * stats.attack * 0.35) * (crit ? 1.8 : 1));
    // 词条: 暴击强化 (crit_damage) — 暴击时额外百分比伤害
    if (crit) {
      const critBonus = this.getAffixTotal('crit_damage');
      if (critBonus > 0) raw = Math.round(raw * (1 + critBonus / 100));
    }
    // 词条: 斩杀 (execute) — 目标低血量时伤害加成
    const executePercent = this.getAffixTotal('execute');
    if (executePercent > 0 && monster.hp < monster.maxHp * 0.3) {
      raw = Math.round(raw * (1 + executePercent / 100));
    }
    const damage = Math.max(1, raw - monster.defense);
    monster.hp -= damage;
    monster.hitstun = monster.boss ? 0.2 : 0.12;
    this.float(`${crit ? '暴击 ' : ''}-${damage}`, monster.pos.x, monster.pos.y - monster.radius, crit ? '#ffd166' : '#fff1b8');
    const dx = monster.pos.x - this.state.player.pos.x;
    const dy = monster.pos.y - this.state.player.pos.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    monster.vel.x += (dx / length) * (90 + damage * 2.5);
    monster.vel.y += (dy / length) * (90 + damage * 2.5);
    this.state.shake = Math.min(1.4, this.state.shake + (monster.boss ? 0.55 : 0.28));
    this.spawnParticles(monster.pos.x, monster.pos.y, crit ? '#ffd166' : '#d8f3ff', crit ? 14 : 8);
    // 词条: 吸血强化 (lifesteal_boost)
    let effectiveLifeSteal = stats.lifeSteal;
    const lsBoost = this.getAffixTotal('lifesteal_boost');
    if (lsBoost > 0) effectiveLifeSteal *= (1 + lsBoost / 100);
    if (effectiveLifeSteal > 0) {
      this.state.player.hp = Math.min(stats.maxHp, this.state.player.hp + Math.ceil(damage * effectiveLifeSteal));
    }
    if (skillIndex) this.burst(monster.pos.x, monster.pos.y, this.state.skills[skillIndex - 1]);
    if (monster.hp <= 0) { this.killMonster(monster); return; }
    // 词条: 连击 (double_strike) — 概率追加普攻
    const doubleStrikeChance = this.getAffixTotal('double_strike');
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
    monster.respawn = monster.boss ? 45 : monster.elite ? 24 : 12;
    player.exp += monster.exp;
    player.gold += monster.boss ? 80 : monster.elite ? 25 : 8;
    this.state.drops.push(...makeDrops(monster.pos.x, monster.pos.y, monster.level, monster.boss));
    this.float(`+${monster.exp}经验`, monster.pos.x, monster.pos.y - 40, '#79e07d');
    while (player.exp >= player.nextExp) {
      player.exp -= player.nextExp;
      player.level += 1;
      player.nextExp = Math.floor(player.nextExp * 1.35 + 40);
      player.base.maxHp += 18;
      player.base.attack += 3;
      player.base.defense += 1;
      player.talentPoints += 1;
      player.hp = totalStats(player).maxHp;
      this.say(`升级到 ${player.level} 级！获得1天赋点。`);
    }
  }

  private respawnMonster(monster: Monster): void {
    const fresh = spawnMonster(monster.kind, monster.spawn.x, monster.spawn.y, monster.level, monster.elite, monster.boss);
    Object.assign(monster, fresh, { id: monster.id });
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
        const book = drop.item as SkillBookItem;
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
      const book = item as SkillBookItem;
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
    const gold = Math.floor(item.price * 0.55);
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
    let best: Monster | null = null;
    let bestD = range;
    for (const monster of this.state.monsters) {
      if (monster.hp <= 0) continue;
      const d = dist(monster.pos, this.state.player.pos) - monster.radius;
      if (d < bestD) {
        best = monster;
        bestD = d;
      }
    }
    return best;
  }

  private revive(): void {
    const player = this.state.player;
    const stats = totalStats(player);
    player.pos = { ...RESPAWN_POS };
    player.hp = Math.ceil(stats.maxHp * 0.7);
    player.alive = true;
    this.say('你在安全区复活了。');
  }

  private swingAtAir(color: string): void {
    const from = this.state.player.pos;
    const to = { x: from.x + this.state.player.facing.x * 74, y: from.y + this.state.player.facing.y * 74 };
    this.addSlash(from, to, color, '/');
  }

  private addSlash(from: Vec2, to: Vec2, color: string, char: string, style?: 'line' | 'arc' | 'lightning'): void {
    this.state.slashes.push({ from: { ...from }, to: { ...to }, color, char, ttl: 0.18, maxTtl: 0.18, style });
  }

  private spawnParticles(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 180;
      this.state.particles.push({
        pos: { x, y },
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed - 35 },
        char: Math.random() > 0.5 ? '*' : '+',
        color,
        ttl: 0.28 + Math.random() * 0.38
      });
    }
  }

  private burst(x: number, y: number, skill: Skill): void {
    this.state.floats.push({ text: skill.name, pos: { x, y: y - 58 }, color: skill.color, ttl: 0.7 });
  }

  private float(text: string, x: number, y: number, color: string): void {
    this.state.floats.push({ text, pos: { x, y }, color, ttl: 0.9 });
  }

  private say(message: string): void {
    this.state.message = message;
    this.state.messageTimer = 4;
  }

  /* ---- 职业 / 技能 / 天赋 ---- */

  selectClass(classId: string): void {
    const cls = CLASSES[classId];
    if (!cls) return;
    const player = this.state.player;
    player.playerClass = classId;
    player.talents = {};
    player.talentPoints = 1; // 选职业送1点天赋
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
    this.say(`${node.name} 升至 ${current + 1}/${node.maxRank} 级。`);
  }

  /* ---- 词条辅助 ---- */

  private getAffixTotal(affixId: string): number {
    let total = 0;
    for (const item of Object.values(this.state.player.equipment)) {
      if (!item?.affixes) continue;
      for (const affix of item.affixes) {
        if (affix.id === affixId) total += affix.value;
      }
    }
    return total;
  }

  private resize(): void {
    const width = Math.floor(window.visualViewport?.width ?? window.innerWidth);
    const height = Math.floor(window.visualViewport?.height ?? window.innerHeight);
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }
}
