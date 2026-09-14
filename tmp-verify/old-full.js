// ============================================================
//  英雄对战 · 队伍版(index.html + style.css + game.js)
//  ------------------------------------------------------------
//  结构:
//    ① 配置常量 CONFIG         —— 全部魔法数字集中管理
//    ② 数据层                  —— HERO_DEFS / EQUIP_DEFS / MECHANICS 机制注册表
//    ③ 引擎层                  —— 纯逻辑,不触碰 DOM(可被 Node 直接 require 用于对拍/模拟)
//    ④ UI 层                   —— 渲染 + 事件 + 倍速 + 批量模拟弹窗
//
//  v4.0 队伍化改造(在原「1V1 单挑 v3.6」行为基准上扩展):
//    - world.A / world.B 由「单个单位」改为「队伍数组」(每队 1~3 人,全场最多 6 人);
//      两队人数可不同,支持 1v1 / 1v2 / 1v3 / 2v1 / 2v2 / 2v3 / 3v1 / 3v2 / 3v3
//    - unit 新增 teamKey('A'/'B') 与站位格 cell(0..5)
//    - 阵型: 每队 3 列 × 2 行 = 6 个站位格(cell 0..2 = 前排 1/2/3 列,3..5 = 后排 1/2/3 列);
//      每队最多 3 人,可在 6 格中自由摆放(点击空格放置 / 拖动面板换位)
//    - 目标选择 pickTarget(全程确定性,不引入随机):
//        1) 逐列守卫: 后排单位仅在「同列前排已阵亡或该列无前排」时可选;
//           前排是否存活按列独立判定,而非全队判定(即某列前排阵亡后,该列后排立即可被选中)
//        2) 同列对位: 在上述候选集中优先选择与攻击方同列的敌人
//        3) 顺延: 同列无候选时按列距离由近及远扫描,距离相同取列索引小者
//    - 胜负判定: 团灭判负(一方全员阵亡才判负),单人阵亡后战斗继续
//    - 手动「攻击一次」: 两队存活队员按阵型格顺序(前排→后排,左→右)各攻击一次
//
//  行为基准: 原版 `1V1 单挑.html`(备份于 1V1 单挑-备份.html)。
//
//  v4.2 机制整理(合并用户方案 + 早期修改方案):
//    - 蓝条模板化: a模板=自然回蓝1/秒+普攻命中回蓝1/次(mage/warlock/hunter);
//                  b模板=自然回蓝1/秒+受击回蓝1/次(仅 tank);删除旧的「损失200HP回蓝」机制
//    - 诅咒改为附着在「目标」身上: 可任意施加并刷新,重伤(目标一切回复减半)作用于目标自身,
//      施法者死亡/被控不影响已释放诅咒,巫师可同时对多个目标维持诅咒
//    - 「眩晕」统一控制机制(并入旧「沉默缴械」): 禁普攻+禁技能,回蓝/CD 照常,已释放技能不中断
//    - SP(技能强度)统一: 由装备提供(专业法杖/迅捷法杖/星星魔法杖),放大「英雄自身固定数值的技能
//      伤害与技能回复」(圣光/铁壁/法师爆发/诅咒/狩猎标记/暗杀);以攻击力倍率计算的机制
//      (浴血/双拳/长矛)与装备型附加伤害(急速弓/太阳圣盾)不受益
//    - 全能吸血: 自身造成的一切伤害均可回复(当前仅守护斗篷触发后提供)
//    - 装备重做: 守护斗篷(350HP+绝境守护+10%全能吸血)、急速弓(AD+5/攻速+20%)、
//      星星魔法杖(AD+15/SP70%)、恢复水晶(每3秒回40)、新增普通装备「迅捷法杖」
//
//  v4.3 新版(新人物 / 旧人物调整 / 装备容量 / UI 重构):
//    - 新英雄: 剑士(1660/65,被动「剑气」8秒充能: 对同列全体 1.0AD 额外物理伤害 + 前排优先眩晕1秒);
//              圣骑(2200/40,双抗20,蓝20起5,b模板;蓝条技能「圣光」: 5秒内每秒回30HP且双抗+12,
//              技能释放完毕才可再次释放)
//    - 猎人重做(取代旧「狩猎标记」): 1600/80/物15魔10,蓝30起5,a模板,不锁蓝;
//      被动无视敌方10点护甲;技能「贯穿打击」满蓝释放 → 下3次攻击各 +50 物理伤害并对同列全体生效
//    - 进化兽: 进化间隔 6s → 5.5s;第4次进化在原有数值上额外 +13 双抗 + 20% 全能吸血
//    - 刺客: 新增「优先攻击后排」(候选集中存在可选后排时只从后排挑目标)
//    - 装备容量系统: 每角色 2 装备点;普通占1点/特殊(稀有)占2点;UI 装备栏 3 槽(第3槽预留禁用);
//      取消「相同装备/法力护符」的件数限制
//    - 唯一被动(重复装备不叠加): 魔返(法力护符·释放技能回蓝) / 血赋(流星锤·生命转攻击) /
//      御击(太阳圣盾·攻击附带双抗伤害)
//    - 覆盖机制: 血赋与御击在结算链最后一步计算,可吃到其他装备/技能的生命与双抗加成;
//      其余装备效果只作用于本体
//    - UI: 全局规则拆为「🎮 游戏玩法」「⚙️ 游戏机制」两个折叠区(不再罗列人物/装备数值调整);
//      「模拟统计」删除,改为「📖 人物介绍」(展示基础属性/技能/机制);
//      新增「💾 编队」(保存人物+装备+站位并命名,存 localStorage,可一键调用/删除)
//
//  v4.4 新版(战士/枪手重做 / 诅咒智能改投 / 挑战模式 / UI 修正):
//    - 修复「人物介绍」弹窗无法使用的问题(此前 #heroModal 缺少 CSS,弹窗常驻且无遮罩);
//      改为与「装备大全」一致的条目式列表: 基础数值 + 蓝条/回蓝机制 + 核心技能机制
//    - 「编队」界面删除(按需求移除);装备栏第 3 槽开放(总装备点仍为 2)
//    - 进化兽: 第4次进化移除「普攻回血25」(保留 +13双抗 + 20%全能吸血)
//    - 圣骑: 开局蓝 5 → 0
//    - 巫师诅咒目标优先级: 当前目标 > 「生命上限最高且未被诅咒」的单位;
//      若所有存活敌人均已挂诅咒(含仅剩1人) → 本次不释放,保留蓝量等待
//    - 战士重做: 1800/60/速1.2/甲16/魔16;删除「圣光打击」;
//      新增被动「铁血意志」(承伤200 或 攻击3次 +1层,每层+4攻/+1双抗,上限9层,护盾吸收不计);
//      新增大招「铁血破阵」(满9层自动触发·整局1次): 对敌方全体前排造成
//      1.2×攻击力 + 目标已损失生命×10% 的物理伤害,并回复300生命;触发后印记保留
//    - 枪手重做: 速0.9→1.2,移除基础暴击率与「暴击补偿」;
//      新增「左轮弹匣」(6发打空→2秒换弹,期间无法攻击)与「弱点锁定」
//      (换弹后锁定全场当前生命值最低的存活敌人,无视前排优先,弹匣打空前不换目标)
//    - 新增「🎯 挑战模式」: 3 个固定编队(队伍1吸血/队伍2三大肉/队伍4进化)可一键调用到 B 队;
//      预设队伍可脱离常规限制(人数可 >3),自行编辑仍受每队 3 人约束
//
//  v4.5 最终修订版(bug修复 / 英雄大调整 / 新英雄与Boss / 装备改动 / 挑战队伍改版):
//    - bug①: 自动战斗(startAuto)未透传人数上限 → 挑战队伍第4人被静默裁掉
//      (症状: 与预设队交战时"3个单位战败就结束"),已修复
//    - bug②: 全能吸血此前静默回血,现与其他回复一样展示数值日志;
//      战斗记录时间显示为 0.1s 精度(toFixed(1),既有行为确认)
//    - 格斗家: 充能 8s→6s,持续 8s→9s
//    - 战士: 双抗 16→15;铁血意志每层 +4攻→+3攻,上限 9→12 层;
//      铁血破阵回复「固定300」→「大招总伤害的30%」
//    - 勇士: 生命 1660→1700,攻速 1.3→1.35
//    - 剑士重做: 剑气 = 每8s后下一次攻击双倍伤害,同时波及同列全体(均受双倍伤害)并全体眩晕1s
//      (v2.5 起波及/眩晕范围已由「同列」改为「同行」)
//    - 坦克重做: 攻击 50→52;「铁壁反击」→「生命打击」: 满20蓝蓄力,下次普攻+120魔伤,
//      回复自身已损失生命的10%(最低50)
//    - 游侠: 攻速 2.0→1.8;新被动「破魔箭」: 攻击附带6点魔法伤害(经魔抗)
//    - 枪手: 攻速锁定1.2;装备攻速(百分比先按基础攻速折算)按每0.05 → +1攻击力(四舍五入)
//    - 新英雄 精灵🌿(1800/35/甲10/魔22/速0.75): 普攻改为治疗己方血量最低(含自身,须已损血,
//      平局按站位顺位,全员满血空过);开局0只小精灵(v2.7),每5s+1(上限7),每只+5攻,
//      小精灵每1s按对位规则攻击(10魔伤),不可被击败,精灵阵亡即停
//    - 新 Boss 大熊🐻(15000/100/双抗20/速1.0,挑战队伍5): 普攻随机选敌;
//      每6s对全体敌人造成200物伤+眩晕1s;HP<5000进入二形态(+50攻/速1.5/吸血15%,重击300+眩晕2s);
//      第32s回复1000生命+5双抗;人物介绍中标注「🏆BOSS单位」(不进入普通选人网格)
//    - 专业法杖: 自然回蓝+1/秒 → 普攻命中回蓝+1/次
//    - 恢复水晶重做: 生命+200→+100;每3秒回40 → 「释放技能」触发: 3秒每秒回25(可叠加独立结算);
//      触发口径: 蓝条技能/CD技能(剑气·生命打击·贯穿)/模式转换(双拳·浴血首次·熊二形态)/大招(铁血破阵)
//    - 新装备 玉面刃💠(特殊·占2点): 攻+15/攻速+0.15;高于50%血→攻+30;低于50%血→攻速0.35(动态切换)
//    - 挑战队伍改版: 预设不受装备点限制(freeEquip);队伍1的2号位勇士3把镰刀;队伍2游侠2把急速弓;
//      队伍4进化兽改4/5号位并加急速弓;新增队伍3(均衡:双坦克/战士/精灵)与队伍5(Boss大熊)
//
//  v4.6 补丁版(刺客真正切后排 / 同名区分 / 大熊nerf / 新Boss大魔法师 / 挑战6队):
//    - 刺客重做(真正的bug修复): 旧实现是在「逐列守卫」候选池里挑后排,而守卫要求同列前排阵亡后
//      后排才可选 → 优先后排几乎永不触发。现改为: 无视前排守卫,只要存在存活后排就直打后排
//      (与自身站位无关,同列优先→距离顺延);后排全部阵亡后才回落普通规则
//    - 同名角色区分: 同队同名自动编号(战士1/战士2);战斗日志中 A 队名字蓝色、B 队名字红色
//    - 队伍4: 保留 4/5 号位进化兽,1/2 号位增加 2 名带生命腰带的圣骑(共6人)
//    - 大熊 nerf: 生命 15000→12000,攻击 100→80;二阶段攻击 80→120(即+40);
//      裂地重击 200→160,二阶段 300→240
//    - 新Boss 大魔法师🧿(10000/80法术/甲15/魔25/速1.0,蓝35起5,挑战队伍6):
//      普攻为法术伤害且随机选敌;蓝机制=自然回蓝1/秒+受击回蓝1/次+每损失200生命回蓝+1;
//      秘法风暴: 满蓝进入1.5s前摇(期间不回蓝,被眩晕则取消并保留蓝量,解除后重新蓄力),
//      施放对「随机主目标」300魔伤并使其魔抗永久-2,其余存活敌人各150;
//      第30s双抗+5且蓝上限变为30;人物介绍标注「🏆BOSS单位」
//
//  v4.7 平衡 / 日志 / 装备分档版(依据玩家文本逐条修改):
//    - 巫师: 诅咒对 BOSS 单位设上限 —— 生命上限按 min(最大生命, 5000) 折算,
//      单次(每秒)3% 的伤害不超过 150 (限制对 Boss 的强势)
//    - 格斗家: 充能 8s→6s(修复 cooldownDuration 未同步导致仍为 8s), 持续 9s
//    - 猎人: 蓝量上限 30→25
//    - 勇士: 浴血奋战改为「粘性」—— 发动后除非生命值回满, 否则效果不结束
//    - 游侠: 破魔箭的 6 点魔法伤害现在会单独出现在战斗日志中(魔法伤害)
//    - 战斗日志伤害配色: 物理=红色 / 真实=白色加粗 / 魔法=蓝色
//    - 大魔法师: 生命 10000→11000, 新增「普攻命中回蓝 +1/次」
//    - 大熊 更名为「熊王」
//    - 装备分档重构: 普通装备(占1点) / 特殊装备(不消耗装备点) / 稀有装备(占2点)
//        特殊装备 = 星星魔法杖(移除 +15 攻击力) + 荆棘之甲 + 熊王爪 + 恢复水晶
//        稀有装备 = 太阳圣盾 / 守护斗篷 / 玉面刃 (原「特殊装备」整体改名)
//      新增 荆棘之甲: +250生命 / +10护甲 / 受到伤害后反弹 0.5×AR 的魔法伤害
//      新增 熊王爪: 英雄基础生命值 ≥ 1700 方可装备; +25 攻击力; 每次攻击使目标护甲 -1
//      恢复水晶重做: 每 2 秒回复 40 点生命值
//    - UI: 人物介绍拆为「👤 英雄 / 🏆 BOSS」两栏, 装备大全拆为「普通 / 特殊 / 稀有」三栏;
//      角色面板与人物介绍改用 AR(护甲) / MR(魔抗) / HR(生命值) 简称, 攻速显示两位小数
//
//  v4.8 远征挑战(肉鸽模式 v2.0):
//    - 主界面新增「🗺️ 远征挑战」入口; 整个远征在独立弹窗内完成, 不进入主战斗界面
//    - 玩家只能操作 A 队: B 队(敌人)由系统按关卡生成, 不可编辑
//    - 小地图 3 关必须按顺序推进:
//        第1关: 出征随机5选2英雄 + 随机5选1普通装备 → 敌 2 名随机英雄(排除玩家已选)
//        第2关: 胜利后随机5选1英雄加入(凑满3人) → 敌 3 名随机英雄
//        第3关: 胜利后获得随机 2 件普通装备 + 1 件稀有装备 → 敌 原队伍1(吸血)
//    - 生命(机会) 3 点: 每关失败扣 1 点并回到整备重试本关, 扣完则远征失败
//    - 每关开战前重新构建世界 → 全队回满血(无血量继承)
//    - 新增背包栏: 获得的装备全部存入背包, 可自由分配给任意队员(每名队员仍受 2 装备点限制)
//    - 小战场自带双方卡片 / 血条 / 状态徽章 / 战斗日志 / 自动战斗(1x·2x·4x)与「立即结算」
//
//  v4.9 远征挑战 2.1(节点式 / 全屏 / 金币商店 / 站位):
//    - 远征窗口改为全屏, 并移植主界面的「3 列 × 2 行」阵型站位设置
//    - 3 关改为 5 个节点: ①出征(5选2英雄 + 4选1基础装备) ②战斗(2 名随机英雄, 不会出现玩家已有英雄)
//      ③战斗(3 名随机英雄, 1/2/3 号位, 各带 1 个恢复水晶) ④商店 ⑤最终战(原队伍1)
//    - 新增金币: 每个战斗节点胜利 +10; 商店随机 5 件基础装备(10 金) + 2 件稀有装备(20 金)
//    - 奖励调整: ② 胜利 → 基础装备4选1 → 英雄2选1(凑满3人); ③ 胜利 → 稀有装备3选1(v2.4 起不再赠送恢复水晶)
//    - 每次战斗前进入整备界面: 站位(点击/拖拽换位) + 背包装备分配 + 敌方阵容预览
//
//  v4.10 远征挑战 2.2(7 节点 / 装备升级 / BOSS / 前后排 6 站位):
//    - 节点 5 → 7: ⑤装备升级点(10 金/次, 无战斗可直接通过) ⑥精英战(原队伍1) ⑦BOSS 大魔法师(击败即通关)
//    - 新增「装备升级系统」(v2.6 起升级装备已进入 EQUIP_LIST, 普通对局装备栏可直接选用):
//        · 流星锤 → 碎岩流星锤 : 生命+100, 无视敌方 50% 护甲(物理), 血赋 1% → 1.5%
//        · 急速弓 → 霜天风暴弓 : 攻击+10, 攻速+25%, 攻击附带寒冰印记(带印记者攻速 -10%,
//                                不管多少层; 叠满 10 层 → 冻结 1.5s 并清空印记)
//        · 精钢剑 → 幸运精钢剑 : 攻击+25%, 暴击率+20, 暴击后额外获得 1 枚金币(远征模式)
//        · 专业法杖 → 灵能大法杖: 普攻命中回蓝+1.5/次, SP+50, 每释放一次蓝技能 SP+10(最多累计+100)
//    - 远征战场改为与普通战斗一致: 敌我双方各「3 列 × 2 行」= 前后排 6 个站位
//    - 战斗界面可「⚙ 调整装备/站位」暂停回整备(不消耗生命), 升级装备可即时分配上阵
//    - 修复: makeUnit 在 applyEquips 之后把 sp 清零, 导致所有装备的 SP 加成从未生效
//
//  v4.11 远征挑战 2.3(战斗界面上下布局 / 商店卖装备 / 秘法风暴侧伤可见):
//    - 战斗界面由「左右对峙」改为「上下对阵」: B 队在上、A 队在下, 双方前排都贴中间那条线,
//      战斗日志移到整个战场右侧(与阵容并列, 高度随战场拉伸), 左右分栏不镜像(1列正对1列)
//    - 商店新增「卖装备」: 普通 6 金 / 稀有 12 金 / 🔧升级装备 10 金(按升级后的价值回收,
//      与升级成本一致); 只能卖背包里闲置的那一份, 已全部装备在队员身上的先卸下再卖
//      (按钮置灰); 非商店节点不显示卖出按钮
//    - 秘法风暴: 其余敌人各受 150 的伤害此前只结算不记日志(看起来像没打中其他人),
//      现改为逐目标记日志「秘法风暴波及 X：127.5 魔法伤害（150 基础）」
//
//  v2.7 数值调整 / 机制补充 / 新升级装备(依据玩家需求文本):
//    - 枪手 生命 1380→1444; 猎人 生命 1700→1780、蓝上限 25→24; 刺客 生命 1400→1500
//    - 法师: 生命 1500→1580; 法术爆发 250→280 并新增 0.5s 施法时间
//        (吟唱途中被眩晕 → 中断且蓝量保留, 解除眩晕后重新吟唱; 已开始结算的技能不被打断)
//    - 格斗家 双抗 10→15; 剑士 攻击力 65→70
//    - 精灵: 移除开局自带的小精灵(从 0 只开始每 5s +1), 攻速 0.75→0.8
//    - 魔剑士 星落首次命中眩晕 0.5s→1s; 精灵小精灵描述伤害 20→10(与实际配置对齐)
//    - 长枪手「独守阵线」: +20 攻击力改为实时写入角色面板(条件生效/失效时动态加减 + 绿色高亮)
//    - 黑暗游侠「黑暗护盾」: 被护盾挡下的技能不再扣黑暗之力层数; 攻击技能附带的控制
//        (剑气 / 裂地重击 / 寒冰冻结 / 星落)同样会被护盾抵消, 需重新叠层控制
//    - 新升级装备 🔧吸血镰刀 → 🩸嗜血狂镰: 攻击力+20 / 全能吸血+15% / 攻速+0.2(固定),
//        被动·嗜血: 每攻击一次额外 +0.5% 全能吸血(最多额外 +15%)
//    - 新规则: 每人只能携带 1 件升级装备(装备下拉会置灰其余升级装备)
//    - 修复: makeUnit 在 applyEquips 之后把 leechAll 清零 → 装备提供的全能吸血从未生效
//
//  v2.6 数值调整 / 新 BOSS 黑暗游侠 / 界面增强(依据玩家需求文本):
//    - 大魔法师: 秘法风暴主目标 300→360, 次要目标 150→180; 生命 11000→10000;
//        等级 A级→B级; 被动「秘法强化」(第30s双抗+5且蓝上限降为30) 整条移除
//    - 幽魂: 攻速 0.75→0.8, 攻击力 60→70
//    - 精灵·小精灵: 单只魔法伤害 20→10
//    - 猎人: 生命 1600→1700, 护甲 15→18, 魔抗 10→12
//    - 新 BOSS 黑暗游侠🏹(A级, 8000/50/速2.0/甲30/魔30, 挑战队伍8):
//        1) 对位锁定: 按「逐列守卫→同列对位→顺延」选一名目标并锁定, 只有将其击败后才换下一个单位
//        2) 被动「黑暗汲取」: 每次攻击 +1 层黑暗之力(每层 +1 攻击力, 层数无上限); 被控制技能命中 -10 层
//        3) 被动「黑暗护盾」: 每 5s 自获 1 层(可叠加), 每层免疫一次敌方「主动技能伤害」;
//           若免疫的是诅咒这类持续伤害, 其后续跳数也不再结算; 击败一个单位后立刻再 +1 层
//    - 熊王二形态: 额外 +15 双抗
//    - 挑战队伍: 每条队伍新增「调用到 A 队」按钮(原按钮改为明确的「调用到 B 队」)
//    - 🔧升级装备(碎岩流星锤/霜天风暴弓/幸运精钢剑/灵能大法杖)并入普通对战装备栏:
//        加入 EQUIP_LIST + 新增「升级装备」档位(占 1 装备点), 装备下拉与「装备大全」均可直接选用
//
//  v2.5 新角色 / 技能重做 / BOSS 分级(依据玩家需求文本):
//    - 新英雄 魔剑士🌠(1650/65/速1.2/甲15/魔18):
//        被动1: 每次攻击获得 10 点魔法充能
//        被动2「星落」: 充能满 100 → 攻击模式改为每 0.5s 对随机敌方单位造成 0.6×攻击力 的
//              魔法伤害, 持续 10s(首次被星落命中的单位眩晕 0.5s); 星落期间不再普攻/不再积累充能,
//              结束后失去全部充能, 需重新攻击积累
//    - 新英雄 长枪手🪖(1800/80/速0.8/甲20/魔15):
//        被动「独守阵线」: 位于后排且前排没有己方单位时, 攻击力 +20 且无视敌人 10 点护甲
//        CD技能「三连突刺」: 每 7s 蓄力 1s, 对敌方同列的所有单位造成 3 连击
//    - 猎人技能重做:「贯穿打击」→「猎网」: 满25蓝释放, 对敌方「攻击力最高」的单位造成 150 点
//        物理伤害, 并使其攻速 -20% 持续 3s(被动无视10点护甲保留)
//    - 剑士「剑气」: 波及与眩晕范围由「同列」改为「同行」
//    - BOSS 分级 + 新 BOSS 幽魂👻(B级, 6000/60法术/速0.75/甲30/魔15, 挑战队伍7):
//        1) 普通攻击随机命中 2 个敌方单位, 造成魔法伤害
//        2) 被动「不灭怨念」: 首次死亡后 2s 内免疫一切伤害, 随后满血复活且攻击力 +30
//        3) 被动「噬魂」: 敌方场上有单位被击败后, 立刻恢复 2000 生命(可突破生命上限) 且攻击力 +30
//      熊王/大魔法师 标注为 A 级, 幽魂为 B 级(人物介绍 / 挑战队伍列表均显示等级)
// ============================================================
(function () {
'use strict';

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

// ============================================================
//  ② 数据层
// ============================================================

// 稀有装备(太阳圣盾、守护斗篷、玉面刃)——原「特殊装备」更名, 占用 2 装备点
const RARE_EQUIPS = ['sunshield', 'cloak', 'jade_blade'];

// 荆棘之甲反伤递归保护: 反弹产生的伤害不再触发反伤(深度计数, 支持多人互弹)
let reflectGuard = 0;

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
                    statsText: ['生命值 +20%', '护甲 +5%', '魔抗 +5%'], hpBonus: 0.20, armorBonus: 5, mrBonus: 5 }),
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
                    statsText: ['护甲 +8%', '魔抗 +8%', '唯一被动·御击：攻击附带 (护甲+魔抗) 的额外魔法伤害（覆盖机制）',
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
            unit.hp = Math.min(unit.maxHp, unit.hp + heal);
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
            while (unit.evoTimer >= CONFIG.evolution.interval && unit.evoStage < CONFIG.evolution.maxStages) {
                unit.evoTimer -= CONFIG.evolution.interval;
                applyEvo(unit, world);
            }
        },
        onBeforeHit(unit, enemy, ctx, world) {
            // 进化满(第4次)后每次普攻回血 25,受减疗
            if (unit.evoHeal > 0) {
                const hh = applyHealReduction(unit, unit.evoHeal);
                unit.hp = Math.min(unit.maxHp, unit.hp + hh);
            }
        },
        statusText(unit) {
            const prog = Math.min(100, (unit.evoTimer / CONFIG.evolution.interval) * 100);
            const label = unit.evoStage >= CONFIG.evolution.maxStages ? '已满' : `${unit.evoStage}/${CONFIG.evolution.maxStages}`;
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
            unit.stats.dmgDealt += dmg;
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
                unit.stats.dmgDealt += d;
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
                if (applyStunTo(world, t, CONFIG.swordAura.stunSec, { label: '剑气震荡' })) continue;
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
            world.addLog(`⚜️ ${unit.name} 释放圣光！${CONFIG.paladin.durationSec} 秒内每秒回复 ${CONFIG.paladin.healPerSec} HP，双抗 +${CONFIG.paladin.resistBonus}`, 'highlight');
        },
        onTick(unit, world, dt) {
            if (!unit.holyActive) return;
            unit.holyTimer += dt;
            unit.holyAccum = (unit.holyAccum || 0) + dt;
            while (unit.holyAccum >= 1.0) {
                unit.holyAccum -= 1.0;
                if (unit.hp <= 0) return;
                const hh = applyHealReduction(unit, CONFIG.paladin.healPerSec);
                unit.hp = Math.min(unit.maxHp, unit.hp + hh);
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
                unit.hp = Math.min(unit.maxHp, unit.hp + heal);
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
            if (unit.hp <= 0) return;
            // 召唤(开局已有1只,由 makeUnit 初始化)
            const cfg = CONFIG.fairySpirit;
            unit.spiritTimer += dt;
            while (unit.spiritTimer >= cfg.summonInterval && unit.spiritCount < cfg.maxCount) {
                unit.spiritTimer -= cfg.summonInterval;
                unit.spiritCount++;
                unit.atk = round1(unit.atk + cfg.atkPerSpirit);
                world.addLog(`✨ ${unit.name} 召唤小精灵（${unit.spiritCount}/${cfg.maxCount}，攻击力+${cfg.atkPerSpirit}）`, 'highlight');
            }
            // 小精灵攻击: 每1s按对位规则各攻击一个敌人
            unit.spiritAtkTimer += dt;
            while (unit.spiritAtkTimer >= 1.0) {
                unit.spiritAtkTimer -= 1.0;
                if (unit.spiritCount <= 0) break;
                let total = 0, targets = [];
                for (let i = 0; i < unit.spiritCount; i++) {
                    const t = pickTarget(world, unit);          // 按当前对位选取
                    if (!t || !isAlive(t)) break;
                    const dmg = Math.max(0.1, round1(cfg.spiritDmg * (1 - t.mr / 100)));
                    applyDamageTo(world, t, dmg, unit);
                    unit.stats.dmgDealt += dmg;
                    total += dmg; targets.push(t.name);
                    if (t.hp <= 0) { handleDeath(world, t, unit); if (world.winner) return; }
                }
                if (targets.length) {
                    world.addLog(`✨ ${unit.name} 的小精灵们攻击 ${targets.join('、')}：${dmgSpan(round1(total), 'magical')} 魔法伤害`, '');
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
                unit.hp = Math.min(unit.maxHp, unit.hp + heal);
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
                    unit.stats.dmgDealt += dmg;
                    applyStunTo(world, e, stunSec, { label: '裂地重击', event: ev });
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
                if (!applyStunTo(world, enemy, cfg.freezeSec, { label: '寒冰印记冻结' })) {
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
    //   被动2: 充能满 100 → 进入「星落」10s: 攻击模式改为每 0.5s 对随机敌方单位造成 0.6×攻击力 魔法伤害
    //          (首次被星落命中的单位眩晕 1s); 星落期间不再普攻、不再积累充能; 结束后清空充能重新积累
    starfall: {
        // 被动1: 攻击命中获得充能(该钩子无 world 参数, 触发判定与日志放在 onTick)
        onHitDealt(unit) {
            if (unit.starfallTimer > 0) return;
            const cfg = CONFIG.starfall;
            unit.magicCharge = Math.min(cfg.maxCharge, round1((unit.magicCharge || 0) + cfg.chargePerHit));
        },
        onTick(unit, world, dt) {
            if (unit.hp <= 0) return;
            const cfg = CONFIG.starfall;
            // ① 充能溢出 → 开启星落(立即轰击第 1 次, 之后每 0.5s 一次, 10s 内共 20 次)
            if (unit.starfallTimer <= 0 && (unit.magicCharge || 0) >= cfg.maxCharge) {
                unit.magicCharge = 0;
                unit.starfallTimer = cfg.durationSec;
                unit.starfallAccum = 0;
                notifySkillCast(unit, world);
                world.addLog(`🌠 ${unit.name} 魔法充能满溢，星落降临！${cfg.durationSec} 秒内每 ${cfg.interval}s 对随机敌方单位造成 ${cfg.adRatio}×攻击力 的魔法伤害（期间不再普攻）`, 'highlight');
                starfallPulse(unit, world, cfg);
                if (world.winner) return;
            }
            if (unit.starfallTimer <= 0) return;
            // ② 星落轰击: 每 0.5s 一次, 随机选取存活敌人
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
            if (unit.starfallTimer > 0) {
                return `<span class="status-badge" style="border-color:#8e44ad;color:#c39bd3;">🌠 星落 ${unit.starfallTimer.toFixed(1)}s</span>`;
            }
            return `<span class="status-badge" style="border-color:#5d6d9e;color:#9fb0d0;">✨ 充能 ${unit.magicCharge || 0}/${cfg.maxCharge}</span>`;
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

// ---- v2.5 辅助: 星落单次轰击(随机命中 1 个存活敌人, 0.6×攻击力 魔法伤害; 该目标首次被命中额外眩晕 0.5s) ----
function starfallPulse(unit, world, cfg) {
    const enemies = world[enemyTeamKey(unit.teamKey)];
    const alive = [];
    for (let i = 0; i < enemies.length; i++) if (isAlive(enemies[i])) alive.push(enemies[i]);
    if (!alive.length) return;
    const t = alive[Math.floor(world.rng() * alive.length) % alive.length];
    const dmg = Math.max(0.1, round1(unit.atk * cfg.adRatio * (1 - getDefense(t, 'magical') / 100)));
    // v2.7: 同一次技能的事件标记 —— 若伤害被黑暗护盾抵消, 附带的眩晕也由同一层护盾抵消
    const ev = newShieldEvent();
    applyDamageTo(world, t, dmg, unit, { skill: true, event: ev });
    unit.stats.dmgDealt += dmg;
    let msg = `🌠 星落命中 ${t.name}：${dmgSpan(dmg, 'magical')} 魔法伤害`;
    if (!t.starfallHitFlag) {
        t.starfallHitFlag = true;
        if (!applyStunTo(world, t, cfg.stunSec, { label: '星落眩晕', event: ev })) {
            msg += `，首次命中额外眩晕 ${cfg.stunSec}s`;
        }
    }
    world.addLog(msg, '');
    if (t.hp <= 0) handleDeath(world, t, unit);
}
// ---- v2.5 辅助: 取敌方「攻击力最高」的存活单位(猎网用; 攻击力相同时取站位靠前者) ----
function pickStrongestEnemy(world, unit) {
    const enemies = world[enemyTeamKey(unit.teamKey)];
    let best = null;
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!isAlive(e)) continue;
        if (!best || e.atk > best.atk) best = e;
    }
    return best;
}
// ---- v2.5 辅助: 长枪手「独守阵线」判定(位于后排 row=1, 且己方前排 row=0 已无存活单位) ----
function lancerAlone(unit, world) {
    if (!world || unit.row !== 1) return false;
    const allies = world[unit.teamKey];
    for (let i = 0; i < allies.length; i++) {
        const a = allies[i];
        if (a !== unit && a.row === 0 && isAlive(a)) return false;
    }
    return true;
}
// ---- v2.7 长枪手 · 独守阵线「动态数值」: 条件生效/失效时把 +20 攻击力真正加减到面板上 ----
//   进入生效: 攻击力 +20 并立即刷新画面; 失去条件: 扣回 20
function updateLancerAlone(unit, world) {
    if (!hasMech(unit, 'lancerStrike')) return;
    const alone = (unit.hp > 0) && lancerAlone(unit, world);
    if (alone === !!unit._lancerAlone) return;
    unit._lancerAlone = alone;
    unit.lancerAloneActive = alone;
    if (alone) unit.atk = round1(unit.atk + CONFIG.lancer.rowAtkBonus);
    else unit.atk = round1(Math.max(0, unit.atk - CONFIG.lancer.rowAtkBonus));
    world.uiDirty = true;
    world.addLog(`🪖 ${unit.name} 独守阵线${alone ? '生效' : '失效'}：攻击力 ${alone ? '+' : '-'}${CONFIG.lancer.rowAtkBonus}（当前 ${unit.atk}）`, 'highlight');
}
// ---- v2.7 法师 · 法术爆发结算(吟唱 0.5s 结束后触发) ----
function castMageBurst(world, unit) {
    const defender = pickTarget(world, unit);
    unit.mana = 0;
    applyManaRefund(world, unit);
    notifySkillCast(unit, world);
    if (!defender || defender.hp <= 0) return;
    const defPct = getDefense(defender, 'magical');
    // 法术爆发为法师自身技能伤害,吃 SP(applyEquips 不再预乘,统一在此刻折算)
    let dmg = unit.skillDmg * spOf(unit) * (1 - defPct / 100);
    dmg = Math.max(0.1, round1(dmg));
    const ev = newShieldEvent();
    applyDamageTo(world, defender, dmg, unit, { skill: true, event: ev });
    world.round++;
    world.addLog(`🔮 ${unit.name} 释放法术爆发！造成 ${dmgSpan(dmg, 'magical')} 魔法伤害`, 'highlight');
    unit.stats.dmgDealt += dmg;
    if (defender.hp <= 0) handleDeath(world, defender, unit);
}
// ---- v2.5 长枪手 · 三连突刺: 对敌方「同列」所有存活单位各造成 3 连击(物理伤害, 各自结算护甲) ----
function castLancerTripleStrike(world, unit) {
    const cfg = CONFIG.lancer;
    // v2.7: 独守阵线的 +20 攻击力已由 updateLancerAlone 实时加到 unit.atk 上(面板同屏显示),此处不再重复叠加
    const alone = lancerAlone(unit, world);
    const pen = alone ? cfg.armorPen : 0;
    const enemies = world[enemyTeamKey(unit.teamKey)];
    const targets = [];
    for (let i = 0; i < enemies.length; i++) {
        if (isAlive(enemies[i]) && enemies[i].col === unit.col) targets.push(enemies[i]);
    }
    notifySkillCast(unit, world);
    if (!targets.length) {
        world.addLog(`🔱 ${unit.name} 三连突刺落空（敌方同列没有单位）`, '');
        return;
    }
    let grand = 0;
    for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        let sum = 0, times = 0;
        for (let h = 0; h < cfg.hits; h++) {
            if (!isAlive(t)) break;
            const def = Math.max(0, getDefense(t, 'physical') - pen);
            const dmg = Math.max(0.1, round1(unit.atk * (1 - def / 100)));
            applyDamageTo(world, t, dmg, unit, { skill: true });
            unit.stats.dmgDealt += dmg;
            world.round++;
            sum += dmg;
            times++;
            if (t.hp <= 0) break;
        }
        grand += sum;
        world.addLog(`🔱 ${unit.name} 三连突刺命中 ${t.name} ${times} 次：${dmgSpan(round1(sum), 'physical')} 物理伤害`, 'highlight');
        if (t.hp <= 0) {
            handleDeath(world, t, unit);
            if (world.winner) return;
        }
    }
    world.addLog(`🔱 ${unit.name} 三连突刺！同列 ${targets.length} 个目标共 ${dmgSpan(round1(grand), 'physical')} 物理伤害`, 'highlight');
}
// ---- v2.5 BOSS 幽魂 · 撕裂之魂: 随机命中 2 个敌方单位(魔法伤害, 走普攻触发管线但无暴击/吸血) ----
function performGhostAttack(world, unit) {
    const enemies = world[enemyTeamKey(unit.teamKey)];
    const pool = [];
    for (let i = 0; i < enemies.length; i++) if (isAlive(enemies[i])) pool.push(enemies[i]);
    if (!pool.length) return false;
    const n = Math.min(CONFIG.ghost.atkTargets, pool.length);
    const picks = [];
    for (let i = 0; i < n; i++) {
        const idx = Math.floor(world.rng() * pool.length) % pool.length;
        picks.push(pool.splice(idx, 1)[0]);          // 同一次攻击不重复命中同一单位
    }
    world.round++;
    unit.atkCount = (unit.atkCount || 0) + 1;
    unit.stats.attacks = (unit.stats.attacks || 0) + 1;
    let total = 0;
    const names = [];
    for (let i = 0; i < picks.length; i++) {
        const t = picks[i];
        if (!isAlive(t)) continue;
        const dmg = Math.max(0.1, round1(unit.atk * (1 - getDefense(t, 'magical') / 100)));
        applyDamageTo(world, t, dmg, unit);
        unit.stats.dmgDealt += dmg;
        total += dmg;
        names.push(t.name);
        if (t.hp <= 0) {
            handleDeath(world, t, unit);
            if (world.winner) return true;
        }
    }
    world.addLog(`👻 ${unit.name} 撕裂之魂：随机撕咬 ${names.join('、')}，共 ${dmgSpan(round1(total), 'magical')} 魔法伤害（${picks.length} 目标）`, '');
    return true;
}

// ---- 机制分发辅助: 按单位身上注册的机制列表依次调用钩子 ----
function hasMech(unit, id) {
    return unit.mechanics.indexOf(id) >= 0;
}
function fireMechs(unit, hook, ...args) {
    const list = unit.mechanics;
    for (let i = 0; i < list.length; i++) {
        const m = MECHANICS[list[i]];
        if (m && typeof m[hook] === 'function') m[hook](unit, ...args);
    }
}
function mechTick(unit, id, world, dt, opts) {
    if (hasMech(unit, id)) {
        const m = MECHANICS[id];
        if (m && typeof m.onTick === 'function') m.onTick(unit, world, dt, opts);
    }
}

// ============================================================
//  ③ 引擎层(纯逻辑,无 DOM)
// ============================================================
function round1(v) { return Math.round(v * 10) / 10; }
// v2.5: 攻速保留两位小数(UI 本就按两位小数展示; 例: 幽魂/精灵 0.75 若用 round1 会被错误抬到 0.8)
function round2(v) { return Math.round(v * 100) / 100; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function getDefense(unit, atkType) { return (atkType === 'physical') ? unit.armor : unit.mr; }
// ---- 攻速倍率统一计算: 各类减速叠乘,互不覆盖 ----
//  历史问题: 猎网(-20%)与寒冰印记(-10%)各自直接写 speedMul,后写入者会抹掉先前的减速;
//  冻结时直接写 speedMul = 1 更会把仍在生效的猎网一并解除。故此所有减速只允许记状态,由本函数换算。
function recalcSpeedMul(unit) {
    let mul = 1;
    if (unit.netSlowTimer > 0) mul *= (1 - CONFIG.hunterNet.speedDownPct);
    if ((unit.frostStacks || 0) > 0) mul *= (1 - CONFIG.frostMark.speedDownPct);
    unit.speedMul = round2(mul);
    return unit.speedMul;
}
// ---- 战斗日志伤害配色(v4.7): 物理=红色 / 真实=白色加粗 / 魔法=蓝色 ----
function dmgClass(kind) {
    return kind === 'true' ? 'dmg-true' : (kind === 'magical' ? 'dmg-magic' : 'dmg-physical');
}
function dmgSpan(value, kind) {
    return `<span class="${dmgClass(kind)}">${value}</span>`;
}
// 由攻击上下文推断本次伤害类型(true=真实 / magical=魔法 / 其余=物理)
function hitKind(ctx) {
    if (ctx.isSpear) return 'true';
    return ctx.atkType === 'magical' ? 'magical' : 'physical';
}
// ---- SP(技能强度): 装备提供(专业法杖/迅捷法杖/星星魔法杖…),作用于英雄自身固定数值技能伤害/回复 ----
function spOf(unit) { return 1 + (unit.sp || 0) / 100; }
// 重伤: 目标身上存在诅咒时,其一切回复(吸血/技能回复/装备回复/触发回复)减半
function isHealReduced(unit) { return !!(unit && unit.curse); }
function applyHealReduction(unit, amount) {
    return isHealReduced(unit) ? round1(amount * CONFIG.curse.healReduce) : round1(amount);
}

// ---- 队伍相关工具 ----
const TEAM_KEYS = ['A', 'B'];
function enemyTeamKey(teamKey) { return teamKey === 'A' ? 'B' : 'A'; }
function isAlive(unit) { return !!unit && unit.hp > 0; }
function aliveCount(world, teamKey) {
    let n = 0;
    for (let i = 0; i < world[teamKey].length; i++) if (world[teamKey][i].hp > 0) n++;
    return n;
}
// 队伍名字颜色(A 蓝 / B 红): 日志中区分不同队伍的同名角色
function tn(unit) {
    const c = unit.teamKey === 'A' ? '#7ec8ff' : '#ff9b9b';
    return `<span style="color:${c};font-weight:bold;">${unit.emoji}${unit.name}</span>`;
}
// 单位展示名(带队伍颜色)
function unitLabel(unit) { return tn(unit); }

// ---- 阵型站位(3 列 × 2 行 = 6 格;cell = row * cols + col) ----
//  cell 0,1,2 = 前排 1/2/3 列;cell 3,4,5 = 后排 1/2/3 列
const ROW_NAMES = ['前排', '后排'];
function cellRow(cell) { return Math.floor(cell / CONFIG.teams.cols); }   // 0 = 前排, 1 = 后排
function cellCol(cell) { return cell % CONFIG.teams.cols; }               // 0..2 列索引
function cellName(cell) { return `${ROW_NAMES[cellRow(cell)]}${cellCol(cell) + 1}列`; }
function isFrontRow(cell) { return cellRow(cell) === 0; }
// 自动布阵时的优先顺序: 前中 → 前左 → 前右 → 后中 → 后左 → 后右(延续「1号位居中」语义)
const DEFAULT_CELL_ORDER = [1, 0, 2, 4, 3, 5];
function isValidCell(cell) { return typeof cell === 'number' && cell >= 0 && cell < CONFIG.teams.cells; }

// ---- 目标选取(引擎层唯一取敌入口) ----
//  规则(全程确定性,不引入随机):
//   1) 逐列守卫: 后排单位仅在「同列前排已阵亡或该列无前排」时可选;
//      前排是否存活按列独立判定,而非全队判定
//   2) 对位: 在满足 1) 的候选集中,优先选择与攻击方「同列」的敌人
//   3) 顺延: 同列无候选 → 按列距离由近及远扫描,距离相同时取列索引小者

// 指定列是否仍有存活的前排单位(逐列守卫的判定依据)
function columnFrontAlive(enemies, col) {
    for (let i = 0; i < enemies.length; i++) {
        const u = enemies[i];
        if (u.col === col && u.row === 0 && isAlive(u)) return true;
    }
    return false;
}

function pickTarget(world, attacker) {
    const enemies = world[enemyTeamKey(attacker.teamKey)];
    // 0) 枪手 · 弱点锁定: 换弹完成后锁定「当前生命值最低」的存活敌人(无视前排优先),弹匣打空前不换目标
    if (hasMech(attacker, 'revolver')) {
        if (attacker.reloading) return null;           // 换弹期间无法攻击
        let lock = attacker.lockedTarget;
        if (!lock || !isAlive(lock)) {
            lock = null;
            for (let i = 0; i < enemies.length; i++) {
                const u = enemies[i];
                if (!isAlive(u)) continue;
                if (!lock || u.hp < lock.hp) lock = u;
            }
            attacker.lockedTarget = lock;
        }
        return lock;
    }
    // 0.2) 魔剑士 · 星落(v2.5): 星落期间攻击模式被星落替代, 不再进行普通攻击
    if (attacker.starfallTimer > 0) return null;
    // 0.5) Boss(大熊/大魔法师/幽魂): 普通攻击随机选取存活敌人(使用 world.rng,固定种子下可复现)
    if (hasMech(attacker, 'bossBear') || hasMech(attacker, 'archmage') || hasMech(attacker, 'ghost')) {
        const alive = enemies.filter(u => isAlive(u));
        if (alive.length === 0) return null;
        return alive[Math.floor(world.rng() * alive.length) % alive.length];
    }
    // 0.7) 刺客: 无视前排守卫,只要存在存活后排就优先后排(与自身站位无关);
    //      后排全部阵亡后才落入普通规则(对位/顺位)选择
    if (hasMech(attacker, 'assassinate')) {
        const backs = [];
        for (let i = 0; i < enemies.length; i++) {
            const u = enemies[i];
            if (isAlive(u) && u.row === 1) backs.push(u);
        }
        if (backs.length > 0) {
            for (let i = 0; i < backs.length; i++) if (backs[i].col === attacker.col) return backs[i];
            let best = backs[0];
            for (let i = 1; i < backs.length; i++) {
                const u = backs[i];
                const du = Math.abs(u.col - attacker.col), db = Math.abs(best.col - attacker.col);
                if (du < db || (du === db && u.col < best.col)) best = u;
            }
            return best;
        }
    }
    // 0.8) v2.6 BOSS黑暗游侠: 按对位规则锁定一名敌人, 只有将其击败后才会转而攻击下一个单位
    if (hasMech(attacker, 'darkRanger')) {
        const lock = attacker.lockedTarget;
        if (lock && isAlive(lock)) return lock;
        attacker.lockedTarget = pickStandardTarget(enemies, attacker);
        return attacker.lockedTarget;
    }
    return pickStandardTarget(enemies, attacker);
}

// ---- 常规目标选取(逐列守卫 → 同列对位 → 顺延; 全程确定性,不引入随机) ----
function pickStandardTarget(enemies, attacker) {
    // 1) 逐列守卫: 后排单位仅在同列前排已阵亡(或该列无前排)时可选
    const pool = [];
    for (let i = 0; i < enemies.length; i++) {
        const u = enemies[i];
        if (!isAlive(u)) continue;
        if (u.row === 0 || !columnFrontAlive(enemies, u.col)) pool.push(u);
    }
    if (pool.length === 0) return null;
    // 2) 同列对位优先
    for (let i = 0; i < pool.length; i++) if (pool[i].col === attacker.col) return pool[i];
    // 3) 顺延: 列距离升序,同距离取列索引小者
    let best = pool[0];
    for (let i = 1; i < pool.length; i++) {
        const u = pool[i];
        const du = Math.abs(u.col - attacker.col);
        const db = Math.abs(best.col - attacker.col);
        if (du < db || (du === db && u.col < best.col)) best = u;
    }
    return best;
}

// ---- 装备容量(v4.7): 每角色 2 装备点;普通占 1 点 / 特殊占 0 点 / 稀有占 2 点;不限制相同装备 ----
function equipCost(id) {
    const e = EQUIP_DEFS[id];
    if (!e) return 0;
    // 注意: 不可用 `e.cost || 1` —— none 的 cost 为 0,会被误判为 1
    return (typeof e.cost === 'number') ? e.cost : 1;
}
function equipPointsUsed(ids) {
    let p = 0;
    for (let i = 0; i < ids.length; i++) p += equipCost(ids[i]);
    return p;
}
// ---- v2.7 新增规则: 每个人只能携带 1 件升级装备 ----
function equipUpgradeCount(ids) {
    let n = 0;
    for (let i = 0; i < ids.length; i++) if (EQUIP_UPGRADED_LIST.indexOf(ids[i]) >= 0) n++;
    return n;
}
// 装备自带的全能吸血合计(重置战斗态时用于还原, 避免把装备提供的加成一起清零)
function equipLeechBase(ids) {
    let v = 0;
    for (let i = 0; i < ids.length; i++) {
        const e = EQUIP_DEFS[ids[i]];
        if (e && e.leechAll) v += e.leechAll;
    }
    return round1(v);
}
// 只保留第一件升级装备, 其余升级装备置空(从前往后保留)
function limitUpgradedEquips(ids) {
    let left = 1;
    return ids.map(id => {
        if (EQUIP_UPGRADED_LIST.indexOf(id) < 0) return id;
        if (left > 0) { left--; return id; }
        return 'none';
    });
}
// 装备合法性归一化: 法杖限蓝条英雄 + 熊王爪限基础生命≥1700 + 装备点容量裁剪(超出部分从后往前置空)
//  skipLimit = true 时跳过容量裁剪(挑战模式预设队伍不受装备点限制)
function normalizeEquipIds(equipIds, heroId, skipLimit) {
    const def = HERO_DEFS[heroId];
    let ids = equipIds.slice();
    while (ids.length < CONFIG.equip.slots) ids.push('none');
    if (ids.length > CONFIG.equip.slots) ids = ids.slice(0, CONFIG.equip.slots);
    if (!def.hasMana) {
        // 专业法杖 / 灵能大法杖 均限蓝条英雄
        ids = ids.map(id => ((id === 'staff' || id === 'staff_up') ? 'none' : id));
    }
    if ((def.maxHp || 0) < CONFIG.bearClaw.minBaseHp) {
        ids = ids.map(id => (id === 'bear_claw' ? 'none' : id));
    }
    ids = limitUpgradedEquips(ids);   // v2.7 规则: 每人只能携带 1 件升级装备
    if (!skipLimit) {
        let used = equipPointsUsed(ids);
        for (let i = ids.length - 1; i >= 0 && used > CONFIG.equip.points; i--) {
            if (ids[i] !== 'none') { used -= equipCost(ids[i]); ids[i] = 'none'; }
        }
    }
    return ids;
}

// ---- 装备数值应用(与原版 applyEquips 完全相同,含计算顺序) ----
function applyEquips(unit, equipIds) {
    const base = HERO_DEFS[unit.heroId];
    unit.maxHp = base.maxHp;
    unit.hp = unit.maxHp;
    unit.atk = base.atk;
    unit.speed = base.speed;
    unit.armor = base.armor;
    unit.mr = base.mr;
    unit.manaRegen = base.hasMana ? base.manaRegen : 0;
    unit.manaPerHit = base.manaPerHit || 0;
    unit.skillDmg = base.skillDmg;
    unit.extraDmg = 0;
    unit.lifesteal = 0;
    unit.leechAll = 0;            // 全能吸血(当前由守护斗篷触发后提供)
    unit.sp = 0;                  // SP 百分比(装备提供,在技能结算时乘以 spOf)
    unit._manaRefundPct = 0;
    unit.critRate = base.critRate || 0;
    unit._atkTypeOverride = null;

    let hpBonusPct = 0, hpFlat = 0, armorBonus = 0, mrBonus = 0;
    let atkBonusPct = 0, atkFlat = 0, speedBonusPct = 0, speedFlat = 0;
    let manaRegenBonus = 0, skillAmpTotal = 0, critRateBonus = 0;
    let atkTypeOverride = null;
    let atkPctOfMaxHp = 0;
    const seenUnique = {};      // 唯一被动去重(魔返/血赋/御击: 重复装备只生效一次)

    equipIds.forEach(id => {
        if (id === 'none') return;
        const e = EQUIP_DEFS[id];
        if (!e) return;
        // 基础属性: 可重复装备,一律叠加
        if (e.hpBonus) hpBonusPct += e.hpBonus;
        if (e.hpFlat) hpFlat += e.hpFlat;
        if (e.armorBonus) armorBonus += e.armorBonus;
        if (e.mrBonus) mrBonus += e.mrBonus;
        if (e.atkBonus) atkBonusPct += e.atkBonus;
        if (e.atkFlat) atkFlat += e.atkFlat;
        if (e.speedBonus) speedBonusPct += e.speedBonus;
        if (e.speedFlat) speedFlat += e.speedFlat;   // 吸血镰刀固定攻速(装备字段,原是硬编码)
        if (e.manaRegenBonus) manaRegenBonus += e.manaRegenBonus;
        if (e.manaPerHitBonus) unit.manaPerHit += e.manaPerHitBonus;   // 专业法杖: 普攻命中回蓝+1/次
        if (e.skillAmp) skillAmpTotal += e.skillAmp;
        if (e.extraDmg) unit.extraDmg += e.extraDmg;
        if (e.lifesteal) unit.lifesteal += e.lifesteal;
        if (e.leechAll) unit.leechAll += e.leechAll;   // v2.7 嗜血狂镰: 装备提供的全能吸血
        if (e.critRateBonus) critRateBonus += e.critRateBonus;
        if (e.atkTypeOverride) atkTypeOverride = e.atkTypeOverride;
        // 唯一被动: 同名被动只结算一次
        if (e.unique) {
            if (seenUnique[e.unique]) return;
            seenUnique[e.unique] = true;
        }
        if (e.manaRefundPct) unit._manaRefundPct += e.manaRefundPct;   // 魔返
        if (e.atkPctOfMaxHp) atkPctOfMaxHp += e.atkPctOfMaxHp;         // 血赋
    });

    // 计算顺序与原版一致: 生命%→生命固定→护甲/魔抗→攻击%→攻击固定→流星锤→攻速→回蓝→技能增幅→暴击率→攻击类型覆盖
    if (hpBonusPct > 0) unit.maxHp = round1(base.maxHp * (1 + hpBonusPct));
    if (hpFlat > 0) unit.maxHp = round1(unit.maxHp + hpFlat);
    if (armorBonus > 0) unit.armor = base.armor + armorBonus;
    if (mrBonus > 0) unit.mr = base.mr + mrBonus;
    if (atkBonusPct > 0) unit.atk = round1(base.atk * (1 + atkBonusPct));
    if (atkFlat > 0) unit.atk = round1(unit.atk + atkFlat);
    if (atkPctOfMaxHp > 0) {
        // 血赋(覆盖机制): 以「最终最大生命值」在最后一步结算,可吃到其他装备/技能的生命加成
        unit.atk = round1(unit.atk + unit.maxHp * atkPctOfMaxHp);
    }
    // 攻速 = 基础 × (1 + 百分比加成) + 固定加成
    if (unit.heroId === 'gunner') {
        // v4.5 枪手: 攻速锁定 1.2;装备提供的攻速(百分比先按基础攻速折算出额外攻速)
        // 按每 0.05 → +1 攻击力(四舍五入)
        unit.speed = base.speed;
        const speedGain = speedFlat + base.speed * speedBonusPct;
        if (speedGain > 0) unit.atk = round1(unit.atk + Math.round(speedGain / 0.05));
    } else {
        unit.speed = round2(base.speed * (1 + speedBonusPct) + speedFlat);
    }
    if (unit.hasMana && manaRegenBonus > 0) unit.manaRegen = base.manaRegen + manaRegenBonus;
    if (skillAmpTotal > 0) unit.sp = round1(skillAmpTotal * 100);   // SP 存百分比,结算时乘以 spOf(不再预乘 skillDmg)
    if (critRateBonus > 0) unit.critRate = (base.critRate || 0) + critRateBonus;
    if (atkTypeOverride) unit._atkTypeOverride = atkTypeOverride;
    unit.hp = unit.maxHp;
}

// ---- 构建单位(英雄模板 + 装备数值 + 机制实例 + 战斗态初始化) ----
//  teamKey: 所属队伍 'A'/'B';cell: 阵型站位格 0..5(0..2 = 前排 1/2/3 列,3..5 = 后排 1/2/3 列)
function makeUnit(heroId, equipIds, teamKey, cell, world, freeEquip) {
    const def = HERO_DEFS[heroId];
    const unit = JSON.parse(JSON.stringify(def));
    unit.heroId = heroId;
    unit.teamKey = teamKey;
    unit.sideKey = teamKey;      // 兼容旧命名(部分机制/日志沿用 sideKey)
    unit.cell = cell;
    unit.row = cellRow(cell);    // 0 = 前排, 1 = 后排
    unit.col = cellCol(cell);    // 0..2
    unit.slot = cell;            // 兼容旧命名(部分日志/统计沿用 slot)
    unit.equipIds = normalizeEquipIds(equipIds, heroId, freeEquip);
    // 机制列表 = 英雄机制 + 已装备物品机制
    const mechs = def.mechanics.slice();
    unit.equipIds.forEach(id => {
        const e = EQUIP_DEFS[id];
        if (e && e.mechanics) e.mechanics.forEach(m => { if (mechs.indexOf(m) < 0) mechs.push(m); });
    });
    unit.mechanics = mechs;
    applyEquips(unit, unit.equipIds);
    // 战斗态
    unit.hp = unit.maxHp;
    unit.shield = 0;
    unit.potionShieldTimer = 0;   // v2.4 远征药水·守护药剂: 300 护盾的剩余持续时间
    unit.potionShieldLeft = 0;    // 守护药剂护盾中「尚未消失」的部分(6s 后移除)
    unit.potionAtkTimer = 0;      // v2.4 远征药水·攻击药剂: 攻击力 +10% 的剩余持续时间
    unit.potionAtkBonus = 0;      // 攻击药剂实际加成的攻击力数值(到期按数值扣除, 避免与其它加成互相干扰)
    unit.cloakTriggered = false;
    unit.regenTimer = 0;
    unit.mana = unit.hasMana ? unit.startMana : 0;
    unit.atkCount = 0;
    unit.attackCd = 0;
    unit.skillCharge = 0;
    unit.critStreak = 0;
    unit.lastStandUsed = false;
    unit.curse = null;
    unit.curseTimer = 0;
    unit.curseAppliedAt = false;
    unit.evoStage = 0;
    unit.evoTimer = 0;
    unit.evoHeal = 0;
    unit.manaAccum = 0;
    unit.spearCount = 0;
    unit.stunned = 0;            // 眩晕(禁普攻/施法;回蓝/CD/已释放技能不受影响)
    unit.speedMul = 1;           // v2.2: 攻速倍率(寒冰印记 -10%)
    unit.frostStacks = 0;        // v2.2: 寒冰印记层数
    unit._psionicArmed = true;   // v2.2: 灵能大法杖(同一次满蓝只结算一次)
    unit._psionicGain = 0;       // v2.2: 灵能大法杖已累计 SP
    // v2.7 修复: 此前此处把 leechAll 清零, 导致「嗜血狂镰」等装备提供的全能吸血从未生效
    //            (leechAll 已由 applyEquips 按装备计算, 战斗中再由守护斗篷/嗜血狂镰累加)
    unit.netSlowTimer = 0;       // v2.5 猎人 · 猎网减速剩余时间(攻速 -20%)
    unit.magicCharge = 0;        // v2.5 魔剑士 · 魔法充能(每次攻击 +10, 满 100 进入星落)
    unit.starfallTimer = 0;      // v2.5 魔剑士 · 星落剩余时间
    unit.starfallAccum = 0;
    unit.starfallHitFlag = false;// v2.5 首次被星落命中的眩晕标记(挂在被命中方)
    unit.lancerCasting = false;  // v2.5 长枪手 · 三连突刺蓄力中
    unit.lancerCastTimer = 0;
    unit.ghostImmuneTimer = 0;   // v2.5 BOSS幽魂 · 复活免疫剩余时间
    unit.ghostReviveUsed = false;// v2.5 BOSS幽魂 · 首次死亡复活是否已用
    unit.holyActive = false;     // 圣骑 · 圣光状态
    unit.holyTimer = 0;
    unit.holyAccum = 0;
    unit.ironStacks = 0;         // 战士 · 铁血意志(印记层数 / 承伤累计 / 攻击计数 / 大招是否已用)
    unit.ironDmgAccum = 0;
    unit.ironAtkCount = 0;
    unit.ironUltUsed = false;
    unit.berserkTriggered = false;          // 勇士浴血是否已触发过
    unit.berserkActive = false;             // 勇士浴血当前是否生效(粘性: 未回满血不结束)
    unit.lifeStrikeReady = false;           // 坦克 · 生命打击蓄力
    unit.crystalTimer = 0;                  // 恢复水晶: 周期回复计时
    unit._jadeSpeedExtra = 0;               // 玉面刃: 当前动态攻速差值
    unit.ammo = CONFIG.revolver.capacity;   // 枪手 · 左轮弹匣
    unit.reloading = false;
    unit.reloadTimer = 0;
    unit.lockedTarget = null;    // 枪手换弹锁定 / 黑暗游侠对位锁定
    unit.darkStacks = 0;         // v2.6 黑暗游侠 · 黑暗之力层数(每层+1攻击力)
    unit.darkShield = 0;         // v2.6 黑暗游侠 · 黑暗护盾层数(每层免疫一次主动技能伤害)
    unit.darkShieldTimer = 0;
    unit._darkStunPrev = 0;
    unit.spiritCount = 0;        // 精灵 · 小精灵数量
    unit.spiritTimer = 0;
    unit.spiritAtkTimer = 0;
    unit.bossCdTimer = 0;        // Boss大熊 · 重击冷却
    unit.bossPhase2 = false;
    unit.bossRallyDone = false;
    unit.arcCasting = false;     // Boss大魔法师 · 前摇状态
    unit.arcCastTimer = 0;
    unit.arcHpLoss = 0;
    // v2.7 精灵: 开局不再自带小精灵, 从 0 只开始每 5s 叠加(见 spiritSummon)
    unit._darkShieldEvent = null;   // v2.7 黑暗游侠 · 同一次技能伤害已被护盾抵消的标记
    unit.mageCasting = false;       // v2.7 法师 · 法术爆发施法(吟唱)中
    unit.mageCastTimer = 0;
    unit.lancerAloneActive = false; // v2.7 长枪手 · 独守阵线当前是否已把 +20 攻击力加到面板
    unit._lancerAlone = false;      // v2.7 长枪手 · 独守阵线条件判定缓存
    unit._bloodLeechGain = 0;       // v2.7 嗜血狂镰 · 已叠加的全能吸血
    unit.fighterTimer = 0;
    unit.fighterActive = false;
    unit.fighterCooldown = 0;
    // 统计(批量模拟用: 累计造成伤害/暴击次数/普攻次数)
    unit.stats = { dmgDealt: 0, crits: 0, attacks: 0 };
    return unit;
}

// ---- 编队配置归一化: 支持数组 [{heroId, equipIds, cell}] 与旧式单挑签名(heroId, equipIds) ----
function toTeamConfig(team, limit) {
    const cap = limit || CONFIG.teams.maxPerTeam;
    const raw = [];
    if (!team) raw.push({});
    else if (typeof team === 'string') raw.push({ heroId: team });
    else if (Array.isArray(team)) raw.push(...team.slice(0, cap));
    else if (team.heroId) raw.push(team);
    else raw.push({});

    const used = {};
    const out = [];
    raw.forEach(m => {
        const member = {
            heroId: (m && m.heroId) || 'warrior',
            equipIds: (m && m.equipIds) ? m.equipIds.slice() : ['none', 'none', 'none'],
            cell: (m && isValidCell(m.cell) && !used[m.cell]) ? m.cell : null,
            freeEquip: !!(m && m.freeEquip)   // 挑战模式预设: 不受装备点限制
        };
        if (member.cell === null) {
            // 未指定或格子冲突 → 按默认顺序(前中→前左→前右→后中→后左→后右)自动布阵
            for (let i = 0; i < DEFAULT_CELL_ORDER.length; i++) {
                const c = DEFAULT_CELL_ORDER[i];
                if (!used[c]) { member.cell = c; break; }
            }
        }
        if (member.cell === null) return;   // 超出 6 格(理论不可达: 每队最多 3 人)
        used[member.cell] = true;
        out.push(member);
    });
    // 队内按格子顺序排列(前排从左到右、后排从左到右),保证出手顺序稳定可复现
    out.sort((a, b) => a.cell - b.cell);
    return out;
}

// ---- 世界(对局): A/B 为队伍数组,units 为稳定遍历顺序 ----
//  新式: createWorld(teamA, teamB, opts)   teamA/teamB = [{heroId, equipIds}, ...]
//  旧式兼容: createWorld(heroA, eqA, heroB, eqB, opts)
function createWorld(teamA, eqA, teamB, eqB, opts) {
    let ta, tb, o;
    if (typeof teamA === 'string') {
        // 旧式单挑签名: createWorld(heroA, eqA, heroB, eqB, opts)
        ta = [{ heroId: teamA, equipIds: Array.isArray(eqA) ? eqA.slice() : ['none', 'none'] }];
        tb = [{ heroId: teamB, equipIds: Array.isArray(eqB) ? eqB.slice() : ['none', 'none'] }];
        o = opts || {};
    } else {
        // 新式队伍签名: createWorld(teamA, teamB, opts)
        ta = teamA;
        tb = eqA;
        o = (teamB && typeof teamB === 'object' && !Array.isArray(teamB)) ? teamB : (opts || {});
    }
    // 挑战模式的预设队伍可超过常规 maxPerTeam(通过 opts.maxPerTeam 放开)
    const cap = (o && o.maxPerTeam) || CONFIG.teams.maxPerTeam;
    ta = toTeamConfig(ta, cap);
    tb = toTeamConfig(tb, cap);
    const world = {
        A: [], B: [], units: [],
        round: 0, winner: null, battleTime: 0,
        logLines: [], uiDirty: true,
        rng: o.rng || Math.random,
        fullLog: o.fullLog || null,         // 可选: 不截断的完整日志(测试/对拍用)
        mode: o.mode || 'versus'            // 'versus' 普通对战 / 'rogue' 远征模式(引擎按模式开关掉落等玩法逻辑)
    };
    ta.forEach(m => { world.A.push(makeUnit(m.heroId, m.equipIds, 'A', m.cell, world, m.freeEquip)); });
    tb.forEach(m => { world.B.push(makeUnit(m.heroId, m.equipIds, 'B', m.cell, world, m.freeEquip)); });
    // 出手顺序: A 队整体先于 B 队(与原版一致),队内按阵型格顺序(前排→后排,左→右)
    world.units = world.A.concat(world.B);
    // v4.6: 同队同名编号(如 战士1/战士2);跨队同名由日志颜色(A蓝/B红)区分
    ['A', 'B'].forEach(tk => {
        const counts = {};
        world[tk].forEach(u => { counts[u.name] = (counts[u.name] || 0) + 1; });
        const seen = {};
        world[tk].forEach(u => {
            if (counts[u.name] > 1) {
                seen[u.name] = (seen[u.name] || 0) + 1;
                u.name = `${u.name}${seen[u.name]}`;
            }
        });
    });
    // 机制钩子通过 world.addLog 写入日志(引擎层保持无 DOM)
    world.addLog = (msg, cls) => { addLog(world, msg, cls); };
    return world;
}
function addLog(world, msg, cls) {
    const time = world.battleTime.toFixed(1);
    world.logLines.push({ msg: `[${time}s] ${msg}`, cls: cls || '' });
    if (world.logLines.length > CONFIG.log.max) world.logLines.shift();
    if (world.fullLog) world.fullLog.push({ msg: `[${time}s] ${msg}`, cls: cls || '' });
    world.uiDirty = true;
}

// ---- 伤害结算(所有伤害来源共用): 护盾吸收 → 扣血 → onDamaged(守护斗篷) ----
//  opts(可选): { skill: true } = 该次伤害来自「主动技能」(蓝条技能/CD技能/大招/技能型DoT),
//   会被黑暗游侠的「黑暗护盾」免疫; opts.dot: true 表示持续伤害跳数(被免疫时后续跳数一并作废)
//   opts.event: v2.7 同一次技能事件的标记, 用于让该技能附带的控制也被同一层护盾抵消
//  返回值: true = 伤害已结算; false = 被免疫(幽灵免疫期 / 黑暗护盾) → 调用方可据此跳过后续结算(如 DoT)
function applyDamageTo(world, target, dmg, source, opts) {
    // v2.5 BOSS幽魂 · 不灭怨念: 复活期间免疫一切伤害
    if (target.ghostImmuneTimer > 0) return false;
    // v2.6 BOSS黑暗游侠 · 黑暗护盾: 每层免疫一次主动技能伤害
    if (opts && opts.skill && (target.darkShield || 0) > 0) {
        target.darkShield -= 1;
        // v2.7: 记录本次技能事件 → 该技能附带的控制效果同样被这层护盾抵消(不额外扣层)
        if (opts.event) target._darkShieldEvent = opts.event;
        // 回写给调用方: 使上层能区分「被黑暗护盾抵消」与「目标处于免疫状态」(如幽魂复活期)
        opts.blockedByDarkShield = true;
        addLog(world, `🌑 ${target.name} 的黑暗护盾抵消了本次技能伤害（剩余 ${target.darkShield} 层）`, 'armor');
        if (opts.dot) addLog(world, `🌑 黑暗护盾完全抵消了持续伤害，其后续跳数也不再结算`, 'armor');
        return false;
    }
    const hpBefore = target.hp;
    let remainingDmg = dmg;
    if (target.shield > 0) {
        const absorbed = Math.min(target.shield, remainingDmg);
        target.shield -= absorbed;
        remainingDmg -= absorbed;
        if (absorbed > 0) {
            addLog(world, `🛡️ ${target.name} 护盾吸收了 ${absorbed} 伤害`, 'armor');
        }
    }
    if (remainingDmg > 0) {
        target.hp = round1(Math.max(0, target.hp - remainingDmg));
    }
    // hpLoss = 实际扣血量(护盾吸收部分不计) —— 战士「铁血意志」按此累计
    const hpLoss = round1(Math.max(0, hpBefore - target.hp));
    fireMechs(target, 'onDamaged', source, { dmg, hpLoss }, world);
    // 全能吸血: 按「实际扣血量」回复(覆盖普攻/技能/DoT/装备附加等一切来源),受自身重伤减半
    //  修正1: 基数由原始 dmg 改为 hpLoss —— 被护盾吸收的部分不再产生吸血
    //  修正2: opts.noLeech 用于关掉「反弹类」伤害的吸血(荆棘之甲反弹时不该让挨打方回血)
    if (source && source !== target && source.hp > 0 && source.leechAll > 0 && hpLoss > 0 && !(opts && opts.noLeech)) {
        const leech = applyHealReduction(source, round1(hpLoss * source.leechAll / 100));
        if (leech > 0) {
            source.hp = Math.min(source.maxHp, source.hp + leech);
            addLog(world, `🧥 ${source.name} 全能吸血回复 ${leech} HP`, 'heal');
        }
    }
    return true;
}

// ---- v2.7 控制(眩晕)统一入口: 黑暗游侠的「黑暗护盾」可把控制一并抵消 ----
//  opts.skill !== false 表示该控制来自技能/攻击技能(可被黑暗护盾抵挡, 普攻本身的控制默认也算)
//  opts.event  = 同一次技能的事件标记: 若该技能的伤害已被护盾抵消, 则控制一并抵消且不再额外扣层
//  opts.label  = 日志中的来源描述
//  返回 true = 控制已被护盾抵消(调用方据此跳过后续日志/统计)
let _shieldEventSeq = 0;
function newShieldEvent() { _shieldEventSeq += 1; return _shieldEventSeq; }
function applyStunTo(world, target, sec, opts) {
    if (!isAlive(target)) return false;
    opts = opts || {};
    if (opts.skill !== false && hasMech(target, 'darkRanger')) {
        // 1) 同一次技能的伤害已被黑暗护盾抵消 → 控制一并抵消(不额外扣层)
        if (opts.event && target._darkShieldEvent === opts.event) {
            target._darkShieldEvent = null;
            addLog(world, `🌑 ${target.name} 的黑暗护盾同时抵消了${opts.label || '控制效果'}（不再扣除黑暗之力层数）`, 'armor');
            return true;
        }
        // 2) 护盾仍有层数 → 消耗 1 层抵消该控制
        if ((target.darkShield || 0) > 0) {
            target.darkShield -= 1;
            addLog(world, `🌑 ${target.name} 的黑暗护盾抵消了${opts.label || '控制效果'}（剩余 ${target.darkShield} 层，黑暗之力层数不变）`, 'armor');
            return true;
        }
    }
    target.stunned = Math.max(target.stunned || 0, sec);
    return false;
}

// ---- 团灭检查: 一队全员阵亡 → 判负 ----
function checkTeamWipe(world, teamKey) {
    if (aliveCount(world, teamKey) > 0) return false;
    const winnerKey = enemyTeamKey(teamKey);
    world.winner = winnerKey;
    addLog(world, `🏆 <span class="highlight">${winnerKey}队 全员获胜！${teamKey}队 已被团灭</span>`, 'highlight');
    return true;
}

// ---- 死亡结算: 绝境求生 → 否则该单位阵亡并检查团灭;返回 true 表示战斗已分胜负 ----
function handleDeath(world, unit, killer) {
    let saved = false;
    const list = unit.mechanics;
    for (let i = 0; i < list.length && !saved; i++) {
        const m = MECHANICS[list[i]];
        if (m && typeof m.onDeathCheck === 'function') {
            if (m.onDeathCheck(unit, killer, world)) saved = true;
        }
    }
    if (saved) return false;
    unit.hp = 0;
    unit.curse = null;          // 目标阵亡 → 其身上诅咒立即消失
    unit.curseAppliedAt = false;
    unit.stunned = 0;
    addLog(world, `💀 ${unitLabel(unit)}（${unit.teamKey}队${cellName(unit.cell)}）阵亡！`, 'damage');
    // v2.5 BOSS幽魂 · 噬魂: 该单位阵亡 → 其「敌方」阵营里的幽魂立刻回血并提升攻击力
    // v2.6: 追加传入 (阵亡单位, 击杀者) → 黑暗游侠据此判定「是自己击败的」才获得黑暗护盾
    const foes = world[enemyTeamKey(unit.teamKey)];
    for (let i = 0; i < foes.length; i++) {
        if (isAlive(foes[i])) fireMechs(foes[i], 'onEnemyDeath', world, unit, killer);
    }
    return checkTeamWipe(world, unit.teamKey);
}

// ---- 法力护符: 施放后回复 25% 最大蓝量 ----
function applyManaRefund(world, unit) {
    const ref = unit._manaRefundPct || 0;
    if (ref > 0 && unit.hasMana) {
        const restore = round1(unit.maxMana * ref);
        unit.mana = round1(Math.min(unit.maxMana, unit.mana + restore));
        if (restore > 0) addLog(world, `📿 ${unit.name} 法力护符回复 ${restore} 蓝`, 'heal');
    }
}

// ---- 技能施放通知(v4.7: 恢复水晶已改为周期回复, 不再依赖技能触发) ----
//  保留空实现以兼容既有调用点(浴血/双拳/技能等), 便于以后挂载其他「施法触发」类效果
function notifySkillCast(unit, world) {
}

// ---- 诅咒逐跳伤害: 诅咒附着于目标单位自身,由引擎每 1s 对带诅咒的目标结算 ----
//  施法者死亡/被眩晕均不影响已释放诅咒,持续到剩余时间归零或目标阵亡
function applyCurseTick(world, unit) {
    const curse = unit.curse;
    if (!curse || unit.hp <= 0) return;
    const caster = curse.caster || null;
    const tickDmg = round1(curse.totalDmg / curse.ticks);
    const opts = { skill: true, dot: true };
    const applied = applyDamageTo(world, unit, tickDmg, caster, opts);
    // v2.6: 诅咒跳数未生效 → 该 DoT 后续跳数同样不再结算(需求: 免疫持续伤害则后续也免疫)
    //  注意区分原因: 「黑暗护盾抵消」才打护盾日志;目标处于免疫状态(如幽魂复活期)属另一种情况
    if (!applied) {
        unit.curse = null;
        unit.curseAppliedAt = false;
        if (opts.blockedByDarkShield) {
            addLog(world, `🧙 ${unit.name} 身上的诅咒被黑暗护盾彻底抵消（重伤消失）`, 'armor');
        }
        return;
    }
    addLog(world, `🧙 ${curse.casterName} 的诅咒灼烧！${unit.name} 受到 ${dmgSpan(tickDmg, 'magical')} 魔法伤害`, 'curse');
    if (caster) caster.stats.dmgDealt += tickDmg;
    if (unit.hp <= 0) {
        unit.curse = null;
        unit.curseAppliedAt = false;
        handleDeath(world, unit, caster);
        return;
    }
    curse.remaining -= 1;
    if (curse.remaining <= 0) {
        unit.curse = null;
        unit.curseAppliedAt = false;
        addLog(world, `🧙 ${unit.name} 身上的诅咒结束（重伤消失）`, '');
    }
}

// ---- 进化结算(由 evolution 机制调用) ----
function applyEvo(unit, world) {
    const ek = unit.evoStage;
    if (ek >= CONFIG.evolution.maxStages) return;
    unit.evoStage = ek + 1;
    const ec = unit.evoStage;
    let heal = applyHealReduction(unit, CONFIG.evolution.healPerEvolve);
    unit.hp = Math.min(unit.maxHp, unit.hp + heal);
    const st = CONFIG.evolution.stages[ec - 1];
    let logMsg = `🐾 ${unit.name} 第${ec}次进化！`;
    if (st) {
        if (st.atk) unit.atk += st.atk;
        if (st.speed) unit.speed += st.speed;
        if (st.armor) unit.armor += st.armor;
        if (st.mr) unit.mr += st.mr;
        if (st.healPerHit) unit.evoHeal = st.healPerHit;
        if (st.omniLeech) unit.leechAll = (unit.leechAll || 0) + st.omniLeech;   // 第4次进化: 20% 全能吸血
        const parts = [];
        if (st.atk) parts.push(`攻击+${st.atk}`);
        if (st.speed) parts.push(`攻速+${st.speed}`);
        if (st.armor) parts.push(`双抗+${st.armor}%`);
        if (st.healPerHit) parts.push(`普攻回血${st.healPerHit}`);
        if (st.omniLeech) parts.push(`全能吸血+${st.omniLeech}%`);
        if (parts.length) logMsg += parts.join('，');
    }
    logMsg += isHealReduced(unit) ? `，回复${heal}HP（受重伤影响）` : `，回复${heal}HP`;
    addLog(world, logMsg, 'highlight');
}

// ---- 战士 · 铁血意志: +1 层印记(每层 +4 攻击 / +1 双抗);满层自动触发「铁血破阵」(整局仅 1 次) ----
function addIronStack(unit, world) {
    const cfg = CONFIG.ironWill;
    if ((unit.ironStacks || 0) >= cfg.maxStacks) return;
    unit.ironStacks = (unit.ironStacks || 0) + 1;
    unit.atk = round1(unit.atk + cfg.atkBonus);
    unit.armor += cfg.resistBonus;
    unit.mr += cfg.resistBonus;
    world.addLog(`🩸 ${unit.name} 铁血意志 +1 层（${unit.ironStacks}/${cfg.maxStacks}）：攻击+${cfg.atkBonus}，双抗+${cfg.resistBonus}`, 'highlight');
    if (unit.ironStacks >= cfg.maxStacks && !unit.ironUltUsed) castIronBreak(world, unit);
}

// ---- 战士 · 铁血破阵: 对敌方「全体前排」造成 (1.2×攻击力 + 目标已损失生命×10%) 物理伤害,并回复 300 生命 ----
function castIronBreak(world, unit) {
    const cfg = CONFIG.ironWill;
    unit.ironUltUsed = true;
    const enemies = world[enemyTeamKey(unit.teamKey)];
    let hit = 0, total = 0;
    for (let i = 0; i < enemies.length; i++) {
        const t = enemies[i];
        if (!isAlive(t) || t.row !== 0) continue;          // 仅作用于「前排」
        const lost = Math.max(0, t.maxHp - t.hp);
        const raw = unit.atk * cfg.ultAtkRatio + lost * cfg.ultLostHpRatio;
        const dmg = Math.max(0.1, round1(raw * (1 - t.armor / 100)));   // 物理伤害: 受护甲减免
        applyDamageTo(world, t, dmg, unit, { skill: true });
        unit.stats.dmgDealt += dmg;
        total += dmg; hit++;
        world.addLog(`💥 铁血破阵命中 ${t.name}：${dmgSpan(dmg, 'physical')} 物理伤害`, 'highlight');
        if (t.hp <= 0) handleDeath(world, t, unit);
    }
    notifySkillCast(unit, world);
    const heal = applyHealReduction(unit, round1(total * cfg.ultHealRatio));
    unit.hp = Math.min(unit.maxHp, unit.hp + heal);
    world.addLog(`🗡️ ${unit.name} 铁血破阵！命中 ${hit} 名前排共 ${round1(total)} 物理伤害，回复 ${heal} HP（印记保留）`, 'highlight');
}

// ---- Boss 大魔法师 · 秘法风暴: 随机主目标 360 魔伤(魔抗永久-2),其余存活敌人各 180 魔伤(v2.6 上调) ----
function castArcStorm(world, unit) {
    const cfg = CONFIG.archmage;
    const alive = [];
    const enemies = world[enemyTeamKey(unit.teamKey)];
    for (let i = 0; i < enemies.length; i++) if (isAlive(enemies[i])) alive.push(enemies[i]);
    if (alive.length === 0) return;
    const main = alive[Math.floor(world.rng() * alive.length) % alive.length];
    for (let i = 0; i < alive.length; i++) {
        const t = alive[i];
        const isMain = (t === main);
        const raw = isMain ? cfg.mainDmg : cfg.sideDmg;
        const dmg = Math.max(0.1, round1(raw * (1 - t.mr / 100)));
        applyDamageTo(world, t, dmg, unit, { skill: true });
        unit.stats.dmgDealt += dmg;
        if (isMain) {
            t.mr = Math.max(0, t.mr - cfg.mrShred);        // 主目标魔抗永久降低
            world.addLog(`🧿 秘法风暴贯穿 ${t.name}（主目标）：${dmgSpan(dmg, 'magical')} 魔法伤害（${cfg.mainDmg} 基础），魔抗永久 -${cfg.mrShred}`, 'highlight');
        } else {
            // v2.3: 其余敌人各受 150(v2.6→180) —— 逐目标单独记日志(此前只记主目标, 看起来像没打中其他人)
            world.addLog(`🧿 秘法风暴波及 ${t.name}：${dmgSpan(dmg, 'magical')} 魔法伤害（${cfg.sideDmg} 基础）`, 'highlight');
        }
        if (t.hp <= 0) { handleDeath(world, t, unit); if (world.winner) return; }
    }
    world.addLog(`🧿 ${unit.name} 秘法风暴！命中 ${alive.length} 名敌人（主目标 ${cfg.mainDmg} + 魔抗削减，其余各 ${cfg.sideDmg}）`, 'highlight');
    unit.mana = 0;
    applyManaRefund(world, unit);
    notifySkillCast(unit, world);
}

// ---- 精灵(v4.5): 普攻转化为治疗 —— 对己方(含自身)生命值最低且已损血的单位回复攻击力数值 ----
//  平局按站位顺位(队伍数组按 cell 升序,严格小于保留先者);全员满血 → 空过
function performFairyHeal(world, unit) {
    const allies = world[unit.teamKey];
    let target = null;
    for (let i = 0; i < allies.length; i++) {
        const a = allies[i];
        if (!isAlive(a) || a.hp >= a.maxHp) continue;      // 没有损失生命值的单位不会被治疗
        if (!target || a.hp < target.hp) target = a;
    }
    if (!target) return false;                              // 全员满血 → 空过一拍
    const heal = applyHealReduction(target, round1(unit.atk));
    target.hp = Math.min(target.maxHp, target.hp + heal);
    addLog(world, `🌿 ${unit.name} 治愈 ${target.name}，回复 ${heal} HP`, 'heal');
    unit.atkCount = (unit.atkCount || 0) + 1;
    unit.stats.attacks++;
    return true;
}

// ---- 普攻结算管线(与原版 performAttack 顺序逐条一致;单位对单位,目标由调用方选定) ----
function performAttack(world, attacker, defender) {
    if (world.winner) return false;
    if (!attacker || !defender) return false;
    if (attacker.hp <= 0 || defender.hp <= 0) return false;

    if (attacker.stunned > 0) {
        addLog(world, `💫 ${attacker.name} 被眩晕，无法普通攻击！`, 'silence');
        return false;
    }

    // 精灵(v4.5): 普攻改为治疗己方(全员满血时空过)
    if (hasMech(attacker, 'fairyHeal')) {
        return performFairyHeal(world, attacker);
    }

    // v2.5 BOSS幽魂: 普攻改为随机撕咬 2 个敌方单位(魔法伤害)
    if (hasMech(attacker, 'ghost')) {
        return performGhostAttack(world, attacker);
    }

    // 攻击级上下文(每击重置部分字段)
    const ctx = {
        h: 0, hitCount: 1, doubleHit: false,
        atkMult: 1, atkType: attacker.atkType, atkTypeChanged: false,
        isSpear: false, spearCountNow: 0, berserk: false,
        defPct: 0, addDmg: 0, dmg: 0, crit: false, forced: false, holy: false,
        lifesteal: 0, totalDmg: 0, totalLifesteal: 0, hitDetails: [], kind: 'physical'
    };

    for (let h = 0; h < ctx.hitCount; h++) {
        if (defender.hp <= 0) break;
        ctx.h = h; ctx.atkMult = ctx.doubleHit ? CONFIG.dualFist.multiplier : 1;
        ctx.atkType = attacker.atkType; ctx.isSpear = false; ctx.spearCountNow = 0;
        ctx.berserk = false; ctx.atkTypeChanged = false; ctx.defPct = 0; ctx.addDmg = 0; ctx.atkAdd = 0;
        ctx.dmg = 0; ctx.crit = false; ctx.forced = false; ctx.holy = false; ctx.lifesteal = 0;

        // a. 进化兽普攻回血(受减疗) —— 每击开始
        // b. 长矛手真实打击判定(前3发,每击判定 & 计数)
        // c. 浴血奋战(atk×1.2) —— 每击判定
        // d. 攻击类型(星星魔法杖覆盖为法术)
        fireMechs(attacker, 'onBeforeHit', defender, ctx, world);

        const actualAtk = (attacker.atk + (ctx.atkAdd || 0)) * ctx.atkMult;

        // e. 伤害计算
        if (ctx.isSpear) {
            // 真实伤害: 无视防御,不参与暴击,不附加太阳圣盾/急速弓/暗杀/星杖转换
            const spearAtk = actualAtk + CONFIG.spear.bonusAtk;
            ctx.dmg = Math.max(0.1, round1(spearAtk));
        } else {
            ctx.defPct = getDefense(defender, ctx.atkType);
            // 猎人破甲(仅物理攻击生效,最低 5%)
            fireMechs(attacker, 'onDefenseCalc', defender, ctx, world);
            let dmg = actualAtk * (1 - ctx.defPct / 100);
            ctx.dmg = dmg;
            // 太阳圣盾/急速弓/暗杀附加
            fireMechs(attacker, 'onDamageCalc', defender, ctx, world);
            ctx.dmg = Math.max(0.1, round1(ctx.dmg + ctx.addDmg));
        }
        ctx.kind = hitKind(ctx);      // v4.7: 本次伤害类型(物理/魔法/真实) → 决定日志配色

        // f. 暴击判定(每次普攻固定调用一次 rng,即使暴击率为 0;真实打击不掷骰)
        if (!ctx.isSpear) {
            attacker.critStreak = (attacker.critStreak || 0) + 1;
            let roll = world.rng();
            ctx.threshold = Infinity;
            fireMechs(attacker, 'onCritRoll', ctx);
            // bug③修复: streak > 4(第5次)才强制;原版 streak >= 4(第4次)即为强制
            if (attacker.critStreak > ctx.threshold && isFinite(ctx.threshold)) {
                roll = 0;
                ctx.forced = true;
            }
            if (roll < attacker.critRate / 100) {
                ctx.crit = true;
                ctx.dmg = round1(ctx.dmg * (attacker.critMulti || 2.0));
                attacker.critStreak = 0;
                attacker.stats.crits++;
            }
        }

        // g. 圣光打击(暴击之后附加,不吃暴击)
        fireMechs(attacker, 'onPostCrit', defender, ctx, world);

        // h. applyDamageTo: 护盾→扣血→onDamaged(斗篷/受击效果,所有伤害来源共用)
        applyDamageTo(world, defender, ctx.dmg, attacker);

        // i. 回合/计数/吸血/回蓝
        world.round++;
        attacker.atkCount = (attacker.atkCount || 0) + 1;
        attacker.stats.attacks++;
        attacker.stats.dmgDealt += ctx.dmg;
        ctx.totalDmg += ctx.dmg;

        fireMechs(attacker, 'onHitDealt', defender, ctx);
        if (ctx.lifesteal > 0) {
            let lifesteal = round1(ctx.lifesteal);
            lifesteal = applyHealReduction(attacker, lifesteal);
            attacker.hp = Math.min(attacker.maxHp, attacker.hp + lifesteal);
            ctx.totalLifesteal += lifesteal;
        }

        let hitMsg = `${h + 1}/${ctx.hitCount}`;
        if (ctx.crit) hitMsg += '💥暴击';
        else if (ctx.holy) hitMsg += '⚡圣光';
        else if (ctx.isSpear) hitMsg += '🔱真实';
        ctx.hitDetails.push(`${hitMsg}: ${dmgSpan(ctx.dmg, ctx.kind)}`);

        // 攻击者普攻回蓝
        if (attacker.hasMana && attacker.manaPerHit > 0) {
            attacker.mana = round1(Math.min(attacker.maxMana, attacker.mana + attacker.manaPerHit));
        }
        // 受击回蓝(b模板,如坦克: 自然1/秒+受击回蓝1/次,仅普攻路径;v4.2 已删除「损失200HP回蓝」)
        if (defender.hasMana && defender.manaPerHitTaken > 0) {
            defender.mana = round1(Math.min(defender.maxMana, defender.mana + defender.manaPerHitTaken));
        }

        // j. 死亡检查
        if (defender.hp <= 0) {
            const ended = handleDeath(world, defender, attacker);
            if (ended) return true;
            // 绝境求生救回: 继续下一击(与原版 continue 一致)
            continue;
        }
    }

    // 汇总日志
    let finalMsg = `${tn(attacker)} → ${tn(defender)}：`;
    if (ctx.doubleHit && ctx.hitDetails.length > 0) {
        finalMsg += `👊 双拳连击！[${ctx.hitDetails.join(' | ')}]`;
        if (ctx.totalLifesteal > 0) finalMsg += ` ❤️+${ctx.totalLifesteal}`;
    } else if (ctx.hitDetails.length > 0) {
        finalMsg += `-${dmgSpan(ctx.totalDmg, ctx.kind)}`;
        if (ctx.hitDetails[0].includes('暴击')) finalMsg += ` 💥暴击`;
        else if (ctx.hitDetails[0].includes('圣光')) finalMsg += ` ⚡圣光`;
        else if (ctx.hitDetails[0].includes('真实')) finalMsg += ` 🔱真实`;
        if (ctx.totalLifesteal > 0) finalMsg += ` ❤️+${ctx.totalLifesteal}`;
    } else {
        finalMsg += `-0`;
    }
    addLog(world, finalMsg, '');
    return true;
}

// ---- 蓝量步进: 0.5s 刻度回蓝(全局 0.5/0.5s + 自身回蓝) + 满蓝未沉默时施放 ----
function unitManaStep(world, unit, dt) {
    if (!unit.hasMana) return;
    if (unit.arcCasting) return;   // 大魔法师: 前摇期间无法回蓝
    if (unit.mageCasting) return;  // v2.7 法师: 0.5s 吟唱期间无法回蓝(蓝量保留至吟唱结束)
    unit.manaAccum += dt;
    while (unit.manaAccum >= CONFIG.mana.tickInterval) {
        unit.manaAccum -= CONFIG.mana.tickInterval;
        const globalRegen = CONFIG.mana.globalRegen;
        const unitRegen = unit.manaRegen * CONFIG.mana.unitRegenFactor;
        const total = globalRegen + unitRegen;
        if (total > 0) {
            unit.mana = round1(Math.min(unit.maxMana, unit.mana + total));
        }
    }
    if (unit.mana >= unit.maxMana && unit.stunned <= 0) {
        // 眩晕期间蓝量照常回复但不会自动施放;CD/已释放技能(诅咒DoT等)均不受影响
        fireMechs(unit, 'onCast', world);
    }
}

// ---- 攻击调度(自动模式: 按单位累加攻击冷却,循环结算;目标实时选取) ----
function attackSchedule(world, unit, dt) {
    if (unit.hp <= 0 || world.winner) return;
    if (!pickTarget(world, unit)) return;
    unit.attackCd = (unit.attackCd || 0) + dt;
    // v2.2: 攻速倍率(寒冰印记 -10%)参与实际出手间隔
    const interval = 1 / ((unit.speed || 1) * (unit.speedMul || 1));
    while (unit.attackCd >= interval && !world.winner && unit.hp > 0) {
        unit.attackCd -= interval;
        const target = pickTarget(world, unit);
        if (!target || target.hp <= 0) return;
        performAttack(world, unit, target);
    }
}

// ---- 世界步进(统一 doRound / autoLoop;手动模式差异由此 opts.manual 保留) ----
//  遍历顺序固定为 world.units = [A0,A1,A2,B0,B1,B2],保证结果可复现
function tick(world, dt, opts) {
    if (world.winner) return false;
    const manual = !!(opts && opts.manual);
    world.battleTime += dt;
    const units = world.units;

    // 1. 眩晕倒计时(眩晕仅禁普攻/施法;回蓝/CD/已释放技能照常)
    for (let i = 0; i < units.length; i++) {
        if (units[i].stunned > 0) units[i].stunned = Math.max(0, units[i].stunned - dt);
    }

    // 2. 进化(不会致死,无胜负检查)
    for (let i = 0; i < units.length; i++) mechTick(units[i], 'evolution', world, dt);

    // 3. 蓝量与施放(施放后可致胜,需检查)
    for (let i = 0; i < units.length; i++) {
        if (units[i].hp <= 0) continue;
        unitManaStep(world, units[i], dt);
        if (world.winner) return false;
    }

    // 4. 剑气充能(旧「圣光打击」已随战士重做移除)
    for (let i = 0; i < units.length; i++) mechTick(units[i], 'swordAura', world, dt);

    // 5. 双拳(手动模式保持原 doRound 链) / 枪手换弹计时
    for (let i = 0; i < units.length; i++) {
        mechTick(units[i], 'dualFist', world, dt, { manual });
        mechTick(units[i], 'revolver', world, dt);
    }

    // 6. 恢复水晶 / 圣骑圣光 / 精灵召唤 / Boss大熊 / 大魔法师 / 玉面刃(动态攻速)
    for (let i = 0; i < units.length; i++) {
        mechTick(units[i], 'crystalRegen', world, dt);
        mechTick(units[i], 'paladinHoly', world, dt);
        mechTick(units[i], 'spiritSummon', world, dt);
        mechTick(units[i], 'bossBear', world, dt);
        mechTick(units[i], 'archmage', world, dt);
        mechTick(units[i], 'jadeBlade', world, dt);
        mechTick(units[i], 'psionicStaff', world, dt);
        mechTick(units[i], 'manaBurst', world, dt);    // v2.7 法师: 0.5s 吟唱结算
        // v2.5 新角色 / 新 BOSS
        mechTick(units[i], 'starfall', world, dt);
        mechTick(units[i], 'lancerStrike', world, dt);
        mechTick(units[i], 'ghost', world, dt);
        mechTick(units[i], 'darkRanger', world, dt);   // v2.6 黑暗游侠: 层数/护盾/被控制惩罚
    }

    // 6.5 远征药水(v2.4): 守护药剂护盾 / 攻击药剂 持续时间结束 → 移除效果
    for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.potionShieldTimer > 0) {
            // 注意: 此处不可再套 round1 —— dt(0.05) < 0.1 时 round1(x - dt) === x,计时器永远减不到 0
            u.potionShieldTimer = Math.max(0, u.potionShieldTimer - dt);
            if (u.potionShieldTimer <= 0) {
                const left = Math.min(u.shield || 0, u.potionShieldLeft || 0);
                if (left > 0) {
                    u.shield = round1(u.shield - left);
                    world.addLog(`🧪 ${u.name} 守护药剂护盾消失（剩余 ${left} 未消耗）`, 'armor');
                }
                u.potionShieldLeft = 0;
            }
        }
        if (u.potionAtkTimer > 0) {
            u.potionAtkTimer = Math.max(0, u.potionAtkTimer - dt);
            if (u.potionAtkTimer <= 0) {
                u.atk = round1(Math.max(0, u.atk - (u.potionAtkBonus || 0)));
                u.potionAtkBonus = 0;
                world.addLog(`⚗️ ${u.name} 攻击药剂效果结束`, '');
            }
        }
    }

    // 6.6 猎网减速(v2.5): 攻速 -20% 持续 3s → 到期重算(若仍带寒冰印记则保留其减速)
    for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!(u.netSlowTimer > 0)) continue;
        u.netSlowTimer = Math.max(0, u.netSlowTimer - dt);
        if (u.netSlowTimer <= 0) {
            u.netSlowTimer = 0;
            recalcSpeedMul(u);          // 统一由 recalcSpeedMul 计算,避免覆盖寒冰印记减速
            world.addLog(`🕸️ ${u.name} 挣脱猎网（攻速恢复）`, '');
        }
    }

    // 7. 诅咒 DoT(诅咒附着于目标自身;眩晕/施法者阵亡不影响;可致死,需检查)
    for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u.curse || u.hp <= 0) continue;
        if (u.curseAppliedAt) { u.curseAppliedAt = false; continue; }   // 施放当次已结算首跳
        u.curseTimer = (u.curseTimer || 0) + dt;
        while (u.curseTimer >= 1.0 && u.curse) {
            u.curseTimer -= 1.0;
            applyCurseTick(world, u);
            if (world.winner) return false;
        }
    }

    // 8. 普攻调度
    if (manual) {
        // 手动模式: 所有存活单位按编队顺序各强制攻击一次,不参与攻击冷却累积
        for (let i = 0; i < units.length; i++) {
            const u = units[i];
            if (u.hp <= 0 || world.winner) continue;
            const target = pickTarget(world, u);
            if (!target || target.hp <= 0) continue;
            performAttack(world, u, target);
            if (world.winner) return false;
        }
    } else {
        for (let i = 0; i < units.length; i++) {
            attackSchedule(world, units[i], dt);
            if (world.winner) return false;
        }
    }
    return true;
}

