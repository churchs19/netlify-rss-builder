/**
 * Scheduled Netlify Function — runs once per hour.
 * Scrapes the Denver Post sports page and caches the RSS feed in Netlify Blobs.
 */
import { schedule } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { buildRss } from "../lib/rss-utils.mjs";
import {
  BLOB_STORE,
  BLOB_KEY,
  feedConfig,
  scrapeArticles,
} from "../sources/denverpost.mjs";

const handler = schedule("@hourly", async () => {
  try {
    const articles = await scrapeArticles();

    if (articles.length === 0) {
      console.warn("denverpost: no articles found — skipping blob write");
      return { statusCode: 200 };
    }

    const xml = buildRss(articles, feedConfig);
    const store = getStore(BLOB_STORE);
    await store.set(BLOB_KEY, xml, {
      metadata: { generatedAt: new Date().toISOString() },
    });

    console.log(
      `denverpost: RSS feed updated with ${articles.length} articles`,
    );
    return { statusCode: 200 };
  } catch (err) {
    console.error("denverpost generate-rss error:", err);
    return { statusCode: 500 };
  }
});

export { handler };
