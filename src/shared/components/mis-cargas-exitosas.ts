import type {
  CargaArchivoResumenPropia,
  GrupoCargaAprobada,
  TipoDesactivacionCargaPublicada,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { formatearFechaHora } from "@/shared/utils/fecha";

// Mapeo de dominio -> vista para "Mis cargas" (histórico de exitosas del notificador). Vive en un
// módulo sin "use client" a propósito: `ListadoMisCargasExitosas.tsx` (Server Component) necesita
// invocar `aGrupoCargaExitosaVista` directamente, y una función exportada desde un archivo
// "use client" (como `TablaMisCargasExitosas.tsx`) solo puede renderizarse como componente, nunca
// llamarse desde el servidor. `TablaMisCargasExitosas.tsx` importa los tipos de aquí para tipar sus
// props, sin declarar la función.

// Vista liviana de una fila de carga (vigente o reemplazada): fecha ya formateada en el servidor.
// `motivo`/`motivoTipo` no nulos cuando esta carga dejó de ser la vigente de su combinación
// (formato, ventana), sea porque fue reemplazada por una solicitud consentida o rechazada (ver
// `CargaArchivoResumenPropia` en el dominio para de dónde sale cada fuente). Siempre `null` en la
// vigente de un grupo, salvo el caso borde de una `RECHAZADA` que todavía no tiene sucesora (sigue
// siendo la "vigente" de su grupo, ahora con el motivo de su propio rechazo).
export type FilaCargaExitosaVista = {
  id: string;
  nombreArchivoOriginal: string;
  vistoBuenoEl: string;
  motivo: string | null;
  motivoTipo: TipoDesactivacionCargaPublicada | null;
  // Fecha del rechazo/reemplazo (`CargaArchivoResumenPropia.desactivadaEn`), ya formateada. La
  // tabla de reemplazadas ("Mis cargas") la usa en la columna "Reemplazada el" en vez de
  // `vistoBuenoEl`: esa columna debe decir cuándo dejó de ser vigente, no cuándo se había aprobado
  // originalmente.
  desactivadaEl: string | null;
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

function aFilaCargaExitosaVista(carga: CargaArchivoResumenPropia): FilaCargaExitosaVista {
  return {
    id: carga.id,
    nombreArchivoOriginal: carga.nombreArchivoOriginal,
    vistoBuenoEl: carga.vistoBuenoEn ? formatearFechaHora(carga.vistoBuenoEn) : "—",
    motivo: carga.motivoDesactivacion,
    motivoTipo: carga.motivoDesactivacionTipo,
    desactivadaEl: carga.desactivadaEn ? formatearFechaHora(carga.desactivadaEn) : null,
  };
}

export function aGrupoCargaExitosaVista(grupo: GrupoCargaAprobada<CargaArchivoResumenPropia>): GrupoCargaExitosaVista {
  return {
    ventanaCargaId: grupo.vigente.ventanaCargaId,
    formatoExcelId: grupo.vigente.formatoExcelId,
    formatoExcelNombre: grupo.vigente.formatoExcelNombre,
    anio: grupo.vigente.anio,
    vigente: aFilaCargaExitosaVista(grupo.vigente),
    reemplazadas: grupo.reemplazadas.map(aFilaCargaExitosaVista),
  };
}
