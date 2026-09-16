import type { ReactNode } from "react";

// Definición de una columna del listado. `contenido` recibe la fila y devuelve la celda; toda la
// lógica de presentación específica de cada mantenedor vive ahí, no en el armazón.
export type ColumnaTabla<T> = {
  encabezado: string;
  className?: string;
  // La primera columna se renderiza como `<th scope="row">` (encabezado de fila), el resto como
  // `<td>`. Es lo que hace que un lector de pantalla asocie cada fila con su nombre.
  encabezadoFila?: boolean;
  contenido: (fila: T) => ReactNode;
};

type TablaPanelProps<T> = {
  descripcion: string;
  columnas: ColumnaTabla<T>[];
  filas: T[];
  claveFila: (fila: T) => string;
  // Contenido de la columna "Acciones" (siempre la última, alineada a la derecha).
  acciones: (fila: T) => ReactNode;
  // Tarjeta con los datos de la fila para la vista móvil (bajo `md`).
  tarjeta: (fila: T) => ReactNode;
  // Ancho mínimo de la tabla en escritorio; varía según la cantidad de columnas.
  anchoMinimo: string;
};

// Armazón reutilizable del listado del panel: tabla en escritorio y tarjetas apiladas en móvil.
// Centraliza el marcado (tarjeta contenedora, `<caption>` accesible, cabecera y columna de
// acciones) que antes duplicaba cada mantenedor; el contenido de cada celda lo aporta quien lo usa.
export function TablaPanel<T>({
  descripcion,
  columnas,
  filas,
  claveFila,
  acciones,
  tarjeta,
  anchoMinimo,
}: TablaPanelProps<T>) {
  return (
    <>
      <div className="card-sistema mt-6 hidden overflow-x-auto md:block">
        <table className={`w-full ${anchoMinimo} border-collapse text-left text-sm`}>
          <caption className="sr-only">{descripcion}</caption>
          <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
            <tr>
              {columnas.map((columna) => (
                <th key={columna.encabezado} scope="col" className="px-3 py-3 font-semibold">
                  {columna.encabezado}
                </th>
              ))}
              {/* `w-px` encoge la columna al ancho de sus acciones, así el título alineado a la
                  izquierda empieza justo donde empiezan los botones de cada fila. */}
              <th scope="col" className="w-px whitespace-nowrap px-3 py-3 text-left font-semibold">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gob-accent/60">
            {filas.map((fila) => (
              <tr
                key={claveFila(fila)}
                className="align-middle transition-colors hover:bg-gob-neutral/50"
              >
                {columnas.map((columna) =>
                  columna.encabezadoFila ? (
                    <th key={columna.encabezado} scope="row" className={columna.className}>
                      {columna.contenido(fila)}
                    </th>
                  ) : (
                    <td key={columna.encabezado} className={columna.className}>
                      {columna.contenido(fila)}
                    </td>
                  ),
                )}
                <td className="whitespace-nowrap px-3 py-2 text-right">{acciones(fila)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-6 flex flex-col gap-3 md:hidden">
        {filas.map((fila) => (
          <li key={claveFila(fila)} className="card-sistema p-4 text-sm text-gob-gray-a">
            {tarjeta(fila)}
          </li>
        ))}
      </ul>
    </>
  );
}
