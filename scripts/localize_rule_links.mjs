import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const ROOT = new URL("..", import.meta.url).pathname;

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function decodeEntities(text) {
  return String(text)
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number.parseInt(value, 10)));
}

function repoRelative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function outputRelative(fromFilePath, toFilePath) {
  return path.relative(path.dirname(fromFilePath), toFilePath).split(path.sep).join("/");
}

function markdownLinkTarget(url) {
  return String(url).replace(/\)/g, "%29");
}

function isHashRoutedSourceUrl(parsed) {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  return (
    (host === "bilibili.com" && parsed.pathname === "/blackboard/help.html") ||
    (host === "link.bilibili.com" && parsed.pathname === "/p/eden/news")
  );
}

function sourceKey(url) {
  try {
    const parsed = new URL(decodeEntities(url));
    parsed.hostname = parsed.hostname.toLowerCase();
    if (!isHashRoutedSourceUrl(parsed)) {
      parsed.hash = "";
    }
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.startsWith("utm_")) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.toString();
  } catch {
    return decodeEntities(url).replace(/#.*$/, "");
  }
}

function schemeAgnosticSourceKey(parsed) {
  const hash = isHashRoutedSourceUrl(parsed) ? parsed.hash : "";
  return `scheme:${parsed.hostname.toLowerCase()}${parsed.pathname}${parsed.search}${hash}`;
}

function xPolicySlug(url) {
  try {
    const parsed = new URL(decodeEntities(url));
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!["help.x.com", "help.twitter.com"].includes(host)) {
      return null;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    const policyIndex = parts.indexOf("rules-and-policies");
    if (policyIndex === -1 || policyIndex + 1 >= parts.length) {
      return null;
    }
    return parts[policyIndex + 1].replace(/\.html$/i, "");
  } catch {
    return null;
  }
}

function canonicalXPolicyUrl(slug) {
  return `https://help.x.com/en/rules-and-policies/${slug}.html`;
}

function youtubeAnswerId(url) {
  try {
    const parsed = new URL(decodeEntities(url));
    if (parsed.hostname.toLowerCase().replace(/^www\./, "") !== "support.google.com") {
      return null;
    }
    return parsed.pathname.match(/^\/youtube\/answer\/(\d+)/)?.[1] || null;
  } catch {
    return null;
  }
}

function sourceKeyAliases(url) {
  const aliases = new Set([sourceKey(url)]);
  try {
    const parsed = new URL(decodeEntities(url));
    parsed.hostname = parsed.hostname.toLowerCase();
    if (!isHashRoutedSourceUrl(parsed)) {
      parsed.hash = "";
    }
    aliases.add(schemeAgnosticSourceKey(parsed));

    const noSearch = new URL(parsed);
    noSearch.search = "";
    aliases.add(noSearch.toString());
    aliases.add(schemeAgnosticSourceKey(noSearch));
  } catch {
    return [...aliases];
  }

  const slug = xPolicySlug(url);
  if (slug) {
    aliases.add(`x-policy:${slug}`);
    aliases.add(sourceKey(canonicalXPolicyUrl(slug)));
  }

  const answerId = youtubeAnswerId(url);
  if (answerId) {
    aliases.add(`youtube-answer:${answerId}`);
  }

  return [...aliases];
}

