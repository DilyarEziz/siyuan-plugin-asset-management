# 当前 formal-v2 边界（截至 v2.5.0）

本文件描述当前 formal-v2 生产数据边界，截至 v2.5.0。所有文件均使用严格白名单校验；未知字段、非法外键、不兼容 wrapper 会 fail-closed，不会在读取时静默修复或回写。仅下文明确列出的存量缺键兼容会在读取时补齐内存 canonical 值。

## 版本迁移

v0.18 引入 formal-v2 schemaGeneration。v0.17 的 formal-v1 数据**不会自动迁移**；读取旧数据会抛 `FORMAL_SCHEMA_RESET_REQUIRED`，要求用户先下载完整 JSON 备份，然后执行显式重置。

## 资产主表

`assets.json` wrapper 固定为 `{ schemaGeneration: "formal-v2", schemaVersion: 1, assets }`。

- `kind` 仅为：`physical`、`virtualSubscription`、`virtualPerpetual`、`prepaidAmount`、`prepaidCount`。
- `categoryId` 可选且受控；允许值为 `digital/appliance/home/otherPhysical`（physical）、`member/software/service/domain/ai/otherVirtual`（virtual；买断仅 `software` / `otherVirtual`）、`prepaidAmount`（金额预付）和 `prepaidCount`（次数预付）。旧 `category` 不是正式字段。
- canonical owned 顶层字段：`id`（小写 UUID）、`kind`、`name`、`status`、`currency`（ISO 4217）、`acquiredOn`、`statusChangedOn`、`categoryId`、`tagIds`（最多 3 个 UUID 外键）、`cover`、`notes`、`createdAt`、`updatedAt`、`details`、`indexBlockId`、`relatedNotes`。
- `indexBlockId` 仅用于 owned 资产，值为索引文档中该资产块的非空 ID（最长 64 字符）或 `null`；wishlist 极简 schema 不携带该字段。
- `relatedNotes` 仅用于 owned 资产，是手动关联笔记数组；元素严格为 `{ id, title, addedAt }`，其中 `id` 非空、`title` 最长 200 字符、`addedAt` 为 UTC ISO instant，并按 `id` 去重。
- ≤2.4.2 写入的 owned 资产可能缺少 `indexBlockId` / `relatedNotes`；读取时分别等价为 `null` / `[]`，写入路径始终输出两个 canonical 键，无迁移无重置。
- `details` 是按 `kind` 互斥的 discriminated object：
  - `physical`：`warrantyEndsOn`（YYYY-MM-DD 或 null）、`costGoal`（`{ targetDailyAmountMinor, targetEndsOn }` 或 null）
  - `virtualSubscription`：`planName`、`accountLabel`、`billingPlan: { cycle }`、`autoRenew`
  - `virtualPerpetual`：`licenseAccountLabel`
  - `prepaidAmount`：`provider`、`expiresOn`
  - `prepaidCount`：`provider`、`expiresOn`（显示单位固定为"次"，不持久化）
- `tagIds` 仅保存 `tags.json` 的 UUID 外键；不冗余标签文本。
- `cover` 是结构化引用：`none`、`upload(assetPath)`、`workspaceAsset(assetPath)`、`preset(presetId)` 或 `emoji(emoji)`；不是 URL，也不需要额外 covers sidecar。
- 旧字段（**已删除，必须抛 `FORMAL_ASSET_INVALID`**）：`dailyCostOverrideMinor`、`usageTrackingEnabled`、`skipNextRenewal`、`renewalScore`、`worthRenewingScore`、`versionLabel`、`costGoal`（virtualPerpetual）、`accountLabel`（prepaid）、`unitLabel`、`reminderPolicy`、`soldPrice`、`price`、`purchasePrice`、`balance`、`balanceAfter`、`remainingCount`、`customDailyCost`、`targetDailyCost`、`expiryReminder`、`nextBillingDate`、`endDate`、`lastUsedDate`、`renewals`、`tags`（旧 string[] 形式）、`trackUsage`、`isTrial`、`trialEndDate`。
- 新建 UI 仅提供 `CNY` 与 `USD`；ISO 4217 校验仍保留，以保证历史快照可读取和导出。

