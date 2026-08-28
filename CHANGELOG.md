# 更新日志 / Changelog

> 完整版本记录。对外 README 仅保留最新三个版本，完整历史见本文件。

## 中文

### v2.6.3

**报表分析卡片 + 汇率自动更新**

- 新增：报表新增「订阅分析」——订阅中 / 试用 / 已停订数量、月度支出（按账单周期折算）、累计支出，以及未来 30 天内续费的订阅清单与金额。
- 新增：报表新增「预付分析」——总余额与剩余次数、累计充值与消费、使用率，以及未来 30 天内到期的预付清单。
- 改进：「订阅分析」「预付分析」「种草转化」合并为报表页的一张分析卡片，通过卡片顶部的「订阅 / 预付 / 种草」按钮切换查看，报表更紧凑；三个视图排版统一。
- 改进：仅有对应资产时才出现对应按钮——有订阅资产才显示「订阅」，有预付资产才显示「预付」；「种草」始终显示，不影响现有报表内容。
- 新增：设置中的汇率支持自动更新——打开应用时，若距上次更新超过 24 小时，自动获取美元、欧元、英镑兑人民币的最新汇率；可在设置中随时关闭自动更新。
- 新增：汇率区域展示当前汇率、更新来源（自动更新 / 手动设置）与最近刷新时间，并提供「立即刷新」。
- 新增：手动修正汇率支持美元、欧元、英镑三种货币；手动修正后自动更新不会覆盖，想改回自动可使用「恢复自动汇率」。
- 构建：版本号升至 `2.6.3`（合并原 2.6.3 与 2.6.4 两个批次），同步更新双语 README、构建产物和发布包。

### v2.6.2

**总额只算在役、回收金额内联展示与索引文档退役日期**

- 改进：首页「我的资产」总金额与日均消费只统计在役物品，退役物品不再占用总额；有转卖收入时，总金额旁内联显示「已回收:」金额。
- 改进：报表「资产概览」的总金额与退役回收均压缩为单行展示，并附资产数量。
- 新增：笔记索引文档中，退役资产条目新增退役日期，与在役资产的到期日期列对齐。
- 修复：新建资产时直接选择退役，转让价格此前会被静默丢弃，现在会正确记录为回收收入。
- 修复：编辑退役资产时转让价格现在会自动回填；修改转让价格会保存为新的回收记录。
- 改进：资产列表卡片去掉多余的上下边距，列表上下边缘不再过宽。
- 构建：版本号升至 `2.6.2`，同步更新双语 README、构建产物和发布包。

### v2.6.1

**种草历程、笔记引用方向与表单体验优化**

- 新增：产品卡显示种草日期；已购买资产在有数据时显示种草日期、心动次数和购买日期。
- 新增：报表增加种草转化投影，统计种草总数、种草中、购买、拔草、购买率和拔草率，且不混入正式资产总数。
- 新增：笔记关联区区分「资产引用的笔记」与「引用资产的笔记」。
- 改进：种草转化区改为左右双列布局，适配窄屏展示。
- 改进：表单保存时禁用浏览器原生校验气泡，改用字段化内联提示，例如「请填写名称」，并在输入有效后自动清除。
- 构建：版本保持 `2.6.1`，同步更新双语 README、构建产物和发布包。

### v2.6.0

**内核 Agent 工具（registerCapability）**

- 新增：内核插件 `kernel.js`（Goja 沙箱）在 `siyuan.plugin.lifecycle.onload` 时优先通过 `siyuan.mcp.registerTool`、并回退 `siyuan.agent.registerCapability` 注册 9 个工具，内置 Agent 与 MCP 均可调用；`plugin.json` 新增 `"kernels": ["all"]`。
- 新增：专用 `asset_price_update` 工具。它根据资产类型自动路由到购买事件或最新订阅付款的正式替换事务，避免 AI 误用 `maintenance` 或 `renewSubscription`；旧 `asset_record` 价格操作继续兼容。
- 新增：`asset_tag_update` / `asset_tag_create` 标签工具，支持精确名称匹配、创建与绑定的 formal 原子事务，以及查询结果的本地化 display 投影。
- 安全：Agent 写入在支持 Web Locks 时使用单协调者；不支持安全协调时 fail-closed，避免跨实例重复执行财务或生命周期操作。
- 写桥：查询类工具实时读共享 storage 目录并返回脱敏投影；新写入使用 `pending/processing/completed` 独立请求文件，前端在 Web Locks 协调下认领并委托正式业务方法执行；不支持安全协调时拒绝写入，内核 I/O 超时（30s）返回 `WRITE_TIMEOUT`。旧 `agent-write-queue.json / agent-write-results.json` 仅用于兼容收尾。
- 权限：新增总开关和查询、创建、修改、生命周期、记录、删除六个独立权限；总开关默认关闭、查询权限默认开启，其余写权限默认关闭。内核侧每次调用实时读取 settings，前端派发前按 method→权限映射二次校验（出售/续费需 Lifecycle+Records 双权限）；权限错误双语提示开启位置。
- 实时性：每个 handler 调用时读取最新 settings，关闭总开关或任一权限后立即拒绝对应工具；内核侧 onunload 逐个 `unregisterCapability` 并更新注册心跳 `agent-kernel-status.json`。
- 写入边界：action helper 只做参数校验、受控投影和方法委托；创建、修改、状态、出售、续费、维保、预付交易与删除均复用插件现有业务方法，未知方法显式报错。
- 安全：查询使用完整 formal-v2 内存快照；分页默认 50、最大 200，写入始终要求精确 UUID。汇总报表字段异常时退回稳定计数，不向 Agent 返回异常堆栈或本地路径。
- 设置迁移：移除旧顾问的隐私范围、财务/备注、资产数量和语言字段，只保留 Agent 总开关与六个权限字段；settings 写入继续使用 merge，备份/恢复保持往返。
- 清理：删除旧 `/api/ai/chatGPT` 直连、上下文清空、连接检查、提示词、回答和复制 UI；前端不再使用 `addAgentAction`（思源 3.8.0 前端无此 API）。

### v2.5.0

**思源索引文档 + 资产块引用双向关联**

- 新增：可选的思源资产索引文档。索引由插件自动维护，每个资产对应一个带 `custom-asset-id` 与内容哈希的真实段落块；`indexDocId` 是同步唯一依据，文档移动、重命名或跨笔记本后仍可继续同步。
- 新增：索引设置提供 `unconfigured / ready / closed / missing / error` 安全状态引导；关闭笔记本时暂停，索引文档删除后不自动新建，只有用户显式确认才创建或重建，支持立即同步与原地修复。
- 新增：原生资产块引用支持复制与斜杠命令插入；相关笔记聚合块引反链、`custom-asset-id` 块打标与手动关联，并在 owned / wishlist 产品卡统一展示来源、文档标题和内容预览。
- 新增：块图标菜单可将当前块关联到资产、在资产管理中查看或取消关联；产品卡可登记笔记文档并跳转到关联块。
- 交互：普通点击资产块引用直接打开产品卡；Ctrl / Meta / Shift / Alt 等修饰键保持思源原生跳转。右键和移动端长按同时提供「打开产品卡」与「在索引文档中定位」，移动端使用原生文件跳转能力。
- 修复：索引提示 header 重复；`updateBlock` 后 custom attrs 丢失；关闭笔记本、索引文档删除及 API code 3 响应被误判为普通可用或异常状态。
- 数据：formal-v2 owned 实体新增可选 `indexBlockId` 与 `relatedNotes`；≤2.4.2 数据缺键按 `null / []` 读取，无迁移无重置。settings 新增六个索引配置键，仍使用 `schemaVersion=1`。
- 兼容性：最低思源版本提升至 3.8.0。

