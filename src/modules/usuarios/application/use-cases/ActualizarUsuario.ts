import {
  esAutoOperacion,
  type CampoUnico,
  type DatosEdicionUsuario,
  type Usuario,
} from "@/modules/usuarios/domain/entities/Usuario";
import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";
import type { PerfilRepository } from "@/modules/perfiles/domain/repositories/PerfilRepository";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";
import { esPerfilAdministrador } from "@/modules/perfiles/domain/entities/Perfil";
import { UsuarioDuplicadoError } from "@/modules/usuarios/domain/errors/UsuarioDuplicadoError";
import { PerfilInvalidoError } from "@/modules/usuarios/domain/errors/PerfilInvalidoError";
import { FormatoExcelInvalidoError } from "@/modules/usuarios/domain/errors/FormatoExcelInvalidoError";

export type ResultadoActualizarUsuario =
  | {
      ok: true;
      usuario: Usuario;
      camposModificados: string[];
      // Códigos, no nombres visibles: la auditoría debe apuntar a un identificador estable.
      perfilAnterior?: string;
      perfilNuevo?: string;
      // Ids de formato agregados/quitados en esta edición, para la auditoría.
      formatosAgregados: string[];
      formatosQuitados: string[];
    }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "PERFIL_INVALIDO" }
  | { ok: false; motivo: "FORMATO_INVALIDO" }
  | { ok: false; motivo: "DUPLICADO"; campo: CampoUnico; rut: string }
  | { ok: false; motivo: "AUTO_OPERACION" | "ULTIMO_ADMIN" | "PERFIL_ADMIN_RESTRINGIDO"; rut: string };

const CAMPOS_EDITABLES = ["nombres", "apellidos", "email", "perfilCodigo"] as const;

function detectarCamposModificados(actual: Usuario, datos: DatosEdicionUsuario): string[] {
  return CAMPOS_EDITABLES.filter((campo) => actual[campo] !== datos[campo]);
}

export async function actualizarUsuario(
  id: string,
  datos: DatosEdicionUsuario,
  actorId: string,
  // Perfil de quien ejecuta la operación (ADMIN o REVISOR_REPOSITORIO: ambos tienen acceso al
  // mantenedor). Se recibe aparte de `dependencias` porque es un dato de identidad del actor, no
  // una dependencia técnica inyectable.
  actorPerfilCodigo: string,
  dependencias: {
    repositorio: UsuarioRepository;
    repositorioPerfiles: PerfilRepository;
    repositorioFormatosExcel: FormatoExcelRepository;
  },
): Promise<ResultadoActualizarUsuario> {
  const actual = await dependencias.repositorio.obtenerPorId(id);

  if (!actual) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  // Un actor sin perfil ADMIN no puede tocar una cuenta que YA es ADMIN, ni asignarle el perfil
  // ADMIN a nadie (incluido su propio registro). Va ANTES de conservaSuPerfil/degradaPerfil: esas
  // reglas son exclusivamente para cuando el actor SÍ es ADMIN operando sobre una cuenta ADMIN.
  if (
    !esPerfilAdministrador(actorPerfilCodigo) &&
    (esPerfilAdministrador(actual.perfilCodigo) || esPerfilAdministrador(datos.perfilCodigo))
  ) {
    return { ok: false, motivo: "PERFIL_ADMIN_RESTRINGIDO", rut: actual.rut };
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

  // Los formatos que la persona ya tenía se conservan aunque hayan sido dados de baja (mismo
  // criterio que "conserva su perfil actual"); los nuevos deben existir y estar vigentes. Se
  // resuelve con UNA sola consulta sobre los ids realmente nuevos, no sobre el conjunto completo.
  const idsActuales = new Set(actual.formatosExcel.map((formato) => formato.id));
  const idsSolicitadosSet = new Set(datos.formatosExcelIds);
  const idsSolicitados = [...idsSolicitadosSet];
  const idsNuevos = idsSolicitados.filter((formatoId) => !idsActuales.has(formatoId));

  if (idsNuevos.length > 0) {
    const activos = await dependencias.repositorioFormatosExcel.obtenerActivosEntre(idsNuevos);

    if (activos.length !== idsNuevos.length) {
      return { ok: false, motivo: "FORMATO_INVALIDO" };
    }
  }

  const camposModificados = detectarCamposModificados(actual, datos);
  const formatosAgregados = idsNuevos;
  const formatosQuitados = [...idsActuales].filter((formatoId) => !idsSolicitadosSet.has(formatoId));

  try {
    const usuario = await dependencias.repositorio.actualizar(id, {
      ...datos,
      formatosExcelIds: idsSolicitados,
    });

    return {
      ok: true,
      usuario,
      camposModificados,
      formatosAgregados,
      formatosQuitados,
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

    // Un formato nuevo pudo darse de baja entre la comprobación y el UPDATE.
    if (error instanceof FormatoExcelInvalidoError) {
      return { ok: false, motivo: "FORMATO_INVALIDO" };
    }

    throw error;
  }
}
