# netlify-rss-builder

A Netlify Function app that scrapes news sources and serves them as RSS 2.0 feeds. Each source has its own scheduled function that refreshes its feed hourly and caches the result in [Netlify Blobs](https://docs.netlify.com/blobs/overview/).

## Available feeds

| Source                                                    | Feed URL              | Refresh |
|-----------------------------------------------------------|-----------------------|---------|
| [Denver Post – Sports](https://www.denverpost.com/sports) | `/denverpost/rss.xml` | Hourly  |

## Project structure

```plaintext
netlify-rss-builder/
├── netlify.toml                          # Netlify config, function settings, and URL redirects
├── package.json
├── public/
│   └── index.html                        # Landing page listing all feeds
├── scripts/
│   └── test-scraper.mjs                  # Local test runner (npm test)
└── netlify/
    ├── lib/
    │   ├── rss-utils.mjs                 # Shared: buildRss(), escapeXml()
    │   └── fetch-html.mjs                # Shared: fetchHtml() with browser User-Agent
    ├── sources/
    │   ├── registry.mjs                  # Maps slug → source module (edit to add sources)
    │   └── denverpost.mjs                # Denver Post: feedConfig + scrapeArticles()
    └── functions/
        ├── generate-rss.mjs              # Scheduled @hourly — refreshes all registered sources
        └── rss.mjs                       # HTTP handler — serves /:source/rss.xml for any source
```

### Key conventions

- **`netlify/sources/registry.mjs`** — the single place to register a new source. Maps URL slug → source module.
- **`netlify/sources/<slug>.mjs`** — source-specific config and scraper. Exports `feedConfig` and `scrapeArticles()`.
- **`netlify/functions/generate-rss.mjs`** — one scheduled function for all sources. Loops the registry every hour, scrapes each source, and writes RSS XML to its Blob store.
- **`netlify/functions/rss.mjs`** — one HTTP function for all sources. Extracts the slug from the request URL path, looks it up in the registry, and serves the cached feed.
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

Adding a source now requires **two steps only** — no new function files, no `netlify.toml` changes.

### 1. Create the source module

Create `netlify/sources/<slug>.mjs`. It must export:

| Export           | Type             | Description                                |
|------------------|------------------|--------------------------------------------|
| `feedConfig`     | `object`         | `{ title, description, siteUrl, feedUrl }` |
| `scrapeArticles` | `async function` | Returns `Article[]` (see shape below)      |

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

**Example — `netlify/sources/mysite.mjs`:**

```js
import { parse } from "node-html-parser";
import { fetchHtml } from "../lib/fetch-html.mjs";

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

### 2. Register it in `netlify/sources/registry.mjs`

```js
import * as denverpost from "./denverpost.mjs";
import * as mysite     from "./mysite.mjs";       // add this

export const sources = {
  denverpost,
  mysite,                                          // add this
};
```

That's it. The generic `generate-rss` scheduler and `rss` HTTP handler pick it up automatically. The feed is immediately available at `/mysite/rss.xml` and `/mysite/feed`.

Then verify everything works before deploying:

```bash
npm test
```

## How it works

```plaintext
Every hour
  └─ generate-rss (one scheduled function for all sources)
       └─ for each source in registry.mjs:
            ├─ Fetches the source URL
            ├─ Parses HTML with node-html-parser
            ├─ Builds RSS 2.0 XML via buildRss()
            └─ Writes XML to Netlify Blobs (store: <slug> / key: "rss-feed")

On request to /<slug>/rss.xml
  └─ rss (one HTTP function for all sources)
       ├─ Extracts slug from the request URL path
       ├─ Looks up the source in registry.mjs
       ├─ Reads cached XML from Netlify Blobs (<slug> store)
       ├─ Falls back to live scrape if no cache exists
       └─ Returns RSS XML with Content-Type: application/rss+xml
```

## Dependencies

| Package                                                                  | Purpose                                        |
|--------------------------------------------------------------------------|------------------------------------------------|
| [`@netlify/functions`](https://www.npmjs.com/package/@netlify/functions) | `schedule()` helper for cron functions         |
| [`@netlify/blobs`](https://www.npmjs.com/package/@netlify/blobs)         | Persistent key-value store for caching RSS XML |
| [`node-html-parser`](https://www.npmjs.com/package/node-html-parser)     | Fast HTML parser for scraping article data     |
