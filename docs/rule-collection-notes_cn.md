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

## 2026-05-24 目录 JSON 索引

导航更新：

- 新增 `scripts/generate_rule_indexes.mjs`，为 `all_rules/` 下每个非 `sources/` 目录生成 `index.json`。
- 每个目录索引列出该目录直属的规则 Markdown 文件，包括抽取出的标题、文件名、路径、可用来源元数据，以及子目录索引链接。
- 更新 `scripts/verify_rules.mjs`，如果规则目录缺少索引、直属规则 Markdown 未被列入索引、索引指向缺失文件，或原始来源文件哈希与 manifest 不一致，校验会失败。

## 2026-05-24 浏览器渲染补缺轮次

抽取更新：

- 新增 `scripts/render_url.py`，并在 `scripts/fetch_rules.mjs` 中支持 `rendered-html`，用于正文必须经过浏览器渲染才出现在 HTML artifact 中的官方来源。
- 增加渲染页面点击选择器能力，使官方折叠区域可以先展开，再保存渲染后的原始 artifact。
- Roblox Community Standards 改用官方 `about.roblox.com` 页面，展开官方折叠区域，并抽取详细政策正文。
- Meta Community Standards 收集从 Meta 官方政策索引发现的 27 个 Transparency Center Community Standards 分类页，去除重复站点导航，并保存渲染 artifact。
- TikTok Community Guidelines 收集官方 2025 H2 渲染版规则页面，修剪页脚和导航内容，并保存渲染 artifact。
- X 现在从 `help.x.com` 抽取官方渲染后的 `The X Rules` 文章正文。后续 linked-source 轮次已为可访问的 X 详细政策子页保留官方 artifact；部分 linked 页面仍返回 challenge 页面或渲染错误，具体失败记录在 X verification manifest 中。
- Utah、Mississippi、Ohio 州条目已从 stub 转为官方来源正文抽取。Utah 和 Mississippi 的官方来源站点需要 insecure-TLS curl fallback；Mississippi 还需要 Windows-1252 解码。
- Texas 改为首选的 Texas Constitution and Statutes Chapter 509 官方 codified PDF 来源。2026-05-24，Texas statutes 和 legislature 官方站点返回 HTTP 503 维护响应，并带有 `Retry-After: Tue, 26 May 2026 12:00:00 GMT`，因此 Texas 仍保留 source stub。

本轮后的校验状态：registry 中 49 条记录均已进入索引；48 条已抽取来源正文，1 条仍为 source stub（`us-state-texas-scope-act`）。

## 2026-05-24 追加补缺轮次

抽取更新：

- 新增抖音官方用户服务协议作为独立 Douyin 来源。该协议第 4 节包含信息内容发布规范，包括违法违规内容、不良内容、高危险性内容、AI/深度合成标识义务、垃圾信息、侵权和未成年人安全相关规定。
- 将 YouTube 从 4 个官方 Help 页面扩展到 22 个官方 YouTube Help Community Guidelines 及详细政策页面；这些页面来自官方 Community Guidelines 索引链接，覆盖 spam/scams、impersonation、external links、fake engagement、nudity and sexual content、child safety、self-harm、harmful or dangerous content、violent or graphic content、violent criminal organizations、hate speech、harassment、regulated goods、firearms 和 misinformation 等类别。
- 新增 Google Help article 主体抽取器，使 YouTube Markdown 从官方 `<article>` 正文生成，而不是从包含全站导航的整页 HTML 生成。
- 更新通用 HTML 抽取路径以保留官方内联链接。已重新生成 Bilibili 社区公约，使此前只显示为 `点击打开链接` 的引用现在指向下载到的 Bilibili bundle 中携带的官方链接来源。
- 新增 `prefer_curl` 支持，用于 Node `fetch` 失败但 curl 可获取官方 HTML 的来源；YouTube 现在通过该路径稳定获取 22 个官方 Help 页面。
- 重新检查 Texas 官方 statutes、bill text、bill lookup 以及动态 statutes query URL。它们仍返回 HTTP 503 维护响应，并带有 `Retry-After: Tue, 26 May 2026 12:00:00 GMT`，因此 Texas 仍是唯一 source stub。

本轮后的校验状态：registry 中 50 条记录均已进入索引；49 条已抽取来源正文，1 条仍为 source stub（`us-state-texas-scope-act`）。

## 2026-05-24 联邦 provider 报告义务补缺

联邦抽取更新：

