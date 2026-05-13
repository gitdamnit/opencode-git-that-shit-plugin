import * as fs from "fs/promises";
import * as path from "path";
import { Tracker } from "./tracker.js";

export interface RedactionResult {
  redacted: boolean;
  content: string;
  keysRedacted: string[];
}

export class Redactor {
  private tracker: Tracker;

  constructor(tracker: Tracker) {
    this.tracker = tracker;
  }

  async redactFile(filePath: string): Promise<RedactionResult> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const ext = path.extname(filePath).toLowerCase();

      if (ext === ".json") {
        return this.redactJson(content);
      }

      return {
        redacted: false,
        content,
        keysRedacted: [],
      };
    } catch (error) {
      return {
        redacted: false,
        content: "",
        keysRedacted: [],
      };
    }
  }

  redactJson(content: string): RedactionResult {
    try {
      const parsed = JSON.parse(content);
      const keysRedacted: string[] = [];

      this.redactObject(parsed, "", keysRedacted);

      if (keysRedacted.length > 0) {
        return {
          redacted: true,
          content: JSON.stringify(parsed, null, 2),
          keysRedacted,
        };
      }

      return {
        redacted: false,
        content,
        keysRedacted: [],
      };
    } catch {
      return {
        redacted: false,
        content,
        keysRedacted: [],
      };
    }
  }

  private redactObject(obj: unknown, prefix: string, keysRedacted: string[]): void {
    if (obj === null || obj === undefined) {
      return;
    }

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        this.redactObject(obj[i], `${prefix}[${i}]`, keysRedacted);
      }
      return;
    }

    if (typeof obj === "object") {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (this.tracker.isSecretKey(key)) {
          if (typeof value === "string" && value.length > 0) {
            (obj as Record<string, unknown>)[key] = "[REDACTED]";
            keysRedacted.push(fullKey);
          }
        } else {
          this.redactObject(value, fullKey, keysRedacted);
        }
      }
    }
  }

  redactString(content: string): RedactionResult {
    const keysRedacted: string[] = [];
    let redacted = false;

    for (const key of this.tracker["secretPatterns"]) {
      const matches = content.match(new RegExp(`(${key.source})\\s*[:=]\\s*["']?([^"'\\s]+)["']?`, "gi"));
      if (matches) {
        redacted = true;
        keysRedacted.push(key.source);
      }
    }

    return {
      redacted,
      content,
      keysRedacted,
    };
  }

  shouldRedact(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === ".json";
  }
}

export function createRedactor(tracker: Tracker): Redactor {
  return new Redactor(tracker);
}

export async function redactFileContent(
  filePath: string,
  tracker: Tracker
): Promise<{ content: string; wasRedacted: boolean; keysRedacted: string[] }> {
  const redactor = createRedactor(tracker);

  if (!redactor.shouldRedact(filePath)) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return { content, wasRedacted: false, keysRedacted: [] };
    } catch {
      return { content: "", wasRedacted: false, keysRedacted: [] };
    }
  }

  const result = await redactor.redactFile(filePath);
  return {
    content: result.content,
    wasRedacted: result.redacted,
    keysRedacted: result.keysRedacted,
  };
}