#!/usr/bin/env bash
# Benchmark: OpenCode + Google Gemini 3.1 Pro Preview
# Orchestrated by Hermes → invokes `opencode` CLI with Gemini 3.1 Pro

set -euo pipefail
source "$(dirname "$0")/_common.sh"

TARGET="${1:?Usage: $0 <target-name>}"
RUNNER_ID="opencode-ai-gemini-3.1-pro"
HARNESS="opencode"
MODEL="google/gemini-3.1-pro-preview"
HARNESS_CMD="OpenCode (opencode --model google/gemini-3.1-pro-preview)"

run_benchmark "$TARGET" "$RUNNER_ID" "$HARNESS" "$MODEL" "$HARNESS_CMD"
