/**
 * Local test script — validates each source's scraper and RSS output without Netlify.
 * Run with: npm test
 *
 * To add a new source, import it and add an entry to the SOURCES array.
 */
import { buildRss } from "../netlify/lib/rss-utils.mjs";
import {
  feedConfig as denverpostConfig,
  scrapeArticles as scrapeDenverpost,
} from "../netlify/sources/denverpost.mjs";

const SOURCES = [
  { name: "Denver Post", config: denverpostConfig, scrape: scrapeDenverpost },
];

async function testSource({ name, config, scrape }) {
  console.log(`\n── ${name} ${"─".repeat(50 - name.length)}`);
  console.log(`Fetching ${config.siteUrl} ...`);

  const articles = await scrape();

  if (articles.length === 0) {
    throw new Error("No articles found. The page structure may have changed.");
  }

  console.log(`✓ Found ${articles.length} articles\n`);

  articles.slice(0, 5).forEach((a, i) => {
    console.log(`  [${i + 1}] ${a.title}`);
    console.log(`       ${a.url}`);
    if (a.pubDate)
      console.log(`       ${new Date(a.pubDate * 1000).toISOString()}`);
  });

  const xml = buildRss(articles, config);
  console.log(`\n✓ RSS XML generated — ${xml.length} chars`);
  console.log(`  atom:link self → ${config.feedUrl}`);
}

async function main() {
  let failed = false;
  for (const source of SOURCES) {
    try {
      await testSource(source);
    } catch (err) {
      console.error(`\n✗ ${source.name} FAILED:`, err.message);
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
