import * as fs from "fs/promises";
import { getFileSize } from "../shared/paths.js";

export interface DiskCheckResult {
  sufficient: boolean;
  freeMb: number;
  thresholdMb: number;
  message?: string;
}

export interface FileSizeCheckResult {
  acceptable: boolean;
  sizeMb: number;
  maxMb: number;
  message?: string;
}

export async function checkDiskSpace(
  dirPath: string,
  minFreeMb: number = 100
): Promise<DiskCheckResult> {
  try {
    const stats = await fs.statfs(dirPath);
    const freeBytes = stats.bsize * stats.bfree;
    const freeMb = Math.floor(freeBytes / (1024 * 1024));

    const sufficient = freeMb >= minFreeMb;

    return {
      sufficient,
      freeMb,
      thresholdMb: minFreeMb,
      message: sufficient
        ? `Sufficient disk space: ${freeMb}MB free`
        : `Low disk space: only ${freeMb}MB free, minimum ${minFreeMb}MB required`,
    };
  } catch (error) {
    return {
      sufficient: true,
      freeMb: 0,
      thresholdMb: minFreeMb,
      message: `Could not check disk space: ${(error as Error).message}`,
    };
  }
}

export function checkFileSize(
  filePath: string,
  maxSizeMb: number = 10
): FileSizeCheckResult {
  const sizeBytes = getFileSize(filePath);
  const sizeMb = Math.floor(sizeBytes / (1024 * 1024));

  const acceptable = sizeMb < maxSizeMb;

  return {
    acceptable,
    sizeMb,
    maxMb: maxSizeMb,
    message: acceptable
      ? `File size ${sizeMb}MB is within limit of ${maxSizeMb}MB`
      : `File size ${sizeMb}MB exceeds limit of ${maxSizeMb}MB`,
  };
}

export async function ensureDiskSpace(
  dirPath: string,
  minFreeMb: number = 100
): Promise<{ ok: boolean; warning?: string }> {
  const result = await checkDiskSpace(dirPath, minFreeMb);

  if (!result.sufficient) {
    return {
      ok: false,
      warning: result.message,
    };
  }

  if (result.freeMb < minFreeMb * 2) {
    return {
      ok: true,
      warning: result.message,
    };
  }

  return { ok: true };
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

export async function getDirSize(dirPath: string): Promise<number> {
  let totalSize = 0;

  async function walkDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = `${dir}/${entry.name}`;

        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
        }
      }
    } catch {
      // Skip inaccessible files
    }
  }

  await walkDir(dirPath);
  return totalSize;
}

export async function getFreeSpaceMb(): Promise<number> {
  try {
    const stats = await fs.statfs(".");
    const freeBytes = stats.bsize * stats.bfree;
    return Math.floor(freeBytes / (1024 * 1024));
  } catch {
    return 0;
  }
}