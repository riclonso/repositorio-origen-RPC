"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { BotonIcono } from "@/shared/components/BotonIcono";
import { IconoEditar, IconoEliminar } from "@/shared/components/iconos";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { TablaPanel, type ColumnaTabla } from "@/shared/components/TablaPanel";
import { useAccionConfirmable } from "@/shared/hooks/useAccionConfirmable";
import { RUTA_REGIONES } from "./ruta-regiones";

export type FilaRegionVista = {
  id: string;
  nombre: string;
  codigo: string;
  numero: number;
};

type AccionesFilaProps = {
  fila: FilaRegionVista;
  onEliminar: () => void;
};

function AccionesFila({ fila, onEliminar }: AccionesFilaProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      <BotonIcono
        etiqueta={`Editar ${fila.nombre}`}
        Icono={IconoEditar}
        href={`${RUTA_REGIONES}/${fila.id}/editar`}
      />
      <BotonIcono
        etiqueta={`Eliminar ${fila.nombre}`}
        Icono={IconoEliminar}
        tono="peligro"
        onClick={onEliminar}
      />
    </div>
  );
}

const COLUMNAS: ColumnaTabla<FilaRegionVista>[] = [
  {
    encabezado: "Número",
    className: "whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a",
    contenido: (fila) => fila.numero,
  },
  {
    encabezado: "Código",
    className: "whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a",
    contenido: (fila) => fila.codigo,
  },
  {
    encabezado: "Nombre",
    encabezadoFila: true,
    className: "min-w-48 px-3 py-2 font-medium text-gob-black",
    contenido: (fila) => fila.nombre,
  },
];

// El 409 (región en uso) o el 404 (ya eliminada por otra persona) llegan como mensaje de la API y
// se muestran dentro del diálogo, sin cerrarlo.
function eliminarRegionEnApi(fila: FilaRegionVista): Promise<Response> {
  return fetch(`/api/regiones/${fila.id}`, { method: "DELETE" });
}

type TablaRegionesProps = {
  filas: FilaRegionVista[];
  descripcion: string;
};

export function TablaRegiones({ filas, descripcion }: TablaRegionesProps) {
  const router = useRouter();
  const refrescar = useCallback(() => router.refresh(), [router]);
  const eliminacion = useAccionConfirmable(eliminarRegionEnApi, refrescar);

  return (
    <>
      <TablaPanel
        descripcion={descripcion}
        columnas={COLUMNAS}
        filas={filas}
        claveFila={(fila) => fila.id}
        anchoMinimo="min-w-2xl"
        acciones={(fila) => (
          <AccionesFila fila={fila} onEliminar={() => eliminacion.solicitar(fila)} />
        )}
        tarjeta={(fila) => (
          <>
            <p className="font-semibold text-gob-black">{fila.nombre}</p>
            <p className="mt-1 tabular-nums">
              Número {fila.numero} · Código {fila.codigo}
            </p>
            <div className="mt-3">
              <AccionesFila fila={fila} onEliminar={() => eliminacion.solicitar(fila)} />
            </div>
          </>
        )}
      />

      <DialogoConfirmacion
        abierto={eliminacion.objetivo !== null}
        titulo="Eliminar región"
        descripcion={
          eliminacion.objetivo
            ? `Se eliminará la región "${eliminacion.objetivo.nombre}". Esta acción es irreversible.`
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
