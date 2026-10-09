import type { FormatoExcel } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import { esPerfilNotificador } from "@/modules/perfiles/domain/entities/Perfil";

// Tope de cambios (agregar + quitar) por lote de asignación masiva. Vive en dominio para que el
// esquema Zod (servidor) y el modal (cliente) lean la misma cifra.
export const MAXIMO_CAMBIOS_ASIGNACION_MASIVA = 200;

// Fila del modal de asignación masiva. Solo NOTIFICADOR_RPC activos, y nunca email ni hash.
// `esUnicoFormato`: tiene este formato y ninguna otra asignación (quitárselo lo dejaría sin
// formatos, así que el modal nunca lo incluye al quitar; el servidor igual lo revalida).
// `establecimiento*`: el modal agrupa a los candidatos por establecimiento y la selección se hace
// por establecimiento, no por usuario. `null` en cuentas sin establecimiento (previas a RF-30).
export type CandidatoAsignacionFormato = {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
  establecimientoId: string | null;
  establecimientoNombre: string | null;
  yaAsignado: boolean;
  esUnicoFormato: boolean;
};

// Estado de un usuario leído DENTRO de la transacción de escritura, insumo de
// `clasificarCambiosAsignacion`. `cantidadAsignaciones` cuenta todas sus filas de
// `usuario_formato_excel`, incluidas las de formatos inactivos (criterio estructural, mismo que
// `validarFormatosExcelSegunPerfil`).
export type EstadoUsuarioAsignacion = {
  id: string;
  perfilCodigo: string;
  activo: boolean;
  tieneFormato: boolean;
  cantidadAsignaciones: number;
};

export type ClasificacionCambiosAsignacion = {
  aAgregar: string[];
  aQuitar: string[];
  sinCambio: string[];
  noElegibles: string[];
  excluidosUltimoFormato: string[];
};

function esElegible(estado: EstadoUsuarioAsignacion | undefined): estado is EstadoUsuarioAsignacion {
  return estado !== undefined && estado.activo && esPerfilNotificador(estado.perfilCodigo);
}

// Regla pura de la asignación masiva. La invariante "todo NOTIFICADOR_RPC tiene al menos un
// formato" vive aquí (y no solo en la UI): quitar el formato a quien lo tiene como única
// asignación se excluye del lote en vez de aplicarse.
export function clasificarCambiosAsignacion(
  agregarIds: readonly string[],
  quitarIds: readonly string[],
  estados: readonly EstadoUsuarioAsignacion[],
): ClasificacionCambiosAsignacion {
  const estadoPorId = new Map(estados.map((estado) => [estado.id, estado]));
  const clasificacion: ClasificacionCambiosAsignacion = {
    aAgregar: [],
    aQuitar: [],
    sinCambio: [],
    noElegibles: [],
    excluidosUltimoFormato: [],
  };

  for (const id of agregarIds) {
    const estado = estadoPorId.get(id);
    if (!esElegible(estado)) clasificacion.noElegibles.push(id);
    else if (estado.tieneFormato) clasificacion.sinCambio.push(id);
    else clasificacion.aAgregar.push(id);
  }

  for (const id of quitarIds) {
    const estado = estadoPorId.get(id);
    if (!esElegible(estado)) clasificacion.noElegibles.push(id);
    else if (!estado.tieneFormato) clasificacion.sinCambio.push(id);
    else if (estado.cantidadAsignaciones <= 1) clasificacion.excluidosUltimoFormato.push(id);
    else clasificacion.aQuitar.push(id);
  }

  return clasificacion;
}

// Notificadores (activos e inactivos) que tienen al formato como ÚNICA asignación. Bloquean
// desactivar o eliminar el formato: la invariante es del perfil, no del estado `activo`.
export type BloqueoFormatoUnico = {
  usuariosIds: string[];
  cantidadActivos: number;
  cantidadInactivos: number;
};

export type ResultadoAsignacionMasivaRepositorio =
  | { estado: "NO_ENCONTRADO" }
  | { estado: "FORMATO_INACTIVO"; nombre: string }
  | { estado: "APLICADO"; nombre: string; clasificacion: ClasificacionCambiosAsignacion };

export type ResultadoDesactivacionFormato =
  | { estado: "NO_ENCONTRADO" }
  | { estado: "SIN_CAMBIO"; formato: FormatoExcel }
  | { estado: "BLOQUEADO"; nombre: string; bloqueo: BloqueoFormatoUnico }
  | { estado: "DESACTIVADO"; formato: FormatoExcel; asignacionesEliminadasUsuarioIds: string[] };

export type ResultadoEliminacionFormato =
  | { estado: "ELIMINADO" }
  | { estado: "NO_ENCONTRADO" }
  | { estado: "CON_VENTANAS_ACTIVAS" }
  | { estado: "BLOQUEADO"; bloqueo: BloqueoFormatoUnico };
