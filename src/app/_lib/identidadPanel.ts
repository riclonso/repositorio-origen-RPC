import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { prismaUserRepository } from "@/modules/auth/infrastructure/repositories/PrismaUserRepository";
import { prismaPerfilRepository } from "@/modules/perfiles/infrastructure/repositories/PrismaPerfilRepository";

// Identidad de la sesión para mostrar en el encabezado de los paneles: nombre de la persona y
// nombre VISIBLE de su perfil (no el código). La composición vive en la capa `app/` —el único
// lugar que puede orquestar varios módulos— y no en `shared/`, que no debe importar de `modules/`.
export type IdentidadPanel = {
  nombres: string;
  apellidos: string;
  perfilNombre: string;
};

// Devuelve `null` si no hay sesión válida o si la cuenta ya no existe (caso borde de un token aún
// vigente sobre una cuenta borrada): las páginas de cada panel ya fuerzan el reingreso en ese caso,
// así que el encabezado simplemente se dibuja sin bloque de identidad.
export async function obtenerIdentidadPanel(): Promise<IdentidadPanel | null> {
  const sesion = await obtenerSesionActual();

  if (!sesion) {
    return null;
  }

  const usuario = await prismaUserRepository.buscarPorId(sesion.sub);

  if (!usuario) {
    return null;
  }

  // El perfil siempre viene del catálogo por su código; si por algún motivo no se encuentra, se
  // cae al código como último recurso legible en vez de dejar el encabezado sin perfil.
  const perfil = await prismaPerfilRepository.buscarPorCodigo(usuario.perfilCodigo);

  return {
    nombres: usuario.nombres,
    apellidos: usuario.apellidos,
    perfilNombre: perfil?.nombre ?? usuario.perfilCodigo,
  };
}
