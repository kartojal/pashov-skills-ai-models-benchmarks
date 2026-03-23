import { useState } from "react";
import type { Report, Finding } from "./types";

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

interface Props {
  reports: Report[];
  selectedModel: string | null;
  onSelectModel: (model: string | null) => void;
}

export function DetailView({ reports, selectedModel, onSelectModel }: Props) {
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const activeReport = selectedModel
    ? reports.find((r) => r.metadata.model === selectedModel)
    : null;

  return (
    <div style={{ display: "flex", gap: 20 }}>
      {/* Model Sidebar */}
      <div
        style={{
          width: 260,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            background: "#12121f",
            border: "1px solid #2a2a4a",
            borderRadius: 12,
            overflow: "hidden",
            position: "sticky",
            top: 20,
          }}
        >
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid #2a2a4a",
              fontSize: 12,
              fontWeight: 600,
              color: "#666680",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Models ({reports.length})
          </div>
          {reports.map((r) => {
            const isActive = r.metadata.model === selectedModel;
            return (
              <button
                key={r.metadata.model}
                onClick={() => onSelectModel(r.metadata.model)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "12px 20px",
                  border: "none",
                  borderBottom: "1px solid #1a1a2e",
                  borderLeft: isActive
                    ? "3px solid #6366f1"
                    : "3px solid transparent",
                  background: isActive ? "#6366f110" : "transparent",
                  color: isActive ? "#e0e0e8" : "#8888aa",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 600 }}>{r.metadata.model}</div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#666680",
                    marginTop: 2,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{r.metadata.harness}</span>
                  <span>{r.summary.total_findings} findings</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Findings Panel */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!activeReport ? (
          <div
            style={{
              textAlign: "center",
              padding: 80,
              color: "#666680",
              background: "#12121f",
              borderRadius: 12,
              border: "1px solid #2a2a4a",
            }}
          >
            <p style={{ fontSize: 16 }}>Select a model to view findings</p>
          </div>
        ) : (
          <>
            {/* Report Header */}
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
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: "#e0e0e8",
                    }}
                  >
                    {activeReport.metadata.model}
                  </h2>
                  <p
                    style={{
                      fontSize: 13,
                      color: "#666680",
                      marginTop: 4,
                    }}
                  >
                    {activeReport.metadata.harness} &middot;{" "}
                    {activeReport.metadata.duration_seconds}s &middot;{" "}
                    {new Date(
                      activeReport.metadata.timestamp
                    ).toLocaleString()}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {(
                    [
                      "all",
                      "critical",
                      "high",
                      "medium",
                      "low",
                      "informational",
                    ] as const
                  ).map((sev) => {
                    const count =
                      sev === "all"
                        ? activeReport.summary.total_findings
                        : activeReport.summary[sev];
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
                style={{
                  display: "flex",
                  gap: 12,
                  marginTop: 16,
                }}
              >
                {(
                  ["critical", "high", "medium", "low", "informational"] as const
                ).map((sev) => (
                  <div
                    key={sev}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
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
                      {sev}: {activeReport.summary[sev]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Findings List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {activeReport.findings
                .filter(
                  (f) =>
                    severityFilter === "all" || f.severity === severityFilter
                )
                .map((finding) => (
                  <FindingCard
                    key={finding.id}
                    finding={finding}
                    expanded={expandedFinding === finding.id}
                    onToggle={() =>
                      setExpandedFinding(
                        expandedFinding === finding.id ? null : finding.id
                      )
                    }
                  />
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FindingCard({
  finding,
  expanded,
  onToggle,
}: {
  finding: Finding;
  expanded: boolean;
  onToggle: () => void;
}) {
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
      {/* Finding header */}
      <button
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
            fontFamily: "monospace",
            fontSize: 11,
            color: "#666680",
            minWidth: 40,
          }}
        >
          {finding.id}
        </span>
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
          style={{
            flex: 1,
            fontSize: 14,
            fontWeight: 600,
          }}
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
          {/* Description */}
          <div style={{ marginTop: 16 }}>
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
            <p
              style={{
                fontSize: 13,
                color: "#c0c0d0",
                lineHeight: 1.6,
              }}
            >
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

          {/* Agents */}
          {finding.agents_reporting && finding.agents_reporting.length > 0 && (
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
                Detected by Agents
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {finding.agents_reporting.map((agent) => (
                  <span
                    key={agent}
                    style={{
                      padding: "3px 10px",
                      borderRadius: 6,
                      fontSize: 11,
                      background: "#6366f120",
                      color: "#a5b4fc",
                      border: "1px solid #6366f130",
                    }}
                  >
                    {agent}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
