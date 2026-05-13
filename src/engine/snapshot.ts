import * as path from "path";
import * as fs from "fs/promises";
import { createTracker, findFiles } from "./tracker.js";
import { createRedactor, redactFileContent } from "./redactor.js";
import * as git from "./git.js";
import * as manifest from "./manifest.js";
import * as lock from "./lock.js";
import { checkDiskSpace, checkFileSize, ensureDiskSpace } from "./disk.js";
import { loadConfig, DEFAULT_CONFIG } from "./config.js";
import {
  getShadowRepoPath,
  getProjectConfigPaths,
  getGlobalConfigPath,
  ensureDir,
  copyFile,
  fileExists,
} from "../shared/paths.js";
import type {
  SnapshotInput,
  SnapshotResult,
  SnapshotType,
} from "../shared/types.js";
import type { ManifestEntry } from "../shared/types.js";

export async function initShadowRepo(projectRoot: string): Promise<void> {
  const shadowPath = getShadowRepoPath(projectRoot);
  ensureDir(shadowPath);

  const hasOwnGit = git.hasOwnGitDir(shadowPath);

  if (!hasOwnGit) {
    await git.initRepo(shadowPath);
    await git.setLocalConfig(shadowPath, "user.email", "git-that-shit@gitdamnit.local");
    await git.setLocalConfig(shadowPath, "user.name", "Git That Shit");
    await git.setLocalConfig(shadowPath, "core.autocrlf", "false");
    await git.writeGitignore(shadowPath, ".gts.lock\n.git-that-shit/manifest.jsonl\n");
  }

  ensureDir(path.join(shadowPath, ".git-that-shit"));
}

export async function snapshot(input: SnapshotInput): Promise<SnapshotResult> {
  const { projectRoot, reason, type, trigger, operation, sessionId } = input;

  try {
    await lock.withLock(projectRoot, "snapshot", reason, async () => {
      await ensureDiskSpace(projectRoot);
    });
  } catch (error) {
    return {
      committed: false,
      reason: "locked",
      filesCopied: [],
      filesSkipped: [],
      filesRedacted: [],
      timestamp: new Date().toISOString(),
      error: (error as Error).message,
    };
  }

  try {
    const config = await loadConfig(projectRoot).catch(() => DEFAULT_CONFIG);
    const tracker = createTracker(config);
    const redactor = createRedactor(tracker);
    const shadowPath = getShadowRepoPath(projectRoot);

    await initShadowRepo(projectRoot);

    const diskCheck = await checkDiskSpace(shadowPath, config.snapshot.minDiskSpaceMb);
    if (!diskCheck.sufficient) {
      return {
        committed: false,
        reason: "low-disk",
        filesCopied: [],
        filesSkipped: [],
        filesRedacted: [],
        timestamp: new Date().toISOString(),
        error: diskCheck.message,
      };
    }

    const filesToTrack = collectFilesToTrack(projectRoot, tracker, config);

    const filesCopied: string[] = [];
    const filesSkipped: Array<{ path: string; reason: string }> = [];
    const filesRedacted: string[] = [];

    for (const relPath of filesToTrack) {
      const srcPath = path.join(projectRoot, relPath);
      const destPath = path.join(shadowPath, relPath);

      if (!fileExists(srcPath)) {
        filesSkipped.push({ path: relPath, reason: "file not found" });
        continue;
      }

      const sizeCheck = checkFileSize(srcPath, config.snapshot.maxFileSizeMb);
      if (!sizeCheck.acceptable) {
        filesSkipped.push({ path: relPath, reason: `exceeds max size (${sizeCheck.sizeMb}MB)` });
        continue;
      }

      if (tracker.isHardExcluded(relPath)) {
        filesSkipped.push({ path: relPath, reason: "hard excluded" });
        continue;
      }

      if (tracker.isSensitive(relPath) && !config.tracking.allowSensitiveFiles) {
        filesSkipped.push({ path: relPath, reason: "sensitive file excluded" });
        continue;
      }

      const { content, wasRedacted, keysRedacted } = await redactFileContent(srcPath, tracker);

      if (wasRedacted) {
        filesRedacted.push(relPath);
        await fs.writeFile(destPath, content, "utf-8");
      } else {
        copyFile(srcPath, destPath);
      }

      filesCopied.push(relPath);
    }

    const globalConfigPath = getGlobalConfigPath();
    if (fileExists(globalConfigPath)) {
      const globalDest = path.join(shadowPath, "global-opencode", "config.json");
      const sizeCheck = checkFileSize(globalConfigPath, config.snapshot.maxFileSizeMb);
      if (sizeCheck.acceptable) {
        copyFile(globalConfigPath, globalDest);
        filesCopied.push("global-opencode/config.json");
      }
    }

    if (filesCopied.length === 0) {
      return {
        committed: false,
        reason: "no-changes",
        filesCopied: [],
        filesSkipped,
        filesRedacted: [],
        timestamp: new Date().toISOString(),
      };
    }

    await git.addAll(shadowPath);

    const hasChanges = await git.hasStagedChanges(shadowPath);
    if (!hasChanges) {
      return {
        committed: false,
        reason: "no-changes",
        filesCopied,
        filesSkipped,
        filesRedacted,
        timestamp: new Date().toISOString(),
      };
    }

    const commitMessage = formatCommitMessage(type, reason, trigger, operation, sessionId);
    const hash = await git.commit(shadowPath, commitMessage);
    const shortHash = await git.getShortHash(shadowPath, hash);

    const manifestEntry: ManifestEntry = {
      hash,
      shortHash,
      timestamp: new Date().toISOString(),
      type,
      trigger,
      reason,
      operation,
      sessionId,
      filesCopied,
      filesSkipped,
      filesRedacted,
    };

    await manifest.appendManifestEntry(projectRoot, manifestEntry);

    return {
      committed: true,
      reason: "committed",
      hash,
      shortHash,
      filesCopied,
      filesSkipped,
      filesRedacted,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      committed: false,
      reason: "error",
      filesCopied: [],
      filesSkipped: [],
      filesRedacted: [],
      timestamp: new Date().toISOString(),
      error: (error as Error).message,
    };
  } finally {
    await lock.releaseLock(projectRoot);
  }
}

