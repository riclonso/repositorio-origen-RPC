"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  LONGITUD_MAXIMA_MENSAJE,
  TOPE_MENSAJES_HILO,
  type LadoMensaje,
} from "@/modules/mensajeria/domain/entities/MensajeCarga";
import { contenidoMensajeSchema } from "@/modules/mensajeria/schemas/mensaje.schema";
import { Boton } from "@/shared/components/Boton";
import { IconoEnviarMensaje, IconoMensaje, IconoMensajeLeido } from "@/shared/components/iconos";
import type { MensajeVista } from "@/modules/mensajeria/schemas/vistas-mensajeria";
import { formatearFechaHora } from "@/shared/utils/fecha";
import estilos from "./Chat.module.css";

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
    <li className={`${estilos.filaMensaje} ${alineadaDerecha ? estilos.filaPropia : ""}`}>
      <article className={`${estilos.burbuja} ${alineadaDerecha ? estilos.burbujaPropia : ""}`}>
        <p className={estilos.textoMensaje}>
          <span className={estilos.autor}>{mensaje.esPropio ? "Tú dices:" : `${mensaje.autorNombre} dice:`}</span>{" "}
          {mensaje.contenido}
        </p>
        <p className={estilos.metadatos}>
          <time dateTime={mensaje.creadoEn}>{fecha}</time>
          {alineadaDerecha && mensaje.leidoEn ? <span className={estilos.leido}><IconoMensajeLeido /> Leído</span> : null}
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
  const etiquetaEnviar = enviando ? "Enviando mensaje" : "Enviar mensaje";

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
    <div className={estilos.hilo}>
      <div
        ref={referenciaLista}
        role="log"
        aria-live="polite"
        aria-label="Mensajes de la conversación"
        className={estilos.historial}
      >
        {hayMasAntiguos ? (
          <p className={estilos.notaHistorial}>
            Se muestran los {TOPE_MENSAJES_HILO} mensajes más recientes.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className={estilos.error}>
            {error}
          </p>
        ) : cargando && cantidadMensajes === 0 ? (
          <div className={estilos.estado} role="status">
            <span aria-hidden="true" className={estilos.avatar}><IconoMensaje /></span>
            <p>Cargando mensajes...</p>
          </div>
        ) : cantidadMensajes === 0 ? (
          <div className={estilos.estado}>
            <span aria-hidden="true" className={estilos.avatar}><IconoMensaje /></span>
            <p>{textoVacio}</p>
          </div>
        ) : (
          <ol className={estilos.listaMensajes}>
            {mensajes.map((mensaje) => (
              <BurbujaMensaje key={mensaje.id} mensaje={mensaje} alineadaDerecha={mensaje.ladoAutor === ladoPropio} />
            ))}
          </ol>
        )}
      </div>

      {puedeEscribir ? (
        <form onSubmit={(evento) => void enviar(evento)} className={estilos.formulario}>
          <label htmlFor={idTexto} className="sr-only">
            {etiquetaRedaccion}
          </label>
          <div className={estilos.redaccion}>
            <textarea
              id={idTexto}
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              disabled={enviando}
              maxLength={LONGITUD_MAXIMA_MENSAJE}
              rows={1}
              aria-describedby={idAyuda}
              placeholder="Escribe tu mensaje"
              className={estilos.campo}
            />
            <Boton type="submit" disabled={texto.trim().length === 0} cargando={enviando}
              aria-label={etiquetaEnviar} className={estilos.enviar}>
              <IconoEnviarMensaje />
              <span className="sr-only">{etiquetaEnviar}</span>
            </Boton>
          </div>
          <div id={idAyuda} className={estilos.ayuda}>
            {archivoAsociado ? (
              <p className={estilos.archivoAsociado}>
                Se asociará a: <span className="font-semibold">{archivoAsociado}</span>
              </p>
            ) : null}
            <p>No incluyas datos de pacientes en los mensajes.</p>
            <p className={estilos.contador}>{texto.length}/{LONGITUD_MAXIMA_MENSAJE}</p>
          </div>

          {errorEnvio ? (
            <p role="alert" className={estilos.error}>
              {errorEnvio}
            </p>
          ) : null}
        </form>
      ) : (
        <p className={estilos.sinPermiso}>{textoSinPermisoEscritura}</p>
      )}
    </div>
  );
}
