# UI ↔ Agent 能力矩阵

> 当前事实版本：`2.6.0`。本文件记录当前内核 Agent 工具与现有正式业务入口的边界。
> 当前 Agent 能力已覆盖查询、字段修改、订阅周期、标签、价格和记录；不修改 formal-v2 数据白名单，不清空数据，不部署。

## 1. 阅读规则

| 标记 | 含义 |
| --- | --- |
| ✅ | 当前已实现，并有正式入口 |
| 🟡 | 当前可用，但覆盖不完整或只接受受限字段 |
| ⏳ | 后续阶段实现；本阶段明确不宣称已支持 |
| 🚫 | Agent 禁止直接走该路径 |

“正式入口”指 `src.template.js` 中已有的公开业务方法。Agent 通过 `kernel.js` 注册工具读取安全投影；新写入经 `agent-writes/pending`、`processing`、`completed` 独立文件桥接到前端，再由这些正式方法执行。旧 queue/results 文件仅用于兼容收尾。

## 2. UI ↔ Agent 能力矩阵

| 能力 | UI 当前能力 | Agent 工具 / 参数 | 权限 | 正式业务入口 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 查询与统计 | 列表、矩阵、统计、报表、搜索、状态/类型/分类/标签筛选 | `asset_query`：`count`、`search`、`detail`、`summary`、`tags` | `aiAllowQuery` | 只读安全投影；不写业务数据 | ✅ |
| 查询 display | UI 显示类型、状态、分类、标签、到期和预付投影 | `asset_query` 返回机器字段和 `display`（类型、状态、分类、周期、自动续费、标签） | `aiAllowQuery` | `projectSafeAsset` | ✅ 保留机器值，同时提供中英文 display |
| 创建正式资产 | UI 创建 `physical`、`virtualSubscription`、`virtualPerpetual`、`prepaidAmount`、`prepaidCount`，并支持种草入口 | `asset_create`：`data` 加可选 `purchaseAmountMinor`、`prepaidInitialAmountMinor`、`prepaidOpeningCount`、`subscriptionPeriodEnd` | `aiAllowCreate` | `addAsset` | ✅ |
| 基础修改 | UI 修改名称、分类、标签、备注和当前类型允许的详情字段 | `asset_update`：只允许 `name`、`categoryId`、`tagIds`、`notes`、受限 `details` | `aiAllowModify` | `updateAsset` | 🟡 不允许通过 Agent 改类型、状态、标识、封面路径或凭据 |
| 订阅字段 | UI 可编辑订阅计划、周期、起期、结束日、金额和自动续费 | `asset_update` 修改计划/周期；`asset_lifecycle` 使用 `updateStartDate` / `updatePeriodEnd`；自动续费走 `toggleAutoRenew`；支持 `monthly/quarterly/halfYearly/yearly` | `aiAllowModify` / `aiAllowLifecycle` | `updateAsset`、`updateSubscriptionStartDate`、`updateSubscriptionPeriodEnd`、`toggleSubscriptionAutoRenew` | ✅ 起期/结束日复用正式周期事务，周期配置不追溯历史账期 |
| 订阅起期 | UI 可编辑首期开始日期，并重锚首期周期 | 创建时可用 `data.acquiredOn`；已有资产使用 `asset_lifecycle` 的 `op=updateStartDate` | `aiAllowCreate` / `aiAllowLifecycle` | `addAsset`、`updateSubscriptionStartDate` | ✅ |
| 订阅结束日 / 周期 | UI 可编辑最近周期结束日 | 创建时可用 `subscriptionPeriodEnd`；已有资产使用 `asset_lifecycle` 的 `op=updatePeriodEnd` | `aiAllowCreate` / `aiAllowLifecycle` | `addAsset`、`updateSubscriptionPeriodEnd` | ✅ |
| 自动续费 | UI 切换订阅自动续费 | `asset_lifecycle`：`op=toggleAutoRenew`、`enabled` | `aiAllowLifecycle` | `toggleSubscriptionAutoRenew` | ✅ |
| 价格 | UI 更正购买价或最近订阅付款 | 首选 `asset_price_update`：`action=update`；兼容入口为 `asset_record` 的 `purchaseAmount` / `subscriptionPaymentAmount` | `aiAllowRecords` | `correctPurchaseAmount`、`correctSubscriptionPaymentAmount` | ✅ 使用正式替换审计；不得用普通修改、维保或续费表达价格更正 |
| 续费 | UI 为订阅生成新的付款和周期 | `asset_lifecycle`：`op=renewSubscription`，支持 `startDate`、`endDate`、`amountMinor`、`cycle` | `aiAllowLifecycle` + `aiAllowRecords` | `renewSubscription` | ✅ 日期不可逆序；活动周期不可重叠 |
| 维保 | UI 为实物记录维修/保养及费用 | `asset_record`：`op=maintenance`，`type=repair` / `maintain` | `aiAllowRecords` | `addMaintenanceRecord` | ✅ 仅实物 |
| 预付充值/消费/调整 | UI 支持金额型与次数型预付流水、次数校正和消费 | `asset_record`：`prepaidTransaction`、`prepaidAdjust`、`prepaidConsumption` | `aiAllowRecords` | `addPrepaidTransaction`、`recordPrepaidCountAdjustment`、`recordPrepaidConsumption` | ✅ 按资产 kind 匹配金额/次数维度 |
| 状态 | UI 支持在役、退役和实物转让流程 | `asset_lifecycle`：`setStatus`、`retire`、`sale` | `aiAllowLifecycle`；`sale` 另需 `aiAllowRecords` | `setStatus`、`retirePhysicalAsset`、`recordPhysicalSaleAsset` | ✅ `retired` 只适用于实物 |
| 删除 | UI 删除资产并由正式事务处理关联记录 | `asset_delete`：仅接受准确 `assetId` | `aiAllowDelete` | `deleteAsset` | ✅ 永久删除，调用前必须先查询确认 |
| 标签查询 | UI 标签筛选、标签 chip 和标签管理 | `asset_query` 支持 `tag` / `tagId` / `tags`，资产结果返回 `display.tags` | `aiAllowQuery` | 只读查询投影 | ✅ |
| 标签修改 | UI 编辑资产时可选已有标签 | `asset_tag_update`：按名称精确 add/remove/replace，最多 3 个 | `aiAllowModify` | `updateAssetTags` | ✅ 写入时不使用模糊匹配 |
| 标签创建并绑定 | UI 可创建标签并关联资产 | `asset_tag_create`：创建缺失标签并原子绑定 | `aiAllowCreate` + `aiAllowModify` | `createAndBindAssetTags` | ✅ 同一 formal 事务，竞态下复用同名标签 |

