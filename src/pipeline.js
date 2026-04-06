import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchFeeds } from './fetch-feeds.js';
import { extractArticles } from './extract-article.js';
import { rewriteTitles } from './rewrite-titles.js';
import { processImages } from './process-images.js';
import { generateSite, loadExistingArticles } from './generate-site.js';
import { generateFeed } from './generate-feed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const outputDir = resolve(process.env.OUTPUT_DIR || 'output');
  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';

  console.log(`Output: ${outputDir}`);
  console.log(`Site URL: ${siteUrl}`);
  mkdirSync(outputDir, { recursive: true });

  // Step 1: Fetch RSS feeds
  console.log('\n=== Step 1: Fetching RSS feeds ===');
  const { items, settings } = await fetchFeeds();

  if (items.length === 0) {
    console.log('No items found. Exiting.');
    return;
  }

  // Step 2: Filter out already-processed articles
  console.log('\n=== Step 2: Checking existing articles ===');
  const existing = loadExistingArticles(outputDir);
  const existingGuids = new Set(existing.map(a => a.guid).filter(Boolean));
  const existingUrls = new Set(existing.map(a => a.url));
  const ageCutoff = Date.now() - settings.maxArticleAgeDays * 24 * 60 * 60 * 1000;
  const newItems = items.filter(item => {
    if (existingGuids.has(item.guid) || existingUrls.has(item.articleUrl)) return false;
    if (new Date(item.pubDate).getTime() < ageCutoff) return false;
    return true;
  });
  console.log(`${newItems.length} new articles (${items.length - newItems.length} already processed)`);
  console.log(`Existing guids: ${existingGuids.size}, existing urls: ${existingUrls.size}`);
  for (const item of newItems.slice(0, 5)) {
    console.log(`  NEW: guid="${item.guid}" url="${item.articleUrl}" title="${item.originalTitle.slice(0, 50)}"`);
  }

  // Retry articles that failed AI processing
  const errorArticles = existing.filter(a => a.titleStatus === 'error');
  if (errorArticles.length > 0) {
    console.log(`${errorArticles.length} articles need AI retry`);
  }

  if (newItems.length === 0 && errorArticles.length === 0) {
    console.log('No new articles. Regenerating site with existing data.');
    generateSite([], outputDir, settings, siteUrl);
    generateFeed(existing, outputDir, siteUrl);
    return;
  }

  // Step 3: Extract article content
  console.log('\n=== Step 3: Extracting articles ===');
  let articles = await extractArticles(newItems);

  // Step 4: Rewrite titles with AI
  console.log('\n=== Step 4: Rewriting titles ===');
  const allToRewrite = [...articles, ...errorArticles];
  const rewritten = await rewriteTitles(allToRewrite);
  articles = rewritten.slice(0, articles.length);
  const retriedArticles = rewritten.slice(articles.length);

  // Step 5: Process images
  console.log('\n=== Step 5: Processing images ===');
  articles = await processImages(articles, outputDir, settings.imageMaxWidthPx);

  // Combine new articles with retried ones for site generation
  const articlesToWrite = [...articles, ...retriedArticles];

  // Step 6: Generate static site
  console.log('\n=== Step 6: Generating site ===');
  const allArticles = generateSite(articlesToWrite, outputDir, settings, siteUrl);

  // Step 7: Generate RSS feed
  console.log('\n=== Step 7: Generating RSS feed ===');
  generateFeed(allArticles, outputDir, siteUrl);

  console.log('\n=== Done! ===');
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
