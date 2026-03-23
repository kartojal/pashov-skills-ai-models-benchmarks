#!/usr/bin/env bash
# Benchmark: Codex + OpenAI GPT 5.4
# Orchestrated by Hermes → invokes `codex` CLI with GPT 5.4

set -euo pipefail
source "$(dirname "$0")/_common.sh"

TARGET="${1:?Usage: $0 <target-name>}"
RUNNER_ID="codex-ai-gpt-5.4"
HARNESS="codex"
MODEL="openai/gpt-5.4"
HARNESS_CMD="Codex (codex --model openai/gpt-5.4)"

run_benchmark "$TARGET" "$RUNNER_ID" "$HARNESS" "$MODEL" "$HARNESS_CMD"
