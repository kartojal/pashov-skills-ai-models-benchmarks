#!/usr/bin/env bash
# Benchmark: Codex + OpenAI GPT 5.4
# Invokes `codex` CLI directly

set -euo pipefail
source "$(dirname "$0")/_common.sh"

TARGET="${1:?Usage: $0 <target-name>}"
RUN_ID="${2:-}"
RUNNER_ID="codex-ai-gpt-5.4"
HARNESS="codex"
MODEL="openai/gpt-5.4"
MODEL_ID="openai/gpt-5.4"

run_benchmark "$TARGET" "$RUNNER_ID" "$HARNESS" "$MODEL" "$MODEL_ID" "$RUN_ID"
