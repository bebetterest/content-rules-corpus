import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

const execFile = promisify(execFileCallback);

const ROOT = new URL("..", import.meta.url).pathname;
const REGISTRY_PATH = path.join(ROOT, "all_rules", "source-registry.json");
let RETRIEVED_DATE = process.env.RULES_RETRIEVED_DATE || null;

function todayInShanghai() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRY_COUNT = 2;
const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;

const RISK_CATEGORY_LABELS = {
  illegal_activity: {
    en: "Illegal activity",
    cn: "违法活动",
  },
  child_safety: {
    en: "Child safety and exploitation",
    cn: "未成年人安全与剥削",
  },
  sexual_content: {
    en: "Sexual content and nudity",
    cn: "色情、性内容与裸露",
  },
  violence_threats: {
    en: "Violence, threats, and dangerous acts",
    cn: "暴力、威胁与危险行为",
  },
  hate_harassment: {
    en: "Hate, harassment, and abuse",
    cn: "仇恨、骚扰与攻击",
  },
  regulated_goods: {
    en: "Regulated or prohibited goods and services",
    cn: "受管制或禁止的商品与服务",
  },
  fraud_scams: {
    en: "Fraud, scams, and deceptive conduct",
    cn: "欺诈、诈骗与误导行为",
  },
  privacy_doxxing: {
    en: "Privacy, doxxing, and personal data abuse",
    cn: "隐私、开盒与个人信息滥用",
  },
  misinformation: {
    en: "Misinformation and manipulated media",
    cn: "不实信息与操纵媒体",
  },
  self_harm: {
    en: "Self-harm, suicide, and eating disorders",
    cn: "自伤、自杀与进食障碍",
  },
  platform_integrity: {
    en: "Platform integrity, spam, and manipulation",
    cn: "平台秩序、垃圾信息与操纵",
  },
  intellectual_property: {
    en: "Intellectual property",
    cn: "知识产权",
  },
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function repoRelative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function parseArgs(argv) {
  const args = {
    ids: new Set(),
    collections: new Set(),
    includeDisabled: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--id") {
      args.ids.add(argv[++index]);
    } else if (arg === "--collection") {
      args.collections.add(argv[++index]);
    } else if (arg === "--include-disabled") {
      args.includeDisabled = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/fetch_rules.mjs [--id RULE_ID] [--collection NAME] [--include-disabled]

Downloads official rule sources from all_rules/source-registry.json, stores raw artifacts,
extracts verified source text when possible, and writes Markdown plus verification manifests.`);
}

function shouldRun(entry, args) {
  if (entry.enabled === false && !args.includeDisabled) {
    return false;
  }
  if (args.ids.size > 0 && !args.ids.has(entry.id)) {
    return false;
  }
  if (args.collections.size > 0 && !args.collections.has(entry.collection)) {
    return false;
  }
  return true;
}

function sourceUrlsFor(entry) {
  if (Array.isArray(entry.source_urls)) {
    return entry.source_urls;
  }
  if (entry.source_url) {
    return [entry.source_url];
  }
  return [];
}

function extFor(entry, url, contentType = "") {
  if (entry.source_extension) {
    return entry.source_extension.replace(/^\./, "");
  }
  const urlPath = new URL(url).pathname.toLowerCase();
  if (
    urlPath.endsWith(".json") ||
    contentType.includes("json") ||
    url.includes("/rule_out_api/") ||
    url.includes("/oacontract/")
  ) {
    return "json";
  }
  if (urlPath.endsWith(".pdf") || contentType.includes("pdf")) {
    return "pdf";
  }
  if (urlPath.endsWith(".txt") || contentType.includes("text/plain")) {
    return "txt";
  }
  if (urlPath.endsWith(".xml") || contentType.includes("xml")) {
    return "xml";
  }
  return "html";
}

function downloadOptionsFor(entry, url) {
  const options = {};
  if (entry.omit_user_agent) {
    options.omitUserAgent = true;
  }
  if (entry.insecure_tls) {
    options.insecureTls = true;
  }
  if (entry.fetch_method === "rendered-html") {
    options.rendered = true;
    options.renderWaitMs = entry.render_wait_ms || 6000;
    options.renderAfterClickWaitMs = entry.render_after_click_wait_ms || 250;
    options.renderClickSelectors = Array.isArray(entry.render_click_selectors)
      ? entry.render_click_selectors
      : entry.render_click_selector
        ? [entry.render_click_selector]
        : [];
  }
  if (entry.extractor === "xiaohongshu-contract-json" && url.includes("/oacontract/")) {
    return {
      ...options,
      method: "POST",
      headers: {
        referer: sourceUrlsFor(entry)[0],
      },
    };
  }
  return options;
}

async function fetchSource(url, timeoutMs, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    accept: "text/html,application/xhtml+xml,application/json,application/pdf,text/plain,*/*",
    ...(options.headers || {}),
  };
  if (!options.omitUserAgent) {
    headers["user-agent"] = USER_AGENT;
  }
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      body: options.body,
      signal: controller.signal,
      headers,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > MAX_DOWNLOAD_BYTES) {
      throw new Error(`download exceeds ${MAX_DOWNLOAD_BYTES} bytes`);
    }
    return {
      buffer,
      contentType: response.headers.get("content-type") || "",
      downloader: "fetch",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function curlSource(url, timeoutMs, options = {}) {
  const timeoutSeconds = Math.ceil(timeoutMs / 1000);
  const args = [
    "-L",
    "--fail",
    "--max-time",
    String(timeoutSeconds),
    "-sS",
    "-H",
    "Accept-Language: en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
  ];
  if (options.insecureTls) {
    args.push("-k");
  }
  if (!options.omitUserAgent) {
    args.push("-A", USER_AGENT);
  }
  if (options.method) {
    args.push("-X", options.method);
  }
  for (const [key, value] of Object.entries(options.headers || {})) {
    args.push("-H", `${key}: ${value}`);
  }
  if (options.body) {
    args.push("--data-raw", options.body);
  }
  args.push(url);

  let stdout;
  try {
    ({ stdout } = await execFile("curl", args, {
      encoding: "buffer",
      maxBuffer: MAX_DOWNLOAD_BYTES,
    }));
  } catch (error) {
    const stderr = Buffer.isBuffer(error.stderr) ? error.stderr.toString("utf8") : error.stderr;
    throw new Error(cleanError(stderr || error.message));
  }
  return {
    buffer: stdout,
    contentType: "",
    downloader: "curl",
  };
}

async function renderSource(url, timeoutMs, options = {}) {
  const args = [
    path.join(ROOT, "scripts", "render_url.py"),
    url,
    "--timeout-ms",
    String(timeoutMs),
    "--wait-ms",
    String(options.renderWaitMs || 6000),
  ];
  if (options.renderAfterClickWaitMs) {
    args.push("--after-click-wait-ms", String(options.renderAfterClickWaitMs));
  }
  for (const selector of options.renderClickSelectors || []) {
    args.push("--click-selector", selector);
  }

  const { stdout } = await execFile(
    process.env.PYTHON || "python",
    args,
    {
      encoding: "buffer",
      maxBuffer: MAX_DOWNLOAD_BYTES,
    }
  );
  return {
    buffer: stdout,
    contentType: "text/html; charset=utf-8",
    downloader: "playwright",
  };
}

function cleanError(message) {
  return cleanText(String(message)).split("\n").slice(0, 2).join(" ");
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function downloadOnce(url, timeoutMs, options = {}) {
  if (options.rendered) {
    return await renderSource(url, timeoutMs, options);
  }
  try {
    return await fetchSource(url, timeoutMs, options);
  } catch (fetchError) {
    try {
      const result = await curlSource(url, timeoutMs, options);
      return {
        ...result,
        fallback_from: fetchError.message,
      };
    } catch (curlError) {
      throw new Error(`fetch failed: ${fetchError.message}; curl failed: ${curlError.message}`);
    }
  }
}

async function download(url, timeoutMs, retryCount, options = {}) {
  const errors = [];
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await downloadOnce(url, timeoutMs, options);
    } catch (error) {
      errors.push(`attempt ${attempt + 1}: ${cleanError(error.message)}`);
      if (attempt < retryCount) {
        await sleep(1000 * (attempt + 1));
      }
    }
  }
  throw new Error(errors.join(" | "));
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number.parseInt(value, 10)));
}

function stripHtmlToLines(html) {
  const preBlocks = [...html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi)].map((match) =>
    htmlToText(match[1])
  );
  if (preBlocks.join("\n").trim().length > 500) {
    return cleanText(preBlocks.join("\n")).split("\n").filter(Boolean);
  }

  const withoutNoise = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "\n")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "\n")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "\n")
    .replace(/<!--[\s\S]*?-->/g, "\n");

  const withBreaks = withoutNoise
    .replace(/<(h[1-6]|p|div|section|article|header|footer|main|tr|table|ul|ol)\b[^>]*>/gi, "\n")
    .replace(/<\/(h[1-6]|p|div|section|article|header|footer|main|tr|table|ul|ol)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return cleanText(withBreaks).split("\n").filter(Boolean);
}

function htmlToText(html) {
  return cleanText(html.replace(/<[^>]+>/g, " "));
}

function cleanText(text) {
  return decodeEntities(text)
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeBuffer(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return gunzipSync(buffer).toString("utf8");
  }
  const head = buffer.subarray(0, 4096).toString("latin1");
  if (/charset=["']?(windows-1252|iso-8859-1)/i.test(head)) {
    return new TextDecoder("windows-1252").decode(buffer);
  }
  return buffer.toString("utf8");
}

function applyLineFilters(lines, entry) {
  let filtered = lines.map((line) => line.trim()).filter(Boolean);

  if (entry.boundary_start) {
    const start = filtered.findIndex((line) => line.includes(entry.boundary_start));
    if (start !== -1) {
      filtered = filtered.slice(start);
    }
  }

  if (entry.boundary_end) {
    const end = filtered.findIndex((line, index) => index > 0 && line.includes(entry.boundary_end));
    if (end !== -1) {
      filtered = filtered.slice(0, entry.include_boundary_end ? end + 1 : end);
    }
  }

  const skipPatterns = (entry.skip_line_patterns || []).map((pattern) => new RegExp(pattern, "i"));
  if (skipPatterns.length > 0) {
    filtered = filtered.filter((line) => !skipPatterns.some((pattern) => pattern.test(line)));
  }

  return filtered;
}

async function extractPdfText(sourcePath) {
  const { stdout } = await execFile("pdftotext", ["-layout", sourcePath, "-"], {
    encoding: "utf8",
    maxBuffer: MAX_DOWNLOAD_BYTES,
  });
  return cleanText(stdout);
}

function validateExtractedBody(entry, bodyText, extractionNotes = []) {
  const body = cleanText(bodyText);
  const minBodyChars = entry.min_body_chars ?? 500;
  const hasEnoughText = body.length >= minBodyChars;
  const bodyForSearch = body.toLocaleLowerCase();
  const hasRequiredPhrases = (entry.required_phrases || []).every((phrase) =>
    bodyForSearch.includes(phrase.toLocaleLowerCase())
  );

  if (!hasEnoughText || !hasRequiredPhrases) {
    const missing = (entry.required_phrases || []).filter(
      (phrase) => !bodyForSearch.includes(phrase.toLocaleLowerCase())
    );
    const noteParts = [];
    if (!hasEnoughText) {
      noteParts.push(`extracted text length ${body.length} is below minimum ${minBodyChars}`);
    }
    if (missing.length > 0) {
      noteParts.push(`missing required phrase(s): ${missing.join(", ")}`);
    }
    if (extractionNotes.length > 0) {
      noteParts.push(...extractionNotes);
    }
    return {
      text: "",
      status: "stub",
      note: noteParts.join("; "),
      attempted_text_sha256: body ? sha256(Buffer.from(body, "utf8")) : null,
      attempted_text_length: body.length,
    };
  }

  return {
    text: body,
    status: "extracted",
    note: extractionNotes.join("; ") || null,
  };
}

function jsonDownloads(downloads) {
  const parsed = [];
  for (const item of downloads) {
    if (item.extension !== "json" && !String(item.contentType || "").includes("json")) {
      continue;
    }
    try {
      parsed.push({
        item,
        json: JSON.parse(decodeBuffer(item.buffer)),
      });
    } catch (error) {
      parsed.push({
        item,
        error: error.message,
      });
    }
  }
  return parsed;
}

function renderBilibiliNodes(nodes, depth = 2) {
  const output = [];
  for (const node of nodes || []) {
    if (node.title) {
      output.push(`${"#".repeat(Math.min(depth, 6))} ${cleanText(node.title)}`);
    }
    if (node.contentXML) {
      const lines = stripHtmlToLines(node.contentXML);
      if (lines.length > 0) {
        output.push(lines.join("\n\n"));
      }
    }
    if (Array.isArray(node.children)) {
      output.push(renderBilibiliNodes(node.children, depth + 1));
    }
  }
  return output.filter(Boolean).join("\n\n");
}

function extractBilibiliConvention(entry, downloads) {
  const extractionNotes = [];
  for (const item of downloads) {
    const sourceText = decodeBuffer(item.buffer);
    const matches = [...sourceText.matchAll(/JSON\.parse\('((?:\\'|[^'])*)'\)/gs)];
    for (const match of matches) {
      try {
        const jsonText = Function(`"use strict"; return '${match[1]}';`)();
        const parsed = JSON.parse(jsonText);
        if (!JSON.stringify(parsed).includes("违法违禁")) {
          continue;
        }
        return validateExtractedBody(entry, renderBilibiliNodes(parsed), extractionNotes);
      } catch (error) {
        extractionNotes.push(`${item.url}: Bilibili embedded JSON parse failed: ${error.message}`);
      }
    }
  }
  return validateExtractedBody(entry, "", extractionNotes.concat("Bilibili convention JSON was not found."));
}

function extractTencentRule(entry, downloads) {
  const parsed = jsonDownloads(downloads);
  const candidates = parsed
    .filter((item) => item.json?.data?.info?.section)
    .map((item) => item.json.data.info);
  if (candidates.length === 0) {
    const notes = parsed.map((item) =>
      item.error ? `${item.item.url}: Tencent JSON parse failed: ${item.error}` : `${item.item.url}: no rule info`
    );
    return validateExtractedBody(entry, "", notes.concat("Tencent rule JSON was not found."));
  }

  const info = candidates[0];
  const parts = [];
  if (info.ruleName) {
    parts.push(cleanText(info.ruleName));
  }
  if (info.releaseTime) {
    parts.push(`发布时间：${info.releaseTime}`);
  }
  if (info.effectTime) {
    parts.push(`生效时间：${info.effectTime}`);
  }
  for (const section of info.section || []) {
    if (section.moduleName) {
      parts.push(`## ${cleanText(section.moduleName)}`);
    }
    const sectionHtml = section.rawContent || section.content || "";
    const lines = stripHtmlToLines(sectionHtml);
    if (lines.length > 0) {
      parts.push(lines.join("\n\n"));
    }
  }
  return validateExtractedBody(entry, parts.join("\n\n"));
}

