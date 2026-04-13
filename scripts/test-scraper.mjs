/**
 * Local test script — validates every registered source's scraper and RSS output.
 * Run with: npm test
 *
 * To add a new source, register it in netlify/sources/registry.mjs —
 * the test runner picks it up automatically.
 */
import { buildRss } from "../netlify/lib/rss-utils.mjs";
import { sources } from "../netlify/sources/registry.mjs";

async function testSource(slug, source) {
  const { feedConfig, scrapeArticles } = source;
  console.log(`\n── ${slug} ${"─".repeat(50 - slug.length)}`);
  console.log(`Fetching ${feedConfig.siteUrl} ...`);

  const articles = await scrapeArticles();

  if (articles.length === 0) {
    throw new Error("No articles found. The page structure may have changed.");
  }

  console.log(`✓ Found ${articles.length} articles\n`);

  articles.slice(0, 5).forEach((a, i) => {
    console.log(`  [${i + 1}] ${a.title}`);
    console.log(`       ${a.url}`);
    if (a.pubDate) console.log(`       ${new Date(a.pubDate * 1000).toISOString()}`);
  });

  const xml = buildRss(articles, feedConfig);
  console.log(`\n✓ RSS XML generated — ${xml.length} chars`);
  console.log(`  atom:link self → ${feedConfig.feedUrl}`);
}

async function main() {
  let failed = false;
  for (const [slug, source] of Object.entries(sources)) {
    try {
      await testSource(slug, source);
    } catch (err) {
      console.error(`\n✗ ${slug} FAILED:`, err.message);
      failed = true;
    }
  }
  if (failed) process.exit(1);
  console.log("\n✓ All sources passed\n");
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
