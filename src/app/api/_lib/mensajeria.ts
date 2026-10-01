import type { NextResponse } from "next/server";
import { respuestaError } from "@/app/api/_lib/http";
import type { MensajeHilo } from "@/modules/mensajeria/domain/entities/MensajeCarga";
import type { MensajeVista } from "@/modules/mensajeria/schemas/vistas-mensajeria";

// RF-31: helpers compartidos por `/api/revisor/**` y `/api/notificador/ventanas-carga/**`. Cada
// carpeta los reexporta desde su propio `_lib/http.ts`.

// `esPropio` se resuelve aquí comparando el autor con la sesión: el cliente nunca lo infiere. Ni el
// `autorId` ni el `notificadorId` salen en la respuesta: no los necesita la vista.
export function aMensajeVista(mensaje: MensajeHilo, sesionId: string): MensajeVista {
  return {
    id: mensaje.id,
    contenido: mensaje.contenido,
    ladoAutor: mensaje.ladoAutor,
    autorNombre: mensaje.autorNombre,
    esPropio: mensaje.autorId === sesionId,
    cargaArchivoId: mensaje.cargaArchivoId,
    nombreArchivoOriginal: mensaje.nombreArchivoOriginal,
    creadoEn: mensaje.creadoEn.toISOString(),
    leidoEn: mensaje.leidoEn ? mensaje.leidoEn.toISOString() : null,
  };
}

export function respuestaRecursoNoEncontrado(): NextResponse {
  return respuestaError("El recurso solicitado no existe", 404, { codigo: "NO_ENCONTRADO" });
}

export function respuestaSinConversacion(): NextResponse {
  return respuestaError("Todavía no existe una conversación para responder en esta ventana", 409, {
    codigo: "SIN_CONVERSACION",
  });
}
