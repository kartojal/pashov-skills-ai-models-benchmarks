#!/usr/bin/env python3
"""Run Solidity security audit via OpenRouter API with anthropic/claude-opus-4.6"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError

REPO_DIR = "/home/vscode/projects/security-audit-skills-benchmark/targets/notional-finance/repo"
REPORT_PATH = "/home/vscode/projects/security-audit-skills-benchmark/reports/notional-finance/openrouter-claude-opus-4.6.json"
MODEL = "anthropic/claude-opus-4.6"
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

if not OPENROUTER_API_KEY:
    print("ERROR: OPENROUTER_API_KEY not set")
    sys.exit(1)

# Gather .sol files excluding tests/, interfaces/, lib/, mocks/
exclude_dirs = {"tests", "interfaces", "lib", "mocks"}
sol_files = []
for root, dirs, files in os.walk(os.path.join(REPO_DIR, "src")):
    dirs[:] = [d for d in dirs if d not in exclude_dirs]
    for f in files:
        if f.endswith(".sol"):
            rel = os.path.relpath(os.path.join(root, f), REPO_DIR)
            sol_files.append(rel)

sol_files.sort()
print(f"Found {len(sol_files)} Solidity files to audit")

# Read file contents
file_contents = {}
for fp in sol_files:
    with open(os.path.join(REPO_DIR, fp), "r") as fh:
        file_contents[fp] = fh.read()

# Build the code context
code_blocks = []
for fp, content in file_contents.items():
    code_blocks.append(f"### {fp}\n```solidity\n{content}\n```")
code_context = "\n\n".join(code_blocks)

SYSTEM_PROMPT = """You are an expert Solidity smart contract security auditor following the Pashov Audit Group methodology. You perform thorough, manual-style security reviews of DeFi smart contracts.

Your task: Perform a comprehensive security audit of the provided Solidity smart contracts.

## Audit Methodology
1. Review each contract for common vulnerability patterns (reentrancy, access control, integer overflow, flash loan attacks, oracle manipulation, etc.)
2. Check for DeFi-specific issues (economic attacks, MEV, front-running, sandwich attacks)
3. Verify invariant preservation and state machine correctness
4. Analyze upgrade mechanisms and proxy patterns
5. Review external call safety and token handling
6. Check for gas optimization issues that could be security-relevant

## Severity Classification
- **critical**: Direct fund loss, unauthorized token transfers, complete protocol drain
- **high**: Significant financial risk, exploitable under common conditions
- **medium**: Moderate risk, exploitable under specific/unlikely conditions  
- **low**: Minor issues, edge cases with limited impact
- **informational**: Best practice violations, code quality suggestions

## Output Format
Respond with a JSON object (and ONLY the JSON, no markdown fences) with this exact structure:
{
  "findings": [
    {
      "id": "F-001",
      "title": "Short descriptive title",
      "severity": "critical|high|medium|low|informational",
      "confidence": "high|medium|low",
      "category": "Vulnerability category (e.g., Reentrancy, Access Control, etc.)",
      "description": "Detailed description of the issue",
      "location": {"file": "relative/path.sol", "lines": "10-20"},
      "recommendation": "How to fix the issue"
    }
  ]
}

Be thorough. Find real issues. Do not invent fake vulnerabilities. If code is clean, say so with informational findings about code quality."""

USER_PROMPT = f"""Please perform a comprehensive security audit of the following Notional Finance V3 smart contracts. These are yield strategy and staking contracts for a DeFi protocol.

Analyze ALL the following contracts for security vulnerabilities:

{code_context}

Return your complete audit findings as a JSON object with the structure specified in your instructions."""

# Record start time
start_time = time.time()
start_ts = datetime.now(timezone.utc).isoformat()
print(f"Audit started at {start_ts}")

# Call OpenRouter API
payload = json.dumps({
    "model": MODEL,
    "messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": USER_PROMPT}
    ],
    "temperature": 0.1,
    "max_tokens": 16384
}).encode("utf-8")

req = Request("https://openrouter.ai/api/v1/chat/completions", data=payload, method="POST")
req.add_header("Authorization", f"Bearer {OPENROUTER_API_KEY}")
req.add_header("Content-Type", "application/json")
req.add_header("HTTP-Referer", "https://github.com/security-audit-skills-benchmark")

print(f"Calling OpenRouter API with model {MODEL}...")
try:
    resp = urlopen(req, timeout=600)
    response_data = json.loads(resp.read().decode("utf-8"))
except HTTPError as e:
    error_body = e.read().decode("utf-8", errors="replace")
    print(f"HTTP Error {e.code}: {error_body}")
    sys.exit(1)

end_time = time.time()
duration = round(end_time - start_time, 1)
print(f"Audit completed in {duration}s")

# Extract the model's response
raw_content = response_data["choices"][0]["message"]["content"]
usage = response_data.get("usage", {})
print(f"Token usage: {usage}")

# Parse findings from the model response
findings = []
raw_output = raw_content

# Try to extract JSON from the response (handle markdown fences if present)
json_str = raw_content.strip()
if json_str.startswith("```"):
    # Remove markdown fences
    lines = json_str.split("\n")
    json_lines = []
    in_json = False
    for line in lines:
        if line.strip().startswith("```") and not in_json:
            in_json = True
            continue
        elif line.strip().startswith("```") and in_json:
            in_json = False
            continue
        if in_json:
            json_lines.append(line)
    json_str = "\n".join(json_lines)

try:
    parsed = json.loads(json_str)
    raw_findings = parsed.get("findings", [])
    for i, f in enumerate(raw_findings):
        fid = f.get("id", f"F-{i+1:03d}")
        findings.append({
            "id": fid,
            "title": f.get("title", "Untitled"),
            "severity": f.get("severity", "informational").lower(),
            "confidence": f.get("confidence", "medium").lower(),
            "category": f.get("category", "Unknown"),
            "description": f.get("description", ""),
            "location": f.get("location", {"file": "unknown", "lines": "0"}),
            "recommendation": f.get("recommendation", ""),
            "agents_reporting": ["openrouter-claude-opus-4.6"]
        })
    print(f"Parsed {len(findings)} findings from JSON response")
except json.JSONDecodeError as e:
    print(f"WARNING: Could not parse JSON from response: {e}")
    print("Saving raw output only")
    findings = []

# Count severities
severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0}
for f in findings:
    sev = f["severity"]
    if sev in severity_counts:
        severity_counts[sev] += 1

# Build final report
report = {
    "metadata": {
        "model": MODEL,
        "harness": "openrouter",
        "target": "notional-finance",
        "timestamp": start_ts,
        "duration_seconds": duration,
        "skill_version": "v2"
    },
    "summary": {
        "total_findings": len(findings),
        "critical": severity_counts["critical"],
        "high": severity_counts["high"],
        "medium": severity_counts["medium"],
        "low": severity_counts["low"],
        "informational": severity_counts["informational"]
    },
    "findings": findings,
    "raw_output": raw_output
}

# Write report
os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
with open(REPORT_PATH, "w") as f:
    json.dump(report, f, indent=2, ensure_ascii=False)

print(f"\nReport saved to {REPORT_PATH}")
print(f"Total findings: {len(findings)}")
print(f"  Critical: {severity_counts['critical']}")
print(f"  High: {severity_counts['high']}")
print(f"  Medium: {severity_counts['medium']}")
print(f"  Low: {severity_counts['low']}")
print(f"  Informational: {severity_counts['informational']}")
print(f"Duration: {duration}s")
