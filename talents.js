// 数据层 · 天赋定义(talentDef / TALENT_DEFS / 归一化工具)
//  规则: 每英雄最多 CONFIG.talent.maxSlots 个, 不可重复; 传说至多 CONFIG.talent.maxLegendary 个
//  effects 为数据驱动字段, 引擎 applyTalents / 星落机制只读不写死数值

function talentDef(overrides) {
    const d = {
        id: '', heroId: '', tier: 'common', name: '', icon: '✨', desc: '',
        effects: []
    };
    Object.assign(d, overrides);
    return d;
}

const TALENT_TIERS = [
    { key: 'common', name: '普通', color: '#8e9aaf' },
    { key: 'rare', name: '稀有', color: '#3d8bfd' },
    { key: 'legendary', name: '传说', color: '#e67e22' }
];

const TALENT_DEFS = {
    // ---- 魔剑士(v2.9 基准池) ----
    ms_might: talentDef({
        id: 'ms_might', heroId: 'magicSwordsman', tier: 'common', name: '威能', icon: '💥',
        desc: '星落的伤害倍率提升到 0.75（原 0.6）',
        effects: [{ type: 'starfallAdRatio', value: 0.75 }]
    }),
    ms_charge: talentDef({
        id: 'ms_charge', heroId: 'magicSwordsman', tier: 'common', name: '蓄力', icon: '⚡',
        desc: '星落充能需求从 100 降至 80，并获得 +0.1 固定攻速',
        effects: [
            { type: 'starfallMaxCharge', value: 80 },
            { type: 'speedFlat', value: 0.1 }
        ]
    }),
    ms_starfall_crit: talentDef({
        id: 'ms_starfall_crit', heroId: 'magicSwordsman', tier: 'rare', name: '星陨', icon: '🌟',
        desc: '暴击率 +25；星落可以暴击，暴伤吃暴击倍率属性',
        effects: [
            { type: 'critRate', value: 25 },
            { type: 'starfallCanCrit' }
        ]
    }),
    ms_origin: talentDef({
        id: 'ms_origin', heroId: 'magicSwordsman', tier: 'legendary', name: '原初之力', icon: '🌌',
        desc: '开局直接进入星落期；结束后照常清空充能并重新积累',
        effects: [{ type: 'starfallOnStart' }]
    })
};

const TALENT_LIST = Object.keys(TALENT_DEFS);

const TALENT_LIST_BY_HERO = (function () {
    const map = {};
    TALENT_LIST.forEach(id => {
        const t = TALENT_DEFS[id];
        if (!map[t.heroId]) map[t.heroId] = [];
        map[t.heroId].push(id);
    });
    // 展示顺序: 普通 → 稀有 → 传说
    const tierOrder = { common: 0, rare: 1, legendary: 2 };
    Object.keys(map).forEach(h => {
        map[h].sort((a, b) => (tierOrder[TALENT_DEFS[a].tier] || 0) - (tierOrder[TALENT_DEFS[b].tier] || 0));
    });
    return map;
})();

function talentsOfHero(heroId) {
    const ids = TALENT_LIST_BY_HERO[heroId] || [];
    return ids.map(id => TALENT_DEFS[id]).filter(Boolean);
}

function talentTierOf(id) {
    const t = TALENT_DEFS[id];
    return t ? t.tier : null;
}

// 校验/归一化: 去重 → 过滤非本命/不存在 → 传说上限 → 截断槽位
function normalizeTalentIds(talentIds, heroId) {
    if (!Array.isArray(talentIds) || !talentIds.length) return [];
    const maxSlots = (typeof CONFIG !== 'undefined' && CONFIG.talent) ? CONFIG.talent.maxSlots : 3;
    const maxLeg = (typeof CONFIG !== 'undefined' && CONFIG.talent) ? CONFIG.talent.maxLegendary : 1;
    const seen = {};
    const out = [];
    let leg = 0;
    for (let i = 0; i < talentIds.length; i++) {
        const id = talentIds[i];
        if (!id || seen[id]) continue;
        const def = TALENT_DEFS[id];
        if (!def || def.heroId !== heroId) continue;
        if (def.tier === 'legendary') {
            if (leg >= maxLeg) continue;
            leg++;
        }
        seen[id] = true;
        out.push(id);
        if (out.length >= maxSlots) break;
    }
    return out;
}

function hasTalent(unit, id) {
    if (!unit || !id) return false;
    if (Array.isArray(unit.talentIds) && unit.talentIds.indexOf(id) >= 0) return true;
    return false;
}

function hasTalentType(unit, type) {
    if (!unit || !Array.isArray(unit.talentIds)) return false;
    for (let i = 0; i < unit.talentIds.length; i++) {
        const def = TALENT_DEFS[unit.talentIds[i]];
        if (!def || !def.effects) continue;
        for (let j = 0; j < def.effects.length; j++) {
            if (def.effects[j].type === type) return true;
        }
    }
    return false;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        talentDef, TALENT_TIERS, TALENT_DEFS, TALENT_LIST, TALENT_LIST_BY_HERO,
        talentsOfHero, talentTierOf, normalizeTalentIds, hasTalent, hasTalentType
    };
}
