import type { ErrorCargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";

const ETIQUETAS_TIPO_ERROR: Record<ErrorCargaArchivo["tipoError"], string> = {
  COLUMNA_FALTANTE: "Columna faltante",
  COLUMNA_INESPERADA: "Columna inesperada",
  VALOR_REQUERIDO_VACIO: "Valor requerido vacío",
  TIPO_DATO_INVALIDO: "Tipo de dato inválido",
  REGLA_VALIDACION: "Regla de validación",
};

// Resumen de errores de una carga (RF-14): número de fila, columna y tipo de error, con el
// mensaje correspondiente. Los errores estructurales (`COLUMNA_FALTANTE`/`COLUMNA_INESPERADA`)
// no son de una fila puntual y se muestran con `numeroFila = 0` como "Archivo completo".
type ResumenErroresCargaProps = {
  errores: ErrorCargaArchivo[];
};

export function ResumenErroresCarga({ errores }: ResumenErroresCargaProps) {
  if (errores.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-gob-danger/40 bg-white">
      <table className="w-full min-w-2xl border-collapse text-left text-sm">
        <caption className="sr-only">Resumen de errores de la carga</caption>
        <thead className="bg-gob-danger/10 text-xs uppercase tracking-wide text-gob-gray-a">
          <tr>
            <th scope="col" className="px-3 py-3 font-semibold">Fila</th>
            <th scope="col" className="px-3 py-3 font-semibold">Columna</th>
            <th scope="col" className="px-3 py-3 font-semibold">Tipo de error</th>
            <th scope="col" className="px-3 py-3 font-semibold">Mensaje</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gob-accent/60">
          {errores.map((error) => (
            <tr key={error.id} className="align-top">
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gob-black">
                {error.numeroFila === 0 ? "Archivo completo" : error.numeroFila}
              </td>
              <td className="px-3 py-2 text-gob-gray-a">{error.columna ?? "—"}</td>
              <td className="whitespace-nowrap px-3 py-2 text-gob-danger">
                {ETIQUETAS_TIPO_ERROR[error.tipoError]}
              </td>
              <td className="px-3 py-2 text-gob-gray-a">{error.mensaje}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
