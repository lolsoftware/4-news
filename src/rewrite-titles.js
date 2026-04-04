import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

/**
 * Rewrite clickbait titles using Claude Haiku in a single batch call.
 * Falls back to original titles if API fails.
 */
export async function rewriteTitles(articles) {
  if (articles.length === 0) return articles;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('No ANTHROPIC_API_KEY set, keeping original titles');
    return articles;
  }

  console.log(`Rewriting ${articles.length} titles with Claude...`);

  const articlesForPrompt = articles.map((a, i) =>
    `${i + 1}. Title: "${a.originalTitle}"\n   Excerpt: "${a.excerpt?.slice(0, 200) || ''}"`
  ).join('\n\n');

  const prompt = `You rewrite clickbait news headlines into honest, informative summaries.

Rules:
- State what actually happened, not what might happen
- Remove emotional manipulation ("shocking", "you won't believe", etc.)
- Keep it under 120 characters
- If the original title is already honest and clear, return it unchanged
- Use the same language as the original title
- Use sentence case

For each article below, return ONLY a valid JSON array of rewritten titles in the same order. No other text.

Articles:
${articlesForPrompt}`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20241022',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text || '';
    // Extract JSON array from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');

    const titles = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(titles) || titles.length !== articles.length) {
      throw new Error(`Expected ${articles.length} titles, got ${titles.length}`);
    }

    return articles.map((article, i) => ({
      ...article,
      title: titles[i] || article.originalTitle,
    }));
  } catch (err) {
    console.warn(`Title rewriting failed: ${err.message}. Using original titles.`);
    return articles;
  }
}
