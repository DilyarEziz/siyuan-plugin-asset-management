# 资产管理插件历史开发约定（领域拆分归档）

> 2026-09-23 从 SiyuanDev 领域 AGENTS.md 归档，保留历史经验供定向检索，不是当前执行指令。文中的旧目录、固定版本、打包条目数和数据重置策略可能过期；当前项目 AGENTS.md、FORMAL_SCHEMA.md、实际代码与构建脚本优先。本文件不应作为其他插件的通用规范。

## 项目概述

思源笔记插件开发 + 发布工作区。

**当前唯一在做的插件**：`siyuan-plugin-asset-management`（资产管理）。版本以 `siyuan-plugin-asset-management/plugin.json` 为准，不信历史文档里的固定版本号。

**Git 双远端角色**：插件仓库 origin = **Gitee**（`gitee.com/dilyareziz/siyuan-plugin-asset-management`），用于 Mac/Win 两台电脑日常代码同步；**GitHub 仓库（`DilyarEziz/siyuan-plugin-asset-management`）仅用于思源集市发布**（release + bazaar PR），日常开发不推 GitHub。工作流遵循全局「通用 Git 同步工作流」：开工前先 pull、提交后立即 push。
**推送分流**：Gitee（origin）必推，失败必须告知用户；GitHub 尽力推——尝试一次、快速失败即跳过并记待办，不阻塞收尾。
**跨平台差异**：macOS 端 git 不读系统代理，Steam++「系统代理」模式下需单次挂代理推送（`scutil --proxy` 查端口，如 `git -c http.proxy=http://127.0.0.1:26561 push github main`）；Windows 端以本机实际可达方式为准。不要把代理写进全局 git 配置（影响 Gitee 直连）。

## 技术栈（已定型）

**纯 JavaScript 单文件架构**（不再用 Vue / Vite / TypeScript）：

| 工具 | 用途 |
|------|------|
| **JavaScript** | 全部源码（不动 Vue、不动 TS） |
| **思源 Plugin API** | `require("siyuan")` + `module.exports = class` |
| **Node 脚本** | `scripts/concat.js` 是唯一构建工具 |
| **Copy-Item** | 部署到主空间 |

**为什么不用 Vue/Vite**：移动端 WebView 在 Android 上 Proxy 崩溃，Vite/Vue 编译输出不可控。纯 JS 单文件部署可控、加载快、思源原生友好。

## 项目结构

```
SiyuanDev/                                  # 工作区根
├── AGENTS.md                               # 本文件
├── opencode.jsonc                          # opencode 配置（default_agent=build，无权限块）
├── .opencode/
│   ├── agents/siyuan-dev.md                # 隐藏专家顾问（subagent，手动/咨询，不参与默认实现链）
│   ├── commands/long-task.md               # /long-task 长任务一条龙（方案→实现→审查→汇报）
│   ├── commands/asset-deploy-main.md       # /asset-deploy-main 构建部署到主空间
│   └── skills/                             # 技能库
│       ├── siyuan-plugin-dev/              # 通用插件开发（含 Plugin API 全表/加载流程）
│       ├── siyuan-asset-plugin/             # 资产管理专属（最重要）
│       ├── siyuan-plugin-mobile/           # 移动端
│       ├── siyuan-plugin-publishing/       # 集市发布
│       ├── siyuan-internals/               # 内核源码概念
│       └── siyuan-api-reference/            # HTTP API 速查
├── 参考/
│   ├── siyuan-master/                      # 思源 v3.7 源码
│   └── my-plugin-main/                     # 纯 JS 模板
├── docs/                                   # 工作区文档
└── siyuan-plugin-asset-management/        # 当前在做的插件
    ├── plugin.json
    ├── src.template.js                     # 主模板（Plugin 类 + UI + 事件）
    ├── api/
    │   ├── algorithms.js                   # UUID + 日期 + ISO 4217 + amountMinor
    │   ├── assets.js                       # formal-v2 数据契约 + 校验 + 投影
    │   ├── storage.js                      # sidecar 文件读写 + FIFO + 迁移 + 备份
    │   ├── report.js                       # 报表聚合 + 资产卡片投影
    │   ├── media.js                        # 封面图上传/预设图标
    │   ├── resource-index.js               # 资源索引
    │   ├── utils.js
    │   └── icons.js
    ├── scripts/concat.js                   # 构建（IIFE 内联打包）
    ├── index.js                            # ★ 构建产物（自动生成，勿手改）
    ├── index.css
    ├── i18n/zh_CN.json + en_US.json
    ├── icon.png + preview.png
    └── README*.md
```

