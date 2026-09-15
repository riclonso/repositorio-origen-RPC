import { BarraProgresoVentana } from "@/shared/components/BarraProgresoVentana";
import { GraficoTortaProporcion } from "@/shared/components/GraficoTortaProporcion";
import { formatearFechaCalendario } from "@/shared/utils/fecha";
import type { ResumenSeguimientoVentanaCarga } from "@/modules/ventanas-carga/domain/entities/ResumenSeguimientoVentana";

// Tarjeta del tablero de seguimiento (RF-16), una por cada ventana de carga ABIERTA. Compartida
// entre `/dashboard` y `/revisor` (mismo patrón que `ListadoVentanasCarga`/`TablaFormatosExcel`).
// Server Component puro: no hay interacción ni estado propio.
type TarjetaSeguimientoVentanaProps = {
  resumen: ResumenSeguimientoVentanaCarga;
};

export function TarjetaSeguimientoVentana({ resumen }: TarjetaSeguimientoVentanaProps) {
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-gob-accent bg-white p-4">
      <div>
        <h3 className="text-base font-semibold text-gob-tertiary">{resumen.formatoExcelNombre}</h3>
        <p className="text-sm text-gob-gray-a">Año {resumen.anio}</p>
      </div>

      <GraficoTortaProporcion
        completado={resumen.totalNotificadoresReportaron}
        total={resumen.totalNotificadoresAsignados}
      />

      <p className="text-sm text-gob-gray-a">
        {resumen.totalNotificadoresReportaron} de {resumen.totalNotificadoresAsignados} notificadores
        reportaron
      </p>

      <div className="flex flex-col gap-1.5">
        <BarraProgresoVentana
          fraccionTiempoTranscurrido={resumen.fraccionTiempoTranscurrido}
          enRiesgo={resumen.vencimientoProximo}
        />
        <p className={`text-sm ${resumen.vencimientoProximo ? "font-medium text-gob-danger" : "text-gob-gray-a"}`}>
          Vence el {formatearFechaCalendario(resumen.fechaVencimiento)} · {resumen.diasRestantes}{" "}
          {resumen.diasRestantes === 1 ? "día restante" : "días restantes"}
        </p>
      </div>
    </article>
  );
}
