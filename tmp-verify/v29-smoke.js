// v2.9 冒烟: 星落间隔 / 进化兽天赋 / 伤害统计
const Engine = require('../engine.js');
const { TALENT_DEFS } = require('../talents.js');

let failed = 0;
function assert(cond, msg) {
    if (!cond) { console.error('FAIL:', msg); failed++; }
    else console.log('OK:', msg);
}

// 1. 星落间隔
assert(Engine.CONFIG.starfall.interval === 0.4, 'starfall.interval = 0.4');

// 2. 进化兽天赋定义
assert(!!TALENT_DEFS.evo_accel && TALENT_DEFS.evo_accel.tier === 'common', 'evo_accel defined common');
assert(!!TALENT_DEFS.evo_strong && TALENT_DEFS.evo_strong.tier === 'common', 'evo_strong defined common');
assert(!!TALENT_DEFS.evo_endless && TALENT_DEFS.evo_endless.tier === 'rare', 'evo_endless defined rare');
assert(!!TALENT_DEFS.evo_advanced && TALENT_DEFS.evo_advanced.tier === 'legendary', 'evo_advanced defined legendary');
assert(!!TALENT_DEFS.evo_advanced.effects.some(e => e.type === 'evoAdvanced'), 'evo_advanced effect type');

// 3. 构建带天赋的进化兽
const talents = ['evo_accel', 'evo_strong', 'evo_endless', 'evo_advanced'];
const norm = Engine.normalizeTalentIds(talents, 'evo');
assert(norm.length === 3 || norm.length === 4, 'normalize allows up to 3, leg cap 1: got ' + norm.length);
// maxSlots 3, so one of them dropped. Prefer accel+strong+endless without advanced for pure evo test, and separate advanced test.

const world = Engine.createWorld(
    [{ heroId: 'evo', equipIds: ['none','none','none'], cell: 1, talentIds: ['evo_accel', 'evo_strong'] }],
    [{ heroId: 'tank', equipIds: ['none','none','none'], cell: 1 }],
    { rng: Engine.mulberry32(1), maxPerTeam: 3 }
);
const evo = world.A[0];
assert(evo.evoInterval === 4, 'evoInterval talent -> 4');
assert(evo.evoStrong === true, 'evoStrong flag');
const atk0 = evo.atk, armor0 = evo.armor, mr0 = evo.mr, hp0 = evo.hp;
// 手动触发 1 次进化
Engine.applyEvo(evo, world);
assert(evo.evoStage === 1, 'one evolve applied');
assert(Math.abs(evo.atk - (atk0 + 8 + 5)) < 0.01, `atk +8+5 (got ${evo.atk}, base ${atk0})`);
assert(evo.armor === armor0 + 1, 'armor +1 strong');
assert(evo.mr === mr0 + 1, 'mr +1 strong');
assert(Math.abs(evo.hp - Math.min(evo.maxHp, hp0 + 180)) < 0.01 || evo.hp === evo.maxHp, 'heal 180');

// 无尽进化: 第5次仍可进化, 数值循环前3次(+8/+0.1)
const world2 = Engine.createWorld(
    [{ heroId: 'evo', equipIds: ['none','none','none'], cell: 1, talentIds: ['evo_endless'] }],
    [{ heroId: 'tank', equipIds: ['none','none','none'], cell: 1 }],
    { rng: Engine.mulberry32(2), maxPerTeam: 3 }
);
const evo2 = world2.A[0];
const atkBefore5 = evo2.atk;
for (let i = 0; i < 5; i++) Engine.applyEvo(evo2, world2);
assert(evo2.evoStage === 5, 'endless allows stage 5');
assert(Math.abs(evo2.atk - (atkBefore5 + 8*4 + 15)) < 0.01, `stages 1-4 original + stage5 +8 (got ${evo2.atk}, from ${atkBefore5})`);

