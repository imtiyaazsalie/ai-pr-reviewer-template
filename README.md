# AI Code Reviewer with DeepSeek

This GitHub Action automatically reviews pull requests using DeepSeek AI. It posts **inline comments** and a **summary** just like CodeRabbit, but runs entirely on GitHub's infrastructure.

## Features
- ✅ Inline line‑specific comments
- ✅ Two‑pass AI validation (deduplicate & reduce false positives)
- ✅ Monorepo‑aware (optional config)
- ✅ Caching – never re‑review the same commit twice
- ✅ Risk scoring with file‑criticality weighting
- ✅ Concurrent chunk processing for speed
- ✅ Optional merge with Semgrep/CodeQL results

## Setup (5 minutes)

### 1. Add files to your repository
Copy all the files from this package into your repo root, keeping the folder structure intact.

### 2. Install dependencies
Run locally (or let GitHub do it automatically):
```bash
npm install
