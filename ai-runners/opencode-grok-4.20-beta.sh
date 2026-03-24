#!/usr/bin/env bash
# Benchmark: OpenCode + xAI Grok 4.20 Beta
# Invokes `opencode` CLI directly

set -euo pipefail
source "$(dirname "$0")/_common.sh"

TARGET="${1:?Usage: $0 <target-name>}"
RUN_ID="${2:-}"
RUNNER_ID="opencode-ai-grok-4.20-beta"
HARNESS="opencode"
MODEL="x-ai/grok-4.20-beta"
MODEL_ID="x-ai/grok-4.20-beta"

run_benchmark "$TARGET" "$RUNNER_ID" "$HARNESS" "$MODEL" "$MODEL_ID" "$RUN_ID"
