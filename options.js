// PaperLens Options Page

function loadSettings() {
  chrome.storage.sync.get(['pl_settings'], (result) => {
    const s = result.pl_settings || {};

    if (s.apiKey) document.getElementById('api-key').value = s.apiKey;

    const lvl = document.querySelector(`input[name="level"][value="${s.readingLevel || 'student'}"]`);
    if (lvl) lvl.checked = true;

    const sty = document.querySelector(`input[name="style"][value="${s.explanationStyle || 'conversational'}"]`);
    if (sty) sty.checked = true;

    const theme = s.theme || 'light';
    document.querySelectorAll('.theme-card').forEach(c => c.classList.toggle('active', c.dataset.theme === theme));

    const fs = s.fontSize || '14';
    document.getElementById('font-size').value = fs;
    document.getElementById('font-preview').textContent = fs + 'px';

    document.getElementById('toggle-highlight').checked = s.highlightTerms !== false;
    document.getElementById('toggle-autoopen').checked = !!s.autoOpen;
    document.getElementById('toggle-definitions').checked = s.showDefinitions !== false;
  });
}

document.getElementById('font-size').addEventListener('input', (e) => {
  document.getElementById('font-preview').textContent = e.target.value + 'px';
});

document.querySelectorAll('.theme-card').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.theme-card').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

document.getElementById('test-key-btn').addEventListener('click', async () => {
  const key = document.getElementById('api-key').value.trim();
  const statusEl = document.getElementById('api-status');
  statusEl.className = 'api-status';
  statusEl.textContent = 'Testing...';
  statusEl.style.display = 'block';

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    });
    if (resp.ok) {
      statusEl.className = 'api-status success';
      statusEl.textContent = '✓ API key is valid! PaperLens is ready.';
    } else {
      const err = await resp.json().catch(() => ({}));
      statusEl.className = 'api-status error';
      statusEl.textContent = '✗ ' + (err?.error?.message || 'Invalid API key.');
    }
  } catch (e) {
    statusEl.className = 'api-status error';
    statusEl.textContent = '✗ Could not connect. Check your key.';
  }
});

document.getElementById('save-btn').addEventListener('click', () => {
  const settings = {
    apiKey: document.getElementById('api-key').value.trim(),
    readingLevel: document.querySelector('input[name="level"]:checked')?.value || 'student',
    explanationStyle: document.querySelector('input[name="style"]:checked')?.value || 'conversational',
    theme: document.querySelector('.theme-card.active')?.dataset.theme || 'light',
    fontSize: document.getElementById('font-size').value,
    highlightTerms: document.getElementById('toggle-highlight').checked,
    autoOpen: document.getElementById('toggle-autoopen').checked,
    showDefinitions: document.getElementById('toggle-definitions').checked
  };

  chrome.storage.sync.set({ pl_settings: settings }, () => {
    const status = document.getElementById('save-status');
    status.classList.add('show');
    setTimeout(() => status.classList.remove('show'), 3000);
  });
});

loadSettings();
