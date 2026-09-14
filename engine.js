// ============================================================
//  ③ 引擎层(由 game.js 拆分,内容逐行一致,行为零变化)
//    - 纯逻辑: 世界/单位构建, 战斗推进 tick, 伤害结算, 目标选择, 工具函数
//    - 不触碰 DOM;Node 下可直接 require('./engine.js') 用于对拍/模拟
//    - 依赖数据文件: config.js → heroes.js → equips.js → talents.js → mechanics.js
// ============================================================
'use strict';

// ---- Node 兼容层 ----
//  浏览器中: 数据文件由 <script> 顺序引入,其顶层 const 位于全局词法作用域,可直接引用;
//  Node(require) 中: 每个文件是独立模块作用域,外移的数据对 game.js 不可见,
//  故在此把数据模块的属性挂到 globalThis,使 require('./game.js') 与原单文件行为一致。
if (typeof module !== 'undefined' && module.exports) {
    ['./config.js', './heroes.js', './equips.js', './talents.js', './mechanics.js'].forEach(function (rel) {
        const mod = require(rel);
        Object.keys(mod).forEach(function (k) { globalThis[k] = mod[k]; });
    });
}

// ① 配置常量 CONFIG —— 已外移至 config.js


// ============================================================
//  ② 数据层
// ============================================================

// 稀有装备(太阳圣盾、守护斗篷、玉面刃)——原「特殊装备」更名, 占用 2 装备点
const RARE_EQUIPS = ['sunshield', 'cloak', 'jade_blade'];

// 荆棘之甲反伤递归保护: 反弹产生的伤害不再触发反伤(深度计数, 支持多人互弹)
let reflectGuard = 0;

// ② 英雄数据 HERO_DEFS —— 已外移至 heroes.js


// ② 装备数据 EQUIP_DEFS —— 已外移至 equips.js


// ② 机制注册表 MECHANICS —— 已外移至 mechanics.js


// ---- v2.5 辅助: 星落单次轰击(随机命中 1 个存活敌人, 0.6×攻击力 魔法伤害; 该目标首次被命中额外眩晕 0.5s) ----
function starfallPulse(unit, world, cfg) {
    const enemies = world[enemyTeamKey(unit.teamKey)];
    const alive = [];
    for (let i = 0; i < enemies.length; i++) if (isAlive(enemies[i])) alive.push(enemies[i]);
    if (!alive.length) return;
    const t = alive[Math.floor(world.rng() * alive.length) % alive.length];
    const adRatio = (typeof unit.starfallAdRatio === 'number') ? unit.starfallAdRatio : cfg.adRatio;
    const dmgMult = 1 - getDefense(t, 'magical') / 100;
    let dmg = Math.max(0.1, round1(unit.atk * adRatio * dmgMult));
    // v2.9 星陨: 星落可暴击,暴伤吃 critMulti
    let crit = false;
    if (unit.starfallCanCrit) {
        if (world.rng() < (unit.critRate || 0) / 100) {
            crit = true;
            dmg = round1(dmg * (unit.critMulti || 2.0));
            unit.stats.crits++;
        }
    }
    // v2.7: 同一次技能的事件标记 —— 若伤害被黑暗护盾抵消, 附带的眩晕也由同一层护盾抵消
    const ev = newShieldEvent();
    applyDamageTo(world, t, dmg, unit, { skill: true, event: ev });
    unit.stats.dmgDealt += dmg;
    let msg = `🌠 星落命中 ${t.name}：${dmgSpan(dmg, 'magical')}${crit ? ' 暴击' : ''} 魔法伤害`;
    if (!t.starfallHitFlag) {
        t.starfallHitFlag = true;
        if (!applyStunTo(world, t, cfg.stunSec, { label: '星落眩晕', event: ev })) {
            msg += `，首次命中额外眩晕 ${cfg.stunSec}s`;
        }
    }
    world.addLog(msg, crit ? 'highlight' : '');
    if (t.hp <= 0) handleDeath(world, t, unit);
}
// ---- v2.5 辅助: 取敌方「攻击力最高」的存活单位(猎网用; 攻击力相同时取站位靠前者) ----
function pickStrongestEnemy(world, unit) {
    const enemies = world[enemyTeamKey(unit.teamKey)];
    let best = null;
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!isAlive(e)) continue;
        if (!best || e.atk > best.atk) best = e;
    }
    return best;
}
// ---- v2.5 辅助: 长枪手「独守阵线」判定(位于后排 row=1, 且己方前排 row=0 已无存活单位) ----
function lancerAlone(unit, world) {
    if (!world || unit.row !== 1) return false;
    const allies = world[unit.teamKey];
    for (let i = 0; i < allies.length; i++) {
        const a = allies[i];
        if (a !== unit && a.row === 0 && isAlive(a)) return false;
    }
    return true;
}
// ---- v2.7 长枪手 · 独守阵线「动态数值」: 条件生效/失效时把 +20 攻击力真正加减到面板上 ----
//   进入生效: 攻击力 +20 并立即刷新画面; 失去条件: 扣回 20
function updateLancerAlone(unit, world) {
    if (!hasMech(unit, 'lancerStrike')) return;
    const alone = (unit.hp > 0) && lancerAlone(unit, world);
    if (alone === !!unit._lancerAlone) return;
    unit._lancerAlone = alone;
    unit.lancerAloneActive = alone;
    if (alone) unit.atk = round1(unit.atk + CONFIG.lancer.rowAtkBonus);
    else unit.atk = round1(Math.max(0, unit.atk - CONFIG.lancer.rowAtkBonus));
    world.uiDirty = true;
    world.addLog(`🪖 ${unit.name} 独守阵线${alone ? '生效' : '失效'}：攻击力 ${alone ? '+' : '-'}${CONFIG.lancer.rowAtkBonus}（当前 ${unit.atk}）`, 'highlight');
}
// ---- v2.7 法师 · 法术爆发结算(吟唱 0.5s 结束后触发) ----
function castMageBurst(world, unit) {
    const defender = pickTarget(world, unit);
    unit.mana = 0;
    applyManaRefund(world, unit);
    notifySkillCast(unit, world);
    if (!defender || defender.hp <= 0) return;
    const defPct = getDefense(defender, 'magical');
    // 法术爆发为法师自身技能伤害,吃 SP(applyEquips 不再预乘,统一在此刻折算)
    let dmg = unit.skillDmg * spOf(unit) * (1 - defPct / 100);
    dmg = Math.max(0.1, round1(dmg));
    const ev = newShieldEvent();
    applyDamageTo(world, defender, dmg, unit, { skill: true, event: ev });
    world.round++;
    world.addLog(`🔮 ${unit.name} 释放法术爆发！造成 ${dmgSpan(dmg, 'magical')} 魔法伤害`, 'highlight');
    unit.stats.dmgDealt += dmg;
    if (defender.hp <= 0) handleDeath(world, defender, unit);
}
// ---- v2.5 长枪手 · 三连突刺: 对敌方「同列」所有存活单位各造成 3 连击(物理伤害, 各自结算护甲) ----
function castLancerTripleStrike(world, unit) {
    const cfg = CONFIG.lancer;
    // v2.7: 独守阵线的 +20 攻击力已由 updateLancerAlone 实时加到 unit.atk 上(面板同屏显示),此处不再重复叠加
    const alone = lancerAlone(unit, world);
    const pen = alone ? cfg.armorPen : 0;
    const enemies = world[enemyTeamKey(unit.teamKey)];
    const targets = [];
    for (let i = 0; i < enemies.length; i++) {
        if (isAlive(enemies[i]) && enemies[i].col === unit.col) targets.push(enemies[i]);
    }
    notifySkillCast(unit, world);
    if (!targets.length) {
        world.addLog(`🔱 ${unit.name} 三连突刺落空（敌方同列没有单位）`, '');
        return;
    }
    let grand = 0;
    for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        let sum = 0, times = 0;
        for (let h = 0; h < cfg.hits; h++) {
            if (!isAlive(t)) break;
            const def = Math.max(0, getDefense(t, 'physical') - pen);
            const dmg = Math.max(0.1, round1(unit.atk * (1 - def / 100)));
            applyDamageTo(world, t, dmg, unit, { skill: true });
            unit.stats.dmgDealt += dmg;
            world.round++;
            sum += dmg;
            times++;
            if (t.hp <= 0) break;
        }
        grand += sum;
        world.addLog(`🔱 ${unit.name} 三连突刺命中 ${t.name} ${times} 次：${dmgSpan(round1(sum), 'physical')} 物理伤害`, 'highlight');
        if (t.hp <= 0) {
            handleDeath(world, t, unit);
            if (world.winner) return;
        }
    }
    world.addLog(`🔱 ${unit.name} 三连突刺！同列 ${targets.length} 个目标共 ${dmgSpan(round1(grand), 'physical')} 物理伤害`, 'highlight');
}
// ---- v2.5 BOSS 幽魂 · 撕裂之魂: 随机命中 2 个敌方单位(魔法伤害, 走普攻触发管线但无暴击/吸血) ----
function performGhostAttack(world, unit) {
    const enemies = world[enemyTeamKey(unit.teamKey)];
    const pool = [];
    for (let i = 0; i < enemies.length; i++) if (isAlive(enemies[i])) pool.push(enemies[i]);
    if (!pool.length) return false;
    const n = Math.min(CONFIG.ghost.atkTargets, pool.length);
    const picks = [];
    for (let i = 0; i < n; i++) {
        const idx = Math.floor(world.rng() * pool.length) % pool.length;
        picks.push(pool.splice(idx, 1)[0]);          // 同一次攻击不重复命中同一单位
    }
    world.round++;
    unit.atkCount = (unit.atkCount || 0) + 1;
    unit.stats.attacks = (unit.stats.attacks || 0) + 1;
    let total = 0;
    const names = [];
    for (let i = 0; i < picks.length; i++) {
        const t = picks[i];
        if (!isAlive(t)) continue;
        const dmg = Math.max(0.1, round1(unit.atk * (1 - getDefense(t, 'magical') / 100)));
        applyDamageTo(world, t, dmg, unit);
        unit.stats.dmgDealt += dmg;
        total += dmg;
        names.push(t.name);
        if (t.hp <= 0) {
            handleDeath(world, t, unit);
            if (world.winner) return true;
        }
    }
    world.addLog(`👻 ${unit.name} 撕裂之魂：随机撕咬 ${names.join('、')}，共 ${dmgSpan(round1(total), 'magical')} 魔法伤害（${picks.length} 目标）`, '');
    return true;
}