## 思源访问信息

> 占位符解析：`<SiYuanApp>` = Windows `C:/Program Files/SiYuan`，macOS `/Applications/SiYuan.app/Contents/Resources`；`<SiYuan>` = Windows `D:/SiYuan`，macOS 由用户指定；`<Workspace>` = Windows `D:/Workspace`，macOS `~/Documents/Workspace`。

| 项 | 值 |
|----|----|
| 思源应用 | `<SiYuanApp>/SiYuan.exe` |
| 官方 CLI | `<SiYuanApp>/resources/kernel/siyuan.exe` |
| 个人工作空间 | `<SiYuan>` |
| 开发/测试工作空间 | 未配置；测试部署或读取须由用户明确指定路径 |
| 插件目录 | `<workspace>/data/plugins/siyuan-plugin-asset-management` |
| HTTP API 端口 | 6806 |
| MCP 端点 | `http://127.0.0.1:6806/mcp` |

## 思源文档归档规则

- 默认产品文档归档父文档：`20260722182259-hv9xqpf`（`/插件开发方案`）。
- 整改计划、审计计划、执行计划默认写成 `20260722182259-hv9xqpf` 下的子文档。
- 这是默认归档位置，不是硬限制；用户明确指定其它笔记本、文档 ID 或路径时，以用户指定为准。

## 当前插件：资产管理

### 定位

思源笔记内嵌的个人**实物 + 虚拟 + 预付权益**全生命周期管理工具：种草 → 在役 → 退役；自动算日均/折旧/到期徽章；右侧 dock 卡片式追踪。

### 当前事实读取规则

执行任何开发任务前，Agent 必须读取：

1. `plugin.json` 当前版本与 manifest。
2. `src.template.js` 顶部注释确认最近功能批次。
3. 涉及数据模型时读 `api/assets.js` 和 `api/storage.js`。
4. 涉及构建/部署时读 `scripts/concat.js`。

下面能力列表是历史摘要，不作为唯一事实源。

### 已实现能力（历史摘要）

- ✅ Asset CRUD（5 种 kind：physical / virtualSubscription / virtualPerpetual / prepaidAmount / prepaidCount）
- ✅ formal-v2 数据契约（严格白名单 + sidecar 事件架构 + amountMinor 整数金额）
- ✅ 3 状态 + 6 排序 + 多维筛选 + 关键词搜索
- ✅ 4 种折旧、净成本、4 种日均价决策、目标均价进度
- ✅ 到期徽章 5 档、自动到期检测
- ✅ 种草池 + 拔草池（事件溯源）
- ✅ 30 服务模板库（按 AI/会员/软件/云/域名 5 类）
- ✅ 顶部统计 + 报表（分类柱状图 + Top 5 + 预付统计）
- ✅ 列表 + 矩阵视图切换
- ✅ 3 Tab + 液态玻璃 TabBar + FAB 加号
- ✅ 3 Tab 设置 Dialog（常规/数据/关于）
- ✅ JSON 导出 + JSON 导入
- ✅ 标签系统 + 维保记录 + 使用记录 + 操作日志
- ✅ 预付交易记录 + 余额/次数投影（数据层）
- ✅ 液态玻璃 UI + 完整暗色 + 移动端检测

