# content-rules-corpus

![Hand-drawn content-rules-corpus header](docs/assets/readme-header.png)

content-rules-corpus 是一个来源优先的语料库，用于收集、保存和比较与内容安全相关的法律、法规、标准和平台政策。

本项目面向研究和探索：不同规则体系中，政府、监管机构、标准组织和线上平台如何定义违规内容、安全义务、执行流程、用户保护，以及相关合规概念。

## 项目目标

- 收集内容安全、信任与安全、网络危害、未成年人安全、平台秩序、隐私滥用、欺诈、骚扰、暴力、知识产权等相关领域的权威来源文本。
- 在可行时保留原始下载 source artifact，便于将生成的 Markdown 与原始来源核对。
- 通过可复现的抽取脚本生成规范化 Markdown，而不是手工录入。
- 维护结构化索引和 verification manifest，支持导航、哈希校验和后续分析。
- 当来源权威性、现行有效性、可执行性、完整性或抽取质量无法完全确认时，明确写出不确定性。

## 当前语料

截至 2026-05-25，本仓库包含 144 个已索引规则文件：

- `all_rules/china/`：2 个中国法规规章文本。
- `all_rules/platforms/`：27 个平台政策文件，按语言组和平台分组。
- `all_rules/united-states/`：115 个美国联邦与州层面的内容安全相关法律来源。

该语料库并不完整，应作为持续增长的研究数据集使用，而不是权威法律数据库。

## 仓库结构

- `all_rules/`：收集后的规则文本、原始 source artifact、verification manifest 和生成索引。
- `all_rules/source-registry.json`：通用抓取流程使用的 registry。每个条目记录来源元数据、输出路径、抓取设置、抽取器设置、校验短语，以及适用的风险分类。
- `docs/`：项目说明、收集决策、维护记录和已知抽取注意事项。
- `scripts/`：可复现的下载、抽取、链接本地化、索引和校验脚本。

`all_rules/` 下每个非 `sources/` 目录都有生成的 `index.json`。原始下载文件保存在相邻的 `sources/` 目录中，并由 `verification-manifest.json` 记录元数据。

## 环境要求

本仓库目前使用普通脚本，而不是打包后的应用运行时。

常规校验所需：

- 支持内置 `fetch` 的 Node.js。
- `rg` / ripgrep。

更完整的来源刷新所需：

- `curl`，用于 Node `fetch` 不稳定来源的备用下载。
- `pdftotext`，用于 PDF 抽取。
- 安装 Playwright 和 Chromium 浏览器的 Python 3 环境，用于 `fetch_method: "rendered-html"` 条目。

部分官方网站不稳定、会阻止自动化访问，或需要浏览器渲染。抓取器支持在这些场景中复用缓存来源，但新增来源采集仍可能受当前网络状态影响。

## 常用命令

校验当前语料：

```sh
node scripts/verify_rules.mjs
```

重新生成目录索引：

```sh
node scripts/generate_rule_indexes.mjs
```

将 Markdown 正文中指向已下载官方来源的链接替换为本地相对链接：

```sh
node scripts/localize_rule_links.mjs
```

刷新中国法规起始集合：

```sh
node scripts/fetch_china_rules.mjs
```

刷新指定 registry 条目：

```sh
node scripts/fetch_rules.mjs --id platform-x-rules
node scripts/fetch_rules.mjs --collection platforms
node scripts/fetch_rules.mjs --collection united-states
```

常用环境变量：

- `RULES_RETRIEVED_DATE=YYYY-MM-DD`：设置写入生成文件的抓取日期。
- `RULES_PREFER_CACHED=1`：存在本地 source artifact 时优先复用。
- `RULES_CACHE_ONLY=1`：只使用缓存 artifact，并将缺失缓存记录为抽取说明。

## 收集流程

1. 添加或刷新来源前，先研究来源权威性和当前状态。
2. 在 `all_rules/source-registry.json` 中添加或更新对应条目。
3. 只有当来源需要专用抽取器或抓取行为时，才扩展 `scripts/fetch_rules.mjs`。
4. 运行 `node scripts/fetch_rules.mjs --id <source-id>` 做定向抓取。
5. 运行 `node scripts/localize_rule_links.mjs`。
6. 运行 `node scripts/generate_rule_indexes.mjs`。
7. 运行 `node scripts/verify_rules.mjs`。
8. 当范围、流程、来源状态或项目方向变化时，同步更新 `docs/` 和 README 文件。

## 来源文本处理政策

官方规则、法规、法律、标准和政策文本不得由人工录入、重构、转述或手工改写。应从正确的权威来源下载，在可行时保留原始 source artifact，通过可复现的抽取和裁剪代码生成 Markdown，并在标记完成前验证生成正文与下载来源一致。

官方来源文本保留原始语言。只有收集到官方译文，或用户明确要求单独提供非权威参考译文时，才添加翻译。

如果无法确认完整抽取，输出应是明确标记的 source stub，或带 opening uncertainty note 的文件，而不是人工重建的文本。

## 数据质量

`scripts/verify_rules.mjs` 会校验：

- 原始 source artifact 哈希和字节数；
- 生成正文哈希；
- 必需的 source URL 和 reference URL；
- 州法 `Scope Note:` 元数据；
- 已下载来源链接是否完成本地化；
- HTML/XML artifact 是否为 challenge page；
- 是否存在未被引用的 source artifact；
- 生成的目录索引。

校验只能确认仓库内部一致性。它不能独立证明某部法律当前可执行、某个平台政策仍为最新版，或某个来源在抓取后没有变化。

## 贡献

贡献应保持来源优先和可复现。

- 优先使用官方一手来源。
- 避免手工录入官方文本。
- 保持元数据完整：source URL、authority、jurisdiction、retrieval date、language、status note 和 scope note。
- 保持英文与中文文档同步。中文配套文件使用 `*_cn.md` 命名模式。
- 在可行时保留原始 source artifact。
- 提交变更前运行校验。
- 不要提交 `.env`、agent guidance 文件或系统元数据等本地专用文件。

## 法律与使用声明

本仓库用于围绕内容安全规则开展研究、比较和工程工作流，不构成法律意见、合规意见，也不能替代对当前官方来源的核查。

部分收集材料可能由发布平台或来源发布方享有版权。在本仓库之外分发或复用来源文本前，应检查原始来源条款。

## License

本项目尚未添加 license 文件。在 license 被选择并提交之前，不应假定本仓库具备开源复用授权。

English version: [README.md](/Users/hobeter/Desktop/code/rules/README.md)
