# formal-v2 数据契约规格

> **版本**：v0.18.0 准备稿（基于 v0.17.0 formal-v1）
> **作用**：规划一份从零重建的严格白名单数据契约。读旧 formal-v1 资产必须 fail-closed，要求显式备份后重置。
> **范围**：仅规划，不改代码；阶段 1-11 实施时按本规格落地。

---

## 1. 背景与目标

### 1.1 当前 v0.17 formal-v1 残留风险

| 风险点 | 现状 | v2 处理 |
|--------|------|---------|
| `details` 字段白名单与 v0.16 预合约字段并存 | `FORMAL_DETAIL_KEYS` 仍包含 `dailyCostOverrideMinor`、`skipNextRenewal`、`usageTrackingEnabled`、`renewalScore`、`versionLabel`、`accountLabel`（prepaid/prepaid）、`unitLabel`、`costGoal`（买断虚拟）等"已删但兼容读取"字段 | 重新白名单化，`FORMAL_V1_DEPRECATED_DETAIL_KEYS` 整体删除，所有 v1 字段全部抛 `FORMAL_ASSET_INVALID` |
| `upgradeFormalV1DeprecatedAsset` 隐式迁移 | `api/storage.js` + `api/assets.js` 中存在 v1 → v1 兼容清理路径 | 删除全部 v1→v1 升级函数；读到 v1 wrapper 直接 `RESET_REQUIRED` |
| `skipNextRenewal` 业务仍存在 | `_formalSkipSubscription` + `renewalDecision*` i18n 仍生效 | 完全删除跳过逻辑、UI、生命周期事件、i18n、测试 |
| 评分机制（renewalScore / worthRenewingScore）残留 | 历史 i18n、测试、隐式评分 select | 完全删除，无残留 |
| 使用追踪（usageTrackingEnabled + usage.json） | `supportsFormalUsageTracking`、`addUsageRecord`、`openUsageSheet`、`markAssetUsed` 仍存在 | 完整删除功能、API、文件、UI、报表字段、生命周期事件 |
| 金额真值散落 | `details.purchasePrice`、`details.soldPrice`、`details.balance`、`details.balanceAfter` 等隐式缓存 | 仅 `financialEvents.json.amountMinor` 是金额真值；details 不缓存任何金额 |
| 预付余额/次数散落 | 旧版 `details.remainingCount`、`details.balance`、`details.balanceAfter` | 仅 `prepaidTransactions.json` 是投影真值；details 不缓存余额 |
| 跨域变更不同事务 | 退役 sale、改 autoRenew、续订等只动单个 sidecar | 所有跨 assets / financialEvents / subscriptionPeriods / prepaidTransactions / lifecycleEvents / operationLogs 的变更必须同一正式域事务提交，提交后校验完整 snapshot |
| i18n 与代码残留 | zh_CN / en_US 仍有 `renewDecision*`、`prepaidAdjust*`、`versionLabel`、`unitLabel`、`accountLabel` 等 key | 双语同步清理；不允许"代码删了但 i18n 留着" |

### 1.2 v2 核心目标

1. **全新白名单**：5 类正式资产 + wishlist 的 `details` 字段全部最小化；任何 v1 字段直接 fail-closed。
2. **单一真值**：金额 → `financialEvents`；预付余额/次数 → `prepaidTransactions`；账期 → `subscriptionPeriods`；状态日期 → `assets.statusChangedOn`。
3. **跨域事务**：所有相关 sidecar 必须在同一正式域事务内提交，并写完整 lifecycle + opLog。
4. **fail-closed 启动**：读 v1 wrapper / 任何字段冗余 → 抛 `RESET_REQUIRED`，UI 进入开发期阻断态，禁写。
5. **极简 UI**：表单字段收敛到最小集合，移除评分/跳过/usage/版本/单价单位/账号（除买断 licenseAccountLabel）等所有历史残留。

---
## 2. 字段契约（白名单 + 强制拒绝）

### 2.1 主表 wrapper

```
{
  schemaGeneration: "formal-v2",      // 新常量；旧 "formal-v1" 全部 RESET_REQUIRED
  schemaVersion: 1,
  assets: Asset[],
  updatedAt: UTC ISO string
}
```

### 2.2 资产公共字段（5 类正式 + wishlist 共有）

| 字段 | 类型 | 备注 |
|------|------|------|
| `id` | lowercase UUID | 主键 |
| `kind` | enum: `physical` / `virtualSubscription` / `virtualPerpetual` / `prepaidAmount` / `prepaidCount` / wishlist carrier | 见 §2.7 |
| `name` | string(1..200) | 必填 |
| `currency` | ISO 4217 | 必填；wishlist 也保留 |
| `categoryId` | nullable string | 受 `FORMAL_CATEGORIES` 控制；wishlist 必为 null |
| `tagIds` | lowercase UUID[]（≤3） | tags.json 外键 |
| `cover` | discriminated: `none` / `upload` / `workspaceAsset` / `preset` / `emoji` | 严格 5 选 1 |
| `notes` | string(0..5000) | |
| `createdAt` | UTC ISO | |
| `updatedAt` | UTC ISO | |

### 2.3 owned（5 类正式）公共扩展字段

| 字段 | 类型 | 备注 |
|------|------|------|
| `status` | `active` / `retired` | 物理允许 retired，其余固定 active |
| `acquiredOn` | YYYY-MM-DD | 拥有日期；实物退役时不重写 |
| `statusChangedOn` | YYYY-MM-DD | 退役/重启用同一字段 |

### 2.4 details 白名单（5 类正式）

| kind | 允许字段 | 禁止字段 |
|------|---------|----------|
| `physical` | `warrantyEndsOn` (YYYY-MM-DD \| null)、`costGoal { targetDailyAmountMinor, targetEndsOn }` \| null | `dailyCostOverrideMinor`、`usageTrackingEnabled`、任何其他字段 |
| `virtualSubscription` | `planName` (string)、`accountLabel` (string \| null)、`billingPlan { cycle: 'monthly'\|'quarterly'\|'yearly' }`、`autoRenew` (boolean) | `skipNextRenewal`、`renewalScore`、`worthRenewingScore`、`usageTrackingEnabled`、costGoal、targetDailyAmountMinor、targetEndsOn、versionLabel |
| `virtualPerpetual` | `licenseAccountLabel` (string \| null) | `versionLabel`、`usageTrackingEnabled`、`costGoal`、任何账号/账期/状态控件 |
| `prepaidAmount` | `provider` (string \| null)、`expiresOn` (YYYY-MM-DD \| null) | `accountLabel`、`unitLabel`、`balance`、`balanceAfter`、`remainingAmount`、`purchasePrice` |
| `prepaidCount` | `provider` (string \| null)、`expiresOn` (YYYY-MM-DD \| null) | `accountLabel`、`unitLabel`、`remainingCount`、`balance` |

> 单位"次"由前端固定渲染，不持久化。账号字段仅 `virtualPerpetual.licenseAccountLabel` 保留；其余场景的"账号"语义废弃。

### 2.5 wishlist 字段（4 项）

| 字段 | 类型 | 备注 |
|------|------|------|
| `wishlist.expectedAmountMinor` | non-negative safe integer \| null | 用户填写预期价格 |
| `wishlist.reason` | string(0..500) | 可选 |
| `wishlist.targetGroup` | enum: `physical` / `virtual` / `prepaid` | **唯一**购买路由真值 |

wishlist 资产结构与 owned 资产一致（用相同的 wrapper），但 `details` / `acquiredOn` / `statusChangedOn` / `reminderPolicy` 不出现；`kind` 为 carrier 内部值，不显示，不可作为锁定类型。

### 2.6 财务流水 / 订阅周期 / 预付流水 / 生命周期 / 操作日志

- **financialEvents**：唯一金额真值；覆盖 purchase / subscriptionPayment / prepaidCharge / prepaidConsumption / sale / refund / additionalCost / maintenance / income / adjustment。
- **subscriptionPeriods**：账期；`paymentEventId` 关联 subscriptionPayment；kind: trial/billing/grace/complimentary；不重叠。
- **prepaidTransactions**：唯一预付余额/次数真值；type: opening/inflow/outflow/refund/adjust；amount 维度关联 financialEvent，count 维度自带 count 字段。
- **lifecycleEvents**：event envelope + `kind` + `details`；新增 `subscriptionAutoRenewEnabled` / `subscriptionAutoRenewDisabled`，删除运行时语义 `subscriptionCancelled` / `subscriptionSkipped`。
- **operationLogs**：add/update/delete/set-status/wishlist-* + 新增 `subscription-auto-renew-enabled` / `subscription-auto-renew-disabled` / `subscription-renewed` / `asset-sold` 等业务动作；旧 `subscription-cancel` / `subscription-skip` 全部删除。