- 新增 18 U.S.C. § 2258A、§ 2258B、§ 2258C 的官方 U.S. Code 来源。这些条文覆盖 apparent child sexual exploitation 或 child pornography violations 的 provider 报告义务、报告相关有限责任，以及 CyberTipline 报告技术元素的使用。
- 重新检查 Texas 官方 statutes、Texas bill text、Texas bill lookup、`www.legis.state.tx.us` 以及 Texas Legislature FTP/mirror 路径。2026-05-24 这些来源仍返回 HTTP 503 维护响应、SSL 失败或 FTP 超时，因此 Texas codified 条目仍是唯一 source stub。

本轮后的校验状态：registry 中 53 条记录均已进入索引；52 条已抽取来源正文，1 条仍为 source stub（`us-state-texas-scope-act`）。

## 2026-05-24 联邦 COPPA 与 FOSTA/SESTA 补缺

联邦抽取更新：

- 新增 18 U.S.C. § 2421A 的官方 U.S. Code 来源；该条是 47 U.S.C. § 230 联邦和州刑事法律例外中引用的 promotion-or-facilitation 条款。
- 新增 statutory COPPA 官方 U.S. Code 条文 15 U.S.C. §§ 6501-6506，用于补充已收集的 16 CFR Part 312 COPPA Rule 来源。这些条文覆盖定义、不公平/欺骗行为监管、安全港、州执法、行政与适用范围、复核。

本轮后的校验状态：registry 中 60 条记录均已进入索引；59 条已抽取来源正文，1 条仍为 source stub（`us-state-texas-scope-act`）。

## 2026-05-24 联邦未成年人安全与 obscenity 补缺

联邦抽取更新：

- 新增 47 U.S.C. §§ 223、231 官方 U.S. Code 来源，覆盖 obscene or harassing communications 以及限制未成年人访问 harmful World Wide Web material。
- 新增 18 U.S.C. §§ 2251A、2252B、2258D、1466A、1470、2422 官方 U.S. Code 来源，覆盖 selling or buying of children、误导性互联网域名、NCMEC 有限责任和访问最小化、儿童性虐待的 obscene visual representations、向未成年人传输 obscene material、coercion/enticement。
- 复核了最近改动后的 `scripts/fetch_rules.mjs`。该文件当前在工作区没有未提交 diff，`node --check scripts/fetch_rules.mjs` 通过，并且选择性官方来源抓取已成功跑完。
- 修正 `18 U.S.C. § 2258D` registry 校验短语，使其匹配官方当前 U.S. Code 页面实际用语。该条目现在可从官方来源成功抽取，不再是 source stub。

本轮后的校验状态：registry 中 68 条记录均已进入索引；67 条已抽取来源正文，1 条仍为 source stub（`us-state-texas-scope-act`）。

## 2026-05-24 联邦威胁、仇恨犯罪、hoaxes 与 spam 补缺

联邦抽取更新：

- 新增 18 U.S.C. §§ 871、876、877、879 官方 U.S. Code 来源，覆盖针对总统或继任者的威胁、邮寄威胁通信、来自外国的邮寄威胁，以及针对前总统和其他受保护人员的威胁。
- 新增 18 U.S.C. §§ 247、249 官方 U.S. Code 来源，覆盖损坏宗教财产、阻碍宗教信仰自由行使，以及联邦 hate-crime acts。
- 新增 18 U.S.C. §§ 1037、1038 官方 U.S. Code 来源，覆盖 electronic-mail fraud/spam 行为，以及涉及特定危险行为的 false information or hoaxes。
- 新增 18 U.S.C. §§ 119、2101 官方 U.S. Code 来源，覆盖公开受保护官员 restricted personal information，以及涉及 interstate or foreign commerce facilities 的 riots。
- 18 U.S.C. § 877 首次抓取遇到临时 U.S. Code TLS/download 失败，并按规则正确生成 source stub；随后定向重试成功下载官方来源并转为 extracted 文件。

本轮后的校验状态：registry 中 78 条记录均已进入索引；77 条已抽取来源正文，1 条仍为 source stub（`us-state-texas-scope-act`）。

## 2026-05-24 联邦 fraud、identity、cyber abuse 与 regulated goods 补缺

联邦抽取更新：

- 新增 18 U.S.C. §§ 1028、1028A、1029、1030 官方 U.S. Code 来源，覆盖 identity-document 与 authentication-feature fraud、aggravated identity theft、access-device fraud、computer fraud/abuse。
- 新增 18 U.S.C. §§ 1341、1343、1344、1349 官方 U.S. Code 来源，覆盖 mail fraud、wire fraud、bank fraud，以及 fraud offenses 的 attempt/conspiracy。
- 新增 18 U.S.C. § 922 官方 U.S. Code 来源，覆盖与 regulated-goods 内容和交易政策相关的联邦 firearms unlawful acts。
- 新增 21 U.S.C. §§ 841、843、863 官方 U.S. Code 来源，覆盖 controlled-substances prohibited acts、use of communication facilities、drug paraphernalia。
- 12 个新增来源均从官方 U.S. Code 页面下载，保留原始 HTML artifact，抽取为 Markdown，并通过正文哈希校验。

