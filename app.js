/* =============================================================================
   rysosus.github.io — project directory index
   -----------------------------------------------------------------------------
   Fetches every public repository of the account that has GitHub Pages enabled
   and renders it as a card grid. Vanilla JS, no dependencies, no build step.

   A GitHub token is deliberately NOT used: this file is served verbatim to
   every visitor, so a token would be public. Unauthenticated api.github.com
   allows 60 requests per hour per IP, which one page load per visitor fits in.
   ========================================================================== */

/** Used when the site is not served from a `<user>.github.io` origin (e.g. localhost). */
const USERNAME_FALLBACK = 'ryosus';
const PER_PAGE = 100;
const SKELETON_COUNT = 6;

/** GitHub Linguist colours, so a badge reads at a glance. Unknown → neutral dot. */
const LANGUAGE_COLORS = {
  'TypeScript': '#3178c6',
  'JavaScript': '#f1e05a',
  'Python': '#3572a5',
  'HTML': '#e34c26',
  'CSS': '#563d7c',
  'SCSS': '#c6538c',
  'Shell': '#89e051',
  'PowerShell': '#012456',
  'C': '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  'Go': '#00add8',
  'Java': '#b07219',
  'Kotlin': '#a97bff',
  'Ruby': '#701516',
  'Rust': '#dea584',
  'PHP': '#4f5d95',
  'Swift': '#f05138',
  'Lua': '#000080',
  'Dart': '#00b4ab',
  'Jupyter Notebook': '#da5b0b',
  'Vue': '#41b883',
  'Svelte': '#ff3e00',
  'Astro': '#ff5a03',
  'MDX': '#fcb32c',
  'TeX': '#3d6117',
  'Haskell': '#5e5086',
  'Elixir': '#6e4a7e',
  'Nix': '#7e7eff',
  'Zig': '#ec915c',
  'R': '#198ce7',
  'Scala': '#c22d40',
  'Clojure': '#db5855',
  'Objective-C': '#438eff',
  'Dockerfile': '#384d54',
  'Makefile': '#427819',
};

