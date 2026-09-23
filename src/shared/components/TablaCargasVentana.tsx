"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CargaArchivoResumen } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { LONGITUD_MAXIMA_MOTIVO_RECHAZO } from "@/modules/reporte-excel/domain/entities/CargaArchivoRechazo";
import { BadgeEstadoCarga } from "@/shared/components/BadgeEstadoCarga";
import { Boton } from "@/shared/components/Boton";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";

// Vista liviana de una fila: solo lo que necesita esta tabla, no todo `CargaArchivoResumen`.
// `estado` decide qué acciones se ofrecen (ver `Acciones` más abajo): `APROBADA` solo puede
// rechazarse, `PENDIENTE_VISTO_BUENO` (siempre ya finalizada: el repositorio filtra las que no lo
// están) puede aprobarse o rechazarse. `fechaReporte` ya llega formateada (con
// `formatearFechaHora`, no `formatearFechaCalendario`: `createdAt` es un timestamp real, no una
// fecha "de calendario") desde el Server Component que arma esta vista
// (`ListadoCargasVentana.tsx`).
export type FilaCargaVentanaVista = Pick<
  CargaArchivoResumen,
  "id" | "usuarioNombre" | "usuarioRut" | "nombreArchivoOriginal" | "estado"
> & { fechaReporte: string };

const MENSAJE_ERROR_GENERICO = "No se pudo completar la operación. Intenta nuevamente.";

// Detalle de las cargas `APROBADA` y `PENDIENTE_VISTO_BUENO` ya finalizadas de una ventana de
// carga puntual, compartido entre `/dashboard/ventanas-carga/[id]` (ADMIN) y
// `/revisor/ventanas-carga/[id]` (REVISOR_REPOSITORIO). La descarga reutiliza el endpoint
// existente `/api/dashboard/cargas/[id]/archivo` (guardado por `exigirAdminORevisor`, y que ya solo
// sirve binarios con `estado = APROBADA`), sin modificarlo, mismo criterio que
// `DetalleCargaAprobada.tsx`. Solo se ofrece el enlace de descarga para `APROBADA`: una
// `PENDIENTE_VISTO_BUENO` todavía no tiene binario descargable por esa vía.
//
// "use client": las acciones "Aprobar" (`POST /api/dashboard/cargas/[id]/aprobacion`) y "Rechazar"
// (motivo obligatorio, `POST /api/dashboard/cargas/[id]/rechazo`) abren cada una su propio modal;
// ambas rutas son compartidas por ambos paneles y guardadas por `exigirAdminORevisor`, mismo patrón
// que `TablaSolicitudesReemplazo.tsx`.
type TablaCargasVentanaProps = {
  filas: FilaCargaVentanaVista[];
};

