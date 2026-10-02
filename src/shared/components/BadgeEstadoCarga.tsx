import type { EstadoCargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { CLASES_ESTADO, ETIQUETAS_ESTADO } from "@/shared/utils/estadoCargaArchivo";

// Badge visual de un `EstadoCargaArchivo`, compartido entre `panel-carga-archivo.tsx` (notificador)
// y `TablaCargasVentana.tsx` (detalle de ventana de ADMIN/REVISOR_REPOSITORIO): un único componente
// evita que ambas vistas del mismo dato diverjan.
export function BadgeEstadoCarga({ estado }: { estado: EstadoCargaArchivo }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${CLASES_ESTADO[estado]}`}
    >
      {ETIQUETAS_ESTADO[estado]}
    </span>
  );
}
