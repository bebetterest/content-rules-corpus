# Rule Collection Notes

## 2026-05-23 China Internet Rule Seed Set

Initial collection scope:

- `Internet Information Service Management Measures`
- `Provisions on the Governance of the Online Information Content Ecosystem`

Collection decisions:

- Use `all_rules/china/` for China-specific source texts.
- Use authoritative government sources as the primary source of truth.
- Store official Chinese original texts in `_cn.md` files. English translations are not added unless official translations are available or a non-authoritative translation is explicitly requested.
- Do not hand-type official rule text. Use `scripts/fetch_china_rules.mjs` to download raw official HTML into `all_rules/china/sources/`, extract the body text, write Markdown outputs, and record hashes in `verification-manifest.json`.
- For `Internet Information Service Management Measures`, use the current text from the National Administrative Regulations Database because it includes the 2024-12-06 second revision.

## 2026-05-23 Platform and United States Expansion

Expanded collection scope:

- `all_rules/platforms/`: China and global platform content or community rules.
- `all_rules/united-states/federal/`: U.S. federal content-safety-related statutes, regulations, and public laws.
- `all_rules/united-states/states/`: selected state-level content-safety-related sources.

Collection decisions:

- Use `all_rules/source-registry.json` as the source registry for the general pipeline. Each entry records the source ID, title, jurisdiction, scope note, source URL, source authority, fetch method, output file, language, status note, and risk categories where applicable.
- Use `scripts/fetch_rules.mjs` to download sources, retain raw artifacts, generate Markdown, and write per-directory `verification-manifest.json` files.
- Use `scripts/verify_rules.mjs` to verify body hashes, source URLs, legacy China hashes, and state-law scope notes.
- For platform pages and legal sources that block automated access, require JavaScript rendering, return maintenance pages, or otherwise cannot be confirmed as complete official full-text extraction, generate source stubs only.
- For state-level U.S. files, keep an explicit `Scope Note:` before any source text so readers do not mistake state law for nationwide federal law.
- Risk-category indexes in platform directories are navigation aids derived from registry tags; they do not replace the official source text.

## 2026-05-24 Platform Full-Text Extraction Pass

Platform extraction updates:

- Added site-specific extraction paths for official platform sources whose visible HTML is only an application shell.
- Bilibili community convention text is extracted from the official static JS bundle referenced by the official creator-center page.
- Xiaohongshu community guideline text is extracted from the official agreement page and its official contract-content JSON endpoint.
- QQ rule text is extracted from the official Tencent rule-center page and matching rule-center JSON endpoint.
- Baidu Tieba agreement text is extracted from the official agreement page and matching official `getConfigData` JSON endpoint.
- Pinterest policy text now decodes the downloaded gzip source before Markdown extraction.
- WeChat now uses the official Weixin personal-account usage standard source page instead of the unrelated Tencent rule-center candidate.

Remaining platform stubs after this pass:

- X Help Center pages currently return a Cloudflare challenge to automated downloads.
- Roblox Help currently returns HTTP 403 to automated downloads.
- TikTok's official community-guidelines URL currently returns a policy landing/rendered data page rather than confirmed full guideline text.
- Meta Transparency Center pages can be downloaded, but the downloaded HTML does not contain confirmed complete policy body text without additional rendered/API extraction.

Verification result for this pass: `node scripts/verify_rules.mjs` verified 49 entries, with 41 extracted files and 8 source stubs.

## 2026-05-24 Directory JSON Indexes

Navigation update:

- Added `scripts/generate_rule_indexes.mjs` to generate `index.json` files for every non-`sources/` directory under `all_rules/`.
- Each directory index lists directly contained rule Markdown files with extracted titles, file names, paths, source metadata where available, and child directory index links.
- Updated `scripts/verify_rules.mjs` so verification fails if a rule directory is missing an index, if a direct rule Markdown file is not listed, if an index points to a missing file, or if a raw source artifact hash no longer matches its manifest.

## 2026-05-24 Browser-Rendered Gap Fill Pass

Extraction updates:

