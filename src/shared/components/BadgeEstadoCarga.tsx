import type { EstadoCargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import {
  CLASES_EN_REEMPLAZO,
  CLASES_ESTADO,
  CLASES_REEMPLAZADA,
  ETIQUETAS_ESTADO,
  ETIQUETA_EN_REEMPLAZO,
  ETIQUETA_REEMPLAZADA,
} from "@/shared/utils/estadoCargaArchivo";

// Badge visual de un `EstadoCargaArchivo`, compartido entre `panel-carga-archivo.tsx` (notificador)
// y `TablaCargasVentana.tsx` (detalle de ventana de ADMIN/REVISOR_REPOSITORIO): un único componente
// evita que ambas vistas del mismo dato diverjan. `superada` (solo con sentido para una `APROBADA`
// cuya publicación fue desactivada por un reemplazo) muestra la variante "Reemplazada";
// `enReemplazo` (una `APROBADA` vigente con un reemplazo en curso), "Se solicita reemplazo".
export function BadgeEstadoCarga({
  estado,
  superada = false,
  enReemplazo = false,
}: {
  estado: EstadoCargaArchivo;
  superada?: boolean;
  enReemplazo?: boolean;
}) {
  const clases = superada ? CLASES_REEMPLAZADA : enReemplazo ? CLASES_EN_REEMPLAZO : CLASES_ESTADO[estado];
  const etiqueta = superada ? ETIQUETA_REEMPLAZADA : enReemplazo ? ETIQUETA_EN_REEMPLAZO : ETIQUETAS_ESTADO[estado];

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${clases}`}>
      {etiqueta}
    </span>
  );
}