本轮后的校验状态：registry 中 90 条记录均已进入索引；89 条已抽取来源正文，1 条仍为 source stub（`us-state-texas-scope-act`）。

## 2026-05-24 联邦 weapons、explosives、illicit finance、IP 与 privacy 补缺

联邦抽取更新：

- 新增 18 U.S.C. §§ 842、844、930、931 官方 U.S. Code 来源，覆盖 explosives unlawful acts and penalties、联邦设施中的 firearms or dangerous weapons、body-armor restrictions。
- 新增 18 U.S.C. §§ 1952、1956、1960 官方 U.S. Code 来源，覆盖 racketeering-facilitation travel/facilities、money laundering、unlicensed money-transmitting businesses。
- 新增 17 U.S.C. § 506 以及 18 U.S.C. §§ 2318、2319、2320 官方 U.S. Code 来源，覆盖 criminal copyright offenses、criminal copyright infringement penalties、counterfeit labels/documentation、counterfeit goods or services。
- 新增 18 U.S.C. §§ 2511、2701、2702 官方 U.S. Code 来源，覆盖 interception/disclosure of communications、unlawful access to stored communications、provider voluntary disclosure rules。
- 18 U.S.C. § 931 首次生成 source stub，因为 registry 短语使用了不匹配官方正文的概括词；已改为官方用语 `crime of violence`，该条目现在可成功抽取。

本轮后的校验状态：registry 中 104 条记录均已进入索引；103 条已抽取来源正文，1 条仍为 source stub（`us-state-texas-scope-act`）。

## 2026-05-24 联邦 CAN-SPAM 补缺

联邦抽取更新：

- 新增 15 U.S.C. §§ 7701-7713 官方 U.S. Code 来源，即 commercial electronic mail 的 CAN-SPAM 法定框架。
- 新增来源覆盖 congressional findings and policy、definitions、predatory and abusive commercial e-mail、commercial electronic mail user protections、knowingly promoted businesses、enforcement、effect on other laws、Do-Not-E-Mail registry、studies、enforcement rewards and labeling、regulations、wireless application、separability。
- 这些条目补充已收集的 18 U.S.C. § 1037 electronic-mail fraud 来源，用 CAN-SPAM 的民事和监管条款补齐 spam/scams 政策缺口。
- 13 个新增 section 均从官方 U.S. Code 页面下载，保留原始 HTML artifact，抽取为 Markdown，并通过正文哈希校验。

本轮后的校验状态：registry 中 117 条记录均已进入索引；116 条已抽取来源正文，1 条仍为 source stub（`us-state-texas-scope-act`）。

## 2026-05-24 联邦 FTC Act 与 GLBA pretexting 补缺

联邦抽取更新：

- 新增 15 U.S.C. §§ 45、52、53、57a、57b 官方 U.S. Code 来源，覆盖 unfair or deceptive acts or practices、false advertisements、FTC injunctions、unfair/deceptive-practices rulemaking，以及相关 civil actions。
- 新增 15 U.S.C. §§ 6821-6827 官方 U.S. Code 来源，即 GLBA customer-information pretexting 框架，覆盖 financial-institution customer information privacy protection、administrative enforcement、criminal penalties、State-law interaction、agency guidance、reports、definitions。
- 这些条目进一步补齐 scams、deceptive conduct、phishing、financial-information privacy、personal-data abuse 缺口。
- 12 个新增 section 均从官方 U.S. Code 页面下载，保留原始 HTML artifact，抽取为 Markdown，并通过正文哈希校验。

本轮后的校验状态：registry 中 129 条记录均已进入索引；128 条已抽取来源正文，1 条仍为 source stub（`us-state-texas-scope-act`）。

## 2026-05-24 联邦 civil-rights、intimidation 与 civic integrity 补缺

联邦抽取更新：

- 新增 18 U.S.C. §§ 241、242、245、248 官方 U.S. Code 来源，覆盖 conspiracy against rights、deprivation of rights under color of law、federally protected activities、freedom of access to clinic entrances。
- 新增 18 U.S.C. §§ 594、1512、1513 官方 U.S. Code 来源，覆盖 voter intimidation、tampering with a witness/victim/informant、retaliation against a witness/victim/informant。
- 新增 42 U.S.C. § 3631 以及 52 U.S.C. §§ 10101、10307 官方 U.S. Code 来源，覆盖 fair-housing intimidation/interference、voting rights、Voting Rights Act prohibited acts。
- 这些条目进一步补齐 hate/harassment、rights-interference、civic-integrity、intimidation、retaliation 缺口。

