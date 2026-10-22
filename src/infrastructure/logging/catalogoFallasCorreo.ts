// RF-44: catálogo de los avisos por correo del sistema y de las etapas en que pueden fallar.
// Módulo PURO (sin Node): lo importan el helper de escritura (`fallasCorreo.ts`, Node-only), el
// lector de logs y los componentes del visor, incluido el filtro, que es un Client Component.

export const TIPOS_AVISO_CORREO = [
  "ENLACE_RECUPERACION",
  "ENLACE_CONTRASENA_ADMIN",
  "APROBACION_CARGA_NOTIFICADOR",
  "APROBACION_CARGA_REVISORES",
  "RECHAZO_CARGA",
  "RESULTADO_SOLICITUD_REEMPLAZO",
  "RESULTADO_SOLICITUD_REEMPLAZO_BIOESTADISTICA",
  "ALERTA_VENTANA",
  "AVISO_MENSAJE_NOTIFICADOR",
  "AVISO_MENSAJE_REVISORES",
] as const;

export type TipoAvisoCorreo = (typeof TIPOS_AVISO_CORREO)[number];

export const ETIQUETA_TIPO_AVISO: Record<TipoAvisoCorreo, string> = {
  ENLACE_RECUPERACION: "Recuperación de contraseña",
  ENLACE_CONTRASENA_ADMIN: "Enlace de contraseña (administración)",
  APROBACION_CARGA_NOTIFICADOR: "Carga aprobada (al notificador)",
  APROBACION_CARGA_REVISORES: "Carga aprobada (al equipo revisor)",
  RECHAZO_CARGA: "Carga rechazada",
  RESULTADO_SOLICITUD_REEMPLAZO: "Resultado de solicitud de reemplazo",
  RESULTADO_SOLICITUD_REEMPLAZO_BIOESTADISTICA: "Resultado de solicitud de reemplazo (Bioestadística)",
  ALERTA_VENTANA: "Alerta de ventana de carga",
  AVISO_MENSAJE_NOTIFICADOR: "Mensaje nuevo (al notificador)",
  AVISO_MENSAJE_REVISORES: "Respuesta nueva (al equipo revisor)",
};

export function esTipoAvisoCorreo(valor: unknown): valor is TipoAvisoCorreo {
  return typeof valor === "string" && (TIPOS_AVISO_CORREO as readonly string[]).includes(valor);
}

// ENVIO: el relay rechazó o no respondió. PREPARACION: una excepción técnica antes de enviar (BD al
// buscar al destinatario, fallo del conteo anti-ráfaga). SIN_CONFIGURACION: el grupo SMTP no está
// definido, así que el aviso no pudo ni intentarse.
export const ETAPAS_FALLA_CORREO = ["ENVIO", "PREPARACION", "SIN_CONFIGURACION"] as const;

export type EtapaFallaCorreo = (typeof ETAPAS_FALLA_CORREO)[number];

export const ETIQUETA_ETAPA_FALLA: Record<EtapaFallaCorreo, string> = {
  ENVIO: "Envío fallido",
  PREPARACION: "No se pudo preparar",
  SIN_CONFIGURACION: "Correo sin configurar",
};

export function esEtapaFallaCorreo(valor: unknown): valor is EtapaFallaCorreo {
  return typeof valor === "string" && (ETAPAS_FALLA_CORREO as readonly string[]).includes(valor);
}

// Archivo activo y rotación por tamaño de `logs/fallas-correo.txt` (ver `loggerFallasCorreo`). Con
// `tailable`, los rotados son `fallas-correo1.txt` (el más reciente) a `fallas-correo4.txt` (el más
// antiguo). Viven aquí para que escritor y lector usen exactamente los mismos valores.
export const ARCHIVO_FALLAS_CORREO = "fallas-correo.txt";
export const TAMANO_MAXIMO_FALLAS_CORREO = 5 * 1024 * 1024;
export const ARCHIVOS_MAXIMOS_FALLAS_CORREO = 5;

// Del más antiguo al más reciente (el activo al final), que es el orden en que se leen.
export function archivosFallasCorreoEnOrden(): string[] {
  const rotados = Array.from(
    { length: ARCHIVOS_MAXIMOS_FALLAS_CORREO - 1 },
    (_, indice) => `fallas-correo${ARCHIVOS_MAXIMOS_FALLAS_CORREO - 1 - indice}.txt`,
  );
  return [...rotados, ARCHIVO_FALLAS_CORREO];
}

// Nombre legible de una ventana de carga: no tiene un nombre propio, se identifica por su formato y
// año (mismo criterio que los correos y las etiquetas de mensajería).
export function nombreVentanaCarga(formatoExcelNombre: string, anio: number): string {
  return `${formatoExcelNombre} (${anio})`;
}
