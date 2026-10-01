import type { LadoMensaje } from "@/modules/mensajeria/domain/entities/MensajeCarga";

// RF-31: contrato JSON de la mensajería entre los Route Handlers (`app/api/revisor/**`,
// `app/api/notificador/ventanas-carga/**`) y los componentes cliente (`HiloMensajes`, modales).
// Vive en el módulo, junto a los esquemas Zod, para que el backend no dependa de la carpeta de
// componentes. Fechas siempre como ISO. Solo tipos y funciones puras: lo importan ambos lados.

export type MensajeVista = {
  id: string;
  contenido: string;
  ladoAutor: LadoMensaje;
  autorNombre: string;
  // Lo calcula el servidor comparando el autor con la sesión: el cliente nunca lo infiere.
  esPropio: boolean;
  cargaArchivoId: string;
  nombreArchivoOriginal: string;
  creadoEn: string;
  leidoEn: string | null;
};

export type ConversacionVista = {
  notificadorId: string;
  nombreCompleto: string;
  rut: string;
  noLeidos: number;
  ultimoMensajeEn: string;
};

export type ArchivoReferenciadoVista = {
  id: string;
  nombreArchivoOriginal: string;
};

export type HiloRevisorVista = {
  notificador: { id: string; nombreCompleto: string; rut: string };
  cargaPendiente: ArchivoReferenciadoVista | null;
  cargaDestino: ArchivoReferenciadoVista | null;
  mensajes: MensajeVista[];
  hayMasAntiguos: boolean;
};

export type HiloNotificadorVista = {
  mensajes: MensajeVista[];
  puedeResponder: boolean;
  hayMasAntiguos: boolean;
};

// Etiqueta de una ventana con mensajes sin leer y sin tarjeta en el inicio (banner).
export type VentanaMensajesSinLeerVista = {
  ventanaCargaId: string;
  titulo: string;
};

export function tituloVentanaMensajes(formatoExcelNombre: string, anio: number): string {
  return `${formatoExcelNombre} · ${anio}`;
}

// Fecha del último mensaje mostrado que todavía no fue leído por quien mira (mensajes del lado
// contrario): es el `hasta` de la marca de lectura. `null` si no hay nada que marcar.
export function hastaParaMarcarLeidos(mensajes: MensajeVista[], ladoPropio: LadoMensaje): string | null {
  const hayNoLeidos = mensajes.some((mensaje) => mensaje.ladoAutor !== ladoPropio && mensaje.leidoEn === null);
  if (!hayNoLeidos) return null;

  return mensajes.at(-1)?.creadoEn ?? null;
}

function compararCronologico(primero: MensajeVista, segundo: MensajeVista): number {
  if (primero.creadoEn !== segundo.creadoEn) return primero.creadoEn < segundo.creadoEn ? -1 : 1;
  return primero.id < segundo.id ? -1 : primero.id > segundo.id ? 1 : 0;
}

// Fusiona por `id` la respuesta de una consulta del hilo con lo que ya se muestra: un mensaje
// recién enviado (agregado localmente) no desaparece si llega una consulta que se pidió antes del
// envío. Para un mismo id gana la versión del servidor (trae `leidoEn` al día). ISO 8601 en UTC
// ordena bien como texto.
export function fusionarMensajes(delServidor: MensajeVista[], mostrados: MensajeVista[]): MensajeVista[] {
  const porId = new Map(mostrados.map((mensaje) => [mensaje.id, mensaje]));

  for (const mensaje of delServidor) {
    porId.set(mensaje.id, mensaje);
  }

  return Array.from(porId.values()).sort(compararCronologico);
}