### 数据存储

`<SiYuan>/data/storage/petal/siyuan-plugin-asset-management/`

| 文件 | 用途 |
|------|------|
| assets.json | 资产主实体（formal-v2 严格白名单） |
| settings.json | 偏好设置 |
| tags.json | 标签库 |
| maintenance.json | 维保记录 |
| usage.json | 使用记录 |
| operationLogs.json | 操作日志 |
| wishlistEvents.json | 种草/拔草事件 |
| financialEvents.json | 财务事件（购买/充值/消费/退款） |
| lifecycleEvents.json | 生命周期事件 |
| subscriptionPeriods.json | 订阅周期记录 |
| prepaidTransactions.json | 预付交易记录 |
| exchangeRates.json | 汇率（占位） |
| backups/ | 自动备份目录 |

卸载不删数据，参与思源云同步。

## 开发流程

```bash
cd <Workspace>/SiyuanDev/siyuan-plugin-asset-management

# 1. 改 api/*.js 或 src.template.js
# 2. 构建单文件 index.js
node scripts/concat.js

# 3. 自动工作流默认只部署主空间
Copy-Item -LiteralPath "index.js" -Destination "<SiYuan>/data/plugins/siyuan-plugin-asset-management/index.js"
Copy-Item -LiteralPath "index.css" -Destination "<SiYuan>/data/plugins/siyuan-plugin-asset-management/index.css"
Copy-Item -LiteralPath "i18n/zh_CN.json" -Destination "<SiYuan>/data/plugins/siyuan-plugin-asset-management/i18n/zh_CN.json"
Copy-Item -LiteralPath "i18n/en_US.json" -Destination "<SiYuan>/data/plugins/siyuan-plugin-asset-management/i18n/en_US.json"

# 4. 思源 app → 设置 → 集市 → 已下载 → 重载 / 启用
# 5. 改 i18n 时记得同时改 zh_CN.json + en_US.json
```

⚠️ **没有 `pnpm dev` 或 `type-check`**，纯 JS 不需要 TS 编译。所有 sanity 靠 `node scripts/concat.js` 不报错 + 思源中重载实测。

## 部署铁律

- **自动工作流策略**：默认只部署主空间 `<SiYuan>`
  - 测试工作空间未配置；测试部署须由用户明确指定路径
  - 主空间复制只允许覆盖 `index.js / index.css / i18n/*.json`
- **开发期数据策略**：个人开发期插件，不为历史测试数据做兼容
  - 涉及数据模型、schema、storage、导入导出、实物/虚拟结构、标签/组合/维护/使用/日志重构时，默认允许重置插件业务数据
  - 普通部署不隐式清空数据；重置必须作为单独显式步骤执行
  - 重置前优先导出当前完整 JSON 备份，除非用户明确说不需要备份
- **个人数据安全**：Copy-Item 只覆盖 `index.js / index.css / i18n/*.json` **四个文件**
  - 不 rm 任何目录
  - 不覆盖 `plugin.json`（除非单独需要改）
  - 个人数据（assets / settings / wishlistEvents / operationLogs / maintenance.json 等）
    都在 `data/storage/petal/siyuan-plugin-asset-management/` 下，**与插件目录解耦**
- **回滚方法**：旧 index.js / index.css 已 `git stash` 或备份 → 使用 Copy-Item 恢复
- Windows 部署路径统一使用 `<SiYuan>`。

## 思源集市（bazaar）发布流程

完整教程见资产管理插件 docs 目录。要点：

### 关键规范（来自 siyuan-note/bazaar PR Check）

1. 仓库地址：思源集市仓 `plugins.txt` 加一行 `<owner>/<repo>`
2. 仓库必须 public
3. default branch 必须 `main`
4. 插件名（plugin.json name）必须唯一不冲突
5. **必备文件在仓库根目录**（不是 `assets/` 子目录）：
   - `plugin.json`
   - `icon.png`（文件 ≤ 20KB，建议正方形）
   - `preview.png`（文件 ≤ 200KB，建议宽屏）
   - `README.md`
