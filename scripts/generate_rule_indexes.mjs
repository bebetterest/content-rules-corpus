import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const ALL_RULES_DIR = path.join(ROOT, "all_rules");
const GENERATED_BY = "scripts/generate_rule_indexes.mjs";
const NON_RULE_MARKDOWN = new Set([
  "README.md",
  "README_cn.md",
  "risk-index.md",
  "risk-index_cn.md",
]);

const METADATA_KEYS = {
  Collection: "collection",
  Jurisdiction: "jurisdiction",
  "Scope Note": "scope_note",
  "Source Authority": "source_authority",
  "Source URL": "source_urls",
  "Reference URL": "reference_urls",
  "Retrieval Date": "retrieval_date",
  Language: "language",
  "Language Group": "language_group",
  "Fetch Method": "fetch_method",
  Extractor: "extractor",
  "Extraction Status": "extraction_status",
  "Status Note": "status_note",
  司法辖区: "jurisdiction",
  文件类型: "document_type",
  发布机关: "issuing_authority",
  公布日期: "publication_date",
  修订记录: "revision_history",
  现行文本来源: "source_authority",
  来源链接: "source_urls",
  抓取日期: "retrieval_date",
  语言组: "language_group",
  生成方式: "generation_method",
  说明: "status_note",
};

function repoRelative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function isSourcesDirectory(directoryPath) {
  return path.basename(directoryPath) === "sources";
}

function firstHeading(markdown, fallback) {
  const line = markdown
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith("# "));
  return line ? line.replace(/^#\s+/, "").trim() : fallback;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (Array.isArray(item)) {
        return item.length > 0;
      }
      return item !== null && item !== undefined && item !== "";
    })
  );
}

function parseMetadata(markdown) {
  const metadata = {};
  const lines = markdown.split(/\r?\n/);
  let sourceUrlBlock = false;
  let referenceUrlBlock = false;
  const sourceUrls = [];
  const referenceUrls = [];

  for (const line of lines) {
    if (sourceUrlBlock) {
      const sourceUrlMatch = line.match(/^- (https?:\/\/\S.*)$/);
      if (sourceUrlMatch) {
        sourceUrls.push(sourceUrlMatch[1].trim());
        continue;
      }
    }
    if (referenceUrlBlock) {
      const referenceUrlMatch = line.match(/^- (https?:\/\/\S.*)$/);
      if (referenceUrlMatch) {
        referenceUrls.push(referenceUrlMatch[1].trim());
        continue;
      }
    }

    const metadataMatch = line.match(/^- ([^:：]+)[:：]\s*(.*)$/);
    if (metadataMatch) {
      const [, rawKey, rawValue] = metadataMatch;
      const mappedKey = METADATA_KEYS[rawKey.trim()];
      const value = rawValue.trim();
      sourceUrlBlock = rawKey.trim() === "Source URL";
      referenceUrlBlock = rawKey.trim() === "Reference URL";

      if (mappedKey === "source_urls" && value) {
        sourceUrls.push(value);
      } else if (mappedKey === "reference_urls" && value) {
        referenceUrls.push(value);
      } else if (mappedKey && value) {
        metadata[mappedKey] = value;
      }
      continue;
    }

    if (sourceUrlBlock) {
      if (line.startsWith("- ") && !line.startsWith("- http")) {
        sourceUrlBlock = false;
      }
    }
    if (referenceUrlBlock) {
      if (line.startsWith("- ") && !line.startsWith("- http")) {
        referenceUrlBlock = false;
      }
    }
  }

  if (sourceUrls.length > 0) {
    metadata.source_urls = [...new Set(sourceUrls)];
  }
  if (referenceUrls.length > 0) {
    metadata.reference_urls = [...new Set(referenceUrls)];
  }

  return metadata;
}

async function listDirectoryEntries(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  return entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
}

async function buildRuleEntry(directoryPath, fileName) {
  const filePath = path.join(directoryPath, fileName);
  const markdown = await readFile(filePath, "utf8");
  const metadata = parseMetadata(markdown);

  return compactObject({
    title: firstHeading(markdown, fileName),
    file: fileName,
    path: repoRelative(filePath),
    ...metadata,
  });
}

async function buildIndex(directoryPath) {
  const entries = await listDirectoryEntries(directoryPath);
  const childDirectories = entries.filter(
    (entry) => entry.isDirectory() && !isSourcesDirectory(path.join(directoryPath, entry.name))
  );
  const childIndexes = [];

  for (const child of childDirectories) {
    const childPath = path.join(directoryPath, child.name);
    const childIndex = await buildIndex(childPath);
    childIndexes.push({
      name: child.name,
      path: repoRelative(childPath),
      index: repoRelative(path.join(childPath, "index.json")),
      rule_count: childIndex.rule_count,
      descendant_rule_count: childIndex.descendant_rule_count,
    });
  }

  const markdownFiles = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".md") &&
        !NON_RULE_MARKDOWN.has(entry.name)
    )
    .map((entry) => entry.name);
  const rules = [];

  for (const fileName of markdownFiles) {
    rules.push(await buildRuleEntry(directoryPath, fileName));
  }

  const descendantRuleCount =
    rules.length +
    childIndexes.reduce((total, child) => total + child.descendant_rule_count, 0);
  const index = {
    schema_version: 1,
    directory: repoRelative(directoryPath),
    generated_by: GENERATED_BY,
    rule_count: rules.length,
    descendant_rule_count: descendantRuleCount,
    rules,
    children: childIndexes,
  };

  await writeFile(path.join(directoryPath, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

async function main() {
  const index = await buildIndex(ALL_RULES_DIR);
  console.log(
    `Generated directory indexes under all_rules (${index.descendant_rule_count} rule files indexed).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
