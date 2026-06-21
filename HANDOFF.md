# 赤月孤城 PWA 游戏项目交接文档

本文档用于让新的 AI / 开发者快速接手本项目。请先完整阅读本文档，再改代码。

项目当前不是成品，而是一个已经能运行、能在手机上玩、具备完整战斗循环和角色成长系统的可玩 MVP。后续重点不是重写，而是在现有基础上逐步提升耐玩性和内容深度。

---

## 1. 项目概述

项目名：**赤月孤城**

目标：开发一个单机耐玩的类传奇 / 类 Mir 刷怪 RPG。

核心要求：

- 单机运行，不依赖服务器。
- PC 浏览器可玩。
- iOS Safari 可玩。
- 可作为 PWA 添加到 iOS 主屏幕。
- 本地自动存档。
- 极简终端符号风美术。
- 保留物理反馈：击退、震屏、粒子、碰撞。
- 最终目标是耐玩，而不是只做 Demo。

当前状态：

- 完整项目结构，约 2700 行 TypeScript 源码，分布在 11 个文件中。
- 已部署 GitHub Pages：https://2537391986.github.io/red-moon/
- 已有完整刷怪 → 掉装 → 装备对比 → 变强的核心循环。
- 已有职业选择（战士/法师）、技能系统（3 技能 + 技能书掉落）、天赋树（6 节点）。
- 已有装备词条系统（7 种词条，按稀有度生成 0-3 条，战斗中全部生效）。
- 已有 Boss 狂暴机制（HP < 30% 触发 1.4 倍攻速 + 视觉脉冲）。
- 已有小地图、消息队列、重置按钮（双击确认）。
- 已有攻击前摇/后摇、怪物攻击前摇、攻击轨迹、实体碰撞。
- 已做移动端竖屏适配和触摸交互。
- **战斗手感优化 (Poke)**：已加入 Hitstop、玩家蓄力条、怪物攻击范围动态填充、弹性飘字效果。
- **自动战斗与 UI 优化 (Poke)**：新增挂机系统，支持自动寻路、打怪和拾取。**当前版本 (v1.1.1)** 将自动战斗状态和版本号集成到了 HUD 主界面，优化了跨端可见性和交互。

---

## 2. 技术栈

当前技术：

- Vite
- TypeScript
- HTML5 Canvas
- PWA manifest
- service worker
- localStorage 存档

不要轻易更换技术栈。选择 Web PWA 的原因：

- iOS 可以直接用 Safari 打开。
- 可以添加到主屏幕。
- 不需要 Xcode、签名、App Store。
- PC / iOS / 安卓浏览器都能跑。
- 开发和调试成本低。

### 2.1 部署信息

- GitHub 仓库：https://github.com/2537391986/red-moon
- 本地路径：`C:\Users\LLuvYa\Desktop\game\ai`
- 分支：main
- Pages 地址：https://2537391986.github.io/red-moon/
- Pages 源：GitHub Actions（Settings 中已启用）
- 部署工作流：`.github/workflows/deploy.yml`，使用 `actions/deploy-pages@v4`
- `vite.config.ts` 的 `base` 使用 `process.env.GITHUB_PAGES_BASE || './'`，CI 构建时设为 `/${repo.name}/`

注意：本机 git push 可能因网络问题失败，可通过 Clash 代理（127.0.0.1:7890）+ GitHub Git Data API（blobs→tree→commit→ref update）完成推送。PowerShell 脚本必须写成 `.ps1` 文件用 `-File` 执行（bash 会吃掉 `$` 符号）。

---

## 3. 运行方式

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

本机访问：

```text
http://localhost:5173
```

构建检查：

```bash
npm run build
```

手机测试：

1. 电脑和手机连接同一个 Wi-Fi。
2. 获取电脑局域网 IP。
3. 手机 Safari 打开：

```text
http://电脑局域网IP:5173
```

PWA 测试：

- 在 iOS Safari 里选择"添加到主屏幕"。
- 如果 manifest 或显示模式改过，旧图标可能不更新，需要删除主屏幕旧图标后重新添加。

---

