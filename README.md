# AI PR Reviewer

A GitHub Action that reviews pull requests using AI — pick any provider: **OpenAI**, **Anthropic**, **Groq**, **Ollama**, **DeepSeek**, or any OpenAI‑compatible endpoint. Posts **inline comments** with suggested fixes, a **summary**, and auto‑labels your PRs.

Built on the proven architecture of pr-agent (11.8K ★), with unique additions: deterministic security scanning and multi‑provider AI support.

## Setup (30 seconds)

### 1. Add the workflow file

Create `.github/workflows/pr-review.yml`:

```yaml
name: PR Review

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
      issues: write
    steps:
      - uses: imtiyaazsalie/ai-pr-reviewer-template@v1
        with:
          ai_api_key: ${{ secrets.AI_API_KEY }}
```

### 2. Add your API key

Go to **Settings → Secrets and variables → Actions** and add `AI_API_KEY`.

That's it. The action reviews every PR automatically.

## Configuration

Create `.pr-reviewer.yml` in your repo root to customize behavior:

```yaml
# AI provider
ai:
  provider: deepseek              # deepseek, openai, anthropic, groq, ollama
  model: deepseek-chat            # optional — defaults per provider
  temperature: 0.2
  max_tokens: 1500

# Tools
tools:
  review:
    enabled: true
    depth: standard               # quick | standard | thorough
    num_max_findings: 15
    inline_comments: true
  describe:
    enabled: true                 # AI-generated PR summary
  improve:
    enabled: true                 # refactoring suggestions
    num_code_suggestions: 5
  ask:
    enabled: true                 # @ai-reviewer conversational replies

# Deterministic security scanning (free, unlimited)
deterministic:
  megalinter: true                # 50+ linters for style, bugs, secrets
  trivy: true                     # secrets + dep vulns + misconfigs
  osv_scanner: true               # dependency CVEs
  semgrep: false                  # optional (rate-limited free tier)

# Output
output:
  auto_label: true                # tag PRs: risk:high, size:xl, database, etc.
  show_review_effort: true        # effort estimate (1-5)
```

## How it works

```
PR opened
    │
    ├─ Layer 1: Deterministic (free, 100% accurate)
    │   ├─ MegaLinter (50+ linters)
    │   ├─ Trivy (secrets, deps, misconfigs)
    │   └─ OSV-Scanner (dependency CVEs)
    │
    └─ Layer 2: AI Review
        ├─ /describe — AI-generated PR summary
        ├─ /review  — code review with self-reflection
        ├─ /improve — refactoring suggestions
        └─ /ask     — @ai-reviewer conversational replies
            │
            ▼
    Unified summary + inline comments + auto-labels
```

## Features

### AI Review Tools

| Tool | What it does |
|---|---|
| `/review` | Full code review — security, bugs, logic, performance. Two-pass with self‑reflection. |
| `/describe` | AI‑generated PR summary — what changed and what to focus on. |
| `/improve` | Refactoring and code quality suggestions (distinct from bug findings). |
| `/ask` | Mention `@ai-reviewer` on any PR comment for follow‑up questions. |

### Accuracy features

- **Self‑reflection pass** — AI re‑reads its own output against the diff, catches missed issues
- **Full‑file review** — files ≤ 200 lines get complete context (not just the diff)
- **Cross‑file awareness** — detects imports and includes referenced API contracts
- **Confidence scoring** — every issue has a confidence score (e.g. "90% sure")
- **Suggested fixes** — one‑click `Commit suggestion` on inline comments
- **Learning** — remembers dismissed patterns, avoids repeating false positives

### Performance features

- **PR compression** — token‑budgets files by priority (auth=5, tests=1) for large PRs
- **Commit caching** — never re‑reviews the same commit twice
- **`node_modules` caching** — cold start eliminated after first PR
- **Three review depths** — `quick` (600 tokens), `standard` (1500), `thorough` (2500)

