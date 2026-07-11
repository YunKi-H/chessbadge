import { existsSync, readFileSync } from "node:fs";
import { dirname, parse, resolve } from "node:path";

const envPath = findEnvFile(process.cwd());

if (envPath) {
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    process.env[key] ??= value;
  }
}

function findEnvFile(startDir: string) {
  let currentDir = resolve(startDir);
  const rootDir = parse(currentDir).root;

  while (true) {
    const candidate = resolve(currentDir, ".env");

    if (existsSync(candidate)) {
      return candidate;
    }

    if (currentDir === rootDir) {
      return null;
    }

    currentDir = dirname(currentDir);
  }
}
