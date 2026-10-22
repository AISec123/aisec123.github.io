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

  var SECS = D.sections || [];
  var byKey = {};
  SECS.forEach(function (s) { byKey[s.key] = s; });

  var ALL = (D.entries || []).filter(function (e) {
    if (!e || !e.name || !e.url) return false;
    if (!byKey[e.section]) console.warn('[aisec123] 未知 section，条目已跳过:', e.name, e.section);
    return !!byKey[e.section];
  });

  var state = { sec: 'all', q: '', tag: '', sort: 'default', view: 'grid' };
  var lang = LS.get('lang', 'zh');
  var theme = LS.get('theme', window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  /* ── 工具函数 ─────────────────────────────────────────── */
  function $(s) { return document.querySelector(s); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function tokens() {
    return state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  /* 先按关键词切开再逐段转义，避免在已转义的文本上做替换把 &amp; 拆坏 */
  function hl(text) {
    var s = String(text == null ? '' : text);
    var tk = tokens();
    if (!tk.length) return esc(s);
    return s.split(new RegExp('(' + tk.map(reEsc).join('|') + ')', 'ig')).map(function (p, i) {
      return i % 2 ? '<mark>' + esc(p) + '</mark>' : esc(p);
    }).join('');
  }

  function fmtStar(n) {
    if (n >= 10000) return Math.round(n / 1000) + 'k';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }

  function desc(e) { return lang === 'en' ? (e.desc_en || e.desc || '') : (e.desc || e.desc_en || ''); }

  function t(zh, en) { return lang === 'en' ? en : zh; }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }

  /* 品牌图标只认本地文件（scripts/fetch-logos.sh 抓的）。
     试过运行时现取 favicon.im：抓不到时它会回一张通用的 "f" 占位图，
     于是三家不同公司顶上出现同一个假 logo——比首字母更糟，所以宁可退回 monogram。 */
  function logoList(e) { return e.logo ? [e.logo] : []; }

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

  function markHtml(e, cls) {
    var list = logoList(e);
    var fb = esc(String(e.name).trim().charAt(0).toUpperCase());
    return '<span class="logo-mount ' + cls + (list.length ? '' : ' no-logo') + '" data-try="' +
      esc(JSON.stringify(list)) + '"><img alt="" loading="lazy" decoding="async"><i class="mark-fb">' + fb + '</i></span>';
  }

  var ICON = {
    star: '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M8 1.6l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.3l-3.8 2.1.7-4.3-3.1-3 4.3-.6z" fill="currentColor"></path></svg>',
    doc: '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M4 1.5h5.5L13 5v9.5H4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path><path d="M9 1.5V5h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path></svg>'
  };

  /* 标签的英文显示名。标签本身（tags 字段）是数据里的唯一标识，
     这里只做展示层翻译，没收录的标签原样显示。 */
  var TAG_EN = {
    '模型安全': 'Model security', 'LLM 防护': 'LLM protection', 'Agent 管控': 'Agent governance',
    'Copilot': 'Copilot', '对抗攻防': 'Adversarial', '提示注入': 'Prompt injection', 'MLDR': 'MLDR',
    'AI 防火墙': 'AI firewall', '红队': 'Red team', '推理安全': 'Inference security',
    '网关': 'Gateway', '影子 AI': 'Shadow AI', '全生命周期': 'Full lifecycle', 'MCP': 'MCP',
    '运行时管控': 'Runtime controls', '可观测': 'Observability', '护栏': 'Guardrails',
    '评估': 'Evaluation', 'RAG': 'RAG', '访问控制': 'Access control',
    '自主渗透智能体': 'Autonomous pentest agents', 'LLM 漏扫': 'LLM-powered scanners',
    '智能体审计': 'Agent & app auditing', 'Skills 审计': 'Agent Skills auditing',
    '自主漏洞发现': 'Autonomous vuln discovery', 'Agent 工具箱': 'Agentic security toolkits',
    '专栏': 'Column', '工具拆解': 'Tool teardowns', '标准': 'Standards', '清单': 'Checklist',
    '威胁矩阵': 'Threat matrix', '知识库': 'Knowledge base', '博客': 'Blog', '框架': 'Framework',
    '大厂': 'Big tech', '合规': 'Compliance', '评测集': 'Eval set', '鲁棒性': 'Robustness',
    '对抗攻击': 'Adversarial attacks', '数据集': 'Dataset', '工具集': 'Tool collection',
    '索引': 'Index', '漏洞': 'Vulnerabilities', '档案': 'Case files'
  };

  function tagLabel(g) { return lang === 'en' ? (TAG_EN[g] || g) : g; }

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

  /* ── 筛选与排序 ───────────────────────────────────────── */
  function matches(e) {
    if (state.sec !== 'all' && e.section !== state.sec) return false;
    if (state.tag && (e.tags || []).indexOf(state.tag) < 0) return false;
    var tk = tokens();
    if (tk.length) {
      var s = byKey[e.section];
      var hay = [e.name, e.desc, e.desc_en, (e.tags || []).join(' '), e.region, e.github,
                 s ? s.zh + ' ' + s.en : ''].join(' ').toLowerCase();
      for (var i = 0; i < tk.length; i++) if (hay.indexOf(tk[i]) < 0) return false;
    }
    return true;
  }

  function sortList(list) {
    var out = list.slice();
    var feat = function (e) { return e.status === 'featured' ? 0 : 1; };
    if (state.sort === 'star') {
      out.sort(function (a, b) { return (b.star || 0) - (a.star || 0) || feat(a) - feat(b); });
    } else if (state.sort === 'new') {
      out.sort(function (a, b) { return String(b.added || '').localeCompare(String(a.added || '')) || (b.star || 0) - (a.star || 0); });
    } else if (state.sort === 'az') {
      out.sort(function (a, b) { return a.name.localeCompare(b.name, 'en'); });
    } else {
      out.sort(function (a, b) {
        return feat(a) - feat(b) || (b.star || 0) - (a.star || 0) ||
               String(b.added || '').localeCompare(String(a.added || ''));
      });
    }
    return out;
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
    document.title = lang === 'en' ? 'AISec123 · AI Security Directory' : 'AISec123 · AI 安全导航';
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

  /* hero 里那三个数字：收录数 / 板块数 / 更新时间。
     全部从数据里现算，加条目不用回来改 HTML。 */
  function renderStats() {
    var el = $('#hero-stats');
    if (!el) return;
    function cell(n, label) {
      return '<li><b>' + esc(n) + '</b><span>' + esc(label) + '</span></li>';
    }
    el.innerHTML = cell(ALL.length, t('条收录', 'listings')) +
      cell(SECS.length, t('个板块', 'sections')) +
      cell(D.updated || '—', t('最后更新', 'last updated'));
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

  function card(e) {
    var s = byKey[e.section] || {};
    var meta = [];
    if (e.star) meta.push('<span class="card-star" title="GitHub stars">' + ICON.star + ' ' + esc(fmtStar(e.star)) + '</span>');
    if (e.post) meta.push('<a class="card-post" href="' + esc(e.post) + '" target="_blank" rel="noopener noreferrer">' + ICON.doc + ' ' + esc(t('深度长文', 'Deep dive')) + '</a>');
    var tags = (e.tags || []).map(function (g) {
      return '<button type="button" class="tag" data-tag="' + esc(g) + '">' + esc(tagLabel(g)) + '</button>';
    }).join('');

    return '<article class="card" style="--cat:' + esc(s.color || 'var(--accent)') + '">' +
      '<div class="card-top">' +
        markHtml(e, 'card-mark') +
        '<span class="card-id">' +
          '<span class="card-name">' +
            '<a href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer">' + hl(e.name) +
              '<svg class="card-ext" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">' +
              '<path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
            '</a>' +
            (e.status === 'featured' ? '<span class="badge-featured">' + esc(t('推荐', 'PICK')) + '</span>' : '') +
            (e.region ? '<span class="card-region">' + esc(e.region) + '</span>' : '') +
          '</span>' +
          '<p class="card-desc">' + hl(desc(e)) + '</p>' +
        '</span>' +
      '</div>' +
      ((tags || meta.length) ? '<div class="card-foot">' + tags + (meta.length ? '<span class="card-meta">' + meta.join('') + '</span>' : '') + '</div>' : '') +
    '</article>';
  }

  function renderList() {
    var hit = ALL.filter(matches);
    var html = '';
    var shown = 0;
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

    SECS.forEach(function (s) {
      var list = sortList(hit.filter(function (e) { return e.section === s.key; }));
      if (!list.length) return;
      shown += list.length;
      var blurb = lang === 'en' ? (s.desc_en || s.desc) : (s.desc || s.desc_en);
      /* 单板块视图不重复渲染板块标题：侧栏和面包屑已经说过同一个词了 */
      var head = state.sec === 'all'
        ? '<h2 class="block-head"><span>' + esc(lang === 'en' ? s.en : s.zh) + '</span>' +
          '<span class="block-n">' + list.length + '</span></h2>'
        : '';
      html += '<section class="block" id="sec-' + esc(s.key) + '" style="--cat:' + esc(s.color || '') + '">' +
        head +
        (blurb ? '<p class="block-desc">' + esc(blurb) + '</p>' : '') +
        '<div class="grid">' + list.map(card).join('') + '</div>' +
      '</section>';
    });

    $('#list').innerHTML = html;
    $('#empty').hidden = shown > 0;
    body.classList.toggle('is-list', state.view === 'list');
    mountLogos($('#list'));
  }

  /* 首页那条品牌 logo 墙：从已收录条目里按域名去重，
     优先有 logo 的，再补精选，凑够一面就停。 */
  function renderWall() {
    var el = $('#wall');
    if (!el) return;
    var seen = {}, out = [];
    var pool = ALL.slice().sort(function (a, b) {
      return (b.logo ? 1 : 0) - (a.logo ? 1 : 0) || (b.status === 'featured' ? 1 : 0) - (a.status === 'featured' ? 1 : 0);
    });
    pool.forEach(function (e) {
      if (out.length >= 16) return;
      var h = e.github ? 'gh:' + e.github.split('/')[0] : hostOf(e.url);
      if (!h || seen[h]) return;
      seen[h] = 1;
      out.push(e);
    });
    el.innerHTML = out.map(function (e) {
      return '<a class="wall-item" href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(e.name) + '">' +
        markHtml(e, 'wall-mark') + '<span>' + esc(e.name) + '</span></a>';
    }).join('');
    mountLogos(el);
  }

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
  renderStats();
  renderWall();
  renderFriends();
  renderAll();
  syncView();
})();
