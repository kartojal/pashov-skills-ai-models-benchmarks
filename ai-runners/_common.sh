#!/usr/bin/env bash
# Shared utilities for AI runner scripts

set -euo pipefail

BENCHMARK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# Resolve target directory
resolve_target() {
  local target_name="$1"
  local target_dir="${BENCHMARK_ROOT}/targets/${target_name}/repo"
  if [[ ! -d "$target_dir" ]]; then
    log_error "Target not found: ${target_dir}"
    exit 1
  fi
  echo "$target_dir"
}

# Resolve report output path
resolve_report_path() {
  local target_name="$1"
  local runner_id="$2"
  local report_dir="${BENCHMARK_ROOT}/reports/${target_name}"
  mkdir -p "$report_dir"
  echo "${report_dir}/${runner_id}.json"
}

# Check if hermes is installed
require_hermes() {
  if ! command -v hermes &>/dev/null; then
    log_error "Hermes is not installed. Install with:"
    log_error "  curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash"
    exit 1
  fi
}

# Build the pashov skills audit prompt for any AI coding tool
build_audit_prompt() {
  local target_dir="$1"
  local report_path="$2"
  local harness="$3"
  local model="$4"

  cat <<PROMPT
You are running a security audit benchmark. Follow these steps exactly:

1. Install the pashov/skills solidity-auditor skill if not already installed.
2. Navigate to the target directory: ${target_dir}
3. Run the solidity-auditor skill against all .sol files in src/ (exclude tests/, interfaces/, lib/, mocks/).
4. Collect ALL findings from the audit.
5. Format the results as a JSON object matching this exact schema and write it to: ${report_path}

The JSON must have this structure:
{
  "metadata": {
    "model": "${model}",
    "harness": "${harness}",
    "target": "$(basename "$(dirname "$target_dir")")",
    "timestamp": "<ISO 8601 timestamp>",
    "duration_seconds": <elapsed seconds>,
    "skill_version": "v2"
  },
  "summary": {
    "total_findings": <count>,
    "critical": <count>,
    "high": <count>,
    "medium": <count>,
    "low": <count>,
    "informational": <count>
  },
  "findings": [
    {
      "id": "F-001",
      "title": "<finding title>",
      "severity": "<critical|high|medium|low|informational>",
      "confidence": "<high|medium|low>",
      "category": "<vulnerability category>",
      "description": "<detailed description>",
      "location": { "file": "<relative path>", "lines": "<line range>" },
      "recommendation": "<fix recommendation>",
      "agents_reporting": ["<agent names that found this>"]
    }
  ],
  "raw_output": "<full markdown output from the audit>"
}

IMPORTANT:
- Record start time before the audit and calculate duration_seconds.
- Each finding must have a unique sequential ID (F-001, F-002, ...).
- Classify severity accurately: critical (fund loss), high (significant risk), medium (moderate risk), low (minor), informational (best practice).
- Save the JSON file to exactly: ${report_path}
- Do NOT ask for confirmation, run autonomously.
PROMPT
}

# Run a benchmark using hermes as the orchestrator
run_benchmark() {
  local target_name="$1"
  local runner_id="$2"
  local harness="$3"
  local model="$4"
  local harness_cmd="$5"

  require_hermes

  local target_dir
  target_dir="$(resolve_target "$target_name")"

  local report_path
  report_path="$(resolve_report_path "$target_name" "$runner_id")"

  local audit_prompt
  audit_prompt="$(build_audit_prompt "$target_dir" "$report_path" "$harness" "$model")"

  log_info "Starting benchmark: ${runner_id}"
  log_info "  Target:  ${target_name} (${target_dir})"
  log_info "  Harness: ${harness}"
  log_info "  Model:   ${model}"
  log_info "  Report:  ${report_path}"

  local start_time
  start_time=$(date +%s)

  # Build hermes command
  local hermes_prompt="Run pashov skills solidity-auditor using ${harness_cmd} against directory ${target_dir} and save the structured JSON report to ${report_path}. ${audit_prompt}"

  log_info "Invoking Hermes..."
  hermes chat -q "$hermes_prompt" 2>&1 | tee "${report_path%.json}.log"

  local end_time
  end_time=$(date +%s)
  local duration=$(( end_time - start_time ))

  if [[ -f "$report_path" ]]; then
    log_ok "Benchmark complete: ${runner_id} (${duration}s)"
    log_ok "Report saved to: ${report_path}"

    # Patch duration if the AI didn't set it correctly
    if command -v jq &>/dev/null; then
      local tmp
      tmp=$(mktemp)
      jq --argjson dur "$duration" '.metadata.duration_seconds = $dur' "$report_path" > "$tmp" && mv "$tmp" "$report_path"
    fi
  else
    log_error "Benchmark failed: ${runner_id} — no report generated"
    # Create a minimal failure report
    cat > "$report_path" <<EOF
{
  "metadata": {
    "model": "${model}",
    "harness": "${harness}",
    "target": "${target_name}",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "duration_seconds": ${duration},
    "skill_version": "v2"
  },
  "summary": {
    "total_findings": 0,
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0,
    "informational": 0
  },
  "findings": [],
  "raw_output": "ERROR: Benchmark run failed. Check ${report_path%.json}.log for details."
}
EOF
    exit 1
  fi
}
