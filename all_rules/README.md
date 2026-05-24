# All Rules

This directory stores collected rule texts. Subdirectories should be organized by jurisdiction, standards body, platform, or another stable source boundary.

## Current Directories

- `china/`: laws, administrative regulations, departmental rules, and related official rule texts from China.
- `platforms/`: official platform content policies and community rules, grouped by platform and region.
- `united-states/`: U.S. federal and state content-safety-related legal and regulatory sources.

## Source Registry

- `source-registry.json` records source IDs, titles, jurisdictions, scope notes, authority labels, source URLs, fetch methods, output files, languages, status notes, and risk categories where applicable.
- `scripts/fetch_rules.mjs` reads the registry and writes Markdown outputs, raw source artifacts, and `sources/verification-manifest.json` files.
- Files that cannot be verified as complete official full-text extractions remain source stubs.

Each collected file should include source metadata before the original text.

Chinese version: [README_cn.md](/Users/hobeter/Desktop/code/rules/all_rules/README_cn.md)
