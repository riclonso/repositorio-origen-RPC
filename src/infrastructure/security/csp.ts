import { randomBytes } from "node:crypto";

export function crearPoliticaScripts(): { nonce: string; politica: string } {
  const nonce = randomBytes(32).toString("base64");
  const politica = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "script-src-attr 'none'",
    // Los componentes React usan estilos de ancho/progreso y el editor estilos inline.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
  return { nonce, politica };
}
