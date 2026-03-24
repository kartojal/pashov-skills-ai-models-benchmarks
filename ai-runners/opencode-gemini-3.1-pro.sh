#!/usr/bin/env bash
# Benchmark: OpenCode + Google Gemini 3.1 Pro Preview
# Invokes `opencode` CLI directly

set -euo pipefail
source "$(dirname "$0")/_common.sh"

TARGET="${1:?Usage: $0 <target-name>}"
RUN_ID="${2:-}"
RUNNER_ID="opencode-ai-gemini-3.1-pro"
HARNESS="opencode"
MODEL="google/gemini-3.1-pro-preview"
MODEL_ID="google/gemini-3.1-pro-preview"

run_benchmark "$TARGET" "$RUNNER_ID" "$HARNESS" "$MODEL" "$MODEL_ID" "$RUN_ID"
