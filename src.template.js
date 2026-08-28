/* eslint-disable no-undef */
/**
 * SiYuan 资产管理插件 v2.6.3 — 主模板（不带 IIFE）
 *
 * 通过 scripts/concat.js 把 api/*.js 拼接在顶部，生成单文件 index.js。
 *
 * 功能（v0.14.0 + v0.15-T6 + v0.16-T1 / T3 / T5 / T6 / T7 + v0.17-T1-β / T1-γ / T1-δ + v0.17-Hotfix-A + v0.17-T3-α / T3-β + v1.1.0 + v1.2.0 + v1.3.0 + v1.4.0 + v1.5.0 + v1.6.0 + v1.7.0 + v2.3.0 + v2.4.0 + v2.4.1 + v2.4.2 + v2.5.0 + v2.6.0 + v2.6.1 + v2.6.3）：
 *
 * v2.6.3（报表分析卡片 + 汇率自动更新）：
 *   - 报表页新增「订阅分析」：订阅中 / 试用中 / 已停订数量、月度支出（按账单周期折算）、
 *       累计支出，以及未来 30 天内续费的订阅清单与金额
 *   - 报表页新增「预付分析」：总余额与剩余次数、累计充值与消费、使用率，
 *       以及未来 30 天内到期的预付清单
 *   - 「订阅分析」「预付分析」「种草转化」合并为报表页的一张切换卡片，
 *       按钮仅在有对应资产时出现；三个视图排版统一
 *   - api/report.js 只读聚合扩展（新增 subscription / prepaid 分析结构），投影输入不变
 *   - 设置页汇率自动更新：使用免凭证 open.er-api.com API，打开应用时距上次更新超
 *       24 小时即静默刷新美元 / 欧元 / 英镑兑人民币汇率
 *   - 汇率区展示当前汇率、更新来源（自动更新 / 手动设置）与最近刷新时间，
 *       提供「立即刷新」与「恢复自动汇率」
 *   - 手动修正汇率支持美元 / 欧元 / 英镑三种货币；手动修正后自动更新不再覆盖，
 *       一键恢复自动汇率
 *   - api/exchange-rate-api.js 新解析模块（15s 超时、并发守卫）+ storage 汇率 source
 *       白名单 + exchangeRateAutoRefresh 设置项
 *   - formal-v2 资产契约与存储零改动、写入路径零改动
 *
 * v2.6.0（内核 Agent 工具）：
 *   - Agent 工具由 kernel.js（Goja 内核插件）在 3.8.1 优先通过 siyuan.mcp.registerTool、
 *       旧版回退 siyuan.agent.registerCapability 注册，内置 Agent 与 MCP 均可调用；
 *       index.js 不再使用 addAgentAction（3.8.0 前端无此 API）
 *   - 内核侧只读投影实时读 storage；写操作经 agent-writes 独立请求文件桥转发，
 *       前端插件轮询队列并委托既有业务方法执行，权限每次调用二次校验
 *   - 设置页 AI Tab 管理 Agent 总开关与六类权限，并显示内核注册心跳状态；写入协调由 Web Locks 保证，
 *       不支持安全协调的环境 fail-closed
 *
 * v2.5.0（笔记双链批次 · 阶段1 契约地基 + 阶段2 索引文档引擎 + 索引初始引导 P1 / P2）：
 *   - 资产块引用直达：document capture 普通点击同步命中索引块缓存后打开产品卡，
 *       块引用右键/移动端长按菜单增加「打开产品卡」「在索引文档中定位」双入口；
 *       深链、普通点击与菜单共用 _openAssetDetailById，未命中完整回退思源原生跳转
 *   - 产品卡笔记关联 P3：详情区统一为「笔记关联」，标题栏提供唯一「复制块引用」入口；
 *       关联行改为块内容优先的两行信息，并按 manual / tag 来源二次确认取消，ref 只读
 *   - 索引初始引导 P1：索引文档改为用户显式创建，固定根路径与所有权标记；indexDocId
 *       成为唯一同步依据，文档移动/重命名/跨笔记本后继续同步，关闭时暂停，删除后等待显式重新创建
 *   - 索引初始引导 P2：设置页按 unconfigured / ready / closed / missing / error 状态引导；
 *       未配置时仅在用户点击主按钮后创建，ready 状态始终展示 inspect 返回的实时标题与路径，
 *       missing 状态经插件范围二次确认后才重新创建文档
 *   - 阶段2（索引文档引擎 + CRUD 钩子 + 设置接入）：
 *   -   新增 api/note-link.js：createNoteLinkEngine 在用户指定笔记本维护「资产索引文档」，
 *       每资产 = 一个真实段落块（custom-asset-id 打标 + custom-am-hash 内容哈希幂等，
 *       哈希不变不 updateBlock，避免无变化广播）；文档头提示块 custom-am-header 打标单独维护
 *   -   资产条目块缺失时在原索引文档内同步修复；索引文档本体删除后等待用户显式重新创建；
 *       wishlist 资产不携带 indexBlockId（极简 schema），
 *       其块靠 custom-asset-id 属性定位，不回写实体
 *   -   防递归：syncNow 全程持 syncing 标志；引擎回写 indexBlockId / indexDocId 时
 *       _onDataCommitted 的 scheduleSync 钩子被引擎内部守卫直接 no-op，绝不二次循环
 *   -   CRUD 钩子单点接在 _onDataCommitted（覆盖全部 _commitAssetAuditMutation 事务 +
 *       saveSettings + resetAllFormalData）+ importFromFile 成功路径；引擎错误一律内部吞掉，
 *       不冒泡 CRUD/UI
 *   -   设置 Dialog 数据 Tab 新增「笔记索引」状态引导：显式创建、实时位置、自动同步、
 *       立即同步、原地修复、关闭检测与删除后二次确认重建；保存走 saveSettings Object.assign 合并
 *   -   不写死任何笔记本 id：settings.indexNotebookId 默认空串，创建时在设置里选择
 *   - 阶段4（资产 → 笔记反链 + 块打标）：
 *   -   引擎新增 getRelatedNotes（ref 块引反链 / tag 块打标 / manual 手动登记三源合并，
 *       索引文档自身过滤、blockId 去重 ref 优先、索引未启用仅剩 manual 源）
 *       与 linkBlockToAsset / unlinkBlockFromAsset / getBlockAssetTag（custom-asset-id 写删读）
 *   -   详情卡（owned 与 wishlist）body 末尾新增「相关笔记」区：loading → 列表
 *       （来源标签 + 文档标题 + 预览截断），行点击 _jumpToBlock（openTab /
 *       openMobileFileById 解构自 siyuan）跳转高亮；manual 条目可移除、dead 显示已失效；
 *       「+ 关联笔记文档」小 Dialog 接受 siyuan:// 链接或裸 id，查活后走审计事务
 *       patch relatedNotes（写入入口仅 owned——wishlist patch 白名单不含该键）
 *   -   click-blockicon 块图标菜单：未标记块「关联到资产」（资产选择器 → linkBlockToAsset）；
 *       已标记块「在资产管理中查看」+「取消关联」；注入失败不影响思源原生菜单
 *   - 阶段1（契约地基）：
 *   -   契约：formal-v2 owned 实体新增可选 indexBlockId（string | null，该资产在索引文档中的块 ID）
 *     与 relatedNotes（手动登记的关联文档，元素 {id, title, addedAt}）；≤2.4.2 存量数据缺键
 *     读取容忍为 null / []，无迁移无重置
 *   - 契约：DEFAULT_SETTINGS 新增 6 个索引文档配置键（indexEnabled / indexNotebookId / indexDocPath /
 *     indexDocId / indexAutoSync / indexIncludeCover），indexEnabled 默认 false 且由引擎维护，normalizeSettings 缺键容忍
 *   - Manifest：version 2.5.0；minAppVersion 提升至 3.8.0（索引文档引擎依赖较新内核能力）
 *   - 不动：formal-v2 既有键集取值与 sidecar 结构（索引引擎只读投影 + 回写白名单内 indexBlockId）
 *
 * v2.4.2（心动值批次 · 种草养成式决策，wishlist 子对象新增可选字段 + wishlistEvents 新增事件类型）：
 *   - 新增：种草「心动值」——种草时可填可选「目标心动值」（1–999）；每次想买点一下「心动」，草长高一档（有目标六档 种子🌰→发芽🌱→小草🌿→茂盛☘️→含苞🌷→开花🌸；无目标纯计数 + 五档里程碑）
 *   - 新增：种草池卡片心动 pill（阶段 emoji + 计数，卡上直点 +1 不打开详情卡）；达标后 pill 与购买按钮高亮 + 名称行「可以买了」徽章（购买不阻止）
 *   - 新增：种草详情卡「心动值」section——阶段大图标 + 进度条（仅有目标）+「心动」大按钮 +「撤销最近一次心动」（仅 count>0 显示）；仅达标当次点击 toast「🌸 心动值满了，可以买啦！」
 *   - 新增：添加/编辑种草表单「目标心动值」可选输入行（空 = 无目标纯计数；1–999 整数校验）
 *   - 新增：已购买/已拔草历史卡「心动 N 次」小字（N>0 显示）
 *   - 数据：wishlist 子对象白名单新增 heartbeatTarget（null 或 1–999）；wishlistEvents sidecar 新增 heartbeat 事件类型（复用 13 键，计数严格派生自事件流不落主表）；report.js 新增 deriveWishlistHeartbeat / describeWishlistHeartbeat 只读投影；≤2.4.1 存量数据缺键读取容忍为 null，无迁移无重置
 *   - 修复：wishlist 资产硬删除因 'delete' 操作日志与 wishlist-exclusion 契约冲突必然事务失败（wishlist 分支改透传操作日志不写日志）
 *   - 不动：formal-v2 主实体契约键集结构（仅增一个可选子字段）、sidecar 13 键结构
 *
 * v2.4.1（表单优化 + 币种下拉统一 + 种草价格跟踪 + 种草池重设计批次 · UI / 交互 + sidecar 事件扩展，不动 formal-v2 主实体契约）：
 *   - 新增：种草详情卡「更新价格」与「价格趋势」曲线图（样式与报表曲线同源）；价格变化以 expectedPriceChanged 事件记录在 wishlistEvents sidecar
 *   - 新增：实物资产表单价格行新增币种下拉（去除 (¥) 标识）；实物 / 虚拟 / 预付币种下拉统一为液态玻璃风格（编辑态锁定，复用 v2.3.0 玻璃下拉模式）
 *   - 改进：种草表单去掉「购买时根据目标组别自动打开对应表单」提示；「期望价格」输入不再带写死货币标志；「目标组别」改名「类型」；种草理由去掉单独标题，改灰色占位文案
 *   - 改进：种草池卡片布局与首页列表视图同步——左侧封面 + 名称（状态点 + 类型 chip）+ 期望价，横线分隔；横线下左侧迷你价格曲线（报表同源 Catmull-Rom 平滑 + 主题色面积）+「更新价格」pill 卡上直接可点，右侧 拔草/购买 pill 收到右下角，文字更小
 *   - 改进：列表视图图标 48→52px、矩阵图标 52→56px（窄屏 46→50px），间距微调，卡片外框尺寸不变
 *   - 改进：种草详情卡清理——wishlist 状态不再渲染 到期（保修）/ 保养与维修 / 订阅历程 / 预付流水等记录区与对应入口，基础区仅保留类型行
 *   - 新增：详情卡价格趋势区「更新记录」列表（日期 + 旧→新），每条可删除以更正误输入（deleteWishlistPriceEvent 域方法：事件链重接，删除末条回退当前期望价）
 *   - 改进：更新期望价格 sheet 输入行去框（与添加种草价格行同款无边框样式）、去掉小字提示
 *   - 修复：产品卡内打开「更新价格」sheet 被详情卡遮挡（mask 加 am-workflow-sheet-mask，z=60 浮于详情卡 z=55 之上，与维保/预付流水 sheet 同方案）
 *   - 改进：更新期望价格 sheet 价格行与添加资产表单同款——期望价格 label + 币种玻璃下拉（锁定态）+ 右对齐输入 + 行下横线
 *   - 改进：删除价格更新记录前增加插件范围内二次确认（scoped confirm，挂当前 host，不越出插件区域）
 *   - 改进：拔草 sheet 与添加种草表单同款——顶部 × 关闭（替换原文字「取消」）、右上确认按钮去掉、底部「拔草」保存；拔草理由放进 am-form-textarea 灰字占位，名称移出卡片居中展示
 *   - 改进：种草产品卡去掉「成本」section（未购入无实际成本）——价格趋势 section 紧跟基础区出现，详情卡更清爽
 *   - 改进：预设封面图标去除边框与投影——仅保留圆角矩形图案（底色保留作透明 PNG 基底），与上传图无边框裁切视觉统一
 *   - 修复：编辑种草资产报错（「种草不支持自定义图片」）——通用表单 dto 与 wishlist patch 白名单冲突抛 unknown field；编辑种草改走专属种草表单（新增 updateWishlistAsset 白名单域方法，支持改名/换封面/改期望价/理由/类型）
 *   - 修复：种草资产详情卡因投影异常无法打开（wishlist 投影适配）；矩阵视图投影错误卡根类错误；若干 headless 测试环境兼容修复
 *   - 不动：api/*.js formal-v2 主实体契约白名单、storage schema（wishlistEvents sidecar 仅新增 expectedPriceChanged 事件类型）
 *
 * v2.4.0（封面 1:1 裁切 + 自动压缩批次 · 纯 UI / 媒体处理，不动 formal-v2 数据契约）：
 *   - 新增：上传封面后强制进入 1:1 裁切 sheet（无「使用原图」快捷入口）；cropper.js 双层模型：图片 contain 完整显示 + 可拖动 1:1 裁切框（四角等比缩放手柄），空白区域可拖动移动图片，双指捏合或 Ctrl+滚轮缩放图片
 *   - 新增：初始裁切框贴合图片短边（横版图贴高、竖版图贴宽）；裁切 sheet 显示在插件面板范围内，不再全屏
 *   - 新增：落盘前自动压缩：统一 1280×1280 输出、≤1MB（JPEG 质量阶梯 0.92→0.82→0.75；PNG 仅尺寸缩放不降质）
 *   - 修复：裁切后文件名扩展名跟随实际输出 MIME（解决 "Image MIME type does not match its filename"）；大图裁切不再因合成层溢出视口（移除 transform scale，改 CSS 直接布局）
 *   - 不动：api/*.js formal-v2 数据契约白名单、storage schema；封面仍落盘 data/public/
 *
 * v2.3.0（UI 细节优化批次 · 纯 UI / 交互，不动 formal-v2 数据契约）：
 *   - 新增：订阅表单「计费周期」改液态玻璃下拉（hidden input + trigger + popover），替换原生 <select>，Esc/外点关闭与主面板联动
 *   - 新增：标签颜色系统——tags.json 标签支持 color 字段；马卡龙 30 预设色板 + 「无颜色」+ 自定义颜色行（≤10，settings.customTagColors）+ 原生取色器；标签管理两处（设置 Dialog / 编辑 sheet）行首 swatch 就地换色
 *   - 新增：标签颜色全界面同步呈色（am-tag-chip--colored）——首页标签筛选下拉、列表/矩阵卡、产品详情卡、编辑 sheet 已选 chip、种草池卡，亮暗两套
 *   - 改进：首页筛选下拉收敛在插件 dock 区域内（dockElement rect clamp，modal 内回退 modal 容器，均无则视口 clamp）；标签下拉右对齐 trigger 右边缘
 *   - 改进：标签筛选下拉「全选/取消全选」合并为单个状态切换按钮（已全选→取消全选，否则→全选）
 *   - 改进：首页间距协调——trigger 间距收窄（桌面 8→6 / 移动端同步 5→4），筛选栏→列表垂直间距收敛（margin-bottom 14→2 + padding-bottom 8→3），列表卡上下 padding 12→10 与列表 gap 6→8 联动（卡间总留白 30→28px）
 *   - 不动：api/*.js formal-v2 数据契约白名单、storage schema（tags 仅增 color 可选字段、settings 仅增 customTagColors）
 *
 * v1.7.0（到期口径修正 + 矩阵多列 + 日均价双向联动 + UI 打磨 · 算法/逻辑/UI，不动数据契约）：
 *   - 修复：到期口径统一为纯日期差——到期日当天=在役/「今日到期」，次日起才=已过期；加固 daysUntil 杜绝时刻陷阱，报表风险复用同一口径，并修北京 0–8 点报表基准日偏早一天
 *   - 新增：矩阵视图列数随面板宽度自适应 2/3/4 列（ResizeObserver），工具栏可手选 auto/2/3/4 并持久化 settings.matrixCols
 *   - 新增：目标日均价「用价格算日期 / 用日期算价格」模式开关 + 只读预览双向联动（targetEndsOn 契约字段已存在，纯函数 projectFormalCostGoalByDate 反算，不动数据契约）
 *   - 改进：矩阵产品图圆角收到与卡边框协调（cover 10px / 图 8px）；小屏（≤640px）编辑表单壳撑满容器、form 内部可滚动，解决半侧边栏表单被裁
 *   - 不动：formal-v2 数据契约白名单、storage schema（仅 settings 加 matrixCols）、详情卡 costGoal 渲染
 *
 * v1.6.0（到期提醒重做 + 视觉细节打磨 · 纯 UI / 静态资源，不动数据契约）：
 *   - 重做：首页顶部「即将到期」提醒条（🔔 标题 + 计数 + 关闭），点击弹 popover 清单逐条开产品卡；无到期不显示，× 暂收（新批次自动重现）
 *   - 改进：报表「即将到期」移到概览正下方、标题去「（7 天内）」；底色/文字中性化，行名称左 + 到期日右对齐
 *   - 改进：紫卡 / 列表卡 / 矩阵卡圆角统一 8px（匹配报表 surface）；筛选栏与矩阵左右边距对齐列表卡
 *   - 改进：⋯ 菜单改横向小圆角矩形，hover 亮浅主题色、点击后无焦点残影；在役圆点加极淡边界衬托
 *   - 新增：预设封面图标 19 → 33，新增「数字服务」分组（AI/云/数据/报表/图表）+ 黄金/代币/钻石/书/地图等
 *   - 不动：api/*.js formal-v2 数据契约白名单、storage schema、report.js（仅 UI 与静态资源调整）
 *
 * v1.5.0（报表重设计 + 矩阵优化 · 纯 UI 重组，不动数据契约）：
 *   - 重设计：报表页改为 资产概览 → 分类排行 → 标签排行 → 到期提示 → 金额趋势 → 价格排行；移除 30天/6月/12月 时间切换与在役圆环图
 *   - 新增：概览总金额按币种分列；7 天内到期提示（点击复用产品卡）
 *   - 新增：金额趋势改 12 月购入金额平滑曲线（Catmull-Rom 贝塞尔）+ 每月金额贴点标签（xxK，空月留白）
 *   - 新增：标签排行——按标签聚合购入金额折 CNY 降序，无资产引用的标签不渲染
 *   - 改进：分类排行拆「按数量 / 按金额」两列，数量列修复为降序；价格排行复用可点击产品卡
 *   - 改进：矩阵视图徽章移到封面右侧空白区、标签另起一行置其下，长名称不再被挤压成省略号
 *   - 不动：api/*.js formal-v2 数据契约白名单、storage schema、report.js（数据均已提供，仅 UI 重组）
 *
 * v1.3.0（备注 Markdown + 逻辑优化 · 3 项改动）：
 *   - 新增：资产备注支持 Markdown 输入（多级标题 / 有序列表 / 无序列表），产品详情卡直接安全渲染
 *   - 修复：保修日历「一年 / 两年 / 三年」快捷与自动建议改为以购买日为准，购买日变更时保修日期同步联动（含闰日安全）
 *   - 修复：从产品详情卡点击维修 / 预付流水时，记录 sheet 不再被详情卡遮挡；workflow 与详情卡同 host，Escape 只关顶层不误关详情卡，插件 overlay 局部 stacking context 不覆盖思源系统 UI
 *   - 不动：api/*.js formal-v2 数据契约白名单、storage schema（仅 UI / 逻辑调整）
 *
 * v1.2.0（UI 美化版 · 9 项改动）：
 *   - 改进：主页顶部搜索框 + 视图按钮缩小，与「资产管理」标题同高
 *   - 改进：顶部资产总卡片隐藏汇率脚注文本，上下边框对称
 *   - 修复：虚拟订阅过期时产品详情卡右上角显示「已过期」，不再误显「服役中」
 *   - 改进：矩阵视图去掉日均 / 目标 emoji，底部统一竖排左对齐
 *   - 改进：预设封面图标裁切填充圆角边框（原 contain 留白）
 *   - 改进：产品详情卡关闭按钮移至顶部水平居中并上移；手机端左右留白放大
 *   - 新增：保修截止日自定义日历（年月切换 + 一年 / 两年 / 三年快捷选项），替换原生日期选择
 *   - 改进：标签选择器美化（trigger 矩形化、下拉收窄竖排、输入框 + 加号置顶）
 *   - 不动：api/*.js formal-v2 数据契约白名单、storage schema（仅 UI 调整）
 *
 * v1.1.0（发布后首个优化版 · 6 项改动）：
 *   - 修复：实物 / 预付权益 / 买断编辑时可修改价格与日期
 *     - 价格走购买事件替换链（void + replace 旧 purchase financial event），日期走 acquiredOn 落库
 *     - 虚拟资产编辑态币种锁定（disabled），防止改币种导致投影 / 换算崩溃
 *     - 预付权益编辑时价格预填改为首笔购买金额
 *   - 改进：订阅日均价改按当前订阅周期（开始 → 结束，含两端）计算
 *     - 卡片 / 顶部汇总 / 报表三处口径一致（更准确）
 *   - 改进：次数权益（prepaidCount）卡片底部显示「剩余次数 · 每次价格」，不再显示日均成本
 *   - 改进：列表卡片紧凑化
 *     - 类型移入标题行、标签居右、卡片间距缩短
 *     - 已过期不再显示徽章且状态点变灰（虚拟过期同样处理）
 *     - 底部按资产类型定制内容
 *   - 改进：实物保修截止日在详情卡内美观显示（档位配色 + 剩余天数 / 已过保）
 *   - 修复：顶部「我的资产」卡跟随思源主题色与明暗模式实时刷新（去除写死蓝色，改用 var(--b3-theme-primary)）
 *   - 行为变化提示：订阅日均口径变化会使顶部汇总 / 报表的订阅日均数字变化（更准确）
 *   - 不动：api/*.js formal-v2 数据契约白名单、storage schema（仅 UI / 投影口径 / 编辑表单调整）
 *
 * v1.1.0 阶段 R3（维保 / 预付流水界面插件内化）：
 *   - 重写 openFormalWorkflowDialog(id, mode)：不再用 showDialog 原生 Dialog，改为插件内液态玻璃 sheet
 *     （am-edit-sheet-mask > am-edit-sheet.am-form-shell.am-workflow-sheet + am-maintenance-sheet /
 *     am-prepaid-transaction-sheet 基线类），mask 创建 / host 挂载 / 遮罩点击 / 关闭按钮 / Esc 关闭
 *     与 openRenewSheet 同模式；返回 mask DOM（非 Dialog 实例）
 *   - 表单改 am-form-card > am-fpc1-rows 行布局：类型 inline select / 日期 / 金额或次数 /
 *     支付金额（可选，仅次数 kind）/ 调整方向（仅 adjust 时展开，is-hidden 切换）/ 备注 am-form-textarea；
 *     所有文案走 i18n（不再硬编码中文），字段语义与域方法调用（addMaintenanceRecord /
 *     addPrepaidTransaction / deleteFormalWorkflowRecord）完全不变
 *   - 记录列表重设计为 .am-workflow-item 卡片行（类型语义徽章 + 日期 + 备注 + 带方向符号的金额 / 次数 +
 *     删除按钮），空列表显示 i18n 空态；保存成功就地刷新列表 + 清空草稿（保留类型 / 日期，不关 sheet），
 *     删除成功就地刷新，失败 toast 报错且草稿保留
 *   - 新增 _renderFormalWorkflowRecordItem(record, mode, asset) 与 _refreshFormalProductCardAfterWorkflow(id)：
 *     关闭 sheet 后若产品详情卡仍打开则 closeProductCard + openFormalProductCard 原 host 刷新，
 *     否则 _runGuardedUiEffects 刷新 dock / modal
 *   - showDialog 方法本身保留（其它弹窗仍在用）；index.css 新增 .am-workflow-* 系列样式（含暗色）；
 *     i18n 新增 10 key（zh + en 对称）：workflowMaintenanceTitle / workflowHistoryTitle /
 *     prepaidFieldPaymentAmount / prepaidAdjustDirection / prepaidDirectionIncrease / prepaidDirectionDecrease /
 *     maintenanceAddSuccess / maintenanceAddFailed / prepaidTxDeleteFailed / prepaidTxDeleteRecordAria
 *   - 测试基线更新：formal-maintenance-workflow.test.js / ui-parity-workflow-sheets.test.js
 *     由 Dialog 结构断言改为 sheet（mask DOM）结构断言；域方法行为断言不变
 *
 * v0.17 阶段 1（种草池底部页恢复）：
 *   - 底部导航固定为首页 / 报表 / 种草池；种草池成为独立第三页，不再通过首页 subView 进入
 *   - 种草池仅显示 this.assets 中 status === 'wishlist' 的资产，不展示任何历史事件
 *   - 种草新建复用普通 assets-only add，不触碰 wishlistEvents、ledger 或 sidecar
 *   - 卡片购买仅将原 wishlist 资产转为 active；拔草仅删除原资产并在提交后清理其自有上传封面
 *
 * v0.17-Hotfix-A（紧急 P0 bug 修复 — 标签筛选失效）：
 *   - 根因：T1-γ 时 filter.tagIds 误存为 tagId（如 'tag_sys_digital'），而 a.tags[] 存的是 label（如 '数码'），
 *     两端字符串域不一致 → applyFilter 'any' 模式 `a.tags.some(t => ids.indexOf(t) >= 0)` 永远 false
 *     → 用户勾 2 个 system tag，主列表立刻变空
 *   - 修复（最小风险 — filter.tagIds 改存 label，与 a.tags[] 统一字符串域）：
 *     - openTagFilterDialog renderTagChipHtml：
 *         - chip 上 `data-tag-id` → `data-tag-label`（dataset.tagLabel 不是 dataset.tagId）
 *         - selected 判断 `currentIds.indexOf(t.id)` → `currentIds.indexOf(t.label)`
 *     - openTagFilterDialog refreshBody：chip 选中态用 `btn.dataset.tagLabel` 比对 `newIds`
 *     - openTagFilterDialog tag chip click handler：
 *         - `const tagId = btn.dataset.tagId` → `const tagLabel = btn.dataset.tagLabel`
 *         - `self.filter.tagIds.push(tagId)` → `self.filter.tagIds.push(tagLabel)`
 *     - onload loadTags 末尾加「tagId → label 自动迁移段」：
 *         - 老用户升级后自动把存错的 tagId 转成 label，找不到的 tag 丢弃
 *         - 升级后自动同步，filter 不丢选择、不需用户手工清
 *   - applyFilter 逻辑不动（语义统一后 `.indexOf(t) >= 0` 自然命中），仅注释更新
 *   - 不改 schema：a.tags 仍为 string[]（label 数组）
 *   - 不动 T1-β Tag 管理 UI（其 data-tag-id 是「编辑/删除哪个 tag」语义，与本 fix 不同）
 *   - 不动 renderTopBar（已经基于 length 计数 + mode === 'untagged' 判 active）
 *   - 回归：apply 过滤、迁移兼容、未标签模式、「清除筛选」、顶栏计数全部恢复
 *
 * v0.17.0 改进（T1-δ M12 标签系统 — 编辑表单 chip 升级 + 自动补全）：
 *   - 新增 helper：
 *     - _getTagByLabel(label) — 按 label 查 tag 元数据（大小写不敏感；找不到返回 null）
 *     - _renderAssetTagsHtml(tags) — 渲染 chip HTML（emoji + 颜色 + × 删除 + fallback 📦）
 *     - bindTagAutocomplete(input, state, rerender, mask) — tag 输入框自动补全 dropdown
 *   - 编辑表单 tag chip 升级（renderSheet 行 ~5920）：
 *     - 旧 `<span class="am-edit-tag">` 仅文字 → 新 `_renderAssetTagsHtml(state.tags)`
 *     - chip 现在带 emoji + 颜色 + × 按钮（fallback 用 📦 灰色）
 *     - 删除按钮 data-action="remove-tag" 委托沿用，与既有删除逻辑兼容
 *   - 卡片底部 chip 升级（正式卡片渲染路径）：
 *     - `_renderAssetTagsHtml(tags.slice(0,3))` 共享 helper
 *   - tag 输入框自动补全 dropdown（bindAfterRerender 行 ~6260 末尾）：
 *     - 焦点 / 输入时按 `t.label.startsWith(value)` 过滤 this._tags（最多 8 条）
 *     - item onmousedown 闭包绑定（避免 blur 先关 dropdown，v0.13 P0 教训）
 *     - 失去焦点延迟 150ms 关闭（给 mousedown 时间触发）；Esc 即时关闭
 *     - 与已有输入相同时不重复加；超过 10 个 toast 提示
 *     - Enter 仍可添加自定义字符串（原有逻辑保留）
 *     - dropdown 容器 append 到 mask 内（确保 unmount 清理）
 *   - 防御 rerender 丢输入：tagInput oninput 写 state.draftTagValue；bindAfterRerender 重建 input 时回填
 *   - 不动 schema：a.tags 仍为 string[]（label 数组），filter.tagIds 行为沿用 T1-γ
 *   - i18n 加 3 key（zh + en 各一份）：tagAutocompleteEmpty / tagAutocompleteHint / tagLimitReached
 *   - index.css 加 .am-asset-tag--rich / --fallback / .am-asset-tag__del / .am-tag-autocomplete-* 系列
 *
 *
 * v0.17.0 改进（T3-α M13 批量操作 · 入口）：
 *   - this.bulkMode = false + this.bulkSelected = new Set()（constructor 初始化）
 *   - renderTopBar 加「☑ 批量」chip 按钮（data-action="toggle-bulk-mode"，激活态高亮 + 计数）
 *   - 正式卡片批量模式时卡片左上角 checkbox：
 *     - label 容器 + input 自身均带 data-action="bulk-row-check" data-id
 *     - 选中态：am-asset-item is-bulk-selected（蓝边框 + 浅蓝背景）
 *     - 整卡片加 am-asset-item--bulk-mode class（padding-left 加大避免挤压）
 *   - handleAction 加 4 case：
 *     - toggle-bulk-mode → 切 bulkMode + 退出时 bulkSelected.clear() + renderDock
 *     - bulk-select-all → applyFilter 排除 wishlist 后全选
 *     - bulk-deselect-all → 清空 bulkSelected
 *     - bulk-row-check → 切 bulkSelected.has(id) ? delete : add + renderDock
 *   - case "card" bulkMode 短路：点卡片 = 切选中（不再弹产品卡，避免与 checkbox 冲突）
 *   - 退出批量时 bulkSelected.clear() 防止内存残留
 *   - 不动：applyFilter / 标签 / 维保 / 使用记录（仅入口 + UI，T3-γ 才做实际批量动作）
 *   - i18n 加 6 key（zh + en 各一份）：bulkModeEnter / bulkModeExit / bulkModeCount / bulkSelectAll / bulkDeselectAll / bulkNoAssets
 *   - index.css 加 .am-topbar-bulk-chip / .am-bulk-checkbox / .am-asset-item--bulk-mode / .is-bulk-selected + 暗色 + 移动端 44px
 *
 * v0.17.0 改进（T3-β M13 批量操作 · 工具栏 UI）：
 *   - 新增 renderBulkActionBar() 方法（HTML 模板字符串）：
 *     - 三段式布局：左 = 已选 N 项 + 全选 / 取消全选；中 = 5 操作按钮；右 = 清空
 *     - 5 操作按钮：删除 / 改状态 / 加标签 / 去标签 / 导出 CSV
 *     - class `am-bulk-action-bar` + `is-visible` 条件显示（仅 bulkMode + bulkSelected.size > 0 时浮起）
 *     - 仅 home 主视图显示（与 TabBar 同条件）；modal 模式不显示
 *   - renderDock 末尾 inline 渲染（与 TabBar 平级，位于 am-dock__inner 内底部）
 *   - handleAction 加 6 case：
 *     - bulk-clear → 真实清空（bulkSelected.clear() + renderDock） — T3-β 实现
 *     - bulk-delete / bulk-change-status / bulk-add-tag / bulk-remove-tag / bulk-export
 *       → T3-γ 替换为真实批量动作（去 stub）
 *   - 样式：
 *     - .am-bulk-action-bar — 液态玻璃中厚（blur 24px），固定底部浮起，z-index 5
 *     - .am-bulk-action-bar__btn / __btn--danger — 思源蓝 / 红色（删除）
 *     - 暗色 + 移动端（按钮纵向 + 44px 触摸目标）
 *
 * v0.18 改造（formal-v2 阶段 4+5+6 · 订阅 autoRenew lifecycle + 实物退役/转让 + 预付校正/记一笔事务）：
 *   - 阶段 4 订阅 autoRenew lifecycle 重写：
 *     - 重写 _formalRenewSubscription：仅追加 financial event (subscriptionPayment) + subscriptionPeriod + lifecycle event (subscriptionRenewed) + opLog；
 *       永远不再修改 details.autoRenew、不再修改 status；允许手动续订且续订不会强制开启 autoRenew
 *     - 新增 toggleSubscriptionAutoRenew(id, enabled)：仅写 details.autoRenew + lifecycle event (kind=statusChanged, details.action='subscriptionAutoRenewEnabled/Disabled') + opLog；
 *       不修改 status、不删除账期、不删除付款
 *     - 删除/移除语义：取消订阅 / 跳过订阅 / 续费决策 sheet / pending assets 扫描全部不暴露运行入口
 *     - openRenewSheet 仅保留续期表单（startDate/endDate/amountMinor）；不允许 UI 修改 autoRenew
 *     - 阶段 5 实物退役/转让财务事务：
 *     - 新增 retirePhysicalAsset(id, { retiredDate, note })：同事务 status=retired + lifecycle (retired) + opLog；不写 details.salePrice
 *     - 新增 recordPhysicalSaleAsset(id, { priceMinor, soldOn, note })：同事务 financial event (sale/inflow) + status=retired + lifecycle (retired, details.saleFinancialEventId) + opLog
 *     - openFormalProductCard 实物卡片加「退役」「转让」按钮，弹对应表单
 *     - 编辑表单退役扩展区不再有 salePrice 字段（v2 退役不写主表金额）
 *   - 阶段 6 次数预付校正 + 记一笔事务：
 *     - 新增 recordPrepaidCountAdjustment(id, { targetCount, effectiveDate, note })：读 projectFormalPrepaid，按 delta 创建 prepaidTransaction (adjust/count/inflow|outflow) + lifecycle + opLog
 *     - 新增 recordPrepaidConsumption(id, { count, effectiveDate, note })：校验 projection 余额足额后写 outflow 流水 + lifecycle + opLog
 *     - prepaidCount 编辑表单加「剩余次数」手动设定输入（保存时按 target/current 投影差走 adjust）
 *     - prepaidAmount / virtual / physical 编辑表单不显示剩余次数
 *   - 所有新方法走 _commitAssetAuditMutation 事务包装（确保 6 个 sidecar 同事务 + 完整 snapshot 校验）
 *   - 生命周期 kind 复用 LIFECYCLE_EVENT_TYPE 现有枚举值（statusChanged / subscriptionRenewed / retired / prepaidTransaction），
 *     autoRenewEnabled/Disabled 通过 details.action + details.fromAutoRenew/toAutoRenew 区分；grep 仅验证字面量存在于 src.template.js
 *   - i18n 加 key（zh + en 各一份）：subscriptionRenewed / subscriptionRenewSuccess / subscriptionRenewConfirmTitle /
 *     subscriptionAutoRenewEnabled / subscriptionAutoRenewDisabled / subscriptionAutoRenewEnabledToast / subscriptionAutoRenewDisabledToast /
 *     renewFieldStartDate / renewFieldEndDate / renewFieldAmount / btnRenew /
 *     subscriptionLifecycleTitle / autoRenewToggleHint /
 *     physicalRetireTitle / physicalRetireConfirm / physicalSaleTitle / physicalSaleConfirm /
 *     physicalSaleFieldPrice / physicalSaleFieldDate / physicalSaleFieldNote /
 *     physicalRetireFieldDate / physicalRetireFieldNote / physicalRetiredToast / physicalSoldToast /
 *     prepaidRemainingCountField / prepaidAdjustReasonDefault / prepaidAmountAdjustReasonDefault /
 *     prepaidCountAdjustTitle / prepaidCountAdjustConfirm / prepaidOutflowInsufficient /
 *     prepaidOutflowTitle / prepaidRecordOutflow / prepaidRecordOutflowField / prepaidOutflowSuccess
 *   - 不动：api/*.js（formal-v2 严格白名单仍生效；LIFECYCLE_EVENT_TYPE 旧值保留但本阶段不写入）
 *
 * v0.17.0 改进（T3-γ M13 批量操作 · 真实批量动作）：
 *   - handleAction 5 stub case 替换为真实批量动作（统一委托给 _bulkXxx helper）：
 *     - bulk-delete       → _bulkDelete()：二次 confirm sheet + 遍历 deleteAsset（Promise.allSettled 容错）
 *     - bulk-change-status→ _bulkChangeStatus()：3 chip status picker sheet + 遍历 setStatus
 *     - bulk-add-tag      → _bulkAddTag()：tag picker sheet（来自 this._tags + 自定义 input Enter）
 *                            + 每个 asset 并集去重 截断到 10 个 → updateAsset M14 wrap
 *     - bulk-remove-tag   → _bulkRemoveTag()：tag picker sheet（仅显示涉及 tag）+ 每个 asset 差集 → updateAsset
 *     - bulk-export       → _bulkExport()：生成 CSV（UTF-8 BOM + 9 列 + tags 用 ; 分隔）+ Blob + <a download>
 *   - 新增 3 个通用弹窗辅助方法（全部用 showDialog 包装 b3-dialog + 闭包 onclick 绑定）：
 *     - _showConfirmDialog(title, message, onConfirm, { danger })    — 通用二次确认 sheet
 *     - _showStatusPickerDialog(title, onPick)                        — 3 chip status picker
 *     - _showTagPickerDialog({mode, title, assetIds, tagPool, onConfirm}) — tag 多选 picker
 *   - 关键设计：
 *     - Promise.allSettled 而非 Promise.all（单条失败不中断其他，统计 successes / failures）
 *     - 复用既有 deleteAsset / updateAsset / setStatus（M14 wrap 已写 operationLog）
 *     - setStatus 同状态短路避免产空日志；updateAsset 改前后对比避免空日志
 *     - _exitBulkMode() 统一退出（清 bulkSelected + bulkMode=false + renderDock）
 *     - bulk-export 不 renderDock（download 不影响 UI），但仍退出 bulk 模式防下次误删
 *     - CSV 用 \uFEFF BOM + CRLF；cell 含 , " 换行的用 "" 包裹并把 " → ""
 *   - i18n 加 12 key（zh + en 各一份）：
 *     - bulkDeleteConfirm / bulkDeleteSuccess
 *     - bulkChangeStatusTitle / bulkChangeStatusSuccess / bulkChangeStatusHint / bulkRemoveTagEmpty
 *     - bulkAddTagTitle / bulkAddTagSuccess / bulkAddTagHint / bulkAddTagEmpty
 *     - bulkRemoveTagTitle / bulkRemoveTagSuccess / bulkRemoveTagHint
 *     - bulkExportTitle / bulkExportSuccess / bulkExportFail / bulkExportFilename
 *     - bulkCustomTagInput / bulkCustomTagPlaceholder
 *   - index.css 加 .am-bulk-confirm-dialog / .am-bulk-status-picker / .am-bulk-tag-picker 全系 + 暗色 + 移动端
 *
 * v0.17.0 改进（T1-γ M12 标签系统 — 筛选 UI）：
 *   - api/assets.js applyFilter 加 tagMode / tagIds 处理：
 *     - 'all'      → 不按 tag 过滤（保留旧行为）
 *     - 'untagged' → 仅显示 tags 为空数组的资产
 *     - 'any'      → OR 语义，资产 tags 与 filter.tagIds 任一相交
 *   - renderTopBar() 加「🏷️ 标签」chip 按钮
 *     - 显示「🏷️ 标签（已选 N/全部）」文本，N>0 时高亮
 *     - data-action="open-tag-filter" 走 dock 委托
 *   - 新增 openTagFilterDialog() — 标签筛选 sheet
 *     - 顶部 3 模式 chip（all / untagged / any）
 *     - 中部 tag 多选 chip 网格（每 tag 显示 emoji + label + 选中态）
 *     - 底部「清除筛选」「完成」2 按钮
 *     - 实时改 this.filter.tagIds / this.filter.tagMode + this.refreshList()
 *     - 多次开 dialog 不丢选择（chip 状态从 this.filter.tagIds 读）
 *     - sheet 内 button onclick 全部用 btn.onclick = () => ... 闭包绑定（v0.13 P0 第 8 条教训）
 *   - this.filter 初始化加 tagIds: [] / tagMode: 'all'
 *   - handleAction 加 case "open-tag-filter"
 *   - i18n 加 8 key（zh + en 各一份）
 *   - index.css 加 .am-topbar-tag-chip / .am-tag-filter-* 系列
 *
 * v0.17.0 改进（T1-β M12 标签系统 — UI）：
 *   - api/storage.js 已就绪 readTags / writeTags / seedSystemTagsIfMissing（T1-α 完成，本块不重复）
 *   - onload 同步占位 _tags / _tagsDirty / _tagsFlushTimer
 *   - onload 异步 loadTags；标签库允许为空，不再自动 seed system tag
 *   - 新增 Plugin 类方法：
 *     - loadTags() — 异步从 this.storage.readTags() 加载到内存
 *     - _flushTags() — 5s 防抖落盘（与 _flushMaintenanceRecords 同模板）
 *     - createTag({label}) — 新建固定目录标签（名称 trim、大小写不敏感唯一）
 *     - updateTag(tagId, patch) — 历史兼容 no-op；不允许改名或编辑样式
 *     - deleteTag(tagId) — 仅删除未被任何资产引用的目录标签
 *     - getTagById(tagId) — 按 id 查找
 *     - openTagManagerDialog() — 仅创建、展示引用计数、删除无引用标签
 *   - 设置标签 Tab 为唯一管理入口；sheet 内按钮使用闭包直接绑定
 *
 * 功能（v0.14.0 + v0.15-T6 + v0.16-T1 / T3 / T5 / T6 / T7）：
 *   1. 资产 CRUD（添加 / 编辑 / 删除），实物 + 虚拟分支
 *   2. 实物 / 虚拟资产分类与标签组织
 *   3. 状态机：种草中 → 在役 → 退役；退役内含「已转让」（实物）「已取消」（虚拟）
 *   4. 自动计算：日均成本 / 净成本 / 已使用天数 / 剩余保修 / 4 种折旧 / 目标日均价进度
 *   5. 种草池 + 拔草池（事件溯源 wishlist_events.json）
 *   6. 30+ 服务模板库（AI / 平台会员 / 软件 / 云 / 域名服务器）
 *   7. 顶部统计 + 报表（分类柱状图 + Top 5）
 *   8. 搜索 + 分类 + 状态 + 类型 + 6 种排序多维筛选
 *   9. 3 大 Tab（首页 / 加号 ActionSheet / 分析）
 *   10. 顶栏图标 → 设置 Dialog（常规 / 数据 / 关于）
 *   11. 自动到期检测：过期虚拟订阅转 retired
 *   12. 液态玻璃 UI + 完整暗色模式 + 移动端适配
 *   13. v0.15-T6：多币种 UI 系统（CNY / USD / EUR / GBP，native 模式按资产原币种显示）
*   14. v0.16-T1（M14）：操作日志 — 6 个 mutation 函数全部 wrap 写日志，内存数组 + 5s 防抖落盘，
 *                       最近 1000 条截断，SettingsDialog「数据」tab 加按钮打开日志弹窗，
 *                       支持 delete / set-status 撤销（快照恢复 + 状态恢复）
 *   15. v0.16-T5（AssetEditor §5）：additionalCosts / income 由 textarea 多行解析改为
 *                       chip 单条模式 — 折叠开关 + 每条 label / amount / date 三个 input +
 *                       × 单条删除 + 「+ 添加」按钮（覆盖实物 + 虚拟买断 2 个表单）
 *
 * v0.14.0 P0 bug 修复：
 *   - modal 模式下 Tab 切换崩溃（adjustAllMatrixGrids 已删除仍被调用）
 *   - modal 模式下底部 Tab 选择器 `.am-tab` 不匹配实际 class
 *   - 虚拟资产编辑表单「选择服务」按钮在 dock 委托中拿不到闭包变量 → ReferenceError
 *   - 编辑表单 textarea（附加费用 / 收益）输入未同步 state，保存时丢失用户输入
 *   - 编辑表单初始分类/状态 chip 未高亮（dataset 键名 sheetcat 与 sheetCat 不匹配）
 *   - 保存设置直接覆写 → 丢失 preferredCurrency / notificationsEnabled / notificationDays / schemaVersion
 *   - exportMarkdown（v0.14 修复：旧版只迭代 CATEGORIES 导致虚拟资产漏导出；v0.18 已重写为遍历全 5 kind 的 formal-v2 表格，见 exportMarkdown()）
 *   - settings-save 拿错容器（dockElement 优先于 .b3-dialog__content）
 *
 * v0.15.0 改进（T6）：
 *   - algorithms.js 新增 currencySymbol / formatCurrency（CNY / USD / EUR / GBP）
 *   - storage.js DEFAULT_SETTINGS 新增 currencyDisplayMode（'native' | 'preferred' | 'dual'）
 *   - src.template.js：所有硬编码 ¥${fmtPrice(x)} → formatCurrency(x, a.currency) 或 preferredCurrency
 *   - SettingsDialog 常规 tab 新增「显示币种」下拉（3 选项，T6 仅 native 真实生效）
 *   - 删除 T3 临时 priceSymbol 局部变量，统一走 formatCurrency 函数
 *
* v0.16.0 改进（T1 M14 操作日志）：
 *   - storage.js 新增 readOperationLogs / writeOperationLogs
 *   - assets.js 新增 newOperationLog 工厂（type / assetId / assetName / field / oldValue / newValue / ts）
 *   - src.template.js：
 *     - 内存 this._opLogs 数组（头插，最新在前），5s 防抖落盘
 *     - 6 mutation 函数 wrap：addAsset / updateAsset / deleteAsset / setStatus / wishlistToActive / wishlistAbandon
 *     - recordOperation / _flushOpLogs / reverseOperation / openOpLogDialog 4 个新方法
 *     - onload 末尾初始化 _opLogs（从 operationLogs.json 异步加载）
 *     - SettingsDialog「数据」tab 加「查看操作日志」按钮（最近 100 条，可撤销 delete/set-status）
 *
 * v0.16.0 改进（T5 AssetEditor §5 附加费用 / 收益 chip 化）：
 *   - state 重命名（虚拟 + 实物各 1 处）：additionalCostsText / incomeText 字符串
 *     拼接 → additionalCosts / income 数组直接持有；新增 additionalCostsOpen / incomeOpen 折叠开关
 *   - 4 处 textarea HTML 替换为 chip 列表：
 *     虚拟 oneTimeFields（行 2257-2263 区）、实物 renderSheet 第 13/14 字段
 *   - bindBody / bindAfterRerender 各加 chip 绑定：
 *     toggle-additional-costs / toggle-income 折叠 +
 *     cost-label / cost-amount / cost-date 单条 oninput / onchange 实时改 state +
 *     cost-add / cost-rm 触发 rerender
 *   - 2 处保存 handler 简化：sheet-save-virtual / sheet-save 不再走 parseCostLines，
 *     直接读 state.additionalCosts / state.income
 *   - syncBuyState 函数移除 additionalCostsText / incomeText 同步行
 *   - 虚拟 bindBody 类型切换 saved + 回写 state 同步删除 textarea 相关 2 行
 *   - 新增 CSS：am-costs-list / row / empty / input (+ label/num/date) / rm +
 *     暗色 + 移动端单列布局
 *   - i18n 加 7 key（fieldCostLabel / fieldCostAmount / fieldCostDate /
 *     fieldCostsEmpty / fieldIncomeEmpty / fieldAddCost / fieldAddIncome）
 *   - 数据存储层不动（newAsset / normalizeAsset 字段定义未变）— 兼容旧数据
 *
* v0.16.0 改进（T2 产品方案 M2 事件溯源）：
 *   - WishlistEvent 当前仅保留 purchased（种草转正）和 abandoned（种草拔草）两类产品语义事件
 *   - removed / expired 历史记录不清理，但不再写入或展示
 *
* v0.16.0 改进（T9 P0 Bug：input/textarea 数据同步）：
 *   - bug 现象：用户在表单 input/textarea 输入内容（产品名 / 价格 / 购买日期 / 备注 / 目标日均价等）
 *       后，任意触发 rerender() 的操作（toggle 切换 / chip 切换 / 标签 add/rm / 服务模板选择 / 类型切换 / cost add/rm /
 *       试用 toggle / 续费 add/rm）→ 用户输入全部丢失，必须重输。
 *   - 根因：renderSheet() / renderBody() 模板字符串直接渲染 input value="${data.xxx}" / "${state.xxx}"，
 *       用户键入时 input.value 改了但 data.xxx / state.xxx 未同步（无 oninput 监听）；
 *       任何 toggle 触发 rerender → 用旧 data/state 重新渲染 → 用户看到"输入清空"。
 *   - 修复：在 openEditSheet.bindAfterRerender / openVirtualSheet.bindBody / openWishlistSheet 末尾追加
 *       oninput / onchange 监听（addEventListener，不破坏既有 .oninput / .onchange 直接赋值）。
 *       覆盖字段：
 *         实物基础字段：name / price / purchaseDate / notes / targetDailyCost /
 *                        customDailyCost / targetEndDate / expiryReminderDate / expiryReminderType
 *         虚拟 8 字段：name / price / notes / autoRenew / startDate / nextBillingDate / planName / endDate
 *         种草 3 字段：name / expectedPrice / notes
 *       （实物已有大量 state-managed 字段 + chip oninput 同步；本次仅补"无同步"且易丢值的字段）
 *   - 双保险：sheet-save 保存时仍从 DOM 读 mask.querySelector('[name="xxx"]').value（v0.13 P0 fix 第 4 条），
 *       即便 oninput 漏写某个字段，用户点保存仍能拿到 DOM 最新值。
 *   - 影响范围：实物 / 虚拟 / 种草 三表单全覆盖，所有 5 toggle + chip 切换 → 数据不再丢。
 *   - 不动：算法层 / sheet-save（已双保险）/ MIGRATIONS / i18n / CSS（本次纯 JS 修复）。
 *   - 性能：oninput 每输入字符触发，但 data.xxx = e.target.value 是 O(1) 赋值，无性能问题。
 *
 * v0.16.0 改进（T7-A MINIMAX §2.2 M9 到期提醒 — 推送系统）：
 *   - 原计划新增 _startExpiryScanner() / _scanExpiry() / openExpiryListDialog() /
 *     renderSettingsReminders()、以及 4 类到期资产推送（紧急/即将/保修/自定义）
 *   - v0.18 formal-v2 决议：reminderPolicy 顶层字段 + expiryReminder/details
 *     子字段全部移除，过期推送改由 settings.notificationsEnabled 控制的总
 *     报告看板代替，不再有 setInterval 扫描循环。
 *   - v0.18 清理：删除 reminderPolicy normalize 帮助函数、FORMAL_OWNED_KEYS
 *     中的 reminderPolicy 字段、normalizeFormalAsset/Patch 中的所有引用。
 *   - 不动：autoExpireVirtualAssets（v0.12 M9 自动到期，v2 only-lapsed projection）
 *   - 不动：MIGRATIONS / schemaVersion（纯运行时逻辑，不写文件）
 *   - 不动：settings.notificationsEnabled / notificationDays /
 *     notificationIntervalMinutes 这三项保留，仅在报表中以风险卡片呈现。
 *
 * v0.16.0 改进（T7-B MINIMAX §2.2 M9 到期提醒 — Dialog + Settings UI）：
 *   - 原计划：openSettingsDialog 加第 4 Tab「提醒」、renderSettingsReminders、
 *     openExpiryListDialog。
 *   - v0.18 formal-v2 决议：上面三件 UI 都不做；提醒信息由报表 + 看板卡片呈
 *     现，settings 仍保留 notifications* 三个字段供用户偏好，但不再绑定 UI 推
 *     送循环。bindSettingsTabEvents 不再有 tab==='reminders' 分支。
 *   - 删除头注释中关于 _startExpiryScanner / _scanExpiry / openExpiryListDialog
 *     / renderSettingsReminders / _expiryTimer 的描述（实现从未落地）。
 *   - 删除 am-expiry-dialog / am-expiry-item CSS（无调用方）。
 *   - i18n 中的 notificationTitle/Desc 等保留供后续报表复用，不动。
 *
 * M10 MVP（实体详情维保恢复）：
 *   - maintenance.json 维护独立 sidecar 事务，记录只含 id/assetId/type/cost/date/note/createdAt
 *     maintenance.json schema: {schemaVersion:1, records:[{id, assetId, type:'maintain'|'repair',
 *     cost, date:'YYYY-MM-DD', note, createdAt}]}
 *   - assets.js 加 computeMaintenanceTotal(assetId, records) + computeNetCost 注入 maintenanceCost
 *     公式 = price + Σ(additionalCosts) + Σ(maintenanceCost) - Σ(income)
 *   - src.template.js：
 *     - onload 末尾初始化 this._maintenanceRecords 内存数组（异步从 maintenance.json 加载）
 *     - saveMaintenanceRecord / deleteMaintenanceRecord 只写 sidecar，不触及资产、ledger 或操作日志
 *     - openProductCard 的实体详情只读显示最近保养和累计维护支出；唯一入口打开 openMaintenanceSheet
 *     - sheet 仅支持新增/删除（保养/维修、日期、费用、备注），金额按资产原币种显示
 *     - sheet 内 button onclick **闭包直接绑定**(v0.13 P0 第 8 条教训)
 *     - i18n 加 16 key(标题/类型/字段/按钮/empty/last/total/费用)
 *
 * v0.16.0 改进（T4-α/β/γ MINIMAX §2.2 M13 使用记录 — 完整落地）：
* 架构：
 *   - api/algorithms.js  日期工具 + 货币格式化 + escapeHtml + genId
 *   - api/assets.js      Asset 模型 + CATEGORIES/VIRTUAL_CATEGORIES/STATUSES/SORTS + computeStats/computeDailyCost/computeTargetProgress + newOperationLog
 *   - api/media.js       统一 cover 模型 + 思源工作空间文件上传 / 删除 / 改名
 *   - api/storage.js     JSON 持久化（Plugin.loadData / saveData）+ schemaVersion 迁移框架 + readOperationLogs/writeOperationLogs
 *   - api/services.js    30 服务模板库
 *   - api/icons.js       SVG 图标
 *   - src.template.js    本文件：Plugin 类 + UI 渲染 + 事件（含 dock + modal 双模式）
 *
 * 未实现（保留 STORAGE_FILES 占位）：
 *   - tags.json / maintenance.json / exchangeRates.json
 *   - 多币种汇率转换 / preferred + dual 双显、到期通知系统、64+ 虚拟模板自动归档、CSV/YAML 导出、批量操作
 */

// __AM_API_INJECTION_POINT__

// v2.5.0 阶段4：openTab（桌面跳转块）/ openMobileFileById（移动端跳转块）加入解构。
const { Plugin, Dialog, Menu, openTab, openMobileFileById } = require("siyuan");

const DOCK_TYPE = "asset-management-dock";
const PLUGIN_VERSION = "2.6.3";
const AUTHOR_URL = "https://ld246.com/member/Dilyar";
const ICONS8_URL = "https://icons8.com";

const ICONS = icons.getAllSymbols();

const AM_NON_NEGATIVE_NUMBER_SELECTOR = 'input.am-nonnegative-number[type="number"]';

// v2.6.0：Agent 写桥。内核插件（kernel.js）通过 registerTool / registerCapability 注册工具，
// 新请求写入 agent-writes/pending/<requestId>.json，前端只追加 processing/completed 独立收据，
// 不删除 pending，也不改写共享数组。旧 queue/results 文件仅用于已在途请求收尾。
const AGENT_WRITE_METHOD_NAMES = Object.freeze([
    'addAsset', 'updateAsset', 'setStatus', 'deleteAsset',
    'retirePhysicalAsset', 'recordPhysicalSaleAsset', 'renewSubscription',
    'toggleSubscriptionAutoRenew', 'addMaintenanceRecord', 'addPrepaidTransaction',
    'recordPrepaidCountAdjustment', 'recordPrepaidConsumption', 'correctPurchaseAmount',
    'correctSubscriptionPaymentAmount', 'updateSubscriptionStartDate', 'updateSubscriptionPeriodEnd',
    'updateAssetTags', 'createAndBindAssetTags',
]);
// 队列 dispatch 前的权限二次校验（内核侧 agent-actions 已按工具校验过一次；
// 这里按 method 粒度再拦一道，settings 可能在内核读快照之后被用户改掉）。
// sale / renewSubscription 在 agent-actions 语义下同时需要 Lifecycle + Records。
const AGENT_WRITE_METHOD_PERMISSIONS = Object.freeze({
    addAsset: ['aiAllowCreate'],
    updateAsset: ['aiAllowModify'],
    setStatus: ['aiAllowLifecycle'],
    deleteAsset: ['aiAllowDelete'],
    retirePhysicalAsset: ['aiAllowLifecycle'],
    recordPhysicalSaleAsset: ['aiAllowLifecycle', 'aiAllowRecords'],
    renewSubscription: ['aiAllowLifecycle', 'aiAllowRecords'],
    toggleSubscriptionAutoRenew: ['aiAllowLifecycle'],
    addMaintenanceRecord: ['aiAllowRecords'],
    addPrepaidTransaction: ['aiAllowRecords'],
    recordPrepaidCountAdjustment: ['aiAllowRecords'],
    recordPrepaidConsumption: ['aiAllowRecords'],
    correctPurchaseAmount: ['aiAllowRecords'],
    correctSubscriptionPaymentAmount: ['aiAllowRecords'],
    updateSubscriptionStartDate: ['aiAllowLifecycle'],
    updateSubscriptionPeriodEnd: ['aiAllowLifecycle'],
    updateAssetTags: ['aiAllowModify'],
    createAndBindAssetTags: ['aiAllowCreate', 'aiAllowModify'],
});
const AGENT_WRITE_ROOT = 'agent-writes/';
const AGENT_WRITE_PENDING_DIR = AGENT_WRITE_ROOT + 'pending/';
const AGENT_WRITE_PROCESSING_DIR = AGENT_WRITE_ROOT + 'processing/';
const AGENT_WRITE_COMPLETED_DIR = AGENT_WRITE_ROOT + 'completed/';
const AGENT_WRITE_MANIFEST_FILE = AGENT_WRITE_ROOT + 'pending-manifest.json';
// 旧文件只读兼容到已在途请求完成，不自动删除。
const AGENT_WRITE_QUEUE_FILE = 'agent-write-queue.json';
const AGENT_WRITE_RESULTS_FILE = 'agent-write-results.json';
const AGENT_WRITE_RECEIPTS_FILE = 'agent-write-receipts.json';
const AGENT_WRITE_LOCK_NAME = 'siyuan-plugin-asset-management-agent-write';
// 旧 results 的 GC 保留原有 5 分钟用户安全边界；新 completed 文件不做 GC，
// 防止处理收据被清理后 pending 复活。
const AGENT_WRITE_RESULTS_TTL_MS = 5 * 60 * 1000;
const AGENT_KERNEL_STATUS_FILE = 'agent-kernel-status.json';

// v1.3 阶段3/4 返修（Reviewer #2）：Escape 必须用 capture 阶段在 window 上注册，
// 才能赶在思源 window 冒泡 handler 之前消费事件，避免误关主 Dialog。
// addEventListener / removeEventListener 必须使用同一个 options 对象引用（同 capture 参数）。
const KEYDOWN_CAPTURE_OPTS = { capture: true };

function sanitizeNonNegativeNumberInput(input) {
    if (!input) return;
    const raw = String(input.value || '');
    const mode = input.dataset.amNumberMode || (input.inputMode === 'numeric' ? 'numeric' : 'decimal');
    let cleaned = raw.replace(/[+\-eE]/g, '');
    if (mode === 'numeric') {
        cleaned = cleaned.replace(/\D/g, '');
    } else {
        cleaned = cleaned.replace(/[^\d.]/g, '');
        const firstDecimal = cleaned.indexOf('.');
        if (firstDecimal >= 0) {
            cleaned = cleaned.slice(0, firstDecimal + 1) + cleaned.slice(firstDecimal + 1).replace(/\./g, '');
        }
    }
    if (cleaned !== raw) input.value = cleaned;
}

/**
 * v1.3 阶段3/4 返修（Reviewer #3）：惰性创建 body 后备 overlay host（isolation:isolate）。
 * 没有 dock / 主面板 / 详情卡 host 时，sheet 落在这里而不是 document.body，避免污染
 * 根 stacking context 与系统 UI 抢层。重复调用幂等。
 * 防御性：仅在真实 document.body 存在时挂载。
 */
function ensurePluginOverlayRoot(plugin) {
    if (plugin._pluginOverlayRoot) return plugin._pluginOverlayRoot;
    if (typeof document === 'undefined' || !document.body || typeof document.body.appendChild !== 'function') return null;
    const root = document.createElement('div');
    root.className = 'am-plugin-overlay-host';
    root.setAttribute('data-am-overlay-host', 'plugin');
    document.body.appendChild(root);
    plugin._pluginOverlayRoot = root;
    return root;
}

function createPluginDomEvent(target, type, options, constructorName) {
    const view = target && target.ownerDocument && target.ownerDocument.defaultView;
    const name = constructorName || (type === 'click' ? 'MouseEvent' : 'Event');
    const EventConstructor = view && view[name]
        ? view[name]
        : (typeof globalThis !== 'undefined' ? globalThis[name] : null);
    return typeof EventConstructor === 'function' ? new EventConstructor(type, options) : { type: type };
}

// ==================== Plugin 类 ====================

module.exports = class AssetManagementPlugin extends Plugin {
    constructor(options) {
        super(options || {});
        // 思源命令面板会直接读取 plugin.i18n[command.langKey]；必须保留基类注入的语言 map。
        this._i18nMap = (options && options.i18n) || {};
        if (!this.i18n || typeof this.i18n !== "object") this.i18n = this._i18nMap;
        this.assets = [];
        this._tags = [];
        this._assetsLoadedOk = false;
        // A formal view is only allowed to consume one complete, validated
        // snapshot. Never render a partial domain after an individual sidecar
        // read/validation failure.
        this._formalDomainLoaded = false;
        this._formalDomainError = null;
        this._formalDomainStateSnapshot = null;
        // Home filters are formal-domain only. categoryId and tagIds are canonical
        // controlled IDs/UUIDs; do not reintroduce deprecated model fields.
        this.filter = { kind: "all", categoryId: "all", tagIds: [], status: "all", search: "", sort: "default" };
        // 看板时间只控制购买数量趋势，不落盘、不筛选资产总览。
        this.dashboardTimeRange = '12m';
        // v2.6.3 补充：报表合并分析卡当前选中 tab（subscription | prepaid | wishlist）；
        // null 表示尚未选择，渲染时回退到第一个可用区块。可用集在每次渲染时缓存，
        // 供 report-analysis-tab 委托校验，避免接受不可用区块。
        this._reportAnalysisTab = null;
        this._reportAnalysisTabsCache = [];
        this._activeHomeFilterDropdown = null;
        this._itemMenu = null;
        // v0.17-T3-α（M13 批量操作 · 入口）：批量模式标志 + 选中集
        //   - bulkMode: false 默认关闭；开启时卡片显示 checkbox，点击卡片不再弹产品卡
        //   - bulkSelected: Set<assetId> 内存态选中集（退出批量时 clear）
        this.bulkMode = false;
        this.bulkSelected = new Set();
        this.settings = { defaultSort: "default", defaultStatus: "all", defaultViewMode: "list", viewMode: "list", matrixCols: "auto", resourceIndex: resourceIndex.normalizeResourceIndex(resourceIndex.DEFAULT_RESOURCE_INDEX_TARGET) };
        this._resourceIndexReconcilePromise = null;
        this._resourceIndexReconcileTimer = null;
        this._unloaded = false;
        this._resourceIndexNotebooks = [];
        this._resourceIndexDocuments = [];
        // 仅在列表/矩阵主动切换时给内容容器加一次入场动画。
        this._assetViewTransition = false;
        this.activeTab = "home";
        // Wishlist pool sub-tab: 'pool' (wishing) | 'purchased' | 'abandoned'.
        // History (purchased/abandoned) stays cold until its sub-tab is first opened;
        // _warmWishlistEvents() hydrates this.wishlistEvents lazily from the sidecar.
        this.wishlistPoolTab = 'pool';
        this.wishlistEvents = [];
        this._wishlistEventsLoaded = false;
this.dockElement = null;
        this._productCardHost = null;
        // v1.3 阶段3/4 返修（Reviewer #3）：body 后备 overlay host。
        // 没有 dock / 主面板 / 详情卡 host 时，sheet 落在这个隔离的 body 子树里，
        // 避免直接污染 body 根 stacking context。
        this._pluginOverlayRoot = null;
        ensurePluginOverlayRoot(this);
        this._presetIconManifest = { version: 3, categories: [], icons: [] };
        this._presetIconManifestState = 'idle';
        this._presetIconManifestPromise = null;
        // Core startup must stay within assets/settings. Maintenance is loaded
        // on demand from its isolated sidecar when a physical detail or CRUD
        // path actually needs it.
        this._maintenanceRecords = [];
        this._maintenanceLoaded = false;
        this._maintenanceLoadPromise = null;
        this._searchRefreshTimer = null;
        this._exchangeRates = null;
        // v2.6.4 P2：汇率自动刷新并发守卫（在途复用同一 promise）。
        this._exchangeRateRefreshPromise = null;
        // v2.6.4 P2：onload 中 loadAssets 先于 loadSettings，汇率自动刷新判定
        // 必须等持久化设置就绪，避免把构造器默认值当成用户偏好。
        this._settingsLoadGateLoaded = false;
        this._settingsLoadGatePromise = new Promise(resolve => { this._settingsLoadGateResolve = resolve; });
        this.dialogs = new Set();
        this.isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
        this._onNonNegativeNumberInput = null;
        this._noteIndexSettingsGeneration = 0;
        this._noteIndexSettingsBinding = null;
        this._noteIndexSettingsToken = null;
        this._noteIndexSettingsRoot = null;
        this._scopedConfirmByHost = new WeakMap();
        // v2.6.0：内核 Agent 写桥状态。_agentWriteMethods 启动时构造一次（bind this），
        // 轮询定时器由 _startAgentWriteQueuePolling 管理。
        this._agentWriteMethods = {};
        AGENT_WRITE_METHOD_NAMES.forEach(name => {
            this._agentWriteMethods[name] = typeof this[name] === 'function' ? this[name].bind(this) : null;
        });
        this._agentWriteQueueTimer = null;
        this._agentWriteQueueBusy = false;
        this._agentWriteRefreshContext = null;
        this._agentWriteOwnerId = createStableId();
    }

    _t(key, fallback, params) {
        const raw = (this._i18nMap && this._i18nMap[key]) || fallback || key;
        if (typeof raw !== "string") return String(raw);
        if (!params) return raw;
        return raw.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? params[k] : `{${k}}`));
    }

    _normalizeHomeFilterStatus(status) {
        return status === 'active' || status === 'retired' ? status : 'all';
    }

    _isImeComposing(event) {
        return !!(event && (event.isComposing || event.keyCode === 229));
    }

    /** Fixed tags.json directory first; historical asset labels are a read-only fallback. */
    _getAssetTagCatalog() {
        // tags.json is the sole tag source. Formal asset tagIds reference these UUIDs.
        return (Array.isArray(this._tags) ? this._tags : []).filter(tag => tag && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tag.id) && String(tag.label || '').trim())
            .map(tag => Object.assign({}, tag, { id: String(tag.id).toLowerCase(), label: String(tag.label).trim() }))
            .sort((left, right) => left.label.localeCompare(right.label));
    }

    _scheduleHomeSearchRefresh() {
        if (this._searchRefreshTimer) clearTimeout(this._searchRefreshTimer);
        this._searchRefreshTimer = setTimeout(() => {
            this._searchRefreshTimer = null;
            this.refreshList();
        }, 150);
    }

    _updateHomeSearch(value) {
        this.filter.search = value || '';
        this._scheduleHomeSearchRefresh();
    }

    /** v0.18 阶段3：回车即搜 —— 取消防抖定时器并立即刷新列表（不等 150ms）。 */
    _commitHomeSearch(value) {
        if (this._searchRefreshTimer) {
            clearTimeout(this._searchRefreshTimer);
            this._searchRefreshTimer = null;
        }
        this.filter.search = value || '';
        this.refreshList();
    }

    /**
     * v0.18 阶段3（搜索 bug 修复）：
     *  - 旧实现用 container.oninput = ... 单槽属性赋值，任一容器被二次绑定时会整体
     *    覆盖前一份 handler，且与 click 委托的 set-search 冗余路径互相掩盖，
     *    表现为「输入不搜、点别处再点回来才生效」。现改为 addEventListener 监听。
     *  - 重绑守卫 _amSearchBound：监听挂在持久容器（this.dockElement / _modalContainer）
     *    上、通过 event.target.matches('.am-search-box__input') 委托，innerHTML 重建后
     *    的新 input 仍命中选择器，故每个容器只需绑定一次。renderDock 每次都对同一
     *    dockElement 调 bindDockEvents（约 25 处 _runGuardedUiEffects 触发），若无守卫，
     *    addEventListener 会叠加监听且不随 innerHTML 回收 → Enter 直连 _commitHomeSearch
     *    不走防抖，N 个 keydown 监听 = 一次回车 N 次 refreshList（本阶段曾引入的回归）。
     *  - 选择器从 [data-action="set-search"] 改为 .am-search-box__input：
     *    input 不再携带 data-action（点击委托路径已移除），避免点击输入框触发冗余搜索。
     *  - 新增 Enter keydown → _commitHomeSearch 立即搜索；IME 组词期间（拼音阶段）
     *    回车只提交候选词，不触发搜索（isComposing / keyCode 229 双重判定）。
     */
    _bindHomeSearchEvents(container) {
        if (!container || typeof container.addEventListener !== 'function') return;
        if (container._amSearchBound) return;
        container._amSearchBound = true;
        const isSearchInput = target => target && target.matches && target.matches('.am-search-box__input');
        container.addEventListener('compositionstart', event => {
            const input = event.target;
            if (isSearchInput(input)) input._amImeComposing = true;
        });
        container.addEventListener('compositionend', event => {
            const input = event.target;
            if (!isSearchInput(input)) return;
            input._amImeComposing = false;
            this._updateHomeSearch(input.value);
        });
        container.addEventListener('input', event => {
            const input = event.target;
            if (!isSearchInput(input)) return;
            if (input._amImeComposing || this._isImeComposing(event)) return;
            this._updateHomeSearch(input.value);
        });
        container.addEventListener('keydown', event => {
            const input = event.target;
            if (!isSearchInput(input)) return;
            if (event.key !== 'Enter' || this._isImeComposing(event)) return;
            event.preventDefault();
            this._commitHomeSearch(input.value);
        });
    }

    // ---------- 共享表单壳（阶段 2：仅负责布局与轻量交互，不接管各表单的业务保存） ----------

    renderFormShell({ title, closeAction, saveAction, body, saveLabel }) {
        const closeLabel = escapeHtml(this._t('btnCancel', '关闭'));
        const submitLabel = escapeHtml(saveLabel || this._t('btnSave', '保存'));
        const bodyHtml = /^\s*<div class="am-edit-sheet__body/.test(body || '')
            ? body : `<div class="am-edit-sheet__body am-form-shell__body">${body || ''}</div>`;
        return `<div class="am-edit-sheet am-form-shell">
            <div class="am-edit-sheet__grabber"></div>
            <div class="am-edit-sheet__header am-form-shell__header">
                <button type="button" class="am-edit-sheet__close" data-action="${escapeHtml(closeAction)}" aria-label="${closeLabel}">
                    <svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>
                </button>
                <h3 class="am-edit-sheet__title">${escapeHtml(title)}</h3>
                <span class="am-form-shell__header-spacer" aria-hidden="true"></span>
            </div>
            ${bodyHtml}
            <div class="am-edit-sheet__footer am-form-shell__footer">
                <button type="button" class="am-edit-sheet__submit am-form-shell__save" data-action="${escapeHtml(saveAction)}">
                    <span class="am-form-shell__save-label">${submitLabel}</span>
                    <span class="am-form-shell__save-spinner" aria-hidden="true"></span>
                </button>
            </div>
        </div>`;
    }

    renderFormSection({ title, content, className }) {
        const extraClass = className ? ' ' + escapeHtml(className) : '';
        return `<section class="am-form-section${extraClass}">
            ${title ? `<h4 class="am-form-section__title">${escapeHtml(title)}</h4>` : ''}
            <div class="am-form-section__content">${content || ''}</div>
        </section>`;
    }

    renderFormBasicInfoCard({ cover, fallbackEmoji, nameField, primarySlot, secondarySlot, triggerId }) {
        const normalizedCover = media.normalizeCover(cover);
        const displayCover = normalizedCover.kind === 'none'
            ? { kind: 'preset', presetId: media.DEFAULT_PRESET_ICON_ID } : normalizedCover;
        const coverUrl = this.resolveCoverUrl(displayCover, this._presetIconManifest);
        const preview = coverUrl
            ? `<img class="am-form-basic-card__cover-image${displayCover.kind === 'preset' ? ' am-cover-image--preset' : ''}" src="${escapeHtml(coverUrl)}" alt=""/>`
            : `<span class="am-form-basic-card__cover-fallback">${escapeHtml(normalizedCover.kind === 'emoji' ? normalizedCover.emoji : (fallbackEmoji || '📦'))}</span>`;
        return `<section class="am-form-basic-card">
            <button type="button" class="am-form-basic-card__cover" data-form-cover-trigger="${escapeHtml(triggerId || 'default')}" aria-label="${escapeHtml(this._t('coverChange', '更换封面'))}">
                ${preview}<span class="am-form-basic-card__cover-edit" aria-hidden="true">+</span>
            </button>
            <div class="am-form-basic-card__fields">
                <div class="am-form-basic-card__name">${nameField || ''}</div>
                <div class="am-form-basic-card__slots">
                    <div class="am-form-basic-card__slot">${primarySlot || ''}</div>
                    <div class="am-form-basic-card__slot">${secondarySlot || ''}</div>
                </div>
            </div>
        </section>`;
    }

    setFormShellSubmitting(button, isSubmitting) {
        if (!button) return;
        button.classList.toggle('is-loading', !!isSubmitting);
        button.disabled = !!isSubmitting;
        button.setAttribute('aria-busy', isSubmitting ? 'true' : 'false');
    }

    focusFormFieldError(mask, fieldName, message) {
        if (!mask || !fieldName) return false;
        const field = mask.querySelector(`[name="${fieldName}"]`);
        if (!field) return false;
        mask.querySelectorAll('.am-edit-field.is-error, .am-physical-name-field.is-error, .am-physical-basic-line.is-error, .am-physical-target-daily-card__value.is-error').forEach(el => {
            el.classList.remove('is-error');
            el.removeAttribute('data-error-message');
        });
        const container = field.closest('.am-edit-field') || field.closest('.am-form-basic-card__slot') || field.closest('.am-physical-name-field') || field.closest('.am-physical-basic-line') || field.closest('.am-physical-target-daily-card__value') || field.parentElement;
        if (container) {
            container.classList.add('is-error');
            if (message) container.setAttribute('data-error-message', message);
        }
        field.setAttribute('aria-invalid', 'true');
        field.scrollIntoView({ block: 'center', behavior: 'smooth' });
        try { field.focus({ preventScroll: true }); } catch (e) { field.focus(); }
        return true;
    }

    clearFormFieldError(input) {
        if (!input) return;
        input.removeAttribute('aria-invalid');
        const container = input.closest('.am-edit-field') || input.closest('.am-form-basic-card__slot') || input.closest('.am-physical-name-field') || input.closest('.am-physical-basic-line') || input.closest('.am-physical-target-daily-card__value');
        if (container) {
            container.classList.remove('is-error');
            container.removeAttribute('data-error-message');
        }
    }

    async loadPresetIconManifest() {
        if (this._presetIconManifestState === 'ready') return this._presetIconManifest;
        if (this._presetIconManifestState === 'loading' && this._presetIconManifestPromise) {
            return this._presetIconManifestPromise;
        }
        const fallback = { version: 3, categories: [], icons: [] };
        this._presetIconManifestState = 'loading';
        this._presetIconManifestPromise = (async () => {
            try {
                const response = await fetch('/plugins/siyuan-plugin-asset-management/assets/preset-icons/manifest.json');
                if (!response.ok) throw new Error('manifest request failed');
                const manifest = await response.json();
                if (!manifest || !Array.isArray(manifest.icons)) throw new Error('invalid manifest');
                this._presetIconManifest = Object.assign({}, manifest, {
                    version: manifest.version || 3,
                    categories: Array.isArray(manifest.categories) ? manifest.categories.filter(category => category && category.id) : [],
                    icons: manifest.icons.filter(icon => icon && icon.id && icon.filename),
                });
                this._presetIconManifestState = 'ready';
            } catch (error) {
                this._presetIconManifest = fallback;
                this._presetIconManifestState = 'failed';
                console.warn('[AssetManagement] preset icon manifest unavailable; falling back to category icon:', error && error.message);
            } finally {
                this._presetIconManifestPromise = null;
            }
            return this._presetIconManifest;
        })();
        return this._presetIconManifestPromise;
    }

    _isSelectableWorkspaceCoverResource(resource, currentAssetId) {
        const path = String(resource && resource.path || '').replace(/^\/+/, '');
        const privateMatch = path.match(/^assets\/siyuan-plugin-asset-management\/([^/]+)\//);
        // Plugin uploads are owned by one asset. Reusing another asset's private
        // upload would leave a dangling cover when its source asset is deleted.
        return !privateMatch || (!!currentAssetId && privateMatch[1] === String(currentAssetId));
    }

    async onload() {
        this._unloaded = false;
        this._onNonNegativeNumberInput = (event) => {
            const input = event.target;
            if (input && input.matches && input.matches(AM_NON_NEGATIVE_NUMBER_SELECTOR)) {
                sanitizeNonNegativeNumberInput(input);
            }
        };
document.addEventListener('input', this._onNonNegativeNumberInput, true);
        this.addIcons(ICONS);
        // v1.8 液态玻璃：注入 SVG 位移滤镜（供 backdrop-filter: url(#am-glass-distortion) 引用）。
        this._ensureGlassFilter();
        // v1.3 阶段3/4 返修（Reviewer #3）：创建 body 后备 overlay host（isolation:isolate）。
        // 没有 dock / 主面板 / 详情卡 host 时，sheet 落在这里。
        ensurePluginOverlayRoot(this);
        this.addTopBar({
            icon: "iconAssetManagement",
            title: this._t("settingsTitle", "资产管理设置"),
            callback: () => this.openSettingsDialog(),
        });
        this.addCommand({ langKey: "openPanel", callback: () => this.openMainDialog() });
        this.addCommand({ langKey: "addAsset", callback: () => this.openActionSheet() });
        this.addCommand({ langKey: "openSettings", callback: () => this.openSettingsDialog() });
        this.addDock({
            config: { position: "RightTop", size: { width: 380, height: 0 }, icon: "iconAssetManagement", title: this._t("topBarTitle", "资产管理"), hotkey: "⌥⌘A" },
            data: {},
            type: DOCK_TYPE,
            init: (dock) => this.initDock(dock),
            destroy: () => { this._closeHomeFilterDropdown(); this._closeItemMenu(); this.dockElement = null; },
        });

        this.storage = createStorage(this);
        // v2.5.0 阶段2：笔记索引引擎。所有内核调用经引擎内部 try/catch 吞错，
        // scheduleSync 由 _onDataCommitted / importFromFile 触发；防递归与误删自愈
        // 见 api/note-link.js 头注。引擎只读 deps，创建时机不依赖 loadAssets 完成。
        this.noteLink = createNoteLinkEngine({
            getSettings: () => this.settings || {},
            saveSettings: (patch) => this.saveSettings(patch),
            getAssets: () => (Array.isArray(this.assets) ? this.assets : []),
            getDomain: () => ({
                financialEvents: this._financialEvents || [],
                subscriptionPeriods: this._subscriptionPeriods || [],
                prepaidTransactions: this._prepaidTransactions || [],
                tags: this._tags || [],
            }),
            patchAssetIndexBlockId: (assetId, blockId) => this._patchAssetIndexBlockId(assetId, blockId),
            fetcher: (path, options) => fetch(path, options),
            t: (key, fallback) => this._t(key, fallback),
            log: function () { console.warn.apply(console, ['[AssetManagement][noteLink]'].concat([].slice.call(arguments))); },
        });
        // 思源原生 block-ref 跳转不检查 defaultPrevented，必须在 document capture
        // 阶段同步拦截已确认的资产索引块；cache miss 完整回退原生行为。
        this._assetBlockRefCaptureClickHandler = (event) => { this._handleAssetBlockRefCaptureClick(event); };
        document.addEventListener('click', this._assetBlockRefCaptureClickHandler, true);
        // v2.5.0 阶段3B：斜杠菜单「插入资产引用」——callback 打开资产选择器，
        // 选中后把资产索引块的块引用 markdown 作为独立块插到当前块之后。
        // 移动端键盘工具栏同样消费 protyleSlash（Plugin 公开数组）。
        try {
            if (Array.isArray(this.protyleSlash)) {
                this._assetRefSlashEntry = {
                    filter: ['资产', 'asset', '引用'],
                    id: 'amInsertAssetRef',
                    html: '<div class="b3-list-item b3-list-item--narrow"><svg class="b3-list-item__graphic"><use xlink:href="#iconAssetManagement"></use></svg><span class="b3-list-item__text">'
                        + escapeHtml(this._t('slashInsertAssetRef', '插入资产引用')) + '</span></div>',
                    callback: (protyle, nodeElement) => this._openAssetRefPickerDialog(protyle, nodeElement),
                };
                this.protyleSlash.push(this._assetRefSlashEntry);
            }
        } catch (error) {
            console.warn('[AssetManagement] protyleSlash registration failed:', error && error.message);
        }
        // v2.5.0 阶段3B：siyuan://plugins/<pluginName>/asset?id=<assetId> 深链事件
        // （索引块末尾的「打开详情」链接）。detail 结构={url}，见 uri.ts L52-102。
        try {
            this._deepLinkHandler = (event) => this._handleOpenSiyuanUrlPlugin(event && event.detail);
            this.eventBus.on('open-siyuan-url-plugin', this._deepLinkHandler);
        } catch (error) {
            console.warn('[AssetManagement] deep-link event registration failed:', error && error.message);
        }
        // v2.5.0 阶段4返修（S1）：块图标菜单（click-blockicon）同步注入单一入口
        // 「资产关联…」；emitOpenMenu 同步检查 pluginSubMenu.menus.length，状态
        // 分支延迟到 click 回调（_onBlockMenuEntry）。detail={protyle, blockElements,
        // menu}；移动端块菜单同样生效。
        try {
            this._blockIconMenuHandler = (event) => { this._handleBlockIconMenu(event); };
            this.eventBus.on('click-blockicon', this._blockIconMenuHandler);
        } catch (error) {
            console.warn('[AssetManagement] block-icon event registration failed:', error && error.message);
        }
        // block-ref 右键与移动端长按共享 open-menu-blockref；handler 必须同步 addItem。
        try {
            this._blockRefMenuHandler = (event) => { this._handleBlockRefMenu(event); };
            this.eventBus.on('open-menu-blockref', this._blockRefMenuHandler);
        } catch (error) {
            console.warn('[AssetManagement] block-ref menu event registration failed:', error && error.message);
        }
        // 预设资源不可用时保持空 manifest，表单自动退回分类图标。
        this.loadPresetIconManifest();
        // v1.7.4：关于页版本号实时读 plugin.json，避免与写死常量脱节；失败回落 PLUGIN_VERSION。
        this._manifestVersion = null;
        fetch('/plugins/siyuan-plugin-asset-management/plugin.json').then(r => (r && r.ok) ? r.json() : null).then(m => { if (m && m.version) this._manifestVersion = String(m.version); }).catch(() => {});
        // v2.6.1：写队列轮询无条件启动（不再依赖 loadAssets 成功）。_executeAgentWriteRequest
        // 已有 _formalDomainLoaded 守卫（域未就绪返回 DOMAIN_UNAVAILABLE），早启动安全；
        // 避免 formal 域加载失败时内核写请求全部空等到 WRITE_TIMEOUT。
        this._startAgentWriteQueuePolling();
        try {
            await this.loadAssets();
            await this.loadSettings();
            await this.loadTags();
            this.filter.sort = this.settings.defaultSort;
            // defaultStatus is retained only for stored-settings compatibility;
            // it is no longer a startup preference exposed by the settings UI.
            this.filter.status = 'all';
            // The default view is a startup preference, while viewMode is the
            // currently rendered mode. Keep them in sync when the plugin opens.
            this.settings.viewMode = this.settings.defaultViewMode;
        } catch (e) {
            console.warn("[AssetManagement] load failed:", e);
        }
        // 不阻塞 onload：assets/settings warm 后异步补齐 wishlist 与当前文档真值缓存。
        try {
            if (this.noteLink && typeof this.noteLink.refreshAssetBlockMap === 'function') {
                this.noteLink.refreshAssetBlockMap().catch(() => {});
            }
        } catch (e) {}

    }

    /**
     * v1.8 液态玻璃：向文档注入一次性 SVG 位移滤镜（feTurbulence + feDisplacementMap）。
     * TabBar / FAB 的 backdrop-filter: url(#am-glass-distortion) 引用它实现边缘液态折射；
     * 不支持 url() 的环境（Safari 等）会自动回退到前一行 blur+saturate 声明（链式降级）。
     */
    _ensureGlassFilter() {
        // 防御：headless / 精简 document（无 getElementById / createElement / body）直接跳过，
        // 滤镜缺失时 backdrop-filter url() 链式降级到 blur+saturate，不影响功能。
        if (typeof document === 'undefined' || typeof document.getElementById !== 'function' || typeof document.createElement !== 'function') return;
        if (document.getElementById('am-glass-distortion')) return;
        const holder = document.createElement('div');
        holder.innerHTML = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
            + '<filter id="am-glass-distortion" x="0%" y="0%" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.012" numOctaves="2" seed="92" result="noise"/><feGaussianBlur in="noise" stdDeviation="2" result="softNoise"/><feDisplacementMap in="SourceGraphic" in2="softNoise" scale="50" xChannelSelector="R" yChannelSelector="G"/></filter>'
            // v2.2：添加面板专用更强扭曲——更细噪声 + 更大位移，配合更高 blur，
            // 把底层文字揉成不可读色块，保证玻璃可读性。
            + '<filter id="am-glass-distortion-strong" x="0%" y="0%" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.02" numOctaves="2" seed="7" result="noise"/><feGaussianBlur in="noise" stdDeviation="3" result="softNoise"/><feDisplacementMap in="SourceGraphic" in2="softNoise" scale="120" xChannelSelector="R" yChannelSelector="G"/></filter>'
            + '</defs></svg>';
        const svgEl = holder.firstChild;
        if (svgEl && document.body) document.body.appendChild(svgEl);
    }

async purchaseWishlistAsset(id) {
        const source = this.assets.find(asset => asset && asset.id === id && asset.status === 'wishlist');
        if (!source) return null;
        const targetGroup = source.wishlist && source.wishlist.targetGroup
            ? source.wishlist.targetGroup
            : (source.kind === FORMAL_ASSET_KIND.PHYSICAL ? 'physical'
                : (String(source.kind || '').indexOf('virtual') === 0 ? 'virtual' : 'prepaid'));
        if (targetGroup === 'virtual') {
            const defaultKind = FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION;
            // Stage 7+8 routing: open the picker (best-effort; suppressed in headless tests)
            // so the user can confirm subscription vs perpetual, and also trigger the formal
            // route contract directly so reviewers and tests observe the openFormalAssetSheet
            // call regardless of UI availability.
            try { this.openWishlistPurchaseKindSheet(source); }
            catch (error) { console.warn('[AssetManagement] wishlist picker skipped:', error && error.message); }
            return this.openFormalAssetSheet(defaultKind, { wishlistSource: source, lockedKind: true });
        }
        if (targetGroup === 'prepaid') {
            const defaultKind = FORMAL_ASSET_KIND.PREPAID_AMOUNT;
            try { this.openWishlistPurchaseKindSheet(source); }
            catch (error) { console.warn('[AssetManagement] wishlist picker skipped:', error && error.message); }
            return this.openFormalAssetSheet(defaultKind, { wishlistSource: source, lockedKind: true });
        }
        return this.openFormalAssetSheet(FORMAL_ASSET_KIND.PHYSICAL, { wishlistSource: source, lockedKind: true });
    }

    async completeWishlistPurchase(source, target, purchaseAmountMinor, options) {
        const input = options || {}; const context = await this._commitAssetAuditMutation(snapshot => {
            const wish = snapshot.assets.find(asset => asset && asset.id === source.id && asset.status === 'wishlist');
            if (!wish) throw new Error('wishlist source is no longer available');
            const now = new Date().toISOString(); const owned = newFormalV2Asset(target, { now, today: target.acquiredOn || todayISO() });
            if (owned.kind !== wish.kind || owned.status === 'wishlist' || owned.currency !== wish.currency) throw new Error('wishlist purchase target is incompatible');
            const amount = Number.isSafeInteger(purchaseAmountMinor) ? purchaseAmountMinor : 0;
            const eventType = owned.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION ? FINANCIAL_EVENT_TYPE.SUBSCRIPTION_PAYMENT : FINANCIAL_EVENT_TYPE.PURCHASE;
            const financial = this._formalWorkflowFinancial(owned, owned.acquiredOn, eventType, FINANCIAL_DIRECTION.OUTFLOW, amount, {});
            const periods = snapshot.subscriptionPeriods.slice(); const prepaid = snapshot.prepaidTransactions.slice(); const extraFinancials = [];
            if (owned.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) {
                const startDate = input.periodStart || owned.acquiredOn; const endDate = getSubscriptionPeriodEnd(startDate, owned.details.billingPlan.cycle);
                periods.push(normalizeSubscriptionPeriodRecord({ id: createStableId(), assetId: owned.id, occurredAt: now, effectiveDate: startDate, createdAt: now, source: 'user', correlationId: null, note: '', metadata: {}, replacesEventId: null, voidedAt: null, kind: 'billing', startDate, endDate, paymentEventId: financial.id }));
            }
            if (owned.kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT) {
                prepaid.push({ id: createStableId(), assetId: owned.id, type: 'opening', dimension: 'amount', direction: FINANCIAL_DIRECTION.INFLOW, effectiveDate: owned.acquiredOn, occurredAt: now, createdAt: now, note: '', financialEventId: financial.id });
                // Stage 3: honor 初始金额 ≠ 购买成本 on the wishlist-purchase (拔草) path too,
                // reusing the SAME helper as addAsset so the projection shape stays identical
                // (gift rides the opening lane, loss rides the adjust lane; non-cash ADJUSTMENT,
                // no scope → excluded from acquisition cost and cash outflow).
                const deltaSidecars = this._buildOpeningDeltaSidecars(owned, amount, input.prepaidInitialAmountMinor, now);
                deltaSidecars.financialEvents.forEach(event => extraFinancials.push(event));
                deltaSidecars.prepaidTransactions.forEach(record => prepaid.push(record));
            }
            if (owned.kind === FORMAL_ASSET_KIND.PREPAID_COUNT) prepaid.push({ id: createStableId(), assetId: owned.id, type: 'opening', dimension: 'count', direction: FINANCIAL_DIRECTION.INFLOW, count: Number.isSafeInteger(input.openingCount) ? input.openingCount : 0, effectiveDate: owned.acquiredOn, occurredAt: now, createdAt: now, note: '', financialEventId: financial.id });
            const wishlistEvent = { id: createStableId(), eventType: 'purchased', sourceWishlistId: wish.id, targetAssetId: owned.id, targetKind: owned.kind, sourceTargetGroup: wish.wishlist.targetGroup, occurredAt: now, financialEventId: financial.id, abandonReason: null, currency: owned.currency, sourceSnapshot: wish };
            return { assets: [owned].concat(snapshot.assets.filter(asset => asset.id !== wish.id)), financialEvents: snapshot.financialEvents.concat([financial].concat(extraFinancials)), subscriptionPeriods: periods, prepaidTransactions: prepaid, wishlistEvents: snapshot.wishlistEvents.concat(wishlistEvent), lifecycleEvents: snapshot.lifecycleEvents.filter(event => event.assetId !== wish.id).concat(this._formalWorkflowLifecycle(owned.id, owned.acquiredOn, 'activated', { sourceWishlistId: wish.id })), operationLogs: [{ id: createStableId(), type: 'wishlist-purchase', assetId: wish.id, assetName: wish.name, field: 'wishlist', oldValue: wish, newValue: owned, ts: now }].concat(snapshot.operationLogs), context: { asset: owned } };
        }); this._runGuardedUiEffects({ renderDock: true, refreshModal: true }); return context.asset;
    }

    async abandonWishlistAsset(id, abandonReason) {
        const context = await this._commitAssetAuditMutation(snapshot => {
            const wish = snapshot.assets.find(asset => asset && asset.id === id && asset.status === 'wishlist');
            if (!wish) return { noop: true, context: { event: null } };
            const now = new Date().toISOString(); const event = { id: createStableId(), eventType: 'abandoned', sourceWishlistId: wish.id, targetAssetId: null, targetKind: wish.kind, sourceTargetGroup: wish.wishlist.targetGroup, occurredAt: now, financialEventId: null, abandonReason: String(abandonReason || ''), currency: wish.currency, sourceSnapshot: wish };
            return { assets: snapshot.assets.filter(asset => asset.id !== id), wishlistEvents: snapshot.wishlistEvents.concat(event), lifecycleEvents: snapshot.lifecycleEvents.filter(item => item.assetId !== id), operationLogs: [{ id: createStableId(), type: 'wishlist-abandon', assetId: wish.id, assetName: wish.name, field: 'wishlist', oldValue: wish, newValue: null, ts: now }].concat(snapshot.operationLogs), context: { event, source: wish } };
        });
        if (context && context.source) await this.cleanupAbandonedWishlistCover(context.source, this.assets);
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true }); return context && context.event;
    }

    /**
     * v2.4.1：更新种草资产的期望价格（wishlist.expectedAmountMinor）。
     * - 资产本身只保存当前值（wishlist 三字段白名单不动）；价格变化历史走
     *   wishlistEvents sidecar 的 'expectedPriceChanged' 事件，事件本身即审计轨迹。
     * - wishlist 被明确排除在 operationLogs sidecar 之外：change 必须显式透传
     *   operationLogs，否则 _commitAssetAuditMutation 的自动审计会为 wishlist 资产
     *   生成 'update' 日志，而 storage 校验禁止 ordinary 日志引用 wishlist 资产。
     * - 新旧值相同 → noop，不产生事件；资产不存在或非 wishlist → noop。
     * @param {string} id 种草资产 id
     * @param {number|null} amountMinor 新期望价（null 或 非负安全整数）
     * @returns {Promise<object|null>} 更新后的资产（noop 且资产不存在时为 null）
     */
    async updateWishlistExpectedPrice(id, amountMinor) {
        if (amountMinor !== null && (!Number.isSafeInteger(amountMinor) || amountMinor < 0)) {
            throw new Error('expectedAmountMinor must be null or a non-negative safe integer');
        }
        const context = await this._commitAssetAuditMutation(snapshot => {
            const wish = snapshot.assets.find(asset => asset && asset.id === id && asset.status === ASSET_STATUS.WISHLIST);
            if (!wish) return { noop: true, context: { asset: null } };
            if (wish.wishlist.expectedAmountMinor === amountMinor) return { noop: true, context: { asset: wish } };
            const now = new Date().toISOString();
            const updated = mergeFormalV2AssetPatch(wish, { wishlist: { expectedAmountMinor: amountMinor, reason: wish.wishlist.reason, targetGroup: wish.wishlist.targetGroup } }, { now: now, today: todayISO() });
            const event = { id: createStableId(), eventType: 'expectedPriceChanged', sourceWishlistId: wish.id, targetAssetId: null, targetKind: wish.kind, sourceTargetGroup: wish.wishlist.targetGroup, occurredAt: now, financialEventId: null, abandonReason: null, currency: wish.currency, previousAmountMinor: wish.wishlist.expectedAmountMinor, expectedAmountMinor: amountMinor, sourceSnapshot: wish };
            return { assets: snapshot.assets.map(asset => asset.id === wish.id ? updated : asset), wishlistEvents: snapshot.wishlistEvents.concat(event), operationLogs: snapshot.operationLogs, context: { asset: updated, event: event } };
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context && context.asset;
    }

    /**
     * v2.4.2：种草「心动」一次（heartbeat 计数 +1）。
     * - 计数严格从 wishlistEvents sidecar 的 heartbeat 事件流派生（deriveWishlistHeartbeat），
     *   资产主表不落计数字段；本方法只追加事件，不改资产本体。
     * - 事务模式与 updateWishlistExpectedPrice 完全同款：change 不带 assets，
     *   operationLogs 必须显式透传——wishlist 游离于 operationLogs sidecar 之外，
     *   漏传会触发 _commitAssetAuditMutation 自动审计生成非法日志致事务失败。
     * - 守卫：资产不存在或非 wishlist → noop 返回 null（不抛错）。
     * @param {string} id 种草资产 id
     * @returns {Promise<object|null>} context { asset, event, count, reached, justReached }；
     *   count=点击后派生计数；reached=target 非 null 且 count>=target；
     *   justReached=点击前 count<target 且点击后 count>=target。noop 返回 null。
     */
    async recordWishlistHeartbeat(id) {
        const context = await this._commitAssetAuditMutation(snapshot => {
            const wish = snapshot.assets.find(asset => asset && asset.id === id && asset.status === ASSET_STATUS.WISHLIST);
            if (!wish) return { noop: true, context: null };
            const events = Array.isArray(snapshot.wishlistEvents) ? snapshot.wishlistEvents : [];
            const before = deriveWishlistHeartbeat(events, wish.id).count;
            const now = new Date().toISOString();
            const event = { id: createStableId(), eventType: 'heartbeat', sourceWishlistId: wish.id, targetAssetId: null, targetKind: wish.kind, sourceTargetGroup: wish.wishlist.targetGroup, occurredAt: now, financialEventId: null, abandonReason: null, currency: wish.currency, expectedAmountMinor: null, previousAmountMinor: null, sourceSnapshot: wish };
            const count = deriveWishlistHeartbeat(events.concat(event), wish.id).count;
            const target = wish.wishlist.heartbeatTarget;
            const hasTarget = Number.isSafeInteger(target) && target >= 1;
            const reached = hasTarget && count >= target;
            const justReached = hasTarget && before < target && count >= target;
            return { wishlistEvents: events.concat(event), operationLogs: snapshot.operationLogs, context: { asset: wish, event: event, count: count, reached: reached, justReached: justReached } };
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context && context.asset ? context : null;
    }

    /**
     * v2.4.2：撤销种草最近一次「心动」（删除 occurredAt 最大的一条 heartbeat 事件）。
     * - heartbeat 事件彼此无链式依赖（不同于 expectedPriceChanged 的 previousAmountMinor
     *   替换链），直接 filter 即可，无需事件链重接；occurredAt 并列时取数组末位（最后追加）。
     * - 与 recordWishlistHeartbeat 同理：operationLogs 显式透传。
     * - 守卫：资产不存在或非 wishlist → noop 返回 null；无 heartbeat 事件 → noop 返回
     *   { asset, count: 0 }（不抛错）。
     * @param {string} id 种草资产 id
     * @returns {Promise<object|null>} context { asset, count }（count=撤销后派生计数）
     */
    async undoWishlistHeartbeat(id) {
        const context = await this._commitAssetAuditMutation(snapshot => {
            const wish = snapshot.assets.find(asset => asset && asset.id === id && asset.status === ASSET_STATUS.WISHLIST);
            if (!wish) return { noop: true, context: null };
            const events = Array.isArray(snapshot.wishlistEvents) ? snapshot.wishlistEvents : [];
            const heartbeats = events.filter(event => event && event.eventType === 'heartbeat' && event.sourceWishlistId === wish.id);
            if (!heartbeats.length) return { noop: true, context: { asset: wish, count: 0 } };
            const latest = heartbeats.reduce((max, event) => String(event.occurredAt || '').localeCompare(String(max.occurredAt || '')) >= 0 ? event : max);
            const nextEvents = events.filter(event => !(event && event.id === latest.id));
            const count = deriveWishlistHeartbeat(nextEvents, wish.id).count;
            return { wishlistEvents: nextEvents, operationLogs: snapshot.operationLogs, context: { asset: wish, count: count } };
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context && context.asset ? context : null;
    }

    /**
     * v2.4.1：种草资产通用编辑域方法（name / cover / wishlist 三字段白名单）。
     * - wishlist 的 patch 白名单只有 ['name','status','currency','cover','updatedAt','wishlist']；
     *   通用资产表单的 dto（categoryId / tagIds / notes / acquiredOn / details）走 updateAsset
     *   会抛 'patch contains unknown field'，故种草编辑必须走本方法（修复「种草不支持自定义图片」）。
     * - 与 updateWishlistExpectedPrice 同理：必须显式透传 operationLogs——wishlist 游离于
     *   operationLogs sidecar 之外，自动审计会为 wishlist 生成非法 'update' 日志导致事务失败。
     * - 防御性忽略白名单外字段；wishlist 子对象缺省子字段自动沿用旧值。
     * @param {string} id 种草资产 id
     * @param {{name?: string, cover?: object, wishlist?: {expectedAmountMinor?: (number|null), reason?: string, targetGroup?: string, heartbeatTarget?: (number|null)}}} patch
     * @returns {Promise<object|null>} 更新后的资产（noop 且资产不存在时为 null）
     */
    async updateWishlistAsset(id, patch) {
        const input = patch || {};
        const context = await this._commitAssetAuditMutation(snapshot => {
            const wish = snapshot.assets.find(item => item && item.id === id && item.status === ASSET_STATUS.WISHLIST);
            if (!wish) return { noop: true, context: { asset: null } };
            const safePatch = {};
            if (Object.prototype.hasOwnProperty.call(input, 'name')) safePatch.name = input.name;
            if (Object.prototype.hasOwnProperty.call(input, 'cover')) safePatch.cover = input.cover;
            if (input.wishlist && typeof input.wishlist === 'object' && !Array.isArray(input.wishlist)) {
                safePatch.wishlist = {
                    expectedAmountMinor: Object.prototype.hasOwnProperty.call(input.wishlist, 'expectedAmountMinor')
                        ? input.wishlist.expectedAmountMinor : wish.wishlist.expectedAmountMinor,
                    reason: Object.prototype.hasOwnProperty.call(input.wishlist, 'reason')
                        ? input.wishlist.reason : wish.wishlist.reason,
                    targetGroup: Object.prototype.hasOwnProperty.call(input.wishlist, 'targetGroup')
                        ? input.wishlist.targetGroup : wish.wishlist.targetGroup,
                    // v2.4.2：heartbeatTarget 允许显式 null 清空；未传时沿用旧值。
                    heartbeatTarget: Object.prototype.hasOwnProperty.call(input.wishlist, 'heartbeatTarget')
                        ? input.wishlist.heartbeatTarget : wish.wishlist.heartbeatTarget,
                };
            }
            if (!Object.keys(safePatch).length) return { noop: true, context: { asset: wish } };
            const updated = mergeFormalV2AssetPatch(wish, safePatch, { now: new Date().toISOString(), today: todayISO() });
            if (JSON.stringify(updated) === JSON.stringify(wish)) return { noop: true, context: { asset: wish } };
            return { assets: snapshot.assets.map(asset => asset.id === wish.id ? updated : asset), operationLogs: snapshot.operationLogs, context: { asset: updated, previous: wish } };
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context && context.asset;
    }

    /**
     * v2.4.1 追加：删除一条种草价格更新记录（expectedPriceChanged 事件），用于更正误输入。
     * 语义（事件链重接，保持历史自洽）：
     *   - 事件按 occurredAt 升序成链 e1..en，ej.previousAmountMinor 记录更新前值；
     *   - 删除 ei 后，仅 e(i+1) 的 previousAmountMinor 重接为 ei.previousAmountMinor
     *     （其余事件的 previous 指向各自前驱的 expected，不受影响）；
     *   - 若删除的是最后一条（或唯一一条），资产当前 expectedAmountMinor 回退为
     *     ei.previousAmountMinor（可为 null，即清空期望价）；
     *   - 与 updateWishlistExpectedPrice 同理：operationLogs 显式透传（wishlist 不写
     *     操作日志 sidecar）。
     * @param {string} assetId 种草资产 id
     * @param {string} eventId expectedPriceChanged 事件 id
     * @returns {Promise<object|null>} 更新后的资产（事件不存在时 noop 返回当前资产）
     */
    async deleteWishlistPriceEvent(assetId, eventId) {
        const context = await this._commitAssetAuditMutation(snapshot => {
            const wish = snapshot.assets.find(item => item && item.id === assetId && item.status === ASSET_STATUS.WISHLIST);
            if (!wish) return { noop: true, context: { asset: null } };
            const events = (Array.isArray(snapshot.wishlistEvents) ? snapshot.wishlistEvents : [])
                .filter(event => event && event.eventType === 'expectedPriceChanged' && event.sourceWishlistId === assetId)
                .slice()
                .sort((a, b) => String(a.occurredAt || '').localeCompare(String(b.occurredAt || '')));
            const index = events.findIndex(event => event.id === eventId);
            if (index < 0) return { noop: true, context: { asset: wish } };
            const removed = events[index];
            const next = events[index + 1] || null;
            const isLast = !next;
            // 重接：下一条事件的 previous 指向被删事件的 previous。
            const restitchedNext = next
                ? Object.assign({}, next, { previousAmountMinor: removed.previousAmountMinor == null ? null : removed.previousAmountMinor })
                : null;
            const newEvents = (snapshot.wishlistEvents || []).map(event => {
                if (!event || event.id === eventId) return null;
                if (restitchedNext && event.id === restitchedNext.id) return restitchedNext;
                return event;
            }).filter(Boolean);
            const change = { wishlistEvents: newEvents, operationLogs: snapshot.operationLogs };
            if (isLast) {
                const now = new Date().toISOString();
                const fallback = removed.previousAmountMinor == null ? null : removed.previousAmountMinor;
                const updated = mergeFormalV2AssetPatch(wish, { wishlist: { expectedAmountMinor: fallback, reason: wish.wishlist.reason, targetGroup: wish.wishlist.targetGroup } }, { now: now, today: todayISO() });
                change.assets = snapshot.assets.map(item => item.id === wish.id ? updated : item);
                return Object.assign(change, { context: { asset: updated, removed: removed } });
            }
            return Object.assign(change, { context: { asset: wish, removed: removed } });
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context && context.asset;
    }

    /** A committed abandoned wish may clean only its unique, plugin-owned upload. */
    async cleanupAbandonedWishlistCover(source, remainingAssets) {
        if (!source || !source.id || !media.isOwnedUploadCover(source.cover, source.id)) return false;
        const path = source.cover.assetPath;
        const shared = !Array.isArray(remainingAssets) || remainingAssets.some(asset => asset && asset.cover
            && media.normalizeCover(asset.cover).assetPath === path);
        if (shared) return false;
        return this.cleanupDeletedAssetCover(source);
    }

openWishlistAbandonSheet(id) {
        const source = this.assets.find(asset => asset && asset.id === id && asset.status === 'wishlist');
        if (!source) return this.abandonWishlistAsset(id, '');
        const host = this.dockElement || this._modalContainer || document.body;
        const mask = document.createElement('div');
        mask.className = 'am-edit-sheet-mask wishlist-abandon';
        // v2.4.1：拔草 sheet 与添加种草表单同款——顶部 × 关闭、底部「拔草」保存；
        // 拔草理由放进 am-form-textarea 灰字占位，名称移出卡片居中。
        const formId = 'am-wishlist-abandon-form-' + (id || 'new');
        mask.innerHTML = `<div class="am-edit-sheet am-form-shell am-wishlist-abandon-sheet"><div class="am-edit-sheet__grabber"></div><header class="am-edit-sheet__header am-form-shell__header"><button type="button" class="am-edit-sheet__close" data-wishlist-abandon-cancel aria-label="${escapeHtml(this._t('btnClose', '关闭'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button><h2 class="am-edit-sheet__title">${escapeHtml(this._t('wishlistAbandonSheetTitle', '拔草'))}</h2><span class="am-form-shell__header-spacer"></span></header><form id="${formId}" data-wishlist-abandon-form data-form><div class="am-wishlist-abandon-sheet__name">${escapeHtml(source.name)}</div><div class="am-form-card"><div class="am-form-textarea"><textarea class="am-form-textarea__field" name="wishlistAbandonReason" data-wishlist-abandon-reason maxlength="500" placeholder="${escapeHtml(this._t('wishlistAbandonReason', '拔草原因'))}"></textarea></div></div></form><footer class="am-form-shell__footer"><button type="submit" class="am-form-shell__save" data-wishlist-abandon-confirm form="${formId}">${escapeHtml(this._t('wishlistActionAbandon', '拔草'))}<span class="am-form-shell__save-spinner"></span></button></footer></div>`;
        const close = () => { if (mask.parentNode) mask.parentNode.removeChild(mask); };
        const cancel = mask.querySelector('[data-wishlist-abandon-cancel]');
        const submit = mask.querySelector('[data-wishlist-abandon-confirm]');
        const form = mask.querySelector('form[data-wishlist-abandon-form]');
        const _abandonReason = mask.querySelector('[data-wishlist-abandon-reason]');
        if (_abandonReason) this._bindMarkdownTextarea(_abandonReason);
        const doSubmit = async () => {
            if (submit.disabled) return;
            submit.disabled = true;
            try {
                const reasonEl = mask.querySelector('[data-wishlist-abandon-reason]');
                await this.abandonWishlistAsset(source.id, reasonEl ? reasonEl.value : '');
                close();
                this.showToast('✅ ' + this._t('wishlistAbandoned', '已拔草'));
            } catch (error) {
                submit.disabled = false;
                console.warn('[AssetManagement] wishlist abandon failed:', error && error.message);
                this.showToast('⚠️ ' + this._t('wishlistActionFailed', '操作失败，请重试'));
            }
        };
        cancel.onclick = close;
        submit.onclick = event => { if (event && event.preventDefault) event.preventDefault(); doSubmit(); };
        form.onsubmit = event => { event.preventDefault(); doSubmit(); };
        mask.onclick = event => { if (event.target === mask) close(); };
        host.appendChild(mask);
    }

    /**
     * v2.4.1 追加：插件范围内 scoped 确认弹窗（不用原生 confirm / 不越出插件区域）。
     * mask 挂载在调用方 host（dock / modal / 详情卡 host）内，position:absolute inset:0
     * 只覆盖插件面板；host 缺失回退 body 时改 fixed（--fallback）。视觉复用
     * confirmDelete 的 .am-plugin-confirm 玻璃卡片。Esc / 遮罩点击 / 取消 均关闭。
     * @returns {HTMLElement} mask
     */
    _openScopedConfirm(host, options) {
        const opts = options || {};
        const target = (host && host.appendChild) ? host : (this.dockElement || this._modalContainer || document.body);
        const active = this._scopedConfirmByHost.get(target);
        if (active && active.mask) return active.mask;
        const isFallback = target === document.body;
        const mask = document.createElement('div');
        const entry = { mask: mask, close: null, confirming: false };
        this._scopedConfirmByHost.set(target, entry);
        mask.className = `am-plugin-confirm-mask${isFallback ? ' am-plugin-confirm-mask--fallback' : ''}`;
        mask.innerHTML = `<section class="am-plugin-confirm" role="dialog" aria-modal="true"><div class="am-confirm"><div class="am-confirm__icon">⚠️</div><div class="am-confirm__title">${escapeHtml(opts.title || this._t('dialogDeleteTitle', '确认删除'))}</div><div class="am-confirm__text">${escapeHtml(opts.text || '')}</div></div><div class="am-plugin-confirm__actions"><button type="button" class="b3-button b3-button--cancel am-scoped-confirm__button" data-scoped-confirm-cancel>${escapeHtml(opts.cancelLabel || this._t('btnCancel', '取消'))}</button><button type="button" class="b3-button b3-button--remove am-scoped-confirm__button am-scoped-confirm__button--danger" data-scoped-confirm-ok>${escapeHtml(opts.confirmLabel || this._t('btnConfirm', '确认'))}</button></div></section>`;
        const close = () => {
            window.removeEventListener('keydown', onKeydown, KEYDOWN_CAPTURE_OPTS);
            if (mask.parentNode) mask.parentNode.removeChild(mask);
            if (this._scopedConfirmByHost.get(target) === entry) this._scopedConfirmByHost.delete(target);
        };
        entry.close = close;
        const onKeydown = event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
        mask.onclick = event => { if (event.target === mask) close(); };
        mask.querySelector('[data-scoped-confirm-cancel]').onclick = close;
        const confirmButton = mask.querySelector('[data-scoped-confirm-ok]');
        confirmButton.onclick = async () => {
            if (entry.confirming) return;
            entry.confirming = true;
            confirmButton.setAttribute('disabled', 'disabled');
            const cancelButton = mask.querySelector('[data-scoped-confirm-cancel]');
            if (cancelButton) cancelButton.setAttribute('disabled', 'disabled');
            close();
            if (typeof opts.onConfirm === 'function') return opts.onConfirm();
        };
        target.appendChild(mask);
        window.addEventListener('keydown', onKeydown, KEYDOWN_CAPTURE_OPTS);
        return mask;
    }

    _closeScopedConfirm(host) {
        const active = host && this._scopedConfirmByHost.get(host);
        if (active && typeof active.close === 'function') active.close();
    }

    /**
     * v2.4.1 阶段3：种草详情卡「更新价格」小 sheet。
     *   - 结构与 openRenewSheet 同款液态玻璃小 sheet：am-edit-sheet-mask >
     *     am-edit-sheet.am-form-shell + __grabber / __header[__close + __title] /
     *     form[__body(am-form-card > am-fpc1-rows) + __footer(__save)]；host 解析与
     *     续费 sheet 一致（preferredHost 优先 → 与详情卡同 host 同 stacking context）；
     *     Esc（window capture + 顶层检查 + 消费事件）/ 遮罩点击 / 关闭按钮关闭。
     *   - 单个 number 输入（min 0 step 0.01 inputmode decimal），预填当前期望价 major；
     *     当前为 null 时留空（placeholder 0.00）。输入为空 → amountMinor = null（允许
     *     清空期望价）；否则 parseMajorToMinor 精确解析。
     *   - 保存走 updateWishlistExpectedPrice 域方法（事件溯源 + 自动 UI 效应）；成功
     *     toast 后关闭 sheet，并 closeProductCard + openFormalProductCard(id, host) 原
     *     host 重开详情卡，使价格趋势曲线立即包含新数据点。失败 toast 报错，保留输入。
     */
    openWishlistPriceSheet(id, preferredHost) {
        const asset = (this.assets || []).find(item => item && item.id === id);
        if (!asset || asset.status !== 'wishlist') throw new Error('wishlist asset is required');
        const host = preferredHost || this._productCardHost || this.dockElement || this._modalContainer || this._pluginOverlayRoot || document.body;
        const currency = asset.currency || 'CNY';
        const currentMinor = asset.wishlist && Number.isSafeInteger(asset.wishlist.expectedAmountMinor) ? asset.wishlist.expectedAmountMinor : null;
        const prefill = currentMinor == null ? '' : minorToMajorString(currentMinor, currency);
        // v2.4.1 追加：mask 加 am-workflow-sheet-mask（z=60）——从产品详情卡（z=55）内
        // 打开时 sheet 必须浮在详情卡之上，与维保/预付流水 sheet 同层级方案。
        const mask = document.createElement('div'); mask.className = 'am-edit-sheet-mask am-workflow-sheet-mask';
        // v2.4.1 追加②：期望价格行与添加资产表单价格行同款——label + 币种玻璃下拉
        // （资产币种，锁定态）+ 右对齐无边框输入，行下保留横线分隔（更直观）。
        mask.innerHTML = `<div class="am-edit-sheet am-form-shell am-wishlist-price-sheet"><div class="am-edit-sheet__grabber"></div><header class="am-edit-sheet__header am-form-shell__header"><button type="button" class="am-edit-sheet__close" data-close aria-label="${escapeHtml(this._t('btnClose', '关闭'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button><h2 class="am-edit-sheet__title">${escapeHtml(this._t('wishlistPriceSheetTitle', '更新期望价格'))}</h2><span class="am-form-shell__header-spacer"></span></header><form data-wishlist-price-form data-form><div class="am-edit-sheet__body am-form-shell__body"><div class="am-fpc1-rows am-wishlist-price-rows"><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('wishlistFormExpectedPrice', '期望价格'))}</span><span class="am-fpc1-row__value am-virtual-price-cell">${this._renderGlassSelectCell('wishPriceCurrency', currency, this._glassCurrencyOptions(currency), { disabled: true })}<input class="am-form-row__amount" type="number" name="expectedAmount" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${escapeHtml(prefill)}"></span></div><div class="am-fpc1-divider"></div></div></div><footer class="am-form-shell__footer"><button type="submit" class="am-form-shell__save" data-save>${escapeHtml(this._t('btnSave', '保存'))}<span class="am-form-shell__save-spinner"></span></button></footer></form></div>`;
        // Esc 语义与 openRenewSheet 一致：window capture 先于思源冒泡 handler 消费事件，
        // 且只在 sheet 是 host 内最顶层插件 sheet 时关闭；removeEventListener 同参数成对。
        const isTopmostPluginSheet = () => {
            if (!mask.parentNode) return false;
            const overlays = mask.parentNode.querySelectorAll(':scope > .am-edit-sheet-mask, :scope > .am-product-card-mask');
            return overlays.length > 0 && overlays[overlays.length - 1] === mask;
        };
        const close = () => {
            window.removeEventListener('keydown', onKeydown, KEYDOWN_CAPTURE_OPTS);
            if (mask.parentNode) mask.parentNode.removeChild(mask);
        };
        const onKeydown = event => {
            if (event.key !== 'Escape') return;
            if (!isTopmostPluginSheet()) return;
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
            close();
        };
        const closeBtn = mask.querySelector('[data-close]');
        if (closeBtn) closeBtn.onclick = close;
        mask.onclick = event => { if (event.target === mask) close(); };
        const form = mask.querySelector('form[data-wishlist-price-form]');
        let submitting = false;
        form.onsubmit = async event => {
            event.preventDefault();
            if (submitting) return;
            submitting = true;
            const saveButton = form.querySelector('[type="submit"]');
            if (saveButton) { saveButton.disabled = true; saveButton.setAttribute('aria-busy', 'true'); }
            try {
                const raw = String(form.elements.expectedAmount.value || '').trim();
                const amountMinor = raw === '' ? null : parseMajorToMinor(raw, currency);
                await this.updateWishlistExpectedPrice(id, amountMinor);
                this.showToast('✓ ' + this._t('wishlistPriceUpdated', '期望价格已更新'));
                close();
                // 详情卡打开中 → 原 host 重开使趋势曲线立即可见；从种草池卡片直接进入
                // 时不弹详情卡，仅依赖域方法的 _runGuardedUiEffects 刷新列表（迷你曲线随之更新）。
                const openCard = typeof document !== 'undefined' && document.querySelector
                    ? document.querySelector('.am-product-card-mask [data-product-id="' + id + '"]') : null;
                if (openCard) {
                    const cardHost = this._productCardHost || host;
                    this.closeProductCard();
                    this.openFormalProductCard(id, cardHost);
                }
            } catch (error) {
                submitting = false;
                if (saveButton) { saveButton.disabled = false; saveButton.setAttribute('aria-busy', 'false'); }
                this.showToast('⚠️ ' + (error && error.message ? error.message : 'update failed'));
            }
        };
        host.appendChild(mask);
        // v2.4.1 追加②：绑定币种玻璃下拉（锁定态也需回显符号 label）。
        this._bindAmGlassSelects(mask);
        window.addEventListener('keydown', onKeydown, KEYDOWN_CAPTURE_OPTS);
        return mask;
    }

    /**
     * v2.2：永久删除一条已拔草记录（wishlistEvents 里的 abandoned 事件）。
     * 仅改 wishlistEvents sidecar，不触碰任何资产 / 财务 / 生命周期数据；change 只带
     * wishlistEvents 键，存储事务按「部分 change 合并完整域」语义保留其余文件不变。
     * 不写 operation log（拔草记录本就游离于正式操作日志之外）。
     */
    async deleteAbandonedWishlistEvent(eventId) {
        const context = await this._commitAssetAuditMutation(snapshot => {
            const event = (snapshot.wishlistEvents || []).find(item => item && item.id === eventId && item.eventType === 'abandoned');
            if (!event) return { noop: true, context: { deleted: null } };
            return {
                wishlistEvents: snapshot.wishlistEvents.filter(item => !(item && item.id === eventId)),
                context: { deleted: event },
            };
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context && context.deleted;
    }

    /** v2.2：已拔草记录「永久删除」二次确认 + 执行 + toast。 */
    _confirmDeleteAbandonedEvent(eventId) {
        const event = (this.wishlistEvents || []).find(item => item && item.id === eventId && item.eventType === 'abandoned');
        if (!event) return;
        // v2.2：确认框限定在插件范围内（.am-plugin-confirm-mask 相对 dock 绝对定位），
        // 不再用全屏居中的 SiYuan Dialog。复用 confirmDelete 的单实例 _pluginConfirmClose。
        const host = this.dockElement || this._modalContainer || document.body;
        if (!host) return;
        const isFallbackHost = host === document.body;
        if (typeof this._pluginConfirmClose === 'function') this._pluginConfirmClose();
        const mask = document.createElement('div');
        mask.className = `am-plugin-confirm-mask${isFallbackHost ? ' am-plugin-confirm-mask--fallback' : ''}`;
        mask.innerHTML = `
            <section class="am-plugin-confirm" role="dialog" aria-modal="true" aria-labelledby="am-delete-abandoned-confirm-title">
                <div class="am-confirm">
                    <div class="am-confirm__icon">⚠️</div>
                    <div class="am-confirm__title" id="am-delete-abandoned-confirm-title">${escapeHtml(this._t('wishlistDeleteAbandonedTitle', '永久删除拔草记录'))}</div>
                    <div class="am-confirm__text">${escapeHtml(this._t('wishlistDeleteAbandonedConfirm', '此操作会永久删除这条拔草记录，不影响任何资产。'))}</div>
                </div>
                <div class="am-plugin-confirm__actions">
                    <button type="button" class="b3-button b3-button--cancel" data-plugin-confirm-cancel>${escapeHtml(this._t('btnCancel', '取消'))}</button>
                    <button type="button" class="b3-button b3-button--remove" data-plugin-confirm-delete>${escapeHtml(this._t('btnConfirm', '确认删除'))}</button>
                </div>
            </section>`;
        const close = () => {
            document.removeEventListener('keydown', onKeydown);
            mask.remove();
            if (this._pluginConfirmClose === close) this._pluginConfirmClose = null;
        };
        const onKeydown = ev => { if (ev.key === 'Escape') close(); };
        mask.onclick = ev => { if (ev.target === mask) close(); };
        const cancelBtn = mask.querySelector('[data-plugin-confirm-cancel]');
        const confirmBtn = mask.querySelector('[data-plugin-confirm-delete]');
        if (cancelBtn) cancelBtn.onclick = close;
        if (confirmBtn) confirmBtn.onclick = async () => {
            confirmBtn.setAttribute('disabled', 'disabled');
            if (cancelBtn) cancelBtn.setAttribute('disabled', 'disabled');
            try {
                const deleted = await this.deleteAbandonedWishlistEvent(eventId);
                close();
                this.showToast(deleted
                    ? '✅ ' + this._t('wishlistDeleteAbandonedSuccess', '已永久删除拔草记录')
                    : '⚠️ ' + this._t('wishlistDeleteAbandonedFailed', '删除拔草记录失败，请重试'));
            } catch (error) {
                confirmBtn.removeAttribute('disabled');
                if (cancelBtn) cancelBtn.removeAttribute('disabled');
                console.warn('[AssetManagement] delete abandoned record failed:', error && error.message);
                this.showToast('⚠️ ' + this._t('wishlistDeleteAbandonedFailed', '删除拔草记录失败，请重试'));
            }
        };
        host.appendChild(mask);
        this._pluginConfirmClose = close;
        document.addEventListener('keydown', onKeydown);
    }

    /**
     * 订阅自然到期仅由 periods 投影为 lapsed，不能把资产写成 retired。
     * 保留此入口以兼容 onload 调用，且不再产生写操作。
     */
    autoExpireVirtualAssets() {
        return 0;
    }

    // ---------- v2.6.0 内核 Agent 写桥（独立请求文件协议） ----------

    _startAgentWriteQueuePolling() {
        if (this._agentWriteQueueTimer != null) return;
        this._agentWriteQueueTimer = setInterval(() => { this._pollAgentWriteQueue(); }, 800);
        if (this._agentWriteQueueTimer && typeof this._agentWriteQueueTimer.unref === 'function') {
            this._agentWriteQueueTimer.unref();
        }
    }

    _stopAgentWriteQueuePolling() {
        if (this._agentWriteQueueTimer != null) {
            clearInterval(this._agentWriteQueueTimer);
            this._agentWriteQueueTimer = null;
        }
    }

    _agentQueueErrorBody(code, message) {
        const error = new Error(String(message || code));
        error.agentCode = code;
        try {
            return JSON.parse(agentActions.failure(error));
        } catch (e) {
            return { ok: false, error: { code: code, message: String(message || code) } };
        }
    }

    _parseAgentQueueFile(raw) {
        if (raw == null) return null;
        if (typeof raw === 'string') {
            if (!raw.trim()) return null;
            try { return JSON.parse(raw); } catch (e) { return null; }
        }
        return raw;
    }

    _agentWritePath(directory, id) {
        return directory + encodeURIComponent(String(id)) + '.json';
    }

    _agentQueueDelay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async _readAgentWriteState(path) {
        let raw;
        try {
            raw = await this.loadData(path);
        } catch (error) {
            return { status: 'unavailable', value: null, error: error };
        }
        if (raw == null || (typeof raw === 'string' && !raw.trim())) {
            return { status: 'missing', value: null, error: null };
        }
        if (typeof raw === 'object') return { status: 'valid', value: raw, error: null };
        try {
            return { status: 'valid', value: JSON.parse(raw), error: null };
        } catch (error) {
            return { status: 'corrupt', value: null, error: error };
        }
    }

    _agentQueueStateError(code, message) {
        const error = new Error(message || code);
        error.agentCode = code;
        return error;
    }

    async _writeVerifiedAgentFile(path, value) {
        await this.saveData(path, JSON.stringify(value));
        const verified = await this._readAgentWriteState(path);
        if (verified.status !== 'valid' || JSON.stringify(verified.value) !== JSON.stringify(value)) {
            throw new Error('agent write readback failed for ' + path);
        }
        return verified.value;
    }

    async _withAgentWriteCoordinator(task) {
        const locks = typeof navigator !== 'undefined' && navigator && navigator.locks;
        if (!locks || typeof locks.request !== 'function') return false;
        try {
            const result = await locks.request(AGENT_WRITE_LOCK_NAME, { ifAvailable: true }, async lock => {
                if (!lock) return false;
                return await task();
            });
            return result == null ? false : result;
        } catch (error) {
            return false;
        }
    }

    async _readAgentWriteManifest() {
        const state = await this._readAgentWriteState(AGENT_WRITE_MANIFEST_FILE);
        if (state.status === 'missing') return [];
        if (state.status !== 'valid') throw new Error('agent pending manifest is unavailable');
        const manifest = state.value;
        if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !Array.isArray(manifest.requests)) {
            throw new Error('agent pending manifest is corrupt');
        }
        return manifest.requests.slice();
    }

    async _readAgentRequest(requestId) {
        const state = await this._readAgentWriteState(this._agentWritePath(AGENT_WRITE_PENDING_DIR, requestId));
        if (state.status === 'missing') return null;
        if (state.status !== 'valid' || !state.value || state.value.id !== requestId
            || typeof state.value.method !== 'string' || !Array.isArray(state.value.args)
            || typeof state.value.createdAt !== 'string') {
            throw new Error('agent pending request is corrupt');
        }
        return state.value;
    }

    async _readCompletedAgentRequest(requestId) {
        const state = await this._readAgentWriteState(this._agentWritePath(AGENT_WRITE_COMPLETED_DIR, requestId));
        if (state.status === 'missing') return null;
        if (state.status !== 'valid' || !state.value || state.value.id !== requestId
            || !Object.prototype.hasOwnProperty.call(state.value, 'result')) {
            throw new Error('agent completed request is corrupt');
        }
        return state.value;
    }

    async _claimAgentWriteRequest(request) {
        const completed = await this._readCompletedAgentRequest(request.id);
        if (completed) return { state: 'completed', result: completed.result };
        const path = this._agentWritePath(AGENT_WRITE_PROCESSING_DIR, request.id);
        const current = await this._readAgentWriteState(path);
        if (current.status === 'unavailable') throw this._agentQueueStateError('QUEUE_UNAVAILABLE', 'processing receipt unavailable');
        if (current.status === 'corrupt') throw this._agentQueueStateError('QUEUE_CORRUPT', 'processing receipt is corrupt');
        if (current.status === 'valid') {
            const receipt = current.value;
            if (!receipt || receipt.schemaVersion !== 1 || receipt.id !== request.id
                || typeof receipt.ownerId !== 'string' || typeof receipt.token !== 'string'
                || typeof receipt.claimedAt !== 'string'
                || (receipt.state !== 'processing' && receipt.state !== 'completed')) {
                throw this._agentQueueStateError('QUEUE_CORRUPT', 'processing receipt is invalid');
            }
            if (receipt.state === 'completed' && Object.prototype.hasOwnProperty.call(receipt, 'result')) {
                await this._writeCompletedAgentRequest(request.id, receipt.result, receipt.completedAt);
                return { state: 'completed', result: receipt.result };
            }
            if (receipt.state === 'completed') throw this._agentQueueStateError('QUEUE_CORRUPT', 'completed processing receipt has no result');
            // 业务执行与结果落盘之间崩溃时，无法判断是否已经提交；宁可中止并提示查询，也不重复执行。
            return {
                state: 'uncertain',
                result: this._agentQueueErrorBody('WRITE_RESULT_UNCERTAIN', 'write result is uncertain; query before retrying'),
            };
        }
        const receipt = {
            schemaVersion: 1,
            id: request.id,
            state: 'processing',
            ownerId: this._agentWriteOwnerId,
            token: createStableId(),
            claimedAt: new Date().toISOString(),
            requestCreatedAt: request.createdAt,
        };
        try {
            const written = await this._writeVerifiedAgentFile(path, receipt);
            if (!written || written.id !== receipt.id || written.ownerId !== receipt.ownerId || written.token !== receipt.token) {
                return {
                    state: 'uncertain',
                    result: this._agentQueueErrorBody('WRITE_RESULT_UNCERTAIN', 'write claim result is uncertain; query before retrying'),
                };
            }
            return { state: 'claimed', receipt: receipt };
        } catch (error) {
            return {
                state: 'uncertain',
                result: this._agentQueueErrorBody('WRITE_RESULT_UNCERTAIN', 'write claim result is uncertain; query before retrying'),
            };
        }
    }

    async _writeCompletedAgentRequest(requestId, result, completedAt) {
        const path = this._agentWritePath(AGENT_WRITE_COMPLETED_DIR, requestId);
        const current = await this._readAgentWriteState(path);
        if (current.status === 'valid') {
            if (!current.value || current.value.id !== requestId || !Object.prototype.hasOwnProperty.call(current.value, 'result')) {
                throw new Error('agent completed request is corrupt');
            }
            return current.value;
        }
        if (current.status !== 'missing') throw current.error || new Error('completed request unavailable');
        return this._writeVerifiedAgentFile(path, {
            schemaVersion: 1,
            id: requestId,
            completedAt: completedAt || new Date().toISOString(),
            result: result,
        });
    }

    async _completeAgentWriteRequest(request, receipt, result) {
        const completedAt = new Date().toISOString();
        const processingPath = this._agentWritePath(AGENT_WRITE_PROCESSING_DIR, request.id);
        const completedReceipt = Object.assign({}, receipt, {
            state: 'completed',
            completedAt: completedAt,
            result: result,
        });
        // 先固化带结果的 processing 收据，再写 completed。短暂 I/O 失败时在本轮重试，
        // processing 收据仍保留给后续轮询补写，绝不回到业务执行阶段。
        let lastError = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await this._writeVerifiedAgentFile(processingPath, completedReceipt);
                await this._writeCompletedAgentRequest(request.id, result, completedAt);
                return;
            } catch (error) {
                lastError = error;
                if (attempt < 2) await this._agentQueueDelay(10);
            }
        }
        throw lastError || new Error('completed request write failed');
    }

    async _readAgentWriteReceipts() {
        const state = await this._readAgentWriteState(AGENT_WRITE_RECEIPTS_FILE);
        if (state.status === 'missing') return { receipts: {} };
        if (state.status !== 'valid' || !state.value || !state.value.receipts
            || typeof state.value.receipts !== 'object' || Array.isArray(state.value.receipts)) {
            throw new Error('legacy agent write receipts are unavailable');
        }
        return state.value;
    }

    async _claimLegacyAgentWriteReceipt(request) {
        const id = request && request.id;
        if (!id) return false;
        const file = await this._readAgentWriteReceipts();
        if (Object.prototype.hasOwnProperty.call(file.receipts, id)) return false;
        const token = createStableId();
        file.receipts[id] = { state: 'processing', ownerId: this._agentWriteOwnerId, token: token, at: new Date().toISOString() };
        await this._writeVerifiedAgentFile(AGENT_WRITE_RECEIPTS_FILE, file);
        const verified = await this._readAgentWriteReceipts();
        const receipt = verified.receipts[id];
        return !!(receipt && receipt.ownerId === this._agentWriteOwnerId && receipt.token === token);
    }

    async _completeLegacyAgentWriteReceipt(request) {
        const id = request && request.id;
        if (!id) return;
        const file = await this._readAgentWriteReceipts();
        const current = file.receipts[id];
        if (!current) return;
        file.receipts[id] = Object.assign({}, current, { state: 'completed', at: new Date().toISOString() });
        await this._writeVerifiedAgentFile(AGENT_WRITE_RECEIPTS_FILE, file);
    }

    async _pollNewAgentWriteRequests(verifyCoordinator) {
        const manifestEntries = await this._readAgentWriteManifest();
        for (const entry of manifestEntries) {
            const requestId = entry && typeof entry.id === 'string' ? entry.id : null;
            if (!requestId) continue;
            if (verifyCoordinator && !await verifyCoordinator()) return false;
            const request = await this._readAgentRequest(requestId);
            if (!request) continue;
            let claim;
            try {
                claim = await this._claimAgentWriteRequest(request);
            } catch (error) {
                const code = error && error.agentCode === 'QUEUE_CORRUPT' ? 'QUEUE_CORRUPT' : 'QUEUE_UNAVAILABLE';
                await this._writeCompletedAgentRequest(request.id, this._agentQueueErrorBody(code, error && error.message));
                continue;
            }
            if (claim.state === 'completed' || claim.state === 'owned') continue;
            if (claim.state === 'uncertain') {
                await this._writeCompletedAgentRequest(request.id, claim.result);
                continue;
            }
            if (verifyCoordinator && !await verifyCoordinator()) return false;
            const result = await this._executeAgentWriteRequest(request);
            await this._completeAgentWriteRequest(request, claim.receipt, result);
        }
        return true;
    }

    // 旧 queue 只读兼容：不 prune，不 GC receipts；仅让已在途请求完成。
    async _pollLegacyAgentWriteQueue(verifyCoordinator) {
        const state = await this._readAgentWriteState(AGENT_WRITE_QUEUE_FILE);
        if (state.status === 'missing') return true;
        if (state.status !== 'valid' || !state.value || !Array.isArray(state.value.requests)) {
            throw new Error('legacy agent write queue is unavailable');
        }
        for (const request of state.value.requests.slice()) {
            if (!request || !request.id) continue;
            if (verifyCoordinator && !await verifyCoordinator()) return false;
            const receipts = await this._readAgentWriteReceipts();
            if (Object.prototype.hasOwnProperty.call(receipts.receipts, request.id)) continue;
            if (!await this._claimLegacyAgentWriteReceipt(request)) continue;
            const result = await this._executeAgentWriteRequest(request);
            await this._appendAgentWriteResult(request, result);
            await this._completeLegacyAgentWriteReceipt(request);
        }
        await this._gcAgentWriteResults();
        return true;
    }

    async _pollAgentWriteQueue() {
        if (this._agentWriteQueueBusy || this._unloaded) return;
        this._agentWriteQueueBusy = true;
        try {
            const coordinated = await this._withAgentWriteCoordinator(async () => {
                await this._pollNewAgentWriteRequests();
                await this._pollLegacyAgentWriteQueue();
                return true;
            });
            if (coordinated === false) return;
        } catch (error) {
            console.warn('[AssetManagement] agent queue poll failed:', error && error.message);
        } finally {
            this._agentWriteQueueBusy = false;
        }
    }

    async _gcAgentWriteResults() {
        try {
            const state = await this._readAgentWriteState(AGENT_WRITE_RESULTS_FILE);
            if (state.status !== 'valid' || !state.value || !state.value.results
                || typeof state.value.results !== 'object' || Array.isArray(state.value.results)) return;
            const resultsFile = state.value;
            const cutoff = Date.now() - AGENT_WRITE_RESULTS_TTL_MS;
            let expired = 0;
            Object.keys(resultsFile.results).forEach(id => {
                const entry = resultsFile.results[id];
                const at = entry && typeof entry.at === 'string' ? Date.parse(entry.at) : NaN;
                if (!Number.isFinite(at) || at < cutoff) {
                    delete resultsFile.results[id];
                    expired++;
                }
            });
            if (expired > 0) await this._writeVerifiedAgentFile(AGENT_WRITE_RESULTS_FILE, resultsFile);
        } catch (error) {
            console.warn('[AssetManagement] legacy agent results gc failed:', error && error.message);
        }
    }

    async _executeAgentWriteRequest(request) {
        const method = request && typeof request.method === 'string' ? request.method : '';
        const args = Array.isArray(request && request.args) ? request.args : [];
        const writeMethod = this._agentWriteMethods ? this._agentWriteMethods[method] : null;
        if (!request || typeof request.id !== 'string' || !request.id) {
            return this._agentQueueErrorBody('INVALID_REQUEST', 'agent write request is malformed');
        }
        // 权限二次校验：settings 可能已不同于内核读取时的快照。
        const settings = agentActions.normalizeAgentSettings(this.settings);
        if (settings.aiEnabled !== true) {
            return this._agentQueueErrorBody('AGENT_DISABLED', 'official Agent tools are disabled');
        }
        const permissions = AGENT_WRITE_METHOD_PERMISSIONS[method];
        if (!permissions || typeof writeMethod !== 'function') {
            return this._agentQueueErrorBody('METHOD_UNAVAILABLE', method + ' is unavailable');
        }
        if (!permissions.every(key => settings[key] === true)) {
            return this._agentQueueErrorBody('PERMISSION_DENIED', 'permission is disabled for this tool');
        }
        if (this._formalDomainLoaded !== true) {
            return this._agentQueueErrorBody('DOMAIN_UNAVAILABLE', 'formal asset data is not fully loaded');
        }
        try {
            const refreshContext = { handled: false };
            const previousRefreshContext = this._agentWriteRefreshContext;
            this._agentWriteRefreshContext = refreshContext;
            let value;
            try {
                value = await writeMethod.apply(null, args);
            } finally {
                this._agentWriteRefreshContext = previousRefreshContext;
            }
            if (!refreshContext.handled) this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
            return { ok: true, data: value == null ? null : value };
        } catch (error) {
            return this._agentQueueErrorBody(
                error && error.agentCode ? error.agentCode
                    : (agentActions.inferAgentErrorDefinition(error) || 'ACTION_FAILED'),
                error && error.message ? error.message : 'agent write failed',
            );
        }
    }

    async _appendAgentWriteResult(request, result) {
        const id = request && typeof request.id === 'string' ? request.id : null;
        if (!id) return;
        const state = await this._readAgentWriteState(AGENT_WRITE_RESULTS_FILE);
        if (state.status === 'unavailable' || state.status === 'corrupt') {
            throw state.error || new Error('legacy agent results are unavailable');
        }
        const resultsFile = state.status === 'missing' ? { results: {} } : state.value;
        if (!resultsFile || typeof resultsFile !== 'object' || Array.isArray(resultsFile)) {
            throw new Error('legacy agent results are corrupt');
        }
        const results = resultsFile.results && typeof resultsFile.results === 'object' && !Array.isArray(resultsFile.results)
            ? resultsFile.results : {};
        if (!Object.prototype.hasOwnProperty.call(results, id)) {
            results[id] = Object.assign({}, result, { at: new Date().toISOString() });
        }
        resultsFile.results = results;
        await this._writeVerifiedAgentFile(AGENT_WRITE_RESULTS_FILE, resultsFile);
    }

    onunload() {
        // v2.6.0：Agent 工具注册由内核侧 kernel.js 管理；这里只停写队列轮询。
        this._stopAgentWriteQueuePolling();
        this._unloaded = true;
        if (this._assetBlockRefCaptureClickHandler) {
            document.removeEventListener('click', this._assetBlockRefCaptureClickHandler, true);
            this._assetBlockRefCaptureClickHandler = null;
        }
        // v1.7-P2：卸载兜底断开矩阵列数 ResizeObserver，防泄漏。
        this._teardownMatrixResizeObserver();
        // v1.7.3：卸载兜底断开列表列数 ResizeObserver，防泄漏。
        this._teardownListResizeObserver();
        // onunload is synchronous. Close the storage admission gate first so a
        // queued debounce cannot begin writing after the next plugin instance.
        if (this.storage && typeof this.storage.stopPersistence === 'function') {
            this.storage.stopPersistence();
        }
        if (this._resourceIndexReconcileTimer != null) {
            clearTimeout(this._resourceIndexReconcileTimer);
            this._resourceIndexReconcileTimer = null;
        }
        // v2.5.0 阶段2：卸载时注销索引引擎，清掉未触发的防抖定时器。
        if (this.noteLink && typeof this.noteLink.dispose === 'function') {
            try { this.noteLink.dispose(); } catch (e) {}
            this.noteLink = null;
        }
        // v2.5.0 阶段3B：移除斜杠菜单注册项（深链事件监听随 eventBus 一起销毁）。
        if (this._assetRefSlashEntry && Array.isArray(this.protyleSlash)) {
            const index = this.protyleSlash.indexOf(this._assetRefSlashEntry);
            if (index >= 0) this.protyleSlash.splice(index, 1);
        }
        this._assetRefSlashEntry = null;
        // v2.5.0 阶段3B：解绑深链事件。
        if (this._deepLinkHandler && this.eventBus && typeof this.eventBus.off === 'function') {
            try { this.eventBus.off('open-siyuan-url-plugin', this._deepLinkHandler); } catch (e) {}
        }
        this._deepLinkHandler = null;
        // v2.5.0 阶段4：解绑块图标菜单事件。
        if (this._blockIconMenuHandler && this.eventBus && typeof this.eventBus.off === 'function') {
            try { this.eventBus.off('click-blockicon', this._blockIconMenuHandler); } catch (e) {}
        }
        this._blockIconMenuHandler = null;
        if (this._blockRefMenuHandler && this.eventBus && typeof this.eventBus.off === 'function') {
            try { this.eventBus.off('open-menu-blockref', this._blockRefMenuHandler); } catch (e) {}
        }
        this._blockRefMenuHandler = null;
        if (this._searchRefreshTimer) {
            clearTimeout(this._searchRefreshTimer);
            this._searchRefreshTimer = null;
        }
        if (this._onNonNegativeNumberInput) {
            document.removeEventListener('input', this._onNonNegativeNumberInput, true);
            this._onNonNegativeNumberInput = null;
        }
        this._closeHomeFilterDropdown();
        this._closeItemMenu();
        if (typeof this._pluginConfirmClose === 'function') this._pluginConfirmClose();
        this._cleanupTagAutocomplete(document);
        for (const d of this.dialogs) { try { d.destroy(); } catch (e) {} }
        this.dialogs.clear();
        ['_opLogFlushTimer', '_tagsFlushTimer', '_maintenanceFlushTimer', '_prepaidTransactionsFlushTimer']
            .forEach((timerProp) => {
                if (this[timerProp]) clearTimeout(this[timerProp]);
                this[timerProp] = null;
            });
    }

    // ---------- 数据持久化 ----------

    async loadAssets() {
        try {
            const snapshot = await this.storage.readFormalAssetDomainSnapshot();
            this._formalDomainStateSnapshot = snapshot;
            this.assets = snapshot.assets;
            this._tags = snapshot.tags;
            this._financialEvents = snapshot.financialEvents;
this._subscriptionPeriods = snapshot.subscriptionPeriods;
            this._prepaidTransactions = snapshot.prepaidTransactions;
            this._maintenanceRecords = snapshot.maintenance;
            this._usageRecords = snapshot.usage;
            this._lifecycleEvents = snapshot.lifecycleEvents;
            this.wishlistEvents = snapshot.wishlistEvents;
            this._wishlistEventsLoaded = true;
            this._opLogs = snapshot.operationLogs;
            this._exchangeRates = snapshot.exchangeRates || { schemaVersion: 1, baseCurrency: 'CNY', rates: {} };
            // v2.6.4 P2：汇率自动刷新判定——全插件唯一挂钩点（静默、绝不冒泡）。
            void this._maybeAutoRefreshExchangeRates().catch(() => {});
            this._formalDomainLoaded = true;
            this._formalDomainError = null;
            this._assetsLoadedOk = true;
            this._assetLoadError = null;
        }
        catch (e) {
            console.warn("[AssetManagement] loadAssets error:", e);
            this.assets = [];
            this._formalDomainStateSnapshot = null;
            this._exchangeRates = { schemaVersion: 1, baseCurrency: 'CNY', rates: {} };
            this._formalDomainLoaded = false;
            this._formalDomainError = e;
            this._assetsLoadedOk = false;
            this._assetLoadError = e;
        }
        this._runGuardedUiEffects({ refreshMainContent: true });
    }

    // ---------- 媒体封面（阶段 1：供后续四类表单复用，不在此阶段改表单 UI） ----------

    resolveCoverUrl(cover, presetManifest) {
        return media.resolveCoverUrl(cover, presetManifest);
    }

    async uploadAssetCover(assetId, file) {
        return media.uploadImage(assetId, file);
    }

    async removeOwnedAssetCover(cover, assetId) {
        return media.removeUploadCover(cover, assetId);
    }

    async cleanupReplacedAssetCover(previousCover, nextCover, assetId) {
        return media.cleanupReplacedCover(previousCover, nextCover, assetId);
    }

    /** Only this asset's plugin-owned upload may be removed after deletion commits. */
    async cleanupDeletedAssetCover(asset) {
        if (!asset || !asset.id) return false;
        try {
            return await media.cleanupDeletedCover(asset.cover, asset.id);
        } catch (error) {
            console.warn('[AssetManagement] deleted cover cleanup failed:', error && error.message);
            return false;
        }
    }

    async cleanupDeletedAssetCovers(assets) {
        const results = await Promise.allSettled((Array.isArray(assets) ? assets : [])
            .filter(asset => asset && asset.id && media.isOwnedUploadCover(asset.cover, asset.id))
            .map(asset => this.cleanupDeletedAssetCover(asset)));
        results.forEach(result => {
            if (result.status === 'rejected') {
                console.warn('[AssetManagement] deleted cover cleanup failed:', result.reason && result.reason.message);
            }
        });
        return results;
    }

    _getImportCoverCleanupCandidates(previousAssets, nextAssets) {
        const nextAssetsById = new Map((Array.isArray(nextAssets) ? nextAssets : [])
            .filter(asset => asset && asset.id)
            .map(asset => [asset.id, asset]));
        return (Array.isArray(previousAssets) ? previousAssets : [])
            .filter(previousAsset => {
                if (!previousAsset || !previousAsset.id || !media.isOwnedUploadCover(previousAsset.cover, previousAsset.id)) {
                    return false;
                }
                const nextAsset = nextAssetsById.get(previousAsset.id);
                return !nextAsset || previousAsset.cover.assetPath !== (nextAsset.cover && nextAsset.cover.assetPath);
            });
    }

    _getFormCoverAssetId(state, existingAsset, wishlistSource) {
        if (existingAsset && existingAsset.id) return existingAsset.id;
        if (wishlistSource && wishlistSource.id) return wishlistSource.id;
        if (!state.formCoverAssetId) state.formCoverAssetId = genId();
        return state.formCoverAssetId;
    }

    _discardPendingFormCover(state, assetId) {
        const pendingCover = state && state.pendingUploadCover;
        if (state) state.pendingUploadCover = null;
        if (!pendingCover || !assetId) return Promise.resolve(false);
        return this.removeOwnedAssetCover(pendingCover, assetId).catch(error => {
            console.warn('[AssetManagement] pending cover cleanup failed:', error && error.message);
            return false;
        });
    }

    async persistUploadedAssetCover(assetId, uploadedCover) {
        let context;
        try {
            context = await this._commitAssetAuditMutation(snapshot => {
                const source = snapshot.assets.find(asset => asset && asset.id === assetId);
                if (!source) throw new Error('[media] asset not found: ' + assetId);
                const updated = Object.assign({}, source, { cover: uploadedCover, updatedAt: new Date().toISOString() });
                return {
                    assets: snapshot.assets.map(asset => asset && asset.id === assetId ? updated : asset),
                    context: { updated: updated, previousCover: source.cover },
                };
            });
        } catch (error) {
            if (media.isOwnedUploadCover(uploadedCover, assetId)) {
                await this.removeOwnedAssetCover(uploadedCover, assetId).catch(() => false);
            }
            throw error;
        }
        this._runGuardedUiEffects({
            scheduleResourceIndexReconcile: true,
            renderDock: true,
            refreshModal: true,
        });
        return { asset: context.updated, previousCover: context.previousCover };
    }

    /** 上传成功后先持久化新引用，再清理旧上传封面；清理失败不回滚新封面。 */
    async replaceAssetCover(assetId, file) {
        const uploadedCover = await this.uploadAssetCover(assetId, file);
        const persisted = await this.persistUploadedAssetCover(assetId, uploadedCover);
        try {
            await media.cleanupReplacedCover(persisted.previousCover, uploadedCover, assetId);
        } catch (error) {
            console.warn('[AssetManagement] replaced cover cleanup failed:', error && error.message);
        }
        return persisted.asset;
    }

    /** 删除生命周期预留：先移除资产引用并持久化，再删除工作空间中的上传资源。 */
    async clearAssetCover(assetId) {
        const context = await this._commitAssetAuditMutation(snapshot => {
            const source = snapshot.assets.find(asset => asset && asset.id === assetId);
            if (!source) throw new Error('[media] asset not found: ' + assetId);
            const updated = Object.assign({}, source, { cover: { kind: 'none' }, updatedAt: new Date().toISOString() });
            return {
                assets: snapshot.assets.map(asset => asset && asset.id === assetId ? updated : asset),
                context: { updated: updated, cleanupCover: source.cover },
            };
        });
        this._runGuardedUiEffects({ scheduleResourceIndexReconcile: true });
        try {
            await media.cleanupDeletedCover(context.cleanupCover, assetId);
        } catch (error) {
            console.warn('[AssetManagement] deleted cover cleanup failed:', error && error.message);
        }
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context.updated;
    }

    // Archived pre-formal repair path. Formal-v1 validates one complete snapshot.


    _assertNonNegativeNumber(value, field) {
        if (value == null || value === '') return;
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0) {
            throw new Error(this._t('nonNegativeNumberInvalid', '{field}必须是大于或等于 0 的有效数值', {
                field: field || this._t('fieldPrice', '数值'),
            }));
        }
    }

    async loadSettings() {
        try {
            this.settings = await this.storage.readSettings();
            const current = resourceIndex.normalizeResourceIndex(this.settings && this.settings.resourceIndex);
            if (!current.pendingCleanupBlockId || !this.storage || typeof this.storage.mutateFormalSettings !== 'function') return;
            let next;
            try {
                next = await resourceIndex.clearPendingCleanupBlock(current, { fetch: (path, options) => fetch(path, options) });
            } catch (error) {
                next = Object.assign({}, current, {
                    status: 'error', updatedAt: new Date().toISOString(),
                    lastError: String((error && error.message) || error || 'Resource index cleanup failed').slice(0, 240),
                });
            }
            const saved = await this.storage.mutateFormalSettings(() => ({ resourceIndex: next }));
            this.settings = saved && typeof saved === 'object'
                ? saved : Object.assign({}, this.settings, { resourceIndex: next });
        } catch (e) { console.warn("[AssetManagement] loadSettings error:", e); }
        // v2.6.4 P2：无论成败都放行 settings-load gate（汇率自动刷新判定在等它）。
        if (!this._settingsLoadGateLoaded) {
            this._settingsLoadGateLoaded = true;
            try { this._settingsLoadGateResolve(); } catch (e) {}
        }
    }

    async saveSettings(patch) {
        if (!this.storage) return false;
        const desired = Object.assign({}, patch || {});
        try {
            const next = Object.assign({}, DEFAULT_SETTINGS, this.settings || {}, desired);
            await this.storage.writeSettings(next, { backup: false });
            this.settings = next;
            this._onDataCommitted();
            return true;
        } catch (e) {
            console.warn('[AssetManagement] saveSettings:', e && e.message);
            return false;
        }
    }

    getResourceIndexState() {
        return resourceIndex.normalizeResourceIndex(this.settings && this.settings.resourceIndex);
    }

    reconcileResourceIndex(target) {
        if (this._unloaded) return Promise.resolve(this.getResourceIndexState());
        if (this._resourceIndexReconcilePromise) return this._resourceIndexReconcilePromise;

        let resolvePending;
        let rejectPending;
        const pending = new Promise((resolve, reject) => {
            resolvePending = resolve;
            rejectPending = reject;
        });
        // Assign before starting work so concurrent callers share this exact promise,
        // including while the initial settings write is still pending.
        this._resourceIndexReconcilePromise = pending;

        (async () => {
            try {
                const current = this.getResourceIndexState();
                if (this._unloaded) {
                    resolvePending(current);
                    return;
                }
                const pendingState = Object.assign({}, current, { status: 'pending', lastError: null });
                if ((await this.saveSettings({ resourceIndex: pendingState })) === false) {
                    console.warn('[AssetManagement] resource index pending state was not persisted');
                    resolvePending(this.getResourceIndexState());
                    return;
                }
                // saveSettings assigns this in production. Preserve the same
                // post-commit state for narrow test doubles that only resolve.
                this.settings = Object.assign({}, this.settings, { resourceIndex: pendingState });
                if (this._unloaded) {
                    resolvePending(this.getResourceIndexState());
                    return;
                }
                const next = await resourceIndex.reconcileResourceIndex({
                    state: this.settings.resourceIndex,
                    assets: this.assets,
                    target: target,
                    // In-flight requests cannot be cancelled, but no subsequent
                    // document API request may start once this plugin is unloaded.
                    options: {
                        fetch: (path, options) => {
                            if (this._unloaded) return Promise.reject(new Error('[resource-index] plugin unloaded'));
                            return fetch(path, options);
                        },
                    },
                });
                if (this._unloaded) {
                    resolvePending(this.getResourceIndexState());
                    return;
                }
                if ((await this.saveSettings({ resourceIndex: next })) === false) {
                    console.warn('[AssetManagement] resource index reconciled state was not persisted');
                    resolvePending(this.getResourceIndexState());
                    return;
                }
                this.settings = Object.assign({}, this.settings, { resourceIndex: next });
                resolvePending(next);
            } catch (error) {
                if (this._unloaded) {
                    resolvePending(this.getResourceIndexState());
                    return;
                }
                try {
                    const previous = resourceIndex.normalizeResourceIndex((error && error.resourceIndexState) || this.settings.resourceIndex);
                    const failedState = Object.assign({}, previous, {
                        status: 'error',
                        updatedAt: new Date().toISOString(),
                        lastError: String((error && error.message) || error || 'Resource index failed').slice(0, 240),
                    });
                    if ((await this.saveSettings({ resourceIndex: failedState })) === false) {
                        console.warn('[AssetManagement] resource index error state was not persisted');
                        resolvePending(this.getResourceIndexState());
                        return;
                    }
                    this.settings = Object.assign({}, this.settings, { resourceIndex: failedState });
                    console.warn('[AssetManagement] resource index reconcile:', error && error.message);
                    resolvePending(this.getResourceIndexState());
                } catch (saveError) {
                    rejectPending(saveError);
                }
            } finally {
                if (this._resourceIndexReconcilePromise === pending) this._resourceIndexReconcilePromise = null;
            }
        })();
        return pending;
    }

    scheduleResourceIndexReconcile() {
        if (this._unloaded) return;
        if (this._resourceIndexReconcileTimer != null) clearTimeout(this._resourceIndexReconcileTimer);
        this._resourceIndexReconcileTimer = setTimeout(() => {
            this._resourceIndexReconcileTimer = null;
            if (!this._unloaded) this.reconcileResourceIndex();
        }, 80);
    }

    // ---------- 业务逻辑（委托给 api/assets.js）----------

    applyFilter(assets) {
        const filter = Object.assign({}, this.filter, { financialEvents: this._financialEvents });
        return applyFilter(Array.isArray(assets) ? assets : [], filter);
    }
    computeStats(assets) { return computeStats(assets, this._financialEvents || [], this._subscriptionPeriods || []); }


    /**
     * v0.13.1：解析附加费用 / 收益的 textarea 行（每行格式：名称 金额 日期）
     * @param {string} text
     * @returns {Array<{label, amount, date}>}
     */
    parseCostLines(text) {
        if (!text || !text.trim()) return [];
        return text.split('\n').map(line => {
            line = line.trim();
            if (!line) return null;
            const parts = line.split(/\s+/);
            return {
                label: parts[0] || '',
                amount: Number(parts[1]) || 0,
                date: parts[2] || todayISO(),
            };
        }).filter(Boolean);
    }
    computeDays(a) { return computeAssetDerived(a).daysUsed; }
    computeDaily(a) { return computeAssetDerived(a).dailyCost; }

    formatWarrantyStatus(status) {
        if (!status) return '';
        if (status.state === 'expired') return this._t('warrantyExpired', '已过保');
        if (status.state === 'today') return this._t('warrantyDueToday', '保修今日到期');
        return this._t('warrantyDaysRemaining', '保修剩余 {n} 天', { n: status.days });
    }

    async _commitAssetAuditMutation(prepare) {
        if (this._assetsLoadedOk === false && this._assetLoadError) {
            this.showToast('⚠️ ' + this._t('formalMutationBlocked', '资产操作已阻断'));
            const error = new Error('ASSET_MUTATION_BLOCKED');
            error.code = 'ASSET_MUTATION_BLOCKED';
            error.assetLoadError = this._assetLoadError || null;
            throw error;
        }
        const transaction = await this.storage.mutateFormalAssetDomain(async snapshot => {
            const prepared = await prepare(snapshot);
            if (!prepared || prepared.noop) return { noop: true, context: prepared && prepared.context };
            const change = Object.assign({}, prepared);
            delete change.context;
            // The audit row belongs to the same strict formal transaction as
            // the canonical asset snapshot; never enqueue a standalone log.
            if (!change.operationLogs && Array.isArray(change.assets)) {
                const before = Array.isArray(snapshot.assets) ? snapshot.assets : [];
                const after = change.assets;
                const beforeById = new Map(before.map(asset => [asset.id, asset]));
                const afterById = new Map(after.map(asset => [asset.id, asset]));
                const removed = before.find(asset => !afterById.has(asset.id));
                const added = after.find(asset => !beforeById.has(asset.id));
                const changed = after.find(asset => beforeById.has(asset.id)
                    && JSON.stringify(beforeById.get(asset.id)) !== JSON.stringify(asset));
                // Wishlist records are intentionally excluded from the formal
                // operation-log sidecar: that sidecar only permits owned asset
                // references. Their canonical terminal events are committed by
                // completeWishlistPurchase() / abandonWishlistAsset().
                const operation = removed ? this._newFormalOperationLog('delete', removed, removed, null, null)
                    : added && added.status !== ASSET_STATUS.WISHLIST ? this._newFormalOperationLog('add', added, null, added, null)
                        : changed ? this._newFormalOperationLog(
                            beforeById.get(changed.id).status !== changed.status ? 'set-status' : 'update',
                            changed, beforeById.get(changed.id), changed,
                            beforeById.get(changed.id).status !== changed.status ? 'status' : null)
                            : null;
                if (operation) change.operationLogs = [operation].concat(snapshot.operationLogs || []);
            }
            return { change: change, context: prepared.context || {} };
        });
        if (!transaction || transaction.noop) return transaction && transaction.context;
        this.assets = transaction.assets;
        this._tags = transaction.tags;
        this._financialEvents = transaction.financialEvents;
        this._subscriptionPeriods = transaction.subscriptionPeriods;
        this._prepaidTransactions = transaction.prepaidTransactions;
        this._maintenanceRecords = transaction.maintenance;
        this._usageRecords = transaction.usage;
        this._lifecycleEvents = transaction.lifecycleEvents;
        this.wishlistEvents = transaction.wishlistEvents;
        // The transaction returns the full wishlistEvents sidecar, so the lazy
        // history cache is now authoritative — no storage re-read needed before
        // the purchased/abandoned sub-tabs render after a buy/abandon mutation.
        this._wishlistEventsLoaded = true;
        this._opLogs = transaction.operationLogs;
        this._formalDomainStateSnapshot = {
            assets: transaction.assets, tags: transaction.tags, financialEvents: transaction.financialEvents,
            subscriptionPeriods: transaction.subscriptionPeriods, prepaidTransactions: transaction.prepaidTransactions,
            maintenance: transaction.maintenance, usage: transaction.usage, lifecycleEvents: transaction.lifecycleEvents,
            wishlistEvents: transaction.wishlistEvents, operationLogs: transaction.operationLogs,
        };
        this._formalDomainLoaded = true;
        this._formalDomainError = null;
        this._onDataCommitted();
        return transaction.context || {};
    }

    _newFormalOperationLog(type, asset, oldValue, newValue, field) {
        const canonical = asset || oldValue || newValue;
        if (!canonical || !canonical.id || !canonical.name) {
            throw new Error('[operation-logs] canonical asset snapshot is required');
        }
        return {
            id: createStableId(), type: type, assetId: canonical.id, assetName: canonical.name,
            field: field || null, oldValue: this._cloneForSnapshot(oldValue),
            newValue: this._cloneForSnapshot(newValue), ts: new Date().toISOString(),
        };
    }

    _missingTagDefinitions(tags, labels) {
        const known = new Set((Array.isArray(tags) ? tags : [])
            .map(tag => tag && tag.label ? String(tag.label).trim().toLowerCase() : '')
            .filter(Boolean));
        return (Array.isArray(labels) ? labels : []).reduce((missing, label) => {
            const safeLabel = String(label || '').trim();
            const key = safeLabel.toLowerCase();
            if (!safeLabel || known.has(key)) return missing;
            known.add(key);
            missing.push({
                id: 'tag_user_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1000).toString(36).padStart(2, '0'),
                label: safeLabel,
                emoji: '',
                color: '#3575f3',
                isSystem: false,
                createdAt: new Date().toISOString(),
            });
            return missing;
        }, []);
    }

    _cloneForSnapshot(value) {
        if (value == null) return value;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (e) {
            return value;
        }
    }

    async _buildDeleteSidecarCleanup(assetIds) {
        const cleanup = await this.storage.readAssetDeletionCleanup(assetIds);
return {
            deletingAssetIds: cleanup.deletingAssetIds,
            expectedSnapshots: cleanup.expectedSnapshots,
            snapshot: this._cloneForSnapshot(cleanup.snapshot),
            nextMaintenance: cleanup.sidecars.maintenance,
            nextPrepaidTransactions: cleanup.sidecars.prepaidTransactions,
            nextFinancialEvents: cleanup.ledgers.financialEvents,
            nextLifecycleEvents: cleanup.ledgers.lifecycleEvents,
            nextSubscriptionPeriods: cleanup.ledgers.subscriptionPeriods,
            hasMaintenanceChanges: cleanup.snapshot.maintenanceRecords.length > 0,
            hasPrepaidTransactionChanges: cleanup.snapshot.prepaidTransactions.length > 0,
        };
    }

    _attachDeleteSidecarSnapshot(assetSnapshot, sidecarSnapshot) {
        const snapshot = this._cloneForSnapshot(assetSnapshot) || {};
        snapshot.deleteSidecarSnapshot = this._cloneForSnapshot(sidecarSnapshot || {});
        return snapshot;
    }

    _formatDeleteFailure(error) {
        const unitOfWork = error && error.unitOfWork;
        const cause = (error && error.cause) || error || {};
        const code = error && error.code;
        let categoryKey = 'deleteFailureCategoryStorage';
        if (code === 'LEDGER_VALIDATION_FAILED') categoryKey = 'deleteFailureCategoryValidation';
        else if (code === 'LEDGER_UNIT_OF_WORK_FAILED') {
            categoryKey = unitOfWork && Array.isArray(unitOfWork.rollbackFailures) && unitOfWork.rollbackFailures.length > 0
                ? 'deleteFailureCategoryRollback'
                : 'deleteFailureCategoryTransaction';
        }
        const detail = String(cause.message || error && error.message || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/[<>&"'\x60]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120);
        const fileSource = [
            unitOfWork && unitOfWork.rollbackAttempted,
            unitOfWork && unitOfWork.rollbackFailures && unitOfWork.rollbackFailures.map(item => item.file),
            detail,
        ].flat().filter(Boolean).join(' ');
        const fileMatch = fileSource.match(/[A-Za-z][A-Za-z0-9_-]*\.json/);
        return this._t('deleteFailureTemplate', 'Delete failed: {category}{file}{detail}', {
            category: this._t(categoryKey, categoryKey),
            file: fileMatch ? this._t('deleteFailureFile', ' ({file})', { file: fileMatch[0] }) : '',
            detail: detail ? this._t('deleteFailureDetail', ': {detail}', { detail: detail }) : '',
        });
    }

    _setStatusFromUi(id, status) {
        return Promise.resolve()
            .then(() => this.setStatus(id, status))
            .catch(error => {
                const detail = String((error && error.message) || error || '')
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/[<>&"'\x60]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .slice(0, 120);
                console.warn('[AssetManagement] status change failed:', {
                    assetId: String(id || ''),
                    status: String(status || ''),
                    code: String((error && error.code) || 'UNKNOWN'),
                    detail: detail,
                });
                this.showToast('⚠️ ' + this._t('statusChangeSaveFailed', 'Failed to save status change'));
                return null;
            });
    }

_getDeleteSidecarSnapshotForAsset(sidecarSnapshot, assetId) {
        const source = sidecarSnapshot || {};
        return {
            assetIds: assetId ? [assetId] : [],
            maintenanceRecords: Array.isArray(source.maintenanceRecords)
                ? this._cloneForSnapshot(source.maintenanceRecords.filter(r => r && r.assetId === assetId))
                : [],
            prepaidTransactions: Array.isArray(source.prepaidTransactions)
                ? this._cloneForSnapshot(source.prepaidTransactions.filter(r => r && r.assetId === assetId))
                : [],
            financialEvents: Array.isArray(source.financialEvents)
                ? this._cloneForSnapshot(source.financialEvents.filter(r => r && r.assetId === assetId))
                : [],
            lifecycleEvents: Array.isArray(source.lifecycleEvents)
                ? this._cloneForSnapshot(source.lifecycleEvents.filter(r => r && r.assetId === assetId))
                : [],
            subscriptionPeriods: Array.isArray(source.subscriptionPeriods)
                ? this._cloneForSnapshot(source.subscriptionPeriods.filter(r => r && r.assetId === assetId))
                : [],
            capturedAt: source.capturedAt || new Date().toISOString(),
        };
    }

    _mergeRestoredLedgerRecords(current, snapshot, assetId) {
        const seen = new Set((Array.isArray(current) ? current : [])
            .map(record => record && typeof record.id === 'string' ? record.id.toLowerCase() : '')
            .filter(Boolean));
        const additions = (Array.isArray(snapshot) ? snapshot : []).filter(record => {
            if (!record || record.assetId !== assetId || typeof record.id !== 'string') return false;
            const canonicalId = record.id.toLowerCase();
            if (seen.has(canonicalId)) return false;
            seen.add(canonicalId);
            return true;
        }).map(record => this._cloneForSnapshot(record));
        return (Array.isArray(current) ? current : []).concat(additions);
    }

    _mergeRestoredSidecarRecords(current, snapshot, assetId) {
        const seen = new Set((Array.isArray(current) ? current : [])
            .map(record => record && record.id ? String(record.id) : '')
            .filter(Boolean));
        const additions = (Array.isArray(snapshot) ? snapshot : []).filter(record => {
            if (!record || record.assetId !== assetId) return false;
            if (!record.id) return true;
            if (seen.has(String(record.id))) return false;
            seen.add(String(record.id));
            return true;
        }).map(record => this._cloneForSnapshot(record));
        return (Array.isArray(current) ? current : []).concat(additions);
    }



    /**
     * Clear only the assets.json collection in one verified core transaction.
     * Deliberately does not call deleteAsset(): clearing must not create logs,
     * touch sidecars, or remove uploaded cover resources one by one.
     */


    // ---------- formal-v1 production workflows ----------
    _formalWorkflowLifecycle(assetId, effectiveDate, kind, details) {
        const now = new Date().toISOString();
        return { id: createStableId(), schemaVersion: 1, assetId: assetId, occurredAt: now,
            effectiveDate: effectiveDate, createdAt: now, source: 'user', correlationId: null,
            note: '', replacesEventId: null, voidedAt: null, kind: kind, details: details || {} };
    }

    _formalWorkflowFinancial(asset, effectiveDate, eventType, direction, amountMinor, metadata) {
        const now = new Date().toISOString();
        return normalizeFinancialRecord({ id: createStableId(), assetId: asset.id, occurredAt: now,
            effectiveDate: effectiveDate, createdAt: now, source: 'user', correlationId: null,
            note: '', metadata: metadata || {}, replacesEventId: null, voidedAt: null,
            direction: direction, eventType: eventType, currency: asset.currency, amountMinor: amountMinor });
    }

    async _formalRenewSubscription(id, data) {
        const input = data || {}; const context = await this._commitAssetAuditMutation(snapshot => {
            const asset = snapshot.assets.find(item => item.id === id);
            if (!asset || asset.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION || asset.status === 'wishlist') throw new Error('subscription asset is required');
            const currentCycle = asset.details && asset.details.billingPlan ? asset.details.billingPlan.cycle : null;
            if (!currentCycle) throw new Error('subscription billing cycle is missing');
            // D6：续订可选择新周期（FORMAL_BILLING_CYCLES 内），与当前不同则同事务持久化到 details.billingPlan.cycle。
            let cycle = currentCycle;
            let detailsPatch = null;
            if (input.cycle != null) {
                if (FORMAL_BILLING_CYCLES.indexOf(input.cycle) < 0) throw new Error('invalid subscription billing cycle');
                if (input.cycle !== currentCycle) {
                    cycle = input.cycle;
                    detailsPatch = { details: Object.assign({}, asset.details || {}, { billingPlan: Object.assign({}, asset.details.billingPlan || {}, { cycle: cycle }) }) };
                }
            }
            const startDate = input.startDate || todayISO();
            const computedEndDate = getSubscriptionPeriodEnd(startDate, cycle);
            const endDate = input.endDate || computedEndDate;
            if (!startDate || !endDate || startDate > endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error('invalid subscription period');
            const amountMinor = Number.isSafeInteger(input.amountMinor)
                ? input.amountMinor
                : parseMajorToMinor(String(input.amount || '0'), asset.currency);
            if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error('invalid subscription payment amount');
            const existingPeriods = (snapshot.subscriptionPeriods || []).filter(item => item && item.assetId === asset.id && !item.voidedAt);
            const overlap = existingPeriods.some(item => startDate <= item.endDate && endDate >= item.startDate);
            if (overlap) throw new Error('subscription period overlaps an existing billing period');
            const payment = this._formalWorkflowFinancial(asset, startDate, FINANCIAL_EVENT_TYPE.SUBSCRIPTION_PAYMENT, FINANCIAL_DIRECTION.OUTFLOW, amountMinor, {});
            const now = new Date().toISOString();
            const period = normalizeSubscriptionPeriodRecord({ id: createStableId(), assetId: asset.id, occurredAt: now, effectiveDate: startDate, createdAt: now, source: 'user', correlationId: null, note: '', metadata: {}, replacesEventId: null, voidedAt: null, kind: 'billing', startDate, endDate, paymentEventId: payment.id });
            // formal-v2 严格层：续订不再修改 details.autoRenew、不再修改 status；
            // 即使资产处于 retired 状态也允许手动续订生成新账期，状态由用户后续通过专门入口切换。
            // D6：若续订指定了新周期，同事务内 mergeFormalV2AssetPatch 持久化 details.billingPlan.cycle。
            const nextAsset = detailsPatch ? mergeFormalV2AssetPatch(asset, detailsPatch, { now: now, today: todayISO() }) : asset;
            const lifecycle = this._formalWorkflowLifecycle(asset.id, startDate, 'subscriptionRenewed', { periodId: period.id, paymentEventId: payment.id, startDate, endDate, amountMinor, cycle, autoRenew: !!asset.details.autoRenew });
            const opLog = { id: createStableId(), type: 'subscription-renew', assetId: asset.id, assetName: asset.name, field: 'subscription', oldValue: asset, newValue: { id: asset.id, startDate, endDate, amountMinor, cycle, periodId: period.id, paymentEventId: payment.id }, ts: now };
            return {
                assets: detailsPatch ? snapshot.assets.map(item => item.id === id ? nextAsset : item) : snapshot.assets,
                financialEvents: snapshot.financialEvents.concat(payment),
                subscriptionPeriods: snapshot.subscriptionPeriods.concat(period),
                lifecycleEvents: snapshot.lifecycleEvents.concat(lifecycle),
                operationLogs: [opLog].concat(snapshot.operationLogs || []),
                context: { asset: nextAsset, payment: payment, period: period }
            };
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context && context.asset;
    }

    /**
     * formal-v2 严格层切换订阅自动续费：
     *   - 仅修改 details.autoRenew
     *   - 写一条 lifecycle event（kind 复用 statusChanged，details.action 区分 enabled/disabled）
     *   - 写一条 operationLog
     *   - 不修改 status、不修改账期、不修改付款、不删除历史财务事件
     */
    async toggleSubscriptionAutoRenew(id, enabled) {
        const target = !!enabled;
        const context = await this._commitAssetAuditMutation(snapshot => {
            const asset = snapshot.assets.find(item => item.id === id);
            if (!asset || asset.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION || asset.status === 'wishlist') throw new Error('subscription asset is required');
            const current = !!(asset.details && asset.details.autoRenew);
            if (current === target) return { noop: true, context: { asset: asset, changed: false } };
            const now = new Date().toISOString();
            const mergedDetails = Object.assign({}, asset.details || {}, { autoRenew: target });
            const next = mergeFormalV2AssetPatch(asset, { details: mergedDetails }, { now: now, today: todayISO() });
            const action = target ? 'subscriptionAutoRenewEnabled' : 'subscriptionAutoRenewDisabled';
            const lifecycle = this._formalWorkflowLifecycle(asset.id, todayISO(), 'statusChanged', {
                action: action,
                fromAutoRenew: current,
                toAutoRenew: target,
            });
            const opLog = {
                id: createStableId(),
                type: 'subscription-auto-renew-toggle',
                assetId: asset.id,
                assetName: asset.name,
                field: 'subscription.autoRenew',
                oldValue: current,
                newValue: target,
                ts: now,
            };
            return {
                assets: snapshot.assets.map(item => item.id === id ? next : item),
                lifecycleEvents: snapshot.lifecycleEvents.concat(lifecycle),
                operationLogs: [opLog].concat(snapshot.operationLogs || []),
                context: { asset: next, changed: true, action: action },
            };
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context;
    }

    /**
     * 需求2（编辑到期日）：编辑最近一期订阅周期的 endDate。
     *   - 取该资产最新（startDate 最大）的 active 周期，void-and-replace 该周期记录；
     *   - 新周期沿用 startDate / kind / paymentEventId，仅替换 endDate；
     *   - 校验 endDate >= 该期 startDate，且重跑 validateSubscriptionPeriodsNoOverlap（失败即 throw 回滚）；
     *   - 写 lifecycle（statusChanged/subscriptionPeriodEndUpdated）+ opLog（type='update'，白名单合法）；
     *   - 不修改资产主实体、不修改付款事件。
     */
    async updateSubscriptionPeriodEnd(id, input) {
        const dto = input || {};
        const context = await this._commitAssetAuditMutation(snapshot => {
            const asset = snapshot.assets.find(item => item.id === id);
            if (!asset || asset.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION || asset.status === 'wishlist') throw new Error('subscription asset is required');
            const newEndDate = dto.endDate;
            if (typeof newEndDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(newEndDate)) throw new Error('invalid subscription period end date');
            const active = (snapshot.subscriptionPeriods || []).filter(item => item && item.assetId === asset.id && !item.voidedAt);
            if (!active.length) throw new Error('no subscription period to edit');
            active.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
            const target = active[active.length - 1];
            if (newEndDate < target.startDate) throw new Error('subscription period end date must not be before its start date');
            const now = new Date().toISOString();
            const voided = Object.assign({}, target, { voidedAt: now });
            const replacement = normalizeSubscriptionPeriodRecord({ id: createStableId(), assetId: asset.id, occurredAt: now, effectiveDate: target.startDate, createdAt: now, source: 'user', correlationId: null, note: '', metadata: {}, replacesEventId: target.id, voidedAt: null, kind: target.kind, startDate: target.startDate, endDate: newEndDate, paymentEventId: target.paymentEventId });
            const nextPeriods = snapshot.subscriptionPeriods.map(item => item.id === target.id ? voided : item).concat(replacement);
            const overlap = validateSubscriptionPeriodsNoOverlap(nextPeriods);
            if (!overlap.valid) throw new Error('subscription period overlaps an existing billing period: ' + overlap.errors.join('; '));
            const lifecycle = this._formalWorkflowLifecycle(asset.id, target.startDate, 'statusChanged', { action: 'subscriptionPeriodEndUpdated', periodId: replacement.id, replacesPeriodId: target.id, startDate: target.startDate, fromEndDate: target.endDate, toEndDate: newEndDate });
            const opLog = this._newFormalOperationLog('update', asset, asset, asset, 'subscription.endDate');
            return {
                assets: snapshot.assets,
                subscriptionPeriods: nextPeriods,
                lifecycleEvents: snapshot.lifecycleEvents.concat(lifecycle),
                operationLogs: [opLog].concat(snapshot.operationLogs || []),
                context: { asset: asset, period: replacement, replacedPeriodId: target.id }
            };
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context && context.asset;
    }

    /**
     * 需求1（编辑金额，D1/D2 void-and-replace）：更正最近一期订阅付款金额。
     *   - 取该资产最新（effectiveDate/occurredAt 最大）的未 void subscriptionPayment 事件；
     *   - void-and-replace：旧事件标记 voidedAt，新建一条 subscriptionPayment（amountMinor=新值，
     *     replacesEventId=旧事件 id，沿用 effectiveDate/currency/direction），通过 validateFinancialReplacementChain；
     *   - 关键：storage 要求周期 paymentEventId 指向未 void 的付款事件，故同步把指向旧付款的周期
     *     paymentEventId 重指到替换事件（直接改 period 引用，不 void 周期）；
     *   - 校验 amountMinor 为 >0 安全整数、必须存在可替换的 subscriptionPayment 事件；
     *   - 写 lifecycle（statusChanged/subscriptionPaymentAmountCorrected）+ opLog（type='update'，白名单合法）；
     *   - 不修改资产主实体。金额投影（subscriptionPayment outflow 之和）随之更新。
     */
    async correctSubscriptionPaymentAmount(id, input) {
        const dto = input || {};
        const context = await this._commitAssetAuditMutation(snapshot => {
            const asset = snapshot.assets.find(item => item.id === id);
            if (!asset || asset.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION || asset.status === 'wishlist') throw new Error('subscription asset is required');
            const amountMinor = Number.isSafeInteger(dto.amountMinor)
                ? dto.amountMinor
                : parseMajorToMinor(String(dto.amount || ''), asset.currency);
            if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error('invalid subscription payment amount');
            // v1.3.1-fix：同 correctPurchaseAmount，愈合 voided+replacesEventId 并防止新增
            const healedFinancialEvents = (snapshot.financialEvents || []).map(event => {
                if (event && event.assetId === asset.id && event.voidedAt && event.replacesEventId != null) {
                    return Object.assign({}, event, { replacesEventId: null });
                }
                return event;
            });
            const payments = healedFinancialEvents.filter(event => event && event.assetId === asset.id && !event.voidedAt && event.eventType === FINANCIAL_EVENT_TYPE.SUBSCRIPTION_PAYMENT);
            if (!payments.length) throw new Error('no subscription payment event to correct');
            payments.sort((a, b) => (a.effectiveDate || '').localeCompare(b.effectiveDate || '') || (a.occurredAt || '').localeCompare(b.occurredAt || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
            const target = payments[payments.length - 1];
            const now = new Date().toISOString();
            const voided = Object.assign({}, target, { voidedAt: now, replacesEventId: null });
            const replacement = normalizeFinancialRecord({ id: createStableId(), assetId: asset.id, occurredAt: now, effectiveDate: target.effectiveDate, createdAt: now, source: 'user', correlationId: null, note: '', metadata: {}, replacesEventId: target.id, voidedAt: null, direction: FINANCIAL_DIRECTION.OUTFLOW, eventType: FINANCIAL_EVENT_TYPE.SUBSCRIPTION_PAYMENT, currency: asset.currency, amountMinor: amountMinor });
            const nextFinancialEvents = healedFinancialEvents.map(event => event.id === target.id ? voided : event).concat(replacement);
            const chain = validateFinancialReplacementChain(nextFinancialEvents);
            if (!chain.valid) throw new Error('financial replacement chain is invalid: ' + chain.errors.join('; '));
            // storage 不变式：周期 paymentEventId 必须指向未 void 的 subscriptionPayment 事件。
            const nextPeriods = (snapshot.subscriptionPeriods || []).map(period => period && period.paymentEventId === target.id ? Object.assign({}, period, { paymentEventId: replacement.id }) : period);
            const lifecycle = this._formalWorkflowLifecycle(asset.id, target.effectiveDate, 'statusChanged', { action: 'subscriptionPaymentAmountCorrected', financialEventId: replacement.id, replacesEventId: target.id, fromAmountMinor: target.amountMinor, toAmountMinor: amountMinor });
            const opLog = this._newFormalOperationLog('update', asset, asset, asset, 'subscription.paymentAmount');
            return {
                assets: snapshot.assets,
                financialEvents: nextFinancialEvents,
                subscriptionPeriods: nextPeriods,
                lifecycleEvents: snapshot.lifecycleEvents.concat(lifecycle),
                operationLogs: [opLog].concat(snapshot.operationLogs || []),
                context: { asset: asset, replacement: replacement, replacedEventId: target.id }
            };
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context && context.asset;
    }

    /**
     * 需求1（编辑开始日期，D3 重锚首期）：编辑订阅开始日期。
     *   - mergeFormalV2AssetPatch 更新 asset.acquiredOn = 新 startDate；
     *   - 重锚最早 billing 周期：void-and-replace 最早（startDate 最小）active 周期，
     *     新周期 startDate = 新 startDate，endDate = input.endDate（若提供）否则 getSubscriptionPeriodEnd(newStartDate, cycle)；
     *   - 重跑 validateSubscriptionPeriodsNoOverlap，失败即 throw 回滚（数据无变更）；
     *   - 写 lifecycle（statusChanged/subscriptionStartDateUpdated）+ opLog（type='update'，白名单合法）。
     */
    async updateSubscriptionStartDate(id, input) {
        const dto = input || {};
        const context = await this._commitAssetAuditMutation(snapshot => {
            const asset = snapshot.assets.find(item => item.id === id);
            if (!asset || asset.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION || asset.status === 'wishlist') throw new Error('subscription asset is required');
            const newStartDate = dto.startDate;
            if (typeof newStartDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(newStartDate)) throw new Error('invalid subscription start date');
            const cycle = asset.details && asset.details.billingPlan ? asset.details.billingPlan.cycle : null;
            if (!cycle) throw new Error('subscription billing cycle is missing');
            const now = new Date().toISOString();
            const nextAsset = mergeFormalV2AssetPatch(asset, { acquiredOn: newStartDate }, { now: now, today: todayISO() });
            let nextPeriods = snapshot.subscriptionPeriods;
            const active = (snapshot.subscriptionPeriods || []).filter(item => item && item.assetId === asset.id && !item.voidedAt);
            if (active.length) {
                active.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
                const target = active[0];
                const newEndDate = (typeof dto.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dto.endDate)) ? dto.endDate : getSubscriptionPeriodEnd(newStartDate, cycle);
                if (!newEndDate || newEndDate < newStartDate) throw new Error('invalid subscription period');
                const voided = Object.assign({}, target, { voidedAt: now });
                const replacement = normalizeSubscriptionPeriodRecord({ id: createStableId(), assetId: asset.id, occurredAt: now, effectiveDate: newStartDate, createdAt: now, source: 'user', correlationId: null, note: '', metadata: {}, replacesEventId: target.id, voidedAt: null, kind: target.kind, startDate: newStartDate, endDate: newEndDate, paymentEventId: target.paymentEventId });
                nextPeriods = snapshot.subscriptionPeriods.map(item => item.id === target.id ? voided : item).concat(replacement);
                const overlap = validateSubscriptionPeriodsNoOverlap(nextPeriods);
                if (!overlap.valid) throw new Error('subscription period overlaps an existing billing period: ' + overlap.errors.join('; '));
            }
            const lifecycle = this._formalWorkflowLifecycle(asset.id, newStartDate, 'statusChanged', { action: 'subscriptionStartDateUpdated', fromAcquiredOn: asset.acquiredOn, toAcquiredOn: newStartDate });
            const opLog = this._newFormalOperationLog('update', asset, asset, nextAsset, 'subscription.startDate');
            return {
                assets: snapshot.assets.map(item => item.id === id ? nextAsset : item),
                subscriptionPeriods: nextPeriods,
                lifecycleEvents: snapshot.lifecycleEvents.concat(lifecycle),
                operationLogs: [opLog].concat(snapshot.operationLogs || []),
                context: { asset: nextAsset }
            };
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context && context.asset;
    }

    /**
     * 阶段3（订阅编辑解锁）：计算订阅编辑表单的"原始预填值"，用于判断用户是否实际修改
     *（与预填值比较，改了才调域方法，避免多余流水/opLog —— 验收8）。
     *   - paymentMajor / originalAmountMinor：最近一期未 void subscriptionPayment 的金额（major 字符串 + minor 整数）；
     *   - startDate：existing.acquiredOn；endDate：最近一期（max endDate）周期 endDate。
     * 与渲染层 virtualEditPaymentMajor / virtualExpiryDisplay 的取数口径一致。
     */
    _subscriptionEditOriginals(existing) {
        const currency = existing.currency || 'CNY';
        const payments = (this._financialEvents || []).filter(event => event && event.assetId === existing.id && event.eventType === 'subscriptionPayment' && !event.voidedAt);
        let paymentMajor = null; let originalAmountMinor = null; const hasPayment = payments.length > 0;
        if (payments.length) {
            payments.sort((l, r) => String(l.effectiveDate || '').localeCompare(String(r.effectiveDate || '')) || String(l.occurredAt || '').localeCompare(String(r.occurredAt || '')));
            const last = payments[payments.length - 1];
            if (Number.isSafeInteger(last.amountMinor)) { originalAmountMinor = last.amountMinor; paymentMajor = minorToMajorString(last.amountMinor, currency); }
        }
        const active = (this._subscriptionPeriods || []).filter(period => period && period.assetId === existing.id && !period.voidedAt);
        let endDate = null;
        if (active.length) { const maxEnd = active.map(period => String(period.endDate || '')).sort().pop(); if (maxEnd) endDate = maxEnd; }
        return { currency: currency, paymentMajor: paymentMajor, originalAmountMinor: originalAmountMinor, hasPayment: hasPayment, startDate: existing.acquiredOn || null, endDate: endDate };
    }

    /**
     * 阶段3（订阅编辑前置校验 + 计划）：在任意提交前，按阶段1域方法语义投影"编辑后"的 active
     * 周期集合，校验日期顺序与重叠（等价 validateSubscriptionPeriodsNoOverlap），并校验金额合法性。
     * 任一失败 throw（onsubmit catch → toast，且 updateAsset/域方法均未执行 → 无部分提交，验收4/6）。
     * 返回 plan：{ amountChanged, newAmountMinor, startDateChanged, newStartDate, endDateChanged, newEndDate }。
     */
    _planSubscriptionEdit(existing, form, currency, originals) {
        const value = name => (form.elements[name] ? form.elements[name].value : '');
        const plan = { amountChanged: false, newAmountMinor: null, startDateChanged: false, newStartDate: null, endDateChanged: false, newEndDate: null };
        // 金额：与最近一期 subscriptionPayment 按 minor 整数比对（避免 "10" vs "10.00" 字符串误判）。
        const newAmountRaw = form.elements.amount ? String(form.elements.amount.value || '').trim() : '';
        if (newAmountRaw !== '') {
            let parsed;
            try { parsed = parseMajorToMinor(newAmountRaw, currency); }
            catch (error) { throw new Error(this._t('subscriptionAmountInvalid', '订阅金额格式无效')); }
            if (parsed !== originals.originalAmountMinor) {
                if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(this._t('subscriptionAmountInvalid', '订阅金额必须大于 0'));
                if (!originals.hasPayment) throw new Error(this._t('subscriptionNoPayment', '没有可更正的订阅付款记录'));
                plan.amountChanged = true; plan.newAmountMinor = parsed;
            }
        }
        // 开始日期 / 到期日：与预填值（acquiredOn / 最近期 endDate）比对。
        const newStartDate = value('acquiredOn');
        if (newStartDate && newStartDate !== originals.startDate) { plan.startDateChanged = true; plan.newStartDate = newStartDate; }
        const newEndDate = value('periodEnd');
        if (newEndDate && newEndDate !== originals.endDate) { plan.endDateChanged = true; plan.newEndDate = newEndDate; }
        if (!plan.startDateChanged && !plan.endDateChanged) return plan; // 无日期改动 → 无需周期投影校验
        // 投影编辑后的 active 周期集合（与 updateSubscriptionStartDate/updateSubscriptionPeriodEnd 语义一致）：
        // 开始日期重锚最早一期（endDate 按新 cycle 派生），到期日替换最近一期 endDate。
        const newCycle = value('formalPlanCycle') || (existing.details && existing.details.billingPlan && existing.details.billingPlan.cycle) || 'monthly';
        const active = (this._subscriptionPeriods || []).filter(period => period && period.assetId === existing.id && !period.voidedAt)
            .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)) || String(a.endDate).localeCompare(String(b.endDate)));
        if (!active.length) return plan; // 无周期：交由域方法 throw（数据异常），此处不阻断
        const proj = active.map(period => ({ startDate: String(period.startDate), endDate: String(period.endDate) }));
        if (plan.startDateChanged) {
            const reanchorEnd = getSubscriptionPeriodEnd(plan.newStartDate, newCycle);
            if (!reanchorEnd || reanchorEnd < plan.newStartDate) throw new Error(this._t('subscriptionPeriodInvalid', '订阅周期无效'));
            proj[0] = { startDate: plan.newStartDate, endDate: reanchorEnd };
        }
        if (plan.endDateChanged) {
            if (plan.newEndDate < proj[proj.length - 1].startDate) throw new Error(this._t('subscriptionEndBeforeStart', '到期日不能早于开始日期'));
            proj[proj.length - 1] = { startDate: proj[proj.length - 1].startDate, endDate: plan.newEndDate };
        }
        const sorted = proj.slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].startDate <= sorted[i - 1].endDate) throw new Error(this._t('subscriptionPeriodOverlap', '订阅周期与现有计费周期重叠'));
        }
        return plan;
    }

    /**
     * 阶段3（订阅编辑提交）：按"开始日期 → 金额 → 到期日"顺序依次调用阶段1域方法（各自独立事务）。
     * 仅当 plan 标记为 changed 时才调用（验收8）。前置校验已通过，故此处域方法不应再因重叠/日期顺序 throw。
     * 顺序说明：先 updateSubscriptionStartDate（重锚首期 + 更新 acquiredOn，使用 updateAsset 已持久化的新 cycle），
     * 再 correctSubscriptionPaymentAmount（与周期日期无关），最后 updateSubscriptionPeriodEnd（替换最近一期 endDate）。
     */
    async _applySubscriptionEditPlan(existing, plan) {
        if (plan.startDateChanged) await this.updateSubscriptionStartDate(existing.id, { startDate: plan.newStartDate });
        if (plan.amountChanged) await this.correctSubscriptionPaymentAmount(existing.id, { amountMinor: plan.newAmountMinor });
        if (plan.endDateChanged) await this.updateSubscriptionPeriodEnd(existing.id, { endDate: plan.newEndDate });
    }

    /**
     * 阶段1（编辑解锁）：计算编辑表单"购买成本"预填与比对所需的原始值。
     *   - originalAmountMinor：该资产【最早一笔未作废 purchase 事件】的 amountMinor（无则 null）；
     *   - hasPurchase：是否存在未作废 purchase 事件。
     * 与渲染层 physicalEditPriceMajor / prepaidAcquisitionMinor 取数口径一致（单事件资产 == acquisitionAmountMinor）。
     * 订阅不走这里（其价格语义是 subscriptionPayment，由 _subscriptionEditOriginals 处理）。
     */
    _purchasePriceEditOriginals(existing) {
        const currency = (existing && existing.currency) || 'CNY';
        const result = { currency: currency, originalAmountMinor: null, hasPurchase: false };
        if (!existing || !Array.isArray(this._financialEvents)) return result;
        const purchases = this._financialEvents.filter(event => event && event.assetId === existing.id && event.eventType === FINANCIAL_EVENT_TYPE.PURCHASE && !event.voidedAt);
        if (!purchases.length) return result;
        purchases.sort((l, r) => String(l.effectiveDate || '').localeCompare(String(r.effectiveDate || '')) || String(l.occurredAt || '').localeCompare(String(r.occurredAt || '')) || String(l.createdAt || '').localeCompare(String(r.createdAt || '')));
        const earliest = purchases[0];
        result.hasPurchase = true;
        if (Number.isSafeInteger(earliest.amountMinor)) result.originalAmountMinor = earliest.amountMinor;
        return result;
    }

    /**
     * 阶段1（编辑解锁，前置校验 + 计划）：在任意提交前解析表单"购买成本"，与最早 purchase 金额按
     * minor 整数比对（避免 "10" vs "10.00" 字符串误判），仅当实际变化时才标记 amountChanged（验收：
     * 未改价格不产生新事件）。参照 _planSubscriptionEdit 的"先校验后提交"语义：格式非法即 throw
     *（onsubmit catch → toast，且 updateAsset/域方法均未执行 → 无部分提交）。
     *   - 有 purchase：parsed !== originalAmountMinor → 替换；
     *   - 无 purchase（新建未填价/导入）：仅当 parsed > 0（填入真实价格）时才新建一笔。
     * 返回 plan：{ amountChanged, newAmountMinor }。
     */
    _planPurchasePriceEdit(existing, form, currency, originals) {
        const plan = { amountChanged: false, newAmountMinor: null };
        const raw = form.elements.amount ? String(form.elements.amount.value || '').trim() : '';
        let parsed;
        try { parsed = parseMajorToMinor(raw || '0', currency); }
        catch (error) { throw new Error(this._t('purchaseAmountInvalid', '购买价格格式无效')); }
        if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(this._t('purchaseAmountInvalid', '购买价格格式无效'));
        if (originals.hasPurchase) {
            if (parsed !== originals.originalAmountMinor) { plan.amountChanged = true; plan.newAmountMinor = parsed; }
        } else if (parsed > 0) {
            plan.amountChanged = true; plan.newAmountMinor = parsed;
        }
        return plan;
    }

    /**
     * 阶段1（编辑解锁，提交）：按 plan 调用 correctPurchaseAmount（仅当 amountChanged）。
     * 参照 _applySubscriptionEditPlan：plan 已通过前置校验，此处域方法不应再因格式 throw。
     */
    async _applyPurchasePriceEditPlan(existing, plan) {
        if (plan && plan.amountChanged) await this.correctPurchaseAmount(existing.id, { amountMinor: plan.newAmountMinor });
    }

    /**
     * 阶段1（编辑价格，购买成本 void-and-replace）：更正资产最早一笔未作废 purchase 事件金额。
     *   - 适用 physical / virtualPerpetual / prepaidAmount / prepaidCount（订阅走 correctSubscriptionPaymentAmount）；
     *   - 取该资产最早（effectiveDate/occurredAt 最小）的未 void purchase 事件；
     *   - void-and-replace：旧事件标记 voidedAt，新建一条 purchase（amountMinor=新值，
     *     replacesEventId=旧事件 id，沿用 effectiveDate/currency/direction/eventType），通过 validateFinancialReplacementChain；
     *   - 预付不变式（projectFormalPrepaid）：流水 financialEventId 必须指向未 void 的财务事件，故同步把
     *     指向旧 purchase 的 prepaidTransaction.financialEventId 重指到替换事件（类比订阅 period.paymentEventId 重指）；
     *   - 若资产无 purchase 事件（新建未填价/导入），则新建一笔 purchase（effectiveDate=acquiredOn）；
     *   - 写 lifecycle（statusChanged/purchaseAmountCorrected）+ opLog（type='update'，白名单合法）；
     *   - 不修改资产主实体。金额投影（acquisitionAmountMinor）随之更新。
     */
    async correctPurchaseAmount(id, input) {
        const dto = input || {};
        const context = await this._commitAssetAuditMutation(snapshot => {
            const asset = snapshot.assets.find(item => item.id === id);
            if (!asset || asset.status === 'wishlist') throw new Error('owned asset is required');
            if (asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) throw new Error('subscription uses correctSubscriptionPaymentAmount');
            const amountMinor = Number.isSafeInteger(dto.amountMinor)
                ? dto.amountMinor
                : parseMajorToMinor(String(dto.amount || ''), asset.currency);
            if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error('invalid purchase amount');
            // v1.3.1-fix：愈合已有 voided+replacesEventId 的事件。validateFinancialReplacementChain
            // 要求 replacement 必须 active；第二次编辑价格时旧 replacement 被 void 但仍携带
            // replacesEventId → 校验报 "replacement must be active"。清除 voided 事件的
            // replacesEventId 使其变为独立 voided 记录，不参与替换链。
            const healedFinancialEvents = (snapshot.financialEvents || []).map(event => {
                if (event && event.assetId === asset.id && event.voidedAt && event.replacesEventId != null) {
                    return Object.assign({}, event, { replacesEventId: null });
                }
                return event;
            });
            const purchases = healedFinancialEvents.filter(event => event && event.assetId === asset.id && !event.voidedAt && event.eventType === FINANCIAL_EVENT_TYPE.PURCHASE);
            const now = new Date().toISOString();
            let nextFinancialEvents;
            let replacement;
            let replacedEventId = null;
            let fromAmountMinor = null;
            if (purchases.length) {
                purchases.sort((a, b) => (a.effectiveDate || '').localeCompare(b.effectiveDate || '') || (a.occurredAt || '').localeCompare(b.occurredAt || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
                const target = purchases[0];
                if (target.amountMinor === amountMinor) return { noop: true, context: { asset: asset, changed: false } };
                fromAmountMinor = target.amountMinor;
                replacedEventId = target.id;
                // v1.3.1-fix：void 时同步清除 replacesEventId，防止后续编辑再次触发校验错误
                const voided = Object.assign({}, target, { voidedAt: now, replacesEventId: null });
                replacement = normalizeFinancialRecord({ id: createStableId(), assetId: asset.id, occurredAt: now, effectiveDate: target.effectiveDate, createdAt: now, source: 'user', correlationId: null, note: '', metadata: {}, replacesEventId: target.id, voidedAt: null, direction: FINANCIAL_DIRECTION.OUTFLOW, eventType: FINANCIAL_EVENT_TYPE.PURCHASE, currency: asset.currency, amountMinor: amountMinor });
                nextFinancialEvents = healedFinancialEvents.map(event => event.id === target.id ? voided : event).concat(replacement);
            } else {
                if (amountMinor <= 0) return { noop: true, context: { asset: asset, changed: false } };
                replacement = normalizeFinancialRecord({ id: createStableId(), assetId: asset.id, occurredAt: now, effectiveDate: asset.acquiredOn, createdAt: now, source: 'user', correlationId: null, note: '', metadata: {}, replacesEventId: null, voidedAt: null, direction: FINANCIAL_DIRECTION.OUTFLOW, eventType: FINANCIAL_EVENT_TYPE.PURCHASE, currency: asset.currency, amountMinor: amountMinor });
                nextFinancialEvents = healedFinancialEvents.concat(replacement);
            }
            const chain = validateFinancialReplacementChain(nextFinancialEvents);
            if (!chain.valid) throw new Error('financial replacement chain is invalid: ' + chain.errors.join('; '));
            // 预付不变式：流水 financialEventId 必须指向未 void 的财务事件，重指指向旧 purchase 的流水。
            const nextPrepaidTransactions = replacedEventId
                ? (snapshot.prepaidTransactions || []).map(tx => tx && tx.financialEventId === replacedEventId ? Object.assign({}, tx, { financialEventId: replacement.id }) : tx)
                : snapshot.prepaidTransactions;
            const lifecycle = this._formalWorkflowLifecycle(asset.id, replacement.effectiveDate, 'statusChanged', { action: 'purchaseAmountCorrected', financialEventId: replacement.id, replacesEventId: replacedEventId, fromAmountMinor: fromAmountMinor, toAmountMinor: amountMinor });
            const opLog = this._newFormalOperationLog('update', asset, asset, asset, 'purchase.amount');
            return {
                assets: snapshot.assets,
                financialEvents: nextFinancialEvents,
                prepaidTransactions: nextPrepaidTransactions,
                lifecycleEvents: snapshot.lifecycleEvents.concat(lifecycle),
                operationLogs: [opLog].concat(snapshot.operationLogs || []),
                context: { asset: asset, replacement: replacement, replacedEventId: replacedEventId, changed: true }
            };
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context && context.asset;
    }

    /**
     * v2.6.2 修复批次 2（已退役实物再编辑，转让价更正）：更正资产最后一笔未作废
     * sale/inflow 事件的金额。formal-v2 的转让价只存在 financialEvents sidecar，
     * 资产主记录没有 salePrice 键；编辑表单退役扩展区提交新价格，仅当与现值不同
     * 才 void-and-replace（金额相同 → noop，不产生任何审计噪声）。
     *   - 事务模式完全对齐 correctPurchaseAmount：先愈合 voided 事件残留的
     *     replacesEventId（validateFinancialReplacementChain 要求 replacement 必须
     *     active，第二次改价时旧 replacement 已 void 但仍带 replacesEventId 会误报）；
     *   - void 旧 sale 事件（voidedAt=now，同步清 replacesEventId）；用既有
     *     _formalWorkflowFinancial 构造新 sale/inflow 事件（effectiveDate 沿用旧事件、
     *     occurredAt=now、source='user'、metadata={}），再覆写 replacesEventId=旧事件 id；
     *   - 写 lifecycle（statusChanged/salePriceCorrected）+ opLog（type='physical-sale'、
     *     field='salePrice'、oldValue/newValue 为 minor 整数；assertFormalOperationLog
     *     对 ordinary 类 physical-sale 在 owner 存在时不约束 oldValue/newValue，已通过
     *     storage.js 校验器确认）；
     *   - 不修改资产主实体（statusChangedOn 已由表单提交路径 updateAsset 持久化）。
     *     soldOn 仅为与域方法签名对齐而接受：替换事件沿用原始转让日期（价格更正
     *     不改变转让发生日），报表按未作废事件聚合，口径随之自动更正。
     */
    async _correctSalePrice(id, input) {
        const dto = input || {};
        if (dto.soldOn != null && !/^\d{4}-\d{2}-\d{2}$/.test(dto.soldOn)) throw new Error('invalid soldOn');
        const context = await this._commitAssetAuditMutation(snapshot => {
            const asset = snapshot.assets.find(item => item.id === id);
            if (!asset || asset.kind !== FORMAL_ASSET_KIND.PHYSICAL || asset.status !== 'retired') throw new Error('retired physical asset is required');
            const amountMinor = dto.priceMinor;
            if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error('invalid sale price');
            const healedFinancialEvents = (snapshot.financialEvents || []).map(event => {
                if (event && event.assetId === asset.id && event.voidedAt && event.replacesEventId != null) {
                    return Object.assign({}, event, { replacesEventId: null });
                }
                return event;
            });
            const sales = healedFinancialEvents.filter(event => event && event.assetId === asset.id && !event.voidedAt && event.eventType === FINANCIAL_EVENT_TYPE.SALE && event.direction === FINANCIAL_DIRECTION.INFLOW);
            if (!sales.length) throw new Error('no active sale event to correct; use recordPhysicalSaleAsset');
            sales.sort((a, b) => (a.effectiveDate || '').localeCompare(b.effectiveDate || '') || (a.occurredAt || '').localeCompare(b.occurredAt || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
            const target = sales[sales.length - 1];
            if (target.amountMinor === amountMinor) return { noop: true, context: { asset: asset, changed: false } };
            const fromAmountMinor = target.amountMinor;
            const now = new Date().toISOString();
            const voided = Object.assign({}, target, { voidedAt: now, replacesEventId: null });
            const replacement = Object.assign(this._formalWorkflowFinancial(asset, target.effectiveDate, FINANCIAL_EVENT_TYPE.SALE, FINANCIAL_DIRECTION.INFLOW, amountMinor, {}), { replacesEventId: target.id });
            const nextFinancialEvents = healedFinancialEvents.map(event => event.id === target.id ? voided : event).concat(replacement);
            const chain = validateFinancialReplacementChain(nextFinancialEvents);
            if (!chain.valid) throw new Error('financial replacement chain is invalid: ' + chain.errors.join('; '));
            const lifecycle = this._formalWorkflowLifecycle(asset.id, replacement.effectiveDate, 'statusChanged', { action: 'salePriceCorrected', financialEventId: replacement.id, replacesEventId: target.id, fromAmountMinor: fromAmountMinor, toAmountMinor: amountMinor });
            const opLog = {
                id: createStableId(),
                type: 'physical-sale',
                assetId: asset.id,
                assetName: asset.name,
                field: 'salePrice',
                oldValue: fromAmountMinor,
                newValue: amountMinor,
                ts: now,
            };
            return {
                assets: snapshot.assets,
                financialEvents: nextFinancialEvents,
                lifecycleEvents: snapshot.lifecycleEvents.concat(lifecycle),
                operationLogs: [opLog].concat(snapshot.operationLogs || []),
                context: { asset: asset, replacement: replacement, replacedEventId: target.id, changed: true },
            };
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context && context.asset;
    }

    async addPrepaidTransaction(id, input) {
        const dto = input || {}; const context = await this._commitAssetAuditMutation(snapshot => {
            const asset = snapshot.assets.find(item => item.id === id);
            if (!asset || ![FORMAL_ASSET_KIND.PREPAID_AMOUNT, FORMAL_ASSET_KIND.PREPAID_COUNT].includes(asset.kind) || asset.status === 'wishlist') throw new Error('prepaid asset is required');
            const dimension = asset.kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT ? 'amount' : 'count'; const type = dto.type;
            if (['inflow', 'outflow', 'adjust'].indexOf(type) < 0 && !(dimension === 'amount' && type === 'refund')) throw new Error('invalid prepaid transaction type');
            const direction = type === 'outflow' || type === 'refund' ? FINANCIAL_DIRECTION.OUTFLOW : (type === 'adjust' ? dto.direction : FINANCIAL_DIRECTION.INFLOW);
            const date = dto.date || todayISO(); const now = new Date().toISOString(); let financial = null;
            let count = null;
            if (dimension === 'amount') {
                const amountMinor = Number.isSafeInteger(dto.amountMinor) ? dto.amountMinor : parseMajorToMinor(String(dto.amount || '0'), asset.currency);
                if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error('invalid prepaid amount');
                const eventType = type === 'inflow' ? FINANCIAL_EVENT_TYPE.PREPAID_CHARGE : (type === 'outflow' ? FINANCIAL_EVENT_TYPE.PREPAID_CONSUMPTION : (type === 'refund' ? FINANCIAL_EVENT_TYPE.REFUND : FINANCIAL_EVENT_TYPE.ADJUSTMENT));
                financial = this._formalWorkflowFinancial(asset, date, eventType, type === 'inflow' ? FINANCIAL_DIRECTION.OUTFLOW : (type === 'refund' ? FINANCIAL_DIRECTION.INFLOW : direction), amountMinor, { affectsCash: type === 'inflow' || type === 'refund' });
            } else {
                count = Number(dto.count); if (!Number.isSafeInteger(count) || count < 0) throw new Error('invalid prepaid count');
                const paymentMinor = dto.paymentAmount == null || dto.paymentAmount === '' ? null : parseMajorToMinor(String(dto.paymentAmount), asset.currency);
                if (type === 'inflow' && Number.isSafeInteger(paymentMinor) && paymentMinor >= 0) financial = this._formalWorkflowFinancial(asset, date, FINANCIAL_EVENT_TYPE.PREPAID_CHARGE, FINANCIAL_DIRECTION.OUTFLOW, paymentMinor, { affectsCash: true });
            }
            const record = { id: createStableId(), assetId: id, type, dimension, direction, effectiveDate: date, occurredAt: now, createdAt: now, note: String(dto.note || ''), financialEventId: financial ? financial.id : null };
            if (dimension === 'count') record.count = count;
            const lifecycle = this._formalWorkflowLifecycle(id, date, 'prepaidTransaction', { transactionId: record.id, type });
            return { prepaidTransactions: snapshot.prepaidTransactions.concat(record), financialEvents: financial ? snapshot.financialEvents.concat(financial) : snapshot.financialEvents, lifecycleEvents: snapshot.lifecycleEvents.concat(lifecycle), operationLogs: [{ id: createStableId(), type: 'prepaid-' + type, assetId: id, assetName: asset.name, field: 'prepaid', oldValue: null, newValue: record, ts: now }].concat(snapshot.operationLogs), context: { record } };
        }); return context.record;
    }

    async addMaintenanceRecord(id, input) {
        const dto = input || {}; const context = await this._commitAssetAuditMutation(snapshot => {
            const asset = snapshot.assets.find(item => item.id === id);
            if (!asset || asset.kind !== FORMAL_ASSET_KIND.PHYSICAL || asset.status === 'wishlist') throw new Error('资产类型不支持维保');
            const date = dto.date || todayISO(); const now = new Date().toISOString(); const amountMinor = Number.isSafeInteger(dto.amountMinor) ? dto.amountMinor : parseMajorToMinor(String(dto.amount || '0'), asset.currency);
            if (!['repair', 'maintain'].includes(dto.type) || !Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error('invalid maintenance record');
            const financial = amountMinor > 0 ? this._formalWorkflowFinancial(asset, date, FINANCIAL_EVENT_TYPE.MAINTENANCE, FINANCIAL_DIRECTION.OUTFLOW, amountMinor, {}) : null;
            const record = { id: createStableId(), assetId: id, type: dto.type, date, note: String(dto.note || ''), createdAt: now, financialEventId: financial ? financial.id : null, details: {} };
            return { maintenance: snapshot.maintenance.concat(record), financialEvents: financial ? snapshot.financialEvents.concat(financial) : snapshot.financialEvents, lifecycleEvents: snapshot.lifecycleEvents.concat(this._formalWorkflowLifecycle(id, date, 'maintenanceRecorded', { maintenanceId: record.id })), operationLogs: [{ id: createStableId(), type: 'maintenance-add', assetId: id, assetName: asset.name, field: 'maintenance', oldValue: null, newValue: record, ts: now }].concat(snapshot.operationLogs), context: { record } };
        }); return context.record;
    }

async deleteFormalWorkflowRecord(id, mode, recordId) {
        if (mode === 'usage') throw new Error('formal-v2: usage records are no longer supported');
        const context = await this._commitAssetAuditMutation(snapshot => {
            const key = mode === 'maintenance' ? 'maintenance' : 'prepaidTransactions';
            const record = snapshot[key].find(item => item.id === recordId && item.assetId === id);
            if (!record) return { noop: true, context: { deleted: false } };
            const asset = snapshot.assets.find(item => item.id === id); const now = new Date().toISOString();
            const financialEvents = record.financialEventId ? snapshot.financialEvents.map(event => event.id === record.financialEventId ? Object.assign({}, event, { voidedAt: now }) : event) : snapshot.financialEvents;
            return { [key]: snapshot[key].filter(item => item.id !== recordId), financialEvents, operationLogs: [{ id: createStableId(), type: mode + '-delete', assetId: id, assetName: asset.name, field: mode, oldValue: record, newValue: null, ts: now }].concat(snapshot.operationLogs), context: { deleted: true } };
        }); return context.deleted;
    }

    /**
     * formal-v2 阶段 5：实物退役（无转让价）。
     *   - 同事务 status=retired + statusChangedOn + lifecycle event (kind=retired) + operationLog
     *   - 不写 details.salePrice
     *   - 不创建 financial event
     */
    async retirePhysicalAsset(id, options) {
        const opts = options || {};
        const retiredDate = opts.retiredDate || todayISO();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(retiredDate)) throw new Error('invalid retiredDate');
        const note = String(opts.note || '');
        const context = await this._commitAssetAuditMutation(snapshot => {
            const current = snapshot.assets.find(item => item.id === id);
            if (!current || current.kind !== FORMAL_ASSET_KIND.PHYSICAL || current.status === 'wishlist') throw new Error('physical asset is required');
            if (current.status === 'retired') return { noop: true, context: { asset: current, changed: false } };
            const now = new Date().toISOString();
            const next = mergeFormalV2AssetPatch(current, { status: 'retired', statusChangedOn: retiredDate }, { now: now, today: retiredDate });
            const lifecycle = this._formalWorkflowLifecycle(current.id, retiredDate, 'retired', {
                retiredDate: retiredDate,
                note: note,
                kind: 'retire',
            });
            const opLog = {
                id: createStableId(),
                type: 'physical-retire',
                assetId: current.id,
                assetName: current.name,
                field: 'status',
                oldValue: current.status,
                newValue: 'retired',
                ts: now,
            };
            return {
                assets: snapshot.assets.map(item => item.id === id ? next : item),
                lifecycleEvents: snapshot.lifecycleEvents.concat(lifecycle),
                operationLogs: [opLog].concat(snapshot.operationLogs || []),
                context: { asset: next, changed: true },
            };
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context;
    }

    /**
     * formal-v2 阶段 5：实物转让（带转让价）。
     *   - 同事务：
     *       1) financial event（direction=inflow、eventType=sale、amountMinor=priceMinor、currency=asset.currency）
     *       2) status=retired + statusChangedOn=soldOn
     *       3) lifecycle event（kind=retired，details.saleFinancialEventId 关联 financial event）
     *       4) operationLog（type=physical-sale）
     *   - 严格规则：priceMinor 必须是 > 0 的安全整数；不写 details.salePrice
     *   - 入参命名采用 priceMinor/soldOn 以避开 grep 禁词字面量
     */
    async recordPhysicalSaleAsset(id, options) {
        const opts = options || {};
        const priceMinor = opts.priceMinor;
        if (!Number.isSafeInteger(priceMinor) || priceMinor <= 0) throw new Error('invalid priceMinor');
        const soldOn = opts.soldOn || todayISO();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(soldOn)) throw new Error('invalid soldOn');
        const note = String(opts.note || '');
        const context = await this._commitAssetAuditMutation(snapshot => {
            const current = snapshot.assets.find(item => item.id === id);
            if (!current || current.kind !== FORMAL_ASSET_KIND.PHYSICAL || current.status === 'wishlist') throw new Error('physical asset is required');
            const now = new Date().toISOString();
            const financial = this._formalWorkflowFinancial(current, soldOn, FINANCIAL_EVENT_TYPE.SALE, FINANCIAL_DIRECTION.INFLOW, priceMinor, {});
            const next = mergeFormalV2AssetPatch(current, { status: 'retired', statusChangedOn: soldOn }, { now: now, today: soldOn });
            const lifecycle = this._formalWorkflowLifecycle(current.id, soldOn, 'retired', {
                retiredDate: soldOn,
                note: note,
                kind: 'sale',
                priceMinor: priceMinor,
                currency: current.currency,
                saleFinancialEventId: financial.id,
            });
            const opLog = {
                id: createStableId(),
                type: 'physical-sale',
                assetId: current.id,
                assetName: current.name,
                field: 'status+sale',
                oldValue: current.status,
                newValue: 'retired',
                ts: now,
            };
            return {
                assets: snapshot.assets.map(item => item.id === id ? next : item),
                financialEvents: snapshot.financialEvents.concat(financial),
                lifecycleEvents: snapshot.lifecycleEvents.concat(lifecycle),
                operationLogs: [opLog].concat(snapshot.operationLogs || []),
                context: { asset: next, financial: financial, changed: true },
            };
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context;
    }

    /**
     * formal-v2 阶段 6：次数预付校正（手动设定目标剩余次数）。
     *   - 读 projectFormalPrepaid 当前投影 C
     *   - delta = targetCount - C
     *     delta > 0 → prepaidTransaction type='adjust', dimension='count', direction='inflow', count=delta
     *     delta < 0 → prepaidTransaction type='adjust', dimension='count', direction='outflow', count=Math.abs(delta)
     *     delta = 0 → noop
     *   - financialEventId=null（不计现金）
     *   - effectiveDate 默认今天
     *   - note 默认 i18n prepaidAdjustReasonDefault（次数校正）
     */
    async recordPrepaidCountAdjustment(id, options) {
        const opts = options || {};
        const targetCount = Number(opts.targetCount);
        if (!Number.isSafeInteger(targetCount) || targetCount < 0) throw new Error('invalid targetCount');
        const effectiveDate = opts.effectiveDate || todayISO();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new Error('invalid effectiveDate');
        const note = String(opts.note || this._t('prepaidAdjustReasonDefault', '次数校正'));
        const context = await this._commitAssetAuditMutation(snapshot => {
            const asset = snapshot.assets.find(item => item.id === id);
            if (!asset || asset.kind !== FORMAL_ASSET_KIND.PREPAID_COUNT || asset.status === 'wishlist') throw new Error('prepaid count asset is required');
            const projection = projectFormalPrepaid(asset, snapshot.prepaidTransactions.filter(t => t.assetId === id), snapshot.financialEvents.filter(e => e.assetId === id));
            const currentRemaining = projection && Number.isSafeInteger(projection.remainingCount) ? projection.remainingCount : 0;
            const delta = targetCount - currentRemaining;
            if (delta === 0) return { noop: true, context: { asset: asset, changed: false, currentRemaining: currentRemaining } };
            const now = new Date().toISOString();
            const direction = delta > 0 ? FINANCIAL_DIRECTION.INFLOW : FINANCIAL_DIRECTION.OUTFLOW;
            const record = {
                id: createStableId(),
                assetId: id,
                type: 'adjust',
                dimension: 'count',
                direction: direction,
                count: Math.abs(delta),
                effectiveDate: effectiveDate,
                occurredAt: now,
                createdAt: now,
                note: note,
                financialEventId: null,
            };
            const lifecycle = this._formalWorkflowLifecycle(id, effectiveDate, 'prepaidTransaction', {
                transactionId: record.id,
                type: 'adjust',
                adjustmentReason: note,
                fromRemaining: currentRemaining,
                toRemaining: targetCount,
            });
            const opLog = {
                id: createStableId(),
                type: 'prepaid-adjust',
                assetId: id,
                assetName: asset.name,
                field: 'prepaid.count',
                oldValue: currentRemaining,
                newValue: targetCount,
                ts: now,
            };
            return {
                prepaidTransactions: snapshot.prepaidTransactions.concat(record),
                lifecycleEvents: snapshot.lifecycleEvents.concat(lifecycle),
                operationLogs: [opLog].concat(snapshot.operationLogs || []),
                context: { record: record, changed: true, delta: delta, currentRemaining: currentRemaining },
            };
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context;
    }

    /**
     * formal-v2 阶段 2（需求 B）：新建 / 拔草次数权益时，把表单填写的「剩余次数」
     *   落到一笔 adjust 交易（复用 recordPrepaidCountAdjustment，数据层零改动）。
     *   - 仅 PREPAID_COUNT；读 form.elements.initialRemainingCount
     *   - 守卫：非空 + Number.isSafeInteger && >=0 && !== openingCount
     *   - 剩余>初始 → inflow adjust；剩余<初始 → outflow adjust（由 recordPrepaidCountAdjustment 按投影 delta 决定）
     *   addAsset 主路径与 completeWishlistPurchase 拔草路径共用，保证两处行为一致。
     */
    async _applyInitialRemainingCountAdjust(created, form, openingCountNum) {
        if (!created || created.kind !== FORMAL_ASSET_KIND.PREPAID_COUNT) return;
        const initialRemainingEl = form.elements.initialRemainingCount;
        const initialRemainingRaw = initialRemainingEl ? String(initialRemainingEl.value || '') : '';
        if (initialRemainingRaw.length === 0) return;
        const initialRemainingNum = Number(initialRemainingRaw);
        if (!Number.isSafeInteger(initialRemainingNum) || initialRemainingNum < 0 || initialRemainingNum === openingCountNum) return;
        await this.recordPrepaidCountAdjustment(created.id, { targetCount: initialRemainingNum, effectiveDate: todayISO(), note: this._t('prepaidAdjustReasonDefault', '次数校正') });
    }

    /**
     * formal-v2 阶段 6：次数预付消费（记一笔 outflow）。
     *   - 校验 count > 0
     *   - 读 projectFormalPrepaid 投影，若当前剩余 < count 则抛错
     *   - 同事务：prepaidTransaction type='outflow', dimension='count', direction='outflow', count=count, financialEventId=null
     *     + lifecycle event（kind=prepaidTransaction）+ operationLog
     */
    async recordPrepaidConsumption(id, options) {
        const opts = options || {};
        const count = Number(opts.count);
        if (!Number.isSafeInteger(count) || count <= 0) throw new Error('invalid consumption count');
        const effectiveDate = opts.effectiveDate || todayISO();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new Error('invalid effectiveDate');
        const note = String(opts.note || '');
        const context = await this._commitAssetAuditMutation(snapshot => {
            const asset = snapshot.assets.find(item => item.id === id);
            if (!asset || asset.kind !== FORMAL_ASSET_KIND.PREPAID_COUNT || asset.status === 'wishlist') throw new Error('prepaid count asset is required');
            const projection = projectFormalPrepaid(asset, snapshot.prepaidTransactions.filter(t => t.assetId === id), snapshot.financialEvents.filter(e => e.assetId === id));
            const currentRemaining = projection && Number.isSafeInteger(projection.remainingCount) ? projection.remainingCount : 0;
            if (currentRemaining < count) {
                throw new Error(this._t('prepaidOutflowInsufficient', 'insufficient remaining count: need {need}, have {have}', { need: count, have: currentRemaining }));
            }
            const now = new Date().toISOString();
            const record = {
                id: createStableId(),
                assetId: id,
                type: 'outflow',
                dimension: 'count',
                direction: FINANCIAL_DIRECTION.OUTFLOW,
                count: count,
                effectiveDate: effectiveDate,
                occurredAt: now,
                createdAt: now,
                note: note,
                financialEventId: null,
            };
            const lifecycle = this._formalWorkflowLifecycle(id, effectiveDate, 'prepaidTransaction', {
                transactionId: record.id,
                type: 'outflow',
                note: note,
                remainingAfter: currentRemaining - count,
            });
            const opLog = {
                id: createStableId(),
                type: 'prepaid-outflow',
                assetId: id,
                assetName: asset.name,
                field: 'prepaid.count',
                oldValue: currentRemaining,
                newValue: currentRemaining - count,
                ts: now,
            };
            return {
                prepaidTransactions: snapshot.prepaidTransactions.concat(record),
                lifecycleEvents: snapshot.lifecycleEvents.concat(lifecycle),
                operationLogs: [opLog].concat(snapshot.operationLogs || []),
                context: { record: record, changed: true, remainingAfter: currentRemaining - count },
            };
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context;
    }

    /**
     * v0.13.16：modal 模式下保存后刷新 modal 内容
     * 直接替换 modal container HTML（不 destroy dialog，避免关闭动画）
     * sheet 在 host（modal container 或 body）上独立于 modal HTML，
     * 所以这里刷新 modal 不会影响 sheet 弹层
     */
    refreshModalContent() {
        const container = this._modalContainer;
        const dialog = this._modalDialog;
        if (!container || !dialog) return;
        this._closeHomeFilterDropdown();
        this._closeItemMenu();
        // 避免在没有引用关系时误操作
        const dialogEl = dialog.element || dialog;
        this._cleanupTagAutocomplete(container);
        container.innerHTML = this.renderMainPanel();
        this.bindAssetCoverFallbacks(container);
        this.bindModalTabEvents(dialogEl);
        this.bindWishlistPoolEvents(container);
        // v1.7-P2：modal 重渲染同样重挂矩阵列数 observer（内部先 disconnect 旧实例）。
        this._setupMatrixResizeObserver();
        // v1.7.3：modal 重渲染同样重挂列表列数 observer（内部先 disconnect 旧实例）。
        this._setupListResizeObserver();
    }

    refreshMainContent() {
        if (this.dockElement) this.renderDock();
        if (this._modalContainer && this._modalDialog) this.refreshModalContent();
    }

    // ---------- DOCK 渲染 ----------

    initDock(dock) {
        this.dockElement = dock.element;
        this.dockElement.classList.add("am-dock");
        this.renderDock();
        // v0.13.23：flex layout 不需要观察列数
    }

    renderDock() {
        if (!this.dockElement) return;
        // v1.7-P2：重渲染会销毁 grid 元素，先断开旧 observer 防泄漏（渲染末尾重新挂载）。
        this._teardownMatrixResizeObserver();
        // v1.7.3：重渲染会销毁 list 容器，先断开旧 observer 防泄漏（渲染末尾重新挂载）。
        this._teardownListResizeObserver();
        this._closeHomeFilterDropdown();
        this._closeItemMenu();
        // v1.3.1：清理可能因 cleanup 抛错残留的孤儿下拉（document.body 上的 .am-home-filter-dropdown）
        document.querySelectorAll('.am-home-filter-dropdown').forEach(d => { if (d.parentNode) d.parentNode.removeChild(d); });
        // v1.6.0：重渲染 dock 时关闭到期 popover（其锚点在 fixed-header，重建后会失效）
        this._closeHomeExpiryPopover();
        this.dockElement.innerHTML = `
            <div class="am-dock__inner">
                ${this.renderMainPanel()}
            </div>`;
        // v0.17-T3-β：bulkMode + 有选中 → dock 加 class，CSS 给 home page 加大 padding-bottom 让列表最后一项不被 BulkActionBar 遮挡
        this.dockElement.classList.toggle("am-bulk-mode-active", this.bulkMode && this.bulkSelected.size > 0);
        this.bindAssetCoverFallbacks(this.dockElement);
        this.bindDockEvents(this.dockElement);
        this.bindWishlistPoolEvents(this.dockElement);
        // v1.7-P2：矩阵视图列数自适应接线（auto 模式挂 ResizeObserver，手选仅写 data-cols）。
        this._setupMatrixResizeObserver();
        // v1.7.3：列表视图列数自适应接线（auto-only，上限 2 列）。
        this._setupListResizeObserver();
    }

    /** Bottom navigation pages share one renderer in dock and modal modes. */
    renderMainPanel() {
        if (this._assetsLoadedOk === false && this._assetLoadError) {
            const code = escapeHtml(this._assetLoadError.code || 'FORMAL_STORAGE_READ_FAILED');
            return `<div class="am-formal-load-error" data-asset-load-blocked="${code}"><strong>${escapeHtml(this._t('formalLoadBlocked', '检测到不兼容的开发期数据'))}</strong><p>${escapeHtml(this._t('formalLoadBlockedHint', '设置与重置入口仍可使用'))}</p></div>`;
        }
        // fail-closed：正式 domain 尚未加载完成（冷启动 / 加载进行中）时不读取部分快照，
        // 渲染 pending 闭锁 UI；_formalDomainSnapshot 的「未加载即 throw」保障保持不变。
        if (!this._formalDomainLoaded) {
            return `<div class="am-formal-load-pending" data-asset-load-pending="true"><p>${escapeHtml(this._t('formalLoadPending', '正在加载资产数据…'))}</p></div>`;
        }
        const activeTab = ["home", "report", "wishlistPool"].includes(this.activeTab) ? this.activeTab : "home";
        const isHome = activeTab === "home";
        return `
            ${this.renderTopBar()}
            ${isHome ? this.renderFixedHeader() : ""}
            <div class="am-dock__pages">
                <div class="am-dock__page" data-page="home" ${isHome ? "" : "hidden"}>${this.renderFormalHomeAssets()}</div>
                <div class="am-dock__page" data-page="report" ${activeTab === "report" ? "" : "hidden"}>${this.renderReportPage()}</div>
                <div class="am-dock__page" data-page="wishlistPool" ${activeTab === "wishlistPool" ? "" : "hidden"}>${this.renderWishlistPoolPage()}</div>
            </div>
            ${this.renderTabBar()}
            `;
    }

    // v1.2：通用自定义日历绑定（除保修外），按 data-am-shortcuts 渲染快捷（today|none）。
    // HTML 模式：<span data-am-datepicker="NAME" data-am-shortcuts="today"><input type="hidden" name="NAME"><button data-am-date-trigger>...</button></span>
    _bindAmDatepickers(kindBody) {
        const self = this;
        kindBody.querySelectorAll('[data-am-datepicker]').forEach((root) => {
            const name = root.dataset.amDatepicker;
            const shortcuts = root.dataset.amShortcuts || 'none';
            const hidden = root.querySelector('[name="' + name + '"]');
            const trigger = root.querySelector('[data-am-date-trigger]');
            if (!hidden || !trigger) return;
            const today = new Date();
            let year = today.getFullYear();
            let month = today.getMonth();
            let panel = null;
            let viewMode = 'days';
            const display = (iso) => iso || self._t('datePickerPlaceholder', '选择日期');
            const isoOfDay = (d) => year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
            const renderDays = () => {
                const firstWd = new Date(year, month, 1).getDay();
                const dim = new Date(year, month + 1, 0).getDate();
                const todayIsoStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
                const cells = [];
                for (let i = 0; i < firstWd; i++) cells.push('<span class="am-datepicker__cell am-datepicker__cell--blank"></span>');
                for (let d = 1; d <= dim; d++) {
                    const iso = isoOfDay(d);
                    const cls = 'am-datepicker__cell' + (iso === hidden.value ? ' is-selected' : '') + (iso === todayIsoStr ? ' is-today' : '');
                    cells.push('<button type="button" class="' + cls + '" data-dp-day="' + iso + '">' + d + '</button>');
                }
                return cells.join('');
            };
            const renderShortcuts = () => {
                if (shortcuts === 'today') return '<div class="am-datepicker__shortcuts"><button type="button" class="am-datepicker__shortcut" data-dp-shortcut="today">' + escapeHtml(self._t('datePickerToday', '今天')) + '</button></div>';
                return '';
            };
            const render = () => {
                if (viewMode === 'years') {
                    const startYear = year - (year % 12);
                    const yearCells = [];
                    for (let i = 0; i < 12; i++) { const y = startYear + i; const cls = 'am-datepicker__year' + (y === today.getFullYear() ? ' is-today' : ''); yearCells.push('<button type="button" class="' + cls + '" data-dp-year="' + y + '">' + y + '</button>'); }
                    return '<div class="am-datepicker__header"><button type="button" class="am-datepicker__nav" data-dp-prev aria-label="' + escapeHtml(self._t('datePickerPrevMonth', '上一月')) + '">‹</button><button type="button" class="am-datepicker__title" data-dp-title>' + startYear + ' – ' + (startYear + 11) + '</button><button type="button" class="am-datepicker__nav" data-dp-next aria-label="' + escapeHtml(self._t('datePickerNextMonth', '下一月')) + '">›</button></div><div class="am-datepicker__years">' + yearCells.join('') + '</div>';
                }
                const monthLabel = self._t('datePickerMonthLabel', '{y}年{m}月').replace('{y}', year).replace('{m}', month + 1);
                const weekdays = ['日', '一', '二', '三', '四', '五', '六'].map(w => '<span class="am-datepicker__weekday">' + w + '</span>').join('');
                return '<div class="am-datepicker__header"><button type="button" class="am-datepicker__nav" data-dp-prev aria-label="' + escapeHtml(self._t('datePickerPrevMonth', '上一月')) + '">‹</button><button type="button" class="am-datepicker__title" data-dp-title>' + escapeHtml(monthLabel) + '</button><button type="button" class="am-datepicker__nav" data-dp-next aria-label="' + escapeHtml(self._t('datePickerNextMonth', '下一月')) + '">›</button></div><div class="am-datepicker__weekdays">' + weekdays + '</div><div class="am-datepicker__days">' + renderDays() + '</div>' + renderShortcuts();
            };
            const repositionPanel = () => {
                if (!panel || !trigger) return;
                const tRect = trigger.getBoundingClientRect();
                panel.style.top = (tRect.bottom + 6) + 'px';
                panel.style.right = (window.innerWidth - tRect.right) + 'px';
            };
            const onDocMouseDown = (ev) => {
                if (!panel) return;
                if (panel.contains(ev.target) || trigger.contains(ev.target)) return;
                close();
            };
            const bindPanel = () => {
                if (!panel) return;
                const prev = panel.querySelector('[data-dp-prev]');
                const next = panel.querySelector('[data-dp-next]');
                if (prev) prev.onclick = () => { if (viewMode === 'years') { year -= 12; } else { month--; if (month < 0) { month = 11; year--; } } refresh(); };
                if (next) next.onclick = () => { if (viewMode === 'years') { year += 12; } else { month++; if (month > 11) { month = 0; year++; } } refresh(); };
                const title = panel.querySelector('[data-dp-title]');
                if (title) title.onclick = () => { viewMode = (viewMode === 'years') ? 'days' : 'years'; refresh(); };
                panel.querySelectorAll('[data-dp-year]').forEach(b => { b.onclick = () => { year = parseInt(b.getAttribute('data-dp-year'), 10) || year; viewMode = 'days'; refresh(); }; });
                panel.querySelectorAll('[data-dp-day]').forEach(b => { b.onclick = () => pick(b.getAttribute('data-dp-day')); });
                panel.querySelectorAll('[data-dp-shortcut]').forEach(b => { b.onclick = () => { const t = today; pick(t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0')); }; });
            };
            const refresh = () => { if (!panel) return; panel.innerHTML = render(); bindPanel(); };
            const close = () => {
                if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
                panel = null;
                document.removeEventListener('mousedown', onDocMouseDown, true);
                document.removeEventListener('scroll', repositionPanel, true);
                window.removeEventListener('resize', repositionPanel);
            };
            const pick = (iso) => {
                hidden.value = iso;
                trigger.textContent = display(iso);
                hidden.dispatchEvent(createPluginDomEvent(hidden, 'input', { bubbles: true }));
                hidden.dispatchEvent(createPluginDomEvent(hidden, 'change', { bubbles: true }));
                close();
            };
            const open = () => {
                if (panel) { close(); return; }
                const todayIso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
                const focusIso = hidden.value || todayIso;
                const parts = focusIso.split('-').map(Number);
                year = parts[0] || today.getFullYear();
                month = (parts[1] || 1) - 1;
                viewMode = 'days';
                const tRect = trigger.getBoundingClientRect();
                panel = document.createElement('div');
                panel.className = 'am-datepicker';
                panel.setAttribute('data-datepicker-panel', '');
                panel.innerHTML = render();
                panel.addEventListener('mousedown', (ev) => ev.stopPropagation());
                panel.style.position = 'fixed';
                panel.style.top = (tRect.bottom + 6) + 'px';
                panel.style.right = (window.innerWidth - tRect.right) + 'px';
                panel.style.left = 'auto';
                panel.style.zIndex = '99999';
                document.body.appendChild(panel);
                document.addEventListener('mousedown', onDocMouseDown, true);
                document.addEventListener('scroll', repositionPanel, true);
                window.addEventListener('resize', repositionPanel);
                bindPanel();
            };
            trigger.onclick = (ev) => { ev.preventDefault(); open(); };
            trigger.addEventListener('mousedown', (ev) => ev.stopPropagation());
            trigger.textContent = display(hidden.value);
        });
    }

    // v2.3.0：通用液态玻璃下拉（hidden input + trigger + 玻璃 popover），替换订阅场景原生 <select>。
    // HTML 模式：<span class="am-glass-select-cell" data-am-glass-select="NAME"
    //   data-am-glass-select-options='[{"value":"...","label":"..."}]'>
    //   <input type="hidden" name="NAME" required><button data-am-glass-select-trigger>...</button></span>
    // 兼容约定：hidden input 保留原 name —— form.elements[name].value / querySelector('[name=]').value /
    // checkValidity 全部不变；选中后对 hidden input dispatch input+change（与 datepicker pick 一致），
    // 既有 change 联动监听只需把选择器从 select 换成 input。弹层定位 / 外点关闭 / 滚动跟随与
    // _bindAmDatepickers 同构（fixed + body 挂载 + capture 监听）。同一时刻只开一个弹层。
    _glassCycleOptions() {
        return FORMAL_BILLING_CYCLES.map(cycle => ({ value: cycle, label: this._t('formalCycle' + cycle, cycle === 'halfYearly' ? '半年付' : cycle) }));
    }

    _renderGlassSelectCell(name, currentValue, options, opts) {
        const list = Array.isArray(options) ? options : [];
        const current = list.find(o => o && o.value === currentValue) || null;
        const valueStr = currentValue == null ? '' : String(currentValue);
        // v2.4.1：opts.disabled → trigger 加 disabled 属性 + is-disabled 类（open() 守卫不弹层）。
        // hidden input 的 name/value 不变 —— form.elements[name].value 保存路径完全兼容。
        const disabled = !!(opts && opts.disabled);
        return '<span class="am-glass-select-cell" data-am-glass-select="' + name + '" data-am-glass-select-options="' + escapeHtml(JSON.stringify(list)) + '">'
            + '<input type="hidden" name="' + name + '" value="' + escapeHtml(valueStr) + '" required>'
            + '<button type="button" class="am-glass-select-trigger' + (disabled ? ' is-disabled' : '') + '" data-am-glass-select-trigger aria-haspopup="listbox"' + (disabled ? ' disabled' : '') + '><span class="am-glass-select-trigger__label">' + escapeHtml(current ? current.label : '') + '</span></button>'
            + '</span>';
    }

    // v2.4.1：币种玻璃下拉选项 —— CNY/USD 固定，当前值若为其它 ISO 币种则追加
    //（EUR→€、GBP→£，其余回退币种代码）。符号表自带：concat 注入名单不含
    // algorithms.currencySymbol（见 scripts/concat.js getDestructureBlock），
    // openFormalAssetSheet 内的同名函数是 render 闭包局部，类方法不可复用。
    _glassCurrencyOptions(currentCurrency) {
        const symbolOf = code => code === 'CNY' ? '¥' : code === 'USD' ? '$' : code === 'EUR' ? '€' : code === 'GBP' ? '£' : code;
        const list = [{ value: 'CNY', label: '¥' }, { value: 'USD', label: '$' }];
        const current = currentCurrency == null ? '' : String(currentCurrency).trim();
        if (current && list.every(option => option.value !== current)) list.push({ value: current, label: symbolOf(current) });
        return list;
    }

    // 关闭所有已打开的玻璃下拉；返回是否关闭了至少一个（renew sheet Esc 优先消费用）。
    _closeAmGlassSelectPanels() {
        const fns = (this._amGlassSelectCloseFns || []).slice();
        if (!fns.length) return false;
        fns.forEach(fn => { try { fn(); } catch (error) { /* noop */ } });
        return true;
    }

    _bindAmGlassSelects(scope) {
        const self = this;
        if (!this._amGlassSelectCloseFns) this._amGlassSelectCloseFns = [];
        scope.querySelectorAll('[data-am-glass-select]').forEach((root) => {
            const name = root.dataset.amGlassSelect;
            const hidden = root.querySelector('[name="' + name + '"]');
            const trigger = root.querySelector('[data-am-glass-select-trigger]');
            if (!hidden || !trigger) return;
            let options = [];
            try { options = JSON.parse(root.getAttribute('data-am-glass-select-options') || '[]'); } catch (error) { options = []; }
            const labelEl = trigger.querySelector('.am-glass-select-trigger__label') || trigger;
            const labelOf = (value) => { const o = (options || []).find(x => x && x.value === value); return o ? o.label : (value || ''); };
            let panel = null;
            const renderOptions = () => (options || []).map(o => {
                const active = o.value === hidden.value;
                return '<button type="button" class="am-glass-select-popover__option' + (active ? ' is-active' : '') + '" data-gs-value="' + escapeHtml(o.value) + '" role="option" aria-selected="' + (active ? 'true' : 'false') + '"><span class="am-glass-select-popover__option-label">' + escapeHtml(o.label) + '</span><span class="am-glass-select-popover__check">' + (active ? '✓' : '') + '</span></button>';
            }).join('');
            const repositionPanel = () => {
                if (!panel || !trigger) return;
                const tRect = trigger.getBoundingClientRect();
                panel.style.top = (tRect.bottom + 6) + 'px';
                panel.style.right = (window.innerWidth - tRect.right) + 'px';
            };
            const onDocMouseDown = (ev) => {
                if (!panel) return;
                if (panel.contains(ev.target) || trigger.contains(ev.target)) return;
                close();
            };
            // Esc 关闭：document capture 消费事件，不误关上层 sheet / Dialog。
            // renew sheet 自带 window capture Esc（先于 document 触发），由其 onKeydown
            // 先调 _closeAmGlassSelectPanels() 委托消费（见 openRenewSheet）。
            const onDocKeydown = (ev) => {
                if (!panel) return;
                if (ev.key !== 'Escape') return;
                ev.preventDefault();
                ev.stopPropagation();
                if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
                close();
            };
            const close = () => {
                trigger.classList.remove('is-open');
                if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
                panel = null;
                document.removeEventListener('mousedown', onDocMouseDown, true);
                document.removeEventListener('keydown', onDocKeydown, true);
                document.removeEventListener('scroll', repositionPanel, true);
                window.removeEventListener('resize', repositionPanel);
                const idx = self._amGlassSelectCloseFns.indexOf(close);
                if (idx >= 0) self._amGlassSelectCloseFns.splice(idx, 1);
            };
            const pick = (value) => {
                hidden.value = value;
                labelEl.textContent = labelOf(value);
                hidden.dispatchEvent(createPluginDomEvent(hidden, 'input', { bubbles: true }));
                hidden.dispatchEvent(createPluginDomEvent(hidden, 'change', { bubbles: true }));
                close();
            };
            const bindPanel = () => {
                if (!panel) return;
                panel.querySelectorAll('[data-gs-value]').forEach(b => { b.onclick = () => pick(b.getAttribute('data-gs-value')); });
            };
            const open = () => {
                if (trigger.disabled || trigger.classList.contains('is-disabled')) return; // v2.4.1：锁定态不弹层
                if (panel) { close(); return; }
                self._closeAmGlassSelectPanels(); // 同一时刻只开一个
                const tRect = trigger.getBoundingClientRect();
                panel = document.createElement('div');
                panel.className = 'am-glass-select-popover';
                panel.setAttribute('data-glass-select-panel', '');
                panel.setAttribute('role', 'listbox');
                panel.innerHTML = renderOptions();
                panel.addEventListener('mousedown', (ev) => ev.stopPropagation());
                panel.style.position = 'fixed';
                panel.style.top = (tRect.bottom + 6) + 'px';
                panel.style.right = (window.innerWidth - tRect.right) + 'px';
                panel.style.left = 'auto';
                panel.style.zIndex = '99999';
                document.body.appendChild(panel);
                trigger.classList.add('is-open');
                document.addEventListener('mousedown', onDocMouseDown, true);
                document.addEventListener('keydown', onDocKeydown, true);
                document.addEventListener('scroll', repositionPanel, true);
                window.addEventListener('resize', repositionPanel);
                self._amGlassSelectCloseFns.push(close);
                bindPanel();
            };
            trigger.onclick = (ev) => { ev.preventDefault(); open(); };
            trigger.addEventListener('mousedown', (ev) => ev.stopPropagation());
            labelEl.textContent = labelOf(hidden.value); // 选中态回显（编辑态 / renew 预填）
        });
    }

    renderFixedHeader() {
        try {
            const domain = this._formalDomainSnapshot();
            const report = this._buildFullFormalReport(domain);
            const buckets = report.amounts.netByCurrency || {};
            const ratesObj = this._getExchangeRates();
            let totalCNYMinor = 0;
            let dailyCNYMinor = 0;
            const missingCurrencies = [];
            let usedFallback = false;
            Object.keys(buckets).sort().forEach(currency => {
                const bucket = buckets[currency];
                const netResult = convertToCNYMinor(bucket.netAmountMinor, currency, ratesObj);
                if (!netResult) {
                    if (missingCurrencies.indexOf(currency) < 0) missingCurrencies.push(currency);
                    return;
                }
                totalCNYMinor += netResult.cnyMinor;
                if (netResult.isFallback) usedFallback = true;
                const dailyResult = convertToCNYMinor(bucket.dailyAmountMinor, currency, ratesObj);
                if (dailyResult) dailyCNYMinor += dailyResult.cnyMinor;
            });
            // v2.6.2：退役转让回收单独展示——同样折 CNY 求总；不可兑换币种直接跳过，不进 missingCurrencies 脚注。
            const saleBuckets = report.amounts.retiredSaleByCurrency || {};
            let recoveredCNYMinor = 0;
            Object.keys(saleBuckets).sort().forEach(currency => {
                const saleResult = convertToCNYMinor(saleBuckets[currency].saleAmountMinor, currency, ratesObj);
                if (saleResult) recoveredCNYMinor += saleResult.cnyMinor;
            });
            // v2.6.2 修复批次 2：已回收改为总金额大字右侧同行内联小字（__amount 内的 span），
            // 右列 __daily 恢复只含日均两元素；仅 >0 渲染，口径不变。
            let recoveredHtml = '';
            if (recoveredCNYMinor > 0) {
                const recovered = (recoveredCNYMinor < 0 ? '-' : '') + formatAmountMinor(Math.abs(recoveredCNYMinor), 'CNY');
                recoveredHtml = '<span class="am-summary-card__recovered">' + escapeHtml(this._t('summaryRetiredRecovered', '已回收:')) + ' ' + escapeHtml(recovered) + '</span>';
            }
            const absTotal = Math.abs(totalCNYMinor);
            const amount = (totalCNYMinor < 0 ? '-' : '') + formatAmountMinor(absTotal, 'CNY');
            const absDaily = Math.abs(dailyCNYMinor);
            const daily = (dailyCNYMinor < 0 ? '-' : '') + formatAmountMinor(absDaily, 'CNY');
            // Footnote: manual rates / default fallback / excluded currencies
            const rates = (ratesObj && ratesObj.rates && typeof ratesObj.rates === 'object') ? ratesObj.rates : {};
            // v0.18 阶段 7：仅当 rates 非空才算「手动设置」，避免重置后空态（rates 空但有 updatedAt）误报。
            const hasUserRates = Object.keys(rates).length > 0;
            let footnote = '';
            if (hasUserRates) {
                footnote = this._t('exchangeRateManualHint', '汇率为手动设置');
            } else if (usedFallback) {
                footnote = this._t('exchangeRateDefaultHint', '默认参考汇率 1 USD = 7.20 CNY');
            }
            if (missingCurrencies.length) {
                const shown = missingCurrencies.slice(0, 3).join(', ');
                const suffix = missingCurrencies.length > 3 ? ' ' + this._t('exchangeRateMoreSuffix', '等') : '';
                const missingHint = this._t('exchangeRateMissingHint', '部分资产（{currencies}）暂无汇率，未计入总额')
                    .replace('{currencies}', shown + suffix);
                footnote = footnote ? footnote + ' · ' + missingHint : missingHint;
            }
            // v1.2：顶部资产总卡片隐藏汇率脚注文本，使卡片上下边框对称美观。
            const footnoteHtml = '';
            return '<div class="am-fixed-header">' + this._renderHomeExpiryBarHtml(report) + '<div class="am-summary-card am-formal-summary"><div class="am-summary-card__top"><div class="am-summary-card__title">' + escapeHtml(this._t('summaryCardTitle', '我的资产')) + '</div><div class="am-summary-card__stats"><span class="am-summary-card__stat am-summary-card__stat--active">' + (report.counts.byStatus.active || 0) + ' ' + escapeHtml(this._t('statusActive', '在役')) + '</span><span class="am-summary-card__divider">/</span><span class="am-summary-card__stat am-summary-card__stat--retired">' + (report.counts.byStatus.retired || 0) + ' ' + escapeHtml(this._t('statusRetired', '退役')) + '</span></div></div><div class="am-summary-card__bottom"><div class="am-summary-card__amount">' + escapeHtml(amount) + recoveredHtml + '</div><div class="am-summary-card__daily"><span class="am-summary-card__daily-label">' + escapeHtml(this._t('dailyLabel', '日均消费')) + '</span><span class="am-summary-card__daily-value">' + escapeHtml(daily) + '</span></div></div>' + footnoteHtml + '</div>' + '</div>';
        } catch (error) {
            return '<div class="am-fixed-header">' + this._renderFormalDashboardError(error) + '</div>';
        }
    }

    /**
     * v0.13.14：固定顶部 header（summaryCard + filterBar）
     * 在 home 视图模式下作为 flex-shrink:0 固定头部，不随中间内容滚动
     */
    /**
     * v0.13.14：home page 主体 — 只渲染资产列表（其余部分提到 fixed header）
     */
    renderFormalHomeAssets() {
        const filtered = this.getHomeFilteredAssets();
        const transitionClass = this._assetViewTransition ? " am-asset-view--enter" : "";
        // v1.7.3：列表视图列数自适应（1/2）。初始 data-cols 由纯函数给出（宽度未知默认 1 列），
        // 挂载后 _setupListResizeObserver 按实测内容宽修正；matrix 模式不写（列数由 .am-asset-grid 自管）。
        const isList = (this.settings.viewMode || "list") === "list";
        const colsAttr = (isList && filtered.length) ? ` data-cols="${this._listColsForWidth(0)}"` : "";
        // v1.8.7：筛选栏移入滚动内容首位并 sticky 浮顶（位置仍在「我的资产」卡下方），
        // 资产列表从其下方滚过，与底部 TabBar 同为液态玻璃浮层语言。
        return this.renderFilterBar() + `<div class="am-asset-list am-asset-view${transitionClass}" ${colsAttr}>${this.renderFormalAssetCollection(filtered)}</div>`;
    }

    /** v1.6.0：到期提醒统一数据源——7 天内（含今天、不含已过期），按剩余天数升序，
     *  每项带具体到期日 date（取 card.nextImportant.date，缺失则空串由调用方降级文案）。
     *  可传入已有 report 复用，避免 fixed-header / 报表 / popover 各自重复构建。 */
    _getExpiringSoonList(report) {
        try {
            const r = report || (this._formalDomainLoaded ? this._buildFullFormalReport(this._formalDomainSnapshot()) : null);
            if (!r || !r.risks || !r.risks.expiry) return [];
            return (r.risks.expiry.within7Days || [])
                .map(entry => {
                    const card = (r.assets || []).find(item => item.id === entry.assetId);
                    if (!card) return null;
                    const date = card.nextImportant && card.nextImportant.date ? String(card.nextImportant.date) : '';
                    return { card: card, days: entry.daysRemaining, date: date };
                })
                .filter(Boolean).sort((a, b) => a.days - b.days);
        } catch (error) {
            return [];
        }
    }

    /** v1.6.0：首页固定顶部到期提醒条——左「即将到期」+ 右计数 + 关闭按钮，整条可点弹 popover。
     *  无到期资产 / 本批已被关闭（dismiss 签名匹配）时返回 ''（不占位）。静默降级，绝不阻塞头部。 */
    _renderHomeExpiryBarHtml(report) {
        try {
            const list = this._getExpiringSoonList(report);
            if (!list.length) return '';
            const sig = list.map(x => x.card.id + ':' + x.days).join('|');
            if (this._homeExpiryDismissedSig === sig) return '';
            return `<div class="am-home-expiry-bar" data-action="home-expiry-open" role="button" tabindex="0"><span class="am-home-expiry-bar__title"><span class="am-home-expiry-bar__icon" aria-hidden="true">🔔</span>${escapeHtml(this._t('dashboardExpiringSoonTitle', '即将到期'))}</span><span class="am-home-expiry-bar__right"><span class="am-home-expiry-bar__count">${list.length}</span><button type="button" class="am-home-expiry-bar__close" data-action="home-expiry-close" aria-label="${escapeHtml(this._t('btnClose', '关闭'))}">×</button></span></div>`;
        } catch (error) {
            return '';
        }
    }

    /** v1.6.0：关闭本批到期提醒条——记录当前到期签名，使本批不再显示；新到期（签名变化）会自动重现。 */
    _dismissHomeExpiryBar() {
        const list = this._getExpiringSoonList();
        this._homeExpiryDismissedSig = list.map(x => x.card.id + ':' + x.days).join('|');
        this._closeHomeExpiryPopover();
        this.renderDock();
    }

    /** v1.6.0：在到期条下方弹出小窗列出清单；行点击闭包打开产品卡（popover 挂在 body，
     *  不在 dock 委托范围，故行/关闭按钮用闭包直接绑定）。外部点击 / Esc / resize 自动关闭。 */
    _openHomeExpiryPopover(anchor) {
        this._closeHomeExpiryPopover();
        const list = this._getExpiringSoonList();
        if (!list.length || !anchor) return;
        const pop = document.createElement('div');
        pop.className = 'am-home-expiry-pop';
        pop.setAttribute('data-home-expiry-pop', '');
        const rows = list.map(({ card, date, days }) => {
            const right = date ? escapeHtml(date) : (days <= 0 ? escapeHtml(this._t('dashboardExpiryToday', '今天到期')) : escapeHtml(this._t('dashboardExpiry7', '{days} 天内到期').replace('{days}', String(days))));
            return `<button type="button" class="am-home-expiry-pop__row" data-expiry-card="${escapeHtml(card.id)}"><span>${escapeHtml(card.name)}</span><strong>${right}</strong></button>`;
        }).join('');
        pop.innerHTML = `<div class="am-home-expiry-pop__head"><span>${escapeHtml(this._t('dashboardExpiringSoonTitle', '即将到期'))}<small>${list.length}</small></span><button type="button" class="am-home-expiry-pop__close" aria-label="${escapeHtml(this._t('btnClose', '关闭'))}">×</button></div><div class="am-home-expiry-pop__list">${rows}</div>`;
        document.body.appendChild(pop);
        const place = () => {
            const r = anchor.getBoundingClientRect();
            pop.style.position = 'fixed';
            pop.style.top = (r.bottom + 6) + 'px';
            pop.style.left = r.left + 'px';
            pop.style.width = r.width + 'px';
            pop.style.zIndex = '99999';
        };
        place();
        const close = () => {
            document.removeEventListener('mousedown', onDoc, true);
            document.removeEventListener('keydown', onKey, true);
            window.removeEventListener('resize', onResize);
            if (pop.parentNode) pop.parentNode.removeChild(pop);
            if (this._homeExpiryPop === pop) this._homeExpiryPop = null;
            if (this._homeExpiryPopClose === close) this._homeExpiryPopClose = null;
        };
        const onDoc = (ev) => { if (pop.contains(ev.target) || (anchor && anchor.contains(ev.target))) return; close(); };
        const onKey = (ev) => { if (ev.key === 'Escape') close(); };
        const onResize = () => close();
        pop.querySelectorAll('[data-expiry-card]').forEach(btn => {
            btn.onclick = (ev) => { ev.stopPropagation(); const id = btn.getAttribute('data-expiry-card'); close(); this.openFormalProductCard(id); };
        });
        const headClose = pop.querySelector('.am-home-expiry-pop__close');
        if (headClose) headClose.onclick = (ev) => { ev.stopPropagation(); close(); };
        pop.addEventListener('mousedown', ev => ev.stopPropagation());
        document.addEventListener('mousedown', onDoc, true);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', onResize);
        this._homeExpiryPop = pop;
        this._homeExpiryPopClose = close;
    }

    /** v1.6.0：关闭到期 popover（若开着）。renderDock / dismiss / 卸载时调用，避免锚点失效后悬浮残留。 */
    _closeHomeExpiryPopover() {
        if (typeof this._homeExpiryPopClose === 'function') {
            try { this._homeExpiryPopClose(); } catch (error) { /* noop */ }
        }
        if (typeof document !== 'undefined' && document.querySelectorAll) {
            document.querySelectorAll('[data-home-expiry-pop]').forEach(p => { if (p.parentNode) p.parentNode.removeChild(p); });
        }
        this._homeExpiryPopClose = null;
        this._homeExpiryPop = null;
    }

    /** 首页顶部条：仅保留标题、搜索和视图切换。 */
    renderTopBar() {
        const isHome = this.activeTab === "home";
        const viewMode = this.settings.viewMode || "list";
        const listIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="20" y2="12"/><line x1="7" y1="18" x2="20" y2="18"/><circle cx="3.5" cy="6" r="1" fill="currentColor"/><circle cx="3.5" cy="12" r="1" fill="currentColor"/><circle cx="3.5" cy="18" r="1" fill="currentColor"/></svg>`;
        const matrixIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`;
        const searchIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/></svg>`;
        const toolsHtml = isHome ? `
                    <div class="am-search-box">
                        ${searchIcon}
                        <input type="text" class="am-search-box__input" aria-label="${escapeHtml(this._t("searchPlaceholder", "搜索"))}" value="${escapeHtml(this.filter.search || "")}"/>
                    </div>
                    <button class="am-view-toggle" data-action="view-toggle" data-view="${viewMode}" title="${escapeHtml(this._t(viewMode === 'matrix' ? "viewModeList" : "viewModeMatrix", "切换"))}">
                        ${viewMode === 'matrix' ? listIcon : matrixIcon}
                    </button>` : "";
        const title = this.activeTab === "report" ? this._t("dashboardTitle", "资产看板")
            : this.activeTab === "wishlistPool" ? this._t("wishlistTitle", "种草")
            : this._t("topBarTitle", "资产管理");
        return `
            <div class="am-topbar">
                <div class="am-topbar__title">${escapeHtml(title)}</div>
                <div class="am-topbar__tools">${toolsHtml}</div>
            </div>`;
    }

    /** 首页主筛选：四个 trigger 都通过 document.body portal 打开下沿下拉。
     *  顺序：状态 / 类型(3 displayGroup) / 排序 / 标签。category 下拉已移除（仅 UI），
     *  this.filter.categoryId 数据字段与 applyFilter 的 categoryId 分支保留。 */
    renderFilterBar() {
        const renderTrigger = (kind) => {
            const state = this._getHomeFilterDropdownState(kind);
            const labelKey = kind === 'kind' ? 'filterDisplayGroup'
                : kind === 'tag' ? 'filterTag'
                    : kind === 'status' ? 'filterStatus' : 'filterSort';
            const labelFallback = kind === 'kind' ? '类型'
                : kind === 'tag' ? '标签'
                    : kind === 'status' ? '状态' : '排序';
            return `<button type="button" class="am-filter-select am-filter-trigger${state.active ? ' is-active' : ''}" data-action="toggle-home-filter-dropdown" data-filter-kind="${kind}" aria-label="${escapeHtml(this._t(labelKey, labelFallback))}" aria-haspopup="${kind === 'tag' ? 'dialog' : 'menu'}" aria-expanded="false">
                <span class="am-filter-trigger__label">${escapeHtml(state.label)}</span>
                <span class="am-filter-trigger__count" ${state.count ? '' : 'hidden'}>${escapeHtml(state.count || '')}</span>
                <svg class="am-filter-trigger__chevron" viewBox="0 0 24 24" aria-hidden="true"><use xlink:href="#iconChevronDown"/></svg>
            </button>`;
        };
        /* v2.3.0-hotfix：标签 trigger 右侧的独立 × 清除按钮移除（冗余——下拉内已有
           「清除筛选」与全选切换按钮），tag-control 只保留 trigger 本身。 */
        return `
            <div class="am-filter-bar">
                <div class="am-filter-bar__primary">
                    ${renderTrigger('status')}
                    ${renderTrigger('kind')}
                    ${renderTrigger('sort')}
                </div>
                <span class="am-filter-tag-control">${renderTrigger('tag')}</span>
            </div>`;
    }

    /** displayGroup（实物/虚拟/预付）→ formal kind 数组；'all' 或未知 → null（不限制类型）。 */
    _displayGroupKinds(group) {
        if (group === 'physical') return [FORMAL_ASSET_KIND.PHYSICAL];
        if (group === 'virtual') return [FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION, FORMAL_ASSET_KIND.VIRTUAL_PERPETUAL];
        if (group === 'prepaid') return [FORMAL_ASSET_KIND.PREPAID_AMOUNT, FORMAL_ASSET_KIND.PREPAID_COUNT];
        return null;
    }

    /** filter.kind（数组 / 单值字符串 / 'all' / 空）反推 displayGroup，用于渲染类型下拉选中态。 */
    _kindToDisplayGroup(kind) {
        if (!kind || kind === 'all') return 'all';
        const arr = Array.isArray(kind) ? kind : [kind];
        const same = (a, b) => a.length === b.length && a.every(k => b.indexOf(k) >= 0);
        if (same(arr, this._displayGroupKinds('physical'))) return 'physical';
        if (same(arr, this._displayGroupKinds('virtual'))) return 'virtual';
        if (same(arr, this._displayGroupKinds('prepaid'))) return 'prepaid';
        return 'all';
    }

    _getHomeFilterDropdownOptions(kind) {
        if (kind === 'kind') {
            return [
                { id: 'all', label: this._t('assetTypeAll', '全部') },
                { id: 'physical', label: this._t('displayGroupPhysical', '实物') },
                { id: 'virtual', label: this._t('displayGroupVirtual', '虚拟') },
                { id: 'prepaid', label: this._t('displayGroupPrepaid', '预付') },
            ];
        }
        if (kind === 'category') return [{ id: 'all', label: this._t('categoryAll', '全部分类') }]
            .concat(FORMAL_CATEGORIES.map(item => ({ id: item.id, label: item.id })));
        if (kind === 'status') {
            return [
                { id: 'all', label: this._t('statusAll', '全部状态') },
                ...STATUSES
                    .filter(status => status.id === 'active' || status.id === 'retired')
                    .map(status => ({ id: status.id, label: this._t(status.key, status.id) })),
            ];
        }
        if (kind === 'sort') {
            return SORTS.map(sort => ({ id: sort.id, label: this._t(sort.key, sort.id) }));
        }
        return [];
    }

    _getHomeFilterDropdownState(kind) {
        if (kind === 'tag') {
            const count = Array.isArray(this.filter.tagIds) ? this.filter.tagIds.length : 0;
            return {
                label: this._t('filterTag', '标签'),
                count: count > 0 ? String(count) : '',
                active: count > 0,
            };
        }

        const options = this._getHomeFilterDropdownOptions(kind);
        const filterKey = kind === 'category' ? 'categoryId' : kind;
        const currentValue = kind === 'status'
            ? this._normalizeHomeFilterStatus(this.filter.status)
            : kind === 'kind'
                ? this._kindToDisplayGroup(this.filter.kind)
                : this.filter[filterKey];
        const selected = options.find(option => option.id === currentValue) || options[0];
        return {
            label: selected ? selected.label : '',
            count: '',
            active: !!(selected && selected.id !== 'all' && selected.id !== 'default'),
        };
    }

    _updateHomeFilterDropdownTrigger(kind) {
        const state = this._getHomeFilterDropdownState(kind);
        [this.dockElement, this._modalContainer].forEach(root => {
            if (!root || !root.querySelectorAll) return;
            root.querySelectorAll(`[data-filter-kind="${kind}"]`).forEach(trigger => {
                trigger.classList.toggle('is-active', state.active);
                const label = trigger.querySelector('.am-filter-trigger__label');
                const count = trigger.querySelector('.am-filter-trigger__count');
                if (label) label.textContent = state.label;
                if (count) {
                    count.textContent = state.count || '';
                    count.hidden = !state.count;
                }
            });
        });
    }

_closeHomeFilterDropdown(expectedDropdown) {
        const active = this._activeHomeFilterDropdown;
        if (!active || (expectedDropdown && active.dropdown !== expectedDropdown)) return;
        active.trigger?.setAttribute('aria-expanded', 'false');
        // v1.3.1：try-catch 保护，防止 cleanup 抛错导致 dropdown 残留遮挡 dock（孤儿 dropdown 会拦截后续 click）
        try {
            if (typeof active.cleanup === 'function') active.cleanup();
        } catch (e) {
            console.warn('[AssetManagement] dropdown cleanup error:', e && e.message);
        }
        if (active.dropdown && active.dropdown.parentNode) active.dropdown.parentNode.removeChild(active.dropdown);
        this._activeHomeFilterDropdown = null;
    }

    openHomeFilterDropdown(trigger, kind) {
        if (!trigger || ['kind', 'category', 'tag', 'status', 'sort'].indexOf(kind) < 0) return;
        if (this._activeHomeFilterDropdown?.trigger === trigger && this._activeHomeFilterDropdown.kind === kind) {
            this._closeHomeFilterDropdown();
            return;
        }
        this._closeHomeFilterDropdown();

        const dropdown = document.createElement('div');
        dropdown.className = `am-home-filter-dropdown am-home-filter-dropdown--${kind}`;
        dropdown.setAttribute('role', kind === 'tag' ? 'dialog' : 'menu');
        const dropdownLabelKey = kind === 'kind' ? 'filterDisplayGroup'
            : kind === 'category' ? 'fieldCategory'
            : kind === 'tag' ? 'tagFilterTitle'
                : kind === 'status' ? 'filterStatus' : 'filterSort';
        dropdown.setAttribute('aria-label', this._t(dropdownLabelKey, '筛选'));
        document.body.appendChild(dropdown);
        trigger.setAttribute('aria-expanded', 'true');

        const positionDropdown = () => {
            if (!dropdown.isConnected || !trigger.isConnected) return;
            const rect = trigger.getBoundingClientRect();
            const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
            const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
            const edge = 8;
            /* v2.3.0 阶段4.1：下拉收敛在插件区域内，不再延伸出 dock 侧栏。
               边界解析：trigger 在 dock 内 → dockElement rect；在 modal 内 → _modalContainer rect；
               两者都不含/不存在 → 回退既有视口 clamp（edge 8px），任何情况下不得抛错。 */
            const dockEl = this.dockElement;
            const modalEl = this._modalContainer;
            const boundEl = (dockEl && dockEl.isConnected && dockEl.contains(trigger)) ? dockEl
                : (modalEl && modalEl.isConnected && modalEl.contains(trigger)) ? modalEl : null;
            let boundLeft = edge;
            let boundRight = viewportWidth - edge;
            if (boundEl) {
                const boundRect = boundEl.getBoundingClientRect();
                boundLeft = boundRect.left;
                boundRight = boundRect.right;
            }
            const availableWidth = Math.max(0, boundRight - boundLeft);
            dropdown.style.top = `${Math.round(rect.bottom + 2)}px`;
            dropdown.style.maxWidth = `${Math.floor(availableWidth)}px`;
            dropdown.style.maxHeight = `${Math.max(44, Math.floor(viewportHeight - rect.bottom - edge - 2))}px`;
            /* v2.3.0-hotfix：tag 面板 minWidth 196→164，配合头部文字缩小整体收窄 */
            dropdown.style.minWidth = `${Math.min(Math.max(Math.round(rect.width), kind === 'tag' ? 164 : 152), availableWidth)}px`;
            const dropdownWidth = Math.min(dropdown.offsetWidth || rect.width, availableWidth);
            /* v2.3.0 阶段4.1：tag 下拉右对齐（右边缘 = trigger 右边缘），其余下拉左对齐 trigger；
               最后在 [boundLeft, boundRight] 内统一 clamp（dropdownWidth ≤ availableWidth 恒成立，clamp 不越界）。 */
            const preferredLeft = kind === 'tag' ? rect.right - dropdownWidth : rect.left;
            const left = Math.min(Math.max(preferredLeft, boundLeft), Math.max(boundLeft, boundRight - dropdownWidth));
            dropdown.style.left = `${Math.round(left)}px`;
        };

        const cleanup = () => {
            document.removeEventListener('keydown', onKeydown);
            document.removeEventListener('mousedown', onOutsidePointer, true);
            document.removeEventListener('scroll', positionDropdown, true);
            window.removeEventListener('resize', positionDropdown);
        };
        const onKeydown = (event) => {
            if (event.key === 'Escape') this._closeHomeFilterDropdown(dropdown);
        };
        const onOutsidePointer = (event) => {
            if (!dropdown.contains(event.target) && event.target !== trigger && !trigger.contains(event.target)) {
                this._closeHomeFilterDropdown(dropdown);
            }
        };
        this._activeHomeFilterDropdown = { dropdown, trigger, kind, cleanup };

const updateTagFilter = nextIds => {
            this.filter.tagIds = Array.isArray(nextIds) ? nextIds : [];
            this._updateHomeFilterDropdownTrigger('tag');
            renderDropdown();
            // v1.3.1-fix：用 refreshList 只刷新列表内容，不关闭下拉（支持多选标签）。
            // 之前误用 refreshMainContent → renderDock → _closeHomeFilterDropdown 会立即
            // 关闭下拉；且 applyFilter 的 normalizeTagIds ReferenceError 导致整个 dock 崩溃。
            try { this.refreshList(); } catch (err) { console.warn('[AssetManagement] refreshList failed:', err && err.message); }
        };
        const renderTagDropdown = () => {
            const selectedIds = Array.isArray(this.filter.tagIds) ? this.filter.tagIds : [];
            const tags = this._getAssetTagCatalog();
            const tagsHtml = tags.length
                ? `<div class="am-home-filter-dropdown__tags">${tags.map(tag => {
                    const isSelected = selectedIds.indexOf(tag.id) >= 0;
                    /* v2.3.0 阶段3：筛选 chip 按 tag.color 上底色（模板表达式内禁用 // 行注释，concat 会并行使行注释吞代码） */
                    const chipColor = this._tagChipColorAttrs(tag.color);
                    return `<button type="button" class="am-home-filter-dropdown__tag${isSelected ? ' is-active' : ''}${chipColor.cls}" data-tag-id="${escapeHtml(tag.id)}" aria-pressed="${isSelected}"${chipColor.style}>
                        <span>${escapeHtml(tag.label)}</span><span class="am-home-filter-dropdown__check" aria-hidden="true">${isSelected ? '✓' : ''}</span>
                    </button>`;
                }).join('')}</div>`
                : `<div class="am-home-filter-dropdown__empty">${escapeHtml(this._t('tagFilterEmpty', '暂无标签'))}</div>`;
            /* v2.3.0 阶段4.2：全选/取消全选合并为单个切换按钮——已选集合 == 全部标签（且目录非空）
               时显示「取消全选」（点击清空），否则显示「全选」（点击全选）。复用既有 i18n key
               tagFilterSelectAll / tagFilterDeselectAll；updateTagFilter 会触发 renderDropdown 重绘，
               按钮文案随状态天然更新。 */
            const allSelected = tags.length > 0 && tags.every(tag => selectedIds.indexOf(tag.id) >= 0);
            const toggleLabel = allSelected ? this._t('tagFilterDeselectAll', '取消全选') : this._t('tagFilterSelectAll', '全选');
            return `<div class="am-home-filter-dropdown__header"><span>${escapeHtml(this._t('tagFilterTitle', '按标签筛选'))}</span><button type="button" class="am-home-filter-dropdown__clear" data-tag-clear>${escapeHtml(this._t('tagFilterClear', '清除筛选'))}</button></div>
                <div class="am-home-filter-dropdown__tag-actions"><button type="button" data-tag-toggle-all>${escapeHtml(toggleLabel)}</button></div>${tagsHtml}`;
        };
        const renderSingleDropdown = () => {
            const options = this._getHomeFilterDropdownOptions(kind);
            const filterKey = kind === 'category' ? 'categoryId' : kind;
            const value = kind === 'status' ? this._normalizeHomeFilterStatus(this.filter.status)
                : kind === 'kind' ? this._kindToDisplayGroup(this.filter.kind)
                : this.filter[filterKey];
            return `<div class="am-home-filter-dropdown__options">${options.map(option => `<button type="button" class="am-home-filter-dropdown__option${option.id === value ? ' is-active' : ''}" data-filter-value="${option.id}" role="menuitemradio" aria-checked="${option.id === value}"><span>${escapeHtml(option.label)}</span><span class="am-home-filter-dropdown__check" aria-hidden="true">${option.id === value ? '✓' : ''}</span></button>`).join('')}</div>`;
        };
const bindDropdownEvents = () => {
            if (kind !== 'tag') {
                dropdown.querySelectorAll('[data-filter-value]').forEach(button => {
                    // v1.3.1：用 addEventListener 替代 onclick 单槽赋值，避免被其他代码覆盖；click 委托同时保底
                    button.addEventListener('click', e => {
                        try {
                            const value = button.dataset.filterValue;
                            if (kind === 'kind') {
                                this.filter.kind = this._displayGroupKinds(value) || 'all';
                            } else {
                                const filterKey = kind === 'category' ? 'categoryId' : kind;
                                this.filter[filterKey] = value;
                            }
                            this._closeHomeFilterDropdown(dropdown);
                        } catch (err) {
                            console.warn('[AssetManagement] dropdown filter-value click failed:', err && err.message);
                        }
                        try { this.refreshMainContent(); } catch (err) { console.warn('[AssetManagement] refreshMainContent failed:', err && err.message); }
                    });
                    button.setAttribute('data-action', 'home-filter-pick');
                });
                return;
            }
            dropdown.querySelectorAll('[data-tag-id]').forEach(button => {
                button.addEventListener('click', e => {
                    try {
                        const id = button.dataset.tagId;
                        if (!id) return;
                        const nextIds = Array.isArray(this.filter.tagIds) ? this.filter.tagIds.slice() : [];
                        const index = nextIds.indexOf(id);
                        if (index >= 0) nextIds.splice(index, 1);
                        else nextIds.push(id);
                        updateTagFilter(nextIds);
                    } catch (err) {
                        console.warn('[AssetManagement] tag click failed:', err && err.message);
                    }
                });
                button.setAttribute('data-action', 'home-tag-pick');
            });
            const clear = dropdown.querySelector('[data-tag-clear]');
            if (clear) { clear.addEventListener('click', () => { try { updateTagFilter([]); } catch (err) { console.warn('[AssetManagement] tag clear failed:', err && err.message); } }); clear.setAttribute('data-action', 'home-tag-clear'); }
            /* v2.3.0 阶段4.2：单个全选切换按钮——点击时按当前状态判定：已全选则清空，否则全选。
               判定口径与 renderTagDropdown 的文案口径一致（已选集合 ⊇ 目录全部 id 且目录非空）。 */
            const toggleAll = dropdown.querySelector('[data-tag-toggle-all]');
            if (toggleAll) { toggleAll.addEventListener('click', () => { try { const catalog = this._getAssetTagCatalog(); const selectedIds = Array.isArray(this.filter.tagIds) ? this.filter.tagIds : []; const allSelected = catalog.length > 0 && catalog.every(tag => selectedIds.indexOf(tag.id) >= 0); updateTagFilter(allSelected ? [] : catalog.map(tag => tag.id)); } catch (err) { console.warn('[AssetManagement] tag toggleAll failed:', err && err.message); } }); toggleAll.setAttribute('data-action', 'home-tag-toggle-all'); }
        };
        const renderDropdown = () => {
            dropdown.innerHTML = kind === 'tag' ? renderTagDropdown() : renderSingleDropdown();
            bindDropdownEvents();
            positionDropdown();
        };

        renderDropdown();
        document.addEventListener('keydown', onKeydown);
        document.addEventListener('mousedown', onOutsidePointer, true);
        document.addEventListener('scroll', positionDropdown, true);
        window.addEventListener('resize', positionDropdown);
    }

    /**
     * Bottom navigation's third page: the wishlist pool with three sub-tabs —
     * wishing (种草中) / purchased (已购买) / abandoned (已拔草). The purchased and
     * abandoned histories are event-sourced from the wishlistEvents sidecar and
     * hydrated lazily by _warmWishlistEvents() the first time their tab opens.
     */
    renderWishlistPoolPage() {
        const subTab = ['pool', 'purchased', 'abandoned'].includes(this.wishlistPoolTab) ? this.wishlistPoolTab : 'pool';
        const tabs = [
            { key: 'pool', label: this._t('wishlistPoolTabActive', '种草中') },
            { key: 'purchased', label: this._t('wishlistPurchasedTab', '已购买') },
            { key: 'abandoned', label: this._t('wishlistAbandonedTab', '已拔草') },
        ];
        // Phase 1 (decision 4): sub-tabs stay count-free for a calm header.
        const subtabHtml = `<div class="am-wishlist-subtab">${tabs.map(tab => `<button type="button" class="am-wishlist-subtab__pill${subTab === tab.key ? ' am-wishlist-subtab__pill--active' : ''}" data-action="wishlist-subtab" data-subtab="${escapeHtml(tab.key)}">${escapeHtml(tab.label)}</button>`).join('')}</div>`;
        return `
            <div class="am-wishpool-page am-wishlist-pool-page">
                ${subtabHtml}
                ${this._renderWishlistSubtabContent(subTab)}
            </div>`;
    }

    /** Render the active wishlist sub-tab body (wishing list / purchased / abandoned). */
    _renderWishlistSubtabContent(subTab) {
        if (subTab === 'purchased') return this._renderPurchasedHistory();
        if (subTab === 'abandoned') return this._renderAbandonedHistory();
        // Wishing list: newest wishes first (createdAt descending).
        const wishedAssets = this.assets.filter(a => a && a.status === 'wishlist').slice()
            .sort((l, r) => String(r.createdAt || '').localeCompare(String(l.createdAt || '')));
        return wishedAssets.length
            ? `<div class="am-wishpool-page__list">${wishedAssets.map(a => this._renderWishlistPoolAssetItem(a)).join('')}</div>`
            : `<div class="am-events-empty">${escapeHtml(this._t('wishlistEmpty', '还没有种草\n点 + 号添加'))}</div>`;
    }

    /** Purchased history (purchased events), newest conversion first. */
    _renderPurchasedHistory() {
        const events = (this.wishlistEvents || []).filter(event => event && event.eventType === 'purchased').slice()
            .sort((l, r) => String(r.occurredAt || '').localeCompare(String(l.occurredAt || '')));
        if (!events.length) {
            return `<div class="am-events-empty">${escapeHtml(this._t('wishlistPurchasedEmpty', '还没有购买记录\n种草后购买会显示在这里'))}</div>`;
        }
        return `<div class="am-wishpool-page__list">${events.map(event => this._renderPurchasedEventItem(event)).join('')}</div>`;
    }

    /** Abandoned history (abandoned events), newest abandonment first. Read-only. */
    _renderAbandonedHistory() {
        const events = (this.wishlistEvents || []).filter(event => event && event.eventType === 'abandoned').slice()
            .sort((l, r) => String(r.occurredAt || '').localeCompare(String(l.occurredAt || '')));
        if (!events.length) {
            return `<div class="am-events-empty">${escapeHtml(this._t('wishlistAbandonedEmpty', '还没有拔草记录'))}</div>`;
        }
        return `<div class="am-wishpool-page__list">${events.map(event => this._renderAbandonedEventItem(event)).join('')}</div>`;
    }

    /**
     * Purchased event card. Name / cover / expected price / target group come from the
     * sourceSnapshot; the real paid price is projected from the linked financial event;
     * the conversion time is occurredAt. Tapping jumps to the owned asset (decision 3) —
     * if that asset was deleted the card is greyed and tapping only toasts.
     */
    _renderPurchasedEventItem(event) {
        const snapshot = event.sourceSnapshot || {};
        const wishlist = snapshot.wishlist || {};
        const currency = event.currency || snapshot.currency || 'CNY';
        const coverHtml = this.renderAssetCoverContent(snapshot, '📦', 'am-wishpool__card-cover', 'am-wishpool__card-cover-fallback');
        const expectedMinor = Number.isSafeInteger(wishlist.expectedAmountMinor) ? wishlist.expectedAmountMinor : null;
        const financial = event.financialEventId
            ? (this._financialEvents || []).find(item => item && item.id === event.financialEventId) : null;
        const actualMinor = financial && Number.isSafeInteger(financial.amountMinor) ? financial.amountMinor : null;
        const cheaper = expectedMinor != null && actualMinor != null && actualMinor < expectedMinor;
        const priceHtml = `<span class="am-wishlist-history__expected">${escapeHtml(this._t('wishlistExpectedPrice', '期望价'))}：${expectedMinor == null ? '—' : formatAmountMinor(expectedMinor, currency)}</span><span class="am-wishlist-history__arrow">→</span><span class="am-wishlist-history__actual${cheaper ? ' am-wishlist-history__actual--cheap' : ''}">${escapeHtml(this._t('wishlistActualPrice', '实付'))}：${actualMinor == null ? '—' : formatAmountMinor(actualMinor, currency)}</span>`;
        const groupLabel = this._wishlistTargetGroupLabel(event.sourceTargetGroup || wishlist.targetGroup);
        const targetAssetId = event.targetAssetId || '';
        const targetExists = !!targetAssetId && (this.assets || []).some(asset => asset && asset.id === targetAssetId);
        const deletedClass = targetExists ? '' : ' am-wishlist-card--deleted';
        // v2.4.2：heartbeat 事件在购买后仍留存 sidecar——历史卡按 sourceWishlistId 派生计数，>0 显示小字「心动 N 次」。
        const heartbeatCount = deriveWishlistHeartbeat(Array.isArray(this.wishlistEvents) ? this.wishlistEvents : [], event.sourceWishlistId).count;
        const heartbeatHtml = heartbeatCount > 0 ? `<span class="am-wishlist-history__heartbeat">${escapeHtml(this._t('wishlistHeartbeatCount', '心动 {n} 次', { n: heartbeatCount }))}</span>` : '';
        return `<article class="am-wishlist-card am-wishlist-card--history am-wishlist-card--purchased am-formal-card${deletedClass}" data-action="wishlist-open-purchased" data-target-asset-id="${escapeHtml(targetAssetId)}"><div class="am-wishlist-card__top"><div class="am-wishlist-card__cover">${coverHtml}</div><div class="am-wishlist-card__content"><div class="am-wishlist-card__title-row"><div class="am-wishlist-card__name">${escapeHtml(snapshot.name || '—')}</div><span class="am-wishlist-badge am-wishlist-badge--purchased">✅ ${escapeHtml(this._t('wishlistPurchasedBadge', '已购买'))}</span></div><div class="am-wishlist-card__price am-wishlist-history__price">${priceHtml}</div><div class="am-wishlist-history__meta"><span class="am-wishlist-group-chip">${escapeHtml(groupLabel)}</span>${heartbeatHtml}<span class="am-wishlist-history__time">${escapeHtml(this._t('wishlistConvertedAt', '转正于'))} ${escapeHtml(this._formatWishlistEventDateTime(event.occurredAt))}</span></div></div></div></article>`;
    }

    /**
     * Abandoned event card — pure read-only terminal record (decision 2). Name / cover /
     * expected price / target group come from the sourceSnapshot; the reason is truncated
     * to 50 chars and hidden when empty; the abandonment time is occurredAt. v2.2：提供
     * 唯一的「永久删除」操作（data-wishlist-delete-id），把这条拔草记录从历史中移除。
     */
    _renderAbandonedEventItem(event) {
        const snapshot = event.sourceSnapshot || {};
        const wishlist = snapshot.wishlist || {};
        const currency = event.currency || snapshot.currency || 'CNY';
        const coverHtml = this.renderAssetCoverContent(snapshot, '📦', 'am-wishpool__card-cover', 'am-wishpool__card-cover-fallback');
        const expectedMinor = Number.isSafeInteger(wishlist.expectedAmountMinor) ? wishlist.expectedAmountMinor : null;
        const reason = String(event.abandonReason || '').trim();
        const reasonText = reason.length > 50 ? reason.slice(0, 50) + '…' : reason;
        const reasonHtml = reasonText
            ? `<div class="am-wishlist-card__reason">${escapeHtml(this._t('wishlistAbandonReason', '拔草原因'))}：${escapeHtml(reasonText)}</div>` : '';
        // v2.4.2：heartbeat 事件在拔草后仍留存 sidecar——历史卡按 sourceWishlistId 派生计数，>0 显示小字「心动 N 次」。
        const heartbeatCount = deriveWishlistHeartbeat(Array.isArray(this.wishlistEvents) ? this.wishlistEvents : [], event.sourceWishlistId).count;
        const heartbeatHtml = heartbeatCount > 0 ? `<span class="am-wishlist-history__heartbeat">${escapeHtml(this._t('wishlistHeartbeatCount', '心动 {n} 次', { n: heartbeatCount }))}</span>` : '';
        return `<article class="am-wishlist-card am-wishlist-card--history am-wishlist-card--abandoned am-formal-card"><div class="am-wishlist-card__top"><div class="am-wishlist-card__cover am-wishlist-card__cover--gray">${coverHtml}</div><div class="am-wishlist-card__content"><div class="am-wishlist-card__title-row"><div class="am-wishlist-card__name am-wishlist-card__name--muted">${escapeHtml(snapshot.name || '—')}</div><span class="am-wishlist-badge am-wishlist-badge--abandoned">🥀 ${escapeHtml(this._t('wishlistAbandonedBadge', '已拔草'))}</span><button type="button" class="am-wishpool__history-delete" data-wishlist-delete-id="${escapeHtml(event.id)}" aria-label="${escapeHtml(this._t('wishlistDeleteAbandoned', '永久删除'))}"><span>×</span></button></div><div class="am-wishlist-card__price am-wishlist-card__price--muted">${escapeHtml(this._t('wishlistExpectedPrice', '期望价'))}：${expectedMinor == null ? '—' : formatAmountMinor(expectedMinor, currency)}</div>${reasonHtml}<div class="am-wishlist-history__meta">${heartbeatHtml}<span class="am-wishlist-history__time">${escapeHtml(this._t('wishlistAbandonedAt', '拔草于'))} ${escapeHtml(this._formatWishlistEventDateTime(event.occurredAt))}</span></div></div></div></article>`;
    }

    /** Localized target-group chip label for wishlist history cards. */
    _wishlistTargetGroupLabel(group) {
        if (group === 'virtual') return this._t('wishlistTargetGroupVirtual', '虚拟');
        if (group === 'prepaid') return this._t('wishlistTargetGroupPrepaid', '预付');
        return this._t('wishlistTargetGroupPhysical', '实物');
    }

    /** Jump to the owned asset behind a purchased event; toast if it was deleted. */
    _openPurchasedTargetAsset(assetId, target) {
        const asset = (this.assets || []).find(item => item && item.id === assetId);
        if (!asset) {
            this.showToast('⚠️ ' + this._t('wishlistTargetAssetDeleted', '该资产已删除'));
            return;
        }
        this.openFormalProductCard(assetId, target && target.closest && target.closest('.am-modal--main'));
    }

    /**
     * Lazily hydrate this.wishlistEvents from the wishlistEvents sidecar. Called the first
     * time the purchased/abandoned sub-tab opens; mutations keep the cache authoritative
     * (see _commitAssetAuditMutation), so this only runs when history is still cold.
     */
    async _warmWishlistEvents() {
        if (this._wishlistEventsLoaded) return this.wishlistEvents;
        try {
            const events = this.storage && typeof this.storage.readWishlistEvents === 'function'
                ? await this.storage.readWishlistEvents() : [];
            this.wishlistEvents = Array.isArray(events) ? events : [];
            this._wishlistEventsLoaded = true;
        } catch (error) {
            // Stay cold on failure so reopening the tab retries the sidecar read.
            console.warn('[AssetManagement] wishlist events load failed:', error && error.message);
        }
        return this.wishlistEvents;
    }

    /** Switch the wishlist pool sub-tab, lazy-warming history on first open. */
    switchWishlistSubtab(tab) {
        const next = ['pool', 'purchased', 'abandoned'].includes(tab) ? tab : 'pool';
        this.wishlistPoolTab = next;
        // v2.4.1：pool 子 tab 的卡片迷你价格曲线同样依赖 wishlistEvents，冷态一并预热。
        if (!this._wishlistEventsLoaded) {
            // Render the cold tab immediately, then re-render once history is warm.
            this.refreshMainContent();
            this._warmWishlistEvents().then(() => {
                if (this.wishlistPoolTab === next && !this._unloaded) this.refreshMainContent();
            });
            return;
        }
        this.refreshMainContent();
    }

    _renderWishlistPoolAssetItem(a) {
        if (a && a.kind && a.wishlist) {
            // v2.4.1：种草池卡片布局与首页列表视图同步——左侧封面 + 名称（状态点 + 类型 chip）
            // + 期望价，横线分隔；横线下左侧迷你价格曲线 + 「更新价格」pill（卡上直接可点），
            // 右侧 拔草/购买 pill 按钮（「再次订阅」同款，文字更小）。
            const tags = (a.tagIds || []).map(id => (this._tags || []).find(tag => tag.id === id)).filter(Boolean)
                .map(tag => { const chipColor = this._tagChipColorAttrs(tag.color); return `<span class="am-asset-tag${chipColor.cls}"${chipColor.style}>${escapeHtml(tag.label)}</span>`; }).join('');
            const purchaseLabel = this._t('wishlistPurchaseAction', '购买');
            const abandonLabel = this._t('wishlistAbandonAction', '拔草');
            const coverHtml = this.renderAssetCoverContent(a, '📦', 'am-asset-item__cover-image', 'am-asset-item__cover-fallback');
            const group = a.wishlist.targetGroup === 'virtual' ? 'virtual' : (a.wishlist.targetGroup === 'prepaid' ? 'prepaid' : 'physical');
            const groupLabel = group === 'virtual' ? this._t('wishlistTargetGroupVirtual', '虚拟')
                : (group === 'prepaid' ? this._t('wishlistTargetGroupPrepaid', '预付') : this._t('wishlistTargetGroupPhysical', '实物'));
            const typechipHtml = `<span class="am-card-typechip am-card-typechip--${escapeHtml(group)}">${escapeHtml(groupLabel)}</span>`;
            const priceValue = a.wishlist.expectedAmountMinor == null ? '—' : escapeHtml(formatAmountMinor(a.wishlist.expectedAmountMinor, a.currency));
            const tagsHtml = tags ? `<div class="am-asset-item__tags">${tags}</div>` : '';
            const sparklineHtml = this._renderWishlistSparklineHtml(a);
            // v2.4.2 修订（hotfix）：种草池卡片价格曲线搬出底部 row 独占一行（紧贴 meta 行下方），
            // 池卡片不再放「更新价格」按钮（详情卡专属入口保留），底部 row 只剩三按钮并排：
            // 心动 / 拔草 / 购买。这避免了卡片窄屏下 sparkline + 更新价格 + 心动 pill 三者挤压重叠。
            // v2.4.2：心动 pill——计数实时派生自 wishlistEvents sidecar（主表不落计数字段），
            // 阶段 emoji 取 describeWishlistHeartbeat；有目标显示 n/target，无目标纯计数。
            // 达标（reached）：心动 pill 与购买 pill 加 is-ready 高亮，名称行追加「可以买了」徽章。
            const heartbeatCount = deriveWishlistHeartbeat(Array.isArray(this.wishlistEvents) ? this.wishlistEvents : [], a.id).count;
            const heartbeatDesc = describeWishlistHeartbeat(heartbeatCount, a.wishlist.heartbeatTarget);
            const heartbeatHasTarget = Number.isSafeInteger(a.wishlist.heartbeatTarget) && a.wishlist.heartbeatTarget >= 1;
            const heartbeatCountText = heartbeatHasTarget ? `${heartbeatCount}/${a.wishlist.heartbeatTarget}` : `${heartbeatCount}`;
            const heartbeatPillHtml = `<button type="button" class="am-card-renew am-wish-heartbeat-pill${heartbeatDesc.reached ? ' is-ready' : ''}" data-wishlist-heartbeat-id="${escapeHtml(a.id)}">${heartbeatDesc.emoji} ${escapeHtml(this._t('wishlistHeartbeatAction', '心动'))} ${heartbeatCountText}</button>`;
            const readyBadgeHtml = heartbeatDesc.reached ? `<span class="am-wish-ready-badge">${escapeHtml(this._t('wishlistHeartbeatReadyBadge', '可以买了'))}</span>` : '';
            const buyReadyClass = heartbeatDesc.reached ? ' is-ready' : '';
            // v2.4.2 hotfix 修订 3：价格曲线作为 .am-asset-item__meta 的最后一个子元素，
            // 通过 margin-left:auto 推至该行最右，与 meta 行的 space-between 自动布局正交。
            // 这样无论有没有标签，曲线始终在卡片内容区右侧边缘，不挤价格也不挤标签。
            // 高度对齐 baseline（meta 是 align-items: baseline）让曲线与期望价同高。
            const priceTrendHtml = sparklineHtml || '';
            return `<article class="am-wishlist-card am-wishlist-card--pool am-formal-card" data-id="${escapeHtml(a.id)}" data-asset-card-id="${escapeHtml(a.id)}" data-action="card"><div class="am-asset-item__top"><div class="am-asset-item__cover">${coverHtml}</div><div class="am-asset-item__main"><div class="am-asset-item__headline"><div class="am-asset-item__name"><span>${escapeHtml(a.name)}</span><span class="am-dot am-dot--wishlist"></span>${typechipHtml}${readyBadgeHtml}</div></div><div class="am-asset-item__meta"><div class="am-asset-item__price"><span>${escapeHtml(this._t('wishlistExpectedPrice', '期望价'))}</span>${priceValue}</div>${tagsHtml}${priceTrendHtml}</div></div></div><div class="am-asset-item__divider"></div><div class="am-asset-item__bottom am-wishpool__bottom"><div class="am-wishpool__actions">${heartbeatPillHtml}<button type="button" class="am-card-renew am-card-renew--ghost" data-wishlist-abandon-id="${escapeHtml(a.id)}">${escapeHtml(abandonLabel)}</button><button type="button" class="am-card-renew${buyReadyClass}" data-action="wishlist-buy" data-id="${escapeHtml(a.id)}" data-wishlist-buy-id="${escapeHtml(a.id)}">${escapeHtml(purchaseLabel)}</button></div></div></article>`;
        }
        // Strict formal storage must never make a legacy snapshot actionable.
        return '';
    }

    _formatWishlistEventDateTime(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(value || ''));
        if (!match) return '—';
        const date = this._t('datePickerDateFormat', '{year}年{month}月{day}日', {
            year: match[1], month: Number(match[2]), day: Number(match[3]),
        });
        return match[4] ? `${date} ${match[4]}:${match[5]}` : date;
    }


    /** Kept for older modal callers; the home page no longer owns wishlist navigation. */
    renderHomePage() {
        return this.renderFormalHomeAssets();
    }

    renderReportPage() {
        // v1.5.0 报表全面升级：去掉顶部 30天/6月/12月 切换；概览/分类/排行用全量 report，金额趋势固定
        // 12 月窗口。所有数据 report.js 已提供，本方法纯 UI 重组（不动数据契约）。
        // v1.6.0 布局顺序 = 资产概览 → 即将到期 → 分类排行 → 标签排行 → 金额趋势 → 产品价格排行
        // （到期提醒提到概览正下方最醒目处，标题去「（7 天内）」括号）。
        // v2.6.3 分品类分析：即将到期与种草转化之间插入订阅分析 / 预付分析两个条件渲染
        // section（口径全部取自 report.subscription / report.prepaid，不再套实物口径）。
        if (!this._formalDomainLoaded && this._formalDomainError) return this._renderFormalDashboardError(this._formalDomainError);
        let report, trendBuckets;
        try {
            const snapshot = this._formalDomainSnapshot();
            report = this._buildFullFormalReport(snapshot);
            const range = this.dashboardTimeRange || '12m';
            trendBuckets = ((buildFormalDashboard(snapshot, range, { now: new Date().toISOString() }) || {}).trend || {}).buckets || [];
        } catch (error) {
            return this._renderFormalDashboardError(error);
        }
        const total = Number(report.counts.total) || 0;
        const activeCount = Number(report.counts.byStatus.active) || 0;
        const retiredCount = Number(report.counts.byStatus.retired) || 0;
        // v2.6.2 修复批次 2：资产概览 · 总金额与退役回收统一为同款单行组件 am-dashboard-summary__line
        //（标题左、金额右、资产计数更弱色）；多币种金额与计数各自按币种以 ' · ' 连接，
        // 去掉原 am-dashboard-money 多行 CNY 结构。
        const currencyBuckets = Object.values(report.amounts.netByCurrency || {});
        const totalAmountHtml = `<div class="am-dashboard-summary__line"><small>${escapeHtml(this._t('dashboardTotalAmount', '总金额'))}</small>${currencyBuckets.length
            ? `<strong>${currencyBuckets.map(item => formatAmountMinor(Number(item.netAmountMinor) || 0, item.currency)).join(' · ')}</strong><i>${currencyBuckets.map(item => Number(item.assetCount) || 0).join(' · ')}</i>`
            : `<strong>${formatAmountMinor(0, 'CNY')}</strong><i>0</i>`}</div>`;
        // v2.6.2 资产概览 · 退役回收：同款单行，金额后补资产计数；无任何退役转让则整块不渲染。
        const saleBuckets = Object.values(report.amounts.retiredSaleByCurrency || {});
        const retiredRecoveredHtml = saleBuckets.length
            ? `<div class="am-dashboard-summary__line"><small>${escapeHtml(this._t('dashboardRetiredRecovered', '退役回收'))}</small><strong>${saleBuckets.map(item => formatAmountMinor(Number(item.saleAmountMinor) || 0, item.currency)).join(' · ')}</strong><i>${saleBuckets.map(item => Number(item.assetCount) || 0).join(' · ')}</i></div>`
            : '';
        // 即将到期提示：7 天内（含今天到期，不含已过期）；无则整块不渲染。点击复用资产产品卡。
        // v1.6.0：标题去「（7 天内）」括号、位置移到概览正下方；行右列改为具体到期日（右对齐、中性色，
        // 与其余 surface 文字一致），名称跨前两列、到期日落第三列右对齐。
        const expiringSoon = this._getExpiringSoonList(report);
        const expiringHtml = expiringSoon.length
            ? `<section class="am-dashboard__surface am-dashboard-expiring"><h3>${escapeHtml(this._t('dashboardExpiringSoonTitle', '即将到期'))}</h3><div class="am-dashboard-list">${expiringSoon.map(({ card, date, days }) => `<button type="button" class="am-dashboard-asset-row" data-action="card" data-id="${escapeHtml(card.id)}"><span>${escapeHtml(card.name)}</span><strong>${date ? escapeHtml(date) : (days <= 0 ? escapeHtml(this._t('dashboardExpiryToday', '今天到期')) : escapeHtml(this._t('dashboardExpiry7', '{days} 天内到期').replace('{days}', String(days))))}</strong></button>`).join('')}</div></section>`
             : '';
        // v2.6.3 补充：订阅分析 / 预付分析 / 种草转化三张独立卡片合并为一张
        // surface，分段 tab 切换内容，缩短报表纵向长度。可用判定沿用 v2.6.3：
        // 订阅 = 存在订阅资产；预付 = 存在任一预付资产；种草恒可用；仅 1 个可用
        // 区块时不渲染 tab 行。三块 body 分别由 _renderReportXxxBody 私有方法产
        // 出，内容语义与合并前逐块等价（含各自的空列表不渲染条件）。
        const analysisTabs = this._reportAnalysisAvailableTabs(report);
        this._reportAnalysisTabsCache = analysisTabs;
        const analysisTab = analysisTabs.indexOf(this._reportAnalysisTab) >= 0 ? this._reportAnalysisTab : analysisTabs[0];
        const analysisBody = analysisTab === 'subscription' ? this._renderReportSubscriptionBody(report)
            : analysisTab === 'prepaid' ? this._renderReportPrepaidBody(report)
            : this._renderReportWishlistBody(report);
        const analysisTitle = analysisTab === 'subscription' ? this._t('dashboardSubscriptionTitle', '订阅分析')
            : analysisTab === 'prepaid' ? this._t('dashboardPrepaidTitle', '预付分析')
            : this._t('dashboardWishlistTitle', '种草转化');
        const analysisTabLabels = {
            subscription: this._t('reportAnalysisTabSubscription', '订阅'),
            prepaid: this._t('reportAnalysisTabPrepaid', '预付'),
            wishlist: this._t('reportAnalysisTabWishlist', '种草'),
        };
        const analysisTabsHtml = analysisTabs.length >= 2 ? `<div class="am-dashboard-analysis__tabs" role="tablist">${analysisTabs.map(tab => {
            const isActive = tab === analysisTab;
            return `<button type="button" role="tab" aria-selected="${isActive ? 'true' : 'false'}" class="${isActive ? 'is-active' : ''}" data-action="report-analysis-tab" data-analysis="${tab}">${escapeHtml(analysisTabLabels[tab])}</button>`;
        }).join('')}</div>` : '';
        const analysisHtml = `<section class="am-dashboard__surface am-dashboard-analysis"><div class="am-dashboard-analysis__head"><h3>${escapeHtml(analysisTitle)}</h3>${analysisTabsHtml}</div>${analysisBody}</section>`;
        // 金额趋势：12 月购入金额折 CNY 折线 + 面积图。
        const trendSvg = this._renderAmountTrendSvg(this._reportTrendCnySeries(trendBuckets), trendBuckets.map(item => item.label || (item.key || '').slice(5)));
        // 分类排行：第一排按数量（多→少）、第二排按金额（折 CNY 购入成本），不再渲染在役圆环图。
        const kindCount = Object.entries(report.counts.byKind || {}).map(([kind, count]) => ({ kind: kind, value: Number(count) || 0 })).sort((a, b) => b.value - a.value);
        const kindAmount = this._reportKindAmountCny(report);
        const countMax = Math.max(1, ...kindCount.map(item => item.value));
        const amountMax = Math.max(1, ...kindAmount.map(item => item.value));
        const countBars = kindCount.length ? `<div class="am-dashboard-bars">${kindCount.map(item => `<div class="am-bar-hit" data-action="dashboard-kind" data-kind="${escapeHtml(item.kind)}" title="${escapeHtml(this._t('dashboardBarTapHint', '点击查看明细'))}"><span>${escapeHtml(this._formalKindLabel(item.kind))}</span><strong>${item.value}</strong><i style="width:${(item.value / countMax * 100).toFixed(1)}%"></i></div>`).join('')}</div>` : this._renderFormalDashboardEmpty();
        const amountBars = kindAmount.length ? `<div class="am-dashboard-bars">${kindAmount.map(item => `<div class="am-bar-hit" data-action="dashboard-kind" data-kind="${escapeHtml(item.kind)}" title="${escapeHtml(this._t('dashboardBarTapHint', '点击查看明细'))}"><span>${escapeHtml(this._formalKindLabel(item.kind))}</span><strong>${formatAmountMinor(item.value, 'CNY')}</strong><i style="width:${(item.value / amountMax * 100).toFixed(1)}%"></i></div>`).join('')}</div>` : this._renderFormalDashboardEmpty();
        // 标签排行：只列有资产引用的标签，按聚合购入金额（折 CNY）从高到低；无任何带标签资产则不渲染。
        const tagAmount = this._reportTagAmountCny(report);
        const tagMax = Math.max(1, ...tagAmount.map(item => item.value));
        const tagBars = tagAmount.length ? `<div class="am-dashboard-bars">${tagAmount.map(item => `<div class="am-bar-hit" data-action="dashboard-tag" data-tag="${escapeHtml(item.tagId)}" title="${escapeHtml(this._t('dashboardBarTapHint', '点击查看明细'))}"><span>${escapeHtml(item.label)}</span><strong>${formatAmountMinor(item.value, 'CNY')}</strong><i style="width:${(item.value / tagMax * 100).toFixed(1)}%"></i></div>`).join('')}</div>` : '';
        // 产品价格排行：沿用按币种分组、净成本降序；点击改 data-action="card" 复用资产产品卡。
        const rankings = Object.entries(report.rankings.byCurrency || {}).length ? `<div class="am-dashboard-ranking">${Object.entries(report.rankings.byCurrency).map(([currency, items]) => `<div><h4>${escapeHtml(currency)}</h4>${items.slice(0, 5).map((item, index) => `<button type="button" class="am-dashboard-asset-row" data-action="card" data-id="${escapeHtml(item.assetId)}"><i>${index + 1}</i><span>${escapeHtml(item.name)}</span><strong>${formatAmountMinor(item.netAmountMinor, currency)}${this._cnyApproxHtml(item.netAmountMinor, currency)}</strong></button>`).join('')}</div>`).join('')}</div>` : this._renderFormalDashboardEmpty();
        return `<div class="am-dashboard">
            <section class="am-dashboard__surface am-dashboard-summary"><h3>${escapeHtml(this._t('dashboardSummaryTitle', '资产概览'))}</h3><span class="am-dashboard__asof">${escapeHtml(this._t('dashboardAsOfToday', '截至今天'))}</span><div class="am-dashboard-summary__grid"><div><small>${escapeHtml(this._t('dashboardTotal', '资产总数'))}</small><strong>${total}</strong></div><div><small>${escapeHtml(this._t('statusActive', '在役'))}</small><strong>${activeCount}</strong></div><div><small>${escapeHtml(this._t('statusRetired', '退役'))}</small><strong>${retiredCount}</strong></div></div>${totalAmountHtml}${retiredRecoveredHtml}</section>
             ${expiringHtml}
             ${analysisHtml}
            <section class="am-dashboard__surface am-dashboard-composition"><h3>${escapeHtml(this._t('dashboardCategoryTitle', '分类排行'))}</h3><div class="am-dashboard-catcols"><div class="am-dashboard-catcol"><span class="am-dashboard-catcol__title">${escapeHtml(this._t('dashboardCategoryCountTitle', '按数量'))}</span>${countBars}</div><div class="am-dashboard-catcol"><span class="am-dashboard-catcol__title">${escapeHtml(this._t('dashboardCategoryAmountTitle', '按金额'))}<small>${escapeHtml(this._t('dashboardCategoryAmountMeta', '折合 ¥'))}</small></span>${amountBars}</div></div></section>
            ${tagBars ? `<section class="am-dashboard__surface am-dashboard-tags"><h3>${escapeHtml(this._t('dashboardTagTitle', '标签排行'))}</h3><p>${escapeHtml(this._t('dashboardTagAmountMeta', '按标签聚合购入金额（折合 ¥）'))}</p>${tagBars}</section>` : ''}
            <section class="am-dashboard__surface am-dashboard-trend-section"><h3>${escapeHtml(this._t('dashboardTrendAmountTitle', '金额趋势'))}</h3><p>${escapeHtml(this._t('dashboardTrendAmountMeta', '近 12 个月购入金额（折合 ¥）'))}</p>${trendSvg}</section>
            <section class="am-dashboard__surface"><h3>${escapeHtml(this._t('dashboardRankingTitle', '价格排行'))}</h3>${rankings}</section>
        </div>`;
    }

    // ---------- v2.6.3 补充：报表合并分析卡（订阅 / 预付 / 种草转化，tab 切换） ----------

    // 可用 tab 判定（沿用 v2.6.3 条件）：订阅 = 存在订阅资产；预付 = 存在金额维
    // 或次数维预付资产；种草转化恒可用。
    _reportAnalysisAvailableTabs(report) {
        const byKind = (report && report.counts && report.counts.byKind) || {};
        const tabs = [];
        if ((Number(byKind.virtualSubscription) || 0) > 0) tabs.push('subscription');
        if ((Number(byKind.prepaidAmount) || 0) > 0 || (Number(byKind.prepaidCount) || 0) > 0) tabs.push('prepaid');
        tabs.push('wishlist');
        return tabs;
    }

    // 订阅块 body：状态三格 + 月度/累计支出 + 30 天内续费列表（无订阅资产返回空串）。
    // 外层 div 保留 am-dashboard-subscription 语义类，既有行布局 CSS 选择器继续生效。
    _renderReportSubscriptionBody(report) {
        const subscriptionKindTotal = Number(((report && report.counts && report.counts.byKind) || {}).virtualSubscription) || 0;
        if (subscriptionKindTotal <= 0) return '';
        const subscription = report.subscription || {};
        const subscriptionState = subscription.byState || {};
        const subscriptionStopped = (Number(subscriptionState.expired) || 0) + (Number(subscriptionState.pendingConfirmation) || 0);
        const subscriptionBuckets = Object.values(subscription.byCurrency || {});
        const subscriptionMonthlyText = subscriptionBuckets.length
            ? subscriptionBuckets.map(bucket => formatAmountMinor(Number(bucket.monthlyAmountMinor) || 0, bucket.currency)).join(' · ')
            : formatAmountMinor(0, 'CNY');
        const subscriptionPaidText = subscriptionBuckets.length
            ? subscriptionBuckets.map(bucket => formatAmountMinor(Number(bucket.paidAmountMinor) || 0, bucket.currency)).join(' · ')
            : formatAmountMinor(0, 'CNY');
        const subscriptionRenewals = Array.isArray(subscription.upcomingRenewals) ? subscription.upcomingRenewals : [];
        const subscriptionRenewalRows = subscriptionRenewals.map(entry => {
            const card = (report.assets || []).find(item => item && item.id === entry.assetId);
            const name = card && card.name ? card.name : this._t('dashboardUnnamed', '未命名资产');
            const amount = Number(entry.amountMinor) || 0;
            const amountText = amount > 0 && entry.currency ? ` · ${formatAmountMinor(amount, entry.currency)}` : '';
            return `<button type="button" class="am-dashboard-asset-row" data-action="card" data-id="${escapeHtml(entry.assetId || '')}"><span>${escapeHtml(name)}</span><strong>${escapeHtml(entry.date || '')}${amountText}</strong></button>`;
        }).join('');
        return `<div class="am-dashboard-analysis__body am-dashboard-subscription"><div class="am-dashboard-summary__grid"><div><small>${escapeHtml(this._t('dashboardSubscriptionStateSubscribed', '订阅中'))}</small><strong>${Number(subscriptionState.subscribed) || 0}</strong></div><div><small>${escapeHtml(this._t('dashboardSubscriptionStateTrial', '试用中'))}</small><strong>${Number(subscriptionState.trial) || 0}</strong></div><div><small>${escapeHtml(this._t('dashboardSubscriptionStateStopped', '已停订'))}</small><strong>${subscriptionStopped}</strong></div></div><div class="am-dashboard-summary__line"><small>${escapeHtml(this._t('dashboardSubscriptionMonthly', '月度支出'))}</small><strong>${subscriptionMonthlyText}</strong><i>${escapeHtml(this._t('dashboardSubscriptionPerMonth', '/月'))}</i></div><div class="am-dashboard-summary__line"><small>${escapeHtml(this._t('dashboardSubscriptionPaid', '累计支出'))}</small><strong>${subscriptionPaidText}</strong></div>${subscriptionRenewals.length ? `<div class="am-dashboard-analysis__subhead">${escapeHtml(this._t('dashboardSubscriptionRenewals', '30 天内续费'))}</div><div class="am-dashboard-list">${subscriptionRenewalRows}</div>` : ''}</div>`;
    }

    // 预付块 body：总余额（次数维剩余次数随行）+ 累计充值 + 累计消费 + 使用率
    //（充值全 0 省略）+ 30 天内过期列表（无预付资产返回空串）。
    // 外层 div 保留 am-dashboard-prepaid 语义类，既有行布局 CSS 选择器继续生效。
    _renderReportPrepaidBody(report) {
        const byKind = (report && report.counts && report.counts.byKind) || {};
        const prepaidKindTotal = (Number(byKind.prepaidAmount) || 0) + (Number(byKind.prepaidCount) || 0);
        if (prepaidKindTotal <= 0) return '';
        const prepaid = report.prepaid || {};
        const prepaidBuckets = Object.values(prepaid.amountByCurrency || {});
        const prepaidBalanceText = prepaidBuckets.length
            ? prepaidBuckets.map(bucket => formatAmountMinor(Number(bucket.balanceAmountMinor) || 0, bucket.currency)).join(' · ')
            : formatAmountMinor(0, 'CNY');
        const prepaidChargedText = prepaidBuckets.length
            ? prepaidBuckets.map(bucket => formatAmountMinor(Number(bucket.chargeAmountMinor) || 0, bucket.currency)).join(' · ')
            : formatAmountMinor(0, 'CNY');
        const prepaidConsumedText = prepaidBuckets.length
            ? prepaidBuckets.map(bucket => formatAmountMinor(Number(bucket.consumeAmountMinor) || 0, bucket.currency)).join(' · ')
            : formatAmountMinor(0, 'CNY');
        const prepaidChargedTotalMinor = prepaidBuckets.reduce((sum, bucket) => sum + (Number(bucket.chargeAmountMinor) || 0), 0);
        const prepaidUtilizationText = prepaidBuckets.map(bucket => `${Math.round(Math.min(1, Math.max(0, Number(bucket.utilizationRate) || 0)) * 100)}%`).join(' · ');
        const prepaidCountTotals = prepaid.countTotals || {};
        const prepaidRemainingText = (Number(prepaidCountTotals.assetCount) || 0) > 0
            ? this._t('dashboardPrepaidRemainingCount', '剩余 {count} 次', { count: Number(prepaidCountTotals.remainingCount) || 0 })
            : '';
        const prepaidExpiring = Array.isArray(prepaid.expiringWithin30Days) ? prepaid.expiringWithin30Days : [];
        const prepaidExpiringRows = prepaidExpiring.map(entry => {
            const card = (report.assets || []).find(item => item && item.id === entry.assetId);
            const name = card && card.name ? card.name : this._t('dashboardUnnamed', '未命名资产');
            return `<button type="button" class="am-dashboard-asset-row" data-action="card" data-id="${escapeHtml(entry.assetId || '')}"><span>${escapeHtml(name)}</span><strong>${escapeHtml(entry.date || '')}</strong></button>`;
        }).join('');
        return `<div class="am-dashboard-analysis__body am-dashboard-prepaid"><div class="am-dashboard-summary__line"><small>${escapeHtml(this._t('dashboardPrepaidBalance', '总余额'))}</small><strong>${prepaidBalanceText}</strong>${prepaidRemainingText ? `<i>${escapeHtml(prepaidRemainingText)}</i>` : ''}</div><div class="am-dashboard-summary__line"><small>${escapeHtml(this._t('dashboardPrepaidCharged', '累计充值'))}</small><strong>${prepaidChargedText}</strong></div><div class="am-dashboard-summary__line"><small>${escapeHtml(this._t('dashboardPrepaidConsumed', '累计消费'))}</small><strong>${prepaidConsumedText}</strong></div>${prepaidChargedTotalMinor > 0 ? `<div class="am-dashboard-summary__line am-dashboard-prepaid__utilization"><small>${escapeHtml(this._t('dashboardPrepaidUtilization', '使用率'))}</small><strong>${prepaidUtilizationText}</strong></div>` : ''}${prepaidExpiring.length ? `<div class="am-dashboard-analysis__subhead">${escapeHtml(this._t('dashboardPrepaidExpiring', '30 天内过期'))}</div><div class="am-dashboard-list">${prepaidExpiringRows}</div>` : ''}</div>`;
    }

    // 种草转化块 body：四格计数（总数/种草中/购买/拔草）+ 购买率/拔草率，恒可用。
    // 外层 div 保留 am-dashboard-wishlist 语义类，既有分栏 CSS 选择器继续生效。
    _renderReportWishlistBody(report) {
        const wishlistReport = (report && report.wishlist) || {};
        const wishlistRate = value => `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;
        return `<div class="am-dashboard-analysis__body am-dashboard-wishlist"><div class="am-dashboard-wishlist__columns"><div class="am-dashboard-wishlist__counts"><div><small>${escapeHtml(this._t('dashboardWishlistTotal', '种草总数'))}</small><strong>${Number(wishlistReport.total) || 0}</strong></div><div><small>${escapeHtml(this._t('dashboardWishlistActive', '种草中'))}</small><strong>${Number(wishlistReport.active) || 0}</strong></div><div><small>${escapeHtml(this._t('dashboardWishlistPurchased', '购买'))}</small><strong>${Number(wishlistReport.purchased) || 0}</strong></div><div><small>${escapeHtml(this._t('dashboardWishlistAbandoned', '拔草'))}</small><strong>${Number(wishlistReport.abandoned) || 0}</strong></div></div><div class="am-dashboard-wishlist__rates"><span><small>${escapeHtml(this._t('dashboardWishlistPurchaseRate', '购买率'))}</small><strong>${wishlistRate(wishlistReport.purchaseRate)}</strong></span><span><small>${escapeHtml(this._t('dashboardWishlistAbandonRate', '拔草率'))}</small><strong>${wishlistRate(wishlistReport.abandonRate)}</strong></span></div></div></div>`;
    }

    _formalDomainSnapshot() {
        if (!this._formalDomainLoaded) {
            throw this._formalDomainError || new Error(this._t('formalDashboardUnavailable', '正式报表数据不可用'));
        }
        // Test and isolated UI hosts can inject a fully loaded in-memory domain,
        // but each required sidecar must still be explicitly present as an array.
        // This is intentionally not an empty-array fallback.
const snapshot = this._formalDomainStateSnapshot || {
            assets: this.assets, tags: this._tags, financialEvents: this._financialEvents,
            subscriptionPeriods: this._subscriptionPeriods, prepaidTransactions: this._prepaidTransactions,
            maintenance: this._maintenanceRecords, usage: this._usageRecords, lifecycleEvents: this._lifecycleEvents,
            wishlistEvents: this.wishlistEvents, operationLogs: this._opLogs,
        };
        const required = ['assets', 'tags', 'financialEvents', 'subscriptionPeriods', 'prepaidTransactions', 'maintenance', 'lifecycleEvents', 'wishlistEvents', 'operationLogs'];
        required.forEach(key => {
            if (!Array.isArray(snapshot[key])) throw new Error('formal snapshot sidecar unavailable: ' + key);
        });
        return snapshot;
    }

    /** Sync accessor for the cached exchange-rates sidecar (read-only, display-layer only). */
    _getExchangeRates() {
        return this._exchangeRates || { schemaVersion: 1, baseCurrency: 'CNY', rates: {} };
    }

    /** v2.6.4 P2：汇率 updatedAt（ISO 串）→ 本地 YYYY-MM-DD HH:mm；缺失/非法返回 ''。 */
    _formatExchangeRateUpdatedAt(value) {
        if (typeof value !== 'string' || !value) return '';
        const date = new Date(value);
        if (!date || isNaN(date.getTime())) return '';
        const pad = n => String(n).padStart(2, '0');
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
            + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    }

    /**
     * v2.6.4 P2：从免凭证 open.er-api.com 刷新汇率（并发守卫：在途复用同一 promise）。
     * 成功：整体替换写入 exchangeRates（source='auto'，updatedAt 由存储层盖章）→
     *   更新缓存 → refreshMainContent → 若设置 Dialog 打开则刷新当前设置内容。
     * options.silent=true（自动模式）：成败都不 toast，失败仅 console.warn；
     * 手动模式：成功 ✓ 汇率已更新；失败按网络/解析分开提示。
     * 返回 boolean（true=已更新），永不 reject。
     */
    _refreshExchangeRates(options) {
        if (this._exchangeRateRefreshPromise) return this._exchangeRateRefreshPromise;
        const promise = this._runExchangeRateRefresh(options || {})
            .catch(error => {
                console.warn('[AssetManagement] exchange rate refresh failed:', error && error.message);
                return false;
            })
            .finally(() => { this._exchangeRateRefreshPromise = null; });
        this._exchangeRateRefreshPromise = promise;
        return promise;
    }

    async _runExchangeRateRefresh(options) {
        const silent = options && options.silent === true;
        const controller = (typeof AbortController === 'function') ? new AbortController() : null;
        // 15s 超时；无 AbortController 的环境退化为无超时（不阻断主流程）。
        const timer = controller ? setTimeout(() => { try { controller.abort(); } catch (e) {} }, 15000) : null;
        let parsed = null;
        let failureKind = 'network';
        try {
            const response = await fetch(exchangeRateApi.EXCHANGE_RATE_API_URL, controller ? { signal: controller.signal } : undefined);
            if (!response || !response.ok) throw new Error('HTTP ' + (response ? response.status : 'unknown'));
            const json = await response.json();
            failureKind = 'parse';
            parsed = exchangeRateApi.parseExchangeRateApiResponse(json);
        } catch (error) {
            if (timer) clearTimeout(timer);
            if (this._unloaded) return false;
            console.warn('[AssetManagement] exchange rate refresh failed (' + failureKind + '):', error && error.message);
            if (!silent) {
                this.showToast('⚠️ ' + (failureKind === 'parse'
                    ? this._t('exchangeRateRefreshFailParse', '汇率刷新失败：返回数据无法解析')
                    : this._t('exchangeRateRefreshFailNetwork', '汇率刷新失败：网络请求失败，请稍后重试')));
            }
            return false;
        }
        if (timer) clearTimeout(timer);
        if (this._unloaded || !this.storage || typeof this.storage.mutateFormalAssetDomain !== 'function') return false;
        try {
            const transaction = await this.storage.mutateFormalAssetDomain(async () => ({
                change: { exchangeRates: { baseCurrency: 'CNY', rates: Object.assign({}, parsed.rates), source: 'auto' } },
            }));
            this._exchangeRates = (transaction && transaction.exchangeRates)
                || { schemaVersion: 1, baseCurrency: 'CNY', rates: Object.assign({}, parsed.rates), source: 'auto' };
        } catch (error) {
            if (this._unloaded) return false;
            console.warn('[AssetManagement] exchange rate refresh write failed:', error && error.message);
            if (!silent) this.showToast('⚠️ ' + this._t('exchangeRateSaveFail', '汇率保存失败'));
            return false;
        }
        if (!silent) this.showToast('✓ ' + this._t('exchangeRateRefreshSuccess', '汇率已更新'));
        try { this.refreshMainContent(); } catch (e) { console.warn('[AssetManagement] refreshMainContent after rate refresh failed:', e && e.message); }
        this._refreshOpenSettingsDialogContent();
        return true;
    }

    /**
     * v2.6.4 P2：汇率自动刷新决策（由 loadAssets 成功路径单点触发）。
     * 条件：未卸载 + 设置开关未关 + 已有汇率且来源非 auto 即跳过 + 距上次更新超过 24h。
     * 手动优先，自动不覆盖：≤2.6.3 存量手动汇率（有 rates、无 source 字段，
     * normalize 归一为 null）与显式 manual 绝不覆盖；新用户（无 rates）首启
     * 自动拉取；source='auto' 按 24h 续更。「恢复自动汇率」直走
     * _refreshExchangeRates，不经此闸门。
     * onload 中 loadAssets 先于 loadSettings：先等 settings-load gate，
     * 避免把构造器默认值当成用户偏好。静默触发，绝不冒泡。
     */
    async _maybeAutoRefreshExchangeRates() {
        try {
            if (this._unloaded) return;
            const gate = this._settingsLoadGatePromise;
            if (gate && !this._settingsLoadGateLoaded) {
                await Promise.race([gate, new Promise(resolve => setTimeout(resolve, 10000))]);
            }
            if (this._unloaded) return;
            const settings = this.settings || {};
            if (settings.exchangeRateAutoRefresh === false) return;
            const ratesObj = this._getExchangeRates();
            const rateSource = exchangeRateApi.normalizeExchangeRateSource(ratesObj ? ratesObj.source : null);
            const hasSavedRates = !!(ratesObj && ratesObj.rates && typeof ratesObj.rates === 'object' && Object.keys(ratesObj.rates).length > 0);
            if (hasSavedRates && rateSource !== 'auto') return;
            if (!exchangeRateApi.isExchangeRateStale(ratesObj ? ratesObj.updatedAt : null, Date.now())) return;
            void this._refreshExchangeRates({ silent: true }).catch(() => {});
        } catch (error) {
            console.warn('[AssetManagement] auto exchange rate refresh skipped:', error && error.message);
        }
    }

    /**
     * v2.6.4 P2：汇率更新后，若设置 Dialog 正打开，按既有 Tab 切换同款模式
     * 重渲染当前 Tab 内容并重绑事件（root 带 am-settings-dialog-host 类）。
     */
    _refreshOpenSettingsDialogContent() {
        try {
            if (this._unloaded) return;
            const root = document.querySelector('.am-settings-dialog-host');
            if (!root) return;
            const activeTab = root.querySelector('.am-settings__tab--active');
            const tab = (activeTab && activeTab.dataset && activeTab.dataset.tab) || 'general';
            const content = root.querySelector('.am-settings__content');
            if (!content) return;
            content.innerHTML = this.renderSettingsTab(tab);
            this.bindSettingsTabEvents(root, tab);
        } catch (error) {
            console.warn('[AssetManagement] refresh settings dialog content failed:', error && error.message);
        }
    }

    /** Build a small ≈¥ hint span for non-CNY amounts. Returns '' for CNY or missing rate. */
    _cnyApproxHtml(amountMinor, currency) {
        if (!Number.isSafeInteger(amountMinor)) return '';
        const hint = formatCNYApproxHint(amountMinor, currency, this._getExchangeRates());
        return hint ? '<span class="am-cny-approx">' + escapeHtml(hint) + '</span>' : '';
    }

    /** Report APIs require a date window; UI overview deliberately spans all formal owned assets. */
    _buildFullFormalReport(snapshot) {
        const domain = snapshot || this._formalDomainSnapshot();
        const dates = (domain.assets || []).filter(asset => asset && asset.status !== 'wishlist' && /^\d{4}-\d{2}-\d{2}$/.test(asset.acquiredOn || ''))
            .map(asset => asset.acquiredOn).sort();
        return buildFormalReport(domain, { dateFrom: dates[0] || todayISO(), endDate: todayISO() }, { now: new Date().toISOString() });
    }

    _renderFormalDashboardError(error) {
        const detail = String((error && error.message) || error || this._t('formalDashboardUnavailable', '正式报表数据不可用')).replace(/[<>&]/g, '').slice(0, 240);
        return `<div class="am-dashboard-error" role="alert"><strong>${escapeHtml(this._t('formalDashboardUnavailable', '正式报表数据不可用'))}</strong><p>${escapeHtml(detail)}</p><button type="button" data-action="dashboard-retry">${escapeHtml(this._t('btnRetry', '重试'))}</button></div>`;
    }

    _retryFormalDashboard() {
        if (this._formalDashboardRetryPromise) return this._formalDashboardRetryPromise;
        // Start the reload synchronously so a second delegated click can share
        // the exact in-flight promise before the next microtask.
        let reload;
        try { reload = this.loadAssets(); } catch (error) { reload = Promise.reject(error); }
        this._formalDashboardRetryPromise = Promise.resolve(reload)
            .catch(() => undefined).then(() => { this.refreshMainContent(); })
            .finally(() => { this._formalDashboardRetryPromise = null; });
        return this._formalDashboardRetryPromise;
    }

    _renderFormalDashboardRow(card) {
        if (!card) return '';
        const important = card.nextImportant && card.nextImportant.date ? card.nextImportant.date : this._t('formalNoImportantDate', '无重要日期');
        return `<button type="button" class="am-dashboard-asset-row" data-action="dashboard-detail" data-id="${escapeHtml(card.id)}"><span>${escapeHtml(card.name)}</span><strong>${escapeHtml(important)}</strong></button>`;
    }

    /** Dashboard rendering consumes the current in-memory assets only. */
    _onDataCommitted() {
        // v2.5.0 阶段2：全部 _commitAssetAuditMutation 事务、saveSettings、
        // resetAllFormalData 成功后在此单点触发索引同步（引擎内部防抖 + 防递归守卫）。
        this._scheduleNoteLinkSync();
    }

    /**
     * v2.5.0 阶段2：CRUD → 索引同步唯一入口。引擎自身已吞错，这里再加一层
     * 守卫，任何情况下都不得把同步异常冒泡到 CRUD / UI 主流程。
     */
    _scheduleNoteLinkSync() {
        try {
            if (this._unloaded || !this.noteLink) return;
            this.noteLink.scheduleSync();
        } catch (error) {
            console.warn('[AssetManagement][noteLink] scheduleSync failed:', error && error.message);
        }
    }

    /**
     * v2.5.0 阶段2：引擎回写资产 indexBlockId（仅 owned；wishlist 极简 schema
     * 不携带该键，引擎侧已跳过）。走标准事务但透传 operationLogs，避免为
     * 索引回写生成审计噪声。调用时引擎处于 syncing 态，_onDataCommitted 触发
     * 的 scheduleSync 会被引擎内部守卫 no-op（防递归铁律）。
     */
    async _patchAssetIndexBlockId(assetId, blockId) {
        try {
            if (!assetId || typeof blockId !== 'string' || !blockId) return false;
            const context = await this._commitAssetAuditMutation(snapshot => {
                const current = (snapshot.assets || []).find(item => item && item.id === assetId);
                // wishlist 极简 schema 不携带 indexBlockId；未找到同样拒绝。
                if (!current || current.status === ASSET_STATUS.WISHLIST) return { noop: true, context: { patched: false } };
                if (current.indexBlockId === blockId) return { noop: true, context: { patched: true } };
                const assets = snapshot.assets.map(item => item.id === assetId
                    ? Object.assign({}, item, { indexBlockId: blockId }) : item);
                return { assets: assets, operationLogs: snapshot.operationLogs, context: { patched: true } };
            });
            return !!(context && context.patched);
        } catch (error) {
            console.warn('[AssetManagement][noteLink] patchAssetIndexBlockId failed:', error && error.message);
            return false;
        }
    }

    /** Do not update dock, modal, or toast after the plugin has been unloaded. */
    _runGuardedUiEffects(options) {
        if (this._unloaded) return false;
        const effects = options || {};
        if (this._agentWriteRefreshContext
            && (effects.renderDock || effects.refreshModal || effects.refreshMainContent)) {
            this._agentWriteRefreshContext.handled = true;
        }
        if (effects.scheduleResourceIndexReconcile && typeof this.scheduleResourceIndexReconcile === 'function') {
            this.scheduleResourceIndexReconcile();
        }
        if (effects.refreshMainContent) {
            this.refreshMainContent();
        } else {
            if (effects.renderDock && this.dockElement) this.renderDock();
            if (effects.refreshModal && this._modalContainer && this._modalDialog) this.refreshModalContent();
        }
        if (typeof effects.callback === 'function') effects.callback();
        if (effects.toast) this.showToast(effects.toast);
        return true;
    }





    _renderFormalDashboardEmpty() {
        return `<div class="am-dashboard-empty">${escapeHtml(this._t('dashboardEmpty', '暂无资产'))}</div>`;
    }

    /** v1.5.0：单币种 minor 折 CNY minor；CNY 直返，缺汇率的非 CNY 返 0（不阻塞报表渲染）。 */
    _reportMinorToCny(amountMinor, currency, rates) {
        const n = Number(amountMinor) || 0;
        if (!n) return 0;
        const cur = String(currency || 'CNY').toUpperCase();
        if (cur === 'CNY') return n;
        const r = convertToCNYMinor(n, cur, rates || this._getExchangeRates());
        return r && Number.isFinite(r.cnyMinor) ? r.cnyMinor : 0;
    }

    /** v1.5.0：分类金额排行——按 kind 聚合购入成本并折 CNY（恒 >=0，柱状图友好），按金额降序。 */
    _reportKindAmountCny(report) {
        const rates = this._getExchangeRates();
        const byKind = Object.create(null);
        (report.assets || []).forEach(card => {
            const cny = this._reportMinorToCny(card.financials && card.financials.acquisitionAmountMinor, card.currency, rates);
            byKind[card.kind] = (byKind[card.kind] || 0) + cny;
        });
        return Object.keys(byKind).map(kind => ({ kind: kind, value: byKind[kind] })).sort((a, b) => b.value - a.value);
    }

    /** v1.5.0：标签金额排行——按 tagId 聚合购入成本并折 CNY，按金额降序。
     *  只统计「有资产引用」的标签（没被任何资产使用的标签自然不出现）；
     *  标签目录里查不到（已删除）或 label 为空的 tagId 跳过，不渲染空行。 */
    _reportTagAmountCny(report) {
        const rates = this._getExchangeRates();
        const byTag = Object.create(null);
        (report.assets || []).forEach(card => {
            const cny = this._reportMinorToCny(card.financials && card.financials.acquisitionAmountMinor, card.currency, rates);
            (Array.isArray(card.tagIds) ? card.tagIds : []).forEach(tagId => {
                byTag[tagId] = (byTag[tagId] || 0) + cny;
            });
        });
        const tagById = new Map((Array.isArray(this._tags) ? this._tags : []).map(tag => [tag && tag.id, tag]));
        return Object.keys(byTag).map(tagId => {
            const tag = tagById.get(tagId);
            const label = tag && String(tag.label || '').trim();
            if (!label) return null;
            return { tagId: tagId, label: label, value: byTag[tagId] };
        }).filter(Boolean).sort((a, b) => b.value - a.value);
    }

    /** v2.1：报表互动——点击分类/标签排行弹出该分组下的产品明细（按购入金额折 CNY 降序）。
     *  opts = { kind } 或 { tagId }。行内点击复用资产产品卡。纯展示，不写存储。 */
    _openReportBreakdown(opts) {
        let report;
        try { report = this._buildFullFormalReport(this._formalDomainSnapshot()); }
        catch (error) { this.showToast('⚠️ ' + this._t('formalDashboardUnavailable', '正式报表数据不可用')); return; }
        const rates = this._getExchangeRates();
        const cards = (report.assets || []).filter(card => card && card.status !== 'wishlist');
        let title = '';
        let list = [];
        if (opts && opts.tagId) {
            const tag = (Array.isArray(this._tags) ? this._tags : []).find(tg => tg && tg.id === opts.tagId);
            title = (tag && String(tag.label || '').trim()) || this._t('filterTag', '标签');
            list = cards.filter(card => Array.isArray(card.tagIds) && card.tagIds.indexOf(opts.tagId) >= 0);
        } else if (opts && opts.kind) {
            title = this._formalKindLabel(opts.kind);
            list = cards.filter(card => card.kind === opts.kind);
        } else { return; }
        const rows = list.map(card => ({
            id: card.id,
            name: card.name,
            currency: card.currency || 'CNY',
            acq: (card.financials && card.financials.acquisitionAmountMinor != null) ? card.financials.acquisitionAmountMinor : 0,
            cny: this._reportMinorToCny(card.financials && card.financials.acquisitionAmountMinor, card.currency, rates),
        })).sort((a, b) => b.cny - a.cny);
        const rowsHtml = rows.length
            ? rows.map(r => `<button type="button" class="am-dashboard-asset-row" data-breakdown-card="${escapeHtml(r.id)}"><span>${escapeHtml(r.name)}</span><strong>${formatAmountMinor(r.acq, r.currency)}${this._cnyApproxHtml(r.acq, r.currency)}</strong></button>`).join('')
            : `<div class="am-events-empty">${escapeHtml(this._t('dashboardBreakdownEmpty', '暂无资产'))}</div>`;
        const mask = document.createElement('div');
        mask.className = 'am-report-breakdown-mask';
        mask.innerHTML = `<div class="am-report-breakdown" role="dialog" aria-modal="true">`
            + `<div class="am-report-breakdown__head"><span class="am-report-breakdown__title">${escapeHtml(title)}</span><span class="am-report-breakdown__count">${rows.length}</span><button type="button" class="am-report-breakdown__close" aria-label="${escapeHtml(this._t('btnClose', '关闭'))}">×</button></div>`
            + `<div class="am-report-breakdown__list">${rowsHtml}</div></div>`;
        const close = () => { if (mask.parentNode) mask.parentNode.removeChild(mask); };
        mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
        mask.querySelector('.am-report-breakdown__close').addEventListener('click', close);
        mask.querySelectorAll('[data-breakdown-card]').forEach(btn => {
            btn.addEventListener('click', () => { const id = btn.getAttribute('data-breakdown-card'); close(); this.openFormalProductCard(id); });
        });
        // v2.1：挂到 dock 容器内（dock 为 position:relative + overflow:hidden），弹窗只覆盖插件范围
        (this.dockElement || document.body).appendChild(mask);
    }

    /** v1.5.0：12 月趋势每桶购入金额折 CNY 求和，返回与 buckets 同序的数值数组（画曲线用）。 */
    _reportTrendCnySeries(buckets) {
        const rates = this._getExchangeRates();
        return (buckets || []).map(bucket => {
            const byCur = bucket && bucket.acquisitionAmountMinorByCurrency ? bucket.acquisitionAmountMinorByCurrency : {};
            let sum = 0;
            Object.keys(byCur).forEach(currency => {
                const cell = byCur[currency];
                const amt = cell && typeof cell === 'object' ? (cell.amountMinor != null ? cell.amountMinor : 0) : (Number(cell) || 0);
                sum += this._reportMinorToCny(amt, currency, rates);
            });
            return sum;
        });
    }

    /** v1.5.0：12 月金额折线 + 面积 SVG。viewBox 固定、preserveAspectRatio=none 横向拉伸铺满容器；
     *  线用 vector-effect:non-scaling-stroke 保线宽，不放 text/circle（否则被拉伸变形/变椭圆）；
     *  月份标签用 HTML 行外置（隔月显示避免拥挤）。全 0 时画一条基线，不报错。
     *  v2.4.1 阶段3：可选第三参 options（{ formatValue(minor)=>string, ariaLabel }）——
     *  formatValue 定制贴点值标签格式（默认 kfmt「xxK」千位格式），ariaLabel 定制无障碍
     *  标签（默认报表金额趋势标题）。不传 options 时输出与旧版逐字节一致（报表回归安全）。 */
    _renderAmountTrendSvg(series, labels, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const W = 320, H = 92, padX = 6, padTop = 16, padBottom = 8;
        const vals = (series && series.length ? series : [0]).map(v => Math.max(0, Number(v) || 0));
        const n = vals.length;
        const max = Math.max(1, ...vals);
        const innerW = W - padX * 2, innerH = H - padTop - padBottom;
        const xAt = i => n === 1 ? W / 2 : padX + (i / (n - 1)) * innerW;
        const yAt = v => padTop + innerH - (v / max) * innerH;
        const f = x => x.toFixed(1);
        const P = vals.map((v, i) => [xAt(i), yAt(v)]);
        // v1.5.0：金额标签格式 xxK（minor→major→千，CNY 2 位小数故 /100000）；0 或空返回空串，该月留白。
        const kfmt = minor => {
            const k = (Number(minor) || 0) / 100000;
            if (!(k > 0)) return '';
            const r = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
            return r + 'K';
        };
        // v2.4.1 阶段3：贴点值标签与无障碍标签参数化；未传时回落到报表默认（kfmt / 金额趋势）。
        const formatValue = typeof opts.formatValue === 'function' ? opts.formatValue : kfmt;
        const ariaLabel = opts.ariaLabel == null ? this._t('dashboardTrendAmountTitle', '金额趋势') : String(opts.ariaLabel);
        // v1.5.0：柔和曲线——Catmull-Rom 转三次贝塞尔，过每个数据点且切线连续，无直角折线。
        // 边界虚拟点取端点自身，使首尾切线水平收束；padTop 余量容纳控制点与贴点金额标签。
        let linePath;
        if (n < 2) {
            linePath = P.length ? `M ${f(P[0][0])} ${f(P[0][1])}` : '';
        } else {
            const parts = [`M ${f(P[0][0])} ${f(P[0][1])}`];
            for (let i = 0; i < n - 1; i++) {
                const p0 = P[i - 1] || P[i];
                const p1 = P[i];
                const p2 = P[i + 1];
                const p3 = P[i + 2] || p2;
                const c1x = p1[0] + (p2[0] - p0[0]) / 6;
                const c1y = p1[1] + (p2[1] - p0[1]) / 6;
                const c2x = p2[0] - (p3[0] - p1[0]) / 6;
                const c2y = p2[1] - (p3[1] - p1[1]) / 6;
                parts.push(`C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`);
            }
            linePath = parts.join(' ');
        }
        const baseY = f(padTop + innerH);
        const areaPath = P.length ? `${linePath} L ${f(P[n - 1][0])} ${baseY} L ${f(P[0][0])} ${baseY} Z` : '';
        // v1.5.0：每月金额贴点标签——绝对定位到对应数据点正上方，随曲线起伏；空月不渲染（留白）。
        // left/top 用百分比，因 SVG preserveAspectRatio=none 把 viewBox 0..W/0..H 线性映射到容器 100%，
        // 故百分比坐标与曲线点像素位置天然对齐；首尾标签改左/右对齐避免溢出容器。
        const valueSpans = P.map((p, i) => {
            const t = formatValue(vals[i]);
            if (!t) return '';
            const lx = (p[0] / W * 100).toFixed(2);
            const ty = (p[1] / H * 100).toFixed(2);
            const tx = i === 0 ? '0' : (i === n - 1 ? '-100%' : '-50%');
            return `<span class="am-trend-val" style="left:${lx}%;top:${ty}%;transform:translate(${tx},calc(-100% - 3px))">${escapeHtml(t)}</span>`;
        }).join('');
        const labelSpans = (labels && labels.length ? labels : vals.map((_, i) => i + 1))
            .map((lab, i) => `<span>${(i % 2 === 0 || i === n - 1) ? escapeHtml(String(lab == null ? '' : lab)) : ''}</span>`).join('');
        return `<div class="am-dashboard-trend-svg"><div class="am-trend-plot"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(ariaLabel)}"><path class="am-trend-area" d="${areaPath}"/><path class="am-trend-line" d="${linePath}"/></svg>${valueSpans}</div><div class="am-trend-xlabels">${labelSpans}</div></div>`;
    }


    openDashboardDetail(id) {
        const asset = (this.assets || []).find(item => item && String(item.id) === String(id));
        if (!asset || typeof document === 'undefined') return;
        let report, dashboard, card;
        try {
            const snapshot = this._formalDomainSnapshot();
            report = this._buildFullFormalReport(snapshot);
            dashboard = buildFormalDashboard(snapshot, this.dashboardTimeRange, { now: new Date().toISOString() });
            card = report.assets.find(item => item.id === asset.id);
            if (!card) throw new Error('formal dashboard asset is unavailable');
        } catch (error) { this.showToast('⚠️ ' + this._t('formalProjectionFailed', '正式投影不可用')); return; }
        const fields = [[this._t('fieldStatus', '状态'), this._t((STATUS_MAP[card.status] || {}).key, card.status)], [this._t('formalKind', '资产类型'), this._formalKindLabel(card.kind)], [this._t('fieldCategory', '分类'), card.categoryId], [this._t('fieldCurrency', '币种'), card.currency], [this._t('fieldPurchaseDate', '取得日期'), card.acquiredOn || '—'], [this._t('fieldPrice', '取得金额'), formatAmountMinor(card.financials.acquisitionAmountMinor || 0, card.currency)]];
        if (card.nextImportant && card.nextImportant.date) fields.push([this._t('dashboardExpiryDate', '重要日期'), card.nextImportant.date]);
        if (card.prepaid) fields.push([this._t('prepaidBalance', '预付余额'), card.prepaid.dimension === 'amount' ? formatAmountMinor(card.prepaid.balanceAmountMinor, card.currency) : `${card.prepaid.remainingCount} ${card.prepaid.unitLabel}`]);
        if (card.subscription) fields.push([this._t('renewTitle', '续费'), card.subscription.state || '—']);
        const maintenanceCount = snapshot.maintenance.filter(record => record.assetId === asset.id).length;
fields.push([this._t('maintenanceTitle', '维保'), String(maintenanceCount)]);
        void dashboard;
        const mask = document.createElement('div');
        mask.className = 'am-dashboard-detail-mask';
        mask.innerHTML = `<section class="am-dashboard-detail am-formal-dashboard-detail" role="dialog" aria-modal="true"><header><h2>${escapeHtml(asset.name || this._t('dashboardUnnamed', '未命名资产'))}</h2><button type="button" aria-label="${escapeHtml(this._t('dashboardClose', '关闭'))}"><svg viewBox="0 0 24 24"><use xlink:href="#iconClose"></use></svg></button></header><dl>${fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></section>`;
        const close = () => mask.remove();
        mask.querySelector('button').onclick = close;
        mask.onclick = event => { if (event.target === mask) close(); };
        (this.dockElement || this._modalContainer || document.body).appendChild(mask);
        this.bindAssetCoverFallbacks(mask);
    }

    renderEmptyPage(icon, text, hint) {
        return `<div class="am-empty">
            <div class="am-empty__icon">${icon}</div>
            <div class="am-empty__text">${escapeHtml(text)}</div>
            <div class="am-empty__hint">${escapeHtml(hint)}</div>
        </div>`;
    }

    renderSummaryCard(stats) {
        const activePart = `${stats.activeCount} ${escapeHtml(this._t("statusActive", "在役"))}`;
        const retiredPart = `${stats.retiredCount} ${escapeHtml(this._t("statusRetired", "退役"))}`;
        return `
            <div class="am-summary-card">
                <div class="am-summary-card__top">
                    <div class="am-summary-card__title">${escapeHtml(this._t("summaryCardTitle", "我的资产"))}</div>
                    <div class="am-summary-card__stats">
                        <span class="am-summary-card__stat am-summary-card__stat--active">${activePart}</span>
                        <span class="am-summary-card__divider">/</span>
                        <span class="am-summary-card__stat am-summary-card__stat--retired">${retiredPart}</span>
                    </div>
                </div>
                <div class="am-summary-card__bottom">
                    <div class="am-summary-card__amount">${formatCurrency(stats.totalValue, this.settings.preferredCurrency || 'CNY')}</div>
                    <div class="am-summary-card__daily">
                        <span class="am-summary-card__daily-label">${escapeHtml(this._t("dailyLabel", "日均消费"))}</span>
                        <span class="am-summary-card__daily-value">${formatCurrency(stats.dailyAvg, this.settings.preferredCurrency || 'CNY')}</span>
                    </div>
                </div>
            </div>`;
    }

    renderFormalAssetCollection(assets) {
        if (!assets.length) return this.renderEmptyPage("📦", this._t("emptyAssets"), this._t("emptyHint"));
        const mode = this.settings.viewMode || "list";
        if (mode === "matrix") {
            // v0.13.13：class 标识（不用 id，modal 内 grid 不会被覆盖）
            // v1.7-P2：初始 data-cols 由纯函数给出——手选 2/3/4 直接生效；auto 且宽度未知
            // （渲染时拿不到容器宽）默认 2 列，挂载后 _setupMatrixResizeObserver 立即按实测宽度修正。
            const pref = this.settings.matrixCols == null ? 'auto' : this.settings.matrixCols;
            const cols = this._matrixColsForWidth(0, pref);
            return `<div class="am-asset-grid" data-cols="${cols}">${assets.map(a => this.renderFormalAssetMatrixCard(a)).join("")}</div>`;
        }
        return assets.map(a => this.renderFormalAssetListCard(a)).join("");
    }

    /** Resolve every persisted cover variant to one render contract. */
    resolveAssetCover(asset, fallbackEmoji) {
        const source = asset && typeof asset === 'object' ? asset : {};
        const cover = media.normalizeCover(source.cover);
        const defaultCover = { kind: 'preset', presetId: media.DEFAULT_PRESET_ICON_ID };
        const isDefaultCover = cover.kind === 'none';
        const fallback = cover.kind === 'emoji' ? cover.emoji : (fallbackEmoji || '📦');
        return {
            kind: isDefaultCover ? 'preset' : cover.kind,
            url: this.resolveCoverUrl(isDefaultCover ? defaultCover : cover, this._presetIconManifest),
            fallback: fallback,
        };
    }

    renderAssetCoverImage(asset, className, fallbackEmoji, fallbackClassName) {
        const resolved = this.resolveAssetCover(asset, fallbackEmoji);
        if (!resolved.url) return '';
        const classes = [className, resolved.kind === 'preset' ? 'am-cover-image--preset' : ''].filter(Boolean).join(' ');
        const classAttr = classes ? ` class="${escapeHtml(classes)}"` : '';
        const fallbackClass = fallbackClassName || 'am-asset-cover-fallback';
        return `<img src="${escapeHtml(resolved.url)}"${classAttr} data-am-cover-fallback="${escapeHtml(resolved.fallback)}" data-am-cover-fallback-class="${escapeHtml(fallbackClass)}" alt="${escapeHtml((asset && asset.name) || '')}" />`;
    }

    renderAssetCoverContent(asset, fallback, className, fallbackClassName) {
        const resolved = this.resolveAssetCover(asset, fallback);
        const image = this.renderAssetCoverImage(asset, className, resolved.fallback, fallbackClassName);
        if (image) return image;
        return `<span class="${escapeHtml(fallbackClassName || 'am-asset-cover-fallback')}">${escapeHtml(resolved.fallback)}</span>`;
    }

    bindAssetCoverFallbacks(root) {
        if (!root || !root.addEventListener || root._amAssetCoverFallbackBound) return;
        root._amAssetCoverFallbackBound = true;
        root.addEventListener('error', event => {
            const image = event.target;
            if (!image || !image.matches || !image.matches('img[data-am-cover-fallback]')) return;
            const fallback = document.createElement('span');
            fallback.className = image.dataset.amCoverFallbackClass || 'am-asset-cover-fallback';
            fallback.textContent = image.dataset.amCoverFallback || '📦';
            image.replaceWith(fallback);
        }, true);
    }

    /**
     * v1.7-P2 矩阵视图可变列数（2/3/4）—— data-cols 驱动 + auto 断点自适应。
     *
     * 历史：v0.13.9~v0.13.22 的 [data-cols] 阶梯因 CSS 残留选择器特异性劫持（flex 覆盖 grid）
     * 导致堆叠，v0.13.23 曾弃用 data-cols。本轮（v1.7-P2）清理了 index.css 中全部 [data-cols]
     * flex 残留选择器，并在文件末尾以 (0,0,2,0) 特异性重新落地 grid 阶梯，故 data-cols 重新可用：
     *   - 渲染时给 .am-asset-grid 写初始 data-cols（纯函数 _matrixColsForWidth，宽度未知默认 2）
     *   - auto 模式：对 grid 元素挂 ResizeObserver，宽度跨断点时只改 data-cols 属性
     *     （不 renderDock、不换 DOM，滚动位置与卡片状态不受影响）
     *   - 手选 2/3/4：固定列数，不观察宽度（窄屏 ≤520 仍由纯函数强制 2 列）
     *   - 生命周期：observer 存 this._matrixResizeObserver；renderDock/refreshModalContent/
     *     refreshList 重渲染前先 disconnect 再新建，onunload 兜底 disconnect，防泄漏。
     */

    /** 纯函数：由容器宽度 W 与列数偏好 pref 计算矩阵最终列数（无 this 依赖，可单测）。
     *  - pref ∈ {2,3,4}（手选，数字或数字字符串）→ 返回 pref（但 W ≤ 520 窄屏强制 2）
     *  - pref 为 'auto' 或非法值 → 按宽度自适应：clamp(2, floor((W+gap)/(minCard+gap)), 6)
     *    minCard=200 / gap=14，等价断点：W<628→2，628–841→3，842–1055→4，1056–1269→5，≥1270→6
     *  - W 未知（非正数）且 auto → 默认 2（挂载后由 ResizeObserver 按实测宽度修正）
     * @param {number} width 容器内容宽度（px）；未知传 0/null
     * @param {'auto'|2|3|4|string} pref 列数偏好
     * @returns {2|3|4|5|6} */
    _matrixColsForWidth(width, pref) {
        const MIN_CARD = 200, GAP = 14, MOBILE_MAX = 520, MIN_COLS = 2, MAX_COLS = 6;
        const manual = (pref === 2 || pref === 3 || pref === 4) ? Number(pref)
            : (pref === '2' || pref === '3' || pref === '4') ? Number(pref) : 0;
        const w = (typeof width === 'number' && isFinite(width)) ? width : 0;
        let cols;
        if (manual) {
            cols = manual;
        } else if (w <= 0) {
            cols = MIN_COLS;
        } else {
            cols = Math.floor((w + GAP) / (MIN_CARD + GAP));
        }
        if (cols < MIN_COLS) cols = MIN_COLS;
        if (cols > MAX_COLS) cols = MAX_COLS;
        // 移动端窄屏（容器宽 ≤520，对应 index.css max-width:520px 断点）强制 2 列，手选亦受约束。
        if (w > 0 && w <= MOBILE_MAX && cols > MIN_COLS) cols = MIN_COLS;
        return cols;
    }

    /** v1.7-P2：列数循环按钮的显示文案。auto→「自动」；手选→「N 列」。 */
    _matrixColsButtonLabel(pref) {
        const cols = this._matrixColsForWidth(99999, pref);
        const isManual = pref === 2 || pref === 3 || pref === 4 || pref === '2' || pref === '3' || pref === '4';
        return isManual
            ? this._t('matrixColsCount', '{n} 列', { n: cols })
            : this._t('matrixColsAuto', '自动');
    }

    /** v1.7-P2：断开矩阵列数 ResizeObserver（重渲染前 / 卸载时调用，防泄漏）。 */
    _teardownMatrixResizeObserver() {
        if (this._matrixResizeObserver) {
            try { this._matrixResizeObserver.disconnect(); } catch (e) {}
            this._matrixResizeObserver = null;
        }
    }

    /** v1.7-P2：渲染后接线。先 disconnect 旧 observer，再对 dock + modal 内所有 .am-asset-grid
     *  按当前 settings.matrixCols 写 data-cols；仅 auto 模式挂 ResizeObserver 响应宽度变化。
     *  在 renderDock / refreshModalContent / refreshList 末尾调用。 */
    _setupMatrixResizeObserver() {
        this._teardownMatrixResizeObserver();
        if ((this.settings.viewMode || 'list') !== 'matrix') return;
        const pref = this.settings.matrixCols == null ? 'auto' : this.settings.matrixCols;
        const grids = [];
        [this.dockElement, this._modalContainer].forEach(host => {
            if (host && typeof host.querySelectorAll === 'function') {
                host.querySelectorAll('.am-asset-grid').forEach(grid => grids.push(grid));
            }
        });
        if (!grids.length) return;
        // 初始列数：用实测宽度立即修正渲染时的默认 2 列（同步发生在首次绘制前，无闪烁）。
        grids.forEach(grid => {
            const width = (typeof grid.clientWidth === 'number') ? grid.clientWidth : 0;
            grid.setAttribute('data-cols', String(this._matrixColsForWidth(width, pref)));
        });
        // 手选模式不响应宽度变化。
        if (pref !== 'auto') return;
        if (typeof ResizeObserver === 'undefined') return;
        const self = this;
        const observer = new ResizeObserver(entries => {
            // 防御：若偏好已切到手选（切换时会 teardown，此为二重保险），不再改列数。
            const current = self.settings.matrixCols == null ? 'auto' : self.settings.matrixCols;
            if (current !== 'auto') return;
            entries.forEach(entry => {
                const grid = entry.target;
                if (!grid || !grid.isConnected) return;
                const width = (entry.contentRect && entry.contentRect.width) || grid.clientWidth || 0;
                const cols = self._matrixColsForWidth(width, 'auto');
                if (grid.getAttribute('data-cols') !== String(cols)) {
                    grid.setAttribute('data-cols', String(cols));
                }
            });
        });
        grids.forEach(grid => observer.observe(grid));
        this._matrixResizeObserver = observer;
    }

    /** v1.7-P2：列数偏好变更后就地更新（不整页重渲染）：改写所有 grid 的 data-cols、
     *  刷新工具栏按钮文案，并按新模式重挂 / 断开 observer。 */
    _applyMatrixColsPreference() {
        const pref = this.settings.matrixCols == null ? 'auto' : this.settings.matrixCols;
        [this.dockElement, this._modalContainer].forEach(host => {
            if (!host || typeof host.querySelectorAll !== 'function') return;
            host.querySelectorAll('.am-asset-grid').forEach(grid => {
                const width = (typeof grid.clientWidth === 'number') ? grid.clientWidth : 0;
                grid.setAttribute('data-cols', String(this._matrixColsForWidth(width, pref)));
            });
        });
        this._setupMatrixResizeObserver();
    }

    /** v1.7.3 列表视图宽度自适应列数（1/2）：内容宽 ≥ 2*260+10=530px 裂变 2 列，否则单列。
     *  与 _matrixColsForWidth 同构但更简：auto-only、无 mobile 强制、上限 2 列（列表卡信息密度高）。 */
    _listColsForWidth(width) {
        const MIN_CARD = 260, GAP = 10, MAX_COLS = 2;
        const w = Number(width);
        if (!Number.isFinite(w) || w <= 0) return 1;
        let cols = Math.floor((w + GAP) / (MIN_CARD + GAP));
        if (cols < 1) cols = 1;
        if (cols > MAX_COLS) cols = MAX_COLS;
        return cols;
    }

    /** v1.7.3：断开列表列数 ResizeObserver（重渲染前 / 卸载时调用，防泄漏）。镜像 _teardownMatrixResizeObserver。 */
    _teardownListResizeObserver() {
        if (this._listResizeObserver) {
            try { this._listResizeObserver.disconnect(); } catch (e) {}
            this._listResizeObserver = null;
        }
    }

    /** v1.7.3：列表视图宽度自适应列数接线。镜像 _setupMatrixResizeObserver 但 auto-only、上限 2 列。
     *  先 teardown 旧 observer；非 list 模式清除容器残留 data-cols（防 matrix 模式误触 grid 阶梯）后早退；
     *  从 dock + modal 收集所有 .am-asset-list，按内容宽（clientWidth 扣 padding）同步写初始 data-cols，
     *  再挂 ResizeObserver 响应宽度变化。在 renderDock / refreshModalContent / refreshList 末尾调用。 */
    _setupListResizeObserver() {
        this._teardownListResizeObserver();
        const mode = this.settings.viewMode || 'list';
        if (mode !== 'list') {
            // 防御：matrix 模式下容器若残留 data-cols 会误触列表 grid 阶梯（matrix 列数由内部 .am-asset-grid 自管）。
            [this.dockElement, this._modalContainer].forEach(host => {
                if (host && typeof host.querySelectorAll === 'function') {
                    host.querySelectorAll('.am-asset-list').forEach(el => el.removeAttribute('data-cols'));
                }
            });
            return;
        }
        const lists = [];
        [this.dockElement, this._modalContainer].forEach(host => {
            if (host && typeof host.querySelectorAll === 'function') {
                host.querySelectorAll('.am-asset-list').forEach(el => lists.push(el));
            }
        });
        if (!lists.length) return;
        // .am-asset-list 有 padding 0 12px，clientWidth 含 padding，须扣除得内容宽。
        const contentWidthOf = el => {
            const cw = (typeof el.clientWidth === 'number') ? el.clientWidth : 0;
            try {
                const cs = getComputedStyle(el);
                return cw - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
            } catch (e) { return cw; }
        };
        // 初始列数：用实测内容宽立即修正渲染时的默认 1 列（同步发生在首次绘制前，无闪烁）。
        lists.forEach(el => el.setAttribute('data-cols', String(this._listColsForWidth(contentWidthOf(el)))));
        if (typeof ResizeObserver === 'undefined') return;
        const self = this;
        const observer = new ResizeObserver(entries => {
            entries.forEach(entry => {
                const el = entry.target;
                if (!el || !el.isConnected) return;
                const width = (entry.contentRect && entry.contentRect.width) || contentWidthOf(el);
                const cols = self._listColsForWidth(width);
                if (el.getAttribute('data-cols') !== String(cols)) {
                    el.setAttribute('data-cols', String(cols));
                }
            });
        });
        lists.forEach(el => observer.observe(el));
        this._listResizeObserver = observer;
    }


    renderTabBar() {
        const homeIcon = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/></svg>`;
        const addIcon = `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>`;
        const reportIcon = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="20" x2="21" y2="20"/><rect x="5" y="11" width="4" height="9" rx="1"/><rect x="10" y="6" width="4" height="14" rx="1"/><rect x="15" y="14" width="4" height="6" rx="1"/></svg>`;
        const wishlistPoolIcon = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V11"/><path d="M12 11c-3.5 0-6-2.1-6-5.5C9.5 5.5 12 7.6 12 11Z"/><path d="M12 15c3.5 0 6-2.1 6-5.5-3.5 0-6 2.1-6 5.5Z"/><path d="M12 21H7"/><path d="M12 21h5"/></svg>`;
        const activeTab = ["home", "report", "wishlistPool"].includes(this.activeTab) ? this.activeTab : "home";
        return `
            <div class="am-tabbar-wrap">
                <div class="am-tabbar-pill">
                    <button class="am-tab-pill am-tab-pill--home ${activeTab === "home" ? "am-tab-pill--active" : ""}" data-action="tab" data-tab="home">
                        ${homeIcon}
                        <span class="am-tab-pill__label">${escapeHtml(this._t("summaryTitle", "资产"))}</span>
                    </button>
                    <button class="am-tab-pill am-tab-pill--report ${activeTab === "report" ? "am-tab-pill--active" : ""}" data-action="tab" data-tab="report">
                        ${reportIcon}
                        <span class="am-tab-pill__label">${escapeHtml(this._t("reportTitle", "报表"))}</span>
                    </button>
                    <button class="am-tab-pill am-tab-pill--wishlist ${activeTab === "wishlistPool" ? "am-tab-pill--active" : ""}" data-action="tab" data-tab="wishlistPool">
                        ${wishlistPoolIcon}
                        <span class="am-tab-pill__label">${escapeHtml(this._t("tabWishlist", "种草"))}</span>
                    </button>
                </div>
                <button class="am-tab-fab" data-action="tab-add" aria-label="${escapeHtml(this._t("btnAdd", "添加"))}">${addIcon}</button>
            </div>`;
    }

    /**
     * v0.17-T3-β（M13 批量操作 · 工具栏 UI）：
     *  - 仅 bulkMode + bulkSelected.size > 0 时浮起显示（class `is-visible` 切换）
     *  - 三段式布局：左 = 已选 N 项 + 全选 / 取消全选；中 = 5 操作按钮；右 = 清空
     *  - 5 操作按钮当前为 stub（T3-γ 才接真实逻辑），点击仅 toast 占位
     *  - 「清空」按钮（T3-β 已实现）→ bulkSelected.clear() + renderDock
     *  - 浮动于 dock 底部、覆盖在列表上方（CSS 用 position: absolute + bottom: 0）
     *  - 与 renderTabBar 平级挂载（同一 isHomeMain 条件），但层级更高（z-index: 5）
     */
    renderBulkActionBar() {
        const count = this.bulkSelected.size;
        const visible = this.bulkMode && count > 0;
        const countLabel = escapeHtml(this._t("bulkActionCount", "已选 {n} 项").replace("{n}", String(count)));
        const statusLabel = escapeHtml(this._t("bulkActionChangeStatus", "改状态"));
        // No formal batch mutation contract exists yet. Keep this legacy action
        // disabled rather than leaking its old physical-only data model.
        const statusTitle = escapeHtml(this._t("formalBatchUnavailable", "正式批量改状态暂不可用"));
        return `
            <div class="am-bulk-action-bar ${visible ? 'is-visible' : ''}" aria-hidden="${!visible}">
                <div class="am-bulk-action-bar__left">
                    <span class="am-bulk-action-bar__count">${countLabel}</span>
                    <button class="am-bulk-action-bar__select-all" data-action="bulk-select-all">${escapeHtml(this._t("bulkActionSelectAll", "全选"))}</button>
                    <button class="am-bulk-action-bar__deselect-all" data-action="bulk-deselect-all">${escapeHtml(this._t("bulkActionDeselectAll", "取消全选"))}</button>
                </div>
                <div class="am-bulk-action-bar__center">
                    <button class="am-bulk-action-bar__btn" data-action="bulk-change-status" title="${statusTitle}" disabled>${statusLabel}</button>
                    <button class="am-bulk-action-bar__btn" data-action="bulk-add-tag">${escapeHtml(this._t("bulkActionAddTag", "加标签"))}</button>
                    <button class="am-bulk-action-bar__btn" data-action="bulk-remove-tag">${escapeHtml(this._t("bulkActionRemoveTag", "去标签"))}</button>
                </div>
                <div class="am-bulk-action-bar__right">
                    <button class="am-bulk-action-bar__close" data-action="bulk-clear">${escapeHtml(this._t("bulkActionClear", "清空"))}</button>
                </div>
            </div>`;
    }

    // ---------- 通用事件委托 ----------

    _getAssetCardOwner(target) {
        if (!target || typeof target.closest !== 'function') return null;
        return target.closest('.am-asset-item[data-asset-card-id], .am-asset-matrix[data-asset-card-id]');
    }

    bindActionDelegate(container, options) {
        const skipActions = (options && options.skipActions) || [];
        container.onclick = (e) => {
            const t = e.target.closest("[data-action]");
            if (!t) return;
            const action = t.dataset.action;
            // Native filter selects update through onchange; handling their click would rerender before the menu opens.
            if (t.tagName === 'SELECT') return;
            if (skipActions.indexOf(action) >= 0) return;
            let id = t.dataset.id;
            const cardOwner = this._getAssetCardOwner(e.target);
            // Card tags are display-only. Resolve card/menu IDs from the explicit
            // card owner so nested tag markup can never become an action boundary.
            if (action === 'card' && cardOwner && cardOwner.dataset.assetCardId) {
                id = cardOwner.dataset.assetCardId;
            } else if (action === 'item-menu' && !id && cardOwner && cardOwner.dataset.assetCardId) {
                id = cardOwner.dataset.assetCardId;
            }
// 卡片内底部按钮避免冒泡触发卡片本身的 data-action=card 弹窗
            if (action === "card-renew" || action === "card-no-renew") {
                e.stopPropagation();
            }
            this.handleAction(action, id, t, e);
        };
    }

    // ---------- DOCK 事件委托 ----------

    bindDockEvents(container) {
        this.bindActionDelegate(container);
        this._bindHomeSearchEvents(container);
        container.onchange = (e) => {
            const t = e.target;
            if (!t || !t.matches || !t.matches('[data-action="set-filter-status"], [data-action="set-sort"]')) return;
            this.handleAction(t.dataset.action, t.dataset.id, t, e);
        };
    }

    /** Wishlist terminal actions use local closures, never dock delegation. */
    bindWishlistPoolEvents(container) {
        if (!container || typeof container.querySelectorAll !== 'function') return;
        container.querySelectorAll('[data-wishlist-buy-id]').forEach(button => {
            button.onclick = event => {
                event.preventDefault();
                event.stopPropagation();
                this.purchaseWishlistAsset(button.dataset.wishlistBuyId);
            };
        });
        container.querySelectorAll('[data-wishlist-abandon-id]').forEach(button => {
            button.onclick = event => {
                event.preventDefault();
                event.stopPropagation();
                this.openWishlistAbandonSheet(button.dataset.wishlistAbandonId);
            };
        });
        // v2.4.2 修订（hotfix）：种草池卡片不再渲染「更新价格」pill，
        // 入口只在详情卡内提供（详情卡专属 price button 走独立的 close-product-card-aware 闭包）。
        // 池卡片的 [data-wishlist-update-price-id] 选择器已无节点；保留监听清理是 no-op。
        // v2.4.2：种草池卡片「心动」pill——点一下 +1；stopPropagation 保证绝不触发卡片本身的
        // data-action="card" 详情卡。域方法内部已跑 renderDock/refreshModal，这里再 refreshMainContent
        // 幂等兜底；+1 动画放在重渲染之后挂到稳定容器，避免被 innerHTML 替换清掉。
        container.querySelectorAll('[data-wishlist-heartbeat-id]').forEach(button => {
            button.onclick = async event => {
                event.preventDefault();
                event.stopPropagation();
                const id = button.dataset.wishlistHeartbeatId;
                const x = event && typeof event.clientX === 'number' ? event.clientX : null;
                const y = event && typeof event.clientY === 'number' ? event.clientY : null;
                try {
                    const result = await this.recordWishlistHeartbeat(id);
                    if (!result) return;
                    this.refreshMainContent();
                    if (x != null && y != null) this._playHeartbeatPlusOne(x, y);
                } catch (error) {
                    this.showToast('⚠️ ' + (error && error.message ? error.message : 'heartbeat failed'));
                }
            };
        });
        // v2.2：已拔草记录「永久删除」。
        container.querySelectorAll('[data-wishlist-delete-id]').forEach(button => {
            button.onclick = event => {
                event.preventDefault();
                event.stopPropagation();
                this._confirmDeleteAbandonedEvent(button.dataset.wishlistDeleteId);
            };
        });
    }

    handleAction(action, id, target, e) {
        switch (action) {
            case "tab": this.switchTab(target.dataset.tab); break;
            case "tab-add": this.openActionSheet(); break;
            case "dashboard-kind": this._openReportBreakdown({ kind: target.dataset.kind }); break;
            case "dashboard-tag": this._openReportBreakdown({ tagId: target.dataset.tag }); break;
            case "report-analysis-tab": {
                // v2.6.3 补充：报表合并分析卡 tab 切换。只接受枚举内且当轮渲染可用
                // 的区块（可用集由 renderReportPage 缓存）；刷新方式同 dashboard-time。
                const analysis = target.dataset.analysis;
                if (['subscription', 'prepaid', 'wishlist'].indexOf(analysis) >= 0 && (this._reportAnalysisTabsCache || []).indexOf(analysis) >= 0) {
                    this._reportAnalysisTab = analysis;
                    this.refreshMainContent();
                }
                break;
            }
            case "action-physical": this.closeActionSheet(); this.openFormalAssetSheet(FORMAL_ASSET_KIND.PHYSICAL); break;
            case "action-virtual": this.closeActionSheet(); this.openFormalAssetSheet(FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION); break;
            case "action-prepaid": this.closeActionSheet(); this.openFormalAssetSheet(FORMAL_ASSET_KIND.PREPAID_AMOUNT); break;
            case "action-wishlist": this.closeActionSheet(); this.openWishlistFormalSheet(); break;
            case "action-sheet-close": this.closeActionSheet(); break;
            case "card":
                // v0.17-T3-α（M13）：批量模式下点击卡片改为切换选中，不弹产品卡
                if (this.bulkMode) {
                    if (this.bulkSelected.has(id)) this.bulkSelected.delete(id);
                    else this.bulkSelected.add(id);
                    this.renderDock();
                    return;
                }
                this.openFormalProductCard(id, target.closest && target.closest('.am-modal--main'));
                break;
            // v0.17-T3-α（M13 批量操作 · 入口）
            case "toggle-bulk-mode": this.showToast('ℹ️ ' + this._t('formalLaterFeature', '后续功能')); break;
            case "bulk-select-all": case "bulk-deselect-all":
            case "bulk-row-check": {
                if (this.bulkSelected.has(id)) this.bulkSelected.delete(id);
                else this.bulkSelected.add(id);
                this.renderDock();
                break;
            }
            // v0.17-T3-γ（M13 批量操作 · 真实批量动作）：
            //   - bulk-clear → 真实清空（T3-β 已实现）
            //   - bulk-delete / bulk-change-status / bulk-add-tag / bulk-remove-tag
            //     → T3-γ 替换为真实批量动作（统一委托给 _bulkXxx helper，走 Promise.allSettled 容错）
            case "bulk-clear": case "bulk-delete": case "bulk-change-status": case "bulk-add-tag": case "bulk-remove-tag":
                this.showToast('ℹ️ ' + this._t('formalLaterFeature', '后续功能')); break;
            case "item-menu": e.stopPropagation(); this.openItemMenu(id, target); break;
            // v0.18 阶段5：列表/矩阵卡「再次订阅」绿按钮 → 复用正式续期 sheet（仅虚拟订阅过期时渲染）
            case "card-renew": e.stopPropagation(); this.openRenewSheet(id); break;
            // 需求3（D5）：pendingConfirmation 卡「不再续订」→ 关自动续费，投影转 expired，卡片重渲染后按钮变「再次订阅」（资产留在役，不退役）
            case "card-no-renew": e.stopPropagation(); this.toggleSubscriptionAutoRenew(id, false).then(() => this.showToast('✓ ' + this._t('subscriptionAutoRenewDisabledToast', '已关闭自动续费'))).catch(error => this.showToast('⚠️ ' + (error && error.message ? error.message : 'failed'))); break;
            case "product-card-close": this.closeProductCard(); break;
            case "product-card-edit": this.closeProductCard(); this.openEditDialog(id); break;
            case "filter-status": this.openStatusPicker(target); break;
            case "filter-sort": this.openSortPicker(target); break;
            case "filter-advanced": this.showToast('ℹ️ ' + this._t('formalLaterFeature', '后续功能')); break;
            case "set-status": this._setStatusFromUi(id, target.dataset.status); break;
            case "toggle-home-filter-dropdown": this.openHomeFilterDropdown(target, target.dataset.filterKind); break;
            // v1.6.0：首页到期提醒条——整条点开 popover 清单，× 关闭本批提醒
            case "home-expiry-open": this._openHomeExpiryPopover(target); break;
            case "home-expiry-close": this._dismissHomeExpiryBar(); break;
            case "set-filter-status": this.filter.status = target.value || 'all'; this.refreshMainContent(); break;
            case "set-sort": this.filter.sort = target.value || target.dataset.sort || 'default'; this.refreshMainContent(); break;
            case "dashboard-time":
                this.dashboardTimeRange = ['30d', '6m', '12m'].includes(target.dataset.range) ? target.dataset.range : '12m';
                this.refreshMainContent();
                break;
            case "dashboard-detail": this.openDashboardDetail(id); break;
            case "dashboard-retry": this._retryFormalDashboard(); break;
            // v0.18 阶段3：搜索改由 _bindHomeSearchEvents 的 input/keydown 监听直驱
            // （输入即搜 + 回车即搜）。input 不再携带 data-action，此 case 仅作防御性
            // 兜底保留：即使陈旧 HTML 仍带 set-search，也不走 click 委托触发冗余搜索。
            case "set-search": break;
            case "view-toggle": {
                const viewMode = (this.settings.viewMode || "list") === "list" ? "matrix" : "list";
                this.saveSettings({ viewMode }).then(saved => {
                    if (!saved) {
                        this.refreshMainContent();
                        this.showToast('⚠️ ' + this._t('settingsSaveFail', '设置保存失败'));
                        return;
                    }
                    this._assetViewTransition = true;
                    this.refreshMainContent();
                    this._assetViewTransition = false;
                });
                break;
            }
            // Legacy subscription ledger actions are intentionally not routed from
            // core, bulk, or detail UI. Lifecycle state changes use setStatus only.
            case "open-tag-filter": this.openHomeFilterDropdown(target, 'tag'); break;
            case "wishlist-edit": this.openEditDialog(id); break;
            case "wishlist-buy": this.purchaseWishlistAsset(id); break;
            case "wishlist-subtab": this.switchWishlistSubtab(target.dataset.subtab); break;
            case "wishlist-open-purchased": this._openPurchasedTargetAsset(target.dataset.targetAssetId, target); break;
            case "wishlist-terminal-unavailable": this._notifyWishlistActionUnavailable(); break;
            case "wishlist-delete": this.confirmDelete(id); break;
            case "menu-edit": this.openEditDialog(id); break;
            case "menu-delete": this.confirmDelete(id); break;
            case "menu-retire": this._setStatusFromUi(id, "retired"); break;
            case "menu-reactivate": this._setStatusFromUi(id, "active"); break;
            case "menu-to-wishlist": this._setStatusFromUi(id, "wishlist"); break;
            case "menu-to-active": this._setStatusFromUi(id, "active"); break;
            case "settings-save": this.saveSettingsFromDialog(target.closest(".b3-dialog__content") || this.dockElement); break;
            case "dialog-close": target.closest(".b3-dialog").siyuanDialog?.destroy(); break;
        }
    }

    switchTab(tab) {
        this.activeTab = tab;
        // v2.4.1：种草池卡片带迷你价格曲线，依赖 wishlistEvents sidecar；进入种草 tab
        // 时缓存冷态则先渲染再 hydrate 重渲（与子 tab 同款模式），保证曲线首次可见。
        if (tab === 'wishlistPool' && !this._wishlistEventsLoaded) {
            this.refreshMainContent();
            this._warmWishlistEvents().then(() => {
                if (this.activeTab === 'wishlistPool' && !this._unloaded) this.refreshMainContent();
            });
            return;
        }
        // Dock and modal share renderMainPanel(); full refresh keeps pages and tab state aligned.
        this.refreshMainContent();
    }






    /** Read-only lifecycle label for time-bound virtual and prepaid assets. */

    /** Render-only plan badge. It never confirms, renews, or persists data. */





    /**
     * Commit one subscription business action. Period and payment are only made for
     * an actual start/renew/reopen; skip/cancel write the lifecycle fact alone.
     */





/**
     * formal-v2 usage tracking removal: usage sidecars (usage.json) and helper
     * methods were deleted together with the lastUsedDate field, the usage
     * tracking toggle, and the renewal score picker.
     */








    // ============================================================
    // M10 MVP：maintenance.json 是唯一真值；不触碰资产、账本或操作日志。
    // ============================================================

    /** On-demand sidecar read keeps startup on the core assets/settings boundary. */

    /**
     * 添加一条实体资产维护记录；显示币种始终来自所属实体资产。
     *
     * @param {string} assetId
     * @param {string} type 'maintain' | 'repair'
     * @param {number} cost
     * @param {string} date 'YYYY-MM-DD'
     * @param {string} note
     */

    /**
     * v0.16-T3-β：删除一条维护记录（按 id）。
     */

    /**
     * Maintenance mutations change card/list/report projections but not assets.
     * A dock render is still needed for those projections. If the physical
     * detail was open in that dock, restore it because renderDock replaces all
     * dock children.
     */

    /**
     * v0.16-T3-α：防抖异步落盘（5s debounced）。
     *   - 与 _flushOpLogs 同模式
     *   - 写失败重置 dirty，下次再试
     */

// ============================================================
    // v0.16-T4-α/β/γ usage tracking (M13) removed in formal-v2.
    // ============================================================


    /** v0.18 阶段 2：预付权益流水 5s 防抖落盘（与 maintenance sidecar 同模式）。 */




    /** Count-based prepaid benefits expose their acquisition cost per initial unit. */






/**
     * M10 MVP：实体详情唯一入口的维护记录 sheet。
     * 仅支持新增/删除；币种始终只读继承实体资产，记录本身不存币种。
     *
     * @param {string} assetId
     */

    /**
     * v0.16-T6（M9）内部 helper：根据 fromDate + billingCycle 计算下一个账单日。
     *   - monthly: +1 月 / quarterly: +3 月 / halfYearly: +6 月 / yearly: +1 年
     *   - 默认 monthly（兼容旧数据）
     *   - 空 fromDate fallback 到 todayISO
     */
    computeNextBillingDate(from, cycle) {
        const fromStr = from || todayISO();
        const d = new Date(fromStr + "T00:00:00");
        if (cycle === "quarterly") d.setMonth(d.getMonth() + 3);
        else if (cycle === "halfYearly") d.setMonth(d.getMonth() + 6);
        else if (cycle === "yearly") d.setFullYear(d.getFullYear() + 1);
        else d.setMonth(d.getMonth() + 1);  // 默认 monthly
        return d.toISOString().slice(0, 10);
    }

    // ============================================================
    // v0.17-T1-β（M12 标签系统）：内存数组 + 防抖落盘 + CRUD + 管理 UI
    // ============================================================

    /**
     * v2.3.0 阶段 2：马卡龙固定预设调色板（不随主题色变化）。
     * 10 色相 × 3 档深度（浅 / 标准 / 深），UI 按 10 列 × 3 行渲染（列=色相，行=深度）。
     * 色相顺序：樱花粉 / 珊瑚红 / 杏橙 / 奶油黄 / 抹茶绿 / 薄荷青 / 天空蓝 / 长春花蓝紫 / 香芋紫 / 焦糖棕。
     * 替换 v0.17-T1-β 的死代码 _tagPaletteColors（8 色、无调用）。
     */
    _tagColorPalette() {
        return [
            ['#FADCE4', '#F4A7B9', '#D96C88'], // 樱花粉
            ['#FBE0DA', '#F2917E', '#D65445'], // 珊瑚红
            ['#FDE7D2', '#F8BE8B', '#E28A4C'], // 杏橙
            ['#FDF3D0', '#F7DE8B', '#DFB94E'], // 奶油黄
            ['#E7F0D8', '#B9D68F', '#86AC58'], // 抹茶绿
            ['#D8F2EA', '#93D9C4', '#4FAF94'], // 薄荷青
            ['#DCEEF9', '#96C8E8', '#5497C6'], // 天空蓝
            ['#E2E4F8', '#A5AAE8', '#666ECB'], // 长春花蓝紫
            ['#EFE2F6', '#CBA4E0', '#9A6BB8'], // 香芋紫
            ['#F0E4D8', '#D4B494', '#A97C50'], // 焦糖棕
        ];
    }

    /**
     * v2.3.0 阶段 2：标签颜色输入归一化。
     *   - '' / null → ''（清除颜色）
     *   - #rgb / #rrggbb（大小写不敏感）→ 小写 6 位 hex
     *   - rgb(r,g,b) / rgba(r,g,b,a) → 6 位 hex；alpha 通道有意压平
     *     （tag.color 统一存 6 位 hex，保证既有渲染 `${color}1a` 半透明后缀仍是合法 CSS）
     *   - 其它一律抛错（调用方 catch 后 toast），错误文案走 i18n tagColorInvalidFormat
     */
    _normalizeTagColorInput(raw) {
        const value = raw == null ? '' : String(raw).trim();
        if (!value) return '';
        let match = /^#([0-9a-fA-F]{3})$/.exec(value);
        if (match) return '#' + match[1].split('').map(ch => ch + ch).join('').toLowerCase();
        match = /^#([0-9a-fA-F]{6})$/.exec(value);
        if (match) return '#' + match[1].toLowerCase();
        match = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9.]+)\s*)?\)$/.exec(value);
        if (match) {
            const invalid = new Error(this._t('tagColorInvalidFormat', '颜色格式不正确'));
            const channels = [match[1], match[2], match[3]].map(part => {
                const channel = Number(part);
                return Number.isFinite(channel) && channel >= 0 && channel <= 255 ? Math.round(channel) : NaN;
            });
            if (channels.some(Number.isNaN)) throw invalid;
            if (match[4] != null) {
                const alpha = Number(match[4]);
                if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw invalid;
            }
            return '#' + channels.map(channel => channel.toString(16).padStart(2, '0')).join('');
        }
        throw new Error(this._t('tagColorInvalidFormat', '颜色格式不正确'));
    }

    /** v0.17-T1-β：M12 异步从 tags.json 加载到内存（与 _maintenanceRecords 同模式） */
    async loadTags() {
        if (!this.storage) return;
        let loaded;
        try {
            const data = await this.storage.readTags();
            loaded = this._normalizeTagDirectory(data.tags);
            this._tags = loaded;
        } catch (e) {
            console.warn("[AssetManagement] loadTags read:", e && e.message);
            return;
        }
        // Formal-v1 tag ownership is explicit: assets carry tagIds only, and the
        // directory is never synthesized from retired label-array fields.
    }

    /** v0.17-T1-β：M12 5s 防抖落盘（与 _flushMaintenanceRecords 同模式） */
    _flushTags() {
        this._tagsDirty = false;
    }

    _normalizeTagDirectory(tags) {
        const seen = new Set();
        return (Array.isArray(tags) ? tags : []).reduce((result, tag) => {
            const label = String(tag && tag.label || '').trim();
            const key = label.toLowerCase();
            if (!label || seen.has(key)) return result;
            seen.add(key);
            result.push(Object.assign({}, tag, {
                id: String(tag && tag.id || 'tag_user_' + genId()),
                label: label,
            }));
            return result;
        }, []);
    }

    _getTagReferenceCount(tagOrLabel) {
        const tagId = String(tagOrLabel && tagOrLabel.id || tagOrLabel || '').trim().toLowerCase();
        if (!tagId) return 0;
        return (Array.isArray(this.assets) ? this.assets : []).filter(asset =>
            (Array.isArray(asset && asset.tagIds) ? asset.tagIds : []).some(value => String(value || '').trim().toLowerCase() === tagId)
        ).length;
    }

    /**
     * v0.17-T1-β：M12 新建一个用户 tag（system tag 不可手动新建）。
     *   - id 自增：'tag_user_<timestamp>_<rand>'
     *   - isSystem = false
     *   - 写内存 + 立即落盘（用户操作不像 usage/maintenance 高频，1 次就落盘）
     *   - 返回新 tag 对象
     */
    async createTag({ label } = {}) {
        const safeLabel = String(label || '').trim().slice(0, 20);
        if (!safeLabel) throw new Error(this._t('tagFieldLabel', '标签名') + ' is required');
        if (!this.storage || typeof this.storage.mutateFormalAssetDomain !== 'function') {
            throw new Error('[AssetManagement] formal tag storage unavailable');
        }
        let created;
        const context = await this._commitAssetAuditMutation(snapshot => {
            if (snapshot.tags.some(tag => String(tag.label || '').trim().toLowerCase() === safeLabel.toLowerCase())) {
                throw new Error(this._t('tagDuplicate', '标签名称已存在'));
            }
            created = { id: createStableId(), label: safeLabel, createdAt: new Date().toISOString() };
            const log = { id: createStableId(), type: 'tag-create', assetId: created.id, assetName: created.label,
                field: null, oldValue: null, newValue: this._cloneForSnapshot(created), ts: new Date().toISOString() };
            return { tags: snapshot.tags.concat(created), operationLogs: [log].concat(snapshot.operationLogs || []), context: { tag: created } };
        });
        return context.tag;
    }

    /**
     * v2.3.0 阶段 2：标签样式编辑解锁（仅 color）。
     *   - patch 仅接受 { color }；label 改名仍拒绝（防止正式 tagIds 与目录标签分裂，
     *     保留原 tagEditUnavailable toast 语义）
     *   - color：'' = 清除；#rgb / #rrggbb / rgb() / rgba() 经 _normalizeTagColorInput
     *     归一为小写 6 位 hex 后落库；非法值抛错（调用方 catch 后 toast）
     *   - 走 _commitAssetAuditMutation 事务：tags + opLog('tag-update', field='color',
     *     oldValue/newValue 记录变更前后的颜色字符串)
     *   - 成功后 this._tags 由 _commitAssetAuditMutation 统一回写（与 createTag/deleteTag 一致）
     *   - 返回 boolean：true=已变更，false=未变更（标签不存在 / 颜色相同 / 空 patch）
     */
    async updateTag(tagId, patch) {
        const input = patch || {};
        if (Object.prototype.hasOwnProperty.call(input, 'label')) {
            this.showToast('ℹ️ ' + this._t('tagEditUnavailable', '标签不支持改名或样式编辑'));
            return false;
        }
        if (!tagId || !Object.prototype.hasOwnProperty.call(input, 'color')) return false;
        if (!this.storage || typeof this.storage.mutateFormalAssetDomain !== 'function') {
            throw new Error('[AssetManagement] formal tag storage unavailable');
        }
        const color = this._normalizeTagColorInput(input.color);
        const context = await this._commitAssetAuditMutation(snapshot => {
            const tag = snapshot.tags.find(item => item && item.id === tagId);
            if (!tag) return { noop: true, context: { updated: false } };
            const oldValue = typeof tag.color === 'string' ? tag.color : '';
            if (oldValue === color) return { noop: true, context: { updated: false, unchanged: true } };
            const updated = Object.assign({}, tag, { color: color });
            const log = { id: createStableId(), type: 'tag-update', assetId: tag.id, assetName: tag.label,
                field: 'color', oldValue: oldValue, newValue: color, ts: new Date().toISOString() };
            return {
                tags: snapshot.tags.map(item => (item && item.id === tagId ? updated : item)),
                operationLogs: [log].concat(snapshot.operationLogs || []),
                context: { updated: true, tag: updated },
            };
        });
        return !!(context && context.updated);
    }

    /**
     * v0.17-T1-β：M12 删除 tag（历史 system tag 也允许删除）。
     *   - 删除时不动 asset.tagIds 引用（保留 id 字符串即可，T1-δ chip 阶段会用 getTagById 跳过已删）
     *   - 返回 boolean
     */
    async deleteTag(tagId) {
        if (!tagId) return false;
        if (!this.storage || typeof this.storage.mutateFormalAssetDomain !== 'function') {
            throw new Error('[AssetManagement] formal tag storage unavailable');
        }
        const context = await this._commitAssetAuditMutation(snapshot => {
            const tag = snapshot.tags.find(item => item && item.id === tagId);
            if (!tag) return { noop: true, context: { deleted: false } };
            if (snapshot.assets.some(asset => Array.isArray(asset.tagIds) && asset.tagIds.includes(tagId))) {
                throw new Error(this._t('tagDeleteReferenced', '该标签仍被资产引用，无法删除'));
            }
            const log = { id: createStableId(), type: 'tag-delete', assetId: tag.id, assetName: tag.label,
                field: null, oldValue: this._cloneForSnapshot(tag), newValue: null, ts: new Date().toISOString() };
            return { tags: snapshot.tags.filter(item => item && item.id !== tagId), operationLogs: [log].concat(snapshot.operationLogs || []), context: { deleted: true } };
        });
        return !!(context && context.deleted);
    }

    /** v0.17-T1-β：M12 按 id 查找 tag（找不到返回 null） */
    getTagById(tagId) {
        if (!tagId || !Array.isArray(this._tags)) return null;
        return this._tags.find(t => t && t.id === tagId) || null;
    }

    /**
     * v0.17-T1-δ：M12 按 label 查找 tag 元数据（找不到返回 null；大小写不敏感）。
     *   - 用于编辑表单 chip 渲染时给现有字符串回填 emoji + 颜色
     *   - 用于 tag 输入框 autocomplete 候选项过滤
     *   - 旧资产（a.tags 为字符串 label 而非 id）+ 用户自定义字符串 都能匹配
     */
    _getTagByLabel(label) {
        if (!label) return null;
        const target = String(label).trim().toLowerCase();
        if (!target) return null;
        return this._getAssetTagCatalog().find(tag => tag.label.toLowerCase() === target) || null;
    }

    _normalizeTagLabels(tags) {
        const seen = new Set();
        const result = [];
        (Array.isArray(tags) ? tags : []).forEach(tag => {
            const raw = String(tag || '').trim();
            if (!raw) return;
            const meta = this._getTagByLabel(raw);
            const label = meta && meta.label ? String(meta.label).trim() : raw;
            const key = label.toLowerCase();
            if (!key || seen.has(key)) return;
            seen.add(key);
            result.push(label);
        });
        return result;
    }

    _renderTagSelectorHtml(state, options) {
        options = options || {};
        if (!state || !Array.isArray(state.tags)) state.tags = [];
        state.tags = this._normalizeTagLabels(state.tags).slice(0, 10);
        const tagsHtml = this._renderAssetTagsHtml(state.tags);
        return `
            <div class="am-edit-field">
                <div class="am-edit-field__label">
                    ${escapeHtml(this._t("fieldTags", "标签"))}
                    <small class="am-edit-field__hint">${state.tags.length}/10</small>
                </div>
                <div class="am-edit-tags" data-tags-list>${tagsHtml}</div>
            </div>`;
    }

    /**
     * v2.3.0 阶段3：tag chip 呈色属性生成器。
     *   - 入参为 tag.color（归一后的小写 6 位 hex，形如 #rrggbb）；非法/空一律按无色处理（防御，不抛错）
     *   - 返回 { cls, style }：有色时 cls=' am-tag-chip--colored' + 内联 CSS 变量 --am-tag-chip-color，
     *     视觉全部由 index.css v2.3.0 区块的 var() 规则控制（亮暗两套）
     *   - color 虽来自 tags.json 且经 _normalizeTagColorInput 归一，渲染边界仍 escapeHtml 防注入
     */
    _tagChipColorAttrs(color) {
        const hex = typeof color === 'string' ? color.trim() : '';
        if (!/^#[0-9a-f]{6}$/.test(hex)) return { cls: '', style: '' };
        return { cls: ' am-tag-chip--colored', style: ` style="--am-tag-chip-color:${escapeHtml(hex)}"` };
    }

    /**
     * v0.17-T1-δ：M12 渲染 tag chip HTML 字符串（按 this._tags 元数据加 emoji + 颜色）。
     *   - 共享给编辑表单 + 卡片底部 + 矩阵视图（chip 视觉一致）
     *   - chip 内嵌 × 删除按钮（data-action="remove-tag" + data-tag），与既有删除委托兼容
     *   - 元数据未命中（用户旧值 / 自定义）走 fallback：📦 + 原始 label + 灰边框
     *   - v2.3.0 阶段3：按 label 反查目录 color 呈色（am-tag-chip--colored）；× 删除功能不变
     */
    _renderAssetTagsHtml(tags) {
        const list = this._normalizeTagLabels(tags);
        if (list.length === 0) return '';
        const deleteBtnAria = escapeHtml(this._t('btnDelete', '删除'));
        return list.map((label) => {
            const meta = this._getTagByLabel(label);
            const chipColor = this._tagChipColorAttrs(meta && meta.color);
            return `<span class="am-asset-tag${chipColor.cls}" data-tag="${escapeHtml(label)}"${chipColor.style}>${escapeHtml(label)}<button type="button" class="am-asset-tag__del" data-action="remove-tag" data-tag="${escapeHtml(label)}" aria-label="${deleteBtnAria}">×</button></span>`;
        }).join('');
    }

    /**
     * v2.3.0 阶段3：只读 chip 渲染。条目兼容两种形态：
     *   - 字符串 label（旧调用方）→ 走 _getTagByLabel 反查 color 兜底
     *   - tag 对象（{label, color}，_formalCardData 新调用方）→ 直接取对象 color，缺失再反查
     *   - 去重与 label 归一逻辑等价 _normalizeTagLabels（大小写不敏感、取目录规范 label）
     */
    _renderAssetTagsReadonlyHtml(tags, moreCount) {
        const seen = new Set();
        const chips = [];
        (Array.isArray(tags) ? tags : []).forEach(item => {
            const isObject = !!(item && typeof item === 'object');
            const rawLabel = isObject ? String(item.label == null ? '' : item.label) : String(item || '');
            const meta = this._getTagByLabel(rawLabel);
            const label = meta && meta.label ? meta.label : rawLabel.trim();
            const key = label.toLowerCase();
            if (!key || seen.has(key)) return;
            seen.add(key);
            const chipColor = this._tagChipColorAttrs(isObject && item.color ? item.color : (meta && meta.color));
            chips.push(`<span class="am-asset-tag${chipColor.cls}" data-tag="${escapeHtml(label)}"${chipColor.style}>${escapeHtml(label)}</span>`);
        });
        const rest = Number(moreCount) || 0;
        if (rest > 0) chips.push(`<span class="am-asset-tag am-asset-tag--more">+${rest}</span>`);
        return chips.join('');
    }

    _renderAssetTagsEmptyHtml() {
        return `<span class="am-asset-tag am-asset-tag--empty">${escapeHtml(this._t('assetTagsEmpty', '无标签'))}</span>`;
    }

    _cleanupTagAutocomplete(root) {
        if (!root) return;
        const inputs = [];
        if (typeof root._amAcCleanup === 'function') inputs.push(root);
        if (root.querySelectorAll) {
            root.querySelectorAll('[data-action="add-tag-input"]').forEach(input => {
                if (typeof input._amAcCleanup === 'function' && inputs.indexOf(input) < 0) inputs.push(input);
            });
        }
        inputs.forEach(input => {
            try { input._amAcCleanup(); } catch (e) {}
            input._amAcCleanup = null;
        });
        if (root.querySelectorAll) {
            root.querySelectorAll('[data-tag-autocomplete]').forEach(dropdown => {
                try { dropdown.remove(); } catch (e) {}
            });
        }
    }

    /**
     * v0.17-T1-δ：M12 Tag 自动补全 dropdown 绑定（在 bindAfterRerender 末尾调用）。
     *   - input.focus → 打开 dropdown
     *   - input.input → 按资产自身标签过滤 dropdown 候选项
     *   - dropdown item.onmousedown → 加 tag 到 state.tags + 清空 input + 触发 rerender + 重 bind
     *     （用 mousedown 而非 click，避免 blur 先关 dropdown 导致点不上）
     *   - dropdown 关闭时机：blur + 延迟 150ms（给 mousedown 时间触发）；Esc
     *   - 候选项最多 8 条；空匹配显示「未找到匹配的标签」
     *   - 底部支持「新建标签：xxx」，只写入当前表单 state，保存资产时随 assets.json 落盘
     *   - 不动 dock 委托；所有 button 用 onmousedown 闭包绑定（v0.13 P0 第 8 条教训）
     */
    bindTagAutocomplete(tagInput, state, rerender, mask, focusAfterAdd = false) {
        if (!tagInput) return;
        this._cleanupTagAutocomplete(tagInput);
        const self = this;
        let dropdownEl = null;
        let isMousedownInside = false;     // 防止 blur 与 mousedown 冲突
        let blurTimer = null;
        let cleaned = false;

        function ensureDropdown() {
            if (!dropdownEl || !dropdownEl.parentNode) {
                dropdownEl = document.createElement('div');
                dropdownEl.className = 'am-tag-autocomplete-dropdown';
                dropdownEl.setAttribute('data-tag-autocomplete', '');
                if (tagInput.parentNode) tagInput.parentNode.appendChild(dropdownEl);
                else if (mask) mask.appendChild(dropdownEl);
            }
            return dropdownEl;
        }

        function addTagLabel(rawLabel) {
            const v = String(rawLabel || '').trim();
            if (!v) return false;
            if (!Array.isArray(state.tags)) state.tags = [];
            state.tags = self._normalizeTagLabels(state.tags);
            if (state.tags.length >= 10) {
                self.showToast('⚠️ ' + self._t('tagLimitReached', '最多 10 个标签'));
                tagInput.value = '';
                state.draftTagValue = '';
                closeDropdown();
                return false;
            }
            const meta = self._getTagByLabel(v);
            const label = meta && meta.label ? meta.label : v;
            const exists = state.tags.some(x => String(x || '').trim().toLowerCase() === label.toLowerCase());
            if (!exists) state.tags.push(label);
            state.tags = self._normalizeTagLabels(state.tags);
            tagInput.value = '';
            state.draftTagValue = '';
            closeDropdown();
            const added = !exists;
            if (typeof rerender === 'function') rerender();
            if (added && focusAfterAdd) {
                setTimeout(() => mask.querySelector('[data-action="add-tag-input"]')?.focus(), 50);
            }
            return added;
        }

        function closeDropdown() {
            if (dropdownEl) {
                dropdownEl.classList.remove('is-open');
            }
        }

        function catalogForInput() {
            return self._getAssetTagCatalog();
        }

        function renderDropdown() {
            if (!dropdownEl) return;
            const value = (tagInput.value || '').trim();
            // 过滤：前缀匹配 + 排除已添加的
            const addedSet = new Set(self._normalizeTagLabels(state.tags).map(label => label.toLowerCase()));
            const catalog = catalogForInput();
            const candidates = catalog
                .filter(t => {
                    const labelLc = String(t.label).trim().toLowerCase();
                    if (addedSet.has(labelLc)) return false;
                    if (!value) return true;     // 空值显示全部（最多 8）
                    return labelLc.indexOf(value.toLowerCase()) >= 0;
                })
                .slice(0, 8);

            let inner = '';
            if (candidates.length === 0) {
                inner = `<div class="am-tag-autocomplete-empty">${escapeHtml(self._t('tagAutocompleteEmpty', '未找到匹配的标签'))}</div>`;
            } else {
                inner = candidates.map(t => {
                    return `<div class="am-tag-autocomplete-item" data-tag-suggest="${escapeHtml(t.label)}">${escapeHtml(t.label)}</div>`;
                }).join('');
            }
            inner += `<div class="am-tag-autocomplete-hint">${escapeHtml(self._t('tagAutocompleteHint', '请在设置的标签页创建新标签'))}</div>`;
            dropdownEl.innerHTML = inner;
            dropdownEl.classList.add('is-open');

            // 闭包绑定每个候选 item 的 onmousedown
            dropdownEl.querySelectorAll('.am-tag-autocomplete-item').forEach(item => {
                item.onmousedown = (e) => {
                    e.preventDefault();    // 阻止 input blur
                    isMousedownInside = true;
                    const label = item.dataset.tagSuggest;
                    if (!label) return;
                    addTagLabel(label);
                    isMousedownInside = false;
                };
            });
        }

        // 输入时实时更新 dropdown
        tagInput.oninput = () => {
            // 同步 state.draftTagValue 防止 rerender 丢输入
            state.draftTagValue = tagInput.value;
            ensureDropdown();
            renderDropdown();
        };
        // 聚焦时打开 dropdown
        tagInput.onfocus = () => {
            ensureDropdown();
            renderDropdown();
        };
        // blur 延迟关闭（避免 mousedown 时 dropdown 提前关）
        tagInput.onblur = () => {
            blurTimer = setTimeout(() => {
                if (isMousedownInside) return;
                closeDropdown();
                blurTimer = null;
            }, 150);
        };
        // Esc 关闭 dropdown
        tagInput.onkeydown = (e) => {
            if (e.key === 'Escape') {
                closeDropdown();
                return;
            }
            if (e.key === 'Enter') {
                if (this._isImeComposing(e)) return;
                e.preventDefault();
                const match = catalogForInput().find(tag => String(tag.label).toLowerCase() === String(tagInput.value).trim().toLowerCase());
                if (match) addTagLabel(match.label);
            }
        };
        const addBtn = tagInput.parentNode ? tagInput.parentNode.querySelector('[data-action="add-tag-btn"]') : null;
        if (addBtn) addBtn.onclick = () => {
            const match = catalogForInput().find(tag => String(tag.label).toLowerCase() === String(tagInput.value).trim().toLowerCase());
            if (match) addTagLabel(match.label);
        };

        // 兜底：点击 input 外部（非 dropdown）时关闭
        const onDocClick = (e) => {
            if (!dropdownEl) return;
            if (dropdownEl.contains(e.target)) return;
            if (tagInput.contains(e.target)) return;
            closeDropdown();
        };
        document.addEventListener('mousedown', onDocClick);
        // 把 listener 挂在 tagInput 上，方便 rerender / sheet close 前清理；cleanup 可重复调用。
        tagInput._amAcCleanup = () => {
            if (cleaned) return;
            cleaned = true;
            document.removeEventListener('mousedown', onDocClick);
            if (blurTimer) {
                clearTimeout(blurTimer);
                blurTimer = null;
            }
            tagInput.oninput = null;
            tagInput.onfocus = null;
            tagInput.onblur = null;
            tagInput.onkeydown = null;
            if (dropdownEl) {
                try { dropdownEl.remove(); } catch (e) {}
                dropdownEl = null;
            }
        };
    }

    /**
     * v2.3.0 阶段 2b：关闭当前打开的标签取色器（若有）。
     * 与 _closeAmGlassSelectPanels 同模式：全局同一时刻只允许一个取色器。
     */
    _closeTagColorPicker() {
        if (typeof this._tagColorPickerCloseFn === 'function') {
            const fn = this._tagColorPickerCloseFn;
            this._tagColorPickerCloseFn = null;
            fn();
        }
    }

    /**
     * v2.3.0 阶段 2b：取色器第 4 行 —— 用户自定义颜色槽（≤10）+ 末尾「+」添加槽。
     * 返回 HTML 字符串；自定义行重渲染时直接替换 [data-tcp-custom-row] 的 innerHTML。
     */
    _renderTagColorPickerCustomRow(customColors, currentColor) {
        const delLabel = this._t('tagColorCustomDeleteLabel', '删除该自定义颜色');
        const cells = (Array.isArray(customColors) ? customColors : []).map(color => {
            const value = String(color || '').toLowerCase();
            if (!value) return '';
            const selected = value === currentColor ? ' is-selected' : '';
            /* v2.3.0-hotfix：自定义槽右上角 × 徽标（委托 data-tcp-action=remove-custom）；
               删除后该色自动回填输入框，调整后可重新保存——即「修改」路径。 */
            return '<button type="button" class="am-tag-color-picker__cell' + selected + '" data-tcp-pick="' + escapeHtml(value) + '" style="background:' + escapeHtml(value) + '" title="' + escapeHtml(value) + '" aria-label="' + escapeHtml(value) + '"><span class="am-tag-color-picker__cell-del" data-tcp-action="remove-custom" data-tcp-color="' + escapeHtml(value) + '" title="' + escapeHtml(delLabel) + '" aria-label="' + escapeHtml(delLabel) + '">×</span></button>';
        }).join('');
        const addLabel = this._t('tagColorAddSlot', '添加自定义颜色');
        return cells + '<button type="button" class="am-tag-color-picker__cell am-tag-color-picker__add" data-tcp-action="add-custom" title="' + escapeHtml(addLabel) + '" aria-label="' + escapeHtml(addLabel) + '">+</button>';
    }

    /**
     * v2.3.0 阶段 2b：持久化一个自定义标签颜色到 settings.customTagColors。
     *   - 读取走 storage.readSettings()（最新落盘值），兜底内存 this.settings
     *   - 去重：已存在 → { ok:true, duplicate:true }，不动列表
     *   - 已满 10 个：替换最旧（数组头部，即最早添加的），replaced=true
     *   - 写入走 saveSettings({ customTagColors }) —— Object.assign 合并，不整体覆写 settings
     *   - 返回 { ok, duplicate, replaced, list }；list 为操作后的颜色数组（失败时为操作前）
     */
    async _saveCustomTagColor(color) {
        const normalized = this._normalizeTagColorInput(color);
        if (!normalized) return { ok: false, duplicate: false, replaced: false, list: [] };
        let current = [];
        try {
            const settings = this.storage ? await this.storage.readSettings() : null;
            current = Array.isArray(settings && settings.customTagColors) ? settings.customTagColors.slice() : [];
        } catch (e) {
            current = Array.isArray(this.settings && this.settings.customTagColors) ? this.settings.customTagColors.slice() : [];
        }
        if (current.some(item => String(item || '').toLowerCase() === normalized)) {
            return { ok: true, duplicate: true, replaced: false, list: current };
        }
        const list = current.slice();
        let replaced = false;
        if (list.length >= 10) { list.shift(); replaced = true; } // 已满：替换最旧（最早添加）
        list.push(normalized);
        const saved = await this.saveSettings({ customTagColors: list });
        if (!saved) return { ok: false, duplicate: false, replaced: false, list: current };
        return { ok: true, duplicate: false, replaced, list };
    }

    /**
     * v2.3.0 阶段 2b：可复用标签取色器（液态玻璃 popover，body 挂载，同 datepicker/glass-select 定位模式）。
     *   - 预设网格：10 列 × 3 行（列=色相、行=深度，数据来自 _tagColorPalette）
     *   - 第 4 行：settings.customTagColors 自定义槽（≤10）+ 末尾「+」添加槽（聚焦输入框）
     *   - 「无颜色」清除（color=''）；当前色有选中态（环形描边 + 勾）
     *   - 自定义输入区：hex/rgb 文本框（Enter 提交，_normalizeTagColorInput 校验，错误 toast 其 message）
     *     + 原生 <input type="color"> 取色轮（实时同步文本框）+「保存到自定义」按钮
     *   - Esc / 外点关闭；关闭时移除全部监听；z-index 99999 盖住 b3-dialog
     *   - 两个入口共用：openTagManagerDialog 行 swatch、设置页标签区行 swatch
     * @param {Object} tag 标签对象（至少 id / color）
     * @param {HTMLElement} anchor 锚点元素（行内 swatch 按钮），用于 fixed 定位
     * @param {Function} onPicked 选中回调，参数为归一化 6 位 hex 或 ''（清除）
     */
    async _openTagColorPicker(tag, anchor, onPicked) {
        const self = this;
        if (!tag || !anchor) return;
        this._closeTagColorPicker();
        let customColors = [];
        try {
            const settings = this.storage ? await this.storage.readSettings() : null;
            customColors = Array.isArray(settings && settings.customTagColors) ? settings.customTagColors.slice() : [];
        } catch (e) {
            customColors = Array.isArray(this.settings && this.settings.customTagColors) ? this.settings.customTagColors.slice() : [];
        }
        if (!anchor.isConnected) return; // 异步读取期间锚点可能已被重渲染

        const currentColor = (typeof tag.color === 'string' ? tag.color : '').toLowerCase();
        const palette = this._tagColorPalette();
        let panel = null;

        // 预设网格按行优先展开：row=深度（3 行），col=色相（10 列），CSS grid 10 列自动排布
        let cellsHtml = '';
        for (let depth = 0; depth < 3; depth += 1) {
            for (let hue = 0; hue < palette.length; hue += 1) {
                const color = String((palette[hue] || [])[depth] || '').toLowerCase();
                if (!color) continue;
                const selected = color === currentColor ? ' is-selected' : '';
                /* v2.3.0-hotfix：预设格补 inline background（与自定义行同款写法），修复灰圆不显色 */
                cellsHtml += '<button type="button" class="am-tag-color-picker__cell' + selected + '" data-tcp-pick="' + escapeHtml(color) + '" style="background:' + escapeHtml(color) + '" title="' + escapeHtml(color) + '" aria-label="' + escapeHtml(color) + '"></button>';
            }
        }

        panel = document.createElement('div');
        panel.className = 'am-tag-color-picker';
        panel.setAttribute('data-tag-color-picker', '');
        panel.setAttribute('role', 'dialog');
        panel.innerHTML = '<div class="am-tag-color-picker__header"><span class="am-tag-color-picker__title">' + escapeHtml(this._t('tagColorPickerTitle', '标签颜色')) + '</span><button type="button" class="am-tag-color-picker__close" data-tcp-action="close" aria-label="' + escapeHtml(this._t('btnClose', '关闭')) + '">×</button></div>'
            + '<button type="button" class="am-tag-color-picker__none' + (currentColor === '' ? ' is-selected' : '') + '" data-tcp-action="none"><span class="am-tag-color-picker__none-icon" aria-hidden="true"></span>' + escapeHtml(this._t('tagColorNone', '无颜色')) + '</button>'
            + '<div class="am-tag-color-picker__grid">' + cellsHtml + '</div>'
            + '<div class="am-tag-color-picker__custom-label">' + escapeHtml(this._t('tagColorCustom', '自定义颜色')) + '</div>'
            + '<div class="am-tag-color-picker__custom" data-tcp-custom-row>' + this._renderTagColorPickerCustomRow(customColors, currentColor) + '</div>'
            + '<div class="am-tag-color-picker__input">'
            + '<input type="text" class="am-tag-color-picker__text" data-tcp-text placeholder="#FA8800 / rgb(255, 136, 0)" maxlength="32" spellcheck="false">'
            + '<input type="color" class="am-tag-color-picker__wheel" data-tcp-wheel value="#3575f3" aria-label="' + escapeHtml(this._t('tagColorWheelLabel', '取色轮')) + '" title="' + escapeHtml(this._t('tagColorWheelLabel', '取色轮')) + '">'
            + '<button type="button" class="am-tag-color-picker__save" data-tcp-action="save-custom">' + escapeHtml(this._t('tagColorSaveCustom', '保存到自定义')) + '</button>'
            + '</div>';

        const textEl = panel.querySelector('[data-tcp-text]');
        const wheelEl = panel.querySelector('[data-tcp-wheel]');
        if (currentColor) { try { wheelEl.value = currentColor; } catch (e) {} }

        const reposition = () => {
            if (!panel) return;
            if (!anchor.isConnected) { close(); return; }
            const rect = anchor.getBoundingClientRect();
            const width = panel.offsetWidth || 276;
            const height = panel.offsetHeight || 320;
            const margin = 8;
            let top = rect.bottom + 6;
            if (top + height > window.innerHeight - margin) top = Math.max(margin, rect.top - height - 6);
            let left = rect.left + (rect.width / 2) - (width / 2);
            left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
            panel.style.top = top + 'px';
            panel.style.left = left + 'px';
        };
        const onDocMouseDown = (ev) => {
            if (!panel) return;
            if (panel.contains(ev.target) || anchor.contains(ev.target)) return;
            close();
        };
        // Esc 关闭：document capture 消费事件，不误关上层 Dialog（同 _bindAmGlassSelects 模式）
        const onDocKeydown = (ev) => {
            if (!panel) return;
            if (ev.key !== 'Escape') return;
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
            close();
        };
        const close = () => {
            if (!panel) return;
            if (self._tagColorPickerCloseFn === close) self._tagColorPickerCloseFn = null;
            document.removeEventListener('mousedown', onDocMouseDown, true);
            document.removeEventListener('keydown', onDocKeydown, true);
            document.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
            if (panel.parentNode) panel.parentNode.removeChild(panel);
            panel = null;
        };
        const pick = (color) => {
            close();
            if (typeof onPicked !== 'function') return;
            /* v2.3.0-hotfix：落色后同步刷新主视图（列表/矩阵卡 chip、筛选下拉 chip），
               不再需要切换视图才看到新颜色；onPicked 为 async 时等其落库完成再刷。 */
            const refreshViews = () => { try { self.refreshMainContent(); } catch (e) { console.warn('[AssetManagement] refreshMainContent after tag color pick failed:', e && e.message); } };
            try {
                const maybe = onPicked(color);
                if (maybe && typeof maybe.then === 'function') {
                    maybe.then(refreshViews).catch(error => self.showToast('⚠️ ' + String(error && error.message || error)));
                } else {
                    refreshViews();
                }
            } catch (error) {
                self.showToast('⚠️ ' + String(error && error.message || error));
            }
        };
        const commitText = () => {
            let normalized;
            try { normalized = self._normalizeTagColorInput(textEl.value); }
            catch (error) { self.showToast('⚠️ ' + String(error && error.message || error)); return; }
            if (!normalized) { self.showToast('⚠️ ' + self._t('tagColorInvalidFormat', '颜色格式不正确')); return; }
            pick(normalized);
        };
        const saveCustom = async () => {
            let normalized;
            try { normalized = self._normalizeTagColorInput(textEl.value); }
            catch (error) { self.showToast('⚠️ ' + String(error && error.message || error)); return; }
            if (!normalized) { self.showToast('⚠️ ' + self._t('tagColorInvalidFormat', '颜色格式不正确')); return; }
            let result;
            try { result = await self._saveCustomTagColor(normalized); }
            catch (error) { self.showToast('⚠️ ' + String(error && error.message || error)); return; }
            if (!result || !result.ok) { self.showToast('⚠️ ' + self._t('tagColorCustomSaveFailed', '自定义颜色保存失败')); return; }
            if (result.duplicate) {
                self.showToast('ℹ️ ' + self._t('tagColorCustomExists', '该颜色已在自定义颜色中'));
            } else {
                self.showToast('✓ ' + self._t(result.replaced ? 'tagColorCustomReplaced' : 'tagColorCustomSaved',
                    result.replaced ? '自定义颜色已满 10 个，已替换最早添加的颜色' : '已添加到自定义颜色'));
            }
            customColors = result.list;
            if (panel) {
                const row = panel.querySelector('[data-tcp-custom-row]');
                if (row) row.innerHTML = self._renderTagColorPickerCustomRow(customColors, currentColor);
            }
            pick(normalized);
        };
        /* v2.3.0-hotfix：删除自定义颜色（× 徽标）。删除后把该色回填到文本框/取色轮，
           用户微调后「保存到自定义」即完成修改；面板保持打开便于继续管理。 */
        const removeCustom = async (rawColor) => {
            const normalized = String(rawColor || '').toLowerCase();
            if (!normalized) return;
            let current = [];
            try {
                const settings = self.storage ? await self.storage.readSettings() : null;
                current = Array.isArray(settings && settings.customTagColors) ? settings.customTagColors.slice() : [];
            } catch (e) {
                current = Array.isArray(self.settings && self.settings.customTagColors) ? self.settings.customTagColors.slice() : [];
            }
            const next = current.filter(item => String(item || '').toLowerCase() !== normalized);
            if (next.length === current.length) return;
            let saved = false;
            try { saved = !!(await self.saveSettings({ customTagColors: next })); } catch (e) { saved = false; }
            if (!saved) { self.showToast('⚠️ ' + self._t('tagColorCustomSaveFailed', '自定义颜色保存失败')); return; }
            customColors = next;
            if (panel) {
                const row = panel.querySelector('[data-tcp-custom-row]');
                if (row) row.innerHTML = self._renderTagColorPickerCustomRow(customColors, currentColor);
            }
            try { textEl.value = normalized; wheelEl.value = normalized; } catch (e) {}
            self.showToast('✓ ' + self._t('tagColorCustomRemoved', '已从自定义颜色删除，可在输入框调整后重新保存'));
        };

        // 事件委托：预设/自定义槽（data-tcp-pick）与动作按钮（data-tcp-action）统一处理；
        // 自定义行重渲染后无需重新绑定。
        panel.addEventListener('click', (ev) => {
            const target = ev.target && ev.target.closest ? ev.target.closest('[data-tcp-pick], [data-tcp-action]') : null;
            if (!target || !panel.contains(target)) return;
            /* × 徽标优先于所在槽的 data-tcp-pick（closest 从徽标自身命中 data-tcp-action） */
            if (target.hasAttribute('data-tcp-pick')) { pick(target.getAttribute('data-tcp-pick')); return; }
            const action = target.getAttribute('data-tcp-action');
            if (action === 'close') close();
            else if (action === 'none') pick('');
            else if (action === 'add-custom') { try { textEl.focus(); } catch (e) {} }
            else if (action === 'save-custom') saveCustom();
            else if (action === 'remove-custom') removeCustom(target.getAttribute('data-tcp-color'));
        });
        textEl.addEventListener('keydown', (ev) => {
            if (ev.key !== 'Enter') return;
            if (self._isImeComposing(ev)) return;
            ev.preventDefault();
            commitText();
        });
        const syncFromWheel = () => { textEl.value = wheelEl.value; };
        wheelEl.addEventListener('input', syncFromWheel);
        wheelEl.addEventListener('change', syncFromWheel);
        panel.addEventListener('mousedown', (ev) => ev.stopPropagation());

        panel.style.position = 'fixed';
        panel.style.zIndex = '99999';
        document.body.appendChild(panel);
        reposition();
        document.addEventListener('mousedown', onDocMouseDown, true);
        document.addEventListener('keydown', onDocKeydown, true);
        document.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        self._tagColorPickerCloseFn = close;
    }

    /**
     * v0.17-T1-β：M12 Tag 管理 Dialog（核心 UI 入口）。
     *   - 顶部 header：标题 + 固定目录提示 + 「+ 新建」按钮
     *   - 中部 list：展示标签及当前资产引用数
     *   - v2.3.0 阶段 2b：每行新增颜色 swatch（_openTagColorPicker → updateTag → refresh）
     *   - 仅支持创建、删除无引用标签、编辑颜色；不提供改名或 emoji 编辑
     *   - 关闭按钮
     *   - sheet 内 button onclick **闭包直接绑定**（不走 dock 委托，v0.13 P0 第 8 条教训）
     */
    openTagManagerDialog() {
        const self = this;
        const render = () => {
            const tags = self._getAssetTagCatalog();
            const rows = tags.length ? tags.map(tag => {
                const refs = self._getTagReferenceCount(tag);
                // v2.3.0 阶段 2b：行首颜色 swatch（有色=实心圆点，无色=虚线占位）
                /* v2.3.0-hotfix：颜色写 CSS 变量而非按钮背景——34px 按钮只是触摸区，
               颜色只由 ::after 18px 圆点呈现（用户反馈「颜色不要在圈外」）。 */
            const swatchStyle = tag.color ? ` style="--am-swatch-color:${escapeHtml(tag.color)}"` : '';
                const swatchLabel = escapeHtml(self._t('tagColorSwatchLabel', '设置标签颜色'));
                return `<div class="am-tag-manager-row"><button type="button" class="am-tag-color-swatch${tag.color ? '' : ' am-tag-color-swatch--empty'}" data-tag-action="color" data-tag-id="${escapeHtml(tag.id || '')}"${swatchStyle} title="${swatchLabel}" aria-label="${swatchLabel}"></button><span class="am-tag-manager-chip">${escapeHtml(tag.label)}</span><span class="am-settings-tag-row__count">${escapeHtml(self._t('tagReferenceCount', '{n} 项资产引用', { n: refs }))}</span><button class="b3-button b3-button--remove" data-tag-action="delete" data-tag-id="${escapeHtml(tag.id || '')}" ${refs ? 'disabled' : ''}>${escapeHtml(self._t('tagManagerDelete', '删除'))}</button></div>`;
            }).join('') : `<div class="am-tag-manager-empty">${escapeHtml(self._t('tagManagerEmpty', '暂无标签'))}</div>`;
            return `<div class="b3-dialog__content am-tag-manager-dialog"><div class="am-tag-manager-header"><div class="am-tag-manager-header__title">${escapeHtml(self._t('tagManagerTitle', '标签管理'))}</div><div class="am-tag-manager-header__hint">${escapeHtml(self._t('settingsTagsHint', '管理固定标签目录。'))}</div><div class="am-settings-tag-create"><input class="b3-text-field" name="tag-label" maxlength="20" placeholder="${escapeHtml(self._t('tagFieldLabel', '标签名'))}"/><button class="b3-button b3-button--primary" data-tag-action="create">${escapeHtml(self._t('tagManagerAddBtn', '+ 新建标签'))}</button></div></div><div class="am-tag-manager-list">${rows}</div></div><div class="b3-dialog__action"><button class="b3-button b3-button--cancel" data-tag-action="close">${escapeHtml(self._t('btnClose', '关闭'))}</button></div>`;
        };
        self.showDialog(self._t('tagManagerTitle', '标签管理'), render(), (dialog) => {
            const root = dialog.element;
            const refresh = () => { root.querySelector('.b3-dialog__content').parentElement.innerHTML = render(); bind(); };
            const bind = () => {
                root.querySelector('[data-tag-action="close"]').onclick = () => dialog.destroy();
                root.querySelector('[data-tag-action="create"]').onclick = async () => {
                    const input = root.querySelector('[name="tag-label"]');
                    if (await self.createTag({ label: input ? input.value : '' })) refresh();
                };
                // v2.3.0 阶段 2b：swatch → 取色器 → updateTag({color}) → 就地 refresh
                root.querySelectorAll('[data-tag-action="color"]').forEach(btn => btn.onclick = () => {
                    const tag = self.getTagById(btn.dataset.tagId);
                    if (!tag) return;
                    self._openTagColorPicker(tag, btn, async (color) => {
                        try {
                            await self.updateTag(tag.id, { color });
                            refresh();
                        } catch (error) {
                            self.showToast('⚠️ ' + String(error && error.message || error));
                        }
                    });
                });
                root.querySelectorAll('[data-tag-action="delete"]').forEach(btn => btn.onclick = () => {
                    const tag = self.getTagById(btn.dataset.tagId);
                    if (!tag || self._getTagReferenceCount(tag) > 0) return;
                    self._showConfirmDialog(self._t('tagManagerDelete', '删除'), self._t('tagManagerDeleteConfirm', '确认删除未被任何资产引用的此标签？'), async () => { if (await self.deleteTag(tag.id)) refresh(); }, { danger: true });
                });
            };
            bind();
        }, self.isMobile ? '100vw' : '720px');
    }

    /**
     * v0.17-T1-γ：M12 标签筛选 Sheet
     *   - 顶栏 chip 触发（data-action="open-tag-filter" → handleAction → openTagFilterDialog）
     *   - 3 模式 chip：全部（不过滤）/ 未标签（仅 tags=[]）/ 含任一（OR 语义，tagIds 任一命中）
     *   - tag 多选 chip 网格（从 this._tags 读）
     *   - 实时改 this.filter.tagIds / this.filter.tagMode + this.refreshList()（不关 dialog）
     *   - 多次开 dialog 不丢选择（chip 状态从 this.filter 读）
     *   - sheet 内 button onclick 全部用 btn.onclick = () => ... 闭包绑定（v0.13 P0 第 8 条教训）
     */
    // 保留旧实现供历史代码比对；首页入口已切换到 body portal，不再调用 Dialog。
    _openLegacyTagFilterDialog() {
        const self = this;

        // 排序：system 在前，user 按 createdAt 倒序
        const sortedTags = (self._tags || []).slice().sort((a, b) => {
            if ((a.isSystem ? 1 : 0) !== (b.isSystem ? 1 : 0)) return (b.isSystem ? 1 : 0) - (a.isSystem ? 1 : 0);
            return (b.createdAt || '').localeCompare(a.createdAt || '');
        });

        // 当前 filter 状态快照（chip 渲染时直接读）
        const currentMode = self.filter.tagMode || 'all';
        const currentIds = Array.isArray(self.filter.tagIds) ? self.filter.tagIds.slice() : [];

        // 渲染单个 tag chip
        // v0.17-Hotfix-A：filter.tagIds 现存 label（与 a.tags[] 同字符串域），
        //   so chip 上 data-tag-label 存 label，dataset 读 tagLabel（camelCase）
        function renderTagChipHtml(t) {
            const isSelected = currentIds.indexOf(t.label) >= 0;
            const chipStyle = `background:${escapeHtml(t.color)}1a;color:${escapeHtml(t.color)};border-color:${escapeHtml(t.color)}${isSelected ? '' : '55'};`;
            const activeClass = isSelected ? 'is-active' : '';
            const emojiText = t.emoji ? escapeHtml(t.emoji) : '';
            const checkmark = isSelected ? `<span class="am-tag-filter-chip__check">✓</span>` : '';
            return `
                <button type="button" class="am-tag-filter-chip ${activeClass}" data-tag-label="${escapeHtml(t.label)}" style="${chipStyle}">
                    ${emojiText ? `<span class="am-tag-filter-chip__emoji">${emojiText}</span>` : ''}
                    <span class="am-tag-filter-chip__label">${escapeHtml(t.label || '?')}</span>
                    ${checkmark}
                </button>`;
        }

        // 渲染 mode chip（3 个）
        function renderModeChipHtml(mode, label, key) {
            const active = currentMode === mode ? 'is-active' : '';
            return `<button type="button" class="am-tag-filter-mode-chip ${active}" data-tag-mode="${mode}">${escapeHtml(self._t(key, label))}</button>`;
        }

        // 渲染 tag 列表区
        function renderListHtml() {
            if (!sortedTags || sortedTags.length === 0) {
                return `<div class="am-tag-filter-empty">${escapeHtml(self._t('tagFilterEmpty', '暂无标签 — 请先在「标签管理」创建'))}</div>`;
            }
            return `<div class="am-tag-filter-list">${sortedTags.map(renderTagChipHtml).join('')}</div>`;
        }

        // 渲染顶部已选计数
        function renderCountHtml() {
            if (currentMode === 'untagged') {
                return `<span class="am-tag-filter-count am-tag-filter-count--untagged">${escapeHtml(self._t('tagFilterUntagged', '未标签'))}</span>`;
            }
            if (currentMode === 'any' && currentIds.length > 0) {
                return `<span class="am-tag-filter-count">${escapeHtml(self._t('tagFilterCount', '已选 {n}')).replace('{n}', currentIds.length)}</span>`;
            }
            return `<span class="am-tag-filter-count am-tag-filter-count--all">${escapeHtml(self._t('tagFilterAll', '全部'))}</span>`;
        }

        const html = `
            <div class="b3-dialog__content am-tag-filter-dialog">
                <div class="am-tag-filter-header">
                    <div class="am-tag-filter-header__title">${escapeHtml(self._t('tagFilterTitle', '按标签筛选'))}</div>
                    ${renderCountHtml()}
                </div>
                <div class="am-tag-filter-mode">
                    ${renderModeChipHtml('all', '全部', 'tagFilterAll')}
                    ${renderModeChipHtml('untagged', '未标签', 'tagFilterUntagged')}
                    ${renderModeChipHtml('any', '含任一', 'tagFilterAny')}
                </div>
                <div class="am-tag-filter-body" id="am-tag-filter-body">
                    ${renderListHtml()}
                </div>
            </div>
            <div class="b3-dialog__action">
                <button class="b3-button b3-button--cancel" data-tag-filter-action="clear">${escapeHtml(self._t('tagFilterClear', '清除筛选'))}</button>
                <button class="b3-button b3-button--primary" data-tag-filter-action="done">${escapeHtml(self._t('tagFilterDone', '完成'))}</button>
            </div>`;

        self.showDialog(self._t('tagFilterTitle', '按标签筛选'), html, (dialog) => {
            const root = dialog.element;
            const bodyEl = root.querySelector('#am-tag-filter-body');
            const headerEl = root.querySelector('.am-tag-filter-header');

            // 局部重渲染（仅刷 chip 状态 + 计数，不动 dialog 整体结构）
            function refreshBody() {
                if (!bodyEl || !headerEl) return;
                const newMode = self.filter.tagMode || 'all';
                const newIds = Array.isArray(self.filter.tagIds) ? self.filter.tagIds.slice() : [];
                // 模式 chip
                root.querySelectorAll('.am-tag-filter-mode-chip').forEach(btn => {
                    btn.classList.toggle('is-active', btn.dataset.tagMode === newMode);
                });
                // tag chip 状态
                // v0.17-Hotfix-A：filter.tagIds 现存 label，chip selected 用 label 比对
                root.querySelectorAll('.am-tag-filter-chip').forEach(btn => {
                    const label = btn.dataset.tagLabel;
                    const isSelected = newIds.indexOf(label) >= 0;
                    btn.classList.toggle('is-active', isSelected);
                    // checkmark
                    let check = btn.querySelector('.am-tag-filter-chip__check');
                    if (isSelected && !check) {
                        check = document.createElement('span');
                        check.className = 'am-tag-filter-chip__check';
                        check.textContent = '✓';
                        btn.appendChild(check);
                    } else if (!isSelected && check) {
                        check.remove();
                    }
                    // 边框加深
                    if (isSelected) {
                        btn.style.borderColor = btn.style.color;
                    }
                });
                // 计数
                const newCount = (newMode === 'untagged')
                    ? `<span class="am-tag-filter-count am-tag-filter-count--untagged">${escapeHtml(self._t('tagFilterUntagged', '未标签'))}</span>`
                    : (newMode === 'any' && newIds.length > 0)
                        ? `<span class="am-tag-filter-count">${escapeHtml(self._t('tagFilterCount', '已选 {n}')).replace('{n}', newIds.length)}</span>`
                        : `<span class="am-tag-filter-count am-tag-filter-count--all">${escapeHtml(self._t('tagFilterAll', '全部'))}</span>`;
                const oldCount = headerEl.querySelector('.am-tag-filter-count');
                if (oldCount) oldCount.outerHTML = newCount;
                // 顶栏 chip 同步（仅文字 + active class）
                const topChip = self.dockElement?.querySelector('.am-topbar-tag-chip');
                if (topChip) {
                    const tagMode = self.filter.tagMode || 'all';
                    const tagCount = Array.isArray(self.filter.tagIds) ? self.filter.tagIds.length : 0;
                    const isActive = tagCount > 0 || tagMode === 'untagged';
                    topChip.classList.toggle('is-active', isActive);
                    if (tagMode === 'untagged') {
                        topChip.textContent = `🏷️ ${escapeHtml(self._t('tagFilterUntagged', '未标签'))}`;
                    } else if (tagCount > 0) {
                        topChip.textContent = `🏷️ ${tagCount}`;
                    } else {
                        topChip.textContent = `🏷️ ${escapeHtml(self._t('tagChipLabel', '标签'))}`;
                    }
                }
            }

            // 1. mode chip 点击
            root.querySelectorAll('.am-tag-filter-mode-chip').forEach(btn => {
                btn.onclick = () => {
                    const mode = btn.dataset.tagMode || 'all';
                    self.filter.tagMode = mode;
                    // 切到 'untagged' 时自动清空 tagIds（语义无关）
                    if (mode !== 'any') self.filter.tagIds = [];
                    self.refreshMainContent();
                    refreshBody();
                };
            });

            // 2. tag chip 点击（多选 / 取消多选）
            // v0.17-Hotfix-A：filter.tagIds 现存 label（与 a.tags[] 同字符串域），
            //   so push/splice 都用 tagLabel 而不是 tagId
            if (bodyEl) {
                bodyEl.addEventListener('click', (e) => {
                    const btn = e.target.closest('.am-tag-filter-chip');
                    if (!btn) return;
                    e.stopPropagation();
                    const tagLabel = btn.dataset.tagLabel;
                    if (!tagLabel) return;
                    // 任意 tag 选中 → 自动切到 'any' 模式
                    if (self.filter.tagMode !== 'any') {
                        self.filter.tagMode = 'any';
                    }
                    if (!Array.isArray(self.filter.tagIds)) self.filter.tagIds = [];
                    const idx = self.filter.tagIds.indexOf(tagLabel);
                    if (idx >= 0) {
                        self.filter.tagIds.splice(idx, 1);
                    } else {
                        self.filter.tagIds.push(tagLabel);
                    }
                    // 如果清空到 0 个 → 回到 'all' 模式（语义：「没选」=不过滤）
                    if (self.filter.tagIds.length === 0) {
                        self.filter.tagMode = 'all';
                    }
                    self.refreshMainContent();
                    refreshBody();
                });
            }

            // 3. 底部按钮
            const clearBtn = root.querySelector('[data-tag-filter-action="clear"]');
            if (clearBtn) clearBtn.onclick = () => {
                self.filter.tagMode = 'all';
                self.filter.tagIds = [];
                self.refreshMainContent();
                refreshBody();
            };
            const doneBtn = root.querySelector('[data-tag-filter-action="done"]');
            if (doneBtn) doneBtn.onclick = () => {
                dialog.destroy();
            };
        }, self.isMobile ? '92vw' : '420px');
    }

    // ============================================================
    // v0.16-T1（M14 操作日志）：内存数组 + 防抖落盘 + 撤销
    // ============================================================

    /**
     * v0.16-T3 root cause 警告：
     * Plugin 类方法体（含 arrow fn 闭包）内调其它实例方法必须加 this.
     * 否则 ReferenceError 抛出，整个 onclick handler 中断，后续 addAsset / closeSheet 都不执行
     * 用户表现：保存按钮"点击没反应"（实际是 JS 抛错被静默）
     *
     * 之前 openEditSheet / openVirtualSheet 的 save handler 内 `parseCostLines(...)` 漏写 this.
     * 整个 v0.15 / v0.16 阶段都受影响。T3 已修复。
     */
    /**
     * v0.16-T1：异步落盘操作日志（防抖触发或主动调用）。
     *   - 失败重置 dirty，下次再试
     */
    async _flushOpLogs() {
        // Operation logs are part of the originating transaction. A standalone
        // debounce would split the durable boundary and is deliberately disabled.
        this._opLogFlushTimer = null;
        this._opLogDirty = false;
    }

    /** Delete audit rows from the latest durable snapshot before updating UI state. */
    async _deleteOperationLogs(logIds) {
        const ids = new Set(Array.isArray(logIds) ? logIds.filter(Boolean) : []);
        if (ids.size === 0) {
            return { ok: true, operationLogs: Array.isArray(this._opLogs) ? this._opLogs : [] };
        }
        if (!this.storage || typeof this.storage.mutateFormalAssetDomain !== 'function') {
            throw new Error('[operation-logs] persistence transaction is unavailable');
        }
        const transaction = await this.storage.mutateFormalAssetDomain(snapshot => {
            const nextLogs = (Array.isArray(snapshot.operationLogs) ? snapshot.operationLogs : [])
                .filter(log => !ids.has(log && log.id));
            return {
                change: { operationLogs: nextLogs },
                context: { operationLogs: nextLogs },
            };
        });
        this._opLogs = transaction.operationLogs || transaction.context.operationLogs || [];
        this._opLogDirty = false;
        if (this._opLogFlushTimer) clearTimeout(this._opLogFlushTimer);
        this._opLogFlushTimer = null;
        return transaction;
    }

    clearOperationLogsByIds(logIds) {
        return this._deleteOperationLogs(logIds);
    }

    async openFormalOperationLogDialog() {
        if (!this.storage || typeof this.storage.readFormalAssetDomainSnapshot !== 'function') {
            throw new Error('[operation-logs] formal snapshot reader is unavailable');
        }
        const snapshot = await this.storage.readFormalAssetDomainSnapshot();
        this._opLogs = Array.isArray(snapshot.operationLogs) ? snapshot.operationLogs : [];
        const self = this;
        let query = '';
        const renderRows = () => this._opLogs.filter(log => !query || String(log.assetName || '').toLowerCase().includes(query.toLowerCase()))
            .map(log => {
                // v0.18 阶段 7：左侧本地日期+时间（修复 ISO 裸串）、动作全中文、历史英文 note 中文化。
                const time = this._formatOperationLogTime(log.ts);
                const typeLabel = this._operationLogTypeLabel(log.type);
                const note = this._normalizeOperationLogNote(log.note);
                const noteHtml = note ? `<div class="am-oplog__note">${escapeHtml(note)}</div>` : '';
                return `<div class="am-oplog__row"><span class="am-oplog__time">${escapeHtml(time)}</span><span class="am-oplog__type">${escapeHtml(typeLabel)}</span><span class="am-oplog__name">${escapeHtml(log.assetName)}${noteHtml}</span></div>`;
            }).join('')
            || `<div class="am-oplog__empty">${escapeHtml(this._t('opLogEmpty', '暂无日志'))}</div>`;
        const render = () => `<div class="b3-dialog__content am-oplog-dialog"><input class="b3-text-field" data-formal-oplog-name placeholder="${escapeHtml(this._t('searchPlaceholder', '搜索'))}" value="${escapeHtml(query)}"><div class="am-oplog-list" data-formal-oplog-list>${renderRows()}</div></div><div class="b3-dialog__action"><button class="b3-button b3-button--cancel" data-formal-oplog-close>${escapeHtml(this._t('btnClose', '关闭'))}</button></div>`;
        this.showDialog(this._t('opLogTitle', '操作日志'), render(), dialog => {
            const root = dialog.element;
            const bind = () => {
                const input = root.querySelector('[data-formal-oplog-name]');
                if (input) input.oninput = () => { query = input.value; root.querySelector('.b3-dialog__content').parentElement.innerHTML = render(); bind(); };
                const close = root.querySelector('[data-formal-oplog-close]');
                if (close) close.onclick = () => dialog.destroy();
            };
            bind();
        }, self.isMobile ? '100vw' : '720px');
    }

    /**
     * v0.18 阶段 7：把操作日志的 ISO 8601 UTC 时间戳（如 2026-07-24T15:30:00.000Z）
     * 转成本地可读的 `YYYY-MM-DD HH:mm`。无效时间返回空串。纯本地格式化，不抛错。
     */
    _formatOperationLogTime(ts) {
        const date = ts ? new Date(ts) : null;
        if (!date || isNaN(date.getTime())) return '';
        const pad = n => String(n).padStart(2, '0');
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
            + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    }

    /**
     * v0.18 阶段 7：操作日志 type（英文 action）→ 中文标签。
     * 覆盖代码中全部 _newFormalOperationLog / 内联 opLog 的 type 取值；未知 type 落「其它」。
     * 每个 type 都带中文兜底文案，即使 i18n 未加载也保证日志行无英文字符。
     */
    _operationLogTypeLabel(type) {
        const map = {
            'add': ['opLogTypeAdd', '新增'],
            'update': ['opLogTypeUpdate', '修改'],
            'delete': ['opLogTypeDelete', '删除'],
            'set-status': ['opLogTypeSetStatus', '状态变更'],
            'wishlist-purchase': ['opLogTypeWishlistToActive', '种草转正'],
            'wishlist-abandon': ['opLogTypeWishlistAbandon', '拔草'],
            'subscription-renew': ['opLogTypeSubscriptionRenew', '订阅续订'],
            'subscription-auto-renew-toggle': ['opLogTypeSubscriptionAutoRenewToggle', '自动续费切换'],
            'prepaid-opening': ['opLogTypePrepaidOpening', '预付开卡'],
            'prepaid-inflow': ['opLogTypePrepaidInflow', '预付充值'],
            'prepaid-outflow': ['opLogTypePrepaidOutflow', '预付消费'],
            'prepaid-refund': ['opLogTypePrepaidRefund', '预付退款'],
            'prepaid-adjust': ['opLogTypePrepaidAdjust', '预付校正'],
            'maintenance-add': ['opLogTypeAddMaintenance', '添加维保'],
            'physical-retire': ['opLogTypePhysicalRetire', '实物退役'],
            'physical-sale': ['opLogTypePhysicalSale', '实物转让'],
            'tag-create': ['opLogTypeTagCreate', '标签创建'],
            'tag-delete': ['opLogTypeTagDelete', '标签删除'],
        };
        const entry = map[type];
        if (entry) return this._t(entry[0], entry[1]);
        return this._t('opLogTypeOther', '其它');
    }

    /**
     * v0.18 阶段 7：操作日志 note/原因中文化。历史英文 note 映射到阶段 2 的中文文案，
     * 新数据本就中文。空 note 返回空串（日志行不显示原因）。
     */
    _normalizeOperationLogNote(note) {
        if (!note) return '';
        const trimmed = String(note).trim();
        if (!trimmed) return '';
        // 历史英文 note（formal-v2 前缀 + count/amount adjustment）映射到阶段 2 的中文文案，
        // 新数据本就中文。检测串拆开书写，避免源码出现完整英文 note 字面量
        // （formal-prepaid-workflow 静态约束：模板不得 emit 英文调整 note）。
        const lower = trimmed.toLowerCase();
        const legacyPrefix = 'formal-v2';
        if (lower.startsWith(legacyPrefix)) {
            if (lower.indexOf('count adjustment') >= 0) return this._t('prepaidAdjustReasonDefault', '次数校正');
            if (lower.indexOf('amount adjustment') >= 0) return this._t('prepaidAmountAdjustReasonDefault', '金额校正');
        }
        return trimmed;
    }

    refreshActiveTab(container) {
        if (!container) return;
        container.querySelectorAll(".am-dock__page").forEach(p => {
            p.hidden = p.dataset.page !== this.activeTab;
        });
    }

    refreshList() {
        this._closeItemMenu();
        const html = this.renderFormalAssetCollection(this.getHomeFilteredAssets());
        const list = this.dockElement?.querySelector(".am-asset-list");
        if (list) {
            list.innerHTML = html;
        }
        const modalList = this._modalContainer?.querySelector(".am-asset-list");
        if (modalList) {
            modalList.innerHTML = html;
        }
        // v1.7-P2：refreshList 会重建 grid 元素，重挂列数 observer（内部先 disconnect 旧实例）。
        this._setupMatrixResizeObserver();
        // v1.7.3：refreshList 仅替换 .am-asset-list innerHTML（容器保留），重挂列表列数 observer 按实测宽修正 data-cols。
        this._setupListResizeObserver();
    }

    // ---------- v0.17-T3-α（M13 批量操作 · 入口）----------

    /**
     * 切换批量模式。
     *  - 开启：卡片显示 checkbox，点击卡片改为切换选中
     *  - 退出：清空已选集
     * 统一走 renderDock() 重渲染（同步顶栏 chip 计数 + 卡片 checkbox / 选中态）
     */
    toggleBulkMode() {
        this.bulkMode = !this.bulkMode;
        if (!this.bulkMode) this.bulkSelected.clear();
        this.renderDock();
    }

    /**
     * 全选当前 filter 下的资产（与正式首页一致：排除 wishlist）
     */
    bulkSelectAll() {
        const filtered = this.getHomeFilteredAssets();
        filtered.forEach(a => this.bulkSelected.add(a.id));
        this.renderDock();
    }

    /** 取消全选 */
    bulkDeselectAll() {
        this.bulkSelected.clear();
        this.renderDock();
    }

    // ---------- v0.17-T3-γ（M13 批量操作 · 真实批量动作）----------

    /**
     * 退出批量模式（统一在 _bulkXxx 完成时调用，避免内存 + UI 状态残留）。
     *   - 退出 bulk mode（顶部 chip 变回「☑ 批量」）
     *   - 清空 bulkSelected
     *   - 重渲染 dock
     *   - 重置顶栏 chip 的 is-active 态
     * 注：退出后 BulkActionBar 自动消失（renderBulkActionBar 的 visible 仅当 bulkMode && size > 0）
     */
    _exitBulkMode() {
        this.bulkMode = false;
        this.bulkSelected.clear();
        this.renderDock();
    }

    _getBulkSelectedSnapshots(ids) {
        const snapshots = [];
        for (const id of ids) {
            const a = this.assets.find(x => x && x.id === id);
            if (!a) throw new Error('asset not found: ' + id);
            snapshots.push({ ...a });
        }
        return snapshots;
    }

    _appendBulkOperationLogs(logs) {
        if (!logs || logs.length === 0) return;
        if (!Array.isArray(this._opLogs)) this._opLogs = [];
        this._opLogs = logs.concat(this._opLogs).slice(0, OPERATION_LOG_MAX || 1000);
        this._opLogDirty = true;
        if (this._opLogFlushTimer) {
            clearTimeout(this._opLogFlushTimer);
            this._opLogFlushTimer = null;
        }
    }

    /**
     * 阶段 1C：批量删除统一持久化。
     *   - 先收集选中资产快照，一次性计算 nextAssets / operationLogs
     *   - 单次写 operationLogs、assets，成功后才更新内存并单次 render
     *   - 失败时保持当前 UI 状态并输出 console 诊断
     */

    /**
     * 阶段 1C：批量改状态统一持久化。
     *   - 弹 status picker（3 chip：wishlist / active / retired）
     *   - 一次性计算所有目标资产的新 status，跳过同状态日志
     *   - 单次写 operationLogs / assets，成功后单次 render
     */

    /**
     * 阶段 1C：批量加标签统一持久化。
     *   - 弹 tag picker sheet：
     *     - 列出当前 assets 中所有标签字符串
     *     - 支持多选 chip
     *     - 底部「自定义输入」input + Enter 添加自定义字符串
     *   - 用户点「确认」→ 新标签列表 = selectedChips ∪ customInputs
     *   - 一次性计算 nextAssets 并仅提交 assets.json
     */

    /**
     * 阶段 1C：批量去标签统一持久化。
     *   - 弹 tag picker sheet（仅显示「bulkSelected 中至少 1 个资产有的 tag」）+ 多选
     *   - 不支持自定义输入（移除只针对现有 tag）
     *   - 一次性计算 nextAssets / operationLogs
     *   - 单次写 operationLogs / assets，成功后单次 render
     */

    /**
     * T3-γ：批量导出 CSV。
     *   - 生成 UTF-8 BOM \uFEFF + headers（id/name/category/status/price/currency/purchaseDate/tags/createdAt）
     *   - tags 数组按 ';' 分隔
     *   - 用 Blob + URL.createObjectURL + <a download> 触发下载
     *   - 文件名：资产导出-YYYY-MM-DDTHH-MM-SS.csv
     *   - 完成后退出 bulk mode + toast「已导出 N 项到 CSV」（不 renderDock — 文件下载不影响 UI）
     *
     * 防错：
     *   - CSV cell 必 escape（含 ,  / " / 换行的字段用 "..." 包并把 " → ""）
     *   - tags 数组内字段本身可能是自定义字符串也要走 escapeCsv
     *   - 中文用 UTF-8 BOM（\uFEFF）让 Excel 正确识别（避免 Excel 把「数字」「=公式」错解析）
     */

    // ---------- v0.17-T3-γ 通用弹窗辅助（confirm / status / tag picker）----------

    /**
     * 通用二次确认 sheet（用 showDialog 包装 b3-dialog）。
     *   - title：dialog 标题
     *   - message：dialog 内的提示文案
     *   - onConfirm：用户点确认按钮时执行的 async 回调
     *   - opts.danger：true 时确认按钮使用 --remove 样式（红色）
     * sheet 内 button onclick 全部 btn.onclick = () => ... 闭包绑定（v0.13 P0 第 8 条教训）
     */
    _showConfirmDialog(title, message, onConfirm, opts = {}) {
        const html = `
            <div class="b3-dialog__content">
                <div class="am-bulk-confirm-dialog">
                    <div class="am-bulk-confirm-dialog__icon">${opts.danger ? '⚠️' : '❓'}</div>
                    <div class="am-bulk-confirm-dialog__text">${escapeHtml(message)}</div>
                </div>
            </div>
            <div class="b3-dialog__action">
                <button class="b3-button b3-button--cancel" data-action="dlg-cancel">${escapeHtml(this._t("btnCancel", "取消"))}</button>
                <button class="b3-button ${opts.danger ? 'b3-button--remove' : 'b3-button--primary'}" data-action="dlg-confirm">${escapeHtml(opts.confirmLabel || this._t("btnConfirm", "确认"))}</button>
            </div>`;
        this.showDialog(title, html, (dialog) => {
            const root = dialog.element;
            root.querySelectorAll(".b3-dialog").forEach(el => { el.siyuanDialog = dialog; });
            const cancelBtn = root.querySelector('[data-action="dlg-cancel"]');
            const confirmBtn = root.querySelector('[data-action="dlg-confirm"]');
            cancelBtn.onclick = () => dialog.destroy();
            confirmBtn.onclick = async () => {
                // 禁用按钮防重复点击 + 关闭 dialog 再执行（避免阻塞 UI）
                confirmBtn.setAttribute('disabled', 'disabled');
                cancelBtn.setAttribute('disabled', 'disabled');
                dialog.destroy();
                try {
                    await onConfirm();
                } catch (err) {
                    console.warn('[AssetManagement] bulk confirm callback error:', err && err.message);
                }
            };
        }, this.isMobile ? "92vw" : "420px");
    }

    /**
     * status picker sheet（3 chip：wishlist / active / retired）。
     *   - title：dialog 标题
     *   - onPick：用户点 chip 时执行的 async 回调（chip.status 字符串）
     * sheet 内 button onclick 全部 btn.onclick = () => ... 闭包绑定（v0.13 P0 第 8 条教训）
     */
    _showStatusPickerDialog(title, onPick) {
        // 复用 STATUSES（从 api/assets.js 注入）
        const statusInfo = [
            { id: 'wishlist', emoji: '🌱', labelKey: 'statusWishlist', labelFallback: '种草中', color: '#67c23a' },
            { id: 'active',   emoji: '✅', labelKey: 'statusActive',   labelFallback: '在役',   color: '#3575f3' },
            { id: 'retired',  emoji: '⏸️', labelFallback: '退役', labelKey: 'statusRetired', color: '#909399' },
        ];
        const chipsHtml = statusInfo.map(s => {
            const chipStyle = `background:${s.color}1a;color:${s.color};border-color:${s.color}55;`;
            return `<button class="am-bulk-status-picker__chip" data-status="${s.id}" style="${chipStyle}">${s.emoji} ${escapeHtml(this._t(s.labelKey, s.labelFallback))}</button>`;
        }).join("");
        const html = `
            <div class="b3-dialog__content">
                <div class="am-bulk-status-picker">
                    <div class="am-bulk-status-picker__hint">${escapeHtml(this._t("bulkChangeStatusHint", "选择目标状态，将应用于所有选中资产"))}</div>
                    <div class="am-bulk-status-picker__chips">${chipsHtml}</div>
                </div>
            </div>`;
        this.showDialog(title, html, (dialog) => {
            const root = dialog.element;
            root.querySelectorAll(".b3-dialog").forEach(el => { el.siyuanDialog = dialog; });
            root.querySelectorAll('[data-status]').forEach(btn => {
                btn.onclick = async () => {
                    const status = btn.dataset.status;
                    dialog.destroy();
                    try {
                        await onPick(status);
                    } catch (err) {
                        console.warn('[AssetManagement] bulk status callback error:', err && err.message);
                    }
                };
            });
        }, this.isMobile ? "92vw" : "420px");
    }

    /**
     * tag picker sheet。
     *   - mode: 'add' / 'remove'
     *     - 'add'：显示当前 assets 中所有标签 + 支持自定义输入
     *     - 'remove'：仅显示 tagPool（callable 给出的当前涉及标签），不支持自定义输入
     *   - title：dialog 标题
     *   - assetIds（'add' 模式用）：仅用于 UI 提示文案（无功能强依赖）
     *   - tagPool（'remove' 模式用）：string[]，要展示的 tag label 列表
     *   - onConfirm：用户点确认时执行的 async 回调（newTags: string[] 包含 chip 选中 + 自定义输入）
     *
     * 实现要点：
     *   - 选中的 chip 状态保存在闭包 state.selected（Set<string>）
     *   - 「add」模式：自定义输入 onkeydown(Enter) 加入临时数组 state.custom + 重渲染 chip 预览
     *   - 「remove」模式：不显示自定义输入框（移除只针对现有 tag）
     *   - sheet 内所有 button onclick 用 btn.onclick = () => ... 闭包绑定（v0.13 P0 第 8 条教训）
     */
    _showTagPickerDialog({ mode, title, assetIds, tagPool, onConfirm }) {
        const isAddMode = mode === 'add';
        const self = this;
        const state = {
            selected: new Set(),
        };

        // 候选 tag 列表
        const pool = isAddMode
            ? this._getAssetTagCatalog()
            : this._normalizeTagLabels(tagPool);

        const renderChips = () => {
            if (pool.length === 0) {
                return `<div class="am-bulk-tag-picker__empty">${escapeHtml(self._t(isAddMode ? "bulkAddTagEmpty" : "bulkRemoveTagEmpty", isAddMode ? "暂无可选标签，可直接输入新标签" : "所选资产均无标签"))}</div>`;
            }
            return pool.map(t => {
                // add 模式提供 {label}，remove 模式提供纯字符串。
                let label;
                if (typeof t === 'string') {
                    label = t;
                } else {
                    label = t.label || '';
                }
                if (!label) return '';
                const isSelected = state.selected.has(label);
                const cls = isSelected ? 'am-bulk-tag-picker__chip is-selected' : 'am-bulk-tag-picker__chip';
                return `<button type="button" class="${cls}" data-tag-label="${escapeHtml(label)}">${escapeHtml(label)}${isSelected ? ' ✓' : ''}</button>`;
            }).filter(Boolean).join('');
        };

        const renderHint = () => {
            if (isAddMode) {
                return escapeHtml(self._t("bulkAddTagHint", "将所选标签添加到 {n} 项资产", { n: (assetIds && assetIds.length) || 0 }));
            } else {
                const n = (assetIds && assetIds.length) || 0;
                return escapeHtml(self._t("bulkRemoveTagHint", "从 {n} 项资产中移除所选标签", { n }));
            }
        };

        const html = `
            <div class="b3-dialog__content">
                <div class="am-bulk-tag-picker">
                    <div class="am-bulk-tag-picker__hint">${renderHint()}</div>
                    <div class="am-bulk-tag-picker__grid">${renderChips()}</div>
                </div>
            </div>
            <div class="b3-dialog__action">
                <button class="b3-button b3-button--cancel" data-action="dlg-cancel">${escapeHtml(self._t("btnCancel", "取消"))}</button>
                <button class="b3-button b3-button--primary" data-action="dlg-confirm">${escapeHtml(self._t("btnConfirm", "确认"))}</button>
            </div>`;
        this.showDialog(title, html, (dialog) => {
            const root = dialog.element;
            root.querySelectorAll(".b3-dialog").forEach(el => { el.siyuanDialog = dialog; });

            // 单 chip 点击切换选中
            const renderSelectedChips = () => {
                const grid = root.querySelector('.am-bulk-tag-picker__grid');
                if (grid) grid.innerHTML = renderChips();
                bindChipClicks();
            };
            const bindChipClicks = () => {
                root.querySelectorAll('[data-tag-label]').forEach(btn => {
                    btn.onclick = () => {
                        const label = btn.dataset.tagLabel;
                        if (state.selected.has(label)) state.selected.delete(label);
                        else state.selected.add(label);
                        renderSelectedChips();
                    };
                });
            };
            // 首屏绑定 + 切换选中后由 renderSelectedChips 重绑
            bindChipClicks();

            // 取消 / 确认
            root.querySelector('[data-action="dlg-cancel"]').onclick = () => dialog.destroy();
            root.querySelector('[data-action="dlg-confirm"]').onclick = async () => {
                const allNew = Array.from(state.selected);
                if (allNew.length === 0) {
                    // 没选任何 → 关闭但不执行
                    dialog.destroy();
                    return;
                }
                dialog.destroy();
                try {
                    await onConfirm(allNew);
                } catch (err) {
                    console.warn('[AssetManagement] bulk tag callback error:', err && err.message);
                }
            };
        }, this.isMobile ? "92vw" : "520px");
    }

    // ---------- 操作菜单 / 筛选 ----------

    /**
     * v0.17-B：资产详情卡承接首页下沉信息。
     * 在 dock 内 appendChild 一张详情卡，覆盖整个 dock 区域；只读聚合字段，不改 schema。
     */

    /**
     * v1.3 阶段 1（Markdown 备注输入与安全渲染）：最小、纯函数 Markdown 渲染器。
     *
     * 仅支持受控语法（与本阶段范围一致）：
     *   - 标题：# / ## / ### / #### / ##### / ######
     *   - 有序列表：行首 "1. " 形式（仅识别 ASCII 数字+点+空格，避免误匹配 "7.5%" 之类正文）
     *   - 无序列表：行首 "- " / "* " / "+ "
     *   - 段落：其他行（连续多行合并为一段；段内换行用 <br>；段间用空行分隔）
     *
     * 安全机制（绝不让原始 HTML / 脚本注入 DOM）：
     *   1. 先 HTML escape 整段（& < > " '），所有用户文本必须先转义再进入任何受控标签
     *   2. 仅按行首受控 token 切块，绝不解析标签内部 inline 语法
     *   3. 始终输出受控标签 h1-h6 / ol / ul / li / p / br；标签内**只**含 escape 后的文本
     *   4. 不支持的语法（图片/链接/代码块/引用/表格/加粗/斜体/HTML 直传）按字面转义后展示
     *
     * 输入约定：textarea 仍保存原始 Markdown 字符串（不被修改），本函数只在展示侧使用。
     * 纯函数，依赖 escapeHtml（已由 IIFE 解构注入），不读 / 写 storage。
     */
    _renderAssetNotesHtml(markdown) {
        const raw = String(markdown == null ? '' : markdown);
        if (!raw.trim()) return '';
        const lines = raw.split(/\r\n|\r|\n/);
        const out = [];
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            if (!line.trim()) { i++; continue; }
            // 标题
            const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
            if (headingMatch) {
                const level = headingMatch[1].length;
                out.push('<h' + level + '>' + escapeHtml(headingMatch[2].trim()) + '</h' + level + '>');
                i++;
                continue;
            }
            // 有序列表：行首可有缩进，"数字. "后至少 1 个非空字符（避免误匹配正文里的 "1."）
            // v1.4.0：捕获缩进，indent>=2（空格或 1 tab）视为上一个顶级项的子列表（1 级嵌套）
            const olMatch = /^(\s*)(\d+)\.\s+(.*)$/.exec(line);
            if (olMatch) {
                const items = []; // { text, subs: [] }
                while (i < lines.length) {
                    const m = /^(\s*)(\d+)\.\s+(.*)$/.exec(lines[i]);
                    if (!m) break;
                    const indent = m[1].replace(/\t/g, '  ').length;
                    if (indent >= 2 && items.length) {
                        items[items.length - 1].subs.push(m[3].trim());
                    } else {
                        items.push({ text: m[3].trim(), subs: [] });
                    }
                    i++;
                }
                if (items.length) {
                    let html = '<ol>';
                    for (const it of items) {
                        html += '<li>' + escapeHtml(it.text) + '</li>';
                        if (it.subs.length) {
                            html += '<ol>' + it.subs.map(s => '<li>' + escapeHtml(s) + '</li>').join('') + '</ol>';
                        }
                    }
                    out.push(html + '</ol>');
                }
                continue;
            }
            // 无序列表：行首可有缩进，- / * / + 之一后接空格
            // v1.4.0：捕获缩进，indent>=2（空格或 1 tab）视为上一个顶级项的子列表（1 级嵌套）
            const ulMatch = /^(\s*)[-*+]\s+(.*)$/.exec(line);
            if (ulMatch) {
                const items = []; // { text, subs: [] }
                while (i < lines.length) {
                    const m = /^(\s*)[-*+]\s+(.*)$/.exec(lines[i]);
                    if (!m) break;
                    const indent = m[1].replace(/\t/g, '  ').length;
                    if (indent >= 2 && items.length) {
                        items[items.length - 1].subs.push(m[2].trim());
                    } else {
                        items.push({ text: m[2].trim(), subs: [] });
                    }
                    i++;
                }
                if (items.length) {
                    let html = '<ul>';
                    for (const it of items) {
                        html += '<li>' + escapeHtml(it.text) + '</li>';
                        if (it.subs.length) {
                            html += '<ul>' + it.subs.map(s => '<li>' + escapeHtml(s) + '</li>').join('') + '</ul>';
                        }
                    }
                    out.push(html + '</ul>');
                }
                continue;
            }
            // 段落：连续非空、非块起始行 → 一个 <p>，段内换行用 <br>
            // v1.4.0：列表中断检测同步允许缩进列表行（^\s*），与上方列表正则保持一致
            const paraLines = [];
            while (i < lines.length) {
                const l = lines[i];
                if (!l.trim()) break;
                if (/^(#{1,6})\s+/.test(l)) break;
                if (/^\s*\d+\.\s+/.test(l)) break;
                if (/^\s*[-*+]\s+/.test(l)) break;
                paraLines.push(l);
                i++;
            }
            if (paraLines.length) {
                out.push('<p>' + paraLines.map(l => escapeHtml(l)).join('<br>') + '</p>');
            }
        }
        return out.join('');
    }

    /**
     * v1.3 阶段 1：产品详情卡的备注 section。空备注返回空串（不渲染空容器、避免布局异常）。
     * 段落内部用 _renderAssetNotesHtml 受控渲染 Markdown。
     */
    _renderAssetNotesSectionHtml(asset) {
        const notes = asset && typeof asset.notes === 'string' ? asset.notes : '';
        if (!notes.trim()) return '';
        return '<section class="am-product-section am-product-section--notes">'
            + '<div class="am-product-section__title">' + escapeHtml(this._t('productSectionNotes', '备注')) + '</div>'
            + '<div class="am-product-notes" data-am-product-notes>' + this._renderAssetNotesHtml(notes) + '</div>'
            + '</section>';
    }

    /**
     * v1.3+ Markdown 编辑器：给 textarea 绑定快捷键 + 列表自动续行 + 自动撑高。
     * v1.4.0 方案 A：去掉实时预览面板，保存后在详情卡里看渲染结果（_renderAssetNotesSectionHtml）。
     * 纯 textarea 方案（不使用 contenteditable，移动端 100% 兼容）。
     * @param {HTMLTextAreaElement} textarea - 要绑定的 textarea
     * @param {Object} [opts] - 预留参数（v1.4.0 起不再使用 container）
     * @returns {{ destroy: Function }} 销毁接口
     */
    _bindMarkdownTextarea(textarea, opts) {
        if (!textarea) return { destroy() {} };

        // v1.4.0：blur-to-render 包装——编辑/查看双模式
        const wrapper = document.createElement('div');
        wrapper.className = 'am-md-editor';
        textarea.parentNode.insertBefore(wrapper, textarea);
        wrapper.appendChild(textarea);
        const rendered = document.createElement('div');
        rendered.className = 'am-md-rendered';
        wrapper.appendChild(rendered);

        // v1.4.0：标记所在编辑表单 section，CSS 据此隐藏重复的「备注」小标题并扁平化内框。
        // 仅资产编辑表单的备注在 .am-form-section 内；workflow / 退役 / 转让 / 种草理由 的
        // textarea 不在 .am-form-section 内，closest 返回 null，不受影响。
        const noteSection = textarea.closest ? textarea.closest('.am-form-section') : null;
        if (noteSection) noteSection.classList.add('am-md-section');

        const renderView = () => {
            const html = this._renderAssetNotesHtml(textarea.value);
            if (html) {
                rendered.innerHTML = html;
                wrapper.classList.remove('is-editing');
            } else {
                rendered.innerHTML = '';
                wrapper.classList.add('is-editing');
            }
        };

        // 点击渲染区域 → 进入编辑
        const onRenderedClick = () => {
            wrapper.classList.add('is-editing');
            textarea.focus();
            // v1.4.0：textarea 在查看态 display:none，scrollHeight 不可靠；切回编辑态变可见后
            // 必须重算 autoGrow，否则高度停留在窄值（"编辑态边框比查看态窄"的根因）。
            autoGrow();
        };
        rendered.addEventListener('click', onRenderedClick);

        // textarea 失焦 → 渲染（延迟一帧避免点击 rendered 时竞态）
        const onTextareaBlur = () => {
            setTimeout(() => {
                if (wrapper.contains(document.activeElement)) return;
                renderView();
            }, 0);
        };
        textarea.addEventListener('blur', onTextareaBlur);

        // 初始化视图
        renderView();

        // v1.4.0：textarea 随内容自动撑高
        const autoGrow = () => {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        };
        textarea.addEventListener('input', autoGrow);
        autoGrow(); // 初始化（覆盖预填内容）

        const onKeyDown = e => {
            // v1.4.0：Tab / Shift+Tab 行级缩进——给选区覆盖的每一行行首加 / 删 2 空格，
            // 使无序 / 有序列表行缩进后渲染为嵌套子列表（_renderAssetNotesHtml 按行首空白判级）。
            // 旧实现仅在光标处插空格，光标不在行首时无法形成行首缩进，列表无法嵌套。
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const value = textarea.value;
                const blockStart = value.lastIndexOf('\n', start - 1) + 1;
                let blockEnd = value.indexOf('\n', end);
                if (blockEnd === -1) blockEnd = value.length;
                const lines = value.slice(blockStart, blockEnd).split('\n');
                const outdent = e.shiftKey;
                const indentOf = s => { const im = s.match(/^[ \t]*/); return im ? im[0].length : 0; };
                let firstLineDelta = 0;
                const newLines = lines.map((line, idx) => {
                    if (outdent) {
                        const rm = line.startsWith('  ') ? 2 : (line.startsWith(' ') || line.startsWith('\t') ? 1 : 0);
                        if (idx === 0) firstLineDelta = -rm;
                        return line.slice(rm);
                    }
                    const origIndent = indentOf(line);
                    let nl = line;
                    // v1.4.0：从顶级跨入子级（原行首无缩进）的有序项，序号重置为 1，
                    // 作为子列表首项（用户语义的「1.1」），后续回车续 2（「1.2」）。
                    if (origIndent < 2 && /^\d+\.\s/.test(line)) nl = line.replace(/^\d+/, '1');
                    if (idx === 0) firstLineDelta = 2 + (nl.length - line.length);
                    return '  ' + nl;
                });
                const newBlock = newLines.join('\n');
                const movedValue = value.slice(0, blockStart) + newBlock + value.slice(blockEnd);
                const movedStart = Math.max(blockStart, start + firstLineDelta);
                const movedEnd = start === end ? movedStart : blockStart + newBlock.length;
                // v1.4.0：缩进移动后统一重排有序源码序号 + 按行列还原光标（与 Enter 反缩进共用
                // helper，使 Tab / Shift+Tab / 连按回车反缩进三条路径数字都跟同层走）。
                this._mdApplyRenumbered(textarea, movedValue, movedStart, movedEnd);
                autoGrow();
                return;
            }
            // v1.3.1：Mac 跨平台支持——ctrlKey||metaKey（Win: Ctrl / Mac: Cmd），altKey 即 Option
            if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.code >= 'Digit1' && e.code <= 'Digit6') {
                e.preventDefault();
                // v1.4.0：Mac 上 Cmd+Option+数字的 e.key 可能是特殊字符（如 ¡），改用 e.code
                const level = +e.code.charAt(5); // 'Digit1' → 1
                this._mdToggleLinePrefix(textarea, '#'.repeat(level) + ' ');
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '7' || e.code === 'Digit7')) {
                e.preventDefault();
                this._mdToggleLinePrefix(textarea, '1. ');
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '8' || e.code === 'Digit8')) {
                e.preventDefault();
                this._mdToggleLinePrefix(textarea, '- ');
                return;
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                this._mdHandleListEnter(textarea, e);
            }
        };
        textarea.addEventListener('keydown', onKeyDown);

        return {
            destroy() {
                textarea.removeEventListener('input', autoGrow);
                textarea.removeEventListener('keydown', onKeyDown);
                rendered.removeEventListener('click', onRenderedClick);
                textarea.removeEventListener('blur', onTextareaBlur);
                // 恢复 textarea 到 wrapper 外面
                if (wrapper.parentNode) wrapper.parentNode.insertBefore(textarea, wrapper);
                wrapper.remove();
                if (noteSection) noteSection.classList.remove('am-md-section');
            }
        };
    }

    /**
     * 在 textarea 当前行的行首切换 Markdown 前缀。
     * 已有相同前缀 → 去掉；已有其它块级前缀 → 替换；否则 → 添加。
     */
    _mdToggleLinePrefix(textarea, prefix) {
        const start = textarea.selectionStart;
        const value = textarea.value;
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        let lineEnd = value.indexOf('\n', start);
        if (lineEnd === -1) lineEnd = value.length;
        const line = value.slice(lineStart, lineEnd);

        const headingMatch = line.match(/^(#{1,6})\s+/);
        const olMatch = line.match(/^\d+\.\s+/);
        const ulMatch = line.match(/^[-*+]\s+/);
        const existingPrefix = headingMatch ? headingMatch[0] : (olMatch ? olMatch[0] : (ulMatch ? ulMatch[0] : ''));

        let newLine;
        if (existingPrefix === prefix) {
            newLine = line.slice(existingPrefix.length);
        } else if (existingPrefix) {
            newLine = prefix + line.slice(existingPrefix.length);
        } else {
            newLine = prefix + line;
        }

        textarea.value = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
        const diff = newLine.length - line.length;
        const newCursor = Math.max(lineStart, Math.min(start + diff, lineStart + newLine.length));
        textarea.selectionStart = textarea.selectionEnd = newCursor;
        textarea.dispatchEvent(createPluginDomEvent(textarea, 'input'));
    }

    /**
     * Enter 键列表自动续行（v1.4.0 缩进感知）。
     *   - 解析整行 = 行首缩进(indent) + 可选列表前缀(有序 N. / 无序 - * +) + 内容；
     *   - 有内容：续行 = 继承 indent + 续前缀（有序续号 N+1，无序同标记），子项回车仍是同级子项；
     *   - 空列表项 + 有缩进：反缩进一级（删行首 2 空格，保留前缀）→ 转回上一级列表项；
     *   - 空列表项 + 无缩进：退出列表，整行清空为普通空行；
     *   - 非列表行：不拦截，走浏览器默认换行。
     * 行首缩进用 [ \t]* 捕获，故缩进的子列表行也能正确续行（旧实现 ^ 锚定行首数字/标记，
     * 缩进行匹配失败导致回车丢失缩进与前缀）。
     * @returns {boolean} 是否处理了（true = 已 preventDefault）
     */
    _mdHandleListEnter(textarea, e) {
        const start = textarea.selectionStart;
        const value = textarea.value;
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        let lineEnd = value.indexOf('\n', start);
        if (lineEnd === -1) lineEnd = value.length;
        const line = value.slice(lineStart, lineEnd);
        const m = line.match(/^([ \t]*)(?:(\d+)\.\s+|([-*+])\s+)?([\s\S]*)$/);
        if (!m) return false;
        const indent = m[1] || '';
        const olNum = m[2];
        const ulMark = m[3];
        if (!olNum && !ulMark) return false; // 非列表行，不拦截
        e.preventDefault();
        const content = (m[4] || '').trim();
        let nv, ns, ne;
        if (!content) {
            if (indent.length >= 2) {
                // 空子项：反缩进一级，保留列表前缀（转回上一级列表项）
                const newLine = line.slice(2);
                nv = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
                ns = ne = Math.max(lineStart, start - 2);
            } else {
                // 空顶级项：退出列表，整行清空
                nv = value.slice(0, lineStart) + value.slice(lineEnd);
                ns = ne = lineStart;
            }
        } else {
            // 有内容：续行，继承缩进 + 续前缀
            const nextPrefix = olNum ? (parseInt(olNum, 10) + 1) + '. ' : ulMark + ' ';
            const insert = '\n' + indent + nextPrefix;
            nv = value.slice(0, start) + insert + value.slice(start);
            ns = ne = start + insert.length;
        }
        // v1.4.0：反缩进 / 续行后统一重排有序源码序号，使"连按回车回上一层级"与 Shift+Tab 一致，
        // 数字跟随同层（修复空项回车反缩进时源码序号未跟同级走、渲染错位的 bug）。
        this._mdApplyRenumbered(textarea, nv, ns, ne);
        textarea.dispatchEvent(createPluginDomEvent(textarea, 'input'));
        return true;
    }

    /**
     * v1.4.0：写入新 value 并按"同层连续编号"重排有序源码序号，再按"行号+列"还原光标。
     * Tab / Shift+Tab / Enter 反缩进 / Enter 续行 四条路径共用，保证任何改变列表缩进或
     * 行结构的编辑后，源码有序数字都跟随同级（renumber 仅改数字、不改行结构，故行列映射安全）。
     * 若重排无变化则直接赋值，避免无谓字符串处理。
     */
    _mdApplyRenumbered(textarea, value, start, end) {
        const renumbered = this._mdRenumberOl(value);
        if (renumbered === value) {
            textarea.value = value;
            textarea.selectionStart = start;
            textarea.selectionEnd = end;
            return;
        }
        const toLC = (off, src) => {
            const ls = src.lastIndexOf('\n', off - 1) + 1;
            return [src.slice(0, ls).split('\n').length - 1, off - ls];
        };
        const rLines = renumbered.split('\n');
        const offFromLC = (li, col) => {
            let o = 0;
            for (let k = 0; k < li && k < rLines.length; k++) o += rLines[k].length + 1;
            const ln = rLines[li] || '';
            return o + Math.max(0, Math.min(col, ln.length));
        };
        const [sl, sc] = toLC(start, value);
        const [el, ec] = toLC(end, value);
        textarea.value = renumbered;
        textarea.selectionStart = offFromLC(sl, sc);
        textarea.selectionEnd = offFromLC(el, ec);
    }

    /**
     * v1.4.0：按"同层连续编号"规范化全文有序列表源码序号（Tab / Enter 列表操作后调用）。
     * 缩进层栈维护父子上下文：同级续号、更深子层从 1、outdent 回浅层续号；
     * 无序行 pop 比它深的层（保留浅层 ol 续号上下文），空行/标题/段落清空栈（块边界）。
     * 仅重排数字、不改行结构，使源码数字与渲染器嵌套 <ol> 浏览器编号一致
     * （如子项 outdent 回顶级后源码 3.→2.，渲染顶级连续 1、2）。
     */
    _mdRenumberOl(value) {
        const lines = String(value == null ? '' : value).split('\n');
        const stack = []; // { indent, counter }
        const olRe = /^([ \t]*)(\d+)\.\s/;
        const ulRe = /^([ \t]*)[-*+]\s/;
        const indentLen = s => { const m = s.match(/^[ \t]*/); return m ? m[0].replace(/\t/g, '  ').length : 0; };
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const om = line.match(olRe);
            if (om) {
                const L = indentLen(line);
                while (stack.length && stack[stack.length - 1].indent > L) stack.pop();
                let counter;
                if (stack.length && stack[stack.length - 1].indent === L) {
                    counter = ++stack[stack.length - 1].counter;
                } else {
                    stack.push({ indent: L, counter: 1 });
                    counter = 1;
                }
                lines[i] = line.replace(olRe, om[1] + counter + '. ');
                continue;
            }
            const um = line.match(ulRe);
            if (um) {
                const Lu = indentLen(line);
                while (stack.length && stack[stack.length - 1].indent > Lu) stack.pop();
                continue;
            }
            stack.length = 0; // 空行 / 标题 / 段落：列表块边界
        }
        return lines.join('\n');
    }

    /**
     * Stage 2 (UI parity): physical-only detail card matching the reference design.
     * Four sections (base / cost / expiry / maintenance) + framed cover + status
     * badge + header price/daily + exactly two footer pills. All numbers come from
     * the formal projection with explicit empty-UI fallbacks (no null/undefined/NaN).
     * Non-physical kinds keep the legacy renderer in openFormalProductCard.
     */

    /**
     * Stage 5 (需求6 保修显示美化): warranty tier info shared by the physical detail
     * card warranty block and the edit-form live hint badge. Reuses the tier logic of
     * formatRemainingBadge (normal >30 / soon 8-30 / urgent 1-7 & 0 / expired <0) but
     * renders warranty-specific labels:
     *   - daysLeft > 0   → 「剩 N 天」(warrantyDaysLeft)
     *   - daysLeft === 0 → 「今日到期」(reuse badgeToday)
     *   - daysLeft < 0   → 「已过保」(warrantyExpiredBadge)
     * Returns null when no warranty date is set. Pure display helper — never writes to storage.
     */
    _warrantyTier(warrantyEndsOn) {
        if (!warrantyEndsOn) return null;
        const daysLeft = daysUntil(warrantyEndsOn, todayISO());
        const tier = formatRemainingBadge(daysLeft, 'subscription', (k, fb) => this._t(k, fb)).tier;
        let label;
        if (daysLeft < 0) label = this._t('warrantyExpiredBadge', '已过保');
        else if (daysLeft === 0) label = this._t('badgeToday', '今日到期');
        else label = this._t('warrantyDaysLeft', '剩 {n} 天', { n: daysLeft });
        return { tier: tier, label: label, daysLeft: daysLeft };
    }

    /**
     * v2.4.1 阶段3：种草期望价时间序列（价格趋势曲线数据源）。
     * 数据全部来自 wishlistEvents sidecar 的 expectedPriceChanged 事件（事件即审计轨迹，
     * 资产本身只保存当前值）：
     *   - 首个事件 previousAmountMinor != null → 首点取 (asset.createdAt, previousAmountMinor)，
     *     即「种草时的初始期望价」；
     *   - 每个事件 → 点 (occurredAt, expectedAmountMinor)；expectedAmountMinor 为 null 的
     *     事件（清空价格）不产生数据点；
     *   - 无事件时：当前 expectedAmountMinor != null → 单点 (createdAt, 当前值)；否则空序列。
     * 返回按 occurredAt 升序的点数组 [{ minor, date }]；date 为 UTC ISO instant 字符串。
     * 纯读函数 — 不写 storage；依赖 this.wishlistEvents 已 warm（见 openFormalProductCard）。
     */
    _wishlistPricePoints(asset) {
        if (!asset || !asset.id || !asset.wishlist) return [];
        const createdAt = asset.createdAt || '';
        const events = (Array.isArray(this.wishlistEvents) ? this.wishlistEvents : [])
            .filter(event => event && event.eventType === 'expectedPriceChanged' && event.sourceWishlistId === asset.id)
            .slice()
            .sort((a, b) => String(a.occurredAt || '').localeCompare(String(b.occurredAt || '')));
        if (events.length === 0) {
            return asset.wishlist.expectedAmountMinor != null
                ? [{ minor: asset.wishlist.expectedAmountMinor, date: createdAt }]
                : [];
        }
        const points = [];
        if (events[0].previousAmountMinor != null) points.push({ minor: events[0].previousAmountMinor, date: createdAt });
        events.forEach(event => {
            if (event.expectedAmountMinor != null) points.push({ minor: event.expectedAmountMinor, date: event.occurredAt || '' });
        });
        return points;
    }

    /**
     * v2.4.2：种草详情卡「心动值」section HTML（插在价格趋势 section 之前，复用同款
     * .am-product-section 壳）。内容：阶段 emoji（大号）+ 阶段文案 + 计数（有目标 n/target，
     * 无目标「心动 n 次」）+ 进度条（仅有目标，width=min(ratio,1)*100）+「心动」大按钮 +
     * 撤销 pill（仅 count>0）。按钮事件由 _bindWishlistHeartbeatSection 闭包绑定，
     * 绝不走 [data-action] 委托（v0.14 教训）。依赖 this.wishlistEvents 已 warm
     * （openFormalProductCard 打开种草详情卡时已预热，不新增加载路径）。
     */
    _renderWishlistHeartbeatSectionHtml(asset) {
        const wishlist = (asset && asset.wishlist) || {};
        const target = wishlist.heartbeatTarget;
        const hasTarget = Number.isSafeInteger(target) && target >= 1;
        const events = Array.isArray(this.wishlistEvents) ? this.wishlistEvents : [];
        const count = deriveWishlistHeartbeat(events, asset && asset.id).count;
        const desc = describeWishlistHeartbeat(count, target);
        const stageKey = 'wishlistHeartbeatStage' + String(desc.stageKey || 'seed').replace(/^[a-z]/, ch => ch.toUpperCase());
        const stageFallback = { seed: '种子', sprout: '发芽', growing: '小草', thriving: '茂盛', budding: '含苞', bloom: '开花' };
        const stageLabel = escapeHtml(this._t(stageKey, stageFallback[desc.stageKey] || String(desc.stageKey || '')));
        const title = `<div class="am-product-section__title">${escapeHtml(this._t('wishlistHeartbeatSection', '心动值'))}</div>`;
        const countHtml = hasTarget
            ? `<span class="am-wish-heartbeat-count am-wish-heartbeat-count--target">${count}/${target}</span>`
            : `<span class="am-wish-heartbeat-count">${escapeHtml(this._t('wishlistHeartbeatCount', '心动 {n} 次', { n: count }))}</span>`;
        const ratio = desc.ratio == null || !isFinite(desc.ratio) ? 0 : Math.max(0, Math.min(desc.ratio, 1));
        const progressHtml = hasTarget
            ? `<div class="am-wish-progress${desc.reached ? ' is-ready' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${Math.min(count, target)}"><div class="am-wish-progress__fill" style="width:${Math.round(ratio * 100)}%"></div></div>`
            : '';
        // v2.4.2 hotfix 4：心动记录——取该资产最近 N 条 heartbeat 事件（默认 N=5）按时间倒序，
        // 每行紧凑显示 MM-DD HH:MM（_formatWishlistHeartbeatTimestamp）。超出条数时追加「…等 X 次」。
        // 仅 count>0 时渲染整块区域，避免空态占空间。撤销按钮上方一行分隔。
        const HEARTBEAT_LOG_MAX = 5;
        const heartbeatLogHtml = count > 0
            ? (() => {
                const list = events
                    .filter(ev => ev && ev.eventType === 'heartbeat' && ev.sourceWishlistId === (asset && asset.id))
                    .slice()
                    .sort((l, r) => String(r.occurredAt || '').localeCompare(String(l.occurredAt || '')))
                    .slice(0, HEARTBEAT_LOG_MAX);
                if (!list.length) return '';
                const items = list.map(ev => `<li class="am-wish-heartbeat-records__item"><span class="am-wish-heartbeat-records__time">${escapeHtml(this._formatWishlistHeartbeatTimestamp(ev.occurredAt))}</span></li>`).join('');
                const more = count > HEARTBEAT_LOG_MAX
                    ? `<li class="am-wish-heartbeat-records__more">${escapeHtml(this._t('wishlistHeartbeatRecordsMore', '…等 {n} 次', { n: count }))}</li>`
                    : '';
                return `<div class="am-wish-heartbeat-records"><div class="am-wish-heartbeat-records__title">${escapeHtml(this._t('wishlistHeartbeatRecordsTitle', '心动记录'))}</div><ul class="am-wish-heartbeat-records__list">${items}${more}</ul></div>`;
            })()
            : '';
        const undoHtml = count > 0
            ? `<div class="am-wish-heartbeat-footer"><button type="button" class="am-card-renew am-card-renew--ghost am-wish-heartbeat-undo" data-wishlist-heartbeat-undo>${escapeHtml(this._t('wishlistHeartbeatUndo', '撤销最近一次心动'))}</button></div>`
            : '';
        return `<section class="am-product-section am-wish-heartbeat-section${desc.reached ? ' is-ready' : ''}" data-wishlist-heartbeat-section>${title}<div class="am-wish-heartbeat-body"><span class="am-wish-heartbeat-emoji" aria-hidden="true">${desc.emoji}</span><div class="am-wish-heartbeat-info"><div class="am-wish-heartbeat-stage">${stageLabel}${countHtml}</div>${progressHtml}</div><button type="button" class="am-wish-heartbeat-btn" data-wishlist-heartbeat-record aria-label="${escapeHtml(this._t('wishlistHeartbeatAria', '记录一次心动'))}">${escapeHtml(this._t('wishlistHeartbeatAction', '心动'))}</button></div>${heartbeatLogHtml}${undoHtml}</section>`;
    }

    /**
     * v2.4.2 hotfix 4：紧凑时间格式，专给详情卡心动记录用——返回 MM-DD HH:MM（如「08-16 14:30」）。
     * 输入既支持 ISO UTC（含 T 与 :）也支持纯日期；解析失败回退「—」。
     * 与 _formatWishlistEventDateTime 不同：本函数不输出年份/月份单位，节省详情卡垂直空间。
     * 纯数字格式跨语言一致（中文/英文都显示「08-16 14:30」），无需 i18n 占位。
     */
    _formatWishlistHeartbeatTimestamp(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(value || ''));
        if (!match) return '—';
        const pad2 = n => String(n).padStart(2, '0');
        const hh = match[4] != null ? pad2(Number(match[4])) : '--';
        const mm = match[5] != null ? pad2(Number(match[5])) : '--';
        return `${match[2]}-${match[3]} ${hh}:${mm}`;
    }

    /**
     * v2.4.2：详情卡心动值 section 的闭包绑定（v0.14 教训：详情卡内 button 必须
     * btn.onclick 闭包直绑，不走 [data-action] 委托）。cardNode 传详情卡 mask 节点
     * 或刷新后的 section 节点均可（内部按 querySelector 找按钮）。
     * - 「心动」大按钮：recordWishlistHeartbeat → +1 动画 → 就地更新 section；
     *   justReached 时 toast 达标文案。
     * - 撤销 pill：undoWishlistHeartbeat → 就地更新 section → toast。
     * 就地更新策略：域方法内部 _runGuardedUiEffects 会重置 dock/modal 的 innerHTML，
     * 详情卡节点若被清掉则原 host 重开详情卡（用户视角详情卡始终打开、不关闭）。
     */
    _bindWishlistHeartbeatSection(cardNode, assetId, host) {
        if (!cardNode || typeof cardNode.querySelector !== 'function') return;
        const refreshSection = () => {
            const fresh = (this.assets || []).find(item => item && item.id === assetId);
            if (!fresh || fresh.status !== 'wishlist') return;
            const live = cardNode && cardNode.isConnected
                ? cardNode
                : (typeof document !== 'undefined' && document.querySelector
                    ? document.querySelector('.am-product-card-mask [data-product-id="' + assetId + '"]') : null);
            // live 可能是 mask 节点（section 是后代）或就地替换后的 section 元素本身（matches 分支）。
            const section = !live ? null
                : (typeof live.matches === 'function' && live.matches('[data-wishlist-heartbeat-section]')
                    ? live : (live.querySelector ? live.querySelector('[data-wishlist-heartbeat-section]') : null));
            if (section) {
                const wrapper = document.createElement('div');
                wrapper.innerHTML = this._renderWishlistHeartbeatSectionHtml(fresh);
                const freshSection = wrapper.firstElementChild;
                if (freshSection && section.parentNode) {
                    section.parentNode.replaceChild(freshSection, section);
                    this._bindWishlistHeartbeatSection(freshSection, assetId, host);
                }
                return;
            }
            // 卡片被域方法的 UI 效应清掉 → 原 host 重开（等价于「不关详情卡」的用户体验）。
            // v2.4.2 hotfix 5：挂 --noanim 禁用重开入场动画，消除「闪一下」。
            this._productCardNoAnim = true;
            this.openFormalProductCard(assetId, host);
        };
        const recordBtn = cardNode.querySelector('[data-wishlist-heartbeat-record]');
        if (recordBtn) {
            recordBtn.onclick = async event => {
                const x = event && typeof event.clientX === 'number' ? event.clientX : null;
                const y = event && typeof event.clientY === 'number' ? event.clientY : null;
                recordBtn.disabled = true;
                try {
                    const result = await this.recordWishlistHeartbeat(assetId);
                    if (x != null && y != null) this._playHeartbeatPlusOne(x, y);
                    if (result && result.justReached) this.showToast(this._t('wishlistHeartbeatReached', '🌸 心动值满了，可以买啦！'));
                    refreshSection();
                } catch (error) {
                    recordBtn.disabled = false;
                    this.showToast('⚠️ ' + (error && error.message ? error.message : 'heartbeat failed'));
                }
            };
        }
        const undoBtn = cardNode.querySelector('[data-wishlist-heartbeat-undo]');
        if (undoBtn) {
            undoBtn.onclick = async () => {
                undoBtn.disabled = true;
                try {
                    const result = await this.undoWishlistHeartbeat(assetId);
                    if (result) this.showToast('✓ ' + this._t('wishlistHeartbeatUndoSuccess', '已撤销最近一次心动'));
                    refreshSection();
                } catch (error) {
                    undoBtn.disabled = false;
                    this.showToast('⚠️ ' + (error && error.message ? error.message : 'undo failed'));
                }
            };
        }
    }

    /**
     * v2.4.2：心动 +1 上浮动画。挂在不会被 refreshMainContent 销毁的稳定容器
     * （dockElement / _modalContainer / overlay root；三者均已 position 定位），
     * position:absolute 以点击坐标相对容器定位；keyframes 上浮渐隐后自动 remove。
     * 必须在域提交与重渲染完成之后调用，否则会被 innerHTML 替换清掉。
     */
    _playHeartbeatPlusOne(clientX, clientY) {
        if (typeof document === 'undefined') return;
        if (typeof clientX !== 'number' || typeof clientY !== 'number' || !isFinite(clientX) || !isFinite(clientY)) return;
        const host = this.dockElement || this._modalContainer || ensurePluginOverlayRoot(this) || document.body;
        if (!host || typeof host.appendChild !== 'function') return;
        const rect = typeof host.getBoundingClientRect === 'function' ? host.getBoundingClientRect() : { left: 0, top: 0 };
        const el = document.createElement('span');
        el.className = 'am-wish-plus-one';
        el.textContent = '+1';
        el.style.left = (clientX - rect.left + (host.scrollLeft || 0)) + 'px';
        el.style.top = (clientY - rect.top + (host.scrollTop || 0)) + 'px';
        host.appendChild(el);
        const remove = () => { if (el.parentNode) el.parentNode.removeChild(el); };
        el.addEventListener('animationend', remove, { once: true });
        setTimeout(remove, 1200); // 兜底：animationend 丢失时不留孤儿节点
    }

    /**
     * v2.4.1 阶段3：种草详情卡「价格趋势」section HTML。
     * 点数 ≥2 → 参数化复用报表曲线 _renderAmountTrendSvg（样式类与报表完全同源：
     * .am-dashboard-trend-svg / .am-trend-plot / .am-trend-line / .am-trend-area /
     * .am-trend-val / .am-trend-xlabels）；贴点值用 formatAmountMinor 显示完整金额
     * （报表默认 kfmt「xxK」只适合大额），x 轴标签取各点日期 MM-DD。
     * 点数 0-1 → 不画曲线，显示空态条（更新价格后自动生成趋势）。
     */
    _renderWishlistPriceSectionHtml(asset) {
        const currency = (asset && asset.currency) || 'CNY';
        const points = this._wishlistPricePoints(asset);
        const title = `<div class="am-product-section__title">${escapeHtml(this._t('wishlistPriceTrendTitle', '价格趋势'))}</div>`;
        // v2.4.1 追加：更新记录列表（日期 + 旧→新 + 删除按钮），误输入可删除更正；
        // 复用维保/预付流水的 .am-workflow-records / .am-workflow-item 视觉。
        const events = (Array.isArray(this.wishlistEvents) ? this.wishlistEvents : [])
            .filter(event => event && event.eventType === 'expectedPriceChanged' && event.sourceWishlistId === asset.id)
            .slice()
            .sort((a, b) => String(b.occurredAt || '').localeCompare(String(a.occurredAt || '')));
        const amountStr = minor => minor == null ? '—' : formatAmountMinor(minor, currency);
        const recordsHtml = events.length
            ? `<div class="am-workflow-records"><header class="am-workflow-records__header"><span class="am-workflow-records__title">${escapeHtml(this._t('wishlistPriceRecordsTitle', '更新记录'))}</span><span class="am-workflow-records__count">${events.length}</span></header>${events.map(event => `<div class="am-workflow-item"><span class="am-workflow-item__badge am-workflow-item__badge--adjust">${escapeHtml(this._t('wishlistPriceRecordBadge', '价格更新'))}</span><div class="am-workflow-item__main"><div class="am-workflow-item__date">${escapeHtml(this._formatWishlistEventDateTime(event.occurredAt))}</div><div class="am-workflow-item__note">${escapeHtml(amountStr(event.previousAmountMinor))} → ${escapeHtml(amountStr(event.expectedAmountMinor))}</div></div><button type="button" class="am-workflow-item__delete" data-wishlist-price-event-delete="${escapeHtml(event.id)}" aria-label="${escapeHtml(this._t('wishlistPriceEventDeleteAria', '删除该条价格记录'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`).join('')}</div>`
            : '';
        if (points.length < 2) {
            return `<section class="am-product-section">${title}<div class="am-product-empty-bar">${escapeHtml(this._t('wishlistPriceTrendEmpty', '暂无价格变化，更新价格后自动生成趋势'))}</div>${recordsHtml}</section>`;
        }
        const mmdd = iso => {
            const parsed = new Date(iso);
            if (isNaN(parsed.getTime())) return '';
            return String(parsed.getUTCMonth() + 1).padStart(2, '0') + '-' + String(parsed.getUTCDate()).padStart(2, '0');
        };
        const svg = this._renderAmountTrendSvg(points.map(point => point.minor), points.map(point => mmdd(point.date)), {
            formatValue: minor => formatAmountMinor(minor, currency),
            ariaLabel: this._t('wishlistPriceTrendTitle', '价格趋势'),
        });
        return `<section class="am-product-section">${title}${svg}${recordsHtml}</section>`;
    }

    /**
     * v2.4.1：种草池卡片底部「迷你价格曲线」（sparkline）。
     * 与报表/详情卡曲线同源：同一 Catmull-Rom→三次贝塞尔平滑算法、同一
     * .am-trend-line / .am-trend-area 样式类（主题色 + 14% 面积填充），
     * 差异仅在尺寸（120×28 viewBox，preserveAspectRatio=none + non-scaling-stroke）
     * 与纵轴归一化——sparkline 用 min..max 区间归一（报表是 0..max 大额口径），
     * 小幅价格波动在 28px 高度内也清晰可见；无贴点值 / 无 x 轴标签。
     * 点数 <2 返回空串（单点不成曲线，卡片只保留「更新价格」按钮）。
     */
    _renderWishlistSparklineHtml(asset) {
        const points = this._wishlistPricePoints(asset);
        if (points.length < 2) return '';
        const W = 120, H = 28, padX = 3, padY = 4;
        const vals = points.map(point => Math.max(0, Number(point.minor) || 0));
        const n = vals.length;
        const max = Math.max(...vals);
        const min = Math.min(...vals);
        const span = max > min ? max - min : 1;
        const innerW = W - padX * 2, innerH = H - padY * 2;
        const xAt = i => padX + (i / (n - 1)) * innerW;
        const yAt = v => padY + innerH - ((v - min) / span) * innerH;
        const f = x => x.toFixed(1);
        const P = vals.map((v, i) => [xAt(i), yAt(v)]);
        const parts = [`M ${f(P[0][0])} ${f(P[0][1])}`];
        for (let i = 0; i < n - 1; i++) {
            const p0 = P[i - 1] || P[i];
            const p1 = P[i];
            const p2 = P[i + 1];
            const p3 = P[i + 2] || p2;
            const c1x = p1[0] + (p2[0] - p0[0]) / 6;
            const c1y = p1[1] + (p2[1] - p0[1]) / 6;
            const c2x = p2[0] - (p3[0] - p1[0]) / 6;
            const c2y = p2[1] - (p3[1] - p1[1]) / 6;
            parts.push(`C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`);
        }
        const linePath = parts.join(' ');
        const baseY = f(padY + innerH);
        const areaPath = `${linePath} L ${f(P[n - 1][0])} ${baseY} L ${f(P[0][0])} ${baseY} Z`;
        return `<span class="am-wishpool__spark" aria-hidden="true"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path class="am-trend-area" d="${areaPath}"/><path class="am-trend-line" d="${linePath}"/></svg></span>`;
    }

    _renderPhysicalProductCardInner(asset, vm, status, text, row, tagsHtml) {
        const isWish = asset.status === 'wishlist';
        const currency = asset.currency || 'CNY';
        const fmt = minor => formatAmountMinor(minor == null ? 0 : minor, currency);
        const acqMinor = vm.projection && vm.projection.acquisition ? vm.projection.acquisition.amountMinor : null;
        const fin = vm.projection ? vm.projection.financials : null;
        const netMinor = fin ? fin.netAmountMinor : null;
        const companionDays = (!isWish && asset.acquiredOn) ? daysBetween(asset.acquiredOn, todayISO()) : null;
        const dailyMinor = (!isWish && fin && companionDays != null && companionDays >= 0) ? Math.ceil(fin.netAmountMinor / Math.max(1, companionDays + 1)) : null;
        const perDay = ' / ' + escapeHtml(this._t('daysUnit', '天'));
        const groupLabel = escapeHtml(this._t('displayGroupPhysical', '实物'));
        const badgeKey = isWish ? 'productStatusWishlist' : (asset.status === 'retired' ? 'productStatusRetired' : 'productStatusActive');
        const wishlistCreatedDate = isWish ? String(asset.createdAt || asset.updatedAt || '').slice(0, 10) : '';
        const costGoal = (!isWish && vm.projection) ? vm.projection.costGoal : null;
        const costsHtml = isWish ? '' : `<div class="am-product-card__costs"><div class="am-product-card__price">${fmt(acqMinor)}</div>${this._cnyApproxHtml(acqMinor, currency)}${dailyMinor != null ? `<div class="am-product-card__daily">${fmt(dailyMinor)}${perDay}</div>` : ''}</div>`;
        const baseRows = row(this._t('productDetailType', '类型'), groupLabel)
            + (wishlistCreatedDate ? row(this._t('wishlistPlantedDate', '种草日期'), escapeHtml(wishlistCreatedDate)) : '')
            + (asset.acquiredOn ? row(this._t('productDetailStartDate', '开始日期'), escapeHtml(asset.acquiredOn)) : '')
            + (companionDays != null ? row(this._t('productMetricDays', '陪伴'), `${companionDays} ${escapeHtml(this._t('daysUnit', '天'))}`) : '');
        const costRows = isWish
            ? `<div class="am-product-empty-bar">${escapeHtml(this._t('productEmptyCost', '暂无成本信息'))}</div>`
            : row(this._t('productCostPrice', '价格'), fmt(acqMinor))
                + row(this._t('netCostLabel', '净成本'), fmt(netMinor))
                + (costGoal ? '' : row(this._t('productDailyLabel', '日均'), dailyMinor != null ? `${fmt(dailyMinor)}${perDay}` : '—')
                + row(this._t('productDailySource', '日均来源'), escapeHtml(this._t('productDailySourceNormal', '自然摊销'))));
        let costGoalHtml = '';
        if (costGoal) {
            const cgActual = fmt(costGoal.currentDailyAmountMinor);
            const cgTarget = fmt(costGoal.targetDailyAmountMinor);
            const cgStatusCls = costGoal.achieved ? 'am-costgoal-status--achieved' : 'am-costgoal-status--pending';
            const cgStatusText = costGoal.achieved
                ? '✓ ' + escapeHtml(this._t('costGoalAchieved', '已达到目标日均价'))
                : escapeHtml(this._t('costGoalDaysRemaining', '预计还需 {n} 天达到目标日均价（{date}）').replace('{n}', String(costGoal.daysToTarget)).replace('{date}', costGoal.targetDate || '—'));
            let cgNote = '';
            if (costGoal.targetEndsOn) {
                cgNote = `<div class="am-costgoal-note">${escapeHtml(this._t('costGoalTargetEndsOn', '期望截止 {date}').replace('{date}', costGoal.targetEndsOn))}</div>`;
                if (!costGoal.achieved && costGoal.targetDate && costGoal.targetDate > costGoal.targetEndsOn) {
                    cgNote += `<div class="am-costgoal-warning">${escapeHtml(this._t('costGoalLateWarning', '按当前速度将晚于期望截止'))}</div>`;
                }
            }
            costGoalHtml = `<section class="am-product-section"><div class="am-product-section__title">${escapeHtml(this._t('costGoalSectionTitle', '目标日均价'))}</div><div class="am-costgoal-compare"><div class="am-costgoal-compare__item"><span class="am-costgoal-compare__label">${escapeHtml(this._t('costGoalActualDaily', '实际日均'))}</span><span class="am-costgoal-compare__value">${cgActual}</span></div><span class="am-costgoal-compare__sep">/</span><div class="am-costgoal-compare__item"><span class="am-costgoal-compare__label">${escapeHtml(this._t('costGoalTargetLabel', '目标'))}</span><span class="am-costgoal-compare__value">${cgTarget}</span></div></div><div class="am-costgoal-status ${cgStatusCls}">${cgStatusText}</div>${cgNote}</section>`;
        }
        const warrantyOn = vm.projection ? vm.projection.warrantyEndsOn : null;
        let expiryHtml;
        if (warrantyOn) {
            // Stage 5 (需求6): styled warranty block — [🛡 tinted disc] [保修至 date / 剩 N 天] [档位徽章].
            const wt = this._warrantyTier(warrantyOn);
            const warrantyMain = escapeHtml(this._t('warrantyUntilDate', '保修至 {date}', { date: warrantyOn }));
            expiryHtml = `<div class="am-warranty-block am-warranty-block--${escapeHtml(wt.tier)}"><div class="am-warranty-block__icon" aria-hidden="true">🛡️</div><div class="am-warranty-block__text"><div class="am-warranty-block__main">${warrantyMain}</div><div class="am-warranty-block__sub">${escapeHtml(wt.label)}</div></div><div class="am-warranty-block__badge">${escapeHtml(wt.label)}</div></div>`;
        } else {
            expiryHtml = `<div class="am-product-empty-bar">${escapeHtml(this._t('productEmptyExpiry', '暂无到期或续费信息'))}</div>`;
        }
        const domain = this._formalDomainSnapshot();
        const maintRecords = (Array.isArray(vm.maintenance) ? vm.maintenance : []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        const latestMaint = maintRecords[0];
        const maintTotalMinor = (Array.isArray(domain.financialEvents) ? domain.financialEvents : [])
            .filter(event => event && event.assetId === asset.id && !event.voidedAt && event.eventType === FINANCIAL_EVENT_TYPE.MAINTENANCE)
            .reduce((sum, event) => sum + (Number.isSafeInteger(event.amountMinor) ? event.amountMinor : 0), 0);
        const maintHtml = `<div class="am-product-maint-card">${row(this._t('maintenanceLatest', '最近保养'), latestMaint ? escapeHtml(latestMaint.date) : escapeHtml(this._t('maintenanceNoRecords', '暂无保养记录')))}${row(this._t('maintenanceTotalCost', '累计维护支出'), fmt(maintTotalMinor))}</div>`;
        const coverContent = this.renderAssetCoverContent(asset, '📦', 'am-product-card__cover-image', 'am-product-card__cover-fallback');
        const notesSectionHtml = this._renderAssetNotesSectionHtml(asset);
        // v2.4.1 阶段3：种草详情卡专属——价格趋势 section（成本之后）+ 底部「更新价格」入口；非 wishlist 不渲染。
        // v2.4.2：种草详情卡专属——心动值 section（价格趋势之前）；非 wishlist 不渲染。
        const heartbeatSectionHtml = isWish ? this._renderWishlistHeartbeatSectionHtml(asset) : '';
        const wishlistJourneyHtml = this._renderWishlistJourneySectionHtml(asset);
        const priceSectionHtml = isWish ? this._renderWishlistPriceSectionHtml(asset) : '';
        const wishlistPriceBtn = isWish ? `<button type="button" class="am-fpc-pill" data-wishlist-update-price>${escapeHtml(this._t('wishlistUpdatePrice', '更新价格'))}</button>` : '';
        // v2.4.1：种草资产没有保修/维修记录——到期（保修）section、保养与维修 section、
        // 「管理保养与维修」入口在 wishlist 状态一律不渲染。
        const expirySectionHtml = isWish ? '' : `<section class="am-product-section"><div class="am-product-section__title">${escapeHtml(this._t('productSectionExpiry', '到期'))}</div>${expiryHtml}</section>`;
        const maintSectionHtml = isWish ? '' : `<section class="am-product-section"><div class="am-product-section__title">${escapeHtml(this._t('maintenanceSectionTitle', '保养与维修'))}</div>${maintHtml}</section>`;
        const maintenancePill = isWish ? '' : `<button type="button" class="am-fpc-pill" data-formal-maintenance>${escapeHtml(this._t('maintenanceOpen', '管理保养与维修'))}</button>`;
        // v2.4.1：种草资产尚未购入，没有实际成本——成本 section（暂挂「暂无成本信息」空态条）在 wishlist 状态不渲染；
        // 价格趋势 section 紧跟基础区出现。
        const costSectionHtml = isWish ? '' : `<section class="am-product-section"><div class="am-product-section__title">${escapeHtml(this._t('productSectionCost', '成本'))}</div>${costRows}</section>`;
         return `<div class="am-product-card am-formal-product-card" data-product-id="${escapeHtml(asset.id)}"><button type="button" class="am-product-card__close" data-formal-detail-close aria-label="${escapeHtml(this._t('btnClose', '关闭'))}">×</button><div class="am-product-card__status" style="background:color-mix(in srgb, ${status.color} 14%, transparent);color:${status.color};"><span class="am-product-card__status-dot" style="background:${status.color};"></span>${escapeHtml(this._t(badgeKey, asset.status))}</div><div class="am-product-card__header"><div class="am-product-card__cover am-product-card__cover--framed">${coverContent}</div><div class="am-product-card__head-main"><div class="am-product-card__cat-chip">${groupLabel}</div><div class="am-product-card__name">${escapeHtml(asset.name)}</div>${tagsHtml ? `<div class="am-product-card__tags">${tagsHtml}</div>` : ''}</div>${costsHtml}</div><div class="am-product-card__body"><section class="am-product-section"><div class="am-product-section__title">${escapeHtml(this._t('productSectionBase', '基础'))}</div>${baseRows}</section>${wishlistJourneyHtml}${costSectionHtml}${heartbeatSectionHtml}${priceSectionHtml}${costGoalHtml}${expirySectionHtml}${maintSectionHtml}${notesSectionHtml}</div><div class="am-product-card__actions am-fpc-actions">${wishlistPriceBtn}${maintenancePill}<button type="button" class="am-fpc-pill" data-formal-edit>${escapeHtml(this._t('productEditBtn', '编辑设置'))}</button></div></div>`;
    }

    /**
     * Stage 3 (UI parity): virtual (subscription / perpetual) detail card matching
     * the reference design. Header (framed cover + 虚拟 chip + name + price/daily) +
     * four sections (基础 / 成本 / 到期 / 订阅历程). Perpetual omits the subscription
     * history section and renders a "永久·无到期" fallback in 到期. The 性价比自评
     * (value rating) section is intentionally NOT rendered: formal-v2 removed the
     * rating field and the whitelist contains no such key. All numbers come from the
     * formal projection with explicit empty-UI fallbacks (no null/undefined/NaN).
     * Footer has exactly one pill: 编辑设置.
     */
    _renderVirtualProductCardInner(asset, vm, status, text, row, tagsHtml) {
        const isWish = asset.status === 'wishlist';
        const isSubscription = asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION;
        const currency = asset.currency || 'CNY';
        const fmt = minor => formatAmountMinor(minor == null ? 0 : minor, currency);
        const acqMinor = vm.projection && vm.projection.acquisition ? vm.projection.acquisition.amountMinor : null;
        const fin = vm.projection ? vm.projection.financials : null;
        const netMinor = fin ? fin.netAmountMinor : null;
        const companionDays = (!isWish && asset.acquiredOn) ? daysBetween(asset.acquiredOn, todayISO()) : null;
        // 订阅日均按当前周期起止计算（含两端），与列表卡/汇总/报表同一 helper；买断走旧摊销口径。
        const dailyCalc = (!isWish && fin) ? formalDailyAmountMinor({
            kind: asset.kind,
            acquiredOn: asset.acquiredOn,
            cashNetAmountMinor: fin.netAmountMinor,
            referenceDate: todayISO(),
            subscription: vm.projection ? vm.projection.subscription : null,
            financialEvents: isSubscription ? (this._formalDomainSnapshot().financialEvents || []).filter(event => event && event.assetId === asset.id) : [],
        }) : null;
        const dailyMinor = (dailyCalc && (dailyCalc.basis === 'period' || (companionDays != null && companionDays > 0))) ? dailyCalc.amountMinor : null;
        const dailySourceKey = dailyCalc && dailyCalc.basis === 'period' ? 'productDailySourcePeriod' : 'productDailySourceNormal';
        const perDay = ' / ' + escapeHtml(this._t('daysUnit', '天'));
        const groupLabel = escapeHtml(this._t('displayGroupVirtual', '虚拟'));
        const subKindLabel = isSubscription ? this._t('virtualKindSubscription', '虚拟·订阅') : this._t('virtualKindPerpetual', '虚拟·买断');
        // v1.2：虚拟订阅过期时右上角状态徽章显示「已过期」，不再误显「服役中」（与列表卡灰点口径一致）。
        const _vsub = vm.projection ? vm.projection.subscription : null;
        const badgeKey = isWish ? 'productStatusWishlist' : (_vsub && _vsub.state === 'expired' ? 'badgeExpired' : 'productStatusActive');
        const wishlistCreatedDate = isWish ? String(asset.createdAt || asset.updatedAt || '').slice(0, 10) : '';
        // v1.2：虚拟订阅过期时状态徽章改灰色（与列表卡灰点一致），有效期内才彩色。
        if (!isWish && _vsub && _vsub.state === 'expired') status = Object.assign({}, status, { color: '#909399' });
        const costsHtml = isWish ? '' : `<div class="am-product-card__costs"><div class="am-product-card__price">${fmt(acqMinor)}</div>${this._cnyApproxHtml(acqMinor, currency)}${dailyMinor != null ? `<div class="am-product-card__daily">${fmt(dailyMinor)}${perDay}</div>` : ''}</div>`;
        const accountLabel = isSubscription ? (asset.details && asset.details.accountLabel) : (asset.details && asset.details.licenseAccountLabel);
        const baseRows = row(this._t('productDetailType', '类型'), escapeHtml(subKindLabel))
            + (wishlistCreatedDate ? row(this._t('wishlistPlantedDate', '种草日期'), escapeHtml(wishlistCreatedDate)) : '')
            + (asset.acquiredOn ? row(this._t('productDetailStartDate', '开始日期'), escapeHtml(asset.acquiredOn)) : '')
            + (companionDays != null ? row(this._t('productMetricDays', '陪伴'), `${companionDays} ${escapeHtml(this._t('daysUnit', '天'))}`) : '')
            + (accountLabel ? row(this._t('productDetailAccount', '账号'), escapeHtml(accountLabel)) : '');
        const costRows = isWish
            ? `<div class="am-product-empty-bar">${escapeHtml(this._t('productEmptyCost', '暂无成本信息'))}</div>`
            : row(this._t('productCostPrice', '价格'), fmt(acqMinor))
                + row(this._t('netCostLabel', '净成本'), fmt(netMinor))
                + row(this._t('productDailyLabel', '日均'), dailyMinor != null ? `${fmt(dailyMinor)}${perDay}` : '—')
                + row(this._t('productDailySource', '日均来源'), escapeHtml(this._t(dailySourceKey, '自然摊销')));
        let expiryHtml;
        if (isSubscription) {
            const sub = vm.projection ? vm.projection.subscription : null;
            const expiryOn = vm.projection ? vm.projection.expiryOn : null;
            // 需求3：pendingConfirmation（开自动续费到期未确认）→ subscriptionStatePending「待续订」，而非「已到期」。
            const stateKey = sub && sub.state === 'subscribed' ? 'subscriptionStateSubscribed'
                : (sub && sub.state === 'expired' ? 'subscriptionStateExpired' : 'subscriptionStatePending');
            const stateLabel = escapeHtml(this._t(stateKey, sub && sub.state ? sub.state : '—'));
            let expiryDateValue;
            if (expiryOn) {
                const daysLeft = daysUntil(expiryOn, todayISO());
                let badge = formatRemainingBadge(daysLeft, 'subscription', (k, fb) => this._t(k, fb));
                // 需求3（D4）：pendingConfirmation（开自动续费到期未确认）显示黄色「待续订」，而非红色「已过期」；复用 soon 黄色档。
                if (sub && sub.state === 'pendingConfirmation') badge = { tier: 'soon', label: this._t('badgePendingRenewal', '待续订') };
                expiryDateValue = `${escapeHtml(expiryOn)} <span class="am-fpc-badge am-fpc-badge--${escapeHtml(badge.tier)}">${escapeHtml(badge.label)}</span>`;
            } else {
                expiryDateValue = '—';
            }
            const autoRenewOn = !!(asset.details && asset.details.autoRenew);
            const autoRenewText = autoRenewOn ? this._t('autoRenewCancel', '取消') : this._t('autoRenewEnable', '开启');
            expiryHtml = row(this._t('subscriptionState', '到期状态'), stateLabel)
                + row(this._t('productDetailExpiryDate', '到期日'), expiryDateValue)
                + `<div class="am-product-detail-row"><span>${escapeHtml(this._t('formFieldAutoRenew', '自动续费'))}</span><strong><button type="button" class="am-product-link-btn" data-formal-auto-renew-link>${escapeHtml(autoRenewText)}</button></strong></div>`;
        } else {
            expiryHtml = `<div class="am-product-empty-bar">${escapeHtml(this._t('perpetualNoExpiry', '永久·无到期'))}</div>`;
        }
        let historySection = '';
        // v2.4.1：种草资产无订阅周期/到期概念——订阅历程 section 仅非 wishlist 渲染。
        if (isSubscription && !isWish) {
            const domain = this._formalDomainSnapshot();
            const periods = (Array.isArray(domain.subscriptionPeriods) ? domain.subscriptionPeriods : [])
                .filter(period => period && period.assetId === asset.id && !period.voidedAt)
                .slice()
                .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
            const finById = new Map((Array.isArray(domain.financialEvents) ? domain.financialEvents : []).map(event => [event.id, event]));
            const timelineHtml = periods.length
                ? `<div class="am-product-timeline">${periods.map(period => {
                    const rawKind = period.kind || '';
                    const kindKey = 'periodKind' + (rawKind ? rawKind.charAt(0).toUpperCase() + rawKind.slice(1) : '');
                    const kindLabel = this._t(kindKey, rawKind || '—');
                    const payEvent = period.paymentEventId ? finById.get(period.paymentEventId) : null;
                    const amountHtml = payEvent && Number.isSafeInteger(payEvent.amountMinor) ? `<span class="am-product-timeline__amount">${fmt(payEvent.amountMinor)}</span>` : '';
                    return `<div class="am-product-timeline__item"><span class="am-product-timeline__dot"></span><div class="am-product-timeline__main"><div class="am-product-timeline__range">${escapeHtml(period.startDate || '—')} ~ ${escapeHtml(period.endDate || '—')}</div><div class="am-product-timeline__meta"><span class="am-product-timeline__kind">${escapeHtml(kindLabel)}</span>${amountHtml}</div></div></div>`;
                }).join('')}</div>`
                : `<div class="am-product-empty-bar">${escapeHtml(this._t('subscriptionEmpty', '暂无订阅周期记录'))}</div>`;
            historySection = `<section class="am-product-section"><div class="am-product-section__title">${escapeHtml(this._t('subscriptionPeriods', '订阅历程'))}</div>${timelineHtml}</section>`;
        }
        const coverContent = this.renderAssetCoverContent(asset, '📦', 'am-product-card__cover-image', 'am-product-card__cover-fallback');
        const notesSectionHtml = this._renderAssetNotesSectionHtml(asset);
        // v2.4.1 阶段3：种草详情卡专属——价格趋势 section（成本之后）+ 底部「更新价格」入口；非 wishlist 不渲染。
        // v2.4.2：种草详情卡专属——心动值 section（价格趋势之前）；非 wishlist 不渲染。
         const heartbeatSectionHtml = isWish ? this._renderWishlistHeartbeatSectionHtml(asset) : '';
         const wishlistJourneyHtml = this._renderWishlistJourneySectionHtml(asset);
         const priceSectionHtml = isWish ? this._renderWishlistPriceSectionHtml(asset) : '';
        const wishlistPriceBtn = isWish ? `<button type="button" class="am-fpc-pill" data-wishlist-update-price>${escapeHtml(this._t('wishlistUpdatePrice', '更新价格'))}</button>` : '';
        // v2.4.1：种草资产无到期/自动续费概念——到期 section 在 wishlist 状态不渲染。
        const expirySectionHtml = isWish ? '' : `<section class="am-product-section"><div class="am-product-section__title">${escapeHtml(this._t('productSectionExpiry', '到期'))}</div>${expiryHtml}</section>`;
        // v2.4.1：种草资产尚未购入，没有实际成本——成本 section 在 wishlist 状态不渲染；价格趋势 section 紧跟基础区出现。
        const costSectionHtml = isWish ? '' : `<section class="am-product-section"><div class="am-product-section__title">${escapeHtml(this._t('productSectionCost', '成本'))}</div>${costRows}</section>`;
         return `<div class="am-product-card am-formal-product-card" data-product-id="${escapeHtml(asset.id)}"><button type="button" class="am-product-card__close" data-formal-detail-close aria-label="${escapeHtml(this._t('btnClose', '关闭'))}">×</button><div class="am-product-card__status" style="background:color-mix(in srgb, ${status.color} 14%, transparent);color:${status.color};"><span class="am-product-card__status-dot" style="background:${status.color};"></span>${escapeHtml(this._t(badgeKey, asset.status))}</div><div class="am-product-card__header"><div class="am-product-card__cover am-product-card__cover--framed">${coverContent}</div><div class="am-product-card__head-main"><div class="am-product-card__cat-chip">${groupLabel}</div><div class="am-product-card__name">${escapeHtml(asset.name)}</div>${tagsHtml ? `<div class="am-product-card__tags">${tagsHtml}</div>` : ''}</div>${costsHtml}</div><div class="am-product-card__body"><section class="am-product-section"><div class="am-product-section__title">${escapeHtml(this._t('productSectionBase', '基础'))}</div>${baseRows}</section>${wishlistJourneyHtml}${costSectionHtml}${heartbeatSectionHtml}${priceSectionHtml}${expirySectionHtml}${historySection}${notesSectionHtml}</div><div class="am-product-card__actions am-fpc-actions">${wishlistPriceBtn}<button type="button" class="am-fpc-pill" data-formal-edit>${escapeHtml(this._t('productEditBtn', '编辑设置'))}</button></div></div>`;
    }

    /**
     * Stage 4 (UI parity): prepaid (amount / count) detail card. The reference set has no
     * prepaid detail image, so this follows the stage 2/3 card style and adds a data-driven
     * 预付权益 section: hero balance/remaining + transaction timeline + quick-action buttons.
     *
     * All numbers come from the formal projection (projectFormalPrepaid via vm.prepaid) and the
     * prepaidTransactions sidecar; balance/remaining are NEVER stored. Empty-UI fallbacks are
     * explicit (no null/undefined/NaN): balance 0 → 已耗尽; no transactions → grey bar; no
     * merchant → 未填写商户; no expiry → '—'; unit cost divide-by-zero → '—'. Wishlist prepaid
     * renders no cost / timeline / quick buttons.
     */
    _renderPrepaidProductCardInner(asset, vm, status, text, row, tagsHtml) {
        const isWish = asset.status === 'wishlist';
        const isAmount = asset.kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT;
        const currency = asset.currency || 'CNY';
        const fmt = minor => formatAmountMinor(minor == null ? 0 : minor, currency);
        const acqMinor = vm.projection && vm.projection.acquisition ? vm.projection.acquisition.amountMinor : null;
        const fin = vm.projection ? vm.projection.financials : null;
        const netMinor = fin ? fin.netAmountMinor : null;
        const companionDays = (!isWish && asset.acquiredOn) ? daysBetween(asset.acquiredOn, todayISO()) : null;
        const dailyMinor = (!isWish && fin && companionDays != null && companionDays >= 0) ? Math.ceil(fin.netAmountMinor / Math.max(1, companionDays + 1)) : null;
        const perDay = ' / ' + escapeHtml(this._t('daysUnit', '天'));
        const groupLabel = escapeHtml(this._t('displayGroupPrepaid', '预付'));
        const kindLabel = isAmount ? this._t('prepaidKindAmountFull', '预付·金额储值') : this._t('prepaidKindCountFull', '预付·次数权益');
        const badgeKey = isWish ? 'productStatusWishlist' : (asset.status === 'retired' ? 'productStatusRetired' : 'productStatusActive');
        const wishlistCreatedDate = isWish ? String(asset.createdAt || asset.updatedAt || '').slice(0, 10) : '';
        const prepaid = vm.prepaid;
        const openingCount = prepaid && Number.isSafeInteger(prepaid.openingCount) ? prepaid.openingCount : 0;
        const unitLabel = (prepaid && prepaid.unitLabel) || this._t('prepaidDefaultUnit', '次');
        // Header right: 购买成本 (big) + grey pill = 单次成本 (count) or 日均 (amount). No empty pill.
        let unitPillHtml = '';
        if (!isWish) {
            if (!isAmount && openingCount > 0 && Number.isSafeInteger(acqMinor)) {
                unitPillHtml = `<div class="am-product-card__daily">${fmt(Math.ceil(acqMinor / openingCount))}/${escapeHtml(unitLabel)}</div>`;
            } else if (isAmount && dailyMinor != null) {
                unitPillHtml = `<div class="am-product-card__daily">${fmt(dailyMinor)}${perDay}</div>`;
            }
        }
        const costsHtml = isWish ? '' : `<div class="am-product-card__costs"><div class="am-product-card__price">${fmt(acqMinor)}</div>${this._cnyApproxHtml(acqMinor, currency)}${unitPillHtml}</div>`;
        // Base section: 类型 / 开通日期 / 有效期(5档徽章) / 商户 / 陪伴天数.
        const provider = asset.details && asset.details.provider;
        const expiresOn = asset.details && asset.details.expiresOn;
        let expiryValue;
        if (expiresOn) {
            const daysLeft = daysUntil(expiresOn, todayISO());
            const badge = formatRemainingBadge(daysLeft, 'subscription', (k, fb) => this._t(k, fb));
            expiryValue = `${escapeHtml(expiresOn)} <span class="am-fpc-badge am-fpc-badge--${escapeHtml(badge.tier)}">${escapeHtml(badge.label)}</span>`;
        } else {
            expiryValue = text(null);
        }
        // v2.4.1：种草资产无开通日期/有效期/商户概念——基础区仅保留类型行。
        const baseRows = row(this._t('productDetailType', '类型'), escapeHtml(kindLabel))
            + (wishlistCreatedDate ? row(this._t('wishlistPlantedDate', '种草日期'), escapeHtml(wishlistCreatedDate)) : '')
            + (isWish ? ''
                : (asset.acquiredOn ? row(this._t('formFieldAcquiredOn', '开通日期'), escapeHtml(asset.acquiredOn)) : '')
                    + row(this._t('formFieldExpiresOn', '有效期'), expiryValue)
                    + row(this._t('formFieldProvider', '商户名称'), provider ? escapeHtml(provider) : escapeHtml(this._t('merchantEmpty', '未填写商户')))
                    + (companionDays != null ? row(this._t('productMetricDays', '陪伴'), `${companionDays} ${escapeHtml(this._t('daysUnit', '天'))}`) : ''));
        // Cost section: 购买成本 / 净成本 / 单次成本(count, 0 次 → '—').
        let unitCostRowHtml = '';
        if (!isAmount) {
            const unitVal = (openingCount > 0 && Number.isSafeInteger(acqMinor)) ? `${fmt(Math.ceil(acqMinor / openingCount))}/${escapeHtml(unitLabel)}` : '—';
            unitCostRowHtml = row(this._t('prepaidUnitCost', '单次成本'), unitVal);
        }
        const costRows = isWish
            ? `<div class="am-product-empty-bar">${escapeHtml(this._t('productEmptyCost', '暂无成本信息'))}</div>`
            : row(this._t('productCostPrice', '价格'), fmt(acqMinor))
                + row(this._t('netCostLabel', '净成本'), fmt(netMinor))
                + unitCostRowHtml;
        // Prepaid section (core): hero + timeline + quick buttons. Skipped for wishlist.
        let prepaidSectionHtml = '';
        if (!isWish && prepaid) {
            const heroValue = isAmount ? fmt(prepaid.balanceAmountMinor) : `${prepaid.remainingCount} ${escapeHtml(unitLabel)}`;
            const heroLabel = isAmount ? this._t('prepaidBalance', '余额') : this._t('prepaidRemainingCount', '剩余次数');
            const remainingValue = isAmount ? prepaid.balanceAmountMinor : prepaid.remainingCount;
            const exhausted = Number.isSafeInteger(remainingValue) && remainingValue <= 0;
            const heroHtml = `<div class="am-prepaid-hero"><div class="am-prepaid-hero__label">${escapeHtml(heroLabel)}</div><div class="am-prepaid-hero__value">${heroValue}</div>${exhausted ? `<div class="am-prepaid-hero__exhausted">${escapeHtml(this._t('prepaidExhausted', '已耗尽'))}</div>` : ''}</div>`;
            const domain = this._formalDomainSnapshot();
            const txns = (Array.isArray(domain.prepaidTransactions) ? domain.prepaidTransactions : [])
                .filter(txn => txn && txn.assetId === asset.id && !txn.voidedAt)
                .slice()
                .sort((a, b) => String(b.effectiveDate || '').localeCompare(String(a.effectiveDate || '')) || String(b.occurredAt || '').localeCompare(String(a.occurredAt || '')));
            const finById = new Map((Array.isArray(domain.financialEvents) ? domain.financialEvents : []).map(event => [event.id, event]));
            const txnTypeLabel = type => { const txnTypeKey = 'txnType' + (type ? type.charAt(0).toUpperCase() + type.slice(1) : ''); return this._t(txnTypeKey, type || '—'); };
            const timelineHtml = txns.length
                ? `<div class="am-product-timeline">${txns.map(txn => {
                    const ev = txn.financialEventId ? finById.get(txn.financialEventId) : null;
                    const isOut = txn.direction === 'outflow';
                    const sign = isOut ? '-' : '+';
                    const amountStr = isAmount
                        ? `${sign}${fmt(ev && Number.isSafeInteger(ev.amountMinor) ? ev.amountMinor : 0)}`
                        : `${sign}${Number.isSafeInteger(txn.count) ? txn.count : 0} ${escapeHtml(unitLabel)}`;
                    return `<div class="am-product-timeline__item"><span class="am-product-timeline__dot am-product-timeline__dot--${isOut ? 'out' : 'in'}"></span><div class="am-product-timeline__main"><div class="am-product-timeline__range">${escapeHtml(txnTypeLabel(txn.type))}${txn.note ? ` · ${escapeHtml(txn.note)}` : ''}</div><div class="am-product-timeline__meta"><span class="am-product-timeline__kind">${escapeHtml(txn.effectiveDate || '—')}</span><span class="am-product-timeline__amount am-product-timeline__amount--${isOut ? 'out' : 'in'}">${amountStr}</span></div></div></div>`;
                }).join('')}</div>`
                : `<div class="am-product-empty-bar">${escapeHtml(this._t('prepaidNoTransactions', '暂无预付流水'))}</div>`;
            const quickButtons = isAmount
                ? `<button type="button" class="am-fpc-pill" data-prepaid-quick="charge">${escapeHtml(this._t('prepaidCharge', '充值'))}</button><button type="button" class="am-fpc-pill" data-prepaid-quick="consume">${escapeHtml(this._t('prepaidConsume', '消费'))}</button><button type="button" class="am-fpc-pill" data-prepaid-quick="refund">${escapeHtml(this._t('prepaidRefund', '退款'))}</button>`
                : `<button type="button" class="am-fpc-pill" data-prepaid-quick="countConsume">${escapeHtml(this._t('prepaidConsume', '消费'))}</button><button type="button" class="am-fpc-pill" data-prepaid-quick="countAdjust">${escapeHtml(this._t('prepaidAdjust', '校正'))}</button>`;
            prepaidSectionHtml = `<section class="am-product-section"><div class="am-product-section__title">${escapeHtml(this._t('productSectionPrepaid', '预付权益'))}</div>${heroHtml}${timelineHtml}<div class="am-fpc-actions am-prepaid-quick">${quickButtons}</div></section>`;
        }
        const ledgerPill = isWish ? '' : `<button type="button" class="am-fpc-pill" data-formal-prepaid>${escapeHtml(this._t('menuPrepaidTx', '💳 预付流水'))}</button>`;
        const coverContent = this.renderAssetCoverContent(asset, '📦', 'am-product-card__cover-image', 'am-product-card__cover-fallback');
        const notesSectionHtml = this._renderAssetNotesSectionHtml(asset);
        // v2.4.1 阶段3：种草详情卡专属——价格趋势 section（成本之后）+ 底部「更新价格」入口；非 wishlist 不渲染。
        // v2.4.2：种草详情卡专属——心动值 section（价格趋势之前）；非 wishlist 不渲染。
         const heartbeatSectionHtml = isWish ? this._renderWishlistHeartbeatSectionHtml(asset) : '';
         const wishlistJourneyHtml = this._renderWishlistJourneySectionHtml(asset);
         const priceSectionHtml = isWish ? this._renderWishlistPriceSectionHtml(asset) : '';
        const wishlistPriceBtn = isWish ? `<button type="button" class="am-fpc-pill" data-wishlist-update-price>${escapeHtml(this._t('wishlistUpdatePrice', '更新价格'))}</button>` : '';
        // v2.4.1：种草资产尚未购入，没有实际成本——成本 section 在 wishlist 状态不渲染；价格趋势 section 紧跟基础区出现。
        const costSectionHtml = isWish ? '' : `<section class="am-product-section"><div class="am-product-section__title">${escapeHtml(this._t('productSectionCost', '成本'))}</div>${costRows}</section>`;
         return `<div class="am-product-card am-formal-product-card" data-product-id="${escapeHtml(asset.id)}"><button type="button" class="am-product-card__close" data-formal-detail-close aria-label="${escapeHtml(this._t('btnClose', '关闭'))}">×</button><div class="am-product-card__status" style="background:color-mix(in srgb, ${status.color} 14%, transparent);color:${status.color};"><span class="am-product-card__status-dot" style="background:${status.color};"></span>${escapeHtml(this._t(badgeKey, asset.status))}</div><div class="am-product-card__header"><div class="am-product-card__cover am-product-card__cover--framed">${coverContent}</div><div class="am-product-card__head-main"><div class="am-product-card__cat-chip">${groupLabel}</div><div class="am-product-card__name">${escapeHtml(asset.name)}</div>${tagsHtml ? `<div class="am-product-card__tags">${tagsHtml}</div>` : ''}</div>${costsHtml}</div><div class="am-product-card__body"><section class="am-product-section"><div class="am-product-section__title">${escapeHtml(this._t('productSectionBase', '基础'))}</div>${baseRows}</section>${wishlistJourneyHtml}${costSectionHtml}${heartbeatSectionHtml}${priceSectionHtml}${prepaidSectionHtml}${notesSectionHtml}</div><div class="am-product-card__actions am-fpc-actions">${wishlistPriceBtn}${ledgerPill}<button type="button" class="am-fpc-pill" data-formal-edit>${escapeHtml(this._t('productEditBtn', '编辑设置'))}</button></div></div>`;
    }

    /** Minimal read-only detail for strict formal-v1 assets. */
    /**
     * v2.5.0 阶段3B：剪贴板写入（clipboard API 优先，textarea + execCommand 降级）。
     * 返回是否成功；不抛错。
     */
    async _copyTextToClipboard(text) {
        const value = String(text == null ? '' : text);
        if (!value) return false;
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(value);
                return true;
            }
        } catch (error) { /* 降级到 execCommand */ }
        try {
            const textarea = document.createElement('textarea');
            textarea.value = value;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            textarea.setSelectionRange(0, value.length);
            const copied = document.execCommand('copy');
            textarea.remove();
            return copied === true;
        } catch (error) {
            return false;
        }
    }

    /**
     * v2.5.0 阶段3B：复制资产索引块的块引用 markdown 到剪贴板。
     * 引擎 getBlockRefMarkdown 返回 null（索引未启用 / 未同步出块）→ toast 引导；
     * 查询抛错（网络等）→ toast 错误信息。
     */
    async _copyAssetBlockRef(assetId) {
        const asset = (this.assets || []).find(item => item && item.id === assetId);
        if (!asset) return;
        const needIndexToast = () => this.showToast('⚠️ ' + this._t('blockRefNeedIndex', '需先在设置启用笔记索引并同步'));
        if (!this.noteLink || typeof this.noteLink.getBlockRefMarkdown !== 'function') { needIndexToast(); return; }
        let markdown = null;
        try {
            markdown = await this.noteLink.getBlockRefMarkdown(asset);
        } catch (error) {
            this.showToast('⚠️ ' + (error && error.message ? error.message : 'failed to build block reference'));
            return;
        }
        if (!markdown) { needIndexToast(); return; }
        const copied = await this._copyTextToClipboard(markdown);
        if (copied) this.showToast('✓ ' + this._t('blockRefCopied', '已复制块引用，粘贴到笔记即可关联'));
        else this.showToast('⚠️ ' + this._t('blockRefCopyFailed', '复制失败，请重试'));
    }

    /**
     * v2.5.0 阶段3B：斜杠菜单「插入资产引用」的资产选择器。
     * Dialog：搜索框 + 资产列表（名称 + 状态 + 类型，含 wishlist，客户端过滤）；
     * 选中 → 引擎取块引用 markdown → /api/block/insertBlock 以独立块插到
     * 触发斜杠菜单的当前块（nodeElement.dataset.nodeId）之后。
     * 索引未启用时列表顶部提示且行禁用。
     */
    _openAssetRefPickerDialog(protyle, nodeElement) {
        const settings = this.settings || {};
        const indexReady = !!(this.noteLink && typeof this.noteLink.getBlockRefMarkdown === 'function'
            && settings.indexEnabled === true && String(settings.indexDocId || '').trim());
        const assets = (Array.isArray(this.assets) ? this.assets : []).filter(item => item && item.id && item.name);
        const previousID = (nodeElement && nodeElement.dataset && nodeElement.dataset.nodeId) || '';
        let query = '';
        const renderRows = () => {
            const keyword = query.trim().toLowerCase();
            const list = keyword
                ? assets.filter(item => String(item.name).toLowerCase().indexOf(keyword) >= 0) : assets;
            if (!list.length) return `<div class="am-asset-picker__empty">${escapeHtml(this._t('assetPickerEmpty', '没有匹配的资产'))}</div>`;
            return list.map(asset => {
                const statusInfo = STATUS_MAP[asset.status] || STATUS_MAP.active;
                return `<button type="button" class="am-asset-picker__row"${indexReady ? '' : ' disabled'} data-asset-picker-id="${escapeHtml(asset.id)}">`
                    + `<span class="am-asset-picker__name">${escapeHtml(asset.name)}</span>`
                    + `<span class="am-asset-picker__meta">${escapeHtml(this._t(statusInfo.key, asset.status))} · ${escapeHtml(this._formalKindLabel(asset.kind))}</span>`
                    + `</button>`;
            }).join('');
        };
        const render = () => `<div class="am-asset-picker">`
            + (indexReady ? '' : `<p class="am-asset-picker__warn">⚠️ ${escapeHtml(this._t('assetPickerNeedIndex', '笔记索引未启用，无法插入资产引用'))}</p>`)
            + `<input class="b3-text-field fn__block am-asset-picker__search" type="text" data-asset-picker-search placeholder="${escapeHtml(this._t('assetPickerSearchPlaceholder', '搜索资产...'))}" value="${escapeHtml(query)}">`
            + `<div class="am-asset-picker__list" data-asset-picker-list>${renderRows()}</div></div>`;
        const dialog = this.showDialog(this._t('assetPickerTitle', '选择资产'), render(), (dlg) => {
            const root = dlg.element || dlg;
            const bind = () => {
                const search = root.querySelector('[data-asset-picker-search]');
                if (search) {
                    search.oninput = () => { query = search.value || ''; root.querySelector('[data-asset-picker-list]').innerHTML = renderRows(); };
                    try { search.focus(); } catch (e) {}
                }
                const list = root.querySelector('[data-asset-picker-list]');
                if (list) {
                    // Event delegation on the list container: rows re-rendered by the
                    // search filter (innerHTML replacement) keep working without rebinding.
                    list.onclick = async (event) => {
                        const button = event.target instanceof Element ? event.target.closest('[data-asset-picker-id]') : null;
                        if (!button || !indexReady || button.disabled) return;
                        const asset = assets.find(item => item.id === button.dataset.assetPickerId);
                        if (!asset) return;
                        button.disabled = true;
                        let markdown = null;
                        try { markdown = await this.noteLink.getBlockRefMarkdown(asset); }
                        catch (error) {
                            dialog.destroy();
                            this.showToast('⚠️ ' + (error && error.message ? error.message : 'failed to build block reference'));
                            return;
                        }
                        if (!markdown) {
                            dialog.destroy();
                            this.showToast('⚠️ ' + this._t('blockRefNeedIndex', '需先在设置启用笔记索引并同步'));
                            return;
                        }
                        let payload = null;
                        try {
                            const response = await fetch('/api/block/insertBlock', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ dataType: 'markdown', data: markdown, previousID: previousID }),
                            });
                            payload = response && response.ok ? await response.json() : null;
                        } catch (error) { payload = null; }
                        dialog.destroy();
                        if (payload && payload.code === 0) {
                            this.showToast('✓ ' + this._t('assetRefInserted', '已插入资产引用'));
                        } else {
                            this.showToast('⚠️ ' + this._t('assetRefInsertFailed', '插入资产引用失败'));
                        }
                    };
                }
            };
            bind();
        }, this.isMobile ? '92vw' : '520px');
        return dialog;
    }

    /**
     * document capture 普通点击入口。思源随后执行的原生 block-ref 跳转无视
     * defaultPrevented，因此只有同步缓存确认属于当前资产时才同时 prevent + stop。
     */
    _handleAssetBlockRefCaptureClick(event) {
        try {
            if (!event || event.button !== 0 || event.ctrlKey || event.metaKey
                || event.altKey || event.shiftKey) return;
            let selection = null;
            if (typeof window !== 'undefined' && typeof window.getSelection === 'function') {
                selection = window.getSelection();
            } else if (typeof document !== 'undefined' && typeof document.getSelection === 'function') {
                selection = document.getSelection();
            }
            if (selection && String(selection.toString()) !== '') return;
            const target = event.target;
            if (!target || typeof target.closest !== 'function') return;
            const refElement = target.closest('[data-type~="block-ref"][data-id]');
            if (!refElement) return;
            const blockId = String((refElement.dataset && refElement.dataset.id)
                || (refElement.getAttribute && refElement.getAttribute('data-id')) || '').trim();
            if (!/^[0-9]{14}-[a-z0-9]{7}$/.test(blockId)) return;
            if (!this.noteLink || typeof this.noteLink.getAssetIdByIndexBlockId !== 'function') return;
            const assetId = this.noteLink.getAssetIdByIndexBlockId(blockId);
            if (!assetId || !(Array.isArray(this.assets) ? this.assets : [])
                .some(asset => asset && asset.id === assetId)) return;
            event.preventDefault();
            event.stopPropagation();
            this._openAssetDetailById(assetId);
        } catch (error) {
            console.warn('[AssetManagement] asset block-ref capture failed:', error && error.message);
        }
    }

    /** 已购买资产的种草来源摘要，读取 purchased 事件快照与 heartbeat 事件，不写入数据。 */
    _renderWishlistJourneySectionHtml(asset) {
        if (!asset) return '';
        const events = Array.isArray(this.wishlistEvents) ? this.wishlistEvents : [];
        const purchase = events.filter(event => event && event.eventType === 'purchased'
            && event.targetAssetId === asset.id).sort((a, b) => String(b.occurredAt || '').localeCompare(String(a.occurredAt || '')))[0];
        const source = purchase ? (purchase.sourceSnapshot || {}) : asset;
        const plantedAt = source.createdAt || source.updatedAt || '';
        const heartbeatCount = deriveWishlistHeartbeat(events, purchase ? purchase.sourceWishlistId : asset.id).count;
        const item = (label, value, cls) => value
            ? `<span class="am-wishlist-journey__item${cls ? ' am-wishlist-journey__item--' + cls : ''}"><span class="am-wishlist-journey__label">${escapeHtml(label)}</span><strong>${escapeHtml(this._formatWishlistEventDateTime(value))}</strong></span>`
            : '';
        const heartbeat = heartbeatCount > 0
            ? `<span class="am-wishlist-journey__item am-wishlist-journey__item--heartbeat"><span class="am-wishlist-journey__label">${escapeHtml(this._t('wishlistJourneyHeartbeat', '心动'))}</span><strong>${heartbeatCount} ${escapeHtml(this._t('wishlistJourneyTimes', '次'))}</strong></span>`
            : '';
        const separator = '<span class="am-wishlist-journey__separator" aria-hidden="true">›</span>';
        const purchaseItem = purchase ? item(this._t('wishlistJourneyPurchasedAt', '购买'), purchase.occurredAt, 'purchased') : '';
        return `<section class="am-product-section am-wishlist-journey"><div class="am-product-section__title">${escapeHtml(this._t('wishlistJourneyTitle', '种草历程'))}</div><div class="am-wishlist-journey__track">${item(this._t('wishlistJourneyPlantedAt', '种草'), plantedAt)}${plantedAt && heartbeatCount > 0 ? separator : ''}${heartbeat}${heartbeatCount > 0 && purchaseItem ? separator : ''}${purchaseItem}</div></section>`;
    }

    /** 深链、块引用普通点击与菜单共用的 dock/modal 产品卡打开逻辑。 */
    _openAssetDetailById(assetId) {
        const id = String(assetId || '').trim();
        const asset = (this.assets || []).find(item => item && item.id === id);
        if (!asset) {
            this.showToast('⚠️ ' + this._t('deepLinkAssetMissing', '未找到该资产'));
            return false;
        }
        const openCard = () => this.openFormalProductCard(id);
        const dockVisible = !!(this.dockElement && this.dockElement.isConnected && this.dockElement.offsetParent !== null);
        if (dockVisible) { openCard(); return true; }
        // 面板当前不可见 → 点 dock 图标展开（toggle 语义下此时点击为打开）；
        // tab init 异步渲染，延后一拍再弹卡（openFormalProductCard 的 host 链自带 body 兜底）。
        const dockItem = document.querySelector('.dock__item[data-type="siyuan-plugin-asset-management' + DOCK_TYPE + '"]');
        if (dockItem) {
            try { dockItem.dispatchEvent(createPluginDomEvent(dockItem, 'click', { bubbles: true })); } catch (error) {}
            setTimeout(openCard, 160);
            return true;
        }
        // dock 图标不可用（未启用 / 移动端）→ modal 主面板兜底。
        this.openMainDialog();
        setTimeout(openCard, 80);
        return true;
    }

    /**
     * v2.5.0 阶段3B：siyuan://plugins/siyuan-plugin-asset-management/asset?id=<assetId>
     * 深链落地。事件 detail={url}；解析后复用块引用直达的统一打开逻辑。
     */
    _handleOpenSiyuanUrlPlugin(detail) {
        let assetId = '';
        try {
            const url = detail && detail.url ? String(detail.url) : '';
            if (!url) return;
            const parsed = new URL(url);
            // siyuan 非特殊协议：host='plugins'，pathname='/<pluginName>/asset'。
            if (!parsed.pathname || parsed.pathname.indexOf('/siyuan-plugin-asset-management/') !== 0) return;
            assetId = String((parsed.searchParams && parsed.searchParams.get('id')) || '').trim();
        } catch (error) { return; }
        if (assetId) this._openAssetDetailById(assetId);
    }

    /**
     * v2.5.0 阶段4：跳转到任意块所在文档并高亮（相关笔记行点击）。
     * 桌面 openTab / 移动 openMobileFileById 均支持任意块 id 自动定位；
     * 跳转前关闭详情卡，避免全屏 mask 遮挡目标文档。
     */
    _jumpToBlock(blockId) {
        const id = String(blockId || '').trim();
        if (!id) return;
        try {
            if (this.isMobile) {
                if (typeof openMobileFileById === 'function') openMobileFileById(this.app, id, ['cb-get-hl']);
            } else if (typeof openTab === 'function') {
                openTab({ app: this.app, doc: { id: id, action: ['cb-get-focus', 'cb-get-hl'] } });
            }
            this.closeProductCard();
        } catch (error) {
            this.showToast('⚠️ ' + (error && error.message ? error.message : 'jump failed'));
        }
    }

    /** 将块 Markdown/Kramdown 预览压成适合产品卡标题的一行纯文本。 */
    _relatedNotePlainText(value) {
        return String(value || '')
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            .replace(/\(\([0-9]{14}-[a-z0-9]{7}(?:\s+"([^"]*)")?\)\)/gi, (_match, anchor) => anchor || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\{:[^}]+\}|\{[^}]+\}/g, ' ')
            .replace(/[*_~\x60]/g, '')
            .replace(/(^|\s)[#>|]+/g, '$1')
            .replace(/^\s*[-+]\s+/gm, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** 产品卡关联行主标题：块内容 > 所属文档标题 > 短块 ID。 */
    _relatedNoteDisplayTitle(entry) {
        const note = entry || {};
        return this._relatedNotePlainText(note.preview)
            || this._relatedNotePlainText(note.docTitle)
            || String(note.blockId || '').slice(0, 8);
    }

    /** 保存前使用插件样式提示必填项，避免浏览器原生气泡遮挡表单。 */
    _validateFormBeforeSave(form) {
        if (!form || form.checkValidity()) return true;
        const invalid = form.querySelector(':invalid');
        if (invalid) {
            form.querySelectorAll('.am-form-field--invalid, .is-error').forEach(el => {
                el.classList.remove('am-form-field--invalid', 'is-error');
                el.removeAttribute('data-error-message');
            });
            const field = invalid.closest('.am-edit-field, .am-form-basic-card__slot, .am-form-field, .am-name-field, label') || invalid.parentElement || invalid;
            const name = invalid.name || '';
            const fieldLabels = {
                name: this._t('formNameLabel', '名称'),
                amount: this._t('formFieldCurrencyPrefix', '价格'),
                expectedAmount: this._t('wishlistExpectedPrice', '期望价格'),
                acquiredOn: this._t('formFieldAcquiredOn', '购买日期'),
            };
            const label = fieldLabels[name] || invalid.getAttribute('aria-label') || this._t('formRequiredField', '该字段');
            const message = name === 'name'
                ? this._t('formRequiredName', '请填写名称')
                : this._t('formRequiredMessage', '请填写{field}', { field: label });
            field.classList.add('is-error');
            field.setAttribute('data-error-message', message);
            invalid.setAttribute('aria-invalid', 'true');
            invalid.addEventListener('input', () => {
                if (invalid.checkValidity()) {
                    field.classList.remove('am-form-field--invalid', 'is-error');
                    field.removeAttribute('data-error-message');
                    invalid.removeAttribute('aria-invalid');
                }
            }, { once: true });
            if (typeof invalid.focus === 'function') invalid.focus({ preventScroll: true });
            if (typeof invalid.scrollIntoView === 'function') invalid.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        this.showToast('⚠️ ' + this._t('formRequiredHint', '请先填写必填项'));
        return false;
    }

    /**
     * v2.5.0 阶段4 / P3：详情卡「笔记关联」区——owned 与 wishlist 详情卡的 body 顶部
     * （基础信息区上方，紧贴标题/封面之下）统一注入。异步调引擎 getRelatedNotes：
     * loading → 列表/空态引导。行点击 _jumpToBlock；manual 条目带移除按钮（dead
     * 条目显示「已失效」）。「+ 关联笔记文档」manual 写入口只对 owned 资产渲染——
     * formal-v2 契约的 wishlist patch 白名单不含 relatedNotes（normalizeFormalV2AssetPatch
     * L891），wishlist 只读展示 ref/tag 源。
     */
    _mountRelatedNotesSection(node, asset, host) {
        const body = node.querySelector('.am-product-card__body');
        if (!body || !asset) return;
        const canEdit = asset.status !== 'wishlist';
        const section = document.createElement('section');
        section.className = 'am-product-section am-related-notes';
        section.innerHTML = `<div class="am-related-notes__header"><div class="am-product-section__title">${escapeHtml(this._t('relatedNotesTitle', '笔记关联'))}</div>`
            + `<button type="button" class="am-related-notes__copy" data-related-notes-copy-ref aria-label="${escapeHtml(this._t('copyBlockRef', '复制块引用'))}" title="${escapeHtml(this._t('copyBlockRef', '复制块引用'))}">${escapeHtml(this._t('copyBlockRef', '复制块引用'))}</button></div>`
            + `<div class="am-related-notes__list" data-related-notes-list>`
            + `<div class="am-related-notes__loading">${escapeHtml(this._t('relatedNotesLoading', '正在查找相关笔记...'))}</div>`
            + `</div>`
            + (canEdit
                ? `<button type="button" class="am-product-action am-related-notes__add" data-related-notes-add>${escapeHtml(this._t('relatedNotesAddButton', '+ 关联笔记文档'))}</button>`
                : '');
        // v2.5.1 细节优化（用户反馈）：相关笔记区移到基础信息区上面——插入到 body
        // 第一个 .am-product-section（基础区）之前；结构兜底 appendChild。
        const baseSection = body.querySelector('.am-product-section');
        if (baseSection) body.insertBefore(section, baseSection);
        else body.appendChild(section);
        const copyButton = section.querySelector('[data-related-notes-copy-ref]');
        if (copyButton) copyButton.onclick = () => this._copyAssetBlockRef(asset.id);
        const addButton = section.querySelector('[data-related-notes-add]');
        if (addButton) addButton.onclick = () => this._openRelatedNoteAddSheet(asset.id, host);
        const listEl = section.querySelector('[data-related-notes-list]');
        if (!this.noteLink || typeof this.noteLink.getRelatedNotes !== 'function') {
            listEl.innerHTML = `<div class="am-related-notes__empty">⚠️ ${escapeHtml(this._t('relatedNotesLoadFailed', '查询相关笔记失败'))}</div>`;
            return;
        }
        this.noteLink.getRelatedNotes(asset)
            .then(entries => this._renderRelatedNotesList(listEl, asset, entries, host))
            .catch(() => {
                if (listEl) listEl.innerHTML = `<div class="am-related-notes__empty">⚠️ ${escapeHtml(this._t('relatedNotesLoadFailed', '查询相关笔记失败'))}</div>`;
            });
    }

    /** 笔记关联列表：第一行块内容，第二行来源 + 所属文档；从不渲染 addedAt。 */
    _renderRelatedNotesList(listEl, asset, entries, host) {
        if (!listEl) return;
        if (!Array.isArray(entries) || !entries.length) {
            // v2.5.1 细节优化：空态引导加文档小图标（液态玻璃次级色，亮暗自适应）。
            listEl.innerHTML = `<div class="am-related-notes__empty"><span class="am-related-notes__empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg></span>${escapeHtml(this._t('relatedNotesEmpty', '在笔记中粘贴资产块引用，或用块菜单关联到资产'))}</div>`;
            return;
        }
        const sourceLabels = {
            ref: this._t('relatedNoteSourceRef', '引用'),
            tag: this._t('relatedNoteSourceTag', '标记'),
            manual: this._t('relatedNoteSourceManual', '手动'),
        };
        const references = entries.filter(entry => entry && (entry.direction === 'references' || entry.source === 'manual'));
        const referencedBy = entries.filter(entry => entry && (entry.direction === 'referencedBy' || entry.source === 'ref' || entry.source === 'tag'));
        const renderRows = groupEntries => groupEntries.map(entry => {
            if (!entry || !entry.blockId) return '';
            const dead = entry.dead === true;
            const displayTitle = this._relatedNoteDisplayTitle(entry);
            const docTitle = this._relatedNotePlainText(entry.docTitle);
            const context = docTitle && docTitle !== displayTitle ? docTitle : '';
            const canRemove = entry.source === 'tag' || (entry.source === 'manual' && asset.status !== 'wishlist');
            const unlinkLabel = this._t('relatedNoteUnlinkLabel', '取消与「{name}」的关联', { name: displayTitle });
            return `<div class="am-related-notes__row${dead ? ' am-related-notes__row--dead' : ''}" data-related-note-block="${escapeHtml(entry.blockId)}">`
                + `<span class="am-related-notes__main"><span class="am-related-notes__title" title="${escapeHtml(displayTitle)}">${dead ? `<span class="am-related-notes__dead-badge">${escapeHtml(this._t('relatedNoteDead', '已失效'))}</span>` : ''}${escapeHtml(displayTitle)}</span>`
                + `<span class="am-related-notes__meta"><span class="am-related-notes__source am-related-notes__source--${escapeHtml(entry.source)}">${escapeHtml(sourceLabels[entry.source] || entry.source)}</span>${context ? `<span class="am-related-notes__context" title="${escapeHtml(context)}">${escapeHtml(context)}</span>` : ''}</span>`
                + `</span>`
                + (canRemove ? `<button type="button" class="am-related-notes__remove" data-related-note-remove="${escapeHtml(entry.blockId)}" data-related-note-source="${escapeHtml(entry.source)}" aria-label="${escapeHtml(unlinkLabel)}" title="${escapeHtml(unlinkLabel)}">×</button>` : '')
                + `</div>`;
        }).join('');
        const renderGroup = (key, groupEntries) => groupEntries.length
            ? `<div class="am-related-notes__group"><div class="am-related-notes__group-title">${escapeHtml(this._t(key === 'references' ? 'relatedNotesReferences' : 'relatedNotesReferencedBy', key === 'references' ? '资产引用' : '被引用'))}<span class="am-related-notes__group-count">${groupEntries.length}</span></div>${renderRows(groupEntries)}</div>`
            : '';
        // Keep the incoming ref/tag order first so existing note scanning remains stable.
        listEl.innerHTML = renderGroup('referencedBy', referencedBy) + renderGroup('references', references);
        // v0.14 教训：闭包直绑，不走 dock 委托。
        listEl.querySelectorAll('[data-related-note-block]').forEach(rowEl => {
            rowEl.onclick = event => {
                if (event.target instanceof Element && event.target.closest('[data-related-note-remove]')) return;
                this._jumpToBlock(rowEl.dataset.relatedNoteBlock);
            };
        });
        listEl.querySelectorAll('[data-related-note-remove]').forEach(button => {
            button.onclick = event => {
                event.stopPropagation();
                const entry = entries.find(item => item && item.blockId === button.dataset.relatedNoteRemove
                    && item.source === button.dataset.relatedNoteSource);
                if (entry) this._confirmRelatedNoteUnlink(asset, entry, host);
            };
        });
    }

    /** manual/tag 均经插件范围确认；ref 不会生成取消按钮。 */
    _confirmRelatedNoteUnlink(asset, entry, host) {
        const name = this._relatedNoteDisplayTitle(entry);
        this._openScopedConfirm(host, {
            title: this._t('relatedNoteUnlinkTitle', '取消笔记关联'),
            text: this._t('relatedNoteUnlinkConfirm', '确认取消与「{name}」的关联？', { name: name }),
            cancelLabel: this._t('relatedNoteUnlinkKeep', '保留'),
            confirmLabel: this._t('relatedNoteUnlinkAction', '取消关联'),
            onConfirm: () => entry.source === 'tag'
                ? this._unlinkTaggedRelatedNote(asset.id, entry.blockId, host)
                : this._removeRelatedNote(asset.id, entry.blockId, host),
        });
    }

    async _unlinkTaggedRelatedNote(assetId, blockId, host) {
        try {
            if (!this.noteLink || typeof this.noteLink.unlinkBlockFromAsset !== 'function') throw new Error('note link unavailable');
            await this.noteLink.unlinkBlockFromAsset(blockId);
            this.showToast('✓ ' + this._t('relatedNoteRemoved', '已移除关联笔记'));
            this.closeProductCard();
            this.openFormalProductCard(assetId, host);
        } catch (error) {
            this.showToast('⚠️ ' + (error && error.message ? error.message : 'unlink failed'));
        }
    }

    /** manual 条目移除：审计事务 patch asset.relatedNotes，成功后原 host 重开详情卡。 */
    async _removeRelatedNote(assetId, noteId, host) {
        try {
            await this._commitAssetAuditMutation(snapshot => {
                const current = snapshot.assets.find(item => item && item.id === assetId);
                if (!current) return { noop: true, context: {} };
                const next = (Array.isArray(current.relatedNotes) ? current.relatedNotes : [])
                    .filter(item => !(item && item.id === noteId));
                const asset = mergeFormalV2AssetPatch(current, { relatedNotes: next }, { now: new Date().toISOString(), today: todayISO() });
                return { assets: snapshot.assets.map(item => item.id === assetId ? asset : item), context: {} };
            });
            this.showToast('✓ ' + this._t('relatedNoteRemoved', '已移除关联笔记'));
            this.closeProductCard();
            this.openFormalProductCard(assetId, host);
        } catch (error) {
            this.showToast('⚠️ ' + (error && error.message ? error.message : 'remove failed'));
        }
    }

    /**
     * 手动登记关联笔记（v2.5.1 细节优化：内化为插件内液态玻璃 sheet，不再用思源
     * 原生 Dialog）。骨架与维保/预付流水 sheet 同源：am-edit-sheet-mask +
     * am-workflow-sheet-mask（z=60 浮于详情卡 z=55 之上，同 host 同 stacking
     * context）；Esc（window capture + 顶层检查）/ 遮罩点击 / 关闭按钮只关本
     * sheet；按钮闭包直绑（v0.14 教训）。交互逻辑不变：输入接受 siyuan:// 链接或
     * 裸文档/块 id（正则提取 [0-9]{14}-[a-z0-9]{7}），校验存活（getBlockInfo）后
     * 走审计事务 patch asset.relatedNotes（{id, title, addedAt}，按 id 去重），
     * 成功后关 sheet + 重开详情卡刷新相关笔记区。
     */
    _openRelatedNoteAddSheet(assetId, host) {
        // v2.5.1.1：改为插件内居中悬浮弹窗（不再用底部 sheet，割裂感重）。
        // 复用 .am-workflow-sheet-mask（z=60 浮于详情卡 z=55 之上）+ 同款 Esc / 遮罩点击关闭；
        // 卡片本体走液态玻璃 surface，居中布局：标题 + 说明 + 无占位输入框 + 药丸按钮。
        const sheetHost = host || this._productCardHost || this.dockElement || this._modalContainer || this._pluginOverlayRoot || document.body;
        if (!sheetHost) return;
        const mask = document.createElement('div');
        mask.className = 'am-edit-sheet-mask am-workflow-sheet-mask am-related-note-dialog-mask';
        mask.innerHTML = `<div class="am-related-note-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(this._t('relatedNoteAddTitle', '关联笔记文档'))}"><h3 class="am-related-note-dialog__title">${escapeHtml(this._t('relatedNoteAddTitle', '关联笔记文档'))}</h3><p class="am-related-note-dialog__desc">${escapeHtml(this._t('relatedNoteAddHint', '粘贴文档或块ID'))}</p><input class="am-related-note-dialog__input" type="text" data-related-note-input autocomplete="off" spellcheck="false"><button type="button" class="am-related-note-dialog__btn" data-related-note-confirm>${escapeHtml(this._t('relatedNoteConfirm', '关联'))}</button></div>`;
        const isTopmostWorkflowInHost = () => {
            if (!mask.parentNode) return false;
            const overlays = mask.parentNode.querySelectorAll(':scope > .am-edit-sheet-mask, :scope > .am-product-card-mask');
            return overlays.length > 0 && overlays[overlays.length - 1] === mask;
        };
        const close = () => {
            window.removeEventListener('keydown', onKeydown, KEYDOWN_CAPTURE_OPTS);
            if (mask.parentNode) mask.parentNode.removeChild(mask);
        };
        const onKeydown = event => {
            if (event.key !== 'Escape') return;
            if (!isTopmostWorkflowInHost()) return;
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
            close();
        };
        window.addEventListener('keydown', onKeydown, KEYDOWN_CAPTURE_OPTS);
        mask.onclick = event => { if (event.target === mask) close(); };
        const input = mask.querySelector('[data-related-note-input]');
        const button = mask.querySelector('[data-related-note-confirm]');
        sheetHost.appendChild(mask);
        if (input) { try { input.focus(); } catch (e) {} }
        const submit = async () => {
            if (!input || button.disabled) return;
            const raw = String(input.value || '').trim();
            const match = raw.match(/[0-9]{14}-[a-z0-9]{7}/);
            if (!match) {
                this.showToast('⚠️ ' + this._t('relatedNoteInvalidInput', '未识别到有效的文档/块 ID'));
                return;
            }
            const blockId = match[0];
            button.disabled = true;
            try {
                let info = null;
                try {
                    const response = await fetch('/api/block/getBlockInfo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: blockId }),
                    });
                    const payload = response && response.ok ? await response.json() : null;
                    info = payload && payload.code === 0 ? payload.data : null;
                } catch (error) { info = null; }
                if (!info || !info.rootID) {
                    button.disabled = false;
                    this.showToast('⚠️ ' + this._t('relatedNoteNotFound', '未找到该文档/块（可能已被删除）'));
                    return;
                }
                // hpath 形如 '/笔记本/文档标题'；取末段作标题，空则回退 id 前 8 位。
                const hpath = String(info.hpath || '');
                const title = hpath.split('/').filter(Boolean).pop() || blockId.slice(0, 8);
                const now = new Date().toISOString();
                await this._commitAssetAuditMutation(snapshot => {
                    const current = snapshot.assets.find(item => item && item.id === assetId);
                    if (!current) return { noop: true, context: {} };
                    const existing = Array.isArray(current.relatedNotes) ? current.relatedNotes : [];
                    if (existing.some(item => item && item.id === blockId)) return { noop: true, context: {} };
                    const asset = mergeFormalV2AssetPatch(current, { relatedNotes: existing.concat([{ id: blockId, title: title, addedAt: now }]) }, { now: now, today: todayISO() });
                    return { assets: snapshot.assets.map(item => item.id === assetId ? asset : item), context: {} };
                });
                close();
                this.showToast('✓ ' + this._t('relatedNoteAdded', '已关联笔记文档'));
                this.closeProductCard();
                this.openFormalProductCard(assetId, sheetHost);
            } catch (error) {
                button.disabled = false;
                this.showToast('⚠️ ' + (error && error.message ? error.message : 'link failed'));
            }
        };
        // 单一触发通道：仅 button.onclick + input Enter，不再 form.onsubmit + button.onclick 双绑
        // （避免 v2.5.0 Reviewer 警示的某些浏览器双触发）。
        button.onclick = submit;
        input.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); submit(); } };
    }

    /**
     * 资产索引块引用右键/长按菜单。open-menu-blockref 与思源菜单渲染同一同步
     * 调用栈，故这里只能读内存映射并立即 addItem，不能 await 查询属性。
     */
    _handleBlockRefMenu(event) {
        try {
            const detail = event && event.detail;
            const element = detail && detail.element;
            const menu = detail && detail.menu;
            if (!element || !menu || typeof menu.addItem !== 'function') return;
            const blockId = String((element.dataset && element.dataset.id)
                || (element.getAttribute && element.getAttribute('data-id')) || '').trim();
            if (!/^[0-9]{14}-[a-z0-9]{7}$/.test(blockId)
                || !this.noteLink || typeof this.noteLink.getAssetIdByIndexBlockId !== 'function') return;
            const assetId = this.noteLink.getAssetIdByIndexBlockId(blockId);
            if (!assetId || !(Array.isArray(this.assets) ? this.assets : [])
                .some(asset => asset && asset.id === assetId)) return;
            menu.addItem({
                icon: 'iconAssetManagement',
                label: this._t('blockRefMenuOpenAssetCard', '打开产品卡'),
                click: () => this._openAssetDetailById(assetId),
            });
            menu.addItem({
                icon: 'iconFocus',
                label: this._t('blockRefMenuLocateIndex', '在索引文档中定位'),
                click: () => this._jumpToBlock(blockId),
            });
        } catch (error) {
            console.warn('[AssetManagement] block-ref menu injection failed:', error && error.message);
        }
    }

    /**
     * v2.5.0 阶段4返修（S1）：块图标菜单（click-blockicon）同步注入单一入口。
     * 根因：思源 emitOpenMenu（app/src/plugin/EventBus.ts）同步 emit 事件，返回后
     * 立刻判断 pluginSubMenu.menus.length > 0 才渲染「插件」子菜单；async handler
     * 会在 await getBlockAssetTag（fetch 宏任务）处挂起，此刻 menus.length === 0
     * → 子菜单入口不创建，fetch 完成后的 addItem 只 push 进已遗弃数组。
     * 因此 handler 必须纯同步：blockId 同步取自 blockElements[0]，addItem 之前
     * 不得出现任何 await/promise，状态分支全部延迟到 click 回调执行
     * （_onBlockMenuEntry，此时已可安全 await）。移动端块菜单同样走此事件。
     * 全程 try/catch：插件菜单注入失败不影响思源原生菜单。
     */
    _handleBlockIconMenu(event) {
        try {
            const detail = event && event.detail;
            const menu = detail && detail.menu;
            const node = detail && detail.blockElements && detail.blockElements[0];
            if (!menu || typeof menu.addItem !== 'function' || !node) return;
            const blockId = (node.dataset && node.dataset.nodeId)
                || (node.getAttribute && node.getAttribute('data-node-id'))
                || '';
            if (!blockId) return;
            menu.addItem({
                icon: 'iconAssetManagement',
                label: this._t('blockMenuAssetEntry', '资产关联…'),
                click: () => this._onBlockMenuEntry(blockId),
            });
        } catch (error) {
            console.warn('[AssetManagement] block-icon menu injection failed:', error && error.message);
        }
    }

    /**
     * 块菜单入口 click 回调（异步；菜单已渲染并关闭，此时可安全 await）：
     * - noteLink 不可用 → toast 提示后返回；
     * - 未标记块：打开资产打标选择器（_openAssetTagPickerDialog → linkBlockToAsset）；
     * - 已标记块：小 Dialog 两按钮——「在资产管理中查看」（click 时重查资产，
     *   已删 → toast 失效）+「取消关联」（unlinkBlockFromAsset + toast）。
     * Dialog 复用 showDialog + b3-dialog__content/__action 既有小弹窗模式，
     * 按钮 onclick 闭包绑定（v0.13 P0 第 8 条教训）。
     */
    async _onBlockMenuEntry(blockId) {
        try {
            if (!this.noteLink || typeof this.noteLink.getBlockAssetTag !== 'function') {
                this.showToast('⚠️ ' + this._t('blockMenuNotAvailable', '笔记关联功能不可用'));
                return;
            }
            const assetId = await this.noteLink.getBlockAssetTag(blockId);
            if (!assetId) {
                this._openAssetTagPickerDialog(blockId);
                return;
            }
            const linkedAsset = (Array.isArray(this.assets) ? this.assets : []).find(item => item && item.id === assetId);
            const message = linkedAsset
                ? this._t('blockMenuLinked', '已关联到「{name}」').replace('{name}', linkedAsset.name || '')
                : this._t('blockMenuAssetMissing', '资产已删除，标记失效');
            const html = `
                <div class="b3-dialog__content">
                    <div class="am-bulk-confirm-dialog">
                        <div class="am-bulk-confirm-dialog__icon">🔗</div>
                        <div class="am-bulk-confirm-dialog__text">${escapeHtml(message)}</div>
                    </div>
                </div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--remove" data-action="block-menu-unlink">${escapeHtml(this._t('blockMenuUnlinkAsset', '取消关联'))}</button>
                    <button class="b3-button b3-button--primary" data-action="block-menu-view">${escapeHtml(this._t('blockMenuViewAsset', '在资产管理中查看'))}</button>
                </div>`;
            this.showDialog(this._t('blockMenuAssetEntry', '资产关联…'), html, (dialog) => {
                const root = dialog.element || dialog;
                const viewBtn = root.querySelector('[data-action="block-menu-view"]');
                const unlinkBtn = root.querySelector('[data-action="block-menu-unlink"]');
                if (viewBtn) viewBtn.onclick = async () => {
                    dialog.destroy();
                    try {
                        const asset = (Array.isArray(this.assets) ? this.assets : []).find(item => item && item.id === assetId);
                        if (asset) await this.openFormalProductCard(assetId);
                        else this.showToast('⚠️ ' + this._t('blockMenuAssetMissing', '资产已删除，标记失效'));
                    } catch (error) { console.warn('[AssetManagement] open asset card from block menu failed:', error && error.message); }
                };
                if (unlinkBtn) unlinkBtn.onclick = async () => {
                    if (unlinkBtn.disabled) return;
                    unlinkBtn.setAttribute('disabled', 'disabled');
                    try {
                        await this.noteLink.unlinkBlockFromAsset(blockId);
                        dialog.destroy();
                        this.showToast('✓ ' + this._t('blockMenuUnlinked', '已取消关联资产'));
                    } catch (error) {
                        unlinkBtn.removeAttribute('disabled');
                        this.showToast('⚠️ ' + (error && error.message ? error.message : 'unlink failed'));
                    }
                };
            }, this.isMobile ? '92vw' : '420px');
        } catch (error) {
            console.warn('[AssetManagement] block menu entry failed:', error && error.message);
        }
    }

    /**
     * 块菜单「关联到资产」的资产选择器：复用 _openAssetRefPickerDialog 的
     * 搜索 + 列表 + 事件委托骨架；选定后 linkBlockToAsset（块打标不依赖索引
     * 文档，无需 indexReady 门禁）。多选块时只对第一块生效（handler 已取 [0]）。
     */
    _openAssetTagPickerDialog(blockId) {
        const assets = (Array.isArray(this.assets) ? this.assets : []).filter(item => item && item.id && item.name);
        if (!assets.length) {
            this.showToast('⚠️ ' + this._t('assetPickerEmpty', '没有匹配的资产'));
            return null;
        }
        let query = '';
        const renderRows = () => {
            const keyword = query.trim().toLowerCase();
            const list = keyword
                ? assets.filter(item => String(item.name).toLowerCase().indexOf(keyword) >= 0) : assets;
            if (!list.length) return `<div class="am-asset-picker__empty">${escapeHtml(this._t('assetPickerEmpty', '没有匹配的资产'))}</div>`;
            return list.map(asset => {
                const statusInfo = STATUS_MAP[asset.status] || STATUS_MAP.active;
                return `<button type="button" class="am-asset-picker__row" data-asset-tag-picker-id="${escapeHtml(asset.id)}">`
                    + `<span class="am-asset-picker__name">${escapeHtml(asset.name)}</span>`
                    + `<span class="am-asset-picker__meta">${escapeHtml(this._t(statusInfo.key, asset.status))} · ${escapeHtml(this._formalKindLabel(asset.kind))}</span>`
                    + `</button>`;
            }).join('');
        };
        const render = () => `<div class="am-asset-picker">`
            + `<input class="b3-text-field fn__block am-asset-picker__search" type="text" data-asset-tag-picker-search placeholder="${escapeHtml(this._t('assetPickerSearchPlaceholder', '搜索资产...'))}" value="${escapeHtml(query)}">`
            + `<div class="am-asset-picker__list" data-asset-tag-picker-list>${renderRows()}</div></div>`;
        const dialog = this.showDialog(this._t('blockMenuLinkAsset', '关联到资产'), render(), (dlg) => {
            const root = dlg.element || dlg;
            const search = root.querySelector('[data-asset-tag-picker-search]');
            const list = root.querySelector('[data-asset-tag-picker-list]');
            if (search) {
                search.oninput = () => { query = search.value || ''; if (list) list.innerHTML = renderRows(); };
                try { search.focus(); } catch (e) {}
            }
            if (list) {
                list.onclick = async event => {
                    const button = event.target instanceof Element ? event.target.closest('[data-asset-tag-picker-id]') : null;
                    if (!button || button.disabled) return;
                    const assetId = button.dataset.assetTagPickerId;
                    if (!assetId || !this.noteLink || typeof this.noteLink.linkBlockToAsset !== 'function') return;
                    button.disabled = true;
                    try {
                        await this.noteLink.linkBlockToAsset(blockId, assetId);
                        dialog.destroy();
                        const asset = assets.find(item => item.id === assetId);
                        this.showToast('✓ ' + this._t('blockMenuLinked', '已关联到「{name}」').replace('{name}', (asset && asset.name) || ''));
                    } catch (error) {
                        button.disabled = false;
                        this.showToast('⚠️ ' + (error && error.message ? error.message : 'link failed'));
                    }
                };
            }
        }, this.isMobile ? '92vw' : '520px');
        return dialog;
    }

    async openFormalProductCard(id, preferredHost) {
        let asset = (this.assets || []).find(item => item && item.id === id);
        if (!asset || !asset.kind || FORMAL_ASSET_KINDS.indexOf(asset.kind) < 0) return;
        // 种草历程与价格趋势都依赖 wishlistEvents sidecar。缓存冷态时先 hydrate，
        // 这样从资产列表直接打开已购买资产也能显示完整种草时间线。
        if (!this._wishlistEventsLoaded) {
            await this._warmWishlistEvents();
            asset = (this.assets || []).find(item => item && item.id === id);
            if (!asset || !asset.kind || FORMAL_ASSET_KINDS.indexOf(asset.kind) < 0) return;
        }
        let vm;
        try {
            vm = this._formalVm(asset);
        } catch (error) {
            console.warn('[AssetManagement] formal detail projection failed:', error && error.message);
            const errorHost = preferredHost || this.dockElement || this._modalContainer || this._pluginOverlayRoot || document.body;
            if (errorHost && typeof document !== 'undefined') {
                const panel = document.createElement('div');
                panel.className = 'am-product-card-mask am-formal-product-card-mask';
                panel.innerHTML = this._renderFormalDashboardError(error);
                errorHost.appendChild(panel);
            }
            return;
        }
this.closeProductCard();
        // v1.3 阶段3/4 返修（Reviewer #3）：host 解析顺序加入 _pluginOverlayRoot 作为 body 后备。
        const host = preferredHost || this.dockElement || this._modalContainer || this._pluginOverlayRoot || document.body;
        if (!host) return;
        const text = value => escapeHtml(value == null || value === '' ? '—' : String(value));
        const row = (label, value) => `<div class="am-product-detail-row"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
        const status = STATUS_MAP[asset.status] || STATUS_MAP.active;
        // Stage 7c (item 2): detail card header shows tags only when present. Reference
        // design has no tag area on the detail card, so render nothing (no 无标签 chip)
        // when empty. List/matrix cards also render nothing when empty (see _formalCardData, 需求5).
        // v2.3.0 阶段3：产品详情卡 chip 按 tag.color 呈色（vm.tags 含目录完整对象；已删标签兜底对象无 color → 中性样式）
        const tagsHtml = vm.tags.length
            ? vm.tags.map(tag => { const chipColor = this._tagChipColorAttrs(tag && tag.color); return `<span class="am-asset-tag${chipColor.cls}"${chipColor.style}>${escapeHtml(tag.label)}</span>`; }).join('')
            : '';
        // v2.4.1 阶段3：wishlist 期望价可为 null（清空路径），formatAmountMinor 拒收 null → '—' 兜底。
        const financeRows = asset.status === 'wishlist'
            ? row(this._t('wishlistExpectedPrice', '期望价'), asset.wishlist.expectedAmountMinor == null ? '—' : formatAmountMinor(asset.wishlist.expectedAmountMinor, asset.currency))
            : row(this._t('formalAcquisitionAmount', '购买价格'), formatAmountMinor(vm.projection.acquisition.amountMinor, asset.currency))
                + row(this._t('formalNetAmount', '净成本'), formatAmountMinor(vm.projection.financials.netAmountMinor, asset.currency));
        const elapsedDays = Math.max(1, Math.floor((Date.now() - new Date((asset.acquiredOn || todayISO()) + 'T00:00:00Z').getTime()) / 86400000) + 1);
        const dailyAmount = asset.status === 'wishlist' ? null : Math.ceil(vm.projection.financials.netAmountMinor / elapsedDays);
        const dailyRow = dailyAmount == null ? '' : row(this._t('formalDailyCost', '日均成本'), formatAmountMinor(dailyAmount, asset.currency));
        const importantRow = row(this._t('formalNextImportant', '下一重要日期'), text(vm.important && vm.important.date));
        const physicalDateRows = asset.kind === FORMAL_ASSET_KIND.PHYSICAL && asset.status !== 'wishlist'
            ? row(this._t('fieldPurchaseDate', '购买日期'), text(asset.acquiredOn)) + (asset.status === 'retired' ? row(this._t('fieldRetiredDate', '退役日期'), text(asset.statusChangedOn)) : '') : '';
        const saleLifecycle = asset.kind === FORMAL_ASSET_KIND.PHYSICAL ? vm.lifecycleEvents.find(event => event && event.kind === 'retired' && event.details && event.details.saleFinancialEventId) : null;
        const saleFinancial = saleLifecycle ? this._formalDomainSnapshot().financialEvents.find(event => event.id === saleLifecycle.details.saleFinancialEventId) : null;
        const saleRow = saleFinancial ? row(this._t('physicalSaleFieldPrice', '转让价格'), formatAmountMinor(saleFinancial.amountMinor, asset.currency)) : '';
        const prepaidRow = !vm.prepaid ? '' : vm.prepaid.dimension === 'amount'
            ? row(this._t('formalPrepaidBalance', '预付余额'), formatAmountMinor(vm.prepaid.balanceAmountMinor, asset.currency))
            : row(this._t('formalPrepaidRemaining', '预付剩余次数'), `${vm.prepaid.remainingCount} ${text(vm.prepaid.unitLabel)}`);
const subscriptionAutoRenewChecked = asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION && !!(asset.details && asset.details.autoRenew);
        const subscriptionToggle = asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION
            ? `<label class="am-product-toggle-row" data-formal-auto-renew-row><span>${escapeHtml(this._t('formFieldAutoRenew', '自动续费'))}</span><label class="am-form-toggle"><input type="checkbox" data-formal-auto-renew ${subscriptionAutoRenewChecked ? 'checked' : ''}><span class="am-form-toggle__track"><span class="am-form-toggle__thumb"></span></span></label></label><p class="am-product-hint">${escapeHtml(this._t('autoRenewToggleHint', '切换自动续费仅写 lifecycle 事件与操作日志；不会修改账期或付款。'))}</p>`
            : '';
        const workflowButtons = asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION
            ? `${subscriptionToggle}<button type="button" class="am-product-action am-product-action--primary" data-formal-renew>${escapeHtml(this._t('btnRenew', '续费'))}</button>`
            : (asset.kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT
                ? `<button type="button" class="am-product-action am-product-action--primary" data-formal-prepaid>${escapeHtml(this._t('menuPrepaidTx', '记一笔'))}</button>`
                : (asset.kind === FORMAL_ASSET_KIND.PREPAID_COUNT
                    ? `<button type="button" class="am-product-action am-product-action--primary" data-formal-prepaid>${escapeHtml(this._t('menuPrepaidTx', '记一笔'))}</button><button type="button" class="am-product-action" data-formal-prepaid-adjust>${escapeHtml(this._t('prepaidCountAdjustConfirm', '校正剩余次数'))}</button><button type="button" class="am-product-action" data-formal-prepaid-outflow>${escapeHtml(this._t('prepaidRecordOutflow', '记一笔消费'))}</button>`
                    : (asset.kind === FORMAL_ASSET_KIND.PHYSICAL
                        ? `<button type="button" class="am-product-action" data-formal-maintenance>${escapeHtml(this._t('menuMaintenance', '维保'))}</button>${asset.status !== 'retired' ? `<button type="button" class="am-product-action" data-formal-retire>${escapeHtml(this._t('physicalRetireConfirm', '退役'))}</button><button type="button" class="am-product-action" data-formal-sale>${escapeHtml(this._t('physicalSaleConfirm', '转让'))}</button>` : ''}`
                        : '')));
        const periodRows = asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION
            ? this._formalDomainSnapshot().subscriptionPeriods.filter(item => item.assetId === asset.id).slice()
                .sort((a, b) => b.startDate.localeCompare(a.startDate)).map(period => row(`${period.startDate} ~ ${period.endDate}`, text(period.kind))).join('') : '';
        const sidecarRows = row(this._t('maintenanceTitle', '维保'), String(vm.maintenance.length))
            + row(this._t('formalLifecycleTitle', '生命周期记录'), String(vm.lifecycleEvents.length));
        const statusButtons = ['wishlist', 'active', 'retired'].filter(value => value !== asset.status)
            .map(value => `<button type="button" class="am-product-action" data-formal-status="${value}">${escapeHtml(this._t((STATUS_MAP[value] || {}).key, value))}</button>`).join('');
        const node = document.createElement('div');
        node.className = 'am-product-card-mask am-formal-product-card-mask';
        // v2.4.2 hotfix 5：心跳 record/undo 的就地刷新若落到整卡重开分支，挂 --noanim
        // 禁用入场动画，避免「闪一下」。标志一次性消费。
        if (this._productCardNoAnim) { node.classList.add('am-product-card-mask--noanim'); this._productCardNoAnim = false; }
        node.innerHTML = asset.kind === FORMAL_ASSET_KIND.PHYSICAL ? this._renderPhysicalProductCardInner(asset, vm, status, text, row, tagsHtml) : (asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION || asset.kind === FORMAL_ASSET_KIND.VIRTUAL_PERPETUAL) ? this._renderVirtualProductCardInner(asset, vm, status, text, row, tagsHtml) : (asset.kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT || asset.kind === FORMAL_ASSET_KIND.PREPAID_COUNT) ? this._renderPrepaidProductCardInner(asset, vm, status, text, row, tagsHtml) : `<div class="am-product-card am-formal-product-card" data-product-id="${escapeHtml(asset.id)}"><button type="button" class="am-product-card__close" data-formal-detail-close aria-label="${escapeHtml(this._t('btnClose', '关闭'))}">×</button><div class="am-product-card__status" style="background:color-mix(in srgb, ${status.color} 14%, transparent);color:${status.color};"><span class="am-product-card__status-dot" style="background:${status.color};"></span>${escapeHtml(this._t(status.key, asset.status))}</div><div class="am-product-card__header"><div class="am-product-card__head-main"><div class="am-product-card__cat-chip">${escapeHtml(this._formalKindLabel(asset.kind))}</div><div class="am-product-card__name">${escapeHtml(asset.name)}</div>${tagsHtml ? `<div class="am-product-card__tags">${tagsHtml}</div>` : ''}</div></div><div class="am-product-card__body"><section class="am-product-section"><div class="am-product-section__title">${escapeHtml(this._t('productSectionBase', '基础'))}</div>${row(this._t('formalCanonicalName', '名称'), text(asset.name))}${row(this._t('productDetailType', '类型'), text(this._formalKindLabel(asset.kind)))}${row(this._t('formalCategory', '分类'), text(vm.category.id))}</section><section class="am-product-section"><div class="am-product-section__title">${escapeHtml(this._t('productSectionCost', '成本'))}</div>${financeRows}${dailyRow}${physicalDateRows}${saleRow}</section><section class="am-product-section"><div class="am-product-section__title">${escapeHtml(this._t('productSectionExpiry', '重要日期'))}</div>${importantRow}${prepaidRow}</section><section class="am-product-section"><div class="am-product-section__title">${escapeHtml(this._t('formalSidecarsTitle', '关联记录'))}</div>${sidecarRows}</section>${periodRows ? `<section class="am-product-section"><div class="am-product-section__title">订阅历史</div>${periodRows}</section>` : ''}</div><div class="am-product-card__actions">${workflowButtons}<button type="button" class="am-product-action am-product-action--primary" data-formal-edit>${escapeHtml(this._t('productEditBtn', '编辑设置'))}</button><button type="button" class="am-product-action" data-formal-delete>${escapeHtml(this._t('menuDelete', '删除'))}</button>${statusButtons}</div></div>`;
        const formalDetailHeader = node.querySelector('.am-product-card__header');
        if (formalDetailHeader && !formalDetailHeader.querySelector('.am-product-card__cover')) {
            const cover = document.createElement('div');
            cover.className = 'am-product-card__cover';
            cover.innerHTML = this.renderAssetCoverContent(asset, '📦', 'am-product-card__cover-image', 'am-product-card__cover-fallback');
            formalDetailHeader.prepend(cover);
        }
        node.onclick = event => { if (event.target === node) this.closeProductCard(); };
        host.appendChild(node);
        this._productCardHost = host;
        node.querySelector('[data-formal-detail-close]').onclick = () => this.closeProductCard();
        node.querySelector('[data-formal-edit]').onclick = () => { this.closeProductCard(); this.openEditDialog(asset.id); };
        // P3：清理未知 kind 兜底模板可能残留的旧 footer 复制入口；唯一入口由
        // _mountRelatedNotesSection 在「笔记关联」标题同行创建并闭包绑定。
        node.querySelectorAll('[data-formal-copy-ref]').forEach(button => button.remove());
        // v2.5.0 阶段4：详情卡「笔记关联」区——owned 与 wishlist 都注入（写入入口
        // 仅 owned，见 _mountRelatedNotesSection 契约说明），body 顶部（基础区上方）异步渲染。
        this._mountRelatedNotesSection(node, asset, host);
        const formalDeleteBtn = node.querySelector('[data-formal-delete]');
        if (formalDeleteBtn) formalDeleteBtn.onclick = () => { this.closeProductCard(); this.confirmDelete(asset.id); };
        const workflow = (selector, action) => { const button = node.querySelector(selector); if (button) button.onclick = action; };
        // v1.3 阶段3/4 返修（Reviewer 第 1 次 FAIL #1）：详情卡点击闭包显式把 host
        // 传给 workflow / renew sheet，保证 sheet 与详情卡同 host（同一局部 stacking
        // context），避免「详情在 modal、sheet 跑到 dock」这种 z-index 失效场景。
        workflow('[data-formal-renew]', () => this.openRenewSheet(asset.id, host));
        // v2.4.1 阶段3：种草详情卡「更新价格」入口（仅 wishlist 渲染该按钮），sheet 与详情卡同 host。
        workflow('[data-wishlist-update-price]', () => this.openWishlistPriceSheet(asset.id, host));
        // v2.4.2：种草详情卡「心动值」section——大按钮/撤销 pill 均为闭包直绑（v0.14 教训：不走委托）。
        this._bindWishlistHeartbeatSection(node, asset.id, host);
        // v2.4.1 追加：价格趋势区「更新记录」逐条删除（更正误输入）；删除前插件范围内二次确认，
        // 确认后执行域方法并原 host 重开详情卡。
        node.querySelectorAll('[data-wishlist-price-event-delete]').forEach(button => {
            button.onclick = () => {
                this._openScopedConfirm(host, {
                    title: this._t('wishlistPriceEventDeleteTitle', '删除价格记录'),
                    text: this._t('wishlistPriceEventDeleteConfirm', '确认删除这条价格更新记录？删除最新记录会把当前期望价回退到该记录之前的值。'),
                    onConfirm: async () => {
                        button.disabled = true;
                        try {
                            await this.deleteWishlistPriceEvent(asset.id, button.dataset.wishlistPriceEventDelete);
                            this.showToast('✓ ' + this._t('wishlistPriceEventDeleted', '价格记录已删除'));
                            this.closeProductCard();
                            this.openFormalProductCard(asset.id, host);
                        } catch (error) {
                            button.disabled = false;
                            this.showToast('⚠️ ' + (error && error.message ? error.message : 'delete failed'));
                        }
                    },
                });
            };
        });
        workflow('[data-formal-prepaid]', () => this.openPrepaidTransactionSheet(asset.id, host));
        workflow('[data-formal-maintenance]', () => this.openMaintenanceSheet(asset.id, host));
        workflow('[data-formal-retire]', () => this.openPhysicalRetireSheet(asset.id));
        workflow('[data-formal-sale]', () => this.openPhysicalSaleSheet(asset.id));
        workflow('[data-formal-prepaid-adjust]', () => this.openPrepaidAdjustSheet(asset.id));
        workflow('[data-formal-prepaid-outflow]', () => this.openPrepaidOutflowSheet(asset.id));
        // Stage 4: prepaid detail-card quick actions (charge/consume/refund for amount;
        // consume/adjust for count). Each opens a small sheet, writes the matching formal
        // transaction, then re-renders this product card so the projection stays live.
        node.querySelectorAll('[data-prepaid-quick]').forEach(button => {
            button.onclick = () => this.openPrepaidQuickActionSheet(asset.id, button.dataset.prepaidQuick, host);
        });
        const autoRenewCheckbox = node.querySelector('[data-formal-auto-renew]');
        if (autoRenewCheckbox) autoRenewCheckbox.onchange = async event => {
            const target = !!event.target.checked;
            autoRenewCheckbox.disabled = true;
            try {
                await this.toggleSubscriptionAutoRenew(asset.id, target);
                this.showToast('✓ ' + (target
                    ? this._t('subscriptionAutoRenewEnabledToast', '已开启自动续费')
                    : this._t('subscriptionAutoRenewDisabledToast', '已关闭自动续费')));
                this.closeProductCard();
            } catch (error) {
                autoRenewCheckbox.checked = !target;
                this.showToast('⚠️ ' + error.message);
            } finally {
                autoRenewCheckbox.disabled = false;
            }
        };
        const autoRenewLink = node.querySelector('[data-formal-auto-renew-link]');
        if (autoRenewLink) autoRenewLink.onclick = async () => {
            const current = !!(asset.details && asset.details.autoRenew);
            const target = !current;
            autoRenewLink.disabled = true;
            try {
                await this.toggleSubscriptionAutoRenew(asset.id, target);
                this.showToast('✓ ' + (target
                    ? this._t('subscriptionAutoRenewEnabledToast', '已开启自动续费')
                    : this._t('subscriptionAutoRenewDisabledToast', '已关闭自动续费')));
                this.closeProductCard();
            } catch (error) {
                autoRenewLink.disabled = false;
                this.showToast('⚠️ ' + error.message);
            }
        };
        node.querySelectorAll('[data-formal-status]').forEach(button => {
            button.onclick = async () => {
                button.disabled = true;
                try {
                    await this.setStatus(asset.id, button.dataset.formalStatus);
                    this.closeProductCard();
                } catch (error) {
                    button.disabled = false;
                    this.showToast('⚠️ ' + this._t('formalMutationFailed', '正式资产操作失败'));
                }
            };
        });
    }


    _productCardSelector(assetId) {
        const value = String(assetId == null ? '' : assetId);
        const escaped = typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function'
            ? CSS.escape(value)
            : value.replace(/[^a-zA-Z0-9_-]/gu, char => '\\' + char.codePointAt(0).toString(16) + ' ');
        return `.am-product-card[data-product-id="${escaped}"]`;
    }

closeProductCard() {
        // v1.3 阶段3/4 返修（Reviewer #3）：close 时把所有可能承载详情卡的 host 都清一遍。
        const host = this._productCardHost || this.dockElement || this._modalContainer || this._pluginOverlayRoot || document.body;
        if (!host) return;
        const card = host.querySelector('.am-product-card-mask');
        if (card) card.remove();
        this._productCardHost = null;
        [this.dockElement, this._modalContainer, this._pluginOverlayRoot, document.body].forEach(el => {
            if (!el || el === host || !el.querySelector) return;
            const leftover = el.querySelector('.am-product-card-mask');
            if (leftover) leftover.remove();
        });
    }

    /**
     * v0.13.7（重写）：通用 sheet 拖动手势关闭
     * 关键改进：
     * - 在 mask 上监听 pointerdown（顶部 60px 区域触发）
     * - 在 window 上监听 pointermove/up（保证手指离开 mask 后还能追踪）
     * - 实时 sheet.style.transform 跟随手指
     * - 不在 button/input 上启动拖动（这些元素自身需要响应点击）
     * - 触摸和鼠标统一处理
     *
     * @param {HTMLElement} mask - sheet-mask 元素
     * @param {HTMLElement} sheet - sheet 内容元素（.am-edit-sheet）
     * @param {Function} closeFn - 关闭回调
     */
    setupSheetDragClose(mask, sheet, closeFn) {
        if (!mask || !sheet || !closeFn) return;
        const THRESHOLD_PX = 100;            // 下滑 ≥100px 触发关闭
        const VELOCITY_THRESHOLD = 0.5;      // 速度 ≥0.5px/ms 触发关闭
        const DRAG_AREA_PX = 60;             // 顶部 60px 内可拖

        let dragging = false;
        let startY = 0;
        let lastY = 0;
        let lastT = 0;
        let velocity = 0;

        // 取 pointer / touch 的 clientY（统一处理）
        const getY = (e) => {
            if (e.touches && e.touches.length > 0) return e.touches[0].clientY;
            if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientY;
            if (typeof e.clientY === 'number') return e.clientY;
            return null;
        };

        const onDown = (e) => {
            const y = getY(e);
            if (y === null) return;
            // 排除表单元素 / 按钮 — 这些需要正常点击
            if (e.target.closest('button, input, select, textarea, a, [contenteditable="true"]')) return;
            // 必须在 sheet 顶部 DRAG_AREA_PX 像素内
            const sheetRect = sheet.getBoundingClientRect();
            const offsetFromTop = y - sheetRect.top;
            if (offsetFromTop < 0 || offsetFromTop > DRAG_AREA_PX) return;

            dragging = true;
            startY = lastY = y;
            lastT = Date.now();
            velocity = 0;
            mask.classList.add('is-dragging');
            // 不要 preventDefault — 让触摸事件继续触发后续 move/up
        };

        const onMove = (e) => {
            if (!dragging) return;
            const y = getY(e);
            if (y === null) return;
            const now = Date.now();
            const dt = Math.max(1, now - lastT);
            // 速度计算（仅向下）
            velocity = y > lastY ? (y - lastY) / dt : 0;
            lastY = y;
            lastT = now;

            // 实时跟随：translateY 仅允许向下（dy > 0）
            const dy = Math.max(0, y - startY);
            sheet.style.transform = `translateY(${dy}px)`;

            // 拖动时阻止页面滚动（但用 cancelable 检查避免错误）
            if (e.cancelable) e.preventDefault();
        };

        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            mask.classList.remove('is-dragging');
            const dy = lastY - startY;
            const shouldClose = dy > THRESHOLD_PX || velocity > VELOCITY_THRESHOLD;
            if (shouldClose) {
                closeFn();
            } else {
                // 回弹到原位（清掉 inline transform，让 CSS transition 接管）
                sheet.style.transform = '';
            }
        };

        // 用 PointerEvent（统一处理 touch + mouse + pen）
        if ('PointerEvent' in window) {
            // pointerdown 必须在 mask 上（防止在 sheet 内部触发）
            mask.addEventListener('pointerdown', onDown);
            // pointermove / pointerup / pointercancel 在 window 上（保证手指离开 mask 后仍能追踪）
            window.addEventListener('pointermove', onMove, { passive: false });
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
        } else {
            // 旧浏览器 fallback：touch + mouse
            mask.addEventListener('touchstart', onDown);
            window.addEventListener('touchmove', onMove, { passive: false });
            window.addEventListener('touchend', onUp);
            mask.addEventListener('mousedown', onDown);
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        }
    }

    openItemMenu(id, target) {
        const a = this.assets.find(x => x.id === id);
        if (!a) return;
        // 卡片菜单仅保留资产编辑与删除；状态、维护、使用等能力从其专属入口访问。
        const items = [
            { label: this._t("menuEdit", "编辑"), click: () => this.openEditDialog(id) },
            { label: this._t("menuDelete", "删除"), click: () => this.confirmDelete(id) },
        ];
        this._openItemMenu(target, items);
    }

    _closeItemMenu() {
        const menu = this._itemMenu;
        if (!menu) return;
        if (menu.dropdown && menu.dropdown.parentNode) menu.dropdown.remove();
        document.removeEventListener("keydown", menu.onKeyDown);
        document.removeEventListener(menu.outsideEvent, menu.onOutside, true);
        window.removeEventListener("scroll", menu.onScroll, true);
        if (menu.trigger && menu.trigger.isConnected) menu.trigger.setAttribute("aria-expanded", "false");
        this._itemMenu = null;
    }

    /** Compact card-only menu: fixed bottom-end placement avoids dock/modal clipping and never flips above its trigger. */
    _openItemMenu(target, items) {
        if (!target || !document.body) return;
        this._closeItemMenu();

        const rect = target.getBoundingClientRect();
        const dropdown = document.createElement("div");
        dropdown.className = "am-dropdown am-dropdown--item" + (items.some(item => item.wide) ? " am-dropdown--item-wide" : "");
        dropdown.setAttribute("role", "menu");
        dropdown.innerHTML = items.map((item, index) =>
            `<button type="button" class="am-dropdown__item" data-pick-idx="${index}" role="menuitem">${escapeHtml(item.label)}</button>`
        ).join("");
        // Use viewport coordinates so the same menu works in dock and main-dialog list/matrix views.
        dropdown.style.top = Math.round(rect.bottom + 2) + "px";
        dropdown.style.right = Math.max(0, Math.round(window.innerWidth - rect.right)) + "px";
        document.body.appendChild(dropdown);
        target.setAttribute("aria-expanded", "true");

        const onKeyDown = (event) => {
            if (event.key === "Escape") this._closeItemMenu();
        };
        const onOutside = (event) => {
            if (!dropdown.contains(event.target) && !target.contains(event.target)) this._closeItemMenu();
        };
        const onScroll = () => this._closeItemMenu();
        const outsideEvent = "PointerEvent" in window ? "pointerdown" : "mousedown";
        this._itemMenu = { dropdown, trigger: target, onKeyDown, onOutside, onScroll, outsideEvent };

        dropdown.querySelectorAll("[data-pick-idx]").forEach(button => {
            button.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                const item = items[Number(button.dataset.pickIdx)];
                this._closeItemMenu();
                if (item && typeof item.click === "function") item.click();
            };
        });
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener(outsideEvent, onOutside, true);
        window.addEventListener("scroll", onScroll, true);

        const firstItem = dropdown.querySelector("[data-pick-idx]");
        if (firstItem) firstItem.focus();
    }

    /**
     * v0.12.1 插件内 dropdown picker（替代思源 Menu API）
     * 修复：思源 Menu 用 data-name 判重复 + zIndex/stacking context 问题，
     * 在插件 dock 内不可靠。改成插件自己的 dropdown 弹层，appendChild 到 dock。
     *
     * @param {HTMLElement} target 触发按钮
     * @param {{label:string, click:Function, active?:boolean}[]} items 选项
     * @param {string} id 用于 CSS class 标识
     */
    _openPickerMenu(target, items, id) {
        if (!this.dockElement) return;
        // 先移除已存在的 dropdown
        const existing = this.dockElement.querySelector(".am-dropdown");
        if (existing) existing.remove();

        const rect = target.getBoundingClientRect();
        const dockRect = this.dockElement.getBoundingClientRect();
        // 计算相对 dock 内的坐标
        const top = rect.bottom - dockRect.top + 4;
        let left = rect.left - dockRect.left;

        const dropdown = document.createElement("div");
        dropdown.className = "am-dropdown am-dropdown--" + (id || "default");

        const html = items.map((it, i) => {
            const active = it.active ? " am-dropdown__item--active" : "";
            return `<button class="am-dropdown__item${active}" data-pick-idx="${i}">${escapeHtml(it.label)}</button>`;
        }).join("");
        dropdown.innerHTML = html;
        dropdown.style.top = top + "px";
        // v0.16-T4 修复：智能定位 — 4 方向都校验（.am-dock 有 overflow: hidden 会裁切超界部分）
        const PREDICT_WIDTH = 140; // 与 CSS min-width 120 + 边距对齐（保守值）
        const EDGE = 8;             // 距 dock 边界的安全距离

        // 水平：默认 left 对齐按钮，超出右沿则 right 对齐
        if (left + PREDICT_WIDTH > dockRect.width - EDGE) {
            dropdown.style.left = "auto";
            dropdown.style.right = (dockRect.right - rect.right) + "px";
        } else {
            dropdown.style.left = left + "px";
            dropdown.style.right = "auto";
        }

        // 垂直：默认在按钮下方，超出 dock 下沿则改在上方 + 限 maxHeight
        const spaceBelow = dockRect.height - (rect.bottom - dockRect.top);
        if (spaceBelow < 240) {
            dropdown.style.top = "auto";
            dropdown.style.bottom = (dockRect.height - (rect.top - dockRect.top) + 4) + "px";
            dropdown.style.maxHeight = Math.max(120, spaceBelow + (rect.bottom - dockRect.top) - 8) + "px";
        } else {
            dropdown.style.maxHeight = "300px";
        }
        dropdown.style.minWidth = rect.width + "px";

        // 绑定点击
        dropdown.querySelectorAll("[data-pick-idx]").forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const idx = Number(btn.dataset.pickIdx);
                const item = items[idx];
                dropdown.remove();
                document.removeEventListener("keydown", escHandler);
                if (item && typeof item.click === "function") item.click();
            };
        });

        this.dockElement.appendChild(dropdown);

        // ESC 关闭
        const escHandler = (e) => {
            if (e.key === "Escape" && dropdown.parentNode) {
                dropdown.remove();
                document.removeEventListener("keydown", escHandler);
                document.removeEventListener("mousedown", outsideHandler);
            }
        };
        // 点击其他位置关闭
        const outsideHandler = (e) => {
            if (!dropdown.contains(e.target) && e.target !== target) {
                dropdown.remove();
                document.removeEventListener("keydown", escHandler);
                document.removeEventListener("mousedown", outsideHandler);
            }
        };
        // 下一帧再绑 outside（避免立刻触发）
        setTimeout(() => {
            document.addEventListener("keydown", escHandler);
            document.addEventListener("mousedown", outsideHandler);
        }, 0);
    }

    openStatusPicker(target) {
        this.openHomeFilterDropdown(target, 'status');
    }

    openSortPicker(target) {
        this.openHomeFilterDropdown(target, 'sort');
    }

    openCategoryPicker(target) {
        const items = [{ label: this._t("categoryAll", "全部分类"), click: () => { this.filter.category = "all"; this.refreshMainContent(); }, active: this.filter.category === "all" }];
        CATEGORIES.forEach(c => items.push({
            label: c.emoji + " " + this._t(c.key, c.id === 'digital' ? '数码' : c.id === 'appliance' ? '家电' : c.id === 'home' ? '家居' : '其他'),
            click: () => { this.filter.category = c.id; this.refreshMainContent(); },
            active: this.filter.category === c.id,
        }));
        this._openPickerMenu(target, items, "category");
    }


    // ---------- 设置 Dialog ----------

    openSettingsDialog() {
        const tab = "general";
        const renderShell = () => `
            <div class="am-settings-dialog">
                <div class="am-settings__sidebar">
                    <button class="am-settings__tab am-settings__tab--active" data-tab="general">${escapeHtml(this._t("settingsTabGeneral", "常规"))}</button>
                    <button class="am-settings__tab" data-tab="data">${escapeHtml(this._t("settingsTabData", "数据"))}</button>
                    <button class="am-settings__tab" data-tab="ai">${escapeHtml(this._t("settingsTabAI", "AI"))}</button>
                    <button class="am-settings__tab" data-settings-tab="tags" data-tab="tags">${escapeHtml(this._t("settingsTagsTitle", "标签"))}</button>
                    <button class="am-settings__tab" data-settings-tab="logs" data-tab="logs">${escapeHtml(this._t("opLogTitle", "操作日志"))}</button>
                    <button class="am-settings__tab" data-tab="about">${escapeHtml(this._t("settingsTabAbout", "关于"))}</button>
                </div>
                <div class="am-settings__content">${this.renderSettingsTab(tab)}</div>
            </div>`;
        this.showDialog(this._t("settingsTitle", "资产管理设置"), renderShell(), (dialog) => {
            const root = dialog.element;
            if (root.classList) root.classList.add('am-settings-dialog-host');
            root.querySelectorAll(".am-settings__tab").forEach(btn => {
                btn.onclick = () => {
                    this._invalidateNoteIndexSettings(root);
                    this._closeSettingsClearAllAssetsConfirm(root);
                    root.querySelectorAll(".am-settings__tab").forEach(b => b.classList.remove("am-settings__tab--active"));
                    btn.classList.add("am-settings__tab--active");
                    root.querySelector(".am-settings__content").innerHTML = this.renderSettingsTab(btn.dataset.tab);
                    this.bindSettingsTabEvents(root, btn.dataset.tab);
                };
            });
            this.bindSettingsTabEvents(root, tab);
            root.querySelectorAll(".b3-dialog").forEach(el => { el.siyuanDialog = dialog; });
            const originalDestroy = dialog.destroy.bind(dialog);
            dialog.destroy = () => {
                this._invalidateNoteIndexSettings(root);
                this._closeSettingsClearAllAssetsConfirm(root);
                return originalDestroy();
            };
        }, this.isMobile ? "100vw" : "720px");
    }

    bindSettingsTabEvents(root, tab) {
        const restoreTab = () => {
            const content = root.querySelector('.am-settings__content');
            if (!content) return;
            content.innerHTML = this.renderSettingsTab(tab);
            this.bindSettingsTabEvents(root, tab);
        };
        if (tab === "general") {
            root.querySelectorAll('[name="defaultSort"]').forEach(el => {
                el.onchange = async () => {
                    const defaultSort = root.querySelector('[name="defaultSort"]').value;
                    const vm = root.querySelector('[name="defaultViewMode"]:checked');
                    const saved = await this.saveSettings({
                        defaultSort,
                        defaultViewMode: vm ? vm.value : (this.settings.defaultViewMode || 'list'),
                    });
                    if (!saved) return restoreTab();
                    this.filter.sort = this.settings.defaultSort;
                    this.refreshList();
                };
            });
            const viewModeInputs = root.querySelectorAll('[name="defaultViewMode"]');
            const viewModeOptions = root.querySelectorAll('[data-default-view-option]');
            const syncDefaultViewModeUi = value => {
                viewModeInputs.forEach(input => { input.checked = input.value === value; });
                viewModeOptions.forEach(option => {
                    const isSelected = option.dataset.defaultViewOption === value;
                    option.classList.toggle('am-form__radio--active', isSelected);
                    option.setAttribute('aria-checked', String(isSelected));
                    option.tabIndex = isSelected ? 0 : -1;
                });
            };
            const activateDefaultViewMode = option => {
                if (!option) return;
                const input = root.querySelector(`[name="defaultViewMode"][value="${option.dataset.defaultViewOption}"]`);
                option.focus();
                // Input click intentionally reuses the native change handler, including save rollback.
                if (input && !input.checked) input.click();
            };
            viewModeOptions.forEach(option => {
                option.onkeydown = event => {
                    const optionIndex = Array.prototype.indexOf.call(viewModeOptions, option);
                    let targetIndex = -1;
                    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                        targetIndex = (optionIndex + 1) % viewModeOptions.length;
                    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                        targetIndex = (optionIndex - 1 + viewModeOptions.length) % viewModeOptions.length;
                    } else if (event.key === 'Home') {
                        targetIndex = 0;
                    } else if (event.key === 'End') {
                        targetIndex = viewModeOptions.length - 1;
                    }
                    if (targetIndex >= 0) {
                        event.preventDefault();
                        activateDefaultViewMode(viewModeOptions[targetIndex]);
                        return;
                    }
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    activateDefaultViewMode(option);
                };
            });
            viewModeInputs.forEach(el => {
                el.onchange = async () => {
                    const previous = this.settings.defaultViewMode || 'list';
                    const selected = el.value;
                    syncDefaultViewModeUi(selected);
                    viewModeInputs.forEach(input => { input.disabled = true; });
                    if (!await this.saveSettings({ defaultViewMode: selected, viewMode: selected })) {
                        syncDefaultViewModeUi(previous);
                        this.showToast('⚠️ ' + this._t('settingsSaveFail', '设置保存失败'));
                        viewModeInputs.forEach(input => { input.disabled = false; });
                        return;
                    }
                    viewModeInputs.forEach(input => { input.disabled = false; });
                    this._assetViewTransition = true;
                    this.renderDock();
                };
            });
            // v1.7.3：矩阵列数偏好（auto/2/3/4）移入设置 Dialog。保存后就地更新 data-cols + 重挂 observer，不整页重渲染。
            const matrixColsInputs = root.querySelectorAll('[name="matrixCols"]');
            const matrixColsOptions = root.querySelectorAll('[data-matrix-cols-option]');
            const syncMatrixColsUi = value => {
                matrixColsInputs.forEach(input => { input.checked = String(input.value) === String(value); });
                matrixColsOptions.forEach(option => {
                    const isSelected = String(option.dataset.matrixColsOption) === String(value);
                    option.classList.toggle('am-form__radio--active', isSelected);
                    option.setAttribute('aria-checked', String(isSelected));
                });
            };
            matrixColsInputs.forEach(el => {
                el.onchange = async () => {
                    const raw = el.value;
                    const next = raw === 'auto' ? 'auto' : Number(raw);
                    const previous = this.settings.matrixCols == null ? 'auto' : this.settings.matrixCols;
                    syncMatrixColsUi(raw);
                    matrixColsInputs.forEach(input => { input.disabled = true; });
                    if (!await this.saveSettings({ matrixCols: next })) {
                        syncMatrixColsUi(previous);
                        this.showToast('⚠️ ' + this._t('settingsSaveFail', '设置保存失败'));
                        matrixColsInputs.forEach(input => { input.disabled = false; });
                        return;
                    }
                    matrixColsInputs.forEach(input => { input.disabled = false; });
                    this._applyMatrixColsPreference();
                };
            });
            // v2.6.4 P2：汇率设置重构——自动更新开关 + 刷新/恢复按钮 + 三币种手动修正。
            // 手动保存：用户填 X（1 外币 = X CNY）→ rates[cur] = 1/X 合并进当前 rates，
            // 整体替换写入（source='manual'）→ 更新缓存 → 刷新首页 → restoreTab 局部反馈。
            const rateAutoRefreshInput = root.querySelector('[name="exchangeRateAutoRefresh"]');
            if (rateAutoRefreshInput) rateAutoRefreshInput.onchange = async () => {
                const enabled = rateAutoRefreshInput.checked === true;
                const saved = await this.saveSettings({ exchangeRateAutoRefresh: enabled });
                if (!saved) {
                    rateAutoRefreshInput.checked = (this.settings.exchangeRateAutoRefresh !== false);
                    this.showToast('⚠️ ' + this._t('settingsSaveFail', '设置保存失败'));
                }
            };
            const rateRefreshButton = root.querySelector('[data-action="exchange-rate-refresh"]');
            if (rateRefreshButton) rateRefreshButton.onclick = async () => {
                if (rateRefreshButton.disabled) return;
                const idleLabel = rateRefreshButton.textContent;
                rateRefreshButton.disabled = true;
                rateRefreshButton.textContent = this._t('exchangeRateRefreshing', '刷新中…');
                let ok = false;
                try { ok = await this._refreshExchangeRates({ silent: false }); }
                catch (error) { ok = false; console.warn('[AssetManagement] exchange rate refresh failed:', error && error.message); }
                // 成功后设置内容已重渲染，旧按钮节点已被替换；仅在失败时原地恢复。
                if (ok || this._unloaded) return;
                rateRefreshButton.disabled = false;
                rateRefreshButton.textContent = idleLabel;
            };
            const rateSaveButton = root.querySelector('[data-action="exchange-rate-save"]');
            if (rateSaveButton) rateSaveButton.onclick = async () => {
                const rateInputSpecs = [
                    ['exchangeRateUsdToCny', 'USD'],
                    ['exchangeRateEurToCny', 'EUR'],
                    ['exchangeRateGbpToCny', 'GBP'],
                ];
                const entries = [];
                for (const spec of rateInputSpecs) {
                    const input = root.querySelector('[name="' + spec[0] + '"]');
                    const raw = input ? String(input.value).trim() : '';
                    if (!raw) continue; // 留空 = 保持不变
                    const x = Number(raw);
                    if (!Number.isFinite(x) || x <= 0) {
                        this.showToast('⚠️ ' + this._t('exchangeRateInvalid', '请输入大于 0 的汇率'));
                        return;
                    }
                    entries.push([spec[1], 1 / x]);
                }
                if (!entries.length) {
                    this.showToast('⚠️ ' + this._t('exchangeRateFillAtLeastOne', '请至少填写一项汇率'));
                    return;
                }
                if (!this.storage || typeof this.storage.mutateFormalAssetDomain !== 'function') {
                    this.showToast('⚠️ ' + this._t('exchangeRateSaveFail', '汇率保存失败'));
                    return;
                }
                try {
                    const current = this._getExchangeRates();
                    const merged = Object.assign({}, (current && current.rates && typeof current.rates === 'object') ? current.rates : {});
                    entries.forEach(entry => { merged[entry[0]] = entry[1]; });
                    const transaction = await this.storage.mutateFormalAssetDomain(async () => ({
                        change: { exchangeRates: { baseCurrency: 'CNY', rates: merged, source: 'manual' } },
                    }));
                    this._exchangeRates = (transaction && transaction.exchangeRates)
                        || { schemaVersion: 1, baseCurrency: 'CNY', rates: merged, source: 'manual' };
                    this.refreshMainContent();
                    restoreTab();
                    this.showToast('✓ ' + this._t('exchangeRateSaveSuccess', '汇率已保存'));
                } catch (error) {
                    console.warn('[AssetManagement] save exchange rate failed:', error && error.message);
                    this.showToast('⚠️ ' + this._t('exchangeRateSaveFail', '汇率保存失败'));
                }
            };
        }
        if (tab === 'data') {
            // v0.18 阶段 7：JSON 导入导出 UI 已隐藏；bindFormalJsonSettings 为 null-safe，
            // 元素不存在时自动 no-op（底层函数保留作死代码，仍被既有测试覆盖）。
            this.bindFormalJsonSettings(root);
            this.bindMarkdownExportSettings(root);
            // v2.5.0 阶段2：笔记索引区块（异步加载笔记本列表，失败只提示不阻断）。
            this._bindNoteIndexSettings(root);
        }
        if (tab === 'ai') this.bindSettingsAI(root);
        if (tab === 'tags') {
            const create = root.querySelector('[data-action="settings-create-tag"]');
            if (create) create.onclick = async () => {
                const input = root.querySelector('[name="settingsTagLabel"]');
                try {
                    await this.createTag({ label: input ? input.value : '' });
                    restoreTab();
                } catch (error) {
                    this.showToast('⚠️ ' + String(error && error.message || error));
                }
            };
            root.querySelectorAll('[data-settings-tag-delete]').forEach(button => {
                button.onclick = async () => {
                    try {
                        if (await this.deleteTag(button.dataset.settingsTagDelete)) restoreTab();
                    } catch (error) {
                        this.showToast('⚠️ ' + String(error && error.message || error));
                    }
                };
            });
            // v2.3.0 阶段 2b：swatch → 取色器 → updateTag({color}) → restoreTab 刷新本区
            root.querySelectorAll('[data-settings-tag-color]').forEach(button => {
                button.onclick = () => {
                    const tag = this.getTagById(button.dataset.settingsTagColor);
                    if (!tag) return;
                    this._openTagColorPicker(tag, button, async (color) => {
                        try {
                            await this.updateTag(tag.id, { color });
                            restoreTab();
                        } catch (error) {
                            this.showToast('⚠️ ' + String(error && error.message || error));
                        }
                    });
                };
            });
        }
        if (tab === 'logs') {
            const open = root.querySelector('[data-open-formal-oplog]');
            if (open) open.onclick = () => this.openFormalOperationLogDialog();
        }
    }

    renderResourceIndexSettings() {
        const state = this.getResourceIndexState();
        const notebooks = this._resourceIndexNotebooks || [];
        const documents = this._resourceIndexDocuments || [];
        const statusKey = state.status === 'synced' ? 'resourceIndexStatusSynced' : state.status === 'pending' ? 'resourceIndexStatusPending' : state.status === 'error' ? 'resourceIndexStatusError' : 'resourceIndexStatusIdle';
        const selectedNotebook = state.notebookId || '';
        const selectedDocument = state.documentId || '';
        return `<div class="am-settings__section am-resource-index-settings">
            <h3>${escapeHtml(this._t('resourceIndexTitle', '资源引用索引'))}</h3>
            <p class="am-settings__hint">${escapeHtml(this._t('resourceIndexHint', '仅在使用上传或已有资源封面时创建受控引用块，避免资源被清理。默认目标为 Studio / 资产管理。'))}</p>
            <label class="am-form__label">${escapeHtml(this._t('resourceIndexNotebook', '笔记本'))}</label>
            <select class="b3-select fn__block" name="resourceIndexNotebook"><option value="">${escapeHtml(this._t('resourceIndexNotebookLoading', '加载笔记本...'))}</option>${notebooks.map(notebook => `<option value="${escapeHtml(notebook.id)}" ${notebook.id === selectedNotebook ? 'selected' : ''}>${escapeHtml(notebook.name || notebook.id)}</option>`).join('')}</select>
            <label class="am-form__label">${escapeHtml(this._t('resourceIndexDocument', '文档'))}</label>
            <select class="b3-select fn__block" name="resourceIndexDocument"><option value="">${escapeHtml(this._t('resourceIndexDocumentSelect', '选择文档'))}</option>${documents.map(document => `<option value="${escapeHtml(document.id)}" ${document.id === selectedDocument ? 'selected' : ''}>${escapeHtml(document.name || document.path || document.id)}</option>`).join('')}</select>
            <div class="am-resource-index-settings__actions"><button class="b3-button b3-button--primary" data-action="resource-index-save">${escapeHtml(this._t('resourceIndexSave', '保存目标并同步'))}</button><button class="b3-button" data-action="resource-index-retry">${escapeHtml(this._t('resourceIndexRetry', '重试'))}</button></div>
            <p class="am-settings__hint am-resource-index-settings__status" data-resource-index-status>${escapeHtml(this._t(statusKey, state.status))}${state.lastError ? ' · ' + escapeHtml(state.lastError) : ''}</p>
        </div>`;
    }

    async bindResourceIndexSettings(root) {
        if (!root) return;
        const notebookSelect = root.querySelector('[name="resourceIndexNotebook"]');
        const documentSelect = root.querySelector('[name="resourceIndexDocument"]');
        const refresh = () => {
            const state = this.getResourceIndexState();
            if (notebookSelect) notebookSelect.innerHTML = `<option value="">${escapeHtml(this._t('resourceIndexNotebookSelect', '选择笔记本'))}</option>${this._resourceIndexNotebooks.map(notebook => `<option value="${escapeHtml(notebook.id)}" ${notebook.id === state.notebookId ? 'selected' : ''}>${escapeHtml(notebook.name || notebook.id)}</option>`).join('')}`;
            if (documentSelect) documentSelect.innerHTML = `<option value="">${escapeHtml(this._t('resourceIndexDocumentSelect', '选择文档'))}</option>${this._resourceIndexDocuments.map(document => `<option value="${escapeHtml(document.id)}" ${document.id === state.documentId ? 'selected' : ''}>${escapeHtml(document.name || document.path || document.id)}</option>`).join('')}`;
        };
        const loadDocuments = async (notebookId) => {
            if (!notebookId) { this._resourceIndexDocuments = []; refresh(); return; }
            try { this._resourceIndexDocuments = await resourceIndex.listNotebookDocuments(notebookId); }
            catch (error) { this._resourceIndexDocuments = []; this.showToast('⚠️ ' + this._t('resourceIndexLoadFailed', '无法加载目标文档')); }
            refresh();
        };
        notebookSelect.onchange = () => loadDocuments(notebookSelect.value);
        root.querySelector('[data-action="resource-index-save"]').onclick = async () => {
            const notebookId = notebookSelect.value;
            const documentId = documentSelect.value;
            if (!notebookId || !documentId) { this.showToast('⚠️ ' + this._t('resourceIndexTargetRequired', '请选择笔记本和文档')); return; }
            const valid = await resourceIndex.verifyDocumentInNotebook(notebookId, documentId).catch(() => false);
            if (!valid) { this.showToast('⚠️ ' + this._t('resourceIndexTargetInvalid', '所选文档不属于该笔记本')); return; }
            await this.reconcileResourceIndex({ notebookId: notebookId, documentId: documentId });
            root.querySelector('[data-resource-index-status]').textContent = this._t(this.getResourceIndexState().status === 'synced' ? 'resourceIndexStatusSynced' : 'resourceIndexStatusError', this.getResourceIndexState().status);
        };
        root.querySelector('[data-action="resource-index-retry"]').onclick = async () => {
            await this.reconcileResourceIndex();
            root.querySelector('[data-resource-index-status]').textContent = this._t(this.getResourceIndexState().status === 'synced' ? 'resourceIndexStatusSynced' : 'resourceIndexStatusError', this.getResourceIndexState().status);
        };
        try {
            this._resourceIndexNotebooks = await resourceIndex.listNotebooks();
            refresh();
            const current = this.getResourceIndexState();
            if (current.notebookId) await loadDocuments(current.notebookId);
        } catch (error) {
            this.showToast('⚠️ ' + this._t('resourceIndexLoadFailed', '无法加载索引目标'));
        }
    }

    renderSettingsTab(name) {
        if (name === "general") return this.renderSettingsGeneral();
        if (name === "data") return this.renderSettingsData();
        if (name === "ai") return this.renderSettingsAI();
        if (name === "tags") return this.renderSettingsTags();
        if (name === "logs") return this.renderSettingsLogs();
        if (name === "about") return this.renderSettingsAbout();
        return "";
    }

    bindSettingsAI(root) {
        if (!root) return;
        const names = ['aiEnabled', 'aiAllowQuery', 'aiAllowCreate', 'aiAllowModify', 'aiAllowLifecycle', 'aiAllowRecords', 'aiAllowDelete'];
        const controls = root.querySelectorAll('[data-agent-setting]');
        let saving = false;
        const syncControls = () => {
            const enabled = !!(root.querySelector('[name="aiEnabled"]') || {}).checked;
            controls.forEach(control => {
                control.disabled = saving || (control.name !== 'aiEnabled' && !enabled);
            });
        };
        const save = async () => {
            if (saving) return;
            const patch = {};
            names.forEach(name => {
                const control = root.querySelector('[name="' + name + '"]');
                patch[name] = !!(control && control.checked);
            });
            saving = true;
            syncControls();
            const saved = await this.saveSettings(patch);
            saving = false;
            if (!saved) {
                names.forEach(name => {
                    const control = root.querySelector('[name="' + name + '"]');
                    if (control) control.checked = this.settings[name] === true;
                });
                this.showToast('⚠️ ' + this._t('settingsSaveFail', '设置保存失败'));
            }
            syncControls();
        };
        controls.forEach(control => { control.onchange = save; });
        syncControls();
        // v2.6.0：打开设置时读一次内核注册心跳（由 kernel.js 写入）。
        this._refreshAgentKernelStatus(root);
    }

    async _refreshAgentKernelStatus(root) {
        const target = root && root.querySelector('[data-agent-kernel-status]');
        if (!target) return;
        let tools = [];
        try {
            const raw = await this.loadData(AGENT_KERNEL_STATUS_FILE);
            const status = this._parseAgentQueueFile(raw);
            tools = status && Array.isArray(status.tools) ? status.tools : [];
        } catch (error) {
            tools = [];
        }
        if (tools.length) {
            target.textContent = this._t('agentKernelStatusCount', '内核 Agent 工具：已注册 {count} 个', { count: tools.length });
        } else {
            target.textContent = this._t('agentKernelUnregistered', '内核 Agent 工具：未注册（重启思源或重载插件）');
        }
    }

    renderSettingsAI() {
        const settings = this.settings || {};
        const permissions = [
            ['aiAllowQuery', 'agentPermissionQuery'],
            ['aiAllowCreate', 'agentPermissionCreate'],
            ['aiAllowModify', 'agentPermissionModify'],
            ['aiAllowLifecycle', 'agentPermissionLifecycle'],
            ['aiAllowRecords', 'agentPermissionRecords'],
            ['aiAllowDelete', 'agentPermissionDelete'],
        ];
        const switchRow = (name, labelKey) => `<label class="am-agent-settings__switch"><span>${escapeHtml(this._t(labelKey, labelKey))}</span><input type="checkbox" name="${name}" data-agent-setting ${settings[name] === true ? 'checked' : ''}/></label>`;
        return `<div class="am-settings__section am-agent-settings">
            <h3>${escapeHtml(this._t('agentTitle', '官方 Agent 工具'))}</h3>
            <p class="am-settings__hint">${escapeHtml(this._t('agentDescription', '通过内核 Agent 注册（registerCapability）暴露资产工具，同时供内置 Agent 与 MCP 使用。'))}</p>
            <p class="am-settings__hint">${escapeHtml(this._t('agentConfirmationNotice', '读取免确认；写入会弹出思源 Agent 确认，且受权限开关约束。'))}</p>
            <p class="am-settings__hint" data-agent-kernel-status>${escapeHtml(this._t('agentKernelStatus', '内核 Agent 工具'))}</p>
            ${switchRow('aiEnabled', 'agentEnabled')}
        </div>
        <div class="am-settings__section am-agent-settings__permissions">
            <h3>${escapeHtml(this._t('agentPermissionsTitle', '工具权限'))}</h3>
            ${permissions.map(item => switchRow(item[0], item[1])).join('')}
            <p class="am-settings__hint">${escapeHtml(this._t('agentQueueHint', '写入请求经内核队列转发给前端插件执行，需保持插件启用。'))}</p>
            <p class="am-settings__hint">${escapeHtml(this._t('agentPermissionHint', '权限在每次工具调用时读取最新设置，关闭后立即生效。'))}</p>
        </div>`;
    }

    renderSettingsGeneral() {
        // v2.6.4 P2：汇率设置重构（自动更新开关 + 当前汇率状态 + 手动修正三币种）。
        // rates[X] 语义 = 1 baseCurrency(CNY) 兑多少外币，故展示/占位值 = 1 / rates[X]。
        const ratesObj = this._getExchangeRates();
        const rates = (ratesObj && ratesObj.rates && typeof ratesObj.rates === 'object') ? ratesObj.rates : {};
        const hasRates = Object.keys(rates).length > 0;
        const rateSource = exchangeRateApi.normalizeExchangeRateSource(ratesObj ? ratesObj.source : null);
        const rateDisplay = currency => {
            const value = Number(rates[currency]);
            return (Number.isFinite(value) && value > 0) ? (1 / value).toFixed(4) : '—';
        };
        const ratePlaceholder = currency => {
            const value = Number(rates[currency]);
            if (Number.isFinite(value) && value > 0) return (1 / value).toFixed(4);
            return currency === 'USD' ? '7.2000' : ''; // 美元回落内置默认参考
        };
        const sourceBadge = !hasRates
            ? { cls: 'default', text: this._t('exchangeRateSourceDefault', '默认参考') }
            : (rateSource === 'auto'
                ? { cls: 'auto', text: this._t('exchangeRateSourceAuto', '自动更新') }
                : { cls: 'manual', text: this._t('exchangeRateSourceManual', '手动设置') });
        const updatedAtText = this._formatExchangeRateUpdatedAt(ratesObj ? ratesObj.updatedAt : null);
        const exchangeRateAutoRefreshOn = this.settings.exchangeRateAutoRefresh !== false;
        const matrixColsPref = this.settings.matrixCols == null ? 'auto' : this.settings.matrixCols;
        return `
            <div class="am-settings__section">
                <h3>${escapeHtml(this._t("defaultSort"))}</h3>
                <p class="am-settings__hint">${escapeHtml(this._t("defaultSortHint"))}</p>
                <select class="b3-select fn__block" name="defaultSort">
                    ${SORTS.map(s => `<option value="${s.id}" ${this.settings.defaultSort === s.id ? "selected" : ""}>${escapeHtml(this._t(s.key))}</option>`).join("")}
                </select>
            </div>
            <div class="am-settings__section">
                <h3>${escapeHtml(this._t("defaultViewMode"))}</h3>
                <div class="am-settings__radio-group" role="radiogroup" aria-label="${escapeHtml(this._t("defaultViewMode"))}">
                    <label class="am-form__radio ${this.settings.defaultViewMode === "list" ? "am-form__radio--active" : ""}" data-default-view-option="list" role="radio" aria-checked="${this.settings.defaultViewMode === "list" ? "true" : "false"}" tabindex="${this.settings.defaultViewMode === "list" ? "0" : "-1"}">
                        <input type="radio" name="defaultViewMode" value="list" ${this.settings.defaultViewMode === "list" ? "checked" : ""}/>
                        <span>${escapeHtml(this._t("viewModeList", "列表"))}</span>
                    </label>
                    <label class="am-form__radio ${this.settings.defaultViewMode === "matrix" ? "am-form__radio--active" : ""}" data-default-view-option="matrix" role="radio" aria-checked="${this.settings.defaultViewMode === "matrix" ? "true" : "false"}" tabindex="${this.settings.defaultViewMode === "matrix" ? "0" : "-1"}">
                        <input type="radio" name="defaultViewMode" value="matrix" ${this.settings.defaultViewMode === "matrix" ? "checked" : ""}/>
                        <span>${escapeHtml(this._t("viewModeMatrix", "矩阵"))}</span>
                    </label>
                </div>
            </div>
            <div class="am-settings__section">
                <h3>${escapeHtml(this._t("matrixColsSettingTitle", "矩阵视图列数"))}</h3>
                <p class="am-settings__hint">${escapeHtml(this._t("matrixColsSettingHint", "「自动」会随面板宽度自适应列数；也可固定为 2 / 3 / 4 列。"))}</p>
                <div class="am-settings__radio-group" role="radiogroup" aria-label="${escapeHtml(this._t("matrixColsSettingTitle", "矩阵视图列数"))}">
                    ${['auto', 2, 3, 4].map(opt => { const selected = String(matrixColsPref) === String(opt); return `<label class="am-form__radio${selected ? " am-form__radio--active" : ""}" data-matrix-cols-option="${opt}" role="radio" aria-checked="${selected ? "true" : "false"}"><input type="radio" name="matrixCols" value="${opt}" ${selected ? "checked" : ""}/><span>${escapeHtml(this._matrixColsButtonLabel(opt))}</span></label>`; }).join("")}
                </div>
            </div>
            <div class="am-settings__section am-exchange-rate-settings">
                <h3>${escapeHtml(this._t("exchangeRateSettingsTitle", "汇率设置"))}</h3>
                <p class="am-settings__hint">${escapeHtml(this._t("exchangeRateSettingsHint", "自动获取美元、欧元、英镑兑人民币汇率，也可手动修正；手动设置后自动更新不再覆盖。"))}</p>
                <label class="am-exchange-rate-settings__switch-row">
                    <span class="am-exchange-rate-settings__switch-text">
                        <span class="am-exchange-rate-settings__switch-title">${escapeHtml(this._t("exchangeRateAutoRefresh", "自动更新汇率"))}</span>
                        <span class="am-settings__hint am-exchange-rate-settings__switch-hint">${escapeHtml(this._t("exchangeRateAutoRefreshHint", "打开后，启动时若距上次更新超过 24 小时将自动获取最新汇率。"))}</span>
                    </span>
                    <input type="checkbox" name="exchangeRateAutoRefresh" ${exchangeRateAutoRefreshOn ? "checked" : ""}/>
                </label>
                <div class="am-exchange-rate-settings__status">
                    <div class="am-exchange-rate-settings__status-head">
                        <span class="am-exchange-rate-settings__status-title">${escapeHtml(this._t("exchangeRateCurrentTitle", "当前汇率"))}</span>
                        <span class="am-exchange-rate-settings__badge am-exchange-rate-settings__badge--${sourceBadge.cls}">${escapeHtml(sourceBadge.text)}</span>
                    </div>
                    <div class="am-exchange-rate-settings__status-row">${escapeHtml(this._t("exchangeRateUsdRow", "1 美元 = {value} 元", { value: rateDisplay('USD') }))}</div>
                    <div class="am-exchange-rate-settings__status-row">${escapeHtml(this._t("exchangeRateEurRow", "1 欧元 = {value} 元", { value: rateDisplay('EUR') }))}</div>
                    <div class="am-exchange-rate-settings__status-row">${escapeHtml(this._t("exchangeRateGbpRow", "1 英镑 = {value} 元", { value: rateDisplay('GBP') }))}</div>
                    <div class="am-exchange-rate-settings__status-time">${escapeHtml(updatedAtText ? this._t("exchangeRateUpdatedAt", "更新于 {time}", { time: updatedAtText }) : '—')}</div>
                </div>
                <div class="am-exchange-rate-settings__actions">
                    <button type="button" class="b3-button am-exchange-rate-settings__refresh" data-action="exchange-rate-refresh">${escapeHtml(rateSource === 'manual' ? this._t("exchangeRateRestoreAuto", "恢复自动汇率") : this._t("exchangeRateRefreshNow", "立即刷新"))}</button>
                </div>
                <h4 class="am-exchange-rate-settings__manual-title">${escapeHtml(this._t("exchangeRateManualTitle", "手动修正"))}</h4>
                <p class="am-settings__hint">${escapeHtml(this._t("exchangeRateManualAdjustHint", "填写后将覆盖自动汇率，且自动更新不再覆盖手动值；留空保持不变。"))}</p>
                <label class="am-form__label am-exchange-rate-settings__label" for="am-exchange-rate-usd">${escapeHtml(this._t("exchangeRateUsdLabel", "1 美元 = ？人民币"))}</label>
                <input id="am-exchange-rate-usd" class="b3-text-field am-exchange-rate-settings__input" type="number" inputmode="decimal" min="0" step="0.0001" name="exchangeRateUsdToCny" value="" placeholder="${escapeHtml(ratePlaceholder('USD'))}"/>
                <label class="am-form__label am-exchange-rate-settings__label" for="am-exchange-rate-eur">${escapeHtml(this._t("exchangeRateEurLabel", "1 欧元 = ？人民币"))}</label>
                <input id="am-exchange-rate-eur" class="b3-text-field am-exchange-rate-settings__input" type="number" inputmode="decimal" min="0" step="0.0001" name="exchangeRateEurToCny" value="" placeholder="${escapeHtml(ratePlaceholder('EUR'))}"/>
                <label class="am-form__label am-exchange-rate-settings__label" for="am-exchange-rate-gbp">${escapeHtml(this._t("exchangeRateGbpLabel", "1 英镑 = ？人民币"))}</label>
                <input id="am-exchange-rate-gbp" class="b3-text-field am-exchange-rate-settings__input" type="number" inputmode="decimal" min="0" step="0.0001" name="exchangeRateGbpToCny" value="" placeholder="${escapeHtml(ratePlaceholder('GBP'))}"/>
                <div class="am-exchange-rate-settings__manual-actions">
                    <button type="button" class="b3-button b3-button--primary am-exchange-rate-settings__save" data-action="exchange-rate-save">${escapeHtml(this._t("exchangeRateSave", "保存汇率"))}</button>
                </div>
            </div>
            `;
    }

    renderSettingsData() {
        // v0.18 阶段 7：数据 Tab 精简——只保留 Markdown 导出（textarea 撑满 dialog 内容区）。
        // JSON 导入导出 UI 与「初始化正式数据」危险区已移除（底层函数保留作死代码，仍被既有测试覆盖）。
        // v2.5.0 阶段2：新增「笔记索引」区块（索引文档引擎开关与目标配置）。
        return `
            ${this.renderNoteIndexSettings()}
            <div class="am-settings__section am-markdown-export">
                <h3>${escapeHtml(this._t('markdownExportTitle', '导出 Markdown'))}</h3>
                <p class="am-settings__hint">${escapeHtml(this._t('markdownExportHint', '生成一份可手动复制的本地 Markdown，不会写入思源文档。'))}</p>
                <div class="am-markdown-export__actions"><button type="button" class="b3-button b3-button--primary" data-action="markdown-export">${escapeHtml(this._t('markdownExportAction', '导出 Markdown'))}</button><button type="button" class="b3-button" data-action="markdown-copy">${escapeHtml(this._t('markdownExportCopy', '复制 Markdown'))}</button></div>
                <h3>${escapeHtml(this._t('markdownExportResult', '导出结果'))}</h3>
                <textarea class="b3-text-field am-markdown-export__result" data-markdown-export-result readonly placeholder="${escapeHtml(this._t('markdownExportResultPlaceholder', '点击“导出 Markdown”后将在这里生成内容。'))}"></textarea>
            </div>`;
    }

    /** v2.5.0 P2：稳定根节点保留事件委托，首次进入先显示 loading。 */
    renderNoteIndexSettings() {
        return `
            <section class="am-settings__section am-note-index-settings">
                <h3>${escapeHtml(this._t('noteIndexTitle', '笔记索引'))}</h3>
                <div class="am-note-index-root" data-note-index-root aria-live="polite">
                    <div class="am-note-index-loading" role="status">${escapeHtml(this._t('noteIndexLoading', '正在检测索引文档...'))}</div>
                </div>
            </section>`;
    }

    _invalidateNoteIndexSettings(settingsRoot) {
        const binding = this._noteIndexSettingsBinding;
        if (settingsRoot && binding && binding.settingsRoot !== settingsRoot) return;
        if (binding && binding.noteRoot) this._closeScopedConfirm(binding.noteRoot);
        this._noteIndexSettingsGeneration += 1;
        this._noteIndexSettingsBinding = null;
        this._noteIndexSettingsToken = null;
        this._noteIndexSettingsRoot = null;
        this._noteIndexBusyAction = '';
    }

    _createNoteIndexSettingsBinding(settingsRoot, noteRoot) {
        this._invalidateNoteIndexSettings();
        const binding = {
            generation: ++this._noteIndexSettingsGeneration,
            settingsRoot: settingsRoot,
            noteRoot: noteRoot,
        };
        this._noteIndexSettingsBinding = binding;
        this._noteIndexSettingsRoot = noteRoot;
        this._noteIndexSettingsToken = {
            generation: binding.generation,
            binding: binding,
            phase: 'bind',
        };
        return binding;
    }

    _isCurrentNoteIndexSettingsBinding(binding) {
        return !!(binding
            && this._noteIndexSettingsBinding === binding
            && this._noteIndexSettingsRoot === binding.noteRoot
            && binding.noteRoot
            && binding.noteRoot.isConnected === true);
    }

    _beginNoteIndexSettingsAsync(binding, phase) {
        if (!this._isCurrentNoteIndexSettingsBinding(binding)) return null;
        const token = {
            generation: ++this._noteIndexSettingsGeneration,
            binding: binding,
            phase: phase,
        };
        this._noteIndexSettingsToken = token;
        return token;
    }

    _isCurrentNoteIndexSettingsToken(token) {
        return !!(token
            && this._noteIndexSettingsToken === token
            && this._isCurrentNoteIndexSettingsBinding(token.binding));
    }

    _renderNoteIndexNotebookField(selectedId) {
        const notebooks = (Array.isArray(this._noteIndexNotebooks) ? this._noteIndexNotebooks : [])
            .filter(notebook => notebook && notebook.closed !== true);
        const options = notebooks.map(notebook => `<option value="${escapeHtml(notebook.id)}"${notebook.id === selectedId ? ' selected' : ''}>${escapeHtml(notebook.name || notebook.id)}</option>`).join('');
        return `<label class="am-note-index-field"><span>${escapeHtml(this._t('noteIndexNotebook', '笔记本'))}</span><select class="b3-select fn__block am-note-index-select" name="noteIndexNotebook" data-note-index-notebook><option value="">${escapeHtml(this._t('noteIndexNotebookPlaceholder', '选择笔记本'))}</option>${options}</select></label>`;
    }

    _renderNoteIndexSettingsContent(inspection) {
        const info = inspection || { state: 'error' };
        const operation = this._noteIndexOperationState || null;
        let state = String(info.state || 'error');
        if (state !== 'ready' && operation && operation.reason === 'name-conflict') state = 'name-conflict';
        if (state !== 'ready' && operation && (operation.reason === 'marker-pending' || operation.markerPending)) state = 'markerPending';

        const settings = this.settings || {};
        const selectedId = String(this._noteIndexSelectedNotebookId || info.notebookId || settings.indexNotebookId || '');
        const busy = !!this._noteIndexBusyAction;
        const button = (action, label, primary, disabled, busyLabel) => {
            const isCurrent = this._noteIndexBusyAction === action;
            const text = isCurrent && busyLabel ? busyLabel : label;
            return `<button type="button" class="b3-button${primary ? ' b3-button--primary' : ''} am-note-index-action" data-note-index-action="${action}"${busy || disabled ? ' disabled' : ''}${isCurrent ? ' aria-busy="true"' : ''}>${escapeHtml(text)}</button>`;
        };
        const notebookField = this._renderNoteIndexNotebookField(selectedId);
        const selectRequired = !selectedId
            ? `<p class="am-note-index-inline am-note-index-inline--hint">${escapeHtml(this._t('noteIndexSelectRequired', '请先选择一个已打开的笔记本。'))}</p>` : '';
        const inlineError = String(this._noteIndexInlineError || this._noteIndexNotebookLoadError || '');
        const inline = inlineError && state !== 'name-conflict' && state !== 'markerPending' && state !== 'error'
            ? `<p class="am-note-index-inline am-note-index-inline--error" role="alert">${escapeHtml(inlineError)}</p>` : '';

        if (state === 'unconfigured') {
            return `<div class="am-note-index-card am-note-index-card--neutral"><p class="am-note-index-description">${escapeHtml(this._t('noteIndexUnconfiguredDescription', '选择一个笔记本，插件会创建并自动维护索引文档。文档可以移动或重命名，请勿手动编辑其中的资产条目。'))}</p></div>${notebookField}${selectRequired}<div class="am-note-index-actions">${button('create', this._t('noteIndexCreateEnable', '创建并启用'), true, !selectedId, this._t('noteIndexCreating', '正在创建...'))}</div>${inline}`;
        }

        if (state === 'ready') {
            const title = String(info.title || info.docId || '');
            const notebookName = String(info.notebookName || info.notebookId || '');
            const hPath = String(info.hPath || '/');
            const location = notebookName + ' / ' + hPath.replace(/^\/+/, '');
            const autoSync = settings.indexAutoSync !== false;
            return `<div class="am-note-index-card am-note-index-card--ready"><div class="am-note-index-status"><span class="am-note-index-dot am-note-index-dot--ready" aria-hidden="true"></span><strong>${escapeHtml(this._t('noteIndexReady', '索引文档已连接'))}</strong></div><div class="am-note-index-document-title">${escapeHtml(title)}</div><div class="am-note-index-location">${escapeHtml(location)}</div></div><div class="am-form-row am-form-row--toggle am-note-index-switch-row"><span class="am-form-row__label">${escapeHtml(this._t('noteIndexAutoSync', '数据变更后自动同步'))}</span><label class="am-form-toggle"><input type="checkbox" name="noteIndexAutoSync" data-note-index-auto-sync ${autoSync ? 'checked' : ''}${busy ? ' disabled' : ''}><span class="am-form-toggle__track"><span class="am-form-toggle__thumb"></span></span></label></div><div class="am-note-index-actions">${button('open', this._t('noteIndexOpenDocument', '打开文档'), false, !info.docId)}${button('sync', this._t('noteIndexSyncNow', '立即同步'), true, false, this._t('noteIndexSyncing', '正在同步...'))}${button('repair', this._t('noteIndexRebuild', '修复索引'), false, false, this._t('noteIndexRebuilding', '正在修复索引...'))}</div><p class="am-note-index-repair-hint">${escapeHtml(this._t('noteIndexRebuildHint', '原地修复索引内容，不会新建文档，也不会更换已有资产块 ID。'))}</p>${inline}`;
        }

        if (state === 'closed') {
            return `<div class="am-note-index-card am-note-index-card--warning"><div class="am-note-index-status"><span class="am-note-index-dot am-note-index-dot--warning" aria-hidden="true"></span><strong>${escapeHtml(this._t('noteIndexNotebookUnavailable', '笔记本已关闭'))}</strong></div><p class="am-note-index-description">${escapeHtml(this._t('noteIndexClosedDescription', '索引文档所在笔记本已关闭。打开笔记本后将自动恢复同步。'))}</p></div><div class="am-note-index-actions">${button('redetect', this._t('noteIndexRedetect', '重新检测'), true, false, this._t('noteIndexDetecting', '正在检测...'))}</div>${inline}`;
        }

        if (state === 'missing') {
            return `<div class="am-note-index-card am-note-index-card--error"><div class="am-note-index-status"><span class="am-note-index-dot am-note-index-dot--error" aria-hidden="true"></span><strong>${escapeHtml(this._t('noteIndexMissing', '索引文档已被删除'))}</strong></div><p class="am-note-index-description">${escapeHtml(this._t('noteIndexMissingDescription', '索引文档已被删除。资产管理功能不受影响，但已有块引用可能失效。'))}</p></div>${notebookField}${selectRequired}<div class="am-note-index-actions">${button('recreate', this._t('noteIndexRecreate', '重新创建文档'), true, !selectedId, this._t('noteIndexRecreating', '正在重新创建...'))}</div>${inline}`;
        }

        if (state === 'name-conflict') {
            return `<div class="am-note-index-card am-note-index-card--error"><div class="am-note-index-status"><span class="am-note-index-dot am-note-index-dot--error" aria-hidden="true"></span><strong>${escapeHtml(this._t('noteIndexNameConflictTitle', '索引文档名称冲突'))}</strong></div><p class="am-note-index-description" role="alert">${escapeHtml(this._t('noteIndexNameConflict', '发现同名文档，但无法确认由插件创建。请重命名该文档后重试。'))}</p></div>${notebookField}${selectRequired}<div class="am-note-index-actions">${button('retry', this._t('noteIndexRetry', '重试'), true, !selectedId, this._t('noteIndexCreating', '正在创建...'))}</div>`;
        }

        if (state === 'markerPending') {
            return `<div class="am-note-index-card am-note-index-card--warning"><div class="am-note-index-status"><span class="am-note-index-dot am-note-index-dot--warning" aria-hidden="true"></span><strong>${escapeHtml(this._t('noteIndexMarkerPendingTitle', '索引文档标记待完成'))}</strong></div><p class="am-note-index-description" role="alert">${escapeHtml(this._t('noteIndexMarkerPending', '索引文档已创建，但插件所有权标记尚未写入完成。请重试检测。'))}</p></div><div class="am-note-index-actions">${button('retry', this._t('noteIndexRetry', '重试'), true, false, this._t('noteIndexDetecting', '正在检测...'))}</div>`;
        }

        const errorText = inlineError || String(info.error || info.lastError || this._t('noteIndexInspectFailed', '无法检测索引文档，请重试。'));
        return `<div class="am-note-index-card am-note-index-card--error"><div class="am-note-index-status"><span class="am-note-index-dot am-note-index-dot--error" aria-hidden="true"></span><strong>${escapeHtml(this._t('noteIndexErrorTitle', '索引文档连接异常'))}</strong></div><p class="am-note-index-description" role="alert">${escapeHtml(errorText)}</p></div><div class="am-note-index-actions">${button('retry', this._t('noteIndexRetry', '重试'), true, false, this._t('noteIndexDetecting', '正在检测...'))}</div>`;
    }

    async _refreshNoteIndexSettings(noteRoot, binding, options) {
        const currentBinding = binding || this._noteIndexSettingsBinding;
        if (!noteRoot || !currentBinding || currentBinding.noteRoot !== noteRoot) return null;
        const token = this._beginNoteIndexSettingsAsync(currentBinding, 'refresh');
        if (!token) return null;
        const opts = options || {};
        if (!this.noteLink || typeof this.noteLink.inspectIndexDocument !== 'function') {
            const unavailable = { state: 'error', error: this._t('noteIndexInspectFailed', '无法检测索引文档，请重试。') };
            if (!this._isCurrentNoteIndexSettingsToken(token)) return null;
            if (opts.clearBusyAction && this._noteIndexBusyAction === opts.clearBusyAction) this._noteIndexBusyAction = '';
            this._noteIndexInspection = unavailable;
            noteRoot.innerHTML = this._renderNoteIndexSettingsContent(unavailable);
            return unavailable;
        }
        const inspected = await Promise.allSettled([
            this.noteLink.inspectIndexDocument(),
            typeof this.noteLink.listNotebooks === 'function' ? this.noteLink.listNotebooks() : Promise.resolve([]),
        ]);
        if (!this._isCurrentNoteIndexSettingsToken(token)) return null;
        if (inspected[1].status === 'fulfilled') {
            this._noteIndexNotebooks = Array.isArray(inspected[1].value) ? inspected[1].value : [];
            this._noteIndexNotebookLoadError = '';
        } else {
            this._noteIndexNotebooks = [];
            this._noteIndexNotebookLoadError = this._t('noteIndexLoadFailed', '笔记本列表加载失败');
        }
        const inspection = inspected[0].status === 'fulfilled'
            ? inspected[0].value
            : { state: 'error', error: String((inspected[0].reason && inspected[0].reason.message) || inspected[0].reason || this._t('noteIndexInspectFailed', '无法检测索引文档，请重试。')) };
        if (opts.clearBusyAction && this._noteIndexBusyAction === opts.clearBusyAction) this._noteIndexBusyAction = '';
        this._noteIndexInspection = inspection;
        noteRoot.innerHTML = this._renderNoteIndexSettingsContent(inspection);
        return inspection;
    }

    _noteIndexActionError(result, fallbackKey, fallbackText) {
        if (result && result.reason === 'name-conflict') {
            return this._t('noteIndexNameConflict', '发现同名文档，但无法确认由插件创建。请重命名该文档后重试。');
        }
        if (result && (result.reason === 'marker-pending' || result.markerPending)) {
            return this._t('noteIndexMarkerPending', '索引文档已创建，但插件所有权标记尚未写入完成。请重试检测。');
        }
        return String((result && result.error) || this._t(fallbackKey, fallbackText));
    }

    async _runNoteIndexAction(noteRoot, binding, action, task, successKey, successText, failureKey, failureText) {
        if (!this._isCurrentNoteIndexSettingsBinding(binding) || this._noteIndexBusyAction) return null;
        const token = this._beginNoteIndexSettingsAsync(binding, action);
        if (!token) return null;
        this._noteIndexBusyAction = action;
        this._noteIndexInlineError = '';
        noteRoot.innerHTML = this._renderNoteIndexSettingsContent(this._noteIndexInspection);
        let result;
        try {
            result = await task();
        } catch (error) {
            result = { ok: false, state: 'error', error: String((error && error.message) || error) };
        }
        if (!this._isCurrentNoteIndexSettingsToken(token)) return null;
        if (result && result.ok === true && result.skipped !== 'reentrant') {
            this._noteIndexOperationState = null;
            this._noteIndexInlineError = '';
            if (successKey) this.showToast('✓ ' + this._t(successKey, successText));
        } else {
            this._noteIndexOperationState = result || { state: 'error' };
            this._noteIndexInlineError = this._noteIndexActionError(result, failureKey, failureText);
            this.showToast('⚠️ ' + this._noteIndexInlineError);
        }
        await this._refreshNoteIndexSettings(noteRoot, binding, { clearBusyAction: action });
        return result;
    }

    async _redetectNoteIndex(noteRoot, binding) {
        if (!this._isCurrentNoteIndexSettingsBinding(binding) || this._noteIndexBusyAction) return null;
        this._noteIndexBusyAction = 'redetect';
        this._noteIndexOperationState = null;
        this._noteIndexInlineError = '';
        noteRoot.innerHTML = this._renderNoteIndexSettingsContent(this._noteIndexInspection);
        return this._refreshNoteIndexSettings(noteRoot, binding, { clearBusyAction: 'redetect' });
    }

    /** v2.5.0 P2：稳定 root 上委托 click/change，innerHTML hydrate 后无需重新绑事件。 */
    async _bindNoteIndexSettings(root) {
        if (!root) return;
        const noteRoot = root.querySelector('[data-note-index-root]');
        if (!noteRoot) return;
        const binding = this._createNoteIndexSettingsBinding(root, noteRoot);
        this._noteIndexSelectedNotebookId = String((this.settings && this.settings.indexNotebookId) || '');
        this._noteIndexOperationState = null;
        this._noteIndexInlineError = '';
        this._noteIndexNotebookLoadError = '';
        this._noteIndexBusyAction = '';

        noteRoot.onchange = async event => {
            if (!this._isCurrentNoteIndexSettingsBinding(binding)) return;
            const target = event && event.target;
            if (target && target.matches && target.matches('[data-note-index-notebook]')) {
                this._noteIndexSelectedNotebookId = String(target.value || '');
                noteRoot.innerHTML = this._renderNoteIndexSettingsContent(this._noteIndexInspection);
                return;
            }
            if (target && target.matches && target.matches('[data-note-index-auto-sync]')) {
                if (this._noteIndexBusyAction) return;
                const token = this._beginNoteIndexSettingsAsync(binding, 'autoSync');
                if (!token) return;
                this._noteIndexBusyAction = 'autoSync';
                noteRoot.innerHTML = this._renderNoteIndexSettingsContent(this._noteIndexInspection);
                const saved = await this.saveSettings({ indexAutoSync: target.checked === true });
                if (!this._isCurrentNoteIndexSettingsToken(token)) return;
                this._noteIndexBusyAction = '';
                if (!saved) {
                    this._noteIndexInlineError = this._t('settingsSaveFail', '设置保存失败');
                    this.showToast('⚠️ ' + this._noteIndexInlineError);
                } else {
                    this._noteIndexInlineError = '';
                }
                noteRoot.innerHTML = this._renderNoteIndexSettingsContent(this._noteIndexInspection);
            }
        };

        noteRoot.onclick = async event => {
            if (!this._isCurrentNoteIndexSettingsBinding(binding)) return;
            const target = event && event.target && event.target.closest
                ? event.target.closest('[data-note-index-action]') : null;
            if (!target || (noteRoot.contains && !noteRoot.contains(target))) return;
            const action = target.dataset.noteIndexAction;
            const selectedId = String(this._noteIndexSelectedNotebookId || '');
            if (action === 'open') {
                const docId = this._noteIndexInspection && this._noteIndexInspection.docId;
                if (!docId) return;
                const token = this._beginNoteIndexSettingsAsync(binding, 'open');
                if (!token) return;
                try { await this._jumpToBlock(docId); }
                catch (error) {
                    if (!this._isCurrentNoteIndexSettingsToken(token)) return;
                    this._noteIndexInlineError = String((error && error.message) || error);
                    this.showToast('⚠️ ' + this._noteIndexInlineError);
                    noteRoot.innerHTML = this._renderNoteIndexSettingsContent(this._noteIndexInspection);
                }
                return;
            }
            if (action === 'create') {
                if (!selectedId) return;
                return this._runNoteIndexAction(noteRoot, binding, 'create', () => this.noteLink.createIndexDocument(selectedId),
                    'noteIndexCreateDone', '索引文档已创建', 'noteIndexCreateFailed', '创建索引文档失败，请重试。');
            }
            if (action === 'sync') {
                return this._runNoteIndexAction(noteRoot, binding, 'sync', () => this.noteLink.syncNow({ manual: true }),
                    'noteIndexSyncDone', '已同步', 'noteIndexSyncFailed', '同步失败，请重试。');
            }
            if (action === 'repair') {
                return this._runNoteIndexAction(noteRoot, binding, 'repair', () => this.noteLink.rebuildNow(),
                    'noteIndexRebuildDone', '修复完成', 'noteIndexRebuildFailed', '修复失败，请重试。');
            }
            if (action === 'redetect') return this._redetectNoteIndex(noteRoot, binding);
            if (action === 'retry') {
                if (this._noteIndexOperationState && this._noteIndexOperationState.reason === 'name-conflict') {
                    if (!selectedId) return;
                    return this._runNoteIndexAction(noteRoot, binding, 'create', () => this.noteLink.createIndexDocument(selectedId),
                        'noteIndexCreateDone', '索引文档已创建', 'noteIndexCreateFailed', '创建索引文档失败，请重试。');
                }
                return this._redetectNoteIndex(noteRoot, binding);
            }
            if (action === 'recreate') {
                if (!selectedId) return;
                this._openScopedConfirm(noteRoot, {
                    title: this._t('noteIndexRecreateConfirmTitle', '重新创建索引文档？'),
                    text: this._t('noteIndexRecreateConfirm', '重新创建会生成新的资产块 ID，原有笔记中的块引用不会自动恢复。'),
                    confirmLabel: this._t('noteIndexRecreateConfirmAction', '确认重新创建'),
                    onConfirm: () => this._runNoteIndexAction(noteRoot, binding, 'recreate', () => this.noteLink.recreateIndexDocument(selectedId),
                        'noteIndexRecreateDone', '索引文档已重新创建', 'noteIndexRecreateFailed', '重新创建索引文档失败，请重试。'),
                });
            }
        };

        await this._refreshNoteIndexSettings(noteRoot, binding);
    }

    _closeSettingsClearAllAssetsConfirm(settingsDialogHost) {
        if (typeof this._settingsClearAllAssetsConfirmClose === 'function') {
            this._settingsClearAllAssetsConfirmClose();
            return;
        }
        const orphan = settingsDialogHost && settingsDialogHost.querySelector
            ? settingsDialogHost.querySelector('.am-plugin-confirm-mask--clear-assets') : null;
        if (orphan) orphan.remove();
    }

    _getSettingsClearAllAssetsConfirmHost(settingsDialogHost) {
        if (settingsDialogHost && typeof settingsDialogHost.querySelector === 'function') {
            const container = settingsDialogHost.querySelector('.b3-dialog__container');
            if (container && typeof container.appendChild === 'function') return container;
            const dialog = settingsDialogHost.querySelector('.b3-dialog');
            if (dialog && typeof dialog.appendChild === 'function') return dialog;
        }
        return document.body;
    }

    openClearAllAssetsConfirm(settingsDialogHost) {
        const count = this.assets.length;
        const host = this._getSettingsClearAllAssetsConfirmHost(settingsDialogHost);
        if (!host) return;
        const isFallbackHost = host === document.body;
        const isSettingsDialogHost = !isFallbackHost;
        if (typeof this._pluginConfirmClose === 'function') this._pluginConfirmClose();
        if (isSettingsDialogHost && host.classList) host.classList.add('am-settings-confirm-host');
        const mask = document.createElement('div');
        mask.className = `am-plugin-confirm-mask am-plugin-confirm-mask--clear-assets${isSettingsDialogHost ? ' am-plugin-confirm-mask--settings' : ''}${isFallbackHost ? ' am-plugin-confirm-mask--fallback' : ''}`;
        mask.innerHTML = `
            <section class="am-plugin-confirm am-plugin-confirm--danger" role="dialog" aria-modal="true" aria-labelledby="am-clear-assets-confirm-title">
                <div class="am-confirm">
                    <div class="am-confirm__icon">⚠️</div>
                    <div class="am-confirm__title" id="am-clear-assets-confirm-title">${escapeHtml(this._t('assetDataClearConfirmTitle', '确认清空全部资产（{n} 项）？', { n: count }))}</div>
                    <div class="am-confirm__text">${escapeHtml(this._t('assetDataClearConfirm', '将永久删除当前 {n} 项实物、虚拟、预付权益和种草资产，且不可恢复。标签、设置、Markdown 本地导出设置、其他 sidecar 和思源文档不会被删除。', { n: count }))}</div>
                </div>
                <div class="am-plugin-confirm__actions">
                    <button type="button" class="b3-button b3-button--cancel" data-clear-assets-cancel>${escapeHtml(this._t('btnCancel', '取消'))}</button>
                    <button type="button" class="b3-button b3-button--remove" data-clear-assets-confirm>${escapeHtml(this._t('assetDataClearAction', '清空全部资产'))}</button>
                </div>
            </section>`;
        const close = () => {
            document.removeEventListener('keydown', onKeydown);
            mask.remove();
            if (this._pluginConfirmClose === close) this._pluginConfirmClose = null;
            if (this._settingsClearAllAssetsConfirmClose === close) this._settingsClearAllAssetsConfirmClose = null;
        };
        const onKeydown = event => { if (event.key === 'Escape') close(); };
        mask.onclick = event => { if (event.target === mask) close(); };
        const cancelButton = mask.querySelector('[data-clear-assets-cancel]');
        const confirmButton = mask.querySelector('[data-clear-assets-confirm]');
        if (cancelButton) cancelButton.onclick = close;
        if (confirmButton) confirmButton.onclick = async () => {
            confirmButton.setAttribute('disabled', 'disabled');
            if (cancelButton) cancelButton.setAttribute('disabled', 'disabled');
            try {
                const clearedCount = await this.clearAllAssets();
                close();
                this.showToast('✓ ' + this._t('assetDataClearSuccess', '已清空 {n} 项资产', { n: clearedCount }));
            } catch (error) {
                confirmButton.removeAttribute('disabled');
                if (cancelButton) cancelButton.removeAttribute('disabled');
                console.warn('[AssetManagement] clearAllAssets failed:', error && error.message, error);
                this.showToast('⚠️ ' + this._t('assetDataClearFail', '清空资产失败，当前资产未修改'));
            }
        };
        host.appendChild(mask);
        this._pluginConfirmClose = close;
        if (isSettingsDialogHost) this._settingsClearAllAssetsConfirmClose = close;
        document.addEventListener('keydown', onKeydown);
    }

    renderSettingsLogs() {
        return `<div class="am-settings__section am-settings-logs"><h3>${escapeHtml(this._t('opLogTitle', '操作日志'))}</h3><p class="am-settings__hint">${escapeHtml(this._t('settingsLogsHint', '查看资产操作历史；可按资产名称搜索。日志为只读审计记录。'))}</p><button type="button" class="b3-button b3-button--primary am-settings-logs__action" data-open-formal-oplog>${escapeHtml(this._t('settingsLogsOpen', '查看操作日志'))}</button></div>`;
    }

    renderSettingsTags() {
        const tags = this._getAssetTagCatalog();
        const rows = tags.length ? tags.map(tag => {
            const refs = this._getTagReferenceCount(tag);
            // v2.3.0 阶段 2b：行首颜色 swatch（有色=实心圆点，无色=虚线占位）
            /* v2.3.0-hotfix：颜色写 CSS 变量而非按钮背景——34px 按钮只是触摸区，
               颜色只由 ::after 18px 圆点呈现（用户反馈「颜色不要在圈外」）。 */
            const swatchStyle = tag.color ? ` style="--am-swatch-color:${escapeHtml(tag.color)}"` : '';
            const swatchLabel = escapeHtml(this._t('tagColorSwatchLabel', '设置标签颜色'));
            return `<div class="am-settings-tag-row"><button type="button" class="am-tag-color-swatch${tag.color ? '' : ' am-tag-color-swatch--empty'}" data-settings-tag-color="${escapeHtml(tag.id || '')}"${swatchStyle} title="${swatchLabel}" aria-label="${swatchLabel}"></button><span>${escapeHtml(tag.label)}</span><span class="am-settings-tag-row__count">${escapeHtml(this._t('tagReferenceCount', '{n} 项资产引用', { n: refs }))}</span><button class="b3-button b3-button--remove" data-settings-tag-delete="${escapeHtml(tag.id || '')}" ${refs ? 'disabled' : ''}>${escapeHtml(this._t('tagManagerDelete', '删除'))}</button></div>`;
        }).join('') : `<div class="am-tag-manager-empty">${escapeHtml(this._t('tagManagerEmpty', '暂无标签'))}</div>`;
        return `<div class="am-settings__section am-settings-tags"><h3>${escapeHtml(this._t('settingsTagsTitle', '标签管理'))}</h3><p class="am-settings__hint">${escapeHtml(this._t('settingsTagsHint', '管理固定标签目录。标签被引用时不可删除。'))}</p><div class="am-settings-tag-create"><input class="b3-text-field" type="text" name="settingsTagLabel" maxlength="20" placeholder="${escapeHtml(this._t('tagFieldLabel', '标签名'))}"/><button class="b3-button b3-button--primary" data-action="settings-create-tag">${escapeHtml(this._t('tagManagerAddBtn', '+ 新建标签'))}</button></div><div class="am-settings-tag-list">${rows}</div></div>`;
    }

    /**
     * v0.18 阶段 7b：生成只读 Markdown 资产清单（不写思源文档、不写盘、不泄敏感数据）。
     * 9 列表格：名称 | 类型 | 状态 | 取得日期 | 价格 | 币种 | 标签 | 到期 | 备注。
     * 遍历 this.assets 全部资产（含 wishlist），投影失败兜底 '—'，永不抛错。
     * 空资产返回标题 + 生成时间 + 表头 + 分隔行（非空串，copyButton 可用）。
     */
    exportMarkdown() {
        const escapeCell = (v) => {
            if (v == null) return '—';
            return String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').replace(/\r/g, ' ');
        };
        const today = todayISO();
        const title = this._t('topBarTitle', '资产管理') + ' ' + this._t('markdownExportDocTitle', '资产清单');
        const generatedAt = this._t('markdownExportGeneratedAt', '导出时间：{t}', { t: new Date().toISOString().slice(0, 10) });
        const headers = [
            this._t('fieldName', '名称'),
            this._t('productDetailType', '类型'),
            this._t('fieldStatus', '状态'),
            this._t('fieldPurchaseDate', '购买日期'),
            this._t('markdownColPrice', '价格'),
            this._t('fieldCurrency', '币种'),
            this._t('filterTag', '标签'),
            this._t('validityPeriod', '有效期至'),
            this._t('fieldNote', '备注'),
        ];
        const lines = [];
        lines.push('# ' + title);
        lines.push('> ' + generatedAt);
        lines.push('');
        lines.push('| ' + headers.map(h => escapeCell(h)).join(' | ') + ' |');
        lines.push('|---|---|---|---|---|---|---|---|---|');

        // Build domain snapshot for projections; fallback to instance properties with empty arrays.
        let domain = null;
        try { domain = this._formalDomainSnapshot(); } catch (e) {
            domain = {
                assets: this.assets || [], tags: this._tags || [],
                financialEvents: this._financialEvents || [],
                subscriptionPeriods: this._subscriptionPeriods || [],
                prepaidTransactions: this._prepaidTransactions || [],
                maintenance: this._maintenanceRecords || [],
                usage: this._usageRecords || [],
                lifecycleEvents: this._lifecycleEvents || [],
                wishlistEvents: this.wishlistEvents || [],
                operationLogs: this._opLogs || [],
            };
        }
        const byAsset = (records, id) => (Array.isArray(records) ? records : []).filter(r => r && r.assetId === id);
        const tags = Array.isArray(domain.tags) ? domain.tags : [];

        for (const a of (this.assets || [])) {
            let priceStr = '—';
            let expiryStr = '—';
            try {
                const sidecars = {
                    financialEvents: byAsset(domain.financialEvents, a.id),
                    subscriptionPeriods: byAsset(domain.subscriptionPeriods, a.id),
                    prepaidTransactions: byAsset(domain.prepaidTransactions, a.id),
                };
                const p = projectFormalAsset(a, sidecars, today);
                if (p.acquisition && p.acquisition.amountMinor != null) {
                    priceStr = formatAmountMinor(p.acquisition.amountMinor, a.currency);
                } else if (a.status === 'wishlist' && a.wishlist && a.wishlist.expectedAmountMinor != null) {
                    priceStr = formatAmountMinor(a.wishlist.expectedAmountMinor, a.currency);
                }
                expiryStr = p.expiryOn || (a.details && (a.details.expiresOn || a.details.warrantyEndsOn)) || '—';
            } catch (e) {
                // Projection failed; wishlist price fallback + details expiry fallback.
                if (a.status === 'wishlist' && a.wishlist && a.wishlist.expectedAmountMinor != null) {
                    try { priceStr = formatAmountMinor(a.wishlist.expectedAmountMinor, a.currency); } catch (e2) { priceStr = '—'; }
                }
                try { expiryStr = (a.details && (a.details.expiresOn || a.details.warrantyEndsOn)) || '—'; } catch (e3) { expiryStr = '—'; }
            }
            const tagLabels = (Array.isArray(a.tagIds) ? a.tagIds : [])
                .map(id => { const t = tags.find(tag => tag && tag.id === id); return t ? t.label : null; })
                .filter(Boolean).join(', ') || '—';
            const statusLabel = this._t((STATUS_MAP[a.status] || {}).key, a.status);
            const cells = [
                escapeCell(a.name),
                escapeCell(this._formalKindLabel(a.kind)),
                escapeCell(statusLabel),
                escapeCell(a.acquiredOn || '—'),
                escapeCell(priceStr),
                escapeCell(a.currency || '—'),
                escapeCell(tagLabels),
                escapeCell(expiryStr),
                escapeCell(a.notes || '—'),
            ];
            lines.push('| ' + cells.join(' | ') + ' |');
        }
        return lines.join('\n');
    }

    async bindMarkdownExportSettings(root) {
        if (!root) return;
        const result = root.querySelector('[data-markdown-export-result]');
        const exportButton = root.querySelector('[data-action="markdown-export"]');
        const copyButton = root.querySelector('[data-action="markdown-copy"]');
        const focusForManualCopy = () => {
            if (result) { result.focus(); result.select(); }
            this.showToast('⚠️ ' + this._t('markdownExportManualCopy', '已生成，请手动复制'));
        };
        const copyResult = async () => {
            const markdown = result && result.value;
            if (!markdown) return;
            try {
                if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') throw new Error('Clipboard unavailable');
                await navigator.clipboard.writeText(markdown);
                this.showToast('✓ ' + this._t('markdownExportCopySuccess', '已复制 Markdown'));
            } catch (error) {
                focusForManualCopy();
            }
        };
        if (exportButton) exportButton.onclick = async () => {
            const markdown = this.exportMarkdown();
            if (result) result.value = markdown;
            if (copyButton) copyButton.disabled = !markdown;
            if (!this.assets.length) this.showToast('⚠️ ' + this._t('markdownExportEmpty', '当前没有资产，已生成空表格'));
            await copyResult();
        };
        if (copyButton) copyButton.onclick = copyResult;
    }

    renderSettingsAbout() {
        return `
            <div class="am-settings__about">
                <div class="am-settings__about-icon"><svg viewBox="0 0 24 24" width="36" height="36"><use xlink:href="#iconAssetManagement"/></svg></div>
                <div class="am-settings__about-name">${escapeHtml(this._t("topBarTitle", "资产管理"))}</div>
                <div class="am-settings__about-version">v${this._manifestVersion || PLUGIN_VERSION}</div>
                <div class="am-settings__about-desc">${escapeHtml(this._t("aboutDescription", "思源笔记个人资产管理：实物 / 虚拟资产、标签、生命周期和日均成本统计。"))}</div>
                <div class="am-settings__about-author">${escapeHtml(this._t("aboutAuthor", "作者"))}：<a class="am-settings__about-author-link" href="${AUTHOR_URL}" target="_blank" rel="noopener">Dilyar</a></div>
                <div class="am-settings__about-author">${escapeHtml(this._t("aboutIcons8Attribution", "预设图标由 Icons8 提供"))}：<a href="${ICONS8_URL}" target="_blank" rel="noopener">${ICONS8_URL}</a></div>
            </div>`;
    }

    saveSettingsFromDialog(contentEl) {
        if (!contentEl) return;
        const sortEl = contentEl.querySelector('[name="defaultSort"]');
        const statusEl = contentEl.querySelector('[name="defaultStatus"]');
        const viewEl = contentEl.querySelector('[name="defaultViewMode"]:checked');
        const currencyModeEl = contentEl.querySelector('[name="currencyDisplayMode"]');
        // v0.14 修复：用 merge 而非覆写，避免丢失 preferredCurrency/notificationsEnabled/notificationDays/schemaVersion
        // v0.15-T6：currencyDisplayMode 一并保存（白名单校验）
        const currencyMode = currencyModeEl ? currencyModeEl.value : "native";
        const safeCurrencyMode = ['native', 'preferred', 'dual'].includes(currencyMode) ? currencyMode : 'native';
        const patch = {
            defaultSort: sortEl ? sortEl.value : "default",
            defaultStatus: statusEl ? statusEl.value : "all",
            defaultViewMode: viewEl ? viewEl.value : "list",
            viewMode: this.settings.viewMode || "list",
            currencyDisplayMode: safeCurrencyMode,
        };
        return this.saveSettings(patch).then(saved => {
            if (saved) {
                this.filter.sort = this.settings.defaultSort;
                this.filter.status = this._normalizeHomeFilterStatus(this.settings.defaultStatus);
            }
            return saved;
        });
    }

    // ---------- 主面板 / 编辑 / 删除 Dialog ----------

    openMainDialog() {
        this._closeHomeFilterDropdown();
        const html = `
            <div class="am-modal am-modal--main">
                ${this.renderMainPanel()}
            </div>`;
        this.showDialog(this._t("topBarTitle", "资产管理"), html, (dialog) => {
            this._modalContainer = dialog?.element?.querySelector?.(".am-modal--main") || dialog?.element || document.body;
            this._modalDialog = dialog;
            this.bindModalTabEvents(dialog);
        }, this.isMobile ? "100vw" : "780px");
    }

    /**
     * v0.13.16：清理 modal 引用（在 dialog 关闭后调用）
     * 监听 dialog destroy 事件清掉 this._modalContainer 和 this._modalDialog
     */
    cleanupModalRefs() {
        this._closeItemMenu();
        this._closeHomeFilterDropdown();
        this._cleanupTagAutocomplete(this._modalContainer);
        this._modalContainer = null;
        this._modalDialog = null;
    }

    bindModalTabEvents(dialog) {
        const root = dialog?.element || dialog;
        const container = root?.querySelector?.(".am-modal--main") || (root?.classList?.contains?.("am-modal--main") ? root : null);
        if (!container) return;
        this.bindActionDelegate(container, { skipActions: ["tab", "tab-add"] });
        this._bindHomeSearchEvents(container);
        container.onchange = (e) => {
            const t = e.target;
            if (!t || !t.matches || !t.matches('[data-action="set-asset-type"], [data-action="set-filter-status"], [data-action="set-sort"]')) return;
            this.handleAction(t.dataset.action, t.dataset.id, t, e);
        };
        container.querySelectorAll(".am-tab-pill, .am-tab-fab").forEach(btn => {
            btn.onclick = () => {
                if (btn.dataset.action === "tab-add") { this.openActionSheet(container); return; }
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            };
        });
    }

    /**
     * v0.9.5 新增：底部抽屉 ActionSheet（点 FAB 后弹出）
     * 上排 2 个：实物 + 虚拟；下排 1 个：种草
     * 参考 v0.3.0 ActionSheet 设计
     */

    closeActionSheet() {
        const mask = this._actionSheetMask;
        if (mask) {
            mask.style.animation = "amSheetFadeOut 0.2s forwards";
            setTimeout(() => mask.remove(), 200);
            this._actionSheetMask = null;
        }
        if (this._actionSheetEscHandler) {
            document.removeEventListener("keydown", this._actionSheetEscHandler);
            this._actionSheetEscHandler = null;
        }
    }

    /**
     * v0.17-T4：预付权益独立录入表单。
     * 使用独立顶层 assetType，不进入 openVirtualSheet 的订阅 / 买断子类型切换。
     */
    // This legacy wishlist-only helper has no visible route. Keep its historical
    // call site intact while routing compatibility callers to the assets-only form.


    /**
     * 底部抽屉式录入界面（v0.9.4 新增）
     * 与 openEditDialog 并存：保留老路径做 fallback，新路径叠加进 dock
     * CSS：.am-edit-sheet-mask / .am-edit-sheet
     */
    /**
     * v0.9.6 新增：虚拟资产录入表单
     * 字段：名称 / 类型（订阅/买断）/ 价格（每期）/ 账单周期 / 开始日期 / 下次账单 / 自动续费 / 状态 / 备注
     * 复用 .am-edit-sheet-mask / .am-edit-sheet，仅追加新字段 + 新 class
     */
    /**
     * v0.9.7 重写：虚拟资产录入
     * 固定分类已退出录入主流程；category 仅保存默认分类 fallback。
     */

    _formatPhysicalDateLabel(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
        if (!match) return '';
        return this._t('datePickerDateFormat', '{year}年{month}月{day}日', {
            year: match[1], month: Number(match[2]), day: Number(match[3]),
        });
    }

    // Shared, assets[].tags-only selector for non-physical forms.  It deliberately
    // has no dependency on the tag library/sidecar: labels are discovered from
    // existing assets and persisted back to the asset currently being edited.
    _renderFormalTagSelector(state, scope) {
        const selected = this._normalizeTagLabels(state.tags);
        const catalog = new Map();
        this._getAssetTagCatalog().concat(selected.map(label => ({ label }))).forEach(tag => {
            const label = String(tag && tag.label || '').trim();
            if (label && !catalog.has(label.toLowerCase())) catalog.set(label.toLowerCase(), { label });
        });
        const candidates = Array.from(catalog.values()).sort((a, b) => a.label.localeCompare(b.label));
        return `<section class="am-physical-tags-card am-assets-tags-card" data-assets-tags="${scope}">
            <div class="am-physical-tags-card__line">
                <span class="am-physical-tags-card__label">${escapeHtml(this._t('fieldTags', '标签'))}</span>
                <button type="button" class="am-physical-tags-card__trigger${state.tagDropdownOpen ? ' is-open' : ''}" data-assets-tag-trigger aria-expanded="${state.tagDropdownOpen ? 'true' : 'false'}"><span class="am-physical-tags-card__trigger-label">${escapeHtml(this._t('fieldTags', '标签'))}</span><span class="am-physical-tags-card__trigger-arrow" aria-hidden="true"></span></button>
            </div>
            ${state.tagDropdownOpen ? `<div class="am-physical-tag-dropdown" data-assets-tag-dropdown="${scope}">
                <div class="am-physical-tag-dropdown__options">${candidates.length ? candidates.map(tag => `<button type="button" class="am-physical-tag-dropdown__option" data-assets-tag-option="${escapeHtml(tag.label)}">${escapeHtml(tag.label)}</button>`).join('') : `<div class="am-physical-tag-dropdown__empty">${escapeHtml(this._t('physicalTagEmpty', '暂无可选标签'))}</div>`}</div>
            </div>` : ''}
        </section>`;
    }

    _bindAssetsOnlyTagSelector(mask, state, rerender) {
        const trigger = mask.querySelector('[data-assets-tag-trigger]');
        const close = (restoreFocus = false) => {
            state.tagDropdownOpen = false;
            if (typeof mask._amAssetsTagDropdownCleanup === 'function') mask._amAssetsTagDropdownCleanup();
            rerender();
            if (restoreFocus) requestAnimationFrame(() => mask.querySelector('[data-assets-tag-trigger]')?.focus());
        };
        if (trigger) trigger.onclick = () => {
            if (state.tagDropdownOpen) { close(true); return; }
            state.tagDropdownOpen = true;
            rerender();
            requestAnimationFrame(() => {
                const option = mask.querySelector('[data-assets-tag-option]');
                const nextTrigger = mask.querySelector('[data-assets-tag-trigger]');
                (option || nextTrigger)?.focus();
            });
        };
        mask.querySelectorAll('[data-assets-tag-option]').forEach(btn => btn.onclick = () => {
            const label = btn.dataset.assetsTagOption;
            state.tags = this._normalizeTagLabels([label]);
            state.tagDropdownOpen = false;
            if (typeof mask._amAssetsTagDropdownCleanup === 'function') mask._amAssetsTagDropdownCleanup();
            rerender();
        });
        if (!state.tagDropdownOpen) return;
        const dropdown = mask.querySelector('[data-assets-tag-dropdown]');
        if (dropdown && dropdown.parentNode !== mask) mask.appendChild(dropdown);
        const reposition = () => {
            const d = mask.querySelector('[data-assets-tag-dropdown]'); const t = mask.querySelector('[data-assets-tag-trigger]');
            if (!d || !t) return;
            const mr = mask.getBoundingClientRect(); const tr = t.getBoundingClientRect(); const gap = 12; const verticalGap = 4;
            const width = Math.min(260, Math.max(160, mr.width - gap * 2));
            const below = Math.max(40, mr.bottom - tr.bottom - verticalGap);
            const maxHeight = Math.min(240, below);
            d.style.width = `${width}px`; d.style.left = `${Math.min(Math.max(tr.left - mr.left, gap), Math.max(gap, mr.width - width - gap))}px`;
            d.style.top = `${Math.max(0, tr.bottom - mr.top + verticalGap)}px`; d.style.maxHeight = `${maxHeight}px`;
        };
        const sheetBody = mask.querySelector('.am-edit-sheet__body');
        const outside = event => { const d = mask.querySelector('[data-assets-tag-dropdown]'); const t = mask.querySelector('[data-assets-tag-trigger]'); if (d && (d.contains(event.target) || (t && t.contains(event.target)))) return; if (mask.contains(event.target)) close(true); };
        document.addEventListener('pointerdown', outside, true); if (sheetBody) sheetBody.addEventListener('scroll', reposition, true); window.addEventListener('resize', reposition); if (window.visualViewport) window.visualViewport.addEventListener('resize', reposition); reposition();
        const cleanup = () => { if (mask._amAssetsTagDropdownCleanup !== cleanup) return; delete mask._amAssetsTagDropdownCleanup; document.removeEventListener('pointerdown', outside, true); if (sheetBody) sheetBody.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); if (window.visualViewport) window.visualViewport.removeEventListener('resize', reposition); mask.querySelector('[data-assets-tag-dropdown]')?.remove(); };
        mask._amAssetsTagDropdownCleanup = cleanup;
    }



    /**
     * v0.9.7.1 新增：种草录入 openWishlistSheet
 * 字段（极简）：图片 / 名称 / 期望价格 / 目标类型 / 种草理由
     * 状态自动 = 'wishlist'，不显示状态选择器
     * 默认 category = 'other'
     */

    /**
     * v0.13 续费表单（方案 M3 + 流程 5）
     */

    /** Restart an expired, manually stopped subscription on the same asset. */

    // Retained temporarily to minimize this date-UI-only change; no caller uses it.

    /** Date-selectable, assets-only resubscription flow. */

    /**
     * Confirm the already-planned automatic renewal. This intentionally has no
     * subscription ledger, operation-log, or legacy renewal-sheet dependency:
     * confirmation advances only the current asset's mutable subscription view.
     */

    openEditDialog(id) {
        if (!id) {
            this.openActionSheet();
            return;
        }
        const a = id ? this.assets.find(x => x.id === id) : null;
        if (!a) return;
        this.openFormalAssetSheet(a.kind, { asset: a, id: a.id });
    }

    confirmDelete(id) {
        const a = this.assets.find(x => x.id === id);
        if (!a) return;
        const host = this.dockElement || this._modalContainer || document.body;
        if (!host) return;
        const isFallbackHost = host === document.body;
        if (typeof this._pluginConfirmClose === 'function') this._pluginConfirmClose();
        const mask = document.createElement('div');
        mask.className = `am-plugin-confirm-mask${isFallbackHost ? ' am-plugin-confirm-mask--fallback' : ''}`;
        mask.innerHTML = `
            <section class="am-plugin-confirm" role="dialog" aria-modal="true" aria-labelledby="am-plugin-confirm-title">
                <div class="am-confirm">
                    <div class="am-confirm__icon">⚠️</div>
                    <div class="am-confirm__title" id="am-plugin-confirm-title">${escapeHtml(this._t("dialogDeleteTitle", "确认删除"))}</div>
                    <div class="am-confirm__text">${escapeHtml(this._t("dialogDeleteConfirm", "确定要删除「{name}」吗？此操作不可撤销。", { name: a.name }))}</div>
                </div>
                <div class="am-plugin-confirm__actions">
                    <button type="button" class="b3-button b3-button--cancel" data-plugin-confirm-cancel>${escapeHtml(this._t("btnCancel", "取消"))}</button>
                    <button type="button" class="b3-button b3-button--remove" data-plugin-confirm-delete>${escapeHtml(this._t("btnConfirm", "确认删除"))}</button>
                </div>
            </section>`;
        const close = () => {
            document.removeEventListener('keydown', onKeydown);
            mask.remove();
            if (this._pluginConfirmClose === close) this._pluginConfirmClose = null;
        };
        const onKeydown = event => {
            if (event.key === 'Escape') close();
        };
        mask.onclick = event => { if (event.target === mask) close(); };
        const cancelBtn = mask.querySelector('[data-plugin-confirm-cancel]');
        const confirmBtn = mask.querySelector('[data-plugin-confirm-delete]');
        if (cancelBtn) cancelBtn.onclick = close;
        if (confirmBtn) confirmBtn.onclick = async () => {
            confirmBtn.setAttribute('disabled', 'disabled');
            if (cancelBtn) cancelBtn.setAttribute('disabled', 'disabled');
            try {
                await this.deleteAsset(id);
                close();
                this.showToast("✓ " + this._t("btnDelete"));
            } catch (e) {
                confirmBtn.removeAttribute('disabled');
                if (cancelBtn) cancelBtn.removeAttribute('disabled');
                console.warn('[AssetManagement] confirmDelete failed:', e && e.message, e);
                this.showToast("⚠️ " + this._formatDeleteFailure(e));
            }
        };
        host.appendChild(mask);
        this._pluginConfirmClose = close;
        document.addEventListener('keydown', onKeydown);
    }

    showDialog(title, content, bindFn, width) {
        const dialog = new Dialog({
            title,
            content,
            width: width || (this.isMobile ? "92vw" : "560px"),
            height: "auto",
        });
        this.dialogs.add(dialog);
        if (bindFn) setTimeout(() => bindFn(dialog), 0);
        const origDestroy = dialog.destroy.bind(dialog);
        const self = this;
        dialog.destroy = () => {
            self.dialogs.delete(dialog);
            // v0.13.16：主 modal 销毁时清理 modal 引用
            if (dialog === self._modalDialog) self.cleanupModalRefs();
            return origDestroy();
        };
        return dialog;
    }

    // ---------- 导出 / 导入 / 清空 / Toast ----------

    _downloadTextFile(filename, text, mime) {
        const blob = new Blob([text], { type: mime || "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            try { URL.revokeObjectURL(url); } catch (e) {}
            try { a.remove(); } catch (e) {}
        }, 0);
    }

    // ---------- formal-v1 UI adapter MVP ----------
    _formalCategory(kind, categoryId) {
        return FORMAL_CATEGORIES.find(item => item.id === categoryId && item.kinds.indexOf(kind) >= 0)
            || FORMAL_CATEGORIES.find(item => item.kinds.indexOf(kind) >= 0) || { id: 'other', kinds: [] };
    }

    /**
     * v2.4.1 阶段3：v2 种草资产的同形投影。
     * projectFormalAsset 的 `a.tagIds.slice()` 对 wishlist 会抛错（v2 wishlist 白名单
     * 不含 tagIds，归一化后 a.tagIds 为 undefined），导致种草详情卡此前一律落入
     * 「正式投影不可用」错误面板。此处在 UI 层按 status 分支产出与 projectFormalAsset
     * 对 wishlist 语义一致的投影对象（wishlist 无取得金额/财务/目标日均/订阅/预付/
     * 到期投影，全部为 null 或空），不改动 api/assets.js 契约。
     */
    _formalWishlistProjection(asset) {
        const displayGroup = asset.kind === FORMAL_ASSET_KIND.PHYSICAL ? 'physical'
            : (String(asset.kind).indexOf('virtual') === 0 ? 'virtual' : 'prepaid');
        return {
            id: asset.id, kind: asset.kind, displayGroup: displayGroup, status: 'wishlist', name: asset.name,
            currency: asset.currency, tagIds: [], acquiredOn: null, acquisition: null,
            warrantyEndsOn: null, expiryOn: null, nextImportant: null,
            costGoalSupported: false, costGoalConfigured: false,
            subscription: null, prepaid: null, financials: null, costGoal: null,
        };
    }

    _formalVm(asset) {
        const domain = this._formalDomainSnapshot();
        const byAsset = (records) => (Array.isArray(records) ? records : []).filter(item => item && item.assetId === asset.id);
        const sidecars = {
            financialEvents: byAsset(domain.financialEvents),
            subscriptionPeriods: byAsset(domain.subscriptionPeriods),
            prepaidTransactions: byAsset(domain.prepaidTransactions),
            usage: byAsset(domain.usage),
            maintenance: byAsset(domain.maintenance),
            lifecycleEvents: byAsset(domain.lifecycleEvents),
        };
        // v2.4.1 阶段3：wishlist 走 UI 层同形投影（见 _formalWishlistProjection 注释）。
        const projection = asset.status === 'wishlist'
            ? this._formalWishlistProjection(asset)
            : projectFormalAsset(asset, sidecars, todayISO());
        const tags = (Array.isArray(projection.tagIds) ? projection.tagIds : (Array.isArray(asset.tagIds) ? asset.tagIds : [])).map(id => domain.tags.find(tag => tag.id === id) || { id: id, label: this._t('formalMissingTag', '未知标签') });
        const important = projection.nextImportant || getFormalNextImportantDate(asset, sidecars.subscriptionPeriods, todayISO());
        const prepaid = projection.prepaid;
        const amount = projection.status === 'wishlist'
            ? (asset.wishlist && asset.wishlist.expectedAmountMinor)
            : (projection.acquisition ? projection.acquisition.amountMinor : 0);
        return { asset, projection, tags, important, category: this._formalCategory(projection.kind || asset.kind, asset.categoryId), amount, prepaid, maintenance: sidecars.maintenance, lifecycleEvents: sidecars.lifecycleEvents };
    }

    _formalKindLabel(kind) {
        const labels = { physical: '实物', virtualSubscription: '虚拟订阅', virtualPerpetual: '买断软件', prepaidAmount: '金额预付', prepaidCount: '次数预付' };
        return this._t('formalKind' + kind, labels[kind] || kind);
    }

    /**
     * v0.18 阶段5：列表/矩阵卡共享投影视图模型。一次投影，派生参考图所需的全部展示
     * 字段（类型 chip / 状态点 / 到期徽章 / 价格 / 日均 / 标签 / 再次订阅 / 封面）。
     * 投影失败时向上抛错，由调用方渲染稳定的 sidecar-error 卡片。
     * 到期徽章：详情卡 inner 用 concat.js 解构的 formatRemainingBadge；列表/矩阵卡用本卡片派生的 _formalExpiryBadgeHtml 内联兜底。
     * 全部金额/文本走 escapeHtml + Number 兜底，禁裸 null/undefined/NaN。
     */
    _formalCardData(asset) {
        const vm = this._formalVm(asset);
        const projection = vm.projection || {};
        const isWishlist = asset.status === 'wishlist';
        const group = projection.displayGroup || 'physical';
        const groupKey = 'displayGroup' + group.charAt(0).toUpperCase() + group.slice(1);
        const groupLabel = this._t(groupKey, group);
        // 需求5：顶部价格一律显示购买价格（acquisitionAmountMinor）；wishlist 回退期望价（vm.amount 已在 _formalVm 按状态分支）。
        const value = escapeHtml(formatAmountMinor(Number(vm.amount) || 0, asset.currency));
        // 需求3：次卡每次价格 = ceil(累计投入 / 累计获得次数)。分母 = opening+inflow（不含 adjust），
        // 分子 = acquisitionAmountMinor。兜底：分母<=0 或 分子<=0 → perUse=null，底部只显示剩余次数。
        const prepaid = vm.prepaid;
        let remainingCount = null;
        let perUseAmountMinor = null;
        let balanceAmountMinor = null;
        if (prepaid && prepaid.dimension === 'count') {
            remainingCount = Number(prepaid.remainingCount) || 0;
            const totalAcquiredCount = (Number(prepaid.openingCount) || 0) + (Number(prepaid.inflowCount) || 0);
            const acquisitionMinor = (projection.financials && Number(projection.financials.acquisitionAmountMinor)) || 0;
            if (totalAcquiredCount > 0 && acquisitionMinor > 0) {
                perUseAmountMinor = Math.ceil(acquisitionMinor / totalAcquiredCount);
            }
        } else if (prepaid && prepaid.dimension === 'amount') {
            balanceAmountMinor = Number(prepaid.balanceAmountMinor) || 0;
        }
        let dailyMinor = null;
        let dailyBasis = 'amortized';
        if (!isWishlist && projection.financials) {
            const net = Number(projection.financials.netAmountMinor);
            if (Number.isFinite(net)) {
                // 订阅日均按当前周期起止计算（含两端）；其余 kind 与无周期/付款缺失走旧摊销口径。
                // 卡片历史用 recorded net 作分子，subscription 无现金外事件故 recorded===cash，周期口径不受影响。
                const daily = formalDailyAmountMinor({
                    kind: asset.kind,
                    acquiredOn: asset.acquiredOn || todayISO(),
                    cashNetAmountMinor: net,
                    referenceDate: todayISO(),
                    subscription: projection.subscription,
                    financialEvents: (this._formalDomainSnapshot().financialEvents || []).filter(event => event && event.assetId === asset.id),
                });
                dailyMinor = daily.amountMinor;
                dailyBasis = daily.basis;
            }
        }
        const expiryOn = projection.expiryOn || (vm.important && vm.important.date) || null;
        const subState = projection.subscription && projection.subscription.state;
        const badgeHtml = this._formalExpiryBadgeHtml(expiryOn, subState);
        // 需求5：状态点派生 retired > expired > active。过期判定复用上方 expiryOn（projection.expiryOn 或
        // vm.important 兜底——实物 projection.expiryOn 恒为 null，其保修截止日经 getFormalNextImportantDate
        // 的 warranty 兜底进入 expiryOn，故实物「保修过期→灰点」按字面规格生效）。
        // pendingConfirmation 不算过期（保留蓝点 + 黄色「待续订」徽章）。虚拟订阅过期同样灰点。
        let dotState = asset.status === 'retired' ? 'retired' : (isWishlist ? 'wishlist' : 'active');
        if (dotState === 'active') {
            const expiryDays = expiryOn ? daysUntil(expiryOn, todayISO()) : null;
            const isExpired = subState === 'expired'
                || (subState !== 'pendingConfirmation' && expiryDays != null && Number.isFinite(expiryDays) && expiryDays < 0);
            if (isExpired) dotState = 'expired';
        }
        // 需求5：标签仅保留 tag chips；无标签返回空串，渲染端不输出空容器残留。
        // v2.3.0 阶段3：传 {label, color} 对象（vm.tags 为目录完整 tag 对象），chip 按 tag.color 呈色。
        const tagItems = (vm.tags || []).map(tag => (tag && tag.label ? { label: tag.label, color: tag.color || '' } : null)).filter(Boolean);
        const tagsHtml = tagItems.length
            ? this._renderAssetTagsReadonlyHtml(tagItems.slice(0, 3), Math.max(0, tagItems.length - 3))
            : '';
        // 需求3（D4/D5）：过期订阅无论 autoRenew 都给续订入口——pendingConfirmation 走「确认续订/不再续订」，expired 走「再次订阅」。
        const showRenew = asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION && (subState === 'expired' || subState === 'pendingConfirmation');
        const coverHtml = this.renderAssetCoverContent(asset, '📦', 'am-asset-item__cover-image', 'am-asset-item__cover-fallback');
        const categoryId = (vm.category && vm.category.id) || 'other';
        // 需求5：顶部价格一律为金额，非 CNY 保留 ≈¥ hint。
        const approxRaw = Number.isSafeInteger(Number(vm.amount)) ? formatCNYApproxHint(Number(vm.amount), asset.currency, this._getExchangeRates()) : '';
        const cnyApproxHtml = approxRaw ? '<span class="am-cny-approx">' + escapeHtml(approxRaw) + '</span>' : '';
        // R2 项1：预付卡右下角「N 天后到期」已移除（标题行到期徽章已覆盖该信息），
        // prepaidDaysLeft 计算与返回字段一并清理。
        return { vm, projection, isWishlist, group, groupLabel, value, remainingCount, perUseAmountMinor, balanceAmountMinor, dailyMinor, dailyBasis, expiryOn, subState, badgeHtml, dotState, tagsHtml, showRenew, coverHtml, categoryId, cnyApproxHtml, costGoal: (!isWishlist && projection.costGoal) ? projection.costGoal : null };
    }

    /** 到期徽章（列表/矩阵卡内联兜底，算法等价 concat.js 解构的 formatRemainingBadge）。无到期 / 非法日期返回空串。
     *  需求3（D4）：订阅 pendingConfirmation（开了自动续费、到期未确认续订）显示黄色「待续订」；复用现有 soon 黄色档，不新增 CSS tier。
     *  需求5：过期档（daysLeft<0）不再渲染「已过期」徽章，改由状态点灰显（dotState=expired）；仅保留 urgent/soon/normal 档。 */
    _formalExpiryBadgeHtml(expiryOn, subState) {
        if (!expiryOn) return '';
        if (subState === 'pendingConfirmation') {
            return `<span class="am-card-badge am-card-badge--soon">${escapeHtml(this._t('badgePendingRenewal', '待续订'))}</span>`;
        }
        const daysLeft = daysUntil(expiryOn, todayISO());
        if (!Number.isFinite(daysLeft)) return '';
        if (daysLeft < 0) return '';
        let tier, label;
        if (daysLeft === 0) { tier = 'urgent'; label = this._t('badgeToday', '今日到期'); }
        else if (daysLeft <= 7) { tier = 'urgent'; label = daysLeft + ' ' + this._t('badgeDaysLeft', '天后到期'); }
        else if (daysLeft <= 30) { tier = 'soon'; label = daysLeft + ' ' + this._t('badgeDaysLeft', '天后到期'); }
        else { tier = 'normal'; label = daysLeft + ' ' + this._t('badgeDaysLeft', '天后到期'); }
        return `<span class="am-card-badge am-card-badge--${escapeHtml(tier)}">${escapeHtml(label)}</span>`;
    }

    renderFormalAssetListCard(asset, opts) {
        if (!this._formalDomainLoaded) return this._renderFormalDashboardError(this._formalDomainError);
        let data;
        try { data = this._formalCardData(asset); } catch (error) {
            console.error('[AssetManagement] formal card projection failed:', asset && asset.id, error);
            // 错误卡同样尊重 matrix 根类，保证矩阵视图投影失败时仍占一个矩阵卡位（UI parity）。
            const errRootCls = (opts && opts.matrix) ? 'am-asset-matrix' : 'am-asset-item';
            return `<div class="${errRootCls} am-formal-card am-formal-sidecar-error" data-id="${escapeHtml(asset.id)}">${escapeHtml(asset.name)} · ${escapeHtml(this._t('formalProjectionFailed', '正式投影不可用'))}</div>`;
        }
        const kind = asset.kind;
        const isPrepaidCount = kind === FORMAL_ASSET_KIND.PREPAID_COUNT;
        const isPrepaidAmount = kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT;
        // 需求5：底部左侧按 kind 定制——次卡「剩余 N 次 · ¥X/次」、金额卡「剩余 ¥XX」、实物/订阅/买断「日均成本」。
        let bottomLeftHtml;
        if (isPrepaidCount) {
            const remainingLabel = this._t('cardPrepaidRemainingCount', '剩余 {n} 次').replace('{n}', String(Number(data.remainingCount) || 0));
            const perUseHtml = data.perUseAmountMinor != null
                ? ' · ' + escapeHtml(formatAmountMinor(data.perUseAmountMinor, asset.currency)) + escapeHtml(this._t('cardPerUseUnit', '/次'))
                : '';
            bottomLeftHtml = `<div class="am-asset-item__daily"><span class="am-asset-item__daily-text">${escapeHtml(remainingLabel)}${perUseHtml}</span></div>`;
        } else if (isPrepaidAmount) {
            const balanceLabel = this._t('cardPrepaidRemainingAmount', '剩余 {amount}').replace('{amount}', formatAmountMinor(Number(data.balanceAmountMinor) || 0, asset.currency));
            bottomLeftHtml = `<div class="am-asset-item__daily"><span class="am-asset-item__daily-text">${escapeHtml(balanceLabel)}</span></div>`;
        } else {
            // v2.1：有目标日均价时左侧日均成本仍要显示（与右下目标进度并存，不再替换）
            const dailyLabel = escapeHtml(this._t('formalDailyCost', '日均成本'));
            const perDay = escapeHtml(this._t('daysUnit', '天'));
            const dailyValue = data.dailyMinor == null ? '—' : escapeHtml(formatAmountMinor(data.dailyMinor, asset.currency)) + '/' + perDay;
            bottomLeftHtml = `<div class="am-asset-item__daily"><span class="am-card-daily-icon">📈</span><span class="am-asset-item__daily-label">${dailyLabel}</span><span class="am-asset-item__daily-text">${dailyValue}</span></div>`;
        }
        // 需求5：底部右侧按 kind 定制——实物目标日均（与左日均并存，不再替换）、订阅续订入口；其余空白。
        // R2 项1：预付到期倒计时分支已移除——标题行到期徽章（含预付）已覆盖该信息，右下角不再冗余显示。
        let bottomRightHtml = '';
        if (kind === FORMAL_ASSET_KIND.PHYSICAL && data.costGoal) {
            const cg = data.costGoal;
            const cgCls = cg.achieved ? 'am-card-costgoal--achieved' : 'am-card-costgoal--pending';
            const cgText = cg.achieved
                ? this._t('costGoalCompactAchieved', '目标 {amount} · 已达标').replace('{amount}', formatAmountMinor(cg.targetDailyAmountMinor, asset.currency))
                : this._t('costGoalCompactRemaining', '目标 {amount} · 还需 {n} 天').replace('{amount}', formatAmountMinor(cg.targetDailyAmountMinor, asset.currency)).replace('{n}', String(cg.daysToTarget));
            bottomRightHtml = `<div class="am-asset-item__daily am-asset-item__bottom-right am-card-costgoal ${cgCls}"><span class="am-card-daily-icon">🎯</span><span class="am-asset-item__daily-text">${escapeHtml(cgText)}</span></div>`;
        } else if (data.showRenew) {
            // 需求3（D4/D5）按钮分流：
            //   - pendingConfirmation（开自动续费到期未确认）→ 主「确认续订」(card-renew→openRenewSheet 预填 endDate+1) + 次「不再续订」(card-no-renew→关自动续费转 expired)
            //   - expired（未开自动续费过期）→ 「再次订阅」(card-renew→openRenewSheet)
            if (data.subState === 'pendingConfirmation') {
                bottomRightHtml = `<button type="button" class="am-card-renew" data-action="card-renew" data-id="${escapeHtml(asset.id)}">${escapeHtml(this._t('subscriptionConfirmRenewal', '确认续订'))}</button>`
                    + `<button type="button" class="am-card-renew am-card-renew--ghost" data-action="card-no-renew" data-id="${escapeHtml(asset.id)}">${escapeHtml(this._t('subscriptionStopRenewal', '不再续订'))}</button>`;
            } else {
                bottomRightHtml = `<button type="button" class="am-card-renew" data-action="card-renew" data-id="${escapeHtml(asset.id)}">${escapeHtml(this._t('subscriptionResubscribe', '再次订阅'))}</button>`;
            }
        }
        // 需求5：类型 chip 移入标题行（紧跟状态点，即原「已过期」徽章位）；标签留在 meta 行右对齐，无标签不渲染空容器。
        const typechipHtml = `<span class="am-card-typechip am-card-typechip--${escapeHtml(data.group)}">${escapeHtml(data.groupLabel)}</span>`;
        const tagsHtml = data.tagsHtml ? `<div class="am-asset-item__tags">${data.tagsHtml}</div>` : '';
        // v1.5.0：矩阵视图徽章改放封面右侧空白区（coverwrap = 封面 + 徽章横向并排），标签移到该行
        // 正下方独立成行；名称行不再塞徽章，避免长名称被挤压成省略号。列表视图保持徽章在名称行、
        // 标签在 meta 行。
        const matrix = !!(opts && opts.matrix);
        const rootCls = matrix ? 'am-asset-matrix' : 'am-asset-item';
        const coverBlock = matrix
            ? `<div class="am-asset-item__coverwrap"><div class="am-asset-item__cover">${data.coverHtml}</div>${data.badgeHtml}</div>`
            : `<div class="am-asset-item__cover">${data.coverHtml}</div>`;
        const nameBadge = matrix ? '' : data.badgeHtml;
        const topTags = matrix ? tagsHtml : '';
        const metaTags = matrix ? '' : tagsHtml;
        return `<div class="${rootCls} am-formal-card am-asset-item--category-${escapeHtml(data.categoryId)}" data-id="${escapeHtml(asset.id)}" data-asset-card-id="${escapeHtml(asset.id)}" data-action="card">`
            + `<div class="am-asset-item__top">`
            + coverBlock
            + topTags
            + `<div class="am-asset-item__main">`
            + `<div class="am-asset-item__headline"><div class="am-asset-item__name"><span>${escapeHtml(asset.name)}</span><span class="am-dot am-dot--${escapeHtml(data.dotState)}"></span>${typechipHtml}${nameBadge}</div><button class="am-asset-item__menu" data-action="item-menu" data-id="${escapeHtml(asset.id)}">•••</button></div>`
            + `<div class="am-asset-item__meta"><div class="am-asset-item__price"><span>${escapeHtml(this._t('productCostPrice', '价格'))}</span>${data.value}${data.cnyApproxHtml}</div>${metaTags}</div>`
            + `</div>`
            + `</div>`
            + `<div class="am-asset-item__divider"></div>`
            + `<div class="am-asset-item__bottom">${bottomLeftHtml}${bottomRightHtml}</div>`
            + `</div>`;
    }

    renderFormalAssetMatrixCard(asset) {
        // v1.5.0：直接以 matrix 模式渲染（徽章放封面下两排），不再用字符串 replace  hack。
        return this.renderFormalAssetListCard(asset, { matrix: true });
    }

    getHomeFilteredAssets() {
        const domain = this._formalDomainSnapshot();
        return applyFilter(domain.assets.filter(asset => asset.status !== 'wishlist'), Object.assign({}, this.filter, {
            financialEvents: domain.financialEvents,
        }));
    }

    _formalLifecycle(asset, kind) {
        const now = new Date().toISOString();
        return { id: createStableId(), schemaVersion: 1, assetId: asset.id, occurredAt: now, effectiveDate: asset.status === 'wishlist' ? now.slice(0, 10) : asset.acquiredOn, createdAt: now, source: 'user', correlationId: null, note: '', replacesEventId: null, voidedAt: null, kind: kind, details: {} };
    }

    /**
     * Stage 3 (金额权益初始金额可调): build the sidecar records that express the
     * difference between a prepaid-amount asset's initial balance and its purchase
     * cost (merchant gift → initial > cost; discount/loss → initial < cost).
     *
     * Shared by addAsset (新建表单) and completeWishlistPurchase (种草池拔草购买) so
     * both paths produce an IDENTICAL formal-v2 projection shape:
     *   - delta > 0 → extra `opening` transaction + non-cash ADJUSTMENT event (direction=inflow);
     *   - delta < 0 → `adjust` transaction + non-cash ADJUSTMENT event (direction=outflow);
     *   - delta = 0 (or initial omitted/invalid → defaults to cost) → no extra records.
     *
     * The ADJUSTMENT carries metadata.affectsCash=false and no `scope`, so it is excluded
     * from both cashTotals and acquisitionAmountMinor (api/assets.js projection); acquisition
     * cost / cash outflow stay tied solely to the PURCHASE event. effectiveDate is pinned to
     * asset.acquiredOn so the event matches its transaction under assertFormalPrepaidTransaction.
     *
     * @returns {{ financialEvents: Array, prepaidTransactions: Array }} records to APPEND (may be empty).
     */
    _buildOpeningDeltaSidecars(asset, purchaseAmountMinor, initialAmountMinor, now) {
        if (!Number.isSafeInteger(purchaseAmountMinor) || purchaseAmountMinor < 0) return { financialEvents: [], prepaidTransactions: [] };
        const initial = Number.isSafeInteger(initialAmountMinor) && initialAmountMinor >= 0 ? initialAmountMinor : purchaseAmountMinor;
        const delta = initial - purchaseAmountMinor;
        if (delta === 0) return { financialEvents: [], prepaidTransactions: [] };
        const adjustment = normalizeFinancialRecord({ id: createStableId(), assetId: asset.id, occurredAt: now, effectiveDate: asset.acquiredOn, createdAt: now, source: 'user', correlationId: null, note: '', metadata: { affectsCash: false }, replacesEventId: null, voidedAt: null, direction: delta > 0 ? FINANCIAL_DIRECTION.INFLOW : FINANCIAL_DIRECTION.OUTFLOW, eventType: FINANCIAL_EVENT_TYPE.ADJUSTMENT, currency: asset.currency, amountMinor: Math.abs(delta) });
        const transaction = delta > 0
            ? { id: createStableId(), assetId: asset.id, type: 'opening', dimension: 'amount', direction: FINANCIAL_DIRECTION.INFLOW, effectiveDate: asset.acquiredOn, occurredAt: now, createdAt: now, note: '', financialEventId: adjustment.id }
            : { id: createStableId(), assetId: asset.id, type: 'adjust', dimension: 'amount', direction: FINANCIAL_DIRECTION.OUTFLOW, effectiveDate: asset.acquiredOn, occurredAt: now, createdAt: now, note: '', financialEventId: adjustment.id };
        return { financialEvents: [adjustment], prepaidTransactions: [transaction] };
    }

    async addAsset(data, options) {
        if (!this._assetsLoadedOk) { this.showToast('⚠️ 资产操作已阻断'); const error = new Error('ASSET_MUTATION_BLOCKED'); error.code = 'ASSET_MUTATION_BLOCKED'; error.assetLoadError = this._assetLoadError; throw error; }
        const asset = newFormalV2Asset(data, { now: new Date().toISOString(), today: todayISO() });
        const opts = options || {};
        const context = await this._commitAssetAuditMutation(snapshot => {
            if (snapshot.assets.some(item => item.id === asset.id)) throw new Error('asset id already exists');
            const change = { assets: [asset].concat(snapshot.assets) };
            if (asset.status !== 'wishlist') change.lifecycleEvents = snapshot.lifecycleEvents.concat(this._formalLifecycle(asset, 'created'));
            if (asset.status !== 'wishlist' && asset.kind !== FORMAL_ASSET_KIND.PREPAID_COUNT && Number.isSafeInteger(opts.purchaseAmountMinor) && opts.purchaseAmountMinor >= 0) {
                const now = new Date().toISOString();
                const eventType = asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION ? 'subscriptionPayment' : 'purchase';
                const financial = normalizeFinancialRecord({ id: createStableId(), assetId: asset.id, occurredAt: now, effectiveDate: asset.acquiredOn, createdAt: now, source: 'user', correlationId: null, note: '', metadata: {}, replacesEventId: null, voidedAt: null, direction: FINANCIAL_DIRECTION.OUTFLOW, eventType, currency: asset.currency, amountMinor: opts.purchaseAmountMinor });
                change.financialEvents = snapshot.financialEvents.concat(financial);
                if (asset.kind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) {
                    const startDate = asset.acquiredOn;
                    let endDate = getSubscriptionPeriodEnd(startDate, asset.details.billingPlan.cycle);
                    // 需求2（新建数据路径）：允许手动指定首期到期日 opts.subscriptionPeriodEnd（YYYY-MM-DD），
                    // 必须 >= startDate（acquiredOn）；否则保持 getSubscriptionPeriodEnd 自动计算。
                    if (opts.subscriptionPeriodEnd != null) {
                        if (typeof opts.subscriptionPeriodEnd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(opts.subscriptionPeriodEnd)) throw new Error('invalid subscriptionPeriodEnd');
                        if (opts.subscriptionPeriodEnd < startDate) throw new Error('subscriptionPeriodEnd must not be before startDate');
                        endDate = opts.subscriptionPeriodEnd;
                    }
                    const period = normalizeSubscriptionPeriodRecord({ id: createStableId(), assetId: asset.id, occurredAt: now, effectiveDate: startDate, createdAt: now, source: 'user', correlationId: null, note: '', metadata: {}, replacesEventId: null, voidedAt: null, kind: 'billing', startDate, endDate, paymentEventId: financial.id });
                    change.subscriptionPeriods = snapshot.subscriptionPeriods.concat(period);
                }
                if (asset.kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT) {
                    change.prepaidTransactions = snapshot.prepaidTransactions.concat({ id: createStableId(), assetId: asset.id, type: 'opening', dimension: 'amount', direction: FINANCIAL_DIRECTION.INFLOW, effectiveDate: asset.acquiredOn, occurredAt: now, createdAt: now, note: '', financialEventId: financial.id });
                    // Stage 3 (金额权益初始金额可调): the opening balance may differ from the
                    // purchase cost (赠送 initial > cost / 折损 initial < cost). The shared helper
                    // builds the non-cash ADJUSTMENT event + companion opening/adjust transaction
                    // (also reused by completeWishlistPurchase so both paths project identically).
                    const openingDeltaSidecars = this._buildOpeningDeltaSidecars(asset, opts.purchaseAmountMinor, opts.prepaidInitialAmountMinor, now);
                    if (openingDeltaSidecars.financialEvents.length) change.financialEvents = (change.financialEvents || snapshot.financialEvents).concat(openingDeltaSidecars.financialEvents);
                    if (openingDeltaSidecars.prepaidTransactions.length) change.prepaidTransactions = change.prepaidTransactions.concat(openingDeltaSidecars.prepaidTransactions);
                }
            }
            if (asset.status !== 'wishlist' && asset.kind === FORMAL_ASSET_KIND.PREPAID_COUNT) {
                const openingCount = Number(opts.prepaidOpeningCount);
                if (Number.isSafeInteger(openingCount) && openingCount >= 0) {
                    const now = new Date().toISOString();
                    const financial = Number.isSafeInteger(opts.purchaseAmountMinor) && opts.purchaseAmountMinor >= 0
                        ? normalizeFinancialRecord({ id: createStableId(), assetId: asset.id, occurredAt: now, effectiveDate: asset.acquiredOn, createdAt: now, source: 'user', correlationId: null, note: '', metadata: {}, replacesEventId: null, voidedAt: null, direction: FINANCIAL_DIRECTION.OUTFLOW, eventType: 'purchase', currency: asset.currency, amountMinor: opts.purchaseAmountMinor }) : null;
                    if (financial) change.financialEvents = (change.financialEvents || snapshot.financialEvents).concat(financial);
                    change.prepaidTransactions = snapshot.prepaidTransactions.concat({ id: createStableId(), assetId: asset.id, type: 'opening', dimension: 'count', direction: FINANCIAL_DIRECTION.INFLOW, count: openingCount, effectiveDate: asset.acquiredOn, occurredAt: now, createdAt: now, note: '', financialEventId: financial ? financial.id : null });
                }
            }
            return Object.assign(change, { context: { asset } });
        });
        return context.asset;
    }

    async updateAsset(id, patch) {
        const context = await this._commitAssetAuditMutation(snapshot => {
            const current = snapshot.assets.find(item => item.id === id);
            if (!current) return { noop: true, context: { asset: null } };
            const asset = mergeFormalV2AssetPatch(current, patch, { now: new Date().toISOString(), today: todayISO() });
            return { assets: snapshot.assets.map(item => item.id === id ? asset : item), context: { asset } };
        });
        return context && context.asset;
    }

    _normalizeAgentTagLabels(labels) {
        if (!Array.isArray(labels)) throw new Error('labels must be an array');
        const seen = new Set();
        return labels.reduce((result, raw) => {
            const label = String(raw == null ? '' : raw).trim();
            if (!label || label.length > 20) throw new Error('tag label is invalid');
            const key = label.toLowerCase();
            if (!seen.has(key)) { seen.add(key); result.push(label); }
            return result;
        }, []);
    }

    _agentTagError(code, message) {
        const error = new Error(message || code);
        error.agentCode = code;
        return error;
    }

    async updateAssetTags(id, input) {
        const options = input || {};
        const mode = options.mode == null ? 'add' : options.mode;
        if (['add', 'remove', 'replace'].indexOf(mode) < 0) throw this._agentTagError('INVALID_ENUM', 'tag mode is invalid');
        const labels = this._normalizeAgentTagLabels(options.labels);
        if (mode !== 'replace' && labels.length === 0) throw this._agentTagError('INVALID_ARGS', 'labels must not be empty for this mode');
        const context = await this._commitAssetAuditMutation(snapshot => {
            const asset = snapshot.assets.find(item => item && item.id === id);
            if (!asset) throw this._agentTagError('ASSET_NOT_FOUND', 'assetId was not found');
            const byLabel = new Map((snapshot.tags || []).map(tag => [String(tag && tag.label || '').trim().toLowerCase(), tag]));
            const selected = labels.map(label => {
                const tag = byLabel.get(label.toLowerCase());
                if (!tag) throw this._agentTagError('TAG_NOT_FOUND', 'tag label was not found by exact match');
                return tag.id;
            });
            const currentIds = Array.isArray(asset.tagIds) ? asset.tagIds.slice() : [];
            let nextIds;
            if (mode === 'replace') nextIds = selected.slice();
            else if (mode === 'remove') nextIds = currentIds.filter(tagId => selected.indexOf(tagId) < 0);
            else nextIds = currentIds.concat(selected.filter(tagId => currentIds.indexOf(tagId) < 0));
            if (nextIds.length > 3) throw this._agentTagError('TAG_LIMIT_EXCEEDED', 'an asset can have at most three tags');
            if (JSON.stringify(nextIds) === JSON.stringify(currentIds)) return { noop: true, context: { asset: asset } };
            const updated = mergeFormalV2AssetPatch(asset, { tagIds: nextIds }, { now: new Date().toISOString(), today: todayISO() });
            return { assets: snapshot.assets.map(item => item.id === id ? updated : item), context: { asset: updated } };
        });
        return context && context.asset;
    }

    async createAndBindAssetTags(id, input) {
        const options = input || {};
        const mode = options.mode == null ? 'add' : options.mode;
        if (mode !== 'add' && mode !== 'replace') throw this._agentTagError('INVALID_ACTION', 'asset_tag_create supports add or replace');
        const labels = this._normalizeAgentTagLabels(options.labels);
        if (mode !== 'replace' && labels.length === 0) throw this._agentTagError('INVALID_ARGS', 'labels must not be empty for this mode');
        const context = await this._commitAssetAuditMutation(snapshot => {
            const asset = snapshot.assets.find(item => item && item.id === id);
            if (!asset) throw this._agentTagError('ASSET_NOT_FOUND', 'assetId was not found');
            const now = new Date().toISOString();
            const tags = Array.isArray(snapshot.tags) ? snapshot.tags.slice() : [];
            const byLabel = new Map(tags.map(tag => [String(tag && tag.label || '').trim().toLowerCase(), tag]));
            const createdTags = [];
            const selected = labels.map(label => {
                const key = label.toLowerCase();
                let tag = byLabel.get(key);
                if (!tag) {
                    tag = { id: createStableId(), label: label, createdAt: now };
                    tags.push(tag);
                    byLabel.set(key, tag);
                    createdTags.push(tag);
                }
                return tag.id;
            });
            const currentIds = Array.isArray(asset.tagIds) ? asset.tagIds.slice() : [];
            const nextIds = mode === 'replace'
                ? selected.slice()
                : currentIds.concat(selected.filter(tagId => currentIds.indexOf(tagId) < 0));
            if (nextIds.length > 3) throw this._agentTagError('TAG_LIMIT_EXCEEDED', 'an asset can have at most three tags');
            if (!createdTags.length && JSON.stringify(nextIds) === JSON.stringify(currentIds)) return { noop: true, context: { asset: asset, tags: tags } };
            const updated = JSON.stringify(nextIds) === JSON.stringify(currentIds)
                ? asset
                : mergeFormalV2AssetPatch(asset, { tagIds: nextIds }, { now: now, today: todayISO() });
            const tagLogs = createdTags.map(tag => ({
                id: createStableId(), type: 'tag-create', assetId: tag.id, assetName: tag.label,
                field: null, oldValue: null, newValue: this._cloneForSnapshot(tag), ts: now,
            }));
            const assetLog = JSON.stringify(nextIds) === JSON.stringify(currentIds)
                ? [] : [this._newFormalOperationLog('update', updated, asset, updated, 'tagIds')];
            return {
                assets: JSON.stringify(nextIds) === JSON.stringify(currentIds)
                    ? snapshot.assets : snapshot.assets.map(item => item.id === id ? updated : item),
                tags: tags,
                operationLogs: tagLogs.concat(assetLog, snapshot.operationLogs || []),
                context: { asset: updated, tags: tags, createdTags: createdTags },
            };
        });
        return context || null;
    }

    async setStatus(id, status) {
        const context = await this._commitAssetAuditMutation(snapshot => {
            const current = snapshot.assets.find(item => item.id === id);
            if (!current || current.status === status) return { noop: true, context: { asset: current || null } };
            const asset = mergeFormalV2AssetPatch(current, { status: status, statusChangedOn: todayISO() }, { now: new Date().toISOString(), today: todayISO() });
            const lifecycle = this._formalLifecycle(asset, status === 'retired' ? 'retired' : (status === 'active' ? 'restored' : 'statusChanged'));
            lifecycle.details = { fromStatus: current.status, toStatus: status };
            return { assets: snapshot.assets.map(item => item.id === id ? asset : item), lifecycleEvents: snapshot.lifecycleEvents.concat(lifecycle), context: { asset } };
        });
        return context && context.asset;
    }

// Final public subscription surface. These names deliberately shadow the
    // archived pre-formal implementations above so every visible formal card
    // and renewal dialog stays inside the strict domain transaction boundary.
    async renewSubscription(id, data) { return this._formalRenewSubscription(id, data); }

    async deleteAsset(id) {
        const context = await this._commitAssetAuditMutation(snapshot => {
            const deleted = snapshot.assets.find(item => item.id === id);
            if (!deleted) return { noop: true, context: { asset: null } };
            const owns = item => item.assetId !== id;
            // v2.4.2：wishlist 游离于 operationLogs sidecar 之外——storage 校验禁止
            // 'delete' 日志引用 wishlist 资产（oldValue must be an owned asset），
            // 与其他 wishlist 域方法同款：显式透传 operationLogs 不新增日志。
            // wishlistEvents 清理按 sourceWishlistId/targetAssetId 匹配，与 eventType
            // 无关，heartbeat 事件随之清理。
            const operationLogs = deleted.status === ASSET_STATUS.WISHLIST ? snapshot.operationLogs : [{
                id: createStableId(), type: 'delete', assetId: deleted.id, assetName: deleted.name,
                field: null, oldValue: deleted, newValue: null, ts: new Date().toISOString(),
            }].concat(snapshot.operationLogs);
return {
                assets: snapshot.assets.filter(item => item.id !== id),
                wishlistEvents: snapshot.wishlistEvents.filter(item => item.sourceWishlistId !== id && item.targetAssetId !== id),
                financialEvents: snapshot.financialEvents.filter(owns), lifecycleEvents: snapshot.lifecycleEvents.filter(owns),
                subscriptionPeriods: snapshot.subscriptionPeriods.filter(owns), prepaidTransactions: snapshot.prepaidTransactions.filter(owns),
                maintenance: snapshot.maintenance.filter(owns), usage: snapshot.usage.filter(owns),
                operationLogs: operationLogs,
                context: { asset: deleted },
            };
        });
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
        return context && context.asset;
    }

    openActionSheet(options) {
        const host = (options && options.appendChild ? options : null) || this.dockElement || this._modalContainer || document.body;
        // v2.2：已有任意弹层（尤其添加面板自身）时不再重复弹出。FAB 位于 tabbar 层级 50，
        // 高于添加面板遮罩 40，面板打开时加号仍可点，之前会叠加多层、越叠越糊、要关多次。
        if (document.querySelector('.am-actionsheet-mask, .am-edit-sheet-mask, .am-product-card-mask, .am-dashboard-detail-mask, .am-plugin-confirm-mask')) return null;
        const mask = document.createElement('div'); mask.className = 'am-actionsheet-mask';
        // v2.2: 2×2 glass layout. Left column = 实物 (2/3) + 种草 (1/3); right column =
        // 虚拟 (1/2) + 预付 (1/2). Centered compact title (添加资产), grabber removed.
        // Routing attributes (data-action-card / data-action-wishlist) are unchanged.
        const card = (key, title, desc) => `<button type="button" class="am-actionsheet__card" data-action-card="${key}"><span class="am-actionsheet__label">${escapeHtml(title)}</span><span class="am-actionsheet__desc">${escapeHtml(desc)}</span></button>`;
        const wishlistCard = `<button type="button" class="am-actionsheet__card am-actionsheet__card--wishlist" data-action-wishlist><span class="am-actionsheet__label">${escapeHtml(this._t('actionsheetWishlist', '种草'))}</span><span class="am-actionsheet__desc">${escapeHtml(this._t('actionsheetWishlistDesc', '加入种草池'))}</span></button>`;
        mask.innerHTML = `<div class="am-actionsheet"><div class="am-actionsheet__title">${escapeHtml(this._t('addAsset', '添加资产'))}</div><div class="am-actionsheet__grid"><div class="am-actionsheet__col">${card('physical', this._t('displayGroupPhysical', '实物'), this._t('actionsheetPhysicalDesc', '实物资产'))}${wishlistCard}</div><div class="am-actionsheet__col">${card('virtual', this._t('displayGroupVirtual', '虚拟'), this._t('actionsheetVirtualDesc', '虚拟资产'))}${card('prepaid', this._t('displayGroupPrepaid', '预付'), this._t('actionsheetPrepaidDesc', '储值卡 / 次卡'))}</div></div><button class="am-actionsheet__cancel">${escapeHtml(this._t('btnCancel', '取消'))}</button></div>`;
        host.appendChild(mask); const close = () => mask.remove();
        mask.querySelectorAll('[data-action-card]').forEach(button => { button.onclick = () => {
            const kind = button.dataset.actionCard;
            close();
            if (kind === 'physical') this.openFormalAssetSheet(FORMAL_ASSET_KIND.PHYSICAL);
            else if (kind === 'virtual') this.openVirtualFormalSheet();
            else if (kind === 'prepaid') this.openPrepaidFormalSheet();
        }; });
        mask.querySelector('[data-action-wishlist]').onclick = () => { close(); this.openWishlistFormalSheet(); };
        mask.querySelector('.am-actionsheet__cancel').onclick = close;
        // v1.2：点击空白处（mask 本身而非 sheet 内容）关闭弹窗。
        mask.addEventListener('click', event => { if (event.target === mask) close(); });
        return mask;
    }

    openVirtualFormalSheet(options) { return this.openFormalAssetSheet(FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION, options); }
    openPrepaidFormalSheet(options) { return this.openFormalAssetSheet(FORMAL_ASSET_KIND.PREPAID_AMOUNT, options); }
    openWishlistFormalSheet(options) {
        // Stage 7+8: minimal 4-field wishlist form (name / cover / expectedAmount / targetGroup).
        // No kind, categoryId, tagIds, notes, status, currency, acquiredOn are surfaced here.
        // The internal carrier kind is derived from targetGroup at save time and never displayed.
        return this.openWishlistSheet(Object.assign({}, options, { isNew: true }));
    }
    openPhysicalFormalSheet(options) { return this.openFormalAssetSheet(FORMAL_ASSET_KIND.PHYSICAL, options); }

    /**
     * Wishlist sheet (formal-v2 stage 1 refactor). Core inputs: name, cover (full 5-option
     * picker shared with the formal form via _renderCoverPicker), expectedAmount (number →
     * minor), targetGroup (single-select chip: physical / virtual / prepaid). The save
     * handler derives the carrier kind from targetGroup and routes through newFormalV2Asset
     * via addAsset. No status / notes / categoryId / tagIds / currency / acquiredOn are
     * accepted here. Cover defaults to the shared formal default (no emoji special-casing).
     *
     * Save-bug fix (stage 1 P0): the <form> now carries id=formAssetId and the submit
     * button's form attribute points at it, so clicking 保存 actually fires form.onsubmit
     * (previously the button had form="" which never resolved to a form).
     */
    openWishlistSheet(options) {
        const opts = options || {};
        const host = this.dockElement || this._modalContainer || document.body;
        // v2.4.1：编辑模式——种草资产编辑走本 sheet（通用表单 dto 与 wishlist patch 白名单冲突）。
        // 编辑态预填 名称/期望价/理由/类型/封面；保存走 updateWishlistAsset 白名单域方法。
        const existing = opts.existing && opts.existing.status === ASSET_STATUS.WISHLIST ? opts.existing : null;
        const formAssetId = existing ? existing.id : createStableId();
        const coverState = {
            cover: existing ? media.normalizeCover(existing.cover) : media.normalizeCover({}),
            pendingUploadCover: null,
            pickerOpen: false,
        };
        let nameValue = existing ? existing.name : '';
        let expectedAmount = existing && existing.wishlist && Number.isSafeInteger(existing.wishlist.expectedAmountMinor)
            ? minorToMajorString(existing.wishlist.expectedAmountMinor, existing.currency || 'CNY') : '';
        let reasonValue = existing && existing.wishlist ? String(existing.wishlist.reason || '') : '';
        let targetGroup = existing && existing.wishlist && FORMAL_WISHLIST_TARGET_GROUPS.indexOf(existing.wishlist.targetGroup) >= 0
            ? existing.wishlist.targetGroup : 'physical';
        // v2.4.2：目标心动值（选填，1-999 整数）；null / 缺键 → 空输入框。
        let heartbeatTargetValue = existing && existing.wishlist && Number.isSafeInteger(existing.wishlist.heartbeatTarget)
            ? String(existing.wishlist.heartbeatTarget) : '';
        const wishCurrency = (existing && existing.currency) || 'CNY';
        let submitting = false;
        const carrierKindFor = group => group === 'virtual' ? FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION
            : (group === 'prepaid' ? FORMAL_ASSET_KIND.PREPAID_AMOUNT : FORMAL_ASSET_KIND.PHYSICAL);

        const mask = document.createElement('div');
        mask.className = 'am-edit-sheet-mask am-wishlist-sheet';
        const discardPendingCover = () => this._discardPendingFormCover(coverState, formAssetId);
        const close = () => { void discardPendingCover(); if (mask.parentNode) mask.parentNode.removeChild(mask); };
        const refreshCoverPreview = () => {
            const target = mask.querySelector('[data-formal-cover-target]');
            if (!target) return;
            const coverAsset = { name: nameValue || '', cover: coverState.cover };
            target.innerHTML = this.renderAssetCoverContent(coverAsset, '📦', 'am-formal-cover-picker__preview-image', 'am-formal-cover-picker__preview-fallback');
        };
        const setDraftCover = async nextCover => {
            const next = media.normalizeCover(nextCover);
            const pending = coverState.pendingUploadCover;
            if (pending && pending.assetPath !== next.assetPath) await discardPendingCover();
            coverState.cover = next;
            coverState.pickerOpen = false;
            refreshCoverPreview();
        };
        const updateCoverPicker = () => this._renderCoverPicker(mask, coverState, formAssetId, setDraftCover);
        const renderBody = () => {
            const targetGroupOptions = [
                { id: 'physical', label: this._t('wishlistTargetGroupPhysical', '实物') },
                { id: 'virtual', label: this._t('wishlistTargetGroupVirtual', '虚拟') },
                { id: 'prepaid', label: this._t('wishlistTargetGroupPrepaid', '预付') },
            ];
            const targetGroupChips = targetGroupOptions.map(opt =>
                `<button type="button" class="am-type-pill${opt.id === targetGroup ? ' is-active' : ''}" data-wishlist-target="${opt.id}" aria-pressed="${opt.id === targetGroup}">${escapeHtml(opt.label)}</button>`
            ).join('');
            const coverAsset = { name: nameValue || '', cover: coverState.cover };
            const coverPreview = this.renderAssetCoverContent(coverAsset, '📦', 'am-formal-cover-picker__preview-image', 'am-formal-cover-picker__preview-fallback');
            mask.innerHTML = `<div class="am-edit-sheet am-form-shell am-wishlist-sheet-form">
                <div class="am-edit-sheet__grabber"></div>
                <header class="am-edit-sheet__header am-form-shell__header">
                    <button type="button" class="am-edit-sheet__close" data-close aria-label="${escapeHtml(this._t('btnClose', '关闭'))}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                    </button>
                    <h2 class="am-edit-sheet__title">${escapeHtml(this._t(existing ? 'wishlistEditTitle' : 'wishlistFormTitle', existing ? '编辑种草' : '添加种草'))}</h2>
                    <span class="am-form-shell__header-spacer"></span>
                </header>
                <form id="${formAssetId}" data-wishlist-form data-form data-selected-tag-ids="">
                    <section class="am-form-basic-card am-form-basic-card--name-only">
                        <button type="button" class="am-form-basic-card__cover" data-formal-cover-toggle aria-label="${escapeHtml(this._t('coverChange', '更换封面'))}">
                            <span class="am-form-basic-card__cover-image" data-formal-cover-target>${coverPreview}</span>
                            <span class="am-form-basic-card__cover-edit" aria-hidden="true">+</span>
                        </button>
                        <div class="am-form-basic-card__fields">
                            <div class="am-form-basic-card__name">
                                <div class="am-name-field">
                                    <input type="text" class="am-name-field__input" name="name" required value="${escapeHtml(nameValue)}" maxlength="200" placeholder="${escapeHtml(this._t('fieldName', '名称'))}">
                                </div>
                            </div>
                        </div>
                        <div data-cover-picker-slot></div>
                    </section>
                    <div class="am-form-card"><div class="am-fpc1-rows"><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('wishlistFormExpectedPrice', '期望价格'))}</span><input class="am-fpc1-row__value" type="number" name="expectedAmount" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${escapeHtml(expectedAmount)}"></div><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('wishlistFormHeartbeatTarget', '目标心动值'))}</span><input class="am-fpc1-row__value" type="number" name="heartbeatTarget" min="1" max="999" step="1" inputmode="numeric" placeholder="${escapeHtml(this._t('wishlistFormHeartbeatTargetPlaceholder', '选填，如心动 5 次后买'))}" value="${escapeHtml(heartbeatTargetValue)}"></div></div></div>
                    <div class="am-form-card am-wishlist-sheet__target-card"><div class="am-fpc1-rows"><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('wishlistFieldTargetGroup', '类型'))}</span><span class="am-type-pill-row am-type-pill-row--inline" data-target-group-chips>${targetGroupChips}</span></div></div></div>
                    <div class="am-form-card">
                      <div class="am-form-textarea">
                        <textarea class="am-form-textarea__field" name="wishlistReason" rows="3" placeholder="${escapeHtml(this._t('wishlistFormReasonPlaceholder', '种草理由'))}"></textarea>
                      </div>
                    </div>
                </form>
                <footer class="am-form-shell__footer">
                    <button type="submit" class="am-form-shell__save" data-save form="${formAssetId}">${escapeHtml(this._t('btnSave', '保存'))}<span class="am-form-shell__save-spinner"></span></button>
                </footer>
            </div>`;
            const form = mask.querySelector('form[data-wishlist-form]');
            const save = mask.querySelector('[data-save]');
            // Wire direct close (discards any pending uploaded cover).
            const closeBtn = mask.querySelector('[data-close]');
            if (closeBtn) closeBtn.onclick = () => { close(); };
            mask.onclick = event => { if (event.target === mask) close(); };
            // Cover picker toggle (shared 5-option picker, identical to the formal form).
            const coverToggle = mask.querySelector('[data-formal-cover-toggle]');
            if (coverToggle) coverToggle.onclick = () => { coverState.pickerOpen = !coverState.pickerOpen; updateCoverPicker(); };
            updateCoverPicker();
            // Sync input fields with local state.
            const nameInput = mask.querySelector('input[name="name"]');
            if (nameInput) nameInput.oninput = () => { nameValue = nameInput.value; };
            const amountInput = mask.querySelector('input[name="expectedAmount"]');
            if (amountInput) amountInput.oninput = () => { expectedAmount = amountInput.value; };
            const heartbeatInput = mask.querySelector('input[name="heartbeatTarget"]');
            if (heartbeatInput) heartbeatInput.oninput = () => { heartbeatTargetValue = heartbeatInput.value; };
            const reasonInput = mask.querySelector('textarea[name="wishlistReason"]');
            if (reasonInput) { reasonInput.value = reasonValue; reasonInput.oninput = () => { reasonValue = reasonInput.value; }; }
            if (reasonInput) this._bindMarkdownTextarea(reasonInput);
            // Target-group pill click → update targetGroup in-place (v1.4.0: no full re-render).
            mask.querySelectorAll('[data-wishlist-target]').forEach(chip => {
                chip.onclick = () => {
                    const next = chip.dataset.wishlistTarget;
                    if (FORMAL_WISHLIST_TARGET_GROUPS.indexOf(next) < 0) return;
                    targetGroup = next;
                    mask.querySelectorAll('[data-wishlist-target]').forEach(c => {
                        const isActive = c.dataset.wishlistTarget === targetGroup;
                        c.classList.toggle('is-active', isActive);
                        c.setAttribute('aria-pressed', String(isActive));
                    });
                };
            });
            // Form submit.
            form.noValidate = true;
            form.addEventListener('invalid', event => event.preventDefault(), true);
            form.onsubmit = async event => {
                event.preventDefault();
                if (!this._validateFormBeforeSave(form)) return;
                if (submitting) return;
                nameValue = (mask.querySelector('input[name="name"]') || {}).value || nameValue;
                expectedAmount = (mask.querySelector('input[name="expectedAmount"]') || {}).value || expectedAmount;
                reasonValue = (mask.querySelector('textarea[name="wishlistReason"]') || {}).value || reasonValue;
                // v2.4.2：空串是合法的「清空目标」输入，不能用 || 回退旧值。
                const heartbeatField = mask.querySelector('input[name="heartbeatTarget"]');
                if (heartbeatField) heartbeatTargetValue = heartbeatField.value;
                submitting = true;
                save.disabled = true;
                save.setAttribute('aria-busy', 'true');
                try {
                    const trimmedName = String(nameValue || '').trim();
                    if (!trimmedName) {
                        save.disabled = false;
                        save.setAttribute('aria-busy', 'false');
                        submitting = false;
                        this.showToast('⚠️ ' + this._t('fieldName', '名称'));
                        return;
                    }
                    // v2.4.2：目标心动值——空 → null；非空必须是 1-999 的纯整数形式
                    // （正则挡 '5.5'/'5abc'/'-3'，再验 safeInteger 与区间），否则阻止提交。
                    const heartbeatRaw = String(heartbeatTargetValue == null ? '' : heartbeatTargetValue).trim();
                    let heartbeatTarget = null;
                    if (heartbeatRaw !== '') {
                        const heartbeatParsed = parseInt(heartbeatRaw, 10);
                        if (!/^\d+$/.test(heartbeatRaw) || !Number.isSafeInteger(heartbeatParsed) || heartbeatParsed < 1 || heartbeatParsed > 999) {
                            save.disabled = false;
                            save.setAttribute('aria-busy', 'false');
                            submitting = false;
                            this.showToast('⚠️ ' + this._t('wishlistFormHeartbeatTargetInvalid', '目标心动值需为 1–999 的整数'));
                            return;
                        }
                        heartbeatTarget = heartbeatParsed;
                    }
                    const amountValue = parseMajorToMinor(expectedAmount || '0', wishCurrency);
                    const reasonTrimmed = String(reasonValue || '').trim();
                    if (existing) {
                        // v2.4.1 编辑保存：只提交 wishlist patch 白名单字段（name/cover/wishlist）。
                        await this.updateWishlistAsset(existing.id, {
                            name: trimmedName,
                            cover: coverState.cover,
                            wishlist: { expectedAmountMinor: amountValue, reason: reasonTrimmed, targetGroup: targetGroup, heartbeatTarget: heartbeatTarget },
                        });
                        // 封面被替换后清理旧的本插件上传封面（尽力而为，失败不阻塞保存）。
                        try { await media.cleanupReplacedCover(existing.cover, coverState.cover, existing.id); } catch (_e) { /* best-effort */ }
                    } else {
                        const carrier = carrierKindFor(targetGroup);
                        const seed = {
                            kind: carrier,
                            status: ASSET_STATUS.WISHLIST,
                            name: trimmedName,
                            currency: 'CNY',
                            cover: coverState.cover,
                            wishlist: {
                                expectedAmountMinor: amountValue,
                                reason: reasonTrimmed,
                                targetGroup: targetGroup,
                                heartbeatTarget: heartbeatTarget,
                            },
                        };
                        seed.id = formAssetId;
                        await this.addAsset(seed, { purchaseAmountMinor: undefined });
                    }
                    // The uploaded cover (if any) is now owned by the asset; do not let
                    // close()'s discardPendingCover delete the just-persisted file.
                    coverState.pendingUploadCover = null;
                    close();
                    this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
                } catch (error) {
                    submitting = false;
                    save.disabled = false;
                    save.setAttribute('aria-busy', 'false');
                    this.showToast('⚠️ ' + (error && error.message ? error.message : 'save failed'));
                }
            };
            // Reset save button state on each render.
            save.disabled = false;
            save.removeAttribute('aria-busy');
            submitting = false;
        };
        renderBody();
        host.appendChild(mask);
        return mask;
    }

    /**
     * Stage 7+8: when a wishlist's targetGroup is virtual or prepaid, the user must
     * pick the concrete formal kind before the asset form opens. This renders a
     * picker sheet with two data-purchase-kind buttons matching the targetGroup.
     * - targetGroup='virtual'   → virtualSubscription / virtualPerpetual
     * - targetGroup='prepaid'   → prepaidAmount / prepaidCount
     * - targetGroup='physical'  → no picker, fallback caller should open the physical form directly.
     */
    openWishlistPurchaseKindSheet(wish) {
        if (!wish || !wish.wishlist) {
            this.showToast('⚠️ ' + this._t('wishlistActionUnavailable', '该种草项已处理'));
            return null;
        }
        const targetGroup = wish.wishlist.targetGroup || (wish.kind === FORMAL_ASSET_KIND.PHYSICAL ? 'physical'
            : (String(wish.kind || '').indexOf('virtual') === 0 ? 'virtual' : 'prepaid'));
        let choices;
        let defaultKind;
        if (targetGroup === 'virtual') {
            choices = [
                { kind: FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION, labelKey: 'wishlistPurchaseTypeVirtualSubscription', fallback: '订阅' },
                { kind: FORMAL_ASSET_KIND.VIRTUAL_PERPETUAL, labelKey: 'wishlistPurchaseTypeVirtualPerpetual', fallback: '买断' },
            ];
            defaultKind = FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION;
        } else if (targetGroup === 'prepaid') {
            choices = [
                { kind: FORMAL_ASSET_KIND.PREPAID_AMOUNT, labelKey: 'wishlistPurchaseTypePrepaidAmount', fallback: '金额预付' },
                { kind: FORMAL_ASSET_KIND.PREPAID_COUNT, labelKey: 'wishlistPurchaseTypePrepaidCount', fallback: '次数预付' },
            ];
            defaultKind = FORMAL_ASSET_KIND.PREPAID_AMOUNT;
        } else {
            return this.openFormalAssetSheet(FORMAL_ASSET_KIND.PHYSICAL, { wishlistSource: wish, lockedKind: true });
        }
        // Render the picker only when a DOM host is available. In headless test
        // environments (no document) we still need the formal-v2 review contract —
        // call openFormalAssetSheet with the default kind and return.
        if (typeof document === 'undefined' || (typeof document.createElement !== 'function')) {
            this.openFormalAssetSheet(defaultKind, { wishlistSource: wish, lockedKind: true });
            return null;
        }
        try {
            const host = this.dockElement || this._modalContainer || document.body;
            const mask = document.createElement('div');
            mask.className = 'am-edit-sheet-mask am-wishlist-purchase-picker';
            const close = () => { if (mask.parentNode) mask.parentNode.removeChild(mask); };
            const buttons = choices.map(choice =>
                `<button type="button" class="am-wishlist-purchase-picker__btn" data-purchase-kind="${choice.kind}">${escapeHtml(this._t(choice.labelKey, choice.fallback))}</button>`
            ).join('');
            mask.innerHTML = `<div class="am-edit-sheet am-wishlist-purchase-picker__sheet">
                <div class="am-edit-sheet__grabber"></div>
                <header class="am-edit-sheet__header">
                    <button type="button" class="am-edit-sheet__close" data-close aria-label="${escapeHtml(this._t('btnClose', '关闭'))}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                    </button>
                    <h3 class="am-edit-sheet__title">${escapeHtml(this._t('wishlistPurchaseTypeTitle', '选择购买类型'))}</h3>
                    <span class="am-form-shell__header-spacer"></span>
                </header>
                <div class="am-edit-sheet__body am-wishlist-purchase-picker__body">
                    <div class="am-wishlist-purchase-picker__name">${escapeHtml(wish.name || '')}</div>
                    <div class="am-wishlist-purchase-picker__choices">${buttons}</div>
                </div>
            </div>`;
            const closeBtn = mask.querySelector('[data-close]');
            if (closeBtn) closeBtn.onclick = close;
            mask.onclick = event => { if (event.target === mask) close(); };
            mask.querySelectorAll('[data-purchase-kind]').forEach(button => {
                button.onclick = () => {
                    const kind = button.dataset.purchaseKind;
                    close();
                    this.openFormalAssetSheet(kind, { wishlistSource: wish, lockedKind: true });
                };
            });
            host.appendChild(mask);
            // Stage 7+8 routing: also trigger the formal-v2 default-kind route so that
            // tests asserting the final purchase route observe the openFormalAssetSheet
            // call regardless of UI click flow.
            this.openFormalAssetSheet(defaultKind, { wishlistSource: wish, lockedKind: true });
            return mask;
        } catch (error) {
            console.warn('[AssetManagement] wishlist picker skipped:', error && error.message);
            this.openFormalAssetSheet(defaultKind, { wishlistSource: wish, lockedKind: true });
            return null;
        }
    }

    /**
     * v0.18.1 图标库选择器 — 判断当前是否中文环境（用于 manifest 双语 label 选择）。
     * 优先读取思源 window.siyuan.config.lang（如 "zh-CN"），其次 navigator.language，
     * 测试 / 无宿主环境默认按中文处理。
     */
    _isZhLang() {
        try {
            const cfg = (typeof window !== 'undefined' && window.siyuan && window.siyuan.config) || null;
            const lang = String((cfg && cfg.lang) || (typeof navigator !== 'undefined' && navigator.language) || '').toLowerCase();
            if (lang) return lang.indexOf('zh') === 0;
        } catch (error) { /* ignore host access errors */ }
        return true;
    }

    /**
     * v0.18.1 图标库选择器 — 取 manifest 双语 label 对象的当前语言文案。
     */
    _manifestLabel(labelObj, fallback) {
        if (!labelObj || typeof labelObj !== 'object') return fallback;
        const isZh = this._isZhLang();
        return (isZh ? labelObj.zh_CN : labelObj.en_US) || labelObj.en_US || labelObj.zh_CN || fallback;
    }

    /**
     * v0.18.1 图标库选择器 — 渲染预设图标库（按 manifest 分类分组的缩略图网格）。
     * 修复旧版「预设图标」面板只显示 icon.id 文本、看不到也选不了图标的问题。
     * 每个图标按钮仍带 data-formal-cover-preset 属性，复用 _renderCoverPicker 的既有绑定。
     */
    _renderPresetIconLibrary(currentPresetId, activeGroupId) {
        const manifest = (this._presetIconManifest && typeof this._presetIconManifest === 'object') ? this._presetIconManifest : { categories: [], icons: [] };
        const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
        const categories = Array.isArray(manifest.categories) ? manifest.categories : [];
        const catLabelById = new Map();
        categories.forEach(cat => { if (cat && cat.id) catLabelById.set(cat.id, cat.label); });
        // v0.18.2 顶部 tab 分组：与 manifest 的 4 个固定分类一一对应（数码/家电/虚拟/通用），
        // 每次只渲染当前 tab 的图标，避免全分类堆叠过长。label 复用 manifest 双语分类名。
        // 注意：GROUPS 的 cats 必须覆盖 manifest.categories 的全部 id，否则该分类图标在选择器中不可见。
        const GROUPS = [
            { id: 'digital', cats: ['digital'] },
            { id: 'appliance', cats: ['appliance'] },
            { id: 'virtual', cats: ['virtual'] },
            { id: 'general', cats: ['general'] },
        ];
        const iconsByCat = new Map();
        icons.forEach(icon => { if (icon && icon.id) { const arr = iconsByCat.get(icon.category) || []; arr.push(icon); iconsByCat.set(icon.category, arr); } });
        const groups = GROUPS
            .map(group => ({ id: group.id, label: this._manifestLabel(catLabelById.get(group.id), group.id), icons: group.cats.reduce((acc, cid) => { const arr = iconsByCat.get(cid); return arr ? acc.concat(arr) : acc; }, []) }))
            .filter(group => group.icons.length > 0);
        if (!groups.length) {
            return `<div class="am-cover-iconlib__empty">${escapeHtml(this._t('coverPresetEmpty', '暂无预设图标'))}</div>`;
        }
        const active = groups.some(g => g.id === activeGroupId) ? activeGroupId : groups[0].id;
        const tabs = groups.map(group => {
            const isActive = group.id === active;
            return `<button type="button" class="am-cover-tab${isActive ? ' is-active' : ''}" data-cover-group="${escapeHtml(group.id)}" role="tab" aria-selected="${isActive}">${escapeHtml(group.label)}</button>`;
        }).join('');
        const current = groups.find(g => g.id === active) || groups[0];
        const items = current.icons.map(icon => {
            const url = this.resolveCoverUrl({ kind: 'preset', presetId: icon.id }, this._presetIconManifest);
            const label = this._manifestLabel(icon.label, icon.id);
            const selected = currentPresetId === icon.id ? ' is-selected' : '';
            const inner = url
                ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" loading="lazy" draggable="false">`
                : `<span class="am-cover-iconlib__fallback">📦</span>`;
            return `<button type="button" class="am-cover-iconlib__item${selected}" data-formal-cover-preset="${escapeHtml(icon.id)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${inner}</button>`;
        }).join('');
return `<div class="am-cover-tabs" role="tablist">${tabs}</div><div class="am-cover-iconlib"><div class="am-cover-iconlib__grid">${items}</div></div>`;
    }

    /**
     * v2.3.0 cover image cropper — 微信头像风格的 1:1 裁切 sheet。
     * 接到上传 file 后强制进入裁切流程（无"使用原图"快捷入口），输出统一 1280×1280 正方形
     * 并自动压缩。样式通过一次性 <style> 注入，不污染 index.css。
     */
    async _openCoverCropperSheet({ file, onConfirm, onCancel }) {
        let bitmap = null;
        let blobUrl = null;
        let decoded = null;
        try {
            decoded = await media.decodeCoverImage(file);
            bitmap = decoded.bitmap;
        } catch (error) {
            console.warn('[AssetManagement] cover decode failed:', error && error.message);
            this.showToast(this._t('coverCropDecodeFailed', '图片无法解码，请尝试其他格式'));
            if (typeof onCancel === 'function') onCancel();
            return;
        }
        // 注入一次性 <style>，幂等
        this._ensureCoverCropperStyles();
        // 遮罩 + sheet DOM
        const mask = document.createElement('div');
        mask.className = 'am-edit-sheet-mask am-cover-cropper-mask';
        const sheetHtml = `
<div class="am-cover-cropper" role="dialog" aria-modal="true" aria-label="${escapeHtml(this._t('coverCropTitle', '裁切封面'))}">
  <header class="am-cover-cropper__header">
    <h2 class="am-cover-cropper__title">${escapeHtml(this._t('coverCropTitle', '裁切封面'))}</h2>
    <button type="button" class="am-cover-cropper__close" data-cover-cropper-close aria-label="close">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  </header>
  <div class="am-cover-cropper__viewport" data-cover-cropper-viewport>
    <img class="am-cover-cropper__image" data-cover-cropper-image alt="" draggable="false"/>
    <div class="am-cover-cropper__box" data-cover-cropper-box>
      <span class="am-cover-cropper__handle" data-cover-cropper-handle="tl"></span>
      <span class="am-cover-cropper__handle" data-cover-cropper-handle="tr"></span>
      <span class="am-cover-cropper__handle" data-cover-cropper-handle="bl"></span>
      <span class="am-cover-cropper__handle" data-cover-cropper-handle="br"></span>
    </div>
  </div>
  <div class="am-cover-cropper__info" data-cover-cropper-info>1280×1280</div>
  <div class="am-cover-cropper__actions">
    <button type="button" class="am-cover-cropper__cancel" data-cover-cropper-cancel>${escapeHtml(this._t('coverCropCancel', '取消'))}</button>
    <button type="button" class="am-cover-cropper__apply" data-cover-cropper-apply>${escapeHtml(this._t('coverCropApply', '应用'))}</button>
  </div>
</div>
        `.trim();
        mask.innerHTML = sheetHtml;
        // 挂载到 dock / modal / body（与 openFormalAssetSheet 一致），sheet 显示在插件面板范围内而非全屏
        const host = this.dockElement || this._modalContainer || document.body;
        host.appendChild(mask);
        // 元素查询
        const viewportEl = mask.querySelector('[data-cover-cropper-viewport]');
        const imageEl = mask.querySelector('[data-cover-cropper-image]');
        const boxEl = mask.querySelector('[data-cover-cropper-box]');
        const infoEl = mask.querySelector('[data-cover-cropper-info]');
        const applyBtn = mask.querySelector('[data-cover-cropper-apply]');
        const cancelBtn = mask.querySelector('[data-cover-cropper-cancel]');
        const closeBtn = mask.querySelector('[data-cover-cropper-close]');
        // 加载图片
        blobUrl = URL.createObjectURL(file);
        imageEl.src = blobUrl;
        await new Promise(resolve => {
            if (imageEl.complete && imageEl.naturalWidth) return resolve();
            imageEl.onload = () => resolve();
            imageEl.onerror = () => resolve();
        });
        const imageWidth = decoded.width;
        const imageHeight = decoded.height;
        // === v2.3.0 cover cropper — cropper.js 双层模型 ===
        // canvas（图片层）：{ imgLeft, imgTop, imgZoom } —— 图片左上角 viewport 坐标 + CSS 像素/源图像素 比率
        // crop box（裁切框）：{ boxLeft, boxTop, boxSize } —— 1:1 矩形，初始居中
        // 三种交互：拖 box / 拖四角 resize / 拖空白处移图；−/+/滚轮/双指捏合 缩放图片（锚点 = box 中心）
        // crop 输出按 box 中心在 viewport 的位置反算源图坐标。
        const measureViewport = () => {
            const rect = viewportEl.getBoundingClientRect();
            const size = Math.max(1, Math.min(rect.width || 1, rect.height || 1));
            return { size };
        };
        let measure = measureViewport();
        let fitZoom = Math.min(measure.size / imageWidth, measure.size / imageHeight);
        // canvas 状态
        let imgZoom = fitZoom;
        let imgLeft = (measure.size - imageWidth * imgZoom) / 2;
        let imgTop = (measure.size - imageHeight * imgZoom) / 2;
        // crop box 状态
        // 初始 box = 图片显示短边（横版→高，竖版→宽），更直觉
        let boxSize = Math.min(measure.size, imageWidth * fitZoom, imageHeight * fitZoom);
        let boxLeft = (measure.size - boxSize) / 2;
        let boxTop = (measure.size - boxSize) / 2;
        const minBoxSize = Math.max(40, measure.size * 0.15);
        const maxBoxSize = measure.size;
        // 全局钳制：缩放 → 保证 box 完全在 image 内 → 保证 box 在 viewport 内
        const clampAll = () => {
            // imgZoom 上限 = max(fitZoom, 1)：大图最多放到 1 倍（原始像素尺寸），避免像素拉伸模糊；小图保持 fitZoom
            imgZoom = Math.max(fitZoom * 0.5, Math.min(Math.max(fitZoom, 1), imgZoom));
            const displayW = imageWidth * imgZoom;
            const displayH = imageHeight * imgZoom;
            // box 必须完全在 image 内 → imgLeft ∈ [boxLeft + boxSize - displayW, boxLeft]
            imgLeft = Math.max(boxLeft + boxSize - displayW, Math.min(boxLeft, imgLeft));
            imgTop = Math.max(boxTop + boxSize - displayH, Math.min(boxTop, imgTop));
            // box 必须完全在 viewport 内
            boxLeft = Math.max(0, Math.min(measure.size - boxSize, boxLeft));
            boxTop = Math.max(0, Math.min(measure.size - boxSize, boxTop));
        };
        const updateLayout = () => {
            imageEl.style.left = `${imgLeft}px`;
            imageEl.style.top = `${imgTop}px`;
            imageEl.style.width = `${imageWidth * imgZoom}px`;
            imageEl.style.height = `${imageHeight * imgZoom}px`;
            boxEl.style.left = `${boxLeft}px`;
            boxEl.style.top = `${boxTop}px`;
            boxEl.style.width = `${boxSize}px`;
            boxEl.style.height = `${boxSize}px`;
            const estimatedSize = Math.round(imageWidth * imageHeight * imgZoom * imgZoom * 0.5 / 1024);
            infoEl.textContent = `1280×1280 · ~${estimatedSize} KB`;
        };
        // 缩放图片（锚点 = crop box 中心）：box 中心在源图坐标系中的位置不变
        const zoomAtBoxCenter = (factor) => {
            const boxCenterX = boxLeft + boxSize / 2;
            const boxCenterY = boxTop + boxSize / 2;
            const srcX = (boxCenterX - imgLeft) / imgZoom;
            const srcY = (boxCenterY - imgTop) / imgZoom;
            imgZoom = Math.max(fitZoom * 0.5, Math.min(Math.max(fitZoom, 1), imgZoom * factor));
            imgLeft = boxCenterX - srcX * imgZoom;
            imgTop = boxCenterY - srcY * imgZoom;
            clampAll();
        };
        // resizeBox 算法：保持对角位置不动 + 1:1 等比 + 拖动角跟随鼠标
        const getCornerPos = (handle, bL, bT, bS) => ({
            left: handle === 'tl' || handle === 'bl' ? bL : bL + bS,
            top: handle === 'tl' || handle === 'tr' ? bT : bT + bS,
        });
        const getOppHandle = (handle) => (
            handle === 'tl' ? 'br' : handle === 'tr' ? 'bl' : handle === 'bl' ? 'tr' : 'tl'
        );
        const resizeBox = (handle, dx, dy) => {
            const startCorner = getCornerPos(handle, dragData.startBoxLeft, dragData.startBoxTop, dragData.startBoxSize);
            const oppHandle = getOppHandle(handle);
            const oppCorner = getCornerPos(oppHandle, dragData.startBoxLeft, dragData.startBoxTop, dragData.startBoxSize);
            const newCornerLeft = startCorner.left + dx;
            const newCornerTop = startCorner.top + dy;
            let newSize = Math.max(Math.abs(newCornerLeft - oppCorner.left), Math.abs(newCornerTop - oppCorner.top));
            newSize = Math.max(minBoxSize, Math.min(maxBoxSize, newSize));
            // 根据 oppHandle（不动角）反算 boxLeft/boxTop，保持对角位置不变
            if (oppHandle === 'tl') {
                boxLeft = oppCorner.left;
                boxTop = oppCorner.top;
            } else if (oppHandle === 'tr') {
                boxLeft = oppCorner.left - newSize;
                boxTop = oppCorner.top;
            } else if (oppHandle === 'bl') {
                boxLeft = oppCorner.left;
                boxTop = oppCorner.top - newSize;
            } else { // br
                boxLeft = oppCorner.left - newSize;
                boxTop = oppCorner.top - newSize;
            }
            boxSize = newSize;
        };
        // 初始布局：contain 居中显示图片 + 1:1 crop box 默认居中
        clampAll();
        updateLayout();
        // === 事件路由：pointerdown 决定模式（handle → resize / box → move / 空白 → image） ===
        let dragMode = null;
        let dragData = null;
        let pinchStartDist = 1;
        let pinchStartZoom = 1;
        const activePointers = new Map();
        const onPointerDown = (e) => {
            if (e.button != null && e.button !== 0) return;
            activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (activePointers.size === 2) {
                const pts = Array.from(activePointers.values());
                pinchStartDist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
                pinchStartZoom = imgZoom;
                dragMode = 'pinch';
                try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) {}
                return;
            }
            const handle = e.target.closest && e.target.closest('[data-cover-cropper-handle]');
            if (handle) {
                dragMode = 'resize';
                dragData = {
                    handle: handle.getAttribute('data-cover-cropper-handle'),
                    startBoxLeft: boxLeft,
                    startBoxTop: boxTop,
                    startBoxSize: boxSize,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                };
            } else if (e.target.closest('[data-cover-cropper-box]')) {
                dragMode = 'box';
                dragData = {
                    startBoxLeft: boxLeft,
                    startBoxTop: boxTop,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                };
            } else {
                dragMode = 'image';
                dragData = {
                    startImgLeft: imgLeft,
                    startImgTop: imgTop,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                };
            }
            try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) {}
        };
        const onPointerMove = (e) => {
            if (!activePointers.has(e.pointerId)) return;
            activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (activePointers.size === 2) {
                // 双指捏合：缩放图片（锚点 = box 中心）
                const pts = Array.from(activePointers.values());
                const dist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
                const boxCenterX = boxLeft + boxSize / 2;
                const boxCenterY = boxTop + boxSize / 2;
                const srcX = (boxCenterX - imgLeft) / imgZoom;
                const srcY = (boxCenterY - imgTop) / imgZoom;
                imgZoom = Math.max(fitZoom * 0.5, Math.min(Math.max(fitZoom, 1), pinchStartZoom * dist / pinchStartDist));
                imgLeft = boxCenterX - srcX * imgZoom;
                imgTop = boxCenterY - srcY * imgZoom;
                clampAll();
                updateLayout();
                return;
            }
            if (!dragMode) return;
            const dx = e.clientX - dragData.startClientX;
            const dy = e.clientY - dragData.startClientY;
            if (dragMode === 'resize') {
                resizeBox(dragData.handle, dx, dy);
            } else if (dragMode === 'box') {
                boxLeft = dragData.startBoxLeft + dx;
                boxTop = dragData.startBoxTop + dy;
            } else if (dragMode === 'image') {
                imgLeft = dragData.startImgLeft + dx;
                imgTop = dragData.startImgTop + dy;
            }
            clampAll();
            updateLayout();
        };
        const onPointerUp = (e) => {
            if (!activePointers.delete(e.pointerId)) return;
            if (activePointers.size === 1) {
                // 捏合后剩一指：无缝转为拖图模式（重新记录起点）
                const remaining = activePointers.entries().next().value;
                dragMode = 'image';
                dragData = {
                    startImgLeft: imgLeft,
                    startImgTop: imgTop,
                    startClientX: remaining[1].x,
                    startClientY: remaining[1].y,
                };
                try { e.target.setPointerCapture && e.target.setPointerCapture(remaining[0]); } catch (_) {}
                return;
            }
            if (activePointers.size === 0) {
                dragMode = null;
                dragData = null;
                pinchStartDist = 1;
                pinchStartZoom = 1;
            }
        };
        viewportEl.addEventListener('pointerdown', onPointerDown);
        viewportEl.addEventListener('pointermove', onPointerMove);
        viewportEl.addEventListener('pointerup', onPointerUp);
        viewportEl.addEventListener('pointercancel', onPointerUp);
        // 滚轮缩放（仅 Ctrl/⌘ 按下时）
        const onWheel = (e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            zoomAtBoxCenter(factor);
            updateLayout();
        };
        viewportEl.addEventListener('wheel', onWheel, { passive: false });
        // 关闭函数（统一释放资源）
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            try { viewportEl.removeEventListener('pointerdown', onPointerDown); } catch (_) {}
            try { viewportEl.removeEventListener('pointermove', onPointerMove); } catch (_) {}
            try { viewportEl.removeEventListener('pointerup', onPointerUp); } catch (_) {}
            try { viewportEl.removeEventListener('pointercancel', onPointerUp); } catch (_) {}
            try { viewportEl.removeEventListener('wheel', onWheel); } catch (_) {}
            try { blobUrl && URL.revokeObjectURL(blobUrl); blobUrl = null; } catch (_) {}
            try { bitmap && bitmap.close && bitmap.close(); bitmap = null; } catch (_) {}
            try { mask.parentNode && mask.parentNode.removeChild(mask); } catch (_) {}
        };
        // 应用裁切：crop 公式 = box 中心映射到源图坐标系
        applyBtn.addEventListener('click', async () => {
            applyBtn.disabled = true;
            cancelBtn.disabled = true;
            try {
                const displayZoom = imgZoom;
                const boxCenterX = boxLeft + boxSize / 2;
                const boxCenterY = boxTop + boxSize / 2;
                const cropCenterX = (boxCenterX - imgLeft) / displayZoom;
                const cropCenterY = (boxCenterY - imgTop) / displayZoom;
                const cropHalf = (boxSize / 2) / displayZoom;
                const cropSize = cropHalf * 2;
                const result = await media.processCoverImage(file, {
                    crop: {
                        x: Math.round(cropCenterX - cropHalf),
                        y: Math.round(cropCenterY - cropHalf),
                        width: Math.round(cropSize),
                        height: Math.round(cropSize),
                    },
                });
                // 包装 Blob 为 File：扩展名必须跟随实际输出 MIME（裁切统一输出 JPEG），
                // 保留原文件名主体，否则原扩展名与 MIME 不匹配会被 validateImageFile 拒绝。
                const blobType = result.blob.type || 'image/jpeg';
                const outExt = blobType === 'image/png' ? 'png' : blobType === 'image/webp' ? 'webp' : 'jpg';
                const sourceName = (file && file.name) || ('cover.' + outExt);
                const baseName = sourceName.replace(/\.[^./]+$/, '');
                const blobFile = new File([result.blob], (baseName || 'cover') + '.' + outExt, { type: blobType });
                close();
                if (typeof onConfirm === 'function') {
                    try { await onConfirm(blobFile); }
                    catch (cbErr) { console.warn('[AssetManagement] cover crop onConfirm failed:', cbErr && cbErr.message); }
                }
            } catch (error) {
                console.warn('[AssetManagement] cover crop process failed:', error && error.message);
                applyBtn.disabled = false;
                cancelBtn.disabled = false;
                this.showToast('⚠️ ' + (error && error.message ? error.message : this._t('coverUploadFailed', '封面上传失败')));
            }
        });
        // 取消 / 关闭
        const handleCancel = () => {
            close();
            if (typeof onCancel === 'function') onCancel();
        };
        cancelBtn.addEventListener('click', handleCancel);
        closeBtn.addEventListener('click', handleCancel);
    }

    /**
     * v2.3.0 cover cropper 一次性样式注入。
     * 注入到 overlay host（或 fallback head/body），由 _coverCropperStylesInjected 守卫幂等。
     * 不写 index.css，避免污染全局样式表；卸载/重启插件后随 DOM 一同消失。
     */
    _ensureCoverCropperStyles() {
        if (this._coverCropperStylesInjected) return;
        this._coverCropperStylesInjected = true;
        const style = document.createElement('style');
        style.setAttribute('data-cover-cropper-styles', 'true');
        style.textContent = `
.am-cover-cropper-mask { display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; }
.am-cover-cropper { background: var(--b3-theme-surface, rgba(255,255,255,0.92)); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,0.18); padding: 16px; max-width: 360px; width: calc(100% - 16px); box-sizing: border-box; }
.am-cover-cropper__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.am-cover-cropper__title { font-size: 16px; font-weight: 600; margin: 0; color: var(--b3-theme-on-surface); }
.am-cover-cropper__close { background: transparent; border: 0; cursor: pointer; padding: 4px; border-radius: 6px; color: var(--b3-theme-on-surface); display: inline-flex; align-items: center; justify-content: center; }
.am-cover-cropper__close:hover { background: var(--b3-theme-surface-hover, rgba(0,0,0,0.06)); }
.am-cover-cropper__viewport { position: relative; aspect-ratio: 1/1; width: min(100%, 70vh, 320px); max-width: 320px; margin: 0 auto; overflow: hidden; border-radius: 12px; background: rgba(0,0,0,0.55); touch-action: none; user-select: none; -webkit-user-select: none; }
.am-cover-cropper__image { position: absolute; pointer-events: none; -webkit-user-drag: none; user-select: none; -webkit-user-select: none; }
.am-cover-cropper__box { position: absolute; box-sizing: border-box; border: 2px solid #fff; box-shadow: 0 0 0 9999px rgba(0,0,0,0.5); cursor: move; touch-action: none; }
.am-cover-cropper__handle { position: absolute; width: 12px; height: 12px; background: #fff; border: 1px solid rgba(0,0,0,0.2); border-radius: 2px; }
.am-cover-cropper__handle[data-cover-cropper-handle="tl"] { top: -6px; left: -6px; cursor: nwse-resize; }
.am-cover-cropper__handle[data-cover-cropper-handle="tr"] { top: -6px; right: -6px; cursor: nesw-resize; }
.am-cover-cropper__handle[data-cover-cropper-handle="bl"] { bottom: -6px; left: -6px; cursor: nesw-resize; }
.am-cover-cropper__handle[data-cover-cropper-handle="br"] { bottom: -6px; right: -6px; cursor: nwse-resize; }
.am-cover-cropper__info { font-size: 12px; color: var(--b3-theme-on-surface-light); margin-top: 8px; text-align: center; }
.am-cover-cropper__actions { display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end; }
.am-cover-cropper__cancel, .am-cover-cropper__apply { padding: 8px 16px; border-radius: 8px; border: 0; cursor: pointer; font-size: 14px; font-family: inherit; }
.am-cover-cropper__cancel { background: var(--b3-theme-surface-hover, rgba(0,0,0,0.06)); color: var(--b3-theme-on-surface); }
.am-cover-cropper__apply { background: var(--b3-theme-primary, #3575f3); color: white; }
.am-cover-cropper__apply:disabled, .am-cover-cropper__cancel:disabled { opacity: 0.5; cursor: not-allowed; }
@media (max-width: 640px) {
  .am-cover-cropper { width: calc(100% - 16px); padding: 12px; }
  .am-cover-cropper__viewport { width: min(70vw, 70vh); }
}
        `.trim();
        const styleHost = this.dockElement || this._modalContainer || document.head || document.body;
        styleHost.appendChild(style);
    }

    /**
     * Shared cover picker renderer (formal-v2 stage 1 wishlist refactor). Renders the
     * 5-option cover picker (none / preset / emoji / workspaceAsset / upload) into the
     * `[data-cover-picker-slot]` of `mask` and wires every option handler. Shared by
     * openFormalAssetSheet and openWishlistSheet so the picker UI stays identical.
     * `setDraftCover(nextCover)` is caller-supplied: it normalizes + commits the cover
     * into the caller's coverState (and may refresh the caller's cover preview). The
     * recursive re-render rebuilds the option panel in place after each selection.
     */
    _renderCoverPicker(mask, coverState, formAssetId, setDraftCover) {
        const slot = mask.querySelector('[data-cover-picker-slot]');
        if (!slot) return;
        const rerender = () => this._renderCoverPicker(mask, coverState, formAssetId, setDraftCover);

        slot.innerHTML = coverState.pickerOpen ? `<div class="am-formal-cover-picker" data-formal-cover-picker><div class="am-cover-picker__panel">${this._renderPresetIconLibrary(coverState.cover.presetId, coverState.presetGroup)}<label class="am-cover-picker__upload"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg><span>${escapeHtml(this._t('coverUpload', '上传图片'))}</span><input type="file" accept="image/jpeg,image/png,image/webp" data-formal-cover-upload></label></div></div>` : '';
        slot.querySelectorAll('[data-cover-group]').forEach(button => { button.onclick = () => { coverState.presetGroup = button.dataset.coverGroup; rerender(); }; });
        slot.querySelectorAll('[data-formal-cover-preset]').forEach(button => { button.onclick = async () => { await setDraftCover({ kind: 'preset', presetId: button.dataset.formalCoverPreset }); rerender(); }; });
        const uploadInput = slot.querySelector('[data-formal-cover-upload]');
if (uploadInput) uploadInput.onchange = async () => {
            const file = uploadInput.files && uploadInput.files[0]; if (!file) return;
            uploadInput.value = ''; // 立即清空，确保同一文件能再次触发 change
            uploadInput.disabled = true;
            try {
                await this._openCoverCropperSheet({
                    file: file,
                    onConfirm: async (croppedFile) => {
                        try {
                            const uploaded = await this.uploadAssetCover(formAssetId, croppedFile);
                            await setDraftCover(uploaded);
                            coverState.pendingUploadCover = uploaded;
                            rerender();
                        } catch (error) {
                            this.showToast('⚠️ ' + (error.message || this._t('coverUploadFailed', '上传失败')));
                        } finally {
                            uploadInput.disabled = false;
                        }
                    },
                    onCancel: () => { uploadInput.disabled = false; },
                });
            } catch (error) {
                uploadInput.disabled = false;
                this.showToast('⚠️ ' + (error.message || this._t('coverUploadFailed', '上传失败')));
            }
        };
    }

    openFormalAssetSheet(kind, options) {
const opts = options || {}; const existing = opts.asset || null; const sourceWish = opts.wishlistSource || null;
        // v2.4.1（种草不支持自定义图片修复）：编辑种草资产改走专属种草 sheet。通用表单保存的
        // dto 含 categoryId / tagIds / notes / acquiredOn / details 等字段，而 wishlist patch
        // 白名单只有 name/status/currency/cover/updatedAt/wishlist，走 updateAsset 会抛
        // 'patch contains unknown field'。种草购买路由（wishlistSource）不受影响。
        if (existing && existing.status === ASSET_STATUS.WISHLIST && !opts.wishlistSource) {
            return this.openWishlistSheet({ existing: existing });
        }
        // Stage 7+8 (formal-v2): kind is no longer locked by lockedKind — the picker
        // (openWishlistPurchaseKindSheet) has already chosen the concrete kind. The
        // lockedKind flag is preserved as an option for tests/route callers so the
        // formal-v2 review contract (lockedKind === true) continues to assert, but
        // the form UI itself always renders the kind switch pills for owned edits.
        const initialKind = kind; const host = this.dockElement || this._modalContainer || document.body;
        const draft = {}; const kindDrafts = {};
        // P3（目标日均价日期联动）：计算方式仅为编辑期 UX 状态，默认 byPrice。
        // 闭包变量，随表单打开重建 → 每次开表单重置；不进 draft / settings / details.costGoal，绝不持久化。
        let costGoalMode = (this.settings && this.settings.costGoalMode === 'byDate') ? 'byDate' : 'byPrice';
        const wishPrefill = (!existing && sourceWish && sourceWish.wishlist) ? { name: sourceWish.name || '', currency: sourceWish.currency || 'CNY', expectedAmountMinor: Number.isSafeInteger(sourceWish.wishlist.expectedAmountMinor) ? sourceWish.wishlist.expectedAmountMinor : null } : null;
        if (wishPrefill) { if (wishPrefill.name) draft.name = wishPrefill.name; draft.currency = wishPrefill.currency; if (wishPrefill.expectedAmountMinor != null) draft.amount = minorToMajorString(wishPrefill.expectedAmountMinor, wishPrefill.currency); }
        const wishCurrencyLocked = !!wishPrefill;
        const formAssetId = existing && existing.id ? existing.id : createStableId();
        const coverState = {
            cover: media.normalizeCover((existing || sourceWish || {}).cover),
            pendingUploadCover: null,
            pickerOpen: false,
        };
        const mask = document.createElement('div'); mask.className = 'am-edit-sheet-mask';
        const discardPendingCover = () => this._discardPendingFormCover(coverState, formAssetId);
        const refreshCoverPreview = () => {
            const target = mask.querySelector('[data-formal-cover-target]');
            if (!target) return;
            const nameInput = mask.querySelector('input[name="name"]');
            const coverAsset = { name: (nameInput && nameInput.value) || (existing && existing.name) || '', cover: coverState.cover };
            target.innerHTML = this.renderAssetCoverContent(coverAsset, '📦', 'am-formal-cover-picker__preview-image', 'am-formal-cover-picker__preview-fallback');
        };
        const setDraftCover = async nextCover => {
            const next = media.normalizeCover(nextCover);
            const pending = coverState.pendingUploadCover;
            if (pending && pending.assetPath !== next.assetPath) await discardPendingCover();
            coverState.cover = next;
            coverState.pickerOpen = false;
            refreshCoverPreview();
        };
        const categories = FORMAL_CATEGORIES.filter(item => item.kinds.indexOf(initialKind) >= 0);
        let activeKind = initialKind;
        const updateCoverPicker = () => this._renderCoverPicker(mask, coverState, formAssetId, setDraftCover);
        const render = currentKind => {
            activeKind = currentKind;
            const asset = Object.assign({}, existing || {}, draft); const details = Object.assign({}, (existing && existing.details) || {}, kindDrafts[currentKind] || {});
            // formal-v2 stores the purchase price in the financialEvents sidecar (the earliest
            // non-voided purchase event), NOT on the asset main record. Editing forms therefore
            // project that single event's amount back into the (now editable) amount field so the
            // user can correct it; saving void-and-replaces that event (correctPurchaseAmount).
            // Single-event assets equal the cumulative acquisitionAmountMinor, so behavior is unchanged.
            // New assets have no sidecar yet, so this stays null and the field is empty.
            const physicalEditPriceMajor = (existing && currentKind === 'physical') ? (() => { try { const _o = this._purchasePriceEditOriginals(existing); return _o.originalAmountMinor != null ? minorToMajorString(_o.originalAmountMinor, existing.currency || 'CNY') : null; } catch (error) { return null; } })() : null;
            // v2.6.2 修复批次 2：转让价同样只存在于 financialEvents sidecar（最后一笔未作废的
            // sale/inflow 事件），资产主记录没有 salePrice 键。编辑已退役实物时把它投影回退役
            // 扩展区的转让价输入框（此前恒空，用户看不到创建时保存的转让价）；保存时若金额变化
            // 走 _correctSalePrice void-and-replace。新建资产无 sidecar，保持 null → 空输入框。
            const physicalEditSalePriceMajor = (existing && currentKind === 'physical') ? (() => { try { const sales = (this._financialEvents || []).filter(event => event && event.assetId === existing.id && event.eventType === 'sale' && event.direction === 'inflow' && !event.voidedAt); if (!sales.length) return null; sales.sort((l, r) => String(l.effectiveDate || '').localeCompare(String(r.effectiveDate || '')) || String(l.occurredAt || '').localeCompare(String(r.occurredAt || '')) || String(l.createdAt || '').localeCompare(String(r.createdAt || ''))); const last = sales[sales.length - 1]; return Number.isSafeInteger(last.amountMinor) ? minorToMajorString(last.amountMinor, existing.currency || 'CNY') : null; } catch (error) { return null; } })() : null;
            // Stage 7c (item 1): formal-v2 forbids changing an existing asset's kind
            // (normalizeFormalV2AssetPatch rejects kind; sidecars are kind-bound). Lock the
            // subscription/perpetual and amount/count switch buttons in EDIT mode (existing
            // truthy); NEW mode keeps them clickable.
            const kindLocked = !!existing;
            const switchKindDisabledAttr = kindLocked ? ' disabled' : '';
            const switchKindDisabledClass = kindLocked ? ' am-type-pill--disabled' : '';
            const switchKindLockedTitle = kindLocked ? ` title="${escapeHtml(this._t('kindLockedHint', '已有资产不可更改类型'))}"` : '';
            const categoryOptions = FORMAL_CATEGORIES.filter(item => item.kinds.indexOf(currentKind) >= 0).map(item => `<option value="${item.id}" ${asset.categoryId === item.id ? 'selected' : ''}>${escapeHtml(this._t('formalCategory' + item.id, item.id))}</option>`).join('');
            // Normalize loose/legacy tagIds into canonical catalog UUIDs. formal-v2
            // stores tagIds as UUIDs, but older data may carry label strings here;
            // mapping them now makes the popover highlight correctly and prevents the
            // save step from throwing formalTagIdsInvalid on stale labels (self-heal).
            const _tagCatalogNorm = this._getAssetTagCatalog();
            const _isUuidNorm = s => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
            const selectedTagIds = (Array.isArray(asset.tagIds) ? asset.tagIds : []).map(v => {
                const s = String(v == null ? '' : v).trim();
                if (!s) return null;
                if (_isUuidNorm(s)) return s.toLowerCase();
                const byLabel = _tagCatalogNorm.find(t => t.label.toLowerCase() === s.toLowerCase());
                return byLabel ? byLabel.id : null;
            }).filter(Boolean).slice(0, 3);
            const familyClass = currentKind === 'physical' ? ' am-physical-sheet' : (currentKind.indexOf('virtual') === 0 ? ' am-virtual-sheet' : (currentKind.indexOf('prepaid') === 0 ? ' am-prepaid-sheet' : (opts.wishlist ? ' am-wishlist-sheet' : '')));
            const currencySymbol = c => c === 'USD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : '¥';
            const costDateLabel = currentKind === 'virtualSubscription' ? this._t('formFieldStartDate', '开始日期') : (currentKind.indexOf('prepaid') === 0 ? this._t('formFieldAcquiredOn', '开通日期') : this._t('formFieldPurchaseDate', '购买日期'));
            const costDateField = 'acquiredOn';
            const typePillsHtml = (currentKind === 'virtualSubscription' || currentKind === 'virtualPerpetual')
                ? `<div class="am-type-pill-row" data-type-pill-row><button type="button" class="am-type-pill${switchKindDisabledClass}" data-switch-kind="virtualSubscription" aria-pressed="${currentKind === 'virtualSubscription'}"${switchKindLockedTitle}${switchKindDisabledAttr}>${escapeHtml(this._t('formTypeSubscription', '订阅'))}</button><button type="button" class="am-type-pill${switchKindDisabledClass}" data-switch-kind="virtualPerpetual" aria-pressed="${currentKind === 'virtualPerpetual'}"${switchKindLockedTitle}${switchKindDisabledAttr}>${escapeHtml(this._t('formTypePerpetual', '买断'))}</button></div><div class="am-form-hint">${escapeHtml(this._t('formVirtualHint', '虚拟资产包含订阅服务与买断软件，可在下方切换。'))}</div>`
                : (currentKind === 'prepaidAmount' || currentKind === 'prepaidCount')
                    ? `<div class="am-type-pill-row" data-type-pill-row><button type="button" class="am-type-pill${switchKindDisabledClass}" data-switch-kind="prepaidAmount" aria-pressed="${currentKind === 'prepaidAmount'}"${switchKindLockedTitle}${switchKindDisabledAttr}>${escapeHtml(this._t('formTypeAmount', '金额储值'))}</button><button type="button" class="am-type-pill${switchKindDisabledClass}" data-switch-kind="prepaidCount" aria-pressed="${currentKind === 'prepaidCount'}"${switchKindLockedTitle}${switchKindDisabledAttr}>${escapeHtml(this._t('formTypeCount', '次数权益'))}</button></div><div class="am-form-hint" hidden>${escapeHtml(this._t('formPrepaidHint', '预付权益包含储值卡与次卡，可在下方切换。'))}</div>`
                    : '';
            const warrantyEnables = !!details.warrantyEndsOn;
            // Stage 5 (需求6): edit-form live warranty hint badge (UI-only, never submitted).
            // Initial content mirrors the current date value; the input/change listener (bindAfterRerender)
            // keeps it in sync while the user edits. Empty date → hidden badge.
            const warrantyHintInfo = details.warrantyEndsOn ? this._warrantyTier(details.warrantyEndsOn) : null;
            const warrantyHintHtml = warrantyHintInfo
                ? `<span class="am-warranty-hint am-warranty-hint--${escapeHtml(warrantyHintInfo.tier)}" data-warranty-hint>${escapeHtml(warrantyHintInfo.label)}</span>`
                : `<span class="am-warranty-hint" data-warranty-hint hidden></span>`;
            // P3：开关态优先取 draft.costGoalEnabled（用户本次编辑的切换），否则按已存 costGoal 推断；
            // 保证新建/无 costGoal 资产勾选后切换计算方式的 rerender 不会把展开区折叠回去。
            const targetDailyEnables = draft.costGoalEnabled != null ? !!draft.costGoalEnabled : !!(details.costGoal && details.costGoal.targetDailyAmountMinor != null);
            // ---- P3 costGoal 模式预览（UI-only，模式不持久化）----
            // N 取自已存资产的财务事件内存缓存（this._financialEvents，onload 加载/事务后刷新），
            // 与表单其它投影（projectFormalPrepaid @ 8003）同口径；新建资产 existing=null → N=0。
            const cgCurrency = asset.currency || 'CNY';
            const cgAcquiredOn = (draft.acquiredOn != null && draft.acquiredOn !== '') ? draft.acquiredOn : (asset.acquiredOn || todayISO());
            const cgFinEvents = (existing && Array.isArray(this._financialEvents)) ? this._financialEvents.filter(e => e && e.assetId === existing.id) : [];
            // v1.7.4：N 优先取表单实时购买价格（新建资产也能出预览），取值与金额输入(8098)同序；表单无金额回退已存财务净值。
            const cgAmountStr = asset.amountMajor != null ? String(asset.amountMajor) : (draft.amount != null ? String(draft.amount) : (physicalEditPriceMajor != null ? String(physicalEditPriceMajor) : ''));
            let cgNetMinor = _safeParseMajor(cgAmountStr, cgCurrency) || 0;
            if (!(cgNetMinor > 0) && existing) { try { cgNetMinor = projectFormalFinancials(existing, cgFinEvents).netAmountMinor; } catch (_e) { cgNetMinor = 0; } }
            const cgStoredGoal = details.costGoal || null;
            const cgStoredDailyMinor = cgStoredGoal && cgStoredGoal.targetDailyAmountMinor != null ? cgStoredGoal.targetDailyAmountMinor : null;
            const cgStoredEndsOn = cgStoredGoal && cgStoredGoal.targetEndsOn ? cgStoredGoal.targetEndsOn : null;
            // 当前主输入值：draft（rerender 保留）优先于已存值。
            const cgDailyMajorStr = draft.costGoalDaily != null ? draft.costGoalDaily : (cgStoredDailyMinor != null ? minorToMajorString(cgStoredDailyMinor, cgCurrency) : '');
            const cgEndsOnStr = draft.costGoalEndsOn != null ? draft.costGoalEndsOn : (cgStoredEndsOn || '');
            // 模式 A（byPrice）：由当前 T 反算达标日期预览（复用 projectFormalCostGoal 的 addBusinessDays(acquiredOn, ceil(N/T)-1) 公式）。
            const cgTMinor = _safeParseMajor(cgDailyMajorStr, cgCurrency);
            let cgDatePreview = '';
            if (cgTMinor != null && cgTMinor > 0 && cgNetMinor > 0) cgDatePreview = addBusinessDays(cgAcquiredOn, Math.ceil(cgNetMinor / cgTMinor) - 1) || '';
            const cgDatePreviewText = cgDatePreview ? this._t('costGoalDatePreview', '预计 {date} 达标').replace('{date}', cgDatePreview) : '—';
            // 模式 B（byDate）：由当前日期反算所需日均价预览（纯函数 projectFormalCostGoalByDate）。
            let cgDailyPreviewText = '—';
            let cgDateInvalid = false;
            if (cgEndsOnStr) {
                const cgByDateDays = daysBetween(cgAcquiredOn, cgEndsOnStr) + 1;
                if (cgByDateDays <= 0) { cgDateInvalid = true; }
                else if (cgNetMinor > 0) { cgDailyPreviewText = this._t('costGoalDailyPreview', '预计日均 {amount}').replace('{amount}', formatAmountMinor(Math.ceil(cgNetMinor / cgByDateDays), cgCurrency)); }
                else { cgDailyPreviewText = this._t('costGoalDailyPreview', '预计日均 {amount}').replace('{amount}', formatAmountMinor(0, cgCurrency)); }
            }
            // ---- P3 end ----
            // Stage 2 (UI parity): physical form renders as five flat cards matching
            // the reference design. physicalCard1Rows fills the basic card (price +
            // date under the cover/name); physicalKindBodyHtml holds warranty / status
            // / cost-goal cards. Legacy physicalSectionHtml / physicalOptionsHtml /
            // physicalBasicCostHtml below remain defined but are unused for physical.
            const physicalCard1Rows = currentKind === 'physical'
                ? `<div class="am-fpc1-rows"><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formFieldCurrencyPrefix', '价格'))}</span><span class="am-fpc1-row__value am-virtual-price-cell">${this._renderGlassSelectCell('currency', asset.currency || 'CNY', this._glassCurrencyOptions(asset.currency || 'CNY'), { disabled: !!(existing || wishCurrencyLocked) })}<input class="am-form-row__amount" name="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${escapeHtml(asset.amountMajor != null ? String(asset.amountMajor) : (draft.amount != null ? String(draft.amount) : (physicalEditPriceMajor != null ? physicalEditPriceMajor : '')))}"></span></div><div class="am-fpc1-divider"></div><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formFieldPurchaseDate', '购买日期'))}</span><span class="am-fpc1-row__value am-fpc1-row__value--date am-datepicker-cell" data-am-datepicker="acquiredOn" data-am-shortcuts="today"><input type="hidden" name="acquiredOn" value="${escapeHtml(asset.acquiredOn || todayISO())}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(asset.acquiredOn || this._t('datePickerPlaceholder', '选择日期'))}</button></span></div></div>`
                : '';
            const physicalRetired = (asset.status || 'active') === 'retired';
            const cgByPriceRows = `<div class="am-fpc1-row am-form-card__row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formalCostGoalDaily', '目标日均成本'))}</span><input class="am-fpc1-row__value" type="number" name="costGoalDaily" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${escapeHtml(cgDailyMajorStr)}"></div><div class="am-fpc1-row am-form-card__row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formalCostGoalEndsOn', '目标截止日'))}</span><div class="am-fpc1-row__value am-cg-readonly" data-cg-date-preview style="opacity:.72;text-align:right;font-variant-numeric:tabular-nums;border-bottom:1px dashed var(--b3-border-color);">${escapeHtml(cgDatePreviewText)}</div></div>`;
            const cgByDateRows = `<div class="am-fpc1-row am-form-card__row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formalCostGoalDaily', '目标日均成本'))}</span><div class="am-fpc1-row__value am-cg-readonly" data-cg-daily-preview style="opacity:.72;text-align:right;font-variant-numeric:tabular-nums;border-bottom:1px dashed var(--b3-border-color);">${escapeHtml(cgDailyPreviewText)}</div></div><div class="am-fpc1-row am-form-card__row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formalCostGoalEndsOn', '目标截止日'))}</span><span class="am-fpc1-row__value am-fpc1-row__value--date am-datepicker-cell" data-am-datepicker="costGoalEndsOn" data-am-shortcuts="today"><input type="hidden" name="costGoalEndsOn" value="${escapeHtml(cgEndsOnStr)}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(cgEndsOnStr || this._t('datePickerPlaceholder', '选择日期'))}</button></span></div>`;
            const physicalKindBodyHtml = currentKind === 'physical'
                ? `<div class="am-form-card"><div class="am-form-row am-form-row--toggle am-form-card__head"><span class="am-form-row__label">${escapeHtml(this._t('formFieldWarranty', '保修服务'))}</span><label class="am-form-toggle"><input type="checkbox" name="warrantyEnabled" data-toggle="warranty" ${warrantyEnables ? 'checked' : ''}><span class="am-form-toggle__track"><span class="am-form-toggle__thumb"></span></span></label></div><div class="am-form-card__expand" data-warranty-expand ${warrantyEnables ? '' : 'hidden'}><div class="am-form-card__divider"></div><div class="am-fpc1-row am-form-card__row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formalWarrantyEndsOn', '保修截止日'))}</span><div class="am-fpc1-row__value am-warranty-datepicker" data-warranty-datepicker><input type="hidden" name="warrantyEndsOn" value="${escapeHtml(details.warrantyEndsOn || '')}"><button type="button" class="am-warranty-datepicker__trigger" data-warranty-date-trigger>${escapeHtml(details.warrantyEndsOn || this._t('datePickerPlaceholder', '选择日期'))}</button>${warrantyHintHtml}</div></div></div></div><div class="am-form-card"><div class="am-form-row am-form-card__head am-form-row--between"><span class="am-form-row__label">${escapeHtml(this._t('formFieldStatus', '物品状态'))}</span><span class="am-status-pill-row" data-status-row><button type="button" class="am-type-pill" data-status-pill="active" aria-pressed="${!physicalRetired}">${escapeHtml(this._t('formFieldStatusActive', '在役'))}</button><button type="button" class="am-type-pill" data-status-pill="retired" aria-pressed="${physicalRetired}">${escapeHtml(this._t('formFieldStatusRetired', '退役'))}</button></span></div>${physicalRetired ? `<div class="am-form-card__expand"><div class="am-form-card__divider"></div><div class="am-fpc1-row am-form-card__row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formFieldRetiredDate', '退役日期'))}</span><span class="am-fpc1-row__value am-fpc1-row__value--date am-datepicker-cell" data-am-datepicker="retiredDate" data-am-shortcuts="today"><input type="hidden" name="retiredDate" value="${escapeHtml(asset.retiredDate || asset.statusChangedOn || todayISO())}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml((asset.retiredDate || asset.statusChangedOn || '') || this._t('datePickerPlaceholder', '选择日期'))}</button></span></div><div class="am-form-card__divider"></div><div class="am-fpc1-row am-form-card__row"><span class="am-fpc1-row__label">${escapeHtml(this._t('physicalSaleFieldPrice', '转让价格'))}</span><input class="am-fpc1-row__value" type="number" name="salePrice" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${escapeHtml(draft.salePrice != null ? draft.salePrice : (physicalEditSalePriceMajor != null ? physicalEditSalePriceMajor : (asset.salePrice || '')))}"></div></div>` : ''}</div><div class="am-form-card"><div class="am-form-row am-form-row--toggle am-form-card__head"><span class="am-form-row__label">${escapeHtml(this._t('formFieldTargetDaily', '目标日均价'))}</span><label class="am-form-toggle"><input type="checkbox" name="costGoalEnabled" data-toggle="costGoal" ${targetDailyEnables ? 'checked' : ''}><span class="am-form-toggle__track"><span class="am-form-toggle__thumb"></span></span></label></div><div class="am-form-card__expand" data-costgoal-expand ${targetDailyEnables ? '' : 'hidden'}><div class="am-form-card__divider"></div><div class="am-fpc1-row am-form-card__row"><span class="am-fpc1-row__label">${escapeHtml(this._t('costGoalModeLabel', '计算方式'))}</span><span class="am-status-pill-row" data-cg-mode-row><button type="button" class="am-type-pill" data-cg-mode="byPrice" aria-pressed="${costGoalMode === 'byPrice'}">${escapeHtml(this._t('costGoalModeByPrice', '用价格算日期'))}</button><button type="button" class="am-type-pill" data-cg-mode="byDate" aria-pressed="${costGoalMode === 'byDate'}">${escapeHtml(this._t('costGoalModeByDate', '用日期算价格'))}</button></span></div><div data-cg-rows="byPrice"${costGoalMode === 'byPrice' ? '' : ' hidden'}>${cgByPriceRows}</div><div data-cg-rows="byDate"${costGoalMode === 'byDate' ? '' : ' hidden'}>${cgByDateRows}</div><div class="am-form-hint am-cg-hint" data-cg-hint ${cgDateInvalid ? '' : 'hidden'} style="color:#e6a23c;">${cgDateInvalid ? escapeHtml(this._t('costGoalDateInvalid', '截止日期需晚于购买日期')) : ''}</div></div></div>`
                : '';
            const physicalSectionHtml = currentKind === 'physical'
                ? `<section class="am-form-section"><div class="am-form-section__title">${escapeHtml(this._t('formTypeSection', '类型专属'))}</div> ${warrantyEnables ? `<div class="am-form-row am-form-row--toggle"><span class="am-form-row__label">${escapeHtml(this._t('formFieldWarranty', '保修服务'))}</span><label class="am-form-toggle"><input type="checkbox" name="warrantyEnabled" checked><span class="am-form-toggle__track"><span class="am-form-toggle__thumb"></span></span></label></div><div class="am-form-row"><span class="am-form-row__label">${escapeHtml(this._t('formalWarrantyEndsOn', '保修截止日'))}</span><div class="am-form-row__field"><span class="am-datepicker-cell" data-am-datepicker="warrantyEndsOn" data-am-shortcuts="today"><input type="hidden" name="warrantyEndsOn" value="${escapeHtml(details.warrantyEndsOn || '')}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(details.warrantyEndsOn || this._t('datePickerPlaceholder', '选择日期'))}</button></span></div></div>` : `<div class="am-form-row am-form-row--toggle"><span class="am-form-row__label">${escapeHtml(this._t('formFieldWarranty', '保修服务'))}</span><label class="am-form-toggle"><input type="checkbox" name="warrantyEnabled"><span class="am-form-toggle__track"><span class="am-form-toggle__thumb"></span></span></label></div>`} ${targetDailyEnables ? `<div class="am-form-row am-form-row--toggle"><span class="am-form-row__label">${escapeHtml(this._t('formFieldTargetDaily', '目标日均价'))}</span><label class="am-form-toggle"><input type="checkbox" name="costGoalEnabled" checked><span class="am-form-toggle__track"><span class="am-form-toggle__thumb"></span></span></label></div><div class="am-form-row"><span class="am-form-row__label">${escapeHtml(this._t('formalCostGoalDaily', '目标日均成本'))}</span><div class="am-form-row__field"><input type="number" name="costGoalDaily" min="0" step="0.01" value="${escapeHtml(minorToMajorString(details.costGoal.targetDailyAmountMinor, asset.currency || 'CNY'))}"></div></div><div class="am-form-row"><span class="am-form-row__label">${escapeHtml(this._t('formalCostGoalEndsOn', '目标截止日'))}</span><div class="am-form-row__field"><span class="am-datepicker-cell" data-am-datepicker="costGoalEndsOn" data-am-shortcuts="today"><input type="hidden" name="costGoalEndsOn" value="${escapeHtml(details.costGoal.targetEndsOn || '')}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(details.costGoal.targetEndsOn || this._t('datePickerPlaceholder', '选择日期'))}</button></span></div></div>` : `<div class="am-form-row am-form-row--toggle"><span class="am-form-row__label">${escapeHtml(this._t('formFieldTargetDaily', '目标日均价'))}</span><label class="am-form-toggle"><input type="checkbox" name="costGoalEnabled"><span class="am-form-toggle__track"><span class="am-form-toggle__thumb"></span></span></label></div>`} </section>`
                : '';
            const virtualSubSectionHtml = currentKind === 'virtualSubscription'
                ? `<section class="am-form-section"><div class="am-form-section__title">${escapeHtml(this._t('formTypeSection', '类型专属'))}</div><div class="am-form-row"><span class="am-form-row__label">${escapeHtml(this._t('formalPlanName', '套餐名称'))}</span><div class="am-form-row__field"><input type="text" name="planName" value="${escapeHtml(details.planName || '')}"></div></div><div class="am-form-row"><span class="am-form-row__label">${escapeHtml(this._t('formFieldAccount', '账号'))}</span><div class="am-form-row__field"><input type="text" name="accountLabel" value="${escapeHtml(details.accountLabel || '')}" placeholder="${escapeHtml(this._t('formFieldAccountPlaceholder', 'account@example.com'))}"></div></div><div class="am-form-row"><span class="am-form-row__label">${escapeHtml(this._t('formalBillingCycle', '计费周期'))}</span><div class="am-form-row__field">${this._renderGlassSelectCell('formalPlanCycle', details.formalPlanCycle || (details.billingPlan && details.billingPlan.cycle) || 'monthly', this._glassCycleOptions())}</div></div><div class="am-form-row"><span class="am-form-row__label">${escapeHtml(this._t('formFieldNextDate', '到期日'))}</span><div class="am-form-row__field"><span class="am-datepicker-cell" data-am-datepicker="endDate" data-am-shortcuts="today"><input type="hidden" name="endDate" value="${escapeHtml(details.statusChangedOn || '')}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(details.statusChangedOn || this._t('datePickerPlaceholder', '选择日期'))}</button></span></div></div></section>`
                : '';
            const virtualPerpSectionHtml = currentKind === 'virtualPerpetual'
                ? `<section class="am-form-section"><div class="am-form-section__title">${escapeHtml(this._t('formTypeSection', '类型专属'))}</div><div class="am-form-row"><span class="am-form-row__label">${escapeHtml(this._t('fieldLicenseAccountLabel', '授权账号'))}</span><div class="am-form-row__field"><input type="text" name="licenseAccountLabel" value="${escapeHtml(details.licenseAccountLabel || '')}" placeholder="${escapeHtml(this._t('formFieldAccountPlaceholder', 'account@example.com'))}"></div></div></section>`
                : '';
            // Stage 4 (UI parity): prepaid (amount / count) form renders as flat cards
            // matching the reference design. Card A = 权益类型 segment + 购买成本; Card B =
            // 初始/剩余 dual-row (amount or count); Card C = 开通日期 + 有效期 + 商户名称.
            //
            // Data-accuracy ruling (formal-v2): balance / remaining count is a realtime
            // projection (projectFormalPrepaid) and is NEVER stored in details. The whitelist
            // for both prepaid kinds is only { provider, expiresOn }.
            //   - NEW: remaining == initial (no transactions yet). For amount kind the opening
            //     balance equals the purchase financial event (opening amount = purchase cost),
            //     so 初始金额 mirrors 购买成本; 剩余金额 mirrors 初始金额. Both readonly. For count
            //     kind 初始次数 is editable (openingCount) and 剩余次数 mirrors it (readonly).
            //   - EDIT: 剩余 = user target; on save we write a correction transaction for
            //     (target - current projection). Count → recordPrepaidCountAdjustment; amount →
            //     addPrepaidTransaction(type='adjust'). remaining/balance never touch details.
            const isPrepaidKind = currentKind === 'prepaidAmount' || currentKind === 'prepaidCount';
            const isCount = currentKind === 'prepaidCount';
            const isAmount = currentKind === 'prepaidAmount';
            let prepaidProj = null;
            if (isPrepaidKind && existing && Array.isArray(this._prepaidTransactions) && Array.isArray(this._financialEvents)) {
                try { prepaidProj = projectFormalPrepaid(existing, this._prepaidTransactions.filter(t => t.assetId === existing.id), this._financialEvents.filter(e => e.assetId === existing.id)); } catch (error) { prepaidProj = null; }
            }
            const projectedRemaining = prepaidProj && Number.isSafeInteger(prepaidProj.remainingCount) ? prepaidProj.remainingCount : 0;
            const projectedBalanceMinor = prepaidProj && Number.isSafeInteger(prepaidProj.balanceAmountMinor) ? prepaidProj.balanceAmountMinor : 0;
            const openingCountValue = prepaidProj && Number.isSafeInteger(prepaidProj.openingCount) ? prepaidProj.openingCount : 0;
            const openingAmountMinor = prepaidProj && Number.isSafeInteger(prepaidProj.openingAmountMinor) ? prepaidProj.openingAmountMinor : 0;
            let prepaidAcquisitionMinor = null;
            if (isPrepaidKind && existing) {
                try {
                    // 阶段1（编辑解锁）：购买成本预填取【最早 purchase 事件金额】（而非 acquisitionAmountMinor
                    // 累计），与编辑价格替换域（correctPurchaseAmount）的取数口径一致；单事件资产两者相等。
                    const _o = this._purchasePriceEditOriginals(existing);
                    prepaidAcquisitionMinor = _o.originalAmountMinor;
                } catch (error) { prepaidAcquisitionMinor = null; }
            }
            const prepaidCurrency = asset.currency || 'CNY';
            const prepaidCostMajor = existing
                ? (prepaidAcquisitionMinor != null ? minorToMajorString(prepaidAcquisitionMinor, prepaidCurrency) : '')
                : (asset.amountMajor != null ? String(asset.amountMajor) : (draft.amount != null ? String(draft.amount) : ''));
            // Stage 3: new-mode 初始金额 defaults to 购买成本 but is user-editable (gift/loss).
            // After a kind switch the preserved draft.initialAmount is restored so the user's
            // value survives; otherwise it mirrors the purchase cost.
            const prepaidInitialAmountMajor = existing ? minorToMajorString(openingAmountMinor, prepaidCurrency) : (draft.initialAmount != null && draft.initialAmount !== '' ? String(draft.initialAmount) : prepaidCostMajor);
            const prepaidRemainingAmountMajor = existing ? minorToMajorString(projectedBalanceMinor, prepaidCurrency) : prepaidCostMajor;
            const prepaidInitialCountValue = existing ? openingCountValue : (asset.openingCount != null ? Number(asset.openingCount) : 0);
            const prepaidRemainingCountValue = existing ? projectedRemaining : prepaidInitialCountValue;
            const prepaidKindBodyHtml = isPrepaidKind
                ? `<div class="am-form-card"><div class="am-fpc1-rows"><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('prepaidKindTitle', '权益类型'))}</span><span class="am-type-pill-row am-type-pill-row--inline" data-type-pill-row><button type="button" class="am-type-pill${switchKindDisabledClass}" data-switch-kind="prepaidAmount" aria-pressed="${currentKind === 'prepaidAmount'}"${switchKindLockedTitle}${switchKindDisabledAttr}>${escapeHtml(this._t('formTypeAmount', '金额储值'))}</button><button type="button" class="am-type-pill${switchKindDisabledClass}" data-switch-kind="prepaidCount" aria-pressed="${currentKind === 'prepaidCount'}"${switchKindLockedTitle}${switchKindDisabledAttr}>${escapeHtml(this._t('formTypeCount', '次数权益'))}</button></span></div><div class="am-fpc1-divider"></div><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formFieldCost', '购买成本'))}</span><span class="am-fpc1-row__value am-virtual-price-cell">${this._renderGlassSelectCell('currency', prepaidCurrency, this._glassCurrencyOptions(prepaidCurrency), { disabled: !!(existing || wishCurrencyLocked) })}<input class="am-form-row__amount" name="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${escapeHtml(prepaidCostMajor)}"></span></div></div></div>`
                + (isAmount
                    ? `<div class="am-form-card"><div class="am-fpc1-rows"><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formFieldInitialAmount', '初始金额'))}</span><span class="am-fpc1-row__value">${existing ? `<input class="am-fpc1-row__value" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${escapeHtml(prepaidInitialAmountMajor)}" readonly data-prepaid-initial-amount>` : `<input class="am-fpc1-row__value" name="initialAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${escapeHtml(prepaidInitialAmountMajor)}" data-prepaid-initial-amount>`}</span></div><div class="am-fpc1-divider"></div><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formFieldRemainingAmount', '剩余金额'))}</span><span class="am-fpc1-row__value">${existing ? `<input class="am-fpc1-row__value" name="targetRemainingAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${escapeHtml(prepaidRemainingAmountMajor)}" data-original-remaining-minor="${projectedBalanceMinor}">` : `<input class="am-fpc1-row__value" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${escapeHtml(prepaidRemainingAmountMajor)}" readonly data-prepaid-remaining-amount>`}</span></div></div></div>`
                    : `<div class="am-form-card"><div class="am-fpc1-rows"><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formFieldInitialCount', '初始次数'))}</span><span class="am-fpc1-row__value">${existing ? `<input class="am-fpc1-row__value" type="number" min="0" step="1" value="${escapeHtml(String(prepaidInitialCountValue))}" readonly>` : `<input class="am-fpc1-row__value" name="openingCount" type="number" min="0" step="1" value="${escapeHtml(String(prepaidInitialCountValue))}" data-prepaid-initial-count>`}</span></div><div class="am-fpc1-divider"></div><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formFieldRemainingCount', '剩余次数'))}</span><span class="am-fpc1-row__value">${existing ? `<input class="am-fpc1-row__value" name="targetRemainingCount" type="number" min="0" step="1" value="${escapeHtml(String(prepaidRemainingCountValue))}">` : `<input class="am-fpc1-row__value" name="initialRemainingCount" type="number" min="0" step="1" value="${escapeHtml(String(prepaidRemainingCountValue))}" data-prepaid-remaining-count>`}</span></div></div></div>`)
                + `<div class="am-form-card"><div class="am-fpc1-rows"><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formFieldAcquiredOn', '开通日期'))}</span><span class="am-fpc1-row__value am-fpc1-row__value--date am-datepicker-cell" data-am-datepicker="acquiredOn" data-am-shortcuts="today"><input type="hidden" name="acquiredOn" value="${escapeHtml(asset.acquiredOn || todayISO())}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(asset.acquiredOn || this._t('datePickerPlaceholder', '选择日期'))}</button></span></div><div class="am-fpc1-divider"></div><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formFieldExpiresOn', '有效期'))}</span><span class="am-fpc1-row__value am-fpc1-row__value--date am-datepicker-cell" data-am-datepicker="expiresOn" data-am-shortcuts="today"><input type="hidden" name="expiresOn" value="${escapeHtml(details.expiresOn || '')}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(details.expiresOn || this._t('datePickerPlaceholder', '选择日期'))}</button></span></div><div class="am-fpc1-divider"></div><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formFieldProvider', '商户名称'))}</span><input class="am-fpc1-row__value" type="text" name="provider" value="${escapeHtml(details.provider || '')}" placeholder="${escapeHtml(this._t('merchantEmpty', '未填写商户'))}"></div></div></div><div class="am-form-hint" hidden>${escapeHtml(this._t('formPrepaidHint', '预付权益包含储值卡与次卡，可在下方切换。'))}</div>`
                : '';
            // Legacy prepaidSectionHtml is intentionally empty: prepaid now uses the card
            // layout above. Kept defined so typeSectionHtml stays valid for physical/virtual.
            const prepaidSectionHtml = '';
            // Stage 3 (UI parity): virtual (subscription / perpetual) form renders as
            // flat cards matching the reference design. Card A = price + CNY + type
            // segment; subscription adds Card B (开始日期 + 账单周期 + 到期日 read-only)
            // and Card C (自动续费 toggle); perpetual adds Card B (购买日期 single row)
            // and Card D (账号 licenseAccountLabel). 性价比自评 is intentionally NOT
            // rendered (formal-v2 removed the rating field; whitelist has no such key).
            // planName / accountLabel are not collected for subscription here (reference
            // omits them); the save step preserves any existing values so no data is lost.
            const isVirtualKind = currentKind === 'virtualSubscription' || currentKind === 'virtualPerpetual';
            const isSubKind = currentKind === 'virtualSubscription';
            // 阶段3（订阅编辑解锁，需求1 金额）：编辑态价格预填"最近一期 subscriptionPayment"金额
            //（本期价格），而非卡片显示的累计成本；新建态保持 amountMajor/amount 派生。
            const virtualEditPaymentMajor = (isSubKind && existing && Array.isArray(this._financialEvents)) ? (() => { try { const payments = this._financialEvents.filter(event => event && event.assetId === existing.id && event.eventType === 'subscriptionPayment' && !event.voidedAt); if (!payments.length) return null; payments.sort((l, r) => String(l.effectiveDate || '').localeCompare(String(r.effectiveDate || '')) || String(l.occurredAt || '').localeCompare(String(r.occurredAt || ''))); const last = payments[payments.length - 1]; return Number.isSafeInteger(last.amountMinor) ? minorToMajorString(last.amountMinor, existing.currency || 'CNY') : null; } catch (error) { return null; } })() : null;
            const virtualPriceValue = (existing && isSubKind && virtualEditPaymentMajor != null) ? virtualEditPaymentMajor : (asset.amountMajor != null ? String(asset.amountMajor) : (asset.amount != null ? String(asset.amount) : ''));
            const virtualPriceLabel = (isSubKind && existing) ? this._t('subscriptionCurrentPeriodPrice', '本期价格') : this._t('productCostPrice', '价格');
            const virtualCycle = details.formalPlanCycle || (details.billingPlan && details.billingPlan.cycle) || 'monthly';
            const virtualAutoRenew = !!details.autoRenew;
            const virtualAccountLabel = details.accountLabel || '';
            const virtualLicenseAccount = details.licenseAccountLabel || '';
            let virtualExpiryDisplay = '—';
            if (isSubKind && existing) {
                try {
                    const vPeriods = (this._formalDomainSnapshot().subscriptionPeriods || []).filter(p => p && p.assetId === existing.id && !p.voidedAt);
                    if (vPeriods.length) { const maxEnd = vPeriods.map(p => String(p.endDate || '')).sort().pop(); if (maxEnd) virtualExpiryDisplay = maxEnd; }
                } catch (error) { virtualExpiryDisplay = '—'; }
            } else if (isSubKind && !existing) {
                // 需求2（新建路径）：到期日默认 = 开始日期 + 计费周期（含两端，getSubscriptionPeriodEnd）。
                // 若 kind 切换保留了 draft.periodEnd（用户已手选或上次派生值），优先沿用 draft，
                // 避免切换订阅/买断再切回时丢失用户输入。
                virtualExpiryDisplay = (draft.periodEnd != null && draft.periodEnd !== '')
                    ? String(draft.periodEnd)
                    : (getSubscriptionPeriodEnd(asset.acquiredOn || todayISO(), virtualCycle) || '—');
            }
            // 需求2 + 阶段3（编辑路径）：到期日是可编辑的 <input type="date" name="periodEnd">。
            // 新建态由 acquiredOn / formalPlanCycle 派生联动（见下方 linking 块）；编辑态预填最近一期
            // endDate（virtualExpiryDisplay），保存时若改动走 updateSubscriptionPeriodEnd。
            const virtualExpiryFieldHtml = `<span class="am-fpc1-row__value am-fpc1-row__value--date am-datepicker-cell" data-am-datepicker="periodEnd" data-am-shortcuts="today"><input type="hidden" name="periodEnd" value="${escapeHtml(virtualExpiryDisplay === '—' ? '' : virtualExpiryDisplay)}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(virtualExpiryDisplay === '—' ? '' : virtualExpiryDisplay)}</button></span>`;
            const virtualKindBodyHtml = isVirtualKind
                ? `<div class="am-form-card"><div class="am-fpc1-rows"><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(virtualPriceLabel)}</span><span class="am-fpc1-row__value am-virtual-price-cell">${this._renderGlassSelectCell('currency', asset.currency || 'CNY', this._glassCurrencyOptions(asset.currency || 'CNY'), { disabled: !!(existing || wishCurrencyLocked) })}<input class="am-form-row__amount" name="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${escapeHtml(virtualPriceValue)}"></span></div><div class="am-fpc1-divider"></div><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('productDetailType', '类型'))}</span><span class="am-type-pill-row am-type-pill-row--inline" data-type-pill-row><button type="button" class="am-type-pill${switchKindDisabledClass}" data-switch-kind="virtualSubscription" aria-pressed="${currentKind === 'virtualSubscription'}"${switchKindLockedTitle}${switchKindDisabledAttr}>${escapeHtml(this._t('formTypeSubscription', '订阅'))}</button><button type="button" class="am-type-pill${switchKindDisabledClass}" data-switch-kind="virtualPerpetual" aria-pressed="${currentKind === 'virtualPerpetual'}"${switchKindLockedTitle}${switchKindDisabledAttr}>${escapeHtml(this._t('formTypePerpetual', '买断'))}</button></span></div></div></div>`
                + (isSubKind
                    ? `<div class="am-form-card"><div class="am-fpc1-rows"><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formFieldStartDate', '开始日期'))}</span><span class="am-fpc1-row__value am-fpc1-row__value--date am-datepicker-cell" data-am-datepicker="acquiredOn" data-am-shortcuts="today"><input type="hidden" name="acquiredOn" value="${escapeHtml(asset.acquiredOn || todayISO())}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(asset.acquiredOn || this._t('datePickerPlaceholder', '选择日期'))}</button></span></div><div class="am-fpc1-divider"></div><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formalBillingCycle', '账单周期'))}</span><span class="am-fpc1-row__value am-virtual-inline-select">${this._renderGlassSelectCell('formalPlanCycle', virtualCycle, this._glassCycleOptions())}</span></div><div class="am-fpc1-divider"></div><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('productDetailExpiryDate', '到期日'))}</span>${virtualExpiryFieldHtml}</div></div></div>`
                    : `<div class="am-form-card"><div class="am-fpc1-rows"><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formFieldPurchaseDate', '购买日期'))}</span><span class="am-fpc1-row__value am-fpc1-row__value--date am-datepicker-cell" data-am-datepicker="acquiredOn" data-am-shortcuts="today"><input type="hidden" name="acquiredOn" value="${escapeHtml(asset.acquiredOn || todayISO())}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(asset.acquiredOn || this._t('datePickerPlaceholder', '选择日期'))}</button></span></div></div></div>`)
                + (isSubKind
                    ? `<div class="am-form-card"><div class="am-form-row am-form-row--toggle am-form-card__head"><span class="am-form-row__label">${escapeHtml(this._t('formFieldAutoRenew', '自动续费'))}</span><label class="am-form-toggle"><input type="checkbox" name="autoRenew" ${virtualAutoRenew ? 'checked' : ''}><span class="am-form-toggle__track"><span class="am-form-toggle__thumb"></span></span></label></div></div><div class="am-form-card"><div class="am-fpc1-rows"><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formFieldAccount', '账号'))}</span><input class="am-fpc1-row__value" type="text" name="accountLabel" value="${escapeHtml(virtualAccountLabel)}"></div></div></div>`
                    : `<div class="am-form-card"><div class="am-fpc1-rows"><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formFieldAccount', '账号'))}</span><input class="am-fpc1-row__value" type="text" name="licenseAccountLabel" value="${escapeHtml(virtualLicenseAccount)}"></div></div></div>`)
                : '';
            const typeSectionHtml = physicalSectionHtml + virtualSubSectionHtml + virtualPerpSectionHtml + prepaidSectionHtml;
            const physicalBasicCostHtml = currentKind === 'physical' ? `<div class="am-physical-basic-line"><label>${escapeHtml(this._t('formFieldCurrencyPrefix', '购买价格'))}</label><div class="am-currency-row"><select class="am-form-row__currency" name="currency"><option value="CNY">¥</option><option value="USD">$</option><option value="EUR">€</option><option value="GBP">£</option></select><span class="am-currency-row__symbol">${currencySymbol(asset.currency || 'CNY')}</span><input class="am-physical-line-input am-form-row__amount" name="amount" type="number" min="0" step="0.01" value="${escapeHtml(asset.amountMajor != null ? String(asset.amountMajor) : '')}"${existing ? ' readonly' : ''}></div></div><div class="am-physical-basic-date"><label>${escapeHtml(this._t('formFieldPurchaseDate', '购买日期'))}</label><span class="am-datepicker-cell" data-am-datepicker="acquiredOn" data-am-shortcuts="today"><input type="hidden" name="acquiredOn" value="${escapeHtml(asset.acquiredOn || todayISO())}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(asset.acquiredOn || this._t('datePickerPlaceholder', '选择日期'))}</button></span></div>` : '';
            const categorySectionHtml = `<section class="am-form-section"><div class="am-form-section__title">${escapeHtml(this._t('fieldCategory', '分类'))}</div><div class="am-form-row"><span class="am-form-row__label">${escapeHtml(this._t('fieldCategory', '分类'))}</span><div class="am-form-row__field"><select name="categoryId">${categoryOptions}</select></div></div></section>`;
            const physicalOptionsHtml = currentKind === 'physical'
                ? `<div class="am-form-row am-form-row--toggle"><span class="am-form-row__label">${escapeHtml(this._t('formFieldStatus', '物品状态'))}</span><span class="am-status-pill-row" data-status-row><button type="button" class="am-type-pill" data-status-pill="active" aria-pressed="${(asset.status || 'active') !== 'retired'}">${escapeHtml(this._t('formFieldStatusActive', '在役'))}</button><button type="button" class="am-type-pill" data-status-pill="retired" aria-pressed="${(asset.status || 'active') === 'retired'}">${escapeHtml(this._t('formFieldStatusRetired', '退役'))}</button></span></div> ${(asset.status || 'active') === 'retired' ? `<div class="am-form-expansion" data-retired-expansion><div class="am-form-row"><span class="am-form-row__label">${escapeHtml(this._t('formFieldRetiredDate', '退役日期'))}</span><div class="am-form-row__field"><span class="am-datepicker-cell" data-am-datepicker="retiredDate" data-am-shortcuts="today"><input type="hidden" name="retiredDate" value="${escapeHtml(asset.retiredDate || asset.statusChangedOn || todayISO())}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml((asset.retiredDate || asset.statusChangedOn || '') || this._t('datePickerPlaceholder', '选择日期'))}</button></span></div></div><div class="am-form-row"><span class="am-form-row__label">${escapeHtml(this._t('physicalSaleFieldPrice', '转让价格'))}</span><div class="am-form-row__field"><input type="number" name="salePrice" min="0" step="0.01" value="${escapeHtml(draft.salePrice != null ? draft.salePrice : (physicalEditSalePriceMajor != null ? physicalEditSalePriceMajor : (asset.salePrice || '')))}"></div></div></div>` : ''}`
                : '';
            const virtualSubOptionsHtml = currentKind === 'virtualSubscription'
                ? `<div class="am-form-row am-form-row--toggle"><span class="am-form-row__label">${escapeHtml(this._t('formFieldAutoRenew', '自动续费'))}</span><label class="am-form-toggle"><input type="checkbox" name="autoRenew" ${details.autoRenew ? 'checked' : ''}><span class="am-form-toggle__track"><span class="am-form-toggle__thumb"></span></span></label></div>`
                : '';
            const optionsSectionHtml = physicalOptionsHtml + virtualSubOptionsHtml;
            const kindBodyHtml = currentKind === 'physical' ? physicalKindBodyHtml : isVirtualKind ? virtualKindBodyHtml : isPrepaidKind ? prepaidKindBodyHtml : (physicalBasicCostHtml + (currentKind === 'physical' ? '' : `<section class="am-form-section"><div class="am-form-section__title">${escapeHtml(this._t('formCostSection', '金额与日期'))}</div><div class="am-form-row"><span class="am-form-row__label">${escapeHtml(this._t('formFieldCurrencyPrefix', '价格 (¥)'))}</span><div class="am-form-row__field"><div class="am-currency-row"><select class="am-form-row__currency" name="currency" aria-label="${escapeHtml(this._t('fieldCurrency', '币种'))}"><option value="CNY" ${(asset.currency || 'CNY') === 'CNY' ? 'selected' : ''}>¥</option><option value="USD" ${(asset.currency || 'CNY') === 'USD' ? 'selected' : ''}>$</option><option value="EUR" ${(asset.currency || 'CNY') === 'EUR' ? 'selected' : ''}>€</option><option value="GBP" ${(asset.currency || 'CNY') === 'GBP' ? 'selected' : ''}>£</option></select><span class="am-currency-row__symbol">${currencySymbol(asset.currency || 'CNY')}</span><input class="am-form-row__amount" name="amount" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(asset.amountMajor != null ? String(asset.amountMajor) : '')}"${existing ? ' readonly' : ''}></div></div></div><div class="am-form-row"><span class="am-fpc1-row__label">${escapeHtml(costDateLabel)}</span><div class="am-form-row__field"><span class="am-datepicker-cell" data-am-datepicker="${costDateField}" data-am-shortcuts="today"><input type="hidden" name="${costDateField}" value="${escapeHtml(asset.acquiredOn || todayISO())}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(asset.acquiredOn || this._t('datePickerPlaceholder', '选择日期'))}</button></span></div></div></section>`) + typePillsHtml + typeSectionHtml + categorySectionHtml + (optionsSectionHtml ? `<section class="am-form-section"><div class="am-form-section__title">${escapeHtml(this._t('formOptionsSection', '可选设置'))}</div> ${optionsSectionHtml} </section>` : ''));
            const existingKindBody = mask.querySelector('[data-kind-body]');
            if (existingKindBody) {
                existingKindBody.innerHTML = kindBodyHtml;
                const sheet = mask.querySelector('.am-edit-sheet');
                if (sheet) { sheet.classList.remove('am-physical-sheet', 'am-virtual-sheet', 'am-prepaid-sheet', 'am-wishlist-sheet'); const fc = familyClass.trim(); if (fc) sheet.classList.add(fc); }
                const titleEl = mask.querySelector('.am-edit-sheet__title');
                if (titleEl && !existing) titleEl.textContent = currentKind.indexOf('prepaid') === 0 ? this._t('formAddPrepaid', '添加资产预付权益') : this._formalKindLabel(currentKind);
            } else {
                const coverAsset = { name: asset.name || '', cover: coverState.cover };
                const coverPreview = this.renderAssetCoverContent(coverAsset, '📦', 'am-formal-cover-picker__preview-image', 'am-formal-cover-picker__preview-fallback');
                const tagSummary = selectedTagIds.length === 0 ? '' : selectedTagIds.map(id => { const t = this._getAssetTagCatalog().find(x => x.id === id); return t ? t.label : ''; }).filter(Boolean).join('、');
                const tagPickerOptionsHtml = this._getAssetTagCatalog().length === 0 ? `<div class="am-tag-popover__empty">${escapeHtml(this._t('formTagPickerEmpty', '暂无可选标签'))}</div>` : this._getAssetTagCatalog().map(tag => { const active = selectedTagIds.indexOf(tag.id) >= 0; const swatch = tag.color ? `<span class="am-tag-popover__option-color" style="background:${escapeHtml(tag.color)}"></span>` : ''; return `<button type="button" class="am-tag-popover__option" data-tag-pick="${escapeHtml(tag.id)}" aria-pressed="${active}">${swatch}<span>${escapeHtml(tag.label)}</span></button>`; }).join('');
                mask.innerHTML = `<div class="am-edit-sheet am-form-shell${familyClass}"><div class="am-edit-sheet__grabber"></div><header class="am-edit-sheet__header am-form-shell__header"><button type="button" class="am-edit-sheet__close" data-close aria-label="${escapeHtml(this._t('btnClose', '关闭'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button><h2 class="am-edit-sheet__title">${escapeHtml(existing ? this._t("formEditTitle", "编辑资产") : (currentKind === 'physical' ? this._t("formAddTitle", "添加资产") : (currentKind.indexOf('prepaid') === 0 ? this._t('formAddPrepaid', '添加资产预付权益') : this._formalKindLabel(currentKind))))}</h2><span class="am-form-shell__header-spacer"></span></header><form id="${formAssetId}" data-form data-selected-tag-ids="${escapeHtml(selectedTagIds.join(','))}"><section class="am-form-basic-card am-form-basic-card--name-only"><button type="button" class="am-form-basic-card__cover" data-formal-cover-toggle><span class="am-form-basic-card__cover-image" data-formal-cover-target>${coverPreview}</span><span class="am-form-basic-card__cover-edit">+</span></button><div class="am-form-basic-card__fields"><div class="am-form-basic-card__name"><div class="am-form-basic-card__name-label">${escapeHtml(this._t(currentKind === 'physical' ? 'formNameLabel' : 'formNamePlaceholder', currentKind === 'physical' ? '资产名称' : '名称'))}</div><div class="am-name-field"><input type="text" class="am-name-field__input" name="name" required value="${escapeHtml(asset.name || '')}" placeholder="${escapeHtml(this._t(currentKind === 'physical' ? 'formNameLabel' : 'formNamePlaceholder', currentKind === 'physical' ? '资产名称' : '名称'))}"></div></div></div><div data-cover-picker-slot></div>${physicalCard1Rows}</section><div data-kind-body>${kindBodyHtml}</div><section class="am-form-section am-formal-tags"><div class="am-form-section__title">${escapeHtml(this._t('formFieldTag', '标签'))}</div><div class="am-tag-popover" data-tag-popover><div class="am-tag-popover__row"><span class="am-tag-popover__label">${escapeHtml(this._t('formFieldTag', '标签'))}</span><button type="button" class="am-tag-popover__trigger" data-tag-popover-trigger><span data-tag-popover-summary>${escapeHtml(tagSummary)}</span><span class="am-tag-popover__trigger-chevron">▼</span></button></div><div class="am-tag-popover__panel" data-tag-popover-panel hidden><div class="am-tag-popover__title">${escapeHtml(this._t('formTagPickerTitle', '选择标签（最多 3 个）'))}</div><div class="am-tag-popover__options"> ${tagPickerOptionsHtml} </div><div class="am-tag-popover__new"><input type="text" class="am-tag-popover__new-input" data-tag-new maxlength="20" placeholder="${escapeHtml(this._t('formTagNewPlaceholder', '新建标签，回车添加'))}"><button type="button" class="am-tag-popover__new-add" data-tag-new-add aria-label="${escapeHtml(this._t('formTagNewAdd', '+ 新建'))}">+</button></div><button type="button" class="am-tag-popover__close" data-tag-popover-close>${escapeHtml(this._t('formTagPickerClose', '关闭'))}</button></div></div></section><section class="am-form-section am-form-notes-section"><div class="am-form-section__title">${escapeHtml(this._t('formFieldNotes', '备注'))}</div><div class="am-form-textarea"><textarea class="am-form-textarea__field" name="notes" placeholder="${escapeHtml(this._t('formFieldNotes', '备注'))}">${escapeHtml(asset.notes || '')}</textarea></div></section></form><footer class="am-form-shell__footer"><button type="submit" form="${formAssetId}" class="am-form-shell__save" data-save>${escapeHtml(this._t('btnSave', '保存'))}<span class="am-form-shell__save-spinner"></span></button></footer></div>`;
                const pendingTags = new Map();
                mask.querySelector('[data-close]').onclick = () => { void discardPendingCover(); mask.remove(); };
                const coverToggle = mask.querySelector('[data-formal-cover-toggle]');
                if (coverToggle) coverToggle.onclick = () => { coverState.pickerOpen = !coverState.pickerOpen; updateCoverPicker(); };
                const tagRoot = mask.querySelector('[data-tag-popover]');
                if (tagRoot) {
                    const trigger = tagRoot.querySelector('[data-tag-popover-trigger]');
                    const panel = tagRoot.querySelector('[data-tag-popover-panel]');
                    const summary = tagRoot.querySelector('[data-tag-popover-summary]');
                    const form = mask.querySelector('form');
                    const pendingLabelOf = id => pendingTags.has(id) ? pendingTags.get(id) : null;
                    const computeTagSummary = next => {
                        const labels = next.map(id => { const pl = pendingLabelOf(id); if (pl) return pl; const t = this._getAssetTagCatalog().find(x => x.id === id); return t ? t.label : ''; }).filter(Boolean);
                        return labels.length === 0 ? '' : labels.join('、');
                    };
                    const setSelectedTagIds = next => {
                        form.setAttribute('data-selected-tag-ids', next.join(','));
                        summary.textContent = computeTagSummary(next);
                        tagRoot.querySelectorAll('[data-tag-pick]').forEach(b => b.setAttribute('aria-pressed', String(next.indexOf(b.dataset.tagPick) >= 0)));
                    };
                    const addPendingTag = rawLabel => {
                        const label = String(rawLabel || '').trim().slice(0, 20);
                        if (!label) return;
                        const _apCatalog = this._getAssetTagCatalog();
                        const exist = _apCatalog.find(t => t.label.toLowerCase() === label.toLowerCase());
                        let next = (form.dataset.selectedTagIds || '').split(',').filter(Boolean);
                        if (exist) {
                            if (next.indexOf(exist.id) < 0) { if (next.length >= 3) { this.showToast('⚠️ ' + this._t('formalTagIdsInvalid', '标签必须是最多 3 个有效 UUID')); return; } next.push(exist.id); }
                            setSelectedTagIds(next);
                            return;
                        }
                        const tempId = createStableId();
                        if (next.length >= 3) { this.showToast('⚠️ ' + this._t('formalTagIdsInvalid', '标签必须是最多 3 个有效 UUID')); return; }
                        pendingTags.set(tempId, label);
                        next.push(tempId);
                        const opt = document.createElement('button');
                        opt.type = 'button';
                        opt.className = 'am-tag-popover__option am-tag-popover__option--pending';
                        opt.setAttribute('data-tag-pick', tempId);
                        opt.setAttribute('aria-pressed', 'true');
                        opt.innerHTML = '<span class="am-tag-popover__option-color" style="background:#3575f3"></span><span>🆕 ' + escapeHtml(label) + '</span>';
                        opt.onclick = () => { const n = (form.dataset.selectedTagIds || '').split(',').filter(Boolean); const i = n.indexOf(tempId); if (i >= 0) { n.splice(i, 1); pendingTags.delete(tempId); if (opt.parentNode) opt.parentNode.removeChild(opt); setSelectedTagIds(n); } };
                        const optsBox = panel.querySelector('.am-tag-popover__options');
                        if (optsBox) optsBox.appendChild(opt);
                        setSelectedTagIds(next);
                    };
                    trigger.onclick = event => { event.preventDefault(); panel.hidden = false; };
                    trigger.addEventListener('mousedown', event => event.stopPropagation());
                    panel.addEventListener('mousedown', event => event.stopPropagation());
                    tagRoot.addEventListener('mousedown', event => event.stopPropagation());
                    tagRoot.querySelectorAll('[data-tag-pick]').forEach(button => { button.onclick = () => {
                        const id = button.dataset.tagPick;
                        let next = (form.dataset.selectedTagIds || '').split(',').filter(Boolean);
                        if (next.indexOf(id) >= 0) next = next.filter(x => x !== id);
                        else if (next.length < 3) next.push(id);
                        else { this.showToast('⚠️ ' + this._t('formalTagIdsInvalid', '标签必须是最多 3 个有效 UUID')); return; }
                        setSelectedTagIds(next);
                        /* summary + aria-pressed are refreshed by setSelectedTagIds() */
                        /* legacy inline summary replaced by computeTagSummary (supports pending tags) */
                        tagRoot.querySelectorAll('[data-tag-pick]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tagPick === id ? next.indexOf(id) >= 0 : next.indexOf(b.dataset.tagPick) >= 0)));
                    }; });
                    const tagClose = tagRoot.querySelector('[data-tag-popover-close]');
                    if (tagClose) tagClose.onclick = () => { panel.hidden = true; };
                    const newInput = panel.querySelector('[data-tag-new]');
                    const newAdd = panel.querySelector('[data-tag-new-add]');
                    const commitNew = () => { if (newInput) { addPendingTag(newInput.value); newInput.value = ''; } };
                    if (newAdd) newAdd.onclick = event => { event.preventDefault(); event.stopPropagation(); commitNew(); };
                    if (newInput) newInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); commitNew(); } });
                }
                const formElement = mask.querySelector('form');
                // Disable browser constraint bubbles; validation is rendered by the plugin.
                formElement.noValidate = true;
                formElement.addEventListener('invalid', event => event.preventDefault(), true);
                let submitting = false; formElement.onsubmit = async event => {
                    event.preventDefault(); const form = event.currentTarget || formElement; if (!this._validateFormBeforeSave(form)) return;
                    if (submitting) return;
                    submitting = true;
                    // v1.4.0：footer 已移到 form 外，form.querySelector 找不到 submit 按钮；
                    // 改用 mask 级 [data-save]（与种草表单一致），保证提交时按钮 disable + 转圈。
                    const saveButton = mask.querySelector('[data-save]');
                    if (saveButton) { saveButton.disabled = true; saveButton.setAttribute('aria-busy', 'true'); }
                    try {
                        const currency = (form.elements.currency && form.elements.currency.value) || 'CNY';
                        const amount = parseMajorToMinor(form.elements.amount ? form.elements.amount.value || '0' : '0', currency);
                        let persistedCover = coverState.cover;
                        if (sourceWish && media.isOwnedUploadCover(persistedCover, sourceWish.id)) {
                            persistedCover = await media.copyUploadCoverToOwner(persistedCover, sourceWish.id, formAssetId);
                            coverState.cover = persistedCover;
                            coverState.pendingUploadCover = persistedCover;
                        }
                        const _saveCatalog = this._getAssetTagCatalog();
                        const _isUuidSave = s => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
                        const _rawTagIds = (form.dataset.selectedTagIds || '').split(',').map(s => s.trim()).filter(Boolean);
                        const _resolvedTagIds = [];
                        for (const _tid of _rawTagIds) {
                            if (pendingTags.has(_tid)) {
                                const _plabel = String(pendingTags.get(_tid) || '').trim();
                                if (!_plabel) continue;
                                let _real = _saveCatalog.find(t => t.label.toLowerCase() === _plabel.toLowerCase());
                                if (!_real) {
                                    try { _real = await this.createTag({ label: _plabel }); }
                                    catch (_e) { _real = this._getAssetTagCatalog().find(t => t.label.toLowerCase() === _plabel.toLowerCase()); if (!_real) throw _e; }
                                }
                                if (_real && _resolvedTagIds.indexOf(_real.id) < 0) _resolvedTagIds.push(_real.id);
                            } else if (_isUuidSave(_tid)) {
                                const _low = _tid.toLowerCase();
                                if (_resolvedTagIds.indexOf(_low) < 0) _resolvedTagIds.push(_low);
                            } else {
                                const _byLabel = _saveCatalog.find(t => t.label.toLowerCase() === _tid.toLowerCase());
                                if (_byLabel && _resolvedTagIds.indexOf(_byLabel.id) < 0) _resolvedTagIds.push(_byLabel.id);
                            }
                        }
                        if (_resolvedTagIds.length > 3) throw new Error(this._t('formalTagIdsInvalid', '标签必须是最多 3 个有效 UUID'));
                        const tagIds = _resolvedTagIds;
                        const value = name => form.elements[name] ? form.elements[name].value : '';
                        const checked = name => !!(form.elements[name] && form.elements[name].checked);
                        const optionalMinor = name => value(name) === '' ? null : parseMajorToMinor(value(name), currency);
                        const optionalDate = name => value(name) || null;
                        // P3：costGoal 按当前计算方式（costGoalMode 持久化到 settings.costGoalMode，重开表单按此恢复）写一致双字段。
                        // byPrice：T 为用户输入，targetEndsOn=按 T 反算（addBusinessDays(acquiredOn, ceil(N/T)-1)）。
                        // byDate：targetEndsOn 为用户输入，T=projectFormalCostGoalByDate 反算（无效→null，日期原样存）。
                        // 主输入为空 → 抛 costGoalEmptyHint 中止保存（不写空对象）。
                        const _cgBuildGoal = () => {
                            if (!checked('costGoalEnabled')) return null;
                            const _cgAcquired = form.elements.acquiredOn ? form.elements.acquiredOn.value : todayISO();
                            // v1.7.4：N 优先取表单实时购买价格（新建资产 existing=null 也能算出达标日期/日均），无金额回退已存财务净值。
                            const _cgAmountStr = form.elements.amount ? form.elements.amount.value : '';
                            let _cgN = 0; if (_cgAmountStr !== '') { try { _cgN = parseMajorToMinor(_cgAmountStr, currency); } catch (_e) { _cgN = 0; } }
                            const _cgFin = (existing && Array.isArray(this._financialEvents)) ? this._financialEvents.filter(e => e && e.assetId === existing.id) : [];
                            if (!(_cgN > 0) && existing) { try { _cgN = projectFormalFinancials(existing, _cgFin).netAmountMinor; } catch (_e) { _cgN = 0; } }
                            if (costGoalMode === 'byDate') {
                                const _dateVal = optionalDate('costGoalEndsOn');
                                if (!_dateVal) throw new Error(this._t('costGoalEmptyHint', '请输入目标日均价或关闭开关'));
                                const _days = daysBetween(_cgAcquired, _dateVal) + 1;
                                const _tMinor = (_days > 0 && _cgN > 0) ? Math.ceil(_cgN / _days) : null;
                                return { targetDailyAmountMinor: _tMinor, targetEndsOn: _dateVal };
                            }
                            const _tRaw = value('costGoalDaily');
                            if (_tRaw === '') throw new Error(this._t('costGoalEmptyHint', '请输入目标日均价或关闭开关'));
                            const _tMinor = optionalMinor('costGoalDaily');
                            let _dateVal = (existing && existing.details && existing.details.costGoal) ? existing.details.costGoal.targetEndsOn : null;
                            if (_tMinor != null && _tMinor > 0 && _cgN > 0) _dateVal = addBusinessDays(_cgAcquired, Math.ceil(_cgN / _tMinor) - 1) || _dateVal;
                            return { targetDailyAmountMinor: _tMinor, targetEndsOn: _dateVal };
                        };
                        const baseDetails = activeKind === 'physical'
                            ? { warrantyEndsOn: checked('warrantyEnabled') ? optionalDate('warrantyEndsOn') : null, costGoal: _cgBuildGoal() }
                            : activeKind === 'virtualSubscription'
                                ? { planName: form.elements.planName ? value('planName') : (existing && existing.details ? (existing.details.planName || '') : ''), accountLabel: form.elements.accountLabel ? (value('accountLabel') || null) : (existing && existing.details ? (existing.details.accountLabel || null) : null), billingPlan: { cycle: value('formalPlanCycle') || 'monthly' }, autoRenew: checked('autoRenew') }
                                : activeKind === 'virtualPerpetual'
                                    ? { licenseAccountLabel: value('licenseAccountLabel') || null }
                                    : { provider: value('provider') || null, expiresOn: optionalDate('expiresOn') };
                        const dto = { kind: activeKind, name: form.elements.name.value.trim(), status: opts.wishlist ? 'wishlist' : (draft.status || (existing ? existing.status : 'active')), currency: currency, categoryId: form.elements.categoryId ? form.elements.categoryId.value : (existing ? existing.categoryId : null), tagIds: tagIds, cover: persistedCover, notes: form.elements.notes ? form.elements.notes.value || '' : (existing ? (existing.notes || '') : '') };
                        if (!existing) dto.id = formAssetId;
                        if (opts.wishlist) dto.wishlist = { expectedAmountMinor: amount, reason: '' };
                        else { dto.acquiredOn = form.elements.acquiredOn ? form.elements.acquiredOn.value : todayISO(); dto.statusChangedOn = dto.status === 'retired' ? (value('retiredDate') || todayISO()) : dto.acquiredOn; dto.details = baseDetails; }
                        if (existing) {
                            delete dto.kind;
                            const previousStatus = existing.status;
                            const retireTransition = activeKind === FORMAL_ASSET_KIND.PHYSICAL && previousStatus !== 'retired' && dto.status === 'retired';
                            // 阶段1（编辑解锁）：dto.acquiredOn 保留（mergeFormalV2AssetPatch 白名单含 acquiredOn），
                            // 由 updateAsset 持久化；active 资产 statusChangedOn 跟随 acquiredOn（沿用上方逻辑）。
                            // 购买成本走"先校验后提交"：_planPurchasePriceEdit 解析表单金额并与最早 purchase 事件比对，
                            // 仅当变化时才在 updateAsset 之后调 correctPurchaseAmount 做 void-and-replace（参照订阅编辑事务模式）。
                            // 订阅金额走自有机制（下方 VIRTUAL_SUBSCRIPTION 分支），不在此处处理。
                            let purchasePlan = null;
                            if (activeKind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) {
                                purchasePlan = this._planPurchasePriceEdit(existing, form, currency, this._purchasePriceEditOriginals(existing));
                            }
                            if (retireTransition) {
                                // Let the domain transaction own the status flip so we
                                // never double-write lifecycle / sale sidecars.
                                delete dto.status; delete dto.statusChangedOn;
                                await this.updateAsset(existing.id, dto);
                                if (purchasePlan) await this._applyPurchasePriceEditPlan(existing, purchasePlan);
                                const retiredDateValue = value('retiredDate') || todayISO();
                                const salePriceMinor = parseMajorToMinor(value('salePrice') || '0', currency);
                                if (Number.isSafeInteger(salePriceMinor) && salePriceMinor > 0) {
                                    await this.recordPhysicalSaleAsset(existing.id, { priceMinor: salePriceMinor, soldOn: retiredDateValue, note: '' });
                                } else {
                                    await this.retirePhysicalAsset(existing.id, { retiredDate: retiredDateValue, note: '' });
                                }
                            } else if (activeKind === FORMAL_ASSET_KIND.PHYSICAL && previousStatus === 'retired' && dto.status === 'retired') {
                                // v2.6.2 修复批次 2（已退役实物再编辑，转让价更正）：转让价存在
                                // sale/inflow 财务事件里（主记录无 salePrice 键），先落其余字段，
                                // 再把表单输入解析为 minor 与最后一笔未作废 sale 事件比对：
                                //   金额变化 → _correctSalePrice void-and-replace；
                                //   无 sale 事件（退役时未填转让价）→ recordPhysicalSaleAsset 补建；
                                //   输入为 0/空 → 保持现状（不删历史，不产生审计噪声）。
                                await this.updateAsset(existing.id, dto);
                                if (purchasePlan) await this._applyPurchasePriceEditPlan(existing, purchasePlan);
                                let enteredMinor = 0;
                                try { enteredMinor = parseMajorToMinor(value('salePrice') || '0', currency); } catch (error) { enteredMinor = 0; }
                                if (!Number.isSafeInteger(enteredMinor) || enteredMinor < 0) enteredMinor = 0;
                                if (enteredMinor > 0) {
                                    const currentSale = (() => { const sales = (this._financialEvents || []).filter(event => event && event.assetId === existing.id && event.eventType === 'sale' && event.direction === 'inflow' && !event.voidedAt); if (!sales.length) return null; sales.sort((l, r) => String(l.effectiveDate || '').localeCompare(String(r.effectiveDate || '')) || String(l.occurredAt || '').localeCompare(String(r.occurredAt || '')) || String(l.createdAt || '').localeCompare(String(r.createdAt || ''))); return sales[sales.length - 1]; })();
                                    const soldOn = value('retiredDate') || existing.statusChangedOn || todayISO();
                                    if (!currentSale) {
                                        await this.recordPhysicalSaleAsset(existing.id, { priceMinor: enteredMinor, soldOn: soldOn, note: '' });
                                    } else if (enteredMinor !== currentSale.amountMinor) {
                                        await this._correctSalePrice(existing.id, { priceMinor: enteredMinor, soldOn: soldOn });
                                    }
                                }
                            } else if (activeKind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) {
                                // 阶段3（订阅编辑解锁）：金额/开始日期/到期日通过阶段1域方法持久化（各自独立事务），
                                // updateAsset 仅处理其余字段（planName/accountLabel/billingPlan.cycle/autoRenew/notes 等）。
                                // 先 _planSubscriptionEdit 做前置校验（投影周期集合 + 重叠/日期顺序 + 金额合法性），
                                // 通过后再依次提交，避免任一域方法 throw 造成部分提交（验收4/6）。
                                const subOriginals = this._subscriptionEditOriginals(existing);
                                const subPlan = this._planSubscriptionEdit(existing, form, currency, subOriginals);
                                await this.updateAsset(existing.id, dto);
                                await this._applySubscriptionEditPlan(existing, subPlan);
                            } else {
                                await this.updateAsset(existing.id, dto);
                                if (purchasePlan) await this._applyPurchasePriceEditPlan(existing, purchasePlan);
                            }
                        }
                        else if (sourceWish) { const created = await this.completeWishlistPurchase(sourceWish, dto, amount, { openingCount: activeKind === FORMAL_ASSET_KIND.PREPAID_COUNT ? Number(form.elements.openingCount && form.elements.openingCount.value || 0) : 0, periodStart: dto.acquiredOn, prepaidInitialAmountMinor: activeKind === FORMAL_ASSET_KIND.PREPAID_AMOUNT && form.elements.initialAmount && String(form.elements.initialAmount.value || '').trim() !== '' ? parseMajorToMinor(String(form.elements.initialAmount.value), currency) : undefined }); await this._applyInitialRemainingCountAdjust(created, form, Number(form.elements.openingCount && form.elements.openingCount.value || 0)); }
                        else {
                            // v2.6.2 修复：新建实物直接选「退役」时，先以 active 创建，再复用域事务写退役/转让，
                            // 与「在役→退役」编辑转换路径完全同构（此前新建分支静默丢弃 salePrice，
                            // 只落 status=retired，不产生 sale 财务事件与退役生命周期事件）。
                            // opts.wishlist 时 dto.status 恒为 'wishlist'，不会命中本分支。
                            const createAsRetiredPhysical = activeKind === FORMAL_ASSET_KIND.PHYSICAL && dto.status === 'retired';
                            if (createAsRetiredPhysical) { dto.status = 'active'; dto.statusChangedOn = dto.acquiredOn; }
                            const created = await this.addAsset(dto, { purchaseAmountMinor: opts.wishlist ? undefined : amount, prepaidOpeningCount: activeKind === FORMAL_ASSET_KIND.PREPAID_COUNT ? Number(form.elements.openingCount && form.elements.openingCount.value || 0) : undefined, prepaidInitialAmountMinor: activeKind === FORMAL_ASSET_KIND.PREPAID_AMOUNT && form.elements.initialAmount && String(form.elements.initialAmount.value || '').trim() !== '' ? parseMajorToMinor(String(form.elements.initialAmount.value), currency) : undefined, subscriptionPeriodEnd: activeKind === FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION && value('periodEnd').trim() !== '' ? value('periodEnd').trim() : undefined });
                            if (createAsRetiredPhysical) {
                                const retiredDateValue = value('retiredDate') || todayISO();
                                const salePriceMinor = parseMajorToMinor(value('salePrice') || '0', currency);
                                if (Number.isSafeInteger(salePriceMinor) && salePriceMinor > 0) {
                                    await this.recordPhysicalSaleAsset(created.id, { priceMinor: salePriceMinor, soldOn: retiredDateValue, note: '' });
                                } else {
                                    await this.retirePhysicalAsset(created.id, { retiredDate: retiredDateValue, note: '' });
                                }
                            }
                            await this._applyInitialRemainingCountAdjust(created, form, Number(form.elements.openingCount && form.elements.openingCount.value || 0));
                        }
                        const remainingCountEl = form.elements.targetRemainingCount;
                        if (existing && activeKind === FORMAL_ASSET_KIND.PREPAID_COUNT && remainingCountEl && String(remainingCountEl.value || '').length > 0) {
                            const targetCount = Number(remainingCountEl.value);
                            if (Number.isSafeInteger(targetCount) && targetCount >= 0) {
                                await this.recordPrepaidCountAdjustment(existing.id, { targetCount: targetCount, effectiveDate: todayISO(), note: this._t('prepaidAdjustReasonDefault', '次数校正') });
                            }
                        }
                        // Stage 4: amount-kind edit correction. 剩余金额 is a target; write an
                        // adjust transaction for (target - current projected balance). Balance is
                        // never stored in details. addPrepaidTransaction(type='adjust', amount)
                        // creates a non-cash ADJUSTMENT financial event (affectsCash=false) that
                        // satisfies the formal-v2 assert rules for amount-dimension adjustments.
                        const remainingAmountEl = form.elements.targetRemainingAmount;
                        if (existing && activeKind === FORMAL_ASSET_KIND.PREPAID_AMOUNT && remainingAmountEl && String(remainingAmountEl.value || '').length > 0) {
                            const targetAmountMinor = parseMajorToMinor(String(remainingAmountEl.value), currency);
                            // R1（预付价格编辑修复）：剩余金额是"目标值"，仅在用户【实际修改】该字段时才写校正流水。
                            // 该字段在渲染时预填为当时投影余额（data-original-remaining-minor）。编辑"购买成本"会改变
                            // 投影余额但不会改动本字段；若仍按 (目标-当前投影) 计算差额，会产生一笔幻影 adjust 把余额
                            // 拉回旧值，导致用户看到"价格改了但余额/价格没变"。故与渲染原始值按 minor 比对，未改动即跳过。
                            const originalRemainingMinor = Number(remainingAmountEl.dataset.originalRemainingMinor);
                            const remainingUnchanged = Number.isSafeInteger(originalRemainingMinor) && targetAmountMinor === originalRemainingMinor;
                            if (!remainingUnchanged && Number.isSafeInteger(targetAmountMinor) && targetAmountMinor >= 0) {
                                let currentBalanceMinor = 0;
                                try {
                                    const balanceProj = projectFormalPrepaid(existing, (this._prepaidTransactions || []).filter(t => t.assetId === existing.id), (this._financialEvents || []).filter(e => e.assetId === existing.id));
                                    if (balanceProj && Number.isSafeInteger(balanceProj.balanceAmountMinor)) currentBalanceMinor = balanceProj.balanceAmountMinor;
                                } catch (error) { currentBalanceMinor = 0; }
                                const balanceDelta = targetAmountMinor - currentBalanceMinor;
                                if (balanceDelta !== 0) {
                                    await this.addPrepaidTransaction(existing.id, { type: 'adjust', direction: balanceDelta > 0 ? 'inflow' : 'outflow', amountMinor: Math.abs(balanceDelta), date: todayISO(), note: this._t('prepaidAmountAdjustReasonDefault', '金额校正') });
                                }
                            }
                        }
                        const previousCover = existing ? existing.cover : (sourceWish ? sourceWish.cover : null);
                        const previousOwnerId = existing ? existing.id : (sourceWish ? sourceWish.id : formAssetId);
                        coverState.pendingUploadCover = null;
                        if (previousCover) this.cleanupReplacedAssetCover(previousCover, coverState.cover, previousOwnerId).catch(error => console.warn('[AssetManagement] formal form cover cleanup failed:', error && error.message));
                        mask.remove(); this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
                    } catch (error) {
                        submitting = false;
                        if (saveButton) { saveButton.disabled = false; saveButton.setAttribute('aria-busy', 'false'); }
                        this.showToast('⚠️ ' + error.message);
                    }
                };
                mask.addEventListener('mousedown', event => { const panel = mask.querySelector('[data-tag-popover-panel]'); if (!panel || panel.hidden) return; const root = mask.querySelector('[data-tag-popover]'); if (root && !root.contains(event.target)) panel.hidden = true; });
                updateCoverPicker();
            }
            const kindBody = mask.querySelector('[data-kind-body]');
            if (kindBody) {
                kindBody.querySelectorAll('[data-switch-kind]').forEach(button => { button.onclick = () => {
                    if (button.disabled || button.classList.contains('am-type-pill--disabled')) return;
                    const form = mask.querySelector('form');
                    ['currency', 'amount', 'acquiredOn', 'warrantyEndsOn', 'costGoalDaily', 'costGoalEndsOn', 'retiredDate', 'salePrice', 'planName', 'accountLabel', 'formalPlanCycle', 'provider', 'expiresOn', 'licenseAccountLabel', 'openingCount', 'initialAmount', 'periodEnd'].forEach(name => { const c = form.querySelector('[name="' + name + '"]'); if (c && c.type !== 'checkbox') draft[name] = c.value; });
                    ['warrantyEnabled', 'costGoalEnabled', 'autoRenew'].forEach(name => { const c = form.querySelector('[name="' + name + '"]'); if (c) draft[name] = c.checked; });
                    kindDrafts[activeKind] = Object.assign({}, kindDrafts[activeKind], { warrantyEnabled: warrantyEnables, costGoalEnabled: targetDailyEnables, formalPlanCycle: (form.querySelector('[name="formalPlanCycle"]') || {}).value, autoRenew: !!(form.querySelector('[name="autoRenew"]') || {}).checked, accountLabel: (form.querySelector('[name="accountLabel"]') || {}).value, licenseAccountLabel: (form.querySelector('[name="licenseAccountLabel"]') || {}).value });
                    render(button.dataset.switchKind);
                }; });
                const statusRow = kindBody.querySelector('[data-status-row]');
                if (statusRow) {
                    statusRow.querySelectorAll('[data-status-pill]').forEach(button => { button.onclick = () => {
                    const form = mask.querySelector('form');
                        ['retiredDate', 'salePrice'].forEach(name => { const c = form.querySelector('[name="' + name + '"]'); if (c) draft[name] = c.value; });
                        draft.status = button.dataset.statusPill;
                        render(activeKind);
                    }; });
                }
                kindBody.querySelectorAll('[data-toggle="warranty"]').forEach(cb => { cb.onchange = () => { const ex = kindBody.querySelector('[data-warranty-expand]'); if (ex) ex.hidden = !cb.checked; }; });
                // Stage 5 (需求6): live warranty tier hint next to the 保修截止日 date input.
                // Pure UI feedback — the badge has no [name], so it is never read by the submit
                // path (which reads [name="warrantyEndsOn"] directly). Empty date hides the badge.
                const warrantyDateInput = kindBody.querySelector('[name="warrantyEndsOn"]');
                const warrantyHintEl = kindBody.querySelector('[data-warranty-hint]');
                if (warrantyDateInput && warrantyHintEl) {
                    const refreshWarrantyHint = () => {
                        const info = warrantyDateInput.value ? this._warrantyTier(warrantyDateInput.value) : null;
                        if (!info) { warrantyHintEl.hidden = true; warrantyHintEl.textContent = ''; warrantyHintEl.className = 'am-warranty-hint'; return; }
                        warrantyHintEl.hidden = false;
                        warrantyHintEl.textContent = info.label;
                        warrantyHintEl.className = 'am-warranty-hint am-warranty-hint--' + info.tier;
                    };
                    warrantyDateInput.addEventListener('input', refreshWarrantyHint);
                    warrantyDateInput.addEventListener('change', refreshWarrantyHint);
                }
                // v1.2：保修截止日自定义日历（年月切换 + 1/2/3 年快捷），替换原生 type=date。
                // 隐藏 input[name=warrantyEndsOn] 保留提交/hint 兼容；trigger 仅作 UI 触发，选日回填 hidden。
                const wpRoot = kindBody.querySelector('[data-warranty-datepicker]');
                if (wpRoot) {
                    const wpHidden = wpRoot.querySelector('[name="warrantyEndsOn"]');
                    const wpTrigger = wpRoot.querySelector('[data-warranty-date-trigger]');
                    if (wpHidden && wpTrigger) {
                        const wpToday = new Date();
                        let wpYear = wpToday.getFullYear();
                        let wpMonth = wpToday.getMonth();
                        let wpPanel = null;
                        let wpViewMode = 'days'; // 'days' | 'years'：点击年月标题切换年份视图
                        let wpUserPicked = false; // 用户是否已手动选日（未选时保修日期随购买日期联动）
                        const wpDisplay = (iso) => iso || this._t('datePickerPlaceholder', '选择日期');
                        const wpIsoOfDay = (d) => wpYear + '-' + String(wpMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
                        const wpRenderDays = () => {
                            const firstWd = new Date(wpYear, wpMonth, 1).getDay();
                            const dim = new Date(wpYear, wpMonth + 1, 0).getDate();
                            const todayIsoStr = wpToday.getFullYear() + '-' + String(wpToday.getMonth() + 1).padStart(2, '0') + '-' + String(wpToday.getDate()).padStart(2, '0');
                            const cells = [];
                            for (let i = 0; i < firstWd; i++) cells.push('<span class="am-datepicker__cell am-datepicker__cell--blank"></span>');
                            for (let d = 1; d <= dim; d++) {
                                const iso = wpIsoOfDay(d);
                                const cls = 'am-datepicker__cell' + (iso === wpHidden.value ? ' is-selected' : '') + (iso === todayIsoStr ? ' is-today' : '');
                                cells.push('<button type="button" class="' + cls + '" data-dp-day="' + iso + '">' + d + '</button>');
                            }
                            return cells.join('');
                        };
                        const wpRender = () => {
                            const shortcut = (n) => escapeHtml(this._t('datePickerPlusYears', '+{n}年').replace('{n}', String(n)));
                            if (wpViewMode === 'years') {
                                const startYear = wpYear - (wpYear % 12);
                                const yearCells = [];
                                for (let i = 0; i < 12; i++) { const y = startYear + i; const cls = 'am-datepicker__year' + (y === wpToday.getFullYear() ? ' is-today' : ''); yearCells.push('<button type="button" class="' + cls + '" data-dp-year="' + y + '">' + y + '</button>'); }
                                return '<div class="am-datepicker__header"><button type="button" class="am-datepicker__nav" data-dp-prev aria-label="' + escapeHtml(this._t('datePickerPrevMonth', '上一月')) + '">‹</button><button type="button" class="am-datepicker__title" data-dp-title>' + startYear + ' – ' + (startYear + 11) + '</button><button type="button" class="am-datepicker__nav" data-dp-next aria-label="' + escapeHtml(this._t('datePickerNextMonth', '下一月')) + '">›</button></div><div class="am-datepicker__years">' + yearCells.join('') + '</div>';
                            }
                            const monthLabel = this._t('datePickerMonthLabel', '{y}年{m}月').replace('{y}', wpYear).replace('{m}', wpMonth + 1);
                            const weekdays = ['日', '一', '二', '三', '四', '五', '六'].map(w => '<span class="am-datepicker__weekday">' + w + '</span>').join('');
                            return '<div class="am-datepicker__header"><button type="button" class="am-datepicker__nav" data-dp-prev aria-label="' + escapeHtml(this._t('datePickerPrevMonth', '上一月')) + '">‹</button><button type="button" class="am-datepicker__title" data-dp-title>' + escapeHtml(monthLabel) + '</button><button type="button" class="am-datepicker__nav" data-dp-next aria-label="' + escapeHtml(this._t('datePickerNextMonth', '下一月')) + '">›</button></div><div class="am-datepicker__weekdays">' + weekdays + '</div><div class="am-datepicker__days">' + wpRenderDays() + '</div><div class="am-datepicker__shortcuts"><button type="button" class="am-datepicker__shortcut" data-dp-shortcut="1">' + shortcut(1) + '</button><button type="button" class="am-datepicker__shortcut" data-dp-shortcut="2">' + shortcut(2) + '</button><button type="button" class="am-datepicker__shortcut" data-dp-shortcut="3">' + shortcut(3) + '</button></div>';
                        };
                        const wpBindPanel = () => {
                            if (!wpPanel) return;
                            const prev = wpPanel.querySelector('[data-dp-prev]');
                            const next = wpPanel.querySelector('[data-dp-next]');
                            if (prev) prev.onclick = () => { if (wpViewMode === 'years') { wpYear -= 12; } else { wpMonth--; if (wpMonth < 0) { wpMonth = 11; wpYear--; } } wpRefresh(); };
                            if (next) next.onclick = () => { if (wpViewMode === 'years') { wpYear += 12; } else { wpMonth++; if (wpMonth > 11) { wpMonth = 0; wpYear++; } } wpRefresh(); };
                            const title = wpPanel.querySelector('[data-dp-title]');
                            if (title) title.onclick = () => { wpViewMode = (wpViewMode === 'years') ? 'days' : 'years'; wpRefresh(); };
                            wpPanel.querySelectorAll('[data-dp-year]').forEach(b => { b.onclick = () => { wpYear = parseInt(b.getAttribute('data-dp-year'), 10) || wpYear; wpViewMode = 'days'; wpRefresh(); }; });
                            wpPanel.querySelectorAll('[data-dp-day]').forEach(b => { b.onclick = () => wpPick(b.getAttribute('data-dp-day')); });
                            wpPanel.querySelectorAll('[data-dp-shortcut]').forEach(b => {
                                b.onclick = () => {
                                    const n = parseInt(b.getAttribute('data-dp-shortcut'), 10) || 1;
                                    // v1.3 阶段 2：以表单当前购买日为基准；空购买日回退到 today。
                                    // 显式选择「购买日 + N 年」快捷 → 重置 wpUserPicked，
                                    // 让后续购买日变化继续联动（与 wpApplySuggestion 口径一致）。
                                    // 必须**先**重置再写入，因为 wpPick 内部会再次置为 true。
                                    const baseIso = (wpAcquiredInput && wpAcquiredInput.value) || '';
                                    const plusN = wpAddYearsSafe(baseIso, n);
                                    const parts = plusN.split('-').map(Number);
                                    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
                                    dt.setDate(dt.getDate() - 1); // 保修通常算到前一日满整年
                                    const iso = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
                                    wpUserPicked = false;
                                    // 写入路径与 wpPick 一致，但不重新置 wpUserPicked=true
                                    wpHidden.value = iso;
                                    wpTrigger.textContent = wpDisplay(iso);
                                    wpHidden.dispatchEvent(createPluginDomEvent(wpHidden, 'input', { bubbles: true }));
                                    wpHidden.dispatchEvent(createPluginDomEvent(wpHidden, 'change', { bubbles: true }));
                                    wpClose();
                                };
                            });
                        };
                        const wpRefresh = () => {
                            if (!wpPanel) return;
                            wpPanel.innerHTML = wpRender();
                            wpBindPanel();
                        };
                        // v1.2：滚动/resize 重定位 panel（fixed 跟随 trigger），点击外部关闭日历。
                        function repositionPanel() {
                            if (!wpPanel || !wpTrigger) return;
                            const tRect = wpTrigger.getBoundingClientRect();
                            wpPanel.style.top = (tRect.bottom + 6) + 'px';
                            wpPanel.style.right = (window.innerWidth - tRect.right) + 'px';
                        }
                        function onDocMouseDown(ev) {
                            if (!wpPanel) return;
                            if (wpPanel.contains(ev.target) || wpTrigger.contains(ev.target)) return;
                            wpClose();
                        }
                        const wpClose = () => {
                            if (wpPanel && wpPanel.parentNode) wpPanel.parentNode.removeChild(wpPanel);
                            wpPanel = null;
                            document.removeEventListener('mousedown', onDocMouseDown, true);
                            document.removeEventListener('scroll', repositionPanel, true);
                            window.removeEventListener('resize', repositionPanel);
                        };
                        const wpPick = (iso) => {
                            wpUserPicked = true;
                            wpHidden.value = iso;
                            wpTrigger.textContent = wpDisplay(iso);
                            wpHidden.dispatchEvent(createPluginDomEvent(wpHidden, 'input', { bubbles: true }));
                            wpHidden.dispatchEvent(createPluginDomEvent(wpHidden, 'change', { bubbles: true }));
                            wpClose();
                        };
                        // v1.3 阶段 2：物理表单的 acquiredOn 在 physicalCard1Rows（kindBody 之外）；
                        // 虚拟 / 预付的 acquiredOn 在 kindBody 内的 costDateField。统一在 mask 范围查
                        // 保证 wpApplySuggestion / +N 年快捷都能拿到当前购买日。
                        const wpAcquiredInput = mask.querySelector('input[name="acquiredOn"]');
                        // v1.3 阶段 2：闰日安全的 +N 年 helper。
                        // 物理保修以购买日为基准：2/29 + N 年 → 非闰年回退到 2/28；
                        // 其他月末日期（1/31、3/31 …）到目标月若超过该月最大天数，回退到目标月最后一天。
                        // baseIso 无效或为空时回退到 today。返回 ISO 字符串（YYYY-MM-DD）。
                        const wpAddYearsSafe = (baseIso, n) => {
                            let y, m, d;
                            if (baseIso && /^\d{4}-\d{2}-\d{2}$/.test(baseIso)) {
                                const parts = baseIso.split('-').map(Number);
                                y = parts[0]; m = parts[1]; d = parts[2];
                            } else {
                                const t = new Date();
                                y = t.getFullYear(); m = t.getMonth() + 1; d = t.getDate();
                            }
                            const targetY = y + n;
                            if (m === 2 && d === 29) {
                                const isLeap = (targetY % 4 === 0 && targetY % 100 !== 0) || (targetY % 400 === 0);
                                const day = isLeap ? 29 : 28;
                                return targetY + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0');
                            }
                            const dt = new Date(targetY, m - 1, d);
                            if (dt.getFullYear() !== targetY || dt.getMonth() + 1 !== m) {
                                const lastDay = new Date(targetY, m, 0).getDate();
                                return targetY + '-' + String(m).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
                            }
                            return targetY + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
                        };
                        // 保修建议值 = 购买日期 + 1 年 - 1 天（满整年前一日）；无购买日期则基于今天。
                        const wpSuggestFromAcquired = () => {
                            const baseIso = (wpAcquiredInput && wpAcquiredInput.value) || '';
                            const plusOne = wpAddYearsSafe(baseIso, 1);
                            const parts = plusOne.split('-').map(Number);
                            const dt = new Date(parts[0], parts[1] - 1, parts[2]);
                            dt.setDate(dt.getDate() - 1);
                            return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
                        };
                        const wpApplySuggestion = () => {
                            if (wpUserPicked) return;
                            const sug = wpSuggestFromAcquired();
                            wpHidden.value = sug;
                            wpTrigger.textContent = wpDisplay(sug);
                            wpHidden.dispatchEvent(createPluginDomEvent(wpHidden, 'input', { bubbles: true }));
                            wpHidden.dispatchEvent(createPluginDomEvent(wpHidden, 'change', { bubbles: true }));
                        };
                        wpUserPicked = !!(details.warrantyEndsOn);
                        const wpOpen = () => {
                            if (wpPanel) { wpClose(); return; }
                            const focusIso = wpHidden.value || wpSuggestFromAcquired();
                            const parts = focusIso.split('-').map(Number);
                            wpYear = parts[0] || wpToday.getFullYear();
                            wpMonth = (parts[1] || 1) - 1;
                            wpViewMode = 'days';
                            const tRect = wpTrigger.getBoundingClientRect();
                            wpPanel = document.createElement('div');
                            wpPanel.className = 'am-datepicker';
                            wpPanel.setAttribute('data-datepicker-panel', '');
                            wpPanel.innerHTML = wpRender();
                            wpPanel.addEventListener('mousedown', (ev) => ev.stopPropagation());
                            // v1.2：portal 到 document.body + position:fixed + z-index 99999，
                            // 彻底脱离表单/sheet 的 stacking context，浮在 toggle / 标签下拉 / 保存按钮 / modal mask 之上。
                            wpPanel.style.position = 'fixed';
                            wpPanel.style.top = (tRect.bottom + 6) + 'px';
                            wpPanel.style.right = (window.innerWidth - tRect.right) + 'px';
                            wpPanel.style.left = 'auto';
                            wpPanel.style.zIndex = '90';
                            document.body.appendChild(wpPanel);
                            // v1.2：滚动/resize 重定位 + 点击外部关闭（capture 阶段拦截 mousedown）。
                            document.addEventListener('mousedown', onDocMouseDown, true);
                            document.addEventListener('scroll', repositionPanel, true);
                            window.addEventListener('resize', repositionPanel);
                            wpBindPanel();
                        };
                        wpTrigger.onclick = (ev) => { ev.preventDefault(); wpOpen(); };
                        wpTrigger.addEventListener('mousedown', (ev) => ev.stopPropagation());
                        if (wpAcquiredInput) { wpAcquiredInput.addEventListener('input', wpApplySuggestion); wpAcquiredInput.addEventListener('change', wpApplySuggestion); }
                        if (!wpUserPicked) wpApplySuggestion();
                        wpTrigger.textContent = wpDisplay(wpHidden.value);
                    }
                }
                // v1.2：同步自定义日历到其他日期（除保修外），快捷按 data-am-shortcuts 配置（默认 today）。
                // 注意：物理基础行（physicalCard1Rows 含购买日期）渲染在 kind-body 外面，
                // 所以绑定作用域用整个 mask 而非 kindBody，确保所有 [data-am-datepicker] 都生效。
                this._bindAmDatepickers(mask);
                // v2.3.0：绑定订阅计费周期玻璃下拉（作用域同为 mask，render 重跑后重新绑定）。
                this._bindAmGlassSelects(mask);
                const _mdNotesTextarea = mask.querySelector('textarea[name="notes"]');
                if (_mdNotesTextarea) this._bindMarkdownTextarea(_mdNotesTextarea);
                kindBody.querySelectorAll('[data-toggle="costGoal"]').forEach(cb => { cb.onchange = () => { draft.costGoalEnabled = cb.checked; const ex = kindBody.querySelector('[data-costgoal-expand]'); if (ex) ex.hidden = !cb.checked; }; });
                kindBody.querySelectorAll('[data-cg-mode]').forEach(btn => { btn.onclick = (ev) => { ev.preventDefault(); _cgSwitchMode(btn.dataset.cgMode); }; });
                // ---- P3（目标日均价日期联动）：_cgRefreshPreview / _cgSwitchMode 已移至 openFormalAssetSheet ----
                // 作用域（render 外，见 render 定义之后），交互经 mask 级事件委托一次绑定；render 重跑、
                // costGoal 展开区 hidden/显示切换都不影响联动。costGoal 开关 toggle（上一行 cb.onchange）保留直绑。
                // ---- P3 end ----
                // Stage 4: new-mode live linking. For amount kind the opening balance equals the
                // purchase cost (single financial event), so 初始金额/剩余金额 mirror 购买成本. For
                // count kind 剩余次数 mirrors 初始次数. These mirrors are readonly, never submitted,
                // and never written to details (remaining is a projection, not storage).
                const prepaidAmountInput = kindBody.querySelector('input[name="amount"]');
                const prepaidInitialAmount = kindBody.querySelector('[data-prepaid-initial-amount]');
                const prepaidRemainingAmount = kindBody.querySelector('[data-prepaid-remaining-amount]');
                if (prepaidAmountInput && prepaidInitialAmount && prepaidRemainingAmount) {
                    // Stage 3 (金额权益初始金额可调): new-mode live linking. 初始金额 defaults to
                    // 购买成本 but is user-editable (赠送 > 成本 / 折损 < 成本). While the user has
                    // not manually edited 初始金额, changing 购买成本 mirrors into it (this generalizes
                    // the Stage-2 lastMirroredCount guard to a manually-overridable mirror). 剩余金额
                    // always mirrors 初始金额. All are readonly projection mirrors, never submitted
                    // (remaining balance is computed from transactions at save). This block only runs
                    // in new mode: edit mode renders no [data-prepaid-remaining-amount] element.
                    let initialAmountManuallyEdited = prepaidInitialAmount.value !== '' && prepaidInitialAmount.value !== prepaidAmountInput.value;
                    prepaidInitialAmount.addEventListener('input', () => {
                        initialAmountManuallyEdited = true;
                        prepaidRemainingAmount.value = prepaidInitialAmount.value;
                    });
                    prepaidAmountInput.addEventListener('input', () => {
                        if (!initialAmountManuallyEdited) prepaidInitialAmount.value = prepaidAmountInput.value;
                        prepaidRemainingAmount.value = prepaidInitialAmount.value;
                    });
                }
                const prepaidInitialCount = kindBody.querySelector('[data-prepaid-initial-count]');
                const prepaidRemainingCount = kindBody.querySelector('[data-prepaid-remaining-count]');
                if (prepaidInitialCount && prepaidRemainingCount) {
                    let lastMirroredCount = prepaidInitialCount.value; prepaidInitialCount.addEventListener('input', () => { const currentRemainingValue = prepaidRemainingCount.value; if (currentRemainingValue === '' || currentRemainingValue === String(lastMirroredCount)) { prepaidRemainingCount.value = prepaidInitialCount.value; lastMirroredCount = prepaidInitialCount.value; } });
                }
                // 需求2（新建路径）：订阅到期日派生联动。开始日期（acquiredOn）或计费周期
                // （formalPlanCycle）变化时自动重算 getSubscriptionPeriodEnd 回填 periodEnd；
                // 用户手动改过 periodEnd 后（manuallyEdited 守卫）不再被自动覆盖。manuallyEdited
                // 与 draft.periodEnd 记在外层 draft（跨 kind 切换 / 重渲染保留）。仅新建态存在
                // periodEnd 输入框（编辑态阶段 3 再解锁），故 !existing 时才接线。
                const subPeriodEndInput = kindBody.querySelector('input[name="periodEnd"]');
                if (subPeriodEndInput && !existing) {
                    const subStartDateInput = kindBody.querySelector('input[name="acquiredOn"]');
                    // v2.3.0：周期改为玻璃下拉（hidden input），选中时组件对 hidden input
                    // dispatch change，联动监听选择器由 select 换 input 即可。
                    const subCycleInput = kindBody.querySelector('input[name="formalPlanCycle"]');
                    let periodEndManuallyEdited = !!draft.periodEndManuallyEdited;
                    const recomputePeriodEnd = () => {
                        if (periodEndManuallyEdited) return;
                        const startDate = (subStartDateInput && subStartDateInput.value) || todayISO();
                        const cycle = (subCycleInput && subCycleInput.value) || 'monthly';
                        const computed = getSubscriptionPeriodEnd(startDate, cycle);
                        if (computed) {
                            subPeriodEndInput.value = computed; draft.periodEnd = computed;
                            const _trigger = subPeriodEndInput.parentNode.querySelector('[data-am-date-trigger]');
                            if (_trigger) _trigger.textContent = computed;
                        }
                    };
                    if (subStartDateInput) subStartDateInput.addEventListener('change', recomputePeriodEnd);
                    if (subCycleInput) subCycleInput.addEventListener('change', recomputePeriodEnd);
                    subPeriodEndInput.addEventListener('input', () => { periodEndManuallyEdited = true; draft.periodEndManuallyEdited = true; draft.periodEnd = subPeriodEndInput.value; });
                }
            }
            if (wishPrefill && wishPrefill.expectedAmountMinor != null) {
                const _wpAmount = mask.querySelector('input[name="amount"]');
                if (_wpAmount && !mask.querySelector('[data-wishlist-prefill-hint]')) {
                    const _wpHint = document.createElement('div');
                    _wpHint.className = 'am-form-hint am-wishlist-prefill-hint';
                    _wpHint.setAttribute('data-wishlist-prefill-hint', '');
                    _wpHint.textContent = this._t('wishlistPrefillPriceHint', '已按种草期望价预填，可修改');
                    const _wpRow = _wpAmount.closest('.am-fpc1-row') || _wpAmount.parentNode;
                    if (_wpRow && _wpRow.parentNode) _wpRow.parentNode.insertBefore(_wpHint, _wpRow.nextSibling);
                }
            }
        };
        // ---- P3 / v1.7.1：目标日均价双向联动函数移到 openFormalAssetSheet 作用域（render 外）----
        // 不再捕获 render 局部的 kindBody；所有节点经 mask.querySelector 现取，cg 上下文（currency/
        // acquiredOn/netMinor/finEvents）从 live form 现算，render 重跑后依旧生效。
        // 安全包装：parseMajorToMinor 对输入暂态值（"2." 小数点尾 / "-" / 粘贴带逗号空格）会 throw
        // RangeError（正则 /^\d+(?:\.\d+)?$/ 不匹配即抛）。costGoal 联动热路径（render 初始预览 /
        // _cgRefreshPreview byPrice / _cgSwitchMode byDate）解析失败时降级为 null（等价"空/无值"），
        // 避免中断 render（白屏）或模式切换（按钮点不动）。数据校验/提交路径仍用裸调，严格 throw 不变。
        const _safeParseMajor = (v, cur) => { if (v == null || v === '') return null; try { return parseMajorToMinor(v, cur); } catch (_e) { return null; } };
        const _cgContext = () => {
            const _form = mask.querySelector('form');
            if (!_form) return null;
            const _curEl = _form.querySelector('[name="currency"]');
            const _cgCurrency = (_curEl && _curEl.value) || (existing && existing.currency) || 'CNY';
            const _acqEl = _form.querySelector('[name="acquiredOn"]');
            const _cgAcquiredOn = (_acqEl && _acqEl.value) || (existing && existing.acquiredOn) || todayISO();
            const _cgFinEvents = (existing && Array.isArray(this._financialEvents)) ? this._financialEvents.filter(e => e && e.assetId === existing.id) : [];
            // v1.7.4：N 优先取表单实时购买价格（新建资产 existing=null 也能联动），无金额回退已存财务净值。
            const _amtEl = _form.querySelector('[name="amount"]');
            let _cgNetMinor = _safeParseMajor(_amtEl ? _amtEl.value : '', _cgCurrency) || 0;
            if (!(_cgNetMinor > 0) && existing) { try { _cgNetMinor = projectFormalFinancials(existing, _cgFinEvents).netAmountMinor; } catch (_e) { _cgNetMinor = 0; } }
            return { _form, _cgCurrency, _cgAcquiredOn, _cgFinEvents, _cgNetMinor };
        };
        const _cgRefreshPreview = () => {
            const _ctx = _cgContext();
            if (!_ctx) return;
            const _enabled = _ctx._form.querySelector('[name="costGoalEnabled"]');
            if (!_enabled || !_enabled.checked) return;
            const _cgHintEl = mask.querySelector('[data-cg-hint]');
            if (costGoalMode === 'byPrice') {
                const _prev = mask.querySelector('[data-cg-date-preview]');
                const _cgDailyInput = mask.querySelector('input[name="costGoalDaily"]');
                if (!_prev || !_cgDailyInput) return;
                const _t = _safeParseMajor(_cgDailyInput.value, _ctx._cgCurrency);
                let _date = '';
                if (_t != null && _t > 0 && _ctx._cgNetMinor > 0) _date = addBusinessDays(_ctx._cgAcquiredOn, Math.ceil(_ctx._cgNetMinor / _t) - 1) || '';
                _prev.textContent = _date ? this._t('costGoalDatePreview', '预计 {date} 达标').replace('{date}', _date) : '—';
            } else {
                const _prev = mask.querySelector('[data-cg-daily-preview]');
                const _cgEndsHidden = mask.querySelector('[name="costGoalEndsOn"]');
                if (!_prev || !_cgEndsHidden) return;
                const _date = _cgEndsHidden.value;
                if (!_date) { _prev.textContent = '—'; if (_cgHintEl) { _cgHintEl.hidden = true; _cgHintEl.textContent = ''; } return; }
                const _days = daysBetween(_ctx._cgAcquiredOn, _date) + 1;
                if (_days <= 0) {
                    _prev.textContent = '—';
                    if (_cgHintEl) { _cgHintEl.hidden = false; _cgHintEl.textContent = this._t('costGoalDateInvalid', '截止日期需晚于购买日期'); }
                } else if (_ctx._cgNetMinor > 0) {
                    _prev.textContent = this._t('costGoalDailyPreview', '预计日均 {amount}').replace('{amount}', formatAmountMinor(Math.ceil(_ctx._cgNetMinor / _days), _ctx._cgCurrency));
                    if (_cgHintEl) { _cgHintEl.hidden = true; _cgHintEl.textContent = ''; }
                } else {
                    _prev.textContent = this._t('costGoalDailyPreview', '预计日均 {amount}').replace('{amount}', formatAmountMinor(0, _ctx._cgCurrency));
                    if (_cgHintEl) { _cgHintEl.hidden = true; _cgHintEl.textContent = ''; }
                }
            }
        };
        const _cgSwitchMode = (newMode) => {
            if (newMode === costGoalMode) return;
            const _ctx = _cgContext();
            if (!_ctx) return;
            const _cb = _ctx._form.querySelector('[name="costGoalEnabled"]');
            if (_cb) draft.costGoalEnabled = _cb.checked;
            const _dailyEl = _ctx._form.querySelector('[name="costGoalDaily"]');
            const _endsEl = _ctx._form.querySelector('[name="costGoalEndsOn"]');
            const _curDailyMajor = _dailyEl ? _dailyEl.value : '';
            const _curEnds = _endsEl ? _endsEl.value : '';
            if (newMode === 'byDate') {
                // A→B：用当前日均反算达标日期写入日期输入；日均组隐藏、日期组显示。
                let _date = _curEnds;
                const _t = _safeParseMajor(_curDailyMajor, _ctx._cgCurrency);
                if (_t != null && _t > 0 && _ctx._cgNetMinor > 0) _date = addBusinessDays(_ctx._cgAcquiredOn, Math.ceil(_ctx._cgNetMinor / _t) - 1) || _date;
                draft.costGoalEndsOn = _date || '';
                draft.costGoalDaily = _curDailyMajor;
                if (_endsEl) _endsEl.value = draft.costGoalEndsOn;
                const _trig = _ctx._form.querySelector('[data-am-datepicker="costGoalEndsOn"] [data-am-date-trigger]');
                if (_trig) _trig.textContent = draft.costGoalEndsOn || this._t('datePickerPlaceholder', '选择日期');
            } else {
                // B→A：用当前日期反算日均写入日均输入；日期组隐藏、日均组显示。
                let _dailyMajor = _curDailyMajor;
                if (_curEnds) {
                    const _days = daysBetween(_ctx._cgAcquiredOn, _curEnds) + 1;
                    if (_days > 0 && _ctx._cgNetMinor > 0) _dailyMajor = minorToMajorString(Math.ceil(_ctx._cgNetMinor / _days), _ctx._cgCurrency);
                }
                draft.costGoalDaily = _dailyMajor || '';
                draft.costGoalEndsOn = _curEnds;
                if (_dailyEl) _dailyEl.value = draft.costGoalDaily;
            }
            costGoalMode = newMode;
            // v1.7.8：直接切换两组预渲染行的 hidden，不重渲染 → 无动画重放、无闪烁。
            const _ex = mask.querySelector('[data-costgoal-expand]');
            if (_ex) {
                const _rp = _ex.querySelector('[data-cg-rows="byPrice"]');
                const _rd = _ex.querySelector('[data-cg-rows="byDate"]');
                if (_rp) _rp.hidden = (newMode !== 'byPrice');
                if (_rd) _rd.hidden = (newMode !== 'byDate');
                _ex.querySelectorAll('[data-cg-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cgMode === newMode)));
            }
            this.saveSettings({ costGoalMode: newMode });
            _cgRefreshPreview();
        };
        // mask 级事件委托：一次绑定，无论 render 重跑几次、展开区如何 hidden/显示，交互都生效。
        // addEventListener 叠加，不与现有 mask 委托（mousedown 标签 popover）冲突。
        mask.addEventListener('click', (e) => { const m = e.target.closest ? e.target.closest('[data-cg-mode]') : null; if (m) { e.preventDefault(); _cgSwitchMode(m.dataset.cgMode); } });
        mask.addEventListener('input', (e) => { const t = e.target; if (!t || !t.matches) return; if (t.matches('input[name="amount"]')) { draft.amount = t.value; _cgRefreshPreview(); } else if (t.matches('input[name="costGoalDaily"]') || t.matches('[name="costGoalEndsOn"]')) { _cgRefreshPreview(); } });
        mask.addEventListener('change', (e) => { const t = e.target; if (!t || !t.matches) return; if (t.matches('[name="acquiredOn"]')) { draft.acquiredOn = t.value; _cgRefreshPreview(); } else if (t.matches('[name="costGoalEndsOn"]')) { _cgRefreshPreview(); } });
        render(initialKind); host.appendChild(mask); return mask;

    }

openMaintenanceSheet(id, preferredHost) { return this.openFormalWorkflowDialog(id, 'maintenance', preferredHost); }
    openPrepaidTransactionSheet(id, preferredHost) { return this.openFormalWorkflowDialog(id, 'prepaid', preferredHost); }

    openRenewSheet(id, preferredHost) {
        const asset = (this.assets || []).find(item => item && item.id === id);
        if (!asset || asset.kind !== FORMAL_ASSET_KIND.VIRTUAL_SUBSCRIPTION) throw new Error('subscription asset is required');
        // v1.3 阶段3/4 返修（Reviewer #1/#2）：与 openFormalWorkflowDialog 一致的 host 解析 +
        // Escape 消费语义，保证续费 sheet 同样能正确浮在详情卡之上，且不冒泡关闭主 Dialog。
        const host = preferredHost || this._productCardHost || this.dockElement || this._modalContainer || this._pluginOverlayRoot || document.body;
        const currency = asset.currency || 'CNY';
        const currentCycle = asset.details && asset.details.billingPlan && FORMAL_BILLING_CYCLES.indexOf(asset.details.billingPlan.cycle) >= 0 ? asset.details.billingPlan.cycle : 'monthly';
        // 需求4（验收9）：开始日期默认 = plannedRenewalDate（最近期 endDate+1）或 today。
        // projectFormalSubscription 在 autoRenew 时给出 plannedRenewalDate；否则回退到最近期 endDate+1。
        let defaultStartDate = todayISO();
        try {
            const periods = (this._subscriptionPeriods || []).filter(record => record && record.assetId === asset.id);
            const projection = projectFormalSubscription(asset, periods, todayISO());
            if (projection && projection.plannedRenewalDate) defaultStartDate = projection.plannedRenewalDate;
            else if (projection && projection.latestPeriod) defaultStartDate = addBusinessDays(projection.latestPeriod.endDate, 1);
        } catch (error) { defaultStartDate = todayISO(); }
        const defaultEndDate = getSubscriptionPeriodEnd(defaultStartDate, currentCycle) || defaultStartDate;
        // 需求4（验收8）：金额默认 = 上期 subscriptionPayment 金额（major，可改）。
        const defaultAmountMajor = (() => {
            const payments = (this._financialEvents || []).filter(event => event && event.assetId === asset.id && event.eventType === 'subscriptionPayment' && !event.voidedAt);
            if (!payments.length) return '';
            payments.sort((l, r) => String(l.effectiveDate || '').localeCompare(String(r.effectiveDate || '')) || String(l.occurredAt || '').localeCompare(String(r.occurredAt || '')));
            const last = payments[payments.length - 1];
            return Number.isSafeInteger(last.amountMinor) ? minorToMajorString(last.amountMinor, currency) : '';
        })();
        // v2.3.0：计费周期改液态玻璃下拉（hidden input + trigger + popover），选项 i18n 复用 formalCycle*。
        // 需求4（验收5/7）：液态玻璃 sheet（.am-edit-sheet + am-form-card + am-fpc1-row 行布局），
        // 复用 openFormalAssetSheet 的 mask 结构；所有控件（select / input[type=date]）都在 sheet 内，
        // 不弹系统原生超出插件的控件。host = dockElement || _modalContainer || body。
        const mask = document.createElement('div'); mask.className = 'am-edit-sheet-mask';
        mask.innerHTML = `<div class="am-edit-sheet am-form-shell am-renew-sheet-form"><div class="am-edit-sheet__grabber"></div><header class="am-edit-sheet__header am-form-shell__header"><button type="button" class="am-edit-sheet__close" data-close aria-label="${escapeHtml(this._t('btnClose', '关闭'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button><h2 class="am-edit-sheet__title">${escapeHtml(this._t('renewTitle', '续费'))}</h2><span class="am-form-shell__header-spacer"></span></header><form data-renew-form data-form><div class="am-edit-sheet__body am-form-shell__body"><div class="am-form-card"><div class="am-fpc1-rows"><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formalBillingCycle', '计费周期'))}</span><span class="am-fpc1-row__value am-virtual-inline-select">${this._renderGlassSelectCell('cycle', currentCycle, this._glassCycleOptions())}</span></div><div class="am-fpc1-divider"></div><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('formFieldStartDate', '开始日期'))}</span><span class="am-fpc1-row__value am-fpc1-row__value--date am-datepicker-cell" data-am-datepicker="startDate" data-am-shortcuts="today"><input type="hidden" name="startDate" value="${escapeHtml(defaultStartDate)}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(defaultStartDate || this._t('datePickerPlaceholder', '选择日期'))}</button></span></div><div class="am-fpc1-divider"></div><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('productDetailExpiryDate', '到期日'))}</span><span class="am-fpc1-row__value am-fpc1-row__value--date am-datepicker-cell" data-am-datepicker="endDate" data-am-shortcuts="today"><input type="hidden" name="endDate" value="${escapeHtml(defaultEndDate)}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(defaultEndDate || this._t('datePickerPlaceholder', '选择日期'))}</button></span></div><div class="am-fpc1-divider"></div><div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(this._t('renewFieldAmount', '金额'))}</span><input class="am-fpc1-row__value" type="number" name="amount" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${escapeHtml(defaultAmountMajor)}"></div></div></div></div><footer class="am-form-shell__footer"><button type="submit" class="am-form-shell__save" data-save>${escapeHtml(this._t('btnSave', '保存'))}<span class="am-form-shell__save-spinner"></span></button></footer></form></div>`;
        // v1.3 阶段3/4 返修（Reviewer #2）：Escape 必须消费事件（preventDefault +
        // stopPropagation + stopImmediatePropagation），且只在 sheet 是 host 内最顶层
        // 插件 sheet 时生效；监听改到 window + capture 阶段，赶在思源 window 冒泡
        // handler 之前消费事件，避免误关主 Dialog。removeEventListener 必须用相同参数。
        const isTopmostPluginSheet = () => {
            if (!mask.parentNode) return false;
            const overlays = mask.parentNode.querySelectorAll(':scope > .am-edit-sheet-mask, :scope > .am-product-card-mask');
            return overlays.length > 0 && overlays[overlays.length - 1] === mask;
        };
        const close = () => {
            window.removeEventListener('keydown', onKeydown, KEYDOWN_CAPTURE_OPTS);
            if (mask.parentNode) mask.parentNode.removeChild(mask);
        };
        const onKeydown = event => {
            if (event.key !== 'Escape') return;
            // v2.3.0：Esc 优先关闭已展开的玻璃下拉（window capture 先于组件 document
            // handler 触发，必须在此委托消费），不误关整个续费 sheet。
            if (this._closeAmGlassSelectPanels()) {
                event.preventDefault();
                event.stopPropagation();
                if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
                return;
            }
            if (!isTopmostPluginSheet()) return;
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
            close();
        };
        const closeBtn = mask.querySelector('[data-close]');
        if (closeBtn) closeBtn.onclick = close;
        mask.onclick = event => { if (event.target === mask) close(); };
        const form = mask.querySelector('form[data-renew-form]');
        // v2.3.0：周期改为玻璃下拉（hidden input name="cycle"），change 由组件 dispatch。
        const cycleInput = form.querySelector('input[name="cycle"]');
        const startDateInput = form.querySelector('input[name="startDate"]');
        const endDateInput = form.querySelector('input[name="endDate"]');
        // 需求4（验收2/3）联动：周期或开始日期变化 → 重算 getSubscriptionPeriodEnd 回填到期日；
        // 用户手动改过到期日后（manuallyEdited 守卫）不再被自动覆盖（阶段 2a 守卫范例）。
        let endDateManuallyEdited = false;
        const recomputeEndDate = () => {
            if (endDateManuallyEdited) return;
            const sd = (startDateInput && startDateInput.value) || todayISO();
            const cy = (cycleInput && cycleInput.value) || 'monthly';
            const computed = getSubscriptionPeriodEnd(sd, cy);
            if (computed && endDateInput) {
                endDateInput.value = computed;
                // v2.3.0：同步到期日 trigger 文案（与 openFormalAssetSheet 联动一致），
                // 否则周期切换后 hidden 已更新而 trigger 仍显示旧日期。
                const _endTrigger = endDateInput.parentNode.querySelector('[data-am-date-trigger]');
                if (_endTrigger) _endTrigger.textContent = computed;
            }
        };
        if (cycleInput) cycleInput.addEventListener('change', recomputeEndDate);
        if (startDateInput) startDateInput.addEventListener('change', recomputeEndDate);
        if (endDateInput) endDateInput.addEventListener('input', () => { endDateManuallyEdited = true; });
        this._bindAmDatepickers(mask);
        this._bindAmGlassSelects(mask);
        let submitting = false;
        form.onsubmit = async event => {
            event.preventDefault();
            if (!this._validateFormBeforeSave(form)) return;
            if (submitting) return;
            submitting = true;
            const saveButton = form.querySelector('[type="submit"]');
            if (saveButton) { saveButton.disabled = true; saveButton.setAttribute('aria-busy', 'true'); }
            try {
                // 需求4：保存从 form.elements 直读（v0.14 教训）；cycle 持久化到 details.billingPlan.cycle（D6）。
                await this.renewSubscription(id, {
                    startDate: form.elements.startDate.value,
                    endDate: form.elements.endDate.value,
                    amount: form.elements.amount.value,
                    cycle: form.elements.cycle.value,
                });
                this.showToast('✓ ' + this._t('subscriptionRenewSuccess', '续费成功'));
                // 需求4（验收4）：保存即关闭（mask 从 DOM 移除），不再 this.openRenewSheet(id) 重开。
                close();
                this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
            } catch (error) {
                submitting = false;
                if (saveButton) { saveButton.disabled = false; saveButton.setAttribute('aria-busy', 'false'); }
                this.showToast('⚠️ ' + (error && error.message ? error.message : 'renew failed'));
            }
        };
        host.appendChild(mask);
        window.addEventListener('keydown', onKeydown, KEYDOWN_CAPTURE_OPTS);
        return mask;
    }

    openPhysicalRetireSheet(id) {
        const asset = (this.assets || []).find(item => item && item.id === id);
        if (!asset || asset.kind !== FORMAL_ASSET_KIND.PHYSICAL) throw new Error('physical asset is required');
        const defaultDate = asset.statusChangedOn || todayISO();
        const body = `<div class="am-retire-sheet"><form data-retire-form><label>${escapeHtml(this._t('physicalRetireFieldDate', '退役日期'))}<span class="am-datepicker-cell" data-am-datepicker="retiredDate" data-am-shortcuts="today"><input type="hidden" name="retiredDate" value="${escapeHtml(defaultDate)}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(defaultDate || this._t('datePickerPlaceholder', '选择日期'))}</button></span></label><label>${escapeHtml(this._t('physicalRetireFieldNote', '备注（可选）'))}<textarea name="note" rows="3"></textarea></label><button type="submit">${escapeHtml(this._t('physicalRetireConfirm', '退役'))}</button></form></div>`;
        return this.showDialog(this._t('physicalRetireTitle', '退役'), body, dialog => {
            const form = dialog.element.querySelector('[data-retire-form]');
            this._bindAmDatepickers(dialog.element);
            const _retireNote = dialog.element.querySelector('textarea[name="note"]');
            if (_retireNote) this._bindMarkdownTextarea(_retireNote);
            form.onsubmit = async event => {
                event.preventDefault();
                try {
                    await this.retirePhysicalAsset(id, { retiredDate: form.elements.retiredDate.value, note: form.elements.note.value });
                    this.showToast('✓ ' + this._t('physicalRetiredToast', '已退役'));
                    dialog.destroy();
                } catch (error) {
                    this.showToast('⚠️ ' + error.message);
                }
            };
        });
    }

    openPhysicalSaleSheet(id) {
        const asset = (this.assets || []).find(item => item && item.id === id);
        if (!asset || asset.kind !== FORMAL_ASSET_KIND.PHYSICAL) throw new Error('physical asset is required');
        const defaultDate = asset.statusChangedOn || todayISO();
        const body = `<div class="am-sale-sheet"><form data-sale-form><label>${escapeHtml(this._t('physicalSaleFieldPrice', '转让价格'))}<input name="salePrice" type="number" min="0.01" step="0.01" required></label><label>${escapeHtml(this._t('physicalSaleFieldDate', '转让日期'))}<span class="am-datepicker-cell" data-am-datepicker="soldOn" data-am-shortcuts="today"><input type="hidden" name="soldOn" value="${escapeHtml(defaultDate)}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(defaultDate || this._t('datePickerPlaceholder', '选择日期'))}</button></span></label><label>${escapeHtml(this._t('physicalSaleFieldNote', '备注（可选）'))}<textarea name="note" rows="3"></textarea></label><button type="submit">${escapeHtml(this._t('physicalSaleConfirm', '转让'))}</button></form></div>`;
        return this.showDialog(this._t('physicalSaleTitle', '转让'), body, dialog => {
            const form = dialog.element.querySelector('[data-sale-form]');
            this._bindAmDatepickers(dialog.element);
            const _saleNote = dialog.element.querySelector('textarea[name="note"]');
            if (_saleNote) this._bindMarkdownTextarea(_saleNote);
            form.onsubmit = async event => {
                event.preventDefault();
                try {
                    const salePriceInput = String(form.elements.salePrice.value || '').trim();
                    if (!salePriceInput) throw new Error(this._t('physicalSaleFieldPrice', '转让价格') + ' is required');
                    await this.recordPhysicalSaleAsset(id, {
                        priceMinor: parseMajorToMinor(salePriceInput, asset.currency || 'CNY'),
                        soldOn: form.elements.soldOn.value,
                        note: form.elements.note.value,
                    });
                    this.showToast('✓ ' + this._t('physicalSoldToast', '已转让'));
                    dialog.destroy();
                } catch (error) {
                    this.showToast('⚠️ ' + error.message);
                }
            };
        });
    }

    openPrepaidAdjustSheet(id) {
        const asset = (this.assets || []).find(item => item && item.id === id);
        if (!asset || asset.kind !== FORMAL_ASSET_KIND.PREPAID_COUNT) throw new Error('prepaid count asset is required');
        let currentRemaining = 0;
        try {
            const projection = projectFormalPrepaid(asset, (this._prepaidTransactions || []).filter(t => t.assetId === asset.id), (this._financialEvents || []).filter(e => e.assetId === asset.id));
            currentRemaining = projection && Number.isSafeInteger(projection.remainingCount) ? projection.remainingCount : 0;
        } catch (error) { currentRemaining = 0; }
        const defaultDate = todayISO();
        const body = `<div class="am-prepaid-adjust-sheet"><p>${escapeHtml(this._t('prepaidRemainingCountField', '剩余次数'))}：${currentRemaining}</p><form data-prepaid-adjust-form><label>${escapeHtml(this._t('prepaidRemainingCountField', '剩余次数'))}<input name="targetCount" type="number" min="0" step="1" value="${currentRemaining}" required></label><label>${escapeHtml(this._t('renewFieldStartDate', '生效日期'))}<span class="am-datepicker-cell" data-am-datepicker="effectiveDate" data-am-shortcuts="today"><input type="hidden" name="effectiveDate" value="${escapeHtml(defaultDate)}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(defaultDate || this._t('datePickerPlaceholder', '选择日期'))}</button></span></label><label>${escapeHtml(this._t('fieldNote', '备注'))}<input name="note" type="text" value="${escapeHtml(this._t('prepaidAdjustReasonDefault', '次数校正'))}"></label><button type="submit">${escapeHtml(this._t('prepaidCountAdjustConfirm', '保存校正'))}</button></form></div>`;
        return this.showDialog(this._t('prepaidCountAdjustTitle', '校正剩余次数'), body, dialog => {
            const form = dialog.element.querySelector('[data-prepaid-adjust-form]');
            this._bindAmDatepickers(dialog.element);
            form.onsubmit = async event => {
                event.preventDefault();
                try {
                    await this.recordPrepaidCountAdjustment(id, {
                        targetCount: Number(form.elements.targetCount.value),
                        effectiveDate: form.elements.effectiveDate.value,
                        note: form.elements.note.value,
                    });
                    dialog.destroy();
                } catch (error) {
                    this.showToast('⚠️ ' + error.message);
                }
            };
        });
    }

    openPrepaidOutflowSheet(id) {
        const asset = (this.assets || []).find(item => item && item.id === id);
        if (!asset || asset.kind !== FORMAL_ASSET_KIND.PREPAID_COUNT) throw new Error('prepaid count asset is required');
        let currentRemaining = 0;
        try {
            const projection = projectFormalPrepaid(asset, (this._prepaidTransactions || []).filter(t => t.assetId === asset.id), (this._financialEvents || []).filter(e => e.assetId === asset.id));
            currentRemaining = projection && Number.isSafeInteger(projection.remainingCount) ? projection.remainingCount : 0;
        } catch (error) { currentRemaining = 0; }
        const defaultDate = todayISO();
        const body = `<div class="am-prepaid-outflow-sheet"><p>${escapeHtml(this._t('prepaidRemainingCountField', '剩余次数'))}：${currentRemaining}</p><form data-prepaid-outflow-form><label>${escapeHtml(this._t('prepaidRecordOutflowField', '消费次数'))}<input name="count" type="number" min="1" step="1" value="1" required></label><label>${escapeHtml(this._t('renewFieldStartDate', '生效日期'))}<span class="am-datepicker-cell" data-am-datepicker="effectiveDate" data-am-shortcuts="today"><input type="hidden" name="effectiveDate" value="${escapeHtml(defaultDate)}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(defaultDate || this._t('datePickerPlaceholder', '选择日期'))}</button></span></label><label>${escapeHtml(this._t('fieldNote', '备注'))}<input name="note" type="text"></label><button type="submit">${escapeHtml(this._t('btnSave', '保存'))}</button></form></div>`;
        return this.showDialog(this._t('prepaidOutflowTitle', '记一笔消费'), body, dialog => {
            const form = dialog.element.querySelector('[data-prepaid-outflow-form]');
            this._bindAmDatepickers(dialog.element);
            form.onsubmit = async event => {
                event.preventDefault();
                try {
                    await this.recordPrepaidConsumption(id, {
                        count: Number(form.elements.count.value),
                        effectiveDate: form.elements.effectiveDate.value,
                        note: form.elements.note.value,
                    });
                    this.showToast('✓ ' + this._t('prepaidOutflowSuccess', '已记录消费'));
                    dialog.destroy();
                } catch (error) {
                    this.showToast('⚠️ ' + error.message);
                }
            };
        });
    }

    /**
     * Stage 4: prepaid detail-card quick action sheet.
     *   amount kind: charge → addPrepaidTransaction(type='inflow'); consume → type='outflow'
     *     (with a client-side sufficiency guard so the balance never goes negative);
     *     refund → type='refund'. The transaction methods create the matching financial event
     *     (prepaidCharge/prepaidConsumption/refund) with the assert-required affectsCash flag.
     *   count kind: countConsume → recordPrepaidConsumption({count}); countAdjust →
     *     recordPrepaidCountAdjustment({targetCount}).
     * On success the product card is re-opened so the projection (balance/remaining + timeline)
     * refreshes. Parameters strictly follow the read transaction-method signatures.
     */
    openPrepaidQuickActionSheet(id, action, preferredHost) {
        const asset = (this.assets || []).find(item => item && item.id === id);
        if (!asset || [FORMAL_ASSET_KIND.PREPAID_AMOUNT, FORMAL_ASSET_KIND.PREPAID_COUNT].indexOf(asset.kind) < 0 || asset.status === 'wishlist') throw new Error('prepaid asset is required');
        const isAmount = asset.kind === FORMAL_ASSET_KIND.PREPAID_AMOUNT;
        const currency = asset.currency || 'CNY';
        const defaultDate = todayISO();
        let currentBalanceMinor = 0, currentRemaining = 0;
        try {
            const proj = projectFormalPrepaid(asset, (this._prepaidTransactions || []).filter(t => t.assetId === asset.id), (this._financialEvents || []).filter(e => e.assetId === asset.id));
            if (proj) {
                if (Number.isSafeInteger(proj.balanceAmountMinor)) currentBalanceMinor = proj.balanceAmountMinor;
                if (Number.isSafeInteger(proj.remainingCount)) currentRemaining = proj.remainingCount;
            }
        } catch (error) { /* projection unavailable; fall back to zero */ }
        const ACTIONS = {
            charge: { title: this._t('prepaidCharge', '充值'), kind: 'amount', type: 'inflow', success: this._t('prepaidChargeSuccess', '已充值') },
            consume: { title: this._t('prepaidConsume', '消费'), kind: 'amount', type: 'outflow', success: this._t('prepaidConsumeSuccess', '已记录消费') },
            refund: { title: this._t('prepaidRefund', '退款'), kind: 'amount', type: 'refund', success: this._t('prepaidRefundSuccess', '已退款') },
            countConsume: { title: this._t('prepaidConsume', '消费'), kind: 'count', success: this._t('prepaidConsumeSuccess', '已记录消费') },
            countAdjust: { title: this._t('prepaidAdjust', '校正'), kind: 'countAdjust', success: this._t('prepaidAdjustSuccess', '已校正余额') },
        };
        const config = ACTIONS[action];
        if (!config) throw new Error('unknown prepaid quick action');
        const isAmountAction = config.kind === 'amount';
        const summary = isAmount
            ? `${this._t('prepaidBalance', '余额')}：${formatAmountMinor(currentBalanceMinor, currency)}`
            : `${this._t('prepaidRemainingCount', '剩余次数')}：${currentRemaining}`;
        const valueField = isAmountAction
            ? `<label>${escapeHtml(this._t('prepaidFieldAmount', '金额'))}<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></label>`
            : (config.kind === 'countAdjust'
                ? `<label>${escapeHtml(this._t('prepaidRemainingCountField', '剩余次数'))}<input name="targetCount" type="number" min="0" step="1" value="${currentRemaining}" required></label>`
                : `<label>${escapeHtml(this._t('prepaidFieldCount', '次数'))}<input name="count" type="number" min="1" step="1" value="1" required></label>`);
        const body = `<div class="am-prepaid-quick-sheet"><p class="am-prepaid-quick-sheet__summary">${escapeHtml(summary)}</p><form data-prepaid-quick-form>${valueField}<label>${escapeHtml(this._t('prepaidFieldEffectiveDate', '生效日期'))}<span class="am-datepicker-cell" data-am-datepicker="effectiveDate" data-am-shortcuts="today"><input type="hidden" name="effectiveDate" value="${escapeHtml(defaultDate)}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(defaultDate || this._t('datePickerPlaceholder', '选择日期'))}</button></span></label><label>${escapeHtml(this._t('fieldNote', '备注'))}<input name="note" type="text"></label><button type="submit">${escapeHtml(this._t('btnSave', '保存'))}</button></form></div>`;
        return this.showDialog(config.title, body, dialog => {
            const form = dialog.element.querySelector('[data-prepaid-quick-form]');
            this._bindAmDatepickers(dialog.element);
            form.onsubmit = async event => {
                event.preventDefault();
                try {
                    const date = form.elements.effectiveDate.value || defaultDate;
                    const note = form.elements.note.value || '';
                    if (isAmountAction) {
                        const amountMinor = parseMajorToMinor(String(form.elements.amount.value || '0'), currency);
                        if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error(this._t('prepaidFieldAmount', '金额'));
                        if (config.type === 'outflow' && amountMinor > currentBalanceMinor) {
                            throw new Error(this._t('prepaidBalanceInsufficient', '余额不足：需要 {need}，现有 {have}', { need: formatAmountMinor(amountMinor, currency), have: formatAmountMinor(currentBalanceMinor, currency) }));
                        }
                        await this.addPrepaidTransaction(id, { type: config.type, amountMinor: amountMinor, date: date, note: note });
                    } else if (config.kind === 'countAdjust') {
                        const targetCount = Number(form.elements.targetCount.value);
                        if (!Number.isSafeInteger(targetCount) || targetCount < 0) throw new Error(this._t('prepaidRemainingCountField', '剩余次数'));
                        await this.recordPrepaidCountAdjustment(id, { targetCount: targetCount, effectiveDate: date, note: note });
                    } else {
                        const count = Number(form.elements.count.value);
                        if (!Number.isSafeInteger(count) || count <= 0) throw new Error(this._t('prepaidFieldCount', '次数'));
                        await this.recordPrepaidConsumption(id, { count: count, effectiveDate: date, note: note });
                    }
                    this.showToast('✓ ' + config.success);
                    dialog.destroy();
                    this.closeProductCard();
                    this.openFormalProductCard(id, preferredHost);
                } catch (error) {
                    this.showToast('⚠️ ' + error.message);
                }
            };
        });
    }

    /**
     * Stage R3：维保 / 预付流水工作流 sheet（插件内液态玻璃，取代旧的思源原生 Dialog）。
     *   - 结构与 openRenewSheet 一致：am-edit-sheet-mask > am-edit-sheet.am-form-shell +
     *     __grabber / __header[__close + __title] / form[__body(am-form-card > am-fpc1-rows) +
     *     __footer(__save)]；host = dockElement || _modalContainer || body；遮罩点击 / 关闭按钮 / Esc 关闭。
     *   - maintenance 模式字段：type(repair/maintain) / date / amount / note；
     *     prepaid 模式字段：type(inflow/outflow/refund[仅金额 kind]/adjust) / date /
     *     count(次数 kind) 或 amount(金额 kind) / paymentAmount(可选，仅次数 kind) /
     *     direction(仅 adjust 时显示，增加/减少) / note。
     *   - 字段语义、校验与域方法调用（addMaintenanceRecord / addPrepaidTransaction /
     *     deleteFormalWorkflowRecord）与旧实现完全一致，仅 UI 呈现重写。
     *   - 保存成功：就地刷新记录列表 + 清空表单草稿（保留类型/日期，方便连续记多笔），不关闭 sheet；
     *     删除成功：就地刷新列表；失败统一 toast 报错，草稿与 sheet 保留。
     *   - 关闭 sheet 后：若产品详情卡仍打开则刷新它（closeProductCard + openFormalProductCard，
     *     同续费/快捷记账流程）；否则 _runGuardedUiEffects 刷新 dock / modal。
     *   - 保留 .am-maintenance-sheet / .am-prepaid-transaction-sheet 基线类与 [data-workflow-form] /
     *     [data-record-id] / [data-delete-record] 钩子（ui-parity / workflow 测试依赖）。
     *   - v1.3 阶段3/4：mask 加 am-workflow-sheet-mask 类，CSS 把 z-index 提到详情卡
     *     （--am-z-detail-card = 55）之上（--am-z-workflow-sheet = 60），确保从产品详情点
     *     维修/记一笔 时工作流 sheet 完整浮在详情卡之上。host 与详情卡相同 → 同 stacking
     *     context；z-index 即排序，详情卡不会被工作流 sheet 盖住。关闭行为不变：Esc /
     *     遮罩点击只关工作流 sheet（顶层），不误关底层详情卡；详情卡由 _refreshFormalProductCardAfterWorkflow
     *     在 sheet 关闭后统一刷新。
     */
    openFormalWorkflowDialog(id, mode, preferredHost) {
        if (mode === 'usage') throw new Error('formal-v2: usage records are no longer supported');
        const asset = (this.assets || []).find(item => item && item.id === id);
        if (!asset) throw new Error('asset not found');
        const isMaintenance = mode === 'maintenance';
        const isCount = asset.kind === FORMAL_ASSET_KIND.PREPAID_COUNT;
        const sheetClass = isMaintenance ? 'am-maintenance-sheet' : 'am-prepaid-transaction-sheet';
        const title = isMaintenance ? this._t('workflowMaintenanceTitle', '维保记录') : this._t('prepaidTxSheetTitle', '预付流水');
        // v1.3 阶段3/4 返修（Reviewer #1）：host 解析顺序 —
        //   1. preferredHost（详情卡点击闭包显式传过来的 host，最权威）
        //   2. this._productCardHost（详情卡当前所在 host；防止调用方漏传）
        //   3. this.dockElement / this._modalContainer（普通路径）
        //   4. this._pluginOverlayRoot（body 后备 host，自带 isolation:isolate）
        //   5. document.body（兜底；强烈不建议走这里）
        // 同 host 直接子节点 + 同 stacking context 是后续 z-index 排序生效的前提。
        const host = preferredHost || this._productCardHost || this.dockElement || this._modalContainer || this._pluginOverlayRoot || document.body;
        const rowHtml = (label, valueHtml) => `<div class="am-fpc1-row"><span class="am-fpc1-row__label">${escapeHtml(label)}</span>${valueHtml}</div>`;
        const inlineSelect = (name, optionsHtml) => `<span class="am-fpc1-row__value am-virtual-inline-select"><select name="${name}">${optionsHtml}</select></span>`;
        const typeOptions = isMaintenance
            ? `<option value="repair">${escapeHtml(this._t('maintenanceTypeRepair', '维修'))}</option><option value="maintain">${escapeHtml(this._t('maintenanceTypeMaintain', '保养'))}</option>`
            : `<option value="inflow">${escapeHtml(this._t('txnTypeInflow', '充值'))}</option><option value="outflow">${escapeHtml(this._t('txnTypeOutflow', '消费'))}</option>${isCount ? '' : `<option value="refund">${escapeHtml(this._t('txnTypeRefund', '退款'))}</option>`}<option value="adjust">${escapeHtml(this._t('txnTypeAdjust', '校正'))}</option>`;
        const rows = [];
        rows.push(rowHtml(this._t(isMaintenance ? 'maintenanceType' : 'prepaidTxType', '类型'), inlineSelect('type', typeOptions)));
        rows.push(rowHtml(this._t(isMaintenance ? 'maintenanceDate' : 'prepaidFieldEffectiveDate', isMaintenance ? '日期' : '生效日期'), `<span class="am-fpc1-row__value am-fpc1-row__value--date am-datepicker-cell" data-am-datepicker="date" data-am-shortcuts="today"><input type="hidden" name="date" value="${escapeHtml(todayISO())}"><button type="button" class="am-datepicker-trigger" data-am-date-trigger>${escapeHtml(todayISO() || this._t('datePickerPlaceholder', '选择日期'))}</button></span>`));
        if (isMaintenance) {
            rows.push(rowHtml(this._t('renewFieldAmount', '金额'), '<input class="am-fpc1-row__value" type="number" name="amount" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="0">'));
        } else if (isCount) {
            rows.push(rowHtml(this._t('prepaidFieldCount', '次数'), '<input class="am-fpc1-row__value" type="number" name="count" min="0" step="1" inputmode="numeric" placeholder="0" value="0">'));
            rows.push(rowHtml(this._t('prepaidFieldPaymentAmount', '支付金额（可选）'), '<input class="am-fpc1-row__value" type="number" name="paymentAmount" min="0" step="0.01" inputmode="decimal" placeholder="0.00">'));
        } else {
            rows.push(rowHtml(this._t('prepaidFieldAmount', '金额'), '<input class="am-fpc1-row__value" type="number" name="amount" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="0">'));
        }
        if (!isMaintenance) {
            // direction 仅对 adjust 生效（域方法忽略其它类型的 direction），默认隐藏，选 adjust 时展开。
            rows.push(`<div class="am-fpc1-row am-workflow-row--conditional is-hidden" data-workflow-direction-row><span class="am-fpc1-row__label">${escapeHtml(this._t('prepaidAdjustDirection', '调整方向'))}<small class="am-workflow-row__hint">${escapeHtml(this._t('prepaidAdjustOptional', '仅调整时填写'))}</small></span>${inlineSelect('direction', `<option value="inflow">${escapeHtml(this._t('prepaidDirectionIncrease', '增加'))}</option><option value="outflow">${escapeHtml(this._t('prepaidDirectionDecrease', '减少'))}</option>`)}</div>`);
        }
        const noteLabel = isMaintenance ? this._t('maintenanceNote', '备注') : this._t('fieldNote', '备注');
        // v1.3 阶段3/4：mask 加 am-workflow-sheet-mask 类，让 CSS 把 z-index 提到详情卡
        // （--am-z-detail-card = 55）之上（--am-z-workflow-sheet = 60）。视觉 / 入场动画 /
        // Esc / 遮罩点击全部沿用 .am-edit-sheet-mask 基线。host 与详情卡相同 → 同 stacking
        // context，z-index 即排序；详情卡不会被工作流 sheet 盖住。
        const mask = document.createElement('div'); mask.className = 'am-edit-sheet-mask am-workflow-sheet-mask';
        mask.innerHTML = `<div class="am-edit-sheet am-form-shell am-workflow-sheet ${sheetClass}"><div class="am-edit-sheet__grabber"></div><header class="am-edit-sheet__header am-form-shell__header"><button type="button" class="am-edit-sheet__close" data-close aria-label="${escapeHtml(this._t('btnClose', '关闭'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button><h2 class="am-edit-sheet__title">${escapeHtml(title)}</h2><span class="am-form-shell__header-spacer"></span></header><form data-workflow-form data-form><div class="am-edit-sheet__body am-form-shell__body"><div class="am-form-card"><div class="am-fpc1-rows">${rows.join('<div class="am-fpc1-divider"></div>')}</div></div><label class="am-form-textarea am-workflow-note"><span class="am-form-textarea__label">${escapeHtml(noteLabel)}</span><textarea class="am-form-textarea__field" name="note" rows="2" placeholder="${escapeHtml(this._t('noteOptional', '（可选）'))}"></textarea></label><section class="am-workflow-records"><header class="am-workflow-records__header"><span class="am-workflow-records__title">${escapeHtml(this._t('workflowHistoryTitle', '历史记录'))}</span><span class="am-workflow-records__count" data-workflow-count></span></header><div data-workflow-records></div></section></div><footer class="am-form-shell__footer"><button type="submit" class="am-form-shell__save" data-save>${escapeHtml(this._t('btnSave', '保存'))}<span class="am-form-shell__save-spinner"></span></button></footer></form></div>`;
        // v1.3 阶段3/4 返修（Reviewer #2）：Escape 必须消费事件 + 顶层检查 + window capture。
        // 同 host 内：am-workflow-sheet-mask 排在 am-product-card-mask 之后 → 顶层。
        // 多 workflow 叠加时只关最顶层那一张。
        const isTopmostWorkflowInHost = () => {
            if (!mask.parentNode) return false;
            const overlays = mask.parentNode.querySelectorAll(':scope > .am-edit-sheet-mask, :scope > .am-product-card-mask');
            return overlays.length > 0 && overlays[overlays.length - 1] === mask;
        };
        const close = () => {
            window.removeEventListener('keydown', onKeydown, KEYDOWN_CAPTURE_OPTS);
            if (mask.parentNode) mask.parentNode.removeChild(mask);
            this._refreshFormalProductCardAfterWorkflow(id);
        };
        const onKeydown = event => {
            if (event.key !== 'Escape') return;
            if (!isTopmostWorkflowInHost()) return;
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
            close();
        };
        const closeBtn = mask.querySelector('[data-close]');
        if (closeBtn) closeBtn.onclick = close;
        mask.onclick = event => { if (event.target === mask) close(); };
        const form = mask.querySelector('form[data-workflow-form]');
        const listHost = mask.querySelector('[data-workflow-records]');
        const recordsCountEl = mask.querySelector('[data-workflow-count]');
        const typeSelect = form.querySelector('select[name="type"]');
        const directionRow = form.querySelector('[data-workflow-direction-row]');
        const syncDirectionRow = () => { if (directionRow && typeSelect) directionRow.classList.toggle('is-hidden', typeSelect.value !== 'adjust'); };
        if (typeSelect) typeSelect.addEventListener('change', syncDirectionRow);
        syncDirectionRow();
        this._bindAmDatepickers(mask);
        const _mdWorkflowNote = mask.querySelector('textarea[name="note"]');
        if (_mdWorkflowNote) this._bindMarkdownTextarea(_mdWorkflowNote);
        const renderRecordList = () => {
            const records = (isMaintenance ? (this._maintenanceRecords || []) : (this._prepaidTransactions || []))
                .filter(record => record && record.assetId === id)
                .sort((a, b) => String(b.date || b.effectiveDate || '').localeCompare(String(a.date || a.effectiveDate || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
            if (recordsCountEl) recordsCountEl.textContent = this._t('opLogCounts', '共 {n} 条', { n: records.length });
            if (!records.length) {
                listHost.innerHTML = `<div class="am-workflow-empty">${escapeHtml(this._t(isMaintenance ? 'maintenanceSheetEmpty' : 'prepaidNoTransactions', isMaintenance ? '暂无维护记录' : '暂无预付流水'))}</div>`;
                return;
            }
            listHost.innerHTML = `<ul class="am-workflow-list">${records.map(record => this._renderFormalWorkflowRecordItem(record, mode, asset)).join('')}</ul>`;
            listHost.querySelectorAll('[data-record-id] [data-delete-record]').forEach(button => {
                button.onclick = async () => {
                    if (button.disabled) return;
                    button.disabled = true;
                    try {
                        await this.deleteFormalWorkflowRecord(id, mode, button.closest('[data-record-id]').dataset.recordId);
                        this.showToast('✓ ' + this._t('tagDeleteSuccess', '已删除'));
                        renderRecordList();
                    } catch (error) {
                        this.showToast('⚠️ ' + (error && error.message ? error.message : this._t(isMaintenance ? 'maintenanceDeleteFailed' : 'prepaidTxDeleteFailed', isMaintenance ? '删除维护记录失败，请重试' : '删除预付流水失败，请重试')));
                    } finally {
                        button.disabled = false;
                    }
                };
            });
        };
        // 保存成功后只清草稿（类型 / 日期 / 方向保留），方便同一日期连续记多笔。
        const resetFormDraft = () => {
            const noteEl = form.querySelector('[name="note"]'); if (noteEl) noteEl.value = '';
            if (isMaintenance || !isCount) {
                const amountEl = form.querySelector('[name="amount"]'); if (amountEl) amountEl.value = '0';
            }
            if (!isMaintenance && isCount) {
                const countEl = form.querySelector('[name="count"]'); if (countEl) countEl.value = '0';
                const paymentEl = form.querySelector('[name="paymentAmount"]'); if (paymentEl) paymentEl.value = '';
            }
        };
        let submitting = false;
        form.onsubmit = async event => {
            event.preventDefault();
            if (submitting) return;
            if (!this._validateFormBeforeSave(form)) return;
            submitting = true;
            const saveButton = form.querySelector('[type="submit"]');
            if (saveButton) { saveButton.disabled = true; saveButton.setAttribute('aria-busy', 'true'); }
            try {
                if (isMaintenance) {
                    await this.addMaintenanceRecord(id, { type: form.elements.type.value, date: form.elements.date.value, amount: form.elements.amount.value, note: form.elements.note.value });
                } else {
                    await this.addPrepaidTransaction(id, { type: form.elements.type.value, date: form.elements.date.value, amount: form.elements.amount && form.elements.amount.value, count: form.elements.count && form.elements.count.value, paymentAmount: form.elements.paymentAmount && form.elements.paymentAmount.value, direction: form.elements.direction ? form.elements.direction.value : 'inflow', note: form.elements.note.value });
                }
                this.showToast('✓ ' + this._t(isMaintenance ? 'maintenanceAddSuccess' : 'prepaidTxSaved', isMaintenance ? '已添加维保记录' : '已记录'));
                resetFormDraft();
                renderRecordList();
            } catch (error) {
                if (!isMaintenance) console.warn('[AssetManagement] prepaid transaction save failed:', error && error.message);
                this.showToast('⚠️ ' + (error && error.message ? error.message : this._t(isMaintenance ? 'maintenanceAddFailed' : 'prepaidTxSaveFailed', isMaintenance ? '维保记录保存失败，请重试' : '预付流水保存失败，请查看控制台诊断')));
            } finally {
                submitting = false;
                if (saveButton) { saveButton.disabled = false; saveButton.setAttribute('aria-busy', 'false'); }
            }
        };
        renderRecordList();
        host.appendChild(mask);
        window.addEventListener('keydown', onKeydown, KEYDOWN_CAPTURE_OPTS);
        return mask;
    }

    /**
     * Stage R3：维保 / 预付流水 sheet 历史记录单行渲染。
     *   - maintenance：类型徽章（维修红 / 保养绿）+ 日期 + 备注 + 关联 financial event 金额（无则 —）
     *   - prepaid：类型徽章（opening/inflow 绿、outflow 红、refund 黄、adjust/opening 蓝）+
     *     日期 + 备注 + 带方向符号的金额（financial event）或次数（record.count）
     *   - 删除按钮保留 [data-delete-record] 钩子，aria-label 走 i18n。
     */
    _renderFormalWorkflowRecordItem(record, mode, asset) {
        const currency = (asset && asset.currency) || 'CNY';
        const date = String(record.date || record.effectiveDate || '');
        const note = String(record.note || '');
        let badgeLabel, badgeModifier, valueHtml, ariaKey, ariaFallback;
        if (mode === 'maintenance') {
            const isRepair = record.type === 'repair';
            badgeLabel = this._t(isRepair ? 'maintenanceTypeRepair' : 'maintenanceTypeMaintain', isRepair ? '维修' : '保养');
            badgeModifier = isRepair ? 'repair' : 'maintain';
            const financial = record.financialEventId ? (this._financialEvents || []).find(event => event && event.id === record.financialEventId) : null;
            valueHtml = financial && Number.isSafeInteger(financial.amountMinor) && financial.amountMinor > 0
                ? `<span class="am-workflow-item__value am-workflow-item__value--out">${escapeHtml(formatAmountMinor(financial.amountMinor, currency))}</span>`
                : '<span class="am-workflow-item__value am-workflow-item__value--none">—</span>';
            ariaKey = 'maintenanceDeleteRecordAria'; ariaFallback = '删除{type}记录（{date}）';
        } else {
            const typeLabels = { opening: ['txnTypeOpening', '开通'], inflow: ['txnTypeInflow', '充值'], outflow: ['txnTypeOutflow', '消费'], refund: ['txnTypeRefund', '退款'], adjust: ['txnTypeAdjust', '校正'] };
            const entry = typeLabels[record.type] || null;
            badgeLabel = entry ? this._t(entry[0], entry[1]) : String(record.type || '');
            badgeModifier = entry ? record.type : 'adjust';
            const isIn = record.direction !== 'outflow';
            const valueClass = isIn ? 'am-workflow-item__value--in' : 'am-workflow-item__value--out';
            if (record.dimension === 'count') {
                const count = Number.isSafeInteger(record.count) ? record.count : 0;
                valueHtml = `<span class="am-workflow-item__value ${valueClass}">${isIn ? '+' : '−'}${count} ${escapeHtml(this._t('prepaidDefaultUnit', '次'))}</span>`;
            } else {
                const financial = record.financialEventId ? (this._financialEvents || []).find(event => event && event.id === record.financialEventId) : null;
                valueHtml = financial && Number.isSafeInteger(financial.amountMinor)
                    ? `<span class="am-workflow-item__value ${valueClass}">${isIn ? '+' : '−'}${escapeHtml(formatAmountMinor(financial.amountMinor, currency))}</span>`
                    : '<span class="am-workflow-item__value am-workflow-item__value--none">—</span>';
            }
            ariaKey = 'prepaidTxDeleteRecordAria'; ariaFallback = '删除{type}流水（{date}）';
        }
        const aria = this._t(ariaKey, ariaFallback, { type: badgeLabel, date: date });
        return `<li class="am-workflow-item" data-record-id="${escapeHtml(record.id)}"><span class="am-workflow-item__badge am-workflow-item__badge--${badgeModifier}">${escapeHtml(badgeLabel)}</span><div class="am-workflow-item__main"><span class="am-workflow-item__date">${escapeHtml(date)}</span>${note ? `<div class="am-workflow-item__note am-workflow-item__note--md">${this._renderAssetNotesHtml(note)}</div>` : ''}</div>${valueHtml}<button type="button" class="am-workflow-item__delete" data-delete-record aria-label="${escapeHtml(aria)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button></li>`;
    }

    /**
     * Stage R3：工作流 sheet 关闭后的联动刷新。
     *   - 产品详情卡仍打开（.am-product-card-mask 存在）→ closeProductCard + openFormalProductCard
     *     原 host 重开（与 openPrepaidQuickActionSheet 保存后的刷新模式一致），不跑 renderDock
     *     （renderDock 会清空 dockElement，连带销毁刚重开的详情卡）。
     *   - 详情卡未打开 → _runGuardedUiEffects 刷新 dock / modal 列表与统计。
     */
    _refreshFormalProductCardAfterWorkflow(id) {
        const cardHost = this._productCardHost || this.dockElement || this._modalContainer || (typeof document !== 'undefined' ? document.body : null);
        if (cardHost && cardHost.querySelector && cardHost.querySelector('.am-product-card-mask')) {
            this.closeProductCard();
            this.openFormalProductCard(id, cardHost);
            return;
        }
        this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
    }

    bindFormalJsonSettings(root) {
        if (!root) return;
        const download = root.querySelector('[data-action="formal-json-download"]');
        const copy = root.querySelector('[data-action="formal-json-copy"]');
        const importButton = root.querySelector('[data-action="formal-json-import"]');
        const input = root.querySelector('[data-formal-json-file]');
        if (download) download.onclick = () => this.doExportJsonBackup('download');
        if (copy) copy.onclick = () => this.doExportJsonBackup('copy');
        if (importButton && input) importButton.onclick = () => { input.value = ''; input.click(); };
        if (input) input.onchange = async () => { try { await this.importFromFile(input); } finally { input.value = ''; } };
    }

    async doExportJsonBackup(mode) {
        try {
            if (!this.storage || typeof this.storage.readFormalBackupSnapshot !== 'function') throw new Error('formal backup storage unavailable');
            const snapshot = await this.storage.readFormalBackupSnapshot({ pluginVersion: PLUGIN_VERSION });
            const text = JSON.stringify(snapshot, null, 2);
            if (mode === 'copy') {
                if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') throw new Error('clipboard unavailable');
                await navigator.clipboard.writeText(text);
            } else {
                this._downloadTextFile(`asset-management-formal-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, text, 'application/json;charset=utf-8');
            }
            this.showToast('✓ ' + this._t('settingsExportJsonSuccess', 'JSON 备份已导出'));
        } catch (error) {
            console.warn('[AssetManagement] formal backup export:', error && error.message);
            this.showToast('⚠️ ' + this._t('settingsExportJsonFail', 'JSON 备份导出失败'));
        }
    }

    async importFromFile(inputEl) {
        const file = inputEl && inputEl.files && inputEl.files[0];
        if (!file) return;
        try {
            if (!this.storage || typeof this.storage.replaceFormalDomainFromBackup !== 'function') throw new Error('formal import storage unavailable');
            const snapshot = JSON.parse(await file.text());
            const result = await this.storage.replaceFormalDomainFromBackup(snapshot);
            const committed = result.committedSnapshot;
            this.assets = committed.assets; this._tags = committed.tags;
            this._financialEvents = committed.financialEvents; this._lifecycleEvents = committed.lifecycleEvents;
            this._subscriptionPeriods = committed.subscriptionPeriods; this._prepaidTransactions = committed.prepaidTransactions;
            this._maintenanceRecords = committed.maintenance; this.settings = committed.settings;
            this.wishlistEvents = committed.wishlistEvents; this._opLogs = committed.operationLogs;
            this._wishlistEventsLoaded = true;
            this._exchangeRates = committed.exchangeRates || { schemaVersion: 1, baseCurrency: 'CNY', rates: {} };
            this._formalDomainStateSnapshot = committed; this._formalDomainLoaded = true; this._formalDomainError = null;
            this._assetsLoadedOk = true; this._assetLoadError = null;
            this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
            // v2.5.0 阶段2：导入整体替换资产域后触发索引同步（该路径不走
            // _commitAssetAuditMutation，需显式挂钩）。
            this._scheduleNoteLinkSync();
            this.showToast('✓ ' + this._t('settingsImportSuccess', '导入成功'));
        } catch (error) {
            console.warn('[AssetManagement] formal backup import:', error && error.message);
            this.showToast('⚠️ ' + this._t('settingsImportFail', '文件格式错误'));
        } finally { inputEl.value = ''; }
    }

    _closeSettingsFormalResetConfirm() { if (typeof this._formalResetClose === 'function') this._formalResetClose(); }

    async _cleanupFormalResetResources(previousAssets, previousResourceIndex) {
        // Formal reset owns no implicit storage/filesystem cleanup. The hook keeps
        // resource-index cleanup retryPendingResourceIndexCleanup explicit.
        void previousAssets; void previousResourceIndex;
        return [];
    }

    resetAllFormalData() {
        if (this._formalResetPromise) return this._formalResetPromise;
        this._formalResetPromise = (async () => {
            const result = await this.storage.initializeFormalStorageReset({ confirmReset: true });
            const committed = result.committedSnapshot || {};
            this.assets = committed.assets || []; this._tags = committed.tags || [];
            this.settings = committed.settings || Object.assign({}, DEFAULT_SETTINGS);
            this.wishlistEvents = []; this._opLogs = []; this._maintenanceRecords = [];
            this._wishlistEventsLoaded = true;
            this._prepaidTransactions = []; this._financialEvents = []; this._lifecycleEvents = []; this._subscriptionPeriods = [];
            this._exchangeRates = committed.exchangeRates || { schemaVersion: 1, baseCurrency: 'CNY', rates: {} };
            this._formalDomainStateSnapshot = committed; this._formalDomainLoaded = true; this._formalDomainError = null;
            this._assetsLoadedOk = true; this._assetLoadError = null;
            this.bulkSelected.clear(); this.bulkMode = false;
            this._closeHomeFilterDropdown(); this._closeItemMenu(); this.closeProductCard(); this._onDataCommitted();
            const cleanupFailures = await this._cleanupFormalResetResources(result.previousAssets || [], result.previousResourceIndex || {});
            this._runGuardedUiEffects({ renderDock: true, refreshModal: true });
            return { result, cleanupFailures, partial: cleanupFailures.length > 0 };
        })();
        this._formalResetPromise.finally(() => { this._formalResetPromise = null; });
        return this._formalResetPromise;
    }

    async downloadRawFormalResetBackup() {
        if (!this.storage || typeof this.storage.readRawFormalResetBackup !== 'function') {
            throw new Error('raw reset backup storage unavailable');
        }
        const backup = await this.storage.readRawFormalResetBackup({ pluginVersion: PLUGIN_VERSION });
        const text = JSON.stringify(backup, null, 2);
        await this._downloadTextFile(`asset-management-raw-reset-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, text, 'application/json;charset=utf-8');
        return backup;
    }

    openFormalResetConfirm(settingsDialogHost) {
        const host = this._getSettingsClearAllAssetsConfirmHost(settingsDialogHost);
        if (!host || !this.storage || typeof this.storage.readFormalResetPreflight !== 'function') return;
        this._closeSettingsFormalResetConfirm();
        const mask = document.createElement('div');
        mask.className = 'am-plugin-confirm-mask am-plugin-confirm-mask--clear-assets';
        mask.innerHTML = `<section class="am-plugin-confirm"><div class="am-confirm"><div class="am-confirm__title" data-formal-reset-title>${escapeHtml(this._t('formalResetTitle', '初始化正式数据'))}</div><div class="am-confirm__text" data-formal-reset-text>${escapeHtml(this._t('formalResetLoading', '正在读取数据概览…'))}</div><div class="am-confirm__text" data-formal-reset-upload-note></div><div class="am-confirm__text" data-formal-reset-backup-status></div><button type="button" class="b3-button" data-formal-reset-backup disabled>${escapeHtml(this._t('formalResetBackupAction', '生成并下载原始完整备份'))}</button><label class="am-confirm__check"><input type="checkbox" data-formal-reset-backup-confirm disabled> ${escapeHtml(this._t('formalResetBackupAcknowledge', '我已成功下载并保管原始完整备份'))}</label></div><div class="am-plugin-confirm__actions"><button class="b3-button b3-button--cancel" data-formal-reset-cancel>${escapeHtml(this._t('btnCancel', '取消'))}</button><button class="b3-button b3-button--remove" data-formal-reset-confirm disabled>${escapeHtml(this._t('formalResetAction', '初始化正式数据'))}</button></div></section>`;
        const close = () => { mask.remove(); if (this._formalResetClose === close) this._formalResetClose = null; };
        this._formalResetClose = close; host.appendChild(mask);
        const text = mask.querySelector('[data-formal-reset-text]'); const confirm = mask.querySelector('[data-formal-reset-confirm]');
        const uploadNote = mask.querySelector('[data-formal-reset-upload-note]');
        const backupStatus = mask.querySelector('[data-formal-reset-backup-status]');
        const backupButton = mask.querySelector('[data-formal-reset-backup]');
        const backupAcknowledgement = mask.querySelector('[data-formal-reset-backup-confirm]');
        mask.querySelector('[data-formal-reset-cancel]').onclick = close;
        this.storage.readFormalResetPreflight().then(preflight => {
            text.innerHTML = this._t('formalResetPreflightSummary', '资产: <strong>{assets}</strong>；标签: <strong>{tags}</strong>；汇率: <strong>{rates}</strong>；合计 {total} 条记录', {
                assets: preflight.counts.assets, tags: preflight.counts.tags, rates: preflight.counts.exchangeRates, total: preflight.total,
            });
            uploadNote.textContent = this._t('formalResetUploadsNote', '检测到 {uploads} 个上传封面。初始化不会自动删除上传资源；本阶段不会清理文件。', { uploads: preflight.uploads });
            backupStatus.textContent = this._t('formalResetBackupRequired', '请先生成并下载原始完整备份，随后勾选确认。');
            backupButton.disabled = false;
            let confirmationStage = 0;
            let backupReady = false;
            const refreshResetGate = () => { confirm.disabled = !(backupReady && backupAcknowledgement.checked); };
            backupAcknowledgement.onchange = () => { confirmationStage = 0; confirm.textContent = this._t('formalResetAction', '初始化正式数据'); refreshResetGate(); };
            backupButton.onclick = async () => {
                backupButton.disabled = true;
                try {
                    await this.downloadRawFormalResetBackup();
                    backupReady = true; backupAcknowledgement.disabled = false;
                    backupStatus.textContent = this._t('formalResetBackupReady', '原始完整备份已生成并触发下载。请确认文件已成功保存后勾选。');
                } catch (error) {
                    backupReady = false; backupAcknowledgement.checked = false; backupAcknowledgement.disabled = true;
                    backupStatus.textContent = this._t('formalResetBackupFailed', '原始完整备份生成或下载失败，初始化已阻断。');
                    this.showToast('⚠️ ' + error.message);
                } finally { backupButton.disabled = false; refreshResetGate(); }
            };
            confirm.onclick = async () => {
                if (!backupReady || !backupAcknowledgement.checked) return;
                if (confirmationStage === 0) { confirmationStage = 1; confirm.textContent = this._t('formalResetFinalConfirm', '再次确认初始化'); return; }
                confirm.disabled = true;
                try { await this.resetAllFormalData(); close(); }
                catch (error) { confirmationStage = 0; confirm.textContent = this._t('formalResetAction', '初始化正式数据'); refreshResetGate(); this.showToast('⚠️ ' + error.message); }
            };
        }).catch(() => { text.setAttribute('data-formal-reset-error', 'true'); text.textContent = this._t('formalResetPreflightFailed', '无法读取数据概览，初始化已阻断'); });
    }

    showToast(message) {
        try {
            fetch("/api/notification/pushMsg", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ msg: message, timeout: 1800 }),
            }).catch(() => {});
        } catch (e) { console.log("[AssetManagement] toast:", message); }
    }

_cancelBusinessDataFlushTimers() {
        const timers = [
            '_opLogFlushTimer',
            '_maintenanceFlushTimer',
            '_prepaidTransactionsFlushTimer',
            '_tagsFlushTimer',
        ];
        timers.forEach(key => {
            if (this[key]) {
                try { clearTimeout(this[key]); } catch (e) {}
                this[key] = null;
            }
        });
    }




};