const STAR_ICON = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 .75l2.16 4.38 4.84.7-3.5 3.41.83 4.82L8 11.79l-4.33 2.27.83-4.82L1 5.83l4.84-.7L8 .75Z"/></svg>';
const SEARCH_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6"/><path d="M10.4 10.4 14 14"/></svg>';
const WARN_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 1.8 1.4 13.2h13.2L8 1.8Z"/><path d="M8 6.4v3.1M8 11.5h.01"/></svg>';
const EMPTY_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.8 5.2h12.4v7.4a1.4 1.4 0 0 1-1.4 1.4H3.2a1.4 1.4 0 0 1-1.4-1.4V5.2Z"/><path d="M1.8 5.2 3.4 2h9.2l1.6 3.2"/></svg>';

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const ABSOLUTE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const CLOCK = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
const TIME_UNITS = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['week', 604_800_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

const USERNAME = detectUsername();
const PAGES_ORIGIN = `https://${USERNAME}.github.io`;
const PROFILE_URL = `https://github.com/${USERNAME}`;
const REPOS_URL = `https://api.github.com/users/${USERNAME}/repos?per_page=${PER_PAGE}&sort=updated`;

const grid = document.getElementById('grid');
const status = document.getElementById('status');
const filter = document.getElementById('filter');
const cardTemplate = document.getElementById('card-template');
const skeletonTemplate = document.getElementById('skeleton-template');

/** `{ el, haystack }` for every rendered card, in API order. */
let items = [];
let filterTimer = 0;

/** Derive the account from the origin (`ryosus.github.io`) so a rename cannot desync the list. */
function detectUsername() {
  const match = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  return match ? match[1] : USERNAME_FALLBACK;
}

/** Carries enough context for the UI to tell an API rate limit apart from any other failure. */
class ApiError extends Error {
  constructor(message, { rateLimited = false, resetAt = 0 } = {}) {
    super(message);
    this.name = 'ApiError';
    this.rateLimited = rateLimited;
    this.resetAt = resetAt;
  }
}

/** GitHub only returns public repositories to unauthenticated callers, which is exactly the audience here. */
async function load() {
  showSkeletons();
  setStatus('Loading projects…');
  grid.setAttribute('aria-busy', 'true');
  filter.disabled = true;

  try {
    const response = await fetch(REPOS_URL, { headers: { Accept: 'application/vnd.github+json' } });

    if (!response.ok) throw httpError(response);

    const repos = await response.json();
    if (!Array.isArray(repos)) throw new ApiError('The GitHub API returned an unexpected response.');

    render(repos.filter(isListable).map(toProject));
  } catch (error) {
    renderError(error);
  } finally {
    grid.removeAttribute('aria-busy');
  }
}

/** Requirement: Pages enabled, not a fork, and not this root portfolio repository itself. */
function isListable(repo) {
  return repo.has_pages === true && repo.fork !== true && repo.name.toLowerCase() !== `${USERNAME}.github.io`.toLowerCase();
}

function toProject(repo) {
  return {
    name: repo.name,
    description: repo.description ? repo.description.trim() : '',
    language: repo.language || '',
    stars: Number(repo.stargazers_count) || 0,
    updatedAt: repo.updated_at,
    url: projectUrl(repo),
    sourceUrl: repo.html_url,
    haystack: [repo.name, repo.description, repo.language, ...(repo.topics || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  };
}

/** Prefer the repository's own homepage when set; otherwise GitHub Pages' canonical path. */
function projectUrl(repo) {
  const homepage = (repo.homepage || '').trim();
  return homepage || `${PAGES_ORIGIN}/${repo.name}/`;
}

function httpError(response) {
  const remaining = response.headers.get('x-ratelimit-remaining');
  const retryAfter = Number(response.headers.get('retry-after'));
  const reset = Number(response.headers.get('x-ratelimit-reset'));

  if ((response.status === 403 || response.status === 429) && (remaining === '0' || retryAfter > 0)) {
    const resetAt = retryAfter > 0 ? Date.now() + retryAfter * 1000 : reset > 0 ? reset * 1000 : 0;
    return new ApiError('', { rateLimited: true, resetAt });
  }

  return new ApiError(`GitHub responded with ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`);
}

function render(projects) {
  items = projects.map((project) => ({ el: buildCard(project), haystack: project.haystack }));
  grid.replaceChildren(...items.map((item) => item.el));
  filter.value = '';
  filter.disabled = items.length === 0;
  filter.placeholder = items.length ? 'Filter projects…' : 'Nothing to filter';

  setStatus();
}

function buildCard(project) {
  const card = cardTemplate.content.firstElementChild.cloneNode(true);

  const link = card.querySelector('[data-link]');
  link.textContent = project.name;
  link.href = project.url;

  const source = card.querySelector('[data-source]');
  source.href = project.sourceUrl;
  source.title = `View source for ${project.name} on GitHub`;
  card.querySelector('[data-source-label]').textContent = `Source code for ${project.name} on GitHub`;

  const description = card.querySelector('[data-desc]');
  if (project.description) {
    description.textContent = project.description;
  } else {
    description.textContent = 'No description provided.';
    description.classList.add('is-empty');
  }

  card.querySelector('[data-meta]').append(
    languageBadge(project.language),
    starBadge(project.stars),
    updatedBadge(project.updatedAt),
  );

  return card;
}

function languageBadge(language) {
  const badge = document.createElement('span');
  badge.className = 'badge';

  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.setAttribute('aria-hidden', 'true');
  const color = LANGUAGE_COLORS[language];
  if (color) dot.style.setProperty('--dot', color);

  badge.append(dot, document.createTextNode(language || 'Unknown'));
  return badge;
}

function starBadge(stars) {
  const badge = document.createElement('span');
  badge.className = 'badge badge-stars';
  badge.append(svg(STAR_ICON), document.createTextNode(String(stars)), srOnly(stars === 1 ? ' star' : ' stars'));
  return badge;
}

function updatedBadge(iso) {
  const date = new Date(iso);
  const badge = document.createElement('time');
  badge.className = 'badge';
  badge.dateTime = iso;
  badge.title = `Last updated ${ABSOLUTE.format(date)} at ${CLOCK.format(date)}`;
  badge.textContent = relativeTime(date);
  return badge;
}

function relativeTime(date) {
  const elapsed = Date.now() - date.getTime();
  for (const [unit, ms] of TIME_UNITS) {
    if (elapsed >= ms) return RELATIVE.format(-Math.round(elapsed / ms), unit);
  }
  return 'just now';
}

function renderError(error) {
  const rateLimited = error instanceof ApiError && error.rateLimited;
  const message = rateLimited
    ? `The GitHub API allows 60 unauthenticated requests per hour and this network has used them all.${
        error.resetAt ? ` The limit resets at ${CLOCK.format(new Date(error.resetAt))}.` : ''
      }`
    : error instanceof ApiError
      ? error.message
      : 'Could not reach the GitHub API. Check your connection and try again.';

  items = [];
  filter.disabled = true;
  filter.value = '';

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'btn';
  retry.textContent = 'Try again';
  retry.addEventListener('click', load);

  grid.replaceChildren(
    panel({
      icon: WARN_ICON,
      title: rateLimited ? 'Rate limit reached' : "Couldn't load projects",
      body: message,
      actions: [retry, linkButton('Open GitHub profile', PROFILE_URL, true)],
    }),
  );

  setStatus(rateLimited ? 'Rate limit reached' : 'Could not load projects');
}

function panel({ icon, title, body, actions = [] }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  const iconEl = document.createElement('div');
  iconEl.className = 'panel-icon';
  iconEl.append(svg(icon));

  const heading = document.createElement('h2');
  heading.textContent = title;

  const text = document.createElement('p');
  text.textContent = body;

  wrapper.append(iconEl, heading, text);

  if (actions.length) {
    const row = document.createElement('div');
    row.className = 'panel-actions';
    row.append(...actions);
    wrapper.append(row);
  }

  return wrapper;
}

/** Secondary (outline) link, promoted to `.btn` when it sits next to a primary button. */
function linkButton(label, href, secondary = false) {
  const link = document.createElement('a');
  link.className = secondary ? 'btn btn-secondary' : 'btn';
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  return link;
}

function svg(markup) {
  const holder = document.createElement('span');
  holder.innerHTML = markup;
  return holder.firstElementChild;
}

function srOnly(text) {
  const span = document.createElement('span');
  span.className = 'sr-only';
  span.textContent = text;
  return span;
}

function showSkeletons() {
  grid.replaceChildren(
    ...Array.from({ length: SKELETON_COUNT }, () => skeletonTemplate.content.firstElementChild.cloneNode(true)),
  );
}

function setStatus(text) {
  status.textContent = text !== undefined ? text : summarize();
}

/** Owns every grid panel: counts visible cards, and surfaces empty / no-match states. */
function summarize() {
  for (const node of grid.querySelectorAll('.panel')) node.remove();

  const total = items.length;

  if (!total) {
    grid.append(
      panel({
        icon: EMPTY_ICON,
        title: 'No projects to show yet',
        body: 'No public repository on this account currently has GitHub Pages enabled. Check back later, or browse the account directly.',
        actions: [linkButton('Open GitHub profile', PROFILE_URL)],
      }),
    );
    return 'No projects to show yet';
  }

  const query = filter.value.trim().toLowerCase();

  for (const item of items) {
    item.el.hidden = query !== '' && !matches(item.haystack, query);
  }

  const visible = items.filter((item) => !item.el.hidden).length;

  if (!query) return `${total} project${total === 1 ? '' : 's'}`;

  if (!visible) {
    grid.append(
      panel({
        icon: SEARCH_ICON,
        title: `No projects match “${filter.value.trim()}”`,
        body: 'Try a shorter query, or clear the filter to see every project.',
      }),
    );
    return `No matches for “${filter.value.trim()}”`;
  }

  return `${visible} of ${total} project${total === 1 ? '' : 's'} matching “${filter.value.trim()}”`;
}

/** Every whitespace-separated term must appear somewhere in name, description, language, or topics. */
function matches(haystack, query) {
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

filter.addEventListener('input', () => {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => setStatus(), 120);
});

filter.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && filter.value) {
    event.stopPropagation();
    filter.value = '';
    setStatus();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  event.preventDefault();
  if (!filter.disabled) filter.focus();
});

load();
