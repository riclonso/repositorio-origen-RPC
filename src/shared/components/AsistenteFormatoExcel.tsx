"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boton } from "@/shared/components/Boton";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { CampoTexto } from "@/shared/components/CampoTexto";
import type { SeparadorCsv, TipoArchivo } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import { useEliminarColumnaFormato } from "@/shared/components/useEliminarColumnaFormato";
import {
  useTiposEnumeradosFormato,
  type TipoEnumeradoEditable,
} from "@/shared/components/useTiposEnumeradosFormato";
import { GestorTiposEnumeradosFormatoExcel } from "@/shared/components/GestorTiposEnumeradosFormatoExcel";
import {
  PasoSubirPlantillaFormato,
  PasoTipoArchivoFormato,
  ResumenTipoArchivoFormato,
} from "@/shared/components/PasosInicialesFormatoExcel";
import { TablaColumnasFormatoExcel, type ColumnaEditable } from "@/shared/components/TablaColumnasFormatoExcel";
import {
  EditorReglasValidacionFormatoExcel,
  type ReglaValidacionEditable,
} from "@/shared/components/EditorReglasValidacionFormatoExcel";

const MENSAJE_ERROR_GENERICO = "No se pudo completar la operación. Intenta nuevamente.";
const TIPO_DATO_POR_DEFECTO = "TEXTO";
const SEPARADOR_POR_DEFECTO: SeparadorCsv = "COMA";

// Carácter de cada separador, solo para detectar en el cliente un CSV leído con el separador
// equivocado (una única columna cuyo nombre contiene otro separador). La lectura real la hace el
// servidor.
const CARACTER_SEPARADOR: Record<SeparadorCsv, string> = {
  COMA: ",",
  PUNTO_Y_COMA: ";",
  TABULADOR: "\t",
  BARRA_VERTICAL: "|",
};

type ColumnaDetectada = { orden: number; nombre: string };

// Un formato nuevo nace sin tipos enumerados.
function sinTiposEnumerados(): TipoEnumeradoEditable[] {
  return [];
}

type PasoAsistente = "tipo" | "subir" | "configurar";

function detectarOtroSeparador(columnas: ColumnaDetectada[], elegido: SeparadorCsv): SeparadorCsv | null {
  if (columnas.length !== 1) return null;
  const caracteresEncabezado = new Set(columnas[0].nombre);

  for (const [separador, caracter] of Object.entries(CARACTER_SEPARADOR) as [SeparadorCsv, string][]) {
    if (separador !== elegido && caracteresEncabezado.has(caracter)) return separador;
  }

  return null;
}

type AsistenteFormatoExcelProps = {
  // Ruta base de la pantalla que aloja este asistente ("/dashboard/formatos-excel" o
  // "/revisor/formatos-excel"): el componente es compartido entre ambos paneles, así que no
  // puede asumir una de las dos rutas para "Cancelar" ni para la redirección tras crear.
  rutaBase: string;
  permitirEditarNombresColumnas?: boolean;
};

