---
name: siyuan-asset-plugin
description: "资产管理思源插件专属架构与开发约定（formal-v2 数据契约）。Use when designing/extending/refactoring/reviewing the siyuan-plugin-asset-management plugin. Always verify current facts from plugin.json, src.template.js header, api/assets.js, api/storage.js, api/report.js, and scripts/concat.js before relying on historical plan text."
packageType: reference-skill
metadata:
  version: 3.0.0
---

# 资产管理插件（siyuan-plugin-asset-management）开发约定 v3

> 当前版本：以 `siyuan-plugin-asset-management/plugin.json` 为准；本 Skill 不作为版本事实源，不要相信任何写死的版本号
> 项目根：`<Workspace>/SiyuanDev/siyuan-plugin-asset-management`
> 主空间：`<SiYuan>`（默认部署） · 测试工作空间未配置，测试部署须由用户明确指定路径
> 思源源码：`参考/siyuan-master`  ·  纯 JS 模板：`参考/my-plugin-main`
> 默认产品文档父文档 ID：`20260722182259-hv9xqpf`（路径以思源实际为准）

## -1. 动态事实源

本 Skill 包含当前项目的架构背景和设计参考。执行相关任务时，优先读取与目标直接相关的文件确认当前事实：

1. `plugin.json`：当前版本、manifest、集市字段。
2. `src.template.js` 顶部注释：最近功能批次、UI 接入点。
3. `api/assets.js`：formal-v2 数据契约、5 种 kind、校验、投影函数。
4. `api/storage.js`：sidecar 文件架构、FIFO 串行写入、迁移、备份。
5. `api/report.js`：报表聚合、资产卡片投影、预付统计。
6. `scripts/concat.js`：IIFE 注入、构建约束、单文件产物规则。

如果思源笔记或本 Skill 与代码事实冲突，优先相信代码事实，并在方案/审查输出里标注冲突。

## 0. 一句话定位

思源笔记内嵌的个人**实物 + 虚拟 + 预付权益**全生命周期管理工具：种草 → 在役 → 退役；自动算日均/折旧/到期徽章；右侧 dock 卡片式追踪。

三大资产类型（displayGroup）：
- **实物**（physical）：可持有、可维修、可转让
- **虚拟**（virtual）：订阅（virtualSubscription）/ 买断（virtualPerpetual）
- **预付权益**（prepaid）：金额型（prepaidAmount）/ 次数型（prepaidCount）

## 1. 架构铁律（不可违反）

### 1.1 纯 JS 单文件构建（v0.9+）

**不再使用 Vue/Vite**（移动端 WebView Proxy 崩溃）。当前是：

```
siyuan-plugin-asset-management/
├── src.template.js          # 主模板（Plugin 类 + UI + 事件）
├── api/                     # 数据 + 业务层（8 个模块）
│   ├── algorithms.js        # UUID + 日期 + ISO 4217 + amountMinor + escapeHtml
│   ├── assets.js            # formal-v2 数据契约：5 kind、校验、投影、枚举
│   ├── storage.js           # sidecar 文件读写、FIFO 串行、迁移、备份
│   ├── report.js            # 报表聚合、资产卡片投影、预付统计
│   ├── media.js             # 封面图上传/预设图标
│   ├── resource-index.js    # 资源索引
│   ├── utils.js             # safe/safeAsync + toast + formatRelativeTime
│   └── icons.js             # SVG symbols
├── scripts/concat.js        # 构建：把 api/*.js IIFE 内联进 src.template.js → 生成 index.js
├── index.js                 # 构建产物（思源 loader 唯一读取入口，勿手改）
├── index.css                # 样式（含液态玻璃 + 暗色）
├── i18n/zh_CN.json + en_US.json
├── plugin.json
├── icon.png / preview.png
└── README.md / README_zh_CN.md
```

`api/*.js` 的 `require('./xxx')` 在思源 loader 中解析不了相对路径，由 `scripts/concat.js` 把 8 个模块分别包成 IIFE 注入 `// __AM_API_INJECTION_POINT__` 占位。

```powershell
# 修改任何 api/*.js 或 src.template.js 之后必须跑：
node scripts/concat.js
# 部署到主空间：
Copy-Item -LiteralPath "index.js" -Destination "<SiYuan>/data/plugins/siyuan-plugin-asset-management/index.js"
Copy-Item -LiteralPath "index.css" -Destination "<SiYuan>/data/plugins/siyuan-plugin-asset-management/index.css"
Copy-Item -LiteralPath "i18n/zh_CN.json" -Destination "<SiYuan>/data/plugins/siyuan-plugin-asset-management/i18n/zh_CN.json"
Copy-Item -LiteralPath "i18n/en_US.json" -Destination "<SiYuan>/data/plugins/siyuan-plugin-asset-management/i18n/en_US.json"
```

### 1.2 入口骨架

```js
const { Plugin, Dialog, Menu } = require("siyuan");
module.exports = class AssetManagementPlugin extends Plugin {
    async onload() {
        this.addIcons(ICONS);                                    // 同步、await 之前
        this.addTopBar({ icon, title, callback: () => ... });    // 同步
        this.addCommand({ langKey: "...", callback: ... });      // 同步
        this.addDock({ config, type: DOCK_TYPE, init, destroy }); // 同步
        this.storage = createStorage(this);
        try { await this.loadAssets(); ... } catch(e) {}         // 异步
    }
    onunload() { /* 清理 */ }
};
```

### 1.3 dock + modal 双渲染

dock 模式：`this.dockElement` 是容器，UI 渲染进去。
modal 模式：`this.openMainDialog()` 用思源 `Dialog` 弹出主面板，`this._modalContainer` 是 dialog 元素。
任何 sheet（编辑/种草/续费）都用 `host = this.dockElement || this._modalContainer || document.body` 找容器。

