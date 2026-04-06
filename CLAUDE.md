# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal ad-free news reader that aggregates RSS feeds from Polish news sources, rewrites clickbait titles using Claude AI, and deploys as a static PWA to GitHub Pages. No build tools, no framework — plain ES modules and vanilla JS.

## Commands

- `npm run process` — Run the full 7-step pipeline (requires `ANTHROPIC_API_KEY`)
- `npm run dev` — Run pipeline in local mode
- `npm ci` — Install dependencies

There are no tests, linter, or build step.

## Architecture

### Processing Pipeline (`src/pipeline.js`)

Sequential 7-step pipeline orchestrated by `pipeline.js`:

1. **fetch-feeds.js** — Parse RSS feeds from `config/sources.json`, resolve URL redirects, deduplicate
2. **extract-article.js** — Fetch article HTML, extract clean content with JSDOM + `@mozilla/readability`
3. **rewrite-titles.js** — Batch-send titles to Claude Haiku to remove clickbait (120 char limit)
4. **process-images.js** — Download og:image, optimize to WebP via `sharp`, content-addressed cache (SHA256 hash filenames)
5. **generate-site.js** — Write static JSON API files + copy PWA assets to output dir
6. **generate-feed.js** — Generate RSS 2.0 XML feed

Articles are merged with existing output data, enforcing age (`maxArticleAgeDays`) and count (`maxTotalArticles`) limits from `config/sources.json`.

### Frontend PWA (`site/`)

Single-page app with hash-based routing (`#/` list, `#/article/{id}` detail). Fetches from `api/articles.json` (index) and `api/articles/{id}.json` (full content). Service worker (`sw.js`) provides offline support: cache-first for images/static assets, network-first for API data.

### Output Structure

Pipeline writes to `output/` (gitignored, checked out from `gh-pages` branch in CI):
- `api/articles.json` — article index
- `api/articles/{id}.json` — individual article content
- `images/{hash}.webp` — optimized images
- `feed.xml` — RSS feed

## Environment

- `ANTHROPIC_API_KEY` — Required. Claude API key for title rewriting.
- `OUTPUT_DIR` — Output directory (default: `output/`)
- `SITE_URL` — Base URL for feed links (default: `http://localhost:3000`)

## CI/CD

GitHub Actions workflow (`.github/workflows/process.yml`) runs every 4 hours on schedule + manual dispatch. It checks out `gh-pages` into `output/`, runs the pipeline, then deploys back to `gh-pages` via `peaceiris/actions-gh-pages`.

## Key Patterns

- Rate limiting: 1 second delay between requests to the same domain
- AI-rewritten titles get a `(#)` badge in the frontend
- The pipeline is idempotent — it merges new articles with existing output, so partial reruns are safe
- Image caching is content-addressed (SHA256 of URL → filename), avoiding re-downloads
