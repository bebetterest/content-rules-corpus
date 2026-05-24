import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const ROOT = new URL("..", import.meta.url).pathname;
const ALL_RULES_DIR = path.join(ROOT, "all_rules");
const INDEX_GENERATOR = "scripts/generate_rule_indexes.mjs";
const NON_RULE_MARKDOWN = new Set([
  "README.md",
  "README_cn.md",
  "risk-index.md",
  "risk-index_cn.md",
]);

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function repoRelative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

async function rgFiles(pattern) {
  const { stdout } = await execFile("rg", ["--files", "-g", pattern], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return stdout.split("\n").filter(Boolean);
}

function extractSourceText(markdown) {
  const marker = "## Source Text\n\n";
  const start = markdown.indexOf(marker);
  if (start === -1) {
    return null;
  }
  return markdown.slice(start + marker.length).replace(/\n+$/, "");
}

function extractLegacyChineseSourceText(markdown) {
  const marker = "## 正文\n\n";
  const start = markdown.indexOf(marker);
  if (start === -1) {
    return null;
  }
  return markdown.slice(start + marker.length).replace(/\n+$/, "");
}

async function verifySourceArtifactHash(sourceFile, expectedHash, expectedBytes, label, failures) {
  let sourceBytes;
  try {
    sourceBytes = await readFile(path.join(ROOT, sourceFile));
  } catch (error) {
    failures.push(`${label}: missing source artifact ${sourceFile}: ${error.message}`);
    return;
  }

  const actualHash = sha256Bytes(sourceBytes);
  if (actualHash !== expectedHash) {
    failures.push(`${label}: source artifact SHA-256 mismatch for ${sourceFile}`);
  }
  if (Number.isInteger(expectedBytes) && sourceBytes.length !== expectedBytes) {
    failures.push(`${label}: source artifact byte count mismatch for ${sourceFile}`);
  }
}

async function verifySourceArtifacts(entry, failures) {
  if (typeof entry.source_sha256 === "string") {
    if (!entry.source_file) {
      failures.push(`${entry.id}: source_sha256 present but source_file missing`);
      return;
    }
    await verifySourceArtifactHash(
      entry.source_file,
      entry.source_sha256,
      null,
      entry.id,
      failures
    );
    return;
  }

  if (!Array.isArray(entry.source_sha256)) {
    failures.push(`${entry.id}: missing source_sha256 metadata`);
    return;
  }

  const manifestSourceFiles = new Set(entry.source_files || []);
  const hashedSourceFiles = new Set();

  for (const source of entry.source_sha256) {
    if (!source || !source.source_file || !source.sha256) {
      failures.push(`${entry.id}: invalid source_sha256 entry`);
      continue;
    }
    hashedSourceFiles.add(source.source_file);
    await verifySourceArtifactHash(
      source.source_file,
      source.sha256,
      source.bytes,
      entry.id,
      failures
    );
  }

  for (const sourceFile of manifestSourceFiles) {
    if (!hashedSourceFiles.has(sourceFile)) {
      failures.push(`${entry.id}: source file missing SHA-256 metadata ${sourceFile}`);
    }
  }
  for (const sourceFile of hashedSourceFiles) {
    if (!manifestSourceFiles.has(sourceFile)) {
      failures.push(`${entry.id}: hashed source file missing from source_files ${sourceFile}`);
    }
  }
}

async function listRuleDirectories(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const directories = [directoryPath];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "sources") {
      continue;
    }
    directories.push(...(await listRuleDirectories(path.join(directoryPath, entry.name))));
  }

  return directories;
}