**铁律**：sheet 内部按钮 onclick **不要走 dock 的 `[data-action]` 委托**（拿不到 openSheet 的闭包变量 `mask/bodyEl/renderBody/bindBody/state/data/closeSheet`），直接 `btn.onclick = () => openXxx(mask, bodyEl, ...)` 闭包绑定。

### 1.4 部署铁律

- 默认部署到主空间 `<SiYuan>`
- 测试工作空间未配置，自动流程不得依赖它
- 部署只允许覆盖 `index.js`、`index.css`、`i18n/*.json`；不得删除插件目录或 storage 数据
- 个人开发期插件，不为历史测试数据写兼容迁移；涉及数据模型/schema/storage 的任务默认允许重置插件业务数据
- 普通部署不得隐式清空数据；需要重置时先导出完整 JSON 备份，再执行插件业务数据重置
- Implementer/Reviewer 不输出完整 `index.js` diff；只返回关键函数/行号和验证结论，避免长任务卡住
- 主空间插件目录里的 `assets/preset-icons/` 早已存在，部署时**不动它**（只覆盖 index.js/index.css/i18n）

### 1.5 打包铁律（package.zip，本项目专属）

发布用的 `package.zip` 是 **43 条目白名单**（旧文档的 29 已过时），统一跑 `python scripts/build-package-zip.py`（白名单 + 版本号三处断言 + 原子写入；不要 `zip -r`、build.sh/bat，也不要手写一次性 zipfile 脚本）：

- **9 个根文件**：`index.js` / `index.css` / `plugin.json` / `icon.png` / `preview.png` / `README.md` / `README_zh_CN.md` / `i18n/zh_CN.json` / `i18n/en_US.json`
- **34 个静态资源**：`assets/preset-icons/` 下 33 张图标 PNG + `manifest.json`（v1.6.0 起 19→33；arcname 带 `assets/preset-icons/` 前缀）

**`assets/preset-icons/` 极易漏**：运行时靠 `fetch('/plugins/siyuan-plugin-asset-management/assets/preset-icons/manifest.json')` 加载图标，zip 里缺了 → 集市版图标选择器全部 404。

打包后必查：条目数 = 43；**zip 内 `plugin.json.version` = 本次版本号**（见 §11.6 三处一致）；`icon.png` ≤ 20KB、`preview.png` ≤ 200KB；`manifest.json` 每个 `filename` 都有对应 PNG；zip 名叫 `package.zip`。

完整命令与通用规范见 `siyuan-plugin-publishing` skill §3.1。

## 2. formal-v2 数据契约（核心）

### 2.1 五种资产 Kind

| kind | displayGroup | 说明 |
|------|-------------|------|
| `physical` | physical | 实物资产 |
| `virtualSubscription` | virtual | 虚拟订阅（按周期续费） |
| `virtualPerpetual` | virtual | 虚拟买断（一次购买永久授权） |
| `prepaidAmount` | prepaid | 预付金额型（储值卡、API credits） |
| `prepaidCount` | prepaid | 预付次数型（理发卡、健身次卡） |

### 2.2 正式资产字段白名单（FORMAL_V2_OWNED_KEYS）

```text
id, kind, name, status, currency, acquiredOn, statusChangedOn,
categoryId, tagIds, cover, notes, createdAt, updatedAt, details
```

- `id`：小写 UUID（不是旧的 Date.now.toString(36)）
- `currency`：ISO 4217（如 CNY、USD）
- `acquiredOn`：YYYY-MM-DD 业务日期
- `status`：`wishlist` | `active` | `retired`
- `categoryId`：受控展示维度（digital / appliance / home / otherPhysical / member / software / service / domain / ai / otherVirtual / prepaidAmount / prepaidCount）
- `tagIds`：UUID 数组
- `cover`：封面图对象（normalizeCover）
- `details`：按 kind 分支的扩展字段（白名单严格校验，未知字段抛 FORMAL_ASSET_INVALID）

### 2.3 details 分支字段（FORMAL_V2_DETAIL_KEYS）

| kind | details 字段 |
|------|-------------|
| physical | `warrantyEndsOn`, `costGoal` |
| virtualSubscription | `planName`, `accountLabel`, `billingPlan`, `autoRenew` |
| virtualPerpetual | `licenseAccountLabel` |
| prepaidAmount | `provider`, `expiresOn` |
| prepaidCount | `provider`, `expiresOn` |

### 2.4 种草资产（极简 schema，FORMAL_V2_WISHLIST_KEYS）

```text
id, kind, name, status, currency, cover, createdAt, updatedAt, wishlist
```

`wishlist` 子对象：

```text
targetGroup: 'physical' | 'virtual' | 'prepaid'  （购买路由真值）
reason: string（≤500 字）
expectedPriceMinor: integer | null
```

种草不携带 categoryId / tagIds / notes / details。`kind` 与 `targetGroup` 独立校验，无需一致。

### 2.5 金额与时间约定

- **金额**：一律用 `amountMinor`（非负安全整数，单位=分）。不用浮点 `price`。
- **时间戳**：`occurredAt` / `createdAt` 是 UTC ISO instant（`2026-01-01T00:00:00.000Z`）
- **业务日期**：`effectiveDate` / `acquiredOn` / `expiresOn` 是 `YYYY-MM-DD`
- **ID**：小写 UUID（`createStableId()`）
- **外键**：`assetId` / `financialEventId` / `correlationId` 均为小写 UUID 或 null

## 3. Sidecar 事件架构

主实体（assets.json）保持轻量。所有历史事件独立存储为 sidecar 文件，通过 `assetId` 关联。

### 3.1 STORAGE_FILES（12 个 + backups）

