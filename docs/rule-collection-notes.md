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
