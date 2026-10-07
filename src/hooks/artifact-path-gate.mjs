#!/usr/bin/env node
// PreToolUse: solo se publica lo que vive bajo `artifactGate.root`.
// Falla CERRADO: payload ilegible o config ausente = deny.
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { allow, deny, expandHome, loadConfig, parsePayload, run } from "./lib.mjs";

/** realpath que tolera rutas inexistentes: resuelve el ancestro existente y reañade el resto. */
function realpathLoose(p) {
  const tail = [];
  let cur = p;
  while (!existsSync(cur)) {
    const parent = dirname(cur);
    if (parent === cur) break;
    tail.unshift(basename(cur));
    cur = parent;
  }
  return join(realpathSync(cur), ...tail);
}

export function evaluate(raw, env = process.env, hookUrl = import.meta.url) {
  let payload;
  try {
    payload = parsePayload(raw);
  } catch (err) {
    return deny(`artifact-path-gate: no pudo leer la llamada (${err.message}). No se publica a ciegas.`);
  }

  let root;
  try {
    const cfg = loadConfig(hookUrl, env).artifactGate;
    if (!cfg || typeof cfg.root !== "string" || !cfg.root) throw new Error('falta "artifactGate.root"');
    root = realpathLoose(resolve(expandHome(cfg.root)));
  } catch (err) {
    return deny(`artifact-path-gate: ${err.message}. No se publica a ciegas.`);
  }

  const input = payload.tool_input && typeof payload.tool_input === "object" ? payload.tool_input : {};
  // `list` solo enumera lo ya publicado.
  if ((input.action || "publish") === "list") return allow();

  const file = input.file_path;
  // Sin ruta no hay nada que juzgar: que falle la validación del propio tool.
  if (typeof file !== "string" || !file) return allow();

  const base = typeof payload.cwd === "string" && isAbsolute(payload.cwd) ? payload.cwd : process.cwd();
  let path;
  try {
    path = realpathLoose(resolve(base, expandHome(file)));
  } catch (err) {
    return deny(`artifact-path-gate: no se pudo resolver '${file}' (${err.message}).`);
  }

  if (path.startsWith(root + sep)) return allow();
  return deny(
    `Publicar está limitado a ${root}${sep}. Esta ruta es local: ${path}. ` +
      `Si el entregable debe publicarse, escríbelo en ${root}${sep}<slug> y publica desde ahí; ` +
      "si no, déjalo donde está y no llames a Artifact.",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run((raw, env) => evaluate(raw, env));
