import {
  cuentaBloqueada,
  puedeIniciarSesion,
  MAXIMO_INTENTOS_LOGIN_FALLIDOS,
  DURACIONES_BLOQUEO_MINUTOS,
} from "@/modules/auth/domain/entities/User";
import type { UserRepository } from "@/modules/auth/domain/repositories/UserRepository";
import type { EmisorSesion, VerificadorContrasena } from "@/modules/auth/application/ports";

export type ResultadoLogin =
  | { ok: true; token: string }
  | { ok: false; motivoInterno: "CREDENCIALES_INVALIDAS" }
  // `bloqueadaHasta` es el valor YA VIGENTE (bloqueo activado por un intento anterior) o el
  // RECIÉN CALCULADO por este mismo intento (si fue el que activó el bloqueo) — el Route Handler
  // no necesita distinguir cuál de los dos casos fue para construir el mensaje.
  | { ok: false; motivoInterno: "CUENTA_BLOQUEADA"; bloqueadaHasta: Date };

// Hash bcrypt de un valor sin significado, usado únicamente para que la verificación de
// contraseña tome un tiempo similar cuando el RUT no existe, evitando que la latencia
// permita enumerar qué RUTs están registrados.
const HASH_RELLENO = "$2b$12$brd1rfo6Yssb2XlTKFTXa.wEUX4exoN6QNiLbh.pWU76KYcY2OD0G";

export async function loginUser(
  rut: string,
  contrasena: string,
  // Generado SIEMPRE en `app/api/auth/login/route.ts` y nunca aquí (`new Date()` dentro del caso
  // de uso haría cada llamada no determinista y distinta del `ahora` que usa el Route Handler para
  // calcular los minutos restantes del mensaje de bloqueo).
  ahora: Date,
  dependencias: {
    repositorio: UserRepository;
    verificadorContrasena: VerificadorContrasena;
    emisorSesion: EmisorSesion;
  },
): Promise<ResultadoLogin> {
  const usuario = await dependencias.repositorio.buscarPorRut(rut);

  // `contrasenaHash === null` (cuenta pendiente) ya lo cubre `puedeIniciarSesion`; se repite en
  // la guarda porque además ESTRECHA el tipo `string | null` a `string` para el `verificar()` de
  // abajo. Una cuenta pendiente cae por la rama del HASH_RELLENO: mismo tiempo y mismo fallo
  // genérico que un RUT inexistente, sin regalar que la cuenta existe pero está sin activar.
  if (!usuario || usuario.contrasenaHash === null) {
    await dependencias.verificadorContrasena.verificar(contrasena, HASH_RELLENO);
    return { ok: false, motivoInterno: "CREDENCIALES_INVALIDAS" };
  }

  // La cuenta YA está bloqueada por un intento anterior: no se toca la fila (ni siquiera para
  // sumar un intento fallido más, que reiniciaría el ciclo de conteo sin necesidad) y se responde
  // por tiempo constante, igual que el resto de las ramas de fallo.
  if (cuentaBloqueada(usuario, ahora)) {
    await dependencias.verificadorContrasena.verificar(contrasena, HASH_RELLENO);
    return { ok: false, motivoInterno: "CUENTA_BLOQUEADA", bloqueadaHasta: usuario.bloqueadaHasta! };
  }

  if (!puedeIniciarSesion(usuario)) {
    await dependencias.verificadorContrasena.verificar(contrasena, HASH_RELLENO);
    return { ok: false, motivoInterno: "CREDENCIALES_INVALIDAS" };
  }

  const contrasenaValida = await dependencias.verificadorContrasena.verificar(
    contrasena,
    usuario.contrasenaHash,
  );

  if (!contrasenaValida) {
    const resultado = await dependencias.repositorio.registrarIntentoFallido(
      usuario.id,
      ahora,
      MAXIMO_INTENTOS_LOGIN_FALLIDOS,
      DURACIONES_BLOQUEO_MINUTOS,
    );

    // `bloqueadaHasta` no nulo significa que ESTE intento activó el bloqueo (la sentencia SQL de
    // `registrarIntentoFallido` lo decide de forma atómica, ver `PrismaUserRepository`).
    if (resultado.bloqueadaHasta !== null) {
      return { ok: false, motivoInterno: "CUENTA_BLOQUEADA", bloqueadaHasta: resultado.bloqueadaHasta };
    }

    return { ok: false, motivoInterno: "CREDENCIALES_INVALIDAS" };
  }

  // Login exitoso: se limpia el ciclo de fallos actual (`vecesBloqueada` no se toca, ver
  // `resetearIntentosFallidos`).
  await dependencias.repositorio.resetearIntentosFallidos(usuario.id);

  const token = await dependencias.emisorSesion.emitir(usuario);
  return { ok: true, token };
}