### 2.7 wishlist 内部 carrier kind 映射

| wishlist.targetGroup | carrier kind | 锁定为购买类型 |
|---------------------|--------------|----------------|
| `physical` | `physical` | 否（可切换） |
| `virtual` | `virtualSubscription`（默认） | 否（购买时先选订阅/买断） |
| `prepaid` | `prepaidAmount`（默认） | 否（购买时先选金额/次数） |

> 内部 carrier 不展示，不影响表单 kind 选择；仅用于唯一资产结构。

### 2.8 强制 fail-closed 字段清单

| 来源 | 字段 | v2 处理 |
|------|------|---------|
| `assets.details`（physical） | `dailyCostOverrideMinor`、`usageTrackingEnabled` | 直接抛 `FORMAL_ASSET_INVALID` |
| `assets.details`（virtualSubscription） | `skipNextRenewal`、`renewalScore`、`worthRenewingScore`、`usageTrackingEnabled` | 同上 |
| `assets.details`（virtualPerpetual） | `versionLabel`、`usageTrackingEnabled`、`costGoal` | 同上 |
| `assets.details`（prepaidAmount） | `accountLabel` | 同上 |
| `assets.details`（prepaidCount） | `accountLabel`、`unitLabel` | 同上 |
| 顶层 assets / wishlist | `price`、`soldPrice`、`balance`、`balanceAfter`、`remainingCount`、`purchasePrice`、`targetDailyCost`、`customDailyCost`、`nextBillingDate`、`lastUsedDate`、`trackUsage`、`isTrial`、`trialEndDate`、`renewals` | 同上 |
| wrapper | `schemaGeneration !== 'formal-v2'` 或 `schemaVersion !== 1` | `RESET_REQUIRED` |

---
## 3. 关键事务清单

所有跨 `assets` / `financialEvents` / `subscriptionPeriods` / `prepaidTransactions` / `lifecycleEvents` / `operationLogs` 的变更必须**同一正式域事务**提交；提交后必须 `readFormalDomainSnapshotInsideQueue` 校验完整 snapshot 合法。

### 3.1 实物退役/转让事务

**触发**：实物资产退役（status: active → retired）；如填写转让价格，同事务写 sale financial event。

**事务内动作**：
1. `assets`：当前资产 `status = retired`，`statusChangedOn = effectiveDate`，`updatedAt = now`。
2. `financialEvents`：若用户填转让价 → 新增 `direction=inflow`、`eventType=sale`、`amountMinor=soldPrice`、`currency=asset.currency`。
3. `lifecycleEvents`：新增 `kind=retired`（含 soldPriceMinor、effectiveDate、currency 等详情）。
4. `operationLogs`：新增 `type=asset-sold`（含转让）或 `type=set-status`（仅退役）。

**约束**：
- `details.dailyCostOverrideMinor` / `soldPrice` 等任何金额字段不写入 details。
- `statusChangedOn` 与 `acquiredOn` 不强制联动；退役不重置 acquiredOn。
- 不联动 usage / maintenance 的写入（仅退役自身事件）。

### 3.2 订阅 autoRenew 开关事务

**触发**：用户切换订阅资产 `details.autoRenew` 布尔值。

**事务内动作**：
1. `assets`：当前资产 `details.autoRenew = target`，`updatedAt = now`。
2. `lifecycleEvents`：新增
   - `kind=subscriptionAutoRenewEnabled`（开启时）
   - `kind=subscriptionAutoRenewDisabled`（关闭时）
3. `operationLogs`：新增 `type=subscription-auto-renew-{enabled,disabled}`。

**约束**：
- 不写 `status=retired`，不删账期/付款/旧 lifecycle。
- 不联动 financial events。
- 不联动 prepaid sidecar。

### 3.3 订阅续订事务

**触发**：用户对订阅资产执行"续费"操作（无论 autoRenew 当前值）。

**事务内动作**：
1. `financialEvents`：新增 `direction=outflow`、`eventType=subscriptionPayment`、`amountMinor=paidAmount`、`currency=asset.currency`。
2. `subscriptionPeriods`：新增 `kind=billing`、`startDate`、`endDate`、`paymentEventId=上面 event.id`，与其他有效 period 不可重叠。
3. `lifecycleEvents`：新增 `kind=subscriptionRenewed`，含 `periodId / startDate / endDate`。
4. `operationLogs`：新增 `type=subscription-renewed`。

**约束**：
- **不得**隐式把 `autoRenew` 改为 true。
- 不修改 `status`，不删除旧 period。
- 已到期（autoRenew=false）时仍允许手动续订。

### 3.4 次数预付余额校正事务

**触发**：次数预付编辑表单设定"剩余次数目标值" T，与当前投影 C 不同。

**事务内动作**：
1. `prepaidTransactions`：新增
   - `type=adjust`、`dimension=count`、方向由 T 与 C 比较决定：
     - T > C → `direction=inflow`、`count=T-C`、`financialEventId=null`
     - T < C → `direction=outflow`、`count=C-T`、`financialEventId=null`
   - `note` 固定为 `"balance adjustment to <T>"`。
   - `effectiveDate = todayISO()`。
2. `lifecycleEvents`：新增 `kind=prepaidTransaction`，含 `transactionId / type=adjust / fromCount / toCount`。
3. `operationLogs`：新增 `type=prepaid-adjust`。

**约束**：
- `financialEventId=null`（校正不计现金）。
- 不写 details.remainingCount / balance。
- 任何操作后投影 `remainingCount >= 0`（保存时校验）。

### 3.5 次数预付消费事务（"记一笔" outflow）

**触发**：次数预付"记一笔"选择 outflow。

**事务内动作**：
1. `prepaidTransactions`：新增 `type=outflow`、`dimension=count`、`direction=outflow`、`count=N`、`financialEventId=null`。
2. 不写 financial events（outflow 不影响现金）。
3. `lifecycleEvents`：新增 `kind=prepaidTransaction`。
4. `operationLogs`：新增 `type=prepaid-outflow`。

**约束**：
- 提交前在事务内 `projectFormalPrepaid` 计算当前 C；`C - N >= 0` 必须成立。
- 若 `< 0`，整事务失败回滚；不允许"先记后补"。

### 3.6 金额预付 inflow/outflow/refund/adjust 事务

沿用 v1 5 型结构，但**移除一切 details.balance / balanceAfter 写**。adjust 流程同 §3.4，但 dimension=amount 且 amount 来自当前投影与目标值之差（金额型 adjust 写 non-cash adjustment financial event；详见 §3.7）。

### 3.7 金额预付 adjust 事务

**触发**：金额预付编辑表单设定"余额目标值" T。

**事务内动作**：
1. 计算当前投影 B（opening + inflow - outflow + adjust）。
2. 若 T === B → noop。
3. 若 T !== B → 新增
   - `financialEvents`：`eventType=adjustment`、`metadata.affectsCash=false`、`amountMinor=|T-B|`、`direction=T>B?inflow:outflow`、`effectiveDate=today`。
   - `prepaidTransactions`：`type=adjust`、`dimension=amount`、`direction` 同上、`financialEventId=上面 event.id`、`note='balance adjustment to <T>'`。
4. `lifecycleEvents` + `operationLogs`。

**约束**：
- 校正后投影余额不得为负。
- 不写 details 任何金额字段。

### 3.8 实物目标日均编辑

实物 `costGoal` 允许写入 `targetDailyAmountMinor` / `targetEndsOn`，**不写 dailyCostOverrideMinor**。`projectFormalCostGoal` 按 `financialEvents.netAmountMinor / elapsedDays` 计算当前日均；目标进度仅在 `status=active` 时投影。

### 3.9 删除资产硬删除

删除资产 → 同事务内删除该资产所有 sidecar（maintenance 除外，maintenance 由用户单独管理）。usage 整文件清空对应记录；v2 中 usage 文件不再存在，故**整个使用追踪功能删除**。

---
## 4. 状态投影（订阅）

`projectFormalSubscription(asset, periods, today)` v2 判定规则：

