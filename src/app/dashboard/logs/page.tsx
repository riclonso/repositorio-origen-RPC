import type { Metadata } from "next";
import Link from "next/link";
import {
  leerLog,
  leerErroresPersistentes,
  esTipoLog,
  esFechaValida,
  normalizarTamano,
  type EntradaLog,
  type TipoLog,
} from "@/infrastructure/logging/leerLogs";
import { BotonActualizar } from "./boton-actualizar";
import { FiltrosLogs } from "./filtros-logs";
import { PaginacionLogs } from "./paginacion-logs";
import { construirRutaLogs } from "./ruta-logs";

function unicoParametro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export const metadata: Metadata = {
  title: "Registros del sistema - Repositorio RPC - SEREMI de Salud Biobío",
};

// Los logs se leen del disco en cada visita: la página nunca debe prerenderizarse ni cachearse.
export const dynamic = "force-dynamic";

const PESTANAS: { tipo: TipoLog; etiqueta: string; descripcion: string }[] = [
  {
    tipo: "errores",
    etiqueta: "Errores del sistema",
    descripcion: "Fallas técnicas registradas: excepciones, errores de base de datos y envíos fallidos.",
  },
  {
    tipo: "auditoria",
    etiqueta: "Auditoría",
    descripcion: "Operaciones sobre usuarios e intentos de recuperación: quién hizo qué y con qué resultado.",
  },
];

const formatoFecha = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Santiago",
});

function formatearFecha(iso: string | null): string {
  if (!iso) return "Sin fecha";
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? iso : formatoFecha.format(fecha);
}

type LogsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LogsPage({ searchParams }: LogsPageProps) {
  const parametros = await searchParams;
  const tipoCrudo = unicoParametro(parametros.tipo);
  // Modo tolerante: un `?tipo=` inválido o ausente cae a "errores" en vez de romper la pantalla.
  const tipo: TipoLog = esTipoLog(tipoCrudo) ? tipoCrudo : "errores";

  // Fechas del rango: una fecha mal formada se ignora en silencio (modo tolerante), no rompe.
  const desdeCrudo = unicoParametro(parametros.desde);
  const hastaCrudo = unicoParametro(parametros.hasta);
  const desde = esFechaValida(desdeCrudo) ? desdeCrudo : undefined;
  const hasta = esFechaValida(hastaCrudo) ? hastaCrudo : undefined;

  // Tamaño de página (25/50/100) y página, ambos tolerantes: un valor inválido cae al defecto.
  const tamano = normalizarTamano(unicoParametro(parametros.tamano));
  const paginaCruda = Number(unicoParametro(parametros.pagina));
  const paginaSolicitada = Number.isFinite(paginaCruda) && paginaCruda >= 1 ? paginaCruda : 1;

  const activa = PESTANAS.find((p) => p.tipo === tipo)!;
  const filtro = {
    desde,
    hasta,
    pagina: paginaSolicitada,
    tamano,
  };
  const { entradas, total, pagina, totalPaginas } = tipo === "errores"
    ? await leerErroresPersistentes(filtro)
    : await leerLog(tipo, filtro);
  const hayFiltro = desde !== undefined || hasta !== undefined;

  return (
    <div className="mx-auto w-full max-w-7xl pb-6">
      <header className="relative overflow-hidden rounded-2xl border border-[#dbe6f0] bg-white px-5 py-5 shadow-[0_14px_32px_rgba(23,59,105,0.06)] sm:px-7 sm:py-6">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-gob-primary" aria-hidden="true" />
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.14em] text-gob-primary">ADMINISTRACIÓN · MONITOREO</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-balance text-2xl font-semibold tracking-tight text-gob-tertiary">Registros del sistema</h1>
              <span className="inline-flex items-center rounded-md bg-gob-tertiary px-2.5 py-1 font-mono text-xs font-semibold tabular-nums text-white">
                {total} {total === 1 ? "registro" : "registros"}
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gob-gray-a">{activa.descripcion}</p>
          </div>
          <BotonActualizar />
        </div>
      </header>

      <section aria-label="Controles del registro" className="mt-5 rounded-2xl border border-[#dbe6f0] bg-white p-3 shadow-[0_10px_26px_rgba(23,59,105,0.04)] sm:p-4">
        <div role="tablist" aria-label="Tipo de registro" className="flex w-full flex-wrap gap-1 rounded-xl bg-[#eef4f8] p-1.5">
          {PESTANAS.map((pestana) => {
            const seleccionada = pestana.tipo === tipo;
            return (
              <Link
                key={pestana.tipo}
                href={construirRutaLogs({ tipo: pestana.tipo, desde, hasta })}
                role="tab"
                aria-selected={seleccionada}
                className={`rounded-lg px-4 py-2 text-sm transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary ${
                  seleccionada
                    ? "bg-white font-semibold text-gob-tertiary shadow-sm ring-1 ring-[#d5e1ec]"
                    : "font-medium text-gob-gray-a hover:bg-white/70 hover:text-gob-tertiary"
                }`}
              >
                {pestana.etiqueta}
              </Link>
            );
          })}
        </div>

        {/* La `key` remonta el formulario cuando cambia el filtro o la pestaña, para que los
            campos de fecha reflejen la URL vigente. */}
        <FiltrosLogs
          key={`${tipo}:${desde ?? ""}:${hasta ?? ""}`}
          tipo={tipo}
          desdeInicial={desde ?? ""}
          hastaInicial={hasta ?? ""}
        />
      </section>

      <p className="mt-4 sr-only" role="status" aria-live="polite">
        {total === 0
          ? hayFiltro
            ? "Ningún registro en el rango de fechas seleccionado."
            : "Sin registros."
          : `${total} ${total === 1 ? "registro" : "registros"}${hayFiltro ? " en el rango" : ""}, del más reciente al más antiguo.`}
      </p>

      {total === 0 ? (
        <section className="mt-5 rounded-2xl border border-dashed border-gob-accent bg-white px-6 py-12 text-center">
          <p className="text-sm font-semibold text-gob-tertiary">No hay registros para mostrar</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-gob-gray-a">
            {hayFiltro
              ? "No hay registros en el rango de fechas seleccionado. Ajusta el período para ampliar la búsqueda."
              : "Los registros aparecerán aquí cuando el sistema genere actividad."}
          </p>
        </section>
      ) : (
        <>
          <PaginacionLogs
            tipo={tipo}
            desde={desde}
            hasta={hasta}
            tamano={tamano}
            pagina={pagina}
            total={total}
            totalPaginas={totalPaginas}
          />

          <ul className="mt-4 flex flex-col gap-2.5" aria-label="Entradas de registro">
            {entradas.map((entrada) => (
              <li key={entrada.indice}>
                <EntradaLogItem tipo={tipo} entrada={entrada} formatear={formatearFecha} />
              </li>
            ))}
          </ul>

          {/* La paginación se repite abajo: tras recorrer una página larga, el control queda a
              mano sin volver arriba. */}
          <PaginacionLogs
            tipo={tipo}
            desde={desde}
            hasta={hasta}
            tamano={tamano}
            pagina={pagina}
            total={total}
            totalPaginas={totalPaginas}
          />
        </>
      )}
    </div>
  );
}

