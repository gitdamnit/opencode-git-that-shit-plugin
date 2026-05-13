import { resolveProjectRoot } from "../../shared/paths.js";
import * as config from "../../engine/config.js";

export default async function configCommand(_args: string[]): Promise<void> {
  const projectRoot = resolveProjectRoot();

  try {
    const cfg = await config.loadConfig(projectRoot);
    console.log(JSON.stringify(cfg, null, 2));
  } catch (error) {
    console.error(`Error loading config: ${(error as Error).message}`);
    process.exit(1);
  }
}