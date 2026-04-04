import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load existing articles from output directory.
 * Reads the index and enriches each article with full content from its detail file.
 */
export function loadExistingArticles(outputDir) {
  const indexPath = join(outputDir, 'api', 'articles.json');
  if (!existsSync(indexPath)) return [];
  try {
    const data = JSON.parse(readFileSync(indexPath, 'utf-8'));
    const articles = data.articles || [];

    // Enrich with full content from individual article files
    for (const article of articles) {
      const detailPath = join(outputDir, 'api', 'articles', `${article.id}.json`);
      if (existsSync(detailPath)) {
        try {
          const detail = JSON.parse(readFileSync(detailPath, 'utf-8'));
          article.content = detail.content;
        } catch { /* keep article without content */ }
      }
    }

    return articles;
  } catch {
    return [];
  }
}

/**
 * Merge new articles with existing, remove expired, enforce limits.
 */
function mergeArticles(existing, newArticles, settings) {
  const cutoff = Date.now() - settings.maxArticleAgeDays * 24 * 60 * 60 * 1000;
  const existingById = new Map(existing.map(a => [a.id, a]));

  // Add new articles (overwrite if same id)
  for (const article of newArticles) {
    existingById.set(article.id, article);
  }

  // Filter out expired and sort by date
  const merged = Array.from(existingById.values())
    .filter(a => new Date(a.publishedAt).getTime() > cutoff)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, settings.maxTotalArticles);

  return merged;
}

/**
 * Generate the static site output.
 */
export function generateSite(articles, outputDir, settings, siteUrl) {
  const existing = loadExistingArticles(outputDir);
  const merged = mergeArticles(existing, articles, settings);

  // Create directories
  mkdirSync(join(outputDir, 'api', 'articles'), { recursive: true });
  mkdirSync(join(outputDir, 'images'), { recursive: true });

  // Write article index (without full content)
  const index = {
    lastUpdated: new Date().toISOString(),
    articles: merged.map(a => ({
      id: a.id,
      title: a.title,
      originalTitle: a.originalTitle,
      source: a.source,
      sourceId: a.sourceId,
      category: a.category,
      url: a.url,
      publishedAt: a.publishedAt,
      excerpt: a.excerpt,
      image: a.image,
      readingTimeMin: a.readingTimeMin,
      extractionFailed: a.extractionFailed,
    })),
  };
  writeFileSync(join(outputDir, 'api', 'articles.json'), JSON.stringify(index, null, 2));

  // Write individual article files
  for (const article of merged) {
    const articleFile = join(outputDir, 'api', 'articles', `${article.id}.json`);
    writeFileSync(articleFile, JSON.stringify({
      id: article.id,
      title: article.title,
      originalTitle: article.originalTitle,
      source: article.source,
      url: article.url,
      publishedAt: article.publishedAt,
      content: article.content,
      image: article.image,
      readingTimeMin: article.readingTimeMin,
    }, null, 2));
  }

  // Clean up old article files not in the merged set
  const validIds = new Set(merged.map(a => a.id));
  const articlesDir = join(outputDir, 'api', 'articles');
  if (existsSync(articlesDir)) {
    for (const file of readdirSync(articlesDir)) {
      const id = file.replace('.json', '');
      if (!validIds.has(id)) {
        unlinkSync(join(articlesDir, file));
      }
    }
  }

  // Copy PWA static files
  const siteDir = join(__dirname, '..', 'site');
  if (existsSync(siteDir)) {
    for (const file of readdirSync(siteDir)) {
      cpSync(join(siteDir, file), join(outputDir, file), { recursive: true });
    }
  }

  console.log(`Generated site: ${merged.length} articles (${articles.length} new)`);
  return merged;
}