async function rgFiles(pattern, directory = "all_rules") {
  const { stdout } = await execFile("rg", ["--files", directory, "-g", pattern], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return stdout.split("\n").filter(Boolean);
}

function addSourceTarget(sourceTargets, url, sourceFile) {
  if (!url || !sourceFile) {
    return;
  }
  for (const key of sourceKeyAliases(url)) {
    if (!sourceTargets.has(key)) {
      sourceTargets.set(key, sourceFile);
    }
  }
}

function primaryTargetForEntry(entry, sourceFiles) {
  const sourceUrls = entry.source_urls || [entry.source_url].filter(Boolean);
  if (sourceUrls.length === 1 && entry.output_file) {
    return [entry.output_file];
  }
  return sourceFiles;
}

function orderedSourceFiles(entry) {
  if (Array.isArray(entry.source_sha256)) {
    return entry.source_sha256
      .map((source) => source?.source_file)
      .filter(Boolean);
  }
  return [entry.source_file].filter(Boolean);
}

async function loadManifests() {
  const manifestFiles = await rgFiles("verification-manifest.json");
  const manifests = [];
  const sourceTargets = new Map();

  for (const manifestFile of manifestFiles) {
    const entries = JSON.parse(await readFile(path.join(ROOT, manifestFile), "utf8"));
    manifests.push({ manifestFile, entries });

    for (const entry of entries) {
      const sourceUrls = entry.source_urls || [entry.source_url].filter(Boolean);
      const files = orderedSourceFiles(entry);
      const primaryTargets = primaryTargetForEntry(entry, files);
      for (const [index, sourceUrl] of sourceUrls.entries()) {
        addSourceTarget(sourceTargets, sourceUrl, primaryTargets[index] || files[index]);
      }
      for (const [index, linkedSourceUrl] of (entry.linked_source_urls || []).entries()) {
        addSourceTarget(sourceTargets, linkedSourceUrl, entry.linked_source_files?.[index]);
      }
    }
  }

  return { manifests, sourceTargets };
}

function splitSourceSection(markdown) {
  for (const marker of ["## Source Text\n\n", "## 正文\n\n"]) {
    const start = markdown.indexOf(marker);
    if (start !== -1) {
      const bodyStart = start + marker.length;
      return {
        marker,
        prefix: markdown.slice(0, bodyStart),
        body: markdown.slice(bodyStart).replace(/\n+$/, ""),
        trailing: markdown.match(/\n+$/)?.[0] || "",
      };
    }
  }
  return null;
}

function sourceTargetForUrl(sourceTargets, url) {
  for (const key of sourceKeyAliases(url)) {
    const sourceFile = sourceTargets.get(key);
    if (sourceFile) {
      return sourceFile;
    }
  }
  return null;
}

function localizeBodyLinks(body, outputFile, sourceTargets) {
  const outputPath = path.join(ROOT, outputFile);
  return body.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (full, label, url) => {
    const sourceFile = sourceTargetForUrl(sourceTargets, url);
    if (!sourceFile) {
      return full;
    }
    const localTarget = outputRelative(outputPath, path.join(ROOT, sourceFile));
    return `[${label}](${markdownLinkTarget(localTarget)})`;
  });
}

function replaceBodyHash(markdown, bodyHash) {
  return markdown
    .replace(/- Body SHA-256: [0-9a-f]+/i, `- Body SHA-256: ${bodyHash}`)
    .replace(/- 正文 SHA-256：([0-9a-f]+)/i, `- 正文 SHA-256：${bodyHash}`);
}

async function main() {
  const { manifests, sourceTargets } = await loadManifests();
  const manifestByOutput = new Map();
  for (const manifest of manifests) {
    for (const entry of manifest.entries) {
      if (entry.output_file) {
        manifestByOutput.set(entry.output_file, { manifest, entry });
      }
    }
  }

  const markdownFiles = await rgFiles("*.md");
  const changedOutputs = new Set();

  for (const markdownFile of markdownFiles) {
    if (markdownFile.includes("/sources/")) {
      continue;
    }
    const absolutePath = path.join(ROOT, markdownFile);
    const markdown = await readFile(absolutePath, "utf8");
    const section = splitSourceSection(markdown);
    if (!section) {
      continue;
    }
    const localizedBody = localizeBodyLinks(section.body, markdownFile, sourceTargets);
    if (localizedBody === section.body) {
      continue;
    }
    const bodyHash = sha256(localizedBody);
    const updatedMarkdown = replaceBodyHash(
      `${section.prefix}${localizedBody}${section.trailing || "\n"}`,
      bodyHash
    );
    await writeFile(absolutePath, updatedMarkdown, "utf8");
    changedOutputs.add(markdownFile);
  }

  const changedManifests = new Set();
  for (const outputFile of changedOutputs) {
    const record = manifestByOutput.get(outputFile);
    if (!record) {
      continue;
    }
    const markdown = await readFile(path.join(ROOT, outputFile), "utf8");
    const section = splitSourceSection(markdown);
    if (!section) {
      continue;
    }
    record.entry.body_sha256 = sha256(section.body);
    changedManifests.add(record.manifest);
  }

  for (const manifest of changedManifests) {
    await writeFile(
      path.join(ROOT, manifest.manifestFile),
      `${JSON.stringify(manifest.entries, null, 2)}\n`,
      "utf8"
    );
  }

  console.log(
    `Localized links in ${changedOutputs.size} Markdown file(s) and updated ${changedManifests.size} manifest(s).`
  );
  for (const outputFile of [...changedOutputs].sort()) {
    console.log(`- ${repoRelative(path.join(ROOT, outputFile))}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
