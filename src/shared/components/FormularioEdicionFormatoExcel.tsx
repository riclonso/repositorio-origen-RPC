"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { FormatoExcel, SeparadorCsv } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import { CampoSelect } from "@/shared/components/CampoSelect";
import { useEliminarColumnaFormato } from "@/shared/components/useEliminarColumnaFormato";
import { useTiposEnumeradosFormato } from "@/shared/components/useTiposEnumeradosFormato";
import { GestorTiposEnumeradosFormatoExcel } from "@/shared/components/GestorTiposEnumeradosFormatoExcel";
import {
  ETIQUETA_TIPO_ARCHIVO,
  OPCIONES_SEPARADOR_CSV,
  esSeparadorCsv,
} from "@/shared/components/opciones-formato-excel";
import { Boton } from "@/shared/components/Boton";
import { BotonIcono } from "@/shared/components/BotonIcono";
import { IconoCerrarGrande, IconoGuardarGrande } from "@/shared/components/iconos";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { TablaColumnasFormatoExcel, type ColumnaEditable } from "@/shared/components/TablaColumnasFormatoExcel";
import {
  EditorReglasValidacionFormatoExcel,
  type ReglaValidacionEditable,
} from "@/shared/components/EditorReglasValidacionFormatoExcel";

const MENSAJE_ERROR_GENERICO = "No se pudo guardar el formato. Intenta nuevamente.";

type FormularioEdicionFormatoExcelProps = {
  formato: FormatoExcel;
  // Ruta base de la pantalla que aloja este formulario ("/dashboard/formatos-excel" o
  // "/revisor/formatos-excel"): el componente es compartido entre ambos paneles, así que no
  // puede asumir una de las dos rutas para "Cancelar" ni para la redirección tras guardar.
  rutaBase: string;
  permitirEditarNombresColumnas?: boolean;
  // Guardar y cancelar como iconos flotantes al costado derecho (panel de administrador) en vez
  // de la barra inferior fija.
  barraFlotante?: boolean;
};