- Added `scripts/render_url.py` and `rendered-html` support in `scripts/fetch_rules.mjs` for official sources that require browser rendering before the body text exists in the HTML artifact.
- Added optional rendered-page click selectors so official accordion content can be expanded before the raw rendered artifact is saved.
- Roblox Community Standards now uses the official `about.roblox.com` page, expands the official accordion sections, and extracts the detailed policy body.
- Meta Community Standards now collects the 27 official Transparency Center Community Standards category pages discovered from Meta's official policy index, removes repeated site navigation, and stores rendered source artifacts.
- TikTok Community Guidelines now collects the official 2025 H2 rendered guideline pages, trims page footer/navigation content, and stores rendered source artifacts.
- X now extracts the official rendered `The X Rules` article body from `help.x.com`. A later linked-source pass retained official artifacts for accessible linked detailed X policy pages; some linked pages still returned challenge pages or render errors, and those failures are recorded in the X verification manifest.
- Utah, Mississippi, and Ohio state entries were converted from stubs to extracted official-source text. Utah and Mississippi require insecure-TLS curl fallback for their official source sites; Mississippi also requires Windows-1252 decoding.
- Texas was changed to the preferred codified Texas Constitution and Statutes Chapter 509 PDF source. On 2026-05-24, the official Texas statutes and legislature sites returned HTTP 503 maintenance responses with `Retry-After: Tue, 26 May 2026 12:00:00 GMT`, so Texas remains a source stub.

Verification status after this pass: 49 registry entries are indexed; 48 entries have extracted source text and 1 entry remains a source stub (`us-state-texas-scope-act`).

## 2026-05-24 Additional Gap Fill Pass

Extraction updates:

- Added the official Douyin user service agreement as a separate Douyin source. Section 4 of that agreement contains information-content publishing rules, including prohibited unlawful content, harmful content, dangerous content, AI/deep-synthesis labeling obligations, spam, infringement, and minor-safety provisions.
- Expanded YouTube from four official Help pages to 22 official YouTube Help Community Guidelines and detailed policy pages linked from the official Community Guidelines index, including spam/scams, impersonation, external links, fake engagement, nudity and sexual content, child safety, self-harm, harmful or dangerous content, violent or graphic content, violent criminal organizations, hate speech, harassment, regulated goods, firearms, and misinformation pages.
- Added a Google Help article-body extractor so YouTube Markdown is generated from the official `<article>` body instead of full-page navigation chrome.
- Updated the general HTML extraction path to preserve official inline links. Regenerated the Bilibili community convention so previously plain `点击打开链接` references now point back to the official linked sources carried in the downloaded Bilibili bundle.
- Added `prefer_curl` support for sources where Node `fetch` fails but official HTML is available through curl; YouTube now uses that path for reproducible retrieval of the 22 official Help pages.
- Rechecked Texas official statutes, bill text, and bill lookup paths, including the dynamic statutes query URL. They still returned HTTP 503 maintenance responses with `Retry-After: Tue, 26 May 2026 12:00:00 GMT`, so Texas remains the only source stub.

Verification status after this pass: 50 registry entries are indexed; 49 entries have extracted source text and 1 entry remains a source stub (`us-state-texas-scope-act`).

## 2026-05-24 Federal Provider Reporting Gap Fill

Federal extraction updates:

- Added official U.S. Code sources for 18 U.S.C. § 2258A, § 2258B, and § 2258C. These cover provider reporting requirements for apparent child sexual exploitation or child pornography violations, reporting-related limited liability, and use of CyberTipline report technical elements.
- The official Texas statutes, Texas bill text, Texas bill lookup, `www.legis.state.tx.us`, and Texas Legislature FTP/mirror paths were rechecked. They still returned HTTP 503 maintenance responses, SSL failures, or FTP timeouts on 2026-05-24, so the Texas codified entry remains the only source stub.

Verification status after this pass: 53 registry entries are indexed; 52 entries have extracted source text and 1 entry remains a source stub (`us-state-texas-scope-act`).

## 2026-05-24 Federal COPPA and FOSTA/SESTA Gap Fill

Federal extraction updates:

