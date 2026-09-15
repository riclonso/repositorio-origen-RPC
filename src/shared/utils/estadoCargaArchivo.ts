import type { EstadoCargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";

// Etiqueta humana de cada estado de carga (RF-14), compartida entre "Mis cargas"
// (`panel-carga-archivo.tsx`) y el detalle de una carga propia (`DetalleCargaPropia.tsx`): un único
// lugar evita que ambas vistas del mismo dato diverjan.
export const ETIQUETAS_ESTADO: Record<EstadoCargaArchivo, string> = {
  CON_ERRORES: "Con errores",
  PENDIENTE_VISTO_BUENO: "Pendiente de visto bueno",
  APROBADA: "Aprobada",
};