### Deterministic pipeline (free, unlimited)

| Tool | Catches | Speed |
|---|---|---|
| **MegaLinter** | Style, formatting, language‑specific bugs via 50+ dedicated linters | ~45s |
| **Trivy** | Secrets in files, dependency vulns, Docker/infra misconfigs | ~15s |
| **OSV‑Scanner** | Known CVEs in dependencies (npm, pip, gem, cargo, etc.) | ~10s |

All deterministic findings are merged into the review alongside AI findings. Each tool can be toggled off in `.pr-reviewer.yml`.

### Output

- **Inline comments** on specific lines with severity, confidence, and suggested fixes
- **Summary comment** with risk score, severity breakdown, and deterministic scan results
- **Auto‑labels** — `risk:high`, `has-blockers`, `database`, `ui`, `size:xl`, `clean`, etc.

## All workflow inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `ai_api_key` | Yes | — | API key for your AI provider |
| `ai_provider` | No | `deepseek` | `deepseek`, `openai`, `anthropic`, `groq`, `ollama` |
| `ai_model` | No | provider default | Override model (e.g. `gpt-4o`, `claude-3-5-sonnet`) |
| `ai_base_url` | No | provider default | Custom endpoint for any OpenAI‑compatible API |
| `github_token` | No | `${{ github.token }}` | Token for posting comments |
| `config_path` | No | auto‑detected | Path to `.pr-reviewer.yml` |
| `review_depth` | No | `standard` | `quick`, `standard`, `thorough` |
| `max_concurrency` | No | `5` | Max concurrent AI calls |
| `enable_megalinter` | No | `true` | Run MegaLinter |
| `enable_trivy` | No | `true` | Run Trivy |
| `enable_osv_scanner` | No | `true` | Run OSV‑Scanner |
| `enable_semgrep` | No | `false` | Optional Semgrep (rate‑limited) |
| `enable_improve` | No | `true` | Run /improve suggestions |

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

**Groq (fast, cheap)**
```yaml
- uses: imtiyaazsalie/ai-pr-reviewer-template@v1
  with:
    ai_provider: groq
    ai_api_key: ${{ secrets.GROQ_API_KEY }}
    max_concurrency: 2
```

**Ollama (local, free, unlimited)**
```yaml
- uses: imtiyaazsalie/ai-pr-reviewer-template@v1
  with:
    ai_provider: ollama
    ai_model: llama3.1
```

**Any OpenAI‑compatible endpoint**
```yaml
- uses: imtiyaazsalie/ai-pr-reviewer-template@v1
  with:
    ai_base_url: https://your-api.company.com/v1/chat/completions
    ai_model: custom-model
    ai_api_key: ${{ secrets.CUSTOM_KEY }}
```

## Companion workflows

### CodeQL (deep semantic security)

Create `.github/workflows/codeql.yml` — CodeQL finds SQLi, XSS, and data‑flow vulnerabilities. It posts its own inline annotations, so it runs as a separate workflow.

```yaml
name: CodeQL
on:
  pull_request:
    types: [opened, synchronize, reopened]
jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      contents: read
    strategy:
      matrix:
        language: [javascript, python]
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with: { languages: ${{ matrix.language }} }
      - uses: github/codeql-action/autobuild@v3
      - uses: github/codeql-action/analyze@v3
```

### Conversational `@ai-reviewer`

Create `.github/workflows/conversation.yml` to enable `@ai-reviewer` replies on any PR comment.

### Learning from feedback

Create `.github/workflows/learn.yml` to record dismissed patterns and avoid repeating false positives.

## Running locally

```bash
npm install
npm test   # 21 tests, <1s
```

## Versioning

```yaml
uses: imtiyaazsalie/ai-pr-reviewer-template@v1    # pinned major (recommended)
uses: imtiyaazsalie/ai-pr-reviewer-template@main   # latest commit
```

## License

MIT — free for any use, including commercial.