```js
STORAGE_FILES = {
    assets: 'assets.json',
    settings: 'settings.json',
    tags: 'tags.json',
    maintenance: 'maintenance.json',
    usage: 'usage.json',
    operationLogs: 'operationLogs.json',
    wishlistEvents: 'wishlistEvents.json',
    financialEvents: 'financialEvents.json',
    lifecycleEvents: 'lifecycleEvents.json',
    subscriptionPeriods: 'subscriptionPeriods.json',
    prepaidTransactions: 'prepaidTransactions.json',
    exchangeRates: 'exchangeRates.json',       // 占位
    backupsDir: 'backups',
}
```

### 3.2 事件信封（Event Envelope）

所有 sidecar 记录共享基础信封：

```text
id, schemaVersion, assetId, occurredAt, effectiveDate, createdAt,
source, correlationId, note, metadata, replacesEventId, voidedAt
```

- `source`：user | system | import | migration | undo
- `replacesEventId` + `voidedAt`：替换链（审计/撤销）
- `correlationId`：关联同一用户操作产生的多条事件

### 3.3 财务事件（financialEvents.json）

额外字段：`direction`, `eventType`, `currency`, `amountMinor`

| eventType | direction | 说明 |
|-----------|-----------|------|
| purchase | outflow | 购买 |
| additionalCost | outflow | 附加成本 |
| maintenance | outflow | 维保费用 |
| subscriptionPayment | outflow | 订阅扣费 |
| prepaidCharge | outflow | 预付充值（现金→余额） |
| prepaidConsumption | outflow | 预付消费（余额扣减，`metadata.affectsCash` 必须为 false） |
| sale | inflow | 转卖 |
| refund | inflow | 退款 |
| income | inflow | 收益 |
| adjustment | 双向 | 调整 |

### 3.4 生命周期事件（lifecycleEvents.json）

使用 `kind` + `details` 结构（FORMAL_LIFECYCLE_RECORD_KEYS）：

kind 枚举：created / wishlisted / activated / retired / restored / deleted / statusChanged / maintenanceRecorded / usageRecorded / prepaidTransaction / subscriptionStarted / subscriptionRenewed / subscriptionReopened / subscriptionCancelled / subscriptionSkipped

### 3.5 订阅周期（subscriptionPeriods.json）

字段：`kind`, `startDate`, `endDate`, `paymentEventId`

kind：trial | billing | grace | complimentary

约束：同一资产的 active 周期不允许日期重叠（validateSubscriptionPeriodsNoOverlap）。

### 3.6 预付交易（prepaidTransactions.json）

字段：`id`, `assetId`, `type`, `dimension`, `direction`, `count`, `effectiveDate`, `occurredAt`, `createdAt`, `note`, `financialEventId`

| type | 含义 | direction |
|------|------|-----------|
| opening | 开卡/首次充值 | inflow |
| inflow | 追加充值 | inflow |
| outflow | 消费 | outflow |
| refund | 退款 | outflow |
| adjust | 调整 | 双向 |

- `dimension`：`amount`（金额型）或 `count`（次数型），必须匹配资产 kind
- 金额型交易**必须**有 `financialEventId`；次数型可选
- 余额投影：`balance = opening + inflow - outflow - refund ± adjust`

### 3.7 备份

`<SiYuan>/data/storage/petal/siyuan-plugin-asset-management/backups/<name>-<iso_ts>.json`

写入操作默认 `backup: true`。

## 4. 投影与计算函数（实时算，不存储）

| 函数 | 位置 | 行为 |
|------|------|------|
| `normalizeFormalV2Asset(raw)` | assets.js | 严格校验 + 归一化，未知字段抛异常 |
| `validateFormalV2Asset(asset)` | assets.js | 纯校验，返回 {valid, errors} |
| `projectFormalSubscription(asset, periods, today)` | assets.js | 订阅状态投影（subscribed / expired / pendingConfirmation） |
| `projectFormalPrepaid(asset, transactions, financialEvents)` | assets.js | 预付余额/剩余次数投影 |
| `getFormalExpiryOn(asset, periods, today)` | assets.js | 跨类型到期日（warranty / prepaidExpiry / subscriptionExpiry） |
| `getFormalNextImportantDate(asset, periods, today)` | assets.js | 下一个重要日期（提醒/排序用） |
| `computeFormalAssetCard(...)` | report.js | 资产卡片聚合（成本、日均、徽章、预付余额） |
| `validateFormalPrepaidTransaction(record, asset)` | assets.js | 单条预付交易校验 |
| `validateFinancialReplacementChain(events)` | assets.js | 财务事件替换链校验 |
| `validateFormalLifecycleReplacementChain(events)` | assets.js | 生命周期事件替换链校验 |

## 5. 状态机

三大类型共享主状态机：

```text
wishlist（种草） → active（在役） → retired（退役） → archived（归档，未来）
```

| 状态 | 实物 | 虚拟 | 预付 |
|------|------|------|------|
| wishlist | 想买的物品 | 想订阅/买断的服务 | 想办的卡 |
| active | 已拥有在使用 | 正在订阅/已买断可用 | 余额/次数可消费 |
| retired | 卖出/报废/赠送/闲置 | 取消订阅/授权过期 | 余额耗尽/过期/退卡 |

状态变更通过 lifecycleEvents 记录（kind: activated / retired / restored），不直接修改字段。

## 6. 写新功能的标准流程

