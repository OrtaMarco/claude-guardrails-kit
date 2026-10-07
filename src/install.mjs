// Lógica del instalador: copia los hooks y fusiona settings.json sin pisar lo existente.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS_SRC = join(dirname(fileURLToPath(import.meta.url)), "hooks");
export const CONFIG_NAME = "guardrails.config.json";

/** Catálogo: evento y matcher por defecto de cada hook. */
export const HOOKS = {
  "browser-allowlist": { event: "PreToolUse", matcher: "mcp__browser__browser_(navigate|fetch)" },
  "artifact-path-gate": { event: "PreToolUse", matcher: "Artifact" },
  "notes-autocommit": { event: "SessionEnd" },
  "dirty-warn": { event: "Stop" },
  "context-reminder": { event: "SessionStart" },
};

/** Dónde vive cada ámbito. `claudeDir` permite apuntar a otro sitio (pruebas). */
export function resolveTarget({ scope = "user", claudeDir, cwd = process.cwd() }) {
  if (scope !== "user" && scope !== "project") throw new Error(`scope inválido '${scope}' (user|project)`);
  const dir = claudeDir || (scope === "user" ? join(homedir(), ".claude") : join(cwd, ".claude"));
  // En proyecto se escribe settings.local.json: el comando lleva la ruta absoluta de node
  // de esta máquina y no debe acabar en git.
  const settings = join(dir, scope === "user" ? "settings.json" : "settings.local.json");
  return { dir, settings, hooksDir: join(dir, "guardrails") };
}

/** Marca de propiedad: nuestros comandos apuntan a `guardrails/<hook>.mjs`. */
const commandFor = (hooksDir, name, nodePath) => `"${nodePath}" "${join(hooksDir, `${name}.mjs`)}"`;
const isOurs = (command) => typeof command === "string" && Object.keys(HOOKS).some((n) => command.includes(`guardrails/${n}.mjs"`) || command.includes(`guardrails\\${n}.mjs"`));

function readSettings(file) {
  if (!existsSync(file)) return { settings: {}, existed: false };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`${file} no es JSON válido (${err.message}); no se toca.`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${file} no es un objeto JSON; no se toca.`);
  }
  return { settings: parsed, existed: true };
}

/** Quita de `settings.hooks` solo las entradas nuestras; devuelve cuántas. */
function stripOurs(settings) {
  let removed = 0;
  if (!settings.hooks || typeof settings.hooks !== "object") return removed;
  for (const event of Object.keys(settings.hooks)) {
    const groups = settings.hooks[event];
    if (!Array.isArray(groups)) continue;
    for (const g of groups) {
      if (!Array.isArray(g?.hooks)) continue;
      const before = g.hooks.length;
      g.hooks = g.hooks.filter((h) => !isOurs(h?.command));
      removed += before - g.hooks.length;
    }
    settings.hooks[event] = groups.filter((g) => !Array.isArray(g?.hooks) || g.hooks.length > 0);
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  return removed;
}

function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

/**
 * Qué hooks se instalan. Por defecto los que funcionan sin configurar nada más
 * (navegador y artifacts); los de notas y recordatorio piden su dato explícito.
 */
export function selectHooks({ hooks, notesRepo, reminder }) {
  const skipped = [];
  let names = hooks ?? ["browser-allowlist", "artifact-path-gate", ...(notesRepo ? ["notes-autocommit", "dirty-warn"] : []), ...(reminder ? ["context-reminder"] : [])];
  for (const n of names) if (!HOOKS[n]) throw new Error(`hook desconocido '${n}' (${Object.keys(HOOKS).join(", ")})`);
  if (!notesRepo && names.some((n) => n === "notes-autocommit" || n === "dirty-warn")) {
    skipped.push("notes-autocommit y dirty-warn: falta --notes-repo");
    names = names.filter((n) => n !== "notes-autocommit" && n !== "dirty-warn");
  }
  if (!reminder && names.includes("context-reminder")) {
    skipped.push("context-reminder: falta --reminder");
    names = names.filter((n) => n !== "context-reminder");
  }
  return { names, skipped };
}

export function init(opts) {
  const { scope = "user", dryRun = false, nodePath = process.execPath, allowDomains = [], notesRepo, reminder, push = false, browserMatcher, artifactRoot } = opts;
  const target = resolveTarget(opts);
  const { names, skipped } = selectHooks(opts);
  const { settings, existed } = readSettings(target.settings);
  const actions = [];

  stripOurs(settings);
  settings.hooks ??= {};
  for (const name of names) {
    const { event, matcher } = HOOKS[name];
    const entry = { hooks: [{ type: "command", command: commandFor(target.hooksDir, name, nodePath) }] };
    const m = name === "browser-allowlist" ? browserMatcher || matcher : matcher;
    if (m) entry.matcher = m;
    (settings.hooks[event] ??= []).push(entry);
    actions.push(`hook ${name} → ${event}${m ? ` (${m})` : ""}`);
  }

  // Config: lo existente manda; solo se añaden las secciones que faltan.
  const configFile = join(target.hooksDir, CONFIG_NAME);
  let config = {};
  if (existsSync(configFile)) {
    try {
      config = JSON.parse(readFileSync(configFile, "utf8"));
    } catch (err) {
      throw new Error(`${configFile} no es JSON válido (${err.message}); no se toca.`);
    }
  }
  const before = JSON.stringify(config);
  if (names.includes("browser-allowlist")) config.browserAllowlist ??= { domains: allowDomains, allowLocalhost: true };
  if (names.includes("artifact-path-gate")) config.artifactGate ??= { root: artifactRoot || "~/artifacts" };
  if (names.some((n) => n === "notes-autocommit" || n === "dirty-warn")) config.notes ??= { repo: notesRepo, push };
  if (names.includes("context-reminder")) config.contextReminder ??= { text: reminder };
  if (JSON.stringify(config) !== before) actions.push(`config ${configFile}`);

  if (!dryRun) {
    mkdirSync(target.hooksDir, { recursive: true });
    copyFileSync(join(HOOKS_SRC, "lib.mjs"), join(target.hooksDir, "lib.mjs"));
    for (const name of names) copyFileSync(join(HOOKS_SRC, `${name}.mjs`), join(target.hooksDir, `${name}.mjs`));
    if (JSON.stringify(config) !== before) writeJson(configFile, config);
    if (existed) copyFileSync(target.settings, `${target.settings}.bak`);
    writeJson(target.settings, settings);
  }
  return { target, actions, skipped, dryRun };
}

export function uninstall(opts) {
  const target = resolveTarget(opts);
  const { settings, existed } = readSettings(target.settings);
  const removed = stripOurs(settings);
  if (existed && removed > 0 && !opts.dryRun) {
    copyFileSync(target.settings, `${target.settings}.bak`);
    writeJson(target.settings, settings);
  }
  if (!opts.dryRun && existsSync(target.hooksDir)) {
    for (const f of readdirSync(target.hooksDir)) {
      // La config es del usuario: se conserva.
      if (f.endsWith(".mjs")) rmSync(join(target.hooksDir, f));
    }
  }
  return { target, removed };
}