// ---- 机制分发辅助: 按单位身上注册的机制列表依次调用钩子 ----
function hasMech(unit, id) {
    return unit.mechanics.indexOf(id) >= 0;
}
function fireMechs(unit, hook, ...args) {
    const list = unit.mechanics;
    for (let i = 0; i < list.length; i++) {
        const m = MECHANICS[list[i]];
        if (m && typeof m[hook] === 'function') m[hook](unit, ...args);
    }
}
function mechTick(unit, id, world, dt, opts) {
    if (hasMech(unit, id)) {
        const m = MECHANICS[id];
        if (m && typeof m.onTick === 'function') m.onTick(unit, world, dt, opts);
    }
}

// ============================================================
//  ③ 引擎层(纯逻辑,无 DOM)
// ============================================================
function round1(v) { return Math.round(v * 10) / 10; }
// v2.5: 攻速保留两位小数(UI 本就按两位小数展示; 例: 幽魂/精灵 0.75 若用 round1 会被错误抬到 0.8)
function round2(v) { return Math.round(v * 100) / 100; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function getDefense(unit, atkType) { return (atkType === 'physical') ? unit.armor : unit.mr; }
// ---- 攻速倍率统一计算: 各类减速叠乘,互不覆盖 ----
//  历史问题: 猎网(-20%)与寒冰印记(-10%)各自直接写 speedMul,后写入者会抹掉先前的减速;
//  冻结时直接写 speedMul = 1 更会把仍在生效的猎网一并解除。故此所有减速只允许记状态,由本函数换算。
function recalcSpeedMul(unit) {
    let mul = 1;
    if (unit.netSlowTimer > 0) mul *= (1 - CONFIG.hunterNet.speedDownPct);
    if ((unit.frostStacks || 0) > 0) mul *= (1 - CONFIG.frostMark.speedDownPct);
    unit.speedMul = round2(mul);
    return unit.speedMul;
}
// ---- 战斗日志伤害配色(v4.7): 物理=红色 / 真实=白色加粗 / 魔法=蓝色 ----
function dmgClass(kind) {
    return kind === 'true' ? 'dmg-true' : (kind === 'magical' ? 'dmg-magic' : 'dmg-physical');
}
function dmgSpan(value, kind) {
    return `<span class="${dmgClass(kind)}">${value}</span>`;
}
// 由攻击上下文推断本次伤害类型(true=真实 / magical=魔法 / 其余=物理)
function hitKind(ctx) {
    if (ctx.isSpear) return 'true';
    return ctx.atkType === 'magical' ? 'magical' : 'physical';
}
// ---- SP(技能强度): 装备提供(专业法杖/迅捷法杖/星星魔法杖…),作用于英雄自身固定数值技能伤害/回复 ----
function spOf(unit) { return 1 + (unit.sp || 0) / 100; }
// 重伤: 目标身上存在诅咒时,其一切回复(吸血/技能回复/装备回复/触发回复)减半
function isHealReduced(unit) { return !!(unit && unit.curse); }
function applyHealReduction(unit, amount) {
    return isHealReduced(unit) ? round1(amount * CONFIG.curse.healReduce) : round1(amount);
}

// ---- 队伍相关工具 ----
const TEAM_KEYS = ['A', 'B'];
function enemyTeamKey(teamKey) { return teamKey === 'A' ? 'B' : 'A'; }
function isAlive(unit) { return !!unit && unit.hp > 0; }
function aliveCount(world, teamKey) {
    let n = 0;
    for (let i = 0; i < world[teamKey].length; i++) if (world[teamKey][i].hp > 0) n++;
    return n;
}
// 队伍名字颜色(A 蓝 / B 红): 日志中区分不同队伍的同名角色
function tn(unit) {
    const c = unit.teamKey === 'A' ? '#7ec8ff' : '#ff9b9b';
    return `<span style="color:${c};font-weight:bold;">${unit.emoji}${unit.name}</span>`;
}
// 单位展示名(带队伍颜色)
function unitLabel(unit) { return tn(unit); }

// ---- 阵型站位(3 列 × 2 行 = 6 格;cell = row * cols + col) ----
//  cell 0,1,2 = 前排 1/2/3 列;cell 3,4,5 = 后排 1/2/3 列
const ROW_NAMES = ['前排', '后排'];
function cellRow(cell) { return Math.floor(cell / CONFIG.teams.cols); }   // 0 = 前排, 1 = 后排
function cellCol(cell) { return cell % CONFIG.teams.cols; }               // 0..2 列索引
function cellName(cell) { return `${ROW_NAMES[cellRow(cell)]}${cellCol(cell) + 1}列`; }
function isFrontRow(cell) { return cellRow(cell) === 0; }
// 自动布阵时的优先顺序: 前中 → 前左 → 前右 → 后中 → 后左 → 后右(延续「1号位居中」语义)
const DEFAULT_CELL_ORDER = [1, 0, 2, 4, 3, 5];
function isValidCell(cell) { return typeof cell === 'number' && cell >= 0 && cell < CONFIG.teams.cells; }

// ---- 目标选取(引擎层唯一取敌入口) ----
//  规则(全程确定性,不引入随机):
//   1) 逐列守卫: 后排单位仅在「同列前排已阵亡或该列无前排」时可选;
//      前排是否存活按列独立判定,而非全队判定
//   2) 对位: 在满足 1) 的候选集中,优先选择与攻击方「同列」的敌人
//   3) 顺延: 同列无候选 → 按列距离由近及远扫描,距离相同时取列索引小者

// 指定列是否仍有存活的前排单位(逐列守卫的判定依据)
function columnFrontAlive(enemies, col) {
    for (let i = 0; i < enemies.length; i++) {
        const u = enemies[i];
        if (u.col === col && u.row === 0 && isAlive(u)) return true;
    }
    return false;
}

function pickTarget(world, attacker) {
    const enemies = world[enemyTeamKey(attacker.teamKey)];
    // 0) 枪手 · 弱点锁定: 换弹完成后锁定「当前生命值最低」的存活敌人(无视前排优先),弹匣打空前不换目标
    if (hasMech(attacker, 'revolver')) {
        if (attacker.reloading) return null;           // 换弹期间无法攻击
        let lock = attacker.lockedTarget;
        if (!lock || !isAlive(lock)) {
            lock = null;
            for (let i = 0; i < enemies.length; i++) {
                const u = enemies[i];
                if (!isAlive(u)) continue;
                if (!lock || u.hp < lock.hp) lock = u;
            }
            attacker.lockedTarget = lock;
        }
        return lock;
    }
    // 0.2) 魔剑士 · 星落(v2.5): 星落期间攻击模式被星落替代, 不再进行普通攻击
    if (attacker.starfallTimer > 0) return null;
    // 0.5) Boss(大熊/大魔法师/幽魂): 普通攻击随机选取存活敌人(使用 world.rng,固定种子下可复现)
    if (hasMech(attacker, 'bossBear') || hasMech(attacker, 'archmage') || hasMech(attacker, 'ghost')) {
        const alive = enemies.filter(u => isAlive(u));
        if (alive.length === 0) return null;
        return alive[Math.floor(world.rng() * alive.length) % alive.length];
    }
    // 0.7) 刺客: 无视前排守卫,只要存在存活后排就优先后排(与自身站位无关);
    //      后排全部阵亡后才落入普通规则(对位/顺位)选择
    if (hasMech(attacker, 'assassinate')) {
        const backs = [];
        for (let i = 0; i < enemies.length; i++) {
            const u = enemies[i];
            if (isAlive(u) && u.row === 1) backs.push(u);
        }
        if (backs.length > 0) {
            for (let i = 0; i < backs.length; i++) if (backs[i].col === attacker.col) return backs[i];
            let best = backs[0];
            for (let i = 1; i < backs.length; i++) {
                const u = backs[i];
                const du = Math.abs(u.col - attacker.col), db = Math.abs(best.col - attacker.col);
                if (du < db || (du === db && u.col < best.col)) best = u;
            }
            return best;
        }
    }
    // 0.8) v2.6 BOSS黑暗游侠: 按对位规则锁定一名敌人, 只有将其击败后才会转而攻击下一个单位
    if (hasMech(attacker, 'darkRanger')) {
        const lock = attacker.lockedTarget;
        if (lock && isAlive(lock)) return lock;
        attacker.lockedTarget = pickStandardTarget(enemies, attacker);
        return attacker.lockedTarget;
    }
    return pickStandardTarget(enemies, attacker);
}

// ---- 常规目标选取(逐列守卫 → 同列对位 → 顺延; 全程确定性,不引入随机) ----
function pickStandardTarget(enemies, attacker) {
    // 1) 逐列守卫: 后排单位仅在同列前排已阵亡(或该列无前排)时可选
    const pool = [];
    for (let i = 0; i < enemies.length; i++) {
        const u = enemies[i];
        if (!isAlive(u)) continue;
        if (u.row === 0 || !columnFrontAlive(enemies, u.col)) pool.push(u);
    }
    if (pool.length === 0) return null;
    // 2) 同列对位优先
    for (let i = 0; i < pool.length; i++) if (pool[i].col === attacker.col) return pool[i];
    // 3) 顺延: 列距离升序,同距离取列索引小者
    let best = pool[0];
    for (let i = 1; i < pool.length; i++) {
        const u = pool[i];
        const du = Math.abs(u.col - attacker.col);
        const db = Math.abs(best.col - attacker.col);
        if (du < db || (du === db && u.col < best.col)) best = u;
    }
    return best;
}

// ---- 装备容量(v4.7): 每角色 2 装备点;普通占 1 点 / 特殊占 0 点 / 稀有占 2 点;不限制相同装备 ----
function equipCost(id) {
    const e = EQUIP_DEFS[id];
    if (!e) return 0;
    // 注意: 不可用 `e.cost || 1` —— none 的 cost 为 0,会被误判为 1
    return (typeof e.cost === 'number') ? e.cost : 1;
}
function equipPointsUsed(ids) {
    let p = 0;
    for (let i = 0; i < ids.length; i++) p += equipCost(ids[i]);
    return p;
}
// ---- v2.7 新增规则: 每个人只能携带 1 件升级装备 ----
function equipUpgradeCount(ids) {
    let n = 0;
    for (let i = 0; i < ids.length; i++) if (EQUIP_UPGRADED_LIST.indexOf(ids[i]) >= 0) n++;
    return n;
}
// 装备自带的全能吸血合计(重置战斗态时用于还原, 避免把装备提供的加成一起清零)
function equipLeechBase(ids) {
    let v = 0;
    for (let i = 0; i < ids.length; i++) {
        const e = EQUIP_DEFS[ids[i]];
        if (e && e.leechAll) v += e.leechAll;
    }
    return round1(v);
}
// 只保留第一件升级装备, 其余升级装备置空(从前往后保留)
function limitUpgradedEquips(ids) {
    let left = 1;
    return ids.map(id => {
        if (EQUIP_UPGRADED_LIST.indexOf(id) < 0) return id;
        if (left > 0) { left--; return id; }
        return 'none';
    });
}
// 装备合法性归一化: 法杖限蓝条英雄 + 熊王爪限基础生命≥1700 + 装备点容量裁剪(超出部分从后往前置空)
//  skipLimit = true 时跳过容量裁剪(挑战模式预设队伍不受装备点限制)
function normalizeEquipIds(equipIds, heroId, skipLimit) {
    const def = HERO_DEFS[heroId];
    let ids = equipIds.slice();
    while (ids.length < CONFIG.equip.slots) ids.push('none');
    if (ids.length > CONFIG.equip.slots) ids = ids.slice(0, CONFIG.equip.slots);
    if (!def.hasMana) {
        // 专业法杖 / 灵能大法杖 均限蓝条英雄
        ids = ids.map(id => ((id === 'staff' || id === 'staff_up') ? 'none' : id));
    }
    if ((def.maxHp || 0) < CONFIG.bearClaw.minBaseHp) {
        ids = ids.map(id => (id === 'bear_claw' ? 'none' : id));
    }
    ids = limitUpgradedEquips(ids);   // v2.7 规则: 每人只能携带 1 件升级装备
    if (!skipLimit) {
        let used = equipPointsUsed(ids);
        for (let i = ids.length - 1; i >= 0 && used > CONFIG.equip.points; i--) {
            if (ids[i] !== 'none') { used -= equipCost(ids[i]); ids[i] = 'none'; }
        }
    }
    return ids;
}

// ---- 装备数值应用(与原版 applyEquips 完全相同,含计算顺序) ----
function applyEquips(unit, equipIds) {
    const base = HERO_DEFS[unit.heroId];
    unit.maxHp = base.maxHp;
    unit.hp = unit.maxHp;
    unit.atk = base.atk;
    unit.speed = base.speed;
    unit.armor = base.armor;
    unit.mr = base.mr;
    unit.manaRegen = base.hasMana ? base.manaRegen : 0;
    unit.manaPerHit = base.manaPerHit || 0;
    unit.skillDmg = base.skillDmg;
    unit.extraDmg = 0;
    unit.lifesteal = 0;
    unit.leechAll = 0;            // 全能吸血(当前由守护斗篷触发后提供)
    unit.sp = 0;                  // SP 百分比(装备提供,在技能结算时乘以 spOf)
    unit._manaRefundPct = 0;
    unit.critRate = base.critRate || 0;
    unit._atkTypeOverride = null;

    let hpBonusPct = 0, hpFlat = 0, armorBonus = 0, mrBonus = 0;
    let atkBonusPct = 0, atkFlat = 0, speedBonusPct = 0, speedFlat = 0;
    let manaRegenBonus = 0, skillAmpTotal = 0, critRateBonus = 0;
    let atkTypeOverride = null;
    let atkPctOfMaxHp = 0;
    const seenUnique = {};      // 唯一被动去重(魔返/血赋/御击: 重复装备只生效一次)

    equipIds.forEach(id => {
        if (id === 'none') return;
        const e = EQUIP_DEFS[id];
        if (!e) return;
        // 基础属性: 可重复装备,一律叠加
        if (e.hpBonus) hpBonusPct += e.hpBonus;
        if (e.hpFlat) hpFlat += e.hpFlat;
        if (e.armorBonus) armorBonus += e.armorBonus;
        if (e.mrBonus) mrBonus += e.mrBonus;
        if (e.atkBonus) atkBonusPct += e.atkBonus;
        if (e.atkFlat) atkFlat += e.atkFlat;
        if (e.speedBonus) speedBonusPct += e.speedBonus;
        if (e.speedFlat) speedFlat += e.speedFlat;   // 吸血镰刀固定攻速(装备字段,原是硬编码)
        if (e.manaRegenBonus) manaRegenBonus += e.manaRegenBonus;
        if (e.manaPerHitBonus) unit.manaPerHit += e.manaPerHitBonus;   // 专业法杖: 普攻命中回蓝+1/次
        if (e.skillAmp) skillAmpTotal += e.skillAmp;
        if (e.extraDmg) unit.extraDmg += e.extraDmg;
        if (e.lifesteal) unit.lifesteal += e.lifesteal;
        if (e.leechAll) unit.leechAll += e.leechAll;   // v2.7 嗜血狂镰: 装备提供的全能吸血
        if (e.critRateBonus) critRateBonus += e.critRateBonus;
        if (e.atkTypeOverride) atkTypeOverride = e.atkTypeOverride;
        // 唯一被动: 同名被动只结算一次
        if (e.unique) {
            if (seenUnique[e.unique]) return;
            seenUnique[e.unique] = true;
        }
        if (e.manaRefundPct) unit._manaRefundPct += e.manaRefundPct;   // 魔返
        if (e.atkPctOfMaxHp) atkPctOfMaxHp += e.atkPctOfMaxHp;         // 血赋
    });

    // 计算顺序与原版一致: 生命%→生命固定→护甲/魔抗→攻击%→攻击固定→流星锤→攻速→回蓝→技能增幅→暴击率→攻击类型覆盖
    if (hpBonusPct > 0) unit.maxHp = round1(base.maxHp * (1 + hpBonusPct));
    if (hpFlat > 0) unit.maxHp = round1(unit.maxHp + hpFlat);
    if (armorBonus > 0) unit.armor = base.armor + armorBonus;
    if (mrBonus > 0) unit.mr = base.mr + mrBonus;
    if (atkBonusPct > 0) unit.atk = round1(base.atk * (1 + atkBonusPct));
    if (atkFlat > 0) unit.atk = round1(unit.atk + atkFlat);
    if (atkPctOfMaxHp > 0) {
        // 血赋(覆盖机制): 以「最终最大生命值」在最后一步结算,可吃到其他装备/技能的生命加成
        unit.atk = round1(unit.atk + unit.maxHp * atkPctOfMaxHp);
    }
    // 攻速 = 基础 × (1 + 百分比加成) + 固定加成
    if (unit.heroId === 'gunner') {
        // v4.5 枪手: 攻速锁定 1.2;装备提供的攻速(百分比先按基础攻速折算出额外攻速)
        // 按每 0.05 → +1 攻击力(四舍五入)
        unit.speed = base.speed;
        const speedGain = speedFlat + base.speed * speedBonusPct;
        if (speedGain > 0) unit.atk = round1(unit.atk + Math.round(speedGain / 0.05));
    } else {
        unit.speed = round2(base.speed * (1 + speedBonusPct) + speedFlat);
    }
    if (unit.hasMana && manaRegenBonus > 0) unit.manaRegen = base.manaRegen + manaRegenBonus;
    if (skillAmpTotal > 0) unit.sp = round1(skillAmpTotal * 100);   // SP 存百分比,结算时乘以 spOf(不再预乘 skillDmg)
    if (critRateBonus > 0) unit.critRate = (base.critRate || 0) + critRateBonus;
    if (atkTypeOverride) unit._atkTypeOverride = atkTypeOverride;
    unit.hp = unit.maxHp;
}

// ---- v2.9 天赋: 在装备结算之后写入 unit 覆盖值(攻速/暴击加算; 星落参数 unit 级覆盖) ----
function applyTalents(unit, talentIds) {
    unit.talentIds = normalizeTalentIds(talentIds, unit.heroId);
    unit.starfallAdRatio = null;
    unit.starfallMaxCharge = null;
    unit.starfallCanCrit = false;
    unit.starfallOnStart = false;
    if (!unit.talentIds.length) return;
    let speedFlat = 0, critRate = 0;
    unit.talentIds.forEach(id => {
        const def = TALENT_DEFS[id];
        if (!def || !def.effects) return;
        def.effects.forEach(ef => {
            if (!ef) return;
            if (ef.type === 'speedFlat') speedFlat += (ef.value || 0);
            else if (ef.type === 'critRate') critRate += (ef.value || 0);
            else if (ef.type === 'starfallAdRatio') unit.starfallAdRatio = ef.value;
            else if (ef.type === 'starfallMaxCharge') unit.starfallMaxCharge = ef.value;
            else if (ef.type === 'starfallCanCrit') unit.starfallCanCrit = true;
            else if (ef.type === 'starfallOnStart') unit.starfallOnStart = true;
        });
    });
    if (speedFlat && unit.heroId !== 'gunner') {
        unit.speed = round2(unit.speed + speedFlat);
    } else if (speedFlat && unit.heroId === 'gunner') {
        // 枪手锁攻速: 与装备一致,按 0.05 → +1 攻击力折算
        unit.atk = round1(unit.atk + Math.round(speedFlat / 0.05));
    }
    if (critRate) unit.critRate = round1((unit.critRate || 0) + critRate);
}

// ---- 构建单位(英雄模板 + 装备数值 + 天赋 + 机制实例 + 战斗态初始化) ----
//  teamKey: 所属队伍 'A'/'B';cell: 阵型站位格 0..5(0..2 = 前排 1/2/3 列,3..5 = 后排 1/2/3 列)
function makeUnit(heroId, equipIds, teamKey, cell, world, freeEquip, talentIds) {
    const def = HERO_DEFS[heroId];
    const unit = JSON.parse(JSON.stringify(def));
    unit.heroId = heroId;
    unit.teamKey = teamKey;
    unit.sideKey = teamKey;      // 兼容旧命名(部分机制/日志沿用 sideKey)
    unit.cell = cell;
    unit.row = cellRow(cell);    // 0 = 前排, 1 = 后排
    unit.col = cellCol(cell);    // 0..2
    unit.slot = cell;            // 兼容旧命名(部分日志/统计沿用 slot)
    unit.equipIds = normalizeEquipIds(equipIds, heroId, freeEquip);
    // 机制列表 = 英雄机制 + 已装备物品机制
    const mechs = def.mechanics.slice();
    unit.equipIds.forEach(id => {
        const e = EQUIP_DEFS[id];
        if (e && e.mechanics) e.mechanics.forEach(m => { if (mechs.indexOf(m) < 0) mechs.push(m); });
    });
    unit.mechanics = mechs;
    applyEquips(unit, unit.equipIds);
    applyTalents(unit, talentIds);
    // 战斗态
    unit.hp = unit.maxHp;
    unit.shield = 0;
    unit.potionShieldTimer = 0;   // v2.4 远征药水·守护药剂: 300 护盾的剩余持续时间
    unit.potionShieldLeft = 0;    // 守护药剂护盾中「尚未消失」的部分(6s 后移除)
    unit.potionAtkTimer = 0;      // v2.4 远征药水·攻击药剂: 攻击力 +10% 的剩余持续时间
    unit.potionAtkBonus = 0;      // 攻击药剂实际加成的攻击力数值(到期按数值扣除, 避免与其它加成互相干扰)
    unit.cloakTriggered = false;
    unit.regenTimer = 0;
    unit.mana = unit.hasMana ? unit.startMana : 0;
    unit.atkCount = 0;
    unit.attackCd = 0;
    unit.skillCharge = 0;
    unit.critStreak = 0;
    unit.lastStandUsed = false;
    unit.curse = null;
    unit.curseTimer = 0;
    unit.curseAppliedAt = false;
    unit.evoStage = 0;
    unit.evoTimer = 0;
    unit.evoHeal = 0;
    unit.manaAccum = 0;
    unit.spearCount = 0;
    unit.stunned = 0;            // 眩晕(禁普攻/施法;回蓝/CD/已释放技能不受影响)
    unit.speedMul = 1;           // v2.2: 攻速倍率(寒冰印记 -10%)
    unit.frostStacks = 0;        // v2.2: 寒冰印记层数
    unit._psionicArmed = true;   // v2.2: 灵能大法杖(同一次满蓝只结算一次)
    unit._psionicGain = 0;       // v2.2: 灵能大法杖已累计 SP
    // v2.7 修复: 此前此处把 leechAll 清零, 导致「嗜血狂镰」等装备提供的全能吸血从未生效
    //            (leechAll 已由 applyEquips 按装备计算, 战斗中再由守护斗篷/嗜血狂镰累加)
    unit.netSlowTimer = 0;       // v2.5 猎人 · 猎网减速剩余时间(攻速 -20%)
    unit.magicCharge = 0;        // v2.5 魔剑士 · 魔法充能(每次攻击 +10, 满 100 进入星落)
    unit.starfallTimer = 0;      // v2.5 魔剑士 · 星落剩余时间
    unit.starfallAccum = 0;
    unit.starfallHitFlag = false;// v2.5 首次被星落命中的眩晕标记(挂在被命中方)
    // v2.9 天赋覆盖(由 applyTalents 写入; 此处兜底)
    if (unit.talentIds === undefined) unit.talentIds = [];
    if (unit.starfallAdRatio === undefined) unit.starfallAdRatio = null;
    if (unit.starfallMaxCharge === undefined) unit.starfallMaxCharge = null;
    if (unit.starfallCanCrit === undefined) unit.starfallCanCrit = false;
    if (unit.starfallOnStart === undefined) unit.starfallOnStart = false;
    unit.lancerCasting = false;  // v2.5 长枪手 · 三连突刺蓄力中
    unit.lancerCastTimer = 0;
    unit.ghostImmuneTimer = 0;   // v2.5 BOSS幽魂 · 复活免疫剩余时间
    unit.ghostReviveUsed = false;// v2.5 BOSS幽魂 · 首次死亡复活是否已用
    unit.holyActive = false;     // 圣骑 · 圣光状态
    unit.holyTimer = 0;
    unit.holyAccum = 0;
    unit.ironStacks = 0;         // 战士 · 铁血意志(印记层数 / 承伤累计 / 攻击计数 / 大招是否已用)
    unit.ironDmgAccum = 0;
    unit.ironAtkCount = 0;
    unit.ironUltUsed = false;
    unit.berserkTriggered = false;          // 勇士浴血是否已触发过
    unit.berserkActive = false;             // 勇士浴血当前是否生效(粘性: 未回满血不结束)
    unit.lifeStrikeReady = false;           // 坦克 · 生命打击蓄力
    unit.crystalTimer = 0;                  // 恢复水晶: 周期回复计时
    unit._jadeSpeedExtra = 0;               // 玉面刃: 当前动态攻速差值
    unit.ammo = CONFIG.revolver.capacity;   // 枪手 · 左轮弹匣
    unit.reloading = false;
    unit.reloadTimer = 0;
    unit.lockedTarget = null;    // 枪手换弹锁定 / 黑暗游侠对位锁定
    unit.darkStacks = 0;         // v2.6 黑暗游侠 · 黑暗之力层数(每层+1攻击力)
    unit.darkShield = 0;         // v2.6 黑暗游侠 · 黑暗护盾层数(每层免疫一次主动技能伤害)
    unit.darkShieldTimer = 0;
    unit._darkStunPrev = 0;
    unit.spiritCount = 0;        // 精灵 · 小精灵数量
    unit.spiritTimer = 0;
    unit.spiritAtkTimer = 0;
    unit.bossCdTimer = 0;        // Boss大熊 · 重击冷却
    unit.bossPhase2 = false;
    unit.bossRallyDone = false;
    unit.arcCasting = false;     // Boss大魔法师 · 前摇状态
    unit.arcCastTimer = 0;
    unit.arcHpLoss = 0;
    // v2.7 精灵: 开局不再自带小精灵, 从 0 只开始每 5s 叠加(见 spiritSummon)
    unit._darkShieldEvent = null;   // v2.7 黑暗游侠 · 同一次技能伤害已被护盾抵消的标记
    unit.mageCasting = false;       // v2.7 法师 · 法术爆发施法(吟唱)中
    unit.mageCastTimer = 0;
    unit.lancerAloneActive = false; // v2.7 长枪手 · 独守阵线当前是否已把 +20 攻击力加到面板
    unit._lancerAlone = false;      // v2.7 长枪手 · 独守阵线条件判定缓存
    unit._bloodLeechGain = 0;       // v2.7 嗜血狂镰 · 已叠加的全能吸血
    unit.fighterTimer = 0;
    unit.fighterActive = false;
    unit.fighterCooldown = 0;
    // 统计(批量模拟用: 累计造成伤害/暴击次数/普攻次数)
    unit.stats = { dmgDealt: 0, crits: 0, attacks: 0 };
    return unit;
}

// ---- 编队配置归一化: 支持数组 [{heroId, equipIds, cell}] 与旧式单挑签名(heroId, equipIds) ----
function toTeamConfig(team, limit) {
    const cap = limit || CONFIG.teams.maxPerTeam;
    const raw = [];
    if (!team) raw.push({});
    else if (typeof team === 'string') raw.push({ heroId: team });
    else if (Array.isArray(team)) raw.push(...team.slice(0, cap));
    else if (team.heroId) raw.push(team);
    else raw.push({});

    const used = {};
    const out = [];
    raw.forEach(m => {
        const member = {
            heroId: (m && m.heroId) || 'warrior',
            equipIds: (m && m.equipIds) ? m.equipIds.slice() : ['none', 'none', 'none'],
            cell: (m && isValidCell(m.cell) && !used[m.cell]) ? m.cell : null,
            freeEquip: !!(m && m.freeEquip),   // 挑战模式预设: 不受装备点限制
            talentIds: normalizeTalentIds((m && m.talentIds) || [], (m && m.heroId) || 'warrior')
        };
        if (member.cell === null) {
            // 未指定或格子冲突 → 按默认顺序(前中→前左→前右→后中→后左→后右)自动布阵
            for (let i = 0; i < DEFAULT_CELL_ORDER.length; i++) {
                const c = DEFAULT_CELL_ORDER[i];
                if (!used[c]) { member.cell = c; break; }
            }
        }
        if (member.cell === null) return;   // 超出 6 格(理论不可达: 每队最多 3 人)
        used[member.cell] = true;
        out.push(member);
    });
    // 队内按格子顺序排列(前排从左到右、后排从左到右),保证出手顺序稳定可复现
    out.sort((a, b) => a.cell - b.cell);
    return out;
}

// ---- 世界(对局): A/B 为队伍数组,units 为稳定遍历顺序 ----
//  新式: createWorld(teamA, teamB, opts)   teamA/teamB = [{heroId, equipIds}, ...]
//  旧式兼容: createWorld(heroA, eqA, heroB, eqB, opts)
function createWorld(teamA, eqA, teamB, eqB, opts) {
    let ta, tb, o;
    if (typeof teamA === 'string') {
        // 旧式单挑签名: createWorld(heroA, eqA, heroB, eqB, opts)
        ta = [{ heroId: teamA, equipIds: Array.isArray(eqA) ? eqA.slice() : ['none', 'none'] }];
        tb = [{ heroId: teamB, equipIds: Array.isArray(eqB) ? eqB.slice() : ['none', 'none'] }];
        o = opts || {};
    } else {
        // 新式队伍签名: createWorld(teamA, teamB, opts)
        ta = teamA;
        tb = eqA;
        o = (teamB && typeof teamB === 'object' && !Array.isArray(teamB)) ? teamB : (opts || {});
    }
    // 挑战模式的预设队伍可超过常规 maxPerTeam(通过 opts.maxPerTeam 放开)
    const cap = (o && o.maxPerTeam) || CONFIG.teams.maxPerTeam;
    ta = toTeamConfig(ta, cap);
    tb = toTeamConfig(tb, cap);
    const world = {
        A: [], B: [], units: [],
        round: 0, winner: null, battleTime: 0,
        logLines: [], uiDirty: true,
        rng: o.rng || Math.random,
        fullLog: o.fullLog || null,         // 可选: 不截断的完整日志(测试/对拍用)
        mode: o.mode || 'versus'            // 'versus' 普通对战 / 'rogue' 远征模式(引擎按模式开关掉落等玩法逻辑)
    };
    ta.forEach(m => { world.A.push(makeUnit(m.heroId, m.equipIds, 'A', m.cell, world, m.freeEquip, m.talentIds)); });
    tb.forEach(m => { world.B.push(makeUnit(m.heroId, m.equipIds, 'B', m.cell, world, m.freeEquip, m.talentIds)); });
    // 出手顺序: A 队整体先于 B 队(与原版一致),队内按阵型格顺序(前排→后排,左→右)
    world.units = world.A.concat(world.B);
    // v4.6: 同队同名编号(如 战士1/战士2);跨队同名由日志颜色(A蓝/B红)区分
    ['A', 'B'].forEach(tk => {
        const counts = {};
        world[tk].forEach(u => { counts[u.name] = (counts[u.name] || 0) + 1; });
        const seen = {};
        world[tk].forEach(u => {
            if (counts[u.name] > 1) {
                seen[u.name] = (seen[u.name] || 0) + 1;
                u.name = `${u.name}${seen[u.name]}`;
            }
        });
    });
    // 机制钩子通过 world.addLog 写入日志(引擎层保持无 DOM)
    world.addLog = (msg, cls) => { addLog(world, msg, cls); };
    return world;
}
// v2.9 原初之力: 开局直接进入星落期(须在世界就绪、且不会被 resetCombatState 清掉之后调用)
function applyTalentOnStart(world) {
    if (!world || !world.units) return;
    world.units.forEach(u => {
        if (world.winner) return;
        if (!u.starfallOnStart || u.hp <= 0 || !hasMech(u, 'starfall')) return;
        if (u.starfallTimer > 0) return;
        const cfg = CONFIG.starfall;
        u.magicCharge = 0;
        u.starfallTimer = cfg.durationSec;
        u.starfallAccum = 0;
        world.addLog(`🌌 ${u.name} 的「原初之力」苏醒，开局直接进入星落！`, 'highlight');
        starfallPulse(u, world, cfg);
    });
}
function addLog(world, msg, cls) {
    const time = world.battleTime.toFixed(1);
    world.logLines.push({ msg: `[${time}s] ${msg}`, cls: cls || '' });
    if (world.logLines.length > CONFIG.log.max) world.logLines.shift();
    if (world.fullLog) world.fullLog.push({ msg: `[${time}s] ${msg}`, cls: cls || '' });
    world.uiDirty = true;
}

// ---- 伤害结算(所有伤害来源共用): 护盾吸收 → 扣血 → onDamaged(守护斗篷) ----
//  opts(可选): { skill: true } = 该次伤害来自「主动技能」(蓝条技能/CD技能/大招/技能型DoT),
//   会被黑暗游侠的「黑暗护盾」免疫; opts.dot: true 表示持续伤害跳数(被免疫时后续跳数一并作废)
//   opts.event: v2.7 同一次技能事件的标记, 用于让该技能附带的控制也被同一层护盾抵消
//  返回值: true = 伤害已结算; false = 被免疫(幽灵免疫期 / 黑暗护盾) → 调用方可据此跳过后续结算(如 DoT)
function applyDamageTo(world, target, dmg, source, opts) {
    // v2.5 BOSS幽魂 · 不灭怨念: 复活期间免疫一切伤害
    if (target.ghostImmuneTimer > 0) return false;
    // v2.6 BOSS黑暗游侠 · 黑暗护盾: 每层免疫一次主动技能伤害
    if (opts && opts.skill && (target.darkShield || 0) > 0) {
        target.darkShield -= 1;
        // v2.7: 记录本次技能事件 → 该技能附带的控制效果同样被这层护盾抵消(不额外扣层)
        if (opts.event) target._darkShieldEvent = opts.event;
        // 回写给调用方: 使上层能区分「被黑暗护盾抵消」与「目标处于免疫状态」(如幽魂复活期)
        opts.blockedByDarkShield = true;
        addLog(world, `🌑 ${target.name} 的黑暗护盾抵消了本次技能伤害（剩余 ${target.darkShield} 层）`, 'armor');
        if (opts.dot) addLog(world, `🌑 黑暗护盾完全抵消了持续伤害，其后续跳数也不再结算`, 'armor');
        return false;
    }
    const hpBefore = target.hp;
    let remainingDmg = dmg;
    if (target.shield > 0) {
        const absorbed = Math.min(target.shield, remainingDmg);
        target.shield -= absorbed;
        remainingDmg -= absorbed;
        if (absorbed > 0) {
            addLog(world, `🛡️ ${target.name} 护盾吸收了 ${absorbed} 伤害`, 'armor');
        }
    }
    if (remainingDmg > 0) {
        target.hp = round1(Math.max(0, target.hp - remainingDmg));
    }
    // hpLoss = 实际扣血量(护盾吸收部分不计) —— 战士「铁血意志」按此累计
    const hpLoss = round1(Math.max(0, hpBefore - target.hp));
    fireMechs(target, 'onDamaged', source, { dmg, hpLoss }, world);
    // 全能吸血: 按「实际扣血量」回复(覆盖普攻/技能/DoT/装备附加等一切来源),受自身重伤减半
    //  修正1: 基数由原始 dmg 改为 hpLoss —— 被护盾吸收的部分不再产生吸血
    //  修正2: opts.noLeech 用于关掉「反弹类」伤害的吸血(荆棘之甲反弹时不该让挨打方回血)
    if (source && source !== target && source.hp > 0 && source.leechAll > 0 && hpLoss > 0 && !(opts && opts.noLeech)) {
        const leech = applyHealReduction(source, round1(hpLoss * source.leechAll / 100));
        if (leech > 0) {
            source.hp = Math.min(source.maxHp, source.hp + leech);
            addLog(world, `🧥 ${source.name} 全能吸血回复 ${leech} HP`, 'heal');
        }
    }
    return true;
}

// ---- v2.7 控制(眩晕)统一入口: 黑暗游侠的「黑暗护盾」可把控制一并抵消 ----
//  opts.skill !== false 表示该控制来自技能/攻击技能(可被黑暗护盾抵挡, 普攻本身的控制默认也算)
//  opts.event  = 同一次技能的事件标记: 若该技能的伤害已被护盾抵消, 则控制一并抵消且不再额外扣层
//  opts.label  = 日志中的来源描述
//  返回 true = 控制已被护盾抵消(调用方据此跳过后续日志/统计)
let _shieldEventSeq = 0;
function newShieldEvent() { _shieldEventSeq += 1; return _shieldEventSeq; }
function applyStunTo(world, target, sec, opts) {
    if (!isAlive(target)) return false;
    opts = opts || {};
    if (opts.skill !== false && hasMech(target, 'darkRanger')) {
        // 1) 同一次技能的伤害已被黑暗护盾抵消 → 控制一并抵消(不额外扣层)
        if (opts.event && target._darkShieldEvent === opts.event) {
            target._darkShieldEvent = null;
            addLog(world, `🌑 ${target.name} 的黑暗护盾同时抵消了${opts.label || '控制效果'}（不再扣除黑暗之力层数）`, 'armor');
            return true;
        }
        // 2) 护盾仍有层数 → 消耗 1 层抵消该控制
        if ((target.darkShield || 0) > 0) {
            target.darkShield -= 1;
            addLog(world, `🌑 ${target.name} 的黑暗护盾抵消了${opts.label || '控制效果'}（剩余 ${target.darkShield} 层，黑暗之力层数不变）`, 'armor');
            return true;
        }
    }
    target.stunned = Math.max(target.stunned || 0, sec);
    return false;
}

// ---- 团灭检查: 一队全员阵亡 → 判负 ----
function checkTeamWipe(world, teamKey) {
    if (aliveCount(world, teamKey) > 0) return false;
    const winnerKey = enemyTeamKey(teamKey);
    world.winner = winnerKey;
    addLog(world, `🏆 <span class="highlight">${winnerKey}队 全员获胜！${teamKey}队 已被团灭</span>`, 'highlight');
    return true;
}

// ---- 死亡结算: 绝境求生 → 否则该单位阵亡并检查团灭;返回 true 表示战斗已分胜负 ----
function handleDeath(world, unit, killer) {
    let saved = false;
    const list = unit.mechanics;
    for (let i = 0; i < list.length && !saved; i++) {
        const m = MECHANICS[list[i]];
        if (m && typeof m.onDeathCheck === 'function') {
            if (m.onDeathCheck(unit, killer, world)) saved = true;
        }
    }
    if (saved) return false;
    unit.hp = 0;
    unit.curse = null;          // 目标阵亡 → 其身上诅咒立即消失
    unit.curseAppliedAt = false;
    unit.stunned = 0;
    addLog(world, `💀 ${unitLabel(unit)}（${unit.teamKey}队${cellName(unit.cell)}）阵亡！`, 'damage');
    // v2.5 BOSS幽魂 · 噬魂: 该单位阵亡 → 其「敌方」阵营里的幽魂立刻回血并提升攻击力
    // v2.6: 追加传入 (阵亡单位, 击杀者) → 黑暗游侠据此判定「是自己击败的」才获得黑暗护盾
    const foes = world[enemyTeamKey(unit.teamKey)];
    for (let i = 0; i < foes.length; i++) {
        if (isAlive(foes[i])) fireMechs(foes[i], 'onEnemyDeath', world, unit, killer);
    }
    return checkTeamWipe(world, unit.teamKey);
}

// ---- 法力护符: 施放后回复 25% 最大蓝量 ----
function applyManaRefund(world, unit) {
    const ref = unit._manaRefundPct || 0;
    if (ref > 0 && unit.hasMana) {
        const restore = round1(unit.maxMana * ref);
        unit.mana = round1(Math.min(unit.maxMana, unit.mana + restore));
        if (restore > 0) addLog(world, `📿 ${unit.name} 法力护符回复 ${restore} 蓝`, 'heal');
    }
}

// ---- 技能施放通知(v4.7: 恢复水晶已改为周期回复, 不再依赖技能触发) ----
//  保留空实现以兼容既有调用点(浴血/双拳/技能等), 便于以后挂载其他「施法触发」类效果
function notifySkillCast(unit, world) {
}

// ---- 诅咒逐跳伤害: 诅咒附着于目标单位自身,由引擎每 1s 对带诅咒的目标结算 ----
//  施法者死亡/被眩晕均不影响已释放诅咒,持续到剩余时间归零或目标阵亡
function applyCurseTick(world, unit) {
    const curse = unit.curse;
    if (!curse || unit.hp <= 0) return;
    const caster = curse.caster || null;
    const tickDmg = round1(curse.totalDmg / curse.ticks);
    const opts = { skill: true, dot: true };
    const applied = applyDamageTo(world, unit, tickDmg, caster, opts);
    // v2.6: 诅咒跳数未生效 → 该 DoT 后续跳数同样不再结算(需求: 免疫持续伤害则后续也免疫)
    //  注意区分原因: 「黑暗护盾抵消」才打护盾日志;目标处于免疫状态(如幽魂复活期)属另一种情况
    if (!applied) {
        unit.curse = null;
        unit.curseAppliedAt = false;
        if (opts.blockedByDarkShield) {
            addLog(world, `🧙 ${unit.name} 身上的诅咒被黑暗护盾彻底抵消（重伤消失）`, 'armor');
        }
        return;
    }
    addLog(world, `🧙 ${curse.casterName} 的诅咒灼烧！${unit.name} 受到 ${dmgSpan(tickDmg, 'magical')} 魔法伤害`, 'curse');
    if (caster) caster.stats.dmgDealt += tickDmg;
    if (unit.hp <= 0) {
        unit.curse = null;
        unit.curseAppliedAt = false;
        handleDeath(world, unit, caster);
        return;
    }
    curse.remaining -= 1;
    if (curse.remaining <= 0) {
        unit.curse = null;
        unit.curseAppliedAt = false;
        addLog(world, `🧙 ${unit.name} 身上的诅咒结束（重伤消失）`, '');
    }
}

// ---- 进化结算(由 evolution 机制调用) ----
function applyEvo(unit, world) {
    const ek = unit.evoStage;
    if (ek >= CONFIG.evolution.maxStages) return;
    unit.evoStage = ek + 1;
    const ec = unit.evoStage;
    let heal = applyHealReduction(unit, CONFIG.evolution.healPerEvolve);
    unit.hp = Math.min(unit.maxHp, unit.hp + heal);
    const st = CONFIG.evolution.stages[ec - 1];
    let logMsg = `🐾 ${unit.name} 第${ec}次进化！`;
    if (st) {
        if (st.atk) unit.atk += st.atk;
        if (st.speed) unit.speed += st.speed;
        if (st.armor) unit.armor += st.armor;
        if (st.mr) unit.mr += st.mr;
        if (st.healPerHit) unit.evoHeal = st.healPerHit;
        if (st.omniLeech) unit.leechAll = (unit.leechAll || 0) + st.omniLeech;   // 第4次进化: 20% 全能吸血
        const parts = [];
        if (st.atk) parts.push(`攻击+${st.atk}`);
        if (st.speed) parts.push(`攻速+${st.speed}`);
        if (st.armor) parts.push(`双抗+${st.armor}%`);
        if (st.healPerHit) parts.push(`普攻回血${st.healPerHit}`);
        if (st.omniLeech) parts.push(`全能吸血+${st.omniLeech}%`);
        if (parts.length) logMsg += parts.join('，');
    }
    logMsg += isHealReduced(unit) ? `，回复${heal}HP（受重伤影响）` : `，回复${heal}HP`;
    addLog(world, logMsg, 'highlight');
}

// ---- 战士 · 铁血意志: +1 层印记(每层 +4 攻击 / +1 双抗);满层自动触发「铁血破阵」(整局仅 1 次) ----
function addIronStack(unit, world) {
    const cfg = CONFIG.ironWill;
    if ((unit.ironStacks || 0) >= cfg.maxStacks) return;
    unit.ironStacks = (unit.ironStacks || 0) + 1;
    unit.atk = round1(unit.atk + cfg.atkBonus);
    unit.armor += cfg.resistBonus;
    unit.mr += cfg.resistBonus;
    world.addLog(`🩸 ${unit.name} 铁血意志 +1 层（${unit.ironStacks}/${cfg.maxStacks}）：攻击+${cfg.atkBonus}，双抗+${cfg.resistBonus}`, 'highlight');
    if (unit.ironStacks >= cfg.maxStacks && !unit.ironUltUsed) castIronBreak(world, unit);
}

// ---- 战士 · 铁血破阵: 对敌方「全体前排」造成 (1.2×攻击力 + 目标已损失生命×10%) 物理伤害,并回复 300 生命 ----
function castIronBreak(world, unit) {
    const cfg = CONFIG.ironWill;
    unit.ironUltUsed = true;
    const enemies = world[enemyTeamKey(unit.teamKey)];
    let hit = 0, total = 0;
    for (let i = 0; i < enemies.length; i++) {
        const t = enemies[i];
        if (!isAlive(t) || t.row !== 0) continue;          // 仅作用于「前排」
        const lost = Math.max(0, t.maxHp - t.hp);
        const raw = unit.atk * cfg.ultAtkRatio + lost * cfg.ultLostHpRatio;
        const dmg = Math.max(0.1, round1(raw * (1 - t.armor / 100)));   // 物理伤害: 受护甲减免
        applyDamageTo(world, t, dmg, unit, { skill: true });
        unit.stats.dmgDealt += dmg;
        total += dmg; hit++;
        world.addLog(`💥 铁血破阵命中 ${t.name}：${dmgSpan(dmg, 'physical')} 物理伤害`, 'highlight');
        if (t.hp <= 0) handleDeath(world, t, unit);
    }
    notifySkillCast(unit, world);
    const heal = applyHealReduction(unit, round1(total * cfg.ultHealRatio));
    unit.hp = Math.min(unit.maxHp, unit.hp + heal);
    world.addLog(`🗡️ ${unit.name} 铁血破阵！命中 ${hit} 名前排共 ${round1(total)} 物理伤害，回复 ${heal} HP（印记保留）`, 'highlight');
}

// ---- Boss 大魔法师 · 秘法风暴: 随机主目标 360 魔伤(魔抗永久-2),其余存活敌人各 180 魔伤(v2.6 上调) ----
function castArcStorm(world, unit) {
    const cfg = CONFIG.archmage;
    const alive = [];
    const enemies = world[enemyTeamKey(unit.teamKey)];
    for (let i = 0; i < enemies.length; i++) if (isAlive(enemies[i])) alive.push(enemies[i]);
    if (alive.length === 0) return;
    const main = alive[Math.floor(world.rng() * alive.length) % alive.length];
    for (let i = 0; i < alive.length; i++) {
        const t = alive[i];
        const isMain = (t === main);
        const raw = isMain ? cfg.mainDmg : cfg.sideDmg;
        const dmg = Math.max(0.1, round1(raw * (1 - t.mr / 100)));
        applyDamageTo(world, t, dmg, unit, { skill: true });
        unit.stats.dmgDealt += dmg;
        if (isMain) {
            t.mr = Math.max(0, t.mr - cfg.mrShred);        // 主目标魔抗永久降低
            world.addLog(`🧿 秘法风暴贯穿 ${t.name}（主目标）：${dmgSpan(dmg, 'magical')} 魔法伤害（${cfg.mainDmg} 基础），魔抗永久 -${cfg.mrShred}`, 'highlight');
        } else {
            // v2.3: 其余敌人各受 150(v2.6→180) —— 逐目标单独记日志(此前只记主目标, 看起来像没打中其他人)
            world.addLog(`🧿 秘法风暴波及 ${t.name}：${dmgSpan(dmg, 'magical')} 魔法伤害（${cfg.sideDmg} 基础）`, 'highlight');
        }
        if (t.hp <= 0) { handleDeath(world, t, unit); if (world.winner) return; }
    }
    world.addLog(`🧿 ${unit.name} 秘法风暴！命中 ${alive.length} 名敌人（主目标 ${cfg.mainDmg} + 魔抗削减，其余各 ${cfg.sideDmg}）`, 'highlight');
    unit.mana = 0;
    applyManaRefund(world, unit);
    notifySkillCast(unit, world);
}

// ---- 精灵(v4.5): 普攻转化为治疗 —— 对己方(含自身)生命值最低且已损血的单位回复攻击力数值 ----
//  平局按站位顺位(队伍数组按 cell 升序,严格小于保留先者);全员满血 → 空过
function performFairyHeal(world, unit) {
    const allies = world[unit.teamKey];
    let target = null;
    for (let i = 0; i < allies.length; i++) {
        const a = allies[i];
        if (!isAlive(a) || a.hp >= a.maxHp) continue;      // 没有损失生命值的单位不会被治疗
        if (!target || a.hp < target.hp) target = a;
    }
    if (!target) return false;                              // 全员满血 → 空过一拍
    const heal = applyHealReduction(target, round1(unit.atk));
    target.hp = Math.min(target.maxHp, target.hp + heal);
    addLog(world, `🌿 ${unit.name} 治愈 ${target.name}，回复 ${heal} HP`, 'heal');
    unit.atkCount = (unit.atkCount || 0) + 1;
    unit.stats.attacks++;
    return true;
}

// ---- 普攻结算管线(与原版 performAttack 顺序逐条一致;单位对单位,目标由调用方选定) ----
function performAttack(world, attacker, defender) {
    if (world.winner) return false;
    if (!attacker || !defender) return false;
    if (attacker.hp <= 0 || defender.hp <= 0) return false;

    if (attacker.stunned > 0) {
        addLog(world, `💫 ${attacker.name} 被眩晕，无法普通攻击！`, 'silence');
        return false;
    }

    // 精灵(v4.5): 普攻改为治疗己方(全员满血时空过)
    if (hasMech(attacker, 'fairyHeal')) {
        return performFairyHeal(world, attacker);
    }

    // v2.5 BOSS幽魂: 普攻改为随机撕咬 2 个敌方单位(魔法伤害)
    if (hasMech(attacker, 'ghost')) {
        return performGhostAttack(world, attacker);
    }

    // 攻击级上下文(每击重置部分字段)
    const ctx = {
        h: 0, hitCount: 1, doubleHit: false,
        atkMult: 1, atkType: attacker.atkType, atkTypeChanged: false,
        isSpear: false, spearCountNow: 0, berserk: false,
        defPct: 0, addDmg: 0, dmg: 0, crit: false, forced: false, holy: false,
        lifesteal: 0, totalDmg: 0, totalLifesteal: 0, hitDetails: [], kind: 'physical'
    };

    for (let h = 0; h < ctx.hitCount; h++) {
        if (defender.hp <= 0) break;
        ctx.h = h; ctx.atkMult = ctx.doubleHit ? CONFIG.dualFist.multiplier : 1;
        ctx.atkType = attacker.atkType; ctx.isSpear = false; ctx.spearCountNow = 0;
        ctx.berserk = false; ctx.atkTypeChanged = false; ctx.defPct = 0; ctx.addDmg = 0; ctx.atkAdd = 0;
        ctx.dmg = 0; ctx.crit = false; ctx.forced = false; ctx.holy = false; ctx.lifesteal = 0;

        // a. 进化兽普攻回血(受减疗) —— 每击开始
        // b. 长矛手真实打击判定(前3发,每击判定 & 计数)
        // c. 浴血奋战(atk×1.2) —— 每击判定
        // d. 攻击类型(星星魔法杖覆盖为法术)
        fireMechs(attacker, 'onBeforeHit', defender, ctx, world);

        const actualAtk = (attacker.atk + (ctx.atkAdd || 0)) * ctx.atkMult;

        // e. 伤害计算
        if (ctx.isSpear) {
            // 真实伤害: 无视防御,不参与暴击,不附加太阳圣盾/急速弓/暗杀/星杖转换
            const spearAtk = actualAtk + CONFIG.spear.bonusAtk;
            ctx.dmg = Math.max(0.1, round1(spearAtk));
        } else {
            ctx.defPct = getDefense(defender, ctx.atkType);
            // 猎人破甲(仅物理攻击生效,最低 5%)
            fireMechs(attacker, 'onDefenseCalc', defender, ctx, world);
            let dmg = actualAtk * (1 - ctx.defPct / 100);
            ctx.dmg = dmg;
            // 太阳圣盾/急速弓/暗杀附加
            fireMechs(attacker, 'onDamageCalc', defender, ctx, world);
            ctx.dmg = Math.max(0.1, round1(ctx.dmg + ctx.addDmg));
        }
        ctx.kind = hitKind(ctx);      // v4.7: 本次伤害类型(物理/魔法/真实) → 决定日志配色

        // f. 暴击判定(每次普攻固定调用一次 rng,即使暴击率为 0;真实打击不掷骰)
        if (!ctx.isSpear) {
            attacker.critStreak = (attacker.critStreak || 0) + 1;
            let roll = world.rng();
            ctx.threshold = Infinity;
            fireMechs(attacker, 'onCritRoll', ctx);
            // bug③修复: streak > 4(第5次)才强制;原版 streak >= 4(第4次)即为强制
            if (attacker.critStreak > ctx.threshold && isFinite(ctx.threshold)) {
                roll = 0;
                ctx.forced = true;
            }
            if (roll < attacker.critRate / 100) {
                ctx.crit = true;
                ctx.dmg = round1(ctx.dmg * (attacker.critMulti || 2.0));
                attacker.critStreak = 0;
                attacker.stats.crits++;
            }
        }

        // g. 圣光打击(暴击之后附加,不吃暴击)
        fireMechs(attacker, 'onPostCrit', defender, ctx, world);

        // h. applyDamageTo: 护盾→扣血→onDamaged(斗篷/受击效果,所有伤害来源共用)
        applyDamageTo(world, defender, ctx.dmg, attacker);

        // i. 回合/计数/吸血/回蓝
        world.round++;
        attacker.atkCount = (attacker.atkCount || 0) + 1;
        attacker.stats.attacks++;
        attacker.stats.dmgDealt += ctx.dmg;
        ctx.totalDmg += ctx.dmg;

        fireMechs(attacker, 'onHitDealt', defender, ctx);
        if (ctx.lifesteal > 0) {
            let lifesteal = round1(ctx.lifesteal);
            lifesteal = applyHealReduction(attacker, lifesteal);
            attacker.hp = Math.min(attacker.maxHp, attacker.hp + lifesteal);
            ctx.totalLifesteal += lifesteal;
        }

        let hitMsg = `${h + 1}/${ctx.hitCount}`;
        if (ctx.crit) hitMsg += '💥暴击';
        else if (ctx.holy) hitMsg += '⚡圣光';
        else if (ctx.isSpear) hitMsg += '🔱真实';
        ctx.hitDetails.push(`${hitMsg}: ${dmgSpan(ctx.dmg, ctx.kind)}`);

        // 攻击者普攻回蓝
        if (attacker.hasMana && attacker.manaPerHit > 0) {
            attacker.mana = round1(Math.min(attacker.maxMana, attacker.mana + attacker.manaPerHit));
        }
        // 受击回蓝(b模板,如坦克: 自然1/秒+受击回蓝1/次,仅普攻路径;v4.2 已删除「损失200HP回蓝」)
        if (defender.hasMana && defender.manaPerHitTaken > 0) {
            defender.mana = round1(Math.min(defender.maxMana, defender.mana + defender.manaPerHitTaken));
        }

        // j. 死亡检查
        if (defender.hp <= 0) {
            const ended = handleDeath(world, defender, attacker);
            if (ended) return true;
            // 绝境求生救回: 继续下一击(与原版 continue 一致)
            continue;
        }
    }

    // 汇总日志
    let finalMsg = `${tn(attacker)} → ${tn(defender)}：`;
    if (ctx.doubleHit && ctx.hitDetails.length > 0) {
        finalMsg += `👊 双拳连击！[${ctx.hitDetails.join(' | ')}]`;
        if (ctx.totalLifesteal > 0) finalMsg += ` ❤️+${ctx.totalLifesteal}`;
    } else if (ctx.hitDetails.length > 0) {
        finalMsg += `-${dmgSpan(ctx.totalDmg, ctx.kind)}`;
        if (ctx.hitDetails[0].includes('暴击')) finalMsg += ` 💥暴击`;
        else if (ctx.hitDetails[0].includes('圣光')) finalMsg += ` ⚡圣光`;
        else if (ctx.hitDetails[0].includes('真实')) finalMsg += ` 🔱真实`;
        if (ctx.totalLifesteal > 0) finalMsg += ` ❤️+${ctx.totalLifesteal}`;
    } else {
        finalMsg += `-0`;
    }
    addLog(world, finalMsg, '');
    return true;
}

// ---- 蓝量步进: 0.5s 刻度回蓝(全局 0.5/0.5s + 自身回蓝) + 满蓝未沉默时施放 ----
function unitManaStep(world, unit, dt) {
    if (!unit.hasMana) return;
    if (unit.arcCasting) return;   // 大魔法师: 前摇期间无法回蓝
    if (unit.mageCasting) return;  // v2.7 法师: 0.5s 吟唱期间无法回蓝(蓝量保留至吟唱结束)
    unit.manaAccum += dt;
    while (unit.manaAccum >= CONFIG.mana.tickInterval) {
        unit.manaAccum -= CONFIG.mana.tickInterval;
        const globalRegen = CONFIG.mana.globalRegen;
        const unitRegen = unit.manaRegen * CONFIG.mana.unitRegenFactor;
        const total = globalRegen + unitRegen;
        if (total > 0) {
            unit.mana = round1(Math.min(unit.maxMana, unit.mana + total));
        }
    }
    if (unit.mana >= unit.maxMana && unit.stunned <= 0) {
        // 眩晕期间蓝量照常回复但不会自动施放;CD/已释放技能(诅咒DoT等)均不受影响
        fireMechs(unit, 'onCast', world);
    }
}

// ---- 攻击调度(自动模式: 按单位累加攻击冷却,循环结算;目标实时选取) ----
function attackSchedule(world, unit, dt) {
    if (unit.hp <= 0 || world.winner) return;
    if (!pickTarget(world, unit)) return;
    unit.attackCd = (unit.attackCd || 0) + dt;
    // v2.2: 攻速倍率(寒冰印记 -10%)参与实际出手间隔
    const interval = 1 / ((unit.speed || 1) * (unit.speedMul || 1));
    while (unit.attackCd >= interval && !world.winner && unit.hp > 0) {
        unit.attackCd -= interval;
        const target = pickTarget(world, unit);
        if (!target || target.hp <= 0) return;
        performAttack(world, unit, target);
    }
}

// ---- 世界步进(统一 doRound / autoLoop;手动模式差异由此 opts.manual 保留) ----
//  遍历顺序固定为 world.units = [A0,A1,A2,B0,B1,B2],保证结果可复现
function tick(world, dt, opts) {
    if (world.winner) return false;
    const manual = !!(opts && opts.manual);
    world.battleTime += dt;
    const units = world.units;

    // 1. 眩晕倒计时(眩晕仅禁普攻/施法;回蓝/CD/已释放技能照常)
    for (let i = 0; i < units.length; i++) {
        if (units[i].stunned > 0) units[i].stunned = Math.max(0, units[i].stunned - dt);
    }

    // 2. 进化(不会致死,无胜负检查)
    for (let i = 0; i < units.length; i++) mechTick(units[i], 'evolution', world, dt);

    // 3. 蓝量与施放(施放后可致胜,需检查)
    for (let i = 0; i < units.length; i++) {
        if (units[i].hp <= 0) continue;
        unitManaStep(world, units[i], dt);
        if (world.winner) return false;
    }

    // 4. 剑气充能(旧「圣光打击」已随战士重做移除)
    for (let i = 0; i < units.length; i++) mechTick(units[i], 'swordAura', world, dt);

    // 5. 双拳(手动模式保持原 doRound 链) / 枪手换弹计时
    for (let i = 0; i < units.length; i++) {
        mechTick(units[i], 'dualFist', world, dt, { manual });
        mechTick(units[i], 'revolver', world, dt);
    }

    // 6. 恢复水晶 / 圣骑圣光 / 精灵召唤 / Boss大熊 / 大魔法师 / 玉面刃(动态攻速)
    for (let i = 0; i < units.length; i++) {
        mechTick(units[i], 'crystalRegen', world, dt);
        mechTick(units[i], 'paladinHoly', world, dt);
        mechTick(units[i], 'spiritSummon', world, dt);
        mechTick(units[i], 'bossBear', world, dt);
        mechTick(units[i], 'archmage', world, dt);
        mechTick(units[i], 'jadeBlade', world, dt);
        mechTick(units[i], 'psionicStaff', world, dt);
        mechTick(units[i], 'manaBurst', world, dt);    // v2.7 法师: 0.5s 吟唱结算
        // v2.5 新角色 / 新 BOSS
        mechTick(units[i], 'starfall', world, dt);
        mechTick(units[i], 'lancerStrike', world, dt);
        mechTick(units[i], 'ghost', world, dt);
        mechTick(units[i], 'darkRanger', world, dt);   // v2.6 黑暗游侠: 层数/护盾/被控制惩罚
    }

    // 6.5 远征药水(v2.4): 守护药剂护盾 / 攻击药剂 持续时间结束 → 移除效果
    for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.potionShieldTimer > 0) {
            // 注意: 此处不可再套 round1 —— dt(0.05) < 0.1 时 round1(x - dt) === x,计时器永远减不到 0
            u.potionShieldTimer = Math.max(0, u.potionShieldTimer - dt);
            if (u.potionShieldTimer <= 0) {
                const left = Math.min(u.shield || 0, u.potionShieldLeft || 0);
                if (left > 0) {
                    u.shield = round1(u.shield - left);
                    world.addLog(`🧪 ${u.name} 守护药剂护盾消失（剩余 ${left} 未消耗）`, 'armor');
                }
                u.potionShieldLeft = 0;
            }
        }
        if (u.potionAtkTimer > 0) {
            u.potionAtkTimer = Math.max(0, u.potionAtkTimer - dt);
            if (u.potionAtkTimer <= 0) {
                u.atk = round1(Math.max(0, u.atk - (u.potionAtkBonus || 0)));
                u.potionAtkBonus = 0;
                world.addLog(`⚗️ ${u.name} 攻击药剂效果结束`, '');
            }
        }
    }

    // 6.6 猎网减速(v2.5): 攻速 -20% 持续 3s → 到期重算(若仍带寒冰印记则保留其减速)
    for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!(u.netSlowTimer > 0)) continue;
        u.netSlowTimer = Math.max(0, u.netSlowTimer - dt);
        if (u.netSlowTimer <= 0) {
            u.netSlowTimer = 0;
            recalcSpeedMul(u);          // 统一由 recalcSpeedMul 计算,避免覆盖寒冰印记减速
            world.addLog(`🕸️ ${u.name} 挣脱猎网（攻速恢复）`, '');
        }
    }

    // 7. 诅咒 DoT(诅咒附着于目标自身;眩晕/施法者阵亡不影响;可致死,需检查)
    for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u.curse || u.hp <= 0) continue;
        if (u.curseAppliedAt) { u.curseAppliedAt = false; continue; }   // 施放当次已结算首跳
        u.curseTimer = (u.curseTimer || 0) + dt;
        while (u.curseTimer >= 1.0 && u.curse) {
            u.curseTimer -= 1.0;
            applyCurseTick(world, u);
            if (world.winner) return false;
        }
    }

    // 8. 普攻调度
    if (manual) {
        // 手动模式: 所有存活单位按编队顺序各强制攻击一次,不参与攻击冷却累积
        for (let i = 0; i < units.length; i++) {
            const u = units[i];
            if (u.hp <= 0 || world.winner) continue;
            const target = pickTarget(world, u);
            if (!target || target.hp <= 0) continue;
            performAttack(world, u, target);
            if (world.winner) return false;
        }
    } else {
        for (let i = 0; i < units.length; i++) {
            attackSchedule(world, units[i], dt);
            if (world.winner) return false;
        }
    }
    return true;
}

