"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/shared/components/Boton";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { IconoDescargar, IconoDocumento, IconoEliminar, IconoSubir } from "@/shared/components/iconos";
import {
  ACEPTAR_REGLAS_LLENADO,
  MENSAJE_REGLAS_EXCEDE_TAMANO,
  MENSAJE_TIPO_REGLAS_INVALIDO,
  TAMANO_MAXIMO_REGLAS_TEXTO,
  validarArchivoReglasEnCliente,
} from "@/modules/formatos-excel/schemas/reglas-llenado.schema";
import { CABECERA_NOMBRE_ARCHIVO } from "@/shared/schemas/nombreArchivoSubida.schema";
import { formatearTamanoArchivo } from "@/shared/utils/tamanoArchivo";
import { formatearFechaHora } from "@/shared/utils/fecha";

// RF-45: datos serializables de las reglas vigentes (ISO en vez de `Date`, viaja de Server a Client).
export type ReglasLlenadoVistaDTO = {
  nombreArchivoOriginal: string;
  tamanoBytes: number;
  subidoEn: string;
  subidoPorNombre: string;
};

type SeccionReglasLlenadoProps = {
  formatoExcelId: string;
  reglas: ReglasLlenadoVistaDTO | null;
};

const MENSAJE_ERROR_GENERICO = "No se pudo completar la operación. Intenta nuevamente.";

async function mensajeDeRespuesta(respuesta: Response): Promise<string> {
  if (respuesta.status === 413) return MENSAJE_REGLAS_EXCEDE_TAMANO;

  const cuerpo: unknown = await respuesta.json().catch(() => null);
  if (cuerpo && typeof cuerpo === "object" && "codigo" in cuerpo && cuerpo.codigo === "TIPO_INVALIDO") {
    return MENSAJE_TIPO_REGLAS_INVALIDO;
  }
  if (cuerpo && typeof cuerpo === "object" && "error" in cuerpo && typeof cuerpo.error === "string") {
    return cuerpo.error;
  }
  return MENSAJE_ERROR_GENERICO;
}

