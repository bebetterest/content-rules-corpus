# All Rules

本目录用于存放已收集的规则文本。子目录应按司法辖区、标准机构、平台或其他稳定来源边界组织。

## 当前目录

- `china/`：中国法律、行政法规、部门规章及相关官方规则文本。
- `platforms/`：平台内容政策与社区规则官方来源，按平台和区域组织。
- `united-states/`：美国联邦与州层面的内容安全相关法律、法规和规则来源。

## 来源 Registry

- `source-registry.json` 记录来源 ID、标题、司法辖区、适用范围说明、来源机构、来源链接、参考链接、抓取方式、输出文件、语言、状态说明，以及适用的风险类别。
- `scripts/fetch_rules.mjs` 读取 registry，生成 Markdown、原始来源文件和 `sources/verification-manifest.json`。
- `fetch_method: "rendered-html"` 条目使用 Python Playwright 保存浏览器渲染后的官方 HTML，再进行抽取。
- 无法确认完整官方全文抽取的文件必须保留为 source stub。

每个收集文件应在原文之前标注来源元数据。

## 目录索引

`all_rules/` 下每个非 `sources/` 目录都有一个由 `scripts/generate_rule_indexes.mjs` 生成的 `index.json` 文件。这些索引会列出该目录直属的规则 Markdown 文件，并链接到子目录索引，便于内部导航。

English version: [README.md](/Users/hobeter/Desktop/code/rules/all_rules/README.md)
