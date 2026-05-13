import { resolveProjectRoot } from "../../shared/paths.js";
import * as manifest from "../../engine/manifest.js";

export default async function listCommand(args: string[]): Promise<void> {
  const projectRoot = resolveProjectRoot();

  let count = 20;

  for (const arg of args) {
    if (arg.startsWith("-n=") || arg.startsWith("--count=")) {
      count = parseInt(arg.split("=")[1], 10);
    } else if (arg === "-n" || arg === "--count") {
      const idx = args.indexOf(arg);
      if (idx >= 0 && args[idx + 1]) {
        count = parseInt(args[idx + 1], 10);
      }
    }
  }

  const snapshots = await manifest.readManifest(projectRoot, count);

  if (snapshots.length === 0) {
    console.log("No snapshots found.");
    return;
  }

  console.log(`Showing ${snapshots.length} snapshot${snapshots.length === 1 ? "" : "s"}:\n`);

  for (const snap of snapshots.reverse()) {
    console.log(`${snap.shortHash} | ${snap.type} | ${new Date(snap.timestamp).toLocaleString()}`);
    console.log(`  ${snap.reason}`);
    console.log(`  Files: ${snap.filesCopied.length} copied, ${snap.filesSkipped.length} skipped`);
    if (snap.sessionId) {
      console.log(`  Session: ${snap.sessionId}`);
    }
    console.log();
  }
}