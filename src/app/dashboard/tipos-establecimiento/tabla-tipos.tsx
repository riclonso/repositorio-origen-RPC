"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotonIcono } from "@/shared/components/BotonIcono";
import { Interruptor } from "@/shared/components/Interruptor";
import { IconoEditar } from "@/shared/components/iconos";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { TablaPanel, type ColumnaTabla } from "@/shared/components/TablaPanel";
import { RUTA_TIPOS } from "./ruta-tipos";

export type FilaTipoVista = {
  id: string;
  nombre: string;
  activo: boolean;
  creadoEl: string;
};

const MENSAJE_ERROR_GENERICO = "No se pudo actualizar el estado del tipo. Intenta nuevamente.";

type AccionesFilaProps = {
  fila: FilaTipoVista;
  onCambiarEstado: () => void;
};

function AccionesFila({ fila, onCambiarEstado }: AccionesFilaProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      <BotonIcono
        etiqueta={`Editar ${fila.nombre}`}
        Icono={IconoEditar}
        href={`${RUTA_TIPOS}/${fila.id}/editar`}
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

type TablaTiposProps = {
  filas: FilaTipoVista[];
  descripcion: string;
};

export function TablaTipos({ filas, descripcion }: TablaTiposProps) {
  const router = useRouter();
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
          <AccionesFila fila={fila} onCambiarEstado={() => setObjetivo(fila)} />
        )}
        tarjeta={(fila) => (
          <>
            <p className="font-semibold text-gob-black">{fila.nombre}</p>
            <p className="mt-1">Creado el {fila.creadoEl}</p>
            <div className="mt-3">
              <AccionesFila fila={fila} onCambiarEstado={() => setObjetivo(fila)} />
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
    </>
  );
}
