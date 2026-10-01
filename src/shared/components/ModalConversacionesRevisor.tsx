"use client";

import { useEffect, useId, useRef, useState } from "react";
import { enviarJson, pedirJson } from "@/shared/components/clienteMensajeria";
import { HiloMensajes } from "@/shared/components/HiloMensajes";
import {
  fusionarMensajes,
  hastaParaMarcarLeidos,
  type ConversacionVista,
  type HiloRevisorVista,
  type MensajeVista,
} from "@/modules/mensajeria/schemas/vistas-mensajeria";
import { useRefrescoPeriodico } from "@/shared/hooks/useRefrescoPeriodico";
import { formatearFechaHora } from "@/shared/utils/fecha";

// Notificador preseleccionado al abrir el modal desde la fila de una carga pendiente del detalle de
// ventana. `cargaArchivoId` es la carga de esa fila: si todavía no hay conversación, el primer
// envío va por `POST /api/revisor/mensajes` con ese id (el servidor revalida que siga pendiente).
export type NotificadorInicialMensajes = {
  id: string;
  nombreCompleto: string;
  rut: string;
  cargaArchivoId: string;
};

type EntradaConversacion = Omit<ConversacionVista, "ultimoMensajeEn"> & { ultimoMensajeEn: string | null };

type ErrorHilo = { notificadorId: string; mensaje: string };

function rutaConversaciones(ventanaCargaId: string): string {
  return `/api/revisor/ventanas-carga/${ventanaCargaId}/conversaciones`;
}

// Columna izquierda: las conversaciones reales y, si el modal se abrió desde una fila sin
// conversación previa, una entrada provisional para ese notificador.
function construirEntradas(
  conversaciones: ConversacionVista[],
  notificadorInicial: NotificadorInicialMensajes | null,
): EntradaConversacion[] {
  if (!notificadorInicial || conversaciones.some((conversacion) => conversacion.notificadorId === notificadorInicial.id)) {
    return conversaciones;
  }

  const provisional: EntradaConversacion = {
    notificadorId: notificadorInicial.id,
    nombreCompleto: notificadorInicial.nombreCompleto,
    rut: notificadorInicial.rut,
    noLeidos: 0,
    ultimoMensajeEn: null,
  };

  return [provisional, ...conversaciones];
}

type PeticionEnvio = { url: string; cuerpo: Record<string, string> };

// Hay conversación si el par (notificador, ventana) ya tiene algún mensaje: entonces se sigue
// escribiendo por el endpoint de la conversación, aunque no quede archivo pendiente. Si no la hay,
// solo se puede iniciar desde la fila de una carga pendiente (`notificadorInicial`).
function resolverPeticionEnvio(
  ventanaCargaId: string,
  notificadorId: string,
  existeConversacion: boolean,
  notificadorInicial: NotificadorInicialMensajes | null,
  contenido: string,
): PeticionEnvio | null {
  if (existeConversacion) {
    return { url: `${rutaConversaciones(ventanaCargaId)}/${notificadorId}/mensajes`, cuerpo: { contenido } };
  }

  if (notificadorInicial?.id === notificadorId) {
    return { url: "/api/revisor/mensajes", cuerpo: { cargaArchivoId: notificadorInicial.cargaArchivoId, contenido } };
  }

  return null;
}

// Columna izquierda, consultada al abrir y en cada refresco periódico.
function useConversacionesVentana(ventanaCargaId: string, alCargar: (conversaciones: ConversacionVista[]) => void) {
  const [conversaciones, setConversaciones] = useState<ConversacionVista[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useRefrescoPeriodico(async (senal) => {
    const respuesta = await pedirJson<{ datos: ConversacionVista[] }>(rutaConversaciones(ventanaCargaId), senal);
    if (!respuesta) return;

    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }

    setError(null);
    setConversaciones(respuesta.datos.datos);
    alCargar(respuesta.datos.datos);
  }, ventanaCargaId);

  function marcarLeida(notificadorId: string) {
    setConversaciones((actuales) =>
      actuales?.map((conversacion) =>
        conversacion.notificadorId === notificadorId ? { ...conversacion, noLeidos: 0 } : conversacion,
      ) ?? null,
    );
  }

  // Tras un envío: si la conversación ya existe, se actualiza su `ultimoMensajeEn` en la columna
  // izquierda sin esperar al próximo refresco; si es nueva, se agrega al principio.
  function registrarEnvio(conversacion: ConversacionVista) {
    setConversaciones((actuales) => {
      const lista = actuales ?? [];
      const existe = lista.some((actual) => actual.notificadorId === conversacion.notificadorId);

      if (!existe) return [conversacion, ...lista];

      return lista.map((actual) =>
        actual.notificadorId === conversacion.notificadorId
          ? { ...actual, ultimoMensajeEn: conversacion.ultimoMensajeEn }
          : actual,
      );
    });
  }

  return { conversaciones, error, marcarLeida, registrarEnvio };
}

