/**
 * Denver Post — source config and article scraper.
 *
 * feedConfig is consumed by buildRss() from netlify/lib/rss-utils.mjs.
 * scrapeArticles() returns an array of article objects ready for buildRss().
 */
import { parse } from "node-html-parser";
import { fetchHtml } from "../lib/fetch-html.mjs";

function cleanText(text) {
  return text?.replace(/\s+/g, " ").trim() || "";
}

function normalizeTextForComparison(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeUrl(url) {
  if (!url) return "";

  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  try {
    return new URL(url, "https://www.denverpost.com").toString();
  } catch {
    return url.trim();
  }
}

function extractImageUrl(articleEl) {
  const imageEl = articleEl.querySelector("figure img, img");
  if (!imageEl) return "";

  const srcset =
    imageEl.getAttribute("srcset") || imageEl.getAttribute("data-srcset") || "";
  const srcsetUrl = srcset
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean)
    .pop();

  return normalizeUrl(
    srcsetUrl ||
      imageEl.getAttribute("src") ||
      imageEl.getAttribute("data-src") ||
      imageEl.getAttribute("data-lazy-src") ||
      "",
  );
}

function extractSummary(articleEl, linkEl) {
  const excerptEl = articleEl.querySelector(
    ".excerpt, .article-excerpt, .article-summary, p",
  );
  return cleanText(excerptEl?.text) || cleanText(linkEl.getAttribute("title"));
}

function hasUsefulSummary(summary, title) {
  const normalizedSummary = normalizeTextForComparison(summary);
  if (!normalizedSummary) return false;

  const normalizedTitle = normalizeTextForComparison(title);
  return normalizedSummary !== normalizedTitle;
}

function isSubstantiveParagraph(text) {
  const summary = cleanText(text);
  if (!summary) return false;

  const wordCount = summary.split(/\s+/).length;
  return summary.length >= 40 && wordCount >= 6;
}

async function fetchArticleSummary(url) {
  try {
    const html = await fetchHtml(url);
    const root = parse(html);

    const paragraphs = root
      .querySelectorAll(
        ".entry-content p, .article-body p, .body-copy p, article p, main p",
      )
      .map((paragraphEl) => cleanText(paragraphEl.text))
      .filter(Boolean);

    const bodyParagraph =
      paragraphs.find(isSubstantiveParagraph) || paragraphs.find(Boolean);

    if (bodyParagraph) return bodyParagraph;

    const metaDescription = cleanText(
      root.querySelector('meta[name="description"]')?.getAttribute("content") ||
        root
          .querySelector('meta[property="og:description"]')
          ?.getAttribute("content"),
    );

    return metaDescription;
  } catch {
    return "";
  }
}

export const feedConfig = {
  title: "Denver Post – Sports",
  description: "Latest sports news from The Denver Post",
  siteUrl: "https://www.denverpost.com/sports",
  feedUrl: "/denverpost/rss.xml",
};

export async function scrapeArticles() {
  const html = await fetchHtml(feedConfig.siteUrl);
  const root = parse(html);

  const seen = new Set();
  const articles = [];

  for (const articleEl of root.querySelectorAll("article")) {
    const linkEl = articleEl.querySelector("a.article-title");
    if (!linkEl) continue;

    const url = normalizeUrl(linkEl.getAttribute("href")?.trim());
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const title =
      cleanText(linkEl.querySelector(".dfm-title")?.text) ||
      cleanText(linkEl.text);
    if (!title) continue;

    // data-timestamp is Unix seconds on the <article> element
    const tsAttr = articleEl.getAttribute("data-timestamp");
    const pubDate = tsAttr ? parseInt(tsAttr, 10) : null;

    const description = extractSummary(articleEl, linkEl);

    const authorEl = articleEl.querySelector(".byline, .author, .post-author");
    const author = cleanText(authorEl?.text).replace(/^by\s+/i, "");

    const imageUrl = extractImageUrl(articleEl);

    articles.push({ title, url, description, pubDate, author, imageUrl });
  }

  await Promise.all(
    articles.map(async (article) => {
      if (hasUsefulSummary(article.description, article.title)) return;

      const articleSummary = await fetchArticleSummary(article.url);
      article.description = hasUsefulSummary(articleSummary, article.title)
        ? articleSummary
        : "";
    }),
  );

  // Ensure feed items are returned newest-first.
  articles.sort((a, b) => {
    const aDate = typeof a.pubDate === "number" ? a.pubDate : 0;
    const bDate = typeof b.pubDate === "number" ? b.pubDate : 0;
    return bDate - aDate;
  });

  return articles;
}