6. 必备 plugin.json attribute：name（kebab-case）/ version / author / url / displayName（default+zh_CN）/ description（default+zh_CN）/ readme（default+zh_CN）
7. 必须创建 latest release，tag 格式 `v<版本号>`，**zip 必须命名为 `package.zip`**（不是 `siyuan-plugin-asset-management.zip`）
8. README 必填：default + zh_CN

### 发布步骤

1. 本地 `node scripts/concat.js` 生成最新 index.js
2. 改 `plugin.json` 的 `version` + `description`，**同时改 `src.template.js` 顶部 `PLUGIN_VERSION` 常量**（见下「发布前版本号三处一致」）
3. 改 README.md / README_zh_CN.md 的 Changelog（**仅留最新 3 版**）+ 同步追加 `CHANGELOG.md`（全量历史，见下「更新日志管理」）
4. 打包 `package.zip`：跑 `python scripts/build-package-zip.py`（**43 条目白名单** = 9 根文件 + `assets/preset-icons/` 33 张 PNG + manifest.json；内置版本号三处断言 + 原子写入；不要 `zip -r`，不要手写一次性 zipfile 脚本）：
   - 9 个根文件：`index.js / index.css / plugin.json / icon.png / preview.png / README.md / README_zh_CN.md / i18n/zh_CN.json / i18n/en_US.json`
   - 34 个静态资源：`assets/preset-icons/` 下 33 张图标 PNG + `manifest.json`（arcname 带 `assets/preset-icons/` 前缀，**漏掉会导致集市版图标 404**）
   - 完整命令与校验见 `siyuan-plugin-publishing` skill §3.1
5. **unzip 回读 zip 内 `plugin.json.version` 确认 = 新版本号**（v2.3.0 两次翻车点）
6. 提交代码 → 推 **Gitee**（origin，日常同步端，必推）；随后尽力推 **GitHub**（集市发布仓，`git push github main`；macOS 系统代理模式下挂代理单次推，失败快速跳过记待办，不阻塞）
7. 在 GitHub 创建 release，tag `v<版本号>`，上传 `package.zip` 作为 binary
8. Fork `siyuan-note/bazaar` → 在 fork 仓 `plugins.txt` 末尾加 `DilyarEziz/siyuan-plugin-asset-management` → PR 到 main
9. 等 PR Check（5 分钟内）+ maintainer review（1-7 天）
10. merge 后 1-3 小时集市自动收录

### 后续版本更新

不用再 PR 到 bazaar，只要在 GitHub 仓创建新的 release tag，集市自动检测并收录新版本（1-3 小时内）。

### 更新日志管理（Changelog）

- **README.md / README_zh_CN.md 的 Changelog 只保留最新 3 个版本**——对外介绍精简，不越攒越长。
- **完整版本历史存仓库根目录 `CHANGELOG.md`**（双语、长期记录；只随 GitHub 仓库，**不进 package.zip** 白名单）。
- 每次发版：把新版本写到两份 README Changelog **顶部**，裁掉超出最新 3 版的旧条目；同时把新版本**追加进 `CHANGELOG.md`**（全量保留，不裁）。
- 两份 README 的 Changelog 区末尾各保留一行指向 `CHANGELOG.md` 的链接（`> 完整更新日志见 [CHANGELOG.md](./CHANGELOG.md).`）。

### 面向用户的更新日志写法

