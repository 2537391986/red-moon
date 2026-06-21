import { AFFIX_DEFS, SLOT_NAMES } from '../data/tables';
import { CLASSES, SKILL_DEFS, TALENTS } from '../data/skills';
import { STAGES, getStageById } from '../data/stages';
import { totalStats } from '../systems/save';
import type { GameMessage, GameState, StageTheme } from './types';

// ─── Apple-inspired palette ─────────────────────────────────────────
const SURFACE  = 'rgba(28, 28, 30, 0.88)';
const GLASS    = 'rgba(44, 44, 46, 0.72)';
const BORDER   = 'rgba(255, 255, 255, 0.08)';
const BORDER_H = 'rgba(255, 255, 255, 0.18)';
const T1       = 'rgba(255, 255, 255, 0.92)';   // primary text
const T2       = 'rgba(255, 255, 255, 0.55)';   // secondary text
const T3       = 'rgba(255, 255, 255, 0.30)';   // tertiary text
const ACCENT   = '#0A84FF';                       // system blue
const SUCCESS  = '#30D158';                       // system green
const WARN     = '#FF453A';                       // system red
const GOLD     = '#FFD60A';                       // gold
const HP_BAR   = '#FF375F';
const EXP_BAR  = '#0A84FF';

// rarity — muted, sophisticated
const RARITY: Record<string, string> = {
  '\u666E\u901A': 'rgba(255,255,255,0.45)',
  '\u7CBE\u826F': '#30D158',
  '\u7A00\u6709': '#0A84FF',
  '\u53F2\u8BD7': '#BF5AF2',
  '\u4F20\u8BF4': '#FF9F0A'
};
function rarityColor(r: string): string {
  return RARITY[r] ?? T1;
}

// ─── Theme parallax layers ──────────────────────────────────────────
const THEMES: Record<StageTheme, { bg: string; symbols: { char: string; color: string; alpha: number }[] }> = {
  plain:  { bg: '#050510', symbols: [{ char: '.', color: '#222240', alpha: 0.3 }, { char: '+', color: '#1a1a30', alpha: 0.2 }] },
  forest: { bg: '#050a05', symbols: [{ char: '|', color: '#1a3020', alpha: 0.3 }, { char: 'Y', color: '#143018', alpha: 0.2 }] },
  ruin:   { bg: '#0a0808', symbols: [{ char: '∏', color: '#302020', alpha: 0.3 }, { char: '⌐', color: '#281818', alpha: 0.2 }] },
  cave:   { bg: '#040408', symbols: [{ char: '~', color: '#181830', alpha: 0.3 }, { char: '.', color: '#101020', alpha: 0.2 }] },
  castle: { bg: '#0a0505', symbols: [{ char: '║', color: '#301818', alpha: 0.3 }, { char: '═', color: '#281414', alpha: 0.2 }] },
  void:   { bg: '#000005', symbols: [{ char: '*', color: '#181830', alpha: 0.3 }, { char: '·', color: '#101020', alpha: 0.2 }] },
};

// ─── Drawing helpers ────────────────────────────────────────────────

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, value: number, max: number, fill: string): void {
  // Track
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  // Fill
  const fw = Math.max(0, Math.min(w, (value / Math.max(1, max)) * w));
  if (fw > 0) {
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, fw, h, h / 2);
    ctx.fill();
  }
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color = T1, size = 13, align: CanvasTextAlign = 'left'): void {
  ctx.font = `${size}px -apple-system, "SF Pro Text", "Helvetica Neue", Consolas, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

function textGlow(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color: string, size = 13, align: CanvasTextAlign = 'left'): void {
  ctx.font = `${size}px -apple-system, "SF Pro Text", "Helvetica Neue", Consolas, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
  ctx.shadowBlur = 0;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 12): void {
  ctx.fillStyle = SURFACE;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 0.5;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.lineWidth = 1;
}

function isPortrait(w: number, h: number): boolean {
  return h > w * 1.12;
}

function worldToScreen(state: GameState, x: number, y: number): [number, number] {
  return [x - state.camera.x, y - state.camera.y];
}

function statLabel(key: string): string {
  if (key === 'maxHp') return '\u751F\u547D';
  if (key === 'attack') return '\u653B\u51FB';
  if (key === 'defense') return '\u9632\u5FA1';
  if (key === 'crit') return '\u66B4\u51FB';
  if (key === 'lifeSteal') return '\u5438\u8840';
  return key;
}

function statValue(key: string, val: number): string {
  if (key === 'crit' || key === 'lifeSteal') return `${Math.round(val * 100)}%`;
  return `${val}`;
}

// ─── Main render ────────────────────────────────────────────────────

export function render(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, state: GameState, move: { x: number; y: number }): void {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  if (state.shake > 0) {
    ctx.translate((Math.random() - 0.5) * state.shake * 8, (Math.random() - 0.5) * state.shake * 8);
  }
  drawWorld(ctx, state, w, h);
  drawDrops(ctx, state);
  drawMonsters(ctx, state, w, h);
  drawSlashes(ctx, state);
  drawPlayer(ctx, state);
  drawParticles(ctx, state);
  drawFloats(ctx, state);
  ctx.restore();
  drawHud(ctx, state, w, h);
  drawTouchControls(ctx, move, w, h, state);
}

// ─── World (side-scroll) ────────────────────────────────────────────