| today 相对账期位置 | autoRenew | 派生 state | 备注 |
|--------------------|-----------|------------|------|
| 处于某有效 period 内 | — | `subscribed` | currentPeriod 命中 |
| 超过最后 period.endDate | `true` | `pendingConfirmation` | 不伪造到期 |
| 超过最后 period.endDate | `false` | `expired` | 用户关闭自动续费 |
| 无任何 period（资产存在） | — | `indeterminate` | 不能伪造到期/续订日期 |
| 整个资产被删除 | — | `null` | projection 整体不投影 |

附加派生字段：
- `plannedRenewalDate`：仅 `autoRenew=true` 且存在 latestPeriod → `latestPeriod.endDate + 1 day`；否则 `null`。
- `isTrial` / `trialPeriod` / `latestPeriodWasTrial`：保留 v1 语义。
- `currentPeriod`、`latestPeriod`：保留 v1 语义。

`getFormalNextImportantDate` 不变：实物 → warrantyEnd；订阅 → current/lastPeriod.endDate；预付 → expiresOn；买断 → null。

---

## 5. fail-closed 边界

### 5.1 读边界

`api/storage.js::assertStrictFormalAssetWrapper(raw)` v2 行为：

```
if (raw.schemaGeneration !== 'formal-v2' || raw.schemaVersion !== 1) {
  throw formalStorageError(RESET_REQUIRED, 'assets.json is not formal-v2/v1; explicit reset required');
}
```

不调用任何 upgrade 函数；不尝试 normalize 后写回；不区分 `legacy`、`formal-v1` —— 全部 RESET_REQUIRED。

### 5.2 删除的 v1 兼容函数（必须彻底删除）

- `upgradeFormalV1DeprecatedAsset`（assets.js）
- `upgradeFormalV1DeprecatedAssetWrapper`（storage.js）
- `upgradeFormalV1DeprecatedOperationLogWrapper`（storage.js）
- `upgradeFormalV1WishlistEventWrapper`（storage.js）
- `FORMAL_V1_DEPRECATED_DETAIL_KEYS`（assets.js）
- `LEGACY_ASSET_FIELDS` 中的 v1 字段（storage.js，可保留但不再迁移）
- `FORMAL_V1_DEPRECATED_*` 注释与文档

### 5.3 启动 fail-closed guard 保留

`asset-load-fail-closed.test.js` 中：
- 读 v2 wrapper 但 schemaVersion 错误 → RESET_REQUIRED；
- 读非对象 / 非数组 payload → STORAGE_CORRUPT；
- `_assetsLoadedOk=false` 时 `renderMainPanel()` 输出 `data-asset-load-pending="true"`，禁止任何业务 mutation（`ASSET_MUTATION_BLOCKED`）。

### 5.4 核心组件状态机保留

- dock/modal lifecycle guard：`onunload` → `stopPersistence`；`STORAGE_CLOSED`。
- sheet 闭包 `onclick` 绑定规则：v0.14 教训继续生效。
- `data-asset-load-blocked="FORMAL_SCHEMA_RESET_REQUIRED"` 阻断态继续保留。

### 5.5 跨域事务提交后 snapshot 校验

`runFormalAssetPersistenceTransaction` v2 必须保证：
- 事务内拼装的完整 `complete` snapshot 通过 `assertFormalDomainSnapshot`；
- 写盘前比较每文件原始 payload（防 CONFLICT）；
- 任一文件失败 → 逆序回滚；
- 提交成功后再次 `readFormalDomainSnapshotInsideQueue` 校验（保持 v1 既有 `committedSnapshot`）。

---

## 6. UI 收敛（仅功能/字段层面，不重做视觉）

### 6.1 正式表单（5 类）

| kind | 保留字段 | 删除字段 | 状态选择器 |
|------|---------|---------|------------|
| physical | name、cover、categoryId、tagIds、notes、currency、acquiredOn、status(active/retired)、warrantyEndsOn、costGoal toggle + targetDailyAmountMinor + targetEndsOn | dailyCostOverrideMinor、usageTrackingEnabled、soldPrice、trackUsage、renewals、customDailyCost、autoRenew、billingCycle、warrantyEndDate | active / retired |
| virtualSubscription | name、cover、categoryId、tagIds、notes、currency、acquiredOn、planName、accountLabel、billingPlan.cycle、autoRenew | planName 外的所有评分/skip/usage/versionLabel/账号（旧） | active（固定） |
| virtualPerpetual | name、cover、categoryId、tagIds、notes、currency、acquiredOn、licenseAccountLabel | versionLabel、costGoal、usageTrackingEnabled、账号（旧） | active（固定） |
| prepaidAmount | name、cover、tagIds、notes、currency、acquiredOn、provider、expiresOn | accountLabel、balance、balanceAfter、unitLabel、purchasePrice、categoryId | 隐藏选择器（固定 active） |
| prepaidCount | name、cover、tagIds、notes、currency、acquiredOn、provider、expiresOn、（编辑表单）"剩余次数"目标输入 | accountLabel、unitLabel、remainingCount、balance | 隐藏选择器（固定 active） |

### 6.2 次数预付编辑表单"剩余次数"目标输入

- 仅在 `openFormalAssetSheet('prepaidCount', { asset, id })` 编辑场景显示。
- 字段名 `targetRemainingCount`（受控 input）。
- 保存时 `projectFormalPrepaid` 计算 C；T 与 C 不同 → 走 §3.4 adjust 事务。
- T < 0 / T 非安全整数 → 校验失败；表单不提交。
- T === C → noop；不写任何 sidecar。
- 不持久化为 `details.remainingCount`。

### 6.3 种草表单（4 项）

| 字段 | 类型 | 备注 |
|------|------|------|
| `name` | string(1..200) | 必填 |
| `cover` | discriminated | 默认 emoji/preset |
| `currency` | enum: CNY / USD | 默认偏好币种；不允许 ISO 4217 全集 |
| `expectedAmount` | decimal | → 落 `wishlist.expectedAmountMinor` |
| `targetGroup` | enum: physical / virtual / prepaid | **唯一**购买路由真值 |

不再显示 categoryId、tagIds、notes、account、账期、autoRenew、status、warranty、目标日均、预付余额或任何具体正式资产字段。

### 6.4 状态选择器收敛

| kind | 状态选择器 |
|------|-----------|
| physical | active / retired |
| virtualSubscription | 隐藏（固定 active） |
| virtualPerpetual | 隐藏（固定 active） |
| prepaidAmount | 隐藏（固定 active） |
| prepaidCount | 隐藏（固定 active） |
| wishlist | 隐藏（固定 wishlist） |

### 6.5 卡片按钮

| kind | 卡片底部按钮 |
|------|-------------|
| physical | "退役/转让"（弹转让 sheet：status 切换 + 可选转让价） |
| virtualSubscription | "续费"（弹 openRenewSheet）、"自动续费"开关 |
| virtualPerpetual | （无，固定 active） |
| prepaidAmount / prepaidCount | "记一笔"（弹 prepaid workflow） |

### 6.6 删除项

| 删除目标 | 涉及 |
|----------|------|
| "记录使用" 按钮 | physical / virtualPerpetual 卡片的 markAssetUsed、openUsageSheet |
| "跳过下次" 按钮 / sheet / i18n | virtualSubscription |
| 续费决策 sheet（renewDecisionListDialog、openExpiryListDialog、getPendingAssets、_startExpiryScanner、_scanExpiry） | virtualSubscription |
| 评分 select / worthRenewingScore / renewalScore | virtualSubscription |
| versionLabel 输入 | virtualPerpetual |
| accountLabel 输入（除 virtualPerpetual.licenseAccountLabel） | virtualSubscription / prepaidAmount / prepaidCount |
| unitLabel 输入 | prepaidCount（前端固定"次"） |
| dailyCostOverrideMinor 输入 | physical |
| 旧 subscription-cancel / subscription-skip 操作日志类型 | operationLogs |

---
## 7. i18n 收敛

`zh_CN.json` + `en_US.json` 必须同步增删。

### 7.1 删除

