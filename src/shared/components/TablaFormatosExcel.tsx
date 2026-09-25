"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FormatoExcelResumen, TipoArchivo } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import { BotonIcono } from "@/shared/components/BotonIcono";
import { Interruptor } from "@/shared/components/Interruptor";
import { IconoDescargar, IconoEditar, IconoEliminar } from "@/shared/components/iconos";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";

const MENSAJE_ERROR_GENERICO = "No se pudo actualizar el estado del formato. Intenta nuevamente.";
const MENSAJE_ERROR_ELIMINACION = "No se pudo eliminar el formato. Intenta nuevamente.";

const ETIQUETAS_TIPO_ARCHIVO: Record<TipoArchivo, string> = {
  EXCEL: "Excel (.xlsx)",
  CSV: "CSV",
};

type TablaFormatosExcelProps = {
  filas: FormatoExcelResumen[];
  // Ruta base de la pantalla que renderiza esta tabla ("/dashboard/formatos-excel" o
  // "/revisor/formatos-excel"): el componente es compartido entre ambos paneles, así que no
  // puede asumir una de las dos rutas.
  rutaBase: string;
};

export function TablaFormatosExcel({ filas, rutaBase }: TablaFormatosExcelProps) {
  const router = useRouter();
  const [objetivo, setObjetivo] = useState<FormatoExcelResumen | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objetivoEliminacion, setObjetivoEliminacion] = useState<FormatoExcelResumen | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminacion, setErrorEliminacion] = useState<string | null>(null);

  function cerrarDialogo() {
    if (procesando) return;
    setObjetivo(null);
    setError(null);
  }

  async function confirmarCambioEstado() {
    if (!objetivo) return;

    setProcesando(true);
    setError(null);

    try {
      const respuesta = await fetch(`/api/formatos-excel/${objetivo.id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !objetivo.activo }),
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setProcesando(false);
        setError(datos?.error ?? MENSAJE_ERROR_GENERICO);
        return;
      }

      setProcesando(false);
      setObjetivo(null);
      router.refresh();
    } catch {
      setProcesando(false);
      setError(MENSAJE_ERROR_GENERICO);
    }
  }

  function cerrarDialogoEliminacion() {
    if (eliminando) return;
    setObjetivoEliminacion(null);
    setErrorEliminacion(null);
  }

  async function confirmarEliminacion() {
    if (!objetivoEliminacion) return;
    setEliminando(true);
    setErrorEliminacion(null);

    try {
      const respuesta = await fetch(`/api/formatos-excel/${objetivoEliminacion.id}`, { method: "DELETE" });
      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setEliminando(false);
        setErrorEliminacion(datos?.error ?? MENSAJE_ERROR_ELIMINACION);
        return;
      }
      setEliminando(false);
      setObjetivoEliminacion(null);
      router.refresh();
    } catch {
      setEliminando(false);
      setErrorEliminacion(MENSAJE_ERROR_ELIMINACION);
    }
  }

  return (
    <>
      <div className="mt-6 overflow-x-auto rounded-lg border border-gob-accent bg-white">
        <table className="w-full min-w-2xl border-collapse text-left text-sm">
          <caption className="sr-only">Formatos de archivo configurados</caption>
          <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
            <tr>
              <th scope="col" className="px-3 py-3 font-semibold">Nombre</th>
              <th scope="col" className="px-3 py-3 font-semibold">Tipo de archivo</th>
              <th scope="col" className="px-3 py-3 font-semibold">Columnas</th>
              <th scope="col" className="px-3 py-3 font-semibold">Reglas</th>
              <th scope="col" className="px-3 py-3 font-semibold">Usuarios asignados</th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-semibold">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gob-accent/60">
            {filas.map((fila) => (
              <tr key={fila.id} className="align-middle transition-colors hover:bg-gob-neutral/50">
                <th scope="row" className="min-w-36 px-3 py-2 font-medium text-gob-black">
                  {fila.nombre}
                </th>
                <td className="whitespace-nowrap px-3 py-2 text-gob-gray-a">
                  {ETIQUETAS_TIPO_ARCHIVO[fila.tipoArchivo]}
                </td>
                <td className="px-3 py-2 tabular-nums text-gob-gray-a">{fila.cantidadColumnas}</td>
                <td className="px-3 py-2 tabular-nums text-gob-gray-a">{fila.cantidadReglas}</td>
                <td className="px-3 py-2 tabular-nums text-gob-gray-a">{fila.cantidadUsuariosAsignados}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <BotonIcono
                      etiqueta={`Descargar plantilla de ${fila.nombre}`}
                      Icono={IconoDescargar}
                      href={`/api/formatos-excel/${fila.id}/plantilla`}
                    />
                    <BotonIcono
                      etiqueta={`Editar ${fila.nombre}`}
                      Icono={IconoEditar}
                      href={`${rutaBase}/${fila.id}/editar`}
                    />
                    <button
                      type="button"
                      disabled={!fila.puedeEliminar}
                      onClick={() => setObjetivoEliminacion(fila)}
                      aria-label={`Eliminar ${fila.nombre}`}
                      title={
                        fila.puedeEliminar
                          ? `Eliminar ${fila.nombre}`
                          : "No puedes eliminar un formato con ventanas de carga asociadas"
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gob-danger text-gob-danger transition-colors hover:bg-gob-danger/10 disabled:cursor-not-allowed disabled:border-gob-accent disabled:text-gob-gray-a disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-danger"
                    >
                      <IconoEliminar />
                    </button>

                    <span className="flex items-center gap-2">
                      <Interruptor
                        activado={fila.activo}
                        etiqueta={`Formato ${fila.nombre} activo`}
                        onCambiar={() => setObjetivo(fila)}
                      />
                      <span className="w-16 text-sm text-gob-gray-a">
                        {fila.activo ? "Activo" : "Inactivo"}
                      </span>
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DialogoConfirmacion
        abierto={objetivo !== null}
        titulo={objetivo?.activo ? "Desactivar formato" : "Activar formato"}
        descripcion={
          objetivo
            ? objetivo.activo
              ? `"${objetivo.nombre}" dejará de poder asignarse a nuevos usuarios. Quienes ya lo tienen asignado lo conservan.`
              : `"${objetivo.nombre}" quedará disponible para asignarse a usuarios.`
            : ""
        }
        textoConfirmar={objetivo?.activo ? "Desactivar" : "Activar"}
        textoConfirmando="Guardando..."
        variante={objetivo?.activo ? "peligro" : "primario"}
        procesando={procesando}
        error={error}
        onConfirmar={confirmarCambioEstado}
        onCancelar={cerrarDialogo}
      />

      <DialogoConfirmacion
        abierto={objetivoEliminacion !== null}
        titulo="Eliminar formato de archivo"
        descripcion={
          objetivoEliminacion
            ? `Eliminarás permanentemente el formato “${objetivoEliminacion.nombre}” y sus asignaciones a usuarios. Esta acción no se puede deshacer.`
            : ""
        }
        textoConfirmar="Eliminar formato"
        textoConfirmando="Eliminando..."
        variante="peligro"
        procesando={eliminando}
        error={errorEliminacion}
        onConfirmar={confirmarEliminacion}
        onCancelar={cerrarDialogoEliminacion}
      />
    </>
  );
}