export function TablaCargasVentana({ filas }: TablaCargasVentanaProps) {
  const router = useRouter();

  const [objetivoRechazo, setObjetivoRechazo] = useState<FilaCargaVentanaVista | null>(null);
  const [motivo, setMotivo] = useState("");
  const [procesandoRechazo, setProcesandoRechazo] = useState(false);
  const [errorRechazo, setErrorRechazo] = useState<string | null>(null);

  const [objetivoAprobacion, setObjetivoAprobacion] = useState<FilaCargaVentanaVista | null>(null);
  const [procesandoAprobacion, setProcesandoAprobacion] = useState(false);
  const [errorAprobacion, setErrorAprobacion] = useState<string | null>(null);

  function cerrarDialogoRechazo() {
    if (procesandoRechazo) return;
    setObjetivoRechazo(null);
    setMotivo("");
    setErrorRechazo(null);
  }

  async function confirmarRechazo() {
    if (!objetivoRechazo) return;

    if (motivo.trim().length === 0) {
      setErrorRechazo("Ingresa el motivo del rechazo");
      return;
    }

    setProcesandoRechazo(true);
    setErrorRechazo(null);

    try {
      const respuesta = await fetch(`/api/dashboard/cargas/${objetivoRechazo.id}/rechazo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim() }),
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setProcesandoRechazo(false);
        setErrorRechazo(datos?.error ?? MENSAJE_ERROR_GENERICO);
        return;
      }

      setProcesandoRechazo(false);
      setObjetivoRechazo(null);
      setMotivo("");
      router.refresh();
    } catch {
      setProcesandoRechazo(false);
      setErrorRechazo(MENSAJE_ERROR_GENERICO);
    }
  }

  function cerrarDialogoAprobacion() {
    if (procesandoAprobacion) return;
    setObjetivoAprobacion(null);
    setErrorAprobacion(null);
  }

  async function confirmarAprobacion() {
    if (!objetivoAprobacion) return;

    setProcesandoAprobacion(true);
    setErrorAprobacion(null);

    try {
      const respuesta = await fetch(`/api/dashboard/cargas/${objetivoAprobacion.id}/aprobacion`, {
        method: "POST",
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setProcesandoAprobacion(false);
        setErrorAprobacion(datos?.error ?? MENSAJE_ERROR_GENERICO);
        return;
      }

      setProcesandoAprobacion(false);
      setObjetivoAprobacion(null);
      router.refresh();
    } catch {
      setProcesandoAprobacion(false);
      setErrorAprobacion(MENSAJE_ERROR_GENERICO);
    }
  }

  return (
    <>
      <div className="mt-6 overflow-x-auto rounded-lg border border-gob-accent bg-white">
        <table className="w-full min-w-2xl border-collapse text-left text-sm">
          <caption className="sr-only">Notificaciones de archivos pendientes de aprobación o rechazo</caption>
          <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
            <tr>
              <th scope="col" className="px-3 py-3 font-semibold">Reportado por</th>
              <th scope="col" className="px-3 py-3 font-semibold">Fecha de reporte</th>
              <th scope="col" className="px-3 py-3 font-semibold">Archivo</th>
              <th scope="col" className="px-3 py-3 font-semibold">Estado</th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-semibold">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gob-accent/60">
            {filas.map((fila) => (
              <tr key={fila.id} className="align-middle transition-colors hover:bg-gob-neutral/50">
                <th scope="row" className="px-3 py-2 font-medium text-gob-black">
                  {fila.usuarioNombre}
                  <span className="block text-xs tabular-nums text-gob-gray-b">{fila.usuarioRut}</span>
                </th>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a">{fila.fechaReporte}</td>
                <td className="min-w-40 break-all px-3 py-2 text-gob-gray-a">
                  {fila.nombreArchivoOriginal}
                  {fila.estado === "APROBADA" ? (
                    <a
                      href={`/api/dashboard/cargas/${fila.id}/archivo`}
                      className="ml-3 text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
                    >
                      Descargar
                    </a>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <BadgeEstadoCarga estado={fila.estado} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    {fila.estado === "PENDIENTE_VISTO_BUENO" ? (
                      <Boton variante="primario" onClick={() => setObjetivoAprobacion(fila)}>
                        Aprobar
                      </Boton>
                    ) : null}
                    <Boton variante="peligro" onClick={() => setObjetivoRechazo(fila)}>
                      Rechazar
                    </Boton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DialogoConfirmacion
        abierto={objetivoAprobacion !== null}
        titulo="Aprobar carga"
        descripcion={
          objetivoAprobacion
            ? `"${objetivoAprobacion.nombreArchivoOriginal}" (${objetivoAprobacion.usuarioNombre}) quedará aprobada y publicada para el revisor. Esta acción no se puede deshacer.`
            : ""
        }
        textoConfirmar="Aprobar carga"
        textoConfirmando="Aprobando..."
        variante="primario"
        procesando={procesandoAprobacion}
        error={errorAprobacion}
        onConfirmar={() => void confirmarAprobacion()}
        onCancelar={cerrarDialogoAprobacion}
      />

      <DialogoConfirmacion
        abierto={objetivoRechazo !== null}
        titulo="Rechazar carga"
        descripcion={
          objetivoRechazo
            ? `"${objetivoRechazo.nombreArchivoOriginal}" (${objetivoRechazo.usuarioNombre}) dejará de estar publicada o pendiente para el revisor. Esta acción es irreversible y habilitará a ${objetivoRechazo.usuarioNombre} para volver a subir un archivo. Ingresa el motivo del rechazo.`
            : ""
        }
        textoConfirmar="Rechazar carga"
        textoConfirmando="Rechazando..."
        variante="peligro"
        procesando={procesandoRechazo}
        error={errorRechazo}
        onConfirmar={() => void confirmarRechazo()}
        onCancelar={cerrarDialogoRechazo}
      >
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor="motivo-rechazo-carga" className="text-sm font-medium text-gob-black">
            Motivo del rechazo
          </label>
          <textarea
            id="motivo-rechazo-carga"
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            disabled={procesandoRechazo}
            maxLength={LONGITUD_MAXIMA_MOTIVO_RECHAZO}
            rows={3}
            required
            placeholder="Explica por qué se rechaza esta carga"
            className="w-full rounded-md border border-gob-accent bg-white px-3 py-2 text-sm text-gob-black outline-none placeholder:text-gob-gray-b focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30 disabled:bg-gob-neutral"
          />
        </div>
      </DialogoConfirmacion>
    </>
  );
}
