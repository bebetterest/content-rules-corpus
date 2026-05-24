# Rules

本仓库用于按来源优先的结构收集规则、法规、标准和政策文本，便于后续分析、比对和整理。

## 当前范围

- `all_rules/china/`：中国法规规章原文及来源元数据。
- `all_rules/platforms/`：平台内容与社区规则官方来源，按平台分目录保存。
- `all_rules/united-states/`：美国联邦与州层面的内容安全相关法律、法规和规则来源。
- `all_rules/source-registry.json`：通用抓取流程使用的来源 registry。

## 仓库结构

- `all_rules/`：按司法辖区或规则类型归档的规则文本。
- `docs/`：项目说明、收集决策和维护记录。
- `scripts/`：可复现的下载、抽取和校验脚本。

## 抓取与校验

- `node scripts/fetch_china_rules.mjs`：刷新中国法规起始集合。
- `node scripts/fetch_rules.mjs --collection platforms`：根据 `all_rules/source-registry.json` 刷新平台规则来源。
- `node scripts/fetch_rules.mjs --collection united-states`：根据 `all_rules/source-registry.json` 刷新美国联邦与州来源。
- `node scripts/localize_rule_links.mjs`：将正文中指向已下载官方来源的在线链接替换为本地相对链接，同时保留其他在线链接。单来源规则条目优先链接到本地 Markdown 输出；多来源与 linked-detail 来源链接到本地原始 artifact。
- `node scripts/generate_rule_indexes.mjs`：刷新 `all_rules/` 下各目录用于内部导航的 `index.json`。
- `node scripts/verify_rules.mjs`：校验来源链接、原始来源文件哈希、正文哈希、legacy 中国正文哈希、州法适用范围说明、已下载来源链接本地化，以及目录索引。

部分平台条目使用 `fetch_method: "rendered-html"`，需要安装 Python Playwright 及 Chromium 浏览器。这些条目仍会先保存渲染后的官方 HTML artifact，再进行 Markdown 抽取。抓取器还支持显式和递归发现的 `linked_source_urls`、linked source 专用渲染抓取设置、Bilibili 帮助页这类 hash 路由来源 URL，以及对不稳定官方页面复用 primary/linked 本地缓存。

## 收集原则

- 优先使用政府机关、标准机构等权威来源页面。
- 每个收集文件记录来源链接、发布机关、公布或修订日期、抓取日期。
- 不得手写或改写官方规则原文。应下载权威来源，并通过可复现的抽取代码生成收集用 Markdown。
- 保留官方原文，不翻译。只有存在官方译文，或用户明确要求单独提供非权威参考译文时，才加入翻译版本。
- 如果来源权威性、现行有效性、完整性或抽取准确性存在不确定，必须在收集文件开头说明。
- 如果官方来源无法下载或无法确认完整抽取，只生成 source stub，不复制正文。

English version: [README.md](/Users/hobeter/Desktop/code/rules/README.md)