## 4. 项目结构

```text
index.html
package.json
tsconfig.json
vite.config.ts
HANDOFF.md
.github/
  workflows/
    deploy.yml
public/
  manifest.webmanifest
  sw.js
  icons/
    icon-192.svg
    icon-512.svg
src/
  main.ts                (12 行)   入口
  style.css
  vite-env.d.ts
  data/
    skills.ts            (29 行)   技能/职业/天赋定义  ★新增
    tables.ts            (36 行)   装备/怪物/词条数据表
    world.ts             (11 行)   世界/区域/商店配置
  game/
    Game.ts              (1100+ 行)核心逻辑
    input.ts             (130 行)  输入系统
    render.ts            (1000+ 行)Canvas 渲染
    types.ts             (210+ 行) 类型定义
  systems/
    loot.ts              (102 行)  掉落和装备生成
    save.ts              (61 行)   存档和属性计算
```

---

## 5. 核心文件说明

### 5.1 `src/main.ts`

入口文件。职责：引入样式、获取 `#game` canvas、创建 `Game` 实例、启动游戏循环、注册 service worker、暴露 `window.game` 方便调试。

### 5.2 `src/game/Game.ts`

最核心文件。职责：

- 创建初始游戏状态（含职业选择面板）。
- 主循环 update（60fps 固定步长）。
- **Hitstop 处理**：命中时短暂停顿逻辑帧，增强打击感。 (Poke)
- 玩家移动、怪物 AI。
- 普攻 / 技能 / 怪物攻击（windup → strike → recovery 状态机）。
- 攻击前摇、命中、后摇。
- 实体碰撞、击退、震屏、粒子。
- 掉落拾取（含金币、装备、药水、技能书）。
- 背包使用 / 装备 / 出售 / 丢弃。
- 商店买药 / 出售。
- 职业选择（`selectClass`）、技能学习（`learnSkill`）、天赋分配（`allocateTalent`）。
- 装备词条效果结算（`getAffixTotal`，含暴击强化、连击、荆棘、闪避、斩杀、吸血强化、生命回复）。
- Boss 狂暴机制（HP < 30% → 1.4 倍攻速，攻击冷却 1.7→1.2 秒）。
- 消息队列（`say()`，最多 4 条，每条 4 秒，最后 0.8 秒淡出）。
- 重置游戏（R 键双击确认，3 秒窗口）。
- 死亡和复活。
- 本地存档（每 8 秒自动保存 + 手动保存 + 页面卸载保存）。

### 5.3 `src/game/render.ts`

Canvas 渲染文件。职责：

- 画世界网格 and 地图区域（`drawWorld`）。
- 画玩家 `@`（`drawPlayer`）：**新增动作蓄力条**。 (Poke)
- 画怪物（`drawMonsters`）：**新增动态填充的红圈攻击预警**。 (Poke)
- 画掉落物（`drawDrops`）：金币 `$`、装备 `◇`、药水 `+`、技能书 `📖`。
- 画攻击轨迹 `SlashEffect`（`drawSlashes`）：直线/弧线/闪电三种样式。
- 画粒子（`drawParticles`）和浮动文字（`drawFloats`）：**支持弹性/重力物理飘字**。 (Poke)
- 画小地图（`drawMinimap`）：右上角，桌面 150×100 / 手机 100×67，显示区域、怪物、商店、玩家、相机视野。
- 画 HUD（`drawHud`）：HP/EXP 条、等级、金币、装备概要、消息队列。**新增版本号 (v1.1.1) 和自动战斗状态显示**。 (Poke)
- 画背包（`drawInventory`）：4 列网格、当前装备、物品详情、词条显示。
- 画物品详情（`drawItemDetail`）：属性对比、词条效果、装备/使用/出售/丢弃按钮。
- 画商店（`drawShop`）：买药、出售列表。
- 画职业选择（`drawClassSelect`）：新游戏首屏，战士/法师二选一。
- 画天赋树（`drawTalentTree`）：职业专属天赋节点，前置依赖线。
- 画消息队列（`drawMessages`）：底部堆叠，淡出动画。
- 画死亡界面（`drawDeath`） and 操作提示（`drawHelp`）。
- 画横屏 / 竖屏触摸控件（`drawTouchControls`）：含 RST 重置按钮。

