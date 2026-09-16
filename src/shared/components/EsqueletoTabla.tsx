const FILAS_ESQUELETO = [0, 1, 2, 3, 4, 5, 6, 7];

type EsqueletoTablaProps = {
  // Anchos Tailwind de cada columna (por ejemplo, "w-40"). Definen la forma del esqueleto para
  // que se parezca a la tabla real que va a reemplazar.
  columnas: string[];
  // Cantidad de filas del esqueleto. Los catálogos chicos usan menos filas que un padrón paginado.
  filas?: number[];
};

// Esqueleto con la forma de una tabla (no un spinner): lo comparten los `loading.tsx` y los
// fallbacks de Suspense de los listados. El número de columnas y filas se parametriza para que cada
// mantenedor muestre un esqueleto acorde a su tabla sin duplicar el marcado.
export function EsqueletoTabla({ columnas, filas = FILAS_ESQUELETO }: EsqueletoTablaProps) {
  return (
    <div aria-hidden="true" className="card-sistema mt-6 overflow-hidden">
      <div className="hidden gap-4 border-b border-gob-accent bg-gob-neutral px-3 py-3 md:flex">
        {columnas.map((ancho, indice) => (
          <div key={indice} className={`h-3 rounded bg-gob-accent/60 ${ancho}`} />
        ))}
      </div>

      <div className="divide-y divide-gob-accent/60">
        {filas.map((fila) => (
          <div key={fila} className="flex flex-col gap-3 px-3 py-3 md:flex-row md:gap-4">
            {columnas.map((ancho, indice) => (
              <div key={indice} className={`h-3 rounded bg-gob-neutral ${ancho}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
