export class GitThatShitError extends Error {
  public readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "GitThatShitError";
    this.code = code;
  }
}

export class GitNotAvailableError extends GitThatShitError {
  constructor() {
    super("Git is not available or not installed", "GIT_NOT_AVAILABLE");
    this.name = "GitNotAvailableError";
  }
}

export class GitOperationError extends GitThatShitError {
  public readonly command: string;
  public readonly exitCode: number;
  constructor(message: string, command: string, exitCode: number) {
    super(message, "GIT_OPERATION_FAILED");
    this.name = "GitOperationError";
    this.command = command;
    this.exitCode = exitCode;
  }
}

export class ConfigError extends GitThatShitError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
}

export class LockError extends GitThatShitError {
  constructor(message: string) {
    super(message, "LOCK_ERROR");
    this.name = "LockError";
  }
}

export class SnapshotError extends GitThatShitError {
  constructor(message: string) {
    super(message, "SNAPSHOT_ERROR");
    this.name = "SnapshotError";
  }
}

export class RestoreError extends GitThatShitError {
  constructor(message: string) {
    super(message, "RESTORE_ERROR");
    this.name = "RestoreError";
  }
}

export class DiskSpaceError extends GitThatShitError {
  constructor(message: string) {
    super(message, "DISK_SPACE_ERROR");
    this.name = "DiskSpaceError";
  }
}

export class PathError extends GitThatShitError {
  constructor(message: string) {
    super(message, "PATH_ERROR");
    this.name = "PathError";
  }
}