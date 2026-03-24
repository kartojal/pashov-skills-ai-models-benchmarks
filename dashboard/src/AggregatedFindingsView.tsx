import { useState, useMemo } from "react";
import type { Report, Finding } from "./types";
import { getModelLogo } from "./modelLogos";
import { matchScore } from "./findingMatcher";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  informational: "#8b5cf6",
};

const SEVERITY_BG: Record<string, string> = {
  critical: "#ef444420",
  high: "#f9731620",
  medium: "#eab30820",
  low: "#3b82f620",
  informational: "#8b5cf620",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "#22c55e",
  medium: "#eab308",
  low: "#ef4444",
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "informational"];

interface AggregatedFinding {
  /** Representative finding (longest description from the group) */
  finding: Finding;
  /** Models that reported this finding */
  models: string[];
  /** Whether it matches a human finding */
  humanMatch: boolean;
  /** The matched human finding (if any) */
  matchedHumanFinding: Finding | null;
}

const MATCH_THRESHOLD = 0.5;

function aggregateFindings(reports: Report[]): AggregatedFinding[] {
  const humanReport = reports.find((r) => r.metadata.model === "human");
  const humanFindings = humanReport?.findings ?? [];
  const aiReports = reports.filter((r) => r.metadata.model !== "human");

  // Collect all (finding, model) pairs
  const allEntries: { finding: Finding; model: string }[] = [];
  for (const report of aiReports) {
    for (const finding of report.findings) {
      allEntries.push({ finding, model: report.metadata.model });
    }
  }

  // Group similar findings using union-find style greedy clustering
  const groups: { findings: { finding: Finding; model: string }[] }[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < allEntries.length; i++) {
    if (assigned.has(i)) continue;
    const group = [allEntries[i]!];
    assigned.add(i);

    for (let j = i + 1; j < allEntries.length; j++) {
      if (assigned.has(j)) continue;
      // Check if this finding matches any finding already in the group
      const score = matchScore(allEntries[j]!.finding, allEntries[i]!.finding);
      if (score >= MATCH_THRESHOLD) {
        group.push(allEntries[j]!);
        assigned.add(j);
      }
    }
    groups.push({ findings: group });
  }

  // Build aggregated findings
  const aggregated: AggregatedFinding[] = groups.map((group) => {
    // Pick representative: prefer longest description
    const sorted = [...group.findings].sort(
      (a, b) => b.finding.description.length - a.finding.description.length
    );
    const representative = sorted[0]!.finding;

    // Unique models
    const modelSet = new Set(group.findings.map((e) => e.model));

    // Check human match
    let humanMatch = false;
    let matchedHumanFinding: Finding | null = null;
    for (const hf of humanFindings) {
      const score = matchScore(representative, hf);
      if (score >= MATCH_THRESHOLD) {
        humanMatch = true;
        matchedHumanFinding = hf;
        break;
      }
    }

    return {
      finding: representative,
      models: Array.from(modelSet).sort(),
      humanMatch,
      matchedHumanFinding,
    };
  });

  // Sort by severity then by number of models (descending)
  aggregated.sort((a, b) => {
    const sevDiff =
      SEVERITY_ORDER.indexOf(a.finding.severity) -
      SEVERITY_ORDER.indexOf(b.finding.severity);
    if (sevDiff !== 0) return sevDiff;
    return b.models.length - a.models.length;
  });

  return aggregated;
}

interface Props {
  reports: Report[];
}