// Hilo del notificador seleccionado. Tras cada carga con respuestas sin leer, se marcan como
// leídas hasta el último mensaje mostrado (bandeja compartida: queda leído para todos).
function useHiloRevisor(
  ventanaCargaId: string,
  notificadorId: string | null,
  alMarcarLeidos: (id: string) => void,
  alIniciarLectura: ((lectura: Promise<unknown>) => void) | undefined,
) {
  const [hilo, setHilo] = useState<HiloRevisorVista | null>(null);
  const [error, setError] = useState<ErrorHilo | null>(null);

  useRefrescoPeriodico(async (senal) => {
    if (!notificadorId) return;

    const rutaHilo = `${rutaConversaciones(ventanaCargaId)}/${notificadorId}`;
    const respuesta = await pedirJson<HiloRevisorVista>(rutaHilo, senal);
    if (!respuesta) return;

    if (!respuesta.ok) {
      setError({ notificadorId, mensaje: respuesta.error });
      return;
    }

    setError(null);
    // Fusión por id: si esta consulta se pidió antes de un envío, su respuesta no trae el mensaje
    // recién enviado y no debe borrarlo de la vista.
    const recibido = respuesta.datos;
    setHilo((actual) =>
      actual?.notificador.id === recibido.notificador.id
        ? { ...recibido, mensajes: fusionarMensajes(recibido.mensajes, actual.mensajes) }
        : recibido,
    );

    const hasta = hastaParaMarcarLeidos(respuesta.datos.mensajes, "REVISOR");
    if (!hasta) return;

    const lectura = enviarJson<{ actualizados: number }>(`${rutaHilo}/lectura`, { hasta });
    alIniciarLectura?.(lectura);
    const marca = await lectura;
    if (marca.ok) alMarcarLeidos(notificadorId);
  }, notificadorId);

  function agregarMensaje(mensaje: MensajeVista) {
    setHilo((actual) =>
      actual && actual.notificador.id === notificadorId
        ? { ...actual, mensajes: fusionarMensajes([mensaje], actual.mensajes) }
        : actual,
    );
  }

  // Solo se muestra el hilo (o el error) del notificador seleccionado AHORA: al cambiar de
  // selección no queda a la vista el del anterior mientras llega el nuevo.
  const hiloVigente = hilo?.notificador.id === notificadorId ? hilo : null;
  const errorVigente = error?.notificadorId === notificadorId ? error.mensaje : null;

  return { hilo: hiloVigente, error: errorVigente, agregarMensaje };
}

type ListaConversacionesProps = {
  entradas: EntradaConversacion[];
  seleccionadoId: string | null;
  cargando: boolean;
  error: string | null;
  onSeleccionar: (notificadorId: string) => void;
};

function ListaConversaciones({ entradas, seleccionadoId, cargando, error, onSeleccionar }: ListaConversacionesProps) {
  if (error) {
    return (
      <p role="alert" className="px-4 py-3 text-sm font-medium text-gob-danger">
        {error}
      </p>
    );
  }

  if (cargando && entradas.length === 0) {
    return <p className="px-4 py-3 text-sm text-gob-gray-a">Cargando conversaciones...</p>;
  }

  if (entradas.length === 0) {
    return <p className="px-4 py-3 text-sm text-gob-gray-a">Todavía no hay mensajes con notificadores en esta ventana.</p>;
  }

  return (
    <ul className="divide-y divide-gob-accent/60">
      {entradas.map((entrada) => (
        <li key={entrada.notificadorId}>
          <BotonConversacion
            entrada={entrada}
            seleccionado={entrada.notificadorId === seleccionadoId}
            onSeleccionar={onSeleccionar}
          />
        </li>
      ))}
    </ul>
  );
}