function extractJsonHtmlData(entry, downloads, label) {
  const parsed = jsonDownloads(downloads);
  const candidates = parsed
    .filter((item) => typeof item.json?.data === "string")
    .map((item) => item.json.data);
  if (candidates.length === 0) {
    const notes = parsed.map((item) =>
      item.error
        ? `${item.item.url}: ${label} JSON parse failed: ${item.error}`
        : `${item.item.url}: no contract HTML data`
    );
    return validateExtractedBody(entry, "", notes.concat(`${label} HTML data JSON was not found.`));
  }
  return validateExtractedBody(entry, stripHtmlToLines(candidates[0]).join("\n\n"));
}

function extractXiaohongshuContract(entry, downloads) {
  return extractJsonHtmlData(entry, downloads, "Xiaohongshu contract");
}

function extractXHelp(entry, downloads) {
  const parts = [];
  const extractionNotes = [];

  for (const item of downloads) {
    const html = decodeBuffer(item.buffer);
    const lines = stripHtmlToLines(html).filter((line) => line !== "-");
    if (lines.some((line) => /Cloudflare|security verification|Just a moment/i.test(line))) {
      extractionNotes.push(`${item.url}: rendered page was a challenge page, not policy text`);
      continue;
    }

    let start = -1;
    const purposeIndex = lines.findIndex((line) => line.includes("X's purpose is to serve the public conversation"));
    if (purposeIndex !== -1) {
      start = Math.max(0, purposeIndex - 1);
    }
    const dateIndex = lines.findIndex((line) => /^February 2025$/.test(line));
    if (start === -1 && dateIndex > 0) {
      start = dateIndex - 1;
    }
    if (start === -1) {
      extractionNotes.push(`${item.url}: X Help article body start was not found`);
      continue;
    }

    let articleLines = lines.slice(start);
    const end = articleLines.findIndex((line) => line === "Share this article");
    if (end !== -1) {
      articleLines = articleLines.slice(0, end);
    }
    parts.push(articleLines.join("\n\n"));
  }

  return validateExtractedBody(entry, parts.join("\n\n---\n\n"), extractionNotes);
}

