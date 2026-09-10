import Link from "next/link";
import { TAMANOS_PAGINA, type TamanoPagina, type TipoLog } from "@/infrastructure/logging/leerLogs";
import { construirRutaLogs } from "./ruta-logs";

type PaginacionLogsProps = {
  tipo: TipoLog;
  desde?: string;
  hasta?: string;
  tamano: TamanoPagina;
  pagina: number;
  total: number;
  totalPaginas: number;
};

const CLASES_NAV =
  "inline-flex min-w-9 items-center justify-center rounded-md border border-gob-accent bg-white px-3 py-1.5 text-sm font-medium text-gob-gray-a transition-colors hover:bg-gob-neutral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary";
const CLASES_NAV_INERTE =
  "inline-flex min-w-9 items-center justify-center rounded-md border border-gob-accent bg-gob-neutral px-3 py-1.5 text-sm font-medium text-gob-gray-a opacity-60";

export function PaginacionLogs({
  tipo,
  desde,
  hasta,
  tamano,
  pagina,
  total,
  totalPaginas,
}: PaginacionLogsProps) {
  const desdeItem = (pagina - 1) * tamano + 1;
  const hastaItem = Math.min(pagina * tamano, total);
  const hayAnterior = pagina > 1;
  const haySiguiente = pagina < totalPaginas;

  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-sm text-gob-gray-a">
        <span>
          Mostrando {desdeItem} a {hastaItem} de {total}
        </span>
        {/* Selector de tamaño: cambiar el tamaño reinicia a la página 1, porque el ítem que se
            veía cambia de página al cambiar el tamaño. Cada opción es un enlace, así el estado
            sigue viviendo en la URL sin JavaScript. */}
        <span className="flex items-center gap-1" aria-label="Registros por página">
          <span className="text-gob-gray-a">Por página:</span>
          {TAMANOS_PAGINA.map((opcion) => {
            const seleccionado = opcion === tamano;
            return (
              <Link
                key={opcion}
                href={construirRutaLogs({ tipo, desde, hasta, tamano: opcion, pagina: 1 })}
                aria-current={seleccionado ? "true" : undefined}
                className={`rounded-md px-2 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary ${
                  seleccionado
                    ? "bg-gob-primary font-semibold text-white"
                    : "font-medium text-gob-primary hover:bg-gob-neutral"
                }`}
              >
                {opcion}
              </Link>
            );
          })}
        </span>
      </div>

      {totalPaginas > 1 ? (
        <nav aria-label="Paginación" className="flex items-center gap-1">
          {hayAnterior ? (
            <Link
              href={construirRutaLogs({ tipo, desde, hasta, tamano, pagina: pagina - 1 })}
              className={CLASES_NAV}
            >
              Anterior
            </Link>
          ) : (
            <span aria-disabled="true" className={CLASES_NAV_INERTE}>
              Anterior
            </span>
          )}

          <span className="px-2 text-sm text-gob-gray-a" aria-current="page">
            Página {pagina} de {totalPaginas}
          </span>

          {haySiguiente ? (
            <Link
              href={construirRutaLogs({ tipo, desde, hasta, tamano, pagina: pagina + 1 })}
              className={CLASES_NAV}
            >
              Siguiente
            </Link>
          ) : (
            <span aria-disabled="true" className={CLASES_NAV_INERTE}>
              Siguiente
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
