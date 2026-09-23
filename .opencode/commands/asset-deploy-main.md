---
description: "Build the asset plugin and deploy safe files to the main SiYuan workspace."
agent: build
---

请构建并部署资产管理插件到主空间。

请先确认目标和影响范围，构建后部署插件运行所需文件。默认目标是 `<SiYuan>` 主空间；不要隐式清空业务数据。完成后返回实际复制的文件、验证结果和需要用户在思源里手动重载的提示。

按当前平台使用以下命令部署，只覆盖这 4 个文件，不得扩展复制范围：

macOS（zsh/bash，`<SiYuan>` = `/Users/dilyar/SiYuan`）：

```bash
cp index.js "/Users/dilyar/SiYuan/data/plugins/siyuan-plugin-asset-management/index.js"
cp index.css "/Users/dilyar/SiYuan/data/plugins/siyuan-plugin-asset-management/index.css"
cp i18n/zh_CN.json "/Users/dilyar/SiYuan/data/plugins/siyuan-plugin-asset-management/i18n/zh_CN.json"
cp i18n/en_US.json "/Users/dilyar/SiYuan/data/plugins/siyuan-plugin-asset-management/i18n/en_US.json"
```

Windows（PowerShell，`<SiYuan>` = `D:/SiYuan`）：

```powershell
Copy-Item -LiteralPath "index.js" -Destination "D:/SiYuan/data/plugins/siyuan-plugin-asset-management/index.js"
Copy-Item -LiteralPath "index.css" -Destination "D:/SiYuan/data/plugins/siyuan-plugin-asset-management/index.css"
Copy-Item -LiteralPath "i18n/zh_CN.json" -Destination "D:/SiYuan/data/plugins/siyuan-plugin-asset-management/i18n/zh_CN.json"
Copy-Item -LiteralPath "i18n/en_US.json" -Destination "D:/SiYuan/data/plugins/siyuan-plugin-asset-management/i18n/en_US.json"
```
