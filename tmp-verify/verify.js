// 临时校验脚本: 拆分前(单文件) vs 拆分后(多文件) 行为对拍, 用后即删
const path = require('path');
const Old = require('./old-full.js');
const New = require(path.join(__dirname, '..', 'game.js'));

function mkTeam(E, spec) {
    return spec.map(s => ({ heroId: s[0], equipIds: E.normalizeEquipIds(s[1] || [], s[0]), cell: s[2] }));
}
function runFull(E, seed, specA, specB) {
    const w = E.createWorld(mkTeam(E, specA), mkTeam(E, specB), { rng: E.mulberry32(seed) });
    while (w.winner === null && w.battleTime < E.CONFIG.sim.timeout) E.tick(w, E.CONFIG.auto.step, {});
    return {
        winner: w.winner || 'draw', rounds: w.round,
        time: Math.round(w.battleTime * 10) / 10,
        stats: [E.teamStats(w, 'A'), E.teamStats(w, 'B')],
        log: w.logLines
    };
}

const cases = [
    [[['warrior', ['sword'], 1], ['mage', ['staff'], 0], ['tank', ['armor'], 2]],
     [['knight', ['hammer'], 1], ['ranger', ['bow'], 0], ['warlock', ['staff'], 2]]],
    [[['assassin', ['dagger'], 1], ['fairy', [], 0], ['hunter', ['bow'], 2]],
     [['ghost', [], 1], ['darkRanger', [], 0]]],
    [[['warrior', [], 1]], [['tank', ['cloak'], 1]]],
    [[['swordsman', ['sword'], 1], ['paladin', ['hammer'], 0], ['lancer', ['spear'], 2]],
     [['bossBear', [], 1], ['archmage', ['staff'], 0], ['spearman', ['spear'], 2]]],
    [[['evo', [], 1], ['fighter', [], 0], ['gunner', [], 2]],
     [['magicSwordsman', ['staff'], 1], ['tank', [], 0], ['mage', ['staff'], 2]]]
];

let bad = 0, total = 0;
for (let ci = 0; ci < cases.length; ci++) {
    for (const seed of [1, 20260828, 777]) {
        total++;
        const a = runFull(Old, seed, cases[ci][0], cases[ci][1]);
        const b = runFull(New, seed, cases[ci][0], cases[ci][1]);
        const eqRes = JSON.stringify({ ...a, log: 0 }) === JSON.stringify({ ...b, log: 0 });
        const eqLog = JSON.stringify(a.log) === JSON.stringify(b.log);
        if (!eqRes || !eqLog) {
            bad++;
            console.log(`MISMATCH case=${ci} seed=${seed} 结果一致=${eqRes} 日志一致=${eqLog} (old ${a.log.length} 行 / new ${b.log.length} 行)`);
            const n = Math.max(a.log.length, b.log.length);
            for (let i = 0; i < n; i++) {
                if (JSON.stringify(a.log[i]) !== JSON.stringify(b.log[i])) {
                    console.log(`  首条差异 @${i}\n   OLD: ${JSON.stringify(a.log[i])}\n   NEW: ${JSON.stringify(b.log[i])}`);
                    break;
                }
            }
        }
    }
}
console.log(`\n=== 对拍 ${total} 局: 一致 ${total - bad} / 不一致 ${bad} ===`);
const sample = runFull(New, 1, cases[0][0], cases[0][1]);
console.log(`样例: 胜方=${sample.winner} 回合=${sample.rounds} 用时=${sample.time}s 日志=${sample.log.length} 行`);
