/**
 * On-demand Netlify Function — serves the cached Denver Post RSS feed.
 * Redirected from /denverpost/rss.xml via netlify.toml.
 *
 * Falls back to a live scrape on first request before the scheduler has run.
 */
import { getStore } from "@netlify/blobs";
import { buildRss } from "../lib/rss-utils.mjs";
import {
  BLOB_STORE,
  BLOB_KEY,
  feedConfig,
  scrapeArticles,
} from "../sources/denverpost.mjs";

export default async function handler(_req, _context) {
  try {
    const store = getStore(BLOB_STORE);
    let xml = await store.get(BLOB_KEY);

    // No cached feed yet — generate on the fly and persist
    if (!xml) {
      const articles = await scrapeArticles();
      xml = buildRss(articles, feedConfig);
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
    console.error("denverpost rss handler error:", err);
    return new Response("Failed to generate RSS feed", { status: 500 });
  }
}
