import { puedeIniciarSesion } from "@/modules/auth/domain/entities/User";
import type { UserRepository } from "@/modules/auth/domain/repositories/UserRepository";
import type { EmisorSesion, VerificadorContrasena } from "@/modules/auth/application/ports";

export type ResultadoLogin = { ok: true; token: string } | { ok: false };

// Hash bcrypt de un valor sin significado, usado únicamente para que la verificación de
// contraseña tome un tiempo similar cuando el RUT no existe, evitando que la latencia
// permita enumerar qué RUTs están registrados.
const HASH_RELLENO = "$2b$12$brd1rfo6Yssb2XlTKFTXa.wEUX4exoN6QNiLbh.pWU76KYcY2OD0G";

export async function loginUser(
  rut: string,
  contrasena: string,
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
  if (!usuario || !puedeIniciarSesion(usuario) || usuario.contrasenaHash === null) {
    await dependencias.verificadorContrasena.verificar(contrasena, HASH_RELLENO);
    return { ok: false };
  }

  const contrasenaValida = await dependencias.verificadorContrasena.verificar(
    contrasena,
    usuario.contrasenaHash,
  );

  if (!contrasenaValida) {
    return { ok: false };
  }

  const token = await dependencias.emisorSesion.emitir(usuario);
  return { ok: true, token };
}