// ---- 确定性随机数(mulberry32,与 sim.js 一致,保证可复现) ----
function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// ---- 队伍维度统计(批量模拟用) ----
function teamStats(world, teamKey) {
    const team = world[teamKey];
    let survivors = 0, dmg = 0, crits = 0, attacks = 0;
    for (let i = 0; i < team.length; i++) {
        const u = team[i];
        if (u.hp > 0) survivors++;
        dmg += u.stats.dmgDealt;
        crits += u.stats.crits;
        attacks += u.stats.attacks;
    }
    return { survivors, dmg: round1(dmg), crits, attacks, hp: round1(team.reduce((s, u) => s + u.hp, 0)) };
}

// ---- 单局碰撞模拟(批量模拟复用;无 DOM) ----
//  新式: simulateBattle(teamA, teamB, opts)  旧式兼容: simulateBattle(heroA, eqA, heroB, eqB, opts)
function simulateBattle(teamA, eqA, teamB, eqB, opts) {
    let world;
    if (typeof teamA === 'string') {
        // 旧式: simulateBattle(heroA, eqA, heroB, eqB, opts)
        const o = opts || {};
        world = createWorld(teamA, eqA, teamB, eqB, { rng: o.rng });
    } else {
        // 新式: simulateBattle(teamA, teamB, opts) —— 注意只接受 3 个参数
        const o = (teamB && typeof teamB === 'object' && !Array.isArray(teamB)) ? teamB : (opts || {});
        world = createWorld(teamA, eqA, { rng: o.rng, maxPerTeam: o.maxPerTeam });
    }
    while (world.winner === null && world.battleTime < CONFIG.sim.timeout) {
        tick(world, CONFIG.auto.step, {});
    }
    return {
        winner: world.winner || 'draw',
        time: round1(world.battleTime),
        rounds: world.round,
        teams: { A: teamStats(world, 'A'), B: teamStats(world, 'B') }
    };
}

