#!/usr/bin/env node
// SessionEnd: red de seguridad. Si el repo de notas quedó sucio, commitea con un
// mensaje genérico (y pushea solo si `notes.push` es true).
// SessionEnd no puede bloquear: los fallos se registran en el log y salen con
// exit 1 (error no bloqueante, visible) en lugar de silenciarse.
import { appendFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expandHome, git, loadConfig, run } from "./lib.mjs";

const DEFAULT_MESSAGE = "chore: autosave on session end ({timestamp})";

export function evaluate(_raw, env = process.env, hookUrl = import.meta.url) {
  let repo;
  let cfg;
  try {
    cfg = loadConfig(hookUrl, env).notes;
    if (!cfg || typeof cfg.repo !== "string" || !cfg.repo) throw new Error('falta "notes.repo"');
    repo = resolve(expandHome(cfg.repo));
  } catch (err) {
    return { code: 1, stdout: "", stderr: `notes-autocommit: ${err.message}\n` };
  }

  const stamp = (env.GUARDRAILS_NOW || new Date().toISOString()).slice(0, 16).replace("T", " ");
  const logPath = join(repo, ".git", "guardrails-autocommit.log");
  const log = (msg) => {
    try {
      if (existsSync(join(repo, ".git"))) appendFileSync(logPath, `[${stamp}] ${msg.replace(/\s+/g, " ")}\n`);
    } catch {
      /* el log es best-effort */
    }
  };
  const fail = (msg) => {
    log(msg);
    return { code: 1, stdout: "", stderr: `notes-autocommit: ${msg}\n` };
  };

  const status = git(repo, ["status", "--porcelain"], 15000);
  if (status.missing) return fail("git no está instalado; no se pudo guardar el repo de notas");
  if (!status.ok) return fail(`no se pudo leer el estado de ${repo}: ${status.stderr.slice(0, 200)}`);

  let dirty = status.stdout;
  // Otra sesión (o tú a mano) tiene cambios preparados: `add -A` los barrería. No se toca nada.
  if (dirty && !git(repo, ["diff", "--cached", "--quiet"], 15000).ok) {
    log(`índice con cambios ya preparados: ${dirty.split("\n").length} archivo(s) sin commitear, NO se tocan`);
    dirty = "";
  }

  if (dirty) {
    const count = dirty.split("\n").length;
    const message = (typeof cfg.message === "string" && cfg.message ? cfg.message : DEFAULT_MESSAGE).replace("{timestamp}", stamp);
    if (!git(repo, ["add", "-A"]).ok) return fail("git add falló");
    // Sin --no-verify: si un pre-commit (p. ej. escáner de secretos) bloquea, NO se fuerza.
    const commit = git(repo, ["commit", "-m", message]);
    if (!commit.ok) return fail(`commit FALLÓ (${count} archivos siguen sueltos): ${(commit.stderr || commit.stdout).slice(0, 300)}`);
    log(`commiteados ${count} archivo(s) automáticamente`);
  }

  if (cfg.push === true) {
    const up = git(repo, ["rev-parse", "--abbrev-ref", "@{upstream}"], 15000);
    if (up.ok && up.stdout) {
      const ahead = git(repo, ["rev-list", "--count", `${up.stdout}..HEAD`], 15000).stdout;
      if (/^\d+$/.test(ahead) && Number(ahead) > 0) {
        const push = git(repo, ["push"], 120000);
        if (!push.ok) return fail(`push FALLÓ (${ahead} commits locales): ${push.stderr.slice(0, 300)}`);
        log(`pusheados ${ahead} commit(s)`);
      }
    }
  }
  return { code: 0, stdout: "", stderr: "" };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run((raw, env) => evaluate(raw, env));
