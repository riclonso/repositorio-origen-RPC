import type {
  CargaArchivo,
  DatosPublicacionCarga,
  FilaParaPublicar,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { LectorArchivoReporte } from "@/modules/reporte-excel/application/ports";
import type { SolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/domain/repositories/SolicitudReemplazoCargaRepository";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";
import { indiceUltimaFilaConDatos } from "@/modules/reporte-excel/domain/reglas/filasArchivo";

export type ResultadoDarVistoBueno =
  | { ok: true; carga: CargaArchivo }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "NO_PENDIENTE" };

// Motivo de desactivación cuando la carga aprobada reemplaza a la vigente sin ninguna solicitud de
// reemplazo de la que tomar el texto del notificador (datos antiguos o cadenas sin solicitud).
export const MOTIVO_REEMPLAZO_GENERICO = "Reemplazada por una carga posterior aprobada.";

type DependenciasResolverReemplazo = {
  repositorio: CargaArchivoRepository;
  repositorioSolicitudesReemplazo: SolicitudReemplazoCargaRepository;
};

// Motivo del reemplazo, por orden de preferencia: (1) la solicitud consumida al finalizar ESTA
// carga; (2) si no hay (llegó por reapertura tras rechazarse la carga de reemplazo), la última
// solicitud consumida sobre la vigente anterior, que es la que originó la cadena; (3) uno genérico.
// `null` si la combinación no tenía una `APROBADA` vigente (no es un reemplazo).
async function resolverReemplazo(
  id: string,
  carga: CargaArchivo,
  dependencias: DependenciasResolverReemplazo,
): Promise<DatosPublicacionCarga["reemplazo"]> {
  const vigenteAnterior = await dependencias.repositorio.obtenerAprobadaVigentePorUsuarioYVentana(
    carga.usuarioId,
    carga.ventanaCargaId,
  );

  if (!vigenteAnterior) return null;

  const solicitudDeOrigen = await dependencias.repositorioSolicitudesReemplazo.obtenerPorNuevaCargaArchivoId(id);
  if (solicitudDeOrigen) return { motivo: solicitudDeOrigen.motivo };

  const ultimaConsumida = await dependencias.repositorioSolicitudesReemplazo.obtenerUltimaUtilizadaPorCarga(
    vigenteAnterior.id,
  );

  return { motivo: ultimaConsumida?.motivo ?? MOTIVO_REEMPLAZO_GENERICO };
}

// Corrección (fin de la autoaprobación): el visto bueno YA NO lo da el notificador dueño de la
// carga. Ahora lo da un tercero (ADMIN/REVISOR_REPOSITORIO) sobre una carga que el notificador ya
// "finalizó y envió" (`finalizadaEn` no nulo). Sigue siendo irreversible: no existe caso de uso ni
// endpoint para deshacerlo.
//
// Extensión "publicación hacia el revisor": en el mismo instante en que la carga pasa a
// `APROBADA`, se congela un snapshot (cabecera + una fila de detalle por cada fila del archivo) en
// tablas nuevas, visibles para el perfil revisor. Si la combinación ya tenía una `APROBADA`
// vigente, todas sus publicaciones activas quedan deshabilitadas y enlazadas a esta, con el motivo
// que el notificador escribió al pedir el reemplazo (ver `resolverReemplazo`).
export async function darVistoBueno(
  id: string,
  aprobadoPorId: string,
  dependencias: {
    repositorio: CargaArchivoRepository;
    lector: LectorArchivoReporte;
    repositorioSolicitudesReemplazo: SolicitudReemplazoCargaRepository;
    repositorioFormatosExcel: FormatoExcelRepository;
  },
): Promise<ResultadoDarVistoBueno> {
  const carga = await dependencias.repositorio.obtenerPorId(id);

  if (!carga) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  // Solo se puede aprobar una carga que el notificador ya finalizó y envió, y que nadie más ya
  // decidió: no distingue el motivo exacto (con errores, todavía no finalizada, ya aprobada o ya
  // rechazada), mismo criterio de no filtrar detalle interno que el resto del módulo.
  if (carga.estado !== "PENDIENTE_VISTO_BUENO" || carga.finalizadaEn === null) {
    return { ok: false, motivo: "NO_PENDIENTE" };
  }

  // Resuelto ANTES de la transacción: reparsear el binario no depende de la base de datos, y así
  // el `UPDATE`/`INSERT` atómico del repositorio no queda abierto mientras se procesa el archivo.
  // Ownership del contenido sigue siendo del notificador dueño de la carga (`carga.usuarioId`), no
  // de quien aprueba. El formato (RF-32, ver más abajo) es independiente del contenido, así que se
  // lee en paralelo.
  const [contenido, formato] = await Promise.all([
    dependencias.repositorio.obtenerContenidoParaProcesar(id, carga.usuarioId),
    dependencias.repositorioFormatosExcel.obtenerPorId(carga.formatoExcelId),
  ]);

  if (!contenido) {
    // Cierra la ventana de carrera entre la comprobación de arriba y esta lectura: la carga dejó
    // de existir entretanto.
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  const { filas: filasArchivo } = await dependencias.lector.leer(
    contenido.contenidoArchivo,
    contenido.tipoContenidoArchivo,
  );

  // RF-32: en formatos con la regla `FILA_VACIA`, las filas vacías del final (residuos de Excel)
  // no se validaron ni se contaron en `cantidadFilasDatos`, así que tampoco se publican: mismo
  // corte por `indiceUltimaFilaConDatos` que en `ValidarYCargarArchivo`. Sin la regla se publica
  // exactamente como antes (todas las filas leídas). Se usan las reglas VIGENTES del formato al
  // aprobar, no una copia de las del momento de la subida.
  const conReglaFilaVacia = formato?.reglasValidacion.some((regla) => regla.tipo === "FILA_VACIA") ?? false;
  const filasAPublicar = conReglaFilaVacia
    ? filasArchivo.slice(0, indiceUltimaFilaConDatos(filasArchivo) + 1)
    : filasArchivo;

  // Mismo desplazamiento que `ValidarYCargarArchivo`: la fila 1 es el encabezado, así que la
  // primera fila de datos es la 2. Cortar solo por el final no mueve esa numeración.
  const filas: FilaParaPublicar[] = filasAPublicar.map((valores, indice) => ({
    numeroFila: indice + 2,
    valores,
  }));

  // ¿La combinación (usuario, ventana) ya tenía una `APROBADA` vigente? Si sí, esta aprobación la
  // reemplaza: el repositorio desactiva TODAS las publicaciones activas de la combinación en la
  // misma transacción, llegue esta carga por solicitud de reemplazo o por reapertura tras un rechazo
  // de la carga de reemplazo (sin esto quedarían dos publicaciones activas).
  const reemplazo = await resolverReemplazo(id, carga, dependencias);

  const actualizada = await dependencias.repositorio.darVistoBueno(id, aprobadoPorId, { filas, reemplazo });

  if (!actualizada) {
    // Cierra la ventana de carrera entre la comprobación de arriba y el UPDATE condicional: otra
    // petición concurrente ya decidió esta carga entretanto.
    return { ok: false, motivo: "NO_PENDIENTE" };
  }

  return { ok: true, carga: actualizada };
}
