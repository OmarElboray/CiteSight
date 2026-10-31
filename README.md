# PaperLens (CiteSight)

PaperLens is a Chrome extension for reading scientific papers with less friction. It adds an in-page research assistant for explanations, terminology help, and summaries while keeping the reader on the source document.

## Features

- Adds a persistent sidebar to supported research and academic sites.
- Explains scientific terms and passages.
- Supports AI-assisted summaries and research questions.
- Includes a popup for quick controls and an options page for configuration.
- Uses local browser storage for extension settings.

The current extension targets sites including PubMed, arXiv, bioRxiv, medRxiv, Nature, Science, Cell, ScienceDirect, Springer, Wiley, JSTOR, PLOS, Frontiers, IEEE Xplore, ACM Digital Library, and other academic publishers listed in `manifest.json`.

## Install locally

1. Clone the repository:

   ```bash
   git clone https://github.com/OmarElboray/CiteSight.git
   cd CiteSight
   ```

2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this directory.
5. Open a supported paper page.

## Project structure

```text
CiteSight/
├── manifest.json       # Manifest V3 permissions and supported sites
├── src/
│   ├── background.js   # Service worker
│   ├── content.js     # Sidebar and page integration
│   └── content.css    # Sidebar and reading styles
├── popup.html/.js      # Quick controls
├── options.html/.js    # Persistent settings
└── icons/              # Extension icons
```

## Configuration and privacy

AI provider access is configured from the extension UI. Review permissions and provider policies before enabling a provider: page content may be sent to the selected AI API to generate explanations or summaries. Settings are stored locally unless a configured provider handles the request.

## Development

This is a no-build vanilla JavaScript extension. After editing files, select **Reload** for the extension in `chrome://extensions`.
