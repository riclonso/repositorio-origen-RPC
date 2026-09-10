import {
  esAutoOperacion,
  type CampoUnico,
  type DatosEdicionUsuario,
  type Usuario,
} from "@/modules/usuarios/domain/entities/Usuario";
import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";
import type { PerfilRepository } from "@/modules/perfiles/domain/repositories/PerfilRepository";
import { esPerfilAdministrador } from "@/modules/perfiles/domain/entities/Perfil";
import { UsuarioDuplicadoError } from "@/modules/usuarios/domain/errors/UsuarioDuplicadoError";
import { PerfilInvalidoError } from "@/modules/usuarios/domain/errors/PerfilInvalidoError";

export type ResultadoActualizarUsuario =
  | {
      ok: true;
      usuario: Usuario;
      camposModificados: string[];
      // Códigos, no nombres visibles: la auditoría debe apuntar a un identificador estable.
      perfilAnterior?: string;
      perfilNuevo?: string;
    }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "PERFIL_INVALIDO" }
  | { ok: false; motivo: "DUPLICADO"; campo: CampoUnico; rut: string }
  | { ok: false; motivo: "AUTO_OPERACION" | "ULTIMO_ADMIN"; rut: string };

const CAMPOS_EDITABLES = ["nombres", "apellidos", "email", "perfilCodigo"] as const;

function detectarCamposModificados(actual: Usuario, datos: DatosEdicionUsuario): string[] {
  return CAMPOS_EDITABLES.filter((campo) => actual[campo] !== datos[campo]);
}

export async function actualizarUsuario(
  id: string,
  datos: DatosEdicionUsuario,
  actorId: string,
  dependencias: { repositorio: UsuarioRepository; repositorioPerfiles: PerfilRepository },
): Promise<ResultadoActualizarUsuario> {
  const actual = await dependencias.repositorio.obtenerPorId(id);

  if (!actual) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  // Conservar el perfil que la persona ya tiene siempre es válido, aunque el catálogo lo haya
  // dado de baja. Si se exigiera que estuviera activo, editar el email de esa cuenta sería
  // imposible y la única salida por pantalla sería cambiarle el perfil, que es justo el efecto
  // que el formulario de edición evita cargando el perfil vigente entre las opciones.
  // Asignar un perfil dado de baja distinto del actual se sigue rechazando, y si el perfil llega
  // a borrarse, la violación de FK (P2003) se traduce igual a PERFIL_INVALIDO.
  const conservaSuPerfil = datos.perfilCodigo === actual.perfilCodigo;

  if (
    !conservaSuPerfil &&
    !(await dependencias.repositorioPerfiles.existeActivo(datos.perfilCodigo))
  ) {
    return { ok: false, motivo: "PERFIL_INVALIDO" };
  }

  // Con un catálogo abierto, "quitar el perfil de administrador" ya no significa "poner
  // USUARIO": significa pasar a cualquier perfil que no sea el privilegiado.
  const degradaPerfil =
    esPerfilAdministrador(actual.perfilCodigo) && !esPerfilAdministrador(datos.perfilCodigo);

  if (degradaPerfil) {
    if (esAutoOperacion(actorId, id)) {
      return { ok: false, motivo: "AUTO_OPERACION", rut: actual.rut };
    }

    if (actual.activo && (await dependencias.repositorio.contarAdminsActivos()) <= 1) {
      return { ok: false, motivo: "ULTIMO_ADMIN", rut: actual.rut };
    }
  }

  if (datos.email !== actual.email) {
    const conflicto = await dependencias.repositorio.buscarConflicto({ email: datos.email }, id);

    if (conflicto) {
      return { ok: false, motivo: "DUPLICADO", campo: conflicto, rut: actual.rut };
    }
  }

  const camposModificados = detectarCamposModificados(actual, datos);

  try {
    const usuario = await dependencias.repositorio.actualizar(id, datos);

    return {
      ok: true,
      usuario,
      camposModificados,
      ...(actual.perfilCodigo !== usuario.perfilCodigo
        ? { perfilAnterior: actual.perfilCodigo, perfilNuevo: usuario.perfilCodigo }
        : {}),
    };
  } catch (error) {
    if (error instanceof UsuarioDuplicadoError) {
      return { ok: false, motivo: "DUPLICADO", campo: error.campo, rut: actual.rut };
    }

    // El perfil pudo eliminarse entre la comprobación y el UPDATE.
    if (error instanceof PerfilInvalidoError) {
      return { ok: false, motivo: "PERFIL_INVALIDO" };
    }

    throw error;
  }
}