- Added the official U.S. Code source for 18 U.S.C. § 2421A, the promotion-or-facilitation provision referenced by the 47 U.S.C. § 230 federal and state criminal-law exceptions.
- Added the official U.S. Code statutory COPPA sections, 15 U.S.C. §§ 6501-6506, to complement the already collected 16 CFR Part 312 COPPA Rule source. These sections cover definitions, unfair/deceptive practice regulation, safe harbors, State actions, administration/applicability, and review.

Verification status after this pass: 60 registry entries are indexed; 59 entries have extracted source text and 1 entry remains a source stub (`us-state-texas-scope-act`).

## 2026-05-24 Federal Child Safety and Obscenity Gap Fill

Federal extraction updates:

- Added official U.S. Code sources for 47 U.S.C. §§ 223 and 231, covering obscene or harassing communications and restrictions on minors' access to harmful World Wide Web material.
- Added official U.S. Code sources for 18 U.S.C. §§ 2251A, 2252B, 2258D, 1466A, 1470, and 2422, covering selling or buying of children, misleading Internet domain names, NCMEC limited liability and access minimization, obscene visual representations of child sexual abuse, transfer of obscene material to minors, and coercion/enticement.
- Reviewed the current `scripts/fetch_rules.mjs` after the recent script changes. The working tree has no uncommitted diff for that file, `node --check scripts/fetch_rules.mjs` passes, and a selective official-source fetch completed successfully.
- Corrected the `18 U.S.C. § 2258D` registry validation phrases to match the official current U.S. Code wording. The entry now extracts successfully from the official source instead of remaining a source stub.

Verification status after this pass: 68 registry entries are indexed; 67 entries have extracted source text and 1 entry remains a source stub (`us-state-texas-scope-act`).

## 2026-05-24 Federal Threats, Hate Crimes, Hoaxes, and Spam Gap Fill

Federal extraction updates:

- Added official U.S. Code sources for 18 U.S.C. §§ 871, 876, 877, and 879, covering threats against the President or successors, mailed threatening communications, foreign-country mailed threats, and threats against former Presidents and other protected persons.
- Added official U.S. Code sources for 18 U.S.C. §§ 247 and 249, covering damage to religious property, obstruction of free exercise of religious beliefs, and federal hate-crime acts.
- Added official U.S. Code sources for 18 U.S.C. §§ 1037 and 1038, covering electronic-mail fraud/spam conduct and false information or hoaxes involving specified dangerous conduct.
- Added official U.S. Code sources for 18 U.S.C. §§ 119 and 2101, covering publication of restricted personal information about covered officials and riots involving facilities of interstate or foreign commerce.
- 18 U.S.C. § 877 initially hit a transient U.S. Code TLS/download failure and correctly generated a source stub; a targeted retry downloaded the official source and converted it to an extracted file.

Verification status after this pass: 78 registry entries are indexed; 77 entries have extracted source text and 1 entry remains a source stub (`us-state-texas-scope-act`).

## 2026-05-24 Federal Fraud, Identity, Cyber Abuse, and Regulated Goods Gap Fill

Federal extraction updates:

- Added official U.S. Code sources for 18 U.S.C. §§ 1028, 1028A, 1029, and 1030, covering identity-document and authentication-feature fraud, aggravated identity theft, access-device fraud, and computer fraud/abuse.
- Added official U.S. Code sources for 18 U.S.C. §§ 1341, 1343, 1344, and 1349, covering mail fraud, wire fraud, bank fraud, and attempt/conspiracy for fraud offenses.
- Added official U.S. Code source for 18 U.S.C. § 922, covering federal firearms unlawful acts relevant to regulated-goods content and transaction policies.
- Added official U.S. Code sources for 21 U.S.C. §§ 841, 843, and 863, covering controlled-substances prohibited acts, use of communication facilities, and drug paraphernalia.
- All 12 new sources were downloaded from official U.S. Code pages, retained as raw HTML artifacts, extracted to Markdown, and verified with body hashes.

Verification status after this pass: 90 registry entries are indexed; 89 entries have extracted source text and 1 entry remains a source stub (`us-state-texas-scope-act`).

## 2026-05-24 Federal Weapons, Explosives, Illicit Finance, IP, and Privacy Gap Fill

