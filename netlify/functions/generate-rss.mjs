/**
 * Scheduled Netlify Function — runs once per hour.
 * Iterates every registered source, scrapes articles, builds RSS XML,
 * and writes the result to that source's Netlify Blob store.
 */
import { schedule } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { buildRss } from "../lib/rss-utils.mjs";
import { sources } from "../sources/registry.mjs";

const BLOB_KEY = "rss-feed";

async function refreshSource(slug, source) {
  const articles = await source.scrapeArticles();

  if (articles.length === 0) {
    console.warn(`${slug}: no articles found — skipping blob write`);
    return;
  }

  const xml = buildRss(articles, source.feedConfig);
  const store = getStore(slug);
  await store.set(BLOB_KEY, xml, {
    metadata: { generatedAt: new Date().toISOString() },
  });
  console.log(`${slug}: RSS feed updated with ${articles.length} articles`);
}

const handler = schedule("@hourly", async () => {
  const results = await Promise.allSettled(
    Object.entries(sources).map(([slug, source]) =>
      refreshSource(slug, source),
    ),
  );

  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      const slug = Object.keys(sources)[i];
      console.error(`${slug}: generate-rss error —`, result.reason);
    }
  }

  return { statusCode: 200 };
});

export { handler };
