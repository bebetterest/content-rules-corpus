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