1. **数据契约**：在 `assets.js` 的 formal-v2 白名单内加字段，或新增 sidecar 记录类型
2. **storage**：在 `STORAGE_FILES` 注册 + 实现 readXxx/writeXxx（FIFO 串行）
3. **校验**：写 normalize + validate 纯函数，确保未知字段被拒绝
4. **投影**：纯函数加到 `assets.js` 或 `report.js`
5. **UI**：加在 `src.template.js`，sheet 用闭包绑定 onclick
6. **i18n**：同时改 zh_CN.json + en_US.json
7. **构建**：`node scripts/concat.js`
8. **验证**：部署到主空间，思源重载实测

## 7. UI 规范

### 7.1 dock + modal 一图流（liquid glass）

- 顶栏：`renderTopBar()` —— 视图切换 + 搜索 + 高级筛选
- 主体：`renderAssetsOnly()` —— list / matrix 切换
- 底栏：`renderTabBar()` —— 液态玻璃 pill + 中央凸起 FAB（加号）
- 加号 → `openActionSheet()` 弹 ActionSheet 半屏菜单（添加实物 / 添加虚拟 / 添加种草）

### 7.2 液态玻璃核心 CSS

```css
.am-tabbar-pill {
    background: rgba(255,255,255,0.55);
    backdrop-filter: blur(28px) saturate(180%);
    -webkit-backdrop-filter: blur(28px) saturate(180%);
    border: 1px solid rgba(255,255,255,0.6);
    border-radius: 32px;
    box-shadow: 0 -4px 24px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.08),
                inset 0 1px 0 rgba(255,255,255,0.7);
}
[data-theme-mode="dark"] .am-tabbar-pill {
    background: rgba(20,20,22,0.6);
    border-color: rgba(255,255,255,0.08);
}
```

陷阱：父级有 `transform` / `filter` / `contain` 时 backdrop-filter 失效 → 父级加 `isolation: isolate`。

### 7.3 触摸目标 + 动画

- 触摸目标 ≥ 44×44 px
- 入场动画 < 300ms，错位 50ms
- 永远用 `transform: scale()`，不要动画 width/height
- iOS 安全区：`padding-bottom: env(safe-area-inset-bottom, 0)`

### 7.4 暗色模式

- 用思源变量：`var(--b3-theme-background)` / `--b3-theme-on-background` / `--b3-border-color` / `--b3-list-hover`
- 暗色覆盖写在 `index.css`，选择器 `[data-theme-mode="dark"] .am-xx`
- **思源 Dialog 弹出的元素已经在 body 下，无需特殊前缀**

### 7.5 液态玻璃的三个层次（核心，按使用场景）

不同区域使用不同的「玻璃厚度」，**不要全屏统一**：

| 层次 | 用途 | 浅色 | 暗色 | blur px | saturate |
|------|------|------|------|---------|----------|
| **薄（thin）** | 卡片内嵌 / 行 chip | `rgba(255,255,255,0.45)` | `rgba(40,40,44,0.55)` | 16 | 160% |
| **中（regular）** | TabBar / 输入框 / sheet 头 | `rgba(255,255,255,0.55)` | `rgba(20,20,22,0.6)` | 24 | 180% |
| **厚（thick）** | Modal / SettingsDialog 全屏 | `rgba(255,255,255,0.72)` | `rgba(15,15,18,0.78)` | 36 | 200% |

> **铁律**：嵌套结构里**只最外层做 blur**，子层用 `rgba(255,255,255,0.05)` 透明叠加做"层间玻璃感"。两层 blur 性能掉 30-60%。

### 7.6 玻璃质感三件套（必须全套）

```css
.am-glass-card {
    background: rgba(255,255,255,0.55);              /* 1. 半透明色 */
    backdrop-filter: blur(24px) saturate(180%);     /* 2. 模糊 + 饱和 */
    -webkit-backdrop-filter: blur(24px) saturate(180%);  /* iOS 必须双前缀 */
    border: 1px solid rgba(255,255,255,0.6);       /* 3. 高光描边 */
    box-shadow:
        0 1px 0 rgba(255,255,255,0.7) inset,        /* 4. 内顶高光（玻璃质感关键） */
        0 8px 24px rgba(0,0,0,0.08),                 /* 5. 外投影 */
        0 1px 2px rgba(0,0,0,0.04);                 /* 6. 近距细投影 */
}
```

6 件缺一不会"像液态玻璃"：
1. 半透明色（不像实色）→ ✅必须
2. backdrop-filter → ✅必须
3. **边框高光**（玻璃边缘感）→ ✅必须，否则看起来像塑料
4. **内顶高光**（视觉上"中间凸起")→ ✅必须
5. 投影多层（漂浮感）→ ✅必须
6. -webkit-backdrop-filter（移动端）→ ✅必须

### 7.7 配色（与思源主题色系严格遵守）

| 角色 | 浅色 | 暗色 |
|------|------|------|
| 主背景 | `var(--b3-theme-background)` 或 `#fff` | 自动跟主题 |
| 表面 | `var(--b3-theme-surface)` | 自动 |
| 主色 / 强调 | `#3575f3`（思源蓝） | 同 |
| 文字主 | `var(--b3-theme-on-background)` | 自动 |
| 文字次 | `var(--b3-text-color-secondary)` / `rgba(0,0,0,0.55)` | 自动 |
| 边框 | `rgba(0,0,0,0.08)` 浅 / `rgba(255,255,255,0.12)` 深 | — |
| 状态绿 | `#67c23a` | 同 |
| 状态红 | `#f56c6c` | 同 |
| 状态黄 | `#e6a23c` | 同 |
| 状态灰 | `#909399` | 同 |

**禁用颜色**：黑色硬写 `#000000`、纯白 `#ffffff` 不带 alpha、艳色（`#FF0000`）等等。

### 7.8 圆角规范（border-radius）

