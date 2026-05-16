// PaperLens Background Service Worker

// Strip anything outside ISO-8859-1 (0x00-0xFF) from header values.
// API keys copied from browsers often carry invisible Unicode chars
// (zero-width spaces etc.) that trigger "non ISO-8859-1 code point" errors.
// Strip everything outside printable ASCII (0x21-0x7E) from API key header values.
// This catches: emojis, zero-width spaces, curly quotes, non-breaking spaces,
// BOM characters, and any other invisible Unicode that breaks HTTP headers.
function cleanHeader(str) {
  return String(str || '')
    .replace(/[^\x21-\x7E]/g, '')  // keep only printable ASCII !..~
    .trim();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'AI_REQUEST') {
    handleAI(request.payload)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (request.type === 'GET_SETTINGS') {
    chrome.storage.sync.get(['pl_settings'], result =>
      sendResponse(result.pl_settings || defaultSettings())
    );
    return true;
  }
});

async function handleAI({ provider, apiKey, system, message }) {
  const key = cleanHeader(apiKey);
  if (!key) throw new Error('API key is missing or invalid. Open Settings to add one.');
  switch (provider) {
    case 'groq':   return callGroq(key, system, message);
    case 'gemini': return callGemini(key, system, message);
    case 'openai': return callOpenAI(key, system, message);
    case 'claude': return callClaude(key, system, message);
    default:       return callGroq(key, system, message);
  }
}

// ── Groq (Free) ──────────────────────────────────────────────────────────────
async function callGroq(apiKey, system, message) {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1200,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: message }
      ]
    })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq error ${resp.status}`);
  }
  const data = await resp.json();
  return { text: data.choices?.[0]?.message?.content || '' };
}

// ── Gemini (Free) ─────────────────────────────────────────────────────────────
async function callGemini(apiKey, system, message) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${system}\n\n${message}` }] }],
      generationConfig: { maxOutputTokens: 1200 }
    })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini error ${resp.status}`);
  }
  const data = await resp.json();
  return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' };
}

// ── OpenAI (Paid) ─────────────────────────────────────────────────────────────
async function callOpenAI(apiKey, system, message) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1200,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: message }
      ]
    })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `OpenAI error ${resp.status}`);
  }
  const data = await resp.json();
  return { text: data.choices?.[0]?.message?.content || '' };
}

// ── Claude / Anthropic (Paid) ─────────────────────────────────────────────────
async function callClaude(apiKey, system, message) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: message }]
    })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Claude error ${resp.status}`);
  }
  const data = await resp.json();
  return { text: data.content?.map(b => b.text || '').join('') || '' };
}

function defaultSettings() {
  return {
    provider: 'groq',
    readingLevel: 'student',
    explanationStyle: 'conversational',
    autoOpen: false,
    theme: 'light',
    highlightTerms: true,
    apiKey: ''
  };
}