export function AggregatedFindingsView({ reports }: Props) {
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const aggregated = useMemo(() => aggregateFindings(reports), [reports]);

  const humanReport = reports.find((r) => r.metadata.model === "human");
  const aiReportCount = reports.filter((r) => r.metadata.model !== "human").length;

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
    };
    for (const a of aggregated) {
      counts[a.finding.severity] = (counts[a.finding.severity] || 0) + 1;
    }
    return counts;
  }, [aggregated]);

  const filtered = severityFilter === "all"
    ? aggregated
    : aggregated.filter((a) => a.finding.severity === severityFilter);

  const humanMatchCount = aggregated.filter((a) => a.humanMatch).length;

  return (
    <div>
      {/* Summary cards */}
      <div
        className="score-cards"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <SummaryCard label="Unique Findings" value={aggregated.length} />
        <SummaryCard label="Models Analyzed" value={aiReportCount} />
        <SummaryCard
          label="Human Matches"
          value={
            humanReport
              ? `${humanMatchCount} / ${humanReport.findings.length}`
              : "N/A"
          }
        />
        <SummaryCard
          label="Multi-Model Findings"
          value={aggregated.filter((a) => a.models.length > 1).length}
        />
      </div>

      {/* Filters + severity pills */}
      <div
        style={{
          background: "#12121f",
          border: "1px solid #2a2a4a",
          borderRadius: 12,
          padding: "20px 24px",
          marginBottom: 16,
        }}
      >
        <div
          className="agg-filter-bar"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#e0e0e8" }}>
            All Aggregated Findings
          </h2>
          <div className="severity-filters" style={{ display: "flex", gap: 8 }}>
            {(
              ["all", "critical", "high", "medium", "low", "informational"] as const
            ).map((sev) => {
              const count =
                sev === "all" ? aggregated.length : (severityCounts[sev] ?? 0);
              return (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border:
                      sev === severityFilter
                        ? `1px solid ${sev === "all" ? "#6366f1" : SEVERITY_COLORS[sev]}`
                        : "1px solid #2a2a4a",
                    background:
                      sev === severityFilter
                        ? sev === "all"
                          ? "#6366f120"
                          : SEVERITY_BG[sev]
                        : "transparent",
                    color:
                      sev === "all"
                        ? severityFilter === "all"
                          ? "#a5b4fc"
                          : "#666680"
                        : sev === severityFilter
                          ? SEVERITY_COLORS[sev]
                          : "#666680",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "capitalize",
                  }}
                >
                  {sev} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Severity summary pills */}
        <div
          className="severity-summary-pills"
          style={{ display: "flex", gap: 12, marginTop: 16 }}
        >
          {SEVERITY_ORDER.map((sev) => (
            <div
              key={sev}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: SEVERITY_COLORS[sev],
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  color: "#8888aa",
                  textTransform: "capitalize",
                }}
              >
                {sev}: {severityCounts[sev] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Findings list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map((agg, idx) => (
          <AggregatedFindingCard
            key={`${agg.finding.severity}-${idx}`}
            agg={agg}
            expanded={expandedFinding === `${agg.finding.severity}-${idx}`}
            onToggle={() =>
              setExpandedFinding(
                expandedFinding === `${agg.finding.severity}-${idx}`
                  ? null
                  : `${agg.finding.severity}-${idx}`
              )
            }
          />
        ))}
        {filtered.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: 60,
              color: "#666680",
              background: "#12121f",
              borderRadius: 12,
              border: "1px solid #2a2a4a",
            }}
          >
            No findings match this filter.
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        background: "#12121f",
        border: "1px solid #2a2a4a",
        borderRadius: 12,
        padding: "20px 24px",
      }}
    >
      <div style={{ fontSize: 11, color: "#666680", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#e0e0e8", marginTop: 6 }}>
        {value}
      </div>
    </div>
  );
}

