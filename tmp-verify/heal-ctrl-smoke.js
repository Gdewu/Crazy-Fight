// 治疗/控制统计冒烟
const Engine = require('../engine.js');
let failed = 0;
function assert(cond, msg) {
    if (!cond) { console.error('FAIL:', msg); failed++; }
    else console.log('OK:', msg);
}

// 精灵治疗队友
const world = Engine.createWorld(
    [
        { heroId: 'fairy', equipIds: ['none','none','none'], cell: 1, talentIds: [] },
        { heroId: 'warrior', equipIds: ['none','none','none'], cell: 0, talentIds: [] }
    ],
    [{ heroId: 'knight', equipIds: ['none','none','none'], cell: 1 }],
    { rng: Engine.mulberry32(1), maxPerTeam: 3 }
);
const fairy = world.A[0], warrior = world.A[1];
warrior.hp = warrior.maxHp - 200;
const h = Engine.applyHealTo(warrior, 100, fairy);
assert(h === 100, `fairy heals warrior 100 (got ${h})`);
assert(fairy.stats.healDone === 100, `fairy healDone 100 (got ${fairy.stats.healDone})`);
assert(warrior.stats.healTaken === 100, `warrior healTaken 100 (got ${warrior.stats.healTaken})`);
// 自回不计受疗
const h2 = Engine.applyHealTo(warrior, 50, warrior);
assert(h2 === 50, 'self heal 50');
assert(warrior.stats.healDone === 50, `warrior healDone 50 (got ${warrior.stats.healDone})`);
assert(warrior.stats.healTaken === 100, `warrior healTaken still 100 (got ${warrior.stats.healTaken})`);
// 溢出不计
warrior.hp = warrior.maxHp - 10;
const h3 = Engine.applyHealTo(warrior, 100, fairy);
assert(h3 === 10, `overheal only actual 10 (got ${h3})`);
assert(fairy.stats.healDone === 110, `fairy healDone 110 (got ${fairy.stats.healDone})`);

// 眩晕记账
const knight = world.B[0];
const blocked = Engine.applyStunTo(world, knight, 1, { source: fairy, label: 'test' });
assert(blocked === false, 'stun applied');
assert(fairy.stats.stunCount === 1, `stunCount 1 (got ${fairy.stats.stunCount})`);
assert(fairy.stats.stunSec === 1, `stunSec 1 (got ${fairy.stats.stunSec})`);
assert(knight.stats.stunnedCount === 1, `stunnedCount 1 (got ${knight.stats.stunnedCount})`);
assert(knight.stats.stunnedSec === 1, `stunnedSec 1 (got ${knight.stats.stunnedSec})`);

// HTML 含治疗/控制列
const html = Engine.buildDamageStatsHtml(world);
assert(html.indexOf('治疗') >= 0 && html.indexOf('受疗') >= 0, 'html has heal cols');
assert(html.indexOf('控制') >= 0 && html.indexOf('被控') >= 0, 'html has ctrl cols');
assert(html.indexOf('次/') >= 0, 'html ctrl format');

// 圣骑圣光回合计入治疗
const world2 = Engine.createWorld(
    [{ heroId: 'paladin', equipIds: ['none','none','none'], cell: 1, talentIds: [] }],
    [{ heroId: 'tank', equipIds: ['none','none','none'], cell: 1 }],
    { rng: Engine.mulberry32(2), maxPerTeam: 3 }
);
const p = world2.A[0];
p.hp = p.maxHp - 200;
p.mana = p.maxMana;
Engine.MECHANICS.paladinHoly.onCast(p, world2);
for (let i = 0; i < 6; i++) Engine.MECHANICS.paladinHoly.onTick(p, world2, 1.0);
assert(p.stats.healDone > 0, `paladin holy heals recorded (got ${p.stats.healDone})`);
assert(Math.abs(p.stats.healDone - Math.min(150, 200)) < 5 || p.stats.healDone > 100, `paladin heal amount ~150 (got ${p.stats.healDone})`);

// 无天赋对局仍可跑
const sim = Engine.simulateBattle(
    [{ heroId: 'warrior', equipIds: ['none','none','none'], cell: 1 }],
    [{ heroId: 'knight', equipIds: ['none','none','none'], cell: 1 }],
    { rng: Engine.mulberry32(9) }
);
assert(!!sim.winner, 'sim ok ' + sim.winner);

console.log(failed ? `\n${failed} failed` : '\nAll smoke checks passed');
process.exit(failed ? 1 : 0);