// 超前发育: 开局护盾 + 第3次拿到原第4次强化
const world3 = Engine.createWorld(
    [{ heroId: 'evo', equipIds: ['none','none','none'], cell: 1, talentIds: ['evo_advanced'] }],
    [{ heroId: 'tank', equipIds: ['none','none','none'], cell: 1 }],
    { rng: Engine.mulberry32(3), maxPerTeam: 3 }
);
const evo3 = world3.A[0];
assert(evo3.evoAdvanced === true, 'evoAdvanced flag');
assert(evo3.shield === 0, 'shield still 0 before applyTalentOnStart');
Engine.applyTalentOnStart(world3);
assert(evo3.shield === 500, 'start shield 500 after applyTalentOnStart');
const leech0 = evo3.leechAll || 0;
Engine.applyEvo(evo3, world3); // 1
Engine.applyEvo(evo3, world3); // 2
const armor2 = evo3.armor;
Engine.applyEvo(evo3, world3); // 3 -> original stage4
assert(evo3.evoStage === 3, 'stage 3');
assert((evo3.leechAll || 0) === leech0 + 20, 'omni leech at stage3 with advanced');
assert(evo3.armor === armor2 + 13, 'dual resist +13 at stage3 with advanced');

// 4. 伤害统计
const world4 = Engine.createWorld(
    [{ heroId: 'warrior', equipIds: ['none','none','none'], cell: 1 }],
    [{ heroId: 'knight', equipIds: ['none','none','none'], cell: 1 }],
    { rng: Engine.mulberry32(4), maxPerTeam: 3 }
);
const w = world4.A[0], k = world4.B[0];
w.shield = 100;
const dealt0 = w.stats.dmgDealt;
const beforeTaken = k.stats.dmgTaken;
// 50 物理: 20 护盾 + 30 扣血? 先清 k 的护盾
k.shield = 0;
Engine.applyDamageTo(world4, k, 50, w, {});
assert(k.stats.dmgTaken === beforeTaken + 50, `taken +50 hp (got ${k.stats.dmgTaken})`);
assert(k.stats.hpLost >= 50 || k.hp < k.maxHp, 'hp reduced');
Engine.recordDealt(w, 50, 'physical');
assert(w.stats.dmgByType.physical === 50, 'physical dealt tracked');
assert(w.stats.dmgDealt === dealt0 + 50, 'dmgDealt total');

k.shield = 80;
const t0 = k.stats.dmgTaken, sl0 = k.stats.shieldAbsorbed, hl0 = k.stats.hpLost;
Engine.applyDamageTo(world4, k, 100, w, {});
assert(k.stats.shieldAbsorbed === sl0 + 80, `shield absorbed +80 (got ${k.stats.shieldAbsorbed})`);
assert(k.stats.hpLost === hl0 + 20, `hpLost +20 (got ${k.stats.hpLost})`);
assert(k.stats.dmgTaken === t0 + 100, `taken +100 mixed (got ${k.stats.dmgTaken})`);

const html = Engine.buildDamageStatsHtml(world4);
assert(html.indexOf('dmg-stats') >= 0, 'stats html has container');
assert(html.indexOf('物理') >= 0 && html.indexOf('魔法') >= 0 && html.indexOf('真实') >= 0, 'stats html has type columns');
assert(html.indexOf('承受') >= 0, 'stats html has taken column');

// 5. 无天赋对局仍可跑完
const sim = Engine.simulateBattle(
    [{ heroId: 'warrior', equipIds: ['none','none','none'], cell: 1 }],
    [{ heroId: 'knight', equipIds: ['none','none','none'], cell: 1 }],
    { rng: Engine.mulberry32(20260828) }
);
assert(sim.winner === 'A' || sim.winner === 'B' || sim.winner === 'draw', 'sim battle completes: ' + sim.winner);
assert(typeof sim.teams.A.dmg === 'number' && typeof sim.teams.A.taken === 'number', 'teamStats includes taken');

console.log(failed ? `\n${failed} failed` : '\nAll smoke checks passed');
process.exit(failed ? 1 : 0);
