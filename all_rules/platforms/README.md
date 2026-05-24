# Platform Rules

This directory collects official platform content policies, community rules, safety standards, and related enforcement policies.

## Layout

- `china/`: China platform rules and policy sources.
- `global/`: global platform rules and policy sources.
- Each platform directory contains generated Markdown, raw source artifacts under `sources/`, a `verification-manifest.json`, and risk-category indexes where registry categories are available.

## Handling Rules

- Platform policy body text must come from official or trustworthy primary platform sources through `scripts/fetch_rules.mjs`.
- If a platform page is client-rendered, blocks automated access, or cannot be confirmed as a complete official full-text extraction, keep the generated file as a source stub.
- Risk indexes are navigation aids only. The original official source file and source URL remain the authority.

Chinese version: [README_cn.md](/Users/hobeter/Desktop/code/rules/all_rules/platforms/README_cn.md)
