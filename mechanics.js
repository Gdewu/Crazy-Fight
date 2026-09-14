// 数据层 · 机制注册表 MECHANICS(数据驱动核心)

// ============================================================
//  机制注册表(数据驱动核心)
//  ------------------------------------------------------------
//  钩子(全部可选):
//   onBeforeHit(unit, enemy, ctx, world)  每次普攻的每一击开始(攻击形态/长矛/进化回血/浴血/星杖/双拳)
//   onDefenseCalc(unit, enemy, ctx, world)  防御计算阶段(猎人破甲),发生在 dmg=atk*(1-防御) 之前
//   onDamageCalc(unit, enemy, ctx, world)  基础伤害算完后附加(太阳圣盾/暗杀)
//   onCritRoll(unit, ctx)                  暴击判定前修改 ctx.threshold(枪手补偿)
//   onPostCrit(unit, enemy, ctx, world)    暴击判定之后附加(圣光打击: 附加伤害+回血——不吃暴击,吃SP)
//   onHitDealt(unit, enemy, ctx, world)    伤害结算后(吸血)
//   onDamaged(unit, source, ctx, world)    applyDamageTo 内、护盾吸收+扣血之后(守护斗篷,所有伤害来源共用)
//   onCast(unit, world)                    满蓝且未被眩晕时施放(法师爆发/铁壁反击/诅咒/狩猎标记)
//   onTick(unit, world, dt, opts)          世界步进(进化/圣光充能/双拳/水晶;诅咒DoT由引擎对目标逐跳结算)
//   onDeathCheck(unit, killer)             handleDeath 中 hp≤0 时,返回 true 表示救回(绝境求生)
//   statusText(unit, world)                UI 组装状态徽章
//  注: 3v3 下技能目标统一由 pickTarget(world, unit) 按对位规则选取,不再直接读 world[dk]
// ============================================================
const MECHANICS = {
    // ---------- 勇士 · 浴血奋战 ----------
    berserk: {
        // v4.7: 粘性浴血 —— 生命值低于50%发动后, 除非生命值回满, 否则效果不会结束
        onBeforeHit(unit, enemy, ctx, world) {
            if (unit.berserkActive && unit.hp >= unit.maxHp) {
                unit.berserkActive = false;
                if (ctx.h === 0) world.addLog(`🔥 ${unit.name} 生命值回满，浴血奋战结束`, '');
            }
            if (!unit.berserkActive && unit.hp < unit.maxHp * CONFIG.berserk.threshold) {
                unit.berserkActive = true;
                if (!unit.berserkTriggered) {
                    unit.berserkTriggered = true;
                    notifySkillCast(unit, world);   // 模式转换: 首次进入浴血
                }
                if (ctx.h === 0) {
                    world.addLog(`🔥 ${unit.name} 触发浴血奋战！攻击力提升至 ${round1(unit.atk * CONFIG.berserk.atkMult)}（未回满血则效果持续）`, 'highlight');
                }
            }
            if (unit.berserkActive) {
                ctx.atkMult *= CONFIG.berserk.atkMult;
                ctx.berserk = true;
            }
        },
        onHitDealt(unit, enemy, ctx) {
            // 原版: hasLifesteal && isBerserk 时吸血 15%,仅浴血期间生效
            if (ctx.berserk) ctx.lifesteal += ctx.dmg * (CONFIG.berserk.lifestealPct / 100);
        },
        statusText() {
            return `<span class="status-badge" style="border-color:#e67e22;color:#f5c842;">🔥 浴血奋战</span>`;
        }
    },

    // ---------- 战士 · 铁血意志(v4.4 重做,取代「圣光打击」) ----------
    ironWill: {
        // ① 累计承受 200 点伤害 +1 层(护盾吸收部分不计,由引擎传入 hpLoss)
        onDamaged(unit, source, ctx, world) {
            if (unit.hp <= 0) return;
            const hpLoss = (ctx && ctx.hpLoss) || 0;
            if (hpLoss <= 0) return;
            unit.ironDmgAccum = (unit.ironDmgAccum || 0) + hpLoss;
            while (unit.ironDmgAccum >= CONFIG.ironWill.dmgPerStack) {
                unit.ironDmgAccum -= CONFIG.ironWill.dmgPerStack;
                addIronStack(unit, world);
            }
        },
        // ② 每进行 3 次攻击 +1 层(按「攻击次数」计,双拳 2 连击算 1 次攻击)
        onBeforeHit(unit, enemy, ctx, world) {
            if (ctx.h !== 0) return;
            unit.ironAtkCount = (unit.ironAtkCount || 0) + 1;
            if (unit.ironAtkCount >= CONFIG.ironWill.atkPerStack) {
                unit.ironAtkCount -= CONFIG.ironWill.atkPerStack;
                addIronStack(unit, world);
            }
        },
        statusText(unit) {
            const s = unit.ironStacks || 0;
            const max = CONFIG.ironWill.maxStacks;
            const style = unit.ironUltUsed ? 'border-color:#7f8dad;color:#9fb0d0;'
                : (s >= max ? 'border-color:#e74c3c;color:#ff6b6b;' : 'border-color:#c0392b;color:#e88;');
            return `<span class="status-badge" style="${style}">🩸 印记 ${s}/${max}${unit.ironUltUsed ? '（已破阵）' : ''}</span>`;
        }
    },

    // ---------- 游侠 · 绝境求生 ----------
    lastStand: {
        onDeathCheck(unit, killer, world) {
            if (unit.lastStandUsed) return false;
            unit.lastStandUsed = true;
            const hh = applyHealReduction(unit, CONFIG.lastStand.reviveHp);
            unit.hp = hh;
            recordHeal(unit, unit, hh);
            addLog(world, `🏹 ${unit.name} 触发绝境求生！回复至${hh}HP`, 'highlight');
            return true;
        }
    },

    // ---------- 枪手 · 左轮弹匣 + 弱点锁定(v4.4 重做,取代「暴击补偿」) ----------
    revolver: {
        // 换弹充能: 2 秒结束后重置弹匣并清空锁定(下次取敌时重新锁定)
        onTick(unit, world, dt) {
            if (!unit.reloading) return;
            unit.reloadTimer += dt;
            if (unit.reloadTimer >= CONFIG.revolver.reloadSec) {
                unit.reloading = false;
                unit.reloadTimer = 0;
                unit.ammo = CONFIG.revolver.capacity;
                unit.lockedTarget = null;
                world.addLog(`🔫 ${unit.name} 换弹完成，重新锁定目标`, '');
            }
        },
        // 每完成一次攻击消耗 1 发;打空即进入换弹(换弹中 pickTarget 返回 null → 无法攻击)
        onHitDealt(unit) {
            if (unit.reloading) return;
            unit.ammo = (typeof unit.ammo === 'number' ? unit.ammo : CONFIG.revolver.capacity) - 1;
            if (unit.ammo <= 0) {
                unit.reloading = true;
                unit.reloadTimer = 0;
                unit.lockedTarget = null;
            }
        },
        statusText(unit) {
            if (unit.reloading) {
                const remain = Math.max(0, CONFIG.revolver.reloadSec - unit.reloadTimer);
                return `<span class="status-badge" style="border-color:#7f8dad;color:#9fb0d0;">🔄 换弹 ${remain.toFixed(1)}s</span>`;
            }
            const ammo = (typeof unit.ammo === 'number') ? unit.ammo : CONFIG.revolver.capacity;
            const lock = (unit.lockedTarget && isAlive(unit.lockedTarget)) ? ` 🎯${unit.lockedTarget.name}` : '';
            return `<span class="status-badge" style="border-color:#f39c12;color:#f5c842;">🔫 ${ammo}/${CONFIG.revolver.capacity}${lock}</span>`;
        }
    },

    // ---------- 法师 · 法术爆发 (v2.7: 满蓝后需 0.5s 施法时间, 期间被眩晕则中断并重新吟唱) ----------
    manaBurst: {
        // 满蓝 → 开始吟唱(蓝量在吟唱结束结算时才消耗)
        onCast(unit, world) {
            if (unit.mageCasting) return;                  // 吟唱中不重复触发
            unit.mageCasting = true;
            unit.mageCastTimer = 0;
            world.addLog(`🔮 ${unit.name} 开始吟唱「法术爆发」（${CONFIG.mage.castTime}s）`, '');
        },
        onTick(unit, world, dt) {
            if (!unit.mageCasting) return;
            if (unit.hp <= 0) { unit.mageCasting = false; unit.mageCastTimer = 0; return; }
            // v2.7: 吟唱途中被眩晕 → 中断, 保留蓝量待解除眩晕后重新吟唱
            if (unit.stunned > 0) {
                unit.mageCasting = false;
                unit.mageCastTimer = 0;
                world.addLog(`🔮 ${unit.name} 的吟唱被眩晕打断，蓝量保留，将重新吟唱`, '');
                return;
            }
            unit.mageCastTimer = round2(unit.mageCastTimer + dt);
            if (unit.mageCastTimer < CONFIG.mage.castTime) return;
            unit.mageCasting = false;
            unit.mageCastTimer = 0;
            castMageBurst(world, unit);
        },
        statusText(unit) {
            if (!unit.mageCasting) return '';
            const remain = Math.max(0, CONFIG.mage.castTime - unit.mageCastTimer);
            return `<span class="status-badge" style="border-color:#5dade2;color:#7fd2ff;">🔮 吟唱 ${remain.toFixed(1)}s</span>`;
        }
    },

    // ---------- 坦克 · 生命打击(v4.5 重做,取代「铁壁反击」) ----------
    lifeStrike: {
        // 满蓝蓄力: 标记下一次普攻附加效果
        onCast(unit, world) {
            unit.lifeStrikeReady = true;
            unit.mana = 0;
            applyManaRefund(world, unit);
            notifySkillCast(unit, world);
            world.addLog(`🛡️ ${unit.name} 生命打击蓄力！下次普攻 +${CONFIG.lifeStrike.bonusDmg} 魔法伤害并汲取生命`, 'highlight');
        },
        // 下一次普攻: +120 魔法伤害(不吃暴击) + 回复已损失生命的10%(最低50,受减疗)
        onPostCrit(unit, enemy, ctx, world) {
            if (!unit.lifeStrikeReady) return;
            unit.lifeStrikeReady = false;
            const extra = Math.max(0.1, round1(CONFIG.lifeStrike.bonusDmg * (1 - enemy.mr / 100)));
            ctx.dmg = round1(ctx.dmg + extra);
            const lost = Math.max(0, unit.maxHp - unit.hp);
            const heal = applyHealReduction(unit, Math.max(CONFIG.lifeStrike.minHeal, round1(lost * CONFIG.lifeStrike.healPct)));
            applyHealTo(unit, heal, unit);
            world.addLog(`🛡️ ${unit.name} 生命打击！+${dmgSpan(extra, 'magical')} 魔法伤害，回复 ${heal} HP`, 'heal');
        }
    },

    // ---------- 巫师 · 诅咒(附着于目标;可叠加刷新;重伤=目标一切回复减半) ----------
    curse: {
        onCast(unit, world) {
            let defender = pickTarget(world, unit);
            if (!defender || defender.hp <= 0) return;
            // v4.4 目标优先级: 当前目标 > 「生命上限最高且尚未被诅咒」的单位。
            // 若所有存活敌人均已挂诅咒(含仅剩 1 名敌人的情况) → 本次不释放,保留蓝量等待其结束
            if (defender.curse) {
                const enemies = world[enemyTeamKey(unit.teamKey)];
                let alt = null;
                for (let i = 0; i < enemies.length; i++) {
                    const e = enemies[i];
                    if (!isAlive(e) || e.curse) continue;
                    if (!alt || e.maxHp > alt.maxHp) alt = e;
                }
                if (!alt) return;
                defender = alt;
            }
            // v4.2: 诅咒挂在目标身上,巫师可同时对多个目标维持诅咒;再次命中同一目标即刷新时长
            // v4.7: 对 BOSS 单位设上限 —— 生命上限按 min(最大生命, bossMaxHpCap) 折算,
            //       且单次(每秒)3% 部分的伤害不超过 bossPctCap (限制对 Boss 的强势)
            const isBossTarget = !!defender.isBoss;
            const effMaxHp = isBossTarget ? Math.min(defender.maxHp, CONFIG.curse.bossMaxHpCap) : defender.maxHp;
            let pctPerTick = effMaxHp * CONFIG.curse.pctPerSec;
            if (isBossTarget) pctPerTick = Math.min(pctPerTick, CONFIG.curse.bossPctCap);
            const perTick = pctPerTick + CONFIG.curse.basePerSec;
            // 诅咒为巫师自身技能,总伤害吃 SP;随后按 tick 数逐跳结算
            const totalDmg = Math.max(0.1, round1(perTick * CONFIG.curse.duration * spOf(unit) * (1 - getDefense(defender, 'magical') / 100)));
            const refreshed = defender.curse !== null;
            defender.curse = {
                caster: unit, casterName: unit.name,
                remaining: CONFIG.curse.duration,
                totalDmg, ticks: CONFIG.curse.duration
            };
            defender.curseTimer = 0;
            defender.curseAppliedAt = true;    // 本步已首跳,跳过当次的 DoT 步进,避免同一步内重复结算
            unit.mana = 0;
            applyManaRefund(world, unit);
            notifySkillCast(unit, world);
            world.addLog(`🧙 ${unit.name} 释放诅咒！${refreshed ? '刷新' : '附着'}于 ${defender.name}，持续4秒，总伤害约 ${totalDmg}，目标重伤（回复减半）${isBossTarget ? '（BOSS上限：生命按5000计，单次3%不超过150）' : ''}`, 'curse');
            applyCurseTick(world, defender);   // 首跳立即结算(与原版一致)
        },
        statusText(unit) {
            // 重伤徽章显示在「被诅咒的目标」身上
            if (!unit.curse) return '';
            return `<span class="status-badge curse"><span class="badge-icon">🧙</span>重伤 ${Math.ceil(unit.curse.remaining)}s</span>`;
        }
    },

    // ---------- 进化兽 · 进化 ----------
    evolution: {
        onTick(unit, world, dt) {
            unit.evoTimer += dt;
            const interval = (typeof evoIntervalOf === 'function') ? evoIntervalOf(unit) : CONFIG.evolution.interval;
            const maxStages = (typeof evoMaxStages === 'function') ? evoMaxStages(unit) : CONFIG.evolution.maxStages;
            while (unit.evoTimer >= interval && unit.evoStage < maxStages) {
                unit.evoTimer -= interval;
                applyEvo(unit, world);
            }
        },
        onBeforeHit(unit, enemy, ctx, world) {
            // 进化满(第4次)后每次普攻回血 25,受减疗
            if (unit.evoHeal > 0) {
                const hh = applyHealReduction(unit, unit.evoHeal);
                applyHealTo(unit, hh, unit);
            }
        },
        statusText(unit) {
            const interval = (typeof evoIntervalOf === 'function') ? evoIntervalOf(unit) : CONFIG.evolution.interval;
            const maxStages = (typeof evoMaxStages === 'function') ? evoMaxStages(unit) : CONFIG.evolution.maxStages;
            const prog = Math.min(100, (unit.evoTimer / interval) * 100);
            const label = unit.evoStage >= maxStages ? '已满' : (maxStages === Infinity ? `${unit.evoStage}` : `${unit.evoStage}/${maxStages}`);
            return `<span class="status-badge evo"><span class="badge-icon">🐾</span>进化 ${label} (${Math.round(prog)}%)</span>`;
        }
    },

    // ---------- 长矛手 · 真实打击 ----------
    trueStrike: {
        onBeforeHit(unit, enemy, ctx, world) {
            if (unit.spearCount < CONFIG.spear.firstAttacks) {
                ctx.isSpear = true;
                ctx.spearCountNow = ++unit.spearCount;
            }
        },
        statusText(unit) {
            const remain = Math.max(0, CONFIG.spear.firstAttacks - unit.spearCount);
            return `<span class="status-badge" style="border-color:#e67e22;color:#f5c842;">🔱 真实打击剩余 ${remain} 发</span>`;
        }
    },

    // ---------- 刺客 · 暗杀 ----------
    assassinate: {
        onDamageCalc(unit, enemy, ctx, world) {
            if (enemy.hp < enemy.maxHp * CONFIG.assassinate.threshold) {
                // 暗杀附加为刺客自身技能伤害,吃 SP
                // 伤害类型跟随本次攻击: 装备星星魔法杖把普攻转为法术后,附加伤害同样按魔抗减免
                const dmgType = (ctx.atkType === 'magical') ? 'magical' : 'physical';
                let extra = CONFIG.assassinate.extraDmg * spOf(unit) * (1 - getDefense(enemy, dmgType) / 100);
                extra = Math.max(0.1, round1(extra));
                ctx.addDmg += extra;
                if (ctx.h === 0) world.addLog(`🗡️ ${unit.name} 暗杀！额外造成 ${dmgSpan(extra, dmgType)} ${dmgType === 'magical' ? '魔法' : '物理'}伤害`, '');
            }
        }
    },

    // ---------- 猎人 · 猎网(v2.5 重做,取代旧「贯穿打击」) ----------
    hunterNet: {
        // 被动: 无视敌方 10 点护甲(仅物理攻击生效;星杖转法术后不生效)
        onDefenseCalc(unit, enemy, ctx) {
            if (ctx.atkType === 'physical') {
                ctx.defPct = Math.max(0, ctx.defPct - CONFIG.hunter.armorPen);
            }
        },
        // 满蓝施放: 对敌方「攻击力最高」的存活单位造成 150 物理伤害, 并使其攻速 -20% 持续 3s
        onCast(unit, world) {
            const cfg = CONFIG.hunterNet;
            const target = pickStrongestEnemy(world, unit);
            if (!target) return;
            const dmg = Math.max(0.1, round1(cfg.dmg * (1 - getDefense(target, 'physical') / 100)));
            applyDamageTo(world, target, dmg, unit, { skill: true });
            recordDealt(unit, dmg, 'physical');
            // 攻速 -20%(持续 3s): 只标记状态,实际倍率由 recalcSpeedMul 统一换算(与寒冰印记叠乘)
            target.netSlowTimer = cfg.durationSec;
            recalcSpeedMul(target);
            unit.mana = 0;
            applyManaRefund(world, unit);
            notifySkillCast(unit, world);
            world.addLog(`🕸️ ${unit.name} 释放猎网！缠住敌方攻击力最高的 ${target.name}：${dmgSpan(dmg, 'physical')} 物理伤害，攻速 -${Math.round(cfg.speedDownPct * 100)}%（${cfg.durationSec}秒）`, 'highlight');
            if (target.hp <= 0) handleDeath(world, target, unit);
        },
        // 猎网减速标记(挂在中网的单位身上)
        statusText(unit) {
            if (unit.netSlowTimer > 0) {
                return `<span class="status-badge" style="border-color:#f39c12;color:#f5c842;">🕸️ 猎网减速 ${unit.netSlowTimer.toFixed(1)}s</span>`;
            }
            return '';
        }
    },

    // ---------- 剑士 · 剑气(v2.5 重做: 双倍伤害+波及同行全体+同行全体眩晕) ----------
    swordAura: {
        onTick(unit, world, dt) {
            unit.skillCharge = Math.min(unit.cooldownDuration || CONFIG.swordAura.chargeSec, unit.skillCharge + dt);
        },
        // 充能满后「下一次攻击」触发: 该击双倍伤害
        onBeforeHit(unit, enemy, ctx, world) {
            if (ctx.h !== 0) return;
            if (unit.skillCharge < (unit.cooldownDuration || CONFIG.swordAura.chargeSec)) return;
            unit.skillCharge = 0;
            ctx.swordAura = true;
            ctx.atkMult = 2;
            notifySkillCast(unit, world);
        },
        // 同行其余存活敌人同样受到 2×攻击力的伤害(各自结算防御)
        onDamageCalc(unit, enemy, ctx, world) {
            if (!ctx.swordAura) return;
            const base = unit.atk * (ctx.atkMult || 1);
            const enemies = world[enemyTeamKey(unit.teamKey)];
            for (let i = 0; i < enemies.length; i++) {
                const t = enemies[i];
                if (t === enemy || !isAlive(t) || t.row !== unit.row) continue;
                const d = Math.max(0.1, round1(base * (1 - getDefense(t, ctx.atkType) / 100)));
                applyDamageTo(world, t, d, unit);
                recordDealt(unit, d, ctx.atkType === 'magical' ? 'magical' : 'physical');
                world.addLog(`⚔️ 剑气波及 ${t.name}：${dmgSpan(d, 'physical')} 物理伤害`, '');
                if (t.hp <= 0) handleDeath(world, t, unit);
            }
            world.addLog(`⚔️ ${unit.name} 剑气纵横！对同行全体造成 ${dmgSpan(round1(base), 'physical')} 物理伤害`, 'highlight');
        },
        // 同行全体眩晕 1s (v2.7: 属「攻击技能产生的控制」, 会被黑暗护盾挡下)
        onPostCrit(unit, enemy, ctx, world) {
            if (!ctx.swordAura) return;
            const enemies = world[enemyTeamKey(unit.teamKey)];
            const names = [];
            for (let i = 0; i < enemies.length; i++) {
                const t = enemies[i];
                if (!isAlive(t) || t.row !== unit.row) continue;
                if (applyStunTo(world, t, CONFIG.swordAura.stunSec, { label: '剑气震荡', source: unit })) continue;
                names.push(t.name);
            }
            if (names.length) {
                world.addLog(`💫 剑气震荡！${names.join('、')} 被眩晕${CONFIG.swordAura.stunSec}秒`, 'silence');
            }
        },
        statusText(unit) {
            const dur = unit.cooldownDuration || CONFIG.swordAura.chargeSec;
            if (unit.skillCharge >= dur) {
                return `<span class="status-badge" style="border-color:#e74c3c;color:#ff6b6b;">⚔️ 剑气就绪</span>`;
            }
            return `<span class="status-badge" style="border-color:#667799;color:#8899bb;">⚔️ 剑气 ${Math.ceil(dur - unit.skillCharge)}s</span>`;
        }
    },

    // ---------- 圣骑 · 圣光(v4.3, b模板蓝条技能) ----------
    paladinHoly: {
        // 满蓝施放: 进入 5 秒圣光状态;期间每秒回 30 HP 且双抗 +12;状态结束前不可再次施放
        onCast(unit, world) {
            if (unit.holyActive) return;      // 技能必须释放完毕才可再次释放
            unit.holyActive = true;
            unit.holyTimer = 0;
            unit.holyAccum = 0;
            unit.armor += CONFIG.paladin.resistBonus;
            unit.mr += CONFIG.paladin.resistBonus;
            unit.mana = 0;
            applyManaRefund(world, unit);
            notifySkillCast(unit, world);
            // v2.9 圣灵打击: 释放圣光瞬间武装下一次普攻
            if (unit.holyNextBlowDmg > 0) {
                unit.holyNextAtk = true;
            }
            world.addLog(`⚜️ ${unit.name} 释放圣光！${CONFIG.paladin.durationSec} 秒内每秒回复 ${CONFIG.paladin.healPerSec} HP，双抗 +${CONFIG.paladin.resistBonus}${unit.holyNextAtk ? '；圣灵打击已武装' : ''}`, 'highlight');
        },
        // v2.9 圣灵打击: 下一次普攻附带额外魔法伤害 + 扣蓝
        onDamageCalc(unit, enemy, ctx, world) {
            if (!unit.holyNextAtk || ctx.isSpear) return;
            if (!enemy || enemy.hp <= 0) return;
            unit.holyNextAtk = false;
            const raw = unit.holyNextBlowDmg || 0;
            if (raw > 0) {
                const bolt = Math.max(0.1, round1(raw * (1 - getDefense(enemy, 'magical') / 100)));
                ctx.addDmg += bolt;
                if (ctx.h === 0) {
                    world.addLog(`💫 ${unit.name} 圣灵打击！附加 ${dmgSpan(bolt, 'magical')} 魔法伤害`, 'highlight');
                }
            }
            const burn = unit.holyNextBlowMana || 0;
            if (burn > 0 && enemy.hasMana && enemy.mana > 0) {
                const burned = Math.min(enemy.mana, burn);
                enemy.mana = round1(Math.max(0, enemy.mana - burned));
                if (ctx.h === 0) {
                    world.addLog(`💫 ${unit.name} 圣灵打击灼尽 ${enemy.name} ${burned} 点蓝量（剩余 ${enemy.mana}）`, '');
                }
            }
        },
        onTick(unit, world, dt) {
            if (!unit.holyActive) return;
            unit.holyTimer += dt;
            unit.holyAccum = (unit.holyAccum || 0) + dt;
            while (unit.holyAccum >= 1.0) {
                unit.holyAccum -= 1.0;
                if (unit.hp <= 0) return;
                const hh = applyHealReduction(unit, CONFIG.paladin.healPerSec);
                applyHealTo(unit, hh, unit);
                world.addLog(`⚜️ ${unit.name} 圣光回复 ${hh} HP`, 'heal');
            }
            if (unit.holyTimer >= CONFIG.paladin.durationSec) {
                unit.holyActive = false;
                unit.holyTimer = 0;
                unit.holyAccum = 0;
                unit.armor -= CONFIG.paladin.resistBonus;
                unit.mr -= CONFIG.paladin.resistBonus;
                world.addLog(`⚜️ ${unit.name} 圣光结束（双抗恢复）`, '');
            }
        },
        statusText(unit) {
            if (unit.holyActive) {
                const remain = Math.max(0, CONFIG.paladin.durationSec - unit.holyTimer);
                return `<span class="status-badge" style="border-color:#f1c40f;color:#f1c40f;">⚜️ 圣光 ${Math.ceil(remain)}s</span>`;
            }
            return '';
        }
    },

    // ---------- 格斗家 · 双拳模式 ----------
    dualFist: {
        onTick(unit, world, dt, opts) {
            const manual = !!(opts && opts.manual);
            const dur = unit.cooldownDuration || CONFIG.dualFist.chargeSec;
            if (manual) {
                // 手动模式: 保持 doRound 原有链(设置→衰减→计时,首回合 8→7)
                if (!unit.fighterActive && unit.fighterCooldown <= 0) {
                    unit.fighterCooldown = dur;
                    world.addLog(`👊 ${unit.name} 开始充能双拳模式`, '');
                }
                if (!unit.fighterActive && unit.fighterCooldown > 0) {
                    unit.fighterCooldown = Math.max(0, unit.fighterCooldown - dt);
                    if (unit.fighterCooldown <= 0) {
                        unit.fighterActive = true;
                        unit.fighterTimer = 0;
                        notifySkillCast(unit, world);   // 模式转换 → 触发恢复水晶
                        world.addLog(`👊 ${unit.name} 双拳模式开启！持续${CONFIG.dualFist.durationSec}秒`, 'highlight');
                    }
                }
                if (unit.fighterActive) {
                    unit.fighterTimer += dt;
                    if (unit.fighterTimer >= CONFIG.dualFist.durationSec) {
                        unit.fighterActive = false;
                        unit.fighterTimer = 0;
                        unit.fighterCooldown = 0;
                        world.addLog(`👊 ${unit.name} 双拳模式结束`, '');
                        unit.fighterCooldown = dur;
                        world.addLog(`👊 ${unit.name} 开始充能双拳模式`, '');
                    }
                }
            } else {
                // 自动模式: 保持 autoLoop 原有 else-if 链
                if (unit.fighterActive) {
                    unit.fighterTimer += dt;
                    if (unit.fighterTimer >= CONFIG.dualFist.durationSec) {
                        unit.fighterActive = false;
                        unit.fighterTimer = 0;
                        unit.fighterCooldown = 0;
                        world.addLog(`👊 ${unit.name} 双拳模式结束`, '');
                        unit.fighterCooldown = dur;
                        world.addLog(`👊 ${unit.name} 开始充能双拳模式，${dur}秒后开启`, '');
                    }
                } else if (unit.fighterCooldown > 0) {
                    unit.fighterCooldown = Math.max(0, unit.fighterCooldown - dt);
                    if (unit.fighterCooldown <= 0) {
                        unit.fighterActive = true;
                        unit.fighterTimer = 0;
                        notifySkillCast(unit, world);   // 模式转换 → 触发恢复水晶
                        world.addLog(`👊 ${unit.name} 双拳模式开启！持续${CONFIG.dualFist.durationSec}秒`, 'highlight');
                    }
                } else {
                    unit.fighterCooldown = dur;
                    world.addLog(`👊 ${unit.name} 开始充能双拳模式，${dur}秒后开启`, '');
                }
            }
        },
        onBeforeHit(unit, enemy, ctx, world) {
            if (ctx.h === 0 && unit.fighterActive) {
                ctx.hitCount = 2;
                ctx.doubleHit = true;
                // 双拳每击 75% 攻击力(第0击的倍率在循环前已重置为1,需要在此覆盖)
                ctx.atkMult = CONFIG.dualFist.multiplier;
            }
        },
        statusText(unit) {
            if (unit.fighterActive) {
                const remain = Math.max(0, CONFIG.dualFist.durationSec - unit.fighterTimer);
                return `<span class="status-badge fighter"><span class="badge-icon">👊</span>双拳模式 ${Math.ceil(remain)}s</span>`;
            }
            if (unit.fighterCooldown > 0) {
                return `<span class="status-badge" style="border-color:#667799;color:#8899bb;">⏳ 充能 ${Math.ceil(unit.fighterCooldown)}s</span>`;
            }
            return `<span class="status-badge" style="border-color:#2ecc71;color:#2ecc71;">✅ 双拳就绪</span>`;
        }
    },

    // ---------- 装备机制: 太阳圣盾 ----------
    sunShield: {
        onDamageCalc(unit, enemy, ctx, world) {
            const shieldDmg = (unit.armor + unit.mr) * (1 - enemy.mr / 100);
            ctx.addDmg += shieldDmg;
            if (ctx.h === 0) world.addLog(`☀️ ${unit.name} 太阳圣盾附加 ${dmgSpan(round1(shieldDmg), 'magical')} 魔法伤害`, '');
        }
    },

    // ---------- 装备机制: 星星魔法杖 ----------
    starStaff: {
        onBeforeHit(unit, enemy, ctx, world) {
            if (unit._atkTypeOverride && ctx.h === 0 && ctx.atkType !== unit._atkTypeOverride) {
                ctx.atkType = unit._atkTypeOverride;
                world.addLog(`🌟 ${unit.name} 普通攻击转化为法术伤害`, '');
            }
        }
    },

    // ---------- 装备机制: 守护斗篷(绝境守护+全能吸血) ----------
    cloakGuard: {
        // 所有伤害来源共用(含技能/诅咒)。首次 HP<30% 且存活时触发一次:
        //   获得 (100+2×攻击力) 护盾,并本场永久获得 10% 全能吸血(自身造成的一切伤害均可回复)
        onDamaged(unit, source, ctx, world) {
            if (unit.cloakTriggered) return;
            if (!unit.equipIds || !unit.equipIds.includes('cloak')) return;
            if (unit.hp <= 0 || unit.hp >= unit.maxHp * CONFIG.cloak.thresholdPct / 100) return;
            unit.cloakTriggered = true;
            unit.shield = round1(CONFIG.cloak.baseShield + unit.atk * CONFIG.cloak.adRatio);
            unit.leechAll = (unit.leechAll || 0) + CONFIG.cloak.omniLeechPct;
            world.addLog(`🧥 ${unit.name} 触发绝境守护！获得 ${unit.shield} 护盾，本场永久获得 ${CONFIG.cloak.omniLeechPct}% 全能吸血`, 'highlight');
        }
    },

    // ---------- 装备机制: 恢复水晶(v4.7 重做: 每 2 秒回复 40 点生命值) ----------
    crystalRegen: {
        onTick(unit, world, dt) {
            if (unit.hp <= 0) return;
            unit.crystalTimer = (unit.crystalTimer || 0) + dt;
            while (unit.crystalTimer >= CONFIG.crystal.interval) {
                unit.crystalTimer -= CONFIG.crystal.interval;
                if (unit.hp <= 0) return;
                const heal = applyHealReduction(unit, CONFIG.crystal.heal);
                applyHealTo(unit, heal, unit);
                world.addLog(`💎 ${unit.name} 恢复水晶回复 ${heal} 生命值`, 'heal');
            }
        }
    },

    // ---------- 装备机制: 荆棘之甲(v4.7) 受到伤害后反弹 0.5×AR 的魔法伤害 ----------
    thornMail: {
        onDamaged(unit, source, ctx, world) {
            if (reflectGuard > 0) return;                   // 反弹造成的伤害不再触发反伤
            if (!source || source === unit) return;
            if (unit.hp <= 0 || !isAlive(source)) return;
            const raw = unit.armor * CONFIG.thornMail.reflectRatio;
            const dmg = Math.max(0.1, round1(raw * (1 - getDefense(source, 'magical') / 100)));
            reflectGuard++;
            applyDamageTo(world, source, dmg, unit, { noLeech: true });   // 反弹伤害不结算全能吸血
            recordDealt(unit, dmg, 'magical');
            reflectGuard--;
            world.addLog(`🌵 ${unit.name} 荆棘之甲反弹 ${dmgSpan(dmg, 'magical')} 魔法伤害`, '');
            if (source.hp <= 0) handleDeath(world, source, unit);
        }
    },

    // ---------- 装备机制: 熊王爪(v4.7) 攻击力+25, 每次攻击使目标护甲 -1(可叠加) ----------
    bearClaw: {
        onDamageCalc(unit, enemy, ctx, world) {
            if (ctx.h !== 0) return;                        // 双拳 2 连击按「1 次攻击」计
            if (!enemy || enemy.hp <= 0) return;
            const before = enemy.armor;
            enemy.armor = Math.max(0, round1(before - CONFIG.bearClaw.armorShred));
            if (enemy.armor !== before) {
                world.addLog(`🐾 ${unit.name} 熊王爪撕裂护甲！${enemy.name} 护甲 -${CONFIG.bearClaw.armorShred}（当前 ${enemy.armor}）`, '');
            }
        }
    },

    // ---------- 游侠 · 破魔箭(v4.5 / v4.7: 魔法伤害单独写入战斗日志) ----------
    rangerBolt: {
        onDamageCalc(unit, enemy, ctx, world) {
            if (ctx.isSpear) return;
            const bolt = Math.max(0.1, round1(CONFIG.rangerBolt.dmg * (1 - enemy.mr / 100)));
            ctx.addDmg += bolt;
            if (ctx.h === 0) {
                world.addLog(`🏹 ${unit.name} 破魔箭附加 ${dmgSpan(bolt, 'magical')} 魔法伤害`, '');
            }
        }
    },

    // ---------- 精灵 · 自然滋养(v4.5): 普攻改为治疗己方血量最低者(空过规则) ----------
    fairyHeal: {
        statusText(unit) {
            return `<span class="status-badge" style="border-color:#2ecc71;color:#2ecc71;">🌿 滋养中</span>`;
        }
    },

    // ---------- 精灵 · 灵光召唤(v4.5/v2.7): 开局0只,每5s+1(上限7),每只+5攻;每1s按对位攻击(单只10魔伤) ----------
    spiritSummon: {
        onTick(unit, world, dt) {
            // v2.9 精灵守护: 阵亡时回收已加的双抗
            if (unit.hp <= 0) {
                updateSpiritGuard(world, unit, 0);
                return;
            }
            // 召唤(开局已有1只,由 makeUnit 初始化)
            const cfg = CONFIG.fairySpirit;
            unit.spiritTimer += dt;
            while (unit.spiritTimer >= cfg.summonInterval && unit.spiritCount < cfg.maxCount) {
                unit.spiritTimer -= cfg.summonInterval;
                unit.spiritCount++;
                unit.atk = round1(unit.atk + cfg.atkPerSpirit);
                world.addLog(`✨ ${unit.name} 召唤小精灵（${unit.spiritCount}/${cfg.maxCount}，攻击力+${cfg.atkPerSpirit}）`, 'highlight');
            }
            updateSpiritGuard(world, unit);
            // 小精灵攻击: 每1s按对位规则各攻击一个敌人
            unit.spiritAtkTimer += dt;
            while (unit.spiritAtkTimer >= 1.0) {
                unit.spiritAtkTimer -= 1.0;
                if (unit.spiritCount <= 0) break;
                const spiritDmg = (typeof unit.spiritDmgOverride === 'number') ? unit.spiritDmgOverride : cfg.spiritDmg;
                let total = 0;
                const hits = new Map();                     // 目标 → 命中次数(多只小精灵打同一目标时聚合显示)
                for (let i = 0; i < unit.spiritCount; i++) {
                    const t = pickTarget(world, unit);          // 按当前对位选取
                    if (!t || !isAlive(t)) break;
                    const dmg = Math.max(0.1, round1(spiritDmg * (1 - t.mr / 100)));
                    applyDamageTo(world, t, dmg, unit);
                    recordDealt(unit, dmg, 'magical');
                    total += dmg;
                    hits.set(t.name, (hits.get(t.name) || 0) + 1);
                    if (t.hp <= 0) { handleDeath(world, t, unit); if (world.winner) return; }
                }
                if (hits.size) {
                    const label = Array.from(hits).map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join('、');
                    world.addLog(`✨ ${unit.name} 的小精灵们攻击 ${label}：${dmgSpan(round1(total), 'magical')} 魔法伤害`, '');
                }
            }
        },
        statusText(unit) {
            return `<span class="status-badge" style="border-color:#9b59b6;color:#c39bd3;">✨ 小精灵 ${unit.spiritCount}/${CONFIG.fairySpirit.maxCount}</span>`;
        }
    },

    // ---------- 挑战Boss · 大熊(v4.5): 随机攻击 / 周期AOE眩晕 / 二形态 / 32s坚毅 ----------
    bossBear: {
        onTick(unit, world, dt) {
            if (unit.hp <= 0) return;
            const cfg = CONFIG.bossBear;
            // 被动1: 生命低于 5000 → 二形态
            if (!unit.bossPhase2 && unit.hp < cfg.phase2Hp) {
                unit.bossPhase2 = true;
                unit.atk = round1(unit.atk + cfg.phase2Atk);
                unit.speed = cfg.phase2Speed;
                unit.lifesteal = (unit.lifesteal || 0) + cfg.phase2Leech;
                unit.armor += cfg.phase2Resist;      // v2.6: 二形态额外 +15 双抗
                unit.mr += cfg.phase2Resist;
                notifySkillCast(unit, world);
                world.addLog(`🐻 ${unit.name} 进入二形态！攻击+${cfg.phase2Atk}，攻速${cfg.phase2Speed}，物理吸血+${cfg.phase2Leech}%，双抗+${cfg.phase2Resist}`, 'highlight');
            }
            // 被动2: 战斗第 32s 回复 1000 + 双抗5
            if (!unit.bossRallyDone && world.battleTime >= cfg.rallyTime) {
                unit.bossRallyDone = true;
                const heal = applyHealReduction(unit, cfg.rallyHeal);
                applyHealTo(unit, heal, unit);
                unit.armor += cfg.rallyResist; unit.mr += cfg.rallyResist;
                world.addLog(`🐻 ${unit.name} 坚毅怒吼！回复 ${heal} HP，双抗+${cfg.rallyResist}`, 'heal');
            }
            // CD技能: 每 6s 对所有敌人造成物理伤害 + 眩晕
            unit.bossCdTimer += dt;
            while (unit.bossCdTimer >= cfg.cdInterval) {
                unit.bossCdTimer -= cfg.cdInterval;
                const dmgBase = unit.bossPhase2 ? cfg.cdDmg2 : cfg.cdDmg;
                const stunSec = unit.bossPhase2 ? cfg.stunSec2 : cfg.stunSec;
                const enemies = world[enemyTeamKey(unit.teamKey)];
                for (let i = 0; i < enemies.length; i++) {
                    const e = enemies[i];
                    if (!isAlive(e)) continue;
                    const dmg = Math.max(0.1, round1(dmgBase * (1 - e.armor / 100)));
                    // v2.7: 同一次技能事件 —— 伤害被黑暗护盾抵消时, 附带的眩晕由同一层护盾抵消(不再额外扣层)
                    const ev = newShieldEvent();
                    applyDamageTo(world, e, dmg, unit, { skill: true, event: ev });
                    recordDealt(unit, dmg, 'physical');
                    applyStunTo(world, e, stunSec, { label: '裂地重击', event: ev, source: unit });
                    if (e.hp <= 0) handleDeath(world, e, unit);
                }
                world.addLog(`🐻 ${unit.name} 裂地重击！全体敌人受到 ${dmgBase} 物理伤害并眩晕 ${stunSec}s`, 'highlight');
                if (world.winner) return;
            }
        },
        statusText(unit) {
            const cfg = CONFIG.bossBear;
            if (!unit.bossPhase2) {
                return `<span class="status-badge" style="border-color:#c0392b;color:#e88;">🐻 二形态 @${cfg.phase2Hp}HP · 重击 ${Math.ceil(cfg.cdInterval - unit.bossCdTimer)}s</span>`;
            }
            return `<span class="status-badge" style="border-color:#e74c3c;color:#ff6b6b;">🐻 二形态 · 重击 ${Math.ceil(cfg.cdInterval - unit.bossCdTimer)}s</span>`;
        }
    },

    // ---------- 挑战Boss · 大魔法师(v4.6): 前摇吟唱 + 随机主目标魔伤 + 魔抗永久削减 ----------
    archmage: {
        // 蓝机制: 每损失 200 生命 → 回蓝+1(所有伤害来源,护盾吸收部分不计)
        onDamaged(unit, source, ctx, world) {
            if (unit.hp <= 0 || !unit.hasMana) return;
            unit.arcHpLoss = (unit.arcHpLoss || 0) + ((ctx && ctx.hpLoss) || 0);
            while (unit.arcHpLoss >= CONFIG.archmage.hpLossMana) {
                unit.arcHpLoss -= CONFIG.archmage.hpLossMana;
                unit.mana = round1(Math.min(unit.maxMana, unit.mana + 1));
            }
        },
        // 满蓝 → 进入 1.5s 前摇(由 unitManaStep 触发;前摇期间不回蓝)
        onCast(unit, world) {
            if (unit.arcCasting) return;
            unit.arcCasting = true;
            unit.arcCastTimer = 0;
            world.addLog(`🌀 ${unit.name} 开始吟唱秘法风暴（${CONFIG.archmage.windupSec}s 前摇，期间不回蓝）`, 'highlight');
        },
        onTick(unit, world, dt) {
            if (unit.hp <= 0) return;
            const cfg = CONFIG.archmage;
            // v2.6: 「秘法强化」(第30s双抗+5/蓝上限降为30) 被动已按需求移除
            if (!unit.arcCasting) return;
            // 前摇被眩晕 → 取消本次施法(蓝量保留),解除后重新蓄力
            if (unit.stunned > 0) {
                unit.arcCasting = false;
                unit.arcCastTimer = 0;
                world.addLog(`🌀 ${unit.name} 的吟唱被打断！将重新蓄力`, '');
                return;
            }
            unit.arcCastTimer += dt;
            if (unit.arcCastTimer >= cfg.windupSec) {
                unit.arcCasting = false;
                unit.arcCastTimer = 0;
                castArcStorm(world, unit);
            }
        },
        statusText(unit) {
            if (unit.arcCasting) {
                const remain = Math.max(0, CONFIG.archmage.windupSec - unit.arcCastTimer);
                return `<span class="status-badge" style="border-color:#8e44ad;color:#c39bd3;">🌀 吟唱 ${remain.toFixed(1)}s</span>`;
            }
            return '';
        }
    },

    // ---------- 装备机制: 玉面刃(v4.5): 高血+30攻/低血攻速0.35,动态切换 ----------
    jadeBlade: {
        // 攻击瞬间结算攻击加成(高于50%血: 静态15 → 动态30,此处补差值)
        onBeforeHit(unit, enemy, ctx) {
            if (unit.hp > unit.maxHp * 0.5) ctx.atkAdd = (ctx.atkAdd || 0) + 15;
        },
        // 攻速差值法动态调整(低于50%血: 0.15 → 0.35,补 +0.20)
        onTick(unit, world) {
            const wantExtra = (unit.hp > 0 && unit.hp <= unit.maxHp * 0.5) ? 0.20 : 0;
            if ((unit._jadeSpeedExtra || 0) !== wantExtra) {
                unit.speed = round2(unit.speed - (unit._jadeSpeedExtra || 0) + wantExtra);
                unit._jadeSpeedExtra = wantExtra;
            }
        }
    },

    // ---------- 装备机制: 吸血镰刀 ----------
    scytheLife: {
        onHitDealt(unit, enemy, ctx) {
            if (unit.lifesteal > 0) ctx.lifesteal += ctx.dmg * (unit.lifesteal / 100);
        }
    },
    // ---------- v2.7 升级装备: 嗜血狂镰(吸血镰刀升级) ----------
    //   被动: 每攻击一次 → 全能吸血 +0.5%(最多额外 +15%)
    bloodScythe: {
        onBeforeHit(unit, enemy, ctx, world) {
            if (ctx.h !== 0) return;                      // 每次攻击只结算一次(多连击不重复叠加)
            const cfg = CONFIG.bloodScythe;
            const gained = unit._bloodLeechGain || 0;
            if (gained >= cfg.maxGain) return;
            const add = round1(Math.min(cfg.leechPerHit, cfg.maxGain - gained));
            if (add <= 0) return;
            unit._bloodLeechGain = round1(gained + add);
            unit.leechAll = round1((unit.leechAll || 0) + add);
            world.uiDirty = true;                          // 让面板/状态徽章实时刷新
            world.addLog(`🩸 嗜血狂镰叠加：${unit.name} 全能吸血 +${add}%（当前 ${unit.leechAll}%${unit._bloodLeechGain >= cfg.maxGain ? '，已达上限' : ''}）`, 'highlight');
        },
        statusText(unit) {
            const gained = unit._bloodLeechGain || 0;
            if (gained <= 0) return '';
            return `<span class="status-badge" style="border-color:#c0392b;color:#ff7675;">🩸 全能吸血 ${round1(unit.leechAll)}%</span>`;
        }
    },

    // ============================================================
    //  v2.2 升级装备机制(仅由「远征·装备升级点」获得)
    // ============================================================
    // 碎岩流星锤: 物理攻击无视敌方 50% 护甲
    rockHammer: {
        onDefenseCalc(unit, enemy, ctx) {
            if (ctx.atkType !== 'physical') return;
            ctx.defPct = Math.max(0, ctx.defPct * (1 - CONFIG.rockHammer.armorPenPct));
        }
    },
    // 霜天风暴弓: 攻击附带寒冰印记(带印记者攻速-10%; 叠满 10 层冻结 1.5s 并清空)
    frostMark: {
        onPostCrit(unit, enemy, ctx, world) {
            if (!isAlive(enemy)) return;
            const cfg = CONFIG.frostMark;
            enemy.frostStacks = (enemy.frostStacks || 0) + 1;
            recalcSpeedMul(enemy);                      // 不管多少层, 攻速固定 -10%(与猎网叠乘)
            if (enemy.frostStacks >= cfg.maxStacks) {
                enemy.frostStacks = 0;
                recalcSpeedMul(enemy);                  // 印记清空后仅保留其他仍在生效的减速(如猎网)
                // v2.7: 冻结同样属于「攻击产生的控制」, 会被黑暗护盾挡下
                if (!applyStunTo(world, enemy, cfg.freezeSec, { label: '寒冰印记冻结', source: unit })) {
                    world.addLog(`❄️ ${unit.name} 的寒冰印记爆发！${enemy.name} 被冻结 ${cfg.freezeSec}s`, 'silence');
                }
            }
        },
        statusText(unit) {
            return `<span class="status-badge" style="border-color:#5dade2;color:#a8e6f5;">❄️ 寒冰印记 ${unit.frostStacks}/10</span>`;
        }
    },
    // 幸运精钢剑: 暴击后额外获得 1 枚金币(远征模式)
    luckySword: {
        onPostCrit(unit, enemy, ctx, world) {
            if (!ctx.crit) return;
            // 金币只属于远征玩法: 普通对战(手动/自动)暴击不应污染远征钱包
            if (!world || world.mode !== 'rogue') return;
            if (typeof window !== 'undefined' && window.rogueGainGold) window.rogueGainGold(1, unit.name);
        }
    },
    // 灵能大法杖: 每释放一次蓝技能 SP +10(最多累计 +100)
    psionicStaff: {
        // 蓝量被消耗过才重新「上膛」, 避免圣骑圣光期间满蓝反复触发
        onTick(unit) {
            if (unit.hasMana && unit.mana < unit.maxMana) unit._psionicArmed = true;
        },
        onCast(unit) {
            if (!unit._psionicArmed) return;
            unit._psionicArmed = false;
            const cfg = CONFIG.psionicStaff;
            const used = unit._psionicGain || 0;
            if (used >= cfg.maxSp) return;
            const gain = Math.min(cfg.spPerCast, cfg.maxSp - used);
            unit._psionicGain = used + gain;
            unit.sp = round1((unit.sp || 0) + gain);
        }
    },

    // ============================================================
    //  v2.5 新角色 / 新 BOSS 机制
    // ============================================================
    // ---------- 魔剑士 · 魔法充能 / 星落(v2.5) ----------
    //   被动1: 每次攻击获得 10 点魔法充能
    //   被动2: 充能满 100 → 进入「星落」10s: 攻击模式改为每 0.4s 对随机敌方单位造成 0.6×攻击力 魔法伤害
    //          (首次被星落命中的单位眩晕 1s); 星落期间不再普攻、不再积累充能; 结束后清空充能重新积累
    starfall: {
        // 被动1: 攻击命中获得充能(该钩子无 world 参数, 触发判定与日志放在 onTick)
        onHitDealt(unit) {
            if (unit.starfallTimer > 0) return;
            const cfg = CONFIG.starfall;
            const maxCharge = (typeof unit.starfallMaxCharge === 'number') ? unit.starfallMaxCharge : cfg.maxCharge;
            unit.magicCharge = Math.min(maxCharge, round1((unit.magicCharge || 0) + cfg.chargePerHit));
        },
        onTick(unit, world, dt) {
            if (unit.hp <= 0) return;
            const cfg = CONFIG.starfall;
            const maxCharge = (typeof unit.starfallMaxCharge === 'number') ? unit.starfallMaxCharge : cfg.maxCharge;
            const adRatio = (typeof unit.starfallAdRatio === 'number') ? unit.starfallAdRatio : cfg.adRatio;
            // ① 充能溢出 → 开启星落(立即轰击第 1 次, 之后每 0.4s 一次, 10s 内共 25 次)
            if (unit.starfallTimer <= 0 && (unit.magicCharge || 0) >= maxCharge) {
                unit.magicCharge = 0;
                unit.starfallTimer = cfg.durationSec;
                unit.starfallAccum = 0;
                notifySkillCast(unit, world);
                world.addLog(`🌠 ${unit.name} 魔法充能满溢，星落降临！${cfg.durationSec} 秒内每 ${cfg.interval}s 对随机敌方单位造成 ${adRatio}×攻击力 的魔法伤害（期间不再普攻）`, 'highlight');
                starfallPulse(unit, world, cfg);
                if (world.winner) return;
            }
            if (unit.starfallTimer <= 0) return;
            // ② 星落轰击: 每 0.4s 一次, 随机选取存活敌人
            unit.starfallTimer = Math.max(0, unit.starfallTimer - dt);
            unit.starfallAccum = (unit.starfallAccum || 0) + dt;
            while (unit.starfallAccum >= cfg.interval && unit.starfallTimer > 0) {
                unit.starfallAccum -= cfg.interval;
                starfallPulse(unit, world, cfg);
                if (world.winner) return;
            }
            // ③ 星落结束 → 充能已清空, 需重新积累
            if (unit.starfallTimer <= 0) {
                unit.starfallTimer = 0;
                unit.starfallAccum = 0;
                world.addLog(`🌠 ${unit.name} 的星落结束（魔法充能已清空，需重新积累）`, '');
            }
        },
        statusText(unit) {
            const cfg = CONFIG.starfall;
            const maxCharge = (typeof unit.starfallMaxCharge === 'number') ? unit.starfallMaxCharge : cfg.maxCharge;
            if (unit.starfallTimer > 0) {
                return `<span class="status-badge" style="border-color:#8e44ad;color:#c39bd3;">🌠 星落 ${unit.starfallTimer.toFixed(1)}s</span>`;
            }
            return `<span class="status-badge" style="border-color:#5d6d9e;color:#9fb0d0;">✨ 充能 ${unit.magicCharge || 0}/${maxCharge}</span>`;
        }
    },

    // ---------- 长枪手 · 独守阵线 + 三连突刺(v2.5) ----------
    //   被动「独守阵线」: 位于后排且前排没有己方单位时, 攻击力 +20 且无视敌人 10 点护甲
    //   CD技能「三连突刺」: 每 7s 蓄力 1s, 对敌方同列的所有单位造成 3 连击
    lancerStrike: {
        // v2.7: 独守阵线的 +20 攻击力改为「实时写入 unit.atk」(见 updateLancerAlone), 面板会同步显示
        onDefenseCalc(unit, enemy, ctx, world) {
            if (ctx.atkType !== 'physical') return;
            if (!lancerAlone(unit, world)) return;
            ctx.defPct = Math.max(0, ctx.defPct - CONFIG.lancer.armorPen);
        },
        onTick(unit, world, dt) {
            if (unit.hp <= 0) return;
            updateLancerAlone(unit, world);   // 实时刷新独守阵线的攻击力数值
            const cfg = CONFIG.lancer;
            if (unit.lancerCasting) {                       // 蓄力中
                unit.lancerCastTimer += dt;
                if (unit.lancerCastTimer >= cfg.windupSec) {
                    unit.lancerCasting = false;
                    unit.lancerCastTimer = 0;
                    unit.skillCharge = 0;
                    castLancerTripleStrike(world, unit);
                }
                return;
            }
            unit.skillCharge = Math.min(cfg.cdInterval, (unit.skillCharge || 0) + dt);
            if (unit.skillCharge >= cfg.cdInterval) {
                unit.lancerCasting = true;
                unit.lancerCastTimer = 0;
                world.addLog(`🔱 ${unit.name} 开始蓄力「三连突刺」（${cfg.windupSec}s 后对敌方同列全体造成 ${cfg.hits} 连击）`, '');
            }
        },
        statusText(unit) {
            const cfg = CONFIG.lancer;
            const aloneBadge = unit.lancerAloneActive
                ? `<span class="status-badge" style="border-color:#2ecc71;color:#7bed9f;">🪖 独守阵线 攻击+${cfg.rowAtkBonus}</span>`
                : '';
            if (unit.lancerCasting) {
                const remain = Math.max(0, cfg.windupSec - unit.lancerCastTimer);
                return aloneBadge + `<span class="status-badge" style="border-color:#e74c3c;color:#ff6b6b;">🔱 蓄力 ${remain.toFixed(1)}s</span>`;
            }
            if ((unit.skillCharge || 0) >= cfg.cdInterval) {
                return aloneBadge + `<span class="status-badge" style="border-color:#f39c12;color:#f5c842;">🔱 三连突刺就绪</span>`;
            }
            return aloneBadge + `<span class="status-badge" style="border-color:#667799;color:#8899bb;">🔱 突刺 ${Math.ceil(cfg.cdInterval - (unit.skillCharge || 0))}s</span>`;
        }
    },

    // ---------- BOSS · 幽魂(v2.5, B级) ----------
    //   被动1: 普通攻击随机命中 2 个敌方单位, 造成魔法伤害(在 performGhostAttack 中结算)
    //   被动2「不灭怨念」: 首次死亡后 2s 内免疫一切伤害, 随后满血复活且攻击力 +30
    //   被动3「噬魂」: 敌方每阵亡 1 个单位 → 立刻回复 2000 生命(可突破上限) 且攻击力 +30
    ghost: {
        onDeathCheck(unit, killer, world) {
            if (unit.ghostReviveUsed) return false;
            unit.ghostReviveUsed = true;
            unit.ghostImmuneTimer = CONFIG.ghost.reviveSec;
            unit.hp = 1;                       // 免疫期间不会再掉血, 2s 后满血复活
            world.addLog(`👻 ${unit.name} 怨念不散！${CONFIG.ghost.reviveSec}s 内免疫一切伤害，随后满血复活`, 'highlight');
            return true;
        },
        onTick(unit, world, dt) {
            if (!(unit.ghostImmuneTimer > 0)) return;
            // 注意: 计时器递减绝不能套 round1()! 60fps(dt=0.05) 下 round1(2-0.05)=2 会把增量抹平导致永不归零
            unit.ghostImmuneTimer = Math.max(0, unit.ghostImmuneTimer - dt);
            if (unit.ghostImmuneTimer === 0) {
                unit.hp = unit.maxHp;
                unit.atk = round1(unit.atk + CONFIG.ghost.reviveAtk);
                notifySkillCast(unit, world);
                world.addLog(`👻 ${unit.name} 满血复活！攻击力 +${CONFIG.ghost.reviveAtk}（当前 ${unit.atk}）`, 'highlight');
            }
        },
        // 由 handleDeath 调用: 幽魂方对面的单位阵亡(即幽魂的「敌方」)
        onEnemyDeath(unit, world) {
            if (unit.hp <= 0) return;
            const cfg = CONFIG.ghost;
            const heal = applyHealReduction(unit, cfg.killHeal);
            unit.hp = round1(unit.hp + heal);   // 刻意不设上限: 可突破生命上限
            unit.atk = round1(unit.atk + cfg.killAtk);
            world.addLog(`👻 ${unit.name} 吞噬亡魂！回复 ${heal} 生命（${round1(unit.hp)}/${unit.maxHp}，可突破上限），攻击力 +${cfg.killAtk}`, 'heal');
        },
        statusText(unit) {
            if (unit.ghostImmuneTimer > 0) {
                return `<span class="status-badge" style="border-color:#8e44ad;color:#c39bd3;">👻 怨念免疫 ${unit.ghostImmuneTimer.toFixed(1)}s</span>`;
            }
            if (unit.hp > unit.maxHp) {
                return `<span class="status-badge" style="border-color:#2ecc71;color:#2ecc71;">👻 噬魂溢出 +${round1(unit.hp - unit.maxHp)}</span>`;
            }
            return '';
        }
    },

    // ---------- v2.6 挑战Boss · 黑暗游侠(A级) ----------
    //  被动1「黑暗汲取」: 每次攻击 +1 层(每层 +1 攻击力, 层数无上限); 被控制技能命中 → 失去 10 层
    //  被动2「黑暗护盾」: 每 5s 获得 1 层(可叠加), 每层免疫一次敌方主动技能伤害;
    //                    击败一个单位后立刻再获得 1 层 (DoT 被免疫时其后续跳数一并作废, 见 applyDamageTo/applyCurseTick)
    darkRanger: {
        onHitDealt(unit) {
            const cfg = CONFIG.darkRanger;
            unit.darkStacks = (unit.darkStacks || 0) + cfg.atkPerHit;
            unit.atk = round1(unit.atk + cfg.atkPerHit);
        },
        // 击败单位 → 立刻 +1 层黑暗护盾(仅「自己击败」才触发; deadUnit/killer 由 handleDeath 传入)
        onEnemyDeath(unit, world, deadUnit, killer) {
            if (unit.hp <= 0 || killer !== unit) return;
            const cfg = CONFIG.darkRanger;
            unit.darkShield = (unit.darkShield || 0) + cfg.killShieldStacks;
            world.addLog(`🌑 ${unit.name} 击败 ${deadUnit ? deadUnit.name : '敌方单位'}，黑暗护盾 +${cfg.killShieldStacks}（当前 ${unit.darkShield} 层）`, 'highlight');
        },
        onTick(unit, world, dt) {
            if (unit.hp <= 0) return;
            const cfg = CONFIG.darkRanger;
            // 被控制技能命中(眩晕值变大即视为一次新的控制) → 失去 10 层
            const stunNow = unit.stunned || 0;
            if (stunNow > (unit._darkStunPrev || 0) + 1e-9) {
                const before = unit.darkStacks || 0;
                const lost = Math.min(before, cfg.stunLoseStacks);
                if (lost > 0) {
                    unit.darkStacks = before - lost;
                    unit.atk = Math.max(0, round1(unit.atk - lost));
                    world.addLog(`🌑 ${unit.name} 被控制技能命中，黑暗之力 -${lost} 层（${before} → ${unit.darkStacks}）`, '');
                }
            }
            unit._darkStunPrev = stunNow;
            // 每 5s 凝聚 1 层黑暗护盾
            unit.darkShieldTimer = (unit.darkShieldTimer || 0) + dt;
            while (unit.darkShieldTimer >= cfg.shieldInterval) {
                unit.darkShieldTimer -= cfg.shieldInterval;
                unit.darkShield = (unit.darkShield || 0) + 1;
                world.addLog(`🌑 ${unit.name} 凝聚黑暗护盾（当前 ${unit.darkShield} 层，每层免疫一次主动技能伤害）`, 'highlight');
            }
        },
        statusText(unit) {
            let html = '';
            if ((unit.darkShield || 0) > 0) {
                html += `<span class="status-badge" style="border-color:#8e44ad;color:#c39bd3;">🌑 黑暗护盾 ×${unit.darkShield}</span>`;
            }
            if ((unit.darkStacks || 0) > 0) {
                html += `<span class="status-badge" style="border-color:#34495e;color:#9aa;">🌑 黑暗之力 ${unit.darkStacks} 层</span>`;
            }
            return html;
        }
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MECHANICS };
}