### 2.1 当前九个 Agent 工具

| 工具 | action | 作用 | 写入 |
| --- | --- | --- | --- |
| `asset_query` | `query` | 查询、分页搜索、详情、汇总 | 否 |
| `asset_create` | `create` | 创建资产和创建时的首笔正式记录 | 是 |
| `asset_update` | `update` | 基础字段和受限详情修改 | 是 |
| `asset_lifecycle` | `update` | 状态、退役、转让、续费、自动续费 | 是 |
| `asset_price_update` | `update` | 购买价或最近订阅付款更正 | 是 |
| `asset_record` | `create` 或 `update` | 维保、预付、购买价/订阅付款更正 | 是 |
| `asset_tag_update` | `update` | 按名称绑定已有标签 | 是 |
| `asset_tag_create` | `create` | 创建缺失标签并绑定 | 是 |
| `asset_delete` | `delete` | 删除资产及其正式关联记录 | 是 |

`asset_record` 的 `purchaseAmount` 与 `subscriptionPaymentAmount` 使用 `action=update`；其余记录操作使用 `action=create`。该规则与当前注册工具协议一致。

### 2.2 六个权限键

| 权限键 | 覆盖工具 | 说明 |
| --- | --- | --- |
| `aiAllowQuery` | `asset_query` | 只读查询和安全投影 |
| `aiAllowCreate` | `asset_create` | 创建资产 |
| `aiAllowModify` | `asset_update` | 基础修改和受限详情 |
| `aiAllowLifecycle` | `asset_lifecycle` | 状态、退役、自动续费；转让和续费还要记录权限 |
| `aiAllowRecords` | `asset_record`、`asset_price_update` | 价格、订阅付款、维保、预付；转让和续费的第二道权限 |
| `aiAllowDelete` | `asset_delete` | 删除资产 |

此外有一个独立的总开关 `aiEnabled`。总开关关闭时所有工具返回 `AGENT_DISABLED`；六个权限关闭时返回 `PERMISSION_DENIED`。权限错误的恢复提示固定指向“资产管理设置 → AI”，并按 `locale` 输出中英文文案。

## 3. 正式业务入口

