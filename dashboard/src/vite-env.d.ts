/// <reference types="vite/client" />

declare module "virtual:reports" {
  import type { ReportsMap } from "./types";
  const reports: ReportsMap;
  export default reports;
}
