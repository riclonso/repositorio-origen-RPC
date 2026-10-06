"use client";

import { useId, useState } from "react";
import { Boton } from "@/shared/components/Boton";
import { BotonIcono } from "@/shared/components/BotonIcono";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { IconoEditar, IconoEliminar } from "@/shared/components/iconos";
import { ModalTipoEnumeradoFormatoExcel } from "@/shared/components/ModalTipoEnumeradoFormatoExcel";
import { MAXIMO_TIPOS_ENUMERADOS } from "@/modules/formatos-excel/domain/entities/TipoEnumerado";
import type { TipoEnumeradoEditable } from "@/shared/components/useTiposEnumeradosFormato";

// Cuántos valores se muestran como muestra en el listado; el resto se resume con "…".
const VALORES_EN_MUESTRA = 5;

type GestorTiposEnumeradosFormatoExcelProps = {
  tiposEnumerados: TipoEnumeradoEditable[];
  columnasQueUsan: (nombreTipo: string) => string[];
  onGuardar: (indice: number | null, tipo: TipoEnumeradoEditable) => void;
  onEliminar: (indice: number) => void;
  error?: string | null;
};

// `indice === null` = creando uno nuevo.
type EdicionAbierta = { indice: number | null };

function resumenValores(valores: string[]): string {
  const muestra = valores.slice(0, VALORES_EN_MUESTRA).join(", ");
  return valores.length > VALORES_EN_MUESTRA ? `${muestra}, …` : muestra;
}

// Tipos de dato enumerados propios del formato (nombre + valores permitidos). Una vez creado, el
// tipo aparece en la lista «Tipo de dato» de la tabla de columnas. Eliminar un tipo que alguna
// columna usa está deshabilitado (el tooltip dice qué columnas lo usan).
export function GestorTiposEnumeradosFormatoExcel({
  tiposEnumerados,
  columnasQueUsan,
  onGuardar,
  onEliminar,
  error,
}: GestorTiposEnumeradosFormatoExcelProps) {
  const idTitulo = useId();
  const [edicion, setEdicion] = useState<EdicionAbierta | null>(null);
  const [indicePendienteEliminacion, setIndicePendienteEliminacion] = useState<number | null>(null);

  const tipoEnEdicion = edicion?.indice != null ? (tiposEnumerados[edicion.indice] ?? null) : null;
  const tipoPendienteEliminacion =
    indicePendienteEliminacion !== null ? (tiposEnumerados[indicePendienteEliminacion] ?? null) : null;
  const alcanzoMaximo = tiposEnumerados.length >= MAXIMO_TIPOS_ENUMERADOS;

  function guardar(tipo: TipoEnumeradoEditable) {
    if (!edicion) return;
    onGuardar(edicion.indice, tipo);
    setEdicion(null);
  }

  function confirmarEliminacion() {
    if (indicePendienteEliminacion === null) return;
    onEliminar(indicePendienteEliminacion);
    setIndicePendienteEliminacion(null);
  }

  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-2">
      <h2 id={idTitulo} className="text-sm font-medium text-gob-black">
        Tipos enumerados
      </h2>
      <p className="text-sm text-gob-gray-a">
        Define listas de valores permitidos (por ejemplo, «Sexo»: Masculino, Femenino) y asígnalas a
        una o más columnas en «Tipo de dato». Una celda con otro valor se rechaza al validar el archivo.
      </p>

      {tiposEnumerados.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gob-accent bg-white px-3 py-3 text-sm text-gob-gray-a">
          Este formato no tiene tipos enumerados.
        </p>
      ) : (
        <ul className="divide-y divide-gob-accent/60 rounded-lg border border-gob-accent bg-white">
          {tiposEnumerados.map((tipo, indice) => {
            const usos = columnasQueUsan(tipo.nombre);

            return (
              <li key={tipo.nombre} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gob-black">{tipo.nombre}</p>
                  <p className="text-xs text-gob-gray-a">
                    {tipo.valores.length === 1 ? "1 valor" : `${tipo.valores.length} valores`}:{" "}
                    <span className="wrap-break-word">{resumenValores(tipo.valores)}</span>
                  </p>
                  {usos.length > 0 ? (
                    <p className="text-xs text-gob-gray-a">Usado en: {usos.join(", ")}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <BotonIcono
                    etiqueta={`Editar tipo enumerado ${tipo.nombre}`}
                    Icono={IconoEditar}
                    onClick={() => setEdicion({ indice })}
                  />
                  <BotonIcono
                    etiqueta={`Eliminar tipo enumerado ${tipo.nombre}`}
                    Icono={IconoEliminar}
                    tono="peligro"
                    onClick={() => setIndicePendienteEliminacion(indice)}
                    deshabilitado={usos.length > 0}
                    motivoDeshabilitado={
                      usos.length > 0 ? `No se puede eliminar: lo usan las columnas ${usos.join(", ")}` : undefined
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Boton
        type="button"
        variante="secundario"
        className="w-fit"
        disabled={alcanzoMaximo}
        title={alcanzoMaximo ? `Se permiten como máximo ${MAXIMO_TIPOS_ENUMERADOS} tipos enumerados` : undefined}
        onClick={() => setEdicion({ indice: null })}
      >
        Crear tipo enumerado
      </Boton>

      {error ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {error}
        </p>
      ) : null}

      {edicion ? (
        <ModalTipoEnumeradoFormatoExcel
          tipoInicial={tipoEnEdicion}
          nombresOtrosTipos={tiposEnumerados
            .filter((_, indice) => indice !== edicion.indice)
            .map((tipo) => tipo.nombre)}
          onGuardar={guardar}
          onCancelar={() => setEdicion(null)}
        />
      ) : null}

      <DialogoConfirmacion
        abierto={tipoPendienteEliminacion !== null}
        titulo="Eliminar tipo enumerado"
        descripcion={
          tipoPendienteEliminacion
            ? `Se eliminará el tipo «${tipoPendienteEliminacion.nombre}» y su lista de valores.`
            : ""
        }
        textoConfirmar="Eliminar tipo"
        textoConfirmando="Eliminando..."
        variante="peligro"
        onConfirmar={confirmarEliminacion}
        onCancelar={() => setIndicePendienteEliminacion(null)}
      />
    </section>
  );
}