| key 模式 | 中文 | 英文 |
|----------|------|------|
| `renewDecision*` | renewDecisionTitle / Banner / Renew / Skip / Cancel / Empty / Skipped / Cancelled / Expired / Soon / ExpiresAt / ConfirmSkip / ConfirmCancel | 同上 |
| `*Skip*` / `*Skipped*` | 任何含 skip / 跳过的订阅相关 key | 同上 |
| `*Score*` / `*Rating*` | 任何评分相关 key | 同上 |
| `*Usage*` / `*usageRecord*` / `*markUsed*` | usageTracking、usageRecord、markUsed 相关 key | 同上 |
| `*Version*` / `versionLabel` | 任何版本字段相关 key | 同上 |
| `*Unit*` / `unitLabel` | 任何单位字段相关 key | 同上 |
| `*AccountLabel*`（除 buy-once.licenseAccountLabel） | accountLabel 相关 key | 同上 |
| `dailyCostOverride*` | dailyCostOverride 相关 key | 同上 |
| `prepaidAdjust*` 中涉及 v1 字眼的（保留 v2 adjust 表单的最小集合） | prepaidAdjustOptional / Action / AfterRequired / AfterInvalid / NoChange 等 | 同上 |

### 7.2 新增

| key | 中文 | 英文 |
|-----|------|------|
| `prepaidCountTargetRemainingLabel` | 剩余次数（手动校正） | Target remaining count |
| `prepaidCountTargetRemainingHint` | 校正后会自动写入 adjust 流水 | Adjustment writes an `adjust` transaction |
| `prepaidCountTargetRemainingInvalid` | 剩余次数必须 ≥ 0 | Target remaining count must be ≥ 0 |
| `prepaidCountTargetRemainingNoChange` | 与当前投影相同，无需调整 | Matches current projection, no adjustment needed |
| `subscriptionAutoRenewEnabled` | 已开启自动续费 | Auto-renew enabled |
| `subscriptionAutoRenewDisabled` | 已关闭自动续费 | Auto-renew disabled |
| `subscriptionAutoRenewEnabledLog` | 开启自动续费 | Enable auto-renew |
| `subscriptionAutoRenewDisabledLog` | 关闭自动续费 | Disable auto-renew |
| `subscriptionRenewedLog` | 续订 | Renewed |
| `assetSoldLog` | 退役并转让 | Retired and sold |
| `wishlistTargetGroupPhysical` | 实物 | Physical |
| `wishlistTargetGroupVirtual` | 虚拟 | Virtual |
| `wishlistTargetGroupPrepaid` | 预付 | Prepaid |
| `wishlistPurchaseRoutePhysical` | 进入实物表单 | Open physical form |
| `wishlistPurchaseRouteVirtualSubscription` | 订阅 | Subscription |
| `wishlistPurchaseRouteVirtualPerpetual` | 买断 | Perpetual license |
| `wishlistPurchaseRoutePrepaidAmount` | 金额预付 | Amount prepaid |
| `wishlistPurchaseRoutePrepaidCount` | 次数预付 | Count prepaid |
| `prepaidCountUnit` | 次 | Count |

### 7.3 保留

- 现有 CRUD、报表、设置、通知等 i18n key 不变（除非上文命中删除条件）。
- `prepaidAdjustAfterRequired` / `Invalid` / `NoChange` 在 v2 重新用于金额预付校正（同款语义，统一字段命名）。
- 所有 zh_CN 与 en_US 必须**同步增删**；不允许单边新增。

---

## 8. 测试要求（最终验收）

### 8.1 现有测试改造

| 测试文件 | v2 改造 |
|----------|---------|
| `formal-model.test.js` | 移除 `usageTrackingEnabled` / `skipNextRenewal` / `renewalScore` / `versionLabel` / `costGoal`（virtualPerpetual）/`accountLabel`（prepaid）/ `unitLabel` 五个 fail-reject 测试用例；新增 v2 严格白名单测试。`FORMAL_SCHEMA_GENERATION === 'formal-v2'`、`FORMAL_ASSET_SCHEMA_VERSION === 1`；`validateFormalAssetWrapper({ schemaGeneration: 'formal-v1' })` 必须 invalid。 |
| `formal-storage-boundary.test.js` | 删除 v1 wrapper migration 测试（line 123-143）；改为"读到 v1 wrapper 必须 RESET_REQUIRED"测试。新增 v2 wrapper 通过测试。 |
| `formal-projection.test.js` | 删除 `costGoal`（virtualPerpetual）/`accountLabel`（prepaid）/ `unitLabel` 相关 fixture；新增 v2 订阅 4 状态投影测试（subscribed / expired / pendingConfirmation / indeterminate）；新增次数预付 adjust 投影测试。 |
| `formal-report.test.js` | 删除 usage 字段在报表中的引用；改为 v2 报表正常 + 拒绝 usage 主表（无 usage sidecar 输入时正常输出）。 |
| `formal-subscription-production.test.js` | 改造为：autoRenew 开关事务（开启/关闭都创建对应 lifecycle event）；续订事务（不修改 autoRenew）；手动续订在 autoRenew=false 时也允许；新增 expired 状态在 autoRenew=false 且超期时投影。 |
| `formal-prepaid-workflow.test.js` | 新增 opening/inflow/outflow/refund/adjust 五型；新增 adjust 上限/下限；新增"记一笔"不能超出剩余次数；次数预付 edit 表单"剩余次数"目标值 → adjust 事务。 |
| `formal-five-kind-form-submit.test.js` | 5 类表单字段收敛：删除 dailyCostOverrideMinor / usageTrackingEnabled / skipNextRenewal / renewalScore / versionLabel / unitLabel / accountLabel（除 licenseAccountLabel）；保留物理保修 toggle、目标日均 toggle、订阅 plan/account/billingPlan/autoRenew、买断 licenseAccountLabel、预付 provider/expiresOn。 |
| `formal-wishlist-form-ui.test.js` | 4 字段收敛：name + cover + currency + expectedAmount + targetGroup；删除 categoryId/tagIds/notes/account/billingPlan/autoRenew/status/warranty/costGoal/expiresOn 等。 |
| `five-kind-form-wishlist.test.js` | 种草购买路由：physical → 直接进入实物；virtual → 先选订阅/买断再进入；prepaid → 先选金额/次数再进入。 |
| `formal-delete-sidecars.test.js` | 删除资产 → 同事务删除 financial / subscriptionPeriods / prepaidTransactions / lifecycleEvents / operationLogs 中相关记录；不删 usage 文件（已整体删除）。 |
| `asset-load-fail-closed.test.js` | v2 wrapper schemaVersion 错误 → RESET_REQUIRED；非对象 payload → STORAGE_CORRUPT；其余 fail-closed 行为保留。 |
| `formal-production-boundary.test.js` | 新增：production 边界禁止 `openResubscribeSheet`、`openPendingRenewalConfirmSheet`、`openExpiryListDialog`、`getPendingAssets`、`_startExpiryScanner`、`_scanExpiry`、`renewalDecisionListDialog`、`_commitSubscriptionAction`、`_commitPrepaidAction`；禁止 `addUsageRecord` / `openUsageSheet` / `markAssetUsed` / `supportsFormalUsageTracking` / `skipSubscription` / `_formalSkipSubscription` / `cancellation*` 等残留。 |
| `readonly-dashboard.test.js` | dashboard 只读不触发业务 mutation（v2 行为不变）；新增禁止 dashboard detail 调用 `openRenewSheet` / `openEditDialog` 等 mutation 入口。 |
| `formal-reset.test.js` / `formal-reset-preflight.test.js` | 重置流程：清空 11 个 domain、移除 usage 整文件、保留 settings；不删除其他工作空间数据；重置后 `schemaGeneration === 'formal-v2'`。 |
| `formal-concurrency-recovery.test.js` | 并发恢复：跨域事务内的 FIFO 串行化、rollback 行为。 |
| `transaction-write-boundary.test.js` | 事务边界：snapshot 校验、read-back、补偿回滚。 |
| `wishlist-abandon-flow.test.js` | 拔草不写 retired：abandon event 保留 sourceSnapshot；删除 assets/wishlistEvents 写入；不写 retired 状态。 |
| `formal-action-sheet-compat.test.js` | action sheet 不再出现 openEditSheet / openVirtualSheet / openWishlistSheet（旧入口）。 |
| `ledger-free-reachability.test.js` | 续订路由 openRenewSheet + _formalRenewSubscription 仍在，但**不允许** autoRenew 隐式修改。 |
| `formal-cover-workflow.test.js` | cover 严格 5 选 1；白名单收敛；删除 legacy imageUrl 兼容。 |
| `formal-export-output.test.js` | 导出 v2 11 domain；移除 usage、renewalDecision、skip、score 等 key。 |
| `formal-import-phases.test.js` | import v2 backup；拒绝 v1 backup；拒绝 v1 schemaGeneration。 |
| `formal-money.test.js` | 金额真值仅 financialEvents；details 不缓存金额；adjust non-cash 校验。 |
| `formal-financial-reviewer.test.js` | financial event 链校验；adjustment replacement 不重叠；prepaid adjust 联动。 |
| `formal-operation-log-workflow.test.js` / `formal-operation-log-ui.test.js` | opLog 新增 subscription-auto-renew-{enabled,disabled} / subscription-renewed / asset-sold；删除 subscription-cancel / subscription-skip / usage-add / usage-delete。 |
| `formal-tag-workflow.test.js` | tag CRUD 流程；3 上限；UUID 外键；移除 v1 隐式兼容。 |
| `formal-json-settings-ui.test.js` | settings UI 不展示 removed key。 |
| `formal-core-crud-ui.test.js` | 核心 CRUD UI；删除 skip / usage 入口。 |
| `formal-maintenance-workflow.test.js` | maintenance 流程不变；仅物理。 |
| `formal-bulk-methods.test.js` | bulk 操作不允许触碰 score / skip / usage 字段。 |
| `formal-resource-index.test.js` / `formal-resource-index.test.js` / `reset-resource-cleanup.test.js` | resource index 重建；重置时清理 cover；v2 不变。 |
| `formal-lifecycle-contract.test.js` | lifecycle 收口；新增 subscriptionAutoRenewEnabled/Disabled；subscriptionCancelled/Skipped 不再写入。 |
| `formal-cover-workflow.test.js` | cover 严格白名单；删除 legacy imageUrl。 |
| `formal-dashboard-error-panel.test.js` | dashboard 错误面板；v2 reset required 仍走原路径。 |
| `core-recovery.test.js` | 启动 fail-closed 与恢复路径。 |
| `bulk-status-physical-only.test.js` | bulk 状态切换仅 physical；其他 kind 拒绝。 |
| `plugin-delete-confirm.test.js` | 插件删除确认；不删 settings。 |
| `ui-parity-workflow-sheets.test.js` / `ui-parity-special-sheets.test.js` / `ui-parity-cards.test.js` | UI 收敛对照；移除 score/skip/usage 输入。 |
| `report-ui.test.js` / `preset-icons-panel.test.js` / `preset-icons-manifest.test.js` / `cover-ui-regression.test.js` | UI 报表与 cover 测试；移除 usage / renewalScore / skip 引用。 |
| `resource-index-lifecycle.test.js` / `reviewer-stage4-wishlist-subscription.test.js` | 资源与 reviewer 路径；按 v2 调整。 |
| `formal-i18n-coverage.test.js` | i18n 增删清单双向校验（zh_CN / en_US 同步）。 |