function EntradaLogItem({
  tipo,
  entrada,
  formatear,
}: {
  tipo: TipoLog;
  entrada: EntradaLog;
  formatear: (iso: string | null) => string;
}) {
  const esError = tipo === "errores";
  // El detalle largo (stack de error, o el volcado de campos de auditoría) va en un <details>
  // nativo: colapsable sin JavaScript y accesible por teclado.
  const detalle = JSON.stringify(entrada.campos, null, 2);
  const tieneDetalle = entrada.crudo !== null || Object.keys(entrada.campos).length > 0;

  return (
    <article className={`group overflow-hidden rounded-xl border bg-white shadow-[0_6px_18px_rgba(23,59,105,0.035)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-[0_12px_24px_rgba(23,59,105,0.08)] ${
      esError ? "border-l-4 border-y-[#f0d0d0] border-r-[#f0d0d0] border-l-gob-danger" : "border-l-4 border-y-[#dbe6f0] border-r-[#dbe6f0] border-l-gob-primary"
    }`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5">
        <span
          className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold tracking-wide ${
            esError
              ? "border-gob-danger/30 bg-gob-danger/5 text-gob-danger"
              : "border-gob-primary/30 bg-gob-primary/5 text-gob-primary"
          }`}
        >
          {esError ? "Error" : etiquetaResultado(entrada.campos)}
        </span>
        <span className="rounded bg-[#f3f6f8] px-2 py-1 font-mono text-[11px] tabular-nums text-gob-gray-a">{formatear(entrada.timestamp)}</span>
        <p className="min-w-0 flex-1 text-sm font-medium leading-5 text-gob-tertiary sm:truncate">
          {resumen(tipo, entrada)}
        </p>
      </div>

      {tieneDetalle ? (
        <details className="border-t border-[#e3ebf2]">
          <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold text-gob-primary transition-colors hover:bg-[#f6f9fb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary">
            Ver detalle técnico
          </summary>
          <pre className="overflow-x-auto bg-[#10223b] px-4 py-3 font-mono text-xs leading-relaxed text-[#e8f0f7]">
            {entrada.crudo ?? detalle}
          </pre>
        </details>
      ) : null}
    </article>
  );
}

// Para auditoría, el resultado (EXITO / RECHAZADO / SIN_EFECTO) es lo primero que interesa.
function etiquetaResultado(campos: Record<string, unknown>): string {
  const resultado = campos.resultado;
  return typeof resultado === "string" ? resultado : "Info";
}

function resumen(tipo: TipoLog, entrada: EntradaLog): string {
  if (entrada.crudo !== null) return "Registro sin formato";
  if (tipo === "errores") return entrada.mensaje ?? "Error sin mensaje";

  // Auditoría: componer una línea legible con los campos que existan.
  const accion = typeof entrada.campos.accion === "string" ? entrada.campos.accion : "Evento";
  const motivo = typeof entrada.campos.motivo === "string" ? ` (${entrada.campos.motivo})` : "";
  const actor = typeof entrada.campos.actorRut === "string" ? ` por ${entrada.campos.actorRut}` : "";
  return `${accion}${motivo}${actor}`;
}