Federal extraction updates:

- Added official U.S. Code sources for 18 U.S.C. §§ 842, 844, 930, and 931, covering explosives unlawful acts and penalties, firearms or dangerous weapons in Federal facilities, and body-armor restrictions.
- Added official U.S. Code sources for 18 U.S.C. §§ 1952, 1956, and 1960, covering racketeering-facilitation travel/facilities, money laundering, and unlicensed money-transmitting businesses.
- Added official U.S. Code sources for 17 U.S.C. § 506 and 18 U.S.C. §§ 2318, 2319, and 2320, covering criminal copyright offenses, criminal copyright infringement penalties, counterfeit labels/documentation, and counterfeit goods or services.
- Added official U.S. Code sources for 18 U.S.C. §§ 2511, 2701, and 2702, covering interception/disclosure of communications, unlawful access to stored communications, and provider voluntary disclosure rules.
- 18 U.S.C. § 931 initially generated a source stub because the registry phrase used a nonmatching paraphrase; the phrase was corrected to the official wording (`crime of violence`) and the entry now extracts successfully.

Verification status after this pass: 104 registry entries are indexed; 103 entries have extracted source text and 1 entry remains a source stub (`us-state-texas-scope-act`).

## 2026-05-24 Federal CAN-SPAM Gap Fill

Federal extraction updates:

- Added official U.S. Code sources for 15 U.S.C. §§ 7701-7713, the CAN-SPAM statutory framework for commercial electronic mail.
- The new sources cover congressional findings and policy, definitions, predatory and abusive commercial e-mail, user protections for commercial electronic mail, knowingly promoted businesses, enforcement, effect on other laws, the Do-Not-E-Mail registry, studies, enforcement rewards and labeling, regulations, wireless application, and separability.
- These entries complement the already collected 18 U.S.C. § 1037 electronic-mail fraud source and fill a spam/scams policy gap with the civil and regulatory CAN-SPAM provisions.
- All 13 new sections were downloaded from official U.S. Code pages, retained as raw HTML artifacts, extracted to Markdown, and verified with body hashes.

Verification status after this pass: 117 registry entries are indexed; 116 entries have extracted source text and 1 entry remains a source stub (`us-state-texas-scope-act`).

## 2026-05-24 Federal FTC Act and GLBA Pretexting Gap Fill

Federal extraction updates:

- Added official U.S. Code sources for 15 U.S.C. §§ 45, 52, 53, 57a, and 57b, covering unfair or deceptive acts or practices, false advertisements, FTC injunctions, unfair/deceptive-practices rulemaking, and related civil actions.
- Added official U.S. Code sources for 15 U.S.C. §§ 6821-6827, the GLBA customer-information pretexting framework, covering privacy protection for financial-institution customer information, administrative enforcement, criminal penalties, State-law interaction, agency guidance, reports, and definitions.
- These entries fill additional scams, deceptive-conduct, phishing, financial-information privacy, and personal-data abuse gaps.
- All 12 new sections were downloaded from official U.S. Code pages, retained as raw HTML artifacts, extracted to Markdown, and verified with body hashes.

Verification status after this pass: 129 registry entries are indexed; 128 entries have extracted source text and 1 entry remains a source stub (`us-state-texas-scope-act`).

## 2026-05-24 Federal Civil-Rights, Intimidation, and Civic Integrity Gap Fill

Federal extraction updates:

- Added official U.S. Code sources for 18 U.S.C. §§ 241, 242, 245, and 248, covering conspiracy against rights, deprivation of rights under color of law, federally protected activities, and freedom of access to clinic entrances.
- Added official U.S. Code sources for 18 U.S.C. §§ 594, 1512, and 1513, covering voter intimidation, tampering with a witness/victim/informant, and retaliation against a witness/victim/informant.
- Added official U.S. Code sources for 42 U.S.C. § 3631 and 52 U.S.C. §§ 10101 and 10307, covering fair-housing intimidation/interference, voting rights, and Voting Rights Act prohibited acts.
- These entries fill additional hate/harassment, rights-interference, civic-integrity, intimidation, and retaliation gaps.