### 8.2 新增测试

| 文件 | 覆盖范围 |
|------|---------|
| `formal-v2-model-strict-whitelist.test.js` | 5 类 + wishlist 严格白名单；v1 字段（评分/skip/usage/dailyCostOverride/versionLabel/accountLabel/unitLabel/costGoal(perpetual)）必须抛 `FORMAL_ASSET_INVALID`。 |
| `formal-v2-storage-fail-closed.test.js` | v1 wrapper / v0 schemaVersion / 非对象 payload 全部 RESET_REQUIRED 或 STORAGE_CORRUPT；不调用任何 upgrade 函数。 |
| `formal-v2-subscription-auto-renew.test.js` | autoRenew 开启/关闭事务：仅改 details.autoRenew + 严格 lifecycle event（subscriptionAutoRenewEnabled/Disabled）；不联动 status/财务/账期。 |
| `formal-v2-subscription-renew.test.js` | 续订事务：subscriptionPayment + 不重叠 billing period + subscriptionRenewed lifecycle + opLog；不修改 autoRenew。 |
| `formal-v2-subscription-states.test.js` | 4 状态投影：subscribed / expired / pendingConfirmation / indeterminate。 |
| `formal-v2-physical-retire-sale.test.js` | 退役 + sale 事务：不写 details.soldPrice；同事务创建 financial sale event + retired lifecycle + opLog。 |
| `formal-v2-prepaid-count-adjust.test.js` | 次数预付 adjust 事务：T>C inflow / T<C outflow / T=C noop；financialEventId=null；note 固定；提交后 remainingCount >= 0。 |
| `formal-v2-prepaid-count-outflow-cap.test.js` | 次数预付 outflow 不能超出剩余次数；事务失败回滚；不写负余额。 |
| `formal-v2-wishlist-form-4-fields.test.js` | 种草 4 字段；不显示正式资产字段；targetGroup 必填。 |
| `formal-v2-wishlist-purchase-routing.test.js` | 种草购买路由 3 targetGroup × 子类型：physical→physical 表单；virtual→subscription/perpetual 选择→对应表单；prepaid→amount/count 选择→对应表单；purchase event 保留。 |
| `formal-v2-no-score-no-skip-no-usage.test.js` | production 边界禁词扫描：renewalScore / worthRenewingScore / skipNextRenewal / skipSubscription / _formalSkipSubscription / supportsFormalUsageTracking / addUsageRecord / openUsageSheet / markAssetUsed / usageTrackingEnabled / dailyCostOverrideMinor / versionLabel / unitLabel / prepaidAdjust* v1 字眼 不得出现在 production。 |
| `formal-v2-lifecycle-events.test.js` | lifecycle 收口：subscriptionAutoRenewEnabled/Disabled 写入；subscriptionCancelled/Skipped 不再写入；usageRecorded 不再写入。 |
| `formal-v2-report-no-usage.test.js` | 报表拒绝 usage 主表字段；amounts/risks/costGoal 投影正常。 |
| `formal-v2-backup-roundtrip.test.js` | v2 backup/import round-trip：11 domain 完整；不携带 v1 字段；reset 后 import 成功。 |
| `formal-v2-projection.test.js` | 5 类投影 + 订阅 4 状态 + 次数/金额 adjust 投影。 |
| `formal-v2-five-kind-form-fields.test.js` | 5 类表单字段收敛。 |
| `formal-v2-fail-closed-startup.test.js` | 启动 fail-closed：v2 wrapper 不合法 → RESET_REQUIRED；UI 阻断态。 |

---
## 9. 部署与重置

### 9.1 数据备份（部署前必须）

- 调用 `plugin.storage.readFormalBackupSnapshot({ pluginVersion })`（v2 内部改 `format = 'siyuan-asset-management-backup'`、`schemaGeneration = 'formal-v2'`）。
- 用户下载 JSON 备份（11 个 domain：assets / tags / wishlistEvents / operationLogs / maintenance / prepaidTransactions / financialEvents / lifecycleEvents / subscriptionPeriods / exchangeRates / settings 的 settings 段）。
- **不**保留 usage 字段（v2 已整体删除）。

### 9.2 主空间部署（仅覆盖 4 个文件）

```powershell
Copy-Item -LiteralPath "index.js" -Destination "D:/SiYuan/data/plugins/siyuan-plugin-asset-management/index.js"
Copy-Item -LiteralPath "index.css" -Destination "D:/SiYuan/data/plugins/siyuan-plugin-asset-management/index.css"
Copy-Item -LiteralPath "i18n/zh_CN.json" -Destination "D:/SiYuan/data/plugins/siyuan-plugin-asset-management/i18n/zh_CN.json"
Copy-Item -LiteralPath "i18n/en_US.json" -Destination "D:/SiYuan/data/plugins/siyuan-plugin-asset-management/i18n/en_US.json"
```

- **不**覆盖 `plugin.json`（除非单独需要改版本号）。
- **不**修改 `assets.json` / `tags.json` / `*.json` 数据文件（保留旧 v1 数据，由启动 fail-closed guard 拦截）。
- **不**删除任何目录。

### 9.3 正式重置（操作前必须下载备份）

- 调用 `plugin.storage.initializeFormalStorageReset({ confirmReset: true })`（v2 内部继续支持）。
- 重置后所有 11 个 domain 为空；usage 文件被彻底忽略（用户可手动删除 `usage.json`，v2 不再引用）。
- 重置**不**清除 settings（保留 preferredCurrency / currencyDisplayMode / notificationsEnabled / notificationDays / notificationIntervalMinutes / resourceIndex / markdownExportTarget）。
- 重置**不**删除其他工作空间数据。

### 9.4 smoke

主空间部署 + 重置后，运行最小 smoke：

