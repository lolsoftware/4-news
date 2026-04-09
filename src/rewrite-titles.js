import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const VALID_CATEGORIES = ['Polska', 'Świat', 'Polityka', 'Gospodarka', 'Sport', 'Tech', 'Nauka', 'Kultura', 'Zdrowie', 'Lifestyle'];

const BATCH_SIZE = 30;

function tryParseResults(text) {
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Rewrite a batch of articles with Claude Haiku.
 */
async function rewriteBatch(batch) {
  const articlesForPrompt = batch.map((a, i) =>
    `${i + 1}. Title: "${a.originalTitle}"\n   Language: ${a.lang || 'auto'}\n   Excerpt: "${a.excerpt?.slice(0, 200) || ''}"`
  ).join('\n\n');

  const prompt = `You rewrite clickbait news headlines into honest, informative summaries and assign a category to each article.

Rules:
- CRITICAL: If the original title is NOT clickbait — i.e., it is factual, clear, and not emotionally manipulative — you MUST return the EXACT original title character-for-character. Do NOT rephrase, shorten, "improve", or make minor edits to non-clickbait titles.
- Only rewrite titles that use genuine clickbait tactics: withholding key information, emotional bait, vague teasers, "you won't believe" patterns, etc.
- When rewriting, state what actually happened, not what might happen
- Remove emotional manipulation ("shocking", "you won't believe", etc.)
- Keep rewritten titles under 120 characters
- Write each title in the language specified for that article (pl = Polish, en = English). If language is "auto", detect from the title and excerpt.
- Use sentence case
- Assign exactly one category from: Polska, Świat, Polityka, Gospodarka, Sport, Tech, Nauka, Kultura, Zdrowie, Lifestyle

For each article below, return ONLY a valid JSON array of objects with "title" and "category" fields, in the same order. No other text.

Articles:
${articlesForPrompt}`;

  const messages = [{ role: 'user', content: prompt }];

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 8192,
    messages,
  });

  let text = response.content[0]?.text || '';
  let results = tryParseResults(text);

  // If JSON is invalid, ask Haiku to fix it
  if (!results) {
    console.log('    Invalid JSON, requesting fix...');
    messages.push({ role: 'assistant', content: text });
    messages.push({ role: 'user', content: 'Your response contains invalid JSON. Please return ONLY a valid JSON array of objects with "title" and "category" fields. No other text.' });

    const retry = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 8192,
      messages,
    });

    text = retry.content[0]?.text || '';
    results = tryParseResults(text);
    if (!results) throw new Error('Invalid JSON after retry');
  }

  if (results.length !== batch.length) {
    throw new Error(`Expected ${batch.length} results, got ${results.length}`);
  }

  const normalize = s => s.trim().replace(/\s+/g, ' ').toLowerCase();

  return batch.map((article, i) => {
    const newTitle = results[i]?.title || article.originalTitle;
    // Safety net: treat minor whitespace/case-only differences as unchanged
    const isMinorEdit = normalize(newTitle) === normalize(article.originalTitle);
    const finalTitle = isMinorEdit ? article.originalTitle : newTitle;
    return {
      ...article,
      title: finalTitle,
      titleStatus: finalTitle !== article.originalTitle ? 'rewritten' : 'ok',
      category: VALID_CATEGORIES.includes(results[i]?.category) ? results[i].category : article.category,
    };
  });
}

/**
 * Rewrite clickbait titles using Claude Haiku in batches.
 * Falls back to original titles per batch if API fails.
 */
export async function rewriteTitles(articles) {
  if (articles.length === 0) return articles;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('No ANTHROPIC_API_KEY set, keeping original titles');
    return articles.map(article => ({ ...article, titleStatus: 'error' }));
  }

  console.log(`Rewriting ${articles.length} titles with Claude (batches of ${BATCH_SIZE})...`);

  const results = [];
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(articles.length / BATCH_SIZE);
    console.log(`  Batch ${batchNum}/${totalBatches} (${batch.length} articles)...`);

    try {
      const rewritten = await rewriteBatch(batch);
      results.push(...rewritten);
    } catch (err) {
      console.warn(`  Batch ${batchNum} failed: ${err.message}. Using original titles.`);
      results.push(...batch.map(article => ({ ...article, titleStatus: 'error' })));
    }
  }

  return results;
}
