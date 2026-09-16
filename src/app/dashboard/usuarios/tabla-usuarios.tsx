"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";
import { BotonIcono } from "@/shared/components/BotonIcono";
import { Interruptor } from "@/shared/components/Interruptor";
import { IconoContrasena, IconoEditar } from "@/shared/components/iconos";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { TablaPanel, type ColumnaTabla } from "@/shared/components/TablaPanel";
import { RUTA_USUARIOS } from "./ruta-usuarios";

export type FilaUsuarioVista = {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  username: string;
  perfilNombre: string;
  activo: boolean;
  tieneContrasena: boolean;
  creadoEl: string;
};

const MENSAJE_ERROR_GENERICO = "No se pudo actualizar el estado del usuario. Intenta nuevamente.";

type AccionesFilaProps = {
  fila: FilaUsuarioVista;
  esPropia: boolean;
  onCambiarEstado: () => void;
};

function AccionesFila({ fila, esPropia, onCambiarEstado }: AccionesFilaProps) {
  const persona = nombreCompleto(fila);

  return (
    <div className="flex items-center justify-end gap-2">
      <BotonIcono
        etiqueta={`Editar a ${persona}`}
        Icono={IconoEditar}
        href={`${RUTA_USUARIOS}/${fila.id}/editar`}
      />
      <BotonIcono
        etiqueta={
          fila.tieneContrasena
            ? `Cambiar la contraseña de ${persona}`
            : `Definir la contraseña de ${persona}`
        }
        Icono={IconoContrasena}
        href={`${RUTA_USUARIOS}/${fila.id}/contrasena`}
      />

      {/* Una cuenta no puede desactivarse a sí misma, así que en la fila propia NO se muestra el
          interruptor: mostrarlo bloqueado invitaba a intentarlo. En su lugar, una etiqueta neutra
          indica que es la cuenta en uso. El interruptor reemplaza a la columna Estado (muestra y
          cambia el estado a la vez); el texto al lado mantiene el estado legible sin depender del
          color. */}
      {esPropia ? (
        <span className="text-sm text-gob-gray-a">Tu cuenta</span>
      ) : (
        <span className="flex items-center gap-2">
          <Interruptor
            activado={fila.activo}
            etiqueta={`Cuenta de ${persona} activa`}
            onCambiar={onCambiarEstado}
          />
          <span className="w-16 text-sm text-gob-gray-a">
            {fila.activo ? "Activo" : "Inactivo"}
          </span>
        </span>
      )}
    </div>
  );
}

function ChipPendiente() {
  return (
    <span className="mt-1 block w-fit rounded-full bg-[#fff5e3] px-2 py-0.5 text-xs font-semibold text-[#7a4b10]">
      Pendiente de activación
    </span>
  );
}

const COLUMNAS: ColumnaTabla<FilaUsuarioVista>[] = [
  {
    encabezado: "Nombre",
    encabezadoFila: true,
    className: "min-w-36 px-3 py-2 font-medium text-gob-black",
    contenido: (fila) => (
      <>
        <span>{nombreCompleto(fila)}</span>
        {!fila.tieneContrasena ? <ChipPendiente /> : null}
      </>
    ),
  },
  {
    encabezado: "RUT",
    className: "whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a",
    contenido: (fila) => fila.rut,
  },
  {
    encabezado: "Email",
    className: "px-3 py-2 text-gob-gray-a",
    contenido: (fila) => fila.email,
  },
  {
    encabezado: "Perfil",
    className: "whitespace-nowrap px-3 py-2 text-gob-gray-a",
    contenido: (fila) => fila.perfilNombre,
  },
  {
    encabezado: "Creado",
    className: "whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a",
    contenido: (fila) => fila.creadoEl,
  },
];

type TablaUsuariosProps = {
  filas: FilaUsuarioVista[];
  actorId: string;
  descripcion: string;
};

export function TablaUsuarios({ filas, actorId, descripcion }: TablaUsuariosProps) {
  const router = useRouter();
  const [objetivo, setObjetivo] = useState<FilaUsuarioVista | null>(null);
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
      const respuesta = await fetch(`/api/usuarios/${objetivo.id}/estado`, {
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
          <AccionesFila
            fila={fila}
            esPropia={fila.id === actorId}
            onCambiarEstado={() => setObjetivo(fila)}
          />
        )}
        tarjeta={(fila) => (
          <>
            <p className="font-semibold text-gob-black">{nombreCompleto(fila)}</p>
            {!fila.tieneContrasena ? <ChipPendiente /> : null}
            <p className="mt-1 tabular-nums">{fila.rut}</p>
            <p className="break-all">{fila.email}</p>
            <p className="mt-1">
              {fila.perfilNombre}, creado el {fila.creadoEl}
            </p>
            <div className="mt-3">
              <AccionesFila
                fila={fila}
                esPropia={fila.id === actorId}
                onCambiarEstado={() => setObjetivo(fila)}
              />
            </div>
          </>
        )}
      />

      <DialogoConfirmacion
        abierto={objetivo !== null}
        titulo={objetivo?.activo ? "Desactivar usuario" : "Activar usuario"}
        descripcion={
          objetivo
            ? objetivo.activo
              ? `${nombreCompleto(objetivo)} dejará de poder ingresar al sistema. Su historial se conserva.`
              : `${nombreCompleto(objetivo)} podrá volver a ingresar al sistema.`
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