| 元素 | radius |
|------|--------|
| 卡片 / sheet | 14-16 px |
| 列表行内 chip | 8 px |
| 顶部 pill TabBar | 32 px |
| FAB 圆形 | 50% |
| 输入框 input | 8 px（思源 b3-text-field 一致） |
| Modal 整体 | 16 px |
| 单按钮 | 10 px（小按钮） / 999px（胶囊） |

**使用 `border-radius: 999px`** 表示完全圆角，不要写硬编码数值。

### 7.9 spacing / 字体 / 阴影尺度

spacing 4 的倍数：

```
--am-space-1: 4px
--am-space-2: 8px
--am-space-3: 12px
--am-space-4: 16px    ← 主间距
--am-space-5: 20px
--am-space-6: 24px    ← 大间距 / 卡片 padding
```

字体：

```
--am-fs-hero: 32px / weight 700     ← Hero 金额
--am-fs-title: 17px / weight 600    ← 卡片标题
--am-fs-body: 14px / weight 400
--am-fs-meta: 12px / weight 400    ← 元信息
--am-fs-mini: 10px / weight 500
```

阴影层级（深浅不一）：

```
--am-shadow-1: 0 1px 2px rgba(0,0,0,0.04)
--am-shadow-2: 0 4px 12px rgba(0,0,0,0.08)
--am-shadow-3: 0 12px 32px rgba(0,0,0,0.12)
--am-shadow-glass: 0 -4px 24px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7)
```

### 7.10 表单字段统一样式（am-edit-field 系列）

```css
/* 字段容器 */
.am-edit-field {
    margin-bottom: var(--am-space-4);
}
.am-edit-field__label {
    font-size: var(--am-fs-meta);
    color: var(--b3-text-color-secondary);
    margin-bottom: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.am-edit-field__label small { font-size: var(--am-fs-mini); opacity: 0.7; }
.am-edit-field__input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    background: var(--b3-theme-surface);
    color: var(--b3-theme-on-background);
    font-size: 14px;
    transition: border-color 0.2s, box-shadow 0.2s;
}
.am-edit-field__input:focus {
    outline: none;
    border-color: #3575f3;
    box-shadow: 0 0 0 3px rgba(53,117,243,0.18);
}
/* 折叠字段默认隐藏，开关时展开 */
.am-edit-field--collapse { display: none; }
.am-edit-field--collapse.is-open { display: block; }
/* chip 高亮 */
.am-edit-chip--active {
    background: rgba(53,117,243,0.12);
    border-color: #3575f3;
    color: #3575f3;
}
```

### 7.11 Switch 规范（不必用思源原生）

```css
.am-switch {
    position: relative;
    width: 44px; height: 24px;     /* 44×24 是 iOS HIG 标准 */
    background: rgba(0,0,0,0.18);
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.2s;
    flex-shrink: 0;
}
.am-switch.is-on { background: #3575f3; }
.am-switch::after {
    content: '';
    position: absolute;
    top: 2px; left: 2px;
    width: 20px; height: 20px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    transition: transform 0.2s var(--am-ease);
}
.am-switch.is-on::after { transform: translateX(20px); }
[data-theme-mode="dark"] .am-switch { background: rgba(255,255,255,0.16); }
[data-theme-mode="dark"] .am-switch.is-on { background: #3575f3; }
```

JS 用 `<div class="am-switch" data-on="false">` + onclick 切换 class。

### 7.12 关键帧动画

```css
@keyframes amFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
}
@keyframes amFadeInScale {
    from { opacity: 0; transform: scale(0.96); }
    to { opacity: 1; transform: scale(1); }
}
@keyframes amSlideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
}
@keyframes amSheetLeave {
    from { transform: translateY(0); opacity: 1; }
    to { transform: translateY(20%); opacity: 0; }
}

/* 全局弹性曲线 */
:root {
    --am-ease: cubic-bezier(0.34, 1.56, 0.64, 1);     /* 弹回 */
    --am-ease-out: cubic-bezier(0.16, 1, 0.3, 1);      /* 自然减感 */
    --am-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}

/* 卡片 / sheet 入场 */
.am-asset-item {
    animation: amFadeIn 0.3s var(--am-ease-out) backwards;
    animation-delay: calc(var(--i, 0) * 50ms);
}
.am-edit-sheet-mask {
    animation: amFadeIn 0.2s var(--am-ease-out);
}
.am-edit-sheet {
    animation: amSlideUp 0.28s var(--am-ease-out);
}
.am-edit-sheet-mask.is-closing .am-edit-sheet {
    animation: amSheetLeave 0.22s var(--am-ease-in-out) forwards;
}
```

### 7.13 触觉反馈降级（不依赖第三方）

```js
function amHaptic(light = 'light') {
    if (navigator.vibrate) {
        const ms = light === 'medium' ? 15 : (light === 'heavy' ? 25 : 10);
        try { navigator.vibrate(ms); } catch (e) {}
    }
    // iOS WebView / 桌面：纯视觉反馈 CSS 处理（按钮 active scale 0.96）
}
```

主要操作按钮 active 状态：

```css
.am-btn:active {
    transform: scale(0.96);
    opacity: 0.85;
    transition: transform 0.08s, opacity 0.08s;
}
```

### 7.14 iOS HIG 6 条原则（精简版）

1. **Aesthetic Integrity** — 视觉服务于功能，不为美观牺牲可读
2. **Consistency** — 同语义控件长相一致（chip 都胶囊、卡片都圆角 14px）
3. **Direct Manipulation** — 直接拖拽 / 点击而非两步（左滑删除 = 一步）
4. **Feedback** — 所有交互都有反馈（不要"点了没反应"）
5. **Metaphors** — 拟物（玻璃=轻盈、阴影=漂浮、圆角=亲和）
6. **User Control** — 撤销 / 取消永远可达

### 7.15 思源主题字段必须用 `var(--b3-*)`，不要硬色

