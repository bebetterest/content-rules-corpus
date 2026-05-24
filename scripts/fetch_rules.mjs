import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
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

function outputRelative(fromFilePath, toFilePath) {
  return path.relative(path.dirname(fromFilePath), toFilePath).split(path.sep).join("/");
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

function isHashRoutedSourceUrl(parsed) {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  return (
    (host === "bilibili.com" && parsed.pathname === "/blackboard/help.html") ||
    (host === "link.bilibili.com" && parsed.pathname === "/p/eden/news")
  );
}

function sourceKey(url) {
  try {
    const parsed = new URL(decodeEntities(String(url)));
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
    return decodeEntities(String(url)).replace(/#.*$/, "");
  }
}

function schemeAgnosticSourceKey(parsed) {
  const hash = isHashRoutedSourceUrl(parsed) ? parsed.hash : "";
  return `scheme:${parsed.hostname.toLowerCase()}${parsed.pathname}${parsed.search}${hash}`;
}

function xPolicySlug(url) {
  try {
    const parsed = new URL(decodeEntities(String(url)));
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
    const parsed = new URL(decodeEntities(String(url)));
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
    const parsed = new URL(decodeEntities(String(url)));
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

function addSeenSourceUrl(seen, url) {
  for (const key of sourceKeyAliases(url)) {
    seen.add(key);
  }
}

function hasSeenSourceUrl(seen, url) {
  return sourceKeyAliases(url).some((key) => seen.has(key));
}

function addLinkMapTarget(linkMap, url, target) {
  for (const key of sourceKeyAliases(url)) {
    if (!linkMap.has(key)) {
      linkMap.set(key, target);
    }
  }
}

function localTargetForUrl(linkMap, url) {
  if (!linkMap) {
    return null;
  }
  for (const key of sourceKeyAliases(url)) {
    const localTarget = linkMap.get(key);
    if (localTarget) {
      return localTarget;
    }
  }
  return null;
}

function resolveSourceUrl(href, baseUrl) {
  const decoded = decodeEntities(String(href || "").trim());
  if (!decoded || decoded.startsWith("mailto:") || decoded.startsWith("tel:") || decoded.startsWith("javascript:")) {
    return null;
  }
  try {
    return new URL(decoded, baseUrl).toString();
  } catch {
    return null;
  }
}

function linkedSourceMatchers(entry, fieldName) {
  return (entry[fieldName] || []).map((pattern) => new RegExp(pattern, "i"));
}

function explicitLinkedSourceUrlsFor(entry) {
  return Array.isArray(entry.linked_source_urls) ? entry.linked_source_urls : [];
}

function explicitLinkedSourceKeys(entry) {
  const keys = new Set();
  for (const url of explicitLinkedSourceUrlsFor(entry)) {
    for (const key of sourceKeyAliases(url)) {
      keys.add(key);
    }
  }
  return keys;
}

function shouldDownloadLinkedSource(entry, url) {
  const explicitKeys = explicitLinkedSourceKeys(entry);
  if (sourceKeyAliases(url).some((key) => explicitKeys.has(key))) {
    return true;
  }

  const include = linkedSourceMatchers(entry, "linked_source_url_patterns");
  if (include.length === 0 || !include.some((pattern) => pattern.test(url))) {
    return false;
  }
  const exclude = linkedSourceMatchers(entry, "linked_source_exclude_url_patterns");
  return !exclude.some((pattern) => pattern.test(url));
}

function preferredLinkedSourceUrl(entry, url) {
  const slug = xPolicySlug(url);
  if (!slug) {
    return url;
  }
  if (slug === "parody-account-policy") {
    return "https://help.x.com/en/rules-and-policies/parody-account-policy";
  }
  const canonicalUrl = canonicalXPolicyUrl(slug);
  return shouldDownloadLinkedSource(entry, canonicalUrl) ? canonicalUrl : url;
}

function addLinkedSourceUrl(entry, url, seen, queue, depth, maxLinkedSources) {
  const candidateUrl = preferredLinkedSourceUrl(entry, url);
  if (!shouldDownloadLinkedSource(entry, candidateUrl) || hasSeenSourceUrl(seen, candidateUrl)) {
    return;
  }
  if (Number.isInteger(maxLinkedSources) && queue.length >= maxLinkedSources) {
    return;
  }
  addSeenSourceUrl(seen, candidateUrl);
  queue.push({ url: candidateUrl, depth });
}

function anchorLinksFromHtml(html, baseUrl) {
  const links = [];
  const anchorPattern = /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html))) {
    const url = resolveSourceUrl(match[2], baseUrl);
    if (!url) {
      continue;
    }
    links.push({
      url,
      key: sourceKey(url),
      text: htmlToText(match[3]),
    });
  }

  const selfClosingAnchorPattern = /<a\b[^>]*href=(["'])(.*?)\1[^>]*\/>\s*([^<\n]+)/gi;
  while ((match = selfClosingAnchorPattern.exec(html))) {
    const url = resolveSourceUrl(match[2], baseUrl);
    if (!url) {
      continue;
    }
    links.push({
      url,
      key: sourceKey(url),
      text: htmlToText(match[3]),
    });
  }
  return links;
}

function discoverLinkedSourceUrls(entry, downloads, seen, queue, depth, maxLinkedSources) {
  for (const item of downloads) {
    if (!item.sourcePath || !["html", "xml"].includes(item.extension)) {
      continue;
    }
    const html = decodeBuffer(item.buffer);
    for (const link of anchorLinksFromHtml(html, item.url)) {
      addLinkedSourceUrl(entry, link.url, seen, queue, depth, maxLinkedSources);
    }
  }
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

function downloadOptionsFor(entry, url, optionsFor = {}) {
  const options = {
    rejectChallengePages: entry.reject_challenge_pages !== false,
  };
  if (entry.omit_user_agent) {
    options.omitUserAgent = true;
  }
  if (entry.insecure_tls) {
    options.insecureTls = true;
  }
  if (entry.prefer_curl) {
    options.preferCurl = true;
  }
  const effectiveFetchMethod = optionsFor.linked && entry.linked_fetch_method
    ? entry.linked_fetch_method
    : entry.fetch_method;
  if (effectiveFetchMethod === "rendered-html") {
    options.rendered = true;
    options.renderWaitMs = optionsFor.linked
      ? entry.linked_render_wait_ms || entry.render_wait_ms || 6000
      : entry.render_wait_ms || 6000;
    options.renderAfterClickWaitMs = optionsFor.linked
      ? entry.linked_render_after_click_wait_ms || entry.render_after_click_wait_ms || 250
      : entry.render_after_click_wait_ms || 250;
    const renderClickSelectors = optionsFor.linked && (entry.linked_render_click_selectors || entry.linked_render_click_selector)
      ? (Array.isArray(entry.linked_render_click_selectors)
        ? entry.linked_render_click_selectors
        : [entry.linked_render_click_selector])
      : (Array.isArray(entry.render_click_selectors)
        ? entry.render_click_selectors
        : entry.render_click_selector
          ? [entry.render_click_selector]
          : []);
    options.renderClickSelectors = renderClickSelectors.filter(Boolean);
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
  const lines = cleanText(String(message)).split("\n").filter(Boolean);
  const tracebackIndex = lines.findIndex((line) => line.startsWith("Traceback"));
  if (tracebackIndex !== -1) {
    return [lines[0], ...lines.slice(-2)].filter(Boolean).join(" ");
  }
  return lines.slice(0, 2).join(" ");
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function validateDownloadedSource(result, options = {}) {
  if (options.rejectChallengePages && looksLikeChallengePage(result.buffer)) {
    throw new Error("downloaded challenge page instead of confirmed source text");
  }
  return result;
}

async function downloadOnce(url, timeoutMs, options = {}) {
  if (options.rendered) {
    return validateDownloadedSource(await renderSource(url, timeoutMs, options), options);
  }
  if (options.preferCurl) {
    try {
      return validateDownloadedSource(await curlSource(url, timeoutMs, options), options);
    } catch (curlError) {
      try {
        const result = validateDownloadedSource(await fetchSource(url, timeoutMs, options), options);
        return {
          ...result,
          fallback_from: curlError.message,
        };
      } catch (fetchError) {
        throw new Error(`curl failed: ${curlError.message}; fetch failed: ${fetchError.message}`);
      }
    }
  }
  try {
    return validateDownloadedSource(await fetchSource(url, timeoutMs, options), options);
  } catch (fetchError) {
    try {
      const result = validateDownloadedSource(await curlSource(url, timeoutMs, options), options);
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
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&ldquo;/gi, "\u201c")
    .replace(/&rdquo;/gi, "\u201d")
    .replace(/&lsquo;/gi, "\u2018")
    .replace(/&rsquo;/gi, "\u2019")
    .replace(/&mdash;/gi, "\u2014")
    .replace(/&ndash;/gi, "\u2013")
    .replace(/&hellip;/gi, "\u2026")
    .replace(/&middot;/gi, "\u00b7")
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number.parseInt(value, 10)));
}

function markdownLinkTarget(url) {
  return String(url).replace(/\)/g, "%29");
}

function mergeStandaloneListMarkers(lines) {
  const merged = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "-" && lines[index + 1] && lines[index + 1] !== "-") {
      merged.push(`- ${lines[index + 1]}`);
      index += 1;
    } else {
      merged.push(line);
    }
  }
  return merged;
}

function htmlToLinkedText(html, baseUrl, linkMap) {
  const withSelfClosingAnchors = html.replace(/<a\b[^>]*href=(["'])(.*?)\1[^>]*\/>\s*([^<\n]+)/gi, (full, _quote, href, label) => {
    const text = htmlToText(label);
    const url = resolveSourceUrl(href, baseUrl);
    if (!text || !url) {
      return full;
    }
    const localTarget = localTargetForUrl(linkMap, url);
    return ` [${text}](${markdownLinkTarget(localTarget || url)}) `;
  });

  return withSelfClosingAnchors.replace(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (full, _quote, href, inner) => {
    const text = htmlToText(inner);
    if (!text) {
      return " ";
    }
    if (decodeEntities(String(href || "").trim()).startsWith("#")) {
      return ` ${text} `;
    }
    const url = resolveSourceUrl(href, baseUrl);
    if (!url) {
      return ` ${text} `;
    }
    const localTarget = localTargetForUrl(linkMap, url);
    return ` [${text}](${markdownLinkTarget(localTarget || url)}) `;
  });
}

function stripHtmlToLines(html, options = {}) {
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

  const withLinks = options.preserveLinks === false
    ? withoutNoise
    : htmlToLinkedText(withoutNoise, options.baseUrl, options.linkMap);

  const withBreaks = withLinks
    .replace(/<(h[1-6]|p|div|section|article|header|footer|main|tr|table|ul|ol)\b[^>]*>/gi, "\n")
    .replace(/<\/(h[1-6]|p|div|section|article|header|footer|main|tr|table|ul|ol)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return mergeStandaloneListMarkers(cleanText(withBreaks).split("\n").filter(Boolean));
}

function htmlToText(html) {
  return cleanText(html.replace(/<[^>]+>/g, " "));
}

function htmlElementById(html, id) {
  const startPattern = new RegExp(`<([a-z0-9]+)\\b(?=[^>]*\\bid=(["'])${id}\\2)[^>]*>`, "i");
  const startMatch = startPattern.exec(html);
  if (!startMatch) {
    return null;
  }

  const tagName = startMatch[1].toLowerCase();
  const openClosePattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  openClosePattern.lastIndex = startMatch.index;
  let depth = 0;
  let match;

  while ((match = openClosePattern.exec(html))) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return html.slice(startMatch.index, openClosePattern.lastIndex);
      }
    } else if (!match[0].endsWith("/>")) {
      depth += 1;
    }
  }

  return null;
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

function looksLikeChallengePage(buffer) {
  const text = decodeBuffer(buffer).slice(0, 100000);
  return /<title>\s*Just a moment/i.test(text) ||
    /security verification/i.test(text) ||
    /challenges\.cloudflare\.com/i.test(text) ||
    /\bcf_chl\b|__cf_chl/i.test(text);
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

function renderBilibiliNodes(nodes, depth = 2, linkMap = new Map()) {
  const output = [];
  for (const node of nodes || []) {
    if (node.title) {
      output.push(`${"#".repeat(Math.min(depth, 6))} ${cleanText(node.title)}`);
    }
    if (node.contentXML) {
      const lines = stripHtmlToLines(node.contentXML, { linkMap });
      if (lines.length > 0) {
        output.push(lines.join("\n\n"));
      }
    }
    if (Array.isArray(node.children)) {
      output.push(renderBilibiliNodes(node.children, depth + 1, linkMap));
    }
  }
  return output.filter(Boolean).join("\n\n");
}

function extractBilibiliConvention(entry, downloads, linkMap = new Map()) {
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
        return validateExtractedBody(entry, renderBilibiliNodes(parsed, 2, linkMap), extractionNotes);
      } catch (error) {
        extractionNotes.push(`${item.url}: Bilibili embedded JSON parse failed: ${error.message}`);
      }
    }
  }
  return validateExtractedBody(entry, "", extractionNotes.concat("Bilibili convention JSON was not found."));
}