function drawWorld(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  const stageConfig = getStageById(state.stage.stageId) ?? STAGES[0];
  const theme = THEMES[stageConfig.theme] ?? THEMES.plain;

  // Theme background
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);

  // Parallax layers (screen space, no camera transform)
  const layers = [
    { factor: 0.05, spacingX: 140, symbols: theme.symbols[0] },
    { factor: 0.2, spacingX: 90, symbols: theme.symbols[1] ?? theme.symbols[0] },
  ];

  for (const layer of layers) {
    if (!layer.symbols) continue;
    ctx.globalAlpha = layer.symbols.alpha;
    text(ctx, layer.symbols.char, 0, 0, layer.symbols.color, 12); // warm font cache
    const offset = state.camera.x * layer.factor;
    const startCol = Math.floor(offset / layer.spacingX) - 1;
    const endCol = startCol + Math.ceil(w / layer.spacingX) + 2;
    for (let col = startCol; col <= endCol; col++) {
      const sx = col * layer.spacingX - offset;
      const seed = ((col * 2654435761) >>> 0) / 4294967296;
      const sy = h * (0.12 + seed * 0.52);
      ctx.font = `${11 + Math.floor(seed * 5)}px Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = layer.symbols.color;
      ctx.fillText(layer.symbols.char, sx, sy);
    }
    ctx.globalAlpha = 1;
  }

  // World-space elements (camera transform)
  ctx.save();
  ctx.translate(-state.camera.x, -state.camera.y);

  // Ground line
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, stageConfig.groundY);
  ctx.lineTo(stageConfig.width, stageConfig.groundY);
  ctx.stroke();

  // Ground fill below
  ctx.fillStyle = 'rgba(255,255,255,0.015)';
  ctx.fillRect(0, stageConfig.groundY, stageConfig.width, h);

  // Ground texture marks
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < stageConfig.width; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, stageConfig.groundY + 2);
    ctx.lineTo(x + 20, stageConfig.groundY + 2);
    ctx.stroke();
  }
  ctx.lineWidth = 1;

  // Stage boundary markers
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.setLineDash([4, 8]);
  ctx.beginPath();
  ctx.moveTo(stageConfig.width, stageConfig.groundY - 80);
  ctx.lineTo(stageConfig.width, stageConfig.groundY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

// ─── Player ─────────────────────────────────────────────────────────

function drawPlayer(ctx: CanvasRenderingContext2D, state: GameState): void {
  const player = state.player;
  const [x, y] = worldToScreen(state, player.pos.x, player.pos.y);
  const stats = totalStats(player);
  const isActive = player.action?.phase === 'windup';
  const color = !player.alive ? T3 : isActive ? '#FFFACD' : SUCCESS;
  const lean = player.action ? Math.sin(state.time * 35) * 2 : 0;

  // Invincibility blink — fast alpha pulse
  if (player.invincible) {
    const blink = Math.sin(state.time * 28) > 0;
    ctx.globalAlpha = blink ? 0.35 : 1;
  }

  textGlow(ctx, '@', x + lean, y - 18, color, 30, 'center');

  // Facing line
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(x + player.facing.x * 10, y - 6 + player.facing.y * 10);
  ctx.lineTo(x + player.facing.x * 28, y - 6 + player.facing.y * 28);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Action charge bar
  if (player.action && player.action.phase === 'windup') {
    const strikeAt = player.action.kind === 'basic' ? 0.16 : 0.24;
    const progress = player.action.timer / strikeAt;
    bar(ctx, x - 20, y - 46, 40, 3, progress, 1, ACCENT);
  }

  // HP bar
  bar(ctx, x - 24, y - 38, 48, 4, player.hp, stats.maxHp, HP_BAR);
  text(ctx, `LV ${player.level}`, x, y + 16, T2, 10, 'center');

  // Inv timer indicator
  if (player.invTimer > 0) {
    text(ctx, `INV ${player.invTimer.toFixed(1)}`, x, y + 28, 'rgba(255,255,255,0.3)', 8, 'center');
  }
}

// ─── Monsters ───────────────────────────────────────────────────────

function drawMonsters(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  for (const monster of state.monsters) {
    if (monster.hp <= 0) continue;
    const [x, y] = worldToScreen(state, monster.pos.x, monster.pos.y);
    if (x < -80 || y < -80 || x > w + 80 || y > h + 80) continue;
    const isWinding = monster.action?.phase === 'windup';
    const isStunned = monster.hitstun > 0;
    const isEnraged = monster.boss && monster.enraged;
    const color = isWinding ? '#FFFACD' : isEnraged ? '#ff2020' : monster.boss ? WARN : monster.elite ? '#BF5AF2' : (monster.color ?? '#888');
    const glyph = monster.glyph ?? '?';

    // Enrage aura — pulsing red ring
    if (isEnraged) {
      const pulse = 0.3 + Math.sin(state.time * 6) * 0.15;
      ctx.strokeStyle = `rgba(255,32,32,${pulse})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, monster.radius + 14 + Math.sin(state.time * 8) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // Hitstun flash — quick white pulse
    if (isStunned) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(x, y, monster.radius + 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Attack warning zone — filled arc in attack direction
    if (isWinding) {
      const angle = Math.atan2(monster.facing.y, monster.facing.x);
      const windupDuration = monster.boss ? 0.52 : 0.34;
      const progress = monster.action!.timer / windupDuration;
      
      // Progress fill
      ctx.fillStyle = `rgba(255, 69, 58, ${0.15 + progress * 0.25})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, (monster.radius + 36) * progress, angle - 0.5, angle + 0.5);
      ctx.closePath();
      ctx.fill();

      // Outer outline
      ctx.strokeStyle = `rgba(255, 69, 58, ${0.4 + progress * 0.4})`;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.arc(x, y, monster.radius + 36, angle - 0.5, angle + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Circle
    ctx.strokeStyle = color;
    ctx.globalAlpha = isWinding ? 0.9 : 0.35;
    ctx.beginPath();
    ctx.arc(x, y, monster.radius + Math.sin(state.time * 4 + monster.level) * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    textGlow(ctx, glyph, x, y - monster.radius * 0.65, color, monster.boss ? 32 : 22, 'center');

    // Attack warning line
    if (isWinding) {
      ctx.strokeStyle = '#FFFACD';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + monster.facing.x * (monster.radius + 22), y + monster.facing.y * (monster.radius + 22));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    bar(ctx, x - 26, y - monster.radius - 12, 52, 3, monster.hp, monster.maxHp, color);
    const label = isEnraged ? '狂暴 ' : monster.boss ? 'BOSS ' : monster.elite ? 'ELT ' : '';
    text(ctx, `${label}${monster.kind}`, x, y + monster.radius + 4, isEnraged ? '#ff2020' : T3, 9, 'center');
  }
}

// ─── Drops / Slashes / Particles / Floats ───────────────────────────

function drawDrops(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const drop of state.drops) {
    const bob = Math.sin(state.time * 6 + drop.pos.x) * 3;
    const [x, y] = worldToScreen(state, drop.pos.x, drop.pos.y + bob);
    if (drop.gold) {
      textGlow(ctx, '$', x, y - 8, GOLD, 16, 'center');
      continue;
    }
    if (!drop.item) continue;
    const color = drop.item.type === 'equipment' ? rarityColor(drop.item.rarity) : WARN;
    textGlow(ctx, drop.item.type === 'equipment' ? '\u25C7' : '+', x, y - 10, color, 18, 'center');
  }
}

function drawSlashes(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const slash of state.slashes) {
    const t = slash.ttl / slash.maxTtl;
    const [x1, y1] = worldToScreen(state, slash.from.x, slash.from.y);
    const [x2, y2] = worldToScreen(state, slash.to.x, slash.to.y);
    ctx.globalAlpha = t * 0.85;
    ctx.strokeStyle = slash.color;
    ctx.lineWidth = 1.5 + t * 3;

    if (slash.style === 'arc') {
      // Curved slash — quadratic bezier
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const cx = mx - dy * 0.35;
      const cy = my + dx * 0.35;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cx, cy, x2, y2);
      ctx.stroke();
    } else if (slash.style === 'lightning') {
      // Jagged lightning — 4 segments with random offsets
      const segments = 4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      for (let i = 1; i < segments; i++) {
        const frac = i / segments;
        const bx = x1 + (x2 - x1) * frac;
        const by = y1 + (y2 - y1) * frac;
        const perp = { x: -(y2 - y1), y: x2 - x1 };
        const len = Math.max(1, Math.hypot(perp.x, perp.y));
        const offset = (Math.random() - 0.5) * 24 * t;
        ctx.lineTo(bx + (perp.x / len) * offset, by + (perp.y / len) * offset);
      }
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // Glow dot at end
      ctx.fillStyle = slash.color;
      ctx.beginPath();
      ctx.arc(x2, y2, 2 + t * 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Default straight line
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const p of state.particles) {
    const [x, y] = worldToScreen(state, p.pos.x, p.pos.y);
    ctx.globalAlpha = Math.min(1, p.ttl * 3);
    text(ctx, p.char, x, y, p.color, 11, 'center');
    ctx.globalAlpha = 1;
  }
}

function drawFloats(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const f of state.floats) {
    const [x, y] = worldToScreen(state, f.pos.x, f.pos.y);
    ctx.globalAlpha = Math.min(1, f.ttl * 2);
    text(ctx, f.text, x, y, f.color, f.vel ? 14 : 12, 'center');
    ctx.globalAlpha = 1;
  }
}

// ─── HUD ────────────────────────────────────────────────────────────

function drawHud(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  const player = state.player;
  const stats = totalStats(player);
  const compact = isPortrait(w, h);

  // Top status bar — compact in portrait
  const pw = compact ? w - 20 : 320;
  const ph = compact ? 52 : 90;
  panel(ctx, 10, compact ? 6 : 10, pw, ph, 14);

  // Title + gold
  text(ctx, compact ? '\u8D64\u6708\u5B64\u57CE' : '\u8D64\u6708\u5B64\u57CE  TERMINAL', 22, compact ? 14 : 20, T1, compact ? 12 : 14);
  text(ctx, `$ ${player.gold}`, compact ? pw - 8 : 280, compact ? 14 : 20, GOLD, 12, compact ? 'right' : 'left');

  // Bars
  const bw = compact ? pw - 28 : 230;
  bar(ctx, 22, compact ? 28 : 42, bw, compact ? 5 : 6, player.hp, stats.maxHp, HP_BAR);
  if (compact) {
    text(ctx, `${player.hp}/${stats.maxHp}`, 22 + bw / 2, 36, T3, 8, 'center');
  } else {
    text(ctx, `${player.hp}`, 22, 52, T3, 9);
    text(ctx, `${stats.maxHp}`, 22 + bw, 52, T3, 9, 'right');
  }

  bar(ctx, 22, compact ? 42 : 64, bw, compact ? 3 : 4, player.exp, player.nextExp, EXP_BAR);

  // Stats line
  const statsStr = compact
    ? `LV${player.level}  A${stats.attack}  D${stats.defense}  C${Math.round(stats.crit * 100)}%`
    : `LV ${player.level}   ATK ${stats.attack}   DEF ${stats.defense}   CRI ${Math.round(stats.crit * 100)}%   LS ${Math.round(stats.lifeSteal * 100)}%`;
  text(ctx, statsStr, 22, compact ? 52 : 80, T2, compact ? 9 : 11);

  // Auto-battle status
  const autoLabel = state.autoBattle ? 'AUTO ON' : 'AUTO OFF';
  const autoColor = state.autoBattle ? ACCENT : T3;
  if (compact) {
    text(ctx, autoLabel, pw - 8, 36, autoColor, 9, 'right');
  } else {
    text(ctx, autoLabel, 280, 52, autoColor, 9, 'left');
  }

  // Version number (bottom right)
  text(ctx, 'v1.1.1', w - 10, h - 18, T3, 10, 'right');

  // Stage name in HUD header
  const stageName = getStageById(state.stage.stageId)?.name ?? '';
  if (compact) {
    text(ctx, stageName, pw - 8, 46, T3, 9, 'right');
  } else {
    text(ctx, stageName, 280, 80, T3, 9, 'left');
  }

  // Bottom hint — side-scroll controls
  if (!compact) {
    text(ctx, 'A/D 移动  SPACE 跳跃/攻击  V 自动  1/2/3 技能  I 背包  S 保存  R 重置', 14, h - 22, T3, 11);
  }

  drawSkills(ctx, state, w, h);
  if (state.messages.length > 0) drawMessages(ctx, state.messages, w, h);
  if (state.ui.panel === 'bag' || state.ui.panel === 'itemDetail') drawInventory(ctx, state, w, h);
  if (state.ui.panel === 'shop') drawShop(ctx, state, w, h);
  if (state.ui.panel === 'itemDetail') drawItemDetail(ctx, state, w, h);
  if (state.ui.panel === 'classSelect') drawClassSelect(ctx, state, w, h);
  if (state.ui.panel === 'talents') drawTalentTree(ctx, state, w, h);
  if (state.ui.panel === 'stageSelect') drawStageSelect(ctx, state, w, h);
  drawStageProgressBar(ctx, state, w, h);
  if (!player.alive) drawDeath(ctx, state, w, h);
  if (state.ui.panel === 'stageClear') drawStageClearPanel(ctx, state, w, h);
  if (state.ui.panel === 'offlineReward') drawOfflineRewardModal(ctx, state, w, h);
  if (state.showHelp) drawHelp(ctx, w);
}

function drawSkills(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  const compact = isPortrait(w, h);
  for (let i = 0; i < state.skills.length; i++) {
    const skill = state.skills[i];
    const x = compact ? w / 2 - 40 + i * 40 : w - 240 + i * 76;
    const y = compact ? h - 58 : h - 56;
    const size = compact ? 40 : 48;
    const onCd = skill.remaining > 0;

    ctx.strokeStyle = onCd ? BORDER : skill.color;
    ctx.lineWidth = onCd ? 0.5 : 1;
    roundRect(ctx, x - size / 2, y - size / 2, size, size, 8);
    ctx.stroke();
    ctx.lineWidth = 1;

    const label = `${i + 1}`;
    text(ctx, label, x, y - 10, onCd ? T3 : skill.color, compact ? 13 : 15, 'center');
    text(ctx, onCd ? skill.remaining.toFixed(1) : skill.name.slice(0, 2), x, y + size / 2 + 2, T3, 9, 'center');
  }
}

// ─── Bag (grid inventory) ───────────────────────────────────────────

function drawInventory(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  const compact = isPortrait(w, h);
  const cols = 4;
  const cellSize = compact ? 48 : 54;
  const gap = 5;
  const px = compact ? 10 : Math.max(360, w - 360);
  const py = compact ? 100 : 16;
  const panelW = compact ? w - 20 : 340;
  const panelH = compact ? Math.min(h - 240, 460) : 440;

  panel(ctx, px, py, panelW, panelH, 14);

  // Header
  text(ctx, `\u80CC\u5305  ${state.player.inventory.length}/28`, px + 14, py + 12, T1, 13);
  // Close X
  ctx.fillStyle = T3;
  ctx.fillRect(px + panelW - 30, py + 10, 16, 2);
  ctx.fillRect(px + panelW - 23, py + 3, 2, 16);
  // Rotated cross for X
  ctx.save();
  ctx.translate(px + panelW - 22, py + 11);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = T2;
  ctx.fillRect(-7, -0.75, 14, 1.5);
  ctx.fillRect(-0.75, -7, 1.5, 14);
  ctx.restore();

  // Equipment section
  text(ctx, '\u5DF2\u88C5\u5907', px + 14, py + 36, T3, 10);
  let ey = py + 52;
  for (const [slot, item] of Object.entries(state.player.equipment)) {
    const name = SLOT_NAMES[slot as keyof typeof SLOT_NAMES];
    const itemName = item ? item.name : '\u2014';
    const color = item ? rarityColor(item.rarity) : T3;
    text(ctx, `${name}`, px + 16, ey, T3, 10);
    text(ctx, itemName, px + 56, ey, color, 11);
    ey += compact ? 16 : 19;
  }

  // Divider
  ey += 4;
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(px + 14, ey); ctx.lineTo(px + panelW - 14, ey); ctx.stroke();
  ctx.lineWidth = 1;
  ey += 8;

  // Items label
  text(ctx, '\u7269\u54C1  \u70B9\u51FB\u67E5\u770B\u8BE6\u60C5', px + 14, ey, T3, 10);
  ey += 20;

  // Grid (scrollable)
  const gridX = px + 14;
  const gridY = ey;
  const gridH = py + panelH - 6 - gridY;
  const inventory = state.player.inventory;
  const selectedIdx = state.ui.selectedIndex;
  const scroll = state.ui.scroll;

  // Clip to grid area
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, gridY, panelW, gridH);
  ctx.clip();

  for (let i = 0; i < inventory.length && i < 28; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = gridX + col * (cellSize + gap);
    const cy = gridY + row * (cellSize + gap) - scroll;

    // Skip off-screen cells
    if (cy + cellSize < gridY || cy > gridY + gridH) continue;

    const item = inventory[i];
    const color = item.type === 'equipment' ? rarityColor(item.rarity) : item.type === 'skillBook' ? ACCENT : WARN;
    const isSelected = i === selectedIdx;

    // Cell background
    if (isSelected) {
      ctx.fillStyle = 'rgba(10, 132, 255, 0.10)';
      roundRect(ctx, cx, cy, cellSize, cellSize, 8);
      ctx.fill();
    }

    // Cell border
    ctx.strokeStyle = isSelected ? ACCENT : BORDER;
    ctx.lineWidth = isSelected ? 1.5 : 0.5;
    roundRect(ctx, cx, cy, cellSize, cellSize, 8);
    ctx.stroke();
    ctx.lineWidth = 1;

    // Icon
    const icon = item.type === 'equipment' ? (item.affixes && item.affixes.length > 0 ? '\u2605' : '\u25C7') : item.type === 'skillBook' ? '\u2709' : '+';
    text(ctx, icon, cx + cellSize / 2, cy + 8, color, compact ? 16 : 18, 'center');

    // Short name
    const shortName = item.name.slice(0, compact ? 4 : 5);
    text(ctx, shortName, cx + cellSize / 2, cy + cellSize - 16, T2, 8, 'center');
  }

  // End clip region
  ctx.restore();

  // Scrollbar indicator
  const rows = Math.ceil(inventory.length / cols);
  const contentH = rows * (cellSize + gap);
  if (contentH > gridH) {
    const trackX = px + panelW - 8;
    const trackH = gridH;
    const thumbH = Math.max(20, (gridH / contentH) * trackH);
    const maxScroll = contentH - gridH;
    const thumbY = gridY + (scroll / maxScroll) * (trackH - thumbH);
    // Track
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    roundRect(ctx, trackX, gridY, 4, trackH, 2);
    ctx.fill();
    // Thumb
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, trackX, thumbY, 4, thumbH, 2);
    ctx.fill();
  }

  // Scroll hint arrows
  if (contentH > gridH) {
    if (scroll > 0) {
      text(ctx, '\u25B2', px + panelW / 2, gridY - 2, T3, 9, 'center');
    }
    if (scroll < contentH - gridH) {
      text(ctx, '\u25BC', px + panelW / 2, gridY + gridH - 6, T3, 9, 'center');
    }
  }

  if (inventory.length === 0) {
    text(ctx, '\u80CC\u5305\u7A7A\u7A7A\u5982\u4E5F\u2026', px + panelW / 2, gridY + 28, T3, 12, 'center');
  }
}

// ─── Item Detail Overlay ────────────────────────────────────────────

function drawItemDetail(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  const item = state.player.inventory[state.ui.selectedIndex];
  if (!item) return;

  const dw = Math.min(300, w - 40);
  const dh = 340;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;

  // Dim background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, w, h);

  // Panel
  panel(ctx, dx, dy, dw, dh, 16);

  // Close [X]
  ctx.save();
  ctx.translate(dx + dw - 24, dy + 20);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = T2;
  ctx.fillRect(-7, -0.75, 14, 1.5);
  ctx.fillRect(-0.75, -7, 1.5, 14);
  ctx.restore();

  // Name
  const nameColor = item.type === 'equipment' ? rarityColor(item.rarity) : item.type === 'skillBook' ? ACCENT : WARN;
  text(ctx, item.name, dx + 20, dy + 20, nameColor, 17);

  // Subtitle
  if (item.type === 'equipment') {
    const slotName = SLOT_NAMES[item.slot];
    text(ctx, `${item.rarity}  ${slotName}  LV${item.level}`, dx + 20, dy + 46, T2, 11);
  } else if (item.type === 'potion') {
    text(ctx, `\u836F\u6C34  \u6062\u590D ${item.heal} HP`, dx + 20, dy + 46, T2, 11);
  } else {
    text(ctx, `\u6280\u80FD\u4E66`, dx + 20, dy + 46, T2, 11);
  }

  // Stats
  let sy = dy + 74;
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(dx + 20, sy); ctx.lineTo(dx + dw - 20, sy); ctx.stroke();
  ctx.lineWidth = 1;
  sy += 12;

  if (item.type === 'equipment') {
    const equipped = state.player.equipment[item.slot];
    for (const [key, value] of Object.entries(item.stats)) {
      if (!value) continue;
      const label = statLabel(key);
      const valStr = statValue(key, value);
      text(ctx, `${label}  +${valStr}`, dx + 24, sy, T1, 13);

      if (equipped && equipped.id !== item.id) {
        const eqVal = equipped.stats[key as keyof typeof equipped.stats] ?? 0;
        const diff = value - eqVal;
        if (diff !== 0) {
          const diffStr = diff > 0 ? `+${statValue(key, diff)}` : statValue(key, diff);
          text(ctx, diffStr, dx + dw - 24, sy, diff > 0 ? SUCCESS : WARN, 11, 'right');
        } else {
          text(ctx, '\u2014', dx + dw - 24, sy, T3, 11, 'right');
        }
      }
      sy += 22;
    }
    if (!equipped) {
      text(ctx, '\u5F53\u524D\u672A\u88C5\u5907', dx + 24, sy, T3, 11);
      sy += 22;
    }
  } else if (item.type === 'potion') {
    text(ctx, `\u6062\u590D\u91CF  ${item.heal} HP`, dx + 24, sy, SUCCESS, 13);
    sy += 22;
  } else if (item.type === 'skillBook') {
    const book = item;
    text(ctx, `学习技能: ${book.name.replace('技能书·', '')}`, dx + 24, sy, ACCENT, 13);
    sy += 22;
  }

  // Affixes (equipment only)
  if (item.type === 'equipment' && item.affixes && item.affixes.length > 0) {
    sy += 4;
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(dx + 20, sy); ctx.lineTo(dx + dw - 20, sy); ctx.stroke();
    ctx.lineWidth = 1;
    sy += 8;
    for (const affix of item.affixes) {
      const def = AFFIX_DEFS.find((d) => d.id === affix.id);
      if (!def) continue;
      const desc = def.description.replace('{v}', `${affix.value}`);
      text(ctx, `${def.name}`, dx + 24, sy, rarityColor(item.rarity), 12);
      text(ctx, desc, dx + 24, sy + 16, T2, 10);
      sy += 36;
    }
  }

  // Price
  sy = Math.max(sy + 8, dy + dh - 96);
  const sellPrice = Math.floor(item.price * 0.55);
  text(ctx, `\u552E\u4EF7  ${sellPrice}G`, dx + 20, sy, GOLD, 11);

  // Buttons
  const btnY = dy + dh - 52;
  const btnW = Math.floor((dw - 40) / 3);
  const btnH = 36;
  const btnX0 = dx + 16;
  const gap = 4;

  const buttons: [string, string][] = [
    [item.type === 'potion' ? '\u4F7F\u7528' : item.type === 'skillBook' ? '\u5B66\u4E60' : '\u88C5\u5907', ACCENT],
    ['\u51FA\u552E', GOLD],
    ['\u4E22\u5F03', T3]
  ];

  for (let i = 0; i < 3; i++) {
    const bx = btnX0 + i * (btnW + gap);
    ctx.fillStyle = GLASS;
    roundRect(ctx, bx, btnY, btnW, btnH, 8);
    ctx.fill();
    ctx.strokeStyle = buttons[i][1];
    ctx.lineWidth = 0.5;
    roundRect(ctx, bx, btnY, btnW, btnH, 8);
    ctx.stroke();
    ctx.lineWidth = 1;
    text(ctx, buttons[i][0], bx + btnW / 2, btnY + 10, buttons[i][1], 13, 'center');
  }
}

// ─── Shop ───────────────────────────────────────────────────────────

function drawShop(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  const compact = isPortrait(w, h);
  const panelW = compact ? w - 24 : 380;
  const panelH = compact ? 200 : 220;
  const px = compact ? 12 : w / 2 - 190;
  const py = compact ? h / 2 - 100 : h / 2 - 110;

  panel(ctx, px, py, panelW, panelH, 16);

  // Header
  text(ctx, '\u76DF\u91CD\u836F\u5E97', px + 20, py + 18, GOLD, 16);
  text(ctx, `G ${state.player.gold}`, px + panelW - 20, py + 20, GOLD, 12, 'right');

  // Buy button
  const price = 80 + state.player.level * 8;
  const buyY = py + 54;
  const buyH = 40;
  ctx.fillStyle = 'rgba(10, 132, 255, 0.08)';
  roundRect(ctx, px + 16, buyY, panelW - 32, buyH, 10);
  ctx.fill();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 0.5;
  roundRect(ctx, px + 16, buyY, panelW - 32, buyH, 10);
  ctx.stroke();
  ctx.lineWidth = 1;
  text(ctx, `\u8D2D\u4E70\u836F\u6C34   -${price}G`, px + panelW / 2, buyY + 12, ACCENT, 13, 'center');

  // Sell button
  const item = state.player.inventory[state.ui.selectedIndex];
  const sellY = buyY + buyH + 10;
  if (item) {
    const sellPrice = Math.floor(item.price * 0.55);
    ctx.fillStyle = GLASS;
    roundRect(ctx, px + 16, sellY, panelW - 32, buyH, 10);
    ctx.fill();
    ctx.strokeStyle = SUCCESS;
    ctx.lineWidth = 0.5;
    roundRect(ctx, px + 16, sellY, panelW - 32, buyH, 10);
    ctx.stroke();
    ctx.lineWidth = 1;
    text(ctx, `\u51FA\u552E ${item.name.slice(0, 10)}   +${sellPrice}G`, px + panelW / 2, sellY + 12, SUCCESS, 13, 'center');
  } else {
    ctx.strokeStyle = BORDER;
    roundRect(ctx, px + 16, sellY, panelW - 32, buyH, 10);
    ctx.stroke();
    text(ctx, '\u51FA\u552E\uFF08\u9009\u4E2D\u7269\u54C1\uFF09', px + panelW / 2, sellY + 12, T3, 13, 'center');
  }

  // Close button
  const closeY = py + panelH - 46;
  ctx.strokeStyle = BORDER_H;
  roundRect(ctx, px + 16, closeY, panelW - 32, 34, 10);
  ctx.stroke();
  text(ctx, '\u5173\u95ED', px + panelW / 2, closeY + 9, T2, 13, 'center');
}

// ─── Class Select ──────────────────────────────────────────────────

function drawClassSelect(ctx: CanvasRenderingContext2D, _state: GameState, w: number, h: number): void {
  // Full-screen dim
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(0, 0, w, h);

  // Title
  text(ctx, '选择职业', w / 2, h / 2 - 160, T1, 22, 'center');
  text(ctx, '每个职业拥有独特的初始技能和天赋树', w / 2, h / 2 - 130, T2, 12, 'center');

  const classIds = Object.keys(CLASSES);
  const cardW = Math.min(260, w - 40);
  const cardH = 100;
  const gap = 14;
  const totalH = classIds.length * cardH + (classIds.length - 1) * gap;
  const startY = (h - totalH) / 2;
  const startX = (w - cardW) / 2;

  for (let i = 0; i < classIds.length; i++) {
    const cls = CLASSES[classIds[i]];
    const cy = startY + i * (cardH + gap);

    // Card
    ctx.fillStyle = GLASS;
    roundRect(ctx, startX, cy, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 0.5;
    roundRect(ctx, startX, cy, cardW, cardH, 12);
    ctx.stroke();
    ctx.lineWidth = 1;

    // Name
    text(ctx, cls.name, startX + 20, cy + 16, T1, 18);
    // Description
    text(ctx, cls.description, startX + 20, cy + 42, T2, 12);
    // Starter skills hint
    const skillNames = cls.starterSkills.map((sid) => SKILL_DEFS[sid]?.name ?? sid).join('、');
    text(ctx, `初始技能: ${skillNames}`, startX + 20, cy + 62, T3, 10);
  }
}

// ─── Talent Tree ──────────────────────────────────────────────────

function drawTalentTree(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  const panelW = Math.min(360, w - 24);
  const panelH = Math.min(460, h - 80);
  const px = (w - panelW) / 2;
  const py = (h - panelH) / 2;

  // Dim background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, w, h);

  // Panel
  panel(ctx, px, py, panelW, panelH, 16);

  // Close [X]
  ctx.save();
  ctx.translate(px + panelW - 20, py + 18);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = T2;
  ctx.fillRect(-7, -0.75, 14, 1.5);
  ctx.fillRect(-0.75, -7, 1.5, 14);
  ctx.restore();

  // Title
  const player = state.player;
  const cls = player.playerClass ? CLASSES[player.playerClass] : null;
  text(ctx, `天赋  (${player.talentPoints} 点可用)`, px + 20, py + 16, T1, 16);
  if (cls) {
    text(ctx, `${cls.name} 天赋树`, px + 20, py + 38, T2, 11);
  }

  // Talent nodes
  const talentIds = cls?.talents ?? [];
  const rowH = 44;
  const nodeStartY = py + 60;

  for (let i = 0; i < talentIds.length; i++) {
    const tid = talentIds[i];
    const node = TALENTS[tid];
    if (!node) continue;
    const rank = player.talents[tid] ?? 0;
    const ny = nodeStartY + i * rowH;

    // Locked state
    const locked = node.requires?.some((req) => !player.talents[req] || player.talents[req] <= 0);
    const full = rank >= node.maxRank;
    const color = locked ? T3 : full ? SUCCESS : T1;

    // Row background
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0)';
    ctx.fillRect(px + 12, ny, panelW - 24, rowH - 4);

    // Name + description
    text(ctx, node.name, px + 20, ny + 4, color, 14);
    text(ctx, node.description, px + 20, ny + 22, locked ? T3 : T2, 10);
    // Rank display
    text(ctx, `${rank}/${node.maxRank}`, px + panelW - 80, ny + 4, color, 12, 'right');

    // Allocate button
    const btnX = px + panelW - 72;
    const btnW2 = 56;
    const btnH2 = 34;
    const canAlloc = !locked && !full && player.talentPoints > 0;
    ctx.fillStyle = canAlloc ? GLASS : 'rgba(255,255,255,0.03)';
    roundRect(ctx, btnX, ny, btnW2, btnH2, 6);
    ctx.fill();
    ctx.strokeStyle = canAlloc ? ACCENT : BORDER;
    ctx.lineWidth = 0.5;
    roundRect(ctx, btnX, ny, btnW2, btnH2, 6);
    ctx.stroke();
    ctx.lineWidth = 1;
    text(ctx, '+1', btnX + btnW2 / 2, ny + 10, canAlloc ? ACCENT : T3, 13, 'center');

    // Connection line to next node
    if (i < talentIds.length - 1) {
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(px + panelW / 2, ny + rowH - 4);
      ctx.lineTo(px + panelW / 2, ny + rowH);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }
}

// ─── Message / Death / Help ─────────────────────────────────────────

function drawMessages(ctx: CanvasRenderingContext2D, messages: GameMessage[], w: number, h: number): void {
  const compact = isPortrait(w, h);
  const boxW = compact ? w - 24 : 520;
  const x = compact ? 12 : w / 2 - 260;
  const rowH = 28;
  const baseY = compact ? h - 180 : h - 80;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const y = baseY - (messages.length - 1 - i) * rowH;
    const alpha = Math.min(1, msg.timer / 0.8); // fade out in last 0.8s
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(28, 28, 30, 0.85)';
    roundRect(ctx, x, y, boxW, 26, 8);
    ctx.fill();
    text(ctx, compact ? msg.text.slice(0, 30) : msg.text, compact ? x + 12 : x + boxW / 2, y + 6, T1, compact ? 11 : 13, compact ? 'left' : 'center');
    ctx.globalAlpha = 1;
  }
}

function drawDeath(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, w, h);

  const stage = getStageById(state.stage.stageId);
  const panelW = Math.min(320, w - 40);
  const panelH = Math.min(240, h - 60);
  const px = (w - panelW) / 2;
  const py = (h - panelH) / 2;

  panel(ctx, px, py, panelW, panelH, 16);

  text(ctx, '关卡失败', px + panelW / 2, py + 24, WARN, 20, 'center');
  if (stage) {
    text(ctx, stage.name, px + panelW / 2, py + 56, T2, 13, 'center');
  }
  text(ctx, `用时 ${state.stage.elapsed.toFixed(1)}s`, px + panelW / 2, py + 80, T3, 11, 'center');
  text(ctx, `击杀 ${state.stage.killedTotal}`, px + panelW / 2, py + 98, T3, 11, 'center');

  // Buttons
  const btnW = Math.floor((panelW - 48) / 2);
  const btnH = 40;
  const btnY = py + panelH - 56;
  const retryX = px + 16;
  const returnX = px + 16 + btnW + 16;

  // Retry button
  ctx.fillStyle = 'rgba(10, 132, 255, 0.12)';
  roundRect(ctx, retryX, btnY, btnW, btnH, 8);
  ctx.fill();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 0.5;
  roundRect(ctx, retryX, btnY, btnW, btnH, 8);
  ctx.stroke();
  ctx.lineWidth = 1;
  text(ctx, '重试', retryX + btnW / 2, btnY + 12, ACCENT, 14, 'center');

  // Return button
  ctx.fillStyle = GLASS;
  roundRect(ctx, returnX, btnY, btnW, btnH, 8);
  ctx.fill();
  ctx.strokeStyle = BORDER_H;
  ctx.lineWidth = 0.5;
  roundRect(ctx, returnX, btnY, btnW, btnH, 8);
  ctx.stroke();
  ctx.lineWidth = 1;
  text(ctx, '返回', returnX + btnW / 2, btnY + 12, T2, 14, 'center');
}

// ─── Offline Reward Modal ──────────────────────────────────────────

function drawOfflineRewardModal(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, w, h);

  const reward = state.ui.offlineReward;
  if (!reward) return;

  const panelW = Math.min(340, w - 40);
  const panelH = Math.min(300, h - 60);
  const px = (w - panelW) / 2;
  const py = (h - panelH) / 2;

  panel(ctx, px, py, panelW, panelH, 16);

  // Title
  text(ctx, '离线收益', px + panelW / 2, py + 24, ACCENT, 20, 'center');

  // Offline time
  const hours = Math.floor(reward.offlineSeconds / 3600);
  const minutes = Math.floor((reward.offlineSeconds % 3600) / 60);
  const timeStr = hours > 0 ? `${hours}小时${minutes}分钟` : `${minutes}分钟`;
  text(ctx, `离线 ${timeStr}${reward.capped ? '（已封顶）' : ''}`, px + panelW / 2, py + 54, T2, 13, 'center');

  // Stage name
  const stage = getStageById(reward.stageId);
  if (stage) {
    text(ctx, `挂机关卡：${stage.name}`, px + 24, py + 82, T2, 12);
  }

  // Divider
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(px + 20, py + 104); ctx.lineTo(px + panelW - 20, py + 104); ctx.stroke();
  ctx.lineWidth = 1;

  // Rewards
  let ry = py + 114;
  text(ctx, '收益', px + 24, ry, T3, 10);
  ry += 18;
  text(ctx, `金币  +${reward.gold}`, px + 24, ry, GOLD, 14);
  ry += 22;
  text(ctx, `经验  +${reward.exp}`, px + 24, ry, EXP_BAR, 14);
  ry += 22;
  text(ctx, `预估击杀  ${reward.estimatedKills}`, px + 24, ry, T2, 12);
  ry += 20;

  // Items
  if (reward.items.length > 0) {
    text(ctx, `获得 ${reward.items.length} 件物品`, px + 24, ry, SUCCESS, 12);
    ry += 18;
    for (const item of reward.items.slice(0, 3)) {
      const color = item.type === 'equipment' ? rarityColor((item as import('./types').EquipmentItem).rarity) : T2;
      text(ctx, `◇ ${item.name}`, px + 32, ry, color, 11);
      ry += 16;
    }
    if (reward.items.length > 3) {
      text(ctx, `…还有 ${reward.items.length - 3} 件`, px + 32, ry, T3, 10);
    }
  }

  // Claim button
  const btnW = panelW - 48;
  const btnH = 42;
  const btnX = px + 24;
  const btnY = py + panelH - 58;

  ctx.fillStyle = 'rgba(10, 132, 255, 0.12)';
  roundRect(ctx, btnX, btnY, btnW, btnH, 10);
  ctx.fill();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 0.5;
  roundRect(ctx, btnX, btnY, btnW, btnH, 10);
  ctx.stroke();
  ctx.lineWidth = 1;
  text(ctx, '领取', btnX + btnW / 2, btnY + 13, ACCENT, 15, 'center');
}

// ─── Stage Clear Panel ─────────────────────────────────────────────

function drawStageClearPanel(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, w, h);

  const stage = getStageById(state.stage.stageId);
  const clearInfo = state.ui.stageClear;
  if (!stage || !clearInfo) return;

  const panelW = Math.min(360, w - 40);
  const panelH = Math.min(340, h - 60);
  const px = (w - panelW) / 2;
  const py = (h - panelH) / 2;

  panel(ctx, px, py, panelW, panelH, 16);

  // Title
  text(ctx, '关卡通关', px + panelW / 2, py + 24, SUCCESS, 20, 'center');
  text(ctx, stage.name, px + panelW / 2, py + 54, T1, 14, 'center');

  // Stats
  text(ctx, `用时 ${state.stage.elapsed.toFixed(1)}s`, px + 24, py + 82, T2, 12);
  text(ctx, `击杀 ${state.stage.killedTotal}`, px + panelW - 24, py + 82, T2, 12, 'right');

  // Divider
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(px + 20, py + 104); ctx.lineTo(px + panelW - 20, py + 104); ctx.stroke();
  ctx.lineWidth = 1;

  // Rewards
  let ry = py + 114;
  text(ctx, '奖励', px + 24, ry, T3, 10);
  ry += 18;
  text(ctx, `金币  +${clearInfo.reward.gold}${clearInfo.firstClear ? ` +${clearInfo.reward.firstClearBonus?.gold ?? 0} 首通` : ''}`, px + 24, ry, GOLD, 13);
  ry += 20;
  text(ctx, `经验  +${clearInfo.reward.exp}${clearInfo.firstClear ? ` +${clearInfo.reward.firstClearBonus?.exp ?? 0} 首通` : ''}`, px + 24, ry, EXP_BAR, 13);
  ry += 20;

  // First clear bonus
  if (clearInfo.firstClear) {
    text(ctx, '首通奖励已发放!', px + 24, ry, SUCCESS, 12);
    ry += 20;
  }

  // Items
  if (clearInfo.items.length > 0) {
    for (const item of clearInfo.items) {
      const color = item.type === 'equipment' ? rarityColor((item as import('./types').EquipmentItem).rarity) : T2;
      text(ctx, `◇ ${item.name}`, px + 24, ry, color, 12);
      ry += 18;
    }
  }

  // Continue button
  const btnW = panelW - 48;
  const btnH = 42;
  const btnX = px + 24;
  const btnY = py + panelH - 58;

  ctx.fillStyle = 'rgba(48, 209, 88, 0.12)';
  roundRect(ctx, btnX, btnY, btnW, btnH, 10);
  ctx.fill();
  ctx.strokeStyle = SUCCESS;
  ctx.lineWidth = 0.5;
  roundRect(ctx, btnX, btnY, btnW, btnH, 10);
  ctx.stroke();
  ctx.lineWidth = 1;
  text(ctx, '继续', btnX + btnW / 2, btnY + 13, SUCCESS, 15, 'center');
}

// ─── Stage Progress Bar ─────────────────────────────────────────────

function drawStageProgressBar(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  const stage = getStageById(state.stage.stageId);
  if (!stage) return;

  const runtime = state.stage;
  const compact = isPortrait(w, h);

  const barW = compact ? w - 24 : Math.min(400, w - 60);
  const barH = compact ? 28 : 32;
  const barX = (w - barW) / 2;
  const barY = compact ? h - 108 : 10;

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  roundRect(ctx, barX, barY, barW, barH, 8);
  ctx.fill();
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 0.5;
  roundRect(ctx, barX, barY, barW, barH, 8);
  ctx.stroke();
  ctx.lineWidth = 1;

  // Stage name
  text(ctx, stage.name, barX + 8, barY + 4, T3, compact ? 8 : 9);

  // Progress track
  const trackX = barX + 8;
  const trackW = barW - 16;
  const trackY = barY + barH - 8;
  const trackH = 3;

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, trackX, trackY, trackW, trackH, 1);
  ctx.fill();

  // Progress fill
  const progress = Math.min(1, state.player.pos.x / stage.width);
  if (progress > 0) {
    ctx.fillStyle = ACCENT;
    roundRect(ctx, trackX, trackY, trackW * progress, trackH, 1);
    ctx.fill();
  }

  // Wave markers
  for (const wave of stage.waves) {
    const triggerX = wave.trigger.type === 'time' ? 0.5 : (wave.trigger.type === 'position' || wave.trigger.type === 'boss_zone' ? wave.trigger.x : 0);
    const markerPos = triggerX / stage.width;
    const mx = trackX + markerPos * trackW;
    const triggered = runtime.triggeredWaveIds.includes(wave.id);

    if (wave.trigger.type === 'boss_zone') {
      text(ctx, 'Ω', mx, barY + 3, triggered ? WARN : T3, compact ? 10 : 12, 'center');
    } else {
      ctx.fillStyle = triggered ? 'rgba(255,69,58,0.6)' : 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(mx, trackY + 1.5, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Player marker (@)
  const playerMarkerX = trackX + progress * trackW;
  text(ctx, '@', playerMarkerX, barY + 2, SUCCESS, compact ? 10 : 12, 'center');

  // End marker
  text(ctx, '|', trackX + trackW, barY + 2, T3, compact ? 10 : 12, 'center');

  // Phase indicator
  const phaseLabel = runtime.phase === 'boss' ? 'BOSS' : runtime.phase === 'combat' ? '战斗' : runtime.phase === 'running' ? '推进' : '';
  if (phaseLabel) {
    text(ctx, phaseLabel, barX + barW - 8, barY + 4, runtime.phase === 'boss' ? WARN : T3, compact ? 8 : 9, 'right');
  }
}

// ─── Stage Select ───────────────────────────────────────────────────

function drawStageSelect(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(0, 0, w, h);

  const panelW = Math.min(400, w - 32);
  const panelH = Math.min(480, h - 40);
  const px = (w - panelW) / 2;
  const py = (h - panelH) / 2;

  panel(ctx, px, py, panelW, panelH, 16);

  // Title
  text(ctx, '选择关卡', px + panelW / 2, py + 20, T1, 18, 'center');

  // Close X
  ctx.save();
  ctx.translate(px + panelW - 20, py + 18);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = T2;
  ctx.fillRect(-7, -0.75, 14, 1.5);
  ctx.fillRect(-0.75, -7, 1.5, 14);
  ctx.restore();

  // Stage list
  const cardH = 56;
  const gap = 8;
  const startY = py + 52;
  const progress = state.progress;

  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i];
    const cy = startY + i * (cardH + gap);
    if (cy + cardH > py + panelH - 16) break;

    const record = progress.records[stage.id];
    const isCleared = record?.cleared ?? false;
    const isUnlocked = i === 0 || (progress.highestUnlockedStageId === stage.id) ||
      STAGES.findIndex(s => s.id === progress.highestUnlockedStageId) >= i;
    const isCurrent = progress.currentStageId === stage.id;

    // Card background
    ctx.fillStyle = isCurrent ? 'rgba(10, 132, 255, 0.08)' : GLASS;
    roundRect(ctx, px + 16, cy, panelW - 32, cardH, 10);
    ctx.fill();
    ctx.strokeStyle = isCurrent ? ACCENT : isCleared ? SUCCESS : isUnlocked ? BORDER_H : BORDER;
    ctx.lineWidth = isCurrent ? 1 : 0.5;
    roundRect(ctx, px + 16, cy, panelW - 32, cardH, 10);
    ctx.stroke();
    ctx.lineWidth = 1;

    // Status icon
    const statusIcon = isCleared ? '✓' : isCurrent ? '▶' : isUnlocked ? '▶' : '⊘';
    const statusColor = isCleared ? SUCCESS : isCurrent ? ACCENT : isUnlocked ? T2 : T3;
    text(ctx, statusIcon, px + 32, cy + 12, statusColor, 16, 'center');

    // Name and level
    const nameColor = isUnlocked ? T1 : T3;
    text(ctx, stage.name, px + 52, cy + 10, nameColor, 14);
    text(ctx, `LV${stage.recommendedLevel}${stage.bossStage ? '  BOSS' : ''}`, px + 52, cy + 30, isUnlocked ? T2 : T3, 10);

    // Record
    if (record && isCleared) {
      const timeStr = record.bestTime ? `${Math.floor(record.bestTime / 60)}:${String(Math.floor(record.bestTime % 60)).padStart(2, '0')}` : '--:--';
      text(ctx, `最佳 ${timeStr}  ×${record.clearCount}`, px + panelW - 24, cy + 20, T3, 9, 'right');
    }
  }
}

function drawHelp(ctx: CanvasRenderingContext2D, w: number): void {
  const compact = isPortrait(w, ctx.canvas.height);
  if (compact) return;
  const bw = 540;
  panel(ctx, w / 2 - bw / 2, 12, bw, 52, 10);
  text(ctx, '\u76EE\u6807\uFF1A\u5237\u602A\u5347\u7EA7\u3001\u6361\u88C5\u5907\u3001\u6311\u6218\u8D64\u6708\u6076\u9B54\u3002\u6781\u7B80\u7B26\u53F7\u98CE\u3002', w / 2, 22, T2, 12, 'center');
  text(ctx, '\u547D\u4E2D\u4F1A\u51FB\u9000\u3001\u9707\u5C4F\u5E76\u7206\u51FA\u7C92\u5B50\u3002H \u9690\u85CF\u63D0\u793A\u3002', w / 2, 42, T3, 11, 'center');
}

// ─── Touch Controls ─────────────────────────────────────────────────

type TouchButton = readonly [string, number, number, number, string];

function drawTouchControls(ctx: CanvasRenderingContext2D, move: { x: number; y: number }, w: number, h: number, state: GameState): void {
  const compact = isPortrait(w, h);

  // Joystick — smaller in portrait to free up space
  ctx.globalAlpha = 0.5;
  const stickSize = compact ? 88 : 110;
  const stickX = compact ? 12 : 32;
  const stickY = h - (compact ? 108 : 146);

  ctx.strokeStyle = BORDER_H;
  ctx.lineWidth = 0.5;
  roundRect(ctx, stickX, stickY, stickSize, stickSize, 12);
  ctx.stroke();
  ctx.lineWidth = 1;

  // Joystick thumb
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  const thumbSize = compact ? 28 : 32;
  const tx = stickX + stickSize / 2 + move.x * (compact ? 24 : 28) - thumbSize / 2;
  const ty = stickY + stickSize / 2 + move.y * (compact ? 24 : 28) - thumbSize / 2;
  roundRect(ctx, tx, ty, thumbSize, thumbSize, 8);
  ctx.fill();

  // Buttons
  const rstLabel = state.resetConfirm ? '确认' : 'RST';
  const rstColor = state.resetConfirm ? WARN : T3;
  const buttons: TouchButton[] = compact
    ? [
        // Attack — bottom right
        ['ATK', w - 50, h - 50, 34, WARN],
        // Skills drawn by drawSkills at (w/2-40+i*40, h-58) — touch hit-test in input.ts
        // Utility row — below minimap at y=112, compact spacing
        ['BAG', 30, 112, 16, SUCCESS],
        ['E', 70, 112, 16, GOLD],
        ['P', 110, 112, 16, WARN],
        [rstLabel, 150, 112, 16, rstColor],
        [state.autoBattle ? '自动 ON' : '自动 OFF', 190, 112, 16, state.autoBattle ? ACCENT : T3]
      ]
    : [
        ['1', w - 170, h - 120, 32, '#FF9F0A'],
        ['2', w - 104, h - 162, 28, ACCENT],
        ['3', w - 64, h - 96, 28, '#BF5AF2'],
        ['ATK', w - 108, h - 76, 38, WARN],
        ['BAG', w - 58, 56, 24, SUCCESS],
        ['E', w - 116, 56, 24, GOLD],
        ['USE', w - 174, 56, 24, ACCENT],
        ['P', w - 232, 56, 24, WARN],
        [rstLabel, w - 290, 56, 24, rstColor],
        [state.autoBattle ? 'AUTO ON' : 'AUTO OFF', w - 348, 56, 24, state.autoBattle ? ACCENT : T3]
      ];

  for (const [label, x, y, r, color] of buttons) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = GLASS;
    roundRect(ctx, x - r, y - r, r * 2, r * 2, r * 0.35);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;
    roundRect(ctx, x - r, y - r, r * 2, r * 2, r * 0.35);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.75;
    text(ctx, label, x, y - 7, color, label.length > 2 ? 10 : 14, 'center');
  }
  ctx.globalAlpha = 1;
}
