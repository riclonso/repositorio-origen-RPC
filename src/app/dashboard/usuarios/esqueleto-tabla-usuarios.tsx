const FILAS_ESQUELETO = [0, 1, 2, 3, 4, 5, 6, 7];
// El ancho no sirve de clave: se repetía y React avisaba de claves duplicadas. Se indexa.
const COLUMNAS_ESQUELETO = ["w-40", "w-28", "w-52", "w-20", "w-28"];

// Esqueleto con la forma de la tabla (no un spinner): lo comparten loading.tsx y el fallback
// del Suspense del listado.
export function EsqueletoTablaUsuarios() {
  return (
    <div
      aria-hidden="true"
      className="mt-6 overflow-hidden rounded-lg border border-gob-accent bg-white"
    >
      <div className="hidden gap-4 border-b border-gob-accent bg-gob-neutral px-3 py-3 md:flex">
        {COLUMNAS_ESQUELETO.map((ancho, indice) => (
          <div key={indice} className={`h-3 rounded bg-gob-accent/60 ${ancho}`} />
        ))}
      </div>

      <div className="divide-y divide-gob-accent/60">
        {FILAS_ESQUELETO.map((fila) => (
          <div key={fila} className="flex flex-col gap-3 px-3 py-3 md:flex-row md:gap-4">
            {COLUMNAS_ESQUELETO.map((ancho, indice) => (
              <div key={indice} className={`h-3 rounded bg-gob-neutral ${ancho}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
