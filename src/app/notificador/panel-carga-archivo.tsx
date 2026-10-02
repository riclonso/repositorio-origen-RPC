"use client";

import { useEffect, useState, ViewTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  CargaArchivoResumen,
  ErrorCargaArchivo,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type {
  EstadoSolicitudReemplazoCarga,
  OrigenSolicitudReemplazoCarga,
} from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { LONGITUD_MAXIMA_MOTIVO } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { BadgeEstadoCarga } from "@/shared/components/BadgeEstadoCarga";
import {
  idTarjetaVentana,
  type ReaperturaVigentePropiaVista,
} from "@/shared/components/BannerReaperturaCarga";
import { BannerMensajesSinLeer } from "@/shared/components/BannerMensajesSinLeer";
import { Boton } from "@/shared/components/Boton";
import { BotonMensajesVentana } from "@/shared/components/BotonMensajesVentana";
import { CargadorArchivo } from "@/shared/components/CargadorArchivo";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { tituloVentanaMensajes, type VentanaMensajesSinLeerVista } from "@/modules/mensajeria/schemas/vistas-mensajeria";
import type { ResumenMensajesPorVentana } from "@/modules/mensajeria/domain/entities/MensajeCarga";
import { ModalCargaExitosa } from "@/shared/components/ModalCargaExitosa";
import { ResumenErroresCarga } from "@/shared/components/ResumenErroresCarga";
import { SugerenciaErrorEstructura } from "@/shared/components/SugerenciaErrorEstructura";
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
// aprobada vigente.
export type CargaResumenVista = Omit<CargaArchivoResumen, "createdAt" | "vistoBuenoEn" | "finalizadaEn"> & {
  createdAt: string;
  vistoBuenoEn: string | null;
  finalizadaEn: string | null;
};

// Vista del resultado de una subida recién hecha: incluye el detalle de errores.
type CargaDetalleVista = CargaResumenVista & { errores: ErrorCargaArchivo[] };

// Vista liviana de una solicitud de reemplazo propia, mismos campos que
// `SolicitudReemplazoPropiaDTO` que necesita este panel para decidir el estado de cada
// combinación: sin `vencida` recalculado en el cliente, se usa el que ya resolvió el servidor.
export type SolicitudReemplazoPropiaVista = {
  id: string;
  cargaArchivoId: string;
  estado: EstadoSolicitudReemplazoCarga;
  origen: OrigenSolicitudReemplazoCarga;
  vencida: boolean;
};

// RF-15 (ampliación): una combinación (formato asignado, ventana disponible) cuyo tipo de archivo
// coincide, resuelta en el Server Component (`app/notificador/page.tsx`). Reemplaza a los dos
// `<select>` de formato y año: cada combinación se muestra como su propia sección.
export type CombinacionCargaVista = {
  formatoExcelId: string;
  formatoNombre: string;
  anio: number;
  ventanaCargaId: string;
};

const MENSAJE_ERROR_GENERICO = "No se pudo completar la operación. Intenta nuevamente.";

function formatearFechaHoraIso(iso: string): string {
  return formatearFechaHora(new Date(iso));
}

async function obtenerMisCargas(): Promise<CargaResumenVista[] | null> {
  const respuesta = await fetch("/api/notificador/cargas");
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
// `vistoBuenoEn`, mismo criterio que `agruparCargasAprobadasPorVentana` del servidor: un
// notificador puede tener varias cargas APROBADA sucesivas en la misma ventana.
function cargaAprobadaVigente(cargas: CargaResumenVista[], ventanaCargaId: string): CargaResumenVista | null {
  const aprobadas = cargas.filter((carga) => carga.ventanaCargaId === ventanaCargaId && carga.estado === "APROBADA");
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

type FormularioSolicitarReemplazoProps = {
  cargaArchivoId: string;
  placeholderMotivo: string;
  onExito: () => void;
};

// Formulario de solicitud de reemplazo (estado "b" de la tarjeta, ver `TarjetaCargaArchivo`):
// motivo obligatorio, loading "Cargando la información" al guardar (ver diseño del RF), sin
// componente de loading nuevo (reutiliza `Boton.cargando`/`textoCargando`). `placeholderMotivo` lo
// fija el llamador porque el texto varía según el origen de la carga (ya `APROBADA` vs. todavía
// `PENDIENTE_VISTO_BUENO` sin decidir): un mismo placeholder para ambos sería incorrecto en el
// segundo caso, la carga no está aprobada.
function FormularioSolicitarReemplazo({ cargaArchivoId, placeholderMotivo, onExito }: FormularioSolicitarReemplazoProps) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviada, setEnviada] = useState(false);

  async function enviarSolicitud() {
    if (motivo.trim().length === 0) return;

    setEnviando(true);
    setError(null);

    try {
      const respuesta = await fetch("/api/notificador/solicitudes-reemplazo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cargaArchivoId, motivo: motivo.trim() }),
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setError(datos?.error ?? MENSAJE_ERROR_GENERICO);
        return;
      }

      setEnviada(true);
      setAbierto(false);
      onExito();
    } catch {
      setError(MENSAJE_ERROR_GENERICO);
    } finally {
      setEnviando(false);
    }
  }

  if (enviada) {
    return (
      <p role="status" className="mt-4 text-sm font-medium text-gob-primary">
        Solicitud enviada. Un administrador o el revisor del repositorio debe aprobarla antes de que puedas subir el
        archivo de reemplazo.
      </p>
    );
  }

  function cerrarDialogo() {
    if (enviando) return;
    setAbierto(false);
    setError(null);
  }

  const idMotivo = `motivo-reemplazo-${cargaArchivoId}`;

  return (
    <>
      <Boton onClick={() => setAbierto(true)} className="w-fit">
        Solicitar reemplazo
      </Boton>
      <DialogoConfirmacion
        abierto={abierto}
        titulo="Solicitar reemplazo"
        descripcion="Explique por qué necesita cambiar el archivo enviado. Cuando se apruebe su solicitud, podrá subir un archivo nuevo."
        textoConfirmar="Enviar solicitud"
        textoConfirmando="Cargando la información..."
        procesando={enviando}
        confirmarDeshabilitado={motivo.trim().length === 0}
        error={error}
        onConfirmar={() => void enviarSolicitud()}
        onCancelar={cerrarDialogo}
      >
      <div className="mt-4 flex flex-col gap-2">
        <label htmlFor={idMotivo} className="text-sm font-medium text-gob-black">
          Motivo del reemplazo
        </label>
        <textarea
          id={idMotivo}
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
          disabled={enviando}
          maxLength={LONGITUD_MAXIMA_MOTIVO}
          rows={3}
          required
          placeholder={placeholderMotivo}
          className="w-full rounded-md border border-gob-accent bg-white px-3 py-2 text-sm text-gob-black outline-none placeholder:text-gob-gray-b focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30 disabled:bg-gob-neutral"
        />
        <p className="text-right text-xs tabular-nums text-gob-gray-a">{motivo.length}/{LONGITUD_MAXIMA_MOTIVO}</p>
      </div>
      </DialogoConfirmacion>
    </>
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
          <FormularioSolicitarReemplazo
            cargaArchivoId={cargaArchivoId}
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
  // `null` cuando la combinación nunca tuvo una carga aprobada. Cuando no es `null`, la tarjeta
  // muestra la subida normal solo si `reemplazoHabilitado` es `true` (autorización de reemplazo
  // vigente); si no, la tarjeta reducida con el formulario de solicitud.
  cargaAprobada: CargaResumenVista | null;
  reemplazoHabilitado: boolean;
  solicitudPendiente: boolean;
  // `null` cuando la combinación no tiene ninguna carga `PENDIENTE_VISTO_BUENO` finalizada y
  // todavía sin decidir. Cuando no es `null`, la tarjeta se bloquea (sin subida nueva) y ofrece
  // solicitar su reemplazo, mutuamente excluyente con `cargaAprobada`/`reemplazoHabilitado`: una
  // combinación no puede tener a la vez una carga `APROBADA` vigente y otra `PENDIENTE_VISTO_BUENO`
  // ya finalizada.
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
  reemplazoHabilitado,
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

  // Estado "b": ya existe una carga aprobada para esta combinación y no hay ninguna autorización
  // de reemplazo vigente. La tarjeta se reduce: no se ofrece subir un archivo nuevo.
  const requiereSolicitudDeReemplazo = cargaAprobada !== null && !reemplazoHabilitado;

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

  // Estado "b": ya existe una carga aprobada para esta combinación y no hay ninguna autorización
  // de reemplazo vigente. La tarjeta se reduce: no se ofrece subir un archivo nuevo.
  if (requiereSolicitudDeReemplazo && cargaAprobada) {
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
      {reapertura ? (
        <div role="alert" className={estilosTarjeta.cabecera}>
          <div className="min-w-0">
            <h3 id={idTitulo} className={estilosTarjeta.titulo}>
              {combinacion.formatoNombre} · {combinacion.anio}
            </h3>
            <p className="mt-1 text-sm leading-5 text-gob-gray-a">
              <span className="font-semibold text-gob-tertiary">Motivo:</span> {reapertura.motivo}
            </p>
          </div>
          <div className="flex flex-col items-end text-right">
            <span className={`${estilosTarjeta.estado} ${estilosTarjeta.rechazado}`}>
              Rechazado
            </span>
            <p className="mt-2 max-w-28 text-xs leading-4 text-gob-gray-a">
              Plazo para subirlo
              <time dateTime={reapertura.fechaLimite} className="mt-0.5 block font-semibold tabular-nums text-gob-danger">
                {formatearFechaHoraIso(reapertura.fechaLimite)}
              </time>
            </p>
          </div>
        </div>
      ) : (
        <h3 id={idTitulo} className="text-base font-semibold text-gob-tertiary">
          {combinacion.formatoNombre} · {combinacion.anio}
        </h3>
      )}

      {avisoMensajes}

      {reemplazoHabilitado && cargaAprobada ? (
        <p className="mt-2 text-sm font-medium text-gob-primary">
          Tu solicitud de reemplazo fue aprobada: puedes subir el archivo que reemplazará a{" "}
          <strong>{cargaAprobada.nombreArchivoOriginal}</strong>.
        </p>
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

      {resultado && (resultado.cantidadErrores > 0 || resultado.finalizadaEn) ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-gob-accent pt-4">
          {resultado.cantidadErrores === 0 ? (
            <>
              {resultado.finalizadaEn ? (
                <p role="status" className="text-sm font-medium text-gob-tertiary">
                  Pendiente de aprobación.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="text-sm text-gob-gray-a">
                  <BadgeEstadoCarga estado={resultado.estado} /> · {resultado.cantidadFilasDatos} filas de datos,{" "}
                  {resultado.cantidadErrores} {resultado.cantidadErrores === 1 ? "error" : "errores"}
                </p>
                <a
                  href={`/api/notificador/cargas/${resultado.id}/errores`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
                >
                  <IconoDescargar className="shrink-0" />
                  Descargar errores (Excel)
                </a>
              </div>
              <SugerenciaErrorEstructura errores={resultado.errores} />
              <ResumenErroresCarga errores={resultado.errores} />
            </>
          )}


        </div>
      ) : null}

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
        return;
      }

      const datos = (await respuesta.json()) as { carga: CargaDetalleVista };

      // El servidor consume cualquier reapertura pendiente de esta combinación (usuario, ventana)
      // al finalizar con éxito (ver `CargaArchivoRepository.finalizar()`); se refleja aquí de
      // inmediato para que `BannerReaperturaCarga` deje de mostrarse sin esperar a recargar la
      // página.
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
          const cargaAprobada = cargaAprobadaVigente(misCargas, combinacion.ventanaCargaId);
          const solicitudDeEstaCarga = cargaAprobada
            ? misSolicitudes.find((solicitud) => solicitud.cargaArchivoId === cargaAprobada.id)
            : undefined;
          const reemplazoHabilitado =
            solicitudDeEstaCarga?.estado === "APROBADA" && !solicitudDeEstaCarga.vencida;
          const solicitudPendiente = solicitudDeEstaCarga?.estado === "PENDIENTE";

          // Mutuamente excluyente con `cargaAprobada`: una combinación no puede tener a la vez una
          // `APROBADA` vigente y una `PENDIENTE_VISTO_BUENO` ya finalizada.
          const cargaPendienteDecision = cargaPendienteFinalizada(misCargas, combinacion.ventanaCargaId);
          const solicitudDeCargaPendiente = cargaPendienteDecision
            ? misSolicitudes.find((solicitud) => solicitud.cargaArchivoId === cargaPendienteDecision.id)
            : undefined;
          const solicitudPendienteDeCargaPendiente = solicitudDeCargaPendiente?.estado === "PENDIENTE";
          const reapertura = reaperturas.find((candidata) => candidata.ventanaCargaId === combinacion.ventanaCargaId) ?? null;

          const claveTarjeta = claveCombinacion(combinacion);
          return (
            <TarjetaCargaArchivo
              key={claveTarjeta}
              combinacion={combinacion}
              resultado={resultados[claveTarjeta] ?? null}
              intentosFallidos={misCargas.filter(
                (carga) => carga.ventanaCargaId === combinacion.ventanaCargaId && carga.estado === "CON_ERRORES",
              )}
              cargaAprobada={cargaAprobada}
              reemplazoHabilitado={reemplazoHabilitado}
              solicitudPendiente={solicitudPendiente}
              cargaPendienteDecision={cargaPendienteDecision}
              solicitudPendienteDeCargaPendiente={solicitudPendienteDeCargaPendiente}
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
