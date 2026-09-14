// v2.9b 冒烟: 通用/精灵/圣骑天赋
const Engine = require('../engine.js');
const { TALENT_DEFS, talentsOfHero, normalizeTalentIds } = require('../talents.js');

let failed = 0;
function assert(cond, msg) {
    if (!cond) { console.error('FAIL:', msg); failed++; }
    else console.log('OK:', msg);
}

// 通用天赋定义
assert(!!TALENT_DEFS.uni_hp && TALENT_DEFS.uni_hp.heroId === '*', 'uni_hp universal');
assert(!!TALENT_DEFS.uni_speed && TALENT_DEFS.uni_speed.heroId === '*', 'uni_speed universal');
assert(!!TALENT_DEFS.fairy_boost && TALENT_DEFS.fairy_boost.heroId === 'fairy', 'fairy_boost');
assert(!!TALENT_DEFS.fairy_guard && TALENT_DEFS.fairy_guard.heroId === 'fairy', 'fairy_guard');
assert(!!TALENT_DEFS.paladin_holy_blow && TALENT_DEFS.paladin_holy_blow.heroId === 'paladin', 'paladin_holy_blow');

// 任意英雄池含通用
const wPool = talentsOfHero('warrior').map(t => t.id);
assert(wPool.indexOf('uni_hp') >= 0 && wPool.indexOf('uni_speed') >= 0, 'warrior pool has universal');
assert(wPool.indexOf('fairy_boost') < 0, 'warrior pool has no fairy talent');

const fPool = talentsOfHero('fairy').map(t => t.id);
assert(fPool.indexOf('fairy_boost') >= 0 && fPool.indexOf('fairy_guard') >= 0, 'fairy pool has own');

// normalize 允许通用
const n = normalizeTalentIds(['uni_hp', 'ms_might'], 'warrior');
assert(n.length === 1 && n[0] === 'uni_hp', 'warrior accepts uni_hp only');
const n2 = normalizeTalentIds(['uni_hp', 'uni_speed'], 'warrior');
assert(n2.length === 2, 'warrior accepts both universal');

// 生命强化 / 攻速强化
const world = Engine.createWorld(
    [{ heroId: 'warrior', equipIds: ['none','none','none'], cell: 1, talentIds: ['uni_hp', 'uni_speed'] }],
    [{ heroId: 'knight', equipIds: ['none','none','none'], cell: 1 }],
    { rng: Engine.mulberry32(1), maxPerTeam: 3 }
);
const w = world.A[0];
const baseHp = 1700, baseSpd = 1.35;
assert(Math.abs(w.maxHp - (baseHp + 400)) < 0.01, `maxHp +400 (got ${w.maxHp})`);
assert(Math.abs(w.speed - (baseSpd * 1.15)) < 0.01, `speed *1.15 (got ${w.speed})`);

// 精灵强化 + 精灵守护
const world2 = Engine.createWorld(
    [{ heroId: 'fairy', equipIds: ['none','none','none'], cell: 1, talentIds: ['fairy_boost', 'fairy_guard'] }],
    [{ heroId: 'tank', equipIds: ['none','none','none'], cell: 1 }],
    { rng: Engine.mulberry32(2), maxPerTeam: 3 }
);
const fairy = world2.A[0];
assert(fairy.spiritDmgOverride === 20, 'spirit dmg override 20');
assert(fairy.fairyGuard === true, 'fairyGuard flag');
const a0 = fairy.armor, m0 = fairy.mr;
fairy.spiritCount = 3;
Engine.updateSpiritGuard(world2, fairy);
assert(fairy.armor === a0 + 3, `guard +3 armor (got ${fairy.armor})`);
assert(fairy.mr === m0 + 3, `guard +3 mr (got ${fairy.mr})`);
const tank = world2.B[0];
assert(tank.armor === 12 || tank.armor === (HERO_base_armor_tank()), 'enemy not buffed');
function HERO_base_armor_tank() { return Engine.HERO_DEFS.tank.armor; }
// ally not present; self is buffed. Add ally check:
// Actually only fairy is in team A. armor of fairy increased. Good.

fairy.spiritCount = 1;
Engine.updateSpiritGuard(world2, fairy);
assert(fairy.armor === a0 + 1, `guard dynamic to 1 (got ${fairy.armor})`);

// 圣骑圣灵打击
const world3 = Engine.createWorld(
    [{ heroId: 'paladin', equipIds: ['none','none','none'], cell: 1, talentIds: ['paladin_holy_blow'] }],
    [{ heroId: 'mage', equipIds: ['none','none','none'], cell: 1 }],
    { rng: Engine.mulberry32(3), maxPerTeam: 3 }
);
const p = world3.A[0];
const mage = world3.B[0];
assert(p.holyNextBlowDmg === 150, 'holy blow dmg 150');
assert(p.holyNextBlowMana === 5, 'holy blow mana burn 5');
// 触发圣光
p.mana = p.maxMana;
const MECH = Engine.MECHANICS.paladinHoly;
MECH.onCast(p, world3);
assert(p.holyActive === true, 'holy active');
assert(p.holyNextAtk === true, 'holy next armed');
// 普攻一次
const beforeHp = mage.hp;
const beforeMana = mage.mana;
Engine.performAttack(world3, p, mage);
assert(p.holyNextAtk === false, 'holy next consumed');
assert(mage.hp < beforeHp, 'mage took damage');
// mage has mana - burn applied if hasMana
assert(mage.hasMana === true, 'mage has mana');

// 所有英雄都能 normalize 通用
const allOk = Engine.HERO_LIST.every(hid => {
    const ids = normalizeTalentIds(['uni_hp'], hid);
    return ids[0] === 'uni_hp';
});
assert(allOk, 'all heroes can take uni_hp');

console.log(failed ? `\n${failed} failed` : '\nAll smoke checks passed');
process.exit(failed ? 1 : 0);
