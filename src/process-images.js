import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import sharp from 'sharp';

/**
 * Download and optimize lead images for articles.
 */
export async function processImages(articles, outputDir, maxWidth = 800) {
  const imagesDir = join(outputDir, 'images');
  mkdirSync(imagesDir, { recursive: true });
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const article of articles) {
    if (!article.image) continue;

    const hash = createHash('sha256').update(article.image).digest('hex').slice(0, 12);
    const filename = `${hash}.webp`;
    const filepath = join(imagesDir, filename);

    // Skip if already cached
    if (existsSync(filepath)) {
      article.image = `images/${filename}`;
      skipped++;
      continue;
    }

    try {
      const response = await fetch(article.image, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsReader/1.0)' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const buffer = Buffer.from(await response.arrayBuffer());
      const optimized = await sharp(buffer)
        .resize(maxWidth, null, { withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      writeFileSync(filepath, optimized);
      article.image = `images/${filename}`;
      processed++;
    } catch (err) {
      console.warn(`  Image failed for ${article.id}: ${err.message}`);
      article.image = null;
      failed++;
    }
  }

  console.log(`Images: ${processed} downloaded, ${skipped} cached, ${failed} failed`);
  return articles;
}
