"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { BotonIcono } from "@/shared/components/BotonIcono";
import { IconoEditar, IconoEliminar } from "@/shared/components/iconos";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { TablaPanel, type ColumnaTabla } from "@/shared/components/TablaPanel";
import { useAccionConfirmable } from "@/shared/hooks/useAccionConfirmable";
import { RUTA_PROVINCIAS } from "./ruta-provincias";

export type FilaProvinciaVista = {
  id: string;
  nombre: string;
  codigo: string;
  // Ya formateada por la página ("08 · Biobío").
  region: string;
};

type AccionesFilaProps = {
  fila: FilaProvinciaVista;
  onEliminar: () => void;
};

function AccionesFila({ fila, onEliminar }: AccionesFilaProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      <BotonIcono
        etiqueta={`Editar ${fila.nombre}`}
        Icono={IconoEditar}
        href={`${RUTA_PROVINCIAS}/${fila.id}/editar`}
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

const COLUMNAS: ColumnaTabla<FilaProvinciaVista>[] = [
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
  {
    encabezado: "Región",
    className: "min-w-48 px-3 py-2 text-gob-gray-a",
    contenido: (fila) => fila.region,
  },
];

// El 409 (provincia en uso) o el 404 (ya eliminada por otra persona) llegan como mensaje de la API
// y se muestran dentro del diálogo, sin cerrarlo.
function eliminarProvinciaEnApi(fila: FilaProvinciaVista): Promise<Response> {
  return fetch(`/api/provincias/${fila.id}`, { method: "DELETE" });
}

type TablaProvinciasProps = {
  filas: FilaProvinciaVista[];
  descripcion: string;
};

export function TablaProvincias({ filas, descripcion }: TablaProvinciasProps) {
  const router = useRouter();
  const refrescar = useCallback(() => router.refresh(), [router]);
  const eliminacion = useAccionConfirmable(eliminarProvinciaEnApi, refrescar);

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
              Código {fila.codigo} · Región {fila.region}
            </p>
            <div className="mt-3">
              <AccionesFila fila={fila} onEliminar={() => eliminacion.solicitar(fila)} />
            </div>
          </>
        )}
      />

      <DialogoConfirmacion
        abierto={eliminacion.objetivo !== null}
        titulo="Eliminar provincia"
        descripcion={
          eliminacion.objetivo
            ? `Se eliminará la provincia "${eliminacion.objetivo.nombre}". Esta acción es irreversible.`
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
