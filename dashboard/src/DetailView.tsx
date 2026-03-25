import { useState, useMemo } from "react";
import type { Report, Finding } from "./types";
import { getModelLogo } from "./modelLogos";
import { getMatchedFindingIds } from "./findingMatcher";
import { NEON_SEVERITY_COLORS, NEON_SEVERITY_BG, NEON_CONFIDENCE_COLORS, NEON } from "./neonTheme";

const SEVERITY_COLORS = NEON_SEVERITY_COLORS;
const SEVERITY_BG = NEON_SEVERITY_BG;
const CONFIDENCE_COLORS = NEON_CONFIDENCE_COLORS;

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

  const humanReport = reports.find((r) => r.metadata.model === "human");
  const humanFindings = humanReport?.findings ?? [];

  const matchedIds = useMemo(() => {
    if (!activeReport || humanFindings.length === 0) return new Set<string>();
    return getMatchedFindingIds(activeReport.findings, humanFindings);
  }, [activeReport, humanFindings]);

  return (
    <div className="detail-layout">
      {/* Model Sidebar */}
      <div
        className="detail-sidebar"
        style={{
          width: 260,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            background: NEON.surface,
            border: `1px solid ${NEON.border}`,
            borderRadius: 12,
            overflow: "hidden",
            position: "sticky",
            top: 20,
          }}
        >
          <div
            style={{
              padding: "14px 20px",
              borderBottom: `1px solid ${NEON.border}`,
              fontSize: 12,
              fontWeight: 600,
              color: NEON.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Models ({reports.length})
          </div>
          <div className="model-list">
          {reports.map((r) => {
            const isActive = r.metadata.model === selectedModel;
            return (
              <button
                key={r.metadata.model}
                onClick={() => onSelectModel(r.metadata.model)}
                className={isActive ? "active" : ""}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "12px 20px",
                  border: "none",
                  borderBottom: "1px solid #1a1a2e",
                  borderLeft: isActive
                    ? "3px solid #6366f1"
                    : "3px solid transparent",
                  background: isActive ? `${NEON.accent}10` : "transparent",
                  color: isActive ? NEON.textPrimary : NEON.textSecondary,
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                  {getModelLogo(r.metadata.model) && (
                    <img
                      src={getModelLogo(r.metadata.model)!}
                      alt=""
                      style={{ width: 18, height: 18, flexShrink: 0, background: "white", borderRadius: "50%", padding: 2 }}
                    />
                  )}
                  {r.metadata.model}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: NEON.textMuted,
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
      </div>

      {/* Findings Panel */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!activeReport ? (
          <div
            style={{
              textAlign: "center",
              padding: 80,
              color: NEON.textMuted,
              background: NEON.surface,
              borderRadius: 12,
              border: `1px solid ${NEON.border}`,
            }}
          >
            <p style={{ fontSize: 16 }}>Select a model to view findings</p>
          </div>
        ) : (
          <>
            {/* Report Header */}
            <div
              style={{
                background: NEON.surface,
                border: `1px solid ${NEON.border}`,
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
                      color: NEON.textPrimary,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    {getModelLogo(activeReport.metadata.model) && (
                      <img
                        src={getModelLogo(activeReport.metadata.model)!}
                        alt=""
                        style={{ width: 28, height: 28, background: "white", borderRadius: "50%", padding: 3 }}
                      />
                    )}
                    {activeReport.metadata.model}
                  </h2>
                  <p
                    style={{
                      fontSize: 13,
                      color: NEON.textMuted,
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
                <div className="severity-filters" style={{ display: "flex", gap: 8 }}>
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
                              ? `1px solid ${sev === "all" ? NEON.accent : SEVERITY_COLORS[sev]}`
                              : `1px solid ${NEON.border}`,
                          background:
                            sev === severityFilter
                              ? sev === "all"
                                ? `${NEON.accent}20`
                                : SEVERITY_BG[sev]
                              : "transparent",
                          color:
                            sev === "all"
                              ? severityFilter === "all"
                                ? NEON.accentLight
                                : NEON.textMuted
                              : sev === severityFilter
                                ? SEVERITY_COLORS[sev]
                                : NEON.textMuted,
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
                        color: NEON.textSecondary,
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
                    isHumanMatch={matchedIds.has(finding.id)}
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
  isHumanMatch,
  onToggle,
}: {
  finding: Finding;
  expanded: boolean;
  isHumanMatch: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        background: NEON.surface,
        border: `1px solid ${expanded ? SEVERITY_COLORS[finding.severity] + "40" : NEON.border}`,
        borderRadius: 12,
        overflow: "hidden",
        transition: "border-color 0.2s",
      }}
    >
      {/* Finding header */}
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
          color: NEON.textPrimary,
        }}
      >
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 11,
            color: NEON.textMuted,
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
          className="finding-title"
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
                ? `${NEON.humanMatch}20`
                : finding.confidence === "medium"
                  ? `${NEON_CONFIDENCE_COLORS.medium}20`
                  : `${NEON_CONFIDENCE_COLORS.low}20`,
            color: CONFIDENCE_COLORS[finding.confidence],
          }}
        >
          {finding.confidence} conf
        </span>
        <span
          className="finding-category"
          style={{
            fontSize: 11,
            color: NEON.textMuted,
            padding: "2px 8px",
            borderRadius: 4,
            background: NEON.tagBg,
          }}
        >
          {finding.category}
        </span>
        {isHumanMatch && (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 700,
              background: `${NEON.humanMatch}20`,
              color: NEON.humanMatch,
              border: "1px solid #22c55e30",
              whiteSpace: "nowrap",
            }}
          >
            Human AI Match
          </span>
        )}
        <span
          style={{
            fontSize: 16,
            color: NEON.textMuted,
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
                color: NEON.textMuted,
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
                color: NEON.textPrimary,
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
                  color: NEON.textMuted,
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
                  color: NEON.accentLight,
                  background: NEON.tagBg,
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
                  color: NEON.textMuted,
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
                  color: NEON.humanMatch,
                  lineHeight: 1.6,
                  background: `${NEON.humanMatch}08`,
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
                  color: NEON.textMuted,
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
                      background: `${NEON.accent}20`,
                      color: NEON.accentLight,
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