| ✅ 正确 | ❌ 禁止 |
|---------|---------|
| `color: var(--b3-theme-on-background)` | `color: #333` |
| `background: var(--b3-theme-surface)` | `background: #fff` |
| `border: 1px solid var(--b3-border-color)` | `border: 1px solid #eaeaea`|

只有"主题色" `#3575f3` 和"状态色" `#67c23a / #f56c6c / #e6a23c / #909399` 可以硬编码，因为它们是固定的，不随主题变。

### 7.16 mobile detection（已在 constructor 实现）

```js
this.isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
```

mobile 端 dialog width 用 `100vw`，不用 `780px`。padding 用 `env(safe-area-inset-bottom, 0)`。

| 频率 | 位置 | 例子 |
|------|------|------|
| 高频 | Header / TabBar 主体 | 视图切换、搜索、Tab 切换 |
| 中频 | 「+」ActionSheet | 种草、加实物、加虚拟 |
| 低频 / 一次性 | 思源插件设置 Dialog | 导出、导入、清空、备份恢复、标签管理 |

**导出按钮永远不在主页 Header**。导出在设置 Dialog 的「数据」tab。

## 9. 版本路线

逐版本规划已废弃，不在本 Skill 维护。当前版本以 `plugin.json` 为准；产品路线以思源产品方案文档为准。

## 10. 模块能力索引

> 下表为能力索引，具体状态以代码事实为准（不要相信表里的版本待办）。

| 模块 | 状态 | 说明 |
|------|------|------|
| Asset CRUD（5 kind） | ✅ | formal-v2 严格校验 |
| 状态机（wishlist/active/retired） | ✅ | lifecycleEvents 事件溯源 |
| 财务事件（financialEvents） | ✅ | 10 种 eventType + 替换链 |
| 订阅周期投影 | ✅ | projectFormalSubscription |
| 预付交易 + 余额投影 | ✅ | projectFormalPrepaid（数据层 + UI） |
| 标签系统（tags.json） | ✅ | CRUD + 筛选 |
| 维保记录（maintenance.json） | ✅ | FIFO 串行 |
| 使用记录（usage.json） | ✅ | readUsage/writeUsage |
| 操作日志（operationLogs.json） | ✅ | 6 类 mutation |
| 种草/拔草（wishlistEvents.json） | ✅ | 事件溯源 |
| 报表聚合（report.js） | ✅ | 资产卡片 + 预付统计 |
| 到期徽章 5 档 | ✅ | getFormalNextImportantDate |
| 液态玻璃 UI + 暗色 + 移动端 | ✅ | 见 §7 |
| 多币种显示 | 🟡 | native 模式已实现，preferred/dual 待汇率 API |
| 资产组合 Portfolio | ⏸ | STORAGE_FILES 未注册 |
| 到期提醒系统 | ⏸ | 数据层就绪，UI/通知状态以代码为准 |
| 多格式导入导出 | ⏸ | JSON 已有，其它格式状态以代码为准 |

## 11. 历史教训（不要重犯）

### 11.1 Vue Teleport to body（已废弃，留为教训）

**v0.8 之前的 Vue 阶段**遇到：SettingsDialog 不加 Teleport → 弹窗被 dock 框住。根因：Vue app 挂在 dock 元素里，子组件默认是 dock 子节点，父级有 `transform`/`filter`/`contain` 时 fixed 失效。

**当前已切到纯 JS**：所有 sheet 直接 append 到 `host = this.dockElement || this._modalContainer || document.body`。**这不是问题**了，但写新弹窗时**始终**确认 host 来源正确，dock 未挂载时优先 modal 或 body。

### 11.2 dock onclick 委托拿不到 sheet 闭包变量（v0.14 修复）

```js
// ❌ 错误：bindBody 没绑 onclick，依赖 dock.onclick → handleAction 拿不到 mask/bodyEl/state/data/closeSheet
case "open-service-picker": this.openServiceTemplatePicker(mask, bodyEl, ...);  // ReferenceError

// ✅ 正确：bindBody 中直接闭包绑定
const serviceTileBtn = mask.querySelector('[data-action="open-service-picker"]');
if (serviceTileBtn) serviceTileBtn.onclick = () => this.openServiceTemplatePicker(mask, bodyEl, ...);
```

### 11.3 rerender 没回写 state 导致 textarea 数据丢失（v0.14 修复）

```js
// ❌ 错误：保存时用 state.additionalCostsText，没有 oninput 同步，rerender 后 textarea 显示旧值
form.additionalCosts = parseCostLines(state.additionalCostsText);

// ✅ 正确：保存时从 DOM 直接读
const additionalCostsEl = mask.querySelector('[name="additionalCostsText"]');
form.additionalCosts = parseCostLines(additionalCostsEl ? additionalCostsEl.value : '');
```

### 11.4 dataset 键名 camelCase（v0.14 修复）

```js
// ❌ 错误：'data-sheet-cat' → 'sheetcat'（永远 false）
b.dataset[attr.replace('data-', '').replace('-', '')];

// ✅ 正确：dataset 键自动转 camelCase
b.dataset['sheetCat'];
```

### 11.5 settings 保存不能覆写（v0.14 修复）

```js
// ❌ 错误：丢失 preferredCurrency/notificationsEnabled/notificationDays/schemaVersion
this.settings = { defaultSort, defaultStatus, ... };

// ✅ 正确：merge
this.settings = Object.assign({}, this.settings, { defaultSort, defaultStatus, ... });
```

### 11.6 plugin.json / src.template.js / package.zip 版本必须三处一致

