# netlify-rss-builder

A Netlify Function app that scrapes news sources and serves them as RSS 2.0 feeds. Each source has its own scheduled function that refreshes its feed hourly and caches the result in [Netlify Blobs](https://docs.netlify.com/blobs/overview/).

## Available feeds

| Source                                                    | Feed URL              | Refresh |
|-----------------------------------------------------------|-----------------------|---------|
| [Denver Post – Sports](https://www.denverpost.com/sports) | `/denverpost/rss.xml` | Hourly  |

## Project structure

```plaintext
netlify-rss-builder/
├── netlify.toml                              # Netlify config, function settings, and URL redirects
├── package.json
├── public/
│   └── index.html                            # Landing page listing all feeds
├── scripts/
│   └── test-scraper.mjs                      # Local test runner (npm test)
└── netlify/
    ├── lib/
    │   ├── rss-utils.mjs                     # Shared: buildRss(), escapeXml()
    │   └── fetch-html.mjs                    # Shared: fetchHtml() with browser User-Agent
    ├── sources/
    │   └── denverpost.mjs                    # Denver Post: feedConfig + scrapeArticles()
    └── functions/
        ├── denverpost-generate-rss.mjs       # Scheduled — runs @hourly, writes to Blob store
        └── denverpost-rss.mjs                # HTTP handler — serves /denverpost/rss.xml
```

### Key conventions

- **`netlify/sources/<name>.mjs`** — source-specific config and scraper. Exports `feedConfig`, `BLOB_STORE`, `BLOB_KEY`, and `scrapeArticles()`.
- **`netlify/functions/<name>-generate-rss.mjs`** — scheduled function that scrapes and caches the feed. One per source.
- **`netlify/functions/<name>-rss.mjs`** — HTTP function that reads from the Blob cache and serves the feed. Falls back to a live scrape if no cache exists yet.
- **`netlify/lib/`** — shared utilities imported by all functions and sources.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Netlify CLI](https://docs.netlify.com/cli/get-started/) (`npm install -g netlify-cli`)

### Install dependencies

```bash
npm install
```

### Run tests locally

Validates that each source's scraper can reach its target URL and produce valid RSS XML:

```bash
npm test
```

### Local development

```bash
netlify dev
```

Feeds will be available at `http://localhost:8888/denverpost/rss.xml`.

### Deploy

```bash
netlify login        # one-time authentication
netlify deploy --prod
```

## Adding a new source

Follow these five steps to wire up a new RSS feed.

### 1. Create the source module

Create `netlify/sources/<name>.mjs`. It must export:

| Export           | Type             | Description                                    |
|------------------|------------------|------------------------------------------------|
| `BLOB_STORE`     | `string`         | Unique Netlify Blob store name for this source |
| `BLOB_KEY`       | `string`         | Key used to store the RSS XML within the store |
| `feedConfig`     | `object`.        | `{ title, description, siteUrl, feedUrl }`     |
| `scrapeArticles` | `async function` | Returns `Article[]` (see shape below)          |

**Article shape:**

```js
{
  title:        string,   // required
  url:          string,   // required — used as <link> and <guid>
  description?: string,   // shown as <description>
  pubDate?:     number,   // Unix timestamp in seconds
  author?:      string,
}
```

**Example:**

```js
// netlify/sources/mysite.mjs
import { parse } from "node-html-parser";
import { fetchHtml } from "../lib/fetch-html.mjs";

export const BLOB_STORE = "mysite";
export const BLOB_KEY   = "rss-feed";

export const feedConfig = {
  title:       "My Site – News",
  description: "Latest news from My Site",
  siteUrl:     "https://www.mysite.com/news",
  feedUrl:     "/mysite/rss.xml",
};

export async function scrapeArticles() {
  const html = await fetchHtml(feedConfig.siteUrl);
  const root = parse(html);
  const articles = [];

  for (const el of root.querySelectorAll("article")) {
    const linkEl = el.querySelector("a.headline");
    const url    = linkEl?.getAttribute("href")?.trim();
    const title  = linkEl?.text?.trim();
    if (!url || !title) continue;
    articles.push({ title, url });
  }

  return articles;
}
```

### 2. Create the scheduled function

Create `netlify/functions/<name>-generate-rss.mjs`:

```js
import { schedule } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { buildRss } from "../lib/rss-utils.mjs";
import { BLOB_STORE, BLOB_KEY, feedConfig, scrapeArticles } from "../sources/mysite.mjs";

const handler = schedule("@hourly", async () => {
  try {
    const articles = await scrapeArticles();
    if (articles.length === 0) {
      console.warn("mysite: no articles found — skipping blob write");
      return { statusCode: 200 };
    }
    const xml = buildRss(articles, feedConfig);
    const store = getStore(BLOB_STORE);
    await store.set(BLOB_KEY, xml, { metadata: { generatedAt: new Date().toISOString() } });
    console.log(`mysite: RSS feed updated with ${articles.length} articles`);
    return { statusCode: 200 };
  } catch (err) {
    console.error("mysite generate-rss error:", err);
    return { statusCode: 500 };
  }
});

export { handler };
```

### 3. Create the HTTP handler function

Create `netlify/functions/<name>-rss.mjs`:

```js
import { getStore } from "@netlify/blobs";
import { buildRss } from "../lib/rss-utils.mjs";
import { BLOB_STORE, BLOB_KEY, feedConfig, scrapeArticles } from "../sources/mysite.mjs";

export default async function handler(_req, _context) {
  try {
    const store = getStore(BLOB_STORE);
    let xml = await store.get(BLOB_KEY);

    if (!xml) {
      const articles = await scrapeArticles();
      xml = buildRss(articles, feedConfig);
      await store.set(BLOB_KEY, xml, { metadata: { generatedAt: new Date().toISOString() } });
    }

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("mysite rss handler error:", err);
    return new Response("Failed to generate RSS feed", { status: 500 });
  }
}
```

### 4. Add redirects to `netlify.toml`

```toml
[[redirects]]
  from = "/mysite/rss.xml"
  to   = "/.netlify/functions/mysite-rss"
  status = 200

[[redirects]]
  from = "/mysite/feed"
  to   = "/.netlify/functions/mysite-rss"
  status = 200
```

### 5. Register the source in the test runner

Add an entry to the `SOURCES` array in `scripts/test-scraper.mjs`:

```js
import {
  feedConfig as mysiteConfig,
  scrapeArticles as scrapeMysite,
} from "../netlify/sources/mysite.mjs";

const SOURCES = [
  { name: "Denver Post", config: denverpostConfig, scrape: scrapeDenverpost },
  { name: "My Site",     config: mysiteConfig,     scrape: scrapeMysite     }, // add this
];
```

Then verify everything works before deploying:

```bash
npm test
```

## How it works

```plaintext
Every hour
  └─ <name>-generate-rss (scheduled function)
       ├─ Fetches the source URL
       ├─ Parses HTML with node-html-parser
       ├─ Builds RSS 2.0 XML via buildRss()
       └─ Writes XML to Netlify Blobs (<BLOB_STORE> / <BLOB_KEY>)

On request to /<name>/rss.xml
  └─ <name>-rss (HTTP function)
       ├─ Reads cached XML from Netlify Blobs
       ├─ Falls back to live scrape if no cache exists
       └─ Returns RSS XML with Content-Type: application/rss+xml
```

## Dependencies

| Package                                                                  | Purpose                                        |
|--------------------------------------------------------------------------|------------------------------------------------|
| [`@netlify/functions`](https://www.npmjs.com/package/@netlify/functions) | `schedule()` helper for cron functions         |
| [`@netlify/blobs`](https://www.npmjs.com/package/@netlify/blobs)         | Persistent key-value store for caching RSS XML |
| [`node-html-parser`](https://www.npmjs.com/package/node-html-parser)     | Fast HTML parser for scraping article data     |
