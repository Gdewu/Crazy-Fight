// 数据层 · 配置常量(由 game.js 拆分,内容逐行一致,行为零变化)
// 加载顺序: config.js → heroes.js → equips.js → mechanics.js → game.js

// ============================================================
//  ① 配置常量(魔法数字集中抽取,行为零变化)
// ============================================================
const CONFIG = {
    log: { max: 200 },                                 // 战斗记录最大保留行数(3v3 日志量约为单挑 3 倍)
    auto: { step: 0.05, maxStepsPerFrame: 40, deltaClamp: 0.1 },   // 固定步长/每帧步数上限/真实delta钳制
    sim: { timeout: 300, defaultSeed: 20260828 },      // 批量模拟: 平局超时 + 默认固定种子
    // 阵型: 3 列 × 2 行 = 6 个站位格(前排 3 格 + 后排 3 格);每队最多 3 人,可自由摆放在任意格子
    teams: { minPerTeam: 1, maxPerTeam: 3, cols: 3, rows: 2, cells: 6 },
    cloak: { thresholdPct: 30, baseShield: 100, adRatio: 2, omniLeechPct: 10 }, // 守护斗篷(绝境守护)
    crystal: { interval: 2, heal: 40 },                // 恢复水晶(v4.7 重做: 每2秒回复40生命值)
    thornMail: { reflectRatio: 0.5 },                  // 荆棘之甲: 受到伤害后反弹 0.5×AR 的魔法伤害
    bearClaw: { minBaseHp: 1700, armorShred: 1 },      // 熊王爪: 英雄基础生命≥1700方可装备; 每次攻击使目标护甲-1
    dualFist: { chargeSec: 6, durationSec: 9, multiplier: 0.75 },  // 格斗家双拳(v4.7: 充能6s/持续9s)
    hunter: { armorPen: 10 },                          // 猎人被动: 无视敌方 10 点护甲
    rangerBolt: { dmg: 6 },                            // 游侠被动 · 破魔箭: 攻击附带 6 点魔法伤害
    mage: { castTime: 0.5 },                           // v2.7 法师 · 法术爆发施法时间(0.5s 后结算伤害)
    swordAura: { chargeSec: 8, stunSec: 1 },           // 剑士 · 剑气(8秒充能: 下次攻击双倍伤害+波及同行全体+同行眩晕1s)
    paladin: { durationSec: 5, healPerSec: 30, resistBonus: 12 },  // 圣骑 · 圣光(5秒持续: 每秒回30 + 双抗+12)
    // v2.5 猎人 · 猎网(取代「贯穿打击」): 满蓝释放, 对敌方攻击力最高的单位 150 物理伤害 + 攻速 -20% 持续 3s
    hunterNet: { dmg: 150, speedDownPct: 0.20, durationSec: 3 },
    // v2.5 魔剑士 · 魔法充能 / 星落: 每次攻击 +10 充能; 满 100 后攻击模式改为
    //      每 0.5s 对随机敌人造成 0.6×攻击力 魔法伤害, 持续 10s(首次被命中的单位眩晕 1s), 结束后清空充能重新积累
    starfall: { chargePerHit: 10, maxCharge: 100, interval: 0.5, durationSec: 10, adRatio: 0.6, stunSec: 1 },   // v2.7: 首次命中眩晕 0.5s → 1s
    // v2.5 长枪手 · 独守阵线(后排且前排无己方单位 → +20 攻击力 & 无视 10 点护甲)
    //            三连突刺(每 7s 蓄力 1s → 对敌方同列每个单位造成 3 连击)
    lancer: { rowAtkBonus: 20, armorPen: 10, cdInterval: 7, windupSec: 1, hits: 3 },
    // v2.5 BOSS · 幽魂(B级): 随机 2 目标魔法普攻 / 首次死亡 2s 免疫后满血复活+30攻 /
    //            敌方每阵亡 1 个单位 → 回复 2000 生命(可突破上限) 且攻击力 +30
    ghost: { atkTargets: 2, reviveSec: 2, reviveAtk: 30, killHeal: 2000, killAtk: 30 },
    equip: { points: 2, slots: 3 },                    // 装备容量: 每角色 2 装备点(普通1/特殊0/稀有2);UI 3 槽(挑战预设不受限)
    // 战士 · 铁血意志(被动) + 铁血破阵(大招,满层自动触发·整局1次;回复=大招总伤害的30%)
    ironWill: { dmgPerStack: 200, atkPerStack: 3, atkBonus: 3, resistBonus: 1, maxStacks: 12,
        ultAtkRatio: 1.2, ultLostHpRatio: 0.10, ultHealRatio: 0.30 },
    lifeStrike: { bonusDmg: 120, healPct: 0.10, minHeal: 50 },     // 坦克 · 生命打击(下次普攻+120魔伤+回复已损生命10%)
    fairySpirit: { summonInterval: 5, maxCount: 7, atkPerSpirit: 5, spiritDmg: 10 },  // 精灵 · 小精灵(v2.6: 单只魔伤 20→10)
    bossBear: { phase2Hp: 5000, phase2Atk: 40, phase2Speed: 1.5, phase2Leech: 15, phase2Resist: 15,
        cdInterval: 6, cdDmg: 160, cdDmg2: 240, stunSec: 1, stunSec2: 2,
        rallyTime: 32, rallyHeal: 1000, rallyResist: 5 },           // 挑战Boss · 大熊(v2.6: 二形态额外 +15 双抗)
    // 挑战Boss · 大魔法师(v2.6): 满蓝1.5s前摇(期间不回蓝/被眩晕则取消重来) → 随机主目标360魔伤(魔抗永久-2)+其余180;
    // 蓝机制: 自然回蓝1/秒 + 受击回蓝1/次 + 每损失200生命回蓝+1;「秘法强化」被动已移除
    archmage: { windupSec: 1.5, mainDmg: 360, sideDmg: 180, mrShred: 2, hpLossMana: 200 },
    // 挑战Boss · 黑暗游侠(v2.6, A级): 对位锁定(击杀后才换下一个单位) + 被动1每次攻击+1攻击力(层数无上限,被控制-10层)
    //   被动2每 5s 自获 1 层「黑暗护盾」(免疫一次主动技能伤害;免疫持续伤害时其后续跳数一并抵消),击杀单位立刻+1层
    darkRanger: { atkPerHit: 1, stunLoseStacks: 10, shieldInterval: 5, killShieldStacks: 1 },

    revolver: { capacity: 6, reloadSec: 2 },           // 枪手 · 左轮弹匣(6发打空→2秒换弹)
    evolution: { interval: 5.5, maxStages: 4, healPerEvolve: 100, stages: [
        { atk: 8, speed: 0.1 },
        { atk: 8, speed: 0.1 },
        { atk: 8, speed: 0.1 },
        { atk: 15, speed: 0.3, armor: 13, mr: 13, omniLeech: 20 }   // v4.4: 移除「普攻回血25」
    ] },
    holyStrike: { chargeSec: 8 },
    berserk: { threshold: 0.5, atkMult: 1.2, lifestealPct: 15 },   // 浴血奋战
    spear: { firstAttacks: 3, bonusAtk: 50 },          // 长矛手真实打击
    assassinate: { threshold: 0.5, extraDmg: 50 },     // 暗杀
    lastStand: { reviveHp: 100 },                      // 绝境求生
    // 诅咒: 对 BOSS 单位 生命上限按 min(最大生命, bossMaxHpCap) 折算, 单次(每秒)3% 部分不超过 bossPctCap
    curse: { duration: 4, pctPerSec: 0.03, basePerSec: 20, healReduce: 0.5,
        bossMaxHpCap: 5000, bossPctCap: 150 },
    mana: { tickInterval: 0.5, globalRegen: 0.5, unitRegenFactor: 0.5 },      // 自然回蓝1/秒(全局)+装备回蓝(专业法杖/法力护符),英雄基础回蓝=0
    manaRefund: { pct: 0.25 },                         // 法力护符
    critComp: { streak: 4 },                           // 枪手: 连续4次未暴 → 第5次必暴
    // ---- v2.2 升级装备(远征·装备升级点获得) ----
    rockHammer: { armorPenPct: 0.5 },                  // 碎岩流星锤: 物理攻击无视敌方 50% 护甲
    // v2.7 嗜血狂镰(吸血镰刀升级): 每攻击一次全能吸血 +0.5%(最多额外 +15%)
    bloodScythe: { leechPerHit: 0.5, maxGain: 15 },
    frostMark: { maxStacks: 10, speedDownPct: 0.10, freezeSec: 1.5 },   // 霜天风暴弓: 寒冰印记(-10%攻速 / 10层冻结1.5s)
    psionicStaff: { spPerCast: 10, maxSp: 100 },       // 灵能大法杖: 每次释放蓝技能 SP+10(最多+100)
    maxAttackTime: 0
};

// ---- Node 兼容导出(浏览器中为全局 const, 仅 require 场景需要导出) ----
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG };
}
