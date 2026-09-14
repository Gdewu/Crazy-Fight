---
feature: talent-system
status: delivered
updated: 2026-09-14
branch: feature/talent-system
commits: 6854402..HEAD
---

# 天赋系统

## Report

**What was built** — 新增通用天赋数据层 `talents.js`（普通/稀有/传说；每单位最多 3 个、传说至多 1、不可重复、仅本命）。魔剑士四天赋完整生效：威能（星落倍率 0.75）、蓄力（充能 80 + 攻速 +0.1）、星陨（暴击 +25 且星落可暴）、原初之力（开局直接星落）。3v3 编队通过独立天赋弹窗为 A/B 两侧配置；远征在战斗胜利结算 3 选 1（可跳过、满槽可替换）并在商店出售天赋；挑战预设可写 `talentIds`。敌方默认无天赋，字段已预留。

**Verification** — `node --check` 全部 JS 通过；Node 引擎冒烟：归一化/攻速/暴击/星落覆盖/开局星落日志均符合预期；无天赋对局与 master 基线对拍一致（magicSwordsman vs tank seed1：B / 37.8 / 2420 / 1655.4）。

**Journey log** —
1. 本目录原先不是 git 仓库：已 `git init` + 基线提交 `6854402`，功能在 `feature/talent-system`。
2. 未另开 worktree：游戏靠相对路径打开 `index.html`，就地分支更稳妥。
3. 枪手锁攻速：天赋 `speedFlat` 按装备同规则 0.05→+1 攻折算，避免破坏枪手机制。
4. 满槽商店购买：提示先在整备卸下；胜利奖励则进入替换确认。
5. 无天赋路径数值回归通过，可作为后续英雄天赋扩展的基线。

## [S1] Problem

当前英雄成长仅靠装备（每角色 2 点 / 3 槽）与远征局内数值，缺少「同一英雄不同流派」的定制维度。需要一套通用天赋系统：每位英雄最多选 3 个本命天赋（普通/稀有/传说三档，传说至多 1 个，不可重复），在普通 3v3 编队与远征肉鸽中均可获得并生效。本期以魔剑士 4 个天赋为基准打通全链路，其余英雄预留空池并提示「开发中」。

## [S2] Design

### S2.1 规则与范围

| 项 | 约定 |
| --- | --- |
| 槽位 | 每单位最多 3 个天赋，不可重复 |
| 稀有度 | `common` 普通 / `rare` 稀有 / `legendary` 传说 |
| 传说限制 | 每单位至多 1 个传说；普通与稀有可任意组合 |
| 归属 | 天赋绑定英雄；只能装到对应 `heroId` 的单位上 |
| 敌方 | 默认不带天赋；3v3 的 A/B 两侧均可手动配置；挑战预设可写固定 `talentIds`；远征敌人默认空 |
| 持久化 | 普通对局编队（含天赋）不写 localStorage，刷新重置 |
| 无池英雄 | 打开天赋弹窗提示「该英雄天赋开发中」，不能选择 |
| 工作区 | 就地在 `feature/talent-system` 分支开发（本仓库刚 git init，不另开 worktree，避免浏览器相对路径失效） |

### S2.2 魔剑士天赋池（本期唯一内容）

| id | 稀有度 | 名称 | 效果 |
| --- | --- | --- | --- |
| `ms_might` | 普通 | 威能 | 星落伤害倍率覆盖为 `0.75`（原 `0.6`） |
| `ms_charge` | 普通 | 蓄力 | 星落充能上限 `100→80`；`speed +0.1` 固定加算（与急速弓等装备同链） |
| `ms_starfall_crit` | 稀有 | 星陨 | 全局暴击率 `+25`；星落可暴击，暴伤吃单位 `critMulti`（默认 2.0） |
| `ms_origin` | 传说 | 原初之力 | 开局直接进入星落期；首次结束后照常清空充能并进入正常积累循环 |

组合说明：`ms_might` 与 `ms_charge` 可同时选；`ms_origin` 与 `ms_charge` 同时选时，开局星落用 80 上限，星落结束后的充能目标也是 80。

### S2.3 数据层（`talents.js` 新文件）

