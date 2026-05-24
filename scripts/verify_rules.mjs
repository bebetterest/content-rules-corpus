import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const ROOT = new URL("..", import.meta.url).pathname;

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
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

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }

  console.log(`Verified ${checked} entries (${extracted} extracted, ${stubs} stubs).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