// ---- 确定性随机数(mulberry32,与 sim.js 一致,保证可复现) ----
function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// ---- 队伍维度统计(批量模拟用) ----
function teamStats(world, teamKey) {
    const team = world[teamKey];
    let survivors = 0, dmg = 0, crits = 0, attacks = 0;
    for (let i = 0; i < team.length; i++) {
        const u = team[i];
        if (u.hp > 0) survivors++;
        dmg += u.stats.dmgDealt;
        crits += u.stats.crits;
        attacks += u.stats.attacks;
    }
    return { survivors, dmg: round1(dmg), crits, attacks, hp: round1(team.reduce((s, u) => s + u.hp, 0)) };
}

// ---- 单局碰撞模拟(批量模拟复用;无 DOM) ----
//  新式: simulateBattle(teamA, teamB, opts)  旧式兼容: simulateBattle(heroA, eqA, heroB, eqB, opts)
function simulateBattle(teamA, eqA, teamB, eqB, opts) {
    let world;
    if (typeof teamA === 'string') {
        // 旧式: simulateBattle(heroA, eqA, heroB, eqB, opts)
        const o = opts || {};
        world = createWorld(teamA, eqA, teamB, eqB, { rng: o.rng });
    } else {
        // 新式: simulateBattle(teamA, teamB, opts) —— 注意只接受 3 个参数
        const o = (teamB && typeof teamB === 'object' && !Array.isArray(teamB)) ? teamB : (opts || {});
        world = createWorld(teamA, eqA, { rng: o.rng, maxPerTeam: o.maxPerTeam });
    }
    applyTalentOnStart(world);   // v2.9 原初之力(与 UI/远征开战路径一致)
    while (world.winner === null && world.battleTime < CONFIG.sim.timeout) {
        tick(world, CONFIG.auto.step, {});
    }
    return {
        winner: world.winner || 'draw',
        time: round1(world.battleTime),
        rounds: world.round,
        teams: { A: teamStats(world, 'A'), B: teamStats(world, 'B') }
    };
}

