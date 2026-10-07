// Utilidades compartidas por los hooks. Cero dependencias.
// Cada hook se copia al directorio de instalación junto con este archivo.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CONFIG_NAME = "guardrails.config.json";

/** Expande solo un `~` inicial. */
export function expandHome(p) {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

export function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/** Devuelve el payload parseado o lanza. Un payload que no sea objeto es ilegible. */
export function parsePayload(raw) {
  const data = JSON.parse(raw);
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("el payload no es un objeto JSON");
  }
  return data;
}

/**
 * Carga la config: $CLAUDE_GUARDRAILS_CONFIG o junto al hook.
 * Lanza si falta o es inválida; el llamador decide (los gates bloquean).
 */
export function loadConfig(hookUrl, env = process.env) {
  const path = env.CLAUDE_GUARDRAILS_CONFIG || join(dirname(fileURLToPath(hookUrl)), CONFIG_NAME);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`no se pudo leer la config ${path} (${err.message})`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`la config ${path} no es un objeto JSON`);
  }
  return parsed;
}

/** Corre git sin shell. `ok` es false si git falta, expira o sale ≠ 0. */
export function git(repo, args, timeout = 30000) {
  const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", timeout });
  if (r.error) return { ok: false, stdout: "", stderr: r.error.message, missing: r.error.code === "ENOENT" };
  return { ok: r.status === 0, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").trim() };
}

/** Resultado de un hook: { code, stdout, stderr }. */
export const allow = () => ({ code: 0, stdout: "", stderr: "" });

/** Bloqueo por exit 2 (el motivo viaja por stderr). */
export const block = (reason) => ({ code: 2, stdout: "", stderr: reason + "\n" });

/** Denegación estructurada de PreToolUse (el modelo lee el motivo y se corrige). */
export const deny = (reason) => ({
  code: 0,
  stderr: "",
  stdout: JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }),
});

/** Ejecuta un hook `(raw, env) => resultado` y traduce a stdout/stderr/exit. */
export function run(fn, env = process.env) {
  let result;
  try {
    result = fn(readStdin(), env);
  } catch (err) {
    // Un bug nuestro nunca debe convertirse en "permitir": exit 2 bloquea.
    result = block(`guardrails: error inesperado (${err.message}); se bloquea por seguridad.`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.code;
}
