"use client";

import type { OpcionSelect } from "@/shared/components/CampoSelect";

export type ColumnaEditable = {
  orden: number;
  nombre: string;
  requerida: boolean;
  tipoDato: string;
};

// Las ocho opciones fijas del enum `TipoDatoColumna` (`prisma/schema.prisma`), en el orden en el
// que tiene sentido presentarlas a quien configura el formato. RUT y EMAIL se agregaron en RF-14.
const OPCIONES_TIPO_DATO: OpcionSelect[] = [
  { valor: "TEXTO", etiqueta: "Texto" },
  { valor: "ENTERO", etiqueta: "Entero" },
  { valor: "DECIMAL", etiqueta: "Decimal" },
  { valor: "BOOLEANO", etiqueta: "Booleano" },
  { valor: "FECHA", etiqueta: "Fecha" },
  { valor: "FECHA_HORA", etiqueta: "Fecha y hora" },
  { valor: "RUT", etiqueta: "RUT" },
  { valor: "EMAIL", etiqueta: "Email" },
];

type TablaColumnasFormatoExcelProps = {
  columnas: ColumnaEditable[];
  onCambiar: (columnas: ColumnaEditable[]) => void;
  error?: string | null;
};

// El NOMBRE de cada columna es de solo lectura: viene de la primera fila de la plantilla subida
// (o de la que ya se guardó, al editar). Lo único que quien lo configura (ADMIN o
// REVISOR_REPOSITORIO) decide aquí es cuáles son requeridas y su tipo de dato.
export function TablaColumnasFormatoExcel({ columnas, onCambiar, error }: TablaColumnasFormatoExcelProps) {
  function actualizarColumna(indice: number, cambios: Partial<ColumnaEditable>) {
    onCambiar(columnas.map((columna, i) => (i === indice ? { ...columna, ...cambios } : columna)));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-gob-black">Columnas de la plantilla</span>

      <div className="overflow-x-auto rounded-lg border border-gob-accent bg-white">
        <table className="w-full min-w-xl border-collapse text-left text-sm">
          <caption className="sr-only">Columnas detectadas y sus reglas</caption>
          <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Orden</th>
              <th scope="col" className="px-3 py-2 font-semibold">Nombre</th>
              <th scope="col" className="px-3 py-2 font-semibold">Requerida</th>
              <th scope="col" className="px-3 py-2 font-semibold">Tipo de dato</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gob-accent/60">
            {columnas.map((columna, indice) => (
              <tr key={columna.orden}>
                <td className="px-3 py-2 tabular-nums text-gob-gray-a">{columna.orden}</td>
                <th scope="row" className="px-3 py-2 font-medium text-gob-black">{columna.nombre}</th>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={columna.requerida}
                    onChange={(evento) => actualizarColumna(indice, { requerida: evento.target.checked })}
                    aria-label={`La columna ${columna.nombre} es requerida`}
                    className="h-4 w-4 rounded border-gob-accent text-gob-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    aria-label={`Tipo de dato de ${columna.nombre}`}
                    value={columna.tipoDato}
                    onChange={(evento) => actualizarColumna(indice, { tipoDato: evento.target.value })}
                    className="w-full rounded-md border border-gob-accent bg-white px-2 py-1.5 text-sm text-gob-black outline-none focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30"
                  >
                    {OPCIONES_TIPO_DATO.map((opcion) => (
                      <option key={opcion.valor} value={opcion.valor}>
                        {opcion.etiqueta}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
