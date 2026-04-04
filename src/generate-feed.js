import { writeFileSync } from 'fs';
import { join } from 'path';

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate RSS 2.0 feed from processed articles.
 */
export function generateFeed(articles, outputDir, siteUrl) {
  const maxItems = 50;
  const items = articles.slice(0, maxItems);

  const itemsXml = items.map(a => `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${siteUrl}/#/article/${a.id}</link>
      <description>${escapeXml(a.excerpt || '')}</description>
      <pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>
      <guid isPermaLink="false">${a.id}</guid>
      <source url="${escapeXml(a.url)}">${escapeXml(a.source)}</source>
    </item>`).join('\n');

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>News Reader</title>
    <link>${siteUrl}</link>
    <description>Personal ad-free news feed with AI-rewritten headlines</description>
    <language>pl</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
${itemsXml}
  </channel>
</rss>`;

  writeFileSync(join(outputDir, 'feed.xml'), feed);
  console.log(`Generated RSS feed: ${items.length} items`);
}
