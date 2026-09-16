import Link from "next/link";
import { BarraProgresoVentana } from "@/shared/components/BarraProgresoVentana";
import { GraficoTortaProporcion } from "@/shared/components/GraficoTortaProporcion";
import { formatearFechaCalendario } from "@/shared/utils/fecha";
import type {
  EstadoAlertaVentana,
  ResumenSeguimientoVentanaCarga,
} from "@/modules/ventanas-carga/domain/entities/ResumenSeguimientoVentana";

// RF-17: badge de estado de alertas. `null` (configurada, sin envíos todavía) no pinta nada: no
// hay nada útil que decirle al administrador todavía.
const BADGE_ESTADO_ALERTA: Record<Exclude<EstadoAlertaVentana, null>, { texto: string; clase: string }> = {
  AVISO_ENVIADO: { texto: "Aviso enviado", clase: "border-gob-primary text-gob-primary" },
  CON_ERRORES: { texto: "Con errores en el envío", clase: "border-gob-danger text-gob-danger" },
  NO_CONFIGURADA: { texto: "Alertas no configuradas", clase: "border-gob-gray-a text-gob-gray-a" },
};

// Tarjeta del tablero de seguimiento (RF-16), una por cada ventana de carga ABIERTA. Compartida
// entre `/dashboard` y `/revisor` (mismo patrón que `ListadoVentanasCarga`/`TablaFormatosExcel`).
// Server Component puro: no hay interacción ni estado propio.
type TarjetaSeguimientoVentanaProps = {
  resumen: ResumenSeguimientoVentanaCarga;
  // Base de la ruta de detalle de la ventana de carga; cada área aporta la suya
  // (`/dashboard/ventanas-carga` o `/revisor/ventanas-carga`), mismo criterio que `rutaBase` en
  // `ListadoVentanasCarga`/`ListadoCargasAprobadas`.
  rutaBase: string;
};

export function TarjetaSeguimientoVentana({ resumen, rutaBase }: TarjetaSeguimientoVentanaProps) {
  const badgeAlerta = resumen.estadoAlerta ? BADGE_ESTADO_ALERTA[resumen.estadoAlerta] : null;

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-gob-accent bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gob-tertiary">{resumen.formatoExcelNombre}</h3>
          <p className="text-sm text-gob-gray-a">Año {resumen.anio}</p>
        </div>
        {badgeAlerta ? (
          <span
            className={`inline-flex shrink-0 items-center rounded-full border bg-white px-2 py-0.5 text-xs font-semibold ${badgeAlerta.clase}`}
          >
            {badgeAlerta.texto}
          </span>
        ) : null}
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

      <Link
        href={`${rutaBase}/${resumen.ventanaCargaId}?origen=inicio`}
        className="text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
      >
        Detalle
      </Link>
    </article>
  );
}