- 更新日志、README 版本记录、发布说明和阶段总结都写给最终用户，优先描述“新增了什么、怎么用、带来什么结果”。
- 不在面向用户的日志中直接出现内部字段名、函数名、事件名、接口名或实现术语，例如 `sourceWishlistId`、`heartbeatTarget`、`registerTool`、sidecar、formal-v2`。
- 将内部实现翻译成用户能理解的功能描述，例如写“显示种草日期和心动次数”，不要写“新增 heartbeat 事件投影”。
- 中文日志统一使用自然中文；英文 README 只使用普通用户能理解的英文，必要的技术细节放到开发文档，不放在 Changelog 条目中。

## 思源 API 调用规范

PowerShell 中使用官方 CLI 时定义：

```powershell
$KS = "<SiYuanApp>/resources/kernel/siyuan.exe"
$WS = "<SiYuan>"
& $KS -w $WS notebook list
```

| ❌ 禁止 | ✅ 正确 |
|---------|---------|
| 单独 `siyuan.exe serve --port <port>` | 用思源 app 自带的 HTTP API：`fetch('/api/...')` |
| 直接读 `data/` 目录文件 | 用 CLI 或 HTTP API |
| 用 `sqlite3` 查 `.db` | 用 `$KS sql "SELECT ..."` |
| 在用户没开思源时测试 HTTP API | 等用户打开思源后再测，或用一次性 CLI |

**为什么不单独启 Kernel**：`siyuan.exe serve` 会锁工作空间 `.lock`，导致思源 app 打不开或闪退。CLI 一次性命令（如 `notebook list`）是安全的。

闪退后恢复：
```powershell
taskkill /F /IM siyuan.exe
Remove-Item -LiteralPath <SiYuan>/.lock -Force
```

## 风格约定

- 插件命名：`kebab-case`（如 `siyuan-plugin-asset-management`）
- displayName/description: 同时提供 `default` 和 `zh_CN`
- 代码风格：纯 ES Module + CommonJS 导出，无 TS 编译
- 注释用英文 + 中文混合，UI 文案走 i18n（中英）
- 图标：SVG symbol via `addIcons`，思源主题色 `#3575f3`
- UI：液态玻璃（backdrop-filter）为标准视觉
- 思源 API 调用：`fetch('http://127.0.0.1:6806/api/...')` 或 `/api/...`（相对路径）

## Agent 与命令

本领域会话使用的目录为 `.opencode/agents`、`.opencode/commands`、`.opencode/skills`，通过符号链接指向 `<Workspace>/workspace-agents/siyuandev` 下的对应目录。具体插件项目自己的项目级 AI 资产应放在插件仓库并随 Git 同步；需要思源通用能力时，通过项目配置桥接本领域 Skills。

**结构（精简后）**：

- primary 全部使用 opencode 内置 agent：`build`（默认，直接实现）、`plan`（复杂任务先规划再执行）。项目不定义自定义 primary agent，项目权限不写 `opencode.jsonc`，靠 opencode 默认询问机制人工把关。
- subagent 只保留 `@siyuan-dev`：思源插件专家顾问（隐藏），用于架构咨询、源码解释和方案校准；只读不改码，不参与默认实现链，仅在手动咨询或实现中确需架构意见时唤起。
- 命令两个：`/long-task` 长任务一条龙（方案 → 实现 → 独立审查 → 修复汇报，内置防卡死降级规则）；`/asset-deploy-main` 构建并部署到主空间 `<SiYuan>`（跨平台命令模板见命令文件）。

**工作方式**：

- 小任务：`build` 直接定位 → 实现 → 验证 → 汇报。
- 大任务：先切 `plan` 模式出方案（目标、改动点 file:line、验收标准、风险），批准后回 `build` 执行；不建固定的多 Agent 流水线。
- 需要架构解释时用 `@siyuan-dev` 咨询。

## 高风险改动（扩大验证）

以下改动必须扩大检查范围、查阅相关 Skill，并运行更完整的验证：

- 修改 `api/assets.js`、`api/storage.js`、schema、迁移、导入导出或备份恢复。
- 涉及批量操作、删除、数据重置、资产状态批处理或主空间部署。
- 涉及 4 个及以上模块，或可能影响实物、虚拟与预付权益共同逻辑。

## 长任务方式