Verification status after this pass: 139 registry entries are indexed; 138 entries have extracted source text and 1 entry remains a source stub (`us-state-texas-scope-act`).

## 2026-05-24 Global Platform GitHub and Steam Gap Fill

Platform extraction updates:

- Added GitHub official acceptable-use sources from GitHub Docs, including the main Acceptable Use Policies page and detailed policy pages for malware/exploits, bullying and harassment, doxxing/privacy invasion, hate speech, impersonation, misinformation, sexually obscene content, violent threats, terrorism and violent extremism, child sexual exploitation or abuse, non-consensual intimate imagery, and synthetic media/AI tools.
- Added Steam official rules and guidelines for discussions, reviews, and user-generated content from the Steam Support FAQ page. The source text is extracted from the official FAQ data payload stored in the downloaded HTML artifact.
- Added dedicated extractors for GitHub Docs article bodies and Steam FAQ payloads so navigation, shell markup, and script data are not treated as rule text.
- No additional U.S. federal legal provisions were added in this pass.

Verification status after this pass: 141 registry entries are indexed; 140 entries have extracted source text and 1 entry remains a source stub (`us-state-texas-scope-act`).

## 2026-05-24 Global Platform GitLab, Bluesky, and Tumblr Gap Fill

Platform extraction updates:

- Added GitLab's official Acceptable Use Policy from the GitLab Handbook, covering unacceptable service use, illegal or malicious activity, privacy misuse, harassment/defamation, spam/phishing, service disruption, and AI-powered service restrictions.
- Added Bluesky's official Community Guidelines from the Bluesky support site, covering public safety, threats and violence, child safety, adult content consent boundaries, self-harm and dangerous behavior, privacy, anti-discrimination, anti-harassment, authenticity, information integrity, regulated goods, intellectual property, site security, and ban evasion.
- Added Tumblr's official User Guidelines from tumblr.com, covering terrorism, hate speech, harm to minors, self-harm promotion, sexually explicit material, violent threats/gore, spam, automation, IP infringement, impersonation, harassment, privacy violations, unlawful uses, regulated goods, and election interference.
- Medium Rules were checked as a candidate, but the official help.medium.com page returned a Cloudflare challenge to automated download on 2026-05-24. It was not added because complete official extraction was not confirmed.
- No additional U.S. federal legal provisions were added in this pass.

Verification status after this pass: 144 registry entries are indexed; 143 entries have extracted source text and 1 entry remains a source stub (`us-state-texas-scope-act`).

## 2026-05-24 Rule Detail Link Localization Pass

Link and verification updates:

- Added URL alias handling for downloaded rule source links, including X policy links across `help.x.com` and legacy `help.twitter.com` forms, YouTube Help article IDs with and without query strings, and HTTP/HTTPS variants for already downloaded sources.
- Added `scripts/localize_rule_links.mjs` to scan all collected Markdown source-text sections and replace links to already downloaded official source artifacts with local relative links while preserving other online links.
- Updated `scripts/fetch_rules.mjs` so downloaded Cloudflare/security challenge pages are rejected instead of being recorded as valid source artifacts; stale generated source artifacts for a refreshed entry are removed from the manifest directory when no longer referenced.
- Updated `scripts/verify_rules.mjs` so verification fails if an HTML/XML source artifact is a challenge page or if a body link still points online to a source URL that has already been downloaded locally.
- Regenerated X and YouTube platform outputs so already collected detailed policy links resolve locally. For X, all 18 linked detailed policy pages from the official `The X Rules` page were confirmed and saved as local artifacts, including Adult Content, Illegal or Certain Regulated Goods or Services, Child Safety, and Private Information. The fetcher can reuse an existing non-challenge official artifact when the current browser-rendered request is temporarily blocked by a challenge page.
- Localized cross-rule links from Bilibili/Douyin bodies to already downloaded local official source artifacts where the linked source had already been collected.
- No additional U.S. federal legal provisions were added in this pass.

Verification status after this pass: `node scripts/verify_rules.mjs` verified 144 entries, with 143 extracted files and 1 source stub (`us-state-texas-scope-act`).
