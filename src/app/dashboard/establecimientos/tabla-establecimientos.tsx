"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotonIcono } from "@/shared/components/BotonIcono";
import { Interruptor } from "@/shared/components/Interruptor";
import { IconoEditar } from "@/shared/components/iconos";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { TablaPanel, type ColumnaTabla } from "@/shared/components/TablaPanel";
import { RUTA_ESTABLECIMIENTOS } from "./ruta-establecimientos";

export type FilaEstablecimientoVista = {
  id: string;
  rut: string;
  nombre: string;
  direccion: string;
  tipoNombre: string;
  activo: boolean;
  creadoEl: string;
};

const MENSAJE_ERROR_GENERICO =
  "No se pudo actualizar el estado del establecimiento. Intenta nuevamente.";

type AccionesFilaProps = {
  fila: FilaEstablecimientoVista;
  onCambiarEstado: () => void;
};

function AccionesFila({ fila, onCambiarEstado }: AccionesFilaProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      <BotonIcono
        etiqueta={`Editar ${fila.nombre}`}
        Icono={IconoEditar}
        href={`${RUTA_ESTABLECIMIENTOS}/${fila.id}/editar`}
      />

      <span className="flex items-center gap-2">
        <Interruptor
          activado={fila.activo}
          etiqueta={`Establecimiento ${fila.nombre} activo`}
          onCambiar={onCambiarEstado}
        />
        <span className="w-16 text-sm text-gob-gray-a">
          {fila.activo ? "Activo" : "Inactivo"}
        </span>
      </span>
    </div>
  );
}

const COLUMNAS: ColumnaTabla<FilaEstablecimientoVista>[] = [
  {
    encabezado: "Nombre",
    encabezadoFila: true,
    className: "min-w-36 px-3 py-2 font-medium text-gob-black",
    contenido: (fila) => fila.nombre,
  },
  {
    encabezado: "RUT",
    className: "whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a",
    contenido: (fila) => fila.rut,
  },
  {
    encabezado: "Dirección",
    className: "px-3 py-2 text-gob-gray-a",
    contenido: (fila) => fila.direccion,
  },
  {
    encabezado: "Tipo",
    className: "whitespace-nowrap px-3 py-2 text-gob-gray-a",
    contenido: (fila) => fila.tipoNombre,
  },
  {
    encabezado: "Creado",
    className: "whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a",
    contenido: (fila) => fila.creadoEl,
  },
];

type TablaEstablecimientosProps = {
  filas: FilaEstablecimientoVista[];
  descripcion: string;
};

export function TablaEstablecimientos({ filas, descripcion }: TablaEstablecimientosProps) {
  const router = useRouter();
  const [objetivo, setObjetivo] = useState<FilaEstablecimientoVista | null>(null);
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
      const respuesta = await fetch(`/api/establecimientos/${objetivo.id}/estado`, {
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
        anchoMinimo="min-w-3xl"
        acciones={(fila) => (
          <AccionesFila fila={fila} onCambiarEstado={() => setObjetivo(fila)} />
        )}
        tarjeta={(fila) => (
          <>
            <p className="font-semibold text-gob-black">{fila.nombre}</p>
            <p className="mt-1 tabular-nums">{fila.rut}</p>
            <p className="break-words">{fila.direccion}</p>
            <p className="mt-1">
              {fila.tipoNombre}, creado el {fila.creadoEl}
            </p>
            <div className="mt-3">
              <AccionesFila fila={fila} onCambiarEstado={() => setObjetivo(fila)} />
            </div>
          </>
        )}
      />

      <DialogoConfirmacion
        abierto={objetivo !== null}
        titulo={objetivo?.activo ? "Desactivar establecimiento" : "Activar establecimiento"}
        descripcion={
          objetivo
            ? objetivo.activo
              ? `"${objetivo.nombre}" quedará inactivo. Su historial se conserva.`
              : `"${objetivo.nombre}" volverá a estar activo.`
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
