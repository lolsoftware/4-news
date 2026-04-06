import Parser from 'rss-parser';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

/**
 * Resolve redirect URLs to actual article URLs.
 * Follows HTTP redirects for URLs that might be proxied (e.g., feedburner).
 */
async function resolveUrl(url) {
  // Skip Google News encoded URLs -- they use encrypted redirects
  // that can't be reliably decoded. Use direct RSS feeds instead.
  if (url.includes('news.google.com/rss/articles/')) return url;

  // For other redirect services (feedburner, etc.), follow redirects
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    return response.url;
  } catch {
    return url;
  }
}

/**
 * Fetch all enabled RSS feeds and return deduplicated items.
 */
export async function fetchFeeds() {
  const configPath = join(__dirname, '..', 'config', 'sources.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const enabledSources = config.sources.filter(s => s.enabled);

  const allItems = [];
  const seenUrls = new Set();

  for (const source of enabledSources) {
    console.log(`Fetching: ${source.name} (${source.url})`);
    try {
      const feed = await parser.parseURL(source.url);
      const items = feed.items.slice(0, config.settings.maxArticlesPerSource);

      for (const item of items) {
        const rawUrl = item.link || item.guid;
        if (!rawUrl) continue;

        const resolvedUrl = await resolveUrl(rawUrl);
        if (seenUrls.has(resolvedUrl)) continue;
        seenUrls.add(resolvedUrl);

        allItems.push({
          sourceId: source.id,
          sourceName: source.name,
          category: source.category,
          originalTitle: item.title || 'Untitled',
          pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
          articleUrl: resolvedUrl,
          guid: item.guid || resolvedUrl,
          description: item.contentSnippet || item.content || '',
        });
      }

      console.log(`  Got ${items.length} items from ${source.name}`);
    } catch (err) {
      console.warn(`  Failed to fetch ${source.name}: ${err.message}`);
    }
  }

  console.log(`Total unique items: ${allItems.length}`);
  return { items: allItems, settings: config.settings };
}
