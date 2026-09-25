"use client";

import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { reorder } from "@atlaskit/pragmatic-drag-and-drop/reorder";
import type { OpcionSelect } from "@/shared/components/CampoSelect";
import { IconoEliminar } from "@/shared/components/iconos";
import { ModalVistaPreviaColumnas } from "@/shared/components/ModalVistaPreviaColumnas";

export type ColumnaEditable = {
  orden: number;
  nombre: string;
  requerida: boolean;
  tipoDato: string;
  // Las columnas detectadas pertenecen a la cabecera del archivo cargado y se mantienen de solo
  // lectura. Una fila agregada manualmente sí necesita un campo de nombre antes de guardarse.
  agregadaManualmente?: boolean;
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
  onEliminarColumna?: (columna: ColumnaEditable) => void;
  error?: string | null;
};

type EstadoArrastre = "reposo" | "arrastrando" | "destino";

type FilaColumnaFormatoExcelProps = {
  columna: ColumnaEditable;
  indice: number;
  onActualizar: (cambios: Partial<ColumnaEditable>) => void;
  onReordenar: (indiceOrigen: number, indiceDestino: number) => void;
  onEliminar: () => void;
  puedeEliminar: boolean;
};

// Cada fila se registra como origen y destino con Pragmatic Drag and Drop. Mantener este hook en
// un componente por fila (en vez de dentro del `.map()` de la tabla) respeta las reglas de hooks
// y limpia correctamente los listeners cuando cambia el orden.
function FilaColumnaFormatoExcel({
  columna,
  indice,
  onActualizar,
  onReordenar,
  onEliminar,
  puedeEliminar,
}: FilaColumnaFormatoExcelProps) {
  const referenciaFila = useRef<HTMLTableRowElement>(null);
  const [estadoArrastre, setEstadoArrastre] = useState<EstadoArrastre>("reposo");

  useEffect(() => {
    const elemento = referenciaFila.current;
    if (!elemento) return;

    return combine(
      draggable({
        element: elemento,
        getInitialData: () => ({ indice }),
        onDragStart: () => setEstadoArrastre("arrastrando"),
        onDrop: () => setEstadoArrastre("reposo"),
      }),
      dropTargetForElements({
        element: elemento,
        getData: () => ({ indice }),
        canDrop: ({ source }) => source.data.indice !== indice,
        onDragEnter: () => setEstadoArrastre("destino"),
        onDragLeave: () => setEstadoArrastre("reposo"),
        onDrop: ({ source }) => {
          const indiceOrigen = source.data.indice;

          if (typeof indiceOrigen === "number") {
            onReordenar(indiceOrigen, indice);
          }

          setEstadoArrastre("reposo");
        },
      }),
    );
  }, [indice, onReordenar]);

  const clasesArrastre =
    estadoArrastre === "arrastrando"
      ? "cursor-grabbing scale-[1.01] bg-gob-primary/10 opacity-85 shadow-[0_8px_20px_rgba(23,59,105,0.22)] ring-2 ring-inset ring-gob-primary/35"
      : estadoArrastre === "destino"
        ? "cursor-grab bg-gob-success/10 shadow-[inset_0_3px_0_0_rgba(22,120,73,0.75)]"
        : "cursor-grab hover:bg-gob-neutral/40";

  return (
    <tr
      ref={referenciaFila}
      className={`transition-[background-color,opacity,transform,box-shadow] duration-150 ease-out ${clasesArrastre}`}
    >
      <td className="px-3 py-2 tabular-nums text-gob-gray-a">{columna.orden}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {columna.agregadaManualmente ? (
            <input
              value={columna.nombre}
              onChange={(evento) => onActualizar({ nombre: evento.target.value })}
              aria-label={`Nombre de la columna ${columna.orden}`}
              maxLength={100}
              placeholder="Nombre de la columna"
              className="w-full rounded-md border border-gob-accent bg-white px-2 py-1.5 text-sm text-gob-black outline-none placeholder:text-gob-gray-a focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30"
            />
          ) : (
            <span className="min-w-0 flex-1 font-medium text-gob-black">{columna.nombre}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={columna.requerida}
          onChange={(evento) => onActualizar({ requerida: evento.target.checked })}
          aria-label={`La columna ${columna.nombre} es requerida`}
          className="h-4 w-4 rounded border-gob-accent text-gob-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        />
      </td>
      <td className="px-3 py-2">
        <select
          aria-label={`Tipo de dato de ${columna.nombre}`}
          value={columna.tipoDato}
          onChange={(evento) => onActualizar({ tipoDato: evento.target.value })}
          className="w-full rounded-md border border-gob-accent bg-white px-2 py-1.5 text-sm text-gob-black outline-none focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30"
        >
          {OPCIONES_TIPO_DATO.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 text-center">
        <button
          type="button"
          onClick={onEliminar}
          disabled={!puedeEliminar}
          aria-label={`Eliminar columna ${columna.nombre || columna.orden}`}
          title={puedeEliminar ? "Eliminar columna" : "El formato debe tener al menos una columna"}
          className="inline-flex size-8 items-center justify-center rounded-full text-gob-danger transition-colors hover:bg-gob-danger/10 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-danger"
        >
          <IconoEliminar />
        </button>
      </td>
    </tr>
  );
}

// Las columnas detectadas conservan el nombre de la cabecera del archivo. Además, quien configura
// el formato (ADMIN o REVISOR_REPOSITORIO) puede agregar columnas manuales cuando la plantilla de
// referencia no contiene todavía toda la estructura requerida.
export function TablaColumnasFormatoExcel({
  columnas,
  onCambiar,
  onEliminarColumna,
  error,
}: TablaColumnasFormatoExcelProps) {
  const [vistaPreviaAbierta, setVistaPreviaAbierta] = useState(false);

  function actualizarColumna(indice: number, cambios: Partial<ColumnaEditable>) {
    onCambiar(columnas.map((columna, i) => (i === indice ? { ...columna, ...cambios } : columna)));
  }

  function agregarColumna() {
    const siguienteOrden = Math.max(0, ...columnas.map((columna) => columna.orden)) + 1;

    onCambiar([
      ...columnas,
      {
        orden: siguienteOrden,
        nombre: "",
        requerida: false,
        tipoDato: "TEXTO",
        agregadaManualmente: true,
      },
    ]);
  }

  function reordenarColumnas(indiceOrigen: number, indiceDestino: number) {
    if (indiceOrigen === indiceDestino) return;

    const reordenadas = reorder({
      list: columnas,
      startIndex: indiceOrigen,
      finishIndex: indiceDestino,
    });

    // `orden` es solo la representación visible; el payload ya se envía como arreglo y el
    // servidor vuelve a fijar el orden por posición. Recalcularlo aquí deja ambas vistas
    // coherentes mientras la persona sigue configurando reglas.
    onCambiar(reordenadas.map((columna, indice) => ({ ...columna, orden: indice + 1 })));
  }

  function eliminarColumna(columna: ColumnaEditable) {
    if (onEliminarColumna) {
      onEliminarColumna(columna);
      return;
    }

    onCambiar(
      columnas
        .filter((actual) => actual !== columna)
        .map((actual, indice) => ({ ...actual, orden: indice + 1 })),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-gob-black">Columnas del formato</span>
      <p className="text-sm text-gob-gray-a">
        Puedes agregar columnas adicionales. Los archivos que se carguen con este formato deberán
        incluirlas en su encabezado.
      </p>

      <div className="overflow-x-auto rounded-lg border border-gob-accent bg-white">
        <table className="w-full min-w-xl border-collapse text-left text-sm">
          <caption className="sr-only">Columnas detectadas y sus reglas</caption>
          <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Orden</th>
              <th scope="col" className="px-3 py-2 font-semibold">Nombre</th>
              <th scope="col" className="px-3 py-2 font-semibold">Requerida</th>
              <th scope="col" className="px-3 py-2 font-semibold">Tipo de dato</th>
              <th scope="col" className="w-12 px-3 py-2 font-semibold">
                <span className="sr-only">Eliminar</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gob-accent/60">
            {columnas.map((columna, indice) => (
              <FilaColumnaFormatoExcel
                key={columna.orden}
                columna={columna}
                indice={indice}
                onActualizar={(cambios) => actualizarColumna(indice, cambios)}
                onReordenar={reordenarColumnas}
                onEliminar={() => eliminarColumna(columna)}
                puedeEliminar={columnas.length > 1}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={agregarColumna}
          className="w-fit rounded-md border border-gob-primary px-3 py-1.5 text-sm font-medium text-gob-primary transition-colors hover:bg-gob-neutral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          Agregar columna
        </button>
        <button
          type="button"
          onClick={() => setVistaPreviaAbierta(true)}
          className="w-fit rounded-md border border-gob-primary px-3 py-1.5 text-sm font-medium text-gob-primary transition-colors hover:bg-gob-neutral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          Vista previa
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {error}
        </p>
      ) : null}

      <ModalVistaPreviaColumnas
        abierto={vistaPreviaAbierta}
        columnas={columnas}
        onCerrar={() => setVistaPreviaAbierta(false)}
      />
    </div>
  );
}