type BotonConversacionProps = {
  entrada: EntradaConversacion;
  seleccionado: boolean;
  onSeleccionar: (notificadorId: string) => void;
};

function BotonConversacion({ entrada, seleccionado, onSeleccionar }: BotonConversacionProps) {
  return (
    <button
      type="button"
      aria-pressed={seleccionado}
      onClick={() => onSeleccionar(entrada.notificadorId)}
      className={`flex w-full items-start justify-between gap-2 px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gob-primary ${
        seleccionado ? "bg-gob-primary/10" : "hover:bg-gob-neutral"
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-gob-black">{entrada.nombreCompleto}</span>
        <span className="block text-xs tabular-nums text-gob-gray-a">{entrada.rut}</span>
        <span className="mt-0.5 block text-xs text-gob-gray-a">
          {entrada.ultimoMensajeEn ? formatearFechaHora(new Date(entrada.ultimoMensajeEn)) : "Sin mensajes"}
        </span>
      </span>
      {entrada.noLeidos > 0 ? (
        <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gob-danger px-1.5 text-xs font-bold text-white">
          {entrada.noLeidos}
          <span className="sr-only">{entrada.noLeidos === 1 ? " respuesta sin leer" : " respuestas sin leer"}</span>
        </span>
      ) : null}
    </button>
  );
}

type ColumnaConversacionProps = {
  seleccionado: EntradaConversacion;
  hilo: HiloRevisorVista | null;
  error: string | null;
  puedeEscribir: boolean;
  onEnviar: (contenido: string) => Promise<string | null>;
};

function ColumnaConversacion({ seleccionado, hilo, error, puedeEscribir, onEnviar }: ColumnaConversacionProps) {
  return (
    <>
      <div className="border-b border-gob-accent px-4 py-2">
        <p className="text-sm font-semibold text-gob-black">{seleccionado.nombreCompleto}</p>
        <p className="text-xs tabular-nums text-gob-gray-a">{seleccionado.rut}</p>
      </div>
      <HiloMensajes
        mensajes={hilo?.mensajes ?? []}
        ladoPropio="REVISOR"
        hayMasAntiguos={hilo?.hayMasAntiguos ?? false}
        cargando={hilo === null}
        error={error}
        textoVacio="Todavía no hay mensajes con este notificador en esta ventana."
        puedeEscribir={puedeEscribir}
        textoSinPermisoEscritura="Para iniciar una conversación, usa la opción «Mensaje» de una carga pendiente de aprobación."
        archivoAsociado={hilo?.cargaDestino?.nombreArchivoOriginal ?? null}
        etiquetaRedaccion={`Mensaje para ${seleccionado.nombreCompleto}`}
        onEnviar={onEnviar}
      />
    </>
  );
}

type ModalConversacionesRevisorProps = {
  ventanaCargaId: string;
  tituloVentana: string;
  notificadorInicial?: NotificadorInicialMensajes | null;
  onCerrar: () => void;
  // Recibe cada marca de lectura en vuelo, para que quien abrió el modal refresque los avisos
  // recién cuando la lectura llegó a la base (ver `useRefrescoTrasLecturas`).
  onLecturaIniciada?: (lectura: Promise<unknown>) => void;
};

// RF-31: modal de 2 columnas del equipo revisor, acotado a UNA ventana. Izquierda: notificadores
// con conversación; derecha: el hilo del seleccionado. Se monta solo mientras está abierto (quien
// lo usa lo renderiza condicionalmente), así cada apertura empieza con estado limpio.
export function ModalConversacionesRevisor({
  ventanaCargaId,
  tituloVentana,
  notificadorInicial = null,
  onCerrar,
  onLecturaIniciada,
}: ModalConversacionesRevisorProps) {
  const referenciaDialogo = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(notificadorInicial?.id ?? null);

  useEffect(() => {
    referenciaDialogo.current?.showModal();
  }, []);

  // Sin nadie seleccionado, se abre la primera conversación (más respuestas sin leer / más reciente).
  const conversaciones = useConversacionesVentana(ventanaCargaId, (lista) =>
    setSeleccionadoId((actual) => actual ?? lista[0]?.notificadorId ?? null),
  );
  const hilo = useHiloRevisor(ventanaCargaId, seleccionadoId, conversaciones.marcarLeida, onLecturaIniciada);

  const entradas = construirEntradas(conversaciones.conversaciones ?? [], notificadorInicial);
  const seleccionado = entradas.find((entrada) => entrada.notificadorId === seleccionadoId) ?? null;
  // Las entradas reales de la columna izquierda siempre traen `ultimoMensajeEn`; solo la provisional
  // (fila sin conversación previa) lo trae nulo.
  const existeConversacion =
    (hilo.hilo?.mensajes.length ?? 0) > 0 || (seleccionado?.ultimoMensajeEn ?? null) !== null;

  async function enviar(contenido: string): Promise<string | null> {
    if (!seleccionado) return "Selecciona un notificador";

    const peticion = resolverPeticionEnvio(
      ventanaCargaId,
      seleccionado.notificadorId,
      existeConversacion,
      notificadorInicial,
      contenido,
    );
    if (!peticion) return "No hay una conversación con este notificador en esta ventana";

    const respuesta = await enviarJson<{ mensaje: MensajeVista }>(peticion.url, peticion.cuerpo);
    if (!respuesta.ok) return respuesta.error;

    const nuevo = respuesta.datos.mensaje;
    hilo.agregarMensaje(nuevo);

    // Columna izquierda al día sin esperar al refresco: un notificador recién contactado pasa a ser
    // una conversación real; uno existente actualiza la fecha de su último mensaje.
    conversaciones.registrarEnvio({ ...seleccionado, ultimoMensajeEn: nuevo.creadoEn });

    return null;
  }

  return (
    <dialog
      ref={referenciaDialogo}
      aria-labelledby={idTitulo}
      onClose={onCerrar}
      className="m-auto w-[calc(100vw-2rem)] max-w-5xl overflow-hidden rounded-lg border border-gob-accent bg-white p-0 text-left text-gob-black shadow-2xl backdrop:bg-slate-950/55"
    >
      <div className="flex h-[80vh] flex-col md:h-[70vh]">
        <header className="flex items-start justify-between gap-4 border-b border-gob-accent px-5 py-4">
          <div className="min-w-0">
            <h2 id={idTitulo} className="text-lg font-semibold text-gob-tertiary">
              Mensajes con notificadores
            </h2>
            <p className="mt-0.5 truncate text-sm text-gob-gray-a">{tituloVentana}</p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar mensajes con notificadores"
            className="inline-flex size-8 items-center justify-center rounded text-2xl leading-none text-gob-gray-a hover:bg-gob-neutral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
          >
            ×
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav
            aria-label="Notificadores con mensajes"
            className="max-h-40 shrink-0 overflow-y-auto border-b border-gob-accent md:max-h-none md:w-72 md:border-r md:border-b-0"
          >
            <ListaConversaciones
              entradas={entradas}
              seleccionadoId={seleccionadoId}
              cargando={conversaciones.conversaciones === null}
              error={conversaciones.error}
              onSeleccionar={setSeleccionadoId}
            />
          </nav>

          <section aria-label="Conversación" className="flex min-h-0 flex-1 flex-col">
            {seleccionado ? (
              <ColumnaConversacion
                key={seleccionado.notificadorId}
                seleccionado={seleccionado}
                hilo={hilo.hilo}
                error={hilo.error}
                puedeEscribir={existeConversacion || notificadorInicial?.id === seleccionado.notificadorId}
                onEnviar={enviar}
              />
            ) : (
              <p className="px-4 py-3 text-sm text-gob-gray-a">Selecciona un notificador para ver la conversación.</p>
            )}
          </section>
        </div>
      </div>
    </dialog>
  );
}
