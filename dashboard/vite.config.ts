import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { readdirSync, readFileSync, watch } from "fs";

function loadReportsPlugin() {
  const virtualModuleId = "virtual:reports";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;
  let viteServer: any = null;

  function loadReports() {
    const reportsDir = resolve(__dirname, "../reports");
    const runId = process.env.REPORT_ID || "run-1";
    const targets: Record<string, any[]> = {};

    try {
      for (const targetDir of readdirSync(reportsDir, {
        withFileTypes: true,
      })) {
        if (!targetDir.isDirectory()) continue;
        const targetPath = resolve(reportsDir, targetDir.name);
        const reports: any[] = [];
        const runPath = resolve(targetPath, runId);

        try {
          for (const file of readdirSync(runPath)) {
            if (!file.endsWith(".json")) continue;
            try {
              const content = readFileSync(
                resolve(runPath, file),
                "utf-8"
              );
              const parsed = JSON.parse(content);
              parsed._run = runId;
              reports.push(parsed);
            } catch {
              // skip invalid JSON
            }
          }
        } catch {
          // run directory doesn't exist for this target
        }

        if (reports.length > 0) {
          targets[targetDir.name] = reports;
        }
      }
    } catch {
      // reports dir doesn't exist yet
    }

    return `export default ${JSON.stringify(targets)}`;
  }

  return {
    name: "load-reports",
    configureServer(server: any) {
      viteServer = server;
      const reportsDir = resolve(__dirname, "../reports");
      try {
        watch(reportsDir, { recursive: true }, (eventType, filename) => {
          if (filename?.endsWith(".json")) {
            console.log(`[reports] Detected change: ${filename} — reloading...`);
            server.ws.send({ type: "full-reload" });
          }
        });
      } catch {
        // fs.watch not available
      }
    },
    resolveId(id: string) {
      if (id === virtualModuleId) return resolvedVirtualModuleId;
    },
    load(id: string) {
      if (id === resolvedVirtualModuleId) {
        return loadReports();
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), loadReportsPlugin()],
  root: ".",
  build: {
    outDir: "dist",
  },
  server: {
    allowedHosts: ["states-gate-trans-able.trycloudflare.com", "circuits-focal-numeric-promptly.trycloudflare.com"],
  },
});
