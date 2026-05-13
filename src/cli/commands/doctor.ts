import { resolveProjectRoot } from "../../shared/paths.js";
import * as doctor from "../../engine/doctor.js";

export default async function doctorCommand(_args: string[]): Promise<void> {
  const projectRoot = resolveProjectRoot();

  console.log("Running Git That Shit health checks...\n");

  const report = await doctor.runDoctor(projectRoot);

  for (const check of report.checks) {
    const icon = check.status === "ok" ? "✓" : check.status === "warn" ? "⚠" : check.status === "fail" ? "✗" : "○";
    console.log(`${icon} ${check.name}: ${check.message || check.status}`);
  }

  console.log(`\nOverall: ${report.overall.toUpperCase()}`);

  if (report.overall === "fail") {
    process.exit(1);
  }
}