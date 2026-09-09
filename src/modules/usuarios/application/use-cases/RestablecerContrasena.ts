import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";
import type { HasheadorContrasena } from "@/modules/usuarios/application/ports";

export type ResultadoRestablecerContrasena =
  | { ok: true; id: string; rut: string }
  | { ok: false; motivo: "NO_ENCONTRADO" };

// Restablecer la propia contraseña SÍ está permitido: de lo contrario el único administrador
// del sistema no tendría forma de cambiar su clave desde la aplicación.
export async function restablecerContrasena(
  id: string,
  contrasena: string,
  dependencias: {
    repositorio: UsuarioRepository;
    hasheadorContrasena: HasheadorContrasena;
  },
): Promise<ResultadoRestablecerContrasena> {
  const usuario = await dependencias.repositorio.obtenerPorId(id);

  if (!usuario) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  const contrasenaHash = await dependencias.hasheadorContrasena.hashear(contrasena);
  await dependencias.repositorio.actualizarContrasena(id, contrasenaHash);

  // Nunca se devuelve el hash: el resultado solo identifica al usuario afectado.
  return { ok: true, id: usuario.id, rut: usuario.rut };
}