### v2.4.2

**心动值——种草养成式决策**

- 新增：种草「心动值」——种草时可填可选「目标心动值」（1–999 整数，留空 = 无目标纯计数）；每次想买点一下「心动」，草长高一档：有目标六档 种子🌰→发芽🌱→小草🌿→茂盛☘️→含苞🌷→开花🌸，无目标纯计数 + 五档里程碑。
- 新增：种草池卡片新增心动 pill（阶段 emoji + 计数），卡上直点 +1，不用打开详情卡；达标后 pill 与购买按钮高亮、名称行出现「可以买了」徽章（购买不阻止）。
- 新增：种草详情卡新增「心动值」section——阶段大图标 + 进度条（仅有目标）+「心动」大按钮 +「撤销最近一次心动」（仅 count>0 显示）；仅达标当次点击 toast「🌸 心动值满了，可以买啦！」。
- 新增：添加/编辑种草表单新增「目标心动值」可选输入行（空 = 无目标纯计数；1–999 整数校验）。
- 新增：已购买/已拔草历史卡显示「心动 N 次」小字（N>0 显示）。
- 数据：wishlist 子对象白名单新增 heartbeatTarget（null 或 1–999）；wishlistEvents sidecar 新增 heartbeat 事件类型（复用 13 键信封，心动计数严格派生自事件流、不落主表）；report.js 新增 deriveWishlistHeartbeat / describeWishlistHeartbeat 只读投影；≤2.4.1 存量数据缺键读取容忍为 null，无迁移无重置。
- 修复：wishlist 资产硬删除因 'delete' 操作日志与 wishlist-exclusion 契约冲突必然事务失败的问题（wishlist 分支改透传操作日志、不写日志）。
- 不动：formal-v2 主实体契约键集结构（仅增一个可选子字段）、sidecar 13 键结构。

### v2.4.1

**表单打磨 + 币种下拉统一 + 种草价格跟踪 + 种草池重设计**

