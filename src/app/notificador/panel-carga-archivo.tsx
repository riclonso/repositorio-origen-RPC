"use client";

import { useEffect, useState, ViewTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  CargaArchivoResumenConPublicacion,
  ErrorCargaArchivo,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { rechazoPosteriorAAprobacion } from "@/modules/reporte-excel/domain/entities/CargaArchivoRechazo";
import type {
  EstadoSolicitudReemplazoCarga,
  OrigenSolicitudReemplazoCarga,
} from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { BadgeEstadoCarga } from "@/shared/components/BadgeEstadoCarga";
import {
  idTarjetaVentana,
  type ReaperturaVigentePropiaVista,
} from "@/shared/components/BannerReaperturaCarga";
import { BannerMensajesSinLeer } from "@/shared/components/BannerMensajesSinLeer";
import { Boton } from "@/shared/components/Boton";
import { BotonMensajesVentana } from "@/shared/components/BotonMensajesVentana";
import { CargadorArchivo } from "@/shared/components/CargadorArchivo";
import { FormularioSolicitudReemplazo } from "@/shared/components/FormularioSolicitudReemplazo";
import { tituloVentanaMensajes, type VentanaMensajesSinLeerVista } from "@/modules/mensajeria/schemas/vistas-mensajeria";
import type { ResumenMensajesPorVentana } from "@/modules/mensajeria/domain/entities/MensajeCarga";
import { ModalCargaExitosa } from "@/shared/components/ModalCargaExitosa";
import { ModalErroresCarga } from "@/shared/components/ModalErroresCarga";
import {
  IconoDescargar,
  IconoSubir,
} from "@/shared/components/iconos";
import { formatearFechaHora } from "@/shared/utils/fecha";
import estilosIndicador from "@/shared/components/IndicadorMensajes.module.css";
import estilosTarjeta from "./tarjeta-carga.module.css";

// Vista liviana de las cargas propias del notificador: mismos campos que `CargaArchivoResumenDTO`,
// con las fechas ya como texto (llegan así tanto desde el servidor -prop inicial- como desde
// `fetch` -tras subir o dar visto bueno-). Este panel ya no renderiza su propia tabla con todas las
// cargas (se movió a "Mis cargas" en el menú lateral, `/notificador/cargas`); aquí solo se deriva de
// ella el historial de intentos fallidos por tarjeta y qué combinaciones ya tienen una carga
// aprobada vigente (`publicacionActiva` permite descartar una `APROBADA` ya superada).
export type CargaResumenVista = Omit<CargaArchivoResumenConPublicacion, "createdAt" | "vistoBuenoEn" | "finalizadaEn"> & {
  createdAt: string;
  vistoBuenoEn: string | null;
  finalizadaEn: string | null;
};

// Vista del resultado de una subida recién hecha: incluye el detalle de errores.
type CargaDetalleVista = CargaResumenVista & { errores: ErrorCargaArchivo[] };

// Vista liviana de una solicitud de reemplazo propia, mismos campos que
// `SolicitudReemplazoPropiaDTO` que necesita este panel para decidir el estado de cada
// combinación: sin `vencida`/`utilizable` recalculados en el cliente, se usan los que ya resolvió el
// servidor. `utilizable` es lo que habilita subir: una `APROBADA` ya consumida no está vencida pero
// tampoco habilita nada. Llegan ordenadas de la más reciente a la más antigua.
export type SolicitudReemplazoPropiaVista = {
  id: string;
  cargaArchivoId: string;
  estado: EstadoSolicitudReemplazoCarga;
  origen: OrigenSolicitudReemplazoCarga;
  vencida: boolean;
  utilizable: boolean;
  // RF-36: hasta cuándo habilita la subida (ISO), resuelto en el servidor. `null` si no está aprobada.
  venceEl: string | null;
};

// Qué habilita reemplazar la `APROBADA` vigente de una combinación: una solicitud de reemplazo
// aprobada y utilizable, o una reapertura posterior a esa aprobación (se rechazó la carga de
// reemplazo). `null` = no hay habilitación: la tarjeta ofrece solicitar el reemplazo.
type HabilitacionReemplazo = "SOLICITUD" | "REAPERTURA" | null;

// RF-15 (ampliación): una combinación (formato asignado, ventana disponible) cuyo tipo de archivo
// coincide, resuelta en el Server Component (`app/notificador/page.tsx`). Reemplaza a los dos
// `<select>` de formato y año: cada combinación se muestra como su propia sección.
export type CombinacionCargaVista = {
  formatoExcelId: string;
  formatoNombre: string;
  anio: number;
  ventanaCargaId: string;
  // RF-36: ventana cerrada POR FECHA (publicada, no archivada) que se muestra solo porque el
  // notificador tiene una solicitud de reemplazo en curso o una habilitación fuera de plazo vigente.
  cerrada: boolean;
};

const MENSAJE_ERROR_GENERICO = "No se pudo completar la operación. Intenta nuevamente.";

function formatearFechaHoraIso(iso: string): string {
  return formatearFechaHora(new Date(iso));
}

// `vista=panel`: misma fuente que el Server Component (intentos recientes + cargas que determinan el
// estado de cada tarjeta), para que el refresco no dependa del corte de una página.
async function obtenerMisCargas(): Promise<CargaResumenVista[] | null> {
  const respuesta = await fetch("/api/notificador/cargas?vista=panel");
  if (!respuesta.ok) return null;
  const datos = (await respuesta.json()) as { datos: CargaResumenVista[] };
  return datos.datos;
}

async function obtenerMisSolicitudes(): Promise<SolicitudReemplazoPropiaVista[] | null> {
  const respuesta = await fetch("/api/notificador/solicitudes-reemplazo");
  if (!respuesta.ok) return null;
  const datos = (await respuesta.json()) as { datos: SolicitudReemplazoPropiaVista[] };
  return datos.datos;
}

function claveCombinacion(combinacion: CombinacionCargaVista): string {
  return `${combinacion.formatoExcelId}::${combinacion.ventanaCargaId}`;
}

// RF-31: aviso flotante de mensajes del equipo revisor. `total` evita mostrar una burbuja en una
// conversación inexistente; si existe pero no hay pendientes, se conserva sin contador.
function avisoMensajesDeCombinacion(
  combinacion: CombinacionCargaVista,
  mensajesPorVentana: ResumenMensajesPorVentana,
): ReactNode {
  const resumen = mensajesPorVentana[combinacion.ventanaCargaId];
  if (!resumen || resumen.total === 0) return null;

  return (
    <BotonMensajesVentana
      lado="NOTIFICADOR"
      ventanaCargaId={combinacion.ventanaCargaId}
      tituloVentana={tituloVentanaMensajes(combinacion.formatoNombre, combinacion.anio)}
      noLeidos={resumen.noLeidos}
      variante="flotante"
    />
  );
}

// La carga vigente de una combinación (formato, ventana) es su APROBADA más reciente por
// `vistoBuenoEn` cuya publicación no fue desactivada, mismo criterio que
// `obtenerAprobadaVigentePorUsuarioYVentana` del servidor: una aprobación ya superada por un
// reemplazo (`publicacionActiva = false`) nunca vuelve a bloquear la tarjeta.
function cargaAprobadaVigente(cargas: CargaResumenVista[], ventanaCargaId: string): CargaResumenVista | null {
  const aprobadas = cargas.filter(
    (carga) =>
      carga.ventanaCargaId === ventanaCargaId && carga.estado === "APROBADA" && carga.publicacionActiva !== false,
  );
  if (aprobadas.length === 0) return null;

  return aprobadas.reduce((vigente, actual) => {
    if (!vigente.vistoBuenoEn) return actual;
    if (!actual.vistoBuenoEn) return vigente;
    return actual.vistoBuenoEn > vigente.vistoBuenoEn ? actual : vigente;
  });
}

// Corrección (fin de la autoaprobación): una combinación (formato, ventana) con una carga
// `PENDIENTE_VISTO_BUENO` que el notificador ya finalizó y envió, y que todavía nadie decidió
// (aprobó o rechazó). Mientras exista, la tarjeta se muestra "bloqueada" (sin admitir una subida
// nueva) pero ofrece solicitar su reemplazo, igual que una carga ya `APROBADA` (ver
// `TarjetaCargaArchivo`). Vuelve sola al estado normal cuando la carga original deja de estar en
// este estado (aprobada, o rechazada tras aprobarse su solicitud de reemplazo).
function cargaPendienteFinalizada(cargas: CargaResumenVista[], ventanaCargaId: string): CargaResumenVista | null {
  return (
    cargas.find(
      (carga) =>
        carga.ventanaCargaId === ventanaCargaId &&
        carga.estado === "PENDIENTE_VISTO_BUENO" &&
        carga.finalizadaEn !== null,
    ) ?? null
  );
}

// Mismo criterio que `resolverAutorizacionReemplazo` del servidor: se prefiere la solicitud
// utilizable sobre la carga vigente; si no hay, una reapertura (ya filtrada como vigente por el
// servidor) de esa ventana cuyo rechazo sea posterior a la aprobación vigente.
function resolverHabilitacionReemplazo(
  cargaAprobada: CargaResumenVista,
  solicitudesDeLaCarga: SolicitudReemplazoPropiaVista[],
  reaperturas: ReaperturaVigentePropiaVista[],
): HabilitacionReemplazo {
  if (solicitudesDeLaCarga.some((solicitud) => solicitud.utilizable)) return "SOLICITUD";

  const vistoBuenoEn = cargaAprobada.vistoBuenoEn ? new Date(cargaAprobada.vistoBuenoEn) : null;
  const reaperturaHabilitante = reaperturas.some(
    (reapertura) =>
      reapertura.ventanaCargaId === cargaAprobada.ventanaCargaId &&
      rechazoPosteriorAAprobacion(new Date(reapertura.rechazadoEn), vistoBuenoEn),
  );

  return reaperturaHabilitante ? "REAPERTURA" : null;
}

type EstadoTarjetaCombinacion = {
  cargaAprobada: CargaResumenVista | null;
  habilitacionReemplazo: HabilitacionReemplazo;
  // RF-36: plazo (ISO) de la solicitud utilizable, para el aviso "puedes subir hasta...".
  venceElSolicitud: string | null;
  solicitudPendiente: boolean;
  cargaPendienteDecision: CargaResumenVista | null;
  solicitudPendienteDeCargaPendiente: boolean;
  intentosFallidos: CargaResumenVista[];
};

// Deriva, sin consultas nuevas, el estado de la tarjeta de una combinación a partir de lo que el
// panel ya tiene cargado. Se consideran TODAS las solicitudes de la carga (no solo la primera): si
// la más reciente está consumida o vencida y no hay una `PENDIENTE`, la tarjeta vuelve a ofrecer el
// formulario de solicitud.
function derivarEstadoTarjeta(
  ventanaCargaId: string,
  cargas: CargaResumenVista[],
  solicitudes: SolicitudReemplazoPropiaVista[],
  reaperturas: ReaperturaVigentePropiaVista[],
): EstadoTarjetaCombinacion {
  const cargaAprobada = cargaAprobadaVigente(cargas, ventanaCargaId);
  const solicitudesDeLaAprobada = cargaAprobada
    ? solicitudes.filter((solicitud) => solicitud.cargaArchivoId === cargaAprobada.id)
    : [];

  // Puede convivir con `cargaAprobada`: durante un reemplazo, la carga nueva queda finalizada y
  // pendiente mientras la aprobada anterior sigue vigente. `TarjetaCargaArchivo` evalúa primero la
  // pendiente: mientras exista, la tarjeta se bloquea por ella.
  const cargaPendienteDecision = cargaPendienteFinalizada(cargas, ventanaCargaId);
  const solicitudPendienteDeCargaPendiente = cargaPendienteDecision
    ? solicitudes.some(
        (solicitud) => solicitud.cargaArchivoId === cargaPendienteDecision.id && solicitud.estado === "PENDIENTE",
      )
    : false;

  return {
    cargaAprobada,
    habilitacionReemplazo: cargaAprobada
      ? resolverHabilitacionReemplazo(cargaAprobada, solicitudesDeLaAprobada, reaperturas)
      : null,
    venceElSolicitud: solicitudesDeLaAprobada.find((solicitud) => solicitud.utilizable)?.venceEl ?? null,
    solicitudPendiente: solicitudesDeLaAprobada.some((solicitud) => solicitud.estado === "PENDIENTE"),
    cargaPendienteDecision,
    solicitudPendienteDeCargaPendiente,
    intentosFallidos: cargas.filter(
      (carga) => carga.ventanaCargaId === ventanaCargaId && carga.estado === "CON_ERRORES",
    ),
  };
}

// Aviso de que la tarjeta admite subir el archivo de reemplazo, con el texto según qué lo habilita.
// RF-36: con una solicitud aprobada se muestra además su plazo ("vence el"), que puede ir más allá
// del cierre de la ventana. El plazo de una reapertura ya lo muestra la cabecera de la tarjeta.
function AvisoReemplazoHabilitado({
  habilitacion,
  nombreArchivoVigente,
  venceElSolicitud,
}: {
  habilitacion: Exclude<HabilitacionReemplazo, null>;
  nombreArchivoVigente: string;
  venceElSolicitud: string | null;
}) {
  const motivo =
    habilitacion === "SOLICITUD"
      ? "Tu solicitud de reemplazo fue aprobada"
      : "Tu carga anterior fue rechazada";
  const plazo = habilitacion === "SOLICITUD" ? venceElSolicitud : null;

  return (
    <p className="mt-2 text-sm font-medium text-gob-primary">
      {motivo}: puedes subir un archivo que reemplazará a <strong>{nombreArchivoVigente}</strong>.
      {plazo ? (
        <>
          {" "}
          Plazo para subirlo y enviarlo:{" "}
          <time dateTime={plazo} className="font-semibold tabular-nums">
            {formatearFechaHoraIso(plazo)}
          </time>
          .
        </>
      ) : null}
    </p>
  );
}

// Historial persistente de intentos fallidos (`CON_ERRORES`) de una combinación (formato,
// ventana) puntual, derivado de `misCargas` (ya cargada en este panel) sin ninguna consulta nueva.
// Distinta del histórico de "Mis cargas" (`/notificador/cargas`, solo `APROBADA`): esta vive
// anidada bajo cada `TarjetaCargaArchivo` y solo muestra los intentos fallidos de ESA combinación.
function TablaIntentosFallidos({ intentos }: { intentos: CargaResumenVista[] }) {
  if (intentos.length === 0) return null;

  return (
    <details className="group mt-4 border-t border-gob-accent pt-4">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-lg border border-gob-primary/30 bg-gob-primary/5 px-2 py-1 text-sm font-semibold text-gob-primary shadow-sm transition-colors hover:border-gob-primary/60 hover:bg-gob-primary/10 hover:text-gob-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
          ▸
        </span>
        Intentos fallidos
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gob-danger px-1.5 text-xs font-bold text-white shadow-sm">
          {intentos.length}
        </span>
      </summary>
      <div className="mt-2 overflow-x-auto rounded-lg border border-gob-accent bg-white">
        <table className="w-full min-w-xl border-collapse text-left text-sm">
          <caption className="sr-only">Intentos fallidos de esta combinación de formato y ventana</caption>
          <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
            <tr>
              <th scope="col" className="px-3 py-3 font-semibold">Archivo</th>
              <th scope="col" className="px-3 py-3 font-semibold">Subido el</th>
              <th scope="col" className="px-3 py-3 font-semibold">Errores</th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-semibold">
                Detalle
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gob-accent/60">
            {intentos.map((intento) => (
              <tr key={intento.id} className="bg-gob-danger/10 align-middle transition-colors hover:bg-gob-danger/15">
                <th scope="row" className="min-w-40 break-all px-3 py-2 font-medium text-gob-black">
                  {intento.nombreArchivoOriginal}
                </th>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a">
                  {formatearFechaHoraIso(intento.createdAt)}
                </td>
                <td className="px-3 py-2 tabular-nums text-gob-danger">{intento.cantidadErrores}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <ViewTransition>
                    <Link
                      href={`/notificador/intentos/${intento.id}`}
                      className="text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
                    >
                      Ver detalle
                    </Link>
                  </ViewTransition>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// Cabecera de la tarjeta de subida. Con una reapertura vigente se destaca como rechazo con su motivo
// y plazo; RF-36: una ventana cerrada por fecha (habilitada solo por una autorización) se marca como
// "Fuera de plazo" para que no se lea como una ventana abierta. Extraída de `TarjetaCargaArchivo`
// para acotar su complejidad.
function CabeceraTarjetaCarga({
  idTitulo,
  tituloCombinacion,
  reapertura,
  ventanaCerrada,
}: {
  idTitulo: string;
  tituloCombinacion: string;
  reapertura: ReaperturaVigentePropiaVista | null;
  ventanaCerrada: boolean;
}) {
  if (reapertura) {
    return (
      <div role="alert" className={estilosTarjeta.cabecera}>
        <div className="min-w-0">
          <h3 id={idTitulo} className={estilosTarjeta.titulo}>
            {tituloCombinacion}
          </h3>
          <p className="mt-1 text-sm leading-5 text-gob-gray-a">
            <span className="font-semibold text-gob-tertiary">Motivo:</span> {reapertura.motivo}
          </p>
        </div>
        <div className="flex flex-col items-end text-right">
          <span className={`${estilosTarjeta.estado} ${estilosTarjeta.rechazado}`}>Rechazado</span>
          <p className="mt-2 max-w-28 text-xs leading-4 text-gob-gray-a">
            Plazo para subirlo
            <time dateTime={reapertura.fechaLimite} className="mt-0.5 block font-semibold tabular-nums text-gob-danger">
              {formatearFechaHoraIso(reapertura.fechaLimite)}
            </time>
          </p>
        </div>
      </div>
    );
  }

  if (ventanaCerrada) {
    return (
      <div className={estilosTarjeta.cabecera}>
        <h3 id={idTitulo} className={estilosTarjeta.titulo}>
          {tituloCombinacion}
        </h3>
        <span className={`${estilosTarjeta.estado} ${estilosTarjeta.pendiente}`}>Fuera de plazo</span>
      </div>
    );
  }

  return (
    <h3 id={idTitulo} className="text-base font-semibold text-gob-tertiary">
      {tituloCombinacion}
    </h3>
  );
}

// Resultado de la última subida de la tarjeta: errores (con su modal de detalle) o "Pendiente de
// aprobación" tras finalizar. Extraído de `TarjetaCargaArchivo` junto con el estado del modal, que
// solo se usa aquí.
function ResultadoUltimaSubida({ resultado }: { resultado: CargaDetalleVista }) {
  const [erroresAbiertos, setErroresAbiertos] = useState(false);

  if (resultado.cantidadErrores === 0) {
    if (!resultado.finalizadaEn) return null;

    return (
      <div className="mt-4 flex flex-col gap-3 border-t border-gob-accent pt-4">
        <p role="status" className="text-sm font-medium text-gob-tertiary">
          Pendiente de aprobación.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-gob-accent pt-4">
      <p role="alert" className="text-sm text-gob-gray-a">
        <BadgeEstadoCarga estado={resultado.estado} /> ·{" "}
        <button
          type="button"
          onClick={() => setErroresAbiertos(true)}
          className="font-semibold text-gob-danger underline underline-offset-2 hover:text-gob-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          {resultado.cantidadErrores} {resultado.cantidadErrores === 1 ? "error" : "errores"}
        </button>
      </p>
      <ModalErroresCarga abierto={erroresAbiertos} carga={resultado} onCerrar={() => setErroresAbiertos(false)} />
    </div>
  );
}

type TarjetaCargaBloqueadaProps = {
  idTitulo: string;
  tituloCombinacion: string;
  formatoExcelId: string;
  mensaje: ReactNode;
  cargaArchivoId: string;
  placeholderMotivo: string;
  solicitudPendiente: boolean;
  // La etiqueta de estado distingue una carga que espera decisión de una ya aprobada.
  variante: "pendiente" | "aprobada";
  // RF-31: aviso de mensajes del equipo revisor de esta ventana (o `null`).
  avisoMensajes: ReactNode;
  onSolicitudReemplazoEnviada: () => void;
};

// Cuerpo compartido de los dos estados "bloqueados" de la tarjeta (carga `APROBADA` sin reemplazo
// vigente, y carga `PENDIENTE_VISTO_BUENO` ya finalizada y sin decidir): mismo layout, mismo
// formulario de solicitud, solo cambia el mensaje explicativo, el estado y a qué carga apunta la
// solicitud.
function TarjetaCargaBloqueada({
  idTitulo,
  tituloCombinacion,
  formatoExcelId,
  mensaje,
  cargaArchivoId,
  placeholderMotivo,
  solicitudPendiente,
  variante,
  avisoMensajes,
  onSolicitudReemplazoEnviada,
}: TarjetaCargaBloqueadaProps) {
  const estaPendienteDeAprobacion = variante === "pendiente";
  const etiquetaEstado = estaPendienteDeAprobacion ? "Pendiente de aprobación" : "Aprobado";

  return (
    <section
      aria-labelledby={idTitulo}
      className={`${estilosIndicador.tarjeta} flex h-full w-full max-w-md flex-col rounded-lg border border-gob-accent bg-white p-5`}
    >
      <div className={estilosTarjeta.cabecera}>
        <h3 id={idTitulo} className={estilosTarjeta.titulo}>
          {tituloCombinacion}
        </h3>
        <span className={`${estilosTarjeta.estado} ${estaPendienteDeAprobacion ? estilosTarjeta.pendiente : estilosTarjeta.aprobado}`}>
          {etiquetaEstado}
        </span>
      </div>

      <p className="mt-2 text-sm text-gob-gray-a">{mensaje}</p>

      {avisoMensajes}

      <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-gob-accent pt-4">
        <a
          href={`/api/formatos-excel/${formatoExcelId}/plantilla`}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-green-600 bg-green-800 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-gob-neutral active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          <IconoDescargar className="shrink-0" />
          Descargar plantilla
        </a>

        {solicitudPendiente ? (
          <p role="status" className="text-sm font-semibold text-[#075d9b]">
            Solicitud de reemplazo pendiente.
          </p>
        ) : (
          <FormularioSolicitudReemplazo
            rutaApi="/api/notificador/solicitudes-reemplazo"
            cuerpo={{ cargaArchivoId }}
            idBase={cargaArchivoId}
            placeholderMotivo={placeholderMotivo}
            onExito={onSolicitudReemplazoEnviada}
          />
        )}
      </div>
    </section>
  );
}

type TarjetaCargaArchivoProps = {
  combinacion: CombinacionCargaVista;
  resultado: CargaDetalleVista | null;
  intentosFallidos: CargaResumenVista[];
  // `null` cuando la combinación no tiene una carga aprobada vigente. Cuando no es `null`, la
  // tarjeta muestra la subida normal solo si hay `habilitacionReemplazo` (solicitud utilizable o
  // reapertura posterior a la aprobación); si no, la tarjeta reducida con el formulario de solicitud.
  cargaAprobada: CargaResumenVista | null;
  habilitacionReemplazo: HabilitacionReemplazo;
  // RF-36: plazo (ISO) de la solicitud utilizable, o `null`.
  venceElSolicitud: string | null;
  solicitudPendiente: boolean;
  // `null` cuando la combinación no tiene ninguna carga `PENDIENTE_VISTO_BUENO` finalizada y
  // todavía sin decidir. Cuando no es `null`, la tarjeta se bloquea (sin subida nueva) y ofrece
  // solicitar su reemplazo. Puede convivir con `cargaAprobada` (durante un reemplazo, la carga nueva
  // está pendiente mientras la aprobada anterior sigue vigente): por eso se evalúa ANTES que
  // `cargaAprobada`/`habilitacionReemplazo`, y tiene prioridad sobre ellas.
  cargaPendienteDecision: CargaResumenVista | null;
  solicitudPendienteDeCargaPendiente: boolean;
  // Si existe, la combinación tiene una reapertura vigente por rechazo. El cargador se mantiene
  // habilitado, pero la tarjeta explica claramente el motivo y su plazo real de corrección.
  reapertura: ReaperturaVigentePropiaVista | null;
  // RF-31: aviso de mensajes del equipo revisor de esta ventana (o `null`), visible en los tres
  // estados de la tarjeta.
  avisoMensajes: ReactNode;
  onSubidaExitosa: (clave: string, carga: CargaDetalleVista) => void;
  onSolicitudReemplazoEnviada: () => void;
};

// Una tarjeta por combinación (formato, ventana), cada una con su propio estado de
// archivo/subida/error: subir un archivo para una combinación no interfiere con las demás.
function TarjetaCargaArchivo({
  combinacion,
  resultado,
  intentosFallidos,
  cargaAprobada,
  habilitacionReemplazo,
  venceElSolicitud,
  solicitudPendiente,
  cargaPendienteDecision,
  solicitudPendienteDeCargaPendiente,
  reapertura,
  avisoMensajes,
  onSubidaExitosa,
  onSolicitudReemplazoEnviada,
}: TarjetaCargaArchivoProps) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);

  const idBase = `carga-${claveCombinacion(combinacion)}`;
  const idTitulo = `${idBase}-titulo`;
  const idArchivo = `${idBase}-archivo`;

  async function subirArchivo() {
    if (!archivo) return;

    setSubiendo(true);
    setErrorSubida(null);

    try {
      const formData = new FormData();
      formData.set("formatoExcelId", combinacion.formatoExcelId);
      formData.set("anio", combinacion.anio.toString());
      formData.set("archivo", archivo);

      const respuesta = await fetch("/api/notificador/cargas", { method: "POST", body: formData });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setErrorSubida(datos?.error ?? MENSAJE_ERROR_GENERICO);
        return;
      }

      const datos = (await respuesta.json()) as { carga: CargaDetalleVista };
      setArchivo(null);
      onSubidaExitosa(claveCombinacion(combinacion), datos.carga);
    } catch {
      setErrorSubida(MENSAJE_ERROR_GENERICO);
    } finally {
      setSubiendo(false);
    }
  }

  const tituloCombinacion = `${combinacion.formatoNombre} · ${combinacion.anio}`;

  // Estado "bloqueado": ya se finalizó y envió una carga para esta combinación y todavía nadie
  // (ADMIN/REVISOR_REPOSITORIO) la decidió. No admite una subida nueva, pero sí solicitar su
  // reemplazo, igual que el estado "b" de abajo (carga ya `APROBADA`).
  if (cargaPendienteDecision) {
    return (
      <TarjetaCargaBloqueada
        idTitulo={idTitulo}
        tituloCombinacion={tituloCombinacion}
        formatoExcelId={combinacion.formatoExcelId}
        mensaje={
          <>
            El archivo <strong>{cargaPendienteDecision.nombreArchivoOriginal}</strong> fue enviado y está esperando
            aprobación. Si necesita corregirlo, presione <strong>Solicitar reemplazo</strong>.
          </>
        }
        cargaArchivoId={cargaPendienteDecision.id}
        placeholderMotivo="Explica por qué necesitas reemplazar esta carga antes de que se decida"
        solicitudPendiente={solicitudPendienteDeCargaPendiente}
        variante="pendiente"
        avisoMensajes={avisoMensajes}
        onSolicitudReemplazoEnviada={onSolicitudReemplazoEnviada}
      />
    );
  }

  // Estado "b": ya existe una carga aprobada vigente para esta combinación y no hay ninguna
  // habilitación de reemplazo. La tarjeta se reduce: no se ofrece subir un archivo nuevo.
  if (cargaAprobada && habilitacionReemplazo === null) {
    return (
      <TarjetaCargaBloqueada
        idTitulo={idTitulo}
        tituloCombinacion={tituloCombinacion}
        formatoExcelId={combinacion.formatoExcelId}
        mensaje={
          <>
            El archivo <strong>{cargaAprobada.nombreArchivoOriginal}</strong> ya fue aprobado. Si necesita
            corregirlo, presione <strong>Solicitar reemplazo</strong>. Cuando su solicitud sea aprobada, podrá subir
            un archivo nuevo.
          </>
        }
        cargaArchivoId={cargaAprobada.id}
        placeholderMotivo="Explica por qué necesitas reemplazar esta carga ya aprobada"
        solicitudPendiente={solicitudPendiente}
        variante="aprobada"
        avisoMensajes={avisoMensajes}
        onSolicitudReemplazoEnviada={onSolicitudReemplazoEnviada}
      />
    );
  }

  return (
    <section
      id={idTarjetaVentana(combinacion.ventanaCargaId)}
      aria-labelledby={idTitulo}
      className={`${estilosIndicador.tarjeta} flex h-full w-full max-w-md flex-col scroll-mt-6 rounded-lg border bg-white p-5 transition-colors ${
        reapertura ? "border-[#dfadb4] bg-[#fff8f8] shadow-[0_6px_18px_rgba(161,31,31,0.06)]" : "border-gob-accent"
      }`}
    >
      <CabeceraTarjetaCarga
        idTitulo={idTitulo}
        tituloCombinacion={tituloCombinacion}
        reapertura={reapertura}
        ventanaCerrada={combinacion.cerrada}
      />

      {avisoMensajes}

      {cargaAprobada && habilitacionReemplazo ? (
        <AvisoReemplazoHabilitado
          habilitacion={habilitacionReemplazo}
          nombreArchivoVigente={cargaAprobada.nombreArchivoOriginal}
          venceElSolicitud={venceElSolicitud}
        />
      ) : null}

      <div className="mt-4 flex flex-col gap-4">
        <CargadorArchivo
          id={idArchivo}
          archivo={archivo}
          extension=".xlsx"
          descripcionTipo="Excel (.xlsx)"
          disabled={subiendo}
          onArchivo={(archivo) => setArchivo(archivo)}
        />

        {errorSubida ? (
          <p role="alert" className="text-sm font-medium text-gob-danger">
            {errorSubida}
          </p>
        ) : null}

      </div>

      <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-gob-accent pt-4">
        <a
          href={`/api/formatos-excel/${combinacion.formatoExcelId}/plantilla`}
          className={`inline-flex w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary ${
            reapertura
              ? "border-[#cf8d97] bg-white text-gob-danger hover:bg-[#fff0f1]"
              : "border-green-600 bg-green-800 text-white hover:bg-gob-neutral"
          }`}
        >
          <IconoDescargar className="shrink-0" />
          Descargar plantilla
        </a>
        <Boton
          onClick={() => void subirArchivo()}
          disabled={!archivo}
          cargando={subiendo}
          textoCargando="Subiendo y validando..."
          className="w-fit"
        >
          <IconoSubir className="shrink-0" />
          Subir archivo
        </Boton>
      </div>

      {resultado ? <ResultadoUltimaSubida resultado={resultado} /> : null}

      <TablaIntentosFallidos intentos={intentosFallidos} />
    </section>
  );
}

type PanelCargaArchivoProps = {
  // Combinaciones (formato asignado, ventana disponible y publicada) con tipo de archivo
  // coincidente, resueltas en el Server Component. Sin ninguna, se muestra un único mensaje
  // genérico, sin distinguir si la causa es "sin formato asignado", "sin ventana" o "no publicada".
  combinaciones: CombinacionCargaVista[];
  // Se obtienen en el Server Component (`app/notificador/page.tsx`): evita un `fetch` disparado
  // desde un efecto solo para la carga inicial. El widget vuelve a pedirlas desde los propios
  // manejadores de evento (tras subir un archivo, dar visto bueno o solicitar un reemplazo), nunca
  // desde un efecto.
  cargasIniciales: CargaResumenVista[];
  solicitudesIniciales: SolicitudReemplazoPropiaVista[];
  reaperturasIniciales: ReaperturaVigentePropiaVista[];
  // RF-31: se leen DIRECTO de las props (nunca copiadas a `useState`): así el `router.refresh()`
  // de `visibilitychange` y el de cerrar el modal de mensajes actualizan los avisos.
  mensajesPorVentana: ResumenMensajesPorVentana;
  ventanasMensajesSinLeer: VentanaMensajesSinLeerVista[];
};

export function PanelCargaArchivo({
  combinaciones,
  cargasIniciales,
  solicitudesIniciales,
  reaperturasIniciales,
  mensajesPorVentana,
  ventanasMensajesSinLeer,
}: PanelCargaArchivoProps) {
  // Resultado de la última subida por combinación, indexado por clave: cada tarjeta solo ve el
  // suyo. Vive aquí (no dentro de cada tarjeta) porque `confirmarVistoBueno` necesita poder
  // actualizar el estado de la combinación correspondiente tras dar visto bueno.
  const [resultados, setResultados] = useState<Record<string, CargaDetalleVista>>({});

  // Ya no alimenta ninguna tabla propia de este panel (esa vista vive en "Mis cargas",
  // `/notificador/cargas`): se mantiene para derivar `TablaIntentosFallidos` (estado
  // `CON_ERRORES`) y la carga aprobada vigente de cada combinación.
  const [misCargas, setMisCargas] = useState<CargaResumenVista[]>(cargasIniciales);
  const [misSolicitudes, setMisSolicitudes] = useState<SolicitudReemplazoPropiaVista[]>(solicitudesIniciales);
  // Estado local (no se vuelve a pedir al servidor): se quita apenas `confirmarFinalizacion()`
  // recibe una respuesta exitosa para la combinación correspondiente, sin esperar a que la página
  // se recargue (ver comentario de `ReaperturaVigentePropiaVista` en `BannerReaperturaCarga.tsx`).
  const [reaperturas, setReaperturas] = useState<ReaperturaVigentePropiaVista[]>(reaperturasIniciales);

  // Al volver a la pestaña se vuelve a pedir la página al servidor: una ventana publicada o
  // despublicada mientras tanto aparece o desaparece sin que el notificador tenga que recargar. El
  // estado local de cada tarjeta (archivo elegido, resultado) se conserva: su `key` no cambia.
  const router = useRouter();
  useEffect(() => {
    function alVolverALaPestana() {
      if (document.visibilityState === "visible") router.refresh();
    }

    document.addEventListener("visibilitychange", alVolverALaPestana);
    return () => document.removeEventListener("visibilitychange", alVolverALaPestana);
  }, [router]);

  const [cargaExitosa, setCargaExitosa] = useState<CargaDetalleVista | null>(null);
  const [procesandoFinalizar, setProcesandoFinalizar] = useState(false);
  const [errorFinalizar, setErrorFinalizar] = useState<string | null>(null);

  function registrarResultado(clave: string, carga: CargaDetalleVista) {
    setResultados((actual) => ({ ...actual, [clave]: carga }));
    if (carga.cantidadErrores === 0 && carga.errores.length === 0 && carga.estado === "PENDIENTE_VISTO_BUENO") {
      setCargaExitosa(carga);
    }
    void obtenerMisCargas().then((actualizadas) => {
      if (actualizadas) setMisCargas(actualizadas);
    });
  }

  function cancelarCargaExitosa() {
    if (procesandoFinalizar) return;
    if (cargaExitosa) {
      setResultados((actual) => Object.fromEntries(Object.entries(actual).filter(([, carga]) => carga.id !== cargaExitosa.id)));
    }
    setCargaExitosa(null);
    setErrorFinalizar(null);
  }

  function refrescarSolicitudes() {
    void obtenerMisSolicitudes().then((actualizadas) => {
      if (actualizadas) setMisSolicitudes(actualizadas);
    });
  }

  async function confirmarFinalizacion() {
    if (!cargaExitosa) return;

    setProcesandoFinalizar(true);
    setErrorFinalizar(null);

    try {
      const respuesta = await fetch(`/api/notificador/cargas/${cargaExitosa.id}/finalizar`, {
        method: "POST",
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setErrorFinalizar(datos?.error ?? MENSAJE_ERROR_GENERICO);
        setProcesandoFinalizar(false);
        // Si la autorización de reemplazo venció entre la subida y la finalización, la tarjeta debe
        // volver a ofrecer "Solicitar reemplazo" al cerrar el modal.
        if (datos?.codigo === "REEMPLAZO_NO_AUTORIZADO") refrescarSolicitudes();
        return;
      }

      const datos = (await respuesta.json()) as { carga: CargaDetalleVista };

      // El servidor consume las reaperturas pendientes de esta combinación (usuario, ventana) y la
      // solicitud de reemplazo utilizable al finalizar con éxito (ver
      // `CargaArchivoRepository.finalizar()`); se refleja aquí de inmediato para que
      // `BannerReaperturaCarga` deje de mostrarse sin esperar a recargar la página.
      setReaperturas((actual) =>
        actual.filter((reapertura) => reapertura.ventanaCargaId !== cargaExitosa.ventanaCargaId),
      );

      // La tarjeta de esta combinación desaparece por completo en cuanto `misCargas` refleje
      // `finalizadaEn` no nulo (ver `cargaPendienteFinalizada`); no hace falta actualizar
      // `resultados` de forma optimista.
      setResultados((actual) => {
        const entrada = Object.entries(actual).find(([, carga]) => carga.id === cargaExitosa.id);
        if (!entrada) return actual;

        const [clave, carga] = entrada;
        return { ...actual, [clave]: { ...carga, finalizadaEn: datos.carga.finalizadaEn } };
      });

      setProcesandoFinalizar(false);
      setCargaExitosa(null);

      const actualizadas = await obtenerMisCargas();
      if (actualizadas) setMisCargas(actualizadas);
      refrescarSolicitudes();
    } catch {
      setErrorFinalizar(MENSAJE_ERROR_GENERICO);
      setProcesandoFinalizar(false);
    }
  }

  // Una corrección con plazo es la tarea más urgente del notificador. Se prioriza sin mutar las
  // props originales y las tarjetas restantes preservan el orden que ya entregaba el servidor.
  const combinacionesOrdenadas = [...combinaciones].toSorted((izquierda, derecha) => {
    const izquierdaRechazada = reaperturas.some((reapertura) => reapertura.ventanaCargaId === izquierda.ventanaCargaId);
    const derechaRechazada = reaperturas.some((reapertura) => reapertura.ventanaCargaId === derecha.ventanaCargaId);
    return Number(derechaRechazada) - Number(izquierdaRechazada);
  });
  const hayIconosMensajes = combinaciones.some(
    (combinacion) => (mensajesPorVentana[combinacion.ventanaCargaId]?.total ?? 0) > 0,
  );

  return (
    <div className="flex flex-col gap-6">
      <BannerMensajesSinLeer lado="NOTIFICADOR" ventanas={ventanasMensajesSinLeer} />

      {combinaciones.length === 0 ? (
        <section
          aria-labelledby="titulo-reporte"
          className="rounded-lg border border-dashed border-gob-accent bg-white p-6"
        >
          <h2 id="titulo-reporte" className="text-base font-semibold text-gob-tertiary">
            Reporte de datos (Excel/CSV)
          </h2>
          <p className="mt-2 text-sm text-gob-gray-a">
            No tienes ningún reporte disponible para subir en este momento. Contacta a un
            administrador o al revisor del repositorio si crees que esto es un error.
          </p>
        </section>
      ) : (
        <div className={`grid auto-rows-fr grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3 ${hayIconosMensajes ? estilosIndicador.rejillaConMensajes : ""}`}>
          {combinacionesOrdenadas.map((combinacion) => {
          const estadoTarjeta = derivarEstadoTarjeta(
            combinacion.ventanaCargaId,
            misCargas,
            misSolicitudes,
            reaperturas,
          );
          const reapertura = reaperturas.find((candidata) => candidata.ventanaCargaId === combinacion.ventanaCargaId) ?? null;

          const claveTarjeta = claveCombinacion(combinacion);
          return (
            <TarjetaCargaArchivo
              key={claveTarjeta}
              combinacion={combinacion}
              resultado={resultados[claveTarjeta] ?? null}
              intentosFallidos={estadoTarjeta.intentosFallidos}
              cargaAprobada={estadoTarjeta.cargaAprobada}
              habilitacionReemplazo={estadoTarjeta.habilitacionReemplazo}
              venceElSolicitud={estadoTarjeta.venceElSolicitud}
              solicitudPendiente={estadoTarjeta.solicitudPendiente}
              cargaPendienteDecision={estadoTarjeta.cargaPendienteDecision}
              solicitudPendienteDeCargaPendiente={estadoTarjeta.solicitudPendienteDeCargaPendiente}
              reapertura={reapertura}
              avisoMensajes={avisoMensajesDeCombinacion(combinacion, mensajesPorVentana)}
              onSubidaExitosa={registrarResultado}
              onSolicitudReemplazoEnviada={refrescarSolicitudes}
            />
          );
          })}
        </div>
      )}

      <ModalCargaExitosa
        abierto={cargaExitosa !== null}
        nombreArchivo={cargaExitosa?.nombreArchivoOriginal ?? ""}
        procesando={procesandoFinalizar}
        error={errorFinalizar}
        onFinalizar={() => void confirmarFinalizacion()}
        onCerrar={cancelarCargaExitosa}
      />
    </div>
  );
}
