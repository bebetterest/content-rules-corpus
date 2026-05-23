import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT_DIR = path.join(ROOT, "all_rules", "china");
const SOURCE_DIR = path.join(OUT_DIR, "sources");
const RETRIEVED_DATE = "2026-05-23";

const rules = [
  {
    id: "internet-information-service-management-measures",
    title: "互联网信息服务管理办法",
    kind: "行政法规",
    authority: "中华人民共和国国务院",
    sourceName: "国家行政法规库",
    sourceUrl: "https://xzfg.moj.gov.cn/front/law/detail?LawID=1756",
    sourceFile: "internet-information-service-management-measures.moj.html",
    outputFile: "internet-information-service-management-measures_cn.md",
    expectedParagraphCount: 56,
    extract(html) {
      const paragraphs = extractParagraphs(html);
      const start = paragraphs.findIndex((line) => line === this.title);
      const nextTitle = paragraphs.findIndex((line, index) => index > start && line === this.title);
      if (start !== -1 && nextTitle !== -1) {
        throw new Error(`${this.id}: duplicate document title in paragraph extraction`);
      }
      const footer = paragraphs.findIndex((line) => line.includes("中华人民共和国司法部 版权所有"));
      if (start === -1 || footer === -1 || footer <= start) {
        throw new Error(`${this.id}: could not locate document body boundaries`);
      }
      return paragraphs.slice(start, footer);
    },
    metadata: [
      ["司法辖区", "中国"],
      ["文件类型", "行政法规"],
      ["发布机关", "中华人民共和国国务院"],
      ["公布日期", "2000-09-25"],
      ["修订记录", "2011-01-08 第一次修订；2024-12-06 第二次修订"],
      ["现行文本来源", "国家行政法规库"],
      ["来源链接", "https://xzfg.moj.gov.cn/front/law/detail?LawID=1756"],
      ["抓取日期", RETRIEVED_DATE],
      ["生成方式", "由 scripts/fetch_china_rules.mjs 下载官方 HTML 后抽取生成"],
      ["说明", "本文件保存国家行政法规库展示的现行中文原文全文，不包含翻译。"],
    ],
  },
  {
    id: "provisions-online-content-ecosystem",
    title: "网络信息内容生态治理规定",
    kind: "部门规章",
    authority: "国家互联网信息办公室",
    sourceName: "中央网络安全和信息化委员会办公室 / 中华人民共和国国家互联网信息办公室",
    sourceUrl: "https://www.cac.gov.cn/2019-12/20/c_1578375159509309.htm",
    sourceFile: "provisions-online-content-ecosystem.cac.html",
    outputFile: "provisions-on-governance-of-online-information-content-ecosystem_cn.md",
    expectedParagraphCount: 105,
    extract(html) {
      const bodyMatch = html.match(/<DIV id=BodyLabel>[\s\S]*?<\/DIV>/i);
      if (!bodyMatch) {
        throw new Error(`${this.id}: could not locate BodyLabel`);
      }
      return extractParagraphs(bodyMatch[0]);
    },
    metadata: [
      ["司法辖区", "中国"],
      ["文件类型", "部门规章"],
      ["发布机关", "国家互联网信息办公室"],
      ["文号", "国家互联网信息办公室令第5号"],
      ["公布日期", "2019-12-15"],
      ["施行日期", "2020-03-01"],
      ["原文来源", "中央网络安全和信息化委员会办公室 / 中华人民共和国国家互联网信息办公室"],
      ["来源链接", "https://www.cac.gov.cn/2019-12/20/c_1578375159509309.htm"],
      ["参考来源", "中国政府网国务院公报，https://www.gov.cn/gongbao/content/2020/content_5492511.htm"],
      ["抓取日期", RETRIEVED_DATE],
      ["生成方式", "由 scripts/fetch_china_rules.mjs 下载官方 HTML 后抽取生成"],
      ["说明", "本文件保存国家互联网信息办公室发布页面展示的中文原文全文，不包含翻译。"],
    ],
  },
];

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
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

function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractParagraphs(html) {
  return [...html.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)]
    .map((match) => htmlToText(match[0]))
    .filter(Boolean);
}

function markdownFor(rule, paragraphs, bodyHash) {
  const metadata = rule.metadata.map(([key, value]) => `- ${key}：${value}`).join("\n");
  return `# ${rule.title}

${metadata}
- 正文 SHA-256：${bodyHash}

## 正文

${paragraphs.join("\n\n")}
`;
}

async function fetchOfficialSource(rule) {
  const response = await fetch(rule.sourceUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 source-verification-script",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) {
    throw new Error(`${rule.id}: download failed with HTTP ${response.status}`);
  }
  return response.text();
}

async function main() {
  await mkdir(SOURCE_DIR, { recursive: true });

  const manifest = [];
  for (const rule of rules) {
    const html = await fetchOfficialSource(rule);
    await writeFile(path.join(SOURCE_DIR, rule.sourceFile), html, "utf8");

    const paragraphs = rule.extract(html);
    if (paragraphs.length !== rule.expectedParagraphCount) {
      throw new Error(
        `${rule.id}: expected ${rule.expectedParagraphCount} paragraphs, extracted ${paragraphs.length}`
      );
    }

    const sourceHash = sha256(html);
    const bodyText = paragraphs.join("\n\n");
    const bodyHash = sha256(bodyText);
    await writeFile(path.join(OUT_DIR, rule.outputFile), markdownFor(rule, paragraphs, bodyHash), "utf8");

    manifest.push({
      id: rule.id,
      title: rule.title,
      source_url: rule.sourceUrl,
      source_file: path.posix.join("all_rules/china/sources", rule.sourceFile),
      output_file: path.posix.join("all_rules/china", rule.outputFile),
      retrieved_date: RETRIEVED_DATE,
      paragraph_count: paragraphs.length,
      source_sha256: sourceHash,
      body_sha256: bodyHash,
    });
  }

  await writeFile(
    path.join(SOURCE_DIR, "verification-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
