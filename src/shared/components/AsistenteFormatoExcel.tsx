"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boton } from "@/shared/components/Boton";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { TablaColumnasFormatoExcel, type ColumnaEditable } from "@/shared/components/TablaColumnasFormatoExcel";
import {
  EditorReglasValidacionFormatoExcel,
  type ReglaValidacionEditable,
} from "@/shared/components/EditorReglasValidacionFormatoExcel";

const MENSAJE_ERROR_GENERICO = "No se pudo completar la operación. Intenta nuevamente.";
const EXTENSIONES_ACEPTADAS = ".xlsx,.csv";
const TIPO_DATO_POR_DEFECTO = "TEXTO";

type ColumnaDetectada = { orden: number; nombre: string };

type PasoAsistente = "subir" | "configurar";

type AsistenteFormatoExcelProps = {
  // Ruta base de la pantalla que aloja este asistente ("/dashboard/formatos-excel" o
  // "/revisor/formatos-excel"): el componente es compartido entre ambos paneles, así que no
  // puede asumir una de las dos rutas para "Cancelar" ni para la redirección tras crear.
  rutaBase: string;
};

// Asistente de dos pasos: (1) sube una plantilla y detecta sus columnas sin persistir nada, (2)
// permite marcar cuáles son requeridas y su tipo de dato antes de enviarlo todo junto —el
// archivo original incluido— a `POST /api/formatos-excel`. No se mantiene estado de sesión entre
// pasos: si se recarga la página hay que volver a subir el archivo.
export function AsistenteFormatoExcel({ rutaBase }: AsistenteFormatoExcelProps) {
  const router = useRouter();
  const [paso, setPaso] = useState<PasoAsistente>("subir");
  // `archivo` solo se lee dentro de `enviarFormulario` (nunca en el JSX), así que se guarda en un
  // ref y no en estado: un `useState` aquí forzaría un re-render extra en cada selección de
  // archivo que no cambia nada visible en pantalla.
  const archivoRef = useRef<File | null>(null);
  const [columnas, setColumnas] = useState<ColumnaEditable[]>([]);
  const [reglasValidacion, setReglasValidacion] = useState<ReglaValidacionEditable[]>([]);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cargandoPlantilla, setCargandoPlantilla] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [columnaPendienteEliminacion, setColumnaPendienteEliminacion] = useState<ColumnaEditable | null>(null);

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

      archivoRef.current = seleccionado;
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
    const archivo = archivoRef.current;
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

      router.push(rutaBase);
      router.refresh();
    } catch {
      setErrorGeneral(MENSAJE_ERROR_GENERICO);
    } finally {
      setEnviando(false);
    }
  }

  function eliminarColumnaYReglas(columnaAEliminar: ColumnaEditable) {
    const nombreNormalizado = columnaAEliminar.nombre.trim().toLocaleLowerCase();

    setColumnas((actuales) =>
      actuales
        .filter((columna) => columna !== columnaAEliminar)
        .map((columna, indice) => ({ ...columna, orden: indice + 1 })),
    );
    // Una regla que mencionaba la columna eliminada deja de ser válida por definición. Se elimina
    // completa para no conservar una regla parcial con semántica distinta a la configurada.
    setReglasValidacion((actuales) =>
      actuales.filter(
        (regla) =>
          !regla.columnas.some((nombre) => nombre.trim().toLocaleLowerCase() === nombreNormalizado),
      ),
    );
  }

  function solicitarEliminarColumna(columna: ColumnaEditable) {
    const nombreNormalizado = columna.nombre.trim().toLocaleLowerCase();
    const tieneReglasAsociadas = reglasValidacion.some((regla) =>
      regla.columnas.some((nombre) => nombre.trim().toLocaleLowerCase() === nombreNormalizado),
    );

    if (tieneReglasAsociadas) {
      setColumnaPendienteEliminacion(columna);
      return;
    }

    eliminarColumnaYReglas(columna);
  }

  function confirmarEliminarColumna() {
    if (!columnaPendienteEliminacion) return;
    eliminarColumnaYReglas(columnaPendienteEliminacion);
    setColumnaPendienteEliminacion(null);
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
          href={rutaBase}
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

      <TablaColumnasFormatoExcel
        columnas={columnas}
        onCambiar={setColumnas}
        onEliminarColumna={solicitarEliminarColumna}
        error={errores.columnas}
      />

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
          href={rutaBase}
          className="inline-flex items-center justify-center rounded-md border border-gob-accent bg-white px-4 py-2 text-sm font-medium text-gob-gray-a transition-colors hover:bg-gob-neutral active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          Cancelar
        </Link>
      </div>

      <DialogoConfirmacion
        abierto={columnaPendienteEliminacion !== null}
        titulo="Eliminar columna con reglas"
        descripcion={
          columnaPendienteEliminacion
            ? `La columna “${columnaPendienteEliminacion.nombre}” está incluida en una o más reglas. Al eliminarla, esas reglas también se eliminarán.`
            : ""
        }
        textoConfirmar="Eliminar columna y reglas"
        textoConfirmando="Eliminando..."
        variante="peligro"
        onConfirmar={confirmarEliminarColumna}
        onCancelar={() => setColumnaPendienteEliminacion(null)}
      />

    </div>
  );
}
