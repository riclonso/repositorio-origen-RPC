"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  LONGITUD_MAXIMA_MENSAJE,
  TOPE_MENSAJES_HILO,
  type LadoMensaje,
} from "@/modules/mensajeria/domain/entities/MensajeCarga";
import { contenidoMensajeSchema } from "@/modules/mensajeria/schemas/mensaje.schema";
import { Boton } from "@/shared/components/Boton";
import { IconoDocumento } from "@/shared/components/iconos";
import type { MensajeVista } from "@/modules/mensajeria/schemas/vistas-mensajeria";
import { formatearFechaHora } from "@/shared/utils/fecha";

type BurbujaMensajeProps = {
  mensaje: MensajeVista;
  alineadaDerecha: boolean;
};

// El contenido se muestra siempre como texto plano: React lo escapa, y `whitespace-pre-wrap` +
// `break-words` respetan saltos de línea sin desbordar. Nunca `dangerouslySetInnerHTML` ni
// conversión de URLs a enlaces.
function BurbujaMensaje({ mensaje, alineadaDerecha }: BurbujaMensajeProps) {
  const fecha = formatearFechaHora(new Date(mensaje.creadoEn));

  return (
    <li className={`flex ${alineadaDerecha ? "justify-end" : "justify-start"}`}>
      <article
        className={`max-w-[85%] rounded-lg px-3 py-2 shadow-sm ${
          alineadaDerecha ? "rounded-br-sm bg-gob-primary text-white" : "rounded-bl-sm border border-gob-accent bg-white text-gob-black"
        }`}
      >
        <p className="text-xs font-semibold">{mensaje.esPropio ? "Tú" : mensaje.autorNombre}</p>
        <p
          className={`mt-0.5 inline-flex max-w-full items-center gap-1 text-xs ${alineadaDerecha ? "text-white" : "text-gob-gray-a"}`}
        >
          <IconoDocumento className="shrink-0" />
          <span className="truncate" title={mensaje.nombreArchivoOriginal}>
            {mensaje.nombreArchivoOriginal}
          </span>
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{mensaje.contenido}</p>
        <p className={`mt-1 text-right text-xs tabular-nums ${alineadaDerecha ? "text-white" : "text-gob-gray-a"}`}>
          <time dateTime={mensaje.creadoEn}>{fecha}</time>
          {alineadaDerecha && mensaje.leidoEn ? <span> · Leído</span> : null}
        </p>
      </article>
    </li>
  );
}

type HiloMensajesProps = {
  mensajes: MensajeVista[];
  // Lado de quien mira: sus mensajes (y los de su mismo lado) van a la derecha.
  ladoPropio: LadoMensaje;
  hayMasAntiguos: boolean;
  cargando: boolean;
  error: string | null;
  // Texto cuando el hilo todavía no tiene mensajes.
  textoVacio: string;
  puedeEscribir: boolean;
  textoSinPermisoEscritura: string;
  // Nombre del archivo al que se asociará el próximo mensaje, si corresponde mostrarlo.
  archivoAsociado: string | null;
  etiquetaRedaccion: string;
  // Devuelve un mensaje de error, o `null` si el envío tuvo éxito (entonces se limpia la caja).
  onEnviar: (contenido: string) => Promise<string | null>;
};

// RF-31: hilo de mensajes estilo chat (burbujas + caja de redacción), presentacional y compartido
// por los modales del revisor y del notificador. No conoce la API: quien lo usa resuelve la carga
// y el envío.
export function HiloMensajes({
  mensajes,
  ladoPropio,
  hayMasAntiguos,
  cargando,
  error,
  textoVacio,
  puedeEscribir,
  textoSinPermisoEscritura,
  archivoAsociado,
  etiquetaRedaccion,
  onEnviar,
}: HiloMensajesProps) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const referenciaLista = useRef<HTMLDivElement>(null);
  const idTexto = useId();
  const idAyuda = useId();

  const cantidadMensajes = mensajes.length;

  // Al llegar mensajes nuevos (propios o del otro lado) el hilo se desplaza al más reciente.
  useEffect(() => {
    const lista = referenciaLista.current;
    if (lista) lista.scrollTop = lista.scrollHeight;
  }, [cantidadMensajes]);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const validacion = contenidoMensajeSchema.safeParse(texto);

    if (!validacion.success) {
      setErrorEnvio(validacion.error.issues[0]?.message ?? "Escribe un mensaje");
      return;
    }

    setEnviando(true);
    setErrorEnvio(null);

    const errorRespuesta = await onEnviar(validacion.data);

    setEnviando(false);

    if (errorRespuesta) {
      setErrorEnvio(errorRespuesta);
      return;
    }

    setTexto("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={referenciaLista}
        role="log"
        aria-live="polite"
        aria-label="Mensajes de la conversación"
        className="min-h-0 flex-1 overflow-y-auto bg-gob-neutral/60 px-4 py-3"
      >
        {hayMasAntiguos ? (
          <p className="mb-3 text-center text-xs text-gob-gray-a">
            Se muestran los {TOPE_MENSAJES_HILO} mensajes más recientes.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm font-medium text-gob-danger">
            {error}
          </p>
        ) : cargando && cantidadMensajes === 0 ? (
          <p className="text-sm text-gob-gray-a">Cargando mensajes...</p>
        ) : cantidadMensajes === 0 ? (
          <p className="text-sm text-gob-gray-a">{textoVacio}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {mensajes.map((mensaje) => (
              <BurbujaMensaje key={mensaje.id} mensaje={mensaje} alineadaDerecha={mensaje.ladoAutor === ladoPropio} />
            ))}
          </ol>
        )}
      </div>

      {puedeEscribir ? (
        <form onSubmit={(evento) => void enviar(evento)} className="flex flex-col gap-2 border-t border-gob-accent bg-white px-4 py-3">
          <label htmlFor={idTexto} className="sr-only">
            {etiquetaRedaccion}
          </label>
          <textarea
            id={idTexto}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            disabled={enviando}
            maxLength={LONGITUD_MAXIMA_MENSAJE}
            rows={3}
            aria-describedby={idAyuda}
            placeholder="Escribe tu mensaje"
            className="w-full resize-none rounded-md border border-gob-accent bg-white px-3 py-2 text-sm text-gob-black outline-none placeholder:text-gob-gray-b focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30 disabled:bg-gob-neutral"
          />
          <div id={idAyuda} className="flex flex-col gap-1 text-xs text-gob-gray-a">
            <div className="flex flex-wrap items-start justify-between gap-2">
              {archivoAsociado ? (
                <p className="min-w-0 break-all">
                  Se asociará a: <span className="font-semibold text-gob-black">{archivoAsociado}</span>
                </p>
              ) : (
                <span />
              )}
              <p className="shrink-0 tabular-nums">
                {texto.length}/{LONGITUD_MAXIMA_MENSAJE}
              </p>
            </div>
            <p>No incluyas datos de pacientes en los mensajes.</p>
          </div>

          {errorEnvio ? (
            <p role="alert" className="text-sm font-medium text-gob-danger">
              {errorEnvio}
            </p>
          ) : null}

          <Boton type="submit" disabled={texto.trim().length === 0} cargando={enviando} textoCargando="Enviando..." className="w-fit self-end">
            Enviar
          </Boton>
        </form>
      ) : (
        <p className="border-t border-gob-accent bg-white px-4 py-3 text-sm text-gob-gray-a">{textoSinPermisoEscritura}</p>
      )}
    </div>
  );
}
