import type { EstadoCargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";

// Etiqueta humana de cada estado de carga (RF-14), compartida entre "Mis cargas"
// (`panel-carga-archivo.tsx`) y el detalle de una carga propia (`DetalleCargaPropia.tsx`): un único
// lugar evita que ambas vistas del mismo dato diverjan.
export const ETIQUETAS_ESTADO: Record<EstadoCargaArchivo, string> = {
  CON_ERRORES: "Con errores",
  PENDIENTE_VISTO_BUENO: "Pendiente de visto bueno",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

// Clases Tailwind por estado, compartidas entre `panel-carga-archivo.tsx` y
// `shared/components/BadgeEstadoCarga.tsx`: un único lugar evita que la paleta de cada estado
// diverja entre vistas.
export const CLASES_ESTADO: Record<EstadoCargaArchivo, string> = {
  CON_ERRORES: "bg-gob-danger text-white border-gob-danger",
  PENDIENTE_VISTO_BUENO: "border-gob-tertiary text-gob-tertiary bg-white",
  APROBADA: "border-gob-primary text-gob-primary bg-white",
  RECHAZADA: "bg-gob-danger text-white border-gob-danger",
};