每次 release 前必查：`plugin.json.version` === `src.template.js` 顶部 `PLUGIN_VERSION` 常量 === **`package.zip` 内 `plugin.json.version`**，且头注释批次与 README/CHANGELOG 顶部条目同版。v2.3.0 两次翻车：① 漏改 PLUGIN_VERSION 常量（备份元数据/关于页回退显旧版）；② 改了源码没重跑 concat + 重打 zip（zip 内仍 2.2.0）。强制流程：`node scripts/concat.js` → `python scripts/build-package-zip.py`（内置前两者断言、写完回读 zip 断言第三处，不符 abort）→ unzip 回读确认。绝不手改 zip 内文件。

### 11.7 concat.js destructure block 不能引用未 export 的函数

修改 destructure 时**务必** grep 一下 src.template.js 中实际是否用到这个名字。不用就别加。

## 12. 常用命令

```powershell
Set-Location -LiteralPath "<Workspace>/SiyuanDev/siyuan-plugin-asset-management"

# 1. 构建（写 index.js）
node scripts/concat.js

# 2. 仅检查
node scripts/concat.js --check

# 3. 部署到主空间
Copy-Item -LiteralPath "index.js" -Destination "<SiYuan>/data/plugins/siyuan-plugin-asset-management/index.js"
Copy-Item -LiteralPath "index.css" -Destination "<SiYuan>/data/plugins/siyuan-plugin-asset-management/index.css"
Copy-Item -LiteralPath "i18n/zh_CN.json" -Destination "<SiYuan>/data/plugins/siyuan-plugin-asset-management/i18n/zh_CN.json"
Copy-Item -LiteralPath "i18n/en_US.json" -Destination "<SiYuan>/data/plugins/siyuan-plugin-asset-management/i18n/en_US.json"

# 4. 思源 app → 设置 → 集市 → 已下载 → 启用 / 重载
```

无 `pnpm dev` / `type-check`。**纯 JS 不需要 TS 编译**。所有 sanity 检查靠 `node scripts/concat.js` 不报错 + 思源中重载插件。

## 13. 思源插件设置面板入口

```js
this.addTopBar({ icon: "iconAssetManagement", title, callback: () => this.openSettingsDialog() });
this.addCommand({ langKey: "openSettings", callback: () => this.openSettingsDialog() });
```

设置 Dialog 用思源原生 `Dialog` API（不是 setting.html），3 Tab：
- 常规：默认排序/状态/视图
- 数据：导出 / 导入 / 清空 / 备份（v0.15 加）/ 操作日志（v0.16 加）
- 关于：版本号 + GitHub 链接

## 14. 思源二级菜单

```js
topBarElement = this.addTopBar({ icon, title, callback: () => {
    const menu = new Menu("plugin-name");
    menu.addItem({ label: "打开资产管理", click: () => this.openMainDialog() });
    menu.addItem({ label: "添加资产", click: () => this.openEditDialog(null) });
    menu.open({ x, y, isLeft: true });
}});
```

## 15. 写新功能的标准流程

1. **数据模型**：先加字段到 `newAsset` + `normalizeAsset`，必要时升 schemaVersion
2. **storage**：扩展 readXxx / writeXxx，至少在 STORAGE_FILES 注册占位
3. **算法**：纯函数加到 `assets.js` 或 `algorithms.js`，**不影响 UI 也能跑通**
4. **UI**：加在 `src.template.js` 中，sheet 模式用闭包绑定 onclick，不要走 dock 委托
5. **i18n**：同时改 zh_CN.json + en_US.json
6. **构建**：跑 `node scripts/concat.js`
7. **头注释**：同步 plugin.json version + 所有头注释
8. **测试**：部署到主空间，思源重载 → 实测新功能 + 旧功能没破

## 16. 不要踩的坑（清单）

- ❌ 启 Vue / React / Lit
- ❌ `export default` / `import x from '../y'`（思源 loader 不识别）
- ❌ sheet 内 button 走 dock `[data-action]` 委托拿 sheet 闭包变量
- ❌ settings 保存直接覆写
- ❌ 动画 width/height
- ❌ 单独启 siyuan.exe serve 占端口（锁工作空间）
- ❌ 部署时删除主空间插件目录或 storage 数据
- ❌ zip 不命名为 package.zip（集市 CI 严格）
- ❌ icon.png / preview.png 不放仓库根目录（CI 严格）
- ❌ package.zip 漏掉 assets/preset-icons/（运行时图标 404）

## 17. 给 LLM 助手的接口约定

写新功能时让 LLM 知道：

1. **数模定义在哪**：`api/assets.js` 的 `newAsset` + `normalizeAsset`
2. **storage 接口**：`this.storage.readAssets()/writeAssets(arr)/readSettings()/writeSettings(s)/readWishlistEvents()/writeWishlistEvents(events)/raw.read(name)/raw.write(name, payload)/backup(name)/restore(name, backupName)`
3. **思源 API 调用**：插件代码用 `fetch('/api/...')` 走 HTTP API（端口 6806），不要 exec CLI
4. **构建命令就一个**：`node scripts/concat.js`
5. **不要碰**：`index.js`（自动生成）、`.git`、`node_modules`、`backups/` 目录
6. **不要 Vue / TS**

## 18. LLM 写 UI 必读（常见失败模式）

LLM 写本插件 UI 时**容易写偏**，下面是已知失败模式与对应规范：

### 18.1 失败模式清单