function extractTencentRule(entry, downloads, linkMap = new Map()) {
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
    const lines = stripHtmlToLines(sectionHtml, { linkMap });
    if (lines.length > 0) {
      parts.push(lines.join("\n\n"));
    }
  }
  return validateExtractedBody(entry, parts.join("\n\n"));
}

function extractJsonHtmlData(entry, downloads, label, linkMap = new Map()) {
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
  return validateExtractedBody(entry, stripHtmlToLines(candidates[0], { linkMap }).join("\n\n"));
}

function extractXiaohongshuContract(entry, downloads, linkMap = new Map()) {
  return extractJsonHtmlData(entry, downloads, "Xiaohongshu contract", linkMap);
}

function extractXHelp(entry, downloads, linkMap = new Map()) {
  const parts = [];
  const extractionNotes = [];

  for (const item of downloads) {
    const html = decodeBuffer(item.buffer);
    const mainMatch = html.match(/<main\b[^>]*id=(["'])twtr-main\1[^>]*>([\s\S]*?)<\/main>/i);
    const articleHtml = mainMatch ? mainMatch[2] : html;
    const lines = stripHtmlToLines(articleHtml, { baseUrl: item.url, linkMap }).filter((line) => line !== "-");
    if (lines.some((line) => /Cloudflare|security verification|Just a moment/i.test(line))) {
      extractionNotes.push(`${item.url}: rendered page was a challenge page, not policy text`);
      continue;
    }

    let start = -1;
    const purposeIndex = lines.findIndex((line) => line.includes("X's purpose is to serve the public conversation"));
    if (purposeIndex !== -1) {
      start = Math.max(0, purposeIndex - 1);
    }
    const dateIndex = lines.findIndex((line) => /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/.test(line));
    if (start === -1 && dateIndex > 0) {
      start = dateIndex - 1;
    }
    if (start === -1) {
      const firstPolicyHeading = lines.findIndex((line) =>
        /^(Overview|Policy|What is|How we|When this applies|Examples|Safety|Privacy|Authenticity|Enforcement)/i.test(line)
      );
      start = firstPolicyHeading === -1 ? 0 : firstPolicyHeading;
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

function extractGoogleHelpArticle(entry, downloads, linkMap = new Map()) {
  const parts = [];
  const extractionNotes = [];

  for (const item of downloads) {
    const html = decodeBuffer(item.buffer);
    const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
    if (!articleMatch) {
      extractionNotes.push(`${item.url}: Google Help article element was not found`);
      continue;
    }
    const lines = applyLineFilters(stripHtmlToLines(articleMatch[1], { baseUrl: item.url, linkMap }), entry);
    if (lines.length > 0) {
      parts.push(lines.join("\n\n"));
    }
  }

  return validateExtractedBody(entry, parts.join("\n\n---\n\n"), extractionNotes);
}

function extractGitHubDocsArticle(entry, downloads, linkMap = new Map()) {
  const parts = [];
  const extractionNotes = [];

  for (const item of downloads) {
    const html = decodeBuffer(item.buffer);
    const titleMatch = html.match(/<h1\b[^>]*id=(["'])title-h1\1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? htmlToText(titleMatch[2]) : "";
    const articleHtml = htmlElementById(html, "article-contents");
    if (!articleHtml) {
      extractionNotes.push(`${item.url}: GitHub Docs article contents were not found`);
      continue;
    }

    const lines = applyLineFilters(stripHtmlToLines(articleHtml, { baseUrl: item.url, linkMap }), entry);
    if (lines.length > 0) {
      parts.push([title ? `# ${title}` : "", lines.join("\n\n")].filter(Boolean).join("\n\n"));
    }
  }

  return validateExtractedBody(entry, parts.join("\n\n---\n\n"), extractionNotes);
}

function steamBbcodeToMarkdown(text, baseUrl, linkMap = new Map()) {
  let output = decodeEntities(text).replace(/\r/g, "\n");
  output = output.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_full, href, label) => {
    const url = resolveSourceUrl(href, baseUrl);
    const cleanLabel = cleanText(label);
    if (!url || !cleanLabel) {
      return cleanLabel;
    }
    const localTarget = localTargetForUrl(linkMap, url);
    return `[${cleanLabel}](${markdownLinkTarget(localTarget || url)})`;
  });
  output = output
    .replace(/\[h1(?:\s+[^\]]*)?\]/gi, "\n\n## ")
    .replace(/\[\/h1\]/gi, "\n\n")
    .replace(/\[h2(?:\s+[^\]]*)?\]/gi, "\n\n### ")
    .replace(/\[\/h2\]/gi, "\n\n")
    .replace(/\[h3(?:\s+[^\]]*)?\]/gi, "\n\n#### ")
    .replace(/\[\/h3\]/gi, "\n\n")
    .replace(/\[hr\]\s*\[\/hr\]/gi, "\n\n")
    .replace(/\[list\]/gi, "\n")
    .replace(/\[\/list\]/gi, "\n")
    .replace(/\[\*\]/g, "\n- ")
    .replace(/\[\/?(?:b|i|u|strike|code|quote|url|h[1-6]|list|hr)[^\]]*\]/gi, "");
  return cleanText(output);
}

function extractSteamFaqStore(entry, downloads, linkMap = new Map()) {
  const parts = [];
  const extractionNotes = [];

  for (const item of downloads) {
    const html = decodeBuffer(item.buffer);
    const faqStoreMatch = html.match(/\bdata-faqstore=(["'])([\s\S]*?)\1/i);
    if (!faqStoreMatch) {
      extractionNotes.push(`${item.url}: Steam FAQ data store was not found`);
      continue;
    }

    try {
      const faqStore = JSON.parse(decodeEntities(faqStoreMatch[2]));
      const faqs = Object.values(faqStore.faqs || {});
      if (faqs.length === 0) {
        extractionNotes.push(`${item.url}: Steam FAQ data store contains no FAQ records`);
        continue;
      }
      for (const faq of faqs) {
        if (!faq?.content) {
          continue;
        }
        const title = faq.title ? `# ${cleanText(faq.title)}` : "";
        const body = steamBbcodeToMarkdown(faq.content, item.url, linkMap);
        parts.push([title, body].filter(Boolean).join("\n\n"));
      }
    } catch (error) {
      extractionNotes.push(`${item.url}: Steam FAQ data store parse failed: ${error.message}`);
    }
  }

  return validateExtractedBody(entry, parts.join("\n\n---\n\n"), extractionNotes);
}

async function extractBody(entry, downloads, linkMap = new Map()) {
  if (entry.fetch_method === "stub" || entry.extractor === "stub") {
    return {
      text: "",
      status: "stub",
      note: "Source is intentionally tracked as a stub; no full-text extraction was attempted.",
    };
  }
  if (entry.extractor === "bilibili-convention-js") {
    return extractBilibiliConvention(entry, downloads, linkMap);
  }
  if (entry.extractor === "tencent-rule-json") {
    return extractTencentRule(entry, downloads, linkMap);
  }
  if (entry.extractor === "xiaohongshu-contract-json") {
    return extractXiaohongshuContract(entry, downloads, linkMap);
  }
  if (entry.extractor === "x-help-html") {
    return extractXHelp(entry, downloads, linkMap);
  }
  if (entry.extractor === "google-help-article") {
    return extractGoogleHelpArticle(entry, downloads, linkMap);
  }
  if (entry.extractor === "github-docs-article") {
    return extractGitHubDocsArticle(entry, downloads, linkMap);
  }
  if (entry.extractor === "steam-faqstore-json") {
    return extractSteamFaqStore(entry, downloads, linkMap);
  }
  if (entry.extractor === "html-data-json") {
    return extractJsonHtmlData(entry, downloads, "HTML data", linkMap);
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
      const lines = applyLineFilters(stripHtmlToLines(html, { baseUrl: item.url, linkMap }), entry);
      text = lines.join("\n\n");
    }

    if (text) {
      parts.push(text);
    }
  }

  return validateExtractedBody(entry, parts.join("\n\n---\n\n"), extractionNotes);
}

function markdownFor(entry, extraction, downloads, linkedDownloads = []) {
  const sourceUrls = sourceUrlsFor(entry);
  const sourceList = sourceUrls.map((url) => `- ${url}`).join("\n");
  const linkedSourceList = linkedDownloads.length > 0
    ? `- Linked Source URL:\n${linkedDownloads
        .map((item) => `- ${item.url} -> ${outputRelative(path.join(ROOT, entry.output_file), item.sourcePath)}`)
        .join("\n")}\n`
    : "";
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
      : extraction.note && /linked source download failed|challenge|not confirmed|uncertain|verify|不确定/i.test(extraction.note)
        ? `\n> Opening Note: ${entry.status_note || "Some linked source extraction remains uncertain."} Extraction note: ${extraction.note}\n`
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
${linkedSourceList}- Retrieval Date: ${RETRIEVED_DATE}
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

function slugForLinkedSource(entry, index, url, extension) {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-");
  const pathSlug = parsed.pathname
    .split("/")
    .filter(Boolean)
    .slice(-2)
    .join("-")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "linked-source";
  return `${entry.id}-linked-${String(index + 1).padStart(2, "0")}-${pathSlug}.${host}.${extension}`;
}

function sourceDownloadRecord(url, sourcePath, extension, downloaded) {
  return {
    url,
    sourcePath,
    extension,
    contentType: downloaded.contentType,
    downloader: downloaded.downloader,
    fallback_from: downloaded.fallback_from,
    sourceSha256: sha256(downloaded.buffer),
    sourceBytes: downloaded.buffer.length,
    buffer: downloaded.buffer,
  };
}

async function cachedLinkedSourceRecord(entry, index, url, sourceDir) {
  const extension = extFor(entry, url, "");
  const sourcePath = path.join(sourceDir, slugForLinkedSource(entry, index, url, extension));
  let buffer;
  try {
    buffer = await readFile(sourcePath);
  } catch {
    return null;
  }
  if (["html", "xml"].includes(extension) && looksLikeChallengePage(buffer)) {
    return null;
  }
  return sourceDownloadRecord(url, sourcePath, extension, {
    buffer,
    contentType: "",
    downloader: "cached",
  });
}

async function cachedPrimarySourceRecord(entry, index, url, sourceDir) {
  const extension = extFor(entry, url, "");
  const sourcePath = path.join(sourceDir, slugForSource(entry, index, url, extension));
  let buffer;
  try {
    buffer = await readFile(sourcePath);
  } catch {
    return null;
  }
  if (["html", "xml"].includes(extension) && looksLikeChallengePage(buffer)) {
    return null;
  }
  return sourceDownloadRecord(url, sourcePath, extension, {
    buffer,
    contentType: "",
    downloader: "cached",
  });
}

async function processEntry(entry) {
  const outputPath = path.join(ROOT, entry.output_file);
  const outputDir = path.dirname(outputPath);
  const sourceDir = path.join(outputDir, "sources");
  await mkdir(sourceDir, { recursive: true });

  const downloads = [];
  for (const [index, url] of sourceUrlsFor(entry).entries()) {
    if (entry.prefer_cached_primary_sources_first) {
      const cached = await cachedPrimarySourceRecord(entry, index, url, sourceDir);
      if (cached) {
        downloads.push(cached);
        continue;
      }
    }

    let downloaded;
    try {
      downloaded = await download(
        url,
        entry.timeout_ms || DEFAULT_TIMEOUT_MS,
        entry.retry_count ?? DEFAULT_RETRY_COUNT,
        downloadOptionsFor(entry, url)
      );
    } catch (error) {
      const cached = await cachedPrimarySourceRecord(entry, index, url, sourceDir);
      if (cached) {
        downloads.push(cached);
        continue;
      }
      downloads.push({
        url,
        error: error.message,
      });
      continue;
    }

    const extension = extFor(entry, url, downloaded.contentType);
    const sourcePath = path.join(sourceDir, slugForSource(entry, index, url, extension));
    await writeFile(sourcePath, downloaded.buffer);
    downloads.push(sourceDownloadRecord(url, sourcePath, extension, downloaded));
  }

  const primaryDownloads = downloads.filter((item) => item.sourcePath);
  const linkedSourceQueue = [];
  const seenLinkedSourceUrls = new Set();
  const maxLinkedSources = entry.max_linked_sources ?? null;
  for (const url of sourceUrlsFor(entry)) {
    addSeenSourceUrl(seenLinkedSourceUrls, url);
  }
  for (const url of explicitLinkedSourceUrlsFor(entry)) {
    addLinkedSourceUrl(entry, url, seenLinkedSourceUrls, linkedSourceQueue, 1, maxLinkedSources);
  }
  discoverLinkedSourceUrls(entry, primaryDownloads, seenLinkedSourceUrls, linkedSourceQueue, 1, maxLinkedSources);

  const linkedDownloads = [];
  const linkedErrors = [];
  const maxDiscoveryDepth = entry.linked_source_discovery_depth ?? 1;
  for (let queueIndex = 0; queueIndex < linkedSourceQueue.length; queueIndex += 1) {
    if (
      Number.isInteger(maxLinkedSources) &&
      linkedDownloads.length + linkedErrors.length >= maxLinkedSources
    ) {
      break;
    }
    const { url, depth } = linkedSourceQueue[queueIndex];
    const sourceIndex = linkedDownloads.length + linkedErrors.length;
    if (entry.prefer_cached_linked_sources_first) {
      const cached = await cachedLinkedSourceRecord(entry, sourceIndex, url, sourceDir);
      if (cached) {
        linkedDownloads.push(cached);
        if (depth < maxDiscoveryDepth) {
          discoverLinkedSourceUrls(entry, [cached], seenLinkedSourceUrls, linkedSourceQueue, depth + 1, maxLinkedSources);
        }
        continue;
      }
    }

    let downloaded;
    try {
      downloaded = await download(
        url,
        entry.linked_timeout_ms || entry.timeout_ms || DEFAULT_TIMEOUT_MS,
        entry.linked_retry_count ?? entry.retry_count ?? DEFAULT_RETRY_COUNT,
        downloadOptionsFor(entry, url, { linked: true })
      );
    } catch (error) {
      const cached = await cachedLinkedSourceRecord(entry, sourceIndex, url, sourceDir);
      if (cached) {
        linkedDownloads.push(cached);
        if (depth < maxDiscoveryDepth) {
          discoverLinkedSourceUrls(entry, [cached], seenLinkedSourceUrls, linkedSourceQueue, depth + 1, maxLinkedSources);
        }
        continue;
      }
      linkedErrors.push({
        url,
        error: error.message,
      });
      continue;
    }

    const extension = extFor(entry, url, downloaded.contentType);
    if (["html", "xml"].includes(extension) && looksLikeChallengePage(downloaded.buffer)) {
      const cached = await cachedLinkedSourceRecord(entry, sourceIndex, url, sourceDir);
      if (cached) {
        linkedDownloads.push(cached);
        if (depth < maxDiscoveryDepth) {
          discoverLinkedSourceUrls(entry, [cached], seenLinkedSourceUrls, linkedSourceQueue, depth + 1, maxLinkedSources);
        }
        continue;
      }
      linkedErrors.push({
        url,
        error: "downloaded challenge page instead of confirmed source text",
      });
      continue;
    }
    const sourcePath = path.join(sourceDir, slugForLinkedSource(entry, sourceIndex, url, extension));
    await writeFile(sourcePath, downloaded.buffer);
    const linkedRecord = sourceDownloadRecord(url, sourcePath, extension, downloaded);
    linkedDownloads.push(linkedRecord);
    if (depth < maxDiscoveryDepth) {
      discoverLinkedSourceUrls(entry, [linkedRecord], seenLinkedSourceUrls, linkedSourceQueue, depth + 1, maxLinkedSources);
    }
  }

  const successfulDownloads = primaryDownloads.concat(linkedDownloads);
  const linkMap = new Map();
  for (const item of successfulDownloads) {
    addLinkMapTarget(linkMap, item.url, outputRelative(outputPath, item.sourcePath));
  }

  let extraction;
  if (primaryDownloads.length === 0) {
    extraction = {
      text: "",
      status: "stub",
      note: downloads.map((item) => `${item.url}: ${item.error}`).join("; ") || "no sources downloaded",
    };
  } else if (primaryDownloads.length < sourceUrlsFor(entry).length) {
    extraction = {
      text: "",
      status: "stub",
      note: downloads
        .filter((item) => !item.sourcePath)
        .map((item) => `${item.url}: ${item.error}`)
        .join("; "),
    };
  } else if (linkedErrors.length > 0 && entry.require_linked_sources === true) {
    extraction = {
      text: "",
      status: "stub",
      note: linkedErrors.map((item) => `${item.url}: ${item.error}`).join("; "),
    };
  } else {
    const linkedNotes = linkedErrors.map((item) => `${item.url}: linked source download failed: ${item.error}`);
    const extractionDownloads = entry.extract_linked_sources === false
      ? primaryDownloads
      : successfulDownloads;
    extraction = await extractBody(entry, extractionDownloads, linkMap);
    if (linkedNotes.length > 0) {
      extraction = {
        ...extraction,
        note: [extraction.note, ...linkedNotes].filter(Boolean).join("; ") || null,
      };
    }
  }

  await writeFile(outputPath, markdownFor(entry, extraction, successfulDownloads, linkedDownloads), "utf8");

  return {
    id: entry.id,
    title: entry.title,
    collection: entry.collection,
    jurisdiction: entry.jurisdiction,
    output_file: repoRelative(outputPath),
    source_urls: sourceUrlsFor(entry),
    linked_source_urls: linkedDownloads.map((item) => item.url),
    linked_source_errors: linkedErrors,
    source_files: successfulDownloads.map((item) => repoRelative(item.sourcePath)),
    linked_source_files: linkedDownloads.map((item) => repoRelative(item.sourcePath)),
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

async function writeManifestFor(manifestEntries, registryEntries) {
  const registryIds = new Set(registryEntries.map((entry) => entry.id));
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
    const manifestPath = path.join(sourceDir, "verification-manifest.json");
    const replacementIds = new Set(entries.map((entry) => entry.id));
    let mergedEntries = [];
    let replacedSourceFiles = [];
    try {
      const existingEntries = JSON.parse(await readFile(manifestPath, "utf8"));
      replacedSourceFiles = existingEntries
        .filter((entry) => replacementIds.has(entry.id))
        .flatMap((entry) => entry.source_files || [entry.source_file].filter(Boolean));
      mergedEntries = existingEntries.filter(
        (entry) => registryIds.has(entry.id) && !replacementIds.has(entry.id)
      );
    } catch {
      mergedEntries = [];
    }
    mergedEntries.push(...entries);
    const referencedSourceFiles = new Set(
      mergedEntries.flatMap((entry) => entry.source_files || [entry.source_file].filter(Boolean))
    );
    for (const sourceFile of replacedSourceFiles) {
      const absoluteSourceFile = path.join(ROOT, sourceFile);
      if (
        !referencedSourceFiles.has(sourceFile) &&
        path.dirname(absoluteSourceFile) === sourceDir
      ) {
        await unlink(absoluteSourceFile).catch((error) => {
          if (error.code !== "ENOENT") {
            throw error;
          }
        });
      }
    }
    await writeFile(
      manifestPath,
      `${JSON.stringify(mergedEntries, null, 2)}\n`,
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

  const enabledRegistryEntries = registry.entries.filter((entry) => entry.enabled !== false || args.includeDisabled);
  await writeManifestFor(manifest, registry.entries);
  await writeRiskIndexes(enabledRegistryEntries);
  console.log(`Done. Processed ${manifest.length} entries.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
