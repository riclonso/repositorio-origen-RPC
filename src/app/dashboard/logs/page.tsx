import type { Metadata } from "next";
import Link from "next/link";
import {
  leerLog,
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
  const { entradas, total, pagina, totalPaginas } = await leerLog(tipo, {
    desde,
    hasta,
    pagina: paginaSolicitada,
    tamano,
  });
  const hayFiltro = desde !== undefined || hasta !== undefined;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gob-black">Registros del sistema</h1>
          <p className="mt-2 max-w-prose text-sm text-gob-gray-a">{activa.descripcion}</p>
        </div>
        <BotonActualizar />
      </div>

      <div role="tablist" aria-label="Tipo de registro" className="mt-6 flex flex-wrap gap-1 border-b border-gob-accent">
        {PESTANAS.map((pestana) => {
          const seleccionada = pestana.tipo === tipo;
          return (
            <Link
              key={pestana.tipo}
              href={construirRutaLogs({ tipo: pestana.tipo, desde, hasta })}
              role="tab"
              aria-selected={seleccionada}
              className={`-mb-px rounded-t-md border-b-2 px-4 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary ${
                seleccionada
                  ? "border-gob-primary font-semibold text-gob-tertiary"
                  : "border-transparent font-medium text-gob-gray-a hover:bg-gob-neutral"
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

      <p className="mt-4 sr-only" role="status" aria-live="polite">
        {total === 0
          ? hayFiltro
            ? "Ningún registro en el rango de fechas seleccionado."
            : "Sin registros."
          : `${total} ${total === 1 ? "registro" : "registros"}${hayFiltro ? " en el rango" : ""}, del más reciente al más antiguo.`}
      </p>

      {total === 0 ? (
        <div className="card-sistema mt-4 p-8 text-center text-sm text-gob-gray-a">
          {hayFiltro
            ? "No hay registros en el rango de fechas seleccionado."
            : "No hay registros para mostrar todavía."}
        </div>
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

          <ul className="mt-4 flex flex-col gap-2">
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
    <div className="card-sistema overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
            esError
              ? "border-gob-danger bg-white text-gob-danger"
              : "border-gob-primary bg-white text-gob-primary"
          }`}
        >
          {esError ? "Error" : etiquetaResultado(entrada.campos)}
        </span>
        <span className="tabular-nums text-xs text-gob-gray-a">{formatear(entrada.timestamp)}</span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gob-black">
          {resumen(tipo, entrada)}
        </p>
      </div>

      {tieneDetalle ? (
        <details className="border-t border-gob-accent/60">
          <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-gob-primary hover:bg-gob-neutral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary">
            Ver detalle
          </summary>
          <pre className="overflow-x-auto bg-gob-neutral px-4 py-3 font-mono text-xs leading-relaxed text-gob-black">
            {entrada.crudo ?? detalle}
          </pre>
        </details>
      ) : null}
    </div>
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
