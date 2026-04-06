import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const VALID_CATEGORIES = ['Polska', 'Świat', 'Polityka', 'Gospodarka', 'Sport', 'Tech', 'Nauka', 'Kultura', 'Zdrowie', 'Lifestyle'];

/**
 * Rewrite clickbait titles using Claude Haiku in a single batch call.
 * Falls back to original titles if API fails.
 */
export async function rewriteTitles(articles) {
  if (articles.length === 0) return articles;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('No ANTHROPIC_API_KEY set, keeping original titles');
    return articles.map(article => ({ ...article, titleStatus: 'error' }));
  }

  console.log(`Rewriting ${articles.length} titles with Claude...`);

  const articlesForPrompt = articles.map((a, i) =>
    `${i + 1}. Title: "${a.originalTitle}"\n   Excerpt: "${a.excerpt?.slice(0, 200) || ''}"`
  ).join('\n\n');

  const prompt = `You rewrite clickbait news headlines into honest, informative summaries and assign a category to each article.

Rules:
- State what actually happened, not what might happen
- Remove emotional manipulation ("shocking", "you won't believe", etc.)
- Keep it under 120 characters
- If the original title is already honest and clear, return it unchanged
- Always write the title in Polish, regardless of the original language
- Use sentence case
- Assign exactly one category from: Polska, Świat, Polityka, Gospodarka, Sport, Tech, Nauka, Kultura, Zdrowie, Lifestyle

For each article below, return ONLY a valid JSON array of objects with "title" and "category" fields, in the same order. No other text.

Articles:
${articlesForPrompt}`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text || '';
    // Extract JSON array from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');

    const results = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(results) || results.length !== articles.length) {
      throw new Error(`Expected ${articles.length} results, got ${results.length}`);
    }

    return articles.map((article, i) => {
      const newTitle = results[i]?.title || article.originalTitle;
      return {
        ...article,
        title: newTitle,
        titleStatus: newTitle !== article.originalTitle ? 'rewritten' : 'ok',
        category: VALID_CATEGORIES.includes(results[i]?.category) ? results[i].category : article.category,
      };
    });
  } catch (err) {
    console.warn(`Title rewriting failed: ${err.message}. Using original titles.`);
    return articles.map(article => ({ ...article, titleStatus: 'error' }));
  }
}
