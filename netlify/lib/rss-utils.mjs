/**
 * Shared RSS 2.0 utilities.
 *
 * buildRss(articles, feedConfig) — returns a complete RSS XML string.
 *
 * feedConfig: {
 *   title       : string   — channel title
 *   description : string   — channel description
 *   siteUrl     : string   — link to the source site
 *   feedUrl     : string   — public URL of this feed (used in atom:link self-ref)
 * }
 *
 * articles[]: {
 *   title       : string
 *   url         : string
 *   description?: string
 *   pubDate?    : number   — Unix timestamp (seconds)
 *   author?     : string
 *   imageUrl?   : string   — absolute URL to a preview image
 *   previewImageUrl?: string — alias for imageUrl
 * }
 */

export function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildRss(articles, feedConfig) {
  const { title, description, siteUrl, feedUrl } = feedConfig;
  const buildDate = new Date().toUTCString();

  const items = articles
    .map(
      ({
        title: itemTitle,
        url,
        description: desc,
        pubDate: itemDate,
        author,
        imageUrl,
        previewImageUrl,
      }) => {
        const itemPubDate = itemDate
          ? new Date(itemDate * 1000).toUTCString()
          : buildDate;
        const descCdata = desc ? `<![CDATA[${desc}]]>` : "";
        const authorTag = author ? `<author>${escapeXml(author)}</author>` : "";
        const itemImage = imageUrl || previewImageUrl;
        const imageTag = itemImage
          ? `<media:content url="${escapeXml(itemImage)}" medium="image"/>`
          : "";
        return `
    <item>
      <title>${escapeXml(itemTitle)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${itemPubDate}</pubDate>
      ${authorTag}
      ${imageTag}
      <description>${descCdata}</description>
    </item>`;
      },
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(description)}</description>
    <language>en-us</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;
}
