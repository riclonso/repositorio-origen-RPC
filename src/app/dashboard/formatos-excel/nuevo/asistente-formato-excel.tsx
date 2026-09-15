"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boton } from "@/shared/components/Boton";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { TablaColumnasFormatoExcel, type ColumnaEditable } from "../tabla-columnas-formato-excel";
import {
  EditorReglasValidacionFormatoExcel,
  type ReglaValidacionEditable,
} from "../editor-reglas-validacion-formato-excel";
import { RUTA_FORMATOS_EXCEL } from "../ruta-formatos-excel";

const MENSAJE_ERROR_GENERICO = "No se pudo completar la operación. Intenta nuevamente.";
const EXTENSIONES_ACEPTADAS = ".xlsx,.csv";
const TIPO_DATO_POR_DEFECTO = "TEXTO";

type ColumnaDetectada = { orden: number; nombre: string };

type PasoAsistente = "subir" | "configurar";

// Asistente de dos pasos: (1) sube una plantilla y detecta sus columnas sin persistir nada, (2)
// permite marcar cuáles son requeridas y su tipo de dato antes de enviarlo todo junto —el
// archivo original incluido— a `POST /api/formatos-excel`. No se mantiene estado de sesión entre
// pasos: si se recarga la página hay que volver a subir el archivo.
export function AsistenteFormatoExcel() {
  const router = useRouter();
  const [paso, setPaso] = useState<PasoAsistente>("subir");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [columnas, setColumnas] = useState<ColumnaEditable[]>([]);
  const [reglasValidacion, setReglasValidacion] = useState<ReglaValidacionEditable[]>([]);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cargandoPlantilla, setCargandoPlantilla] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  async function subirPlantilla(evento: ChangeEvent<HTMLInputElement>) {
    const seleccionado = evento.target.files?.[0] ?? null;
    evento.target.value = "";

    if (!seleccionado) return;

    setCargandoPlantilla(true);
    setErrorGeneral(null);

    try {
      const formData = new FormData();
      formData.append("archivo", seleccionado);

      const respuesta = await fetch("/api/formatos-excel/leer-plantilla", {
        method: "POST",
        body: formData,
      });

      const datos = await respuesta.json().catch(() => null);

      if (!respuesta.ok) {
        setErrorGeneral(datos?.error ?? MENSAJE_ERROR_GENERICO);
        return;
      }

      const columnasDetectadas = datos?.columnas as ColumnaDetectada[] | undefined;

      setArchivo(seleccionado);
      setColumnas(
        (columnasDetectadas ?? []).map((columna) => ({
          ...columna,
          requerida: false,
          tipoDato: TIPO_DATO_POR_DEFECTO,
        })),
      );
      setNombre((actual) => (actual.length > 0 ? actual : seleccionado.name.replace(/\.[^./\\]+$/, "")));
      setPaso("configurar");
    } catch {
      setErrorGeneral(MENSAJE_ERROR_GENERICO);
    } finally {
      setCargandoPlantilla(false);
    }
  }

  async function enviarFormulario() {
    if (!archivo) return;

    setEnviando(true);
    setErrores({});
    setErrorGeneral(null);

    try {
      const formData = new FormData();
      formData.append("archivo", archivo);
      formData.append("nombre", nombre);
      formData.append("descripcion", descripcion);
      formData.append(
        "columnas",
        JSON.stringify(
          columnas.map(({ nombre: nombreColumna, requerida, tipoDato }) => ({
            nombre: nombreColumna,
            requerida,
            tipoDato,
          })),
        ),
      );
      formData.append(
        "reglasValidacion",
        JSON.stringify(
          reglasValidacion.map(({ tipo, columnas: columnasRegla, mensaje }) => ({
            tipo,
            columnas: columnasRegla,
            mensaje,
          })),
        ),
      );

      const respuesta = await fetch("/api/formatos-excel", { method: "POST", body: formData });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        const mensaje: string = datos?.error ?? MENSAJE_ERROR_GENERICO;

        if (datos?.campo) {
          setErrores({ [String(datos.campo)]: mensaje });
        } else {
          setErrorGeneral(mensaje);
        }

        return;
      }

      router.push(RUTA_FORMATOS_EXCEL);
      router.refresh();
    } catch {
      setErrorGeneral(MENSAJE_ERROR_GENERICO);
    } finally {
      setEnviando(false);
    }
  }

  if (paso === "subir") {
    return (
      <div className="mt-6 flex flex-col items-start gap-4 rounded-lg border border-gob-accent bg-white p-6">
        <p className="text-sm text-gob-gray-a">
          Sube un archivo de ejemplo (.xlsx o .csv, máximo 10 MB). El sistema leerá las columnas
          de la primera fila para que definas cuáles son requeridas y su tipo de dato.
        </p>

        <label className="inline-flex w-fit cursor-pointer items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-[1px] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gob-primary">
          {cargandoPlantilla ? "Leyendo..." : "Seleccionar plantilla"}
          <input
            type="file"
            accept={EXTENSIONES_ACEPTADAS}
            className="sr-only"
            disabled={cargandoPlantilla}
            onChange={subirPlantilla}
          />
        </label>

        {errorGeneral ? (
          <p role="alert" className="text-sm font-medium text-gob-danger">
            {errorGeneral}
          </p>
        ) : null}

        <Link
          href={RUTA_FORMATOS_EXCEL}
          className="text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
        >
          Cancelar
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-2">
        <CampoTexto
          id="nombre"
          etiqueta="Nombre del formato"
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          error={errores.nombre}
        />
        <CampoTexto
          id="descripcion"
          etiqueta="Descripción (opcional)"
          value={descripcion}
          onChange={(evento) => setDescripcion(evento.target.value)}
          error={errores.descripcion}
        />
      </div>

      <TablaColumnasFormatoExcel columnas={columnas} onCambiar={setColumnas} error={errores.columnas} />

      <EditorReglasValidacionFormatoExcel
        reglas={reglasValidacion}
        columnasDisponibles={columnas}
        onCambiar={setReglasValidacion}
        error={errores.reglasValidacion}
      />

      {errorGeneral ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {errorGeneral}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Boton
          type="button"
          variante="primario"
          cargando={enviando}
          textoCargando="Guardando..."
          onClick={enviarFormulario}
        >
          Crear formato
        </Boton>
        <Boton type="button" variante="secundario" disabled={enviando} onClick={() => setPaso("subir")}>
          Volver
        </Boton>
        <Link
          href={RUTA_FORMATOS_EXCEL}
          className="inline-flex items-center justify-center rounded-md border border-gob-accent bg-white px-4 py-2 text-sm font-medium text-gob-gray-a transition-colors hover:bg-gob-neutral active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          Cancelar
        </Link>
      </div>
    </div>
  );
}
