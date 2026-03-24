#!/usr/bin/env bash
# Benchmark: OpenCode + Claude Opus 4.6 via OpenRouter
# Invokes `opencode` CLI directly

set -euo pipefail
source "$(dirname "$0")/_common.sh"

TARGET="${1:?Usage: $0 <target-name>}"
RUN_ID="${2:-}"
RUNNER_ID="opencode-ai-claude-opus-4.6"
HARNESS="opencode"
MODEL="anthropic/claude-opus-4.6"
MODEL_ID="anthropic/claude-opus-4.6"

run_benchmark "$TARGET" "$RUNNER_ID" "$HARNESS" "$MODEL" "$MODEL_ID" "$RUN_ID"
