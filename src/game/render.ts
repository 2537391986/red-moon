import { SHOP_POS, WORLD, ZONES } from '../data/world';
import { AFFIX_DEFS, SLOT_NAMES } from '../data/tables';
import { CLASSES, SKILL_DEFS, TALENTS } from '../data/skills';
import { totalStats } from '../systems/save';
import type { GameMessage, GameState, Monster, SkillBookItem } from './types';

// ─── Apple-inspired palette ─────────────────────────────────────────
const BG       = '#000000';
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
  drawTouchControls(ctx, move, w, h);
}

// ─── World ──────────────────────────────────────────────────────────

function drawWorld(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(-state.camera.x, -state.camera.y);

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < WORLD.width; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke();
  }
  for (let y = 0; y < WORLD.height; y += 48) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke();
  }
  ctx.lineWidth = 1;

  // Zones
  for (const zone of ZONES) {
    ctx.strokeStyle = zone.color;
    ctx.globalAlpha = 0.35;
    ctx.setLineDash([8, 10]);
    ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    text(ctx, `${zone.name}  LV${zone.level}+`, zone.x + 14, zone.y + 14, zone.color, 14);
  }

  // Shop
  ctx.strokeStyle = 'rgba(255,214,10,0.3)';
  ctx.strokeRect(SHOP_POS.x - 46, SHOP_POS.y - 34, 92, 68);
  textGlow(ctx, '\u836F', SHOP_POS.x, SHOP_POS.y - 10, GOLD, 24, 'center');
  text(ctx, 'SHOP', SHOP_POS.x, SHOP_POS.y - 52, T3, 11, 'center');
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
    const color = isWinding ? '#FFFACD' : isEnraged ? '#ff2020' : monster.boss ? WARN : monster.elite ? '#BF5AF2' : monsterColor(monster);
    const glyph = monsterGlyph(monster);

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
      const progress = monster.action!.timer / (monster.boss ? 0.52 : 0.34);
      ctx.fillStyle = `rgba(255,250,205,${0.06 + progress * 0.12})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, monster.radius + 36 + progress * 12, angle - 0.5, angle + 0.5);
      ctx.closePath();
      ctx.fill();
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

function monsterGlyph(m: Monster): string {
  if (m.kind === '\u7A3B\u8349\u4EBA') return '#';
  if (m.kind === '\u534A\u517D\u4EBA') return '&';
  if (m.kind === '\u9AB7\u9AC5\u6218\u58EB') return '%';
  if (m.kind === '\u6C83\u739B\u536B\u58EB') return 'W';
  return '\u03A9';
}

function monsterColor(m: Monster): string {
  if (m.kind === '\u7A3B\u8349\u4EBA') return '#8B946E';
  if (m.kind === '\u534A\u517D\u4EBA') return '#6E9B5A';
  if (m.kind === '\u9AB7\u9AC5\u6218\u58EB') return '#A0A0A0';
  if (m.kind === '\u6C83\u739B\u536B\u58EB') return '#8B7EC8';
  return WARN;
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
    text(ctx, f.text, x, y, f.color, 12, 'center');
    ctx.globalAlpha = 1;
  }
}

// ─── Minimap ────────────────────────────────────────────────────────

function drawMinimap(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  const compact = isPortrait(w, h);
  const mmW = compact ? 100 : 150;
  const mmH = Math.round(mmW * (WORLD.height / WORLD.width));
  const mx = w - mmW - 10;
  const my = compact ? 10 : 10;
  const sx = mmW / WORLD.width;
  const sy = mmH / WORLD.height;

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  roundRect(ctx, mx, my, mmW, mmH, 6);
  ctx.fill();
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 0.5;
  roundRect(ctx, mx, my, mmW, mmH, 6);
  ctx.stroke();
  ctx.lineWidth = 1;

  // Clip to minimap bounds
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mmW, mmH);
  ctx.clip();

  // Zones
  for (const zone of ZONES) {
    const zx = mx + zone.x * sx;
    const zy = my + zone.y * sy;
    const zw = zone.w * sx;
    const zh = zone.h * sy;
    ctx.fillStyle = zone.color;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(zx, zy, zw, zh);
    ctx.globalAlpha = 1;
  }

  // Shop marker
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(mx + SHOP_POS.x * sx, my + SHOP_POS.y * sy, compact ? 2 : 3, 0, Math.PI * 2);
  ctx.fill();

  // Monsters (sample every 3rd to keep it light)
  for (let i = 0; i < state.monsters.length; i++) {
    const m = state.monsters[i];
    if (m.hp <= 0) continue;
    const px = mx + m.pos.x * sx;
    const py = my + m.pos.y * sy;
    ctx.fillStyle = m.boss ? '#ff3150' : m.elite ? '#BF5AF2' : 'rgba(255,100,100,0.5)';
    const r = m.boss ? (compact ? 3 : 4) : m.elite ? (compact ? 2 : 2.5) : (compact ? 1 : 1.5);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Player dot (blinking)
  const blink = 0.6 + Math.sin(state.time * 5) * 0.4;
  ctx.fillStyle = `rgba(100, 255, 130, ${blink})`;
  ctx.beginPath();
  ctx.arc(mx + state.player.pos.x * sx, my + state.player.pos.y * sy, compact ? 2.5 : 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Camera viewport outline
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(
    mx + state.camera.x * sx,
    my + state.camera.y * sy,
    w * sx,
    h * sy
  );
  ctx.lineWidth = 1;

  ctx.restore();
}

// ─── HUD ────────────────────────────────────────────────────────────

function drawHud(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  const player = state.player;
  const stats = totalStats(player);
  const compact = isPortrait(w, h);

  // Top status bar
  const pw = compact ? w - 20 : 320;
  const ph = compact ? 78 : 90;
  panel(ctx, 10, 10, pw, ph, 14);

  // Title + gold
  text(ctx, compact ? '\u8D64\u6708\u5B64\u57CE' : '\u8D64\u6708\u5B64\u57CE  TERMINAL', 22, 20, T1, compact ? 13 : 14);
  text(ctx, `$ ${player.gold}`, compact ? pw - 8 : 280, 20, GOLD, 12, compact ? 'right' : 'left');

  // Bars
  const bw = compact ? pw - 28 : 230;
  bar(ctx, 22, 42, bw, 6, player.hp, stats.maxHp, HP_BAR);
  text(ctx, `${player.hp}`, 22, 52, T3, 9);
  text(ctx, `${stats.maxHp}`, 22 + bw, 52, T3, 9, 'right');

  bar(ctx, 22, 64, bw, 4, player.exp, player.nextExp, EXP_BAR);

  // Stats line
  const statsStr = compact
    ? `LV${player.level}  A${stats.attack}  D${stats.defense}  C${Math.round(stats.crit * 100)}%`
    : `LV ${player.level}   ATK ${stats.attack}   DEF ${stats.defense}   CRI ${Math.round(stats.crit * 100)}%   LS ${Math.round(stats.lifeSteal * 100)}%`;
  text(ctx, statsStr, 22, compact ? 72 : 80, T2, compact ? 10 : 11);

  // Bottom hint
  const nearShop = Math.hypot(player.pos.x - SHOP_POS.x, player.pos.y - SHOP_POS.y) < 180;
  const hint = nearShop
    ? 'E \u5546\u5E97   P \u4E70\u836F'
    : compact ? '\u6447\u6746\u79FB\u52A8  \u653B\u51FB  \u6280\u80FD  \u80CC\u5305' : 'WASD \u79FB\u52A8  SPACE \u653B\u51FB  1/2/3 \u6280\u80FD  I \u80CC\u5305  S \u4FDD\u5B58  R \u91CD\u7F6E';
  text(ctx, hint, 14, h - 22, T3, compact ? 10 : 11);

  drawSkills(ctx, state, w, h);
  if (state.messages.length > 0) drawMessages(ctx, state.messages, w, h);
  if (state.ui.panel === 'bag' || state.ui.panel === 'itemDetail') drawInventory(ctx, state, w, h);
  if (state.ui.panel === 'shop') drawShop(ctx, state, w, h);
  if (state.ui.panel === 'itemDetail') drawItemDetail(ctx, state, w, h);
  if (state.ui.panel === 'classSelect') drawClassSelect(ctx, state, w, h);
  if (state.ui.panel === 'talents') drawTalentTree(ctx, state, w, h);
  drawMinimap(ctx, state, w, h);
  if (!player.alive) drawDeath(ctx, w, h);
  if (state.showHelp) drawHelp(ctx, w);
}

function drawSkills(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  const compact = isPortrait(w, h);
  for (let i = 0; i < state.skills.length; i++) {
    const skill = state.skills[i];
    const x = compact ? w - 44 : w - 240 + i * 76;
    const y = compact ? h - 268 + i * 52 : h - 56;
    const size = compact ? 44 : 48;
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
    const book = item as SkillBookItem;
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
  const baseY = compact ? h - 300 : h - 80;

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

function drawDeath(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, w, h);
  text(ctx, 'SYSTEM FAILURE', w / 2, h / 2 - 36, WARN, 28, 'center');
  text(ctx, 'SPACE / ATTACK  TO  RESPAWN', w / 2, h / 2 + 10, T2, 14, 'center');
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

function drawTouchControls(ctx: CanvasRenderingContext2D, move: { x: number; y: number }, w: number, h: number): void {
  const compact = isPortrait(w, h);

  // Joystick
  ctx.globalAlpha = 0.5;
  const stickSize = compact ? 100 : 110;
  const stickX = compact ? 18 : 32;
  const stickY = h - (compact ? 130 : 146);

  ctx.strokeStyle = BORDER_H;
  ctx.lineWidth = 0.5;
  roundRect(ctx, stickX, stickY, stickSize, stickSize, 12);
  ctx.stroke();
  ctx.lineWidth = 1;

  // Joystick thumb
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  const thumbSize = 32;
  const tx = stickX + stickSize / 2 + move.x * 28 - thumbSize / 2;
  const ty = stickY + stickSize / 2 + move.y * 28 - thumbSize / 2;
  roundRect(ctx, tx, ty, thumbSize, thumbSize, 8);
  ctx.fill();

  // Buttons
  const rstLabel = state.resetConfirm ? '确认' : 'RST';
  const rstColor = state.resetConfirm ? WARN : T3;
  const buttons: TouchButton[] = compact
    ? [
        // Skills — right column, evenly spaced
        ['1', w - 44, h - 268, 22, '#FF9F0A'],
        ['2', w - 44, h - 216, 22, ACCENT],
        ['3', w - 44, h - 164, 22, '#BF5AF2'],
        // Attack — bottom right
        ['ATK', w - 56, h - 56, 40, WARN],
        // Header row — top right, y=128
        ['BAG', w - 40, 128, 22, SUCCESS],
        ['E', w - 92, 128, 22, GOLD],
        ['USE', w - 144, 128, 22, ACCENT],
        ['P', w - 196, 128, 22, WARN],
        [rstLabel, w - 248, 128, 22, rstColor]
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
        [rstLabel, w - 290, 56, 24, rstColor]
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
