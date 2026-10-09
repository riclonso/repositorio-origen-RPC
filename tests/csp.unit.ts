import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { crearPoliticaScripts } from "../src/infrastructure/security/csp";
import { sanitizarPlantillaAlertaHtml } from "../src/modules/ventanas-carga/domain/entities/PlantillaAlerta";

test("CSP permite solo scripts autorizados con un nonce impredecible por respuesta", () => {
  const primera = crearPoliticaScripts();
  const segunda = crearPoliticaScripts();
  assert.notEqual(primera.nonce, segunda.nonce);
  assert.equal(Buffer.from(primera.nonce, "base64").length, 32);
  const scripts = primera.politica.split("; ").find(d => d.startsWith("script-src "))!;
  assert.ok(scripts.includes(`'nonce-${primera.nonce}'`));
  assert.ok(scripts.includes("'strict-dynamic'"));
  assert.ok(!scripts.includes("'unsafe-inline'"));
  assert.ok(!scripts.includes("'unsafe-eval'"));
  assert.ok(primera.politica.includes("script-src-attr 'none'"));
  assert.ok(primera.politica.includes("base-uri 'none'"));
});

test("proxy cubre páginas públicas y protegidas sin interceptar APIs ni subidas", async () => {
  process.env.AUTH_SECRET ??= "secreto-de-prueba-de-al-menos-32-caracteres";
  process.env.DATABASE_URL ??= "postgres://prueba:prueba@localhost:1/prueba";
  const { config } = await import("../src/proxy");
  const coincide = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });
  for (const ruta of ["/", "/login", "/revisor", "/dashboard/usuarios", "/notificador", "/bioestadistica", "/revisor/usuarios/id.con.puntos"]) {
    assert.equal(coincide(ruta), true, ruta);
  }
  for (const ruta of ["/api", "/api/auth/login", "/api/dashboard/cargas/subidas/id/partes/0", "/api/bioestadistica/cargas/subidas", "/_next/static/script.js", "/_next/image", "/favicon.ico"]) {
    assert.equal(coincide(ruta), false, ruta);
  }
});

test("plantillas eliminan scripts, eventos, SVG y enlaces javascript", () => {
  const html = sanitizarPlantillaAlertaHtml('<p onclick="alert(1)">Texto</p><script>alert(2)</script><img src=x onerror="alert(3)"><svg onload="alert(4)"></svg><a href="javascript:alert(5)">enlace</a>');
  assert.equal(html, "<p>Texto</p><span>enlace</span>");
});

test("proxy reemplaza nonces del cliente y mantiene la autenticación de los paneles", async () => {
  const { proxy } = await import("../src/proxy");
  const anterior = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });
  try {
    const respuesta = await proxy(new NextRequest("https://ejemplo.test/login", {
      headers: { "x-nonce": "controlado-por-cliente", "Content-Security-Policy": "script-src *" },
    }));
    const nonce = respuesta.headers.get("x-middleware-request-x-nonce");
    assert.ok(nonce && nonce !== "controlado-por-cliente");
    assert.ok(respuesta.headers.get("Content-Security-Policy")!.includes(`'nonce-${nonce}'`));
    assert.equal(respuesta.headers.get("x-middleware-request-content-security-policy"), respuesta.headers.get("Content-Security-Policy"));
    assert.ok(respuesta.headers.get("Cache-Control")!.includes("no-store"));
    const protegida = await proxy(new NextRequest("https://ejemplo.test/dashboard/usuarios"));
    assert.equal(protegida.status, 307);
    assert.equal(protegida.headers.get("Location"), "https://ejemplo.test/login");
    assert.ok(protegida.headers.get("Content-Security-Policy"));
  } finally {
    if (anterior === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: anterior });
  }
});
