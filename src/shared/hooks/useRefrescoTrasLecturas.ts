"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

// RF-31: los avisos de mensajes sin leer (tarjetas y banner de los inicios) salen del servidor, así
// que se actualizan con `router.refresh()` al cerrar el modal. Pero lo que cambia esos avisos es la
// MARCA DE LECTURA, que el modal envía por su cuenta tras cargar el hilo: si el modal se cierra con
// esa petición todavía en vuelo (en desarrollo, la primera llamada a la ruta incluso espera su
// compilación), el refresh se pide antes de que la lectura llegue a la base y el aviso queda con el
// valor viejo hasta recargar la página. Este hook ordena ambas cosas: el modal registra cada marca
// de lectura que inicia y el refresh del cierre espera a que todas terminen (con éxito o no).
export function useRefrescoTrasLecturas() {
  const router = useRouter();
  const lecturasEnCurso = useRef(new Set<Promise<unknown>>());

  function registrarLectura(lectura: Promise<unknown>) {
    const enCurso = lecturasEnCurso.current;
    enCurso.add(lectura);
    void lectura.finally(() => enCurso.delete(lectura));
  }

  function refrescarTrasLecturas() {
    void Promise.allSettled(Array.from(lecturasEnCurso.current)).then(() => router.refresh());
  }

  return { registrarLectura, refrescarTrasLecturas };
}
