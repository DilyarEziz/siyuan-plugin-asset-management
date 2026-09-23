# 资产管理插件工程规范

> 项目层规范（随本仓库分发）。思源领域通用知识——Plugin API、内核概念、发布流程——通过 `opencode.jsonc` 桥接领域技能（siyuan-plugin-dev / siyuan-api-reference / siyuan-internals / siyuan-plugin-publishing / siyuan-plugin-mobile）按需加载；本文件只写本插件专属规则。

## 项目概览

- 当前会话检出（含工作树）为项目根；命令在当前检出执行，不跳回原始 Workspace 主检出。
- 项目 AI 资产随本仓库提交；领域通用 Skills 与源码 Reference 依赖本机共享目录。Reference 提供路径入口，按需读取正文，不会自动注册领域 Agent。
- `docs/legacy-domain-guidance.md` 和 `docs/legacy-expert-guidance.md` 仅供历史追溯，可能含过时流程；当前本文件、FORMAL_SCHEMA.md、实际代码和构建脚本优先。

- 思源笔记资产管理插件：物品、会员、预付权益全生命周期（心愿单 → 在用 → 退役），含日成本、到期跟踪、订阅报表、双链笔记、AI 助手、多币种与 JSON/Markdown 导出
- 当前版本见 `CHANGELOG.md`（语义化版本，双语发布说明）
- 数据契约见 `FORMAL_SCHEMA.md`；完整功能文档见 `README.md` / `README_zh_CN.md`

## 构建与部署

- 打包：`bash build.sh`（macOS/Linux）或 `build.bat`（Windows）→ 产出 `package.zip`（排除开发与临时文件）
- 部署到主空间验证：会话内执行 `/asset-deploy-main`（只覆盖 index.js / index.css / i18n 两个 json 共 4 个文件，不扩展复制范围），部署后需在思源里手动重载插件
- i18n：`zh_CN.json` 与 `en_US.json` 必须同步更新，新增 key 两端语言都写

## 工程铁律

- 兼容思源 3.8+ 内核；不确定的 API 行为先查领域技能 `siyuan-api-reference`，不凭记忆假设
- 移动端行为差异用 `siyuan-plugin-mobile` 技能核对，桌面结论不能替代移动端结论
- 用户数据（资产记录、报表）是不可再生数据：涉及存储结构变更必须提供迁移路径，禁止隐式清空
- 插件架构、数据模型、UI 参考：加载技能 `siyuan-asset-plugin`（本仓库 `.opencode/skills/`）

## 发布流程

1. 改动通过验证后更新 `CHANGELOG.md`（新版本号 + 双语变更说明）
2. `build.sh` 打包，本地部署冒烟（`/asset-deploy-main` + 手动重载）
3. 提交推送（Gitee），按需发 GitHub Release 与思源集市更新

## Git 纪律

- 阶段化提交，`feat:` / `fix:` / `chore:` 前缀 + 中文描述；未经用户确认不擅自 commit
- 隐私红线：不把任何 token、密钥、个人笔记数据写入本仓库
