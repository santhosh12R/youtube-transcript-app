# YouTube to Transcript

A lightweight web application that extracts, searches, and exports transcripts from any YouTube video URL.

## Features

- Supports `youtube.com/watch`, `youtu.be`, `shorts`, `embed`, `live`, and raw 11-character video IDs
- Displays video title, channel, thumbnail, word count, and segment count
- Language switcher for all available manual and auto-generated captions
- Toggle between **Timestamped Lines** (clickable links to the exact video timestamp) and **Paragraph View**
- Live in-transcript search with match highlighting
- One-click **Copy Text**, **Download .TXT**, and **Download .SRT**

## Setup

```bash
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8000
```

Then open http://127.0.0.1:8000 in your browser.
