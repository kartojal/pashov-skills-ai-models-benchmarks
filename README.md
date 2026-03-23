# Security Audit Skills Benchmark

Benchmark comparing AI models + AI coding tools for Solidity smart contract security auditing using [Pashov Skills](https://github.com/pashov/skills).

## Overview

This benchmark runs the **pashov/skills solidity-auditor** skill across multiple AI model + harness combinations against the same set of smart contracts, then visualizes the results in a local dashboard for comparison.

## Models & Harnesses

| Harness | Model | Runner Script |
|---------|-------|---------------|
| Claude Code | Claude Opus 4.6 | `ai-runners/claude-code-opus-4.6.sh` |
| Claude Code | Claude Sonnet 4.6 | `ai-runners/claude-code-sonnet-4.6.sh` |
| OpenCode | Google Gemini 3.1 Pro | `ai-runners/opencode-gemini-3.1-pro.sh` |
| Codex | OpenAI GPT 5.4 | `ai-runners/codex-gpt-5.4.sh` |
| OpenCode | Xiaomi MiMo v2 Pro | `ai-runners/opencode-mimo-v2-pro.sh` |
| OpenCode | MiniMax M2.7 | `ai-runners/opencode-minimax-m2.7.sh` |
| OpenCode | Qwen 3.5 9B | `ai-runners/opencode-qwen3.5-9b.sh` |
| OpenCode | xAI Grok 4.20 Beta | `ai-runners/opencode-grok-4.20-beta.sh` |

## Prerequisites

- [Hermes Agent](https://hermes-agent.nousresearch.com/docs/) installed (`curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash`)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed (`npm install -g @anthropic-ai/claude-code`)
- [OpenCode](https://github.com/opencode-ai/opencode) installed
- [Codex](https://github.com/openai/codex) installed
- [Bun](https://bun.sh/) installed (for dashboard)
- API keys configured for each provider in `~/.hermes/.env`

## Quick Start

### Run All Benchmarks

```bash
# Run all model+harness combinations against notional-finance
./run-all.sh notional-finance

# Run a single benchmark
./ai-runners/claude-code-opus-4.6.sh notional-finance
```

### View Dashboard

```bash
cd dashboard
bun install
bun run dev
```

Open http://localhost:5173 to view the comparison dashboard.

## Directory Structure

```
security-audit-skills-benchmark/
├── ai-runners/           # One bash script per model+harness combo
│   ├── claude-code-opus-4.6.sh
│   ├── claude-code-sonnet-4.6.sh
│   ├── opencode-gemini-3.1-pro.sh
│   ├── codex-gpt-5.4.sh
│   ├── opencode-mimo-v2-pro.sh
│   ├── opencode-minimax-m2.7.sh
│   ├── opencode-qwen3.5-9b.sh
│   └── opencode-grok-4.20-beta.sh
├── targets/              # Smart contract codebases to audit
│   └── notional-finance/
│       └── repo/         # Solidity source code
├── reports/              # JSON benchmark results
│   └── notional-finance/
│       └── *.json
├── dashboard/            # Bun + Vite visualization app
├── run-all.sh            # Master orchestrator
├── report-schema.json    # JSON schema for report format
└── README.md
```

## Report Format

Each benchmark run produces a JSON report conforming to `report-schema.json`:

```json
{
  "metadata": {
    "model": "claude-opus-4.6",
    "harness": "claude-code",
    "target": "notional-finance",
    "timestamp": "2026-03-23T12:00:00Z",
    "duration_seconds": 180,
    "skill_version": "v2"
  },
  "summary": {
    "total_findings": 5,
    "critical": 1,
    "high": 2,
    "medium": 1,
    "low": 0,
    "informational": 1
  },
  "findings": [...],
  "raw_output": "..."
}
```

## Targets

### Notional Finance
Leveraged vault strategies for Notional V3 — includes yield strategies, staking, withdraw request managers, oracles, reward managers, routers, and proxy contracts.

## License

MIT