// Asistente de tres pasos: (0) elige el tipo de archivo (Excel o CSV) y, si es CSV, su
// separador; (1) sube una plantilla de ese tipo y detecta sus columnas sin persistir nada; (2)
// permite definir tipos enumerados y marcar cuáles columnas son requeridas y su tipo de dato
// antes de enviarlo todo junto —el
// archivo original incluido— a `POST /api/formatos-excel`. No se mantiene estado de sesión entre
// pasos: si se recarga la página hay que volver a subir el archivo.
export function AsistenteFormatoExcel({
  rutaBase,
  permitirEditarNombresColumnas = false,
}: AsistenteFormatoExcelProps) {
  const router = useRouter();
  const [paso, setPaso] = useState<PasoAsistente>("tipo");
  const [tipoArchivo, setTipoArchivo] = useState<TipoArchivo>("EXCEL");
  const [separadorCsv, setSeparadorCsv] = useState<SeparadorCsv>(SEPARADOR_POR_DEFECTO);
  const [otroSeparadorDetectado, setOtroSeparadorDetectado] = useState<SeparadorCsv | null>(null);
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
  const { columnaPendienteEliminacion, solicitarEliminarColumna, confirmarEliminarColumna, cancelarEliminarColumna } =
    useEliminarColumnaFormato(reglasValidacion, setColumnas, setReglasValidacion);
  const { tiposEnumerados, columnasQueUsan, guardarTipo, eliminarTipo } = useTiposEnumeradosFormato(
    sinTiposEnumerados,
    columnas,
    setColumnas,
  );

  async function subirPlantilla(evento: ChangeEvent<HTMLInputElement>) {
    const seleccionado = evento.target.files?.[0] ?? null;
    evento.target.value = "";

    if (!seleccionado) return;

    setCargandoPlantilla(true);
    setErrorGeneral(null);

    try {
      const formData = new FormData();
      formData.append("archivo", seleccionado);
      agregarTipoYSeparador(formData);

      const respuesta = await fetch("/api/formatos-excel/leer-plantilla", {
        method: "POST",
        body: formData,
      });

      if (!respuesta.ok) {
        const datosError = await respuesta.json().catch(() => null);
        setErrorGeneral(datosError?.error ?? MENSAJE_ERROR_GENERICO);
        return;
      }

      const datos = await respuesta.json().catch(() => null);
      const columnasDetectadas = (datos?.columnas as ColumnaDetectada[] | undefined) ?? [];

      archivoRef.current = seleccionado;
      setOtroSeparadorDetectado(
        tipoArchivo === "CSV" ? detectarOtroSeparador(columnasDetectadas, separadorCsv) : null,
      );
      setColumnas(
        columnasDetectadas.map((columna) => ({
          ...columna,
          requerida: false,
          tipoDato: TIPO_DATO_POR_DEFECTO,
          tipoEnumeradoNombre: null,
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

  // El tipo y el separador viajan en ambas peticiones (lectura y creación): no hay estado de
  // sesión entre pasos, y el servidor vuelve a validar que el archivo sea del tipo elegido.
  function agregarTipoYSeparador(formData: FormData) {
    formData.append("tipoArchivo", tipoArchivo);
    if (tipoArchivo === "CSV") {
      formData.append("separadorCsv", separadorCsv);
    }
  }

  function continuarASubir() {
    // Cambiar de tipo invalida la plantilla ya leída: se vuelve a pedir el archivo.
    archivoRef.current = null;
    setErrorGeneral(null);
    setPaso("subir");
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
      agregarTipoYSeparador(formData);
      formData.append("nombre", nombre);
      formData.append("descripcion", descripcion);
      formData.append(
        "columnas",
        JSON.stringify(
          columnas.map(({ nombre: nombreColumna, requerida, tipoDato, tipoEnumeradoNombre }) => ({
            nombre: nombreColumna,
            requerida,
            tipoDato,
            tipoEnumeradoNombre,
          })),
        ),
      );
      formData.append("tiposEnumerados", JSON.stringify(tiposEnumerados));
      formData.append(
        "reglasValidacion",
        JSON.stringify(
          reglasValidacion.map(({ tipo, columnas: columnasRegla, mensaje, configuracion }) => ({
            tipo,
            columnas: columnasRegla,
            configuracion,
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

  if (paso === "tipo") {
    return (
      <PasoTipoArchivoFormato
        rutaBase={rutaBase}
        tipoArchivo={tipoArchivo}
        separadorCsv={separadorCsv}
        onCambiarTipo={setTipoArchivo}
        onCambiarSeparador={setSeparadorCsv}
        onContinuar={continuarASubir}
      />
    );
  }

  if (paso === "subir") {
    return (
      <PasoSubirPlantillaFormato
        rutaBase={rutaBase}
        tipoArchivo={tipoArchivo}
        separadorCsv={separadorCsv}
        cargando={cargandoPlantilla}
        error={errorGeneral}
        onSeleccionar={subirPlantilla}
        onCambiarTipo={() => setPaso("tipo")}
      />
    );
  }

  const errorArchivo = errores.archivo ?? errores.separadorCsv;

  return (
    <div className="mt-6 flex flex-col gap-5">
      <ResumenTipoArchivoFormato
        tipoArchivo={tipoArchivo}
        separadorCsv={separadorCsv}
        otroSeparadorDetectado={otroSeparadorDetectado}
      />

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

      <GestorTiposEnumeradosFormatoExcel
        tiposEnumerados={tiposEnumerados}
        columnasQueUsan={columnasQueUsan}
        onGuardar={guardarTipo}
        onEliminar={eliminarTipo}
        error={errores.tiposEnumerados}
      />

      <TablaColumnasFormatoExcel
        columnas={columnas}
        nombresTiposEnumerados={tiposEnumerados.map((tipo) => tipo.nombre)}
        onCambiar={setColumnas}
        onEliminarColumna={solicitarEliminarColumna}
        permitirEditarNombres={permitirEditarNombresColumnas}
        error={errores.columnas}
      />

      <EditorReglasValidacionFormatoExcel
        reglas={reglasValidacion}
        columnasDisponibles={columnas}
        onCambiar={setReglasValidacion}
        error={errores.reglasValidacion}
      />

      {errorArchivo ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {errorArchivo}
        </p>
      ) : null}

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
        <Boton type="button" variante="secundario" disabled={enviando} onClick={() => setPaso("tipo")}>
          Cambiar tipo de archivo
        </Boton>
        <Link
          href={rutaBase}
          className="inline-flex items-center justify-center rounded-md border border-gob-accent bg-white px-4 py-2 text-sm font-medium text-gob-gray-a transition-colors hover:bg-gob-neutral active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
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
        onCancelar={cancelarEliminarColumna}
      />

    </div>
  );
}