## wishlist（极简）

- 用户可填写字段：`name`、`cover`、`currency`、`expectedAmount`、`targetGroup`、`heartbeatTarget`。
- `targetGroup` 三个合法值：`physical`、`virtual`、`prepaid`。
- `heartbeatTarget`（v2.4.2 心动值）：可选目标心动值，`null` 或 1-999 的安全整数；`null` / 缺省表示无目标（纯计数模式）。心动计数**不落主表**，由 `wishlistEvents.json` 的 `heartbeat` 事件流实时派生（每条事件计数 +1），旧数据缺省键 normalize 为 `null`，无需迁移。
- 兼容读取例外（wishlist 心动值）：≤2.4.1 写入的存量数据（`assets.json` 的 wishlist 资产、`wishlistEvents.json` 既有事件内嵌的 `sourceSnapshot`）其 `wishlist` 子对象可能缺 `heartbeatTarget` 键，读取校验时缺键等价 `null`，无迁移无重置正常加载；写入路径（normalize）始终输出 4 键 canonical，未知键仍 fail-closed 拒绝。
- 内部 carrier kind 由 `targetGroup` 决定：`physical` → `physical`、`virtual` → `virtualSubscription`、`prepaid` → `prepaidAmount`；该 carrier kind **不得显示**，不得作为购买时的锁定类型。
- `wishlist.targetGroup` 才是购买路由真值：
  - `physical` → 直接打开实物表单
  - `virtual` → 选订阅/买断 → 对应表单
  - `prepaid` → 选金额/次数 → 对应表单
- 旧字段（**已删除**）：`categoryId`、`tagIds`、`notes`、`reason`（在 wishlist 上保留为可选 `reason` 字段，max 500 字符）、`status`、`acquiredOn`、`statusChangedOn`、`reminderPolicy`、`details`。

## 索引文档设置

`settings.json` 仍使用 `schemaVersion=1`，v2.5.0 新增六个索引配置键：

- `indexEnabled`：是否启用索引引擎，默认 `false`；只有用户显式创建索引后才开启。
- `indexNotebookId`：索引文档所在笔记本 ID，默认空字符串。
- `indexDocPath`：创建时使用的人类可读路径，默认 `/资产管理插件索引文档——不建议手动操作`；同步身份不依赖该路径。
- `indexDocId`：索引文档块 ID，默认空字符串，是文档移动或重命名后的唯一同步依据。
- `indexAutoSync`：是否在资产提交后自动同步，默认 `true`。
- `indexIncludeCover`：索引条目是否包含封面，默认 `false`。

存量 settings 缺少以上键时按默认值读取。

## 金额与财务流水

`financialEvents.json` 是一切货币金额的**唯一真值**。每条记录固定包含 `assetId`、`occurredAt`、`effectiveDate`、`currency`、非负安全整数 `amountMinor`、`direction` 和 `eventType`。

- `eventType`：`purchase`、`additionalCost`、`maintenance`、`subscriptionPayment`、`prepaidCharge`、`prepaidConsumption`、`sale`、`refund`、`income`、`adjustment`。
- 维保和订阅周期单向引用各自的 financial event；不在 financial event 反向冗余 ID，以避免双向同步真值。
- `replacesEventId` + `voidedAt` 定义更正链；替换必须保持同资产、同币种、同事件类型及同方向。

实物转让：用户填写转让价格时，必须同事务创建 `direction=inflow`、`eventType=sale` 的财务事件；**不得**写入 `details.soldPrice` 主表字段。

## 订阅、预付与生命周期 sidecar