- 改进：种草表单优化——去掉「购买时根据目标组别自动打开对应表单」提示；「期望价格」输入不再带写死货币标志；「目标组别」改名「类型」；种草理由去掉单独标题，改灰色占位文案。
- 改进：币种下拉统一——实物资产价格行去除 (¥) 标识、新增币种下拉；实物 / 虚拟 / 预付币种下拉统一为液态玻璃风格（编辑态锁定，与订阅周期下拉质感一致）。
- 新增：种草详情卡新增「更新价格」与「价格趋势」曲线图（样式与报表曲线同源）；价格变化以 expectedPriceChanged 事件记录在 wishlistEvents sidecar。
- 改进：种草池卡片布局与首页列表视图同步——左侧封面 + 名称（状态点 + 类型 chip）+ 期望价，横线分隔；横线下左侧迷你价格曲线（报表同源平滑曲线样式）+「更新价格」pill 卡上直接可点，右侧 拔草/购买 pill 收到右下角，按钮文字更小。
- 改进：列表视图图标 48→52px、矩阵视图图标 52→56px（窄屏 46→50px），间距微调，卡片外框尺寸不变。
- 改进：种草详情卡清理——wishlist 状态不再渲染 到期（保修）/ 保养与维修 / 订阅历程 / 预付流水等记录区与对应入口，基础区仅保留类型行。
- 新增：详情卡价格趋势区「更新记录」列表（日期 + 旧→新价格），每条记录可删除以更正误输入；删除中间记录自动重接事件链，删除最新记录回退当前期望价。
- 改进：更新期望价格 sheet 输入行去框（与添加种草表单价格行同款无边框样式），去掉小字提示。
- 修复：产品卡内打开「更新价格」sheet 被详情卡遮挡的问题（sheet 层级提到详情卡之上，与维保/预付流水 sheet 同方案）。
- 改进：更新期望价格 sheet 的价格行与添加资产表单同款——期望价格 label + 币种玻璃下拉（锁定态）+ 右对齐输入 + 行下横线，更直观。
- 改进：删除价格更新记录前增加插件范围内二次确认（确认弹窗只覆盖插件面板，不越出插件区域）。
- 改进：拔草 sheet 与添加种草表单同款——顶部 × 关闭（替换原文字「取消」）、右上确认按钮去掉、底部「拔草」保存；拔草理由放进 am-form-textarea 灰字占位（placeholder「拔草原因」），名称移出卡片居中展示。
- 改进：种草产品卡去掉「成本」section（未购入无实际成本）——价格趋势 section 紧跟基础区出现，详情卡更清爽。
- 改进：预设封面图标去除边框与投影，仅保留圆角矩形图案（底色保留作透明 PNG 基底），与上传图的无边框裁切视觉统一。
- 修复：编辑种草资产报错（「种草不支持自定义图片」）——通用资产表单保存的字段与 wishlist patch 白名单冲突；编辑种草改走专属种草表单（支持改名 / 换封面 / 改期望价 / 理由 / 类型），新增 updateWishlistAsset 白名单域方法。
- 修复：种草资产详情卡因投影异常无法打开的问题（wishlist 投影适配）；矩阵视图投影错误卡根类错误；若干 headless 测试环境兼容修复。
- 不动：api/*.js formal-v2 主实体契约白名单、storage schema（wishlistEvents sidecar 仅新增 expectedPriceChanged 事件类型）。

### v2.4.0

**封面 1:1 裁切 + 自动压缩（微信头像风格）**

- 新增：上传封面后强制进入 1:1 裁切 sheet（无"使用原图"快捷入口）。采用 cropper.js 双层模型：图片 contain 完整显示 + 可拖动 1:1 裁切框（四角等比缩放手柄），空白区域可拖动移动图片，双指捏合或 Ctrl+滚轮缩放图片。
- 新增：初始裁切框贴合图片短边（横版图贴高、竖版图贴宽），更直觉；裁切 sheet 显示在插件面板范围内，不再全屏。
- 新增：落盘前自动压缩：统一 1280×1280 输出、≤1MB（JPEG 质量阶梯 0.92→0.82→0.75；PNG 仅尺寸缩放不降质）。
- 修复：裁切后文件名扩展名跟随实际输出 MIME（解决 "Image MIME type does not match its filename"）。
- 修复：大图裁切不再因合成层溢出视口（移除 transform scale，改 CSS 直接布局）；图片缩放上限不超过原始像素尺寸。
- 不动：formal-v2 数据契约与存储结构；封面仍落盘 data/public/。

### v2.3.0

**订阅周期玻璃下拉 + 标签颜色系统 + 首页细节打磨**

- 新增：订阅表单「计费周期」改为液态玻璃下拉（hidden input + trigger + popover，替换原生 select），Esc/外点关闭与主面板联动，与首页下拉质感一致。
- 新增：标签颜色系统——标签可带颜色：马卡龙 30 预设色（10 色相 × 3 档深度）+「无颜色」+ 自定义颜色行（≤10 个，原生取色器，存 settings.customTagColors）；标签管理两处（设置 Dialog / 编辑 sheet）行首色块就地换色。
- 新增：标签颜色全界面同步呈色（am-tag-chip--colored）——首页标签筛选下拉、列表/矩阵卡、产品详情卡、编辑 sheet 已选 chip、种草池卡，亮暗两套。
- 改进：首页筛选下拉收敛在插件侧栏区域内（dockElement rect clamp，modal 内回退 modal 容器，均无则视口 clamp），不再延伸出 dock；标签下拉右对齐触发按钮右边缘。
- 改进：标签筛选下拉「全选/取消全选」合并为单个随状态切换的按钮（已全选→取消全选，否则→全选）。
- 改进：首页间距协调——四个筛选下拉间距收窄（桌面 8→6px / 移动端同步收窄）、筛选栏与列表间的多余间距收敛（margin-bottom 14→2px + padding-bottom 8→3px）、列表卡间距重新平衡（卡内上下 padding 12→10px + 卡间 gap 6→8px，卡间总留白 30→28px）。
- 改进：移除标签筛选按钮右侧冗余的 × 清除按钮（下拉内「清除筛选」/全选切换已覆盖）；标签筛选下拉整体收窄（minWidth 196→164）、标题与「清除筛选」文字缩小。
- 修复：取色器细节——预设色板正常显色（预设格曾漏 inline background 呈灰圆）；行内色块改 CSS 变量只染圈内 18px 圆点；自定义颜色支持 × 徽标删除，删除后该色回填输入框、调整重存即「修改」；落色后主视图即时刷新（取色器 pick 出口挂 refreshMainContent）。
- 不动：api/*.js formal-v2 数据契约白名单、storage schema（tags 仅增可选 color 字段、settings 仅增 customTagColors）。

### v2.2.0

**添加面板重做 + 拔草记录可删 + 磨砂底/液态玻璃按钮**

- 新增：添加面板（加号弹层）重做——去掉顶部横杠，标题改「添加资产」居中缩小；2×2 布局（左列 实物 2/3 + 种草 1/3，右列 虚拟 / 预付 各 1/2），取消更矮，整块抬升到底部 TabBar 之上不再被遮挡。
- 新增：添加面板底层为磨砂模糊（高不透明 + 强模糊），四个选项与取消为液态玻璃，四种低饱和配色（雾蓝 / 雾紫 / 雾绿 / 雾琥珀，随主题色适配），悬停变亮上浮。
- 新增：添加面板不再因连点加号叠加；表单左右间距对齐底部 bar；种草副标题改「心愿单」。
- 新增：已拔草记录支持永久删除（插件内二次确认，仅删除该条拔草记录，不影响任何资产）。
- 改进：报表分类 / 标签明细弹窗名称左对齐、价格右对齐。
- 修复：补齐 v2.1 遗漏的两个 i18n 键（点击查看明细 / 暂无资产）。

### v2.1.0

**首页对齐 + 产品卡紧凑 + 报表可互动**

- 改进：「我的资产」卡与固定头部底边对齐、去掉多余底色，新增同底部 Bar 的轻阴影，高度再收紧，筛选胶囊更贴近。
- 改进：三个页面标题（资产管理 / 资产看板 / 种草）共用同一顶栏，大小与位置完全一致。
- 改进：有目标日均价的卡片同时显示「日均成本」与「目标 · 还需 N 天」；矩阵视图目标行左对齐。
- 改进：产品详情卡日均口径统一（含两端），总价下显示日均小标签；头部去掉分类 chip、名称/价格缩一号、左对齐可换行；手机更紧凑、大屏自动放大。
- 新增：报表互动——点击分类 / 标签排行弹出该分组下的产品明细小窗（按金额排序），行内可点开产品卡；弹窗限定在插件范围内，全部弹层背景统一淡虚化。

### v2.0.0

**液态玻璃 2.0 · 全面 UI 升级**

- 新增：全站引入液态玻璃设计语言——底部 TabBar、加号按钮、保存按钮、表单选择控件（在役/退役药丸槽、标签槽、计费周期下拉）、顶部筛选栏统一为半透玻璃 + 折射 + 高光质感，暗色模式全面适配。
- 新增：顶部筛选栏改为 sticky 悬浮玻璃层，四个筛选胶囊独立悬浮，资产列表从其下滚过，与底部 Bar 同感。
- 新增：下拉弹层（首页筛选、标签下拉）统一玻璃质感；类型 / 标签下拉选项升级为玻璃胶囊。
- 改进：「我的资产」卡更紧凑；三个页面标题（资产管理 / 资产看板 / 种草池）统一字号与位置；顶部搜索 / 视图切换降低高度并去掉占位文字。
- 修复：去掉表单底部 footer 占高造成的白色遮挡带；保存按钮改悬浮玻璃，表单内容延伸到抽屉底、折射成立。

### v1.7.0

**到期口径修正 + 列数自适应 + 日均价联动重做 + UI 打磨**

- 修复：到期口径——资产在到期日当天保持「在役 / 今日到期」，从第二天起才显示「已过期」。剩余天数统一为纯日期差（杜绝时刻陷阱），报表复用同一口径，并修复北京时间 0:00–8:00 报表基准日偏早一天的问题。
- 新增：矩阵视图列数随面板宽度自适应（拖动侧栏 2–6 列）。列数偏好（自动 / 2 / 3 / 4）从工具栏按钮移入「设置 → 常规」，默认自动。
- 新增：列表视图也会自适应——侧栏足够宽时裂变为两列，拖窄自动收回单列。
- 重做：目标日均价联动。「用价格算日期 / 用日期算价格」两种模式各保留一个可编辑项 + 一个只读实时结果，且都随购买价格实时联动——新建资产未保存即可估算，改购买价结果即时更新。切换模式不再闪烁，所选模式在下次编辑时保留。「用日期算价格」结果文案改为「预计日均 ¥x」。
- 改进：矩阵产品图圆角与卡片边框协调（容器 10px / 图 8px），不再过圆。
- 改进：添加 / 编辑表单在任意侧栏高度下正确滚动——标题栏固定在距顶几像素处、主体滚动；保存按钮保持满宽悬浮药丸，去除下方遮挡矩形。
- 改进：设置 → 关于的版本号实时读取插件清单，始终与安装版本一致。
- 修复：目标日均成本输入框键入小数点时不再卡住预览或模式切换——金额解析现在容忍 "2." 等输入中的暂态值。

### v1.6.0

**到期提醒重做 + 视觉细节打磨**

- 重做：首页新增顶部「即将到期」提醒条（🔔 标题 + 数量 + 关闭按钮），点击展开清单弹窗、逐条点开资产详情；没有到期资产时不显示，点 × 可暂时收起（新一批到期会自动重现）。
- 改进：报表「即将到期」移到资产概览正下方，标题去掉「（7 天内）」；底色与文字改为与其它卡片一致的中性外观，每行名称在左、到期日右对齐。
- 改进：首页「我的资产」卡、列表卡、矩阵卡圆角统一为 8px，与报表卡片曲率一致。
- 改进：筛选栏左右边界与「我的资产」卡对齐；矩阵视图两列的左右边距与列表视图对齐。
- 改进：右上角「⋯」菜单改为贴身的横向小圆角矩形，鼠标移上去亮起淡主题色、点击后不留残影。
- 改进：在役状态小圆点增加一圈极淡的边界衬托，在低对比主题下更清晰、高对比主题下不再发飘。
- 新增：预设封面图标从 19 个扩充到 33 个，新增「数字服务」分组（AI / 云 / 数据 / 报表 / 图表），并补充黄金 / 代币 / 钻石 / 书籍 / 地图等图标。

### v1.5.0

**报表重设计 + 矩阵视图优化**

- 重设计：报表页改为自上而下布局——资产概览 → 分类排行 → 标签排行 → 到期提示 → 金额趋势 → 价格排行；移除旧的 30天/6月/12月 时间切换与在役圆环图。
- 新增：概览「总金额」按币种分列，多币种资产各显示一行。
- 新增：「即将到期」提示列出 7 天内到期的资产，点击可打开完整产品卡。
- 新增：金额趋势改为近 12 个月购入金额（折合 ¥）的平滑曲线，每月金额直接标注在曲线上（如 120K），无支出的月份留白。
- 新增：标签排行按标签聚合购入金额（折合 ¥）从高到低排序，未被任何资产使用的标签自动隐藏。
- 改进：分类排行拆为「按数量 / 按金额」两列，数量列已修复为从多到少排序。
- 改进：价格排行每一行改为可点击的产品卡。
- 改进：矩阵视图徽章移到封面右侧空白区、标签另起一行置于其下，长名称不再被挤压成省略号。

### v1.4.0

**种草 & Markdown 优化**

- 新增：种草表单增加「种草理由」备注字段（支持 Markdown），记录为什么想买。
- 改进：种草表单切换目标类型（实物/虚拟/预付）时不再重建整个弹窗——pill 就地切换，已填内容不丢失。
- 改进：Markdown 备注正确渲染嵌套（缩进）列表，有序和无序均支持。
- 改进：Markdown 编辑器去掉实时预览面板（原先占据半个表单），保存后在产品详情卡中查看渲染结果。
- 改进：macOS 上 Markdown 标题快捷键（Cmd+Option+1~6）修复非美式键盘布局下的按键检测问题。
- 改进：备注输入框随内容自动撑高，不再裁切。
- 修复：数字输入框不再显示浏览器上下箭头。
- 修复：实物资产设置目标日均价后，列表卡片不再同时显示当前日均价（右下角目标进度已足够）。
- 改进：Tab / Shift+Tab 改为整行缩进 / 反缩进，可逐级构建嵌套子列表；列表项回车在同缩进层续行，空项回车反缩进一级（连按可逐级退回）。
- 改进：有序列表在缩进 / 反缩进后自动按同层重排序号，源码数字始终与渲染一致（子项退回顶级后接上一级编号，不再残留旧数字）。
- 改进：空列表项渲染为真正的空项，不再漏成普通文本。
- 改进：备注改为干净的单层卡片——点进去编辑原始 Markdown、点外面看渲染结果，去掉嵌套内框，编辑态与渲染态共用同一外框。
- 改进：备注内容很长时不再被保存按钮遮挡——表单主体滚动，顶部标题与保存按钮固定。
- 修复：标签行左缘与价格等其它字段标签对齐。

### v1.3.1

**Markdown 快捷键 + Bug 修复**

- 改进：Markdown 编辑快捷键支持 macOS（Cmd+Option+1~6 标题、Cmd+Shift+7/8 列表），与原有 Windows/Linux 快捷键并存。
- 修复：首页标签筛选不生效的问题——内部缺失的函数导致筛选静默失败，并可能冻结整个 dock 界面。
- 修复：第二次编辑资产价格时不再报 "replacement must be active" 错误——替换链现在会自动愈合历史数据并防止该非法状态再次产生。
- 修复：筛选下拉（状态、类型、排序、标签）反复开关后不再失去响应。

### v1.3.0

**备注 Markdown + 逻辑优化**

- 新增：资产备注支持 Markdown 输入（多级标题、有序列表、无序列表），编辑时上方实时预览渲染效果；支持快捷键（Ctrl+Alt+1~6 标题、Ctrl+Shift+7/8 列表）和列表自动续行。维保记录、退役、转让、拔草理由等所有备注输入处均支持。
- 修复：保修日历「一年 / 两年 / 三年」快捷选项与默认建议改为以购买日为准，购买日期变更时保修截止日同步联动（含闰日安全）。
- 修复：从产品详情卡点击维修 / 预付流水时，记录填写弹窗不再被详情卡遮挡，完整显示在最上层。
- 修复：虚拟订阅新建时，开始日期或账单周期变更后到期日显示同步更新。
- 修复：实物编辑表单中备注输入框被隐藏的问题。

### v1.2.0

**优化 UI**

- 日历优化：插件内所有日期输入（保修、购买日期、有效期、续费、维保、预付流水等）统一为现代化自定义日历，支持年月切换与「今天」快捷选项，弹窗跟随滚动定位，点击外部关闭。
- 产品卡内容优化：关闭按钮移至右上角；价格与日均成本与下方详情行右对齐；虚拟订阅过期时状态徽章显示灰色（与列表卡状态点一致）。
- 其他细节打磨：预设封面图标改为裁切填满圆角边框；矩阵视图去掉日均 / 目标 emoji 并改为上下排列；标签选择器触发按钮改为矩形圆角、选项竖排、新建输入置顶；添加类型弹窗点击空白处可关闭。

### v1.1.0

**修复**

- 实物、预付权益和买断资产现在可以编辑价格与购买日期。价格修改走购买事件替换链（void + replace）落库，日期修改保存到购入日期。
- 虚拟资产编辑时币种锁定，防止改币种导致投影与换算崩溃。
- 修复预付权益（储值卡）编辑「购买成本」后余额被拉回原值的问题（原校正逻辑写入幻影流水）；现在余额正确跟随新购买成本，仅改价格不产生幻影流水。
- 修复列表视图卡片底部多余空白：旧版残留的固定最小高度会把卡片撑得比内容高，使日均 / 剩余行下方出现一大块空白；现卡片高度随内容自适应，配合上下留白对齐，底部不再留空。

**改进**

- 订阅日均价改按当前订阅周期（开始 → 结束，含两端）计算，卡片、顶部汇总、报表三处口径一致（更准确）。
- 次数权益卡片底部显示「剩余次数 · 每次价格」，不再显示日均成本。
- 列表卡片紧凑化：类型移入标题行、标签居右、已过期不再显示徽章且状态点变灰（虚拟过期同样处理）、底部按资产类型定制内容、卡片间距缩短。
- 实物保修截止日在详情卡内美观显示（档位配色 + 剩余天数 / 已过保）。
- 顶部「我的资产」卡跟随思源主题色与明暗模式实时刷新（去除写死蓝色）。
- 移除预付卡片右下角冗余的「N 天后到期」（标题行徽章已显示到期信息）。
- 矩阵视图卡片间距恢复（避免拥挤），列表视图卡片间距进一步缩短。
- 列表视图卡片上下留白对齐（日均成本到底边距离 == 标题到顶边距离）。
- 列表视图多标签改为横向一排展开（原为竖排）。
- 维保 / 维修管理界面内置为插件（液态玻璃卡片样式、历史记录语义徽章、不关闭面板连续记录），替代原思源原生对话框。

**行为变化**

- 订阅日均价计算口径变化，顶部汇总与报表的订阅日均数字会相应更新（更准确）。
- 编辑预付权益时，价格字段预填首笔购买金额。

## English

### v2.6.3

**Report analysis card + automatic exchange rate updates**

- New: the report gains a "Subscription analysis" view — the number of subscribed, trial, and stopped subscriptions, monthly spending (normalized by billing cycle), total spent so far, and the subscriptions renewing within the next 30 days with their amounts.
- New: the report gains a "Prepaid analysis" view — total balance and remaining uses, total topped up and consumed, usage rate, and the prepaid assets expiring within the next 30 days.
- Improved: "Subscription analysis", "Prepaid analysis", and "Wishlist conversion" are now combined into a single analysis card on the report page — switch between them with the "Subscriptions / Prepaid / Wishlist" buttons at the top of the card, keeping the report more compact, with all three views sharing a unified layout.
- Improved: each button appears only when you have the matching assets — "Subscriptions" requires subscription assets and "Prepaid" requires prepaid assets — while "Wishlist" is always shown, leaving the rest of the report untouched.
- New: exchange rates in Settings can now update automatically — when the app opens and more than 24 hours have passed since the last update, it automatically fetches the latest US dollar, euro, and British pound to Chinese yuan rates. Automatic updates can be switched off at any time in Settings.
- New: the exchange-rate area shows the current rates, their source (automatic update or manual setting), and the last refresh time, together with a "Refresh now" button.
- New: manual rate adjustments cover the US dollar, euro, and British pound; after a manual adjustment, automatic updates will not overwrite it — use "Restore automatic rates" to switch back at any time.
- Build: version bumped to `2.6.3` (merging the former 2.6.3 and 2.6.4 batches); bilingual READMEs, build artifacts, and the release package are synchronized.

### v2.6.2

**Active-only totals, inline recovered amount, and retirement dates in the note index**

- Improved: the home summary now counts only assets in service — the total value and daily average cost no longer include retired items, and when there is resale income, a `Recovered:` amount is shown inline right beside the total value.
- Improved: in the report's asset overview, both the total value and retired recovery are compressed into single lines, each with an asset count.
- New: in the note index document, retired asset entries show their retirement date, aligned with the expiry-date column of active assets.
- Fixed: when a new asset was set to retired right at creation, its sale price was silently discarded; it is now recorded correctly as recovery income.
- Fixed: when editing a retired asset, the sale price is now filled in automatically, and changing it is saved as a new recovery record.
- Improved: asset list cards drop the extra padding above and below, so the list's top and bottom edges are no longer too wide.
- Build: version bumped to `2.6.2`; bilingual READMEs, build artifacts, and the release package are synchronized.

### v2.6.1

**Wishlist journey, note link directions, and form polish**

- New: product cards show the wishlist date; purchased assets show the wishlist date, heartbeat count, and purchase date when available.
- New: reports expose wishlist conversion metrics for total wishes, active wishes, purchases, abandons, purchase rate, and abandon rate without changing owned-asset totals.
- New: note links distinguish notes referenced by an asset from notes that reference an asset.
- Improved: wishlist conversion metrics use a compact two-column layout that also works on narrow panels.
- Improved: browser validation bubbles are disabled in favor of field-specific inline messages such as `Please enter a name`, cleared automatically once the field is valid.
- Build: version remains `2.6.1`; bilingual READMEs, build artifacts, and the release package are synchronized.

### v2.6.0

**Kernel Agent tools (registerCapability)**

- New: the plugin's kernel side (`kernel.js`, Goja sandbox) registers nine tools through `siyuan.mcp.registerTool` on 3.8.1, with `siyuan.agent.registerCapability` fallback, callable by both the built-in Agent and MCP; `plugin.json` adds `"kernels": ["all"]`.
- New: the dedicated `asset_price_update` tool automatically routes to a purchase-event or latest-subscription-payment replacement transaction by asset kind, preventing accidental maintenance or renewal calls; legacy `asset_record` price operations remain compatible.
- New: `asset_tag_update` / `asset_tag_create` provide exact label matching, atomic creation and binding, and localized display projections in query results.
- Safety: Agent writes use a single Web Locks coordinator when available and fail closed when safe coordination is unavailable, preventing duplicate financial or lifecycle mutations.
- Write bridge: query tools read the shared storage directory live and return redacted projections; new writes use independent `pending/processing/completed` request files, and the frontend claims them under Web Locks before delegating to formal business methods. Environments without safe coordination reject writes; kernel I/O uses a 30s `WRITE_TIMEOUT`. Legacy queue/results files are retained only for in-flight compatibility.
- Permissions: one master switch plus independent query, create, modify, lifecycle, records, and delete permissions. The master switch is off by default, query permission is on by default, and all write permissions are off by default. The kernel reads live settings on every call, and the frontend re-checks a method-to-permission map before dispatch (sale/renewal need Lifecycle+Records); permission errors hint the settings location in both languages.
- Live enforcement: every handler reads the latest settings, so disabling the master switch or a permission rejects the matching tool immediately; kernel `onunload` unregisters each capability and updates the `agent-kernel-status.json` heartbeat.
- Write boundary: the action helper only validates arguments, creates controlled projections, and delegates to existing plugin business methods. Create, update, status, sale, renewal, maintenance, prepaid transactions, and delete reuse those methods, while unknown methods fail explicitly.
- Safety: queries require one complete formal-v2 in-memory snapshot; search pagination defaults to 50 and is capped at 200, and writes require exact UUIDs. If derived report fields fail, summary falls back to stable counts without exposing exception stacks or local paths.
- Settings migration: legacy advisor scope, financial/notes, asset-limit, and language fields are removed. Only the Agent master switch and six permissions remain, with merged settings writes and backup/restore round trips.
- Cleanup: the old direct `/api/ai/chatGPT` calls, context clearing, connection check, prompts, answers, and copy UI are removed; the frontend no longer uses `addAgentAction` (unavailable in SiYuan 3.8.0's frontend).

### v2.5.0

**SiYuan index document + two-way asset block references**

- New: an opt-in SiYuan asset index maintained by the plugin. Each asset is represented by a real paragraph block tagged with `custom-asset-id` and a content hash; `indexDocId` is the sole sync identity, so moving, renaming, or transferring the document between notebooks does not break synchronization.
- New: index settings expose guided `unconfigured / ready / closed / missing / error` states. Sync pauses while the notebook is closed; deleting the index never creates a replacement implicitly, and creation or rebuild happens only after an explicit user action. Manual sync and in-place repair are also available.
- New: native asset block references can be copied or inserted from a slash command. Related notes merge block-reference backlinks, `custom-asset-id` block tags, and manual links, with source, document title, and content preview shown on owned and wishlist product cards.
- New: the block-icon menu can link the current block to an asset, open it in Asset Management, or remove the link; product cards can register note documents and jump to related blocks.
- Interaction: a normal click on an asset reference opens the product card directly, while Ctrl / Meta / Shift / Alt preserve SiYuan's native navigation. Right-click and mobile long-press both offer “Open product card” and “Locate in index”; mobile uses SiYuan's native file navigation.
- Fixed: duplicate index hint headers; custom attributes stripped by `updateBlock`; incorrect state handling for closed notebooks, deleted index documents, and API code 3 responses.
- Data: formal-v2 owned assets gain optional `indexBlockId` and `relatedNotes`; data written by ≤2.4.2 that lacks them loads as `null / []`, with no migration or reset. Six index settings are added while `schemaVersion` remains 1.
- Compatibility: minimum SiYuan version is now 3.8.0.

### v2.4.2

**Heartbeat value — grow your wishlist before you buy**

- New: wishlist items gain an optional "target heartbeat" goal (1–999; leave empty for a plain counter) — every time the urge to buy strikes, tap "Want it" and the plant grows one stage: with a target, seed🌰→sprout🌱→growing🌿→thriving☘️→budding🌷→bloom🌸; without a target, a plain count with five milestone stages.
- New: wishlist pool cards gain a heartbeat pill (stage emoji + count) that records a tap right on the card without opening the detail card; when the target is reached the pill and the Buy button highlight and a "Ready to buy" badge appears next to the name (buying is never blocked).
- New: the wishlist detail card gains a "Heartbeat" section — a large stage icon, a progress bar (only when a target is set), a big "Want it" button, and "Undo last heartbeat" (shown only when count>0); a toast ("🌸 Heartbeat goal reached — go for it!") fires only on the tap that reaches the target.
- New: the add/edit wishlist form gains an optional "Target heartbeats" input row (empty = no target, plain count; validated as an integer between 1 and 999).
- New: purchased / abandoned history cards show a small "N heartbeats" note (only when N>0).
- Data: the wishlist sub-object whitelist gains heartbeatTarget (null or 1–999); the wishlistEvents sidecar gains a heartbeat event type (reusing the 13-key envelope; the heartbeat count is derived strictly from the event stream and never cached on the asset); report.js gains deriveWishlistHeartbeat / describeWishlistHeartbeat read-only projections; data written by ≤2.4.1 that lacks the key loads as null — no migration, no reset.
- Fixed: hard-deleting a wishlist asset always failed the transaction because the 'delete' operation log conflicted with the wishlist-exclusion contract (the wishlist branch now passes operation logs through without writing one).
- Unchanged: the formal-v2 main-entity contract key structure (one optional sub-field added) and the sidecar 13-key envelope.

### v2.4.1

**Form polish + unified currency dropdowns + wishlist price tracking + wishlist pool redesign**

- Improved: wishlist form polish — removed the "automatically opens the matching form by target group when purchased" hint; the "expected price" input no longer carries a hardcoded currency symbol; "target group" is renamed to "type"; the standalone wishlist-reason heading is replaced by gray placeholder text.
- Improved: currency dropdowns unified — the (¥) marker is removed from the physical-asset price row in favor of a currency dropdown; the physical / virtual / prepaid currency dropdowns share the liquid-glass style (locked while editing, matching the subscription-cycle dropdown texture).
- New: the wishlist detail card gains "Update Price" and a "Price Trend" chart (same curve style as the report); price changes are recorded as expectedPriceChanged events in the wishlistEvents sidecar.
- Improved: the wishlist pool card layout now mirrors the home list view — cover + name (status dot + type chip) + expected price on the left, a divider line, then below the divider a mini price-trend sparkline (same smooth-curve style as the report) plus an "Update Price" pill clickable right on the card, with the Buy / Abandon pills anchored to the bottom-right in smaller text.
- Improved: list-view icons enlarged 48→52px and matrix-view icons 52→56px (46→50px on narrow screens), with spacing retuned; card frame size unchanged.
- Improved: wishlist detail card cleanup — in wishlist status the warranty/expiry, maintenance, subscription-history and prepaid-ledger sections (and their entry buttons) are no longer rendered; the base section keeps only the type row.
- New: the price-trend section of the detail card lists "update records" (date + old→new price); each record can be deleted to correct a mistaken entry — deleting a middle record restitches the event chain, deleting the newest record reverts the current expected price.
- Improved: the update-expected-price sheet input row is now frameless (same borderless style as the wishlist form's price row); the small hint text is removed.
- Fixed: the "Update Price" sheet opened from the product card was hidden behind the detail card — the sheet now floats above the detail card (same layering approach as the maintenance / prepaid-ledger sheets).
- Improved: the update-expected-price sheet's price row now matches the add-asset form — expected-price label + locked currency glass dropdown + right-aligned input + divider line under the row.
- Improved: deleting a price update record now asks for a scoped confirmation that stays inside the plugin panel (no native dialogs, never outside the plugin area).
- Improved: the abandon sheet now shares the same layout as the add-wishlist form — a top-left × close button (replacing the text "Cancel"), the top-right confirm button is gone, and a bottom "Abandon" save button. The reason field sits in an `am-form-textarea` with a gray "Reason" placeholder, and the asset name is centered above the card instead of inside it.
- Improved: the wishlist detail card drops the empty "Cost" section (no purchase yet, no real cost) — the price-trend section now follows the base section directly, leaving the card leaner.
- Improved: preset cover icons lose their border and shadow — just a rounded-rectangle artwork (the opaque base remains for transparent PNGs), matching the borderless crop of uploaded images.
- Fixed: editing a wishlist asset errored out ("wishlist does not support custom images") — the generic asset form's fields collided with the wishlist patch whitelist; editing a wishlist item now opens the dedicated wishlist form (rename / change cover / expected price / reason / type), backed by a new updateWishlistAsset whitelist domain method.
- Fixed: the wishlist asset detail card could fail to open due to a projection error (wishlist projection adapted); the matrix view's projection error card root-class error; several headless test-environment compatibility fixes.
- Unchanged: api/*.js formal-v2 asset-entity contract and storage layout (the wishlistEvents sidecar only gains the expectedPriceChanged event type).

### v2.4.0

**Cover 1:1 crop + auto-compression (WeChat-avatar style)**

- New: uploading a cover now always opens a 1:1 crop sheet (no "use original" shortcut). Built on the cropper.js two-layer model: the image is fully visible (contain) with a draggable 1:1 crop box (proportional corner handles); drag the empty area to move the image; pinch or Ctrl+wheel to zoom.
- New: the initial crop box hugs the image's short side (height for landscape, width for portrait); the crop sheet renders inside the plugin panel instead of fullscreen.
- New: auto-compression before saving: uniform 1280×1280 output, ≤1MB (JPEG quality ladder 0.92→0.82→0.75; PNG is resized only, never quality-reduced).
- Fixed: the cropped file's extension now follows its actual output MIME (fixes "Image MIME type does not match its filename").
- Fixed: large images no longer overflow the viewport while cropping (transform scale removed in favor of direct CSS layout); image zoom is capped at the original pixel size.
- Unchanged: formal-v2 data contract and storage layout; covers still land in data/public/.

### v2.3.0

**Subscription-cycle glass dropdown + tag color system + home spacing polish**

- New: the subscription form's billing cycle now uses a liquid-glass dropdown (hidden input + trigger + popover, replacing the native select); Esc/outside-click closing coordinates with the main panel, matching the home dropdown texture.
- New: tag color system — tags can now carry a color: 30 macaron presets (10 hues × 3 depths) plus "no color" and a custom-color row (up to 10, via a native color picker, stored in settings.customTagColors); both tag-management surfaces (settings dialog and edit sheet) recolor in place from a row swatch.
- New: tag colors render in sync across the whole UI (am-tag-chip--colored) — home tag-filter dropdown, list/matrix cards, product detail card, selected chips in the edit sheet, and wishlist-pool cards, in light and dark.
- Improved: home filter dropdowns now stay inside the plugin sidebar area (clamped to the dockElement rect, falling back to the modal container inside the modal, then to the viewport) instead of spilling out of the dock; the tag dropdown right-aligns with its trigger button.
- Improved: the tag-filter dropdown's "Select All / Deselect All" is merged into a single state-aware toggle button (all selected → Deselect All, otherwise → Select All).
- Improved: home spacing harmony — the four filter triggers sit closer together (desktop 8→6px, mobile narrowed in sync), the leftover gap between the filter bar and the list is collapsed (margin-bottom 14→2px + padding-bottom 8→3px), and list card spacing is re-balanced (card top/bottom padding 12→10px + inter-card gap 6→8px, total inter-card whitespace 30→28px).
- Improved: removed the redundant × clear button next to the tag filter trigger (the dropdown's "Clear filter" / select-all toggle already covers it); the tag dropdown is narrower overall (minWidth 196→164) with a smaller title and "Clear filter" text.
- Fixed: color-picker details — preset swatches now show their colors (preset cells were missing the inline background and rendered as gray circles); row swatches color only the inner 18px dot via a CSS variable; custom colors can be removed via an × badge, with the removed color re-loaded into the input so tweak-and-resave acts as "modify"; the main view refreshes immediately after picking a color (refreshMainContent hooked into the picker's pick exit).
- Unchanged: api/*.js formal-v2 data contract and storage layout (tags gain an optional color field; settings gain customTagColors).

### v2.2.0

**Add panel rework + delete abandoned records + frosted base with liquid-glass buttons**

- New: the add panel (plus button) is reworked — the grabber bar is removed and the title becomes a centered, smaller "Add Asset"; a 2×2 layout (left column Physical 2/3 + Wishlist 1/3, right column Virtual / Prepaid 1/2 each), a shorter cancel, and the whole panel floats above the bottom TabBar so it is never obscured.
- New: the add panel base is a frosted matte blur (high opacity + strong blur) while the four options and the cancel are liquid glass in four low-saturation tints (blue / violet / green / amber, adapting to the theme color), brightening and lifting on hover.
- New: the add panel no longer stacks on repeated plus taps; the form's left/right gutters match the bottom bar; the Wishlist subtitle now reads "Wishlist".
- New: abandoned records can be permanently deleted (in-plugin confirmation; only the abandoned record is removed, no asset is affected).
- Improved: in the report's category / tag breakdown popover, names are left-aligned and prices right-aligned.
- Fixed: two i18n keys missing since v2.1 (tap-to-view hint / empty breakdown) are now provided.

### v2.1.0

**Home alignment + compact product card + interactive report**

- Improved: the "My Assets" card now aligns its bottom edge with the fixed header (no leftover background band), gains the same soft shadow as the bottom bar, is tightened further, and the filter capsules sit closer beneath it.
- Improved: the three page titles (Asset Management / Dashboard / Wishlist) share one top bar, so their size and position are identical.
- Improved: cards with a target daily price now show both "daily cost" and "target · N days left"; the matrix view left-aligns the target line.
- Improved: the product detail card uses a unified daily-cost caliber (inclusive of both ends) and shows a small daily label under the total price; the header drops the category chip, shrinks name/price one size, left-aligns and wraps the name; compact on phones, enlarged on big screens.
- New: interactive report — tapping a category / tag ranking opens a small in-plugin popover listing that group's products sorted by amount, each row opening its product card; all overlay backdrops share the same light blur.

### v2.0.0

**Liquid Glass 2.0 · Full UI upgrade**

- New: app-wide liquid-glass design language — the bottom TabBar, add button, save button, form select controls (status pill row, tag slot, billing-cycle dropdown) and the top filter bar all share the same translucent glass + refraction + highlight treatment, in light and dark.
- New: the home filter bar is now a sticky floating glass layer; the four filter capsules float independently while the asset list scrolls beneath them, matching the bottom bar's feel.
- New: dropdown panels (home filters, tag picker) share the glass texture; kind/tag dropdown options upgraded to glass capsules.
- Improved: compacted the "My Assets" card; unified the three page titles (Asset Management / Dashboard / Wishlist) in size and position; shortened the top search & view-toggle and removed the placeholder text.
- Fixed: removed the white obstruction band caused by the form footer's reserved height; the save button now floats over the scrolling form so the glass refraction works.

### v1.7.0

**Expiry fix + adaptive columns + cost-goal linking rework + UI polish**
- Fixed: expiry calibration — an asset stays "active / due today" on its expiry date and only turns "expired" from the next day on. Remaining days use a pure calendar-date difference (no time-of-day trap); the report reuses the same logic, and its reference date no longer slips a day early between 00:00–08:00 Beijing time.
- New: the matrix view auto-fits its columns to the panel width (2–6 columns as you resize the sidebar). The column preference (Auto / 2 / 3 / 4) now lives in Settings → General instead of a toolbar button, and defaults to Auto.
- New: the list view adapts too — it splits into two columns when the sidebar is wide enough and returns to one column when narrowed.
- Reworked: the target daily-cost ("goal") linking. "Price → Date" and "Date → Price" modes each keep one editable field plus a live read-only result, and both react to the purchase price in real time — so a brand-new asset can be estimated before it is saved, and editing the price updates the result instantly. Switching modes no longer flickers, and the chosen mode is remembered next time you edit. The "Date → Price" result now reads "Est. daily avg: ¥x".
- Improved: matrix cover thumbnails use corner radii that match the card frame (container 10px / image 8px) instead of looking over-rounded.
- Improved: the add/edit form scrolls correctly at any sidebar height — the header stays pinned a few pixels below the top while the body scrolls; the Save button stays a full-width floating pill with no blocking rectangle beneath it.
- Improved: Settings → About now reads the version from the plugin manifest, so it always matches the installed version.
- Fixed: typing a decimal point into the target daily-cost field no longer freezes the preview or the mode switch — amount parsing now tolerates in-progress input like "2.".

### v1.6.0

**Expiry reminders reworked + visual polish**
- Reworked: the home page now shows a compact "Expiring soon" bar pinned at the top (🔔 title + count + close button). Tapping the bar opens a small popover listing the due items, each opening its product card; the bar hides itself when nothing is due, and the × dismisses it for the current batch (a new batch reappears automatically).
- Improved: the report's "Expiring soon" block moves directly under the Asset Overview and drops the "(within 7 days)" suffix; its background and text are now neutral like every other card, with the name on the left and the exact due date right-aligned.
- Improved: the "My Assets" card, list cards, and matrix cards all share an 8px corner radius, matching the report cards.
- Improved: the filter bar's left/right edges now line up with the "My Assets" card, and the matrix view's two columns align with the list view's gutters.
- Improved: the "⋯" menu is now a snug horizontal rounded rectangle that lights up with a faint theme tint on hover and leaves no focus residue after clicking.
- Improved: the in-service status dot gains a barely-there contrast ring, so it reads clearly on low-contrast themes without looking washed out on high-contrast ones.
- New: preset cover icons grow from 19 to 33, adding a "Service" group (AI / cloud / data / report / chart) plus gold, token, diamond, book, map, and more.

### v1.5.0

**Report redesign + matrix polish**
- Redesigned: the report page now flows top-down as Asset Overview → Category Ranking → Tag Ranking → Expiring Soon → Amount Trend → Price Ranking. The old time-range switcher (30d / 6m / 12m) and the in-service donut chart are gone.
- New: the overview's total amount is split by currency, so multi-currency portfolios show one line per currency.
- New: an "Expiring soon" notice lists assets due within 7 days; each row opens the full product card.
- New: the amount trend is a smooth 12-month purchase-amount curve (≈¥) with each month's value labelled right on the line (e.g. 120K); months with no spending stay blank.
- New: a Tag Ranking section aggregates purchase amount per tag (≈¥), sorted high to low; tags attached to no asset are hidden.
- Improved: the category ranking now splits into two columns (by count and by amount), and the count column is correctly sorted from most to least.
- Improved: the price-ranking rows are now tappable product cards.
- Improved: in matrix view, the status badge sits in the space beside the cover image and tags move to their own line below it, so long names are no longer squeezed into an ellipsis.

### v1.4.0

**Wishlist & Markdown improvements**
- New: the wishlist form now has a "Reason" field (Markdown supported) so you can note why you want something.
- Improved: switching the target type (physical / virtual / prepaid) in the wishlist form no longer rebuilds the entire sheet — the pills toggle in place and your inputs are preserved.
- Improved: Markdown notes now render nested (indented) lists correctly, both ordered and unordered.
- Improved: the Markdown editor no longer shows a live preview panel that took up half the form — notes are rendered after saving, visible in the product detail card.
- Improved: Markdown heading shortcuts on macOS now use Cmd+Option+1–6 reliably (fixed a key-detection issue with non-US keyboard layouts).
- Improved: the notes textarea now auto-grows as you type instead of clipping content.
- Fixed: number input fields no longer show browser spinner arrows.
- Fixed: when a target daily cost is set on a physical item, the list card no longer shows the current daily cost alongside it (the target progress badge is sufficient).
- Improved: Tab / Shift+Tab now indent and outdent whole list lines, so you can build nested sub-lists; Enter on a list item continues at the same indent level, and Enter on an empty item outdents one level (press it again to keep climbing out).
- Improved: ordered-list numbers are re-numbered automatically after indenting or outdenting, so the source always matches the rendered result (a sub-item promoted back to the top level takes the next top-level number instead of a stale one).
- Improved: empty list items render as real empty bullets / numbers instead of leaking out as plain text.
- Improved: the notes field is now a single clean card — tap it to edit raw Markdown, tap outside to see it rendered, with no nested inner box; the edit and rendered views share the same frame.
- Improved: long notes no longer get clipped behind the Save button — the form body scrolls while the header and Save button stay fixed.
- Fixed: the "Tags" row label now lines up with the other field labels on the left edge.

### v1.3.1

**Markdown shortcuts + bug fixes**
- Improved: Markdown textarea shortcuts now support macOS (Cmd+Option+1–6 for headings, Cmd+Shift+7/8 for lists) alongside the existing Windows/Linux bindings.
- Fixed: tag filter on the home page now works correctly — a missing internal function caused the filter to silently fail and could freeze the entire dock UI.
- Fixed: editing an asset's price a second time no longer fails with "replacement must be active" — the void-and-replace chain now heals legacy data and prevents the invalid state from recurring.
- Fixed: filter dropdowns (status, type, sort, tag) no longer become unresponsive after repeated open/close cycles.

### v1.3.0

**Notes Markdown + logic fixes**
- New: asset notes now accept Markdown input (multi-level headings, ordered and unordered lists) with a live preview panel above the textarea. Shortcuts supported: Ctrl+Alt+1–6 for headings, Ctrl+Shift+7/8 for lists, plus automatic list continuation on Enter. All note inputs across the plugin (maintenance, retirement, sale, wishlist abandon) support Markdown.
- Fixed: the warranty calendar's 1/2/3-year shortcuts and default suggestion are now based on the purchase date instead of today; editing the purchase date automatically re-syncs the warranty end date (leap days fall back to a valid date).
- Fixed: tapping repair or prepaid transactions from the product detail card no longer leaves the input sheet hidden behind the card.
- Fixed: when creating a new virtual subscription, the expiry date display now updates in real time as the start date or billing cycle changes.
- Fixed: the notes input field was hidden in the physical asset edit form.

### v1.2.0

**UI optimization**
- Calendar: every date input across the plugin (warranty, purchase date, expiry, renewal, maintenance, prepaid transactions, etc.) is unified into a modern custom calendar with month/year switching and a "today" quick option; the popup follows scroll position and dismisses when you click outside.
- Product card: close button moved to the top-right corner; prices and daily cost now right-align with the detail rows below; expired virtual subscriptions display a grey status badge (matching the list card status dot).
- Other polish: preset cover icons now crop-fill the rounded frame (no more letterboxing); matrix view drops the daily/target emojis and stacks rows vertically; tag picker trigger becomes a rounded rectangle with vertically stacked options and the new-tag input on top; add-type picker dismisses when you tap the scrim. Plugin top-level overlays stay below SiYuan system UI to avoid covering the toolbar or menus.

### v1.1.0

**Fixed**
- Physical items, prepaid benefits, and one-time purchases can now have their price and purchase date edited. Price changes are written through the purchase-event replacement chain (void + replace), and date changes are saved to the acquisition date.
- The currency of a virtual asset is now locked while editing, preventing a currency switch from breaking projections and conversion.
- Editing the purchase cost of a prepaid benefit (stored-value card) no longer snaps the balance back to its old value. The previous correction logic wrote phantom transactions; the balance now follows the new purchase cost correctly, and changing only the price no longer creates phantom ledger entries.
- List-view cards no longer show a large empty gap below their content. A leftover fixed minimum height used to stretch the card taller than its content, leaving dead space under the daily / remaining row; the card height now follows its content, so together with the balanced padding the bottom is no longer empty.

**Improved**
- The daily cost of a subscription is now calculated over its current billing period (start → end, inclusive). The card, the top summary, and the report all use the same, more accurate figure.
- Usage-count benefit cards now show "remaining uses · price per use" at the bottom instead of a daily cost.
- List cards are now more compact: the type moves into the title row, tags align to the right, expired items no longer show a badge and their status dot turns grey (virtual items past expiry behave the same), the footer content is tailored per asset type, and the spacing between cards is reduced.
- The warranty end date of a physical item is now shown neatly on its detail card (tiered colouring + days remaining / out of warranty).
- The "My Assets" card at the top now follows the SiYuan theme colour and light/dark mode in real time (the hard-coded blue was removed).
- The redundant "expires in N days" text at the bottom-right of prepaid cards has been removed (the expiry badge in the title row already shows this).
- Card spacing in the matrix view has been restored to avoid a cramped layout, while spacing in the list view is reduced further.
- List-view cards now have balanced top and bottom padding: the distance from the daily cost to the bottom edge equals the distance from the title to the top edge.
- Multiple tags in the list view now lay out in a single horizontal row instead of stacking vertically.
- The maintenance / repair management interface is now built into the plugin (liquid-glass card style, semantic badges for history records, and continuous recording without closing the panel), replacing the original SiYuan native dialog.

**Behaviour changes**
- The new subscription daily-cost calculation changes the subscription daily figures in the top summary and reports (now more accurate).
- When editing a prepaid benefit, the price field is now pre-filled with the first purchase amount.
