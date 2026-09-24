import type { GrupoCargaAprobada } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { formatearFechaHora } from "@/shared/utils/fecha";

// Mapeo de dominio -> vista para "Mis cargas" (histórico de exitosas del notificador). Vive en un
// módulo sin "use client" a propósito: `ListadoMisCargasExitosas.tsx` (Server Component) necesita
// invocar `aGrupoCargaExitosaVista` directamente, y una función exportada desde un archivo
// "use client" (como `TablaMisCargasExitosas.tsx`) solo puede renderizarse como componente, nunca
// llamarse desde el servidor. `TablaMisCargasExitosas.tsx` importa los tipos de aquí para tipar sus
// props, sin declarar la función.

// Vista liviana de una fila de carga (vigente o reemplazada): fecha ya formateada en el servidor.
// `rechazo` no nulo cuando esta carga fue rechazada unilateralmente tras su aprobación (ver
// `CargaArchivoRepository.listarPropiasAprobadas`, que incluye `RECHAZADA` en el histórico).
export type FilaCargaExitosaVista = {
  id: string;
  nombreArchivoOriginal: string;
  vistoBuenoEl: string;
  rechazo: { motivo: string; rechazadoEl: string } | null;
};

// Un grupo por `ventanaCargaId`: la vigente es la fila principal, las reemplazadas quedan como
// historial anidado dentro de esa misma fila (nunca como filas sueltas).
export type GrupoCargaExitosaVista = {
  ventanaCargaId: string;
  formatoExcelId: string;
  formatoExcelNombre: string;
  anio: number;
  vigente: FilaCargaExitosaVista;
  reemplazadas: FilaCargaExitosaVista[];
};

function aFilaCargaExitosaVista(carga: GrupoCargaAprobada["vigente"]): FilaCargaExitosaVista {
  return {
    id: carga.id,
    nombreArchivoOriginal: carga.nombreArchivoOriginal,
    vistoBuenoEl: carga.vistoBuenoEn ? formatearFechaHora(carga.vistoBuenoEn) : "—",
    rechazo: carga.rechazo
      ? { motivo: carga.rechazo.motivo, rechazadoEl: formatearFechaHora(carga.rechazo.rechazadoEn) }
      : null,
  };
}

export function aGrupoCargaExitosaVista(grupo: GrupoCargaAprobada): GrupoCargaExitosaVista {
  return {
    ventanaCargaId: grupo.vigente.ventanaCargaId,
    formatoExcelId: grupo.vigente.formatoExcelId,
    formatoExcelNombre: grupo.vigente.formatoExcelNombre,
    anio: grupo.vigente.anio,
    vigente: aFilaCargaExitosaVista(grupo.vigente),
    reemplazadas: grupo.reemplazadas.map(aFilaCargaExitosaVista),
  };
}