| 步骤 | 操作 | 期望 |
|------|------|------|
| 1 | 新建实物 1 条 | 主表 + financial purchase event + created lifecycle |
| 2 | 新建订阅 1 条 | 主表 + subscriptionPayment + billing period + subscriptionStarted lifecycle |
| 3 | 新建买断 1 条 | 主表 + purchase event + created lifecycle |
| 4 | 新建金额预付 1 条 | 主表 + purchase + opening amount transaction |
| 5 | 新建次数预付 1 条 | 主表 + purchase + opening count transaction |
| 6 | 新建种草 1 条（targetGroup=physical） | wishlist 资产 + 卡片可见 |
| 7 | 实物退役 + 填转让价 | retired + sale financial event + lifecycle |
| 8 | 订阅开启 autoRenew | subscriptionAutoRenewEnabled lifecycle |
| 9 | 订阅续订 1 次 | subscriptionPayment + billing period + subscriptionRenewed |
| 10 | 次数预付"记一笔" outflow | outflow transaction + 投影余额 -1 |
| 11 | 次数预付编辑表单设目标值 | adjust transaction + 投影到目标值 |
| 12 | 种草购买（physical 路由） | 新实物资产 + purchased wishlistEvent + lifecycle |
| 13 | 报表/dashboard 查看 | 11 domain 数据正确，无 usage 字段 |
| 14 | i18n 切换 zh ↔ en | 新文案正确显示；renewDecision/skip/score/usage 等 key 不出现 |

---

## 10. 分阶段实施清单（11 阶段）

### 阶段 1：formal-v2 constants 与严格字段白名单（`api/assets.js`）

**目标**：把 v1 constants 切到 v2；新增 `formal-v2` 常量；`FORMAL_DETAIL_KEYS` 收敛到 §2.4；删除 `FORMAL_V1_DEPRECATED_DETAIL_KEYS` / `upgradeFormalV1DeprecatedAsset` / v1 deprecated 字眼。

**允许修改的文件**：
- `api/assets.js`

**禁止修改的文件**：
- `api/storage.js`
- `api/report.js`
- `src.template.js`
- `index.js` / `index.css`
- `i18n/*`
- `scripts/concat.js`

**验收标准**：
- `FORMAL_SCHEMA_GENERATION === 'formal-v2'`、`FORMAL_ASSET_SCHEMA_VERSION === 1`。
- `FORMAL_DETAIL_KEYS` 仅含 §2.4 列出的字段。
- `newFormalAsset({ kind: 'physical', name: 'x', details: { usageTrackingEnabled: true } })` 抛 `FORMAL_ASSET_INVALID: ...contains unknown field: usageTrackingEnabled`。
- 5 类 + wishlist normalize 全部成功；不允许任何字段冗余写入。
- `validateFormalAsset` 拒绝 `dailyCostOverrideMinor` / `skipNextRenewal` / `renewalScore` / `versionLabel` / `unitLabel` / `accountLabel`（prepaid*） / `costGoal`（virtualPerpetual）。

**验证命令**：
- `node --check api/assets.js`
- `node scripts/concat.js`
- 暂不跑测试（v2 常量改动会让现有测试 fail，留给阶段 2/10 同步改测试）

**期望产物**：`api/assets.js` 头部注释写明 formal-v2；导出新增 `FORMAL_SCHEMA_GENERATION='formal-v2'`、`FORMAL_ASSET_SCHEMA_VERSION=1`。

---

### 阶段 2：storage fail-closed（`api/storage.js`）

**目标**：`assertStrictFormalAssetWrapper` 对 `schemaGeneration !== 'formal-v2'` 抛 RESET_REQUIRED；删除全部 `upgradeFormalV1Deprecated*` 函数与调用；`readFormalAssetWrapperSnapshot` 不再写入任何 v1 兼容路径。

**允许修改的文件**：
- `api/storage.js`

**禁止修改的文件**：
- `api/assets.js`
- `api/report.js`
- `src.template.js`
- `index.js` / `index.css`
- `i18n/*`

**验收标准**：
- 写入 `{ schemaGeneration: 'formal-v1', schemaVersion: 1, assets: [] }` 到 `assets.json`，调用 `readFormalAssetWrapper()` → 抛 `code: FORMAL_SCHEMA_RESET_REQUIRED`。
- 写入非对象 payload → 抛 `STORAGE_CORRUPT`。
- 写入 `{ schemaGeneration: 'formal-v2', schemaVersion: 2 }` → 抛 RESET_REQUIRED。
- 写入 `{ schemaGeneration: 'formal-v2', schemaVersion: 1, assets: [...] }`（合法 v2） → 正常返回。
- `upgradeFormalV1Deprecated*` 函数全部不存在；grep `formal-v1-deprecated` 在 `api/storage.js` 不命中。

**验证命令**：
- `node --check api/storage.js`
- `node scripts/concat.js`

**期望产物**：`api/storage.js` 头部注释写明"读 v1 wrapper 抛 RESET_REQUIRED，不做任何隐式迁移"。

---
### 阶段 3：清理 usage + 删除字段副作用（`src.template.js` + `i18n/*` + `api/report.js`）

**目标**：删除所有 usage 相关代码（`addUsageRecord`、`openUsageSheet`、`markAssetUsed`、`supportsFormalUsageTracking`、`usageTrackingEnabled`）；删除 `dailyCostOverrideMinor` 写入路径；删除 `versionLabel` / `unitLabel` / `accountLabel`（prepaid*）表单输入；删除 `skipNextRenewal` 写入路径；删除 `_formalSkipSubscription` / `skipSubscription`；删除 `renewalScore` / `worthRenewingScore` 引用；删除 `getPendingAssets` / `_startExpiryScanner` / `_scanExpiry` / `openRenewDecisionListDialog` / `openExpiryListDialog` / `_commitSubscriptionAction` / `_commitPrepaidAction`。

**允许修改的文件**：
- `src.template.js`
- `i18n/zh_CN.json`
- `i18n/en_US.json`
- `api/report.js`（移除 usage sidecar 引用；订阅状态按 v2 收敛）

**禁止修改的文件**：
- `api/assets.js`（已在阶段 1 收敛）
- `api/storage.js`（已在阶段 2 收敛）
- `index.js`（按 concat 重新生成）

**验收标准**：
- `grep -nE "usageTrackingEnabled|skipNextRenewal|renewalScore|worthRenewingScore|dailyCostOverrideMinor|versionLabel|unitLabel|markAssetUsed|addUsageRecord|openUsageSheet|supportsFormalUsageTracking|getPendingAssets|_startExpiryScanner|_scanExpiry|openRenewDecisionListDialog|openExpiryListDialog|skipSubscription|_formalSkipSubscription" src.template.js api/report.js i18n/zh_CN.json i18n/en_US.json` 不命中（除注释中的"v2 移除 X"说明）。
- zh_CN.json 与 en_US.json 同步删除 `renewDecision*` / `usage*` / `*Skip*` / `*Score*` / `*Version*` / `*Unit*`（除业务保留 key）/ `dailyCostOverride*` 等。
- `buildFormalReport` / `buildFormalDashboard` 不再要求 `usage` 输入；删除 `report.risks.usage`。

**验证命令**：
- `node --check src.template.js`
- `node scripts/concat.js`
- `node scripts/formal-model.test.js`（v2 model 测试先于 storage 失败，预期）

**期望产物**：`index.js` 重新生成；`grep` 结果干净；`report.js` 头部注释更新到 v2。

---

### 阶段 4：订阅 autoRenew lifecycle 重写（`src.template.js` + `api/assets.js`）

**目标**：新增 `_formalSetSubscriptionAutoRenew(id, target)` 方法（仅改 `details.autoRenew` + 写 `subscriptionAutoRenewEnabled/Disabled` lifecycle + opLog）；改造 `_formalRenewSubscription` 不修改 autoRenew；删除 `_formalSkipSubscription` 业务用法（关闭自动续费走 `_formalSetSubscriptionAutoRenew`）；删除 `_formalCancelSubscription`。

**允许修改的文件**：
- `src.template.js`
- `api/assets.js`（LIFECYCLE_EVENT_TYPE 新增 subscriptionAutoRenewEnabled/Disabled）

**禁止修改的文件**：
- `api/storage.js`
- `api/report.js`
- `i18n/*`（阶段 3 已处理）

**验收标准**：
- `plugin._formalSetSubscriptionAutoRenew(id, true)` → details.autoRenew=true + lifecycle.kind='subscriptionAutoRenewEnabled' + opLog。
- `plugin._formalSetSubscriptionAutoRenew(id, false)` → details.autoRenew=false + lifecycle.kind='subscriptionAutoRenewDisabled' + status 仍 active，账期/付款保留。
- `plugin._formalRenewSubscription(id, ...)` → 新 billing period + subscriptionPayment + subscriptionRenewed lifecycle；**不**写 details.autoRenew。
- `plugin._formalSkipSubscription` / `skipSubscription` 方法不存在。
- `plugin._formalCancelSubscription` / `cancelSubscription` 不存在（v2 删干净）。

**验证命令**：
- `node --check src.template.js`
- `node --check api/assets.js`
- `node scripts/concat.js`

**期望产物**：src.template.js 头部注释 + v2 lifecycle 收口；assets.js 导出 `LIFECYCLE_EVENT_TYPE.SUBSCRIPTION_AUTO_RENEW_ENABLED` / `DISABLED`。

---

### 阶段 5：实物退役/转让财务事务（`src.template.js` + `api/assets.js`）

**目标**：新增 `retireAsset(id, { soldPriceMinor, currency, date })` 方法；按 §3.1 事务结构提交；拒绝 details.soldPrice 写入；同事务写 retired lifecycle + asset-sold opLog。

**允许修改的文件**：
- `src.template.js`
- `api/assets.js`（若新增 FINANCIAL_EVENT_TYPE.SALE 已存在则不需改）

**禁止修改的文件**：
- `api/storage.js`
- `api/report.js`
- `i18n/*`

**验收标准**：
- `plugin.retireAsset(physicalId, { soldPriceMinor: 50000, currency: 'CNY' })` → status=retired、statusChangedOn=now、financial event(sale, inflow, 50000, CNY)、lifecycle(retired, { soldPriceMinor: 50000 })、opLog(asset-sold)。
- `plugin.retireAsset(physicalId, {})`（无转让价）→ 仅 status=retired，无 financial event。
- `plugin.retireAsset(virtualSubscriptionId, ...)` → 抛 "physical asset required"。
- `details.soldPrice` 不被写入；调用 `validateFormalAsset(asset)` 通过。

**验证命令**：
- `node --check src.template.js`
- `node scripts/concat.js`

**期望产物**：src.template.js 新增 `retireAsset` 方法；UI 卡片底部"退役/转让"按钮调用此方法。

---

### 阶段 6：次数预付余额校正 + 记一笔约束（`src.template.js`）

**目标**：
- 编辑表单加 `targetRemainingCount` 输入，提交时走 §3.4 adjust 事务。
- "记一笔" outflow 走 §3.5 事务，提交前事务内校验 `C - N >= 0`。
- 金额预付编辑表单加 `targetBalance` 输入，走 §3.7 adjust 事务。

**允许修改的文件**：
- `src.template.js`
- `i18n/zh_CN.json`
- `i18n/en_US.json`

**禁止修改的文件**：
- `api/assets.js`
- `api/storage.js`
- `api/report.js`

**验收标准**：
- 次数预付编辑表单包含 `[name="targetRemainingCount"]` 输入（仅 edit 模式显示）。
- T > C 时：写入 adjust inflow transaction (financialEventId=null)。
- T < C 时：写入 adjust outflow transaction。
- T === C 时：noop，不写任何 sidecar。
- "记一笔" outflow N > C → 整事务回滚，无 sidecar 写入。
- 金额预付 edit 包含 `[name="targetBalance"]`；T !== B 时写入 adjustment financial event + adjust prepaid transaction。

**验证命令**：
- `node --check src.template.js`
- `node scripts/concat.js`

**期望产物**：src.template.js `openFormalAssetSheet('prepaidCount', { asset, id })` 编辑模式新增"剩余次数"表单字段；`openFormalAssetSheet('prepaidAmount', { asset, id })` 编辑模式新增"余额"表单字段；workflow dialog 提交前增加 overflow 检查。

---
### 阶段 7：极简种草 + 购买类型路由（`src.template.js`）

**目标**：种草表单收敛到 §6.3 4 字段；删除 categoryId / tagIds / notes / account / billingPlan / autoRenew / status / warranty / costGoal / expiresOn 等表单输入。购买时按 `wishlist.targetGroup` 路由：
- physical → 直接进入 openFormalAssetSheet('physical')
- virtual → 弹 picker（subscription / perpetual）→ openFormalAssetSheet(...)
- prepaid → 弹 picker（amount / count）→ openFormalAssetSheet(...)

**允许修改的文件**：
- `src.template.js`
- `i18n/zh_CN.json`
- `i18n/en_US.json`

**禁止修改的文件**：
- `api/assets.js`
- `api/storage.js`
- `api/report.js`

**验收标准**：
- `openWishlistFormalSheet()` 表单仅含 name / cover / currency / expectedAmount / targetGroup。
- `openWishlistPurchaseKindSheet(wishlist)` 按 targetGroup 渲染对应 picker；picker 选项不得出现与 targetGroup 不兼容的 kind。
- 购买完成后：新建目标 kind 资产 + 写 purchased wishlistEvent + 清理原 wishlist。
- targetGroup=virtual 时 picker 含 subscription + perpetual；targetGroup=prepaid 时 picker 含 amount + count。

**验证命令**：
- `node --check src.template.js`
- `node scripts/concat.js`

**期望产物**：src.template.js `openWishlistFormalSheet` + `openWishlistPurchaseKindSheet` 简化；i18n 新增 §7.2 wishlistTargetGroup* / wishlistPurchaseRoute* key（双语同步）。

---

### 阶段 8：5 类正式表单字段收敛 + UI 同步（`src.template.js` + `i18n/*`）

**目标**：5 类正式表单字段严格按 §6.1 收敛；删除 dailyCostOverrideMinor / usageTrackingEnabled / skipNextRenewal / renewalScore / versionLabel / unitLabel / accountLabel（除 licenseAccountLabel）输入；删除"记录使用"、"跳过下次"、"评分"按钮；删除续费决策 sheet。

**允许修改的文件**：
- `src.template.js`
- `i18n/zh_CN.json`
- `i18n/en_US.json`

**禁止修改的文件**：
- `api/assets.js`
- `api/storage.js`
- `api/report.js`

**验收标准**：
- 物理表单：`warrantyEndsOn` toggle + 日期；`costGoal` toggle + targetDailyAmountMinor + targetEndsOn；无 dailyCostOverrideMinor、usageTrackingEnabled、soldPrice。
- 订阅表单：`planName` / `accountLabel` / `billingPlan.cycle` / `autoRenew` toggle；无 skipNextRenewal、renewalScore、usageTrackingEnabled、costGoal。
- 买断表单：仅 `licenseAccountLabel`；无 versionLabel、costGoal、usageTrackingEnabled。
- 预付表单：`provider` / `expiresOn`；无 accountLabel、unitLabel、balance、remainingCount、purchasePrice。
- 卡片底部按钮：物理 → 退役/转让；订阅 → 续费、自动续费开关；预付 → 记一笔；买断 → 无。
- 删除 `openUsageSheet` / `markAssetUsed` 调用。

**验证命令**：
- `node --check src.template.js`
- `node scripts/concat.js`
- `node scripts/formal-five-kind-form-submit.test.js`（v2 测试先于 storage 失败，预期）

**期望产物**：5 类表单 HTML 模板收敛；卡片 action 数据属性收敛；i18n 字段收敛。

---

### 阶段 9：FORMAL_SCHEMA.md + README 更新

**目标**：
- `FORMAL_SCHEMA.md` 重写为 `formal-v2` 文档（覆盖背景、字段白名单、关键事务、状态投影、fail-closed 边界）。
- `README.md` / `README_zh_CN.md` 更新 Changelog（v0.18.0 formal-v2）；删除 v1 字段相关说明。
- 不修改 `plugin.json` 的 `name` / `author` / `url`；按需修改 `version` 与 `description`。

**允许修改的文件**：
- `FORMAL_SCHEMA.md`
- `README.md`
- `README_zh_CN.md`
- `plugin.json`（仅 version 与 description）

**禁止修改的文件**：
- `api/*.js`
- `src.template.js`
- `scripts/concat.js`
- `index.js` / `index.css`（按 concat 重生成即可）

