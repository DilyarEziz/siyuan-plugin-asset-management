---
name: siyuan-asset-plugin
description: "资产管理插件的架构、数据模型和 UI 参考。用于涉及资产实体、事件、存储、报表、移动端或发布的相关任务。"
packageType: reference-skill
metadata:
  status: reference
  version: 3.0.0
---

# 资产管理插件参考

本 Skill 提供 `siyuan-plugin-asset-management` 的项目背景，不是固定流水线。当前代码和用户目标优先；只读取与任务相关的章节。

## 核心事实

- 插件采用纯 JavaScript 单文件构建，源码主要位于 `api/` 与 `src.template.js`。
- `index.js` 通常是构建产物，不应把它当作主要编辑入口。
- 资产分为 `physical`、`virtualSubscription`、`virtualPerpetual`、`prepaidAmount`、`prepaidCount` 五类。
- 数据模型使用正式字段约定和 sidecar 事件记录；金额使用整数最小单位。
- 当前项目事实以 `plugin.json`、入口模板、相关 API 模块和构建脚本为准。

## 按需参考

- 完整架构、字段、事件、状态机和 UI 设计：`references/full.md`
- 通用思源插件 API（含 Plugin 类 API 全表、加载流程）：`../siyuan-plugin-dev/`
- 移动端：`../siyuan-plugin-mobile/`
- HTTP API：`../siyuan-api-reference/`
- 集市发布：`../siyuan-plugin-publishing/`

## 风险提示

- 修改数据模型、存储、导入导出或批量处理时，关注历史数据、备份和投影一致性。
- 部署或重置前确认目标空间和影响范围；普通部署不应隐式清空业务数据。
- 不手工修改构建产物，除非任务明确是在检查产物。
- 不把凭据、个人数据或备份内容提交到仓库。
