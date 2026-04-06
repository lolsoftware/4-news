const API_BASE = 'api';
const CACHE_KEY = 'news-articles';

let articlesData = null;
let currentFilter = 'all';
let savedScrollY = 0;

// --- Routing ---

function getRoute() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#/article/')) {
    return { view: 'article', id: hash.slice(10) };
  }
  return { view: 'list' };
}

function navigate(hash) {
  location.hash = hash;
}

// --- Time formatting ---

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// --- Data fetching ---

async function fetchArticles(force = false) {
  if (articlesData && !force) return articlesData;

  try {
    const res = await fetch(`${API_BASE}/articles.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    articlesData = await res.json();
    localStorage.setItem(CACHE_KEY, JSON.stringify(articlesData));
  } catch {
    // Fall back to cache
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      articlesData = JSON.parse(cached);
    } else {
      articlesData = { articles: [], lastUpdated: null };
    }
  }

  return articlesData;
}

async function fetchArticleDetail(id) {
  try {
    const res = await fetch(`${API_BASE}/articles/${id}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

// --- Rendering ---

function renderFilters(articles) {
  const filtersEl = document.getElementById('filters');
  const uniqueCategories = [...new Set(articles.map(a => a.category).filter(Boolean))];

  // Hide filters if only one category (e.g. all "general")
  if (uniqueCategories.length <= 1) {
    filtersEl.innerHTML = '';
    currentFilter = 'all';
    return;
  }

  const categories = ['all', ...uniqueCategories];

  filtersEl.innerHTML = categories.map(cat =>
    `<button class="pill${cat === currentFilter ? ' active' : ''}" data-cat="${cat}">${cat === 'all' ? 'Wszystko' : cat}</button>`
  ).join('');

  filtersEl.querySelectorAll('.pill').forEach(btn => {
    btn.onclick = () => {
      currentFilter = btn.dataset.cat;
      renderList(articlesData);
    };
  });
}

function renderList(data) {
  const content = document.getElementById('content');
  const headerTitle = document.getElementById('header-title');
  headerTitle.textContent = 'News';
  document.getElementById('app').classList.remove('article-view');

  const articles = currentFilter === 'all'
    ? data.articles
    : data.articles.filter(a => a.category === currentFilter);

  renderFilters(data.articles);

  if (articles.length === 0) {
    content.innerHTML = '<div class="empty-state">No articles yet</div>';
    return;
  }

  const updatedHtml = data.lastUpdated
    ? `<div class="updated-time">Updated ${timeAgo(data.lastUpdated)}</div>`
    : '';

  content.innerHTML = updatedHtml + articles.map(a => {
    const aiChanged = a.title !== a.originalTitle;
    const titlePrefix = aiChanged ? '<span class="ai-badge">(#)</span> ' : '';
    return `
    <a class="article-card" href="#/article/${a.id}">
      <div class="article-card-body">
        <div class="article-card-source">${escapeHtml(a.source)}</div>
        <div class="article-card-title">${titlePrefix}${escapeHtml(a.title)}</div>
        <div class="article-card-meta">${timeAgo(a.publishedAt)} &middot; ${a.readingTimeMin} min read</div>
      </div>
      ${a.image ? `<img class="article-card-thumb" src="${a.image}" alt="" loading="lazy">` : ''}
    </a>
  `;}).join('');
}

async function renderArticle(id) {
  const content = document.getElementById('content');
  const headerTitle = document.getElementById('header-title');
  const filtersEl = document.getElementById('filters');
  filtersEl.innerHTML = '';

  // Save scroll position before navigating away from list
  savedScrollY = window.scrollY;

  document.getElementById('app').classList.add('article-view');
  content.innerHTML = '<div id="loading">Loading article...</div>';

  const article = await fetchArticleDetail(id);
  if (!article) {
    content.innerHTML = '<div class="empty-state">Article not found</div>';
    return;
  }

  headerTitle.textContent = article.source || 'Article';

  const titleChanged = article.title !== article.originalTitle;
  const aiPrefix = titleChanged ? '<span class="ai-badge">(#)</span> ' : '';
  const originalTitleHtml = titleChanged
    ? `<div class="original-title">Oryginalny tytu\u0142: ${escapeHtml(article.originalTitle)}</div>`
    : '';

  content.innerHTML = `
    <div class="article-detail">
      <a class="back-btn" href="#/">&larr; Back</a>
      ${article.image ? `<img class="article-detail-image" src="${article.image}" alt="">` : ''}
      <h1 class="article-detail-title">${aiPrefix}${escapeHtml(article.title)}</h1>
      ${originalTitleHtml}
      <div class="article-detail-meta">
        ${escapeHtml(article.source)} &middot; ${timeAgo(article.publishedAt)} &middot; ${article.readingTimeMin} min read
      </div>
      <div class="article-detail-content">${article.content}</div>
      <a class="article-source-link" href="${article.url}" target="_blank" rel="noopener">Read original &rarr;</a>
    </div>
  `;

  // Scroll to top
  window.scrollTo(0, 0);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// --- Init ---

async function init() {
  const data = await fetchArticles();
  handleRoute();
}

function handleRoute() {
  const route = getRoute();
  if (route.view === 'article') {
    renderArticle(route.id);
  } else {
    renderList(articlesData || { articles: [] });
    // Restore scroll position when returning to list
    requestAnimationFrame(() => window.scrollTo(0, savedScrollY));
  }
}

window.addEventListener('hashchange', handleRoute);

document.getElementById('refresh-btn').onclick = async () => {
  await fetchArticles(true);
  handleRoute();
};

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
