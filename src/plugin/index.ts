import type { Plugin, ToolContext } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { resolveProjectRoot, getShadowRepoPath } from "../shared/paths.js";
import * as snapshot from "../engine/snapshot.js";
import * as manifest from "../engine/manifest.js";
import * as restore from "../engine/restore.js";
import * as doctor from "../engine/doctor.js";
import * as config from "../engine/config.js";
import * as detector from "../engine/detector.js";

export const GitThatShitPlugin: Plugin = async ({ project, directory, client }) => {
  const projectRoot = directory || resolveProjectRoot();

  const getConfig = async () => {
    try {
      return await config.loadConfig(projectRoot);
    } catch {
      return config.DEFAULT_CONFIG;
    }
  };

  const createSnapshot = async (type: string, reason: string, trigger: string) => {
    try {
      const result = await snapshot.snapshot({
        projectRoot,
        reason,
        type: type as any,
        trigger,
      });

      if (result.committed && client?.app?.log) {
        await client.app.log({
          body: {
            service: "git-that-shit",
            level: "info",
            message: `Snapshot created: ${result.shortHash}`,
            extra: { type, reason, filesCopied: result.filesCopied.length },
          },
        });
      }

      return result;
    } catch (error) {
      if (client?.app?.log) {
        await client.app.log({
          body: {
            service: "git-that-shit",
            level: "error",
            message: `Snapshot failed: ${(error as Error).message}`,
            extra: { type, reason },
          },
        });
      }
    }
  };

  return {
    "tool.execute.before": async (input: any, output: any) => {
      const cfg = await getConfig();

      if (input.tool === "bash" || input.tool === "shell") {
        const cmdArgs = output?.args?.command;
        const args = Array.isArray(cmdArgs) ? cmdArgs : [cmdArgs || ""].filter(Boolean);

        const detection = detector.detectDestructiveCommand(input.tool, args, cfg);

        if (detection.shouldSnapshot) {
          const snapshotType = detection.level === "risky" ? "pre-risky-op" : "pre-op";
          await createSnapshot(snapshotType, detection.reason, "tool.execute.before");
        }

        if (cfg.destructiveOps.configWrites && detection.level === "config-write") {
          await createSnapshot("pre-op", detection.reason, "tool.execute.before");
        }
      }

      if (input.tool === "write" || input.tool === "edit" || input.tool === "str_replace_editor") {
        const cfg2 = await getConfig();
        if (cfg2.fileEdits.mode !== "disabled") {
          await createSnapshot(
            cfg2.fileEdits.mode === "pre-if-available" ? "pre-edit" : "post-edit",
            "config file modification",
            "tool.execute.before"
          );
        }
      }
    },

    "file.edited": async (input: any) => {
      const cfg = await getConfig();
      if (cfg.fileEdits.mode !== "disabled") {
        await createSnapshot(
          cfg.fileEdits.mode === "pre-if-available" ? "pre-edit" : "post-edit",
          `file edited: ${input.filePath || "unknown"}`,
          "file.edited"
        );
      }
    },

    "session.created": async () => {
      await createSnapshot("session-start", "session created", "session.created");
    },

    "session.compacted": async () => {
      await createSnapshot("post-compact", "context window compacted", "session.compacted");
    },

    tool: {
      gts_status: tool({
        description: "Show Git That Shit status",
        args: {},
        execute: async function(_args: any, _context: ToolContext) {
          const shadowPath = getShadowRepoPath(projectRoot);
          const snapshots = await manifest.readManifest(projectRoot);
          const last = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
          return JSON.stringify({ repoPath: shadowPath, snapshotCount: snapshots.length, lastSnapshot: last ? { hash: last.shortHash, type: last.type, reason: last.reason } : null }, null, 2);
        },
      }),

      gts_list: tool({
        description: "List recent snapshots",
        args: { count: tool.schema.number().optional() },
        execute: async function(args: any, _context: ToolContext) {
          const snapshots = await manifest.readManifest(projectRoot, args.count || 20);
          return JSON.stringify({ snapshots: snapshots.reverse() }, null, 2);
        },
      }),

      gts_diff: tool({
        description: "Show diff for a snapshot",
        args: { hash: tool.schema.string() },
        execute: async function(args: any, _context: ToolContext) {
          const diff = await snapshot.getSnapshotDiff(projectRoot, args.hash);
          return diff || "No changes";
        },
      }),

      gts_restore: tool({
        description: "Restore from a snapshot",
        args: {
          hash: tool.schema.string(),
          dry_run: tool.schema.boolean().optional(),
          yes: tool.schema.boolean().optional(),
        },
        execute: async function(args: any, _context: ToolContext) {
          const result = await restore.restoreSnapshot({
            projectRoot,
            hash: args.hash,
            mode: args.yes ? "overwrite" : "dry-run",
          });
          return JSON.stringify(result, null, 2);
        },
      }),

      gts_snapshot: tool({
        description: "Manually trigger a snapshot",
        args: { message: tool.schema.string().optional() },
        execute: async function(args: any, _context: ToolContext) {
          const result = await snapshot.snapshot({
            projectRoot,
            reason: args.message || "manual snapshot",
            type: "manual",
            trigger: "gts_snapshot tool",
          });
          return JSON.stringify(result, null, 2);
        },
      }),

      gts_prune: tool({
        description: "Preview or prune old snapshots",
        args: { keep: tool.schema.number().optional() },
        execute: async function(args: any, _context: ToolContext) {
          return JSON.stringify({ message: "Pruning not implemented in v0.1", keep: args.keep || 50 }, null, 2);
        },
      }),

      gts_config: tool({
        description: "Show current configuration",
        args: {},
        execute: async function(_args: any, _context: ToolContext) {
          const cfg = await getConfig();
          return JSON.stringify({ config: cfg }, null, 2);
        },
      }),

      gts_doctor: tool({
        description: "Run health diagnostics",
        args: {},
        execute: async function(_args: any, _context: ToolContext) {
          const report = await doctor.runDoctor(projectRoot);
          return JSON.stringify(report, null, 2);
        },
      }),
    },
  };
};

export default GitThatShitPlugin;