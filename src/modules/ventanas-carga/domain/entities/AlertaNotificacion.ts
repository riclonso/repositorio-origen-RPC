// RF-17: alertas por email a notificadores (NOTIFICADOR_RPC) que no han reportado su archivo en
// una ventana de carga. Tipos de dominio, siguiendo el estilo de `VentanaCarga.ts`/
// `ResumenSeguimientoVentana.ts`: nombres en español, sin nada de Prisma/infraestructura.

export type TipoAlertaNotificacion = "AUTOMATICA" | "MANUAL_MASIVA" | "MANUAL_INDIVIDUAL";
export type ResultadoAlertaNotificacion = "EXITO" | "ERROR";

// Notificador NOTIFICADOR_RPC activo, asignado al formato de la ventana, sin carga APROBADA en
// ella todavía. Sin `contrasenaHash`, mismo criterio que el resto del módulo de usuarios.
export type NotificadorPendiente = {
  id: string;
  nombres: string;
  apellidos: string;
  email: string;
};

// Fila a insertar en un lote de envío. `loteId` viaja ya generado por quien llama
// (`crypto.randomUUID()`), nunca generado por el repositorio.
export type NuevaAlertaNotificacion = {
  loteId: string;
  ventanaCargaId: string;
  usuarioId: string;
  tipo: TipoAlertaNotificacion;
  resultado: ResultadoAlertaNotificacion;
  asunto: string;
  // HTML final realmente enviado (o que se intentó enviar), ya sanitizado con
  // `sanitizarMensajeResueltoHtml`.
  mensaje: string;
  detalleError: string | null;
  disparadoPorId: string | null;
  // Día calendario (UTC "de pared") solo para `tipo = "AUTOMATICA"`; `null` en cualquier otro tipo.
  fechaProgramada: Date | null;
};

// Una fila del historial de envíos, agrupada por lote: `TablaLotesAlertaVentana` pinta una fila de
// tabla por cada una de estas.
export type LoteAlertaVentana = {
  loteId: string;
  tipo: TipoAlertaNotificacion;
  disparadoPorId: string | null;
  disparadoPorNombre: string | null;
  creadoEn: Date;
  cantidadExitos: number;
  cantidadErrores: number;
};

export type PaginaLotesAlerta = {
  filas: LoteAlertaVentana[];
  total: number;
};

// Una fila del acordeón expandido de un lote: a quién se le envió, cuándo y con qué resultado.
// Sin campo de establecimiento: no existe ese dato en el sistema.
export type DestinatarioAlertaVista = {
  usuarioId: string;
  nombreCompleto: string;
  email: string;
  resultado: ResultadoAlertaNotificacion;
  detalleError: string | null;
  createdAt: Date;
};

export type ResumenAlertasVentana = {
  ultimoEnvioExitosoEn: Date | null;
  ultimoEnvioConErrorEn: Date | null;
};

// Un total agregado por (tipo, resultado): "3 automáticas exitosas", "1 masiva con error", etc.
export type TotalAlertaVentana = {
  tipo: TipoAlertaNotificacion;
  resultado: ResultadoAlertaNotificacion;
  cantidad: number;
};
