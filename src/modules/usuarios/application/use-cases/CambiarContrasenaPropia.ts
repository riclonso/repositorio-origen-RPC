import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";
import type {
  HasheadorContrasena,
  VerificadorContrasena,
} from "@/modules/usuarios/application/ports";

export type ResultadoCambiarContrasenaPropia =
  | { ok: true }
  | { ok: false; motivo: "CONTRASENA_ACTUAL_INCORRECTA" }
  | { ok: false; motivo: "CONTRASENA_IGUAL_A_ACTUAL" };

// Autoservicio de cambio de contraseña: la propia persona cambia su contraseña desde "Mi
// perfil"/"Cambiar contraseña", a diferencia de `restablecerContrasena` (un administrador la fija
// para un tercero, sin conocer ni pedir la anterior). `usuarioId` SIEMPRE debe venir de la sesión
// (`sesion.sub`), nunca del cuerpo de la petición: lo exige el Route Handler que invoca este caso
// de uso, no este archivo.
export async function cambiarContrasenaPropia(
  usuarioId: string,
  contrasenaActual: string,
  contrasenaNueva: string,
  dependencias: {
    repositorio: UsuarioRepository;
    verificadorContrasena: VerificadorContrasena;
    hasheadorContrasena: HasheadorContrasena;
  },
): Promise<ResultadoCambiarContrasenaPropia> {
  const credencial = await dependencias.repositorio.obtenerCredencialPorId(usuarioId);

  // Anti-enumeración interna, mismo criterio que el `HASH_RELLENO` de `LoginUser`: una fila
  // inexistente (no debería ocurrir con un `sub` de sesión válida, pero la cuenta pudo borrarse
  // entre la emisión del JWT y esta llamada) y una cuenta pendiente (`contrasenaHash` nulo, sin
  // contraseña que comparar) devuelven EXACTAMENTE el mismo motivo que una contraseña actual
  // incorrecta: no hay ninguna señal distinguible hacia afuera.
  if (!credencial || credencial.contrasenaHash === null) {
    return { ok: false, motivo: "CONTRASENA_ACTUAL_INCORRECTA" };
  }

  const contrasenaActualValida = await dependencias.verificadorContrasena.verificar(
    contrasenaActual,
    credencial.contrasenaHash,
  );

  if (!contrasenaActualValida) {
    return { ok: false, motivo: "CONTRASENA_ACTUAL_INCORRECTA" };
  }

  // Se compara contra el HASH, nunca en texto plano (`contrasenaActual === contrasenaNueva`
  // compararía la escritura, no el valor real que bcrypt evaluará; además fallaría si la persona
  // cambia solo mayúsculas/espacios que bcrypt normaliza distinto... en la práctica bcrypt es
  // sensible a esos detalles, pero comparar contra el hash es la única fuente de verdad única
  // para "es la misma contraseña que ya tenía").
  const esIgualALaActual = await dependencias.verificadorContrasena.verificar(
    contrasenaNueva,
    credencial.contrasenaHash,
  );

  if (esIgualALaActual) {
    return { ok: false, motivo: "CONTRASENA_IGUAL_A_ACTUAL" };
  }

  const contrasenaHash = await dependencias.hasheadorContrasena.hashear(contrasenaNueva);
  await dependencias.repositorio.actualizarContrasena(usuarioId, contrasenaHash);

  return { ok: true };
}