// Sección "Reglas para llenado de archivo" de la edición de un formato, compartida por
// `/dashboard/formatos-excel/[id]/editar` y `/revisor/formatos-excel/[id]/editar`. Un archivo por
// formato: subir cuando no hay, reemplazar o eliminar cuando hay.
export function SeccionReglasLlenado({ formatoExcelId, reglas }: SeccionReglasLlenadoProps) {
  const router = useRouter();
  const idTitulo = useId();
  const idEntrada = useId();
  const idAyuda = useId();
  const entradaRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const rutaApi = `/api/formatos-excel/${formatoExcelId}/reglas-llenado`;

  function alElegirArchivo(evento: ChangeEvent<HTMLInputElement>) {
    const elegido = evento.target.files?.[0] ?? null;
    setArchivo(elegido);
    setError(elegido ? validarArchivoReglasEnCliente(elegido) : null);
  }

  async function subir() {
    if (!archivo) return;

    const errorCliente = validarArchivoReglasEnCliente(archivo);
    if (errorCliente) {
      setError(errorCliente);
      return;
    }

    setSubiendo(true);
    setError(null);

    try {
      // Binario crudo como cuerpo (no multipart); el nombre original va codificado en la cabecera.
      const respuesta = await fetch(rutaApi, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          [CABECERA_NOMBRE_ARCHIVO]: encodeURIComponent(archivo.name),
        },
        body: archivo,
      });

      if (!respuesta.ok) {
        setError(await mensajeDeRespuesta(respuesta));
        return;
      }

      setArchivo(null);
      if (entradaRef.current) entradaRef.current.value = "";
      router.refresh();
    } catch {
      setError(MENSAJE_ERROR_GENERICO);
    } finally {
      setSubiendo(false);
    }
  }

  async function eliminar() {
    setEliminando(true);
    setErrorEliminar(null);

    try {
      const respuesta = await fetch(rutaApi, { method: "DELETE" });

      if (!respuesta.ok && respuesta.status !== 404) {
        setErrorEliminar(await mensajeDeRespuesta(respuesta));
        return;
      }

      setConfirmandoEliminar(false);
      router.refresh();
    } catch {
      setErrorEliminar(MENSAJE_ERROR_GENERICO);
    } finally {
      setEliminando(false);
    }
  }

  return (
    <section aria-labelledby={idTitulo} className="mt-6 rounded-lg border border-gob-accent bg-white p-5">
      <h2 id={idTitulo} className="flex items-center gap-2 text-base font-semibold text-gob-black">
        <IconoDocumento className="shrink-0 text-gob-primary" />
        Reglas para llenado de archivo
      </h2>
      <p className="mt-1 text-sm text-gob-gray-a">
        Documento que los notificadores descargan desde cada ventana de este formato. Reemplazarlo afecta a
        todas sus ventanas.
      </p>

      {reglas ? (
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="font-medium text-gob-gray-a">Archivo</dt>
            <dd className="break-all text-gob-black">{reglas.nombreArchivoOriginal}</dd>
          </div>
          <div>
            <dt className="font-medium text-gob-gray-a">Tamaño</dt>
            <dd className="text-gob-black">{formatearTamanoArchivo(reglas.tamanoBytes)}</dd>
          </div>
          <div>
            <dt className="font-medium text-gob-gray-a">Subido el</dt>
            <dd className="text-gob-black">{formatearFechaHora(new Date(reglas.subidoEn))}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-gob-gray-a">Subido por</dt>
            <dd className="text-gob-black">{reglas.subidoPorNombre}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-sm text-gob-gray-a">
          Este formato aún no tiene un archivo de reglas. Los notificadores no verán el enlace hasta que se suba uno.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <label htmlFor={idEntrada} className="text-sm font-medium text-gob-black">
          {reglas ? "Reemplazar por otro archivo" : "Archivo de reglas"}
        </label>
        <input
          ref={entradaRef}
          id={idEntrada}
          type="file"
          accept={ACEPTAR_REGLAS_LLENADO}
          aria-describedby={idAyuda}
          disabled={subiendo}
          onChange={alElegirArchivo}
          className="text-sm text-gob-gray-a file:mr-3 file:rounded-md file:border file:border-gob-accent file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gob-black hover:file:bg-gob-neutral"
        />
        <p id={idAyuda} className="text-xs text-gob-gray-a">
          Word (.docx, .doc), Excel (.xlsx, .xls) o texto (.txt), hasta {TAMANO_MAXIMO_REGLAS_TEXTO}.
        </p>
        {error ? (
          <p role="alert" className="text-sm font-medium text-gob-danger">
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Boton
          type="button"
          onClick={() => void subir()}
          disabled={!archivo || error !== null}
          cargando={subiendo}
          textoCargando="Subiendo archivo…"
        >
          <IconoSubir className="shrink-0" />
          {reglas ? "Reemplazar" : "Subir"}
        </Boton>

        {reglas ? (
          <>
            <a
              href={rutaApi}
              download
              className="inline-flex items-center gap-1.5 rounded-md border border-gob-accent bg-white px-4 py-2 text-sm font-medium text-gob-gray-a transition-colors hover:bg-gob-neutral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
            >
              <IconoDescargar className="shrink-0" />
              Descargar
            </a>
            <Boton type="button" variante="textoPeligro" onClick={() => setConfirmandoEliminar(true)}>
              <IconoEliminar className="shrink-0" />
              Eliminar
            </Boton>
          </>
        ) : null}
      </div>

      <DialogoConfirmacion
        abierto={confirmandoEliminar}
        titulo="Eliminar reglas para llenado de archivo"
        descripcion="Los notificadores dejarán de ver el enlace en todas las ventanas de este formato. Esta acción no se puede deshacer."
        textoConfirmar="Eliminar"
        textoConfirmando="Eliminando…"
        variante="peligro"
        procesando={eliminando}
        error={errorEliminar}
        onConfirmar={() => void eliminar()}
        onCancelar={() => {
          setConfirmandoEliminar(false);
          setErrorEliminar(null);
        }}
      />
    </section>
  );
}
