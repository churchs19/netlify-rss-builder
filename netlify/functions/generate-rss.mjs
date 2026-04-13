/**
 * Scheduled Netlify Function — runs once per hour.
 * Scrapes the Denver Post sports page, builds an RSS 2.0 feed,
 * and stores it in Netlify Blobs so the `rss` function can serve it.
 */
import { schedule } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { parse } from "node-html-parser";

const SPORTS_URL = "https://www.denverpost.com/sports";
const FEED_TITLE = "Denver Post – Sports";
const FEED_DESCRIPTION = "Latest sports news from The Denver Post";
const BLOB_KEY = "rss-feed";

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildRss(articles) {
  const pubDate = new Date().toUTCString();

  const items = articles
    .map(({ title, url, description, pubDate: itemDate, author }) => {
      const itemPubDate = itemDate ? new Date(itemDate * 1000).toUTCString() : pubDate;
      const descCdata = description ? `<![CDATA[${description}]]>` : "";
      const authorTag = author ? `<author>${escapeXml(author)}</author>` : "";
      return `
    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${itemPubDate}</pubDate>
      ${authorTag}
      <description>${descCdata}</description>
    </item>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${escapeXml(SPORTS_URL)}</link>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${pubDate}</lastBuildDate>
    <atom:link href="/.netlify/functions/rss" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;
}

async function scrapeArticles() {
  const response = await fetch(SPORTS_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Denver Post: HTTP ${response.status}`);
  }

  const html = await response.text();
  const root = parse(html);

  const seen = new Set();
  const articles = [];

  for (const articleEl of root.querySelectorAll("article")) {
    const linkEl = articleEl.querySelector("a.article-title");
    if (!linkEl) continue;

    const url = linkEl.getAttribute("href")?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const title = linkEl.querySelector(".dfm-title")?.text?.trim() || linkEl.text.trim();
    if (!title) continue;

    // data-timestamp is unix seconds set on the <article> element
    const tsAttr = articleEl.getAttribute("data-timestamp");
    const pubDate = tsAttr ? parseInt(tsAttr, 10) : null;

    // Excerpt / description
    const excerptEl = articleEl.querySelector(".excerpt, .article-excerpt, p");
    const description = excerptEl?.text?.trim() || "";

    // Author — some layouts include a byline
    const authorEl = articleEl.querySelector(".byline, .author, .post-author");
    const author = authorEl?.text?.trim().replace(/^by\s+/i, "") || "";

    articles.push({ title, url, description, pubDate, author });
  }

  return articles;
}

const handler = schedule("@hourly", async () => {
  try {
    const articles = await scrapeArticles();

    if (articles.length === 0) {
      console.warn("No articles found — skipping blob write");
      return { statusCode: 200 };
    }

    const xml = buildRss(articles);

    const store = getStore("rss-cache");
    await store.set(BLOB_KEY, xml, { metadata: { generatedAt: new Date().toISOString() } });

    console.log(`RSS feed updated with ${articles.length} articles`);
    return { statusCode: 200 };
  } catch (err) {
    console.error("generate-rss error:", err);
    return { statusCode: 500 };
  }
});

export { handler };
