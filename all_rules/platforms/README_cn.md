# 平台规则

本目录收集平台内容政策、社区规则、安全标准及相关执行政策的官方来源。

## 目录结构

- `china/`：中国平台规则和政策来源。
- `global/`：全球平台规则和政策来源。
- 每个平台目录包含生成的 Markdown、`sources/` 下的原始来源文件、`verification-manifest.json`，以及 registry 中存在风险类别时生成的风险类别索引。

## 处理规则

- 平台政策正文必须通过 `scripts/fetch_rules.mjs` 从官方或可信一手平台来源生成。
- 如果平台页面依赖客户端渲染、阻断自动访问，或无法确认完整官方全文抽取，生成文件必须保留为 source stub。
- 风险索引只用于导航。具体适用仍以官方来源文件及其来源链接为准。

English version: [README.md](/Users/hobeter/Desktop/code/rules/all_rules/platforms/README.md)