- `subscriptionPeriods.json`：一条 period 有 `kind`（`trial` / `billing` / `grace` / `complimentary`）、`startDate`、`endDate`、`paymentEventId`。billing period 必须关联 `subscriptionPayment`；同资产有效 period 不可重叠，可以存在中断空档。金额来自关联财务流水，周期来自资产 billing plan，状态由日期与 `voidedAt` 实时派生，不冗余存储。
- `prepaidTransactions.json`：`opening` / `inflow` / `outflow` / `refund` / `adjust` 流水。金额型权益通过关联财务流水取金额；次数型权益存 `count`。当前余额 / 剩余次数永远实时派生，主表和流水均不缓存 `balanceAfter` / `remainingCount`。
- **次数预付余额校正**：编辑表单可手动设定"剩余次数"目标值 `T`；保存时读当前投影 `C`：
  - `T > C` → 写 `adjust`，`dimension=count`，`direction=inflow`，`count=T-C`，`financialEventId=null`
  - `T < C` → 写 `adjust`，`dimension=count`，`direction=outflow`，`count=C-T`，`financialEventId=null`
  - `T = C` → noop
- **次数预付消费**：写 `outflow`，`dimension=count`，`direction=outflow`；当前剩余次数 `< count` 时抛错（`insufficient remaining count`）。
- 调整与消费均不计现金，`financialEventId=null`。
- `lifecycleEvents.json` 的唯一落盘 shape 为 event envelope 加 `kind` 与 `details`；不使用旧的 `eventType` / `fromStatus` / `toStatus` 落盘形式。

### 订阅 autoRenew lifecycle

- **关闭自动续费**：仅写 `details.autoRenew=false`；不修改 status，不删除账期，不删除付款；写 lifecycle event（`details.action='subscriptionAutoRenewDisabled'`）。
- **开启自动续费**：仅写 `details.autoRenew=true`；写 lifecycle event（`details.action='subscriptionAutoRenewEnabled'`）。
- **续订**：用户调用续订表单，**同事务**创建 `subscriptionPayment` financial event + 不重叠的 billing period + `subscriptionRenewed` lifecycle event + operationLog；**绝不**修改 `autoRenew`，**绝不**修改 `status`。
- 手动续订可对已到期（`autoRenew=false`）的订阅生效，且**不得强制打开** autoRenew。
- 旧的 `subscriptionCancelled` / `subscriptionSkipped` 运行时语义已删除（asset 不再通过 `status=retired` 表达取消订阅）。

## 跨类型日期投影

`getFormalNextImportantDate()` 是唯一的只读聚合入口：实物取 `warrantyEndsOn`，订阅取当前/最后周期结束日，预付取 `expiresOn`，买断资产无到期日。该值用于提醒、排序和报表，**绝不写回主表**。

订阅状态投影（`projectFormalSubscription`）：

- 当前日期处于有效账期 → `subscribed`
- 当前日期超过最后账期结束日 + `autoRenew=false` → `expired`
- 当前日期超过最后账期结束日 + `autoRenew=true` → `pendingConfirmation`
- 没有账期但资产存在 → `indeterminate`（不能伪造到期或续订）

## 删除与重置

当前"删除资产"是硬删除：会删除其关联 sidecar 记录，仅保留操作日志快照。审计型长期保留需求应另行引入归档 / tombstone 语义。

正式重置是显式危险操作；操作前应先下载完整 formal JSON 备份。事务失败会补偿回滚，但成功重置不会自动保留原业务数据。

## fail-closed 边界

- 启动读取 `assets.json`：`schemaGeneration !== 'formal-v2'` 时抛 `FORMAL_SCHEMA_RESET_REQUIRED`，错误信息 `"assets.json is not a formal-v2 wrapper; explicit reset is required"`。
- 导入备份：`schemaGeneration` 必须为 `'formal-v2'`；v1 备份不兼容。
- 所有 sidecar `schemaVersion` 必须为 1；不同版本抛 `RESET_REQUIRED`。
- 资产对象出现任意旧字段（见上）→ 抛 `FORMAL_ASSET_INVALID`，不静默丢弃、不回写。
