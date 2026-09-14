// 数据层 · 装备定义(equipDef / EQUIP_DEFS / 分档工具)

// ---- 装备默认值填充(合并 EQUIPMENT 数值 + EQUIP_DETAILS 描述,一份数据) ----
//  装备分档(v4.7): tier = 'normal'(普通·占1点) / 'special'(特殊·不消耗装备点) / 'rare'(稀有·占2点)
function equipDef(overrides) {
    const d = {
        id: '', name: '', icon: '', nameFull: '', desc: '', statsText: [], rare: false, special: false, tier: 'normal', mechanics: [],
        cost: 1,               // 装备点占用: 普通 1 点 / 特殊 0 点 / 稀有 2 点
        unique: '',            // 唯一被动名(如 魔返/血赋/御击): 同名被动重复装备不叠加
        upgraded: false,       // v2.2: 升级装备(仅由「远征·装备升级点」获得, 不进入 EQUIP_LIST)
        from: '',              // 升级来源装备 id
        hpBonus: 0, hpFlat: 0, armorBonus: 0, mrBonus: 0, atkBonus: 0, atkFlat: 0,
        speedBonus: 0, speedFlat: 0, manaRegenBonus: 0, skillAmp: 0, extraDmg: 0,
        atkPctOfMaxHp: 0, lifesteal: 0, leechAll: 0, manaRefundPct: 0, critRateBonus: 0, atkTypeOverride: null, manaPerHitBonus: 0
    };
    Object.assign(d, overrides);
    return d;
}

