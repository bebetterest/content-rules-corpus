# United States Rules

This directory collects U.S. content-safety-related legal and regulatory sources.

## Layout

- `federal/`: federal statutes, regulations, public laws, and related official federal sources.
- `states/`: state-level sources. Each state file must clearly state that it applies only within the scope of that state's law and is not nationwide federal law.

## Handling Rules

- Source text must be generated from official or trustworthy primary sources through `scripts/fetch_rules.mjs`.
- State-law files must include `Scope Note:` before any source text.
- If current validity, litigation status, injunction status, codification, or extraction completeness is uncertain, the uncertainty must be stated at the beginning of the file.
- If full official text cannot be confirmed, keep the generated file as a source stub.

Chinese version: [README_cn.md](/Users/hobeter/Desktop/code/rules/all_rules/united-states/README_cn.md)
