/**
 * On-demand Netlify Function — serves the cached RSS feed.
 * GET /.netlify/functions/rss
 *
 * If no cached feed exists yet, it generates one on the fly so the
 * endpoint is usable immediately after deployment.
 */
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

    const tsAttr = articleEl.getAttribute("data-timestamp");
    const pubDate = tsAttr ? parseInt(tsAttr, 10) : null;

    const excerptEl = articleEl.querySelector(".excerpt, .article-excerpt, p");
    const description = excerptEl?.text?.trim() || "";

    const authorEl = articleEl.querySelector(".byline, .author, .post-author");
    const author = authorEl?.text?.trim().replace(/^by\s+/i, "") || "";

    articles.push({ title, url, description, pubDate, author });
  }

  return articles;
}

export default async function handler(req, context) {
  try {
    const store = getStore("rss-cache");
    let xml = await store.get(BLOB_KEY);

    // No cached feed yet — generate on the fly
    if (!xml) {
      const articles = await scrapeArticles();
      xml = buildRss(articles);
      // Persist for subsequent requests
      await store.set(BLOB_KEY, xml, {
        metadata: { generatedAt: new Date().toISOString() },
      });
    }

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("rss handler error:", err);
    return new Response("Failed to generate RSS feed", { status: 500 });
  }
}
