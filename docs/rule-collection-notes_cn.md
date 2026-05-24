# 规则收集记录

## 2026-05-23 中国互联网规则起始集合

初始收集范围：

- 《互联网信息服务管理办法》
- 《网络信息内容生态治理规定》

收集决策：

- 使用 `all_rules/china/` 存放中国规则原文。
- 以政府权威来源作为主要校验依据。
- 官方中文原文使用 `_cn.md` 文件保存。除非存在官方译文，或用户明确要求并标注非权威参考译文，否则不加入英文翻译。
- 不手写官方规则原文。使用 `scripts/fetch_china_rules.mjs` 将官方 HTML 原始文件下载到 `all_rules/china/sources/`，抽取正文，生成 Markdown，并在 `verification-manifest.json` 记录哈希。
- 《互联网信息服务管理办法》采用国家行政法规库的现行文本，因为该来源包含 2024-12-06 第二次修订后的版本。

## 2026-05-23 平台与美国规则扩展

扩展收集范围：

- `all_rules/platforms/`：中国及全球平台内容规则或社区规则。
- `all_rules/united-states/federal/`：美国联邦层面的内容安全相关法律、法规和公共法律。
- `all_rules/united-states/states/`：选定州层面的内容安全相关来源。

收集决策：

- 使用 `all_rules/source-registry.json` 作为通用流程的来源 registry。每条记录包含来源 ID、标题、司法辖区、适用范围说明、来源链接、来源机构、抓取方式、输出文件、语言、状态说明，以及适用的风险类别。
- 使用 `scripts/fetch_rules.mjs` 下载来源、保留原始文件、生成 Markdown，并在各目录写入 `verification-manifest.json`。
- 使用 `scripts/verify_rules.mjs` 校验正文哈希、来源链接、legacy 中国正文哈希，以及州法适用范围说明。
- 对于阻断自动访问、需要 JavaScript 渲染、返回维护页，或无法确认完整官方全文抽取的平台页面和法律来源，只生成 source stub。
- 对美国州层面文件，在任何正文之前保留明确的 `Scope Note:`，避免读者将州法误认为全国联邦法。
- 平台目录下的风险类别索引来自 registry 标签，只用于导航，不替代官方来源正文。

## 2026-05-24 平台全文抽取补强

平台抽取更新：

- 为可见 HTML 仅为应用外壳的平台官方来源增加站点专用抽取路径。
- Bilibili 社区公约正文从官方创作中心页面引用的官方静态 JS bundle 中抽取。
- 小红书社区规范正文从官方协议页及其官方合同内容 JSON 接口中抽取。
- QQ 规则正文从腾讯规则中心官网页面及对应规则中心 JSON 接口中抽取。
- 百度贴吧协议正文从官方协议页及对应官方 `getConfigData` JSON 接口中抽取。
- Pinterest 政策源文件先对下载得到的 gzip 原始内容解压，再进行 Markdown 抽取。
- 微信改用官方 Weixin 个人账号使用规范来源页，不再使用无关的腾讯规则中心候选链接。

本轮后仍保留的平台官网 stub：

- X Help Center 页面当前对自动下载返回 Cloudflare challenge。
- Roblox Help 当前对自动下载返回 HTTP 403。
- TikTok 官方 community-guidelines URL 当前返回政策落地页或渲染数据页，未确认包含完整规则正文。
- Meta Transparency Center 页面可以下载，但下载 HTML 中没有可确认的完整政策正文，需要后续补充渲染或 API 抽取。

本轮校验结果：`node scripts/verify_rules.mjs` 验证 49 条记录，其中 41 个文件已抽取正文，8 个文件仍为 source stub。
