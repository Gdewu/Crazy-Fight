// ============================================================
//  狂暴对战 · 队伍版 —— 远征挑战(肉鸽模式)
//  ------------------------------------------------------------
//  本文件由 game.js 拆出: 远征模式自成一套 UI(节点推进 / 商店 / 整备 / 战斗界面),
//  与普通对战互不引用, 因此单独成文件, 便于分别维护。
//
//  层级: config.js / heroes.js / equips.js / mechanics.js / engine.js → rogue.js → game.js
//    - 数据层与引擎层的顶层绑定(CONFIG / HERO_* / EQUIP_* / createWorld / tick / round1 等)
//      属于脚本全局,浏览器按 index.html 顺序加载后本文件可直接访问
//    - game.js(UI 核心)中的符号处于其 IIFE 内,故通过 install() 显式注入:
//        $                —— DOM 取值助手(id => element)
//        CHALLENGE_TEAMS  —— 挑战队伍数据(精英战节点复用「原队伍1」)
//        buildStatusHtml  —— 单位状态徽章渲染
//
//  对外接口: window.GameRogue
//    install(deps)     由 game.js 注入依赖
//    installRogueUI()  绑定远征入口按钮 / 弹窗 / 拖拽等事件(替代原来写在 init() 里的部分)
//    ROGUE / ROGUE_NODES / renderRogue / rogueStopTimer / rogueReset / rogueFinishNow /
//    rogueStep / rogueEnterNode / getWorld()  调试与重试所需
// ============================================================
(function () {
'use strict';
if (typeof document === 'undefined') return;        // 仅浏览器环境加载

// ============================================================
//  由 game.js 注入的依赖(init 前由 install() 赋值)
// ============================================================
let $ = null;
let CHALLENGE_TEAMS = null;
let buildStatusHtml = null;

// ============================================================
// ============================================================
//  远征挑战 · 肉鸽模式(v2.1 节点式)
//  ------------------------------------------------------------
//  7 个节点按顺序推进(v2.4):
//    ① 出征    : 随机 5 选 2 英雄 + 随机 4 选 1 基础装备
//    ② 战斗    : 敌 2 名随机英雄(1、2 号位, 不会出现玩家已有英雄)
//                 胜利 +10 金币 → 基础装备 4 选 1 → 英雄 2 选 1(凑满 3 人)
//    ③ 战斗    : 敌 3 名随机英雄(1、2、3 号位, 各带 1 个恢复水晶)
//                 胜利 +10 金币 → 稀有装备 3 选 1(v2.4 起不再赠送恢复水晶)
//    ④ 商店    : 随机 5 件基础装备(10 金) + 2 件稀有装备(20 金) + 一次性物品(守护/攻击药剂 6 金)
//                 并可卖装备(普通 6/稀有 12/升级 10 金)
//    ⑤ 装备升级: 10 金升级一件装备(仅限 流星锤/急速弓/精钢剑/专业法杖); 无战斗, 可直接通过
//    ⑥ 精英战  : 原队伍1(吸血) → 胜利 +10 金币
//    ⑦ BOSS    : 大魔法师 → 击败后通关
//  规则: 玩家只能操作 A 队(B 队由系统生成, 不可编辑); 每关开始全队回满血;
//        生命(机会)3点, 战斗失败扣 1 点并回到整备重试, 扣完则远征失败
//  两层结构(v2.9): 第一层「选关卡」(ROGUE_LEVELS: 测试远征1/火焰山/流沙河, 全部开放, 表尾可扩展)
//                → 第二层「选难度」(ROGUE_DIFFICULTIES: 1~5 密码锁滚轮);
//        难度各关独立: 本关通关难度N → 只解锁本关的难度N+1, 其它关卡不受影响;
//        每关进度单独写入 localStorage(键: heroDuel_rogueProgress_v1, 结构 { v:3, levels:{ 关卡id: 难度 } })
//        本轮关卡/难度只负责「解锁/存档 + 顶栏显示(🏁关卡 · 难度N)」; 选关层与选难度层隐藏顶栏与节点地图,
//        地图自整备/战斗起显示、远征结束界面不显示; 战斗数值差异(mods)后续接入
//  金币: 每个战斗节点胜利 +10; 商店(买/卖装备) 与 装备升级点(升级装备) 均可增减
//  整备: 战斗前可调整 3列×2行 站位(拖拽/点击换位) + 背包装备自由分配(每人 2 装备点)
//        战斗界面亦可「⚙ 调整装备/站位」暂停回整备(不消耗生命)
//  战场(2.3 起为上下布局): 敌我双方均为 3列×2行 = 前后排 6 个站位; B 队在上、A 队在下,
//        双方前排都贴中间线(面对面), 战斗日志固定在整个战场右侧
// ============================================================
const ROGUE_SLOT_CELLS = [1, 0, 2, 4, 3, 5];   // 号位 1~6 → 站位格(沿用默认布阵顺序)
const ROGUE_MAX_LIVES = 3;
const ROGUE_GOLD_PER_BATTLE = 10;
const ROGUE_SHOP = { basicCount: 5, rareCount: 2, basicPrice: 10, rarePrice: 20, sellBasic: 6, sellRare: 12, sellUpgraded: 10,
    itemPrice: 6, items: ['shield_potion', 'attack_potion'] };
// ---- v2.4 商店「一次性物品」(战斗前整备界面勾选使用, 开战自动生效并消耗 1 个) ----
const ROGUE_ITEMS = {
    shield_potion: { id: 'shield_potion', icon: '🧪', name: '守护药剂',
        desc: '开局我方所有单位获得 300 护盾，最多持续 6 秒' },
    attack_potion: { id: 'attack_potion', icon: '⚗️', name: '攻击药剂',
        desc: '开局我方所有单位攻击力 +10%，持续 6 秒' }
};
const ROGUE_NODES = [
    { type: 'pick',    icon: '🧭', name: '出征',     desc: '5选2英雄 · 4选1基础装备' },
    { type: 'battle',  icon: '⚔️', name: '战斗',     desc: '2 名随机英雄' },
    { type: 'battle',  icon: '⚔️', name: '战斗',     desc: '3 名随机英雄（带恢复水晶）' },
    { type: 'shop',    icon: '🏪', name: '商店',     desc: '买10/20金 · 卖6/12金' },
    { type: 'upgrade', icon: '🔧', name: '装备升级', desc: '10金升级装备（无战斗，可直接通过）' },
    { type: 'elite',   icon: '🔥', name: '精英战',   desc: '原队伍1（吸血）' },
    { type: 'boss',    icon: '👑', name: 'BOSS',     desc: '大魔法师' }
];
// ---- v2.9 关卡表(第一层选关): 先做 3 关, 表尾继续追加即可扩展 ----
//  · 关卡全部开放(不按顺序解锁), 难度才依次解锁(见下方难度表)
//  · 每关预留配置位: 以后可单独给某关加 nodes(节点表) / enemies(敌人) / rewards(奖励) / mods(数值),
//    目前各关都沿用默认的七节点流程与随机敌人(出征→战斗→战斗→商店→装备升级→精英战→BOSS)
const ROGUE_LEVELS = [
    { id: 1, name: '测试远征1' },
    { id: 2, name: '火焰山' },
    { id: 3, name: '流沙河' }
];
function rogueLevelDef(id) { return ROGUE_LEVELS.filter(l => l.id === id)[0] || null; }
function rogueLevelName(id) { const l = rogueLevelDef(id); return l ? l.name : '关卡' + id; }

// ---- v2.8/v2.9 难度档位(第二层左下角滚轮): 1~5, 各关卡独立解锁(本关通关难度N → 解锁本关难度N+1) ----
//  · name 即滚轮里显示的文字(只显示数字); 以后接入数值差异时给对应行补一个 mods 字段即可
const ROGUE_DIFFICULTIES = [
    { level: 1, name: '1' },
    { level: 2, name: '2' },
    { level: 3, name: '3' },
    { level: 4, name: '4' },
    { level: 5, name: '5' }
];
const ROGUE_MAX_DIFFICULTY = ROGUE_DIFFICULTIES[ROGUE_DIFFICULTIES.length - 1].level;
// 本地存档: { v:3, levels:{ '1':3, '2':1 } } —— 只存「每关已通关的最高难度」, 没有全局难度
// 旧档(v1/v2 带全局 maxCleared)一律作废: 只认 v===3, 否则所有关卡都从难度1 开始
const ROGUE_SAVE_KEY = 'heroDuel_rogueProgress_v1';
const ROGUE = {
    node: 0, lives: ROGUE_MAX_LIVES, phase: '', cleared: -1, gold: 0,
    team: [], bag: {}, enemies: [], shop: null,
    poolHeroes: [], poolEquips: [], pickHeroes: [], pickEquips: [],
    items: {},            // v2.4 一次性物品库存(soul_potion/attack_potion → 数量)
    potionUse: {},        // v2.4 整备界面勾选「本场使用」的物品
    settle: null,         // v2.4 战斗结算数据({win, dmg})
    level: 1,             // v2.9 本局关卡(ROGUE_LEVELS.id)
    difficulty: 1,        // v2.8 本局难度(1~5)
    levelCleared: {},     // v2.9 本地存档: 每关已通关的最高难度({ 关卡id: 难度 }); 难度各关独立, 无全局难度
    layerSelect: false,   // v2.9 是否正显示「关卡选择层」(第一层; 显示时 phase 保持战局阶段不动)
    runPhase: null,       // v2.9 暂存的「进行中」战局阶段(null = 没有进行中的局)
    runLevel: 0,          // v2.9 暂存战局所在的关卡
    runDifficulty: 0,     // v2.9 暂存战局所在的难度
    result: null
};
let rogueWorld = null, rogueTimer = null, rogueLogRef = null, rogueLogShown = 0, rogueSpeed = 2;
let rogueToastTimer = null, rogueMoveFrom = null;

// ---- v2.8 难度解锁 / 本地存档 ----
function rogueDifficultyDef(level) {
    return ROGUE_DIFFICULTIES.filter(d => d.level === level)[0] || null;
}
// 滚轮里显示的文字(当前为数字 '1'~'5')
function rogueDifficultyName(level) {
    const d = rogueDifficultyDef(level);
    return d ? d.name : String(level);
}
// 各关独立解锁: 下一档 = 本关已通关难度 + 1; 每关的难度1 都默认解锁
function rogueDifficultyUnlocked(level) { return level <= ROGUE_DIFFICULTIES[0].level || rogueLevelCleared(ROGUE.level) >= level - 1; }
function rogueDifficultyCleared(level) { return rogueLevelCleared(ROGUE.level) >= level; }
function rogueDifficultyStatus(level) {
    if (rogueDifficultyCleared(level)) return 'cleared';
    return rogueDifficultyUnlocked(level) ? 'open' : 'locked';
}
function rogueDifficultyStatusText(level) {
    const st = rogueDifficultyStatus(level);
    return st === 'cleared' ? '已通关' : (st === 'open' ? '可挑战' : '未解锁');
}
// 只认 v3(每关独立)存档; 旧档(v1/v2 带全局 maxCleared)作废 → 所有关卡从难度1 开始
function rogueLoadProgress() {
    const out = { levels: {} };
    try {
        const raw = window.localStorage ? window.localStorage.getItem(ROGUE_SAVE_KEY) : null;
        const data = raw ? JSON.parse(raw) : null;
        if (data && data.v === 3 && data.levels && typeof data.levels === 'object') {
            ROGUE_LEVELS.forEach(l => {                  // 只接受关卡表里存在的记录
                const v = data.levels[l.id];
                if (typeof v === 'number' && isFinite(v) && v > 0) out.levels[l.id] = Math.min(ROGUE_MAX_DIFFICULTY, Math.floor(v));
            });
        }
    } catch (err) { out.levels = {}; }                   // 隐私模式 / 存档损坏 → 从零开始
    return out;
}
function rogueSaveProgress() {
    try {
        if (window.localStorage) window.localStorage.setItem(ROGUE_SAVE_KEY, JSON.stringify({ v: 3, levels: ROGUE.levelCleared }));
    } catch (err) { /* 无法写入时不影响本局游玩 */ }
}
// 打开远征弹窗时调用: 读存档, 并把滚轮默认停在本关的「下一档难度」
function rogueInitProgress() {
    ROGUE.levelCleared = rogueLoadProgress().levels;
    ROGUE.difficulty = Math.min(ROGUE_MAX_DIFFICULTY, rogueLevelCleared(ROGUE.level) + 1);
}
// 某关卡已通关的最高难度(0 = 该关还没通关过)
function rogueLevelCleared(levelId) { return ROGUE.levelCleared[levelId] || 0; }
// 通关(击败 BOSS) → 只记录本关进度并解锁本关下一档难度(其它关卡不受影响)
function rogueMarkCleared() {
    const lv = ROGUE.difficulty, levelId = ROGUE.level;
    if (lv <= rogueLevelCleared(levelId)) return;
    ROGUE.levelCleared[levelId] = lv;
    rogueSaveProgress();
    const next = lv + 1;
    if (next <= ROGUE_MAX_DIFFICULTY) rogueToast(`🏅 通关 ${rogueLevelName(levelId)} 难度${lv} → 已解锁 ${rogueLevelName(levelId)} 难度${next}`, true);
    else rogueToast(`🏅 通关 ${rogueLevelName(levelId)} 难度${lv}（${rogueLevelName(levelId)} 已是最高难度）`, true);
}
// 通关统一入口(结算界面 & 节点推进两处都会走到)
function rogueFinishWin() {
    ROGUE.result = 'win'; ROGUE.phase = 'end';
    rogueMarkCleared();
    rogueClearRun();
}

// ---- v2.9 关卡选择层 / 进行中战局的暂存与继续 ----
//  第一层(选关列表)与第二层(难度滚轮)都属于「界面上层」, 战局阶段仍存在 phase 里:
//    · 有进行中的局时切到选关层/别的关卡 → 先把阶段记进 runPhase/runLevel/runDifficulty, 点该关可原样继续
//    · 开始新局 / 一局结束 → 清掉暂存(见 rogueReset / rogueFinishWin / rogueSettleConfirm 失败分支)
const ROGUE_RUN_PHASES = ['heroSelect', 'prep', 'battle', 'settle', 'rewardEquip', 'rewardRare', 'recruit', 'shop', 'upgrade', 'defeat'];
function rogueRunLive() { return ROGUE_RUN_PHASES.indexOf(ROGUE.phase) >= 0; }      // 当前界面就是战局
function rogueRunExists() { return rogueRunLive() || !!ROGUE.runPhase; }            // 有可继续的一局
function rogueRunLevelId() { return rogueRunLive() ? ROGUE.level : ROGUE.runLevel; }
function rogueRunLevelDifficulty() { return rogueRunLive() ? ROGUE.difficulty : ROGUE.runDifficulty; }
function rogueRunNodeText() {
    const n = ROGUE_NODES[ROGUE.node];
    return n ? `节点${ROGUE.node + 1} ${n.icon}${n.name}` : `节点${ROGUE.node + 1}`;
}
function rogueStashRun() {                       // 离开战局前, 把这一局记下来
    if (!rogueRunLive()) return;
    ROGUE.runPhase = ROGUE.phase;
    ROGUE.runLevel = ROGUE.level;
    ROGUE.runDifficulty = ROGUE.difficulty;
}
function rogueClearRun() { ROGUE.runPhase = null; ROGUE.runLevel = 0; ROGUE.runDifficulty = 0; }
function rogueResumeRun() {                      // 回到暂存的那一局(成功返回 true)
    if (!ROGUE.runPhase) return false;
    ROGUE.phase = ROGUE.runPhase;
    ROGUE.level = ROGUE.runLevel || ROGUE.level;
    ROGUE.difficulty = ROGUE.runDifficulty || ROGUE.difficulty;
    rogueClearRun();
    return true;
}

// ---- 随机工具 ----
function rogueShuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
}
function rogueSample(list, n) { return rogueShuffle(list.slice()).slice(0, n); }

// ---- 背包统计 ----
function rogueEquippedCount(id) {
    let c = 0;
    ROGUE.team.forEach(m => m.equipIds.forEach(e => { if (e === id) c++; }));
    return c;
}
// 背包可用数量(可排除某队员的某槽位, 便于下拉保留当前选择)
function rogueBagRemain(id, exceptMember, exceptSlot) {
    let used = 0;
    ROGUE.team.forEach((m, mi) => m.equipIds.forEach((e, si) => {
        if (e === id && !(mi === exceptMember && si === exceptSlot)) used++;
    }));
    return (ROGUE.bag[id] || 0) - used;
}
function rogueBagTotal() {
    let n = 0;
    Object.keys(ROGUE.bag).forEach(id => { n += ROGUE.bag[id]; });
    return n;
}
function rogueAddToBag(id) { ROGUE.bag[id] = (ROGUE.bag[id] || 0) + 1; }
// ---- v2.3 卖装备(仅商店节点可用): 普通 6 金 / 稀有 12 金 / 🔧升级装备 10 金 ----
// 升级装备按「升级后的价值」回收(与升级成本 10 金一致), 不按它升级前的基础档算 6 金
function rogueSellPrice(id) {
    const e = EQUIP_DEFS[id];
    if (e && e.upgraded) return ROGUE_SHOP.sellUpgraded;
    return equipTierOf(id) === 'rare' ? ROGUE_SHOP.sellRare : ROGUE_SHOP.sellBasic;
}
function rogueRemoveFromBag(id) {
    if (!ROGUE.bag[id]) return false;
    ROGUE.bag[id] -= 1;
    if (ROGUE.bag[id] <= 0) delete ROGUE.bag[id];
    return true;
}
// 只能卖「背包里闲置」的那一份: 已全部装备在队员身上的装备先卸下再卖
function rogueSellEquip(id) {
    const total = ROGUE.bag[id] || 0;
    const used = rogueEquippedCount(id);
    const name = EQUIP_DEFS[id] ? EQUIP_DEFS[id].name : id;
    if (total <= 0) { rogueToast(`背包里没有「${name}」`); return false; }
    if (used >= total) { rogueToast(`「${name}」已全部装备在队员身上，请先卸下再卖`); return false; }
    const price = rogueSellPrice(id);
    rogueRemoveFromBag(id);
    ROGUE.gold += price;
    rogueToast(`已卖出 ${name} → 金币 +${price}（共 ${ROGUE.gold} 金）`, true);
    return true;
}

// ---- 流程 ----
function rogueReset() {
    rogueStopTimer();
    rogueClearRun();                                 // v2.9: 开新局 / 重开 → 清掉「进行中」暂存
    ROGUE.layerSelect = false;
    ROGUE.node = 0; ROGUE.lives = ROGUE_MAX_LIVES; ROGUE.phase = ''; ROGUE.cleared = -1; ROGUE.gold = 0;
    ROGUE.team = []; ROGUE.bag = {}; ROGUE.enemies = []; ROGUE.shop = null;
    ROGUE.poolHeroes = []; ROGUE.poolEquips = []; ROGUE.pickHeroes = []; ROGUE.pickEquips = [];
    ROGUE.result = null;
    ROGUE.items = {}; ROGUE.potionUse = {}; ROGUE.settle = null;
    rogueMoveFrom = null;
    rogueWorld = null; rogueLogRef = null; rogueLogShown = 0;
}
// 进入当前节点(按类型切换阶段)
function rogueEnterNode() {
    const node = ROGUE_NODES[ROGUE.node];
    if (!node) { rogueFinishWin(); return; }        // 全部节点走完 → 通关(记录进度/解锁下一档)
    if (node.type === 'pick') {
        ROGUE.phase = 'heroSelect';
        ROGUE.poolHeroes = rogueSample(HERO_LIST, 5);
        ROGUE.poolEquips = rogueSample(equipListOfTier('normal'), 4);
        ROGUE.pickHeroes = []; ROGUE.pickEquips = [];
    } else if (node.type === 'shop') {
        ROGUE.phase = 'shop';
        ROGUE.shop = {
            basics: rogueSample(equipListOfTier('normal'), ROGUE_SHOP.basicCount)
                .map(id => ({ id, price: ROGUE_SHOP.basicPrice, sold: false })),
            rares: rogueSample(equipListOfTier('rare'), ROGUE_SHOP.rareCount)
                .map(id => ({ id, price: ROGUE_SHOP.rarePrice, sold: false }))
        };
    } else if (node.type === 'upgrade') {
        ROGUE.phase = 'upgrade';                             // ⑥ 装备升级点
    } else {
        ROGUE.enemies = rogueBuildEnemies(ROGUE.node);
        ROGUE.phase = 'prep';
        rogueMoveFrom = null;
    }
}
function rogueConfirmHeroSelect() {
    ROGUE.team = ROGUE.pickHeroes.map((id, i) => ({ heroId: id, equipIds: ['none', 'none', 'none'], cell: ROGUE_SLOT_CELLS[i] }));
    ROGUE.bag = {};
    ROGUE.pickEquips.forEach(id => rogueAddToBag(id));
    rogueAdvance();
}
// 推进到下一个节点
function rogueAdvance() {
    ROGUE.cleared = Math.max(ROGUE.cleared, ROGUE.node);
    ROGUE.node += 1;
    if (ROGUE.node >= ROGUE_NODES.length) { ROGUE.result = 'win'; ROGUE.phase = 'end'; return; }
    rogueEnterNode();
}
// 敌人配置: ② 2 名随机英雄(排除玩家已有, 1/2 号位)
//           ③ 3 名随机英雄(1/2/3 号位, 各带 1 个恢复水晶)
//           ⑤ 原队伍1(吸血)
//           ⑦ BOSS 大魔法师
function rogueBuildEnemies(nodeIdx) {
    const node = ROGUE_NODES[nodeIdx];
    if (node.type === 'boss') {
        // ⑦ BOSS: 大魔法师(1 号位)
        return [{ heroId: 'archmage', equipIds: ['none', 'none', 'none'], cell: ROGUE_SLOT_CELLS[0] }];
    }
    if (node.type === 'elite') {
        // ⑥ 精英战(与⑤装备升级点交换后): 原队伍1(吸血)
        return CHALLENGE_TEAMS[0].members.map(m => ({ heroId: m.heroId, equipIds: m.equipIds.slice(), cell: m.cell }));
    }
    const n = (nodeIdx === 1) ? 2 : 3;
    let pool = HERO_LIST.slice();
    if (nodeIdx === 1) pool = pool.filter(id => ROGUE.team.every(m => m.heroId !== id));
    const withCrystal = (nodeIdx === 2);      // ③ 每个敌人带 1 个恢复水晶
    return rogueSample(pool, n).map((heroId, i) => ({
        heroId,
        equipIds: withCrystal ? ['crystal', 'none', 'none'] : ['none', 'none', 'none'],
        cell: ROGUE_SLOT_CELLS[i]
    }));
}
// 开战: 每关重新构建世界 → 全队回满血(站位使用玩家在整备界面摆放的格子)
function rogueStartBattle() {
    rogueStopTimer();
    const a = ROGUE.team.map(m => ({ heroId: m.heroId, equipIds: m.equipIds.slice(), cell: m.cell, freeEquip: false }));
    const b = ROGUE.enemies.map(m => ({
        heroId: m.heroId, equipIds: m.equipIds.slice(),
        cell: (typeof m.cell === 'number' ? m.cell : ROGUE_SLOT_CELLS[0]), freeEquip: true
    }));
    rogueWorld = createWorld(a, b, { maxPerTeam: 9, mode: 'rogue' });
    rogueLogRef = null; rogueLogShown = 0;
    // v2.4 一次性物品: 整备界面勾选「本场使用」→ 开战自动生效并消耗 1 个
    const usedItems = [];
    ROGUE_SHOP.items.forEach(id => {
        if (!(ROGUE.potionUse && ROGUE.potionUse[id])) return;
        if ((ROGUE.items[id] || 0) <= 0) return;
        ROGUE.items[id] -= 1;
        if (ROGUE.items[id] <= 0) delete ROGUE.items[id];
        usedItems.push(id);
    });
    ROGUE.potionUse = {};
    if (usedItems.length) {
        rogueWorld.A.forEach(u => {
            if (usedItems.indexOf('shield_potion') >= 0) {
                u.shield = round1((u.shield || 0) + ROGUE_POTION.shield);
                u.potionShieldTimer = ROGUE_POTION.duration;
                u.potionShieldLeft = ROGUE_POTION.shield;
            }
            if (usedItems.indexOf('attack_potion') >= 0) {
                u.potionAtkBonus = round1(u.atk * ROGUE_POTION.atkPct);
                u.atk = round1(u.atk + u.potionAtkBonus);
                u.potionAtkTimer = ROGUE_POTION.duration;
            }
        });
        const names = usedItems.map(id => ROGUE_ITEMS[id].name).join('、');
        rogueWorld.addLog(`🧪 我方使用了一次性物品：${names}（开局生效，持续 ${ROGUE_POTION.duration} 秒）`, 'highlight');
    }
    ROGUE.phase = 'battle';
    renderRogue();
    rogueRunTimer();
}
function rogueRunTimer() { rogueStopTimer(); rogueTimer = setInterval(rogueStep, 50); }
function rogueStopTimer() { if (rogueTimer) { clearInterval(rogueTimer); rogueTimer = null; } }
function rogueStep() {
    if (!rogueWorld) { rogueStopTimer(); return; }
    for (let i = 0; i < rogueSpeed && !rogueWorld.winner; i++) tick(rogueWorld, CONFIG.auto.step, {});
    rogueRenderBattle();
    if (rogueWorld.winner || rogueWorld.battleTime >= CONFIG.sim.timeout) {
        const win = rogueWorld.winner === 'A';
        rogueStopTimer();
        rogueRenderBattle();
        rogueOnBattleEnd(win);
    }
}
// 立即结算(跳过动画)
function rogueFinishNow() {
    if (!rogueWorld) return;
    rogueStopTimer();
    let guard = 0;
    while (!rogueWorld.winner && rogueWorld.battleTime < CONFIG.sim.timeout && guard < 200000) {
        tick(rogueWorld, CONFIG.auto.step, {});
        guard++;
    }
    const win = rogueWorld.winner === 'A';
    rogueRenderBattle();
    rogueOnBattleEnd(win);
}
// v2.4: 战斗结束 → 先进入「结算界面」(胜/负 + 本场总伤害), 点「确定」后再进入下一节点
function rogueBattleDamage() {
    return rogueWorld ? round1(teamStats(rogueWorld, 'A').dmg) : 0;
}
function rogueOnBattleEnd(win) {
    ROGUE.settle = { win: !!win, dmg: rogueBattleDamage() };
    ROGUE.phase = 'settle';
    renderRogue();
}
function rogueSettleConfirm() {
    const win = !!(ROGUE.settle && ROGUE.settle.win);
    ROGUE.settle = null;
    if (win) {
        ROGUE.cleared = Math.max(ROGUE.cleared, ROGUE.node);
        ROGUE.gold += ROGUE_GOLD_PER_BATTLE;                 // 战斗节点胜利 +10 金币
        if (ROGUE.node >= ROGUE_NODES.length - 1) {
            rogueFinishWin();                            // 击败 BOSS → 通关并解锁下一档
        } else if (ROGUE.node === 1) {
            ROGUE.phase = 'rewardEquip';                     // ② 基础装备 4 选 1
            ROGUE.poolEquips = rogueSample(equipListOfTier('normal'), 4);
            ROGUE.pickEquips = [];
        } else if (ROGUE.node === 2) {
            ROGUE.phase = 'rewardRare';                      // ③ 稀有装备 3 选 1 + 1 个恢复水晶
            ROGUE.poolEquips = rogueSample(equipListOfTier('rare'), 3);
            ROGUE.pickEquips = [];
        } else {
            rogueAdvance();
        }
    } else {
        ROGUE.lives -= 1;
        if (ROGUE.lives <= 0) { ROGUE.result = 'lose'; ROGUE.phase = 'end'; rogueClearRun(); }
        else ROGUE.phase = 'defeat';
    }
    renderRogue();
}

// ---- 渲染 ----
function rogueBtn(label, onClick, cls) {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('click', onClick);
    return b;
}
function rogueToast(msg, ok) {
    const el = $('rogueToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'rogue-toast' + (ok ? ' ok' : '');
    if (rogueToastTimer) clearTimeout(rogueToastTimer);
    rogueToastTimer = setTimeout(() => { el.textContent = ''; }, 2200);
}
function renderRogueMap() {
    const el = $('rogueMap');
    if (!el) return;
    el.innerHTML = ROGUE_NODES.map((n, i) => {
        const cls = ROGUE.cleared >= i ? 'done' : (ROGUE.node === i ? 'current' : '');
        const mark = ROGUE.cleared >= i ? '✔ ' : '';
        return `<span class="rogue-node ${cls}" data-node="${i}">${mark}${n.icon} ${n.name}<span class="rn-sub">${n.desc}</span></span>`;
    }).join('<span class="rogue-link">▶</span>');
}
// ---- 顶栏 / 节点地图的按阶段显隐 ----
//  顶栏(难度·生命·金币): 「选关层」与「选难度」界面整条隐藏, 出征选人起出现
//  节点地图(①出征→⑦BOSS): 选关层/选难度/出征选人 均不显示; 进整备/战斗后才出现; 远征结束界面也不显示
const ROGUE_TOP_HIDDEN_PHASES = ['entry'];
const ROGUE_MAP_HIDDEN_PHASES = ['entry', 'heroSelect', 'end'];
function rogueToggleTopUi() {
    const topEl = $('rogueTop'), mapEl = $('rogueMap');
    if (topEl) topEl.classList.toggle('hidden', ROGUE.layerSelect || ROGUE_TOP_HIDDEN_PHASES.indexOf(ROGUE.phase) >= 0);
    if (mapEl) mapEl.classList.toggle('hidden', ROGUE.layerSelect || ROGUE_MAP_HIDDEN_PHASES.indexOf(ROGUE.phase) >= 0);
}
function renderRogue() {
    const livesEl = $('rogueLives'), goldEl = $('rogueGold');
    if (livesEl) {
        livesEl.textContent = '生命 ' + '♥'.repeat(Math.max(0, ROGUE.lives)) + '♡'.repeat(Math.max(0, ROGUE_MAX_LIVES - ROGUE.lives));
    }
    if (goldEl) goldEl.textContent = `💰 金币 ${ROGUE.gold}`;
    const diffEl = $('rogueDiff');                   // v2.9 顶栏显示当前关卡 + 难度
    if (diffEl) diffEl.textContent = `🏁 ${rogueLevelName(ROGUE.level)} · 难度${ROGUE.difficulty}`;
    renderRogueMap();
    rogueToggleTopUi();
    const body = $('rogueBody'), actions = $('rogueActions'), phaseEl = $('roguePhase');
    if (!body || !actions || !phaseEl) return;
    actions.innerHTML = '';
    // 第一层(选关层)覆盖在阶段之上: 只渲染选关列表, 不动 phase 对应的战局
    body.classList.toggle('entry-mode', !ROGUE.layerSelect && ROGUE.phase === 'entry');   // 第二层: 内容靠左下角排
    if (ROGUE.layerSelect) { renderRogueSelect(phaseEl, body, actions); return; }
    switch (ROGUE.phase) {
        case 'entry': renderRogueEntry(phaseEl, body, actions); break;
        case 'heroSelect': renderRogueHeroSelect(phaseEl, body, actions); break;
        case 'prep': renderRoguePrep(phaseEl, body, actions); break;
        case 'battle': renderRogueBattleView(phaseEl, body, actions); break;
        case 'settle': renderRogueSettle(phaseEl, body, actions); break;
        case 'rewardEquip': renderRogueRewardEquip(phaseEl, body, actions); break;
        case 'rewardRare': renderRogueRewardRare(phaseEl, body, actions); break;
        case 'recruit': renderRogueRecruit(phaseEl, body, actions); break;
        case 'shop': renderRogueShop(phaseEl, body, actions); break;
        case 'upgrade': renderRogueUpgrade(phaseEl, body, actions); break;
        case 'defeat': renderRogueDefeat(phaseEl, body, actions); break;
        case 'end': renderRogueEnd(phaseEl, body, actions); break;
    }
}
// ---- v2.9 第一层: 关卡选择层(垂直列表; 点关卡进第二层, 或继续该关「进行中」的那一局) ----
function rogueSelectRowHtml(def) {
    const running = rogueRunExists() && def.id === rogueRunLevelId();
    const cleared = rogueLevelCleared(def.id);
    const badge = running ? `进行中 · ${rogueRunNodeText()} · 难度${rogueRunLevelDifficulty()}`
        : cleared > 0 ? `已通关 难度${cleared}` : '未挑战';
    const cls = running ? 'running' : (cleared > 0 ? 'cleared' : 'open');
    const sub = running ? '点击继续这一局'
        : cleared > 0 ? `最高通关：难度${cleared}（可重复挑战 · 难度 1~${ROGUE_MAX_DIFFICULTY}）`
            : `可挑战：从节点① 出征开始 · 难度 1~${ROGUE_MAX_DIFFICULTY}`;
    return `<div class="rsl-card ${cls}" data-level="${def.id}">
        <div class="rsl-line"><span class="rsl-name">${def.name}</span>
            <span class="rsl-badge ${cls}">${badge}</span></div>
        <div class="rsl-sub">${sub}</div></div>`;
}
function renderRogueSelect(phaseEl, body, actions) {
    phaseEl.textContent = `🧭 选择关卡（共 ${ROGUE_LEVELS.length} 关 · 难度各关独立：本关通关难度N → 解锁本关难度N+1）`;
    body.innerHTML = `<div class="rogue-select">${ROGUE_LEVELS.map(rogueSelectRowHtml).join('')}</div>`;
    body.querySelectorAll('.rsl-card').forEach(card => {
        card.addEventListener('click', () => rogueSelectLevel(parseInt(card.dataset.level, 10)));
    });
}
// 点选某关卡: 该关「进行中」的那一局 → 原样回去继续; 否则 → 进入第二层(难度滚轮 + 开始远征)
function rogueSelectLevel(levelId) {
    ROGUE.layerSelect = false;
    if (rogueRunExists() && levelId === rogueRunLevelId()) {
        if (!rogueRunLive()) {                           // 暂存的那一局 → 恢复阶段继续
            rogueResumeRun();
            rogueToast(`继续 ${rogueLevelName(levelId)} · 难度${ROGUE.difficulty}：${rogueRunNodeText()}`, true);
        }
        renderRogue();
        return;
    }
    rogueStashRun();                                     // 切去别的关卡 → 先把进行中的那一局记下来
    ROGUE.level = levelId;
    ROGUE.difficulty = Math.min(ROGUE_MAX_DIFFICULTY, rogueLevelCleared(levelId) + 1);   // 默认停在本关的「下一档难度」
    ROGUE.phase = 'entry';
    renderRogue();
}
// v2.8/v2.9 第二层: 密码锁式「难度滚轮」(上/下滚动逐档切换, 滚到底为最高档)
//      滚轮只显示难度数字 1~5(关卡名不在本层重复); 难度只负责「解锁/存档」:
//      击败 BOSS 完整通关难度N → 全局解锁难度N+1(存 localStorage)
//      开局不赠送任何金币 / 药剂 / 装备：金币靠战斗胜利获得，药剂需在商店节点购买
function rogueLockItemHtml(level) {
    const st = rogueDifficultyStatus(level);
    return `<div class="rp-lock-item ${st}" data-lv="${level}">
        <span class="rpl-name">${rogueDifficultyName(level)}</span>
        <span class="rpl-status">${rogueDifficultyStatusText(level)}</span></div>`;
}
function renderRogueEntry(phaseEl, body, actions) {
    phaseEl.textContent = `🧭 选择难度（共 ${ROGUE_DIFFICULTIES.length} 档 · 本关通关难度N → 解锁本关难度N+1）`;
    // 入口只有「难度滚轮 + 状态行」两块, 由 .rogue-body.entry-mode 排到界面左下角
    // (原先的说明文字与「关卡路线」列表已移除)
    let html = `<div class="rogue-lock">
        <div class="rp-lock" id="rogueLock" tabindex="0">
            <div class="rpl-pad"></div>
            ${ROGUE_DIFFICULTIES.map(d => rogueLockItemHtml(d.level)).join('')}
            <div class="rpl-pad"></div>
        </div>
        <div class="rpl-band"></div>
    </div>
    <div class="rpl-meta">
        <span>🏅 本关已通关：<b>${rogueLevelCleared(ROGUE.level) > 0 ? '难度' + rogueLevelCleared(ROGUE.level) : '无'}</b></span>
        <span>当前选择：难度<b id="rogueLockSel">${rogueDifficultyName(ROGUE.difficulty)}</b><span id="rogueLockSt"> · ${rogueDifficultyStatusText(ROGUE.difficulty)}</span></span>
    </div>`;
    body.innerHTML = html;
    const startBtn = rogueBtn('', () => rogueStartRun());
    actions.appendChild(startBtn);
    actions.appendChild(rogueBtn('← 返回选择', () => { ROGUE.layerSelect = true; renderRogue(); }, 'rogue-back-btn'));
    rogueBindLockWheel(startBtn);
}
// 开始一局远征(先校验解锁状态)
function rogueStartRun() {
    const lv = ROGUE.difficulty;
    if (!rogueDifficultyUnlocked(lv)) {
        rogueToast(`难度${lv} 未解锁：请先通关 难度${lv - 1}`);
        return;
    }
    rogueStopTimer();
    rogueReset();
    ROGUE.difficulty = lv;
    rogueEnterNode();
    rogueToast(`本局：${rogueLevelName(ROGUE.level)} · 难度${lv}`, true);
    renderRogue();
}
// 密码锁滚轮: 中间格 = 当前选中难度; 支持滚轮逐档 / 拖拽滚动 / 点击跳档 / 键盘上下键
function rogueBindLockWheel(startBtn) {
    const wheel = $('rogueLock');
    if (!wheel) return;
    const levels = ROGUE_DIFFICULTIES.map(d => d.level);
    const items = [].slice.call(wheel.querySelectorAll('.rp-lock-item'));
    const elOf = lv => items[levels.indexOf(lv)] || items[0];
    const topOf = el => el.offsetTop - (wheel.clientHeight - el.offsetHeight) / 2;
    const clampLv = lv => Math.max(levels[0], Math.min(levels[levels.length - 1], lv));
    // 离中间格最近的一档
    function nearestLevel() {
        const center = wheel.scrollTop + wheel.clientHeight / 2;
        let best = items[0], bestD = Infinity;
        items.forEach(el => {
            const d = Math.abs((el.offsetTop + el.offsetHeight / 2) - center);
            if (d < bestD) { best = el; bestD = d; }
        });
        return parseInt(best.dataset.lv, 10);
    }
    // 仅视觉: 高亮离中心最近的一项(平滑滚动过程中跟随)
    function highlightNearest() {
        if (!wheel.clientHeight) return;
        const near = elOf(nearestLevel());
        items.forEach(el => el.classList.toggle('active', el === near));
    }
    // 选中某一档: 更新状态/文案/开始按钮, 并滚到中间格
    // 注意: 选中档位以「操作意图」为准, 滚动动画不反向改写选中值(否则连续滚动会互相拉扯)
    function selectLevel(lv, smooth) {
        const cur = clampLv(lv);
        ROGUE.difficulty = cur;                          // 到顶/到底即停
        const selEl = $('rogueLockSel'), stEl = $('rogueLockSt');
        if (selEl) selEl.textContent = rogueDifficultyName(cur);
        if (stEl) stEl.textContent = ' · ' + rogueDifficultyStatusText(cur);
        if (startBtn) {
            const unlocked = rogueDifficultyUnlocked(cur);
            startBtn.textContent = unlocked ? `▶ 开始远征（难度${cur}）` : `🔒 难度${cur} 未解锁`;
            startBtn.disabled = !unlocked;
        }
        const el = elOf(cur);
        if (!el || !wheel.clientHeight) return;           // 弹窗未显示时只改状态
        wheel.scrollTo({ top: topOf(el), behavior: smooth === false ? 'auto' : 'smooth' });
        highlightNearest();
        setTimeout(highlightNearest, smooth === false ? 0 : 240);   // 平滑滚动结束后再校准一次
    }
    function step(delta) {
        selectLevel(ROGUE.difficulty + delta);            // 逐档推进, 到顶/到底即停
    }
    wheel.addEventListener('scroll', highlightNearest);
    // 滚轮逐档(阻止把滚动传递给弹窗/页面)
    wheel.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); step(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    wheel.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); step(1); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    });
    // 拖拽滚动(按住上下拖, 与手机滚轮一致: 往下拖 = 看更高档): 松手后吸附到最近一档
    //  用 pointer capture 让指针移出滚轮后仍能继续拖动
    let dragging = false, dragY = 0, dragTop = 0, dragged = false;
    function release(e) {
        dragging = false;
        wheel.classList.remove('dragging');
        if (e && wheel.releasePointerCapture) { try { wheel.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ } }
    }
    wheel.addEventListener('pointerdown', e => {
        dragging = true; dragged = false; dragY = e.clientY; dragTop = wheel.scrollTop;
        wheel.classList.add('dragging');
        if (wheel.setPointerCapture) { try { wheel.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ } }
    });
    wheel.addEventListener('pointermove', e => {
        if (!dragging) return;
        const dy = e.clientY - dragY;
        if (Math.abs(dy) > 3) dragged = true;
        wheel.scrollTop = dragTop - dy;
    });
    wheel.addEventListener('pointerup', e => {
        if (!dragging) return;
        const wasDragged = dragged;
        release(e);
        if (!wasDragged) {                               // 没拖动 = 点击某一档
            const hit = document.elementFromPoint ? document.elementFromPoint(e.clientX, e.clientY) : null;
            const item = hit && hit.closest ? hit.closest('.rp-lock-item') : null;
            if (item) { dragged = false; selectLevel(parseInt(item.dataset.lv, 10)); return; }
        }
        selectLevel(wheel.clientHeight ? nearestLevel() : ROGUE.difficulty);
    });
    wheel.addEventListener('pointercancel', e => {
        if (!dragging) return;
        release(e);
        selectLevel(wheel.clientHeight ? nearestLevel() : ROGUE.difficulty);
    });
    // 点击某一档 → 直接跳到该档(捕获指针时上面已处理, 这里兜底)
    items.forEach(el => el.addEventListener('click', () => {
        if (dragging) return;
        selectLevel(parseInt(el.dataset.lv, 10));
    }));
    selectLevel(ROGUE.difficulty, false);                // 初始停在当前选择
}
// v2.4: 战斗结算界面(胜/负 + 本场总伤害, 点「确定」后进入下一节点)
function renderRogueSettle(phaseEl, body, actions) {
    const s = ROGUE.settle || { win: false, dmg: 0 };
    const nd = ROGUE_NODES[ROGUE.node] || ROGUE_NODES[0];
    phaseEl.textContent = `${nd.icon} ${nd.name} · 战斗结算`;
    const alive = rogueWorld ? rogueWorld.A.filter(u => u.hp > 0).length : 0;
    body.innerHTML = `<div class="rogue-settle ${s.win ? 'win' : 'lose'}">
        <div class="rs-title">${s.win ? '🏆 战斗胜利！' : '💔 战斗失败'}</div>
        <div class="rs-dmg">本场总伤害 <b>${s.dmg}</b></div>
        <div class="rs-sub">${s.win
            ? `我方存活 ${alive} 人　获得金币 +${ROGUE_GOLD_PER_BATTLE} 🪙`
            : `生命 -1（剩余 ${Math.max(0, ROGUE.lives - 1)} ♥）`}</div>
    </div>`;
    actions.appendChild(rogueBtn('确定', () => rogueSettleConfirm()));
}
// ① 出征选人: 随机 5 选 2 英雄 + 随机 5 选 1 普通装备
function renderRogueHeroSelect(phaseEl, body, actions) {
    phaseEl.textContent = `节点① 出征 · ${rogueLevelName(ROGUE.level)} · 难度${ROGUE.difficulty} · 随机 5 选 2 名英雄 + 4 选 1 件基础装备`;
    let html = `<div class="rogue-note">已选英雄 ${ROGUE.pickHeroes.length}/2　已选装备 ${ROGUE.pickEquips.length}/1</div><div class="rogue-pick">`;
    html += ROGUE.poolHeroes.map(id => {
        const h = HERO_DEFS[id];
        const on = ROGUE.pickHeroes.indexOf(id) >= 0;
        return `<div class="rp-card${on ? ' selected' : ''}" data-kind="hero" data-id="${id}">
            <div class="rp-emoji">${h.emoji}</div><div class="rp-name">${h.name}</div>
            <div class="rp-sub">HR ${h.maxHp}　攻 ${h.atk}　速 ${h.speed.toFixed(2)}</div></div>`;
    }).join('') + '</div>';
    html += `<div class="rogue-note" style="margin-top:10px">基础装备（4 选 1，进入背包后可自由分配）</div><div class="rogue-pick">`;
    html += ROGUE.poolEquips.map(id => {
        const e = EQUIP_DEFS[id];
        const on = ROGUE.pickEquips.indexOf(id) >= 0;
        return `<div class="rp-card${on ? ' selected' : ''}" data-kind="equip" data-id="${id}">
            <div class="rp-emoji">${e.icon}</div><div class="rp-name">${e.name}</div>
            <div class="rp-sub">${e.statsText[0] || ''}</div></div>`;
    }).join('') + '</div>';
    body.innerHTML = html;
    body.querySelectorAll('.rp-card').forEach(card => {
        card.addEventListener('click', () => {
            const kind = card.dataset.kind, id = card.dataset.id;
            const pick = kind === 'hero' ? ROGUE.pickHeroes : ROGUE.pickEquips;
            const limit = kind === 'hero' ? 2 : 1;
            const i = pick.indexOf(id);
            if (i >= 0) pick.splice(i, 1);
            else if (pick.length < limit) pick.push(id);
            else { rogueToast(kind === 'hero' ? '最多选择 2 名英雄' : '最多选择 1 件装备'); return; }
            renderRogue();
        });
    });
    const ok = ROGUE.pickHeroes.length === 2 && ROGUE.pickEquips.length === 1;
    const btn = rogueBtn('确认出征', () => {
        if (ROGUE.pickHeroes.length !== 2 || ROGUE.pickEquips.length !== 1) {
            rogueToast('请选择 2 名英雄和 1 件普通装备'); return;
        }
        rogueConfirmHeroSelect(); renderRogue();
    });
    btn.disabled = !ok;
    actions.appendChild(btn);
}
// ② 整备: 队员装备下拉 + 背包栏
function rogueOptionHtml(current, mi, slot, heroId) {
    const hero = HERO_DEFS[heroId] || {};
    let html = `<option value="none"${current === 'none' ? ' selected' : ''}>⬜ 无</option>`;
    Object.keys(ROGUE.bag).forEach(id => {
        const e = EQUIP_DEFS[id];
        if (!e) return;
        // 专业法杖 / 灵能大法杖 限蓝条英雄(引擎会自动置空, 这里直接禁用避免浪费)
        const blocked = (id === 'staff' || id === 'staff_up') && !hero.hasMana;
        const remain = rogueBagRemain(id, mi, slot);
        const disabled = blocked || (id !== current && remain <= 0);
        const tail = blocked ? '（限蓝条英雄）' : (e.cost > 1 ? `（${e.cost}点）` : (e.cost === 0 ? '（0点）' : ''));
        html += `<option value="${id}"${id === current ? ' selected' : ''}${disabled ? ' disabled' : ''}>${e.icon} ${e.name}${remain > 0 ? ' ×' + remain : '（已用完）'}${tail}</option>`;
    });
    return html;
}
// sellMode=true 时每个条目右侧带「💰 卖出」按钮(仅商店节点)
function rogueBagHtml(sellMode) {
    const ids = Object.keys(ROGUE.bag);
    if (!ids.length) {
        return `<div class="rogue-bag"><div class="rb-title">🎒 背包（0 件）</div>
            <div class="rb-empty">（空）${sellMode ? '没有可以卖的装备' : '击败敌人获得的装备会放入背包'}</div></div>`;
    }
    const items = ids.map(id => {
        const e = EQUIP_DEFS[id];
        const total = ROGUE.bag[id], used = rogueEquippedCount(id);
        const mark = e.upgraded ? ' 🔧' : (equipTierOf(id) === 'rare' ? ' ⭐' : '');
        const sell = sellMode
            ? `<button class="rb-sell" data-sell="${id}"${total - used > 0 ? '' : ' disabled'} title="卖出一件（剩 ${total - used} 件可卖）">💰 ${rogueSellPrice(id)}</button>`
            : '';
        return `<span class="rb-item${used >= total ? ' used-up' : ''}${e.upgraded ? ' upgraded' : ''}">${e.icon} ${e.name} ${used}/${total}${mark}${sell}</span>`;
    }).join('');
    const title = sellMode
        ? `🎒 背包（共 ${rogueBagTotal()} 件）· 卖装备：普通 ${ROGUE_SHOP.sellBasic} 金 / 稀有 ${ROGUE_SHOP.sellRare} 金 / 🔧升级 ${ROGUE_SHOP.sellUpgraded} 金`
        : `🎒 背包（共 ${rogueBagTotal()} 件）`;
    return `<div class="rogue-bag"><div class="rb-title">${title}</div><div class="rb-list">${items}</div></div>`;
}
// 队员按号位排序(1号位 → 6号位)
function rogueTeamOrder() {
    return ROGUE.team.slice().sort((a, b) => ROGUE_SLOT_CELLS.indexOf(a.cell) - ROGUE_SLOT_CELLS.indexOf(b.cell));
}
// v2.4: 单位实时数值预览(英雄 + 装备), 用于整备界面的基础信息显示
function rogueUnitPreview(heroId, equipIds, cell, teamKey, freeEquip) {
    const h = HERO_DEFS[heroId];
    const u = makeUnit(heroId, equipIds, teamKey, cell, null, !!freeEquip);
    return {
        emoji: h.emoji, name: h.name, hasMana: h.hasMana,
        maxHp: round1(u.maxHp), atk: round1(u.atk),
        speed: (u.speed * (u.speedMul || 1)).toFixed(2),
        armor: round1(u.armor), mr: round1(u.mr), maxMana: u.maxMana,
        eq: (equipIds || []).filter(id => id !== 'none').map(id => (EQUIP_DEFS[id] ? EQUIP_DEFS[id].icon : '')).join('')
    };
}
function rogueMemberStats(m) { return rogueUnitPreview(m.heroId, m.equipIds, m.cell, 'A', false); }
function rogueFoeStats(m) { return rogueUnitPreview(m.heroId, m.equipIds, m.cell, 'B', true); }
function rogueFoeStatLine(s) {
    return `<span class="rp-stat">❤️ ${s.maxHp}　⚔️ ${s.atk}　⚡ ${s.speed}　🛡️ ${s.armor}　🔮 ${s.mr}</span>`;
}
function rogueEnemyAtCell(cell) {
    return (ROGUE.enemies || []).filter(e => e.cell === cell)[0] || null;
}
// 对位规则: 同列优先, 同列时前排优先; 否则取列距离最近的敌人
function rogueOppositeEnemy(cell) {
    let best = null, bestDist = 99, bestRow = 99;
    (ROGUE.enemies || []).forEach(e => {
        const d = Math.abs(cellCol(e.cell) - cellCol(cell));
        const r = cellRow(e.cell);              // 0 = 前排
        if (d < bestDist || (d === bestDist && r < bestRow)) { best = e; bestDist = d; bestRow = r; }
    });
    return best;
}
// 图1 上方: 敌方阵型站位(3 列 × 2 行) + 敌方全部信息
function rogueEnemyGridHtml() {
    if (!(ROGUE.enemies || []).length) return '';
    let html = `<div class="rp-title" style="margin-top:10px">👹 敌方阵型站位（3 列 × 2 行）</div><div class="rogue-grid enemy-grid">`;
    for (let cell = 0; cell < CONFIG.teams.cells; cell++) {
        const slot = ROGUE_SLOT_CELLS.indexOf(cell) + 1;
        const m = rogueEnemyAtCell(cell);
        if (m) {
            const s = rogueFoeStats(m);
            html += `<div class="rg-cell filled enemy" data-foe="${cell}">
                <div class="rg-pos">${cellName(cell)} · ${slot}号位</div>
                <div class="rg-name">${s.emoji} ${s.name}</div>
                <div class="rg-eq">${s.eq || '—'}</div>
                <div class="rg-stat">❤️ ${s.maxHp}　⚔️ ${s.atk}　⚡ ${s.speed}</div>
                <div class="rg-stat">🛡️ ${s.armor}　🔮 ${s.mr}</div></div>`;
        } else {
            html += `<div class="rg-cell enemy">
                <div class="rg-pos">${cellName(cell)} · ${slot}号位</div>
                <div class="rg-empty">空</div></div>`;
        }
    }
    return html + `</div>`;
}
// 图1 下方: 我方每个号位的对位详情(我方单位 → 对位敌方及其全部信息)
function roguePairListHtml() {
    const order = rogueTeamOrder();
    if (!order.length) return '';
    let html = `<div class="rp-title" style="margin-top:10px">🎯 我方对位详情（我方 → 敌方）</div><div class="rogue-pairs">`;
    order.forEach(m => {
        const us = rogueMemberStats(m);
        const slot = ROGUE_SLOT_CELLS.indexOf(m.cell) + 1;
        const foe = rogueOppositeEnemy(m.cell);
        let foeHtml = `<span class="rp-foe none">（无敌对位）</span>`;
        if (foe) {
            const f = rogueFoeStats(foe);
            const fslot = ROGUE_SLOT_CELLS.indexOf(foe.cell) + 1;
            foeHtml = `<span class="rp-foe">${f.emoji} ${f.name}（${fslot}号位 · ${cellName(foe.cell)}）${rogueFoeStatLine(f)}
                <span class="rp-foe-eq">${f.eq ? '装备：' + f.eq : '无装备'}</span></span>`;
        }
        html += `<div class="rp-pair">
            <span class="rp-us">${us.emoji} ${us.name}　${slot}号位 · ${cellName(m.cell)}${rogueFoeStatLine(us)}</span>
            <span class="rp-arrow">➜ 对位</span>${foeHtml}</div>`;
    });
    return html + `</div>`;
}
// 整备界面: 敌方站位 + 我方对位详情(图1)
function rogueEnemyPreviewHtml() {
    return rogueEnemyGridHtml() + roguePairListHtml();
}
// v2.4: 一次性物品面板(整备界面勾选 → 开战自动生效并消耗)
function rogueItemsPanelHtml() {
    const owned = ROGUE_SHOP.items.filter(id => (ROGUE.items[id] || 0) > 0);
    let html = `<div class="rogue-items"><div class="ri-title">🧪 一次性物品（勾选后开战自动生效并消耗 1 个）</div>`;
    if (!owned.length) {
        html += `<div class="rb-empty">暂无。可在 🏪 商店（节点④）用 ${ROGUE_SHOP.itemPrice} 金购买守护 / 攻击药剂</div>`;
    } else {
        owned.forEach(id => {
            const it = ROGUE_ITEMS[id];
            const on = !!(ROGUE.potionUse && ROGUE.potionUse[id]);
            html += `<label class="ri-item${on ? ' on' : ''}">
                <input type="checkbox" data-item="${id}"${on ? ' checked' : ''}>
                <span class="ri-icon">${it.icon}</span>
                <span class="ri-body"><b>${it.name}</b><span class="ri-own">持有 ${ROGUE.items[id]}</span>
                <span class="ri-desc">${it.desc}</span></span></label>`;
        });
    }
    return html + `</div>`;
}
// 站位: 点击选中 → 点击目标格移动/交换(拖拽同样有效)
function rogueCellClick(cell) {
    const mover = ROGUE.team.filter(x => x.cell === rogueMoveFrom)[0];
    if (mover && rogueMoveFrom !== cell) { rogueMoveUnit(rogueMoveFrom, cell); return; }
    const here = ROGUE.team.filter(x => x.cell === cell)[0];
    rogueMoveFrom = (here && rogueMoveFrom !== cell) ? cell : null;
    renderRogue();
}
function rogueMoveUnit(fromCell, toCell) {
    if (fromCell === null || fromCell === undefined || fromCell === toCell) {
        rogueMoveFrom = null; renderRogue(); return;
    }
    const a = ROGUE.team.filter(x => x.cell === fromCell)[0];
    const b = ROGUE.team.filter(x => x.cell === toCell)[0];
    if (!a) { rogueMoveFrom = null; renderRogue(); return; }
    if (b) { a.cell = toCell; b.cell = fromCell; } else { a.cell = toCell; }
    rogueMoveFrom = null;
    renderRogue();
}
// 战斗前整备: 站位(3列×2行) + 背包装备分配 + 敌方预览 + 开战
function renderRoguePrep(phaseEl, body, actions) {
    const node = ROGUE_NODES[ROGUE.node];
    phaseEl.textContent = `${node.icon} ${node.name} · 整备（调整站位与装备后开战）`;
    let html = `<div class="rogue-prep"><div class="rogue-prep-left">
        <div class="rp-title">我方阵型站位（3 列 × 2 行）</div>
        <div class="rogue-note" style="text-align:left">点击队员卡片选中，再点目标格可移动/交换；也支持拖拽</div>
        <div class="rogue-grid">`;
    for (let cell = 0; cell < CONFIG.teams.cells; cell++) {
        const slot = ROGUE_SLOT_CELLS.indexOf(cell) + 1;
        const m = ROGUE.team.filter(x => x.cell === cell)[0];
        const selCls = (rogueMoveFrom === cell) ? ' selected' : '';
        if (m) {
            const h = HERO_DEFS[m.heroId];
            const eq = m.equipIds.filter(id => id !== 'none').map(id => (EQUIP_DEFS[id] ? EQUIP_DEFS[id].icon : '')).join('');
            html += `<div class="rg-cell filled${selCls}" data-cell="${cell}" draggable="true">
                <div class="rg-pos">${cellName(cell)} · ${slot}号位</div>
                <div class="rg-name">${h.emoji} ${h.name}</div>
                <div class="rg-eq">${eq || '—'}</div></div>`;
        } else {
            html += `<div class="rg-cell${selCls}" data-cell="${cell}">
                <div class="rg-pos">${cellName(cell)} · ${slot}号位</div>
                <div class="rg-empty">＋</div></div>`;
        }
    }
    html += `</div>${rogueEnemyPreviewHtml()}</div>`;
    html += `<div class="rogue-prep-right">
        <div class="rp-title">装备分配（每名队员最多 ${CONFIG.equip.points} 装备点：普通1 / 特殊0 / 稀有2）</div>
        <div class="rogue-team">`;
    rogueTeamOrder().forEach(m => {
        const i = ROGUE.team.indexOf(m);
        const h = HERO_DEFS[m.heroId];
        const st = rogueMemberStats(m);
        const slot = ROGUE_SLOT_CELLS.indexOf(m.cell) + 1;
        let selects = '';
        for (let s = 0; s < CONFIG.equip.slots; s++) {
            selects += `<select data-mi="${i}" data-slot="${s}">${rogueOptionHtml(m.equipIds[s], i, s, m.heroId)}</select>`;
        }
        const eqLines = m.equipIds.filter(id => id !== 'none').map(id => {
            const e = EQUIP_DEFS[id];
            if (!e) return '';
            return `<div class="rt-eq-line">${e.icon} <b>${e.name}</b>：${(e.statsText || []).slice(0, 2).join('；')}</div>`;
        }).join('');
        html += `<div class="rt-member">
            <div class="rt-head"><span class="rt-name">${h.emoji} ${h.name}</span><span class="rt-slot">${slot}号位</span></div>
            <div class="rt-stats">
                <span>❤️ 生命 ${st.maxHp}</span><span>⚔️ 攻击 ${st.atk}</span><span>⚡ 攻速 ${st.speed}</span>
                <span>🛡️ 护甲 ${st.armor}</span><span>🔮 魔抗 ${st.mr}</span>${st.hasMana ? `<span>💧 蓝量 ${st.maxMana}</span>` : ''}
            </div>
            <div class="rt-equips">${selects}</div>
            <div class="ru-txt" style="text-align:center">装备点 ${equipPointsUsed(m.equipIds)} / ${CONFIG.equip.points}</div>
            ${eqLines ? `<div class="rt-eq-lines">${eqLines}</div>` : ''}
        </div>`;
    });
    html += `</div>${rogueItemsPanelHtml()}${rogueBagHtml()}</div></div>`;
    body.innerHTML = html;

    body.querySelectorAll('.rg-cell[data-cell]').forEach(cellEl => {
        const cell = parseInt(cellEl.dataset.cell, 10);
        cellEl.addEventListener('click', () => rogueCellClick(cell));
        cellEl.addEventListener('dragstart', (e) => {
            rogueMoveFrom = cell;
            try { e.dataTransfer.setData('text/plain', String(cell)); } catch (err) { /* 兼容 */ }
            cellEl.classList.add('dragging');
        });
        cellEl.addEventListener('dragover', (e) => { e.preventDefault(); cellEl.classList.add('drop-target'); });
        cellEl.addEventListener('dragleave', () => cellEl.classList.remove('drop-target'));
        cellEl.addEventListener('drop', (e) => {
            e.preventDefault();
            cellEl.classList.remove('drop-target');
            rogueMoveUnit(rogueMoveFrom, cell);
        });
    });
    body.querySelectorAll('.rt-member select').forEach(sel => {
        sel.addEventListener('change', () => {
            const mi = parseInt(sel.dataset.mi, 10), slot = parseInt(sel.dataset.slot, 10);
            const val = sel.value, m = ROGUE.team[mi];
            const newEqs = m.equipIds.slice();
            newEqs[slot] = val;
            if (equipPointsUsed(newEqs) > CONFIG.equip.points) {
                rogueToast(`装备点不足：每名队员最多 ${CONFIG.equip.points} 点`); renderRogue(); return;
            }
            // v2.7 规则: 每人只能携带 1 件升级装备
            if (equipUpgradeCount(newEqs) > 1) {
                rogueToast('每人只能携带 1 件升级装备'); renderRogue(); return;
            }
            if (val !== 'none' && rogueBagRemain(val, mi, slot) <= 0) {
                rogueToast('背包中没有多余的该装备'); renderRogue(); return;
            }
            m.equipIds = newEqs;
            renderRogue();
        });
    });
    // v2.4: 整备界面勾选「本场使用」的一次性物品(开战自动生效并消耗)
    body.querySelectorAll('.ri-item input[data-item]').forEach(cb => {
        cb.addEventListener('change', () => {
            const id = cb.dataset.item;
            if (cb.checked) ROGUE.potionUse[id] = true; else delete ROGUE.potionUse[id];
            renderRogue();
        });
    });
    actions.appendChild(rogueBtn('▶ 开始战斗', () => rogueStartBattle()));
}
// ③ 战斗: 弹窗内独立小战场(敌我双方均为 3列×2行 = 前后排 6 站位, 与普通战斗一致)
function rogueUnitHtml(u) {
    const p = clamp((u.hp / u.maxHp) * 100, 0, 100);
    const colorCls = p < 25 ? ' critical' : p < 50 ? ' low' : '';
    const eq = u.equipIds.filter(id => id !== 'none').map(id => (EQUIP_DEFS[id] ? EQUIP_DEFS[id].icon : '')).join('');
    const slot = ROGUE_SLOT_CELLS.indexOf(u.cell) + 1;
    return `<div class="rogue-unit${u.hp <= 0 ? ' dead' : ''}">
        <div class="ru-head">${u.emoji} ${u.name}<span class="ru-pos">${slot}号位</span></div>
        <div class="ru-bar"><div class="ru-hp${colorCls}" style="width:${p}%"></div></div>
        <div class="ru-txt">HR ${round1(u.hp)}/${round1(u.maxHp)}　攻 ${round1(u.atk)}</div>
        <div class="ru-txt">AR ${round1(u.armor)}　MR ${round1(u.mr)}　速 ${(u.speed * (u.speedMul || 1)).toFixed(2)}</div>
        <div class="ru-eq">装备 ${eq || '—'}</div>
        <div class="ru-status">${buildStatusHtml(u)}</div>
    </div>`;
}
// 单侧战场(上下布局): A 队在下 / B 队在上, 双方「前排」都贴近中间那条线(面对面)
//  isBottomSide=true → 该侧在下方(A 队), 行序 前排→后排; false → 在上方(B 队), 行序 后排→前排
//  列序不镜像: 纵向对位时 1 列应正对 1 列
function rogueFieldHtml(units, isBottomSide) {
    const rows = isBottomSide ? [0, 1] : [1, 0];
    let html = '';
    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        html += `<div class="rf-row"><div class="rf-tag">${ROW_NAMES[row]}</div><div class="rf-cells">`;
        for (let col = 0; col < CONFIG.teams.cols; col++) {
            const cell = row * CONFIG.teams.cols + col;
            const u = units.filter(x => x.cell === cell)[0];
            html += u ? rogueUnitHtml(u)
                : `<div class="rogue-unit empty"><div class="ru-head">空位</div><div class="ru-txt">${cellName(cell)}</div></div>`;
        }
        html += `</div></div>`;
    }
    return html;
}
function rogueRenderBattle() {
    const aEl = $('rogueSideA'), bEl = $('rogueSideB');
    if (!aEl || !bEl || !rogueWorld) return;
    aEl.innerHTML = rogueFieldHtml(rogueWorld.A, true);
    bEl.innerHTML = rogueFieldHtml(rogueWorld.B, false);
    // 幸运精钢剑暴击可得金币 → 战斗中同步顶栏金币
    const goldEl = $('rogueGold');
    if (goldEl) goldEl.textContent = `💰 金币 ${ROGUE.gold}`;
    rogueRenderLog();
}
// 幸运精钢剑: 暴击 +1 金币(由引擎机制回调)
function rogueGainGold(n, name) {
    ROGUE.gold += n;
    const goldEl = $('rogueGold');
    if (goldEl) goldEl.textContent = `💰 金币 ${ROGUE.gold}`;
    if (rogueWorld) rogueWorld.addLog(`🍀 ${name || '幸运精钢剑'} 暴击 → 金币 +${n}（共 ${ROGUE.gold}）`, 'highlight');
}
if (typeof window !== 'undefined') window.rogueGainGold = rogueGainGold;
function rogueRenderLog() {
    const el = $('rogueLog');
    if (!el || !rogueWorld) return;
    const lines = rogueWorld.logLines;
    if (lines !== rogueLogRef) { el.innerHTML = ''; rogueLogRef = lines; rogueLogShown = 0; }
    while (el.children.length > lines.length) el.removeChild(el.firstChild);
    for (let i = rogueLogShown; i < lines.length; i++) {
        const d = document.createElement('div');
        if (lines[i].cls) d.className = lines[i].cls;
        d.innerHTML = lines[i].msg;
        el.appendChild(d);
    }
    rogueLogShown = lines.length;
    el.scrollTop = el.scrollHeight;
}
function renderRogueBattleView(phaseEl, body, actions) {
    const nd = ROGUE_NODES[ROGUE.node] || ROGUE_NODES[0];
    const bCount = rogueWorld ? rogueWorld.B.length : (ROGUE.enemies || []).length;
    phaseEl.textContent = `${nd.icon} ${nd.name} · 我方 ${ROGUE.team.length} 人  vs  敌方 ${bCount} 人`;
    body.innerHTML = `<div class="rogue-arena">
            <div class="rogue-fields">
                <div class="rof-block">
                    <div class="rof-head"><span>👹 敌方（B 队）· ${bCount} 人</span><span class="rof-sub">前排朝下 · 与下方对位</span></div>
                    <div class="rogue-side" id="rogueSideB"></div>
                </div>
                <div class="rof-mid">⚔️ 前后排 6 站位 · 谁先倒下 ⚔️</div>
                <div class="rof-block">
                    <div class="rof-head"><span>🛡️ 我方（A 队）· ${ROGUE.team.length} 人</span><span class="rof-sub">前排朝上 · 与上方对位</span></div>
                    <div class="rogue-side" id="rogueSideA"></div>
                </div>
            </div>
            <div class="rogue-log" id="rogueLog"></div>
        </div>`;
    rogueRenderBattle();
    if (rogueTimer) {
        actions.appendChild(rogueBtn('⏸ 暂停', () => { rogueStopTimer(); renderRogue(); }));
    } else {
        const started = rogueWorld && rogueWorld.battleTime > 0;
        actions.appendChild(rogueBtn(started ? '▶ 继续战斗' : '▶ 开始战斗', () => rogueRunTimer()));
    }
    actions.appendChild(rogueBtn('⏩ 立即结算', () => rogueFinishNow()));
    // v2.2: 战斗中也能直接调整站位与装备(暂停回整备, 不消耗生命)
    actions.appendChild(rogueBtn('⚙ 调整装备/站位', () => {
        rogueStopTimer();
        ROGUE.phase = 'prep';
        rogueToast('已暂停战斗：调整站位与装备后重新开战');
        renderRogue();
    }));
    [1, 2, 4].forEach(sp => {
        actions.appendChild(rogueBtn(sp + 'x', () => { rogueSpeed = sp; renderRogue(); }, rogueSpeed === sp ? 'active' : ''));
    });
}
function rogueTeamNames() {
    return rogueTeamOrder().map(m => HERO_DEFS[m.heroId].emoji + HERO_DEFS[m.heroId].name).join('、');
}
// 下一个空闲号位对应的站位格
function rogueFreeCell() {
    for (let i = 0; i < ROGUE_SLOT_CELLS.length; i++) {
        const c = ROGUE_SLOT_CELLS[i];
        if (!ROGUE.team.some(m => m.cell === c)) return c;
    }
    return null;
}
// 候选装备卡片(奖励 / 商店共用)
function rogueEquipCardHtml(id, extraCls, extraAttrs, tail) {
    const e = EQUIP_DEFS[id];
    return `<div class="rp-card${extraCls || ''}" ${extraAttrs || ''}>
        <div class="rp-emoji">${e.icon}</div><div class="rp-name">${e.name}</div>
        <div class="rp-sub">${e.statsText[0] || ''}</div>
        ${tail ? `<div class="rp-price">${tail}</div>` : ''}</div>`;
}
// ④ 战斗②奖励: 基础装备 4 选 1 → 英雄 2 选 1
function renderRogueRewardEquip(phaseEl, body, actions) {
    phaseEl.textContent = '⚔️ 战斗胜利！+10 金币 · 选择 1 件基础装备（4 选 1）';
    let html = `<div class="rogue-note">金币 💰 ${ROGUE.gold}　当前队伍：${rogueTeamNames()}</div><div class="rogue-pick">`;
    html += ROGUE.poolEquips.map(id => rogueEquipCardHtml(id,
        ROGUE.pickEquips.indexOf(id) >= 0 ? ' selected' : '', 'data-kind="equip" data-id="' + id + '"')).join('');
    html += `</div>${rogueBagHtml()}`;
    body.innerHTML = html;
    body.querySelectorAll('.rp-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id, i = ROGUE.pickEquips.indexOf(id);
            if (i >= 0) ROGUE.pickEquips.splice(i, 1);
            else if (ROGUE.pickEquips.length < 1) ROGUE.pickEquips.push(id);
            else { rogueToast('只能选择 1 件装备'); return; }
            renderRogue();
        });
    });
    const btn = rogueBtn('确定', () => {
        if (ROGUE.pickEquips.length !== 1) { rogueToast('请选择 1 件基础装备'); return; }
        rogueAddToBag(ROGUE.pickEquips[0]);
        ROGUE.pickEquips = [];
        const pool = HERO_LIST.filter(id => ROGUE.team.every(m => m.heroId !== id));
        ROGUE.poolHeroes = rogueSample(pool, 2);
        ROGUE.pickHeroes = [];
        ROGUE.phase = 'recruit';
        renderRogue();
    });
    btn.disabled = ROGUE.pickEquips.length !== 1;
    actions.appendChild(btn);
}
// ⑤ 招募: 英雄 2 选 1(凑满 3 人)
function renderRogueRecruit(phaseEl, body, actions) {
    phaseEl.textContent = '选择 1 名英雄加入队伍（2 选 1，凑满 3 人）';
    let html = `<div class="rogue-note">当前队伍：${rogueTeamNames()}</div><div class="rogue-pick">`;
    html += ROGUE.poolHeroes.map(id => {
        const h = HERO_DEFS[id];
        const on = ROGUE.pickHeroes.indexOf(id) >= 0;
        return `<div class="rp-card${on ? ' selected' : ''}" data-kind="hero" data-id="${id}">
            <div class="rp-emoji">${h.emoji}</div><div class="rp-name">${h.name}</div>
            <div class="rp-sub">HR ${h.maxHp}　攻 ${h.atk}　速 ${h.speed.toFixed(2)}</div></div>`;
    }).join('') + '</div>';
    body.innerHTML = html;
    body.querySelectorAll('.rp-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id, i = ROGUE.pickHeroes.indexOf(id);
            if (i >= 0) ROGUE.pickHeroes.splice(i, 1);
            else if (ROGUE.pickHeroes.length < 1) ROGUE.pickHeroes.push(id);
            else { rogueToast('只能选择 1 名英雄'); return; }
            renderRogue();
        });
    });
    const btn = rogueBtn('确定加入', () => {
        if (ROGUE.pickHeroes.length !== 1) { rogueToast('请选择 1 名英雄加入'); return; }
        const cell = rogueFreeCell();
        if (cell === null) { rogueToast('没有空余站位'); return; }
        ROGUE.team.push({ heroId: ROGUE.pickHeroes[0], equipIds: ['none', 'none', 'none'], cell });
        ROGUE.pickHeroes = [];
        rogueAdvance();
        renderRogue();
    });
    btn.disabled = ROGUE.pickHeroes.length !== 1;
    actions.appendChild(btn);
}
// ③ 战斗胜利奖励: 稀有装备 3 选 1（v2.4: 已移除赠送的恢复水晶）
function renderRogueRewardRare(phaseEl, body, actions) {
    phaseEl.textContent = '⚔️ 战斗胜利！+10 金币 · 选择 1 件稀有装备（3 选 1）';
    let html = `<div class="rogue-note">金币 💰 ${ROGUE.gold}　（此节点不再赠送恢复水晶）</div><div class="rogue-pick">`;
    html += ROGUE.poolEquips.map(id => rogueEquipCardHtml(id,
        ROGUE.pickEquips.indexOf(id) >= 0 ? ' selected' : '', 'data-kind="equip" data-id="' + id + '"')).join('');
    html += `</div>${rogueBagHtml()}`;
    body.innerHTML = html;
    body.querySelectorAll('.rp-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id, i = ROGUE.pickEquips.indexOf(id);
            if (i >= 0) ROGUE.pickEquips.splice(i, 1);
            else if (ROGUE.pickEquips.length < 1) ROGUE.pickEquips.push(id);
            else { rogueToast('只能选择 1 件装备'); return; }
            renderRogue();
        });
    });
    const btn = rogueBtn('确定', () => {
        if (ROGUE.pickEquips.length !== 1) { rogueToast('请选择 1 件稀有装备'); return; }
        rogueAddToBag(ROGUE.pickEquips[0]);
        ROGUE.pickEquips = [];
        rogueAdvance();
        renderRogue();
    });
    btn.disabled = ROGUE.pickEquips.length !== 1;
    actions.appendChild(btn);
}
// ⑥ 装备升级点(v2.2): 每次 10 金, 把 1 件基础装备升级为对应升级装备(仅限 5 件)
function rogueUpgradeList() {
    const out = [];
    Object.keys(ROGUE.bag).forEach(id => {
        const to = equipUpgradeTarget(id);
        if (!to) return;
        const total = ROGUE.bag[id] || 0;
        const used = rogueEquippedCount(id);
        out.push({ id, to, total, used, free: total - used });
    });
    return out;
}
// 升级一件: 优先升级背包中闲置的一件; 若全部已装备, 则把队员身上的直接升级
function rogueUpgradeOne(id) {
    const to = equipUpgradeTarget(id);
    if (!to || (ROGUE.bag[id] || 0) <= 0) return false;
    const takeFromBag = (ROGUE.bag[id] || 0) - rogueEquippedCount(id) > 0;
    if (!takeFromBag) {
        let done = false;
        for (let mi = 0; mi < ROGUE.team.length && !done; mi++) {
            const m = ROGUE.team[mi];
            const si = m.equipIds.indexOf(id);
            if (si < 0) continue;
            // v2.7 规则: 每人只能携带 1 件升级装备 → 该队员已带其它升级装备时不能就地升级
            const hasOtherUpgrade = m.equipIds.some((eq, j) => j !== si && EQUIP_UPGRADED_LIST.indexOf(eq) >= 0);
            if (hasOtherUpgrade) continue;
            const eqs = m.equipIds.slice();
            eqs[si] = to;
            m.equipIds = eqs;
            done = true;
        }
        if (!done) return false;
    }
    ROGUE.bag[id] -= 1;
    if (ROGUE.bag[id] <= 0) delete ROGUE.bag[id];
    rogueAddToBag(to);
    return true;
}
function renderRogueUpgrade(phaseEl, body, actions) {
    phaseEl.textContent = `🔧 装备升级点 · 每次升级消耗 ${EQUIP_UPGRADE_COST} 金币（仅限 5 件指定基础装备）`;
    const list = rogueUpgradeList();
    let html = `<div class="rogue-note">金币 💰 ${ROGUE.gold}　此节点没有战斗，可直接通过　（下一站：🔥 精英战·原队伍1）</div>`;
    if (!list.length) {
        html += `<div class="rb-empty">背包里没有可升级的装备（流星锤 / 急速弓 / 精钢剑 / 专业法杖）</div>`;
    } else {
        html += `<div class="rogue-pick">`;
        list.forEach(it => {
            const e = EQUIP_DEFS[it.id], u = EQUIP_DEFS[it.to];
            const can = ROGUE.gold >= EQUIP_UPGRADE_COST;
            html += `<div class="rp-card up-card${can ? '' : ' sold'}" data-up="${it.id}">
                <div class="rp-emoji">${e.icon} → ${u.icon}</div>
                <div class="rp-name">${e.name} → ${u.name}</div>
                <div class="rp-sub">${u.statsText.slice(0, 2).join('　')}</div>
                <div class="rp-sub" style="opacity:.85">持有 ${it.total} 件（已装备 ${it.used} / 闲置 ${it.free}）</div>
                <div class="rp-price">${can ? '🔧 升级 ' + EQUIP_UPGRADE_COST + ' 金' : '金币不足'}</div></div>`;
        });
        html += `</div>`;
    }
    html += rogueBagHtml();
    body.innerHTML = html;
    body.querySelectorAll('.rp-card[data-up]').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.up;
            if (ROGUE.gold < EQUIP_UPGRADE_COST) { rogueToast(`金币不足（需要 ${EQUIP_UPGRADE_COST} 金）`); return; }
            if (!rogueUpgradeOne(id)) { rogueToast('没有可升级的该装备'); return; }
            ROGUE.gold -= EQUIP_UPGRADE_COST;
            rogueToast(`${EQUIP_DEFS[id].name} → ${EQUIP_DEFS[equipUpgradeTarget(id)].name}（-${EQUIP_UPGRADE_COST} 金）`);
            renderRogue();
        });
    });
    actions.appendChild(rogueBtn('⚙ 整备（分配升级装备）', () => { ROGUE.phase = 'prep'; renderRogue(); }));
    actions.appendChild(rogueBtn('🔥 直接通过，前往精英战（无战斗）', () => { rogueAdvance(); renderRogue(); }));
}
// ⑦ 商店节点: 随机 5 件基础装备(10 金) + 2 件稀有装备(20 金)
function renderRogueShop(phaseEl, body, actions) {
    const shop = ROGUE.shop;
    if (!shop) { rogueAdvance(); renderRogue(); return; }
    phaseEl.textContent = `🏪 商店 · 买：基础 10 / 稀有 20 / 药剂 ${ROGUE_SHOP.itemPrice} 金　·　卖：普通 6 / 稀有 12 金`;
    let html = `<div class="rogue-note">金币 💰 ${ROGUE.gold}　（下一站：🔧 装备升级点 · 无战斗可直接通过）</div>`;
    html += `<div class="rp-title">基础装备（10 金）</div><div class="rogue-pick">`;
    html += shop.basics.map((it, i) => rogueEquipCardHtml(it.id,
        it.sold ? ' sold' : '', `data-shop="basic" data-idx="${i}"`, it.sold ? '已售出' : '💰 ' + it.price)).join('');
    html += `</div><div class="rp-title" style="margin-top:10px">稀有装备（20 金）</div><div class="rogue-pick">`;
    html += shop.rares.map((it, i) => rogueEquipCardHtml(it.id,
        it.sold ? ' sold' : '', `data-shop="rare" data-idx="${i}"`, it.sold ? '已售出' : '💰 ' + it.price)).join('');
    html += `</div>`;
    // v2.4: 一次性物品(守护药剂 / 攻击药剂) —— 战斗前在整备界面勾选使用
    html += `<div class="rp-title" style="margin-top:10px">🧪 一次性物品（${ROGUE_SHOP.itemPrice} 金 · 整备界面勾选，开战自动生效并消耗）</div><div class="rogue-pick">`;
    html += ROGUE_SHOP.items.map(id => {
        const it = ROGUE_ITEMS[id];
        const own = ROGUE.items[id] || 0;
        return `<div class="rp-card item-card" data-item="${id}">
            <div class="rp-emoji">${it.icon}</div><div class="rp-name">${it.name}</div>
            <div class="rp-sub">${it.desc}</div>
            <div class="rp-price">💰 ${ROGUE_SHOP.itemPrice}${own > 0 ? `（已持有 ${own}）` : ''}</div></div>`;
    }).join('');
    html += `</div>${rogueBagHtml(true)}`;
    body.innerHTML = html;
    body.querySelectorAll('.rp-card[data-shop]').forEach(card => {
        card.addEventListener('click', () => {
            const kind = card.dataset.shop, idx = parseInt(card.dataset.idx, 10);
            const it = (kind === 'basic' ? shop.basics : shop.rares)[idx];
            if (!it || it.sold) return;
            if (ROGUE.gold < it.price) { rogueToast('金币不足'); return; }
            ROGUE.gold -= it.price;
            it.sold = true;
            rogueAddToBag(it.id);
            renderRogue();
        });
    });
    // v2.4: 购买一次性物品(可重复购买, 开战时消耗)
    body.querySelectorAll('.rp-card[data-item]').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.item;
            if (ROGUE.gold < ROGUE_SHOP.itemPrice) { rogueToast(`金币不足（需要 ${ROGUE_SHOP.itemPrice} 金）`); return; }
            ROGUE.gold -= ROGUE_SHOP.itemPrice;
            ROGUE.items[id] = (ROGUE.items[id] || 0) + 1;
            rogueToast(`购买 ${ROGUE_ITEMS[id].name} ×1（-${ROGUE_SHOP.itemPrice} 金，共 ${ROGUE.items[id]} 个）`, true);
            renderRogue();
        });
    });
    // v2.3: 卖装备(普通 6 金 / 稀有 12 金) —— 只能卖背包里闲置的那一份
    body.querySelectorAll('.rb-sell[data-sell]').forEach(btn => {
        btn.addEventListener('click', ev => {
            ev.stopPropagation();
            if (rogueSellEquip(btn.dataset.sell)) renderRogue();
        });
    });
    actions.appendChild(rogueBtn('离开商店，前往装备升级点', () => { rogueAdvance(); renderRogue(); }));
}
// ⑥ 失败: 扣 1 点生命后回到整备重试
function renderRogueDefeat(phaseEl, body, actions) {
    const nd = ROGUE_NODES[ROGUE.node] || ROGUE_NODES[0];
    phaseEl.textContent = `💔 ${nd.icon} ${nd.name} 失败！剩余生命 ${ROGUE.lives}`;
    body.innerHTML = `<div class="rogue-end">💔 战斗失利<span class="re-sub">生命 -1（剩余 ${ROGUE.lives}）</span>
        <span class="re-sub">可回到整备界面调整站位与装备后重试本节点</span></div>`;
    actions.appendChild(rogueBtn('回到整备', () => { ROGUE.phase = 'prep'; renderRogue(); }));
}
// ⑧ 结束: 通关 / 失败
function renderRogueEnd(phaseEl, body, actions) {
    const win = ROGUE.result === 'win';
    const lv = ROGUE.difficulty, next = lv + 1;
    phaseEl.textContent = `${win ? '🎉 远征成功' : '💀 远征失败'} · ${rogueLevelName(ROGUE.level)} 难度${lv}`;
    const nd = ROGUE_NODES[ROGUE.node] || ROGUE_NODES[0];
    // v2.9: 通关 → 展示本关/本难度通关与下一档难度解锁情况
    const diffLine = win
        ? `已通关 <b>${rogueLevelName(ROGUE.level)} 难度${lv}</b>　🏅 本关已通关：<b>难度${rogueLevelCleared(ROGUE.level)}</b>${next <= ROGUE_MAX_DIFFICULTY ? `　已解锁 <b>${rogueLevelName(ROGUE.level)} 难度${next}</b>` : `　（${rogueLevelName(ROGUE.level)} 已是最高难度）`}`
        : `本局：<b>${rogueLevelName(ROGUE.level)} · 难度${lv}</b>　🏅 本关已通关：${rogueLevelCleared(ROGUE.level) > 0 ? '难度' + rogueLevelCleared(ROGUE.level) : '无'}`;
    body.innerHTML = `<div class="rogue-end">${win ? `🎉 恭喜通关全部 ${ROGUE_NODES.length} 个节点！` : '💀 生命耗尽，远征结束'}
        <span class="re-sub">${win ? '你带领小队击败了 BOSS 大魔法师 👑' : `止步于 ${nd.icon} ${nd.name}`}</span></div>
        <div class="rogue-note">${diffLine}</div>
        <div class="rogue-note">队伍：${rogueTeamNames()}　背包 ${rogueBagTotal()} 件装备　剩余金币 💰 ${ROGUE.gold}</div>`;
    actions.appendChild(rogueBtn('重新开始远征', () => {
        rogueReset(); rogueInitProgress();               // v2.9: 结束 → 回到关卡选择层(此时已解锁下一档)
        ROGUE.phase = 'entry'; ROGUE.layerSelect = true;
        renderRogue();
    }));
}

