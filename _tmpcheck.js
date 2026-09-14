const base = 'C:/Users/Administrator/Desktop/狂暴战斗v1/';
const E = require(base + 'engine.js');
const EQ = require(base + 'equips.js');

console.log('=== 装备文案(口径应与实现一致: armorBonus/mrBonus 为点数加算) ===');
['belt', 'sunshield', 'thorn_mail'].forEach(id => {
    const e = EQ.EQUIP_DEFS[id];
    console.log(`${e.nameFull}: ${JSON.stringify(e.statsText)}  | armorBonus=${e.armorBonus || 0} mrBonus=${e.mrBonus || 0}`);
});

console.log('\n=== 双抗实际计算验证(belt: 基础值 vs 装备后) ===');
const baseU = E.createWorld([{ heroId: 'tank', equipIds: ['none', 'none', 'none'] }], [{ heroId: 'warrior', equipIds: ['none'] }]).A[0];
const beltd = E.createWorld([{ heroId: 'tank', equipIds: ['belt', 'none', 'none'] }], [{ heroId: 'warrior', equipIds: ['none'] }]).A[0];
console.log(`armor: ${baseU.armor} → ${beltd.armor} (差 ${beltd.armor - baseU.armor}); mr: ${baseU.mr} → ${beltd.mr} (差 ${beltd.mr - baseU.mr}); maxHp: ${baseU.maxHp} → ${beltd.maxHp}`);

console.log('\n=== 小精灵攻击日志(同一目标应聚合为 ×N) ===');
const fullLog = [];
const w = E.createWorld(
    [{ heroId: 'fairy', equipIds: ['none', 'none', 'none'] }],
    [{ heroId: 'tank', equipIds: ['none'] }, { heroId: 'knight', equipIds: ['none'] }],
    { rng: E.mulberry32(7), fullLog: fullLog }
);
for (let i = 0; i < 3000 && !w.winner && w.battleTime < 14; i++) E.tick(w, 0.1, {});
const spiritLogs = fullLog.filter(l => l.msg && l.msg.includes('小精灵们攻击'));
console.log(`战斗时长 ${w.battleTime}s, 胜方=${w.winner || '未结束'}, 精灵 summon=${w.A[0] ? w.A[0].spiritCount : 'n/a'}`);
console.log(`共 ${spiritLogs.length} 条小精灵攻击日志, 前 6 条:`);
spiritLogs.slice(0, 6).forEach(l => console.log('  ' + l.msg));