const EQUIP_DEFS = {
    none:       equipDef({ id: 'none', name: '无', icon: '⬜', nameFull: '无', desc: '无装备效果', statsText: [], cost: 0, tier: 'none' }),
    // ---------- 普通装备(占 1 装备点) ----------
    belt:       equipDef({ id: 'belt', name: '生命腰带', icon: '🎗️', nameFull: '生命腰带 🎗️', desc: '增加生存能力（普通装备）',
                    statsText: ['生命值 +20%', '护甲 +5', '魔抗 +5'], hpBonus: 0.20, armorBonus: 5, mrBonus: 5 }),
    staff:      equipDef({ id: 'staff', name: '专业法杖', icon: '🪄', nameFull: '专业法杖 🪄', desc: '强化法术输出与攻击回蓝（限蓝条英雄）',
                    statsText: ['普攻命中回蓝 +1/次', 'SP +30%'], manaPerHitBonus: 1, skillAmp: 0.30 }),
    sword:      equipDef({ id: 'sword', name: '精钢剑', icon: '🗡️', nameFull: '精钢剑 🗡️', desc: '提升攻击与暴击（普通装备）',
                    statsText: ['攻击力 +20%', '暴击率 +10%'], atkBonus: 0.20, critRateBonus: 10 }),
    bow:        equipDef({ id: 'bow', name: '急速弓', icon: '🏹', nameFull: '急速弓 🏹', desc: '提升攻击与攻速（普通装备）',
                    statsText: ['AD +5', '攻速 +20%'], atkFlat: 5, speedBonus: 0.20 }),
    amulet:     equipDef({ id: 'amulet', name: '法力护符', icon: '📿', nameFull: '法力护符 📿', desc: '增强法力回复与技能循环（普通装备）',
                    statsText: ['自然回蓝 +1/秒', '唯一被动·魔返：释放技能回复25%最大蓝量（不叠加）'],
                    manaRegenBonus: 1.0, manaRefundPct: 0.25, unique: '魔返' }),
    scythe:     equipDef({ id: 'scythe', name: '吸血镰刀', icon: '🔪', nameFull: '吸血镰刀 🔪', desc: '增加攻击与吸血能力（普通装备）',
                    statsText: ['攻击力 +10', '吸血 +10%', '攻速 +0.1（固定）'], atkFlat: 10, lifesteal: 10, speedFlat: 0.1,
                    mechanics: ['scytheLife'] }),
    hammer:     equipDef({ id: 'hammer', name: '流星锤', icon: '🔨', nameFull: '流星锤 🔨', desc: '提升生命与攻击（普通装备）',
                    statsText: ['生命值 +100', '唯一被动·血赋：攻击力 +最大生命值1%（覆盖机制·最后计算，可吃到其他生命加成）'],
                    hpFlat: 100, atkPctOfMaxHp: 0.01, unique: '血赋' }),
    swift_staff: equipDef({ id: 'swift_staff', name: '迅捷法杖', icon: '💨', nameFull: '迅捷法杖 💨', desc: '疾风助势，出手更快、技能更强（普通装备）',
                    statsText: ['攻速 +0.25（固定）', 'SP +20%'], speedFlat: 0.25, skillAmp: 0.20 }),
    // ---------- 特殊装备(不消耗装备点) ----------
    star_staff: equipDef({ id: 'star_staff', name: '星星魔法杖', icon: '🌟', nameFull: '星星魔法杖 🌟', desc: '星辰之力，普攻转法术（特殊·不占装备点）', special: true, tier: 'special', cost: 0,
                    statsText: ['普通攻击转化为法术伤害', 'SP +70%', '⚠️ 特殊装备：不消耗装备点'],
                    skillAmp: 0.70, atkTypeOverride: 'magical', mechanics: ['starStaff'] }),
    thorn_mail: equipDef({ id: 'thorn_mail', name: '荆棘之甲', icon: '🌵', nameFull: '荆棘之甲 🌵', desc: '荆棘反伤，攻守兼备（特殊·不占装备点）', special: true, tier: 'special', cost: 0,
                    statsText: ['生命值 +250', '护甲 +10', '受到伤害后反弹 0.5×AR 的魔法伤害（受目标魔抗减免）',
                        '⚠️ 特殊装备：不消耗装备点'],
                    hpFlat: 250, armorBonus: 10, mechanics: ['thornMail'] }),
    bear_claw:  equipDef({ id: 'bear_claw', name: '熊王爪', icon: '🐾', nameFull: '熊王爪 🐾', desc: '熊王之力，撕裂护甲（特殊·不占装备点）', special: true, tier: 'special', cost: 0,
                    statsText: ['装备条件：英雄基础生命值 ≥ 1700', '攻击力 +25', '每次攻击使目标护甲 -1（可叠加，最低 0）',
                        '⚠️ 特殊装备：不消耗装备点'],
                    atkFlat: 25, mechanics: ['bearClaw'] }),
    crystal:    equipDef({ id: 'crystal', name: '恢复水晶', icon: '💎', nameFull: '恢复水晶 💎', desc: '周期回复，稳定续航（特殊·不占装备点）', special: true, tier: 'special', cost: 0,
                    statsText: ['每 2 秒回复 40 点生命值', '⚠️ 特殊装备：不消耗装备点'],
                    mechanics: ['crystalRegen'] }),
    // ---------- 稀有装备(占 2 装备点) ----------
    sunshield:  equipDef({ id: 'sunshield', name: '太阳圣盾', icon: '☀️', nameFull: '太阳圣盾 ☀️', desc: '圣光庇护，攻守兼备（稀有·占2点）', rare: true, tier: 'rare', cost: 2,
                    statsText: ['护甲 +8', '魔抗 +8', '唯一被动·御击：攻击附带 (护甲+魔抗) 的额外魔法伤害（覆盖机制）',
                        '⚠️ 稀有装备：占用 2 装备点（其余槽位须空置）'],
                    armorBonus: 8, mrBonus: 8, mechanics: ['sunShield'], unique: '御击' }),
    cloak:      equipDef({ id: 'cloak', name: '守护斗篷', icon: '🧥', nameFull: '守护斗篷 🧥', desc: '绝境守护，全能吸血（稀有·占2点）', rare: true, tier: 'rare', cost: 2,
                    statsText: ['生命值 +350', '生命值低于30%时获得 (100+2×攻击力) 护盾', '触发后本场永久获得 10% 全能吸血',
                        '⚠️ 稀有装备：占用 2 装备点（其余槽位须空置）'],
                    hpFlat: 350, mechanics: ['cloakGuard'] }),
    jade_blade: equipDef({ id: 'jade_blade', name: '玉面刃', icon: '💠', nameFull: '玉面刃 💠', desc: '锋锐玉刃，随血量转换形态（稀有·占2点）', rare: true, tier: 'rare', cost: 2,
                    statsText: ['攻击力 +15', '攻速 +0.15（固定）', '生命值高于50%：攻击力提升至 +30', '生命值低于50%：固定攻速提升至 +0.35',
                        '⚠️ 稀有装备：占用 2 装备点'],
                    atkFlat: 15, speedFlat: 0.15, mechanics: ['jadeBlade'] }),
    // ---------- 升级装备(v2.2 远征·装备升级点): v2.6 起已加入 EQUIP_LIST, 普通对战装备栏可直接选用 ----------
    hammer_up:  equipDef({ id: 'hammer_up', name: '碎岩流星锤', icon: '🪨', nameFull: '碎岩流星锤 🪨', upgraded: true, tier: 'upgrade', cost: 1, from: 'hammer',
                    desc: '流星锤 · 升级版：碎岩之力（升级装备·占 1 装备点）',
                    statsText: ['生命值 +100', '无视敌方 50% 护甲（物理攻击）', '唯一被动·血赋：攻击力 +最大生命值1.5%（覆盖机制·最后计算）',
                        '🔧 升级装备：远征模式由流星锤升级获得'],
                    hpFlat: 100, atkPctOfMaxHp: 0.015, unique: '血赋', mechanics: ['rockHammer'] }),
    bow_up:     equipDef({ id: 'bow_up', name: '霜天风暴弓', icon: '🌪️', nameFull: '霜天风暴弓 🌪️', upgraded: true, tier: 'upgrade', cost: 1, from: 'bow',
                    desc: '急速弓 · 升级版：霜天风暴（升级装备·占 1 装备点）',
                    statsText: ['攻击力 +10', '攻速 +25%', '攻击附带寒冰印记：印记单位攻速 -10%（不管多少层）',
                        '寒冰印记叠至 10 层 → 冻结目标 1.5 秒并清空印记', '🔧 升级装备：远征模式由急速弓升级获得'],
                    atkFlat: 10, speedBonus: 0.25, mechanics: ['frostMark'] }),
    sword_up:   equipDef({ id: 'sword_up', name: '幸运精钢剑', icon: '🍀', nameFull: '幸运精钢剑 🍀', upgraded: true, tier: 'upgrade', cost: 1, from: 'sword',
                    desc: '精钢剑 · 升级版：幸运之刃（升级装备·占 1 装备点）',
                    statsText: ['攻击力 +25%', '暴击率 +20', '暴击后额外获得 1 枚金币（远征模式）',
                        '🔧 升级装备：远征模式由精钢剑升级获得'],
                    atkBonus: 0.25, critRateBonus: 20, mechanics: ['luckySword'] }),
    staff_up:   equipDef({ id: 'staff_up', name: '灵能大法杖', icon: '🔯', nameFull: '灵能大法杖 🔯', upgraded: true, tier: 'upgrade', cost: 1, from: 'staff',
                    desc: '专业法杖 · 升级版：灵能共鸣（升级装备·占 1 装备点·限蓝条英雄）',
                    statsText: ['普攻命中回蓝 +1.5/次', 'SP +50%', '每释放一次蓝技能 SP +10（最多累计 +100）',
                        '🔧 升级装备：远征模式由专业法杖升级获得'],
                    manaPerHitBonus: 1.5, skillAmp: 0.5, mechanics: ['psionicStaff'] }),
    scythe_up:  equipDef({ id: 'scythe_up', name: '嗜血狂镰', icon: '🩸', nameFull: '嗜血狂镰 🩸', upgraded: true, tier: 'upgrade', cost: 1, from: 'scythe',
                    desc: '吸血镰刀 · 升级版：嗜血之镰（升级装备·占 1 装备点）',
                    statsText: ['攻击力 +20', '全能吸血 +15%', '攻速 +0.2（固定）',
                        '被动·嗜血：每攻击一次额外获得 0.5% 全能吸血（最多额外 +15%）',
                        '🔧 升级装备：远征模式由吸血镰刀升级获得'],
                    atkFlat: 20, leechAll: 15, speedFlat: 0.2, mechanics: ['bloodScythe'] })
};
// 顺序 = 普通 → 特殊 → 稀有 → 升级(与「装备大全」分栏、装备下拉分组一致)
// v2.7: 肉鸽模式的 5 件升级装备已并入本列表 → 普通对战的装备栏(装备下拉 / 装备大全)可直接选用
const EQUIP_LIST = ['none',
    'belt', 'staff', 'sword', 'bow', 'amulet', 'scythe', 'hammer', 'swift_staff',
    'star_staff', 'thorn_mail', 'bear_claw', 'crystal',
    'sunshield', 'cloak', 'jade_blade',
    'hammer_up', 'bow_up', 'sword_up', 'staff_up', 'scythe_up'];