加载顺序：`config.js → heroes.js → equips.js → talents.js → mechanics.js → engine.js → rogue.js → game.js`。

`TALENT_DEFS` / `TALENT_LIST_BY_HERO` / `normalizeTalentIds` / `talentsOfHero` / `hasTalent`。Effects：`starfallAdRatio` / `starfallMaxCharge` / `speedFlat` / `critRate` / `starfallCanCrit` / `starfallOnStart`。`CONFIG.talent`：`maxSlots:3`、`maxLegendary:1`、`rogueWinChoices:3`、`rogueShopCount:3`、`rogueShopCost:40`。

### S2.4 编队与世界构建

- `roster` 成员增加 `talentIds: []`。
- `toTeamConfig` 透传并 `normalizeTalentIds`。
- `makeUnit(..., talentIds)` 在 `applyEquips` 后调用 `applyTalents`：写 unit 覆盖值；攻速/暴击加算（枪手攻速转攻击）。
- `createWorld` 结束时对 `starfallOnStart` 单位立即进入星落并 `starfallPulse`。

**实现修正（评审后）**：`createWorld` **不**直接触发开局星落，改为导出 `applyTalentOnStart(world)`，在「世界就绪且不会再被 `resetCombatState` 清掉」之后由调用方触发：`rebuildAll` / `init` / `startAuto` / `rogueStartBattle` / `simulateBattle`。否则 `resetCombatState` 会清掉星落计时与日志，却留下首段伤害。

### S2.5 机制/引擎改动

`starfall` 读 unit 的 `starfallMaxCharge` / `starfallAdRatio`；`starfallPulse` 支持 `starfallCanCrit`（`world.rng` + `critMulti`）。

### S2.6 3v3 UI

独立 `talentModal`；面板「✨ 天赋」按钮与短标签；A/B 共用；换英雄清空天赋；不持久化。

### S2.7 远征（rogue.js）

胜利结算 `rewardTalent`（3 选 1 / 跳过 / 满槽替换）；商店出售天赋；整备可点击卸下；开战写入 `createWorld`。

### S2.8 挑战模式

`CHALLENGE_TEAMS` 成员可写 `talentIds`，`applyChallengeTeam` 透传。

### S2.9 错误行为

非法/非本命/重复静默丢弃；超 3 截断；多传说只留第一个。

## [S3] Out of Scope

- 其余 16 名英雄的具体天赋设计与文案。
- 通用/跨英雄天赋池、天赋升级、天赋图鉴。
- 远征天赋锁存到 localStorage、跨局永久解锁。
- 挑战界面内可视化编辑预设天赋（只支持数据字段）。
- 平衡性调优与批量模拟天梯。

## Tasks

- [x] T1: 新建 `talents.js` + `CONFIG.talent` + `index.html` 加载顺序 — acceptance: 浏览器与 Node require 均可访问 `TALENT_DEFS`/`normalizeTalentIds` (covers: S2.3)
- [x] T2: `makeUnit`/`toTeamConfig`/`createWorld` 接入天赋 — acceptance: 带天赋的魔剑士攻速/暴击/星落参数与开局星落行为正确 (covers: S2.4; depends: T1)
- [x] T3: `starfall` 机制读 unit 覆盖 + 可暴击 — acceptance: 威能/蓄力/星陨效果可被对拍或 Node 脚本观察到 (covers: S2.5; depends: T2)
- [x] T4: 3v3 编队天赋弹窗与 roster 字段 — acceptance: A/B 可开弹窗选/取消天赋，非法组合被拒绝，无池英雄提示开发中 (covers: S2.6; depends: T2)
- [x] T5: 远征胜利 3 选 1 + 商店购买/替换 — acceptance: 远征可获得本命天赋并带入下一场战斗生效 (covers: S2.7; depends: T2, T3)
- [x] T6: 挑战预设字段透传 + 冒烟验证 — acceptance: 含 `talentIds` 的预设能进战斗且不破坏无天赋对局 (covers: S2.8, S2.9; depends: T2, T4)
- [x] T7: 回归：无天赋对局数值不变；脚本化抽查魔剑士天赋 — acceptance: 基线胜负/关键日志与改前一致，抽查脚本通过 (covers: S2.2, S2.5)