// ---- v2.4 远征一次性物品(药剂)数值: 引擎层 tick 需要读取, 故定义在引擎作用域 ----
const ROGUE_POTION = { shield: 300, atkPct: 0.10, duration: 6 };

// ---- 引擎导出(Node 对拍/测试直接 require;浏览器中通过 window._duel 暴露) ----
const Engine = {
    CONFIG, HERO_DEFS, EQUIP_DEFS, MECHANICS, RARE_EQUIPS, HERO_LIST, EQUIP_LIST, EQUIP_TIERS, HERO_INTRO_LIST,
    EQUIP_UPGRADES, EQUIP_UPGRADED_LIST, EQUIP_UPGRADE_COST, equipUpgradeTarget,
    createWorld, tick, performAttack, simulateBattle, mulberry32, normalizeEquipIds, applyHealReduction,
    addLog, applyDamageTo, handleDeath, makeUnit, equipCost, equipPointsUsed, equipTierOf, equipListOfTier,
    dmgSpan, hitKind,
    pickTarget, checkTeamWipe, enemyTeamKey, aliveCount, teamStats,
    applyTalents, applyTalentOnStart, normalizeTalentIds
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Engine;
} else if (typeof window !== 'undefined') {
    window._duel = Engine;
}

// ---- Node 兼容: 机制钩子(mechanics.js)通过「全局作用域」查找引擎依赖 ----
//  浏览器中数据/引擎同处全局词法作用域,天然可见;Node 下每个文件是独立模块作用域,故此处显式挂载。
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(globalThis, {
        round1, round2, addLog, applyDamageTo, applyHealReduction, applyStunTo, getDefense, dmgSpan,
        enemyTeamKey, isAlive, pickTarget, pickStrongestEnemy, spOf, handleDeath, makeUnit, recalcSpeedMul,
        addIronStack, applyCurseTick, applyEvo, applyManaRefund, castArcStorm, castLancerTripleStrike,
        castMageBurst, lancerAlone, updateLancerAlone, newShieldEvent, notifySkillCast, performGhostAttack,
        starfallPulse, unitManaStep, tick, ROGUE_POTION, RARE_EQUIPS, applyTalents, normalizeTalentIds, applyTalentOnStart
    });
    // reflectGuard 是可变的 let,必须以 getter 暴露,否则机制钩子只能读到加载时的快照 0
    Object.defineProperty(globalThis, 'reflectGuard', { get: () => reflectGuard, configurable: true });
}