// ---- 装备升级表(v2.2 远征·装备升级点): 仅以下 5 件基础装备可升级 ----
const EQUIP_UPGRADES = { hammer: 'hammer_up', bow: 'bow_up', sword: 'sword_up', staff: 'staff_up', scythe: 'scythe_up' };
const EQUIP_UPGRADED_LIST = ['hammer_up', 'bow_up', 'sword_up', 'staff_up', 'scythe_up'];
const EQUIP_UPGRADE_COST = 10;      // 每次升级消耗金币
function equipUpgradeTarget(id) { return EQUIP_UPGRADES[id] || null; }

// ---- 装备分档工具(UI 分栏 / 下拉分组 / 徽章共用) ----
const EQUIP_TIERS = [
    { key: 'normal',  title: '普通装备', note: '占 1 装备点' },
    { key: 'special', title: '特殊装备', note: '不消耗装备点' },
    { key: 'rare',    title: '稀有装备', note: '占 2 装备点' },
    { key: 'upgrade', title: '升级装备', note: '占 1 装备点' }
];
function equipTierOf(id) {
    const e = EQUIP_DEFS[id];
    if (!e) return 'normal';
    return e.tier || (e.rare ? 'rare' : (e.special ? 'special' : 'normal'));
}
function equipTierTitle(tier) {
    for (let i = 0; i < EQUIP_TIERS.length; i++) if (EQUIP_TIERS[i].key === tier) return EQUIP_TIERS[i].title;
    return '';
}
function equipListOfTier(tier) {
    return EQUIP_LIST.filter(id => id !== 'none' && equipTierOf(id) === tier);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { equipDef, EQUIP_DEFS, EQUIP_LIST, EQUIP_UPGRADES, EQUIP_UPGRADED_LIST, EQUIP_UPGRADE_COST, equipUpgradeTarget, EQUIP_TIERS, equipTierOf, equipTierTitle, equipListOfTier };
}