// ---- v2.4 远征一次性物品(药剂)数值: 引擎层 tick 需要读取, 故定义在引擎作用域 ----
const ROGUE_POTION = { shield: 300, atkPct: 0.10, duration: 6 };

// ---- 引擎导出(Node 对拍/测试直接 require;浏览器中通过 window._duel 暴露) ----
const Engine = {
    CONFIG, HERO_DEFS, EQUIP_DEFS, MECHANICS, RARE_EQUIPS, HERO_LIST, EQUIP_LIST, EQUIP_TIERS, HERO_INTRO_LIST,
    EQUIP_UPGRADES, EQUIP_UPGRADED_LIST, EQUIP_UPGRADE_COST, equipUpgradeTarget,
    createWorld, tick, performAttack, simulateBattle, mulberry32, normalizeEquipIds, applyHealReduction,
    addLog, applyDamageTo, handleDeath, makeUnit, equipCost, equipPointsUsed, equipTierOf, equipListOfTier,
    dmgSpan, hitKind,
    pickTarget, checkTeamWipe, enemyTeamKey, aliveCount, teamStats
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Engine;
} else if (typeof window !== 'undefined') {
    window._duel = Engine;
}

// ============================================================
//  ④ UI 层(浏览器环境)
// ============================================================
if (typeof document !== 'undefined') {

const $ = id => document.getElementById(id);

// ---- 屏幕 ----
const startScreen = $('startScreen');
const mainContainer = $('mainContainer');

// ---- 全局 DOM ----
const logEl = $('log');
const winnerBanner = $('winnerBanner');
const roundInfo = $('roundInfo');
const btnAuto = $('btnAuto');
const teamElA = $('teamA'), teamElB = $('teamB');
const teamHeadA = $('teamHeadA'), teamHeadB = $('teamHeadB');
const teamPanelsA = $('teamPanelsA'), teamPanelsB = $('teamPanelsB');
const addBtnA = $('addBtnA'), addBtnB = $('addBtnB');
const tooltip = $('equipTooltip');
const ttName = $('ttName');
const ttDesc = $('ttDesc');
const ttStats = $('ttStats');

// ---- 编队状态(纯数据) → 由 buildWorld() 生成对战世界 ----
//  每名队员带 cell 站位格(0..5): 0..2 = 前排 1/2/3 列,3..5 = 后排 1/2/3 列
const DEFAULT_HERO = { A: 'warrior', B: 'knight' };
let roster = {
    A: [{ heroId: 'warrior', equipIds: ['none', 'none', 'none'], cell: 1 }],
    B: [{ heroId: 'knight', equipIds: ['none', 'none', 'none'], cell: 1 }]
};

let world;                      // 当前对局
let isAuto = false;             // UI 层自动战斗标志
let rafId = null;               // 自动战斗 rAF 句柄
let lastFrameTs = 0;            // 上帧时间戳
let accSim = 0;                 // 自动战斗步长累积器
let speedMultiplier = 1;        // 当前倍速
let lastStatusRender = 0;       // 徽章节流
let domCache = { A: {}, B: {} };// 面板 DOM 引用缓存: domCache[teamKey][cell]

// ============================================================
//  日志(增量追加,不再整表 innerHTML 重建)
// ============================================================
let logArrayRef = null;
let logShownCount = 0;
function renderLogIncremental() {
    const lines = world.logLines;
    if (lines !== logArrayRef) {
        // 数组被替换(重置/切换)→ 整体清空重绘
        logEl.innerHTML = '';
        logArrayRef = lines;
        logShownCount = 0;
    }
    // 行数缩水(被截断)→ 移除最旧节点
    while (logEl.children.length > lines.length) logEl.removeChild(logEl.firstChild);
    // 追加新行
    for (let i = logShownCount; i < lines.length; i++) {
        const div = document.createElement('div');
        if (lines[i].cls) div.className = lines[i].cls;
        div.innerHTML = lines[i].msg;
        logEl.appendChild(div);
    }
    logShownCount = lines.length;
    logEl.scrollTop = logEl.scrollHeight;
}

// ============================================================
//  装备详情浮窗(getter 实时取当前装备)
// ============================================================
let tooltipTimer = null;
function positionTooltip(rect) {
    let x = rect.right + 8;
    let y = rect.top;
    const tw = 280;
    if (x + tw > window.innerWidth) x = rect.left - tw - 8;
    if (y + 200 > window.innerHeight) y = window.innerHeight - 200;
    if (y < 10) y = 10;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
}
function showEquipTooltip(equipId, event) {
    clearTimeout(tooltipTimer);
    const detail = EQUIP_DEFS[equipId];
    if (!detail) return;
    const tier = equipTierOf(equipId);
    ttName.textContent = detail.nameFull + (tier === 'rare' ? ' ⭐稀有装备' : tier === 'special' ? ' ✨特殊装备' : '');
    ttDesc.textContent = detail.desc;
    ttStats.innerHTML = detail.statsText.map(s => `<li>${s}</li>`).join('');
    positionTooltip(event.target.getBoundingClientRect());
    tooltip.style.display = 'block';
}
function hideEquipTooltip() { clearTimeout(tooltipTimer); tooltip.style.display = 'none'; }
function scheduleTooltip(equipId, event) {
    clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => { showEquipTooltip(equipId, event); }, 1000);
}
function cancelTooltip() { clearTimeout(tooltipTimer); tooltip.style.display = 'none'; }
// 一次性绑定: getId 为实时取当前装备 id 的 getter
function bindEquipTooltip(element, getId) {
    if (!element) return;
    if (element._tooltipEnter) {
        element.removeEventListener('mouseenter', element._tooltipEnter);
        element.removeEventListener('mouseleave', element._tooltipLeave);
        element.removeEventListener('mousemove', element._tooltipMove);
    }
    const enterHandler = (e) => { scheduleTooltip(getId(), e); };
    const leaveHandler = () => { cancelTooltip(); };
    const moveHandler = (e) => {
        if (tooltip.style.display === 'block') {
            positionTooltip(e.target.getBoundingClientRect());
        }
    };
    element.addEventListener('mouseenter', enterHandler);
    element.addEventListener('mouseleave', leaveHandler);
    element.addEventListener('mousemove', moveHandler);
    element._tooltipEnter = enterHandler;
    element._tooltipLeave = leaveHandler;
    element._tooltipMove = moveHandler;
}

