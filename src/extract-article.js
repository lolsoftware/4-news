import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { createHash } from 'crypto';

// Suppress jsdom CSS parsing warnings
const virtualConsole = new VirtualConsole();
virtualConsole.on('error', () => {}); // Ignore CSS parse errors

/**
 * Extract clean article content from a URL using Readability.
 */
export async function extractArticle(item) {
  const id = createHash('sha256').update(item.articleUrl).digest('hex').slice(0, 12);

  try {
    const response = await fetch(item.articleUrl, {
      signal: AbortSignal.timeout(15000),
      headers: {
        // Real browser UA — sites like openai.com, medium.com return 403 to bot-style strings.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,pl;q=0.8',
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const dom = new JSDOM(html, { url: item.articleUrl, virtualConsole });
    const doc = dom.window.document;

    // Extract og:image before Readability modifies the DOM
    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content')
      || doc.querySelector('meta[name="og:image"]')?.getAttribute('content')
      || null;

    const article = new Readability(doc).parse();

    if (!article) {
      return makeFailedArticle(id, item, ogImage);
    }

    // Clean up article HTML: remove custom elements, empty tags, scripts
    let cleanContent = (article.content || '')
      .replace(/<(yennefer-island|yen-[a-z-]+|c-wiz)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<(yennefer-island|yen-[a-z-]+|c-wiz)[^>]*\/>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<(ad-placeholder|ad-slot)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<(ad-placeholder|ad-slot)[^>]*\/?>/gi, '')
      .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '') // Remove figure/media embeds
      .replace(/\s{3,}/g, ' ')
      .trim();

    // Estimate reading time (~200 words per minute)
    const wordCount = (article.textContent || '').split(/\s+/).length;
    const readingTimeMin = Math.max(1, Math.round(wordCount / 200));

    return {
      id,
      title: item.originalTitle,
      originalTitle: item.originalTitle,
      source: item.sourceName,
      sourceId: item.sourceId,
      category: item.category,
      lang: item.lang,
      useAI: item.useAI,
      url: item.articleUrl,
      guid: item.guid,
      publishedAt: new Date(item.pubDate).toISOString(),
      excerpt: article.excerpt || item.description?.slice(0, 200) || '',
      content: cleanContent,
      textContent: article.textContent || '',
      image: ogImage,
      readingTimeMin,
      extractionFailed: false,
    };
  } catch (err) {
    console.warn(`  Extraction failed for ${item.articleUrl}: ${err.message}`);
    return makeFailedArticle(id, item, null);
  }
}

function makeFailedArticle(id, item, image) {
  return {
    id,
    title: item.originalTitle,
    originalTitle: item.originalTitle,
    source: item.sourceName,
    sourceId: item.sourceId,
    category: item.category,
    lang: item.lang,
    useAI: item.useAI,
    url: item.articleUrl,
    guid: item.guid,
    publishedAt: new Date(item.pubDate).toISOString(),
    excerpt: item.description?.slice(0, 200) || '',
    content: `<p>${item.description || 'Could not extract article content.'}</p>`,
    textContent: item.description || '',
    image,
    readingTimeMin: 1,
    extractionFailed: true,
  };
}

/**
 * Extract articles with rate limiting per domain.
 */
export async function extractArticles(items) {
  const articles = [];
  const domainLastFetch = new Map();

  for (const item of items) {
    // Rate limit: 1s between requests to same domain
    try {
      const domain = new URL(item.articleUrl).hostname;
      const lastFetch = domainLastFetch.get(domain) || 0;
      const wait = Math.max(0, 1000 - (Date.now() - lastFetch));
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      domainLastFetch.set(domain, Date.now());
    } catch { /* ignore URL parse errors */ }

    console.log(`  Extracting: ${item.originalTitle.slice(0, 60)}...`);
    const article = await extractArticle(item);
    articles.push(article);
  }

  return articles;
}
