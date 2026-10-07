#!/usr/bin/env node
// SessionStart: inyecta un recordatorio fijo en el contexto (startup/resume/clear/compact).
// Es informativo: ante config rota avisa por stderr (exit 1, no bloqueante) y no
// tumba la sesión.
import { fileURLToPath } from "node:url";
import { loadConfig, parsePayload, run } from "./lib.mjs";

const DEFAULT_SOURCES = ["startup", "resume", "clear", "compact"];

export function evaluate(raw, env = process.env, hookUrl = import.meta.url) {
  let payload = {};
  try {
    payload = parsePayload(raw);
  } catch {
    /* sin payload se asume startup */
  }

  let cfg;
  try {
    cfg = loadConfig(hookUrl, env).contextReminder;
    if (!cfg || typeof cfg.text !== "string" || !cfg.text.trim()) throw new Error('falta "contextReminder.text"');
  } catch (err) {
    return { code: 1, stdout: "", stderr: `context-reminder: ${err.message}\n` };
  }

  const sources = Array.isArray(cfg.sources) ? cfg.sources : DEFAULT_SOURCES;
  const source = typeof payload.source === "string" ? payload.source : "startup";
  if (!sources.includes(source)) return { code: 0, stdout: "", stderr: "" };

  return {
    code: 0,
    stderr: "",
    stdout: JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: cfg.text },
    }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run((raw, env) => evaluate(raw, env));
