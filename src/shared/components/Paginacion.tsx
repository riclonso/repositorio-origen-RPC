import Link from "next/link";

const PAGINAS_VISIBLES = 5;

const CLASES_ENLACE =
  "inline-flex min-w-9 items-center justify-center rounded-md border border-gob-accent bg-white px-3 py-1.5 text-sm font-medium text-gob-gray-a transition-colors hover:bg-gob-neutral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary";

const CLASES_DESHABILITADO =
  "inline-flex min-w-9 items-center justify-center rounded-md border border-gob-accent bg-gob-neutral px-3 py-1.5 text-sm font-medium text-gob-gray-a";

function calcularPaginasVisibles(pagina: number, totalPaginas: number): number[] {
  const inicio = Math.max(1, Math.min(pagina - 2, totalPaginas - PAGINAS_VISIBLES + 1));
  const fin = Math.min(totalPaginas, inicio + PAGINAS_VISIBLES - 1);

  const paginas: number[] = [];
  for (let numero = inicio; numero <= fin; numero++) {
    paginas.push(numero);
  }
  return paginas;
}

// Versión genérica de `dashboard/usuarios/paginacion-usuarios.tsx`, parametrizada por
// `construirHref` en vez de un helper de ruta fijo: la reutilizan listados de distintas áreas
// (`/dashboard/cargas`, `/revisor/cargas`) que comparten la misma UI de paginación pero arman su
// URL de forma distinta.
export type PaginacionProps = {
  pagina: number;
  tamano: number;
  totalPaginas: number;
  total: number;
  cantidadEnPagina: number;
  construirHref: (pagina: number) => string;
};

export function Paginacion({
  pagina,
  tamano,
  totalPaginas,
  total,
  cantidadEnPagina,
  construirHref,
}: PaginacionProps) {
  const desde = cantidadEnPagina === 0 ? 0 : (pagina - 1) * tamano + 1;
  const hasta = desde + cantidadEnPagina - 1;
  const hayAnterior = pagina > 1;
  const haySiguiente = pagina < totalPaginas;

  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-gob-gray-a">
        Mostrando {desde} a {hasta} de {total}
      </p>

      <nav aria-label="Paginación">
        <ul className="flex flex-wrap items-center gap-1">
          <li>
            {hayAnterior ? (
              <Link href={construirHref(pagina - 1)} className={CLASES_ENLACE}>
                Anterior
              </Link>
            ) : (
              <span aria-disabled="true" className={CLASES_DESHABILITADO}>
                Anterior
              </span>
            )}
          </li>

          {calcularPaginasVisibles(pagina, totalPaginas).map((numero) => (
            <li key={numero}>
              {numero === pagina ? (
                <span
                  aria-current="page"
                  className="inline-flex min-w-9 items-center justify-center rounded-md border border-gob-primary bg-gob-primary px-3 py-1.5 text-sm font-semibold text-white"
                >
                  {numero}
                </span>
              ) : (
                <Link href={construirHref(numero)} aria-label={`Ir a la página ${numero}`} className={CLASES_ENLACE}>
                  {numero}
                </Link>
              )}
            </li>
          ))}

          <li>
            {haySiguiente ? (
              <Link href={construirHref(pagina + 1)} className={CLASES_ENLACE}>
                Siguiente
              </Link>
            ) : (
              <span aria-disabled="true" className={CLASES_DESHABILITADO}>
                Siguiente
              </span>
            )}
          </li>
        </ul>
      </nav>
    </div>
  );
}