// ============================================================
//  启动界面: 装备大全 / 规则弹窗
// ============================================================
// 装备分档徽章(普通档不显示徽章)
function equipBadgeHtml(key) {
    if (EQUIP_DEFS[key] && EQUIP_DEFS[key].upgraded) return `<span class="rare-badge upgrade-badge">🔧升级装备</span>`;
    const tier = equipTierOf(key);
    if (tier === 'rare') return `<span class="rare-badge">⭐稀有装备</span>`;
    if (tier === 'special') return `<span class="rare-badge special-badge">✨特殊装备</span>`;
    return '';
}
// 装备标签配色: 稀有=紫, 特殊=青
function equipTagClass(base, id) {
    const tier = equipTierOf(id);
    if (tier === 'rare') return base + ' rare';
    if (tier === 'special') return base + ' special';
    return base;
}
// 单件装备条目(装备大全用)
function buildEquipItem(key) {
    const e = EQUIP_DEFS[key];
    const div = document.createElement('div');
    div.className = 'equip-item';
    div.innerHTML = `
        <div class="e-name">${e.nameFull} ${equipBadgeHtml(key)}</div>
        <div class="e-desc">${e.desc}</div>
        <ul class="e-stats">${e.statsText.map(s => `<li>${s}</li>`).join('')}</ul>
    `;
    return div;
}
// v4.7: 「装备大全」按档位分栏(容器由 index.html 提供)
// v4.10: 追加「🔧升级装备」栏; v2.6 起升级装备已进入 EQUIP_LIST → 统一由 EQUIP_TIERS 循环渲染
function renderStartEquipLibrary() {
    EQUIP_TIERS.forEach(t => {
        const container = $('startEquipList_' + t.key);
        if (!container) return;
        container.innerHTML = '';
        equipListOfTier(t.key).forEach(key => container.appendChild(buildEquipItem(key)));
    });
}

// ============================================================
//  编队: 增删队员 / 换英雄 / 换装备
// ============================================================
function teamSize(teamKey) { return roster[teamKey].length; }
function canAdd(teamKey) { return teamSize(teamKey) < CONFIG.teams.maxPerTeam; }
function canRemove(teamKey) { return teamSize(teamKey) > CONFIG.teams.minPerTeam; }
// 按站位格取队员 / 取单位(roster 为插入序,world 队伍按 cell 升序,故一律按 cell 索引)
function memberAt(teamKey, cell) {
    const list = roster[teamKey];
    for (let i = 0; i < list.length; i++) if (list[i].cell === cell) return list[i];
    return null;
}
function unitAt(teamKey, cell) {
    const team = world && world[teamKey] ? world[teamKey] : [];
    for (let i = 0; i < team.length; i++) if (team[i].cell === cell) return team[i];
    return null;
}
// 取第一个空闲格(默认顺序: 前中→前左→前右→后中→后左→后右)
function firstFreeCell(teamKey) {
    for (let i = 0; i < DEFAULT_CELL_ORDER.length; i++) {
        const c = DEFAULT_CELL_ORDER[i];
        if (!memberAt(teamKey, c)) return c;
    }
    return null;
}

function addMember(teamKey, cell) {
    if (!canAdd(teamKey)) {
        addLogUI(`⚠️ ${teamKey}队 最多 ${CONFIG.teams.maxPerTeam} 人，请先移除队员后再放置`);
        return;
    }
    if (!isValidCell(cell) || memberAt(teamKey, cell)) cell = firstFreeCell(teamKey);
    if (cell === null) return;
    roster[teamKey].push({ heroId: DEFAULT_HERO[teamKey], equipIds: ['none', 'none', 'none'], cell });
    rebuildAll();
    addLogUI(`➕ ${teamKey}队 ${HERO_DEFS[DEFAULT_HERO[teamKey]].name} 入驻 ${cellName(cell)}`);
}
function removeMember(teamKey, cell) {
    const m = memberAt(teamKey, cell);
    if (!m) return;
    if (!canRemove(teamKey)) {
        addLogUI(`⚠️ ${teamKey}队 至少保留 ${CONFIG.teams.minPerTeam} 人`);
        return;
    }
    const idx = roster[teamKey].indexOf(m);
    roster[teamKey].splice(idx, 1);
    rebuildAll();
    addLogUI(`➖ ${teamKey}队 移除 ${HERO_DEFS[m.heroId].name}（${cellName(cell)}）`);
}
// 拖动换位: 目标格为空则移动,已被占用则两者交换
function moveMember(teamKey, fromCell, toCell) {
    if (fromCell === toCell || !isValidCell(fromCell) || !isValidCell(toCell)) return;
    const from = memberAt(teamKey, fromCell);
    const to = memberAt(teamKey, toCell);
    if (!from) return;
    if (!to) {
        from.cell = toCell;
        rebuildAll();
        addLogUI(`🔀 ${teamKey}队 ${HERO_DEFS[from.heroId].name}：${cellName(fromCell)} → ${cellName(toCell)}`);
        return;
    }
    from.cell = toCell; to.cell = fromCell;
    rebuildAll();
    addLogUI(`🔀 ${teamKey}队 ${HERO_DEFS[from.heroId].name} 与 ${HERO_DEFS[to.heroId].name} 交换站位`);
}
function updateMemberHero(teamKey, cell, heroId, equipIds) {
    const m = memberAt(teamKey, cell);
    if (!m) return;
    m.heroId = heroId;
    m.equipIds = equipIds.slice();
    rebuildAll();
    const u = unitAt(teamKey, cell);
    addLogUI(`🔄 ${teamKey}队${cellName(cell)}：${u ? u.emoji + ' ' + u.name : HERO_DEFS[heroId].name} 已上场`);
}
function updateMemberEquip(teamKey, cell, equipIds) {
    const m = memberAt(teamKey, cell);
    if (!m) return;
    m.equipIds = equipIds.slice();
    rebuildAll();
    const e0 = EQUIP_DEFS[equipIds[0]] || EQUIP_DEFS.none;
    const e1 = EQUIP_DEFS[equipIds[1]] || EQUIP_DEFS.none;
    const e2 = EQUIP_DEFS[equipIds[2]] || EQUIP_DEFS.none;
    addLogUI(`🔄 ${teamKey}队${cellName(cell)} 装备：${e0.icon}${e0.name} ${e1.icon}${e1.name} ${e2.icon}${e2.name}`);
}

