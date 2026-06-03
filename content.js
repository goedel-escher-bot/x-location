(function () {
  'use strict';

  // ── Storage (localStorage, scoped to twitter.com / x.com) ─────────────────

  const LS_COUNTRIES = 'xloc_countries'; // { screenName_lower: "US" }
  const LS_USERIDS   = 'xloc_userids';   // { screenName_lower: "123456" }
  const LS_QUERY     = 'xloc_query';     // { queryId, features }

  const countries = new Map(Object.entries(JSON.parse(localStorage.getItem(LS_COUNTRIES) || '{}')));
  const userIds   = new Map(Object.entries(JSON.parse(localStorage.getItem(LS_USERIDS)   || '{}')));
  const _savedQuery = JSON.parse(localStorage.getItem(LS_QUERY) || 'null');
  let   queryInfo = (_savedQuery?.endpoint && _savedQuery?.queryId) ? _savedQuery : null;
  if (!queryInfo) localStorage.removeItem(LS_QUERY);

  const requested = new Set(); // usernames we've already tried to fetch

  function saveCountries() { localStorage.setItem(LS_COUNTRIES, JSON.stringify(Object.fromEntries(countries))); }
  function saveUserIds()   { localStorage.setItem(LS_USERIDS,   JSON.stringify(Object.fromEntries(userIds)));   }

  // ── Extract user data from any GraphQL response object ────────────────────

  function digest(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 15) return;
    if (Array.isArray(obj)) { obj.forEach(v => digest(v, depth + 1)); return; }

    // About-page format: result.core.screen_name + result.about_profile.account_based_in
    if (obj.about_profile?.account_based_in && obj.core?.screen_name) {
      const key     = obj.core.screen_name.toLowerCase();
      const country = obj.about_profile.account_based_in;
      if (!countries.has(key)) {
        countries.set(key, country);
        saveCountries();
        updateAllBadges();
      }
    }

    // Standard GraphQL user result: obj.legacy.screen_name
    if (obj.legacy?.screen_name) {
      const key    = obj.legacy.screen_name.toLowerCase();
      const userId = obj.rest_id || obj.legacy.id_str;
      if (userId && !userIds.has(key)) { userIds.set(key, userId); saveUserIds(); }
    }

    Object.values(obj).forEach(v => { if (v && typeof v === 'object') digest(v, depth + 1); });
  }

  // ── Intercept fetch to capture Twitter's own API responses ────────────────

  // Capture queryId from the response that actually contains about_profile data
  function tryCapture(url, data) {
    if (!JSON.stringify(data).includes('about_profile')) return;
    if (!url.includes('graphql')) return;
    try {
      const queryId  = url.match(/graphql\/([^/]+)\//)?.[1];
      const endpoint = url.match(/graphql\/[^/]+\/([^?]+)/)?.[1];
      if (!queryId || !endpoint) return;
      const u            = new URL(url);
      const vars         = JSON.parse(u.searchParams.get('variables') || '{}');
      const features     = u.searchParams.get('features') || '';
      const screenNameKey = 'screenName' in vars ? 'screenName' : 'screen_name';
      const extraVars    = Object.fromEntries(Object.entries(vars).filter(([k]) => k !== screenNameKey));
      queryInfo = { queryId, endpoint, features, extraVars, screenNameKey };
      localStorage.setItem(LS_QUERY, JSON.stringify(queryInfo));
      updateAllBadges();
    } catch (_) {}
  }

  const _fetch = window.fetch;
  window.fetch = async function (resource, init) {
    const url = typeof resource === 'string' ? resource : (resource?.url || '');
    const response = await _fetch.apply(this, arguments);

    if (url.includes('/i/api/graphql') || url.includes('/i/api/1.1')) {
      response.clone().json().then(data => {
        tryCapture(url, data);
        digest(data, 0);
      }).catch(() => {});
    }

    return response;
  };

  // Also intercept XHR (older Twitter code paths)
  const _xhrOpen = XMLHttpRequest.prototype.open;
  const _xhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._xloc_url = url;
    return _xhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    if (this._xloc_url) {
      if (this._xloc_url.includes('/i/api/graphql') || this._xloc_url.includes('/i/api/1.1')) {
        this.addEventListener('load', () => {
          try {
            const data = JSON.parse(this.responseText);
            tryCapture(this._xloc_url, data);
            digest(data, 0);
          } catch (_) {}
        });
      }
    }
    return _xhrSend.apply(this, arguments);
  };

  // ── Active fetching (once we have a queryId from passive sniffing) ─────────

  // Twitter's standard web-app bearer token (public, same for all users)
  const BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

  async function fetchAbout(screenName) {
    const key = screenName.toLowerCase();
    if (countries.has(key) || requested.has(key)) return;
    if (!queryInfo) return;  // don't block retries — queryInfo may arrive later
    requested.add(key);

    try {
      const nameKey  = queryInfo.screenNameKey || 'screenName';
      const vars     = encodeURIComponent(JSON.stringify({ [nameKey]: screenName, ...(queryInfo.extraVars || {}) }));
      const features = queryInfo.features ? `&features=${encodeURIComponent(queryInfo.features)}` : '';
      const url      = `https://${location.host}/i/api/graphql/${queryInfo.queryId}/${queryInfo.endpoint}?variables=${vars}${features}`;
      const csrf     = document.cookie.match(/ct0=([^;]+)/)?.[1] || '';

      const resp = await _fetch(url, {
        credentials: 'include',
        headers: {
          'authorization':           `Bearer ${BEARER}`,
          'x-csrf-token':             csrf,
          'x-twitter-auth-type':     'OAuth2Session',
          'x-twitter-active-user':   'yes',
          'x-twitter-client-language': 'en',
        },
      });
      const data = await resp.json();
      digest(data, 0);
    } catch (_) {}
  }

  // ── Inject styles ─────────────────────────────────────────────────────────

  const style = document.createElement('style');
  style.textContent = `
    .xloc-badge {
      display: inline-block;
      margin-left: 5px;
      padding: 1px 7px;
      font-size: 11px;
      font-weight: 700;
      line-height: 18px;
      color: rgb(29, 155, 240);
      background: rgba(29, 155, 240, 0.1);
      border: 1px solid rgba(29, 155, 240, 0.35);
      border-radius: 9999px;
      vertical-align: middle;
      letter-spacing: 0.3px;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);

  // ── DOM: inject badges next to usernames ──────────────────────────────────

  function screenNameFromHref(href) {
    if (!href) return null;
    const path = href.startsWith('/') ? href.slice(1) : new URL(href).pathname.slice(1);
    const name = path.split('/')[0].split('?')[0];
    // Exclude Twitter's own internal paths
    if (!name || ['home', 'explore', 'notifications', 'messages', 'settings', 'i'].includes(name)) return null;
    if (name.includes('.')) return null;
    return name;
  }

  function injectBadge(container, screenName) {
    if (container.querySelector('.xloc-badge')) return;

    const country = countries.get(screenName.toLowerCase());
    if (!country) { fetchAbout(screenName); return; }

    const badge = document.createElement('span');
    badge.className = 'xloc-badge';
    badge.textContent = country;
    badge.title = `Based in: ${country}`;
    container.appendChild(badge);
  }

  function updateAllBadges() {
    // Usernames in tweet / timeline cells
    document.querySelectorAll('[data-testid="User-Name"]').forEach(el => {
      const link = el.querySelector('a[href]');
      const name = screenNameFromHref(link?.getAttribute('href'));
      if (name) injectBadge(el, name);
    });

    // Profile page header
    const header = document.querySelector('[data-testid="UserName"]');
    if (header) {
      const match = location.pathname.match(/^\/([^/?#]+)/);
      if (match) injectBadge(header, match[1]);
    }

    // Hover cards / side panels
    document.querySelectorAll('[data-testid="HoverCard"] [data-testid="UserName"]').forEach(el => {
      const link = el.querySelector('a[href]');
      const name = screenNameFromHref(link?.getAttribute('href'));
      if (name) injectBadge(el, name);
    });
  }

  // ── MutationObserver ──────────────────────────────────────────────────────

  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; updateAllBadges(); });
  });

  observer.observe(document.body, { childList: true, subtree: true });
  updateAllBadges();

})();
