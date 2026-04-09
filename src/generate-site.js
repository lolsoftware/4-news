import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load existing articles from output directory.
 * Reads the index and also scans for detail-only articles (older than list cutoff
 * but still within detail retention period) to prevent re-processing.
 */
export function loadExistingArticles(outputDir) {
  const articlesById = new Map();

  // Load articles from index
  const indexPath = join(outputDir, 'api', 'articles.json');
  if (existsSync(indexPath)) {
    try {
      const data = JSON.parse(readFileSync(indexPath, 'utf-8'));
      for (const article of (data.articles || [])) {
        articlesById.set(article.id, article);
      }
    } catch { /* ignore corrupt index */ }
  }

  // Scan individual article files for detail-only articles not in the index
  const articlesDir = join(outputDir, 'api', 'articles');
  if (existsSync(articlesDir)) {
    for (const file of readdirSync(articlesDir)) {
      const id = file.replace('.json', '');
      if (!articlesById.has(id)) {
        try {
          const detail = JSON.parse(readFileSync(join(articlesDir, file), 'utf-8'));
          articlesById.set(id, detail);
        } catch { /* skip corrupt files */ }
      }
    }
  }

  // Enrich index articles with full content from detail files
  for (const [id, article] of articlesById) {
    if (!article.content) {
      const detailPath = join(outputDir, 'api', 'articles', `${id}.json`);
      if (existsSync(detailPath)) {
        try {
          const detail = JSON.parse(readFileSync(detailPath, 'utf-8'));
          article.content = detail.content;
        } catch { /* keep article without content */ }
      }
    }
  }

  return Array.from(articlesById.values());
}

/**
 * Merge new articles with existing, remove expired, enforce limits.
 * Returns { listArticles, allArticles } where listArticles are for the index
 * and allArticles includes detail-only articles (older but still retained).
 */
function mergeArticles(existing, newArticles, settings) {
  const listCutoff = Date.now() - settings.maxArticleAgeDays * 24 * 60 * 60 * 1000;
  const detailAgeDays = settings.maxArticleDetailAgeDays || settings.maxArticleAgeDays;
  const detailCutoff = Date.now() - detailAgeDays * 24 * 60 * 60 * 1000;

  const existingById = new Map(existing.map(a => [a.id, a]));

  // Add new articles (overwrite if same id)
  for (const article of newArticles) {
    existingById.set(article.id, article);
  }

  // All articles within detail retention period
  const allArticles = Array.from(existingById.values())
    .filter(a => new Date(a.publishedAt).getTime() > detailCutoff)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  // Articles for the list index (shorter retention)
  const listArticles = allArticles
    .filter(a => new Date(a.publishedAt).getTime() > listCutoff)
    .slice(0, settings.maxTotalArticles);

  return { listArticles, allArticles };
}

/**
 * Generate the static site output.
 */
export function generateSite(articles, outputDir, settings, siteUrl) {
  const existing = loadExistingArticles(outputDir);
  const { listArticles, allArticles } = mergeArticles(existing, articles, settings);

  // Create directories
  mkdirSync(join(outputDir, 'api', 'articles'), { recursive: true });
  mkdirSync(join(outputDir, 'images'), { recursive: true });

  // Write article index (only list-age articles, without full content)
  const index = {
    lastUpdated: new Date().toISOString(),
    categoryOrder: settings.categoryOrder || [],
    articles: listArticles.map(a => ({
      id: a.id,
      title: a.title,
      originalTitle: a.originalTitle,
      source: a.source,
      sourceId: a.sourceId,
      category: a.category,
      url: a.url,
      guid: a.guid,
      publishedAt: a.publishedAt,
      excerpt: a.excerpt,
      image: a.image,
      readingTimeMin: a.readingTimeMin,
      titleStatus: a.titleStatus,
      extractionFailed: a.extractionFailed,
    })),
  };
  writeFileSync(join(outputDir, 'api', 'articles.json'), JSON.stringify(index, null, 2));

  // Write individual article files (all articles within detail retention)
  for (const article of allArticles) {
    const articleFile = join(outputDir, 'api', 'articles', `${article.id}.json`);
    writeFileSync(articleFile, JSON.stringify({
      id: article.id,
      title: article.title,
      originalTitle: article.originalTitle,
      source: article.source,
      category: article.category,
      url: article.url,
      publishedAt: article.publishedAt,
      content: article.content,
      image: article.image,
      readingTimeMin: article.readingTimeMin,
      titleStatus: article.titleStatus,
    }, null, 2));
  }

  // Clean up article files older than detail retention period
  const validIds = new Set(allArticles.map(a => a.id));
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

  console.log(`Generated site: ${listArticles.length} listed, ${allArticles.length} total (${articles.length} new)`);
  return allArticles;
}