// 装备组合合法性(v4.3): 仅校验装备点容量;相同装备(含法力护符)不再受限
// v2.7: 新增「每人只能携带 1 件升级装备」的校验
function isValidEquipCombo(equipIds) {
    if (equipUpgradeCount(equipIds) > 1) return false;
    return equipPointsUsed(equipIds) <= CONFIG.equip.points;
}

// ============================================================
//  面板渲染(按 team+cell 站位格动态生成,DOM 引用缓存)
// ============================================================
const PANEL_HTML = `
    <div class="panel-top">
        <span class="slot-badge" title="拖动面板可换位">⠿</span>
        <button class="remove-slot" title="移除队员">✕</button>
    </div>
    <div class="hero-selector">
        <div class="hero-current"></div>
        <div class="hero-grid"></div>
    </div>
    <div class="name"></div>
    <div class="emoji"></div>
    <div class="stat">HR <span class="hp-val"></span> <span class="label">攻击</span> <span class="atk-val"></span> <span class="label">攻速</span> <span class="spd-val"></span></div>
    <div class="stat"><span class="label">暴击率</span> <span class="crit-val"></span>% <span class="armor-tag">AR <span class="armor-val"></span>%</span><span class="armor-tag">MR <span class="mr-val"></span>%</span></div>
    <div class="equip-tags">
        <span class="equip-tag eq-tag-0">无</span>
        <span class="equip-tag eq-tag-1">无</span>
        <span class="equip-tag eq-tag-2">无</span>
    </div>
    <div class="hp-bar-bg"><div class="hp-bar" style="width:100%"></div></div>
    <div class="hp-text"></div>
    <div class="cd-area"><div class="cd-bar-bg"><div class="cd-bar" style="width:0%"></div></div><div class="cd-text"><span class="cd-name"></span><span class="cd-label"></span></div></div>
    <div class="mana-area"><div class="blue-bar-bg"><div class="blue-bar" style="width:0%"></div></div><div class="blue-text"></div></div>
    <div class="status-area"></div>
    <div class="equip-selector">
        <span class="slot-label">①</span><select class="eq-sel-0"></select>
        <span class="slot-label">②</span><select class="eq-sel-1"></select>
        <span class="slot-label">③</span><select class="eq-sel-2"></select>
    </div>
    <div class="equip-points"></div>
`;

// 拖动换位状态
let dragSrc = null;
function clearDropStyles() {
    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
}
document.addEventListener('dragend', clearDropStyles);

// 绑定「可拖动的站位格」通用行为(面板与空格共用)
function bindCellDnd(el, teamKey, cell) {
    el.dataset.team = teamKey;
    el.dataset.cell = cell;
    el.dataset.row = cellRow(cell);
    el.dataset.col = cellCol(cell);
    el.addEventListener('dragstart', (e) => {
        dragSrc = { teamKey, cell };
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', teamKey + ':' + cell); } catch (err) { /* 兼容 */ }
        el.classList.add('dragging');
    });
    el.addEventListener('dragover', (e) => {
        if (!dragSrc || dragSrc.teamKey !== teamKey) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drop-target');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
    el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drop-target');
        if (!dragSrc || dragSrc.teamKey !== teamKey) return;
        const from = dragSrc.cell;
        dragSrc = null;
        moveMember(teamKey, from, cell);
    });
}

// 空格子: 点击可新增队员,也可作为拖动落点
function buildEmptyCell(teamKey, cell) {
    const el = document.createElement('div');
    el.className = 'cell-empty';
    el.innerHTML = `<span class="plus">＋</span><span class="cell-tip">${cellName(cell)}</span>`;
    el.addEventListener('click', () => addMember(teamKey, cell));
    bindCellDnd(el, teamKey, cell);
    return el;
}

function buildPanel(teamKey, cell) {
    const panel = document.createElement('div');
    panel.className = 'fighter-panel';
    panel.draggable = true;
    panel.dataset.team = teamKey;
    panel.dataset.cell = cell;
    panel.dataset.row = cellRow(cell);
    panel.dataset.col = cellCol(cell);
    panel.innerHTML = PANEL_HTML;

    const refs = {
        panel,
        slotBadge: panel.querySelector('.slot-badge'),
        removeBtn: panel.querySelector('.remove-slot'),
        heroCurrent: panel.querySelector('.hero-current'),
        heroGrid: panel.querySelector('.hero-grid'),
        name: panel.querySelector('.name'),
        emoji: panel.querySelector('.emoji'),
        hpVal: panel.querySelector('.hp-val'),
        atkVal: panel.querySelector('.atk-val'),
        spdVal: panel.querySelector('.spd-val'),
        critVal: panel.querySelector('.crit-val'),
        armorVal: panel.querySelector('.armor-val'),
        mrVal: panel.querySelector('.mr-val'),
        eqTag0: panel.querySelector('.eq-tag-0'),
        eqTag1: panel.querySelector('.eq-tag-1'),
        eqTag2: panel.querySelector('.eq-tag-2'),
        equipPoints: panel.querySelector('.equip-points'),
        hpBar: panel.querySelector('.hp-bar'),
        hpText: panel.querySelector('.hp-text'),
        cdArea: panel.querySelector('.cd-area'),
        cdBar: panel.querySelector('.cd-bar'),
        cdName: panel.querySelector('.cd-name'),
        cdLabel: panel.querySelector('.cd-label'),
        manaArea: panel.querySelector('.mana-area'),
        manaBar: panel.querySelector('.blue-bar'),
        manaText: panel.querySelector('.blue-text'),
        status: panel.querySelector('.status-area'),
        eqSel0: panel.querySelector('.eq-sel-0'),
        eqSel1: panel.querySelector('.eq-sel-1'),
        eqSel2: panel.querySelector('.eq-sel-2')
    };
    refs.slotBadge.textContent = cellName(cell);

    // 事件: 展开英雄网格 / 移除队员
    refs.heroCurrent.addEventListener('click', () => toggleHeroGrid(teamKey, cell));
    refs.removeBtn.addEventListener('click', () => removeMember(teamKey, cell));

    // 拖动换位: 在下拉/按钮上按下时不触发拖动,避免影响选择操作
    panel.addEventListener('mousedown', (e) => {
        panel.draggable = !e.target.closest('select, button, .hero-selector, .equip-tag');
    });
    bindCellDnd(panel, teamKey, cell);

    // 装备浮窗(getter 实时取当前单位装备)
    bindEquipTooltip(refs.eqTag0, () => currentEquip(teamKey, cell, 0));
    bindEquipTooltip(refs.eqTag1, () => currentEquip(teamKey, cell, 1));
    bindEquipTooltip(refs.eqTag2, () => currentEquip(teamKey, cell, 2));
    bindEquipTooltip(refs.eqSel0, () => currentEquip(teamKey, cell, 0));
    bindEquipTooltip(refs.eqSel1, () => currentEquip(teamKey, cell, 1));
    bindEquipTooltip(refs.eqSel2, () => currentEquip(teamKey, cell, 2));

    return { el: panel, refs };
}
function currentEquip(teamKey, cell, idx) {
    const u = unitAt(teamKey, cell);
    return (u && u.equipIds[idx]) || 'none';
}
function getRefs(teamKey, cell) {
    return domCache[teamKey] ? domCache[teamKey][cell] : null;
}

// 重建整个竞技场(人数变化 / 初始化时调用)
function renderArena() {
    TEAM_KEYS.forEach(teamKey => {
        const container = teamKey === 'A' ? teamPanelsA : teamPanelsB;
        const teamEl = teamKey === 'A' ? teamElA : teamElB;
        const addBtn = teamKey === 'A' ? addBtnA : addBtnB;
        const headEl = teamKey === 'A' ? teamHeadA : teamHeadB;
        container.innerHTML = '';
        domCache[teamKey] = {};
        const size = teamSize(teamKey);
        let front = 0, back = 0;
        // 2×3 阵型: 逐格渲染,有队员则画面板,否则画空格(可点击新增 / 作为拖动落点)
        for (let cell = 0; cell < CONFIG.teams.cells; cell++) {
            const member = memberAt(teamKey, cell);
            if (member) {
                const built = buildPanel(teamKey, cell);
                container.appendChild(built.el);
                domCache[teamKey][cell] = built.refs;
                if (isFrontRow(cell)) front++; else back++;
            } else {
                container.appendChild(buildEmptyCell(teamKey, cell));
            }
        }
        teamEl.dataset.count = size;
        headEl.textContent = `${size} / ${CONFIG.teams.maxPerTeam} 人（前${front}·后${back}）`;
        addBtn.disabled = !canAdd(teamKey);
        addBtn.textContent = canAdd(teamKey) ? '＋ 快捷添加（前排居中优先）' : '已达上限（3 人）';
        // 仅剩 1 人时禁用移除按钮
        for (let cell = 0; cell < CONFIG.teams.cells; cell++) {
            const refs = domCache[teamKey][cell];
            if (refs) refs.removeBtn.disabled = !canRemove(teamKey);
        }
    });
}

// 英雄网格(按站位格独立渲染)
function renderHeroGrid(teamKey, cell) {
    const refs = getRefs(teamKey, cell);
    if (!refs) return;
    const member = memberAt(teamKey, cell);
    if (!member) return;
    refs.heroGrid.innerHTML = '';
    HERO_LIST.forEach(id => {
        const h = HERO_DEFS[id];
        const div = document.createElement('div');
        div.className = 'hero-icon' + (id === member.heroId ? ' selected' : '');
        div.innerHTML = `<span class="h-emoji">${h.emoji}</span><span class="h-name">${h.name}</span>`;
        div.dataset.id = id;
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            let eqs = member.equipIds.slice();
            eqs = eqs.map(eq => ((eq === 'staff' || eq === 'staff_up') && !h.hasMana) ? 'none' : eq);
            // v4.7: 熊王爪要求英雄基础生命值 ≥ 1700
            if ((h.maxHp || 0) < CONFIG.bearClaw.minBaseHp) eqs = eqs.map(eq => (eq === 'bear_claw' ? 'none' : eq));
            eqs = limitUpgradedEquips(eqs);   // v2.7 规则: 每人只能携带 1 件升级装备
            if (!isValidEquipCombo(eqs)) {
                // 装备点超出 → 从后往前置空,直到满足容量
                let used = equipPointsUsed(eqs);
                for (let i = eqs.length - 1; i >= 0 && used > CONFIG.equip.points; i--) {
                    if (eqs[i] !== 'none') { used -= equipCost(eqs[i]); eqs[i] = 'none'; }
                }
            }
            updateMemberHero(teamKey, cell, id, eqs);
            refs.heroGrid.classList.remove('open');
        });
        refs.heroGrid.appendChild(div);
    });
}
function updateHeroCurrent(teamKey, cell) {
    const refs = getRefs(teamKey, cell);
    const u = unitAt(teamKey, cell);
    if (!refs || !u) return;
    refs.heroCurrent.innerHTML = `<span class="h-emoji">${u.emoji}</span><span class="h-name">${u.name}</span><span class="h-arrow">▼</span>`;
}
function toggleHeroGrid(teamKey, cell) {
    const refs = getRefs(teamKey, cell);
    if (!refs) return;
    const isOpen = refs.heroGrid.classList.toggle('open');
    if (isOpen) closeAllHeroGrids(teamKey, cell);
}
function closeAllHeroGrids(exceptTeam, exceptCell) {
    TEAM_KEYS.forEach(tk => {
        for (let cell = 0; cell < CONFIG.teams.cells; cell++) {
            if (tk === exceptTeam && cell === exceptCell) continue;
            const refs = getRefs(tk, cell);
            if (refs) refs.heroGrid.classList.remove('open');
        }
    });
}

// 装备下拉(三阶段: 计算合法选项 → 渲染 → 绑定,无递归),逻辑与原版一致
function renderEquipSelects(teamKey, cell) {
    const refs = getRefs(teamKey, cell);
    if (!refs) return;
    const member = memberAt(teamKey, cell);
    if (!member) return;
    const selectors = [refs.eqSel0, refs.eqSel1, refs.eqSel2];
    const hid = member.heroId;
    const heroData = HERO_DEFS[hid];

    // 阶段1: 归一化(装备点容量裁剪 + 法杖限蓝条英雄)
    //  挑战模式预设队伍带 freeEquip 标记,其超出常规装备点的配置是关卡设计的一部分,
    //  此处必须传 skipLimit,否则 roster 会被改写、下一次 rebuildAll 时预设装备就会丢
    const eqs = normalizeEquipIds(member.equipIds, hid, !!member.freeEquip);
    member.equipIds = eqs;

    // 阶段2: 每槽可选项 = 「换掉本槽后剩余装备点」放得下的装备
    //   装备限制: 法杖仅蓝条英雄可装备; 熊王爪要求英雄基础生命值 ≥ 1700
    const filtered = EQUIP_LIST.filter(id => {
        // 法杖家族(法杖 / 灵能大法杖)均要求蓝条英雄,且与引擎 normalizeEquipIds 的规则保持一致
        if ((id === 'staff' || id === 'staff_up') && !heroData.hasMana) return false;
        if (id === 'bear_claw' && (heroData.maxHp || 0) < CONFIG.bearClaw.minBaseHp) return false;
        return true;
    });
    const optionsBySlot = [];
    for (let idx = 0; idx < CONFIG.equip.slots; idx++) {
        const currentEq = eqs[idx] || 'none';
        let others = 0;
        for (let j = 0; j < eqs.length; j++) if (j !== idx) others += equipCost(eqs[j]);
        const budget = CONFIG.equip.points - others;
        // v2.7 规则: 每人只能携带 1 件升级装备 → 其它槽位已带升级装备时, 本槽的升级装备不可选
        const upgradeTakenElsewhere = eqs.some((id, j) => j !== idx && EQUIP_UPGRADED_LIST.indexOf(id) >= 0);
        optionsBySlot.push(filtered.map(id => {
            const e = EQUIP_DEFS[id];
            let label = `${e.icon} ${e.name}` + (e.cost > 1 ? `（${e.cost}点）` : '');
            let disabled = false;
            if (equipCost(id) > budget) {
                disabled = true;
                label += ' (装备点不足)';
            }
            if (upgradeTakenElsewhere && EQUIP_UPGRADED_LIST.indexOf(id) >= 0) {
                disabled = true;
                label += ' (已有升级装备)';
            }
            return { id, label, disabled, selected: id === currentEq };
        }));
    }

    // 阶段3: 渲染 + 事件(v4.7: 按 普通/特殊/稀有 分档用 optgroup 分组)
    optionsBySlot.forEach((opts, idx) => {
        const select = selectors[idx];
        if (!select) return;
        select.disabled = false;      // v4.4: 第 3 槽已开放(仍受 2 装备点总容量约束)
        select.innerHTML = '';
        const groups = {};
        EQUIP_TIERS.forEach(t => {
            const g = document.createElement('optgroup');
            g.label = `${t.title}（${t.note}）`;
            groups[t.key] = g;
        });
        opts.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = o.label;
            opt.disabled = o.disabled;
            if (o.selected) opt.selected = true;
            if (o.id === 'none') { select.appendChild(opt); return; }   // 「无」不参与分组
            const g = groups[equipTierOf(o.id)];
            if (g) g.appendChild(opt); else select.appendChild(opt);
        });
        EQUIP_TIERS.forEach(t => { if (groups[t.key].childNodes.length) select.appendChild(groups[t.key]); });
        select.onchange = () => {
            const ne = select.value;
            const newEqs = member.equipIds.slice();
            newEqs[idx] = ne;
            if (!isValidEquipCombo(newEqs)) {
                if (equipUpgradeCount(newEqs) > 1) {
                    addLogUI(`⚠️ 每人只能携带 1 件升级装备`);
                } else {
                    addLogUI(`⚠️ 装备点不足：该装备需 ${equipCost(ne)} 点，每名角色共 ${CONFIG.equip.points} 点`);
                }
                select.value = member.equipIds[idx] || 'none';
                return;
            }
            updateMemberEquip(teamKey, cell, newEqs);
        };
    });
    // 装备点用量提示
    if (refs.equipPoints) {
        refs.equipPoints.textContent = `装备点 ${equipPointsUsed(eqs)} / ${CONFIG.equip.points}`;
    }
}

// ============================================================
//  界面刷新(节流/脏标记;血条等每帧刷新不受限)
// ============================================================
// 每帧: 血条/蓝条/冷却条/回合数/胜利横幅
function updateBars() {
    TEAM_KEYS.forEach(teamKey => {
        const team = world[teamKey];
        for (let i = 0; i < team.length; i++) {
            const u = team[i];
            const refs = getRefs(teamKey, u.cell);
            if (!refs) continue;
            refs.hpVal.textContent = round1(u.hp);
            refs.hpText.textContent = `${round1(u.hp)} / ${round1(u.maxHp)}`;
            const p = clamp((u.hp / u.maxHp) * 100, 0, 100);
            refs.hpBar.style.width = p + '%';
            refs.hpBar.className = 'hp-bar' + (p < 25 ? ' critical' : p < 50 ? ' low' : '');
            refs.panel.classList.toggle('dead', u.hp <= 0);

            if (u.hasMana) {
                refs.manaArea.style.display = 'block';
                const mp = clamp((u.mana / u.maxMana) * 100, 0, 100);
                refs.manaBar.style.width = mp + '%';
                refs.manaText.textContent = `${round1(u.mana)} / ${round1(u.maxMana)}`;
            } else refs.manaArea.style.display = 'none';

            updateCdArea(refs, u);
        }
    });

    const alive = tk => aliveCount(world, tk);
    const total = tk => world[tk].length;
    const atks = tk => world[tk].reduce((s, u) => s + (u.atkCount || 0), 0);
    roundInfo.textContent =
        `回合: ${world.round} | A队 存活 ${alive('A')}/${total('A')} · 攻击 ${atks('A')}次` +
        ` | B队 存活 ${alive('B')}/${total('B')} · 攻击 ${atks('B')}次`;

    if (world.winner) {
        winnerBanner.style.display = 'block';
        winnerBanner.textContent = `🏆 ${world.winner}队 获得胜利！`;
    } else winnerBanner.style.display = 'none';
}
function updateCdArea(refs, unit) {
    if (!refs) return;
    if (!unit.cdName) { refs.cdArea.style.display = 'none'; return; }
    refs.cdArea.style.display = 'block';
    const dur = unit.cooldownDuration || 8;
    if (hasMech(unit, 'dualFist')) {
        if (unit.fighterActive) {
            const remaining = Math.max(0, CONFIG.dualFist.durationSec - unit.fighterTimer);
            refs.cdBar.style.width = '100%';
            refs.cdBar.className = 'cd-bar ready';
            refs.cdLabel.textContent = `👊 ${remaining.toFixed(1)}s`;
            refs.cdName.textContent = '双拳模式';
        } else {
            const cd = unit.fighterCooldown || 0;
            const prog = cd > 0 ? clamp((cd / dur) * 100, 0, 100) : 0;
            refs.cdBar.style.width = prog + '%';
            refs.cdBar.className = 'cd-bar' + (cd >= dur ? ' ready' : '');
            refs.cdLabel.textContent = cd >= dur ? '✅ 就绪' : `${Math.ceil(dur - cd)}s`;
            refs.cdName.textContent = '充能中';
        }
    } else {
        const cd = unit.skillCharge || 0;
        const prog = clamp((cd / dur) * 100, 0, 100);
        refs.cdBar.style.width = prog + '%';
        refs.cdBar.className = 'cd-bar' + (cd >= dur ? ' ready' : '');
        refs.cdLabel.textContent = cd >= dur ? '✅ 就绪' : `${Math.ceil(dur - cd)}s`;
        refs.cdName.textContent = unit.cdName || '技能';
    }
}
// v2.7 动态数值高亮: 任一「条件性 / 成长性」攻击力加成生效时, 面板攻击力以绿色高亮显示
//   (长枪手独守阵线 / 浴血奋战 / 熊王二形态 / 黑暗之力 / 铁血意志 / 进化 / 嗜血狂镰 / 小精灵 / 攻击药剂)
function unitAtkBuffActive(u) {
    return !!(u.lancerAloneActive || u.berserkActive || u.bossPhase2 || u.holyActive ||
        (u.darkStacks || 0) > 0 || (u.ironStacks || 0) > 0 || (u.evoStage || 0) > 0 ||
        (u._bloodLeechGain || 0) > 0 || (u.spiritCount || 0) > 0 || (u.potionAtkBonus || 0) > 0);
}
// 脏标记: 名字/数值/装备标签
function refreshStaticPanels() {
    TEAM_KEYS.forEach(teamKey => {
        const team = world[teamKey];
        for (let i = 0; i < team.length; i++) {
            const u = team[i];
            const refs = getRefs(teamKey, u.cell);
            if (!refs) continue;
            refs.name.textContent = u.name;
            refs.emoji.textContent = u.emoji;
            refs.atkVal.textContent = round1(u.atk);
            // v2.7: 机制加成生效时高亮显示当前攻击力(动态数值)
            refs.atkVal.className = unitAtkBuffActive(u) ? 'atk-val buffed' : 'atk-val';
            // v2.2: 显示实际攻速(含寒冰印记 -10% 等倍率)
            refs.spdVal.textContent = (u.speed * (u.speedMul || 1)).toFixed(2);   // v4.7: 攻速显示两位小数(最小单位 0.05)
            refs.armorVal.textContent = u.armor;
            refs.mrVal.textContent = u.mr;
            refs.critVal.textContent = u.critRate || 0;
            const e0 = EQUIP_DEFS[u.equipIds[0]] || EQUIP_DEFS.none;
            const e1 = EQUIP_DEFS[u.equipIds[1]] || EQUIP_DEFS.none;
            const e2 = EQUIP_DEFS[u.equipIds[2]] || EQUIP_DEFS.none;
            // 与原版一致: "无" 也显示图标 + 名称("⬜ 无")
            refs.eqTag0.textContent = `${e0.icon} ${e0.name}`;
            refs.eqTag1.textContent = `${e1.icon} ${e1.name}`;
            if (refs.eqTag2) refs.eqTag2.textContent = `${e2.icon} ${e2.name}`;
            refs.eqTag0.className = equipTagClass('equip-tag eq-tag-0', u.equipIds[0]);
            refs.eqTag1.className = equipTagClass('equip-tag eq-tag-1', u.equipIds[1]);
            if (refs.eqTag2) refs.eqTag2.className = equipTagClass('equip-tag eq-tag-2', u.equipIds[2]);
            if (refs.equipPoints) {
                refs.equipPoints.textContent = `装备点 ${equipPointsUsed(u.equipIds)} / ${CONFIG.equip.points}`;
            }
        }
    });
}
// 状态徽章(0.25s 节流;数据来自引擎,顺序与原版 updateStatus 一致)
function buildStatusHtml(unit) {
    let html = '';
    const curseMech = MECHANICS.curse;
    if (unit.curse !== null) html += curseMech.statusText(unit);
    if (hasMech(unit, 'berserk') && unit.berserkActive) html += MECHANICS.berserk.statusText(unit);
    if (hasMech(unit, 'evolution')) html += MECHANICS.evolution.statusText(unit);
    if (hasMech(unit, 'trueStrike')) html += MECHANICS.trueStrike.statusText(unit);
    if (unit.stunned > 0) {
        html += `<span class="status-badge silenced"><span class="badge-icon">💫</span>眩晕 ${Math.ceil(unit.stunned)}s</span>`;
    }
    // v2.2: 寒冰印记(附着于被攻击者身上)
    if (unit.frostStacks > 0) html += MECHANICS.frostMark.statusText(unit);
    if (hasMech(unit, 'dualFist')) html += MECHANICS.dualFist.statusText(unit);
    // v2.5: 猎网减速(附着于被命中者身上, 未中网时返回空串)
    html += MECHANICS.hunterNet.statusText(unit);
    if (hasMech(unit, 'starfall')) html += MECHANICS.starfall.statusText(unit);
    if (hasMech(unit, 'lancerStrike')) html += MECHANICS.lancerStrike.statusText(unit);
    if (hasMech(unit, 'ghost')) html += MECHANICS.ghost.statusText(unit);
    // v2.6: 黑暗游侠 · 黑暗护盾层数 / 黑暗之力层数
    if (hasMech(unit, 'darkRanger')) html += MECHANICS.darkRanger.statusText(unit);
    if (hasMech(unit, 'swordAura')) html += MECHANICS.swordAura.statusText(unit);
    if (hasMech(unit, 'paladinHoly')) html += MECHANICS.paladinHoly.statusText(unit);
    if (hasMech(unit, 'manaBurst')) html += MECHANICS.manaBurst.statusText(unit);       // v2.7 法师吟唱
    if (hasMech(unit, 'bloodScythe')) html += MECHANICS.bloodScythe.statusText(unit);   // v2.7 嗜血狂镰
    if (hasMech(unit, 'ironWill')) html += MECHANICS.ironWill.statusText(unit);
    if (hasMech(unit, 'revolver')) html += MECHANICS.revolver.statusText(unit);
    if (hasMech(unit, 'fairyHeal')) html += MECHANICS.fairyHeal.statusText(unit);
    if (hasMech(unit, 'spiritSummon')) html += MECHANICS.spiritSummon.statusText(unit);
    if (hasMech(unit, 'bossBear')) html += MECHANICS.bossBear.statusText(unit);
    if (hasMech(unit, 'archmage')) html += MECHANICS.archmage.statusText(unit);
    if (unit.shield > 0) {
        html += `<span class="status-badge" style="border-color:#5dade2;color:#5dade2;">🛡️ ${Math.ceil(unit.shield)}</span>`;
    }
    if (unit.cloakTriggered) {
        html += `<span class="status-badge" style="border-color:#f39c12;color:#f5c842;">🧥 全能吸血${unit.leechAll}%</span>`;
    }
    return html;
}
function updateStatus() {
    TEAM_KEYS.forEach(teamKey => {
        const team = world[teamKey];
        for (let i = 0; i < team.length; i++) {
            const refs = getRefs(teamKey, team[i].cell);
            if (refs) refs.status.innerHTML = buildStatusHtml(team[i]);
        }
    });
}
// ---- 单帧渲染(手动回合/自动战斗每帧调用) ----
function renderFrame(throttled) {
    const now = performance.now();
    updateBars();
    if (world.uiDirty) {
        refreshStaticPanels();
        world.uiDirty = false;
    }
    if (now - lastStatusRender >= 250 || throttled === true) {
        updateStatus();
        lastStatusRender = now;
    }
    renderLogIncremental();
}