---

## 8. 当前已修复/改进的重要问题

### 8.12 战斗打击感不足 (Updated by Poke)

已做：
- **Hitstop (帧冻结)**：玩家普攻命中怪物时，游戏逻辑会短暂停顿 0.06s，产生明显的阻力反馈。
- **动作蓄力条**：玩家在攻击前摇（Windup）期间，头顶会显示蓄力进度条，让攻击节奏可视化。
- **动态怪物警告**：怪物的红色扇形/圆形预警区域会随着攻击进度填充颜色，明确提示闪避时机。
- **弹性飘字**傷害数字现在拥有随机的出射速度、水平偏移和重力感，不再只是死板的向上平移。

### 8.13 挂机 UI 与交互优化 (Updated by Poke)

已做：
- **全端可见性**：自动战斗 (AUTO) 状态现在集成在 HUD 顶部面板中，且对 PC 用户增加 `V` 键快捷切换。
- **版本标识**：HUD 右下角增加版本号显示 (v1.1.1)，便于版本管理。

### 8.14 TypeScript 编译错误修复 (Updated by Poke)

已修复：
- `src/game/Game.ts`: 删除了 `createState` 中重复的 `autoBattle: false` 属性。
- `src/game/Game.ts` & `src/game/render.ts`: 修复了 `Item` 联合类型的类型缩小问题（通过 `item.type` 手动指定或移除不必要的强转）。
- `src/game/render.ts`: 修正了 `drawDeath` 函数中 `text` 调用参数顺序不一致的问题。

---

## 15. 当前项目一句话总结

这是一个基于 Vite + TypeScript + Canvas 的单机类传奇 PWA（约 2700 行代码），已具备完整的职业、技能、天赋、装备词条和 Boss 机制；**当前版本 (v1.1.1) 已修复所有阻塞 CI 的 TypeScript 编译错误并强化了战斗体验**。 (Updated by Poke)

## 优化记录 (Agnes-2.0-Flash)

### 已完成优化 (2026-06-20)
1. **词条统计缓存** — `getAffixTotal()` 合并到 `totalStats` 缓存体系，新增 `affixCache` 字段，同 player 对象共享缓存生命周期。所有 8 处调用统一改为 `getAffixTotal(this.state.player, affixId)`。
2. **魔法数字集中** — 新建 `src/data/config.ts`，导出 `GAME_CONFIG` 对象，集中管理 60+ 游戏参数（战斗时序、怪物 AI、物理参数、UI 行为等）。`Game.ts` 中所有硬编码数字已替换为 `C.XXX` 引用。
3. **怪物颜色/符号数据化** — `MONSTER_BASE` 新增 `glyph` 和 `color` 字段，`spawnMonster` 自动注入到 Monster 对象。`render.ts` 中 `monsterColor`/`monsterGlyph` 函数已删除，改为 `monster.color ?? '#888'` 和 `monster.glyph ?? '?'`。
4. **UID 计数器持久化** — `loot.ts` 中 `nextId` 初始化时读取 `localStorage`，每次 `uid()` 调用后写回，跨会话不冲突。
5. **技能书掉落过滤** — `makeSkillBook(playerLevel)` 新增等级判断：10 级以下只掉落基础技能 (`power_strike`, `tough_skin`)，10 级以上随机掉落全部技能。
6. **重复坐标计算消除** — `nearestLiving` 内联计算 dx/dy 避免重复 `dist()` 开方；`autoBattleAI` 中坐标差值复用同一变量。

### 技术细节
- `GAME_CONFIG` 使用 `as const` 断言，所有值为字面量类型，TypeScript 严格模式零报错。
- `save.ts` 中 `_statsCache` 新增 `affixCache: Record<string, number>` 字段，装备变化时 `invalidateStatsCache()` 自动失效。
- 所有修改通过 `npx tsc --noEmit` 验证，无新增类型错误。

— Agnes-2.0-Flash