async function verifyRuleIndexes(failures) {
  const directories = await listRuleDirectories(ALL_RULES_DIR);
  let indexCount = 0;
  let indexedRules = 0;

  for (const directoryPath of directories) {
    const indexPath = path.join(directoryPath, "index.json");
    const relativeIndexPath = repoRelative(indexPath);
    let index;

    try {
      index = JSON.parse(await readFile(indexPath, "utf8"));
    } catch (error) {
      failures.push(`${relativeIndexPath}: missing or invalid directory index: ${error.message}`);
      continue;
    }

    indexCount += 1;

    if (index.schema_version !== 1) {
      failures.push(`${relativeIndexPath}: expected schema_version 1`);
    }
    if (index.directory !== repoRelative(directoryPath)) {
      failures.push(`${relativeIndexPath}: directory field does not match file location`);
    }
    if (index.generated_by !== INDEX_GENERATOR) {
      failures.push(`${relativeIndexPath}: generated_by must be ${INDEX_GENERATOR}`);
    }
    const rules = Array.isArray(index.rules) ? index.rules : [];
    const children = Array.isArray(index.children) ? index.children : [];

    if (!Array.isArray(index.rules)) {
      failures.push(`${relativeIndexPath}: rules must be an array`);
    }
    if (!Array.isArray(index.children)) {
      failures.push(`${relativeIndexPath}: children must be an array`);
    }

    const entries = await readdir(directoryPath, { withFileTypes: true });
    const directChildDirectories = new Set(
      entries
        .filter((entry) => entry.isDirectory() && entry.name !== "sources")
        .map((entry) => entry.name)
    );
    const directRuleFiles = new Set(
      entries
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name.endsWith(".md") &&
            !NON_RULE_MARKDOWN.has(entry.name)
        )
        .map((entry) => entry.name)
    );
    const listedRuleFiles = new Set();

    if (index.rule_count !== directRuleFiles.size) {
      failures.push(
        `${relativeIndexPath}: rule_count ${index.rule_count} does not match ${directRuleFiles.size} direct rule files`
      );
    }

    for (const rule of rules) {
      if (!rule || typeof rule.file !== "string") {
        failures.push(`${relativeIndexPath}: rule entry missing file`);
        continue;
      }
      if (listedRuleFiles.has(rule.file)) {
        failures.push(`${relativeIndexPath}: duplicate indexed rule file ${rule.file}`);
      }
      indexedRules += 1;
      listedRuleFiles.add(rule.file);

      if (rule.file.includes("/") || rule.file.includes("\\")) {
        failures.push(`${relativeIndexPath}: rule file must be direct child: ${rule.file}`);
      }
      if (!directRuleFiles.has(rule.file)) {
        failures.push(`${relativeIndexPath}: indexed rule file does not exist: ${rule.file}`);
      }
      if (rule.path !== repoRelative(path.join(directoryPath, rule.file))) {
        failures.push(`${relativeIndexPath}: indexed rule path is incorrect for ${rule.file}`);
      }
      if (!rule.title) {
        failures.push(`${relativeIndexPath}: indexed rule missing title for ${rule.file}`);
      }
    }

    for (const ruleFile of directRuleFiles) {
      if (!listedRuleFiles.has(ruleFile)) {
        failures.push(`${relativeIndexPath}: missing indexed rule file ${ruleFile}`);
      }
    }

    const listedChildNames = new Set();
    let descendantRuleCount = rules.length;

    for (const child of children) {
      if (!child || typeof child.name !== "string" || typeof child.index !== "string") {
        failures.push(`${relativeIndexPath}: child entry missing name or index path`);
        continue;
      }
      if (listedChildNames.has(child.name)) {
        failures.push(`${relativeIndexPath}: duplicate child entry ${child.name}`);
      }
      listedChildNames.add(child.name);

      const childPath = path.join(directoryPath, child.name);
      if (!directChildDirectories.has(child.name)) {
        failures.push(`${relativeIndexPath}: child directory does not exist: ${child.name}`);
      }
      if (child.path !== repoRelative(childPath)) {
        failures.push(`${relativeIndexPath}: child path is incorrect for ${child.name}`);
      }
      if (child.index !== repoRelative(path.join(childPath, "index.json"))) {
        failures.push(`${relativeIndexPath}: child index path is incorrect for ${child.name}`);
      }

      let childIndex;
      try {
        childIndex = JSON.parse(await readFile(path.join(ROOT, child.index), "utf8"));
      } catch (error) {
        failures.push(`${relativeIndexPath}: child index not readable ${child.index}`);
      }

      if (childIndex) {
        if (child.rule_count !== childIndex.rule_count) {
          failures.push(`${relativeIndexPath}: child rule_count is stale for ${child.name}`);
        }
        if (child.descendant_rule_count !== childIndex.descendant_rule_count) {
          failures.push(
            `${relativeIndexPath}: child descendant_rule_count is stale for ${child.name}`
          );
        }
        descendantRuleCount += childIndex.descendant_rule_count;
      }
    }

    for (const childName of directChildDirectories) {
      if (!listedChildNames.has(childName)) {
        failures.push(`${relativeIndexPath}: missing child directory index entry ${childName}`);
      }
    }

    if (index.descendant_rule_count !== descendantRuleCount) {
      failures.push(
        `${relativeIndexPath}: descendant_rule_count ${index.descendant_rule_count} does not match ${descendantRuleCount}`
      );
    }
  }

  return { indexCount, indexedRules };
}

async function main() {
  const manifestFiles = (await rgFiles("verification-manifest.json")).filter((file) =>
    file.startsWith("all_rules/")
  );
  const failures = [];
  let checked = 0;
  let extracted = 0;
  let stubs = 0;

  for (const manifestFile of manifestFiles) {
    const entries = JSON.parse(await readFile(path.join(ROOT, manifestFile), "utf8"));
    for (const entry of entries) {
      checked += 1;
      await verifySourceArtifacts(entry, failures);

      const outputPath = path.join(ROOT, entry.output_file);
      let markdown;
      try {
        markdown = await readFile(outputPath, "utf8");
      } catch (error) {
        failures.push(`${entry.id}: missing output file ${entry.output_file}: ${error.message}`);
        continue;
      }

      for (const sourceUrl of entry.source_urls || [entry.source_url].filter(Boolean)) {
        if (!markdown.includes(sourceUrl)) {
          failures.push(`${entry.id}: output missing source URL ${sourceUrl}`);
        }
      }

      if (entry.output_file.includes("/united-states/states/") && !markdown.includes("Scope Note:")) {
        failures.push(`${entry.id}: state-law output missing Scope Note`);
      }

      if (!entry.extraction_status && entry.body_sha256) {
        extracted += 1;
        const body = extractLegacyChineseSourceText(markdown);
        if (body === null) {
          failures.push(`${entry.id}: legacy entry missing 正文 section`);
        } else if (sha256(body) !== entry.body_sha256) {
          failures.push(`${entry.id}: legacy body SHA-256 mismatch`);
        }
      } else if (entry.extraction_status === "extracted") {
        extracted += 1;
        const body = extractSourceText(markdown);
        if (body === null) {
          failures.push(`${entry.id}: extracted entry missing Source Text section`);
        } else if (sha256(body) !== entry.body_sha256) {
          failures.push(`${entry.id}: body SHA-256 mismatch`);
        }
      } else if (entry.extraction_status === "stub") {
        stubs += 1;
        if (!markdown.includes("Opening Note: This file is a source stub only.")) {
          failures.push(`${entry.id}: stub output missing opening uncertainty note`);
        }
      } else {
        failures.push(`${entry.id}: unknown extraction status ${entry.extraction_status}`);
      }
    }
  }

  const indexStats = await verifyRuleIndexes(failures);

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }

  console.log(
    `Verified ${checked} entries (${extracted} extracted, ${stubs} stubs) and ${indexStats.indexCount} directory indexes (${indexStats.indexedRules} indexed rule files).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