// ============================================================
//  战斗控制(手动回合/自动战斗/倍速/重置)
// ============================================================
function stopAuto() {
    isAuto = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    accSim = 0;
    btnAuto.textContent = '▶ 自动战斗';
    btnAuto.classList.remove('stop');
}
function startAuto() {
    if (isAuto) return;
    // v4.2(Q7): 自动战斗开始 = 按当前编队「完整重置」从零开打
    // (血量/蓝量/进化/诅咒/护盾等全部还原,日志清空),首行为 [0.0s] ▶ 自动战斗开始
    const freshCap = Math.max(CONFIG.teams.maxPerTeam, roster.A.length, roster.B.length);
    const fresh = createWorld(roster.A, roster.B, { maxPerTeam: freshCap });
    if (aliveCount(fresh, 'A') === 0 || aliveCount(fresh, 'B') === 0) return;
    world = fresh;
    logArrayRef = null; logShownCount = 0;
    world.uiDirty = true;
    isAuto = true;
    btnAuto.textContent = '⏹ 停止';
    btnAuto.classList.add('stop');
    addLog(world, '▶ 自动战斗开始', 'highlight');
    accSim = 0;
    lastFrameTs = performance.now();
    renderFrame(true);
    rafId = requestAnimationFrame(autoFrame);
}
function autoFrame(timestamp) {
    if (!isAuto) return;
    const realDelta = Math.min((timestamp - lastFrameTs) / 1000, CONFIG.auto.deltaClamp);
    lastFrameTs = timestamp;
    // 倍速只改变模拟速率,不改变任何数值逻辑
    accSim = Math.min(accSim + realDelta * speedMultiplier, CONFIG.auto.maxStepsPerFrame * CONFIG.auto.step);
    let steps = 0;
    while (accSim >= CONFIG.auto.step && steps < CONFIG.auto.maxStepsPerFrame && !world.winner) {
        accSim -= CONFIG.auto.step;
        tick(world, CONFIG.auto.step, {});
        steps++;
        if (world.winner) break;
    }
    if (world.winner) {
        stopAuto();
        renderFrame(true);
        return;
    }
    renderFrame(false);
    rafId = requestAnimationFrame(autoFrame);
}
// 手动回合: tick(1.0, 手动) 后两队所有存活队员按编队顺序各攻击一次(与原版 doRound 时序一致)
function doManualRound() {
    if (isAuto || world.winner) return;
    if (aliveCount(world, 'A') === 0 || aliveCount(world, 'B') === 0) return;
    tick(world, 1.0, { manual: true });
    renderFrame(true);
}

// ---- 重置: 全队战斗态清零 → 按当前编队重新构建世界 ----
function resetCombatState(w) {
    w.units.forEach(u => {
        u.attackCd = 0; u.skillCharge = 0; u.critStreak = 0; u.lastStandUsed = false;
        u.curse = null; u.curseTimer = 0; u.curseAppliedAt = false;
        u.evoStage = 0; u.evoTimer = 0; u.manaAccum = 0; u.spearCount = 0;
        u.stunned = 0;
        u.speedMul = 1; u.frostStacks = 0; u._psionicArmed = true; u._psionicGain = 0;
        u.fighterTimer = 0; u.fighterActive = false; u.fighterCooldown = 0;
        u.regenTimer = 0; u.shield = 0; u.cloakTriggered = false;
        u.leechAll = equipLeechBase(u.equipIds);   // v2.7: 保留装备自带的全能吸血(嗜血狂镰), 只清战斗中获得的部分
        u.netSlowTimer = 0; u.magicCharge = 0; u.starfallTimer = 0; u.starfallAccum = 0; u.starfallHitFlag = false;
        u.lancerCasting = false; u.lancerCastTimer = 0;
        u.ghostImmuneTimer = 0; u.ghostReviveUsed = false;
        u.holyActive = false; u.holyTimer = 0; u.holyAccum = 0;
        u.ironStacks = 0; u.ironDmgAccum = 0; u.ironAtkCount = 0; u.ironUltUsed = false;
        u.ammo = CONFIG.revolver.capacity; u.reloading = false; u.reloadTimer = 0; u.lockedTarget = null;
        u.darkStacks = 0; u.darkShield = 0; u.darkShieldTimer = 0; u._darkStunPrev = 0;   // v2.6 黑暗游侠
        u.lifeStrikeReady = false; u.crystalTimer = 0; u._jadeSpeedExtra = 0;
        u.spiritCount = 0; u.spiritTimer = 0; u.spiritAtkTimer = 0;   // v2.7 精灵: 开局不再自带小精灵, 从 0 只开始叠加
        u.mageCasting = false; u.mageCastTimer = 0;
        u._bloodLeechGain = 0; u._darkShieldEvent = null;
        u.lancerAloneActive = false; u._lancerAlone = false;
        u.bossCdTimer = 0; u.bossPhase2 = false; u.bossRallyDone = false;
        u.berserkTriggered = false; u.berserkActive = false;
        u.arcCasting = false; u.arcCastTimer = 0; u.arcHpLoss = 0;
        u.atkCount = 0;
        u.stats = { dmgDealt: 0, crits: 0, attacks: 0 };
    });
    w.round = 0;
    w.winner = null;
    w.battleTime = 0;
    w.logLines = [];
    logArrayRef = null; logShownCount = 0;
    w.uiDirty = true;
}
function buildWorld() {
    // 挑战模式预设队伍可超过常规 3 人上限;自行编辑仍受 maxPerTeam 约束
    const cap = Math.max(CONFIG.teams.maxPerTeam, roster.A.length, roster.B.length);
    world = createWorld(roster.A, roster.B, { maxPerTeam: cap });
}
// 编队/装备变更后的全量重建(沿用「换人就全重置」约定)
function rebuildAll() {
    stopAuto();
    buildWorld();
    resetCombatState(world);
    renderArena();
    refreshPanels();
    applyResetUI();
}
// 刷新各面板的英雄网格 / 装备下拉 / 头像
function refreshPanels() {
    TEAM_KEYS.forEach(teamKey => {
        for (let cell = 0; cell < CONFIG.teams.cells; cell++) {
            if (!memberAt(teamKey, cell)) continue;
            renderHeroGrid(teamKey, cell);
            renderEquipSelects(teamKey, cell);
            updateHeroCurrent(teamKey, cell);
        }
    });
}
function applyResetUI() {
    renderFrame(true);
}
function addLogUI(msg, cls) {
    addLog(world, msg, cls);
    renderLogIncremental();
}

// ============================================================
//  倍速控制
// ============================================================
function setSpeed(mult) {
    speedMultiplier = mult;
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    (mult === 1 ? $('speed1x') : mult === 2 ? $('speed2x') : $('speed4x')).classList.add('active');
}

// ============================================================
//  人物介绍(v4.3: 替代原「批量模拟统计」)
// ============================================================
// 展示每个英雄的基础属性 / 技能 / 机制
// 英雄基础数值 + 蓝条/回蓝等全部机制(用于「人物介绍」列表)
function heroStatLines(h) {
    const lines = [];
    // v4.7: 面板与人物介绍统一使用简称 HR(生命值) / AR(护甲) / MR(魔抗)
    lines.push(`HR ${h.maxHp}　攻击 ${h.atk}　攻速 ${h.speed.toFixed(2)}`);
    lines.push(`AR ${h.armor}%　MR ${h.mr}%　暴击 ${h.critRate || 0}%（×${h.critMulti || 2}）`);
    lines.push(`攻击类型：${h.atkType === 'magical' ? '法术' : '物理'}`);
    if (h.hasMana) {
        lines.push(`蓝量 ${h.maxMana}（开局 ${h.startMana}）`);
        if (h.manaMechanic) lines.push(`回蓝：${h.manaMechanic}`);
    } else {
        lines.push(`蓝条：无`);
    }
    if (h.skillName) lines.push(`技能：${h.skillName}`);
    if (h.isBoss && h.bossGrade) lines.push(`BOSS 等级：${h.bossGrade} 级`);
    return lines;
}
// BOSS 单位(v4.7: 人物介绍拆为「英雄 / BOSS」两栏; v2.6 起按等级划分: A级 熊王/黑暗游侠, B级 大魔法师/幽魂)
const BOSS_LIST = ['bossBear', 'darkRanger', 'archmage', 'ghost'];
// 单张人物卡(英雄 / BOSS 共用)
function buildHeroCard(id) {
    const h = HERO_DEFS[id];
    const div = document.createElement('div');
    div.className = 'equip-item';
    const stats = heroStatLines(h).map(s => `<li>${s}</li>`).join('');
    const badge = h.isBoss
        ? `<span class="rare-badge" style="background:#7b241c;border-color:#e74c3c;color:#f5b7b1;">🏆 BOSS单位${h.bossGrade ? ' · ' + h.bossGrade + '级' : ''}</span>`
        : `<span class="rare-badge">${h.skillName || '—'}</span>`;
    div.innerHTML = `
        <div class="e-name">${h.emoji} ${h.name}${badge}</div>
        <div class="e-desc">${h.desc}</div>
        <ul class="e-stats">${stats}</ul>
    `;
    return div;
}
// 与「装备大全」一致的条目式列表(英雄与BOSS分开渲染)
function renderHeroLibrary() {
    const groups = [['heroCards', HERO_LIST], ['bossCards', BOSS_LIST]];
    groups.forEach(g => {
        const container = $(g[0]);
        if (!container) return;
        container.innerHTML = '';
        g[1].forEach(id => container.appendChild(buildHeroCard(id)));
    });
}

// ============================================================
//  挑战模式(固定编队模板;可脱离常规限制: 人数可 >3、装备不限重复)
// ------------------------------------------------------------
//  「号位」沿用默认布阵顺序: 1号位=前中, 2号位=前左, 3号位=前右,
//   4号位=后中, 5号位=后左, 6号位=后右 (DEFAULT_CELL_ORDER = [1,0,2,4,3,5])
// ============================================================
const CHALLENGE_TEAMS = [
    {
        name: '队伍1（吸血）',
        desc: '1/2/3 号位：勇士 ×3（2号位额外+1把吸血刀）',
        members: [
            { heroId: 'warrior', equipIds: ['scythe', 'scythe', 'none'], cell: 1 },
            { heroId: 'warrior', equipIds: ['scythe', 'scythe', 'scythe'], cell: 0 },
            { heroId: 'warrior', equipIds: ['scythe', 'scythe', 'none'], cell: 2 }
        ]
    },
    {
        name: '队伍2（3大肉）',
        desc: '1号位坦克 / 2号位圣骑 / 3号位坦克（各带恢复水晶+生命腰带）；5号位游侠带 2 把急速弓',
        members: [
            { heroId: 'tank', equipIds: ['crystal', 'belt', 'none'], cell: 1 },
            { heroId: 'paladin', equipIds: ['crystal', 'belt', 'none'], cell: 0 },
            { heroId: 'tank', equipIds: ['crystal', 'belt', 'none'], cell: 2 },
            { heroId: 'ranger', equipIds: ['bow', 'bow', 'none'], cell: 3 }
        ]
    },
    {
        name: '队伍3（均衡）',
        desc: '1/2 号位坦克（水晶+腰带）；3号位战士（流星锤+腰带）；4号位精灵（迅捷法杖×2）',
        members: [
            { heroId: 'tank', equipIds: ['crystal', 'belt', 'none'], cell: 1 },
            { heroId: 'tank', equipIds: ['crystal', 'belt', 'none'], cell: 0 },
            { heroId: 'knight', equipIds: ['hammer', 'belt', 'none'], cell: 2 },
            { heroId: 'fairy', equipIds: ['swift_staff', 'swift_staff', 'none'], cell: 4 }
        ]
    },
    {
        name: '队伍4（进化）',
        desc: '1/2 号位：带生命腰带的圣骑；4/5 号位：带守护斗篷的进化兽（额外各带一把急速弓）',
        members: [
            { heroId: 'paladin', equipIds: ['belt', 'none', 'none'], cell: 1 },
            { heroId: 'paladin', equipIds: ['belt', 'none', 'none'], cell: 0 },
            { heroId: 'evo', equipIds: ['cloak', 'bow', 'none'], cell: 4 },
            { heroId: 'evo', equipIds: ['cloak', 'bow', 'none'], cell: 3 }
        ]
    },
    {
        name: '队伍5（BOSS·熊王·A级）',
        desc: '单人 BOSS：熊王（12000生命，随机攻击，周期AOE眩晕，二形态+15双抗，32s坚毅）',
        members: [
            { heroId: 'bossBear', equipIds: ['none', 'none', 'none'], cell: 1 }
        ]
    },
    {
        name: '队伍6（BOSS·大魔法师·B级）',
        desc: '单人 BOSS：大魔法师（10000生命，法术随机攻击，秘法风暴360/180+魔抗永久削减）',
        members: [
            { heroId: 'archmage', equipIds: ['none', 'none', 'none'], cell: 1 }
        ]
    },
    {
        name: '队伍7（BOSS·幽魂·B级）',
        desc: '单人 BOSS：幽魂（6000生命，攻速0.8/攻击70，随机撕咬 2 个目标·魔法伤害；首次死亡 2s 免疫后满血复活+30攻；敌方每阵亡 1 人回 2000 血（可破上限）+30攻）',
        members: [
            { heroId: 'ghost', equipIds: ['none', 'none', 'none'], cell: 1 }
        ]
    },
    {
        name: '队伍8（BOSS·黑暗游侠·A级）',
        desc: '单人 BOSS：黑暗游侠（8000生命/攻击50/攻速2.0/双抗30；对位锁定，击杀后才换下一个单位；被动·黑暗汲取每次攻击+1攻击力（无上限，被控制-10层）；被动·黑暗护盾每5s+1层（免疫一次主动技能伤害，可叠加），击杀单位立刻再+1层）',
        members: [
            { heroId: 'darkRanger', equipIds: ['none', 'none', 'none'], cell: 1 }
        ]
    }
];
// 应用挑战队伍到指定队伍(v2.6 起 side 可为 'A' / 'B')
//   整队替换;允许超过常规 3 人上限(编辑面板只显示前 CONFIG.teams.cells 个槽位, 引擎侧照常出战)
function applyChallengeTeam(index, side) {
    const t = CHALLENGE_TEAMS[index];
    if (!t) return;
    const key = (side === 'A') ? 'A' : 'B';
    roster[key] = t.members.map(m => ({ heroId: m.heroId, equipIds: m.equipIds.slice(), cell: m.cell, freeEquip: true }));
    rebuildAll();
    addLogUI(`🎯 ${key}队 已载入挑战队伍「${t.name}」（${t.members.length} 人）`);
    const modal = $('challengeModal');
    if (modal) modal.style.display = 'none';
}
function renderChallengeList() {
    const container = $('challengeList');
    if (!container) return;
    container.innerHTML = '';
    CHALLENGE_TEAMS.forEach((t, i) => {
        const div = document.createElement('div');
        div.className = 'equip-item challenge-item';
        const members = t.members.map(m => {
            const h = HERO_DEFS[m.heroId];
            const eq = m.equipIds.filter(id => id !== 'none').map(id => EQUIP_DEFS[id].icon).join('');
            return `${h.emoji}${h.name}${eq ? '·' + eq : ''}（${cellName(m.cell)}）`;
        }).join('　');
        div.innerHTML = `
            <div class="e-name">${t.name}</div>
            <div class="e-desc">${t.desc}</div>
            <ul class="e-stats"><li>${members}</li></ul>
            <div class="ch-actions">
                <button class="ch-load">调用到 B 队</button>
                <button class="ch-load ch-load-a">调用到 A 队</button>
            </div>
        `;
        div.querySelector('.ch-load').addEventListener('click', () => applyChallengeTeam(i, 'B'));
        div.querySelector('.ch-load-a').addEventListener('click', () => applyChallengeTeam(i, 'A'));
        container.appendChild(div);
    });
}

// ============================================================
//  远征挑战 · 肉鸽模式(v2.1 节点式)
//  ------------------------------------------------------------
//  7 个节点按顺序推进(v2.4):
//    ① 出征    : 随机 5 选 2 英雄 + 随机 4 选 1 基础装备
//    ② 战斗    : 敌 2 名随机英雄(1、2 号位, 不会出现玩家已有英雄)
//                 胜利 +10 金币 → 基础装备 4 选 1 → 英雄 2 选 1(凑满 3 人)
//    ③ 战斗    : 敌 3 名随机英雄(1、2、3 号位, 各带 1 个恢复水晶)
//                 胜利 +10 金币 → 稀有装备 3 选 1(v2.4 起不再赠送恢复水晶)
//    ④ 商店    : 随机 5 件基础装备(10 金) + 2 件稀有装备(20 金) + 一次性物品(守护/攻击药剂 6 金)
//                 并可卖装备(普通 6/稀有 12/升级 10 金)
//    ⑤ 装备升级: 10 金升级一件装备(仅限 流星锤/急速弓/精钢剑/专业法杖); 无战斗, 可直接通过
//    ⑥ 精英战  : 原队伍1(吸血) → 胜利 +10 金币
//    ⑦ BOSS    : 大魔法师 → 击败后通关
//  规则: 玩家只能操作 A 队(B 队由系统生成, 不可编辑); 每关开始全队回满血;
//        生命(机会)3点, 战斗失败扣 1 点并回到整备重试, 扣完则远征失败
//  金币: 每个战斗节点胜利 +10; 商店(买/卖装备) 与 装备升级点(升级装备) 均可增减
//  整备: 战斗前可调整 3列×2行 站位(拖拽/点击换位) + 背包装备自由分配(每人 2 装备点)
//        战斗界面亦可「⚙ 调整装备/站位」暂停回整备(不消耗生命)
//  战场(2.3 起为上下布局): 敌我双方均为 3列×2行 = 前后排 6 个站位; B 队在上、A 队在下,
//        双方前排都贴中间线(面对面), 战斗日志固定在整个战场右侧
// ============================================================
const ROGUE_SLOT_CELLS = [1, 0, 2, 4, 3, 5];   // 号位 1~6 → 站位格(沿用默认布阵顺序)
const ROGUE_MAX_LIVES = 3;
const ROGUE_GOLD_PER_BATTLE = 10;
const ROGUE_SHOP = { basicCount: 5, rareCount: 2, basicPrice: 10, rarePrice: 20, sellBasic: 6, sellRare: 12, sellUpgraded: 10,
    itemPrice: 6, items: ['shield_potion', 'attack_potion'] };
// ---- v2.4 商店「一次性物品」(战斗前整备界面勾选使用, 开战自动生效并消耗 1 个) ----
const ROGUE_ITEMS = {
    shield_potion: { id: 'shield_potion', icon: '🧪', name: '守护药剂',
        desc: '开局我方所有单位获得 300 护盾，最多持续 6 秒' },
    attack_potion: { id: 'attack_potion', icon: '⚗️', name: '攻击药剂',
        desc: '开局我方所有单位攻击力 +10%，持续 6 秒' }
};
const ROGUE_NODES = [
    { type: 'pick',    icon: '🧭', name: '出征',     desc: '5选2英雄 · 4选1基础装备' },
    { type: 'battle',  icon: '⚔️', name: '战斗',     desc: '2 名随机英雄' },
    { type: 'battle',  icon: '⚔️', name: '战斗',     desc: '3 名随机英雄（带恢复水晶）' },
    { type: 'shop',    icon: '🏪', name: '商店',     desc: '买10/20金 · 卖6/12金' },
    { type: 'upgrade', icon: '🔧', name: '装备升级', desc: '10金升级装备（无战斗，可直接通过）' },
    { type: 'elite',   icon: '🔥', name: '精英战',   desc: '原队伍1（吸血）' },
    { type: 'boss',    icon: '👑', name: 'BOSS',     desc: '大魔法师' }
];
const ROGUE = {
    node: 0, lives: ROGUE_MAX_LIVES, phase: '', cleared: -1, gold: 0,
    team: [], bag: {}, enemies: [], shop: null,
    poolHeroes: [], poolEquips: [], pickHeroes: [], pickEquips: [],
    items: {},            // v2.4 一次性物品库存(soul_potion/attack_potion → 数量)
    potionUse: {},        // v2.4 整备界面勾选「本场使用」的物品
    settle: null,         // v2.4 战斗结算数据({win, dmg})
    result: null
};
let rogueWorld = null, rogueTimer = null, rogueLogRef = null, rogueLogShown = 0, rogueSpeed = 2;
let rogueToastTimer = null, rogueMoveFrom = null;

// ---- 随机工具 ----
function rogueShuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
}
function rogueSample(list, n) { return rogueShuffle(list.slice()).slice(0, n); }

// ---- 背包统计 ----
function rogueEquippedCount(id) {
    let c = 0;
    ROGUE.team.forEach(m => m.equipIds.forEach(e => { if (e === id) c++; }));
    return c;
}
// 背包可用数量(可排除某队员的某槽位, 便于下拉保留当前选择)
function rogueBagRemain(id, exceptMember, exceptSlot) {
    let used = 0;
    ROGUE.team.forEach((m, mi) => m.equipIds.forEach((e, si) => {
        if (e === id && !(mi === exceptMember && si === exceptSlot)) used++;
    }));
    return (ROGUE.bag[id] || 0) - used;
}
function rogueBagTotal() {
    let n = 0;
    Object.keys(ROGUE.bag).forEach(id => { n += ROGUE.bag[id]; });
    return n;
}
function rogueAddToBag(id) { ROGUE.bag[id] = (ROGUE.bag[id] || 0) + 1; }
// ---- v2.3 卖装备(仅商店节点可用): 普通 6 金 / 稀有 12 金 / 🔧升级装备 10 金 ----
// 升级装备按「升级后的价值」回收(与升级成本 10 金一致), 不按它升级前的基础档算 6 金
function rogueSellPrice(id) {
    const e = EQUIP_DEFS[id];
    if (e && e.upgraded) return ROGUE_SHOP.sellUpgraded;
    return equipTierOf(id) === 'rare' ? ROGUE_SHOP.sellRare : ROGUE_SHOP.sellBasic;
}
function rogueRemoveFromBag(id) {
    if (!ROGUE.bag[id]) return false;
    ROGUE.bag[id] -= 1;
    if (ROGUE.bag[id] <= 0) delete ROGUE.bag[id];
    return true;
}
// 只能卖「背包里闲置」的那一份: 已全部装备在队员身上的装备先卸下再卖
function rogueSellEquip(id) {
    const total = ROGUE.bag[id] || 0;
    const used = rogueEquippedCount(id);
    const name = EQUIP_DEFS[id] ? EQUIP_DEFS[id].name : id;
    if (total <= 0) { rogueToast(`背包里没有「${name}」`); return false; }
    if (used >= total) { rogueToast(`「${name}」已全部装备在队员身上，请先卸下再卖`); return false; }
    const price = rogueSellPrice(id);
    rogueRemoveFromBag(id);
    ROGUE.gold += price;
    rogueToast(`已卖出 ${name} → 金币 +${price}（共 ${ROGUE.gold} 金）`, true);
    return true;
}

// ---- 流程 ----
function rogueReset() {
    rogueStopTimer();
    ROGUE.node = 0; ROGUE.lives = ROGUE_MAX_LIVES; ROGUE.phase = ''; ROGUE.cleared = -1; ROGUE.gold = 0;
    ROGUE.team = []; ROGUE.bag = {}; ROGUE.enemies = []; ROGUE.shop = null;
    ROGUE.poolHeroes = []; ROGUE.poolEquips = []; ROGUE.pickHeroes = []; ROGUE.pickEquips = [];
    ROGUE.result = null;
    ROGUE.items = {}; ROGUE.potionUse = {}; ROGUE.settle = null;
    rogueMoveFrom = null;
    rogueWorld = null; rogueLogRef = null; rogueLogShown = 0;
}
// 进入当前节点(按类型切换阶段)
function rogueEnterNode() {
    const node = ROGUE_NODES[ROGUE.node];
    if (!node) { ROGUE.result = 'win'; ROGUE.phase = 'end'; return; }
    if (node.type === 'pick') {
        ROGUE.phase = 'heroSelect';
        ROGUE.poolHeroes = rogueSample(HERO_LIST, 5);
        ROGUE.poolEquips = rogueSample(equipListOfTier('normal'), 4);
        ROGUE.pickHeroes = []; ROGUE.pickEquips = [];
    } else if (node.type === 'shop') {
        ROGUE.phase = 'shop';
        ROGUE.shop = {
            basics: rogueSample(equipListOfTier('normal'), ROGUE_SHOP.basicCount)
                .map(id => ({ id, price: ROGUE_SHOP.basicPrice, sold: false })),
            rares: rogueSample(equipListOfTier('rare'), ROGUE_SHOP.rareCount)
                .map(id => ({ id, price: ROGUE_SHOP.rarePrice, sold: false }))
        };
    } else if (node.type === 'upgrade') {
        ROGUE.phase = 'upgrade';                             // ⑥ 装备升级点
    } else {
        ROGUE.enemies = rogueBuildEnemies(ROGUE.node);
        ROGUE.phase = 'prep';
        rogueMoveFrom = null;
    }
}
function rogueConfirmHeroSelect() {
    ROGUE.team = ROGUE.pickHeroes.map((id, i) => ({ heroId: id, equipIds: ['none', 'none', 'none'], cell: ROGUE_SLOT_CELLS[i] }));
    ROGUE.bag = {};
    ROGUE.pickEquips.forEach(id => rogueAddToBag(id));
    rogueAdvance();
}
// 推进到下一个节点
function rogueAdvance() {
    ROGUE.cleared = Math.max(ROGUE.cleared, ROGUE.node);
    ROGUE.node += 1;
    if (ROGUE.node >= ROGUE_NODES.length) { ROGUE.result = 'win'; ROGUE.phase = 'end'; return; }
    rogueEnterNode();
}
// 敌人配置: ② 2 名随机英雄(排除玩家已有, 1/2 号位)
//           ③ 3 名随机英雄(1/2/3 号位, 各带 1 个恢复水晶)
//           ⑤ 原队伍1(吸血)
//           ⑦ BOSS 大魔法师
function rogueBuildEnemies(nodeIdx) {
    const node = ROGUE_NODES[nodeIdx];
    if (node.type === 'boss') {
        // ⑦ BOSS: 大魔法师(1 号位)
        return [{ heroId: 'archmage', equipIds: ['none', 'none', 'none'], cell: ROGUE_SLOT_CELLS[0] }];
    }
    if (node.type === 'elite') {
        // ⑥ 精英战(与⑤装备升级点交换后): 原队伍1(吸血)
        return CHALLENGE_TEAMS[0].members.map(m => ({ heroId: m.heroId, equipIds: m.equipIds.slice(), cell: m.cell }));
    }
    const n = (nodeIdx === 1) ? 2 : 3;
    let pool = HERO_LIST.slice();
    if (nodeIdx === 1) pool = pool.filter(id => ROGUE.team.every(m => m.heroId !== id));
    const withCrystal = (nodeIdx === 2);      // ③ 每个敌人带 1 个恢复水晶
    return rogueSample(pool, n).map((heroId, i) => ({
        heroId,
        equipIds: withCrystal ? ['crystal', 'none', 'none'] : ['none', 'none', 'none'],
        cell: ROGUE_SLOT_CELLS[i]
    }));
}
// 开战: 每关重新构建世界 → 全队回满血(站位使用玩家在整备界面摆放的格子)
function rogueStartBattle() {
    rogueStopTimer();
    const a = ROGUE.team.map(m => ({ heroId: m.heroId, equipIds: m.equipIds.slice(), cell: m.cell, freeEquip: false }));
    const b = ROGUE.enemies.map(m => ({
        heroId: m.heroId, equipIds: m.equipIds.slice(),
        cell: (typeof m.cell === 'number' ? m.cell : ROGUE_SLOT_CELLS[0]), freeEquip: true
    }));
    rogueWorld = createWorld(a, b, { maxPerTeam: 9, mode: 'rogue' });
    rogueLogRef = null; rogueLogShown = 0;
    // v2.4 一次性物品: 整备界面勾选「本场使用」→ 开战自动生效并消耗 1 个
    const usedItems = [];
    ROGUE_SHOP.items.forEach(id => {
        if (!(ROGUE.potionUse && ROGUE.potionUse[id])) return;
        if ((ROGUE.items[id] || 0) <= 0) return;
        ROGUE.items[id] -= 1;
        if (ROGUE.items[id] <= 0) delete ROGUE.items[id];
        usedItems.push(id);
    });
    ROGUE.potionUse = {};
    if (usedItems.length) {
        rogueWorld.A.forEach(u => {
            if (usedItems.indexOf('shield_potion') >= 0) {
                u.shield = round1((u.shield || 0) + ROGUE_POTION.shield);
                u.potionShieldTimer = ROGUE_POTION.duration;
                u.potionShieldLeft = ROGUE_POTION.shield;
            }
            if (usedItems.indexOf('attack_potion') >= 0) {
                u.potionAtkBonus = round1(u.atk * ROGUE_POTION.atkPct);
                u.atk = round1(u.atk + u.potionAtkBonus);
                u.potionAtkTimer = ROGUE_POTION.duration;
            }
        });
        const names = usedItems.map(id => ROGUE_ITEMS[id].name).join('、');
        rogueWorld.addLog(`🧪 我方使用了一次性物品：${names}（开局生效，持续 ${ROGUE_POTION.duration} 秒）`, 'highlight');
    }
    ROGUE.phase = 'battle';
    renderRogue();
    rogueRunTimer();
}
function rogueRunTimer() { rogueStopTimer(); rogueTimer = setInterval(rogueStep, 50); }
function rogueStopTimer() { if (rogueTimer) { clearInterval(rogueTimer); rogueTimer = null; } }
function rogueStep() {
    if (!rogueWorld) { rogueStopTimer(); return; }
    for (let i = 0; i < rogueSpeed && !rogueWorld.winner; i++) tick(rogueWorld, CONFIG.auto.step, {});
    rogueRenderBattle();
    if (rogueWorld.winner || rogueWorld.battleTime >= CONFIG.sim.timeout) {
        const win = rogueWorld.winner === 'A';
        rogueStopTimer();
        rogueRenderBattle();
        rogueOnBattleEnd(win);
    }
}
// 立即结算(跳过动画)
function rogueFinishNow() {
    if (!rogueWorld) return;
    rogueStopTimer();
    let guard = 0;
    while (!rogueWorld.winner && rogueWorld.battleTime < CONFIG.sim.timeout && guard < 200000) {
        tick(rogueWorld, CONFIG.auto.step, {});
        guard++;
    }
    const win = rogueWorld.winner === 'A';
    rogueRenderBattle();
    rogueOnBattleEnd(win);
}
// v2.4: 战斗结束 → 先进入「结算界面」(胜/负 + 本场总伤害), 点「确定」后再进入下一节点
function rogueBattleDamage() {
    return rogueWorld ? round1(teamStats(rogueWorld, 'A').dmg) : 0;
}
function rogueOnBattleEnd(win) {
    ROGUE.settle = { win: !!win, dmg: rogueBattleDamage() };
    ROGUE.phase = 'settle';
    renderRogue();
}
function rogueSettleConfirm() {
    const win = !!(ROGUE.settle && ROGUE.settle.win);
    ROGUE.settle = null;
    if (win) {
        ROGUE.cleared = Math.max(ROGUE.cleared, ROGUE.node);
        ROGUE.gold += ROGUE_GOLD_PER_BATTLE;                 // 战斗节点胜利 +10 金币
        if (ROGUE.node >= ROGUE_NODES.length - 1) {
            ROGUE.result = 'win'; ROGUE.phase = 'end';
        } else if (ROGUE.node === 1) {
            ROGUE.phase = 'rewardEquip';                     // ② 基础装备 4 选 1
            ROGUE.poolEquips = rogueSample(equipListOfTier('normal'), 4);
            ROGUE.pickEquips = [];
        } else if (ROGUE.node === 2) {
            ROGUE.phase = 'rewardRare';                      // ③ 稀有装备 3 选 1 + 1 个恢复水晶
            ROGUE.poolEquips = rogueSample(equipListOfTier('rare'), 3);
            ROGUE.pickEquips = [];
        } else {
            rogueAdvance();
        }
    } else {
        ROGUE.lives -= 1;
        if (ROGUE.lives <= 0) { ROGUE.result = 'lose'; ROGUE.phase = 'end'; }
        else ROGUE.phase = 'defeat';
    }
    renderRogue();
}