本轮后的校验状态：registry 中 139 条记录均已进入索引；138 条已抽取来源正文，1 条仍为 source stub（`us-state-texas-scope-act`）。

## 2026-05-24 全球平台 GitHub 与 Steam 补缺

平台抽取更新：

- 新增 GitHub Docs 官方 acceptable-use 来源，包括主 Acceptable Use Policies 页面，以及 malware/exploits、bullying and harassment、doxxing/privacy invasion、hate speech、impersonation、misinformation、sexually obscene content、violent threats、terrorism and violent extremism、child sexual exploitation or abuse、non-consensual intimate imagery、synthetic media/AI tools 等详细政策页面。
- 新增 Steam Support 官方 discussions、reviews、user-generated content rules and guidelines。正文从下载 HTML artifact 中的官方 FAQ data payload 抽取。
- 新增 GitHub Docs article body 与 Steam FAQ payload 专用抽取器，避免把导航、页面 shell 标记和脚本数据当作规则正文。
- 本轮未继续新增美国联邦法律条文。

本轮后的校验状态：registry 中 141 条记录均已进入索引；140 条已抽取来源正文，1 条仍为 source stub（`us-state-texas-scope-act`）。

## 2026-05-24 全球平台 GitLab、Bluesky 与 Tumblr 补缺

平台抽取更新：

- 新增 GitLab Handbook 官方 Acceptable Use Policy，覆盖 unacceptable service use、illegal or malicious activity、privacy misuse、harassment/defamation、spam/phishing、service disruption，以及 AI-powered service restrictions。
- 新增 Bluesky support 官方 Community Guidelines，覆盖 public safety、threats and violence、child safety、adult content consent boundaries、self-harm and dangerous behavior、privacy、anti-discrimination、anti-harassment、authenticity、information integrity、regulated goods、intellectual property、site security、ban evasion。
- 新增 tumblr.com 官方 User Guidelines，覆盖 terrorism、hate speech、harm to minors、self-harm promotion、sexually explicit material、violent threats/gore、spam、automation、IP infringement、impersonation、harassment、privacy violations、unlawful uses、regulated goods、election interference。
- Medium Rules 作为候选来源检查过，但 2026-05-24 官方 help.medium.com 页面向自动下载返回 Cloudflare challenge，因此未确认完整官方正文抽取，本轮未纳入。
- 本轮未继续新增美国联邦法律条文。

本轮后的校验状态：registry 中 144 条记录均已进入索引；143 条已抽取来源正文，1 条仍为 source stub（`us-state-texas-scope-act`）。

## 2026-05-24 规则详情链接本地化

链接与校验更新：

- 新增已下载规则来源链接的 URL alias 处理，包括 `help.x.com` 与 legacy `help.twitter.com` 形式之间的 X policy 链接、带或不带 query string 的 YouTube Help article ID，以及已下载来源的 HTTP/HTTPS 变体。
- 新增 `scripts/localize_rule_links.mjs`，扫描所有已收集 Markdown 的 source-text section，将指向已下载官方 source artifact 的正文在线链接替换为本地相对链接，同时保留其他在线链接。
- 更新 `scripts/fetch_rules.mjs`，Cloudflare/security challenge 页面会被拒绝，不再登记为有效 source artifact；刷新某条目时，manifest 目录下不再被引用的旧生成 artifact 会被清理。
- 更新 `scripts/verify_rules.mjs`，如果 HTML/XML source artifact 是 challenge 页面，或正文仍在线指向已经本地下载过的来源 URL，校验会失败。
- 重新生成 X 和 YouTube 平台输出，使已收集的详细政策链接指向本地。X 本轮确认并保存官方 `The X Rules` 页面中的全部 18 个 detailed policy 本地 artifact，包括 Adult Content、Illegal or Certain Regulated Goods or Services、Child Safety 与 Private Information。抓取器现在可在当前浏览器渲染请求被 challenge 页面临时拦截时，复用同目录下既有且已确认不是 challenge 的官方 artifact。
- 将 Bilibili/Douyin 正文中已对应到本库已下载官方来源的跨规则链接替换为本地 source artifact。
- 本轮未继续新增美国联邦法律条文。

本轮后的校验状态：`node scripts/verify_rules.mjs` 验证 144 条记录，其中 143 个文件已抽取正文，1 个文件仍为 source stub（`us-state-texas-scope-act`）。
