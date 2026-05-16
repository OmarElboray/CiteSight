const SUPPORTED_HOSTS = [
  'pubmed.ncbi.nlm.nih.gov', 'arxiv.org', 'biorxiv.org', 'medrxiv.org',
  'nature.com', 'science.org', 'cell.com', 'sciencedirect.com',
  'link.springer.com', 'onlinelibrary.wiley.com', 'jstor.org',
  'journals.plos.org', 'frontiersin.org', 'academic.oup.com',
  'pubs.acs.org', 'ieeexplore.ieee.org', 'dl.acm.org', 'scholar.google.com'
];

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = new URL(tab.url || 'https://example.com');
  const host = url.hostname;

  const isSupported = SUPPORTED_HOSTS.some(h => host.includes(h));
  const siteName = host.replace('www.', '');

  document.getElementById('site-name').textContent = siteName;
  
  const dot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  if (isSupported) {
    dot.className = 'status-dot active';
    statusText.textContent = 'Supported site';
  } else {
    dot.className = 'status-dot inactive';
    statusText.textContent = 'Not a science site';
    document.getElementById('open-btn').disabled = true;
    document.getElementById('open-btn').style.opacity = '0.5';
  }

  // Load settings
  chrome.storage.sync.get(['pl_settings'], (result) => {
    const s = result.pl_settings || {};
    const level = s.readingLevel || 'student';
    document.querySelectorAll('.level-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.level === level);
    });
  });

  // Events
  document.getElementById('open-btn').addEventListener('click', () => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const btn = document.getElementById('pl-toggle');
        if (btn) btn.click();
        else {
          const sidebar = document.getElementById('pl-sidebar');
          if (sidebar) sidebar.classList.add('open');
        }
      }
    });
    window.close();
  });

  document.getElementById('options-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('options-link').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chrome.storage.sync.get(['pl_settings'], (result) => {
        const s = result.pl_settings || {};
        s.readingLevel = btn.dataset.level;
        chrome.storage.sync.set({ pl_settings: s });
      });
    });
  });
}

init();