function collectFilesToTrack(
  projectRoot: string,
  tracker: ReturnType<typeof createTracker>,
  config: typeof DEFAULT_CONFIG
): string[] {
  const files: string[] = [];

  const configPaths = getProjectConfigPaths(projectRoot);
  for (const p of configPaths) {
    const relPath = path.relative(projectRoot, p).replace(/\\/g, "/");
    if (fileExists(p)) {
      const result = tracker.shouldTrack(relPath);
      if (result.track) {
        files.push(relPath);
      }
    }
  }

  const includePatterns = config.tracking.include.filter((p) => !p.includes("**"));
  const foundFiles = findFiles(projectRoot, includePatterns);

  for (const f of foundFiles) {
    if (!files.includes(f)) {
      const result = tracker.shouldTrack(f);
      if (result.track) {
        files.push(f);
      }
    }
  }

  const opencodeStateDir = path.join(projectRoot, ".opencode", "state");
  if (fileExists(opencodeStateDir)) {
    const stateFiles = findFiles(opencodeStateDir, ["*.json", "*.md", "*.jsonl"]);
    for (const f of stateFiles) {
      const fullPath = `.opencode/state/${f}`;
      if (!files.includes(fullPath)) {
        const result = tracker.shouldTrack(fullPath);
        if (result.track) {
          files.push(fullPath);
        }
      }
    }
  }

  return [...new Set(files)];
}

function formatCommitMessage(
  type: SnapshotType,
  reason: string,
  trigger: string,
  operation?: { tool?: string; preview?: string },
  sessionId?: string
): string {
  const typePrefix = `${type}: `;
  let message = typePrefix + reason.slice(0, 80 - typePrefix.length);

  if (operation?.preview) {
    message += `\n\nTriggered by: ${trigger}`;
    message += `\nOperation type: ${type.split("-")[0]}`;
    message += `\nTimestamp: ${new Date().toISOString()}`;
    if (sessionId) {
      message += `\nSession: ${sessionId}`;
    }
  }

  return message;
}

export async function listSnapshots(
  projectRoot: string,
  count: number = 20
): Promise<ManifestEntry[]> {
  return manifest.readManifest(projectRoot, count);
}

export async function getSnapshotDiff(
  projectRoot: string,
  hash: string
): Promise<string> {
  const shadowPath = getShadowRepoPath(projectRoot);
  return git.diffWithParent(shadowPath, hash);
}

export async function getSnapshotFiles(
  projectRoot: string,
  hash: string
): Promise<string[]> {
  const shadowPath = getShadowRepoPath(projectRoot);
  return git.listFilesAtCommit(shadowPath, hash);
}

export async function getSnapshotContent(
  projectRoot: string,
  hash: string,
  filePath: string
): Promise<string> {
  const shadowPath = getShadowRepoPath(projectRoot);
  return git.getFileAtCommit(shadowPath, hash, filePath);
}