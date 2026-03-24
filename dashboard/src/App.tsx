import { useState } from "react";
import reportsData from "virtual:reports";
import type { ReportsMap } from "./types";
import { ComparisonView } from "./ComparisonView";
import { DetailView } from "./DetailView";
import "./responsive.css";

const reports = reportsData as ReportsMap;
const targets = Object.keys(reports);

export function App() {
  const [activeTarget, setActiveTarget] = useState(targets[0] || "");
  const [activeTab, setActiveTab] = useState<"comparison" | "details">(
    "comparison"
  );
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

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
            alignItems: "center",
            justifyContent: "space-between",
            maxWidth: 1400,
            margin: "0 auto",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "#fff",
                letterSpacing: "-0.02em",
              }}
            >
              Security Audit Skills Benchmark
            </h1>
            <p style={{ fontSize: 13, color: "#8888aa", marginTop: 4 }}>
              Pashov Skills &times; AI Models Comparison
            </p>
          </div>
          <div className="target-buttons" style={{ display: "flex", gap: 8 }}>
            {targets.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTarget(t)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border:
                    t === activeTarget
                      ? "1px solid #6366f1"
                      : "1px solid #2a2a4a",
                  background: t === activeTarget ? "#6366f120" : "transparent",
                  color: t === activeTarget ? "#a5b4fc" : "#8888aa",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {t}
              </button>
            ))}
          </div>
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
        {(["comparison", "details"] as const).map((tab) => (
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
              : "Findings Per Model"}
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
