# Rules

This repository collects rule, regulation, standard, and policy texts in a source-first structure for later analysis and comparison.

## Current Scope

- `all_rules/china/`: authoritative Chinese regulatory texts and source metadata.
- `all_rules/platforms/`: official platform content and community policy sources, grouped by platform.
- `all_rules/united-states/`: U.S. federal and state content-safety-related legal and regulatory sources.
- `all_rules/source-registry.json`: source registry used by the general fetch pipeline.

## Repository Layout

- `all_rules/`: collected rule texts, grouped by jurisdiction or rule family.
- `docs/`: project notes, collection decisions, and maintenance records.
- `scripts/`: reproducible download, extraction, and verification scripts.

## Fetching and Verification

- `node scripts/fetch_china_rules.mjs`: refresh the initial China regulatory seed set.
- `node scripts/fetch_rules.mjs --collection platforms`: refresh platform policy sources from `all_rules/source-registry.json`.
- `node scripts/fetch_rules.mjs --collection united-states`: refresh U.S. federal and state sources from `all_rules/source-registry.json`.
- `node scripts/localize_rule_links.mjs`: replace body links to already downloaded official source artifacts with local relative links while preserving other online links.
- `node scripts/generate_rule_indexes.mjs`: refresh per-directory `index.json` files under `all_rules/` for internal navigation.
- `node scripts/verify_rules.mjs`: verify source URLs, raw source artifact hashes, body hashes, legacy China hashes, required state-law scope notes, localized downloaded-source links, and directory indexes.

Some platform entries use `fetch_method: "rendered-html"` and require Python Playwright with a Chromium browser installed. Those entries still save the rendered official HTML artifact before Markdown extraction.

## Collection Principles

- Prefer authoritative source pages from government or standards bodies.
- Record the source URL, issuing authority, publication or revision dates, and retrieval date in each collected file.
- Do not manually type or rewrite official rule text. Download authoritative sources and generate collected Markdown through reproducible extraction code.
- Preserve official original text without translation unless an official translation exists or the user explicitly requests a separate non-authoritative translation.
- If source authority, current validity, completeness, or extraction accuracy is uncertain, state the uncertainty at the beginning of the collected file.
- If an official source cannot be downloaded or complete extraction cannot be confirmed, generate a source stub instead of reproducing body text.

Chinese version: [README_cn.md](/Users/hobeter/Desktop/code/rules/README_cn.md)