// ---- 渲染 ----
function rogueBtn(label, onClick, cls) {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('click', onClick);
    return b;
}
function rogueToast(msg, ok) {
    const el = $('rogueToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'rogue-toast' + (ok ? ' ok' : '');
    if (rogueToastTimer) clearTimeout(rogueToastTimer);
    rogueToastTimer = setTimeout(() => { el.textContent = ''; }, 2200);
}
function renderRogueMap() {
    const el = $('rogueMap');
    if (!el) return;
    el.innerHTML = ROGUE_NODES.map((n, i) => {
        const cls = ROGUE.cleared >= i ? 'done' : (ROGUE.node === i ? 'current' : '');
        const mark = ROGUE.cleared >= i ? '✔ ' : '';
        return `<span class="rogue-node ${cls}" data-node="${i}">${mark}${n.icon} ${n.name}<span class="rn-sub">${n.desc}</span></span>`;
    }).join('<span class="rogue-link">▶</span>');
}
function renderRogue() {
    const livesEl = $('rogueLives'), goldEl = $('rogueGold');
    if (livesEl) {
        livesEl.textContent = '生命 ' + '♥'.repeat(Math.max(0, ROGUE.lives)) + '♡'.repeat(Math.max(0, ROGUE_MAX_LIVES - ROGUE.lives));
    }
    if (goldEl) goldEl.textContent = `💰 金币 ${ROGUE.gold}`;
    renderRogueMap();
    const body = $('rogueBody'), actions = $('rogueActions'), phaseEl = $('roguePhase');
    if (!body || !actions || !phaseEl) return;
    actions.innerHTML = '';
    switch (ROGUE.phase) {
        case 'entry': renderRogueEntry(phaseEl, body, actions); break;
        case 'heroSelect': renderRogueHeroSelect(phaseEl, body, actions); break;
        case 'prep': renderRoguePrep(phaseEl, body, actions); break;
        case 'battle': renderRogueBattleView(phaseEl, body, actions); break;
        case 'settle': renderRogueSettle(phaseEl, body, actions); break;
        case 'rewardEquip': renderRogueRewardEquip(phaseEl, body, actions); break;
        case 'rewardRare': renderRogueRewardRare(phaseEl, body, actions); break;
        case 'recruit': renderRogueRecruit(phaseEl, body, actions); break;
        case 'shop': renderRogueShop(phaseEl, body, actions); break;
        case 'upgrade': renderRogueUpgrade(phaseEl, body, actions); break;
        case 'defeat': renderRogueDefeat(phaseEl, body, actions); break;
        case 'end': renderRogueEnd(phaseEl, body, actions); break;
    }
}
// v2.4: 远征入口 · 测试关卡（全模式只有 1 个入口：点击后从节点① 开始，依次推进全部 7 个节点，不能跳关）
//       开局不赠送任何金币 / 药剂 / 装备：金币靠战斗胜利获得，药剂需在商店节点购买
function renderRogueEntry(phaseEl, body, actions) {
    phaseEl.textContent = '🧭 测试关卡 · 从节点① 依次推进 7 个节点';
    let html = `<div class="rogue-note" style="text-align:left">点击下方「进入测试关卡」后从节点① 开始，按 1 → 7 的顺序依次推进全部 7 个节点（不能跳关）。<br>开局没有任何金币与药剂：金币通过战斗胜利获得，药剂需在商店节点购买。</div>`;
    html += `<div class="rp-title" style="margin-top:10px">🗺️ 关卡路线（依次推进）</div><div class="rogue-route">`;
    ROGUE_NODES.forEach((n, i) => {
        html += `<div class="rr-node"><span class="rr-idx">${i + 1}</span><span class="rr-icon">${n.icon}</span>
            <span class="rr-body"><b>${n.name}</b><span class="rr-sub">${n.desc}</span></span></div>`;
    });
    html += `</div>`;
    body.innerHTML = html;
    actions.appendChild(rogueBtn('▶ 进入测试关卡（节点① 开始）', () => {
        rogueStopTimer();
        rogueReset();
        rogueEnterNode();
        renderRogue();
    }));
}
// v2.4: 战斗结算界面(胜/负 + 本场总伤害, 点「确定」后进入下一节点)
function renderRogueSettle(phaseEl, body, actions) {
    const s = ROGUE.settle || { win: false, dmg: 0 };
    const nd = ROGUE_NODES[ROGUE.node] || ROGUE_NODES[0];
    phaseEl.textContent = `${nd.icon} ${nd.name} · 战斗结算`;
    const alive = rogueWorld ? rogueWorld.A.filter(u => u.hp > 0).length : 0;
    body.innerHTML = `<div class="rogue-settle ${s.win ? 'win' : 'lose'}">
        <div class="rs-title">${s.win ? '🏆 战斗胜利！' : '💔 战斗失败'}</div>
        <div class="rs-dmg">本场总伤害 <b>${s.dmg}</b></div>
        <div class="rs-sub">${s.win
            ? `我方存活 ${alive} 人　获得金币 +${ROGUE_GOLD_PER_BATTLE} 🪙`
            : `生命 -1（剩余 ${Math.max(0, ROGUE.lives - 1)} ♥）`}</div>
    </div>`;
    actions.appendChild(rogueBtn('确定', () => rogueSettleConfirm()));
}
// ① 出征选人: 随机 5 选 2 英雄 + 随机 5 选 1 普通装备
function renderRogueHeroSelect(phaseEl, body, actions) {
    phaseEl.textContent = '节点① 出征 · 随机 5 选 2 名英雄 + 4 选 1 件基础装备';
    let html = `<div class="rogue-note">已选英雄 ${ROGUE.pickHeroes.length}/2　已选装备 ${ROGUE.pickEquips.length}/1</div><div class="rogue-pick">`;
    html += ROGUE.poolHeroes.map(id => {
        const h = HERO_DEFS[id];
        const on = ROGUE.pickHeroes.indexOf(id) >= 0;
        return `<div class="rp-card${on ? ' selected' : ''}" data-kind="hero" data-id="${id}">
            <div class="rp-emoji">${h.emoji}</div><div class="rp-name">${h.name}</div>
            <div class="rp-sub">HR ${h.maxHp}　攻 ${h.atk}　速 ${h.speed.toFixed(2)}</div></div>`;
    }).join('') + '</div>';
    html += `<div class="rogue-note" style="margin-top:10px">基础装备（4 选 1，进入背包后可自由分配）</div><div class="rogue-pick">`;
    html += ROGUE.poolEquips.map(id => {
        const e = EQUIP_DEFS[id];
        const on = ROGUE.pickEquips.indexOf(id) >= 0;
        return `<div class="rp-card${on ? ' selected' : ''}" data-kind="equip" data-id="${id}">
            <div class="rp-emoji">${e.icon}</div><div class="rp-name">${e.name}</div>
            <div class="rp-sub">${e.statsText[0] || ''}</div></div>`;
    }).join('') + '</div>';
    body.innerHTML = html;
    body.querySelectorAll('.rp-card').forEach(card => {
        card.addEventListener('click', () => {
            const kind = card.dataset.kind, id = card.dataset.id;
            const pick = kind === 'hero' ? ROGUE.pickHeroes : ROGUE.pickEquips;
            const limit = kind === 'hero' ? 2 : 1;
            const i = pick.indexOf(id);
            if (i >= 0) pick.splice(i, 1);
            else if (pick.length < limit) pick.push(id);
            else { rogueToast(kind === 'hero' ? '最多选择 2 名英雄' : '最多选择 1 件装备'); return; }
            renderRogue();
        });
    });
    const ok = ROGUE.pickHeroes.length === 2 && ROGUE.pickEquips.length === 1;
    const btn = rogueBtn('确认出征', () => {
        if (ROGUE.pickHeroes.length !== 2 || ROGUE.pickEquips.length !== 1) {
            rogueToast('请选择 2 名英雄和 1 件普通装备'); return;
        }
        rogueConfirmHeroSelect(); renderRogue();
    });
    btn.disabled = !ok;
    actions.appendChild(btn);
}
// ② 整备: 队员装备下拉 + 背包栏
function rogueOptionHtml(current, mi, slot, heroId) {
    const hero = HERO_DEFS[heroId] || {};
    let html = `<option value="none"${current === 'none' ? ' selected' : ''}>⬜ 无</option>`;
    Object.keys(ROGUE.bag).forEach(id => {
        const e = EQUIP_DEFS[id];
        if (!e) return;
        // 专业法杖 / 灵能大法杖 限蓝条英雄(引擎会自动置空, 这里直接禁用避免浪费)
        const blocked = (id === 'staff' || id === 'staff_up') && !hero.hasMana;
        const remain = rogueBagRemain(id, mi, slot);
        const disabled = blocked || (id !== current && remain <= 0);
        const tail = blocked ? '（限蓝条英雄）' : (e.cost > 1 ? `（${e.cost}点）` : (e.cost === 0 ? '（0点）' : ''));
        html += `<option value="${id}"${id === current ? ' selected' : ''}${disabled ? ' disabled' : ''}>${e.icon} ${e.name}${remain > 0 ? ' ×' + remain : '（已用完）'}${tail}</option>`;
    });
    return html;
}
// sellMode=true 时每个条目右侧带「💰 卖出」按钮(仅商店节点)
function rogueBagHtml(sellMode) {
    const ids = Object.keys(ROGUE.bag);
    if (!ids.length) {
        return `<div class="rogue-bag"><div class="rb-title">🎒 背包（0 件）</div>
            <div class="rb-empty">（空）${sellMode ? '没有可以卖的装备' : '击败敌人获得的装备会放入背包'}</div></div>`;
    }
    const items = ids.map(id => {
        const e = EQUIP_DEFS[id];
        const total = ROGUE.bag[id], used = rogueEquippedCount(id);
        const mark = e.upgraded ? ' 🔧' : (equipTierOf(id) === 'rare' ? ' ⭐' : '');
        const sell = sellMode
            ? `<button class="rb-sell" data-sell="${id}"${total - used > 0 ? '' : ' disabled'} title="卖出一件（剩 ${total - used} 件可卖）">💰 ${rogueSellPrice(id)}</button>`
            : '';
        return `<span class="rb-item${used >= total ? ' used-up' : ''}${e.upgraded ? ' upgraded' : ''}">${e.icon} ${e.name} ${used}/${total}${mark}${sell}</span>`;
    }).join('');
    const title = sellMode
        ? `🎒 背包（共 ${rogueBagTotal()} 件）· 卖装备：普通 ${ROGUE_SHOP.sellBasic} 金 / 稀有 ${ROGUE_SHOP.sellRare} 金 / 🔧升级 ${ROGUE_SHOP.sellUpgraded} 金`
        : `🎒 背包（共 ${rogueBagTotal()} 件）`;
    return `<div class="rogue-bag"><div class="rb-title">${title}</div><div class="rb-list">${items}</div></div>`;
}
// 队员按号位排序(1号位 → 6号位)
function rogueTeamOrder() {
    return ROGUE.team.slice().sort((a, b) => ROGUE_SLOT_CELLS.indexOf(a.cell) - ROGUE_SLOT_CELLS.indexOf(b.cell));
}
// v2.4: 单位实时数值预览(英雄 + 装备), 用于整备界面的基础信息显示
function rogueUnitPreview(heroId, equipIds, cell, teamKey, freeEquip) {
    const h = HERO_DEFS[heroId];
    const u = makeUnit(heroId, equipIds, teamKey, cell, null, !!freeEquip);
    return {
        emoji: h.emoji, name: h.name, hasMana: h.hasMana,
        maxHp: round1(u.maxHp), atk: round1(u.atk),
        speed: (u.speed * (u.speedMul || 1)).toFixed(2),
        armor: round1(u.armor), mr: round1(u.mr), maxMana: u.maxMana,
        eq: (equipIds || []).filter(id => id !== 'none').map(id => (EQUIP_DEFS[id] ? EQUIP_DEFS[id].icon : '')).join('')
    };
}
function rogueMemberStats(m) { return rogueUnitPreview(m.heroId, m.equipIds, m.cell, 'A', false); }
function rogueFoeStats(m) { return rogueUnitPreview(m.heroId, m.equipIds, m.cell, 'B', true); }
function rogueFoeStatLine(s) {
    return `<span class="rp-stat">❤️ ${s.maxHp}　⚔️ ${s.atk}　⚡ ${s.speed}　🛡️ ${s.armor}　🔮 ${s.mr}</span>`;
}
function rogueEnemyAtCell(cell) {
    return (ROGUE.enemies || []).filter(e => e.cell === cell)[0] || null;
}
// 对位规则: 同列优先, 同列时前排优先; 否则取列距离最近的敌人
function rogueOppositeEnemy(cell) {
    let best = null, bestDist = 99, bestRow = 99;
    (ROGUE.enemies || []).forEach(e => {
        const d = Math.abs(cellCol(e.cell) - cellCol(cell));
        const r = cellRow(e.cell);              // 0 = 前排
        if (d < bestDist || (d === bestDist && r < bestRow)) { best = e; bestDist = d; bestRow = r; }
    });
    return best;
}
// 图1 上方: 敌方阵型站位(3 列 × 2 行) + 敌方全部信息
function rogueEnemyGridHtml() {
    if (!(ROGUE.enemies || []).length) return '';
    let html = `<div class="rp-title" style="margin-top:10px">👹 敌方阵型站位（3 列 × 2 行）</div><div class="rogue-grid enemy-grid">`;
    for (let cell = 0; cell < CONFIG.teams.cells; cell++) {
        const slot = ROGUE_SLOT_CELLS.indexOf(cell) + 1;
        const m = rogueEnemyAtCell(cell);
        if (m) {
            const s = rogueFoeStats(m);
            html += `<div class="rg-cell filled enemy" data-foe="${cell}">
                <div class="rg-pos">${cellName(cell)} · ${slot}号位</div>
                <div class="rg-name">${s.emoji} ${s.name}</div>
                <div class="rg-eq">${s.eq || '—'}</div>
                <div class="rg-stat">❤️ ${s.maxHp}　⚔️ ${s.atk}　⚡ ${s.speed}</div>
                <div class="rg-stat">🛡️ ${s.armor}　🔮 ${s.mr}</div></div>`;
        } else {
            html += `<div class="rg-cell enemy">
                <div class="rg-pos">${cellName(cell)} · ${slot}号位</div>
                <div class="rg-empty">空</div></div>`;
        }
    }
    return html + `</div>`;
}
// 图1 下方: 我方每个号位的对位详情(我方单位 → 对位敌方及其全部信息)
function roguePairListHtml() {
    const order = rogueTeamOrder();
    if (!order.length) return '';
    let html = `<div class="rp-title" style="margin-top:10px">🎯 我方对位详情（我方 → 敌方）</div><div class="rogue-pairs">`;
    order.forEach(m => {
        const us = rogueMemberStats(m);
        const slot = ROGUE_SLOT_CELLS.indexOf(m.cell) + 1;
        const foe = rogueOppositeEnemy(m.cell);
        let foeHtml = `<span class="rp-foe none">（无敌对位）</span>`;
        if (foe) {
            const f = rogueFoeStats(foe);
            const fslot = ROGUE_SLOT_CELLS.indexOf(foe.cell) + 1;
            foeHtml = `<span class="rp-foe">${f.emoji} ${f.name}（${fslot}号位 · ${cellName(foe.cell)}）${rogueFoeStatLine(f)}
                <span class="rp-foe-eq">${f.eq ? '装备：' + f.eq : '无装备'}</span></span>`;
        }
        html += `<div class="rp-pair">
            <span class="rp-us">${us.emoji} ${us.name}　${slot}号位 · ${cellName(m.cell)}${rogueFoeStatLine(us)}</span>
            <span class="rp-arrow">➜ 对位</span>${foeHtml}</div>`;
    });
    return html + `</div>`;
}
// 整备界面: 敌方站位 + 我方对位详情(图1)
function rogueEnemyPreviewHtml() {
    return rogueEnemyGridHtml() + roguePairListHtml();
}
// v2.4: 一次性物品面板(整备界面勾选 → 开战自动生效并消耗)
function rogueItemsPanelHtml() {
    const owned = ROGUE_SHOP.items.filter(id => (ROGUE.items[id] || 0) > 0);
    let html = `<div class="rogue-items"><div class="ri-title">🧪 一次性物品（勾选后开战自动生效并消耗 1 个）</div>`;
    if (!owned.length) {
        html += `<div class="rb-empty">暂无。可在 🏪 商店（节点④）用 ${ROGUE_SHOP.itemPrice} 金购买守护 / 攻击药剂</div>`;
    } else {
        owned.forEach(id => {
            const it = ROGUE_ITEMS[id];
            const on = !!(ROGUE.potionUse && ROGUE.potionUse[id]);
            html += `<label class="ri-item${on ? ' on' : ''}">
                <input type="checkbox" data-item="${id}"${on ? ' checked' : ''}>
                <span class="ri-icon">${it.icon}</span>
                <span class="ri-body"><b>${it.name}</b><span class="ri-own">持有 ${ROGUE.items[id]}</span>
                <span class="ri-desc">${it.desc}</span></span></label>`;
        });
    }
    return html + `</div>`;
}
// 站位: 点击选中 → 点击目标格移动/交换(拖拽同样有效)
function rogueCellClick(cell) {
    const mover = ROGUE.team.filter(x => x.cell === rogueMoveFrom)[0];
    if (mover && rogueMoveFrom !== cell) { rogueMoveUnit(rogueMoveFrom, cell); return; }
    const here = ROGUE.team.filter(x => x.cell === cell)[0];
    rogueMoveFrom = (here && rogueMoveFrom !== cell) ? cell : null;
    renderRogue();
}
function rogueMoveUnit(fromCell, toCell) {
    if (fromCell === null || fromCell === undefined || fromCell === toCell) {
        rogueMoveFrom = null; renderRogue(); return;
    }
    const a = ROGUE.team.filter(x => x.cell === fromCell)[0];
    const b = ROGUE.team.filter(x => x.cell === toCell)[0];
    if (!a) { rogueMoveFrom = null; renderRogue(); return; }
    if (b) { a.cell = toCell; b.cell = fromCell; } else { a.cell = toCell; }
    rogueMoveFrom = null;
    renderRogue();
}
// 战斗前整备: 站位(3列×2行) + 背包装备分配 + 敌方预览 + 开战
function renderRoguePrep(phaseEl, body, actions) {
    const node = ROGUE_NODES[ROGUE.node];
    phaseEl.textContent = `${node.icon} ${node.name} · 整备（调整站位与装备后开战）`;
    let html = `<div class="rogue-prep"><div class="rogue-prep-left">
        <div class="rp-title">我方阵型站位（3 列 × 2 行）</div>
        <div class="rogue-note" style="text-align:left">点击队员卡片选中，再点目标格可移动/交换；也支持拖拽</div>
        <div class="rogue-grid">`;
    for (let cell = 0; cell < CONFIG.teams.cells; cell++) {
        const slot = ROGUE_SLOT_CELLS.indexOf(cell) + 1;
        const m = ROGUE.team.filter(x => x.cell === cell)[0];
        const selCls = (rogueMoveFrom === cell) ? ' selected' : '';
        if (m) {
            const h = HERO_DEFS[m.heroId];
            const eq = m.equipIds.filter(id => id !== 'none').map(id => (EQUIP_DEFS[id] ? EQUIP_DEFS[id].icon : '')).join('');
            html += `<div class="rg-cell filled${selCls}" data-cell="${cell}" draggable="true">
                <div class="rg-pos">${cellName(cell)} · ${slot}号位</div>
                <div class="rg-name">${h.emoji} ${h.name}</div>
                <div class="rg-eq">${eq || '—'}</div></div>`;
        } else {
            html += `<div class="rg-cell${selCls}" data-cell="${cell}">
                <div class="rg-pos">${cellName(cell)} · ${slot}号位</div>
                <div class="rg-empty">＋</div></div>`;
        }
    }
    html += `</div>${rogueEnemyPreviewHtml()}</div>`;
    html += `<div class="rogue-prep-right">
        <div class="rp-title">装备分配（每名队员最多 ${CONFIG.equip.points} 装备点：普通1 / 特殊0 / 稀有2）</div>
        <div class="rogue-team">`;
    rogueTeamOrder().forEach(m => {
        const i = ROGUE.team.indexOf(m);
        const h = HERO_DEFS[m.heroId];
        const st = rogueMemberStats(m);
        const slot = ROGUE_SLOT_CELLS.indexOf(m.cell) + 1;
        let selects = '';
        for (let s = 0; s < CONFIG.equip.slots; s++) {
            selects += `<select data-mi="${i}" data-slot="${s}">${rogueOptionHtml(m.equipIds[s], i, s, m.heroId)}</select>`;
        }
        const eqLines = m.equipIds.filter(id => id !== 'none').map(id => {
            const e = EQUIP_DEFS[id];
            if (!e) return '';
            return `<div class="rt-eq-line">${e.icon} <b>${e.name}</b>：${(e.statsText || []).slice(0, 2).join('；')}</div>`;
        }).join('');
        html += `<div class="rt-member">
            <div class="rt-head"><span class="rt-name">${h.emoji} ${h.name}</span><span class="rt-slot">${slot}号位</span></div>
            <div class="rt-stats">
                <span>❤️ 生命 ${st.maxHp}</span><span>⚔️ 攻击 ${st.atk}</span><span>⚡ 攻速 ${st.speed}</span>
                <span>🛡️ 护甲 ${st.armor}</span><span>🔮 魔抗 ${st.mr}</span>${st.hasMana ? `<span>💧 蓝量 ${st.maxMana}</span>` : ''}
            </div>
            <div class="rt-equips">${selects}</div>
            <div class="ru-txt" style="text-align:center">装备点 ${equipPointsUsed(m.equipIds)} / ${CONFIG.equip.points}</div>
            ${eqLines ? `<div class="rt-eq-lines">${eqLines}</div>` : ''}
        </div>`;
    });
    html += `</div>${rogueItemsPanelHtml()}${rogueBagHtml()}</div></div>`;
    body.innerHTML = html;

    body.querySelectorAll('.rg-cell[data-cell]').forEach(cellEl => {
        const cell = parseInt(cellEl.dataset.cell, 10);
        cellEl.addEventListener('click', () => rogueCellClick(cell));
        cellEl.addEventListener('dragstart', (e) => {
            rogueMoveFrom = cell;
            try { e.dataTransfer.setData('text/plain', String(cell)); } catch (err) { /* 兼容 */ }
            cellEl.classList.add('dragging');
        });
        cellEl.addEventListener('dragover', (e) => { e.preventDefault(); cellEl.classList.add('drop-target'); });
        cellEl.addEventListener('dragleave', () => cellEl.classList.remove('drop-target'));
        cellEl.addEventListener('drop', (e) => {
            e.preventDefault();
            cellEl.classList.remove('drop-target');
            rogueMoveUnit(rogueMoveFrom, cell);
        });
    });
    body.querySelectorAll('.rt-member select').forEach(sel => {
        sel.addEventListener('change', () => {
            const mi = parseInt(sel.dataset.mi, 10), slot = parseInt(sel.dataset.slot, 10);
            const val = sel.value, m = ROGUE.team[mi];
            const newEqs = m.equipIds.slice();
            newEqs[slot] = val;
            if (equipPointsUsed(newEqs) > CONFIG.equip.points) {
                rogueToast(`装备点不足：每名队员最多 ${CONFIG.equip.points} 点`); renderRogue(); return;
            }
            // v2.7 规则: 每人只能携带 1 件升级装备
            if (equipUpgradeCount(newEqs) > 1) {
                rogueToast('每人只能携带 1 件升级装备'); renderRogue(); return;
            }
            if (val !== 'none' && rogueBagRemain(val, mi, slot) <= 0) {
                rogueToast('背包中没有多余的该装备'); renderRogue(); return;
            }
            m.equipIds = newEqs;
            renderRogue();
        });
    });
    // v2.4: 整备界面勾选「本场使用」的一次性物品(开战自动生效并消耗)
    body.querySelectorAll('.ri-item input[data-item]').forEach(cb => {
        cb.addEventListener('change', () => {
            const id = cb.dataset.item;
            if (cb.checked) ROGUE.potionUse[id] = true; else delete ROGUE.potionUse[id];
            renderRogue();
        });
    });
    actions.appendChild(rogueBtn('▶ 开始战斗', () => rogueStartBattle()));
}
// ③ 战斗: 弹窗内独立小战场(敌我双方均为 3列×2行 = 前后排 6 站位, 与普通战斗一致)
function rogueUnitHtml(u) {
    const p = clamp((u.hp / u.maxHp) * 100, 0, 100);
    const colorCls = p < 25 ? ' critical' : p < 50 ? ' low' : '';
    const eq = u.equipIds.filter(id => id !== 'none').map(id => (EQUIP_DEFS[id] ? EQUIP_DEFS[id].icon : '')).join('');
    const slot = ROGUE_SLOT_CELLS.indexOf(u.cell) + 1;
    return `<div class="rogue-unit${u.hp <= 0 ? ' dead' : ''}">
        <div class="ru-head">${u.emoji} ${u.name}<span class="ru-pos">${slot}号位</span></div>
        <div class="ru-bar"><div class="ru-hp${colorCls}" style="width:${p}%"></div></div>
        <div class="ru-txt">HR ${round1(u.hp)}/${round1(u.maxHp)}　攻 ${round1(u.atk)}</div>
        <div class="ru-txt">AR ${round1(u.armor)}　MR ${round1(u.mr)}　速 ${(u.speed * (u.speedMul || 1)).toFixed(2)}</div>
        <div class="ru-eq">装备 ${eq || '—'}</div>
        <div class="ru-status">${buildStatusHtml(u)}</div>
    </div>`;
}
// 单侧战场(上下布局): A 队在下 / B 队在上, 双方「前排」都贴近中间那条线(面对面)
//  isBottomSide=true → 该侧在下方(A 队), 行序 前排→后排; false → 在上方(B 队), 行序 后排→前排
//  列序不镜像: 纵向对位时 1 列应正对 1 列
function rogueFieldHtml(units, isBottomSide) {
    const rows = isBottomSide ? [0, 1] : [1, 0];
    let html = '';
    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        html += `<div class="rf-row"><div class="rf-tag">${ROW_NAMES[row]}</div><div class="rf-cells">`;
        for (let col = 0; col < CONFIG.teams.cols; col++) {
            const cell = row * CONFIG.teams.cols + col;
            const u = units.filter(x => x.cell === cell)[0];
            html += u ? rogueUnitHtml(u)
                : `<div class="rogue-unit empty"><div class="ru-head">空位</div><div class="ru-txt">${cellName(cell)}</div></div>`;
        }
        html += `</div></div>`;
    }
    return html;
}
function rogueRenderBattle() {
    const aEl = $('rogueSideA'), bEl = $('rogueSideB');
    if (!aEl || !bEl || !rogueWorld) return;
    aEl.innerHTML = rogueFieldHtml(rogueWorld.A, true);
    bEl.innerHTML = rogueFieldHtml(rogueWorld.B, false);
    // 幸运精钢剑暴击可得金币 → 战斗中同步顶栏金币
    const goldEl = $('rogueGold');
    if (goldEl) goldEl.textContent = `💰 金币 ${ROGUE.gold}`;
    rogueRenderLog();
}
// 幸运精钢剑: 暴击 +1 金币(由引擎机制回调)
function rogueGainGold(n, name) {
    ROGUE.gold += n;
    const goldEl = $('rogueGold');
    if (goldEl) goldEl.textContent = `💰 金币 ${ROGUE.gold}`;
    if (rogueWorld) rogueWorld.addLog(`🍀 ${name || '幸运精钢剑'} 暴击 → 金币 +${n}（共 ${ROGUE.gold}）`, 'highlight');
}
if (typeof window !== 'undefined') window.rogueGainGold = rogueGainGold;
function rogueRenderLog() {
    const el = $('rogueLog');
    if (!el || !rogueWorld) return;
    const lines = rogueWorld.logLines;
    if (lines !== rogueLogRef) { el.innerHTML = ''; rogueLogRef = lines; rogueLogShown = 0; }
    while (el.children.length > lines.length) el.removeChild(el.firstChild);
    for (let i = rogueLogShown; i < lines.length; i++) {
        const d = document.createElement('div');
        if (lines[i].cls) d.className = lines[i].cls;
        d.innerHTML = lines[i].msg;
        el.appendChild(d);
    }
    rogueLogShown = lines.length;
    el.scrollTop = el.scrollHeight;
}
function renderRogueBattleView(phaseEl, body, actions) {
    const nd = ROGUE_NODES[ROGUE.node] || ROGUE_NODES[0];
    const bCount = rogueWorld ? rogueWorld.B.length : (ROGUE.enemies || []).length;
    phaseEl.textContent = `${nd.icon} ${nd.name} · 我方 ${ROGUE.team.length} 人  vs  敌方 ${bCount} 人`;
    body.innerHTML = `<div class="rogue-arena">
            <div class="rogue-fields">
                <div class="rof-block">
                    <div class="rof-head"><span>👹 敌方（B 队）· ${bCount} 人</span><span class="rof-sub">前排朝下 · 与下方对位</span></div>
                    <div class="rogue-side" id="rogueSideB"></div>
                </div>
                <div class="rof-mid">⚔️ 前后排 6 站位 · 谁先倒下 ⚔️</div>
                <div class="rof-block">
                    <div class="rof-head"><span>🛡️ 我方（A 队）· ${ROGUE.team.length} 人</span><span class="rof-sub">前排朝上 · 与上方对位</span></div>
                    <div class="rogue-side" id="rogueSideA"></div>
                </div>
            </div>
            <div class="rogue-log" id="rogueLog"></div>
        </div>`;
    rogueRenderBattle();
    if (rogueTimer) {
        actions.appendChild(rogueBtn('⏸ 暂停', () => { rogueStopTimer(); renderRogue(); }));
    } else {
        const started = rogueWorld && rogueWorld.battleTime > 0;
        actions.appendChild(rogueBtn(started ? '▶ 继续战斗' : '▶ 开始战斗', () => rogueRunTimer()));
    }
    actions.appendChild(rogueBtn('⏩ 立即结算', () => rogueFinishNow()));
    // v2.2: 战斗中也能直接调整站位与装备(暂停回整备, 不消耗生命)
    actions.appendChild(rogueBtn('⚙ 调整装备/站位', () => {
        rogueStopTimer();
        ROGUE.phase = 'prep';
        rogueToast('已暂停战斗：调整站位与装备后重新开战');
        renderRogue();
    }));
    [1, 2, 4].forEach(sp => {
        actions.appendChild(rogueBtn(sp + 'x', () => { rogueSpeed = sp; renderRogue(); }, rogueSpeed === sp ? 'active' : ''));
    });
}
function rogueTeamNames() {
    return rogueTeamOrder().map(m => HERO_DEFS[m.heroId].emoji + HERO_DEFS[m.heroId].name).join('、');
}
// 下一个空闲号位对应的站位格
function rogueFreeCell() {
    for (let i = 0; i < ROGUE_SLOT_CELLS.length; i++) {
        const c = ROGUE_SLOT_CELLS[i];
        if (!ROGUE.team.some(m => m.cell === c)) return c;
    }
    return null;
}
// 候选装备卡片(奖励 / 商店共用)
function rogueEquipCardHtml(id, extraCls, extraAttrs, tail) {
    const e = EQUIP_DEFS[id];
    return `<div class="rp-card${extraCls || ''}" ${extraAttrs || ''}>
        <div class="rp-emoji">${e.icon}</div><div class="rp-name">${e.name}</div>
        <div class="rp-sub">${e.statsText[0] || ''}</div>
        ${tail ? `<div class="rp-price">${tail}</div>` : ''}</div>`;
}
// ④ 战斗②奖励: 基础装备 4 选 1 → 英雄 2 选 1
function renderRogueRewardEquip(phaseEl, body, actions) {
    phaseEl.textContent = '⚔️ 战斗胜利！+10 金币 · 选择 1 件基础装备（4 选 1）';
    let html = `<div class="rogue-note">金币 💰 ${ROGUE.gold}　当前队伍：${rogueTeamNames()}</div><div class="rogue-pick">`;
    html += ROGUE.poolEquips.map(id => rogueEquipCardHtml(id,
        ROGUE.pickEquips.indexOf(id) >= 0 ? ' selected' : '', 'data-kind="equip" data-id="' + id + '"')).join('');
    html += `</div>${rogueBagHtml()}`;
    body.innerHTML = html;
    body.querySelectorAll('.rp-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id, i = ROGUE.pickEquips.indexOf(id);
            if (i >= 0) ROGUE.pickEquips.splice(i, 1);
            else if (ROGUE.pickEquips.length < 1) ROGUE.pickEquips.push(id);
            else { rogueToast('只能选择 1 件装备'); return; }
            renderRogue();
        });
    });
    const btn = rogueBtn('确定', () => {
        if (ROGUE.pickEquips.length !== 1) { rogueToast('请选择 1 件基础装备'); return; }
        rogueAddToBag(ROGUE.pickEquips[0]);
        ROGUE.pickEquips = [];
        const pool = HERO_LIST.filter(id => ROGUE.team.every(m => m.heroId !== id));
        ROGUE.poolHeroes = rogueSample(pool, 2);
        ROGUE.pickHeroes = [];
        ROGUE.phase = 'recruit';
        renderRogue();
    });
    btn.disabled = ROGUE.pickEquips.length !== 1;
    actions.appendChild(btn);
}
// ⑤ 招募: 英雄 2 选 1(凑满 3 人)
function renderRogueRecruit(phaseEl, body, actions) {
    phaseEl.textContent = '选择 1 名英雄加入队伍（2 选 1，凑满 3 人）';
    let html = `<div class="rogue-note">当前队伍：${rogueTeamNames()}</div><div class="rogue-pick">`;
    html += ROGUE.poolHeroes.map(id => {
        const h = HERO_DEFS[id];
        const on = ROGUE.pickHeroes.indexOf(id) >= 0;
        return `<div class="rp-card${on ? ' selected' : ''}" data-kind="hero" data-id="${id}">
            <div class="rp-emoji">${h.emoji}</div><div class="rp-name">${h.name}</div>
            <div class="rp-sub">HR ${h.maxHp}　攻 ${h.atk}　速 ${h.speed.toFixed(2)}</div></div>`;
    }).join('') + '</div>';
    body.innerHTML = html;
    body.querySelectorAll('.rp-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id, i = ROGUE.pickHeroes.indexOf(id);
            if (i >= 0) ROGUE.pickHeroes.splice(i, 1);
            else if (ROGUE.pickHeroes.length < 1) ROGUE.pickHeroes.push(id);
            else { rogueToast('只能选择 1 名英雄'); return; }
            renderRogue();
        });
    });
    const btn = rogueBtn('确定加入', () => {
        if (ROGUE.pickHeroes.length !== 1) { rogueToast('请选择 1 名英雄加入'); return; }
        const cell = rogueFreeCell();
        if (cell === null) { rogueToast('没有空余站位'); return; }
        ROGUE.team.push({ heroId: ROGUE.pickHeroes[0], equipIds: ['none', 'none', 'none'], cell });
        ROGUE.pickHeroes = [];
        rogueAdvance();
        renderRogue();
    });
    btn.disabled = ROGUE.pickHeroes.length !== 1;
    actions.appendChild(btn);
}
// ③ 战斗胜利奖励: 稀有装备 3 选 1（v2.4: 已移除赠送的恢复水晶）
function renderRogueRewardRare(phaseEl, body, actions) {
    phaseEl.textContent = '⚔️ 战斗胜利！+10 金币 · 选择 1 件稀有装备（3 选 1）';
    let html = `<div class="rogue-note">金币 💰 ${ROGUE.gold}　（此节点不再赠送恢复水晶）</div><div class="rogue-pick">`;
    html += ROGUE.poolEquips.map(id => rogueEquipCardHtml(id,
        ROGUE.pickEquips.indexOf(id) >= 0 ? ' selected' : '', 'data-kind="equip" data-id="' + id + '"')).join('');
    html += `</div>${rogueBagHtml()}`;
    body.innerHTML = html;
    body.querySelectorAll('.rp-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id, i = ROGUE.pickEquips.indexOf(id);
            if (i >= 0) ROGUE.pickEquips.splice(i, 1);
            else if (ROGUE.pickEquips.length < 1) ROGUE.pickEquips.push(id);
            else { rogueToast('只能选择 1 件装备'); return; }
            renderRogue();
        });
    });
    const btn = rogueBtn('确定', () => {
        if (ROGUE.pickEquips.length !== 1) { rogueToast('请选择 1 件稀有装备'); return; }
        rogueAddToBag(ROGUE.pickEquips[0]);
        ROGUE.pickEquips = [];
        rogueAdvance();
        renderRogue();
    });
    btn.disabled = ROGUE.pickEquips.length !== 1;
    actions.appendChild(btn);
}
// ⑥ 装备升级点(v2.2): 每次 10 金, 把 1 件基础装备升级为对应升级装备(仅限 5 件)
function rogueUpgradeList() {
    const out = [];
    Object.keys(ROGUE.bag).forEach(id => {
        const to = equipUpgradeTarget(id);
        if (!to) return;
        const total = ROGUE.bag[id] || 0;
        const used = rogueEquippedCount(id);
        out.push({ id, to, total, used, free: total - used });
    });
    return out;
}
// 升级一件: 优先升级背包中闲置的一件; 若全部已装备, 则把队员身上的直接升级
function rogueUpgradeOne(id) {
    const to = equipUpgradeTarget(id);
    if (!to || (ROGUE.bag[id] || 0) <= 0) return false;
    const takeFromBag = (ROGUE.bag[id] || 0) - rogueEquippedCount(id) > 0;
    if (!takeFromBag) {
        let done = false;
        for (let mi = 0; mi < ROGUE.team.length && !done; mi++) {
            const m = ROGUE.team[mi];
            const si = m.equipIds.indexOf(id);
            if (si < 0) continue;
            // v2.7 规则: 每人只能携带 1 件升级装备 → 该队员已带其它升级装备时不能就地升级
            const hasOtherUpgrade = m.equipIds.some((eq, j) => j !== si && EQUIP_UPGRADED_LIST.indexOf(eq) >= 0);
            if (hasOtherUpgrade) continue;
            const eqs = m.equipIds.slice();
            eqs[si] = to;
            m.equipIds = eqs;
            done = true;
        }
        if (!done) return false;
    }
    ROGUE.bag[id] -= 1;
    if (ROGUE.bag[id] <= 0) delete ROGUE.bag[id];
    rogueAddToBag(to);
    return true;
}
function renderRogueUpgrade(phaseEl, body, actions) {
    phaseEl.textContent = `🔧 装备升级点 · 每次升级消耗 ${EQUIP_UPGRADE_COST} 金币（仅限 5 件指定基础装备）`;
    const list = rogueUpgradeList();
    let html = `<div class="rogue-note">金币 💰 ${ROGUE.gold}　此节点没有战斗，可直接通过　（下一站：🔥 精英战·原队伍1）</div>`;
    if (!list.length) {
        html += `<div class="rb-empty">背包里没有可升级的装备（流星锤 / 急速弓 / 精钢剑 / 专业法杖）</div>`;
    } else {
        html += `<div class="rogue-pick">`;
        list.forEach(it => {
            const e = EQUIP_DEFS[it.id], u = EQUIP_DEFS[it.to];
            const can = ROGUE.gold >= EQUIP_UPGRADE_COST;
            html += `<div class="rp-card up-card${can ? '' : ' sold'}" data-up="${it.id}">
                <div class="rp-emoji">${e.icon} → ${u.icon}</div>
                <div class="rp-name">${e.name} → ${u.name}</div>
                <div class="rp-sub">${u.statsText.slice(0, 2).join('　')}</div>
                <div class="rp-sub" style="opacity:.85">持有 ${it.total} 件（已装备 ${it.used} / 闲置 ${it.free}）</div>
                <div class="rp-price">${can ? '🔧 升级 ' + EQUIP_UPGRADE_COST + ' 金' : '金币不足'}</div></div>`;
        });
        html += `</div>`;
    }
    html += rogueBagHtml();
    body.innerHTML = html;
    body.querySelectorAll('.rp-card[data-up]').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.up;
            if (ROGUE.gold < EQUIP_UPGRADE_COST) { rogueToast(`金币不足（需要 ${EQUIP_UPGRADE_COST} 金）`); return; }
            if (!rogueUpgradeOne(id)) { rogueToast('没有可升级的该装备'); return; }
            ROGUE.gold -= EQUIP_UPGRADE_COST;
            rogueToast(`${EQUIP_DEFS[id].name} → ${EQUIP_DEFS[equipUpgradeTarget(id)].name}（-${EQUIP_UPGRADE_COST} 金）`);
            renderRogue();
        });
    });
    actions.appendChild(rogueBtn('⚙ 整备（分配升级装备）', () => { ROGUE.phase = 'prep'; renderRogue(); }));
    actions.appendChild(rogueBtn('🔥 直接通过，前往精英战（无战斗）', () => { rogueAdvance(); renderRogue(); }));
}
// ⑦ 商店节点: 随机 5 件基础装备(10 金) + 2 件稀有装备(20 金)
function renderRogueShop(phaseEl, body, actions) {
    const shop = ROGUE.shop;
    if (!shop) { rogueAdvance(); renderRogue(); return; }
    phaseEl.textContent = `🏪 商店 · 买：基础 10 / 稀有 20 / 药剂 ${ROGUE_SHOP.itemPrice} 金　·　卖：普通 6 / 稀有 12 金`;
    let html = `<div class="rogue-note">金币 💰 ${ROGUE.gold}　（下一站：🔧 装备升级点 · 无战斗可直接通过）</div>`;
    html += `<div class="rp-title">基础装备（10 金）</div><div class="rogue-pick">`;
    html += shop.basics.map((it, i) => rogueEquipCardHtml(it.id,
        it.sold ? ' sold' : '', `data-shop="basic" data-idx="${i}"`, it.sold ? '已售出' : '💰 ' + it.price)).join('');
    html += `</div><div class="rp-title" style="margin-top:10px">稀有装备（20 金）</div><div class="rogue-pick">`;
    html += shop.rares.map((it, i) => rogueEquipCardHtml(it.id,
        it.sold ? ' sold' : '', `data-shop="rare" data-idx="${i}"`, it.sold ? '已售出' : '💰 ' + it.price)).join('');
    html += `</div>`;
    // v2.4: 一次性物品(守护药剂 / 攻击药剂) —— 战斗前在整备界面勾选使用
    html += `<div class="rp-title" style="margin-top:10px">🧪 一次性物品（${ROGUE_SHOP.itemPrice} 金 · 整备界面勾选，开战自动生效并消耗）</div><div class="rogue-pick">`;
    html += ROGUE_SHOP.items.map(id => {
        const it = ROGUE_ITEMS[id];
        const own = ROGUE.items[id] || 0;
        return `<div class="rp-card item-card" data-item="${id}">
            <div class="rp-emoji">${it.icon}</div><div class="rp-name">${it.name}</div>
            <div class="rp-sub">${it.desc}</div>
            <div class="rp-price">💰 ${ROGUE_SHOP.itemPrice}${own > 0 ? `（已持有 ${own}）` : ''}</div></div>`;
    }).join('');
    html += `</div>${rogueBagHtml(true)}`;
    body.innerHTML = html;
    body.querySelectorAll('.rp-card[data-shop]').forEach(card => {
        card.addEventListener('click', () => {
            const kind = card.dataset.shop, idx = parseInt(card.dataset.idx, 10);
            const it = (kind === 'basic' ? shop.basics : shop.rares)[idx];
            if (!it || it.sold) return;
            if (ROGUE.gold < it.price) { rogueToast('金币不足'); return; }
            ROGUE.gold -= it.price;
            it.sold = true;
            rogueAddToBag(it.id);
            renderRogue();
        });
    });
    // v2.4: 购买一次性物品(可重复购买, 开战时消耗)
    body.querySelectorAll('.rp-card[data-item]').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.item;
            if (ROGUE.gold < ROGUE_SHOP.itemPrice) { rogueToast(`金币不足（需要 ${ROGUE_SHOP.itemPrice} 金）`); return; }
            ROGUE.gold -= ROGUE_SHOP.itemPrice;
            ROGUE.items[id] = (ROGUE.items[id] || 0) + 1;
            rogueToast(`购买 ${ROGUE_ITEMS[id].name} ×1（-${ROGUE_SHOP.itemPrice} 金，共 ${ROGUE.items[id]} 个）`, true);
            renderRogue();
        });
    });
    // v2.3: 卖装备(普通 6 金 / 稀有 12 金) —— 只能卖背包里闲置的那一份
    body.querySelectorAll('.rb-sell[data-sell]').forEach(btn => {
        btn.addEventListener('click', ev => {
            ev.stopPropagation();
            if (rogueSellEquip(btn.dataset.sell)) renderRogue();
        });
    });
    actions.appendChild(rogueBtn('离开商店，前往装备升级点', () => { rogueAdvance(); renderRogue(); }));
}
// ⑥ 失败: 扣 1 点生命后回到整备重试
function renderRogueDefeat(phaseEl, body, actions) {
    const nd = ROGUE_NODES[ROGUE.node] || ROGUE_NODES[0];
    phaseEl.textContent = `💔 ${nd.icon} ${nd.name} 失败！剩余生命 ${ROGUE.lives}`;
    body.innerHTML = `<div class="rogue-end">💔 战斗失利<span class="re-sub">生命 -1（剩余 ${ROGUE.lives}）</span>
        <span class="re-sub">可回到整备界面调整站位与装备后重试本节点</span></div>`;
    actions.appendChild(rogueBtn('回到整备', () => { ROGUE.phase = 'prep'; renderRogue(); }));
}
// ⑧ 结束: 通关 / 失败
function renderRogueEnd(phaseEl, body, actions) {
    const win = ROGUE.result === 'win';
    phaseEl.textContent = win ? '🎉 远征成功' : '💀 远征失败';
    const nd = ROGUE_NODES[ROGUE.node] || ROGUE_NODES[0];
    body.innerHTML = `<div class="rogue-end">${win ? `🎉 恭喜通关全部 ${ROGUE_NODES.length} 个节点！` : '💀 生命耗尽，远征结束'}
        <span class="re-sub">${win ? '你带领小队击败了 BOSS 大魔法师 👑' : `止步于 ${nd.icon} ${nd.name}`}</span></div>
        <div class="rogue-note">队伍：${rogueTeamNames()}　背包 ${rogueBagTotal()} 件装备　剩余金币 💰 ${ROGUE.gold}</div>`;
    actions.appendChild(rogueBtn('重新开始远征', () => { rogueReset(); ROGUE.phase = 'entry'; renderRogue(); }));
}

