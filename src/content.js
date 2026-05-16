// PaperLens Content Script
(function () {
  'use strict';

  if (window.__paperLensInjected) return;
  window.__paperLensInjected = true;

  let settings = {};
  let currentPaperText = '';

  // ─── Platform scrapers ───────────────────────────────────────────────────
  const SCRAPERS = {
    pubmed: {
      match: () => location.hostname.includes('pubmed'),
      scrape: () => ({
        title: document.querySelector('h1.heading-title')?.textContent?.trim(),
        abstract: document.querySelector('#abstract')?.textContent?.trim(),
        authors: [...document.querySelectorAll('.authors-list .author-name')].map(a => a.textContent.trim()).join(', '),
        body: document.querySelector('#abstract')?.textContent?.trim()
      })
    },
    arxiv: {
      match: () => location.hostname.includes('arxiv'),
      scrape: () => ({
        title: document.querySelector('h1.title, .title')?.textContent?.replace('Title:', '').trim(),
        abstract: document.querySelector('blockquote.abstract, #abs')?.textContent?.replace('Abstract:', '').trim(),
        authors: document.querySelector('.authors')?.textContent?.replace('Authors:', '').trim(),
        body: document.querySelector('blockquote.abstract')?.textContent?.trim() || extractBodyText()
      })
    },
    biorxiv: {
      match: () => location.hostname.includes('biorxiv') || location.hostname.includes('medrxiv'),
      scrape: () => ({
        title: document.querySelector('h1#page-title')?.textContent?.trim(),
        abstract: document.querySelector('.abstract')?.textContent?.trim(),
        authors: document.querySelector('.highwire-citation-authors')?.textContent?.trim(),
        body: extractBodyText()
      })
    },
    nature: {
      match: () => location.hostname.includes('nature.com'),
      scrape: () => ({
        title: document.querySelector('h1.c-article-title')?.textContent?.trim(),
        abstract: document.querySelector('.c-article-section__content p, #Abs1-content')?.textContent?.trim(),
        authors: [...document.querySelectorAll('.c-article-author-list__item')].map(a => a.textContent.trim()).join(', '),
        body: extractBodyText()
      })
    },
    sciencedirect: {
      match: () => location.hostname.includes('sciencedirect'),
      scrape: () => ({
        title: document.querySelector('h1.title-text')?.textContent?.trim(),
        abstract: document.querySelector('.abstract p')?.textContent?.trim(),
        authors: [...document.querySelectorAll('.author')].map(a => a.textContent.trim()).join(', '),
        body: extractBodyText()
      })
    },
    generic: {
      match: () => true,
      scrape: () => ({
        title: document.querySelector('h1')?.textContent?.trim() || document.title,
        abstract: document.querySelector('[class*="abstract"] p')?.textContent?.trim(),
        authors: document.querySelector('[class*="author"]')?.textContent?.trim(),
        body: extractBodyText()
      })
    }
  };

  function extractBodyText() {
    const selectors = ['article', 'main', '.article-body', '.paper-content', '.fulltext', '.body'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el.innerText?.slice(0, 8000) || '';
    }
    return document.body.innerText?.slice(0, 8000) || '';
  }

  function scrapeCurrentPage() {
    for (const s of Object.values(SCRAPERS)) {
      if (s.match()) { try { return s.scrape(); } catch (e) { continue; } }
    }
    return SCRAPERS.generic.scrape();
  }

  // ─── AI provider configs ─────────────────────────────────────────────────
  const PROVIDERS = {
    groq: {
      name: 'Groq (Free)',
      placeholder: 'gsk_...',
      signupUrl: 'https://console.groq.com',
      note: 'Free tier - fast Llama 3 70B. No credit card needed.',
      badge: 'FREE'
    },
    gemini: {
      name: 'Gemini (Free)',
      placeholder: 'AIza...',
      signupUrl: 'https://aistudio.google.com',
      note: '✅ Free tier — 15 req/min. Google AI Studio.',
      badge: 'FREE'
    },
    openai: {
      name: 'OpenAI',
      placeholder: 'sk-...',
      signupUrl: 'https://platform.openai.com',
      note: '💳 Paid. Very cheap with gpt-4o-mini (~$0.001/request).',
      badge: 'PAID'
    },
    claude: {
      name: 'Claude',
      placeholder: 'sk-ant-...',
      signupUrl: 'https://console.anthropic.com',
      note: '💳 Paid. Best explanation quality.',
      badge: 'PAID'
    }
  };

  // ─── System prompt ───────────────────────────────────────────────────────
  function buildSystemPrompt() {
    const levels = {
      beginner: 'a curious person with no science background — use everyday analogies, define every technical term.',
      student: 'an undergraduate STEM student who needs help with field-specific jargon.',
      researcher: 'a scientist in a different field — use technical language but explain niche terms.'
    };
    const styles = {
      conversational: 'Be warm and friendly. Use "you" and "we".',
      bullet: 'Use bullet points and clear headers. Be concise.',
      socratic: 'Guide with rhetorical questions building to insights.',
      visual: 'Use analogies and spatial metaphors to explain visually.'
    };
    return `You are PaperLens, an expert science communicator. Explain to ${levels[settings.readingLevel] || levels.student}\n\nStyle: ${styles[settings.explanationStyle] || styles.conversational}\n\nBe focused. Define jargon simply then explain its significance.`;
  }

  // ─── Sidebar HTML ────────────────────────────────────────────────────────
  function createSidebar() {
    const sidebar = document.createElement('div');
    sidebar.id = 'pl-sidebar';
    sidebar.innerHTML = `
      <div id="pl-header">
        <div id="pl-logo">
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="10" stroke="currentColor" stroke-width="1.5"/>
            <path d="M7 11h8M11 7v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <circle cx="11" cy="11" r="3" fill="currentColor" opacity="0.2"/>
          </svg>
          PaperLens
        </div>
        <div id="pl-header-actions">
          <button id="pl-settings-btn" class="pl-icon-btn" title="Settings">⚙</button>
          <button id="pl-close-btn" class="pl-icon-btn" title="Close">✕</button>
        </div>
      </div>

      <div id="pl-paper-meta">
        <div id="pl-paper-title">Detecting paper...</div>
        <div id="pl-paper-authors"></div>
      </div>

      <div id="pl-tabs">
        <button class="pl-tab active" data-tab="summary">Summary</button>
        <button class="pl-tab" data-tab="explain">Explain</button>
        <button class="pl-tab" data-tab="jargon">Jargon</button>
        <button class="pl-tab" data-tab="ask">Ask AI</button>
      </div>

      <div id="pl-content">

        <!-- ✅ No-key banner: sits INSIDE the scroll area, above tabs content -->
        <div id="pl-no-key-warning" class="pl-hidden">
          <div class="pl-warning-box">
            <div style="font-size:22px;margin-bottom:6px">🔑</div>
            <strong>No API key set</strong>
            <p>PaperLens needs a free AI key to work.<br><b>Groq is recommended — completely free.</b></p>
            <button id="pl-add-key-btn" class="pl-primary-btn" style="margin-top:10px">Set Up Free Key →</button>
          </div>
        </div>

        <!-- Summary Tab -->
        <div class="pl-tab-panel active" id="pl-panel-summary">
          <div class="pl-action-grid">
            <button class="pl-action-btn" data-action="tldr"><span>⚡</span>TL;DR</button>
            <button class="pl-action-btn" data-action="keyfindings"><span>🔑</span>Key Findings</button>
            <button class="pl-action-btn" data-action="methodology"><span>🔬</span>Methodology</button>
            <button class="pl-action-btn" data-action="limitations"><span>⚠️</span>Limitations</button>
            <button class="pl-action-btn" data-action="implications"><span>💡</span>Why It Matters</button>
            <button class="pl-action-btn" data-action="citations"><span>📚</span>Context</button>
          </div>
          <div id="pl-result-summary" class="pl-result-area pl-placeholder">
            <p>Choose an action above ↑</p>
            <p class="pl-hint">PaperLens reads this page and explains it at your level.</p>
          </div>
        </div>

        <!-- Explain Tab -->
        <div class="pl-tab-panel" id="pl-panel-explain">
          <div class="pl-section-label">Highlight text on the page, then:</div>
          <div class="pl-selection-box"><span id="pl-selection-text">Select any text on the page first.</span></div>
          <button class="pl-primary-btn" id="pl-explain-selection-btn">Explain Selection</button>
          <div class="pl-divider">or explain a section</div>
          <div class="pl-section-buttons">
            <button class="pl-section-btn" data-section="abstract">Abstract</button>
            <button class="pl-section-btn" data-section="introduction">Introduction</button>
            <button class="pl-section-btn" data-section="methods">Methods</button>
            <button class="pl-section-btn" data-section="results">Results</button>
            <button class="pl-section-btn" data-section="discussion">Discussion</button>
            <button class="pl-section-btn" data-section="conclusion">Conclusion</button>
          </div>
          <div id="pl-result-explain" class="pl-result-area pl-placeholder">
            <p>Select text or choose a section.</p>
          </div>
        </div>

        <!-- Jargon Tab -->
        <div class="pl-tab-panel" id="pl-panel-jargon">
          <div class="pl-section-label">Look up a term</div>
          <div class="pl-search-row">
            <input type="text" id="pl-jargon-input" placeholder="e.g. 'p-value', 'PCR'..." />
            <button id="pl-jargon-search-btn" class="pl-search-btn">🔍</button>
          </div>
          <div class="pl-section-label" style="margin-top:14px">Auto-detected jargon</div>
          <div id="pl-jargon-chips" class="pl-chips-area">
            <span class="pl-loading-hint">Scan runs after key is set...</span>
          </div>
          <div id="pl-result-jargon" class="pl-result-area pl-placeholder">
            <p>Click a term or type your own.</p>
          </div>
        </div>

        <!-- Ask Tab -->
        <div class="pl-tab-panel" id="pl-panel-ask">
          <div class="pl-section-label">Ask anything about this paper</div>
          <div id="pl-chat-history"></div>
          <div class="pl-quick-questions">
            <button class="pl-quick-q" data-q="What problem does this paper solve?">What problem does it solve?</button>
            <button class="pl-quick-q" data-q="Is this study's evidence strong? Why or why not?">Is the evidence strong?</button>
            <button class="pl-quick-q" data-q="What should a beginner know before reading this?">Prerequisites for beginners?</button>
            <button class="pl-quick-q" data-q="What are the practical real-world applications of this research?">Practical applications?</button>
          </div>
          <div class="pl-chat-input-row">
            <textarea id="pl-ask-input" placeholder="Ask anything about this paper..." rows="2"></textarea>
            <button id="pl-ask-send-btn" class="pl-send-btn">➤</button>
          </div>
        </div>

      </div><!-- end #pl-content -->

      <!-- Settings panel: takes over full sidebar body, no overlap -->
      <div id="pl-settings-panel" class="pl-hidden">
        <div id="pl-settings-scroll">

          <div class="pl-settings-header">⚙ Settings</div>

          <div class="pl-setting-group">
            <label class="pl-setting-label">AI Provider</label>
            <div class="pl-provider-grid">
              <button class="pl-provider-btn active" data-provider="groq">
                <span class="pl-badge pl-badge-free">FREE</span>
                <strong>Groq</strong>
                <small>Llama 3 · Fast</small>
              </button>
              <button class="pl-provider-btn" data-provider="gemini">
                <span class="pl-badge pl-badge-free">FREE</span>
                <strong>Gemini</strong>
                <small>Flash · Google</small>
              </button>
              <button class="pl-provider-btn" data-provider="openai">
                <span class="pl-badge pl-badge-paid">PAID</span>
                <strong>OpenAI</strong>
                <small>GPT-4o mini</small>
              </button>
              <button class="pl-provider-btn" data-provider="claude">
                <span class="pl-badge pl-badge-paid">PAID</span>
                <strong>Claude</strong>
                <small>Best quality</small>
              </button>
            </div>
            <div id="pl-provider-note" class="pl-provider-note">Free tier - fast Llama 3 70B. No credit card needed.</div>
          </div>

          <div class="pl-setting-group">
            <label class="pl-setting-label">API Key</label>
            <div class="pl-key-row">
              <input type="text" id="pl-apikey-input" class="pl-text-input pl-key-input" placeholder="gsk_..." autocomplete="off" spellcheck="false" />
              <button id="pl-test-key-btn" class="pl-test-btn">Test</button>
            </div>
            <div id="pl-key-status" class="pl-key-status"></div>
            <a id="pl-get-key-link" href="https://console.groq.com" target="_blank" class="pl-get-key-link">Get free Groq key at console.groq.com</a>
          </div>

          <div class="pl-setting-group">
            <label class="pl-setting-label">Reading Level</label>
            <div class="pl-radio-group">
              <label class="pl-radio-opt"><input type="radio" name="level" value="beginner"><span class="pl-radio-ui"></span><div><strong>Beginner</strong><small>No science background</small></div></label>
              <label class="pl-radio-opt"><input type="radio" name="level" value="student" checked><span class="pl-radio-ui"></span><div><strong>Student</strong><small>STEM undergrad</small></div></label>
              <label class="pl-radio-opt"><input type="radio" name="level" value="researcher"><span class="pl-radio-ui"></span><div><strong>Researcher</strong><small>Cross-discipline scientist</small></div></label>
            </div>
          </div>

          <div class="pl-setting-group">
            <label class="pl-setting-label">Style</label>
            <div class="pl-radio-group">
              <label class="pl-radio-opt"><input type="radio" name="style" value="conversational" checked><span class="pl-radio-ui"></span><div><strong>Conversational</strong><small>Warm and engaging</small></div></label>
              <label class="pl-radio-opt"><input type="radio" name="style" value="bullet"><span class="pl-radio-ui"></span><div><strong>Structured</strong><small>Bullets and headers</small></div></label>
              <label class="pl-radio-opt"><input type="radio" name="style" value="socratic"><span class="pl-radio-ui"></span><div><strong>Socratic</strong><small>Guided questions</small></div></label>
            </div>
          </div>

          <div class="pl-setting-group">
            <label class="pl-setting-label">Theme</label>
            <div class="pl-theme-row">
              <button class="pl-theme-btn active" data-theme="light">☀️ Light</button>
              <button class="pl-theme-btn" data-theme="dark">🌙 Dark</button>
              <button class="pl-theme-btn" data-theme="sepia">📜 Sepia</button>
            </div>
          </div>

          <div class="pl-setting-group">
            <label class="pl-setting-label">Features</label>
            <label class="pl-toggle-row"><span>Highlight jargon on page</span><input type="checkbox" id="pl-toggle-highlight" class="pl-toggle-input" checked><span class="pl-toggle-ui"></span></label>
            <label class="pl-toggle-row"><span>Auto-open on science sites</span><input type="checkbox" id="pl-toggle-autoopen" class="pl-toggle-input"><span class="pl-toggle-ui"></span></label>
          </div>

          <button id="pl-save-settings-btn" class="pl-primary-btn">Save Settings</button>
          <button id="pl-close-settings-btn" class="pl-ghost-btn">Cancel</button>
        </div>
      </div>
    `;
    return sidebar;
  }

  function createToggleBtn() {
    const btn = document.createElement('button');
    btn.id = 'pl-toggle';
    btn.title = 'Open PaperLens';
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="10" stroke="currentColor" stroke-width="1.5"/><path d="M7 11h8M11 7v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="11" cy="11" r="3" fill="currentColor" opacity="0.3"/></svg><span>PaperLens</span>`;
    return btn;
  }

  // ─── AI call via background ──────────────────────────────────────────────
  async function callAI(message) {
    if (!settings.apiKey) return null;
    return new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: 'AI_REQUEST',
        payload: { provider: settings.provider || 'groq', apiKey: settings.apiKey, system: buildSystemPrompt(), message }
      }, resolve);
    });
  }

  // ─── Render helpers ──────────────────────────────────────────────────────
  function showLoading(el) { el.classList.remove('pl-placeholder'); el.innerHTML = `<div class="pl-loading"><div class="pl-spinner"></div><p>Analyzing...</p></div>`; }
  function showResult(el, text) { el.classList.remove('pl-placeholder'); el.innerHTML = `<div class="pl-result-text">${formatMd(text)}</div>`; }
  function showError(el, msg) { el.classList.remove('pl-placeholder'); el.innerHTML = `<div class="pl-error">⚠️ ${msg}</div>`; }
  function formatMd(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^#{3} (.+)$/gm, '<h4>$1</h4>')
      .replace(/^#{2} (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
      .replace(/\n\n/g, '<br><br>');
  }

  // ─── Init ────────────────────────────────────────────────────────────────
  async function init() {
    settings = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, r));

    const sidebar = createSidebar();
    const toggleBtn = createToggleBtn();
    document.body.appendChild(sidebar);
    document.body.appendChild(toggleBtn);

    applyTheme(settings.theme || 'light');

    const paper = scrapeCurrentPage();
    currentPaperText = [paper.title, paper.abstract, paper.body].filter(Boolean).join('\n\n');

    document.getElementById('pl-paper-title').textContent = (paper.title || 'Untitled paper').slice(0, 90);
    if (paper.authors) document.getElementById('pl-paper-authors').textContent = paper.authors.slice(0, 100);

    // Banner is inside #pl-content so it scrolls naturally — no overlap possible
    if (!settings.apiKey) {
      document.getElementById('pl-no-key-warning').classList.remove('pl-hidden');
    }

    if (settings.autoOpen) openSidebar();
    if (settings.highlightTerms && settings.apiKey) detectJargon();

    bindEvents(paper);
  }

  function openSidebar() {
    document.getElementById('pl-sidebar').classList.add('open');
    document.getElementById('pl-toggle').classList.add('hidden');
    document.body.style.marginRight = '380px';
  }
  function closeSidebar() {
    document.getElementById('pl-sidebar').classList.remove('open');
    document.getElementById('pl-toggle').classList.remove('hidden');
    document.body.style.marginRight = '';
  }
  function applyTheme(t) { document.getElementById('pl-sidebar')?.setAttribute('data-theme', t); }

  // ─── Jargon detection ────────────────────────────────────────────────────
  async function detectJargon() {
    if (!settings.apiKey || !currentPaperText) return;
    const result = await callAI(`From this paper, extract 8-10 technical jargon terms a non-specialist would find confusing. Return ONLY a JSON array of strings:\n\n${currentPaperText.slice(0, 2000)}`);
    if (!result?.text) return;
    try {
      const terms = JSON.parse(result.text.replace(/```json|```/g, '').trim());
      const chips = document.getElementById('pl-jargon-chips');
      if (chips && Array.isArray(terms)) {
        chips.innerHTML = terms.map(t => `<button class="pl-chip" data-term="${t}">${t}</button>`).join('');
        chips.querySelectorAll('.pl-chip').forEach(c => c.addEventListener('click', () => explainTerm(c.dataset.term)));
      }
    } catch (e) {}
  }

  async function explainTerm(term) {
    const el = document.getElementById('pl-result-jargon');
    showLoading(el);
    const result = await callAI(`Explain the term "${term}" as used in this paper: "${currentPaperText.slice(0, 500)}". Give: 1) Simple definition 2) What it means here 3) Why it matters.`);
    if (result?.error) return showError(el, result.error);
    showResult(el, result?.text || 'No explanation available.');
  }

  // ─── Events ──────────────────────────────────────────────────────────────
  function bindEvents(paper) {
    document.getElementById('pl-toggle').addEventListener('click', openSidebar);
    document.getElementById('pl-close-btn').addEventListener('click', closeSidebar);
    document.getElementById('pl-add-key-btn')?.addEventListener('click', openSettingsPanel);

    document.querySelectorAll('.pl-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.pl-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.pl-tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`pl-panel-${tab.dataset.tab}`)?.classList.add('active');
      });
    });

    const ACTION_PROMPTS = {
      tldr: 'Give a TL;DR of this paper in 3-4 sentences.',
      keyfindings: 'What are the 3-5 most important findings?',
      methodology: 'Explain the research methodology clearly.',
      limitations: 'What are the main limitations and weaknesses?',
      implications: 'Why does this paper matter? Real-world implications?',
      citations: 'What field is this and what prior work does it build on?'
    };

    document.querySelectorAll('.pl-action-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!settings.apiKey) { openSettingsPanel(); return; }
        const el = document.getElementById('pl-result-summary');
        showLoading(el);
        const result = await callAI(`${ACTION_PROMPTS[btn.dataset.action]}\n\nPaper:\n${currentPaperText.slice(0, 4000)}`);
        if (result?.error) return showError(el, result.error);
        showResult(el, result?.text || 'Unable to generate.');
      });
    });

    let selectedText = '';
    document.addEventListener('mouseup', () => {
      const sel = window.getSelection()?.toString()?.trim();
      if (sel && sel.length > 10) {
        selectedText = sel;
        const el = document.getElementById('pl-selection-text');
        if (el) el.textContent = `"${sel.slice(0, 100)}${sel.length > 100 ? '…' : ''}"`;
      }
    });

    document.getElementById('pl-explain-selection-btn').addEventListener('click', async () => {
      if (!settings.apiKey) { openSettingsPanel(); return; }
      if (!selectedText) return;
      const el = document.getElementById('pl-result-explain');
      showLoading(el);
      const result = await callAI(`Explain this passage from a scientific paper:\n\n"${selectedText}"\n\nPaper: ${paper.title}`);
      if (result?.error) return showError(el, result.error);
      showResult(el, result?.text || '');
    });

    document.querySelectorAll('.pl-section-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!settings.apiKey) { openSettingsPanel(); return; }
        const el = document.getElementById('pl-result-explain');
        showLoading(el);
        const result = await callAI(`Explain the ${btn.dataset.section} section of this paper:\n\n${currentPaperText.slice(0, 5000)}`);
        if (result?.error) return showError(el, result.error);
        showResult(el, result?.text || '');
      });
    });

    const doJargonSearch = async () => {
      const term = document.getElementById('pl-jargon-input').value.trim();
      if (term && settings.apiKey) await explainTerm(term);
      else if (!settings.apiKey) openSettingsPanel();
    };
    document.getElementById('pl-jargon-search-btn').addEventListener('click', doJargonSearch);
    document.getElementById('pl-jargon-input').addEventListener('keydown', e => { if (e.key === 'Enter') doJargonSearch(); });

    document.querySelectorAll('.pl-quick-q').forEach(btn => {
      btn.addEventListener('click', () => { document.getElementById('pl-ask-input').value = btn.dataset.q; });
    });
    document.getElementById('pl-ask-send-btn').addEventListener('click', sendAsk);
    document.getElementById('pl-ask-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAsk(); } });

    document.getElementById('pl-settings-btn').addEventListener('click', openSettingsPanel);
    document.getElementById('pl-close-settings-btn').addEventListener('click', closeSettingsPanel);
    document.getElementById('pl-save-settings-btn').addEventListener('click', saveSettings);

    // Test Key button
    document.getElementById('pl-test-key-btn').addEventListener('click', async () => {
      const rawKey = document.getElementById('pl-apikey-input').value.replace(/[^\x21-\x7E]/g, '').trim();
      const provider = document.querySelector('.pl-provider-btn.active')?.dataset.provider || 'groq';
      const statusEl = document.getElementById('pl-key-status');
      if (!rawKey) {
        statusEl.textContent = 'Please enter an API key first.';
        statusEl.className = 'pl-key-status pl-key-error';
        return;
      }
      statusEl.textContent = 'Testing...';
      statusEl.className = 'pl-key-status pl-key-testing';
      const result = await new Promise(resolve => {
        chrome.runtime.sendMessage({
          type: 'AI_REQUEST',
          payload: { provider, apiKey: rawKey, system: 'You are a test assistant.', message: 'Reply with just the word: OK' }
        }, resolve);
      });
      if (result?.error) {
        statusEl.textContent = 'Invalid key: ' + result.error;
        statusEl.className = 'pl-key-status pl-key-error';
      } else {
        statusEl.textContent = 'Key works! Ready to use.';
        statusEl.className = 'pl-key-status pl-key-ok';
      }
    });

    document.querySelectorAll('.pl-provider-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pl-provider-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateProviderUI(btn.dataset.provider);
      });
    });

    document.querySelectorAll('.pl-theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pl-theme-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyTheme(btn.dataset.theme);
      });
    });

    loadSettingsUI();
  }

  const PROVIDER_UI = {
    groq:   { note: 'FREE - Llama 3.3 70B. No credit card. Recommended.', placeholder: 'gsk_...', link: 'https://console.groq.com', linkText: 'Get free key at console.groq.com' },
    gemini: { note: 'FREE - Gemini 1.5 Flash. 15 req/min. Google AI Studio.', placeholder: 'AIza...', link: 'https://aistudio.google.com', linkText: 'Get free key at aistudio.google.com' },
    openai: { note: 'PAID - GPT-4o mini. Very affordable (~$0.001/req).', placeholder: 'sk-...', link: 'https://platform.openai.com/api-keys', linkText: 'Get key at platform.openai.com' },
    claude: { note: 'PAID - Claude Haiku. Highest quality explanations.', placeholder: 'sk-ant-...', link: 'https://console.anthropic.com', linkText: 'Get key at console.anthropic.com' }
  };

  function updateProviderUI(provider) {
    const p = PROVIDER_UI[provider];
    if (!p) return;
    document.getElementById('pl-provider-note').textContent = p.note;
    document.getElementById('pl-apikey-input').placeholder = p.placeholder;
    // Clear key status when switching provider
    const status = document.getElementById('pl-key-status');
    if (status) { status.textContent = ''; status.className = 'pl-key-status'; }
    const link = document.getElementById('pl-get-key-link');
    if (link) { link.textContent = p.linkText; link.href = p.link; }
  }

  async function sendAsk() {
    const input = document.getElementById('pl-ask-input');
    const q = input.value.trim();
    if (!q) return;
    if (!settings.apiKey) { openSettingsPanel(); return; }
    input.value = '';
    const history = document.getElementById('pl-chat-history');
    history.innerHTML += `<div class="pl-chat-msg pl-chat-user"><strong>You:</strong> ${q}</div>`;
    history.innerHTML += `<div class="pl-chat-msg pl-chat-ai" id="pl-last-ans"><span class="pl-spinner-sm"></span></div>`;
    history.scrollTop = history.scrollHeight;
    const result = await callAI(`Paper:\n${currentPaperText.slice(0, 4000)}\n\nQuestion: ${q}`);
    const el = document.getElementById('pl-last-ans');
    if (el) { el.id = ''; el.innerHTML = result?.error ? `<strong>PaperLens:</strong> ⚠️ ${result.error}` : `<strong>PaperLens:</strong> ${formatMd(result?.text || '...')}`; }
    history.scrollTop = history.scrollHeight;
  }

  function openSettingsPanel() {
    document.getElementById('pl-settings-panel').classList.remove('pl-hidden');
    document.getElementById('pl-content').style.display = 'none';
    document.getElementById('pl-tabs').style.display = 'none';
    document.getElementById('pl-paper-meta').style.display = 'none';
  }
  function closeSettingsPanel() {
    document.getElementById('pl-settings-panel').classList.add('pl-hidden');
    document.getElementById('pl-content').style.display = '';
    document.getElementById('pl-tabs').style.display = '';
    document.getElementById('pl-paper-meta').style.display = '';
  }

  function loadSettingsUI() {
    const prov = settings.provider || 'groq';
    document.querySelectorAll('.pl-provider-btn').forEach(b => b.classList.toggle('active', b.dataset.provider === prov));
    updateProviderUI(prov);
    const lvl = document.querySelector(`input[name="level"][value="${settings.readingLevel || 'student'}"]`);
    if (lvl) lvl.checked = true;
    const sty = document.querySelector(`input[name="style"][value="${settings.explanationStyle || 'conversational'}"]`);
    if (sty) sty.checked = true;
    if (settings.apiKey) document.getElementById('pl-apikey-input').value = settings.apiKey;
    document.getElementById('pl-toggle-highlight').checked = settings.highlightTerms !== false;
    document.getElementById('pl-toggle-autoopen').checked = !!settings.autoOpen;
    const themeBtn = document.querySelector(`.pl-theme-btn[data-theme="${settings.theme || 'light'}"]`);
    if (themeBtn) { document.querySelectorAll('.pl-theme-btn').forEach(b => b.classList.remove('active')); themeBtn.classList.add('active'); }
  }

  function saveSettings() {
    settings = {
      provider: document.querySelector('.pl-provider-btn.active')?.dataset.provider || 'groq',
      readingLevel: document.querySelector('input[name="level"]:checked')?.value || 'student',
      explanationStyle: document.querySelector('input[name="style"]:checked')?.value || 'conversational',
      apiKey: document.getElementById('pl-apikey-input').value.replace(/[^\x00-\xFF]/g, '').trim(),
      theme: document.querySelector('.pl-theme-btn.active')?.dataset.theme || 'light',
      highlightTerms: document.getElementById('pl-toggle-highlight').checked,
      autoOpen: document.getElementById('pl-toggle-autoopen').checked
    };
    chrome.storage.sync.set({ pl_settings: settings });
    applyTheme(settings.theme);
    if (settings.apiKey) {
      document.getElementById('pl-no-key-warning').classList.add('pl-hidden');
      if (settings.highlightTerms) detectJargon();
    }
    closeSettingsPanel();
  }

  init();
})();
