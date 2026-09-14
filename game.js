// ============================================================
//  狂暴对战 · 队伍版(index.html + style.css + game.js)
//  ------------------------------------------------------------
//  文件结构(已按「数据 / 引擎 / UI」分层拆分,加载顺序见 index.html):
//    config.js        —— ① 配置常量 CONFIG(全部魔法数字集中管理)
//    heroes.js        —— ② 英雄定义 HERO_DEFS / HERO_LIST / HERO_NAMES / HERO_INTRO_LIST
//    equips.js        —— ② 装备定义 EQUIP_DEFS / 装备分档工具
//    mechanics.js     —— ② 机制注册表 MECHANICS(数据驱动,钩子依赖由引擎提供)
//    engine.js        —— ③ 引擎层: 世界/单位构建, tick, 伤害结算, 选敌(纯逻辑,可 require 对拍)
//    rogue.js         —— ④ UI 层: 远征挑战(肉鸽模式),依赖由本文件 install() 单向注入
//    game.js(本文件)  —— ④ UI 层: 渲染 + 事件 + 倍速(普通对战); 末尾立即执行 init()
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
//
//  最近改动(数据/引擎/UI 三层拆分后的两处修正):
//    - 文案口径修正: 生命腰带「护甲 +5% / 魔抗 +5%」→「护甲 +5 / 魔抗 +5」,
//      太阳圣盾「护甲 +8% / 魔抗 +8%」→「护甲 +8 / 魔抗 +8」。
//      实现为「点数加算」: unit.armor = base.armor + armorBonus / unit.mr = base.mr + mrBonus,
//      与荆棘之甲「护甲 +10」写法统一(仅 hpBonus / atkBonus / speedBonus 才是百分比);
//      太阳圣盾的「御击」按 (护甲+魔抗) 计值,此处更不能按百分比理解
//    - 精灵 · 小精灵: 多只小精灵命中同一单位时日志聚合为「目标 ×N」,不再重复罗列同一名字
//      (伤害逻辑不变: 每只仍按对位规则各自结算 10 点魔法伤害并受目标魔抗减免)
//    - 远征挑战(肉鸽模式)UI 拆出为 rogue.js: game.js 2456 → 1410 行
//      两者单向依赖 —— game.js 用 install() 向远征注入 $ / CHALLENGE_TEAMS / buildStatusHtml,
//      远征不再反向引用普通对战; index.html 中 rogue.js 须排在 game.js 之前
//      (game.js 末尾立即执行 init(),其中要调用 GameRogue.installRogueUI())
// ============================================================
(function () {
'use strict';

// ---- Node 向后兼容: 引擎实现已迁至 engine.js, require('./game.js') 仍返回同一份 Engine API ----
if (typeof module !== 'undefined' && module.exports) module.exports = require('./engine.js');

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
    A: [{ heroId: 'warrior', equipIds: ['none', 'none', 'none'], cell: 1, talentIds: [] }],
    B: [{ heroId: 'knight', equipIds: ['none', 'none', 'none'], cell: 1, talentIds: [] }]
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
    roster[teamKey].push({ heroId: DEFAULT_HERO[teamKey], equipIds: ['none', 'none', 'none'], cell, talentIds: [] });
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
    const prevHero = m.heroId;
    m.heroId = heroId;
    m.equipIds = equipIds.slice();
    if (prevHero !== heroId) m.talentIds = [];
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
// v2.9 天赋写入 roster(规则校验在 normalizeTalentIds)
function updateMemberTalent(teamKey, cell, talentIds) {
    const m = memberAt(teamKey, cell);
    if (!m) return;
    m.talentIds = normalizeTalentIds(talentIds, m.heroId);
    rebuildAll();
    const names = m.talentIds.map(id => {
        const t = TALENT_DEFS[id];
        return t ? `${t.icon}${t.name}` : id;
    });
    addLogUI(m.talentIds.length
        ? `✨ ${teamKey}队${cellName(cell)} 天赋：${names.join(' ')}`
        : `✨ ${teamKey}队${cellName(cell)} 已清空天赋`);
}

// 装备组合合法性(v4.3): 仅校验装备点容量;相同装备(含法力护符)不再受限
// v2.7: 新增「每人只能携带 1 件升级装备」的校验
function isValidEquipCombo(equipIds) {
    if (equipUpgradeCount(equipIds) > 1) return false;
    return equipPointsUsed(equipIds) <= CONFIG.equip.points;
}

// ============================================================
//  天赋弹窗(v2.9): 独立模态框;A/B 两侧共用
// ============================================================
let talentModalCtx = null;   // { teamKey, cell }
function talentTierStyle(tier) {
    const t = TALENT_TIERS.find(x => x.key === tier);
    return t ? t.color : '#8e9aaf';
}
function openTalentModal(teamKey, cell) {
    const m = memberAt(teamKey, cell);
    const modal = $('talentModal');
    if (!m || !modal) return;
    talentModalCtx = { teamKey, cell };
    renderTalentModal();
    modal.style.display = 'flex';
}
function closeTalentModal() {
    const modal = $('talentModal');
    if (modal) modal.style.display = 'none';
    talentModalCtx = null;
}
function renderTalentModal() {
    const body = $('talentModalBody');
    const title = $('talentModalTitle');
    if (!body || !talentModalCtx) return;
    const { teamKey, cell } = talentModalCtx;
    const m = memberAt(teamKey, cell);
    if (!m) return;
    const hero = HERO_DEFS[m.heroId];
    const selected = normalizeTalentIds(m.talentIds || [], m.heroId);
    m.talentIds = selected;
    title.textContent = `${hero.emoji} ${hero.name} · 天赋（${selected.length}/${CONFIG.talent.maxSlots}）`;
    const pool = talentsOfHero(m.heroId);
    if (!pool.length) {
        body.innerHTML = `<div class="talent-empty">该英雄天赋开发中</div>`;
        return;
    }
    body.innerHTML = pool.map(t => {
        const on = selected.indexOf(t.id) >= 0;
        const color = talentTierStyle(t.tier);
        const tierName = (TALENT_TIERS.find(x => x.key === t.tier) || {}).name || t.tier;
        return `<div class="talent-card${on ? ' selected' : ''}" data-id="${t.id}" style="border-color:${color}">
            <div class="talent-head">
                <span class="talent-name" style="color:${color}">${t.icon} ${t.name}</span>
                <span class="talent-tier" style="color:${color}">${tierName}</span>
            </div>
            <div class="talent-desc">${t.desc}</div>
        </div>`;
    }).join('');
    body.querySelectorAll('.talent-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            const def = TALENT_DEFS[id];
            if (!def) return;
            const cur = normalizeTalentIds(m.talentIds || [], m.heroId);
            const idx = cur.indexOf(id);
            if (idx >= 0) {
                cur.splice(idx, 1);
            } else {
                if (cur.length >= CONFIG.talent.maxSlots) {
                    addLogUI(`⚠️ 天赋最多 ${CONFIG.talent.maxSlots} 个，请先取消一个`);
                    return;
                }
                if (def.tier === 'legendary') {
                    const legCount = cur.filter(x => TALENT_DEFS[x] && TALENT_DEFS[x].tier === 'legendary').length;
                    if (legCount >= CONFIG.talent.maxLegendary) {
                        addLogUI(`⚠️ 传说天赋最多 ${CONFIG.talent.maxLegendary} 个`);
                        return;
                    }
                }
                cur.push(id);
            }
            updateMemberTalent(teamKey, cell, cur);
            renderTalentModal();
        });
    });
}
function talentTagsHtml(talentIds, heroId) {
    const ids = Array.isArray(talentIds) ? talentIds : [];
    if (!ids.length) return `<span class="talent-tag empty" data-act="open-talent">✨ 天赋</span>`;
    return ids.map(id => {
        const t = TALENT_DEFS[id];
        if (!t) return '';
        const color = talentTierStyle(t.tier);
        return `<span class="talent-tag" style="border-color:${color};color:${color}" title="${t.desc}" data-act="open-talent">${t.icon}${t.name}</span>`;
    }).join('');
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
    <div class="talent-row">
        <button class="talent-open-btn" type="button">✨ 天赋</button>
        <div class="talent-tags"></div>
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
        talentOpenBtn: panel.querySelector('.talent-open-btn'),
        talentTags: panel.querySelector('.talent-tags'),
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

    // 事件: 展开英雄网格 / 移除队员 / 天赋弹窗
    refs.heroCurrent.addEventListener('click', () => toggleHeroGrid(teamKey, cell));
    refs.removeBtn.addEventListener('click', () => removeMember(teamKey, cell));
    if (refs.talentOpenBtn) refs.talentOpenBtn.addEventListener('click', () => openTalentModal(teamKey, cell));
    if (refs.talentTags) refs.talentTags.addEventListener('click', (e) => {
        if (e.target.closest('[data-act="open-talent"]')) openTalentModal(teamKey, cell);
    });

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
            if (refs.talentTags) {
                const m = memberAt(teamKey, u.cell);
                refs.talentTags.innerHTML = talentTagsHtml(m ? m.talentIds : (u.talentIds || []), u.heroId);
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
    applyTalentOnStart(world);   // v2.9 原初之力
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
    applyTalentOnStart(world);   // v2.9 原初之力: 重置清场后再开局星落
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
    roster[key] = t.members.map(m => ({
        heroId: m.heroId,
        equipIds: m.equipIds.slice(),
        cell: m.cell,
        freeEquip: true,
        talentIds: normalizeTalentIds(m.talentIds || [], m.heroId)
    }));
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
//  远征挑战 · 肉鸽模式 —— 已移至 rogue.js(详见该文件头部说明)
//  此处仅保留入口: install() 注入 UI 依赖, installRogueUI() 绑定事件
// ============================================================

// ============================================================
//  初始化
// ============================================================
function init() {
    buildWorld();
    resetCombatState(world);
    applyTalentOnStart(world);
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

    // ---- 天赋弹窗 ----
    const talentModal = $('talentModal');
    if (talentModal) {
        $('talentCloseBtn').addEventListener('click', () => { talentModal.style.display = 'none'; talentModalCtx = null; });
        talentModal.addEventListener('click', (e) => {
            if (e.target === talentModal) { talentModal.style.display = 'none'; talentModalCtx = null; }
        });
    }

    // ---- 挑战模式(固定编队,调用到 B 队) ----
    const challengeModal = $('challengeModal');
    $('challengeOpenBtn').addEventListener('click', () => {
        renderChallengeList();
        challengeModal.style.display = 'flex';
    });
    $('challengeCloseBtn').addEventListener('click', () => { challengeModal.style.display = 'none'; });
    challengeModal.addEventListener('click', (e) => { if (e.target === challengeModal) challengeModal.style.display = 'none'; });

    // ---- 远征挑战(肉鸽模式 v2.0): 远征入口/渲染全部在 rogue.js,此处注入依赖并绑定入口事件 ----
    GameRogue.install({ $: $, CHALLENGE_TEAMS: CHALLENGE_TEAMS, buildStatusHtml: buildStatusHtml });
    GameRogue.installRogueUI();

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
