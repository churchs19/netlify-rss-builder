/**
 * Denver Post — source config and article scraper.
 *
 * feedConfig is consumed by buildRss() from netlify/lib/rss-utils.mjs.
 * scrapeArticles() returns an array of article objects ready for buildRss().
 */
import { parse } from "node-html-parser";
import { fetchHtml } from "../lib/fetch-html.mjs";

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

    const url = linkEl.getAttribute("href")?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const title =
      linkEl.querySelector(".dfm-title")?.text?.trim() || linkEl.text.trim();
    if (!title) continue;

    // data-timestamp is Unix seconds on the <article> element
    const tsAttr = articleEl.getAttribute("data-timestamp");
    const pubDate = tsAttr ? parseInt(tsAttr, 10) : null;

    const excerptEl = articleEl.querySelector(".excerpt, .article-excerpt, p");
    const description = excerptEl?.text?.trim() || "";

    const authorEl = articleEl.querySelector(".byline, .author, .post-author");
    const author = authorEl?.text?.trim().replace(/^by\s+/i, "") || "";

    articles.push({ title, url, description, pubDate, author });
  }

  // Ensure feed items are returned newest-first.
  articles.sort((a, b) => {
    const aDate = typeof a.pubDate === "number" ? a.pubDate : 0;
    const bDate = typeof b.pubDate === "number" ? b.pubDate : 0;
    return bDate - aDate;
  });

  return articles;
}