| ❌ 错误写法 | ✅ 正确写法 |
|------------|------------|
| `<Teleport to="body">` (Vue) | 直接 `host.appendChild(mask)` |
| `<Switch/>` (RN) | `<div class="am-switch">` + §7.11 CSS |
| `<BlurView intensity={100}/>` (RN) | `backdrop-filter: blur(28px) saturate(180%)` |
| `<GlassView isInteractive/>` (RN) | `.am-glass-card` + onclick handler |
| `<SymbolView name="plus" size={24}/>` (RN) | `<svg><use xlink:href="#iconX"/></svg>` |
| `<SegmentedControl values={[...]}/>` (RN) | `<div class="am-segmented">` + chip buttons |
| `<Animated.View entering={FadeIn}/>` (RN) | CSS `@keyframes amFadeIn` + `animation-delay` |
| `StyleSheet.create({...})` (RN) | 直接 inline `class="..."` 在 index.css |
| `Platform.OS === 'ios'` (RN) | `this.isMobile` |
| `useWindowDimensions()` (RN) | `window.innerWidth` 或 CSS media query |
| 写 `<div>` + `display: flex; gap` | 思源 WebView 不支持 flex gap → 用 `margin` 或 `padding` |
| 全屏用 `backdrop-filter: blur(40px)` 嵌套多层 | 只最外层 blur，子层用 `rgba(255,255,255,0.05)` 叠加 |
| 自定义颜色 `#FF5500` | 用 `#3575f3` 或思源 `var(--b3-*)` |

### 18.2 LLM 写 UI 必须遵守的 8 条

1. **纯 vanilla JS + HTML 模板字符串 + CSS**：`return \`<div>...</div>\`;`
2. **不调 expo-native-ui 任何 API**（它是 React Native 专用的概念参考）
3. **图标**用 SVG `<symbol>` via `addIcons` 注册，渲染时 `<svg><use xlink:href="#iconX"/></svg>`
4. **switch** 用 `.am-switch` (§7.11)，不用思源原生
5. **chip** 用 `.am-edit-chip--active` 高亮
6. **暗色**用 `[data-theme-mode="dark"] .am-xx`，不写 `prefers-color-scheme`
7. **动画**用 CSS `@keyframes` + `animation-delay`，不用 JS setTimeout 重排
8. **Touch target** ≥ 44×44px，移动端 FAB 50-56px

### 18.3 喂 LLM UI 任务的标准 prompt 头

```
你是 SiYuan 资产管理插件的 UI 工程师。本插件是纯 vanilla JS（无 React/Vue/Vite），
HTML 用模板字符串拼接，CSS 写在 index.css。

【UI 规范必读】
- 液态玻璃：见 §7.5 / 7.6（薄 / 中 / 厚 三层 + 6 件套）
- 配色：用 var(--b3-theme-*) + 思源蓝 #3575f3，禁硬编码颜色
- 圆角：见 §7.8（卡片 14-16，chip 8，FAB 50%）
- Switch：用 .am-switch（§7.11），不用原生 input[type=checkbox]
- 字体：var(--am-fs-title) / body / meta / hero / mini
- 动画：CSS @keyframes + var(--am-ease)（§7.12）
- 暗色：[data-theme-mode="dark"] .am-xx
- 触摸目标 ≥ 44px

【禁止】
- ❌ React/Vue 任何组件库
- ❌ expo-* / react-native-* 任何 API（概念可参考 expo-native-ui skill，但 API 不可调）
- ❌ <Teleport> / <Switch> / <BlurView> / <GlassView>
- ❌ StyleSheet.create / Platform.OS / useWindowDimensions
- ❌ 嵌套两层 backdrop-filter

【输出】
- HTML 模板字符串
- CSS（追加到 index.css 的 .am-xxx 块）
- JS 绑定（btn.onclick = () => ... 闭包绑定，不走 dock 委托）
```

## 19. iOS 液态玻璃概念映射（原 expo-native-ui skill，已删除）

原 `.opencode/skills/expo-native-ui-1.0.0/` skill 已删除，核心概念映射沉淀于本节。
本插件**不是** RN 项目，**不能调用任何 expo / react-native API**。

其设计原则（liquid glass / SF Symbols / blur tints / native tab bar / form sheet / iOS HIG）
是平台无关的；下表是这些 RN 概念到本插件 Web 实现的对应关系：

| expo-native-ui | 本插件 Web 等价 | 实现位置 |
|----------------|----------------|---------|
| `<BlurView tint="systemMaterial" intensity={100}/>` | `backdrop-filter: blur(28px) saturate(180%)` | index.css §7.6 |
| `<GlassView isInteractive/>` | `.am-glass-card` + onclick | index.css §7.6 |
| `<SymbolView name="plus"/>` | `<svg><use xlink:href="#iconPlus"/></svg>` | api/icons.js + addIcons 注册 |
| `<NativeTabs/>` | `.am-tabbar-pill` + `.am-tab-fab` | index.css TabBar |
| `<Stack presentation="formSheet">` | `.am-edit-sheet-mask` + `.am-edit-sheet` + `host.appendChild(mask)` | src.template.js openXxxSheet |
| `<Switch/>` | `.am-switch` + onclick | index.css §7.11 |
| `<SegmentedControl/>` | `.am-segmented` + chip buttons | index.css |
| `<Slider/>` | `<input type="range">` + 自定义样式 | — |
| `<DateTimePicker/>` | `<input type="date">` | — |
| `Reanimated FadeIn` | `@keyframes amFadeIn` + `animation-delay` | index.css §7.12 |
| `expo-haptics` | `navigator.vibrate(10)` + CSS `:active { transform: scale(0.96) }` | §7.13 |
| `react-native-safe-area-context` | `padding: env(safe-area-inset-bottom, 0)` | §7.3 |
| `process.env.EXPO_OS` | `this.isMobile` (UA 匹配) | src.template.js constructor |
| `useWindowDimensions` | `window.innerWidth` 或 CSS media query | — |

**LLM 喂 UI 任务时**：直接用本节映射表理解 iOS 模式对应的 Web 实现，
**输出必须用 Web vanilla JS + CSS**，不能用 RN 组件 API。
