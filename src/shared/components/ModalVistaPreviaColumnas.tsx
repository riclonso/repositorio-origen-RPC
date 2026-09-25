"use client";

import { useEffect, useId, useRef } from "react";
import type { ColumnaEditable } from "@/shared/components/TablaColumnasFormatoExcel";

type ModalVistaPreviaColumnasProps = {
  abierto: boolean;
  columnas: ColumnaEditable[];
  onCerrar: () => void;
};

// Los colores se fijan como estilos de la hoja, no como clases utilitarias arbitrarias. Así la
// apariencia Excel se conserva incluso si la compilación de estilos de una instancia activa aún
// no incorporó una clase nueva.
const COLORES_EXCEL = {
  bordeFuerte: "#5f6b75",
  borde: "#cbd2d9",
  bordeSuave: "#d8dee4",
  barraTitulo: "#1f2933",
  textoSecundario: "#52606d",
  textoBarra: "#d5dce3",
  encabezado: "#f3f5f6",
  esquina: "#e2e6e9",
  verde: "#217346",
  verdeTexto: "#185c37",
} as const;

function letraColumna(indice: number): string {
  let resultado = "";
  let valor = indice + 1;

  while (valor > 0) {
    const resto = (valor - 1) % 26;
    resultado = String.fromCharCode(65 + resto) + resultado;
    valor = Math.floor((valor - 1) / 26);
  }

  return resultado;
}

// Vista no persistente de la primera fila que deberá traer un archivo con este formato. Es un
// `<dialog>` nativo, por lo que mantiene el foco dentro del modal y se cierra con Escape.
export function ModalVistaPreviaColumnas({ abierto, columnas, onCerrar }: ModalVistaPreviaColumnasProps) {
  const referenciaDialogo = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const idDescripcion = useId();

  useEffect(() => {
    const dialogo = referenciaDialogo.current;
    if (!dialogo) return;

    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  return (
    <dialog
      ref={referenciaDialogo}
      aria-labelledby={idTitulo}
      aria-describedby={idDescripcion}
      onClose={onCerrar}
      className="m-auto overflow-hidden rounded-md border bg-white p-0 text-gob-black shadow-2xl backdrop:bg-slate-950/55"
      style={{
        width: "calc(100vw - 3rem)",
        maxWidth: "110rem",
        borderColor: COLORES_EXCEL.bordeFuerte,
      }}
    >
      <header className="flex items-center justify-between px-5 py-3 text-white" style={{ backgroundColor: COLORES_EXCEL.barraTitulo }}>
        <div>
          <h2 id={idTitulo} className="text-base font-semibold">Vista previa de plantilla</h2>
          <p id={idDescripcion} className="mt-0.5 text-xs" style={{ color: COLORES_EXCEL.textoBarra }}>
            Hoja de cálculo que se descargará con este formato.
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar vista previa"
          className="inline-flex size-8 items-center justify-center rounded text-2xl leading-none text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          ×
        </button>
      </header>

      <div className="border-b bg-white" style={{ borderColor: COLORES_EXCEL.borde }}>
        <nav aria-label="Pestañas de la hoja de cálculo" className="flex gap-5 border-b px-4 text-xs font-medium" style={{ borderColor: COLORES_EXCEL.bordeSuave, color: "#3f4b57" }}>
          <span className="border-b-2 py-2" style={{ borderColor: COLORES_EXCEL.verde, color: COLORES_EXCEL.verdeTexto }}>Inicio</span>
          <span className="py-2">Insertar</span>
          <span className="py-2">Datos</span>
          <span className="py-2">Vista</span>
        </nav>
        <div className="flex items-center gap-2 px-4 py-1.5 text-xs" style={{ color: COLORES_EXCEL.textoSecundario }}>
          <span className="w-14 rounded border bg-white px-2 py-1 text-center" style={{ borderColor: "#bcc6cf" }}>A2</span>
          <span className="text-base italic" style={{ color: "#6b7785" }}>fx</span>
          <span className="h-6 flex-1 rounded border bg-white" style={{ borderColor: "#bcc6cf" }} />
        </div>
      </div>

      <div className="max-h-[65vh] overflow-auto bg-white">
        <table className="w-full min-w-max border-collapse text-left" style={{ fontSize: "10px" }}>
          <caption className="sr-only">Vista previa de la hoja de cálculo configurada</caption>
          <thead className="sticky top-0 z-10 text-xs font-medium" style={{ backgroundColor: COLORES_EXCEL.encabezado, color: "#4a5560" }}>
            <tr>
              <th scope="col" className="w-8 min-w-8 px-1 py-1.5 text-center" style={{ backgroundColor: COLORES_EXCEL.esquina, borderRight: `1px solid ${COLORES_EXCEL.borde}` }} aria-label="Número de fila" />
              {columnas.map((_, indice) => (
                <th key={indice} scope="col" className="px-1 py-1 text-center font-medium" style={{ minWidth: "5.25rem", borderRight: `1px solid ${COLORES_EXCEL.borde}` }}>
                  {letraColumna(indice)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="border-r px-1 py-1 text-center font-medium" style={{ backgroundColor: COLORES_EXCEL.encabezado, borderColor: COLORES_EXCEL.borde, color: COLORES_EXCEL.textoSecundario }}>
                1
              </th>
              {columnas.map((columna) => (
                <td key={columna.orden} className="whitespace-nowrap px-1 py-1 font-semibold" style={{ borderRight: `1px solid ${COLORES_EXCEL.bordeSuave}`, borderBottom: `1px solid ${COLORES_EXCEL.bordeSuave}`, color: COLORES_EXCEL.barraTitulo }}>
                  {columna.nombre || "Sin nombre"}
                  {columna.requerida ? <span className="ml-1 text-gob-danger">*</span> : null}
                </td>
              ))}
            </tr>
            {[2, 3, 4, 5, 6, 7].map((fila) => (
              <tr key={fila} className="h-6">
                <th scope="row" className="border-r px-1 text-center font-medium" style={{ backgroundColor: COLORES_EXCEL.encabezado, borderColor: COLORES_EXCEL.borde, color: COLORES_EXCEL.textoSecundario }}>
                  {fila}
                </th>
                {columnas.map((columna, indice) => (
                  <td
                    key={columna.orden}
                    className=""
                    style={
                      fila === 2 && indice === 0
                        ? { border: `2px solid ${COLORES_EXCEL.verde}` }
                        : { borderRight: `1px solid ${COLORES_EXCEL.bordeSuave}`, borderBottom: `1px solid ${COLORES_EXCEL.bordeSuave}` }
                    }
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between border-t px-4 py-2" style={{ borderColor: COLORES_EXCEL.borde, backgroundColor: "#f6f7f8" }}>
        <span className="border-b-2 bg-white px-3 py-1 text-sm font-medium" style={{ borderColor: COLORES_EXCEL.verde, color: COLORES_EXCEL.verdeTexto }}>Hoja 1</span>
        <button
          type="button"
          onClick={onCerrar}
          className="rounded border bg-white px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[#edf1f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
          style={{ borderColor: "#aab4be", color: "#3f4b57" }}
        >
          Cerrar
        </button>
      </footer>
    </dialog>
  );
}
