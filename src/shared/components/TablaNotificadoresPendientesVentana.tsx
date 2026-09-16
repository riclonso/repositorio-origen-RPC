"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/shared/components/Boton";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { ModalEnviarAlertaIndividual, type PendienteAlertaVista } from "@/shared/components/ModalEnviarAlertaIndividual";
import { useAccionConfirmable } from "@/shared/hooks/useAccionConfirmable";

const MENSAJE_ERROR_GENERICO = "No se pudo completar la operación. Intenta nuevamente.";

export type { PendienteAlertaVista };

type TablaNotificadoresPendientesVentanaProps = {
  ventanaCargaId: string;
  pendientes: PendienteAlertaVista[];
  correoDisponible: boolean;
};

// RF-17: notificadores NOTIFICADOR_RPC pendientes de reportar en esta ventana, con envío
// individual por fila y envío masivo a todos los de la lista.
export function TablaNotificadoresPendientesVentana({
  ventanaCargaId,
  pendientes,
  correoDisponible,
}: TablaNotificadoresPendientesVentanaProps) {
  const router = useRouter();

  // Envío masivo: mismo hook genérico que el resto del módulo (publicar/archivar/eliminar), sin
  // parámetro adicional en la confirmación. El objetivo es `true` (no `null`): el hook usa
  // `objetivo === null` como el sentinel de "sin diálogo abierto".
  const envioMasivo = useAccionConfirmable<true>(
    () => fetch(`/api/dashboard/ventanas-carga/${ventanaCargaId}/alertas/enviar-masivo`, { method: "POST" }),
    () => router.refresh(),
  );

  // Envío individual: el mensaje editado en el modal solo se conoce al momento de confirmar (el
  // operador puede seguir editándolo), así que no cabe en la forma de `useAccionConfirmable`
  // (un solo objetivo fijo desde que se solicita). Estado propio, misma semántica.
  const [destinatario, setDestinatario] = useState<PendienteAlertaVista | null>(null);
  const [procesandoIndividual, setProcesandoIndividual] = useState(false);
  const [errorIndividual, setErrorIndividual] = useState<string | null>(null);

  const cancelarIndividual = useCallback(() => {
    if (procesandoIndividual) return;
    setDestinatario(null);
    setErrorIndividual(null);
  }, [procesandoIndividual]);

  const confirmarIndividual = useCallback(
    async (mensajeHtml: string) => {
      if (!destinatario) return;

      setProcesandoIndividual(true);
      setErrorIndividual(null);

      try {
        const respuesta = await fetch(
          `/api/dashboard/ventanas-carga/${ventanaCargaId}/alertas/enviar-individual`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usuarioId: destinatario.id, mensaje: mensajeHtml }),
          },
        );

        if (!respuesta.ok) {
          const datos = await respuesta.json().catch(() => null);
          setErrorIndividual(datos?.error ?? MENSAJE_ERROR_GENERICO);
          setProcesandoIndividual(false);
          return;
        }

        setDestinatario(null);
        setProcesandoIndividual(false);
        router.refresh();
      } catch {
        setErrorIndividual(MENSAJE_ERROR_GENERICO);
        setProcesandoIndividual(false);
      }
    },
    [destinatario, ventanaCargaId, router],
  );

  return (
    <section aria-labelledby="titulo-pendientes-alerta" className="rounded-lg border border-gob-accent bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="titulo-pendientes-alerta" className="text-sm font-semibold text-gob-black">
          Notificadores pendientes ({pendientes.length})
        </h3>
        {pendientes.length > 0 ? (
          <Boton variante="primario" disabled={!correoDisponible} onClick={() => envioMasivo.solicitar(true)}>
            Enviar aviso masivo
          </Boton>
        ) : null}
      </div>

      {!correoDisponible ? (
        <p className="mt-2 text-sm text-gob-danger">
          El envío de correo no está configurado en el servidor: no es posible enviar avisos.
        </p>
      ) : null}

      {pendientes.length === 0 ? (
        <p className="mt-3 text-sm text-gob-gray-a">No hay notificadores pendientes de reportar.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-lg border-collapse text-left text-sm">
            <caption className="sr-only">Notificadores pendientes de reportar</caption>
            <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Nombre</th>
                <th scope="col" className="px-3 py-2 font-semibold">Correo</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gob-accent/60">
              {pendientes.map((pendiente) => (
                <tr key={pendiente.id}>
                  <td className="px-3 py-2 text-gob-black">{pendiente.nombreCompleto}</td>
                  <td className="px-3 py-2 text-gob-gray-a">{pendiente.email}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <Boton
                      variante="texto"
                      disabled={!correoDisponible}
                      onClick={() => {
                        setErrorIndividual(null);
                        setDestinatario(pendiente);
                      }}
                    >
                      Enviar aviso
                    </Boton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DialogoConfirmacion
        abierto={envioMasivo.objetivo !== null}
        titulo="Enviar aviso masivo"
        descripcion={`Se enviará un correo a los ${pendientes.length} notificadores pendientes de esta ventana.`}
        textoConfirmar="Enviar"
        textoConfirmando="Enviando..."
        variante="primario"
        procesando={envioMasivo.procesando}
        error={envioMasivo.error}
        onConfirmar={() => void envioMasivo.confirmar()}
        onCancelar={envioMasivo.cancelar}
      />

      <ModalEnviarAlertaIndividual
        destinatario={destinatario}
        procesando={procesandoIndividual}
        error={errorIndividual}
        onConfirmar={(mensajeHtml) => void confirmarIndividual(mensajeHtml)}
        onCancelar={cancelarIndividual}
      />
    </section>
  );
}
