#!/usr/bin/env node
// Stop: si el repo de notas quedó sin commitear, bloquea el fin del turno UNA vez para
// que el modelo commitee con un mensaje escrito a mano.
// Falla CERRADO: sin git o con config rota también bloquea (una vez) en vez de callar.
// La guardia anti-bucle es `stop_hook_active`.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expandHome, git, loadConfig, parsePayload, run } from "./lib.mjs";

const MAX_LISTED = 30;
const stop = (reason) => ({ code: 0, stderr: "", stdout: JSON.stringify({ decision: "block", reason }) });
const pass = { code: 0, stdout: "", stderr: "" };

export function evaluate(raw, env = process.env, hookUrl = import.meta.url) {
  let payload = {};
  try {
    payload = parsePayload(raw);
  } catch {
    /* sin payload no sabemos si ya insistimos; abajo se decide igualmente */
  }
  if (payload.stop_hook_active === true) return pass;

  let repo;
  try {
    const cfg = loadConfig(hookUrl, env).notes;
    if (!cfg || typeof cfg.repo !== "string" || !cfg.repo) throw new Error('falta "notes.repo"');
    repo = resolve(expandHome(cfg.repo));
  } catch (err) {
    return stop(`dirty-warn no puede comprobar el repo de notas: ${err.message}. Avisa al usuario.`);
  }

  const status = git(repo, ["status", "--porcelain"], 10000);
  if (status.missing) return stop("dirty-warn no puede comprobar el repo de notas: git no está instalado. Avisa al usuario.");
  if (!status.ok) return stop(`dirty-warn no puede comprobar ${repo}: ${status.stderr.slice(0, 200)}. Avisa al usuario.`);

  const dirty = status.stdout ? status.stdout.split("\n") : [];
  let ahead = 0;
  const up = git(repo, ["rev-parse", "--abbrev-ref", "@{upstream}"], 10000);
  if (up.ok && up.stdout) {
    const n = git(repo, ["rev-list", "--count", `${up.stdout}..HEAD`], 10000).stdout;
    ahead = /^\d+$/.test(n) ? Number(n) : 0;
  }
  if (dirty.length === 0 && ahead === 0) return pass;

  const parts = [];
  if (dirty.length) {
    const more = dirty.length > MAX_LISTED ? `\n… y ${dirty.length - MAX_LISTED} más` : "";
    parts.push(`${dirty.length} archivo(s) sin commitear en ${repo}:\n${dirty.slice(0, MAX_LISTED).join("\n")}${more}`);
  }
  if (ahead) parts.push(`${ahead} commit(s) sin pushear.`);
  return stop(
    "El repo de notas no está limpio.\n\n" +
      parts.join("\n\n") +
      "\n\nAgrúpalos en commits lógicos con mensaje al estilo del repo. Si esos cambios NO salen " +
      "de esta sesión (los editó el usuario a mano u otro agente), no los toques: dilo en una línea y termina.",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run((raw, env) => evaluate(raw, env));
