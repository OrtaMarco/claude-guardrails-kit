#!/usr/bin/env node
// PreToolUse: deja navegar solo a los dominios de la lista permitida.
// Falla CERRADO: payload ilegible, config ausente, URL ausente/ilegible o esquema
// raro = bloquear (exit 2).
import { fileURLToPath } from "node:url";
import { allow, block, loadConfig, parsePayload, run } from "./lib.mjs";

const IPV4_LOOPBACK = /^127(\.\d{1,3}){3}$/;

function isLoopback(host) {
  return host === "localhost" || host === "[::1]" || IPV4_LOOPBACK.test(host);
}

export function evaluate(raw, env = process.env, hookUrl = import.meta.url) {
  let payload;
  try {
    payload = parsePayload(raw);
  } catch (err) {
    return block(`browser-allowlist: payload ilegible (${err.message}); se bloquea por seguridad.`);
  }

  let cfg;
  try {
    cfg = loadConfig(hookUrl, env).browserAllowlist;
    if (!cfg || !Array.isArray(cfg.domains) || !cfg.domains.every((d) => typeof d === "string" && /^[a-z0-9.-]+$/i.test(d.trim()))) {
      throw new Error('falta "browserAllowlist.domains" (lista de dominios sin esquema ni ruta)');
    }
  } catch (err) {
    return block(`browser-allowlist: ${err.message}; se bloquea por seguridad.`);
  }

  const fields = Array.isArray(cfg.urlFields) && cfg.urlFields.length ? cfg.urlFields : ["url"];
  const input = payload.tool_input && typeof payload.tool_input === "object" ? payload.tool_input : {};
  const urls = fields.map((f) => input[f]).filter((v) => typeof v === "string" && v.trim());
  if (urls.length === 0) {
    return block(`browser-allowlist: no hay URL en tool_input (${fields.join(", ")}); se bloquea por seguridad.`);
  }

  const domains = cfg.domains.map((d) => d.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean);
  const allowLoopback = cfg.allowLocalhost !== false;

  for (let url of urls) {
    url = url.trim();
    if (url.toLowerCase() === "about:blank") continue;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url) || /^[^/]*:\d+(\/|$)/.test(url)) url = "http://" + url;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return block(`browser-allowlist: URL ilegible '${url}'; se bloquea por seguridad.`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return block(`browser-allowlist: esquema '${parsed.protocol}' no permitido (solo http/https).`);
    }
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (allowLoopback && isLoopback(host)) continue;
    if (domains.some((d) => host === d || host.endsWith("." + d))) continue;
    return block(
      `Bloqueado: '${host}' no está en la lista permitida de navegación. ` +
        "Usa un navegador de sesión limpia para sitios de terceros, o añade el dominio a " +
        '"browserAllowlist.domains" en guardrails.config.json si es de confianza.',
    );
  }
  return allow();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run((raw, env) => evaluate(raw, env));
