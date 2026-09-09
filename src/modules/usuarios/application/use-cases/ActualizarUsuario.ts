import {
  esAutoOperacion,
  type CampoUnico,
  type DatosEdicionUsuario,
  type RolUsuario,
  type Usuario,
} from "@/modules/usuarios/domain/entities/Usuario";
import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";
import { UsuarioDuplicadoError } from "@/modules/usuarios/domain/errors/UsuarioDuplicadoError";

export type ResultadoActualizarUsuario =
  | {
      ok: true;
      usuario: Usuario;
      camposModificados: string[];
      rolAnterior?: RolUsuario;
      rolNuevo?: RolUsuario;
    }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "DUPLICADO"; campo: CampoUnico; rut: string }
  | { ok: false; motivo: "AUTO_OPERACION" | "ULTIMO_ADMIN"; rut: string };

const CAMPOS_EDITABLES = ["nombres", "apellidos", "email", "rol"] as const;

function detectarCamposModificados(actual: Usuario, datos: DatosEdicionUsuario): string[] {
  return CAMPOS_EDITABLES.filter((campo) => actual[campo] !== datos[campo]);
}

export async function actualizarUsuario(
  id: string,
  datos: DatosEdicionUsuario,
  actorId: string,
  dependencias: { repositorio: UsuarioRepository },
): Promise<ResultadoActualizarUsuario> {
  const actual = await dependencias.repositorio.obtenerPorId(id);

  if (!actual) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  const degradaRol = actual.rol === "ADMIN" && datos.rol !== "ADMIN";

  if (degradaRol) {
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
      ...(actual.rol !== usuario.rol ? { rolAnterior: actual.rol, rolNuevo: usuario.rol } : {}),
    };
  } catch (error) {
    if (error instanceof UsuarioDuplicadoError) {
      return { ok: false, motivo: "DUPLICADO", campo: error.campo, rut: actual.rut };
    }

    throw error;
  }
}
