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
  AVISO_ENVIADO: { texto: "Aviso enviado", clase: "bg-blue-100 border-gob-primary text-gob-primary" },
  CON_ERRORES: { texto: "Con errores en el envío", clase: "bg-red-100 border-gob-danger text-gob-danger" },
  NO_CONFIGURADA: { texto: "Alertas no configuradas", clase: "bg-gray-100 border-gob-gray-a text-gob-gray-a" },
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
    <article className="flex flex-col gap-4 rounded-xl border border-[#dce6f0] bg-white p-5 shadow-[0_8px_22px_rgba(23,59,105,0.05)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(23,59,105,0.1)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#58738e]">Formato de archivo</p>
          <h3 className="mt-1 text-base font-bold text-gob-tertiary">{resumen.formatoExcelNombre}</h3>
          <p className="mt-1 text-sm text-gob-gray-a">Período {resumen.anio}</p>
        </div>
        {badgeAlerta ? (
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${badgeAlerta.clase}`}
          >
            {badgeAlerta.texto}
          </span>
        ) : null}
      </div>

      <GraficoTortaProporcion
        completado={resumen.totalNotificadoresReportaron}
        total={resumen.totalNotificadoresAsignados}
      />

      <div className="border-y border-[#e6edf5] py-3 text-sm font-medium text-gob-black">
        <span className="text-gob-primary font-bold tabular-nums">{resumen.totalNotificadoresReportaron}</span> de{" "}
        <span className="text-gob-primary font-bold tabular-nums">{resumen.totalNotificadoresAsignados}</span> notificadores
        reportaron
      </div>

      <div className="rounded-lg bg-[#f5f8fb] p-3">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-[#58738e]">
          <span>Plazo de la ventana</span>
          <span className={resumen.vencimientoProximo ? "text-gob-danger" : "text-gob-primary"}>
            {resumen.diasRestantes} {resumen.diasRestantes === 1 ? "día" : "días"}
          </span>
        </div>
        <BarraProgresoVentana
          fraccionTiempoTranscurrido={resumen.fraccionTiempoTranscurrido}
          enRiesgo={resumen.vencimientoProximo}
        />
        <p className={`mt-2 text-sm font-semibold ${resumen.vencimientoProximo ? "text-gob-danger" : "text-gob-black"}`}>
          Vence el {formatearFechaCalendario(resumen.fechaVencimiento)}{" "}
          <span className={`${resumen.vencimientoProximo ? "text-gob-danger" : "text-gob-gray-a"}`}>
            · {resumen.diasRestantes} {resumen.diasRestantes === 1 ? "día restante" : "días restantes"}
          </span>
        </p>
      </div>

      <Link
        href={`${rutaBase}/${resumen.ventanaCargaId}?origen=inicio`}
        className="inline-flex w-fit items-center rounded-md bg-[#e8f2fb] px-3 py-2 text-sm font-semibold text-gob-primary transition-colors hover:bg-[#d9ebf9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
      >
        Revisar ventana <span aria-hidden="true" className="ml-1">→</span>
      </Link>
    </article>
  );
}
