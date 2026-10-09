"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { BotonIcono } from "@/shared/components/BotonIcono";
import { Interruptor } from "@/shared/components/Interruptor";
import { IconoEditar, IconoEliminar } from "@/shared/components/iconos";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { TablaPanel, type ColumnaTabla } from "@/shared/components/TablaPanel";
import { useAccionConfirmable } from "@/shared/hooks/useAccionConfirmable";

export type FilaTipoVista = {
  id: string;
  nombre: string;
  activo: boolean;
  creadoEl: string;
  // RF-29: establecimientos (activos e inactivos) que usan el tipo. Si es mayor que cero, el tipo
  // no puede eliminarse, solo desactivarse. Es una ayuda visual: la API revalida con la FK.
  cantidadEstablecimientos: number;
};

const MENSAJE_ERROR_GENERICO = "No se pudo actualizar el estado del tipo. Intenta nuevamente.";

function motivoNoEliminable(cantidadEstablecimientos: number): string {
  const asociados =
    cantidadEstablecimientos === 1
      ? "1 establecimiento"
      : `${cantidadEstablecimientos} establecimientos`;

  return `No se puede eliminar: el tipo está asociado a ${asociados}. Puedes desactivarlo.`;
}

type AccionesFilaProps = {
  fila: FilaTipoVista;
  rutaBase: string;
  onCambiarEstado: () => void;
  onEliminar: () => void;
};

function AccionesFila({ fila, rutaBase, onCambiarEstado, onEliminar }: AccionesFilaProps) {
  const enUso = fila.cantidadEstablecimientos > 0;

  return (
    <div className="flex items-center justify-end gap-2">
      <BotonIcono
        etiqueta={`Editar ${fila.nombre}`}
        Icono={IconoEditar}
        href={`${rutaBase}/${fila.id}/editar`}
      />
      <BotonIcono
        etiqueta={`Eliminar ${fila.nombre}`}
        Icono={IconoEliminar}
        tono="peligro"
        onClick={onEliminar}
        deshabilitado={enUso}
        motivoDeshabilitado={enUso ? motivoNoEliminable(fila.cantidadEstablecimientos) : undefined}
      />

      <span className="flex items-center gap-2">
        <Interruptor
          activado={fila.activo}
          etiqueta={`Tipo ${fila.nombre} activo`}
          onCambiar={onCambiarEstado}
        />
        <span className="w-16 text-sm text-gob-gray-a">
          {fila.activo ? "Activo" : "Inactivo"}
        </span>
      </span>
    </div>
  );
}

const COLUMNAS: ColumnaTabla<FilaTipoVista>[] = [
  {
    encabezado: "Nombre",
    encabezadoFila: true,
    className: "min-w-36 px-3 py-2 font-medium text-gob-black",
    contenido: (fila) => fila.nombre,
  },
  {
    encabezado: "Creado",
    className: "whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a",
    contenido: (fila) => fila.creadoEl,
  },
];

// El 409 (tipo en uso, p. ej. asignado a un establecimiento después de cargar la página) o el 404
// (ya eliminado por otra persona) llegan como mensaje de la API y se muestran dentro del diálogo.
function eliminarTipoEnApi(fila: FilaTipoVista): Promise<Response> {
  return fetch(`/api/tipos-establecimiento/${fila.id}`, { method: "DELETE" });
}

type TablaTiposProps = {
  filas: FilaTipoVista[];
  descripcion: string;
  // "/dashboard/tipos-establecimiento" o "/revisor/tipos-establecimiento".
  rutaBase: string;
};

export function TablaTipos({ filas, descripcion, rutaBase }: TablaTiposProps) {
  const router = useRouter();
  const refrescar = useCallback(() => router.refresh(), [router]);
  const eliminacion = useAccionConfirmable(eliminarTipoEnApi, refrescar);
  const [objetivo, setObjetivo] = useState<FilaTipoVista | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const respuesta = await fetch(`/api/tipos-establecimiento/${objetivo.id}/estado`, {
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

  return (
    <>
      <TablaPanel
        descripcion={descripcion}
        columnas={COLUMNAS}
        filas={filas}
        claveFila={(fila) => fila.id}
        anchoMinimo="min-w-2xl"
        acciones={(fila) => (
          <AccionesFila
            fila={fila} rutaBase={rutaBase}
            onCambiarEstado={() => setObjetivo(fila)}
            onEliminar={() => eliminacion.solicitar(fila)}
          />
        )}
        tarjeta={(fila) => (
          <>
            <p className="font-semibold text-gob-black">{fila.nombre}</p>
            <p className="mt-1">Creado el {fila.creadoEl}</p>
            <div className="mt-3">
              <AccionesFila
                fila={fila} rutaBase={rutaBase}
                onCambiarEstado={() => setObjetivo(fila)}
                onEliminar={() => eliminacion.solicitar(fila)}
              />
            </div>
          </>
        )}
      />

      <DialogoConfirmacion
        abierto={objetivo !== null}
        titulo={objetivo?.activo ? "Desactivar tipo" : "Activar tipo"}
        descripcion={
          objetivo
            ? objetivo.activo
              ? `"${objetivo.nombre}" dejará de ofrecerse al crear establecimientos. Los que ya lo usan no se modifican.`
              : `"${objetivo.nombre}" volverá a ofrecerse al crear establecimientos.`
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
        abierto={eliminacion.objetivo !== null}
        titulo="Eliminar tipo de establecimiento"
        descripcion={
          eliminacion.objetivo
            ? `Se eliminará el tipo "${eliminacion.objetivo.nombre}". Esta acción es irreversible.`
            : ""
        }
        textoConfirmar="Eliminar"
        textoConfirmando="Eliminando..."
        variante="peligro"
        procesando={eliminacion.procesando}
        error={eliminacion.error}
        onConfirmar={eliminacion.confirmar}
        onCancelar={eliminacion.cancelar}
      />
    </>
  );
}
