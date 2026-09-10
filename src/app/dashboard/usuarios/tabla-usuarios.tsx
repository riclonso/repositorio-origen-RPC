"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";
import { BotonIcono } from "@/shared/components/BotonIcono";
import { Interruptor } from "@/shared/components/Interruptor";
import { IconoContrasena, IconoEditar } from "@/shared/components/iconos";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
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
  creadoEl: string;
};

const MENSAJE_ERROR_GENERICO = "No se pudo actualizar el estado del usuario. Intenta nuevamente.";

type AccionesFilaProps = {
  fila: FilaUsuarioVista;
  esPropia: boolean;
  onCambiarEstado: () => void;
};

function AccionesFila({ fila, esPropia, onCambiarEstado }: AccionesFilaProps) {
  const bloqueada = esPropia && fila.activo;
  const idMotivo = `motivo-${fila.id}`;
  const persona = nombreCompleto(fila);
  // Un solo texto para el tooltip del puntero y la descripción del lector de pantalla, para que
  // ambos digan exactamente lo mismo.
  const MOTIVO_BLOQUEO = "No puedes desactivar tu propia cuenta";

  return (
    <div className="flex items-center justify-end gap-2">
      <BotonIcono
        etiqueta={`Editar a ${persona}`}
        Icono={IconoEditar}
        href={`${RUTA_USUARIOS}/${fila.id}/editar`}
      />
      <BotonIcono
        etiqueta={`Cambiar la contraseña de ${persona}`}
        Icono={IconoContrasena}
        href={`${RUTA_USUARIOS}/${fila.id}/contrasena`}
      />

      {/* El interruptor reemplaza al botón de desactivar y además muestra el estado, así que la
          columna Estado desaparece: repetir el mismo dato dos veces en la misma fila solo
          agrega ruido. El texto al lado mantiene el estado legible sin depender del color. */}
      <span className="flex items-center gap-2">
        <Interruptor
          activado={fila.activo}
          etiqueta={`Cuenta de ${persona} activa`}
          onCambiar={onCambiarEstado}
          bloqueado={bloqueada}
          idDescripcion={bloqueada ? idMotivo : undefined}
          tooltip={bloqueada ? MOTIVO_BLOQUEO : undefined}
        />
        <span className="w-16 text-sm text-gob-gray-a">
          {fila.activo ? "Activo" : "Inactivo"}
        </span>
      </span>

      {bloqueada ? (
        <span id={idMotivo} className="sr-only">
          {MOTIVO_BLOQUEO}
        </span>
      ) : null}
    </div>
  );
}

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
      <div className="mt-6 hidden overflow-x-auto rounded-lg border border-gob-accent bg-white md:block">
        <table className="w-full min-w-3xl border-collapse text-left text-sm">
          <caption className="sr-only">{descripcion}</caption>
          <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
            <tr>
              <th scope="col" className="px-3 py-3 font-semibold">Nombre</th>
              <th scope="col" className="px-3 py-3 font-semibold">RUT</th>
              <th scope="col" className="px-3 py-3 font-semibold">Email</th>
              <th scope="col" className="px-3 py-3 font-semibold">Perfil</th>
              <th scope="col" className="px-3 py-3 font-semibold">Creado</th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-semibold">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gob-accent/60">
            {filas.map((fila) => (
              <tr key={fila.id} className="align-middle transition-colors hover:bg-gob-neutral/50">
                <th scope="row" className="min-w-36 px-3 py-2 font-medium text-gob-black">
                  {nombreCompleto(fila)}
                </th>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a">
                  {fila.rut}
                </td>
                <td className="px-3 py-2 text-gob-gray-a">{fila.email}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gob-gray-a">
                  {fila.perfilNombre}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a">
                  {fila.creadoEl}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <AccionesFila
                    fila={fila}
                    esPropia={fila.id === actorId}
                    onCambiarEstado={() => setObjetivo(fila)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-6 flex flex-col gap-3 md:hidden">
        {filas.map((fila) => (
          <li
            key={fila.id}
            className="rounded-lg border border-gob-accent bg-white p-4 text-sm text-gob-gray-a"
          >
            <p className="font-semibold text-gob-black">{nombreCompleto(fila)}</p>
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
          </li>
        ))}
      </ul>

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
