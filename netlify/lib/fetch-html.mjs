/**
 * Shared HTTP helper for fetching HTML pages.
 */

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
};

/**
 * Fetches a URL and returns the response body as a string.
 * Throws if the response status is not OK.
 */
export async function fetchHtml(url, extraHeaders = {}) {
  const response = await fetch(url, {
    headers: { ...DEFAULT_HEADERS, ...extraHeaders },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }

  return response.text();
}
