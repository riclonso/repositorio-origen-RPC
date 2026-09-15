// RF-16 (tablero de seguimiento): vista agregada de una ventana de carga ABIERTA, con los conteos
// de notificadores y el avance de tiempo ya resueltos, para pintar una tarjeta en
// `/dashboard` y `/revisor` sin que el componente tenga que hacer aritmética de fechas ni conocer
// reglas de negocio (mismo criterio que `VentanaCargaConEstado` para el estado `abierta`).
export type ResumenSeguimientoVentanaCarga = {
  ventanaCargaId: string;
  formatoExcelId: string;
  formatoExcelNombre: string;
  anio: number;
  fechaApertura: Date;
  fechaVencimiento: Date;
  // Notificadores NOTIFICADOR_RPC ACTIVOS asignados al formato de esta ventana (cuenta
  // ESTRUCTURAL: no filtra por `FormatoExcel.activo`, ver `contarNotificadoresAsignadosActivosPorFormato`).
  totalNotificadoresAsignados: number;
  // Notificadores DISTINTOS (no filas de `CargaArchivo`) con al menos una carga APROBADA en esta
  // ventana, ver `contarNotificadoresDistintosPorVentana`.
  totalNotificadoresReportaron: number;
  diasRestantes: number;
  // 0..1: fracción de tiempo transcurrido entre `fechaApertura` y `fechaVencimiento`. La barra de
  // progreso se LLENA con el tiempo (no se vacía), a diferencia de una barra de avance de tareas.
  fraccionTiempoTranscurrido: number;
  // `diasRestantes <= UMBRAL_DIAS_ALERTA_VENCIMIENTO_VENTANA`, ya resuelto aquí para que la vista
  // no reimporte la constante de dominio.
  vencimientoProximo: boolean;
};
