#!/usr/bin/env bash
# Master orchestrator — runs all AI security audit benchmarks against a target.
# Each runner invokes its harness (claude-code, opencode, codex) directly.
#
# Usage:
#   ./run-all.sh <target-name>                                # Run all sequentially
#   ./run-all.sh <target-name> --parallel                     # Run all in parallel
#   ./run-all.sh <target-name> --only claude-code-opus-4.6    # Run specific runner
#   ./run-all.sh <target-name> --run-id run-1                 # Tag this run
#   ./run-all.sh <target-name> --dry-run                      # Print prompts, don't run

set -euo pipefail

BENCHMARK_ROOT="$(cd "$(dirname "$0")" && pwd)"
RUNNERS_DIR="${BENCHMARK_ROOT}/ai-runners"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

TARGET="${1:?Usage: $0 <target-name> [--parallel] [--only <runner>] [--run-id <id>] [--dry-run]}"
shift

PARALLEL=false
ONLY=""
RUN_ID=""
export DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --parallel)  PARALLEL=true; shift ;;
    --only)      ONLY="$2"; shift 2 ;;
    --run-id)    RUN_ID="$2"; shift 2 ;;
    --dry-run)   DRY_RUN=true; shift ;;
    *)           echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# All runner scripts (excluding _common.sh)
RUNNERS=(
  "claude-code-opus-4.6"
  "claude-code-sonnet-4.6"
  "opencode-gemini-3.1-pro"
  "codex-gpt-5.4"
  "opencode-mimo-v2-pro"
  "opencode-minimax-m2.7"
  "opencode-qwen3.5-9b"
  "opencode-qwen3.5-27b"
  "opencode-grok-4.20-beta"
)

# Filter to single runner if --only specified
if [[ -n "$ONLY" ]]; then
  RUNNERS=("$ONLY")
fi

echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       Security Audit Skills Benchmark                       ║${NC}"
echo -e "${BOLD}║       Pashov Skills × AI Models Comparison                  ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Target:${NC}   ${TARGET}"
echo -e "${CYAN}Runners:${NC}  ${#RUNNERS[@]}"
echo -e "${CYAN}Mode:${NC}     $(if $PARALLEL; then echo "parallel"; else echo "sequential"; fi)"
[[ -n "$RUN_ID" ]] && echo -e "${CYAN}Run ID:${NC}   ${RUN_ID}"
[[ "$DRY_RUN" == "true" ]] && echo -e "${YELLOW}Dry run:${NC}  prompts only (no harness invocation)"
echo ""

# Verify target exists
if [[ ! -d "${BENCHMARK_ROOT}/targets/${TARGET}/repo" ]]; then
  echo -e "${RED}[ERROR]${NC} Target not found: targets/${TARGET}/repo" >&2
  exit 1
fi

TOTAL=${#RUNNERS[@]}
PASSED=0
FAILED=0
PIDS=()
RUNNER_NAMES=()

start_time=$(date +%s)

run_single() {
  local runner="$1"
  local idx="$2"
  local script="${RUNNERS_DIR}/${runner}.sh"

  if [[ ! -x "$script" ]]; then
    echo -e "${RED}[${idx}/${TOTAL}] Runner not found or not executable: ${runner}${NC}" >&2
    return 1
  fi

  echo -e "${CYAN}[${idx}/${TOTAL}]${NC} Starting: ${BOLD}${runner}${NC}"
  if "$script" "$TARGET" "$RUN_ID"; then
    echo -e "${GREEN}[${idx}/${TOTAL}] PASS:${NC} ${runner}"
    return 0
  else
    echo -e "${RED}[${idx}/${TOTAL}] FAIL:${NC} ${runner}"
    return 1
  fi
}

if $PARALLEL; then
  echo -e "${YELLOW}Launching all runners in parallel...${NC}"
  echo ""

  # Determine report dir for logs
  report_base="${BENCHMARK_ROOT}/reports/${TARGET}"
  [[ -n "$RUN_ID" ]] && report_base="${report_base}/${RUN_ID}"
  mkdir -p "$report_base"

  for i in "${!RUNNERS[@]}"; do
    runner="${RUNNERS[$i]}"
    idx=$((i + 1))
    script="${RUNNERS_DIR}/${runner}.sh"

    if [[ ! -x "$script" ]]; then
      echo -e "${RED}[${idx}/${TOTAL}] Runner not found: ${runner}${NC}" >&2
      FAILED=$((FAILED + 1))
      continue
    fi

    log_file="${report_base}/${runner}.parallel.log"
    "$script" "$TARGET" "$RUN_ID" > "$log_file" 2>&1 &
    PIDS+=($!)
    RUNNER_NAMES+=("$runner")
    echo -e "${CYAN}[${idx}/${TOTAL}]${NC} Launched: ${runner} (PID $!)"
  done

  echo ""
  echo -e "${YELLOW}Waiting for all runners to finish...${NC}"

  for i in "${!PIDS[@]}"; do
    pid="${PIDS[$i]}"
    runner="${RUNNER_NAMES[$i]}"
    if wait "$pid"; then
      echo -e "${GREEN}  PASS:${NC} ${runner}"
      PASSED=$((PASSED + 1))
    else
      echo -e "${RED}  FAIL:${NC} ${runner}"
      FAILED=$((FAILED + 1))
    fi
  done
else
  echo -e "${YELLOW}Running benchmarks sequentially...${NC}"
  echo ""

  for i in "${!RUNNERS[@]}"; do
    runner="${RUNNERS[$i]}"
    idx=$((i + 1))
    if run_single "$runner" "$idx"; then
      PASSED=$((PASSED + 1))
    else
      FAILED=$((FAILED + 1))
    fi
    echo ""
  done
fi

end_time=$(date +%s)
total_duration=$((end_time - start_time))

echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Results${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
echo -e "  Total:    ${TOTAL}"
echo -e "  ${GREEN}Passed:${NC}   ${PASSED}"
echo -e "  ${RED}Failed:${NC}   ${FAILED}"
echo -e "  Duration: ${total_duration}s"
echo ""
report_dir="${BENCHMARK_ROOT}/reports/${TARGET}"
[[ -n "$RUN_ID" ]] && report_dir="${report_dir}/${RUN_ID}"
echo -e "  Reports: ${report_dir}/"
echo ""
echo -e "  View dashboard: ${CYAN}cd dashboard && bun run dev${NC}"
echo ""

if [[ $FAILED -gt 0 ]]; then
  exit 1
fi
