"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RespuestaSubida = { estado: number; cuerpo: unknown };

const TAMANO_PARTE = 50 * 1024 * 1024;
const MAXIMO_INTENTOS = 3;

type SesionSubida = { id: string; tamanoParteBytes: number; siguienteParte: number };

async function respuestaJson(respuesta: Response): Promise<RespuestaSubida> {
  const cuerpo: unknown = await respuesta.json().catch(() => null);
  return { estado: respuesta.status, cuerpo };
}

async function reintentar(
  operacion: () => Promise<RespuestaSubida>,
  signal: AbortSignal,
): Promise<RespuestaSubida> {
  for (let intento = 0; ; intento++) {
    signal.throwIfAborted();
    try {
      const respuesta = await operacion();
      if (respuesta.estado < 500 || intento === MAXIMO_INTENTOS - 1) return respuesta;
    } catch (error) {
      if (signal.aborted || intento === MAXIMO_INTENTOS - 1) throw error;
    }
    await new Promise<void>((resolve, reject) => {
      const abortar = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abortar);
        resolve();
      }, 1000 * (intento + 1));
      signal.addEventListener("abort", abortar, { once: true });
    });
  }
}

// Cada petición transporta como máximo 50 MiB. El progreso suma los bytes ya confirmados y
// los de la parte actual. Las partes y la finalización son idempotentes en el servidor.
export function useSubidaConProgreso(): {
  subir: (url: string, archivo: File, cabeceras: Record<string, string>) => Promise<RespuestaSubida>;
  progreso: number | null;
} {
  const [progreso, setProgreso] = useState<number | null>(null);
  const controladorRef = useRef<AbortController | null>(null);

  useEffect(() => () => controladorRef.current?.abort(), []);

  const subir = useCallback(async (url: string, archivo: File, cabeceras: Record<string, string>): Promise<RespuestaSubida> => {
    if (controladorRef.current) throw new Error("Ya hay una subida en curso");
    const controlador = new AbortController();
    controladorRef.current = controlador;
    const { signal } = controlador;
    const destino = new URL(url, window.location.origin);
    const rutaSubidas = `${destino.pathname}/subidas`;
    let rutaSesion: string | null = null;
    let completada = false;
    setProgreso(0);
    try {
      const inicio = await reintentar(async () => respuestaJson(await fetch(`${rutaSubidas}${destino.search}`, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tamanoBytes: archivo.size, nombreArchivo: archivo.name }),
      })), signal);
      if (inicio.estado >= 400) return inicio;
      const sesion = (inicio.cuerpo as { subida?: SesionSubida } | null)?.subida;
      if (!sesion || !/^[0-9a-f-]{36}$/i.test(sesion.id) || sesion.tamanoParteBytes !== TAMANO_PARTE || !Number.isInteger(sesion.siguienteParte) || sesion.siguienteParte < 0 || sesion.siguienteParte > Math.ceil(archivo.size / TAMANO_PARTE)) {
        throw new Error("Respuesta de inicio de subida inválida");
      }
      rutaSesion = `${rutaSubidas}/${sesion.id}`;
      const cantidad = Math.ceil(archivo.size / TAMANO_PARTE);
      for (let indice = 0; indice < cantidad; indice++) {
        const offset = indice * TAMANO_PARTE;
        const parte = archivo.slice(offset, Math.min(offset + TAMANO_PARTE, archivo.size));
        const rutaParte = `${rutaSesion}/partes/${indice}`;
        const respuesta = await reintentar(() => new Promise<RespuestaSubida>((resolve, reject) => {
          signal.throwIfAborted();
          const solicitud = new XMLHttpRequest();
          const abortar = () => solicitud.abort();
          const terminar = () => signal.removeEventListener("abort", abortar);
          solicitud.open("PUT", rutaParte);
          for (const [nombre, valor] of Object.entries(cabeceras)) solicitud.setRequestHeader(nombre, valor);
          solicitud.responseType = "json";
          solicitud.upload.onprogress = (evento) => {
            if (evento.lengthComputable) setProgreso(Math.floor(100 * (offset + Math.min(evento.loaded, parte.size)) / archivo.size));
          };
          solicitud.onload = () => { terminar(); resolve({ estado: solicitud.status, cuerpo: solicitud.response as unknown }); };
          solicitud.onerror = () => { terminar(); reject(new Error("Falló la subida de una parte")); };
          solicitud.onabort = () => { terminar(); reject(new Error("Subida cancelada")); };
          signal.addEventListener("abort", abortar, { once: true });
          solicitud.send(parte);
        }), signal);
        if (respuesta.estado >= 400) return respuesta;
        setProgreso(Math.floor(100 * (offset + parte.size) / archivo.size));
      }
      const resultado = await reintentar(async () => respuestaJson(await fetch(`${rutaSesion}/completar`, { method: "POST", signal })), signal);
      completada = resultado.estado === 202;
      return resultado;
    } finally {
      if (rutaSesion && !completada) {
        void fetch(rutaSesion, { method: "DELETE", keepalive: true }).catch(() => undefined);
      }
      controladorRef.current = null;
      setProgreso(null);
    }
  }, []);

  return { subir, progreso };
}