- 任务中断后先检查实际文件状态，再决定继续、缩小范围或询问用户；不依赖记忆中的"应该改过了"。
- 验证深度与改动风险相称：文案改动构建通过即可，数据层改动要跑测试脚本并核验结果。
- 没有实际验证的内容不写成"已通过"；汇报时区分"已验证"与"未验证"。

## 返回格式

```text
完成：...
修改文件：...
验证：...
风险/后续：...
```

## 版本路线

逐版本规划已废弃，不在本文件维护。当前版本以 `plugin.json` 为准；产品方案见思源笔记 `20260705114312-vu899ky` 下子文档。

## 重要教训

### dock onclick 委托拿不到 sheet 闭包变量（v0.14 教训）

sheet 内 button 必须用 `btn.onclick = () => openXxx(mask, bodyEl, ...)` 闭包直接绑定，**不要走 dock 的 `[data-action]` 委托**。否则 ReferenceError。

### rerender 没回写 state 导致 textarea 数据丢失（v0.14 教训）

保存时直接从 DOM 读 textarea/input value，不要依赖 state 同步。

### dataset 键名是 camelCase（v0.14 教训）

`data-sheet-cat` → `b.dataset.sheetCat`（不是 `sheetcat`）。

### settings 保存不能覆写（v0.14 教训）

`this.settings = { ... }` 会丢失扩展字段。必须 `Object.assign({}, this.settings, { ... })`。

### 思源工作空间锁

永远不要单独启动 Kernel 进程 `siyuan.exe serve --port <port>`。

### zip 命名必须是 `package.zip`

集市 CI 严格检查。必须叫 `package.zip`，不是 `siyuan-plugin-asset-management.zip`。

### icon.png / preview.png 必须在仓库根目录

不是 `assets/` 子目录。

### package.zip 必须包含 assets/preset-icons/

预设图标库是独立 PNG，运行时靠 `fetch('/plugins/siyuan-plugin-asset-management/assets/preset-icons/manifest.json')` 加载。打包白名单漏掉 `assets/preset-icons/` → 集市版图标选择器全部 404。打包用 Python `zipfile`（不要用 `zip -r`），走 `scripts/build-package-zip.py`。v1.6.0 后预设图标扩到 33 张 + manifest.json = 34 项，zip 总条目数为 9 根 + 34 = 43（不是早先文档里的 29 条目——别再引用老数字）。见 `siyuan-plugin-publishing` skill §3.1。

### 发布前版本号三处一致（v2.3.0 教训）

每次发版前必须验证 `plugin.json.version === src.template.js 顶部的 PLUGIN_VERSION 常量 === package.zip 内 plugin.json.version` 三者完全相等，缺一即视为发布失败。常见踩坑：plugin.json 升到 2.3.0 后漏改 PLUGIN_VERSION 常量 → 备份快照元数据与关于页回退显示旧版；或者改了源码却忘了重跑 `node scripts/concat.js` 与重打 zip → zip 内还是旧版。**强制流程**：

1. `node scripts/concat.js`（同步构建）
2. `python scripts/build-package-zip.py`（脚本内置三处一致性断言，会 abort 否则不写 zip）
3. unzip 一次确认 zip 内 `plugin.json.version` 与首页 README Changelog 顶部条目匹配

第 2 步脚本同时处理 zip 名 = `package.zip`、arcname 用正斜杠、白名单 43 条目、原子写入避开 Windows 文件锁。**绝不允许手改 zip 内任何文件，也不允许只覆盖 plugin.json 而漏改源码常量**。

### 添加图标用 `addIcons` 注册 SVG symbol

`addTopBar({ icon: 'xxx' })` 用的是 `addIcons` 注册的 SVG symbol，不是 `assets/icon.png`。两条独立维护。

### Personal Access Token 不进对话/截图

用 `read -s` 输入环境变量，用完立刻去 https://github.com/settings/tokens Delete。
