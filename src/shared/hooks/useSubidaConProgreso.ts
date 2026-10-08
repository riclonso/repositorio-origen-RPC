"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RespuestaSubida = { estado: number; cuerpo: unknown };

// RF-38: sube un archivo como CUERPO CRUDO (no multipart) con `XMLHttpRequest`, que a diferencia de
// `fetch` informa el avance de la subida: con archivos de hasta 300 MB el porcentaje es
// imprescindible. `progreso` es 0..100 mientras se sube y `null` en reposo. Al desmontar se aborta.
// Las cabeceras viajan tal cual (el nombre del archivo debe ir ya con `encodeURIComponent`).
export function useSubidaConProgreso(): {
  subir: (url: string, archivo: File, cabeceras: Record<string, string>) => Promise<RespuestaSubida>;
  progreso: number | null;
} {
  const [progreso, setProgreso] = useState<number | null>(null);
  const solicitudRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => () => solicitudRef.current?.abort(), []);

  const subir = useCallback((url: string, archivo: File, cabeceras: Record<string, string>) => {
    return new Promise<RespuestaSubida>((resolver, rechazar) => {
      const solicitud = new XMLHttpRequest();
      solicitudRef.current = solicitud;
      solicitud.open("POST", url);
      for (const [nombre, valor] of Object.entries(cabeceras)) solicitud.setRequestHeader(nombre, valor);
      solicitud.responseType = "json";

      setProgreso(0);
      solicitud.upload.onprogress = (evento) => {
        if (evento.lengthComputable && evento.total > 0) setProgreso(Math.floor((evento.loaded / evento.total) * 100));
      };

      const terminar = () => {
        solicitudRef.current = null;
        setProgreso(null);
      };

      solicitud.onload = () => {
        terminar();
        resolver({ estado: solicitud.status, cuerpo: solicitud.response as unknown });
      };
      solicitud.onerror = () => {
        terminar();
        rechazar(new Error("Falló la subida"));
      };
      solicitud.onabort = () => {
        terminar();
        rechazar(new Error("Subida cancelada"));
      };

      solicitud.send(archivo);
    });
  }, []);

  return { subir, progreso };
}