function AggregatedFindingCard({
  agg,
  expanded,
  onToggle,
}: {
  agg: AggregatedFinding;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { finding, models, humanMatch, matchedHumanFinding } = agg;

  return (
    <div
      style={{
        background: "#12121f",
        border: `1px solid ${expanded ? SEVERITY_COLORS[finding.severity] + "40" : "#2a2a4a"}`,
        borderRadius: 12,
        overflow: "hidden",
        transition: "border-color 0.2s",
      }}
    >
      {/* Header */}
      <button
        className="finding-header"
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          padding: "14px 20px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
          color: "#e0e0e8",
        }}
      >
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            background: SEVERITY_BG[finding.severity],
            color: SEVERITY_COLORS[finding.severity],
            minWidth: 80,
            textAlign: "center",
          }}
        >
          {finding.severity}
        </span>
        <span
          className="finding-title"
          style={{ flex: 1, fontSize: 14, fontWeight: 600 }}
        >
          {finding.title}
        </span>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 600,
            background:
              finding.confidence === "high"
                ? "#22c55e20"
                : finding.confidence === "medium"
                  ? "#eab30820"
                  : "#ef444420",
            color: CONFIDENCE_COLORS[finding.confidence],
          }}
        >
          {finding.confidence} conf
        </span>
        <span
          className="finding-category"
          style={{
            fontSize: 11,
            color: "#666680",
            padding: "2px 8px",
            borderRadius: 4,
            background: "#1a1a2e",
          }}
        >
          {finding.category}
        </span>
        {/* Model count badge */}
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 700,
            background: models.length > 1 ? "#6366f120" : "#2a2a4a40",
            color: models.length > 1 ? "#a5b4fc" : "#666680",
            border: models.length > 1 ? "1px solid #6366f130" : "1px solid #2a2a4a",
            whiteSpace: "nowrap",
          }}
        >
          {models.length} model{models.length !== 1 ? "s" : ""}
        </span>
        {humanMatch && (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 700,
              background: "#22c55e20",
              color: "#22c55e",
              border: "1px solid #22c55e30",
              whiteSpace: "nowrap",
            }}
          >
            Human Match
          </span>
        )}
        <span
          style={{
            fontSize: 16,
            color: "#666680",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        >
          &#9660;
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div
          style={{
            padding: "0 20px 20px",
            borderTop: "1px solid #1a1a2e",
          }}
        >
          {/* Models that found this */}
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#666680",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 8,
              }}
            >
              Found by Models ({models.length})
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {models.map((model) => (
                <span
                  key={model}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    background: "#6366f115",
                    color: "#a5b4fc",
                    border: "1px solid #6366f125",
                  }}
                >
                  {getModelLogo(model) && (
                    <img
                      src={getModelLogo(model)!}
                      alt=""
                      style={{
                        width: 14,
                        height: 14,
                        background: "white",
                        borderRadius: "50%",
                        padding: 1,
                      }}
                    />
                  )}
                  {model}
                </span>
              ))}
            </div>
          </div>

          {/* Human match details */}
          {humanMatch && matchedHumanFinding && (
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#666680",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 6,
                }}
              >
                Matched Human Finding
              </div>
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 8,
                  background: "#22c55e08",
                  border: "1px solid #22c55e20",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 11,
                      color: "#666680",
                    }}
                  >
                    {matchedHumanFinding.id}
                  </span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      background: SEVERITY_BG[matchedHumanFinding.severity],
                      color: SEVERITY_COLORS[matchedHumanFinding.severity],
                    }}
                  >
                    {matchedHumanFinding.severity}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#88cc88" }}>
                    {matchedHumanFinding.title}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: "#88aa88", lineHeight: 1.5 }}>
                  {matchedHumanFinding.description}
                </p>
              </div>
            </div>
          )}

          {/* Description */}
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#666680",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 6,
              }}
            >
              Description
            </div>
            <p style={{ fontSize: 13, color: "#c0c0d0", lineHeight: 1.6 }}>
              {finding.description}
            </p>
          </div>

          {/* Location */}
          {finding.location && (
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#666680",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 6,
                }}
              >
                Location
              </div>
              <code
                style={{
                  fontSize: 12,
                  color: "#a5b4fc",
                  background: "#1a1a2e",
                  padding: "4px 10px",
                  borderRadius: 6,
                }}
              >
                {finding.location.file}:{finding.location.lines}
              </code>
            </div>
          )}

          {/* Recommendation */}
          {finding.recommendation && (
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#666680",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 6,
                }}
              >
                Recommendation
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "#88cc88",
                  lineHeight: 1.6,
                  background: "#22c55e08",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #22c55e20",
                }}
              >
                {finding.recommendation}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