### 3.1 Agent 当前可调用的写入口

```text
addAsset
updateAsset
setStatus
deleteAsset
retirePhysicalAsset
recordPhysicalSaleAsset
renewSubscription
toggleSubscriptionAutoRenew
addMaintenanceRecord
addPrepaidTransaction
recordPrepaidCountAdjustment
recordPrepaidConsumption
correctPurchaseAmount
correctSubscriptionPaymentAmount
updateSubscriptionStartDate
updateSubscriptionPeriodEnd
updateAssetTags
createAndBindAssetTags
```

这些方法由前端写队列调用，Agent 不直接调用文件 API，也不直接拼接事件记录。查询使用 `getDomain` / `getQueryDomain` 得到完整域快照后，经 `projectSafeAsset` 输出。

### 3.2 明确排除入口

以下 UI 正式方法仍没有加入 Agent 工具的可调用范围：

```text
createTag
updateTag
deleteTag
```

它们属于明确排除范围：标签改名/颜色/删除、账号凭据、封面路径、笔记索引、关联笔记和资产 kind/currency 修改不通过隐式工具开放。

## 4. Agent 禁止路径

- 🚫 直接读写 `assets.json`、标签/财务/订阅/预付等内部记录文件或任何本地路径。
- 🚫 直接构造、替换或删除正式关联记录；必须调用上表正式业务入口，让事务、审计和投影保持一致。
- 🚫 直接调用 `_commitAssetAuditMutation` 等内部实现，或绕过 `pending/processing/completed` 写桥。
- 🚫 用资产名称猜测目标；写操作必须先查询，再使用准确 `assetId`。
- 🚫 通过 `asset_update` 修改状态、类型、标识、封面路径、账号或凭据。
- 🚫 用维保、差额事件或续费冒充价格更正；价格更正必须使用 `asset_price_update` 或兼容的记录操作。
- 🚫 把底层错误、字段路径、内部契约术语、文件名或堆栈转发给 Agent。
- 🚫 在本阶段修改 formal-v2 白名单、存储 schema、业务事务、构建产物或主空间数据。

## 5. 稳定错误契约

失败 envelope 保持旧读取方需要的 `error.code` 和 `error.message`，并允许新增可选字段：

```json
{
  "ok": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "此 Agent 工具未获允许。",
    "recovery": "请在“资产管理设置 → AI”中开启对应权限后重试。",
    "locale": "zh-CN"
  }
}
```

- `code` 是机器可读值，保留现有公开 code；可从底层错误归一化订阅重叠、日期和续费误用。
- `message` 是面向 Agent/用户的稳定文案，不包含参数路径、UUID 格式提示、本地路径、堆栈、内部契约术语、关联记录文件名或存储实现细节。
- `recovery` 给出用户可执行的下一步；未知底层错误使用通用恢复提示。
- `locale` 当前支持 `zh-CN` 与 `en-US`；未提供时使用英文默认值。它只影响错误展示，不改变业务协议。

当前已覆盖的错误边界包括：`UNKNOWN_FIELD`、`INVALID_KIND`、`INVALID_ACTION`、`INVALID_STATUS`、`INVALID_AMOUNT`、`DOMAIN_UNAVAILABLE`、`PERMISSION_DENIED`、`AGENT_DISABLED`、订阅周期重叠、订阅日期无效、续费误用，以及无法识别的底层错误。

## 6. 阶段验收状态

| 验收项 | 状态 |
| --- | --- |
| UI 当前能力、九个工具、六个权限和正式入口事实一致 | ✅ |
| 创建、查询、基础修改、订阅起止日/自动续费、价格、续费、维保、预付、状态、删除、标签、display 均有明确状态 | ✅ |
| 成功 envelope、工具名、权限键和独立写桥协议稳定 | ✅ |
| 失败仍提供 `error.code` / `error.message`，并可提供 `recovery` / `locale` | ✅ |
| 用户错误文案不泄露路径、字段路径、UUID 提示、内部契约术语、文件名或堆栈 | ✅ |
| 订阅字段完整 Agent 接入 | ✅ |
| 标签目录操作与本地化 display | ✅ |
| Web Locks 写入协调与无锁 fail-closed | ✅ |
| 独立 pending/processing/completed 写桥与硬超时 | ✅ |
| formal-v2 schema、存储结构和业务事务变更 | 🚫 本阶段禁止 |
| 部署、清空或修改主空间数据 | 🚫 本阶段禁止 |
