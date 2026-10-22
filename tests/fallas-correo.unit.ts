// RF-44: registro de fallas de envío de correo. Sin BD ni SMTP: las escrituras van a dobles en
// memoria (nunca a `logs/`). `fallasCorreo.ts` importa `env.ts`, que valida al cargarse, así que se
// fijan valores ficticios ANTES de importarlo (no se abre ninguna conexión).
//
//   npx tsx tests/fallas-correo.unit.ts
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://prueba:prueba@127.0.0.1:5432/prueba_no_se_conecta";
process.env.AUTH_SECRET ??= "secreto-de-prueba-con-al-menos-32-caracteres";
// Sin grupo SMTP: `enviarCorreo()` lanza "no configurado" con el correo adjunto.
delete process.env.SMTP_HOST;

async function main() {
  const { adjuntarCorreoFallido, correoFallidoDe, reemplazarEnlaces } = await import(
    "../src/infrastructure/email/correoFallido"
  );
  const { enviarCorreo } = await import("../src/infrastructure/email/SmtpMailer");
  const { crearRegistradorFallasCorreo, construirRegistroFallaCorreo } = await import(
    "../src/infrastructure/logging/fallasCorreo"
  );
  type RegistroFallaCorreo = import("../src/infrastructure/logging/fallasCorreo").RegistroFallaCorreo;

  const TOKEN = "Zt9QpL2vX8sKd4mN7rB1cY6wE3aF5hJ0";

  // --- Enlaces: toda URL queda como [enlace]; el token nunca sobrevive ---
  const cuerpoRecuperacion = `Hola Ana,

Para elegir una contraseña nueva, abre este enlace:

https://rpc.example.invalid/recuperar/confirmar?token=${TOKEN}&contexto=recuperacion

También: http://otro.example.invalid/x?token=${TOKEN} y www.example.invalid/ruta?token=${TOKEN}.
`;
  const saneado = reemplazarEnlaces(cuerpoRecuperacion);
  assert.ok(!saneado.includes(TOKEN), "El token no puede quedar en el cuerpo registrado");
  assert.ok(!saneado.includes("https://") && !saneado.includes("http://") && !saneado.includes("www."));
  assert.equal(saneado.match(/\[enlace\]/g)?.length, 3);
  assert.ok(saneado.includes("Hola Ana,"), "El resto del texto se conserva");
  console.log("OK: URLs y tokens del cuerpo quedan como [enlace]");

  // Enlace SIN esquema (APP_URL mal configurada): el valor del `token=` se oculta igual.
  const sinEsquema = reemplazarEnlaces("Abre: localhost:3613/recuperar/confirmar?token=abc&contexto=recuperacion");
  assert.ok(!sinEsquema.includes("abc"), "Un token sin esquema en el enlace no sobrevive");
  assert.ok(sinEsquema.includes("token=[enlace]") && sinEsquema.includes("contexto=recuperacion"));
  console.log("OK: token= en un enlace sin esquema queda oculto");

  // --- `enviarCorreo()` adjunta el correo al error (aquí: SMTP sin configurar) ---
  const errorEnvio = await enviarCorreo({
    para: "ana@example.invalid",
    asunto: "Restablecer tu contraseña",
    texto: cuerpoRecuperacion,
    html: "<p>no se registra</p>",
  }).then(
    () => assert.fail("Sin SMTP configurado debe lanzar"),
    (error: unknown) => error,
  );
  const adjunto = correoFallidoDe(errorEnvio);
  assert.ok(adjunto, "El error lleva el correo intentado");
  assert.equal(adjunto.para, "ana@example.invalid");
  assert.ok(!Object.keys(errorEnvio as object).some((clave) => clave.includes("correo")), "El adjunto no es enumerable");
  assert.ok(!JSON.stringify(errorEnvio).includes(TOKEN), "Serializar el error no vuelca el cuerpo");
  console.log("OK: enviarCorreo() adjunta destinatario, asunto y texto al error sin hacerlos enumerables");

  // --- Registro de ENVIO: mensaje completo, destinatario completado desde el adjunto, sin token ---
  const errorSmtp = adjuntarCorreoFallido(
    Object.assign(new Error("Invalid login: 535 5.7.8 Authentication failed for ana@example.invalid"), { code: "EAUTH" }),
    { para: "ana@example.invalid", asunto: "Restablecer tu contraseña", texto: cuerpoRecuperacion },
  );
  const fallas: RegistroFallaCorreo[] = [];
  const errores: { mensaje: string; campos: Record<string, unknown> }[] = [];
  const registrar = crearRegistradorFallasCorreo({
    escribirFalla: (registro) => fallas.push(registro),
    escribirError: (mensaje, campos) => errores.push({ mensaje, campos }),
    remitente: () => "Repositorio RPC <no-responder@example.invalid>",
    variablesFaltantes: () => ["SMTP_HOST", "APP_URL"],
  });

  registrar({
    tipoAviso: "ENLACE_RECUPERACION",
    etapa: "ENVIO",
    destinatario: { tipo: "USUARIO", usuarioId: "u1", nombre: "Ana Pérez", rut: "11111111-1" },
    referencias: { tokenId: "fila-token-1" },
    error: errorSmtp,
  });
  assert.equal(fallas.length, 1);
  assert.equal(errores.length, 0, "ENVIO no escribe en errores.txt");
  const registroEnvio = fallas[0];
  assert.ok(registroEnvio);
  assert.equal(registroEnvio.emisor, "Repositorio RPC <no-responder@example.invalid>");
  assert.equal(registroEnvio.mensajeFalla, "Invalid login: 535 5.7.8 Authentication failed for ana@example.invalid");
  assert.deepEqual(registroEnvio.destinatario, {
    tipo: "USUARIO",
    usuarioId: "u1",
    nombre: "Ana Pérez",
    rut: "11111111-1",
    email: "ana@example.invalid",
  });
  assert.equal(registroEnvio.ventana, null);
  assert.equal(registroEnvio.correo?.asunto, "Restablecer tu contraseña");
  assert.ok(registroEnvio.correo?.cuerpo.includes("[enlace]"));
  assert.ok(!JSON.stringify(registroEnvio).includes(TOKEN), "El registro completo no contiene el token");
  console.log("OK: ENVIO -> solo fallas-correo, mensaje completo, cuerpo sin enlaces ni token");

  // --- PREPARACION: además escribe en errores.txt; sin correo armado ---
  registrar({
    tipoAviso: "AVISO_MENSAJE_REVISORES",
    etapa: "PREPARACION",
    ventana: { ventanaCargaId: "v1", nombre: null },
    referencias: { mensajeCargaId: "m1" },
    error: new TypeError("conteo caído"),
  });
  assert.equal(fallas.length, 2);
  assert.equal(errores.length, 1, "PREPARACION también va a errores.txt");
  assert.equal(fallas[1]?.mensajeFalla, "TypeError: conteo caído");
  assert.equal(fallas[1]?.correo, null);
  assert.deepEqual(fallas[1]?.destinatario, { tipo: null });
  assert.equal(errores[0]?.campos.tipoAviso, "AVISO_MENSAJE_REVISORES");
  assert.equal(errores[0]?.campos.error, "TypeError: conteo caído");
  console.log("OK: PREPARACION -> fallas-correo y errores.txt");

  // --- SIN_CONFIGURACION: solo nombres de variables, nunca valores; solo fallas-correo ---
  registrar({ tipoAviso: "ALERTA_VENTANA", etapa: "SIN_CONFIGURACION", referencias: { modalidad: "AUTOMATICA" } });
  assert.equal(fallas.length, 3);
  assert.equal(errores.length, 1, "SIN_CONFIGURACION no escribe en errores.txt");
  assert.equal(fallas[2]?.mensajeFalla, "El envío de correo no está configurado. Variables faltantes: SMTP_HOST, APP_URL");
  assert.equal(fallas[2]?.correo, null);
  console.log("OK: SIN_CONFIGURACION -> solo fallas-correo, con los nombres de las variables faltantes");

  // --- ENVIO: el mensaje del relay se conserva, salvo el valor de un `token=` ---
  registrar({
    tipoAviso: "ENLACE_RECUPERACION",
    etapa: "ENVIO",
    error: new Error("550 rechazado: localhost:3613/recuperar/confirmar?token=abc"),
  });
  assert.equal(fallas[3]?.mensajeFalla, "550 rechazado: localhost:3613/recuperar/confirmar?token=[enlace]");
  console.log("OK: token= oculto también en el mensaje de la falla");

  // --- RF-10: PREPARACION de enlaces de contraseña sin `error.message` (puede traer parámetros
  // de Prisma, p. ej. el `tokenHash`): solo nombre y código, en ambos logs ---
  const erroresAntes = errores.length;
  const errorPrisma = Object.assign(new Error("Invalid `prisma.tokenRecuperacion.create()` tokenHash: \"hash-secreto\""), {
    name: "PrismaClientKnownRequestError",
    code: "P2002",
  });
  for (const tipoAviso of ["ENLACE_RECUPERACION", "ENLACE_CONTRASENA_ADMIN"] as const) {
    registrar({ tipoAviso, etapa: "PREPARACION", error: errorPrisma });
    const registro: RegistroFallaCorreo | undefined = fallas[fallas.length - 1];
    assert.equal(registro?.mensajeFalla, "PrismaClientKnownRequestError (code=P2002)");
    assert.ok(!JSON.stringify(registro).includes("hash-secreto"));
  }
  assert.equal(errores.length, erroresAntes + 2);
  for (const entrada of errores.slice(erroresAntes)) {
    assert.equal(entrada.campos.error, "PrismaClientKnownRequestError (code=P2002)");
    assert.ok(!JSON.stringify(entrada).includes("hash-secreto"), "errores.txt tampoco lleva el mensaje");
  }
  // Sin `code` string: solo el nombre.
  registrar({ tipoAviso: "ENLACE_CONTRASENA_ADMIN", etapa: "PREPARACION", error: new TypeError("detalle sensible") });
  assert.equal(fallas[fallas.length - 1]?.mensajeFalla, "TypeError");
  console.log("OK: PREPARACION de enlaces de contraseña -> solo nombre y código del error");

  // --- Buzón compartido: la dirección se conserva ---
  const registroBuzon = construirRegistroFallaCorreo(
    {
      tipoAviso: "APROBACION_CARGA_REVISORES",
      etapa: "ENVIO",
      destinatario: { tipo: "BUZON_COMPARTIDO", email: "equipo@example.invalid" },
      ventana: { ventanaCargaId: "v1", nombre: "Biopsias (2026)" },
      error: new Error("Connection timeout"),
    },
    { remitente: () => null, variablesFaltantes: () => [] },
  );
  assert.deepEqual(registroBuzon.destinatario, { tipo: "BUZON_COMPARTIDO", email: "equipo@example.invalid" });
  assert.equal(registroBuzon.ventana?.nombre, "Biopsias (2026)");
  console.log("OK: buzón compartido con su dirección y la ventana nombrada");

  // --- El helper nunca lanza, aunque falle la escritura ---
  const registrarQueFalla = crearRegistradorFallasCorreo({
    escribirFalla: () => {
      throw new Error("disco lleno");
    },
    escribirError: () => {
      throw new Error("disco lleno");
    },
    remitente: () => {
      throw new Error("config rota");
    },
    variablesFaltantes: () => [],
  });
  assert.doesNotThrow(() =>
    registrarQueFalla({ tipoAviso: "RECHAZO_CARGA", etapa: "PREPARACION", error: new Error("x") }),
  );
  console.log("OK: registrarFallaCorreo nunca lanza");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
