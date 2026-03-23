#!/usr/bin/env bash
# Benchmark: OpenCode + xAI Grok 4.20 Beta
# Orchestrated by Hermes → invokes `opencode` CLI with Grok 4.20 Beta

set -euo pipefail
source "$(dirname "$0")/_common.sh"

TARGET="${1:?Usage: $0 <target-name>}"
RUNNER_ID="opencode-ai-grok-4.20-beta"
HARNESS="opencode"
MODEL="x-ai/grok-4.20-beta"
HARNESS_CMD="OpenCode (opencode --model x-ai/grok-4.20-beta)"

run_benchmark "$TARGET" "$RUNNER_ID" "$HARNESS" "$MODEL" "$HARNESS_CMD"
