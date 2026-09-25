import Link from "next/link";
import { obtenerResumenSeguimientoVentanasAbiertas } from "@/modules/ventanas-carga/application/use-cases/ObtenerResumenSeguimientoVentanasAbiertas";
import type { ResumenSeguimientoVentanaCarga } from "@/modules/ventanas-carga/domain/entities/ResumenSeguimientoVentana";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { prismaAlertaNotificacionRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaAlertaNotificacionRepository";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { formatearFechaCalendario } from "@/shared/utils/fecha";
import { IconoCalendario, IconoPlazo } from "@/shared/components/iconos";

type InicioRevisorProps = {
  nombres: string;
};

function calcularPorcentaje(resumen: ResumenSeguimientoVentanaCarga): number {
  if (resumen.totalNotificadoresAsignados === 0) return 0;

  return Math.round((resumen.totalNotificadoresReportaron / resumen.totalNotificadoresAsignados) * 100);
}

function textoPlazo(resumen: ResumenSeguimientoVentanaCarga): string {
  if (resumen.diasRestantes === 0) return "Vence hoy";
  if (resumen.diasRestantes === 1) return "Vence mañana";
  return `${resumen.diasRestantes} días restantes`;
}

function ordenarParaRevision(resumenes: ResumenSeguimientoVentanaCarga[]): ResumenSeguimientoVentanaCarga[] {
  return [...resumenes].sort((primera, segunda) => {
    if (primera.vencimientoProximo !== segunda.vencimientoProximo) {
      return primera.vencimientoProximo ? -1 : 1;
    }

    return primera.diasRestantes - segunda.diasRestantes;
  });
}

// Inicio propio del rol REVISOR_REPOSITORIO. No reutiliza el tablero administrativo: este rol
// necesita decidir qué revisar primero, por lo que prioriza los plazos y expone un único resumen
// operativo antes de las tarjetas de cada ventana.
export async function InicioRevisor({ nombres }: InicioRevisorProps) {
  const resumenes = await obtenerResumenSeguimientoVentanasAbiertas({
    repositorioVentanas: prismaVentanaCargaRepository,
    repositorioFormatos: prismaFormatoExcelRepository,
    repositorioCargas: prismaCargaArchivoRepository,
    repositorioAlertas: prismaAlertaNotificacionRepository,
  });
  const resumenesOrdenados = ordenarParaRevision(resumenes);
  const totalAsignados = resumenes.reduce((total, resumen) => total + resumen.totalNotificadoresAsignados, 0);
  const totalReportaron = resumenes.reduce((total, resumen) => total + resumen.totalNotificadoresReportaron, 0);
  const ventanasUrgentes = resumenes.filter((resumen) => resumen.vencimientoProximo).length;
  const porcentajeGeneral = totalAsignados === 0 ? 0 : Math.round((totalReportaron / totalAsignados) * 100);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 pb-8">
      <header className="grid gap-5 border-b border-[#cbd9e7] pb-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gob-primary">Inicio · Revisión de repositorio</p>
          <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight text-gob-tertiary md:text-4xl">
            Centro de revisión, {nombres}
          </h1>
          <p className="mt-3 text-pretty text-base leading-relaxed text-gob-gray-a">
            Prioriza las ventanas próximas a vencer y revisa el avance de los reportes recibidos.
          </p>
        </div>
        <p className="border-l-2 border-gob-primary pl-3 text-sm font-medium leading-relaxed text-[#45617d]">
          Estado de las ventanas<br />
          <span className="font-semibold text-gob-tertiary">al momento de la consulta</span>
        </p>
      </header>

      <section aria-label="Resumen de revisión" className="grid gap-3 md:grid-cols-3">
        <article className="rounded-xl border border-[#d8e4f0] bg-white p-5 shadow-[0_8px_22px_rgba(23,59,105,0.05)]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#58738e]">Ventanas activas</p>
          <p className="mt-3 text-4xl font-bold tracking-tight tabular-nums text-gob-tertiary">{resumenes.length}</p>
          <p className="mt-2 text-sm leading-relaxed text-gob-gray-a">Períodos de carga disponibles para seguimiento.</p>
        </article>

        <article className="rounded-xl border border-[#d8e4f0] bg-white p-5 shadow-[0_8px_22px_rgba(23,59,105,0.05)]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#58738e]">Reportes recibidos</p>
          <p className="mt-3 text-4xl font-bold tracking-tight tabular-nums text-gob-tertiary">
            {totalReportaron}<span className="text-xl font-medium text-[#6c8197]"> / {totalAsignados}</span>
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e4ebf2]">
            <div className="h-full rounded-full bg-gob-primary" style={{ width: `${porcentajeGeneral}%` }} />
          </div>
          <p className="mt-2 text-sm text-gob-gray-a">{porcentajeGeneral}% de notificadores con carga aprobada.</p>
        </article>

        <article className={`rounded-xl border bg-white p-5 shadow-[0_8px_22px_rgba(23,59,105,0.05)] ${ventanasUrgentes > 0 ? "border-[#efcaca]" : "border-[#d8e4f0]"}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#58738e]">Plazos próximos</p>
          <p className={`mt-3 text-4xl font-bold tracking-tight tabular-nums ${ventanasUrgentes > 0 ? "text-gob-danger" : "text-gob-tertiary"}`}>
            {ventanasUrgentes}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gob-gray-a">
            {ventanasUrgentes === 1
              ? "Ventana con vencimiento próximo."
              : ventanasUrgentes > 1
                ? "Ventanas que requieren atención prioritaria."
                : "No hay vencimientos próximos."}
          </p>
        </article>
      </section>

      <section aria-labelledby="titulo-ventanas" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gob-primary">Seguimiento por formato</p>
            <h2 id="titulo-ventanas" className="mt-1 text-2xl font-bold tracking-tight text-gob-tertiary">
              Ventanas en curso
            </h2>
          </div>
          {resumenes.length > 0 ? <p className="text-sm text-gob-gray-a">Ordenadas por proximidad de vencimiento</p> : null}
        </div>

        {resumenesOrdenados.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gob-accent bg-white px-6 py-10">
            <p className="text-base font-semibold text-gob-tertiary">No hay ventanas de carga activas</p>
            <p className="mt-1 text-sm text-gob-gray-a">Cuando se habilite una ventana, podrás revisarla desde este espacio.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {resumenesOrdenados.map((resumen) => {
              const porcentaje = calcularPorcentaje(resumen);

              return (
                <article
                  key={resumen.ventanaCargaId}
                  className={`flex min-h-76 flex-col rounded-xl border bg-white p-5 shadow-[0_8px_22px_rgba(23,59,105,0.05)] ${
                    resumen.vencimientoProximo ? "border-[#ebc7c7]" : "border-[#d8e4f0]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#58738e]">Formato de archivo · {resumen.anio}</p>
                      <h3 className="mt-2 truncate text-lg font-bold tracking-tight text-gob-tertiary" title={resumen.formatoExcelNombre}>
                        {resumen.formatoExcelNombre}
                      </h3>
                    </div>
                    <span className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ${resumen.vencimientoProximo ? "bg-[#fceeee] text-gob-danger" : "bg-[#eaf5ef] text-gob-success"}`}>
                      {resumen.vencimientoProximo ? "Prioridad" : "En plazo"}
                    </span>
                  </div>

                  <div className="mt-7">
                    <div className="flex items-end gap-2">
                      <p className="text-4xl font-bold tracking-tight tabular-nums text-gob-tertiary">{resumen.totalNotificadoresReportaron}</p>
                      <p className="pb-1 text-sm text-[#58738e]">de {resumen.totalNotificadoresAsignados} notificadores</p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e4ebf2]">
                      <div className="h-full rounded-full bg-gob-primary" style={{ width: `${porcentaje}%` }} />
                    </div>
                    <p className="mt-2 text-sm font-medium text-gob-gray-a">{porcentaje}% con carga aprobada</p>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#e6edf5] pt-4">
                    <div className="flex min-w-0 items-center gap-2 text-xs font-semibold whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[#45617d]">
                        <IconoCalendario className="shrink-0 text-gob-primary" />
                        Cierre: {formatearFechaCalendario(resumen.fechaVencimiento)}
                      </span>
                      <span className={`inline-flex items-center gap-1 ${resumen.vencimientoProximo ? "text-gob-danger" : "text-gob-success"}`}>
                        <IconoPlazo className="shrink-0" />
                        {textoPlazo(resumen)}
                      </span>
                    </div>
                    <Link
                      href={`/revisor/ventanas-carga/${resumen.ventanaCargaId}?origen=inicio`}
                      className="inline-flex shrink-0 items-center rounded-md bg-[#e8f2fb] px-2.5 py-1.5 text-xs font-semibold text-gob-primary transition-colors hover:bg-[#d9ebf9] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
                    >
                      Revisar <span aria-hidden="true" className="ml-1">→</span>
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
