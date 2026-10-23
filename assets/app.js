/* AISec123 交互：筛选 / 搜索 / 排序 / 视图 / 双语 / 暗色 / URL 状态同步。
   数据来自 data/entries.js（window.AISEC123），这里只负责渲染。
   没有构建步骤、没有依赖，改完 push 就上线。 */
(function () {
  'use strict';

  var D = window.AISEC123;
  if (!D) return;

  var root = document.documentElement;
  var body = document.body;
  var KEY = 'aisec123';
  var LS = {
    get: function (k, fb) { try { return localStorage.getItem(KEY + '-' + k) || fb; } catch (e) { return fb; } },
    set: function (k, v) { try { localStorage.setItem(KEY + '-' + k, v); } catch (e) {} }
  };

  var state = { sec: 'all', q: '', tag: '', sort: 'default', view: 'grid' };
  var lang = LS.get('lang', 'zh');
  var theme = LS.get('theme', window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  /* 中文标题的真源是 index.html 的 <title>（别名关键词全在那儿），这里只在加载时
     缓存、切语言时还原，绝不另写一份 —— 之前 applyLang 把 title 硬改成「AI 安全导航」，
     Googlebot / Bingbot 渲染 JS 后拿到的就是那个，head 里布的关键词全被丢掉。 */
  var TITLE_ZH = document.title;
  var TITLE_EN = 'AISec123 · The Most Complete AI Security Knowledge Graph｜Companies · Open Source · Papers · Benchmarks';

  /* ── 工具函数 ─────────────────────────────────────────── */
  function $(s) { return document.querySelector(s); }

  /* 渲染逻辑全在 assets/render.js，和 scripts/gen-static.js 共用一份，
     这样预渲染进 index.html 的静态卡片和这里画出来的必然一致。
     getState 是惰性的：语言、搜索词、排序变了不用重建 renderer。 */
  var R = window.AISEC123Render.create(D, function () {
    return { lang: lang, q: state.q, sec: state.sec, tag: state.tag, sort: state.sort };
  });

  var SECS = R.SECS, byKey = R.byKey, ALL = R.ALL;
  var esc = R.esc, t = R.t, tagLabel = R.tagLabel;
  var matches = R.matches, blocksHtml = R.blocksHtml;

  /* 图标挂在 <span class="logo-mount"> 上，img 由这里逐个候选往下试。
     不用内联 onerror，是为了不往 HTML 里塞 JS，也方便 CSP。 */
  function mountLogos(scope) {
    (scope || document).querySelectorAll('.logo-mount:not([data-mounted])').forEach(function (el) {
      el.setAttribute('data-mounted', '1');
      var list;
      try { list = JSON.parse(el.getAttribute('data-try')); } catch (e) { return; }
      var img = el.querySelector('img');
      if (!list || !list.length || !img) { el.classList.add('no-logo'); return; }
      var i = 0;
      img.onerror = function () {
        i += 1;
        if (i < list.length) { img.src = list[i]; return; }
        img.onerror = null;
        el.classList.add('no-logo');
      };
      img.src = list[0];
    });
  }

  /* ── 状态 ↔ URL ───────────────────────────────────────── */
  function readUrl() {
    var p = new URLSearchParams(location.search);
    ['sec', 'q', 'tag', 'sort', 'view'].forEach(function (k) {
      var v = p.get(k);
      if (v) state[k] = v;
    });
    if (state.sec !== 'all' && !byKey[state.sec]) state.sec = 'all';
    if (['default', 'star', 'new', 'az'].indexOf(state.sort) < 0) state.sort = 'default';
    if (state.view !== 'list') state.view = 'grid';
  }

  function writeUrl() {
    var p = new URLSearchParams();
    if (state.sec !== 'all') p.set('sec', state.sec);
    if (state.q) p.set('q', state.q);
    if (state.tag) p.set('tag', state.tag);
    if (state.sort !== 'default') p.set('sort', state.sort);
    if (state.view !== 'grid') p.set('view', state.view);
    var qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  /* ── 渲染 ─────────────────────────────────────────────── */
  function applyLang() {
    root.lang = lang === 'en' ? 'en' : 'zh-CN';
    root.setAttribute('data-lang', lang);
    document.querySelectorAll('[data-zh]').forEach(function (el) {
      el.textContent = lang === 'en' ? (el.getAttribute('data-en') || el.getAttribute('data-zh')) : el.getAttribute('data-zh');
    });
    document.querySelectorAll('[data-ph-zh]').forEach(function (el) {
      el.placeholder = lang === 'en' ? (el.getAttribute('data-ph-en') || el.getAttribute('data-ph-zh')) : el.getAttribute('data-ph-zh');
    });
    document.title = lang === 'en' ? TITLE_EN : TITLE_ZH;
    var lb = $('#lang-toggle');
    if (lb) lb.textContent = lang === 'en' ? '中' : 'EN';
  }

  function applyTheme() {
    root.setAttribute('data-theme', theme);
    var b = $('#theme-toggle');
    if (!b) return;
    b.innerHTML = theme === 'dark'
      ? '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"></circle><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="4.5"></line><line x1="12" y1="19.5" x2="12" y2="22"></line><line x1="2" y1="12" x2="4.5" y2="12"></line><line x1="19.5" y1="12" x2="22" y2="12"></line><line x1="4.9" y1="4.9" x2="6.7" y2="6.7"></line><line x1="17.3" y1="17.3" x2="19.1" y2="19.1"></line><line x1="4.9" y1="19.1" x2="6.7" y2="17.3"></line><line x1="17.3" y1="6.7" x2="19.1" y2="4.9"></line></g></svg>'
      : '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></svg>';
  }

  function renderTimes() {
    $('#footer-updated').textContent = t('最后更新 ', 'Last updated ') + (D.updated || '');
    $('#side-updated').textContent = t('更新于 ', 'Updated ') + (D.updated || '');
  }

  function renderCats() {
    var counts = {};
    ALL.forEach(function (e) { counts[e.section] = (counts[e.section] || 0) + 1; });
    function item(key, label, n, color) {
      return '<li><button type="button" class="side-item" data-sec="' + esc(key) + '" ' +
        'style="--cat:' + esc(color || 'var(--accent)') + '" aria-selected="' + (state.sec === key) + '">' +
        '<span class="side-dot"></span><span class="side-name">' + esc(label) + '</span>' +
        '<span class="cnt">' + n + '</span></button></li>';
    }
    $('#cats').innerHTML = item('all', t('全部分类', 'All categories'), ALL.length, '') +
      SECS.map(function (s) {
        return item(s.key, lang === 'en' ? s.en : s.zh, counts[s.key] || 0, s.color);
      }).join('');
  }

  function renderList() {
    var hit = ALL.filter(matches);
    var cur = byKey[state.sec];
    var crumb = ['<b>' + esc(cur ? (lang === 'en' ? cur.en : cur.zh) : t('全部收录', 'Everything')) + '</b>',
                 '<span class="crumb-sep">·</span>',
                 esc(hit.length) + ' ' + esc(t('个条目', 'entries'))];
    if (state.tag) {
      crumb.push('<span class="crumb-sep">·</span>',
        '<button type="button" class="crumb-clear" data-clear="1">#' + esc(tagLabel(state.tag)) + ' ×</button>');
    }
    if (state.q.trim()) crumb.push('<span class="crumb-sep">·</span>', esc(t('关键词', 'for')) + ' "' + esc(state.q.trim()) + '"');
    $('#crumb').innerHTML = crumb.join(' ');

    var out = blocksHtml(hit);
    $('#list').innerHTML = out.html;
    $('#empty').hidden = out.shown > 0;
    body.classList.toggle('is-list', state.view === 'list');
    mountLogos($('#list'));
  }

  /* 首页那条品牌 logo 墙：从已收录条目里按域名去重，
     优先有 logo 的，再补精选，凑够一面就停。 */
  function renderAds() {
    var el = $('#ads');
    if (!el) return;
    var list = D.sponsors || [];
    el.innerHTML = list.map(function (a) {
      var txt = lang === 'en' ? (a.en || a.zh) : (a.zh || a.en);
      return '<a class="ad" href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer sponsored">' +
        '<span class="ad-tag">' + esc((lang === 'en' ? (a.tag_en || a.tag) : a.tag) || t('广告', 'AD')) + '</span>' +
        '<span class="ad-body">' +
          (a.logo ? '<img class="ad-logo" src="' + esc(a.logo) + '" alt="" loading="lazy" decoding="async">' : '') +
          '<span class="ad-text"><b>' + esc(a.name) + '</b><span>' + esc(txt) + '</span></span>' +
        '</span>' +
      '</a>';
    }).join('') +
      '<a class="ad ad-empty" href="https://github.com/AISec123/aisec123.github.io/issues/new">' +
        '<span class="ad-tag">' + esc(t('虚位', 'OPEN')) + '</span>' +
        '<span class="ad-body"><span class="ad-text"><b>' + esc(t('广告位招租', 'Advertise here')) + '</b>' +
        '<span>' + esc(t('合作请开 issue，展示位与收录互不影响。', 'Open an issue — placements never influence listings.')) + '</span></span></span>' +
      '</a>';
    el.querySelectorAll('.ad-logo').forEach(function (img) { img.onerror = function () { img.remove(); }; });
  }

  function renderFriends() {
    var el = $('#friends');
    if (!el) return;
    var list = D.friends || [];
    el.innerHTML = list.map(function (f) {
      return '<a href="' + esc(f.url) + '" target="_blank" rel="noopener noreferrer">' + esc(f.name) + '</a>';
    }).join('<span class="crumb-sep" aria-hidden="true">·</span>');
  }

  function renderAll() {
    renderCats();
    renderList();
    renderAds();
    writeUrl();
  }

  /* ── 事件 ─────────────────────────────────────────────── */
  $('#cats').addEventListener('click', function (ev) {
    var b = ev.target.closest('.side-item');
    if (!b) return;
    if (state.sec === b.dataset.sec) return;
    state.sec = b.dataset.sec;
    state.tag = '';           // 标签池随板块变，旧标签可能不在新板块里
    renderAll();
  });

  document.addEventListener('click', function (ev) {
    if (ev.target.closest('[data-clear]')) {
      state.tag = '';
      renderAll();
      return;
    }
    var c = ev.target.closest('[data-tag]');
    if (!c) return;
    state.tag = state.tag === c.dataset.tag ? '' : c.dataset.tag;
    renderAll();
  });

  var qEl = $('#q');
  qEl.value = state.q;
  qEl.addEventListener('input', function () {
    state.q = qEl.value;
    renderList();
    writeUrl();
  });

  $('#sort').addEventListener('change', function (ev) {
    state.sort = ev.target.value;
    renderList();
    writeUrl();
  });

  $('#view').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-view]');
    if (!b) return;
    state.view = b.dataset.view;
    LS.set('view', state.view);
    renderList();
    syncView();
    writeUrl();
  });

  function syncView() {
    document.querySelectorAll('#view button[data-view]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
    });
  }

  $('#lang-toggle').addEventListener('click', function () {
    lang = lang === 'en' ? 'zh' : 'en';
    LS.set('lang', lang);
    applyLang();
    renderTimes();
    renderAll();
  });

  $('#theme-toggle').addEventListener('click', function () {
    theme = theme === 'dark' ? 'light' : 'dark';
    LS.set('theme', theme);
    applyTheme();
  });

  $('#reset').addEventListener('click', function () {
    state.q = ''; state.tag = ''; state.sec = 'all';
    qEl.value = '';
    renderAll();
    qEl.focus();
  });

  $('#to-top').addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.addEventListener('keydown', function (ev) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault(); qEl.focus(); qEl.select(); return;
    }
    if (ev.key === '/' && !typing) { ev.preventDefault(); qEl.focus(); return; }
    if (ev.key === 'Escape' && document.activeElement === qEl) {
      if (qEl.value) { qEl.value = ''; state.q = ''; renderList(); writeUrl(); }
      qEl.blur();
    }
  });

  /* ── 启动 ─────────────────────────────────────────────── */
  readUrl();
  if (LS.get('view', '')) state.view = LS.get('view', state.view);
  $('#sort').value = state.sort;
  qEl.value = state.q;
  applyLang();
  applyTheme();
  renderTimes();
  renderFriends();
  renderAll();
  syncView();
})();
