import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const hookPath = (name) => join(ROOT, "src", "hooks", `${name}.mjs`);

export function tmp(prefix = "cgk-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Escribe una config y devuelve su ruta. */
export function writeConfig(config, dir = tmp()) {
  const file = join(dir, "guardrails.config.json");
  writeFileSync(file, typeof config === "string" ? config : JSON.stringify(config));
  return file;
}

/** Ejecuta un hook como proceso real: stdin JSON, exit code y salidas reales. */
export function runHook(name, input, { config, env = {} } = {}) {
  const r = spawnSync(process.execPath, [hookPath(name)], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, ...(config ? { CLAUDE_GUARDRAILS_CONFIG: config } : {}), ...env },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

export function decision(result) {
  return JSON.parse(result.stdout).hookSpecificOutput?.permissionDecision;
}

export function git(cwd, ...args) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@e.x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@e.x" },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

export function initRepo() {
  const dir = tmp("cgk-repo-");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "a.md"), "hola\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
}
