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
