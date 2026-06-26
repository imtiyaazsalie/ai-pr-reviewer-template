# AI PR Reviewer with DeepSeek

This GitHub Action automatically reviews pull requests using AI (DeepSeek, OpenAI, Anthropic, Groq, or any OpenAI‑compatible endpoint). It posts **inline comments** and a **summary** — like CodeRabbit — but runs entirely on GitHub's infrastructure.

## Zero‑Conflict Setup

Because this is a **composable GitHub Action**, you do **not** copy any files into your repo.
You just add **one workflow file** and you're done. Nothing conflicts. Nothing to maintain.

### 1. Add the workflow file

Create `.github/workflows/pr-review.yml` in your repository:

```yaml
name: AI PR Reviewer

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

jobs:
  review:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: imtiyaazsalie/ai-pr-reviewer-template@v1
        with:
          ai_provider: deepseek
          ai_api_key: ${{ secrets.AI_API_KEY }}
```

That's the only file you need. The default `GITHUB_TOKEN` is used automatically for posting comments — no extra secret required.

### 2. Add your AI API key

Go to **Settings → Secrets and variables → Actions** in your repo and add:

| Secret | Value |
|---|---|
| `AI_API_KEY` | Your provider's API key |

That's it. The action runs automatically on every PR.

### How it avoids conflicts

| Problem | Solution |
|---|---|
| `package.json` / `package-lock.json` | Lives in **this** repo, not yours. Nothing to merge. |
| `node_modules/` | Cached with `actions/cache@v4`. Installed in action directory at runtime. |
| Source files (`src/`) | Referenced by path inside the action. Zero files land in your tree. |
| Config files | Optional; create a config file in **your** repo if you need monorepo support. |

## Features

- ✅ Inline line‑specific comments on changed files
- ✅ Two‑pass AI validation — deduplicates and removes false positives
- ✅ Monorepo‑aware with optional workspace config
- ✅ Commit‑level caching — never re‑review the same commit twice
- ✅ Risk scoring with file‑criticality weighting (`/core/`, `auth` paths get 2× weight)
- ✅ Concurrent AI calls with configurable parallelism
- ✅ Optional Semgrep integration (toggle on)
- ✅ `node_modules` cached across runs — cold start eliminated after first PR
- ✅ 17‑test unit suite validating core logic

## All inputs

### AI provider

| Input | Required | Default | Description |
|---|---|---|---|
| `ai_provider` | No | `deepseek` | `deepseek`, `openai`, `anthropic`, `groq`, or `ollama` |
| `ai_api_key` | Yes¹ | — | API key for the chosen provider |
| `ai_model` | No | provider default | Override the model (e.g. `gpt-4o`, `claude-3-5-sonnet`) |
| `ai_base_url` | No | provider default | Custom endpoint (for self‑hosted, proxies, or any OpenAI‑compatible API) |
| `deepseek_api_key` | No² | — | Legacy input; use `ai_api_key` instead |

> ¹ Not required for `ollama`.  
> ² Exists for backwards compatibility. Falls back to `ai_api_key`.

### Other inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `github_token` | No | `${{ github.token }}` | Token for posting PR comments |
| `enable_semgrep` | No | `false` | Run Semgrep static analysis alongside AI review |
| `max_concurrency` | No | `5` | Max concurrent AI calls (lower if hitting rate limits) |
| `config_path` | No | `""` | Path to monorepo config (e.g. `.github/ai-reviewer.yml`) |

### Provider examples

**OpenAI**
```yaml
- uses: imtiyaazsalie/ai-pr-reviewer-template@v1
  with:
    ai_provider: openai
    ai_api_key: ${{ secrets.OPENAI_API_KEY }}
    ai_model: gpt-4o-mini
```

**Anthropic (Claude)**
```yaml
- uses: imtiyaazsalie/ai-pr-reviewer-template@v1
  with:
    ai_provider: anthropic
    ai_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

**Groq**
```yaml
- uses: imtiyaazsalie/ai-pr-reviewer-template@v1
  with:
    ai_provider: groq
    ai_api_key: ${{ secrets.GROQ_API_KEY }}
    max_concurrency: 2
```

**Ollama (local, free)**
```yaml
- uses: imtiyaazsalie/ai-pr-reviewer-template@v1
  with:
    ai_provider: ollama
    ai_model: llama3.1
```

**Any OpenAI-compatible endpoint**
```yaml
- uses: imtiyaazsalie/ai-pr-reviewer-template@v1
  with:
    ai_base_url: https://your-api.company.com/v1/chat/completions
    ai_model: your-model
    ai_api_key: ${{ secrets.CUSTOM_API_KEY }}
```

### Full example with all options

```yaml
- uses: imtiyaazsalie/ai-pr-reviewer-template@v1
  with:
    ai_provider: anthropic
    ai_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    ai_model: claude-3-5-sonnet-latest
    enable_semgrep: true
    max_concurrency: 3
    config_path: .github/ai-reviewer.yml
```

## Advanced configuration

### Monorepo support

Create a YAML config file in your repo (default path is `config/monorepo.yml`, or use `config_path` to customize):

```yaml
workspaces:
  - "packages/*"
  - "apps/*"
ignore:
  - "**/*.test.js"
  - "**/*.spec.js"
  - "docs/**"
```

Without a config, the action auto‑filters out lockfiles, `dist/`, `node_modules/`, and markdown files.

### Semgrep integration

Set `enable_semgrep: true` — the action runs Semgrep with `config: auto` and merges findings into the AI review, deduplicating overlapping issues.

### Rate limiting

If you hit DeepSeek `429` responses, lower the parallelism:

```yaml
max_concurrency: 2   # or 1 for strict serial
```

## How it works

```mermaid
flowchart LR
    PR[PR opened] --> Cache{Commit cached?}
    Cache -->|no| Diff[Analyze diff]
    Cache -->|yes| Post[Post from cache]
    Diff --> Chunks[Split into chunks]
    Chunks --> Pass1[AI Pass 1<br/>Detect issues]
    Pass1 --> Pass2[AI Pass 2<br/>Validate & deduplicate]
    Pass2 --> Semgrep{Semgrep<br/>enabled?}
    Semgrep -->|yes| Merge[Merge static<br/>analysis results]
    Semgrep -->|no| Score[Risk scoring]
    Merge --> Score
    Score --> Post
```

## Running tests

```bash
npm install
npm test   # 17 tests, <1s
```

## Tags & versioning

```yaml
uses: imtiyaazsalie/ai-pr-reviewer-template@v1    # pinned major (recommended)
uses: imtiyaazsalie/ai-pr-reviewer-template@main   # latest commit
```
