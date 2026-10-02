import type { EstadoCargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import {
  CLASES_ESTADO,
  CLASES_REEMPLAZADA,
  ETIQUETAS_ESTADO,
  ETIQUETA_REEMPLAZADA,
} from "@/shared/utils/estadoCargaArchivo";

// Badge visual de un `EstadoCargaArchivo`, compartido entre `panel-carga-archivo.tsx` (notificador)
// y `TablaCargasVentana.tsx` (detalle de ventana de ADMIN/REVISOR_REPOSITORIO): un único componente
// evita que ambas vistas del mismo dato diverjan. `superada` (solo con sentido para una `APROBADA`
// cuya publicación fue desactivada por un reemplazo) muestra la variante "Reemplazada".
export function BadgeEstadoCarga({ estado, superada = false }: { estado: EstadoCargaArchivo; superada?: boolean }) {
  const clases = superada ? CLASES_REEMPLAZADA : CLASES_ESTADO[estado];
  const etiqueta = superada ? ETIQUETA_REEMPLAZADA : ETIQUETAS_ESTADO[estado];

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${clases}`}>
      {etiqueta}
    </span>
  );
}