async function extractBody(entry, downloads) {
  if (entry.fetch_method === "stub" || entry.extractor === "stub") {
    return {
      text: "",
      status: "stub",
      note: "Source is intentionally tracked as a stub; no full-text extraction was attempted.",
    };
  }
  if (entry.extractor === "bilibili-convention-js") {
    return extractBilibiliConvention(entry, downloads);
  }
  if (entry.extractor === "tencent-rule-json") {
    return extractTencentRule(entry, downloads);
  }
  if (entry.extractor === "xiaohongshu-contract-json") {
    return extractXiaohongshuContract(entry, downloads);
  }
  if (entry.extractor === "x-help-html") {
    return extractXHelp(entry, downloads);
  }
  if (entry.extractor === "html-data-json") {
    return extractJsonHtmlData(entry, downloads, "HTML data");
  }

  const parts = [];
  const extractionNotes = [];

  for (const item of downloads) {
    let text = "";
    if (item.extension === "pdf") {
      try {
        text = await extractPdfText(item.sourcePath);
      } catch (error) {
        extractionNotes.push(`${item.url}: PDF extraction failed: ${error.message}`);
      }
    } else if (entry.extractor === "plain-text" || item.extension === "txt") {
      text = cleanText(decodeBuffer(item.buffer));
    } else if (item.extension === "json") {
      text = cleanText(decodeBuffer(item.buffer));
    } else {
      const html = decodeBuffer(item.buffer);
      const lines = applyLineFilters(stripHtmlToLines(html), entry);
      text = lines.join("\n\n");
    }

    if (text) {
      parts.push(text);
    }
  }

  return validateExtractedBody(entry, parts.join("\n\n---\n\n"), extractionNotes);
}

