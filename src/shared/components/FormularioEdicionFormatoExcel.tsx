"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { FormatoExcel } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import { Boton } from "@/shared/components/Boton";
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
};

export function FormularioEdicionFormatoExcel({ formato, rutaBase }: FormularioEdicionFormatoExcelProps) {
  const router = useRouter();
  const [nombre, setNombre] = useState(formato.nombre);
  const [descripcion, setDescripcion] = useState(formato.descripcion ?? "");
  // Inicializador perezoso (función, no valor): sin él, `map()` se ejecuta de nuevo en cada
  // render aunque `useState` descarte el resultado después del primero.
  const [columnas, setColumnas] = useState<ColumnaEditable[]>(() =>
    formato.columnas.map((columna) => ({
      orden: columna.orden,
      nombre: columna.nombre,
      requerida: columna.requerida,
      tipoDato: columna.tipoDato,
    })),
  );
  const [reglasValidacion, setReglasValidacion] = useState<ReglaValidacionEditable[]>(() =>
    formato.reglasValidacion.map((regla) => ({
      tipo: regla.tipo,
      columnas: regla.columnas,
      mensaje: regla.mensaje,
    })),
  );
  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [columnaPendienteEliminacion, setColumnaPendienteEliminacion] = useState<ColumnaEditable | null>(null);

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
          columnas: columnas.map(({ nombre: nombreColumna, requerida, tipoDato }) => ({
            nombre: nombreColumna,
            requerida,
            tipoDato,
          })),
          reglasValidacion: reglasValidacion.map(({ tipo, columnas: columnasRegla, mensaje }) => ({
            tipo,
            columnas: columnasRegla,
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

  function eliminarColumnaYReglas(columnaAEliminar: ColumnaEditable) {
    const nombreNormalizado = columnaAEliminar.nombre.trim().toLocaleLowerCase();

    setColumnas((actuales) =>
      actuales
        .filter((columna) => columna !== columnaAEliminar)
        .map((columna, indice) => ({ ...columna, orden: indice + 1 })),
    );
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
          onClick={guardar}
        >
          Guardar cambios
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
