# PaperLens 🔍

A minimalist, privacy-focused open-source browser extension designed to optimize online research, reading stamina, and document accessibility for students and academic researchers.

## ✦ The Overview
Online academic reading can be exhausting due to poor web formatting, harsh contrast, and distracting page layouts. **PaperLens** introduces custom overlay dynamics and layout adjustments to drastically reduce visual fatigue, maximize reading focus, and support cognitive stamina during deep-dive literature reviews.

## 🚀 Features
* **Adaptive Visual Overlays:** Custom tinting and high-contrast modes engineered to alleviate digital eye strain during long-form reading sessions.
* **Distraction-Free Architecture:** Surgical DOM injection to isolate content text and mute layout noise.
* **Granular Options Control:** Built-in options dashboard to dynamically configure reading lenses according to specific accessibility requirements.
* **Privacy-First Architecture:** Zero external tracking, API queries, or telemetry. All settings and runtime configurations are processed and saved strictly within local browser storage.

## 🛠️ Project Structure
```text
paper-lens/
├── src/
│   ├── content.js     # Core DOM parsing, overlay insertion, and layout tuning
│   ├── content.css    # High-performance CSS filters and accessibility rules
│   └── background.js  # Global runtime listener and extension lifecycle manager
├── icons/             # Multi-size visual branding assets
├── manifest.json      # Extension configuration, capability permissions, and security parameters
├── popup.html/.js     # Quick-access extension status interface
└── options.html/.js   # Dedicated settings dashboard for persistent configurations