function markdownFor(entry, extraction, downloads) {
  const sourceUrls = sourceUrlsFor(entry);
  const sourceList = sourceUrls.map((url) => `- ${url}`).join("\n");
  const sourceHashes =
    downloads.length > 0
      ? downloads.map((item) => `- ${repoRelative(item.sourcePath)}: ${item.sourceSha256}`).join("\n")
      : "- not available because no source artifact was downloaded";
  const bodyHash = extraction.text ? sha256(Buffer.from(extraction.text, "utf8")) : null;
  const extractionLine =
    extraction.status === "extracted"
      ? `- Body SHA-256: ${bodyHash}`
      : "- Body SHA-256: not generated because this is a source stub";
  const openingNote =
    extraction.status === "stub"
      ? `\n> Opening Note: This file is a source stub only. The script downloaded or attempted to download the official source, but did not confirm complete original-text extraction. No rule body is reproduced here. Reason: ${extraction.note || "not specified"}\n`
      : entry.status_note && /uncertain|litigation|injunction|verify|not confirmed|不确定/i.test(entry.status_note)
        ? `\n> Opening Note: ${entry.status_note}\n`
        : "";

  return `# ${entry.title}
${openingNote}
- Collection: ${entry.collection}
- Jurisdiction: ${entry.jurisdiction}
- Scope Note: ${entry.scope_note}
- Source Authority: ${entry.source_authority}
- Source URL:
${sourceList}
- Retrieval Date: ${RETRIEVED_DATE}
- Language: ${entry.language}
- Fetch Method: ${entry.fetch_method}
- Extractor: ${entry.extractor || "generic-html"}
- Extraction Status: ${extraction.status}
- Status Note: ${entry.status_note || "None"}
- Source SHA-256:
${sourceHashes}
${extractionLine}

${extraction.status === "extracted" ? `## Source Text\n\n${extraction.text}` : "## Source Stub\n\nNo source text is reproduced in this file because complete extraction was not confirmed."}
`;
}

function slugForSource(entry, index, url, extension) {
  const suffix = sourceUrlsFor(entry).length > 1 ? `-${String(index + 1).padStart(2, "0")}` : "";
  const host = new URL(url).hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-");
  return `${entry.id}${suffix}.${host}.${extension}`;
}

async function processEntry(entry) {
  const outputPath = path.join(ROOT, entry.output_file);
  const outputDir = path.dirname(outputPath);
  const sourceDir = path.join(outputDir, "sources");
  await mkdir(sourceDir, { recursive: true });

  const downloads = [];
  for (const [index, url] of sourceUrlsFor(entry).entries()) {
    let downloaded;
    try {
      downloaded = await download(
        url,
        entry.timeout_ms || DEFAULT_TIMEOUT_MS,
        entry.retry_count ?? DEFAULT_RETRY_COUNT,
        downloadOptionsFor(entry, url)
      );
    } catch (error) {
      downloads.push({
        url,
        error: error.message,
      });
      continue;
    }

    const extension = extFor(entry, url, downloaded.contentType);
    const sourcePath = path.join(sourceDir, slugForSource(entry, index, url, extension));
    await writeFile(sourcePath, downloaded.buffer);
    downloads.push({
      url,
      sourcePath,
      extension,
      contentType: downloaded.contentType,
      downloader: downloaded.downloader,
      fallback_from: downloaded.fallback_from,
      sourceSha256: sha256(downloaded.buffer),
      sourceBytes: downloaded.buffer.length,
      buffer: downloaded.buffer,
    });
  }

  const successfulDownloads = downloads.filter((item) => item.sourcePath);
  let extraction;
  if (successfulDownloads.length === 0) {
    extraction = {
      text: "",
      status: "stub",
      note: downloads.map((item) => `${item.url}: ${item.error}`).join("; ") || "no sources downloaded",
    };
  } else if (successfulDownloads.length < sourceUrlsFor(entry).length) {
    extraction = {
      text: "",
      status: "stub",
      note: downloads
        .filter((item) => !item.sourcePath)
        .map((item) => `${item.url}: ${item.error}`)
        .join("; "),
    };
  } else {
    extraction = await extractBody(entry, successfulDownloads);
  }

  await writeFile(outputPath, markdownFor(entry, extraction, successfulDownloads), "utf8");

  return {
    id: entry.id,
    title: entry.title,
    collection: entry.collection,
    jurisdiction: entry.jurisdiction,
    output_file: repoRelative(outputPath),
    source_urls: sourceUrlsFor(entry),
    source_files: successfulDownloads.map((item) => repoRelative(item.sourcePath)),
    retrieved_date: RETRIEVED_DATE,
    language: entry.language,
    extraction_status: extraction.status,
    extraction_note: extraction.note,
    paragraph_count: extraction.text ? extraction.text.split(/\n{2,}/).filter(Boolean).length : 0,
    body_sha256: extraction.text ? sha256(Buffer.from(extraction.text, "utf8")) : null,
    attempted_text_sha256: extraction.attempted_text_sha256 || null,
    attempted_text_length: extraction.attempted_text_length || null,
    source_sha256: successfulDownloads.map((item) => ({
      source_file: repoRelative(item.sourcePath),
      sha256: item.sourceSha256,
      bytes: item.sourceBytes,
      downloader: item.downloader,
      fallback_from: item.fallback_from || null,
      content_type: item.contentType || null,
    })),
  };
}

async function writeManifestFor(manifestEntries) {
  const byDir = new Map();
  for (const entry of manifestEntries) {
    const sourceDir = path.join(ROOT, path.dirname(entry.output_file), "sources");
    if (!byDir.has(sourceDir)) {
      byDir.set(sourceDir, []);
    }
    byDir.get(sourceDir).push(entry);
  }

  for (const [sourceDir, entries] of byDir) {
    await mkdir(sourceDir, { recursive: true });
    await writeFile(
      path.join(sourceDir, "verification-manifest.json"),
      `${JSON.stringify(entries, null, 2)}\n`,
      "utf8"
    );
  }
}

function platformGroups(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (entry.collection !== "platforms" || !entry.platform_group) {
      continue;
    }
    if (!groups.has(entry.platform_group)) {
      groups.set(entry.platform_group, []);
    }
    groups.get(entry.platform_group).push(entry);
  }
  return groups;
}

function riskIndexMarkdown(platformName, entries, language) {
  const categoryIds = [...new Set(entries.flatMap((entry) => entry.risk_categories || []))].sort();
  const labels = categoryIds.map((id) => RISK_CATEGORY_LABELS[id]?.[language] || id);
  const sourceLines = entries.map((entry) => `- ${entry.title}: ${sourceUrlsFor(entry).join(", ")}`).join("\n");

  if (language === "cn") {
    return `# ${platformName} 违法和高风险内容类别索引

本索引是对已收集官方规则来源的导航，不替代官方规则原文。若具体适用存在疑问，应回到同目录下的官方来源文件及其来源链接核对。

## 已标记类别

${labels.map((label) => `- ${label}`).join("\n")}

## 官方来源

${sourceLines}
`;
  }

  return `# ${platformName} Illegal and High-Risk Content Index

This index is a navigation aid for collected official rule sources. It does not replace the original official rules. If application is uncertain, verify against the collected source file and its source URL.

## Tagged Categories

${labels.map((label) => `- ${label}`).join("\n")}

## Official Sources

${sourceLines}
`;
}

async function writeRiskIndexes(entries) {
  for (const [group, groupEntries] of platformGroups(entries)) {
    const first = groupEntries[0];
    const platformName = first.platform_name || group;
    const outputDir = path.join(ROOT, path.dirname(first.output_file));
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, "risk-index.md"), riskIndexMarkdown(platformName, groupEntries, "en"), "utf8");
    await writeFile(
      path.join(outputDir, "risk-index_cn.md"),
      riskIndexMarkdown(platformName, groupEntries, "cn"),
      "utf8"
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registry = JSON.parse(await readFile(REGISTRY_PATH, "utf8"));
  RETRIEVED_DATE = RETRIEVED_DATE || registry.retrieval_date || todayInShanghai();
  const entries = registry.entries.filter((entry) => shouldRun(entry, args));
  const manifest = [];

  for (const entry of entries) {
    console.log(`Fetching ${entry.id}`);
    manifest.push(await processEntry(entry));
  }

  await writeManifestFor(manifest);
  await writeRiskIndexes(entries);
  console.log(`Done. Processed ${manifest.length} entries.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
