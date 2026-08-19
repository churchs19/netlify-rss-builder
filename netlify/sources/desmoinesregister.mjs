/**
 * Des Moines Register — source config and article scraper.
 *
 * The site uses Gannett's shared article-card markup, with generic fallbacks
 * for small layout changes between sections.
 */
import { parse } from "node-html-parser";
import { fetchHtml } from "../lib/fetch-html.mjs";

function cleanText(text) {
  return text?.replace(/\s+/g, " ").trim() || "";
}

function normalizeUrl(url) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;

  try {
    return new URL(url, "https://www.desmoinesregister.com").toString();
  } catch {
    return url.trim();
  }
}

function extractImageUrl(articleEl) {
  const imageEl = articleEl.querySelector("img");
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
      imageEl.getAttribute("data-gl-src") ||
      "",
  );
}

function parseTimestamp(articleEl) {
  const timestamp =
    articleEl.getAttribute("data-timestamp") ||
    articleEl.getAttribute("data-published") ||
    articleEl.querySelector(".gnt_m_th_by")?.getAttribute("data-c-dt") ||
    articleEl.querySelector("time")?.getAttribute("datetime");
  if (!timestamp) return null;

  const numericTimestamp = Number(timestamp);
  if (Number.isFinite(numericTimestamp)) {
    return numericTimestamp > 10_000_000_000
      ? Math.floor(numericTimestamp / 1000)
      : numericTimestamp;
  }

  const normalizedDate = timestamp
    .replace(/\s+CT\b/i, "")
    .replace(/a\.m\./gi, "AM")
    .replace(/p\.m\./gi, "PM");
  const date = Date.parse(`${normalizedDate} ${new Date().getUTCFullYear()}`);
  return Number.isNaN(date) ? null : Math.floor(date / 1000);
}

function extractArticleElements(root) {
  const articleCards = root.querySelectorAll(
    "article, .gnt_ar_b, .gnt_ar, [data-c-t='article']",
  );
  const articleLinks = root.querySelectorAll(
    "a.gnt_ar_b_a, a.gnt_m_th_a, a.gnt_m_flm_a",
  );

  return [...articleCards, ...articleLinks];
}

export const feedConfig = {
  title: "Des Moines Register — News",
  description: "Latest news from The Des Moines Register",
  siteUrl: "https://www.desmoinesregister.com/news/",
  feedUrl: "/desmoinesregister/rss.xml",
};

export async function scrapeArticles() {
  const html = await fetchHtml(feedConfig.siteUrl);
  const root = parse(html);
  const seen = new Set();
  const articles = [];

  for (const articleEl of extractArticleElements(root)) {
    const linkEl =
      articleEl.tagName === "A"
        ? articleEl
        : articleEl.querySelector(
            "a.gnt_ar_b_a, a.article-title, a[href*='/story/'], a[href*='/news/']",
          );
    if (!linkEl) continue;

    const url = normalizeUrl(linkEl.getAttribute("href")?.trim());
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const title = cleanText(
      linkEl.querySelector(".gnt_ar_b_h, .dfm-title, h2, h3")?.text ||
        linkEl.getAttribute("aria-label") ||
        linkEl.text,
    );
    if (!title) continue;

    const summary = cleanText(
      articleEl.querySelector(".gnt_ar_b_p, .excerpt, .article-excerpt, p")
        ?.text ||
        linkEl.getAttribute("data-c-br") ||
        linkEl.getAttribute("title"),
    );
    const author = cleanText(
      articleEl.querySelector(".gnt_ar_b_by, .byline, .author, .post-author")
        ?.text,
    ).replace(/^by\s+/i, "");

    articles.push({
      title,
      url,
      description: summary,
      pubDate: parseTimestamp(articleEl),
      author,
      imageUrl: extractImageUrl(articleEl),
    });
  }

  articles.sort((a, b) => (b.pubDate || 0) - (a.pubDate || 0));
  return articles;
}
