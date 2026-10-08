import type { CargaArchivo, DatosPublicacionCarga } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { SolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/domain/repositories/SolicitudReemplazoCargaRepository";

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
// `APROBADA`, se crea la cabecera de la publicación hacia el perfil revisor (RF-38: ya sin copiar filas
// ni releer el archivo; el revisor descarga la copia generada desde el original con la fecha de
// notificación). Si la combinación ya tenía una `APROBADA`
// vigente, todas sus publicaciones activas quedan deshabilitadas y enlazadas a esta, con el motivo
// que el notificador escribió al pedir el reemplazo (ver `resolverReemplazo`).
export async function darVistoBueno(
  id: string,
  aprobadoPorId: string,
  dependencias: {
    repositorio: CargaArchivoRepository;
    repositorioSolicitudesReemplazo: SolicitudReemplazoCargaRepository;
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

  // ¿La combinación (usuario, ventana) ya tenía una `APROBADA` vigente? Si sí, esta aprobación la
  // reemplaza: el repositorio desactiva TODAS las publicaciones activas de la combinación en la
  // misma transacción, llegue esta carga por solicitud de reemplazo o por reapertura tras un rechazo
  // de la carga de reemplazo (sin esto quedarían dos publicaciones activas).
  const reemplazo = await resolverReemplazo(id, carga, dependencias);

  const actualizada = await dependencias.repositorio.darVistoBueno(id, aprobadoPorId, { reemplazo });

  if (!actualizada) {
    // Cierra la ventana de carrera entre la comprobación de arriba y el UPDATE condicional: otra
    // petición concurrente ya decidió esta carga entretanto.
    return { ok: false, motivo: "NO_PENDIENTE" };
  }

  return { ok: true, carga: actualizada };
}