export function FormularioEdicionFormatoExcel({
  formato,
  rutaBase,
  permitirEditarNombresColumnas = false,
  barraFlotante = false,
}: FormularioEdicionFormatoExcelProps) {
  const router = useRouter();
  // Valores iniciales del formulario (la página remonta el componente con `key={formato.id}`).
  const [nombre, setNombre] = useState(() => formato.nombre);
  const [descripcion, setDescripcion] = useState(() => formato.descripcion ?? "");
  // Solo aplica a formatos CSV; `tipoArchivo` es inmutable y se muestra de solo lectura. Valor
  // inicial del formulario (la página remonta el componente con `key={formato.id}`).
  const [separadorCsv, setSeparadorCsv] = useState<SeparadorCsv | null>(() => formato.separadorCsv);
  // Inicializador perezoso (función, no valor): sin él, `map()` se ejecuta de nuevo en cada
  // render aunque `useState` descarte el resultado después del primero.
  const [columnas, setColumnas] = useState<ColumnaEditable[]>(() =>
    formato.columnas.map((columna) => ({
      orden: columna.orden,
      nombre: columna.nombre,
      requerida: columna.requerida,
      tipoDato: columna.tipoDato,
      tipoEnumeradoNombre: columna.tipoEnumeradoNombre,
    })),
  );
  const { tiposEnumerados, columnasQueUsan, guardarTipo, eliminarTipo } = useTiposEnumeradosFormato(
    () => formato.tiposEnumerados.map((tipo) => ({ nombre: tipo.nombre, valores: tipo.valores })),
    columnas,
    setColumnas,
  );
  const [reglasValidacion, setReglasValidacion] = useState<ReglaValidacionEditable[]>(() =>
    formato.reglasValidacion.map((regla) => ({
      tipo: regla.tipo,
      columnas: regla.columnas,
      mensaje: regla.mensaje,
      configuracion: regla.configuracion,
    })),
  );
  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const { columnaPendienteEliminacion, solicitarEliminarColumna, confirmarEliminarColumna, cancelarEliminarColumna } =
    useEliminarColumnaFormato(reglasValidacion, setColumnas, setReglasValidacion);

  async function guardar() {
    setEnviando(true);
    setErrores({});
    setErrorGeneral(null);

    try {
      const respuesta = await fetch(`/api/formatos-excel/${formato.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          descripcion: descripcion.trim().length > 0 ? descripcion : null,
          separadorCsv: formato.tipoArchivo === "CSV" ? separadorCsv : null,
          columnas: columnas.map(({ nombre: nombreColumna, requerida, tipoDato, tipoEnumeradoNombre }) => ({
            nombre: nombreColumna,
            requerida,
            tipoDato,
            tipoEnumeradoNombre,
          })),
          tiposEnumerados,
          reglasValidacion: reglasValidacion.map(({ tipo, columnas: columnasRegla, mensaje, configuracion }) => ({
            tipo,
            columnas: columnasRegla,
            configuracion,
            mensaje,
          })),
        }),
      });

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

  return (
    <div className="mt-8 flex flex-col gap-10">
      <section aria-labelledby="titulo-datos-generales" className="flex flex-col gap-4">
        <h2 id="titulo-datos-generales" className="text-base font-semibold text-gob-black">
          Datos generales
        </h2>
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
          <CampoTexto
            id="tipo-archivo"
            etiqueta="Tipo de archivo"
            value={ETIQUETA_TIPO_ARCHIVO[formato.tipoArchivo]}
            readOnly
            ayuda="No se puede cambiar después de crear el formato."
          />
          {formato.tipoArchivo === "CSV" ? (
            <CampoSelect
              id="separador-csv"
              etiqueta="Separador"
              opciones={OPCIONES_SEPARADOR_CSV}
              value={separadorCsv ?? ""}
              onChange={(evento) => {
                if (esSeparadorCsv(evento.target.value)) setSeparadorCsv(evento.target.value);
              }}
              ayuda="Los archivos que suban los notificadores se leerán con este separador."
              error={errores.separadorCsv}
            />
          ) : null}
        </div>
      </section>

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

      {errorGeneral ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {errorGeneral}
        </p>
      ) : null}

      {barraFlotante ? (
        // Acciones como iconos flotantes al costado derecho, siempre visibles mientras se
        // recorre el formulario. Cada icono lleva etiqueta accesible (`BotonIcono`).
        <div
          role="group"
          aria-label="Acciones del formato"
          className="fixed right-4 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-4 rounded-full border border-[#173b69] bg-[#173b69] p-3 shadow-[0_10px_26px_rgba(23,59,105,0.12)]"
        >
          <BotonIcono
            etiqueta="Guardar cambios"
            Icono={IconoGuardarGrande}
            tono="azul"
            grande
            deshabilitado={enviando}
            motivoDeshabilitado="Guardando cambios..."
            onClick={guardar}
          />
          <BotonIcono
            etiqueta="Cancelar y volver al listado"
            Icono={IconoCerrarGrande}
            href={rutaBase}
            grande
          />
        </div>
      ) : (
        // Barra de acciones fija al pie: en un formulario largo, "Guardar" queda a la vista sin
        // tener que volver arriba. Fondo blanco y borde superior para separarla del contenido.
        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-gob-accent bg-white py-4">
          <Link
            href={rutaBase}
            className="inline-flex items-center justify-center rounded-md border border-gob-accent bg-white px-4 py-2 text-sm font-medium text-gob-gray-a transition-colors hover:bg-gob-neutral active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
          >
            Cancelar
          </Link>
          <Boton
            type="button"
            variante="primario"
            cargando={enviando}
            textoCargando="Guardando..."
            onClick={guardar}
          >
            Guardar cambios
          </Boton>
        </div>
      )}

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