// ============================================================
//  初始化
// ============================================================
function init() {
    buildWorld();
    renderArena();
    refreshPanels();
    applyResetUI();

    // ---- 启动界面 ----
    $('startBtn').addEventListener('click', () => {
        startScreen.classList.add('hidden');
        mainContainer.style.display = 'flex';
    });
    $('backBtn').addEventListener('click', () => {
        stopAuto();
        rebuildAll();
        mainContainer.style.display = 'none';
        startScreen.classList.remove('hidden');
    });
    const equipLibrary = $('startEquipLibrary');
    $('toggleEquipBtn').addEventListener('click', function () {
        equipLibrary.classList.toggle('open');
        this.textContent = equipLibrary.classList.contains('open') ? '📦 收起装备' : '📦 装备大全';
    });
    const rulesModal = $('rulesModal');
    $('showRulesBtn').addEventListener('click', () => { rulesModal.style.display = 'flex'; });
    $('rulesCloseBtn').addEventListener('click', () => { rulesModal.style.display = 'none'; });
    rulesModal.addEventListener('click', (e) => { if (e.target === rulesModal) rulesModal.style.display = 'none'; });

    // ---- 人物介绍弹窗(替代原「模拟统计」) ----
    const heroModal = $('heroModal');
    $('heroOpenBtn').addEventListener('click', () => {
        renderHeroLibrary();
        heroModal.style.display = 'flex';
    });
    $('heroCloseBtn').addEventListener('click', () => { heroModal.style.display = 'none'; });
    heroModal.addEventListener('click', (e) => { if (e.target === heroModal) heroModal.style.display = 'none'; });

    // ---- 挑战模式(固定编队,调用到 B 队) ----
    const challengeModal = $('challengeModal');
    $('challengeOpenBtn').addEventListener('click', () => {
        renderChallengeList();
        challengeModal.style.display = 'flex';
    });
    $('challengeCloseBtn').addEventListener('click', () => { challengeModal.style.display = 'none'; });
    challengeModal.addEventListener('click', (e) => { if (e.target === challengeModal) challengeModal.style.display = 'none'; });

    // ---- 远征挑战(肉鸽模式 v2.0) ----
    const rogueModal = $('rogueModal');
    $('rogueOpenBtn').addEventListener('click', () => {
        rogueStopTimer();
        if (ROGUE.result) rogueReset();
        if (!ROGUE.phase) ROGUE.phase = 'entry';   // v2.4 首次进入 → 关卡选择界面(测试关卡 / 正式远征)
        renderRogue();
        rogueModal.style.display = 'flex';
    });
    // 站位拖拽取消时清除选中态
    document.addEventListener('dragend', () => {
        if (rogueMoveFrom !== null) { rogueMoveFrom = null; if (ROGUE.phase === 'prep') renderRogue(); }
    });
    $('rogueCloseBtn').addEventListener('click', () => { rogueStopTimer(); rogueModal.style.display = 'none'; });
    rogueModal.addEventListener('click', (e) => {
        if (e.target === rogueModal) { rogueStopTimer(); rogueModal.style.display = 'none'; }
    });
    // 控制台调试入口(与 window._duel 同约定): window._rogue.state / .world() / .finishNow()
    window._rogue = { state: ROGUE, world: () => rogueWorld, finishNow: rogueFinishNow, nodes: ROGUE_NODES, enterNode: rogueEnterNode, render: renderRogue, step: rogueStep };

    // ---- 全局规则: 「游戏玩法」/「游戏机制」折叠区 ----
    document.querySelectorAll('.rule-head').forEach(head => {
        head.addEventListener('click', () => {
            const body = $(head.dataset.toggle);
            if (!body) return;
            body.classList.toggle('collapsed');
            head.classList.toggle('collapsed');
        });
    });

    // ---- 面板交互 ----
    $('btnFight').addEventListener('click', doManualRound);
    $('btnAuto').addEventListener('click', () => {
        if (isAuto) { stopAuto(); addLogUI('⏸ 自动战斗暂停'); }
        else startAuto();
    });
    $('btnReset').addEventListener('click', () => {
        // 与原版 fullReset 一致: 按当前编队重建双方单位(清掉进化/绝境求生等战斗态)并重置战斗
        rebuildAll();
        addLogUI('🔄 战斗已重置');
    });
    $('speed1x').addEventListener('click', () => setSpeed(1));
    $('speed2x').addEventListener('click', () => setSpeed(2));
    $('speed4x').addEventListener('click', () => setSpeed(4));
    addBtnA.addEventListener('click', () => addMember('A', firstFreeCell('A')));
    addBtnB.addEventListener('click', () => addMember('B', firstFreeCell('B')));

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.hero-selector')) {
            closeAllHeroGrids(null, -1);
        }
    });

    renderStartEquipLibrary();
    // 首屏日志(与原版 init 一致)
    world.battleTime = 0;
    addLog(world, `⚔️ A队 ${teamSize('A')} 人 vs B队 ${teamSize('B')} 人（3列×2行阵型）`, 'highlight');
    addLog(world, '💡 点击空格「＋」放置队员，拖动面板可换位；点击头像换英雄，下拉选装备', '');
    addLog(world, `📖 共 ${HERO_LIST.length} 个角色，${EQUIP_LIST.length - 1} 件装备，每队最多 ${CONFIG.teams.maxPerTeam} 人（每人 ${CONFIG.equip.points} 装备点）`, '');
    renderFrame(true);
}
init();
}

})();
