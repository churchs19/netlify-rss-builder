/**
 * On-demand Netlify Function — serves a cached RSS feed for any registered source.
 * Routed from /:source/rss.xml and /:source/feed via netlify.toml rewrites.
 *
 * The source slug is extracted from the original request URL path.
 * Falls back to a live scrape if no cached blob exists yet.
 */
import { getStore } from "@netlify/blobs";
import { buildRss } from "../lib/rss-utils.mjs";
import { sources } from "../sources/registry.mjs";

const BLOB_KEY = "rss-feed";

export default async function handler(req, _context) {
  // Extract slug from path: /<slug>/rss.xml or /<slug>/feed
  const { pathname } = new URL(req.url);
  const slug = pathname.split("/").filter(Boolean)[0];

  const source = sources[slug];
  if (!source) {
    return new Response(`Unknown source: "${slug}"`, { status: 404 });
  }

  try {
    const store = getStore(slug);
    let xml = await store.get(BLOB_KEY);

    // No cached feed yet — generate on the fly and persist
    if (!xml) {
      const articles = await source.scrapeArticles();
      xml = buildRss(articles, source.feedConfig);
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
    console.error(`${slug} rss handler error:`, err);
    return new Response("Failed to generate RSS feed", { status: 500 });
  }
}
