// 数据层 · 英雄定义(heroDef / HERO_DEFS / HERO_LIST / HERO_NAMES / HERO_INTRO_LIST)

// ---- 英雄默认值填充:英雄定义只写差异 ----
function heroDef(overrides) {
    const d = {
        id: '', name: '', emoji: '', maxHp: 0, atk: 0, speed: 1, armor: 0, mr: 0, atkType: 'physical',
        hasMana: false, maxMana: 0, startMana: 0, manaRegen: 0, manaPerHit: 0, manaPerHitTaken: 0, manaPerLoss: 0,
        skillDmg: 0, cdName: '', cooldownDuration: 0, cooldownExtraDmg: 0, cooldownHeal: 0,
        manaMechanic: '无蓝条', critRate: 0, critMulti: 2.0, desc: '', mechanics: []
    };
    Object.assign(d, overrides);
    return d;
}

const HERO_DEFS = {
    warrior: heroDef({ id: 'warrior', name: '勇士', emoji: '🪓', maxHp: 1700, atk: 70, speed: 1.35, armor: 15, mr: 10,
        desc: '浴血奋战：生命值低于50%时发动（攻击+20%，吸血15%）；发动后除非生命值回满，否则效果不会结束',
        skillName: '浴血奋战', mechanics: ['berserk'] }),
    knight: heroDef({ id: 'knight', name: '战士', emoji: '🗡️', maxHp: 1800, atk: 60, speed: 1.2, armor: 15, mr: 15,
        desc: '铁血意志：每承受200伤害或每3次攻击+1层印记（每层+3攻/+1双抗，最多12层）；铁血破阵：满12层自动触发（整局1次），对敌方全体前排造成 1.2×攻击力 + 目标已损失生命10% 的物理伤害，并回复该技能总伤害的30%生命',
        skillName: '铁血意志', mechanics: ['ironWill'] }),
    ranger: heroDef({ id: 'ranger', name: '游侠', emoji: '🏹', maxHp: 1480, atk: 50, speed: 1.8, armor: 10, mr: 10,
        desc: '绝境求生：免死一次，回复至100HP；被动：攻击附带6点魔法伤害', skillName: '绝境求生', mechanics: ['lastStand', 'rangerBolt'] }),
    gunner: heroDef({ id: 'gunner', name: '枪手', emoji: '🔫', maxHp: 1444, atk: 100, speed: 1.2, armor: 10, mr: 10,
        desc: '左轮弹匣：6发打空后进入2秒换弹（期间无法攻击）；弱点锁定：换弹后锁定当前生命值最低的敌人，打空前不换目标；攻速锁定1.2——装备提供的攻速按每0.05转化为+1攻击力（四舍五入）',
        skillName: '左轮弹匣', mechanics: ['revolver'] }),
    mage: heroDef({ id: 'mage', name: '法师', emoji: '🔮', maxHp: 1580, atk: 55, speed: 1.1, armor: 10, mr: 20, atkType: 'magical',
        hasMana: true, maxMana: 16, startMana: 8, manaPerHit: 1, skillDmg: 280,
        manaMechanic: 'a模板：自然回蓝1/秒（普攻命中回蓝+1/次）',
        desc: '法术爆发：满16蓝自动释放，0.5秒施法时间后造成280法伤（吃SP）；已释放的技能不会被打断',
        skillName: '法术爆发', mechanics: ['manaBurst'] }),
    tank: heroDef({ id: 'tank', name: '坦克', emoji: '🛡️', maxHp: 2500, atk: 52, speed: 0.9, armor: 20, mr: 15,
        hasMana: true, maxMana: 20, startMana: 0, manaPerHitTaken: 1,
        manaMechanic: 'b模板：自然回蓝1/秒（受击回蓝+1/次）',
        desc: '生命打击：满20蓝蓄力，下一次普攻额外造成120点魔法伤害，并回复自身已损失生命值的10%（最低回复50）',
        skillName: '生命打击', mechanics: ['lifeStrike'] }),
    warlock: heroDef({ id: 'warlock', name: '巫师', emoji: '🧙', maxHp: 1650, atk: 50, speed: 1.0, armor: 15, mr: 15, atkType: 'magical',
        hasMana: true, maxMana: 20, startMana: 10, manaPerHit: 1,
        manaMechanic: 'a模板：自然回蓝1/秒（普攻命中回蓝+1/次）',
        desc: '诅咒：每秒3%+20基础魔法伤害（吃SP），持续4秒，使目标重伤（一切回复减半），可叠加刷新；对BOSS单位：生命上限按 min(最大生命, 5000) 折算，单次3%伤害不超过150',
        skillName: '诅咒', mechanics: ['curse'] }),
    evo: heroDef({ id: 'evo', name: '进化兽', emoji: '🐾', maxHp: 1900, atk: 46, speed: 1.0, armor: 12, mr: 12,
        desc: '进化：每5.5秒进化，最多4次；第4次额外+13双抗并获20%全能吸血', skillName: '进化', mechanics: ['evolution'] }),
    spearman: heroDef({ id: 'spearman', name: '长矛手', emoji: '🔱', maxHp: 1700, atk: 100, speed: 1.0, armor: 10, mr: 10,
        desc: '被动：前三发攻击造成真实伤害且攻击力+50', skillName: '真实打击', mechanics: ['trueStrike'] }),
    assassin: heroDef({ id: 'assassin', name: '刺客', emoji: '🗡️', maxHp: 1500, atk: 80, speed: 1.2, armor: 15, mr: 10,
        desc: '暗杀：优先攻击后排单位；对HP<50%目标额外造成50物理伤害', skillName: '暗杀', mechanics: ['assassinate'] }),
    hunter: heroDef({ id: 'hunter', name: '猎人', emoji: '🏹', maxHp: 1780, atk: 80, speed: 1.0, armor: 18, mr: 12,
        hasMana: true, maxMana: 24, startMana: 5, manaPerHit: 1,
        manaMechanic: 'a模板：自然回蓝1/秒（普攻命中回蓝+1/次），不锁蓝',
        desc: '猎网：满24蓝释放，对敌方攻击力最高的单位造成150点物理伤害，并使其攻速降低20%（持续3秒）；被动无视10点护甲', skillName: '猎网', mechanics: ['hunterNet'] }),
    fighter: heroDef({ id: 'fighter', name: '格斗家', emoji: '👊', maxHp: 1600, atk: 70, speed: 1.2, armor: 15, mr: 15,
        cdName: '双拳模式', cooldownDuration: 6,
        desc: '双拳模式：6秒后开启，持续9秒，攻击变为75%攻击力的2连击', skillName: '双拳模式', mechanics: ['dualFist'] }),
    // ---- v4.3 新增英雄 ----
    swordsman: heroDef({ id: 'swordsman', name: '剑士', emoji: '⚔️', maxHp: 1660, atk: 70, speed: 1.0, armor: 15, mr: 15,
        cdName: '剑气', cooldownDuration: 8,
        desc: '剑气：每8秒后下一次攻击造成双倍伤害，同时攻击同行所有敌人（均受双倍伤害），并眩晕同行全体1秒', skillName: '剑气', mechanics: ['swordAura'] }),
    paladin: heroDef({ id: 'paladin', name: '圣骑', emoji: '⚜️', maxHp: 2200, atk: 40, speed: 1.0, armor: 20, mr: 20,
        hasMana: true, maxMana: 20, startMana: 0, manaPerHitTaken: 1,
        manaMechanic: 'b模板：自然回蓝1/秒（受击回蓝+1/次）',
        desc: '圣光：满20蓝释放，5秒内每秒回复30生命且双抗+12，技能释放完毕才可再次释放', skillName: '圣光', mechanics: ['paladinHoly'] }),
    // ---- v4.5 新增 ----
    fairy: heroDef({ id: 'fairy', name: '精灵', emoji: '🌿', maxHp: 1800, atk: 35, speed: 0.8, armor: 10, mr: 22,
        desc: '自然滋养：普攻改为治疗己方生命值最低（含自身、须已损血）的单位，回复自身攻击力的生命（全员满血时空过）；灵光召唤：开局没有小精灵（从0只开始叠加），每5s召唤1只（上限7只），每只+5攻击力；小精灵每1s按对位规则攻击一个敌人造成10魔法伤害，不会被击败，精灵阵亡后停止',
        skillName: '自然滋养', mechanics: ['fairyHeal', 'spiritSummon'] }),
    // ---- v2.5 新增英雄 ----
    magicSwordsman: heroDef({ id: 'magicSwordsman', name: '魔剑士', emoji: '🌠', maxHp: 1650, atk: 65, speed: 1.2, armor: 15, mr: 18,
        desc: '魔法充能：每次攻击获得10点魔法充能；充能满100点后进入「星落」：攻击模式改为每0.5秒对随机敌方单位造成 0.6×攻击力 的魔法伤害，持续10秒（首次被星落命中的单位眩晕1秒）；星落结束后失去全部充能，需重新攻击积累',
        skillName: '星落', mechanics: ['starfall'] }),
    lancer: heroDef({ id: 'lancer', name: '长枪手', emoji: '🪖', maxHp: 1800, atk: 80, speed: 0.8, armor: 20, mr: 15,
        cdName: '三连突刺', cooldownDuration: 7,
        desc: '独守阵线（被动）：位于后排且前排没有己方单位时，攻击力+20且无视敌人10点护甲（生效时面板攻击力同步显示并高亮）；三连突刺：每7秒后蓄力1秒，对敌方同列的所有单位造成3连击',
        skillName: '三连突刺', mechanics: ['lancerStrike'] }),
    // ---- BOSS 单位(v2.6 起分等级: A级 熊王/黑暗游侠, B级 大魔法师/幽魂) ----
    bossBear: heroDef({ id: 'bossBear', name: '熊王', emoji: '🐻', maxHp: 12000, atk: 80, speed: 1.0, armor: 20, mr: 20, isBoss: true, bossGrade: 'A',
        desc: '【A级BOSS】狂乱挥击：普通攻击随机选取敌人；裂地重击：每6s对所有敌人造成160物理伤害并眩晕1s；被动·狂暴：生命低于5000进入二形态（攻击提升至120/攻速1.5/+15物理吸血/双抗+15，重击伤害240、眩晕2s）；被动·坚毅：战斗第32s回复1000生命并获得5点双抗',
        skillName: '裂地重击', mechanics: ['bossBear'] }),
    archmage: heroDef({ id: 'archmage', name: '大魔法师', emoji: '🧿', maxHp: 10000, atk: 80, speed: 1.0, armor: 15, mr: 25, atkType: 'magical', isBoss: true, bossGrade: 'B',
        hasMana: true, maxMana: 35, startMana: 5, manaPerHit: 1, manaPerHitTaken: 1,
        manaMechanic: '秘法模板：自然回蓝1/秒＋普攻命中回蓝+1/次＋受击回蓝+1/次＋每损失200生命回蓝+1（前摇期间不回蓝）',
        desc: '【B级BOSS】奥术飞弹：普通攻击为法术伤害且随机选取敌人；秘法风暴：满35蓝进入1.5s前摇（期间不回蓝，被眩晕则取消重来），对随机主目标造成360魔法伤害并将其魔抗永久-2，其余敌人各受180；被动·秘法涌动：每损失200生命回蓝+1',
        skillName: '秘法风暴', mechanics: ['archmage'] }),
    // ---- BOSS: 幽魂(B级, v2.6: 攻速0.8 / 攻击70) ----
    ghost: heroDef({ id: 'ghost', name: '幽魂', emoji: '👻', maxHp: 6000, atk: 70, speed: 0.8, armor: 30, mr: 15, atkType: 'magical', isBoss: true, bossGrade: 'B',
        desc: '【B级BOSS】撕裂之魂：每次随机攻击2个敌方单位（魔法伤害）；被动·不灭怨念：首次死亡后2秒内免疫一切伤害，随后满血复活且攻击力+30；被动·噬魂：敌方场上有单位被击败后，幽魂立刻恢复2000生命（可突破生命上限）且攻击力+30',
        skillName: '不灭怨念', mechanics: ['ghost'] }),
    // ---- v2.6 新增 BOSS: 黑暗游侠(A级) ----
    darkRanger: heroDef({ id: 'darkRanger', name: '黑暗游侠', emoji: '🏹', maxHp: 8000, atk: 50, speed: 2.0, armor: 30, mr: 30, isBoss: true, bossGrade: 'A',
        desc: '【A级BOSS】黑暗箭雨：按对位规则锁定一名敌人，只有将其击败后才会转而攻击下一个单位；被动·黑暗汲取：每次攻击获得 1 层黑暗之力（每层+1攻击力，无上限），被控制技能命中时失去 10 层；被动·黑暗护盾：每 5 秒获得 1 层黑暗护盾，免疫敌方一次主动技能伤害（若免疫的是诅咒这类持续伤害，其后续跳数也不再造成伤害），攻击技能附带的控制效果同样会被护盾挡下；被护盾挡下的技能不会减少黑暗之力层数；击败一个单位后立刻再获得 1 层（可叠加）',
        skillName: '黑暗护盾', mechanics: ['darkRanger'] })
};
const HERO_LIST = ['warrior', 'knight', 'ranger', 'gunner', 'mage', 'tank', 'warlock', 'evo', 'spearman', 'assassin', 'hunter', 'fighter', 'swordsman', 'paladin', 'fairy', 'magicSwordsman', 'lancer'];
const HERO_NAMES = { warrior: '勇士', knight: '战士', ranger: '游侠', gunner: '枪手', mage: '法师', tank: '坦克', warlock: '巫师', evo: '进化兽', spearman: '长矛手', assassin: '刺客', hunter: '猎人', fighter: '格斗家', swordsman: '剑士', paladin: '圣骑', fairy: '精灵', magicSwordsman: '魔剑士', lancer: '长枪手' };
// 人物介绍列表 = 全部可选英雄 + Boss 单位
const HERO_INTRO_LIST = HERO_LIST.concat(['bossBear', 'archmage', 'ghost', 'darkRanger']);

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { heroDef, HERO_DEFS, HERO_LIST, HERO_NAMES, HERO_INTRO_LIST };
}