**验收标准**：
- FORMAL_SCHEMA.md 顶部明确 `schemaGeneration: "formal-v2"`、`schemaVersion: 1`；列出 §2.4 / §2.5 字段白名单；说明 §3 关键事务；说明 §5 fail-closed。
- README.md Changelog 新增 v0.18.0 节：formal-v2 strict reset、删除评分/跳过/usage/单价单位/账号（旧）/版本字段、5 类表单收敛、次数预付余额校正。
- `plugin.json` version=0.18.0；description 同步精简。

**验证命令**：
- `node -e "JSON.parse(require('fs').readFileSync('plugin.json'))"` （JSON 合法性）

**期望产物**：FORMAL_SCHEMA.md / README.md / README_zh_CN.md / plugin.json 同步更新。

---

### 阶段 10：测试基线 + 新增/改写测试

**目标**：按 §8.1 / §8.2 改造与新增测试，使全部 70+ 测试在 v2 下通过。

**允许修改的文件**：
- `scripts/*.test.js`（按 §8 改造/新增）
- `scripts/formal-workflow-harness.js`（如需）

**禁止修改的文件**：
- `api/*.js`
- `src.template.js`
- `plugin.json`
- `FORMAL_SCHEMA.md`（阶段 9 完成）

**验收标准**（每条具体可测）：
- 所有 `scripts/*.test.js` 全部通过（`node scripts/<test>.js` 退出码 0）。
- `formal-v2-model-strict-whitelist.test.js` 通过：5 类 + wishlist 白名单严格；v1 字段全部抛错。
- `formal-v2-storage-fail-closed.test.js` 通过：v1 wrapper / 非对象 payload / 错 schemaVersion 全部 RESET_REQUIRED 或 STORAGE_CORRUPT。
- `formal-v2-subscription-auto-renew.test.js` 通过：仅改 autoRenew + 严格 lifecycle。
- `formal-v2-subscription-renew.test.js` 通过：不修改 autoRenew + 不重叠 + 新 payment + subscriptionRenewed lifecycle。
- `formal-v2-subscription-states.test.js` 通过：4 状态投影。
- `formal-v2-physical-retire-sale.test.js` 通过：实物退役 + sale 事务。
- `formal-v2-prepaid-count-adjust.test.js` 通过：T>C inflow / T<C outflow / T=C noop。
- `formal-v2-prepaid-count-outflow-cap.test.js` 通过：超出剩余次数回滚。
- `formal-v2-wishlist-form-4-fields.test.js` 通过：4 字段收敛。
- `formal-v2-wishlist-purchase-routing.test.js` 通过：3 targetGroup × 子类型。
- `formal-v2-no-score-no-skip-no-usage.test.js` 通过：production 边界禁词扫描。
- `formal-v2-lifecycle-events.test.js` 通过：lifecycle 收口。
- `formal-v2-report-no-usage.test.js` 通过：报表正常 + 拒绝 usage 主表。
- `formal-v2-backup-roundtrip.test.js` 通过：v2 backup/import round-trip。
- `formal-v2-projection.test.js` 通过：5 类投影 + 订阅 4 状态 + 次数/金额 adjust。
- `formal-v2-five-kind-form-fields.test.js` 通过：5 类表单字段收敛。
- `formal-v2-fail-closed-startup.test.js` 通过：启动 fail-closed。
- 现有测试（formal-model / formal-storage-boundary / formal-projection / formal-report / formal-subscription-production / formal-prepaid-workflow / formal-five-kind-form-submit / formal-wishlist-form-ui / five-kind-form-wishlist / formal-delete-sidecars / asset-load-fail-closed / formal-production-boundary / readonly-dashboard / formal-reset / formal-reset-preflight / formal-concurrency-recovery / transaction-write-boundary / wishlist-abandon-flow / ...）全部改写到 v2 期望并通过。

**验证命令**：
- `node scripts/concat.js`
- 遍历 `node scripts/<test>.js`（约 70+ 测试文件）
- 或一次性 `Get-ChildItem scripts/*.test.js | ForEach-Object { node $_.FullName }`

**期望产物**：所有测试在 v2 下绿。

---

### 阶段 11：数据备份 + 主空间部署 + 重置 + smoke

**目标**：执行 §9 部署流程；在主空间跑 §9.4 smoke。

**允许修改的文件**：
- 主空间 `D:/SiYuan/data/plugins/siyuan-plugin-asset-management/{index.js,index.css,i18n/zh_CN.json,i18n/en_US.json}`
- 用户思源笔记中的 JSON 备份文件（下载到本地，不入 git）

**禁止修改的文件**：
- 任何项目源文件（已通过阶段 10 验证）
- `plugin.json`（如阶段 9 已更新版本，则仅覆盖主空间文件时不复制 plugin.json；版本号通过 bazaar 发布而非主空间部署）

**验收标准**：
- 部署前用户已下载 v2 JSON 备份。
- 主空间 4 个文件覆盖完成；用户重启思源后插件加载。
- 启动时旧 v1 data → UI 进入 `data-asset-load-blocked="FORMAL_SCHEMA_RESET_REQUIRED"` 阻断态。
- 用户执行正式重置（settings → 重置）→ 11 domain 清空 + usage 文件被忽略；保留 settings。
- 用户按 §9.4 smoke 14 步全部通过。

**验证命令**：
- PowerShell：`Copy-Item -LiteralPath "index.js" -Destination "D:/SiYuan/data/plugins/siyuan-plugin-asset-management/index.js"`
- PowerShell：`Copy-Item -LiteralPath "index.css" -Destination "D:/SiYuan/data/plugins/siyuan-plugin-asset-management/index.css"`
- PowerShell：`Copy-Item -LiteralPath "i18n/zh_CN.json" -Destination "D:/SiYuan/data/plugins/siyuan-plugin-asset-management/i18n/zh_CN.json"`
- PowerShell：`Copy-Item -LiteralPath "i18n/en_US.json" -Destination "D:/SiYuan/data/plugins/siyuan-plugin-asset-management/i18n/en_US.json"`
- 思源 UI 操作（人工 smoke）

**期望产物**：主空间插件运行在 v2；旧 v1 数据被 fail-closed 拦截；smoke 14 步全过；进入 v0.18.0 维护期。

---
## 11. 风险与注意事项

| 风险 | 描述 | 缓解 |
|------|------|------|
| 旧 v1 用户升级 | 旧 `assets.json` 仍为 v1 wrapper → UI 阻断；用户必须显式重置 | 在 settings-dialog 给出明确的"下载备份 + 重置"指引；README 强调 |
| 数据不可恢复 | 重置不可逆 → 用户历史 financial / subscriptionPeriods / prepaidTransactions 全部丢失 | 重置前必须下载 v1/v2 JSON 备份；备份文件含 11 domain |
| 跨域事务补偿 | 跨 6 个 sidecar 的事务失败 → 逆序回滚；任一回滚失败需返回 compensation detail | 沿用 v1 `commitFormalPayloads` + `compensation` 对象；测试覆盖 |
| i18n 单边变更 | zh_CN / en_US 增删不同步 → 用户切换语言看到旧 key | `formal-i18n-coverage.test.js` 强制双语 key 集合一致 |
| 表单字段遗留 | 旧表单残留 name/字段（如 soldPrice、unitLabel）未清理 → 数据走不到真值 | 阶段 3 + 阶段 8 + 阶段 10 三层 grep + 单元测试 |
| production 边界回退 | 阶段 3/4 删除后又被人引入 → 违规方法复活 | `formal-production-boundary.test.js` + `formal-v2-no-score-no-skip-no-usage.test.js` 双重禁词扫描 |
| 启动 fail-closed guard 被绕过 | 旧 v1 wrapper 直接返回 [] 而不是 RESET_REQUIRED | `asset-load-fail-closed.test.js` + `formal-v2-fail-closed-startup.test.js` 双重覆盖 |
| 移动端兼容 | 删除旧 sheet → 移动端 entry 失效 | 阶段 8 卡片底部按钮收敛后跑 `ui-parity-*` 测试；不重做视觉 |

---

## 12. 不在本规格范围

- 多币种汇率显示（v0.19 计划）。
- 提醒通知系统（v0.15-M9 计划）。
- 标签管理 UI 改进（v0.17-M12 已完成）。
- 移动端 UI 打磨（v1.0）。
- 性能优化（v0.19）。
- bazaar 发布流程（v0.18 后单独走）。

---

> 文档结束。所有改动以本规格为准；任何阶段超出本规格的字段调整必须先更新本规格再实施。