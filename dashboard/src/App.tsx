import { useState, useEffect, useCallback } from "react";
import reportsData from "virtual:reports";
import type { ReportsMap } from "./types";
import { ComparisonView } from "./ComparisonView";
import { DetailView } from "./DetailView";
import { AggregatedFindingsView } from "./AggregatedFindingsView";
import "./responsive.css";

const reports = reportsData as ReportsMap;
const targets = Object.keys(reports);

function parseHash(): { target?: string; tab?: string; model?: string } {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return {
    target: params.get("target") || undefined,
    tab: params.get("tab") || undefined,
    model: params.get("model") || undefined,
  };
}

function buildHash(target: string, tab: string, model: string | null): string {
  const params = new URLSearchParams();
  params.set("target", target);
  params.set("tab", tab);
  if (model) params.set("model", model);
  return "#" + params.toString();
}

export function App() {
  const initial = parseHash();
  const [activeTarget, setActiveTarget] = useState(
    initial.target && targets.includes(initial.target) ? initial.target : "notional-finance"
  );
  const [activeTab, setActiveTab] = useState<"comparison" | "details" | "aggregated">(
    initial.tab === "details" ? "details" : initial.tab === "aggregated" ? "aggregated" : "comparison"
  );
  const [selectedModel, setSelectedModel] = useState<string | null>(
    initial.model || null
  );

  // Sync state to URL hash
  useEffect(() => {
    const hash = buildHash(activeTarget, activeTab, selectedModel);
    if (window.location.hash !== hash) {
      window.history.pushState(null, "", hash);
    }
  }, [activeTarget, activeTab, selectedModel]);

  // Listen for back/forward navigation
  const onHashChange = useCallback(() => {
    const h = parseHash();
    if (h.target && targets.includes(h.target)) setActiveTarget(h.target);
    if (h.tab === "details" || h.tab === "comparison" || h.tab === "aggregated") setActiveTab(h.tab);
    setSelectedModel(h.model || null);
  }, []);

  useEffect(() => {
    window.addEventListener("popstate", onHashChange);
    return () => window.removeEventListener("popstate", onHashChange);
  }, [onHashChange]);

  const targetReports = reports[activeTarget] || [];

  // Sort by total findings descending
  const sortedReports = [...targetReports].sort(
    (a, b) => b.summary.total_findings - a.summary.total_findings
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f" }}>
      {/* Header */}
      <header
        className="app-header"
        style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
          borderBottom: "1px solid #2a2a4a",
          padding: "20px 32px",
        }}
      >
        <div
          className="app-header-inner"
          style={{
            display: "flex",
            flexDirection: "column",
            maxWidth: 1400,
            margin: "0 auto",
          }}
        >
          <div className="header-top-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <div>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: "#fff",
                  letterSpacing: "-0.02em",
                }}
              >
                AI Audit Web3 Benchmark
              </h1>
              <p style={{ fontSize: 13, color: "#8888aa", marginTop: 4 }}>
                Pashov Skills Comparison
              </p>
            </div>
            <div className="header-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <a
                href="https://github.com/kartojal/pashov-skills-ai-models-benchmarks"
                target="_blank"
                rel="noopener noreferrer"
                title="Star on GitHub"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid #4a4a6a",
                  background: "transparent",
                  color: "#ffffff",
                  textDecoration: "none",
                  fontSize: 15,
                  fontWeight: 600,
                  transition: "border-color 0.2s, color 0.2s",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = "#6366f1";
                  e.currentTarget.style.color = "#ffffff";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = "#4a4a6a";
                  e.currentTarget.style.color = "#ffffff";
                }}
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="#ffffff">
                  <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z" />
                </svg>
                Star
              </a>
              <a
                href="https://x.com/pashov"
                target="_blank"
                rel="noopener noreferrer"
                title="@pashov"
              >
                <img
                  src="https://avatars.githubusercontent.com/u/32573397?v=4"
                  alt="Pashov"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    border: "2px solid #2a2a4a",
                    objectFit: "cover",
                    transition: "border-color 0.2s",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onMouseOut={(e) => (e.currentTarget.style.borderColor = "#2a2a4a")}
                />
              </a>
              <a
                href="https://x.com/kartojal"
                target="_blank"
                rel="noopener noreferrer"
                title="@kartojal"
              >
                <img
                  src="https://avatars.githubusercontent.com/u/11179847?v=4"
                  alt="Kartojal"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    border: "2px solid #2a2a4a",
                    objectFit: "cover",
                    transition: "border-color 0.2s",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onMouseOut={(e) => (e.currentTarget.style.borderColor = "#2a2a4a")}
                />
              </a>
            </div>
          </div>
          {/* Target buttons hidden – "notional-finance" remains selected by default */}
        </div>
      </header>

      {/* Tab Bar */}
      <nav
        className="tab-bar"
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: "16px 32px 0",
          display: "flex",
          gap: 4,
        }}
      >
        {(["comparison", "details", "aggregated"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 20px",
              borderRadius: "8px 8px 0 0",
              border: "none",
              borderBottom:
                tab === activeTab
                  ? "2px solid #6366f1"
                  : "2px solid transparent",
              background: tab === activeTab ? "#1a1a2e" : "transparent",
              color: tab === activeTab ? "#e0e0e8" : "#666680",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              textTransform: "capitalize",
            }}
          >
            {tab === "comparison"
              ? "Comparison Charts"
              : tab === "details"
                ? "Findings Per Model"
                : "All Findings"}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="main-content" style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 32px" }}>
        {sortedReports.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: 80,
              color: "#666680",
            }}
          >
            <p style={{ fontSize: 18 }}>No reports found for {activeTarget}</p>
            <p style={{ fontSize: 14, marginTop: 8 }}>
              Run benchmarks first: <code>./run-all.sh {activeTarget}</code>
            </p>
          </div>
        ) : activeTab === "comparison" ? (
          <ComparisonView
            reports={sortedReports}
            onSelectModel={(model) => {
              setSelectedModel(model);
              setActiveTab("details");
            }}
          />
        ) : activeTab === "aggregated" ? (
          <AggregatedFindingsView reports={sortedReports} />
        ) : (
          <DetailView
            reports={sortedReports}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
          />
        )}
      </main>
    </div>
  );
}