// ============================================================
//  远征入口事件绑定(原本写在 game.js 的 init() 内)
// ============================================================
function installRogueUI() {
    // ---- 远征挑战(肉鸽模式 v2.0) ----
    const rogueModal = $('rogueModal');
    rogueInitProgress();                           // v2.8: 读取本地存档(最高已通关档位)
    $('rogueOpenBtn').addEventListener('click', () => {
        rogueStopTimer();
        if (ROGUE.result) rogueReset();
        if (!rogueRunExists()) {                   // 没有进行中的局 → 刷新解锁进度, 滚轮停在「下一档挑战」
            if (!ROGUE.phase) ROGUE.phase = 'entry';
            rogueInitProgress();
        }
        ROGUE.layerSelect = true;                  // v2.9: 每次进入远征都先到「关卡选择层」
        rogueModal.style.display = 'flex';         // 先显示弹窗再渲染: 难度滚轮需要真实尺寸才能居中对齐
        renderRogue();
    });
    // 站位拖拽取消时清除选中态
    document.addEventListener('dragend', () => {
        if (rogueMoveFrom !== null) { rogueMoveFrom = null; if (ROGUE.phase === 'prep') renderRogue(); }
    });
    $('rogueCloseBtn').addEventListener('click', () => { rogueStopTimer(); rogueModal.style.display = 'none'; });
    rogueModal.addEventListener('click', (e) => {
        if (e.target === rogueModal) { rogueStopTimer(); rogueModal.style.display = 'none'; }
    });
    // 控制台调试入口(与 window._duel 同约定): window._rogue.state / .world() / .finishNow()
    window._rogue = { state: ROGUE, world: () => rogueWorld, finishNow: rogueFinishNow, nodes: ROGUE_NODES, enterNode: rogueEnterNode, render: renderRogue, step: rogueStep,
        levels: ROGUE_LEVELS, difficulties: ROGUE_DIFFICULTIES, startRun: rogueStartRun, markCleared: rogueMarkCleared, saveKey: ROGUE_SAVE_KEY,
        selectLevel: rogueSelectLevel, toSelectLayer: () => { ROGUE.layerSelect = true; renderRogue(); } };
}

// ============================================================
//  对外暴露
// ============================================================
window.GameRogue = {
    install(deps) {
        $ = deps.$;
        CHALLENGE_TEAMS = deps.CHALLENGE_TEAMS;
        buildStatusHtml = deps.buildStatusHtml;
    },
    installRogueUI: installRogueUI,
    getWorld: () => rogueWorld,
    // 上面两处都用 let 声明、会被重新赋值的引用以取值函数暴露,避免拿到过期快照
    renderRogue: renderRogue,
    rogueReset: rogueReset,
    rogueStopTimer: rogueStopTimer,
    rogueFinishNow: rogueFinishNow,
    rogueStep: rogueStep,
    rogueEnterNode: rogueEnterNode,
    ROGUE: ROGUE,
    ROGUE_NODES: ROGUE_NODES,
    ROGUE_LEVELS: ROGUE_LEVELS,
    ROGUE_DIFFICULTIES: ROGUE_DIFFICULTIES,
    rogueStartRun: rogueStartRun,
    rogueMarkCleared: rogueMarkCleared
};
})();
