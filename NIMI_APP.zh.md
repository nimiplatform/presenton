# Presenton

从主题描述或源文档出发，选择版式模板、审阅并调整逐页大纲，在可视化编辑器中精修内容与图表，并直接导出为 PDF 或 PowerPoint（PPTX）演示文稿。

## 快速开始

1. 在电脑端（macOS Apple Silicon 或 Windows x64）通过 Nimi Home 打开 Presenton，并保持 Nimi 运行。
2. 打开 **Settings → AI models**，配置 **写作与编辑**（Writing and editing）所需的文本模型；如需 AI 生成配图或使用图标/文档检索，请一并配置 **图像生成**（Generated images）与 **向量检索**（Icon and document search）模型。
3. 点击 **Create new Presentation**，选择 **Standard**（模板规范）或 **Smart** 模式，输入主题简介或上传参考文档，选定模板并审阅、重排或修改大纲后再生成完整幻灯片。
4. 在编辑器中直接调整文案、图表、表格、图标、图片与排版，完成后点击 **Export** 导出为 PDF 或 PPTX。

## 模型要求与使用限制

- **模型能力要求**：所选文本模型需支持结构化 JSON 输出与工具调用（使用视觉模板转换时还需支持图像输入）。若较小的本机模型难以满足多页复杂模板约束，可减少页数、改用 **Standard** 等更简洁的模板，或在 **Settings → AI models** 中切换更强的文本模型。
- **内容与版面核对**：AI 生成的初稿可能存在事实偏差或文本框溢出，分享前请核对幻灯片内容与导出的最终页面。
- **导出字体差异**：PDF 导出会保留当前渲染效果；PPTX 在其他办公软件中打开时，若系统未安装对应模板字体，字距和换行可能略有变化。
- **大纲恢复机制**：重新打开已生成完成的大纲会直接恢复原内容，不会重复消耗 AI 调用；主动点击重新生成才会创建新草稿。

## 数据去向与外部服务

- **本机 PC 工作区**：已保存的演示文稿、自定义模板、上传文档、生成图片与检索缓存均保存在你电脑上的独立工作区目录（macOS 位于 `~/Library/Application Support/Presenton Nimi/workspaces/`，Windows 位于 `%APPDATA%/Presenton Nimi/workspaces/`）。导出的 PDF 与 PPTX 仅写入你主动选择的保存位置。
- **Nimi AI 路由**：所有 AI 请求均按你在 Nimi 中配置的本机（Local）或云端（Cloud）模型路由执行。本机模型在当前电脑运行；选择云端模型时，当次所需的提示词或文档片段会发送给所选服务商，并可能产生对应服务商费用。
- **可选业务服务**：图库（Pexels/Pixabay）、外部联网搜索与 Presenton Community 均为可选功能，在电脑端设置中独立配置；Community 账号登录不会替代 Nimi AI 模型配置。

## 远程工作区接入说明

PC 端 Presenton `0.9.12-beta.1` 已内置工作区集成能力（`io.github.nimiplatform.presenton.workspace.v1`）。托管网页版（`https://presenton.nimi.xyz`）不在本次原生版本中公开发布，将按独立流程准入。

后续经准入的远程网页端或开发预览端均连接你主 PC 上运行中的 Presenton，并非离线独立应用：

1. 在主 PC 上保持 Nimi 与 Presenton（`0.9.12-beta.1` 及以上）处于打开状态。
2. 通过 Nimi 官方页面登录并连接主 PC，在 Nimi Home 中确认该客户端来源。
3. 在 **Nimi Home → Integrations** 中授予全部五项 Presenton 工作区操作权限（`workspace.status`、`workspace.upload`、`workspace.request`、`workspace.response`、`workspace.close`）。模型配置、凭据、项目文件与生成任务均保留在主 PC 的 Presenton 中，单次远程上传上限为 128 MiB。

## 开源署名与帮助

Presenton for Nimi 基于 Apache-2.0 协议的开源项目 [Presenton](https://github.com/presenton/presenton) 适配。遇到问题请在 https://github.com/nimiplatform/presenton/issues 提交反馈，并附上应用版本、操作步骤、报错信息与导出格式（提交前请移除凭据和私密源文档）。
