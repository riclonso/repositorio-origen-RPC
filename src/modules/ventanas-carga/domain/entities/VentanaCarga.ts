// RF-15: ventana de tiempo (medida en año calendario) durante la cual un notificador puede subir
// un archivo contra una regla `FECHA_DENTRO_DE_VENTANA_VIGENTE`. "Abierta" NO es un campo
// persistido: se calcula siempre con `estaAbierta()` contra un `ahora` que viaja como parámetro,
// mismo criterio que `TokenRecuperacion` (RF-10) usa para su vigencia.

// Corrección posterior a RF-15 (ampliación): la ventana ya no referencia un tipo de archivo
// genérico (`TipoArchivo`, EXCEL/CSV), sino un `FormatoExcel` concreto (`formatoExcelId`), que es
// el que trae las reglas y el número de columnas requeridas/opcionales reales.

export type VentanaCarga = {
  id: string;
  anio: number;
  fechaApertura: Date;
  fechaVencimiento: Date;
  // Formato de archivo concreto que esta ventana acepta. Elegido por ADMIN/REVISOR_REPOSITORIO al
  // crear la ventana; a diferencia de `anio`, SÍ es editable después (mismo endpoint PUT que las
  // fechas). Relación 1:1 desde `VentanaCarga` hacia `FormatoExcel`.
  formatoExcelId: string;
  // Denormalizado vía join a `FormatoExcel`, mismo criterio que `creadoPorNombre`/
  // `eliminadaPorNombre`: quien administra ventanas necesita el nombre del formato sin una
  // consulta aparte.
  formatoExcelNombre: string;
  // Nace en `false` (borrador) y se activa/desactiva con el endpoint PATCH dedicado. Mientras no
  // esté publicada, un notificador no debe verla, sin importar sus fechas (exclusión real en el
  // `WHERE` de `listarDisponibles()`, no solo en la UI).
  publicada: boolean;
  // Oculta la ventana de la vista por defecto del panel administrativo, recuperable por búsqueda
  // ("Mostrar archivadas"). Eje independiente de `publicada`/`eliminadaEn`: archivar apaga
  // `publicada` en la misma escritura (ver `publicacionResultanteAlArchivar`), pero desarchivar no
  // la vuelve a publicar sola.
  archivada: boolean;
  creadoPorId: string;
  // Denormalizado vía join a `Usuario`, mismo criterio que `CargaArchivo.usuarioNombre`: el ADMIN
  // y el REVISOR_REPOSITORIO necesitan saber quién creó cada ventana sin una consulta aparte.
  creadoPorNombre: string;
  // No nulo si la ventana fue eliminada (física si no tenía cargas asociadas — en ese caso la fila
  // ya no existe y estos campos no se observan desde fuera del repositorio —, lógica si ya tenía
  // alguna, para no perder a qué ventana perteneció una carga ya aprobada).
  eliminadaEn: Date | null;
  eliminadaPorId: string | null;
  eliminadaPorNombre: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Cantidad de `CargaArchivo` en estado APROBADA asociadas a esta ventana. Contado vía `_count`
  // de Prisma (nunca trayendo las cargas completas ni contando en JS), mismo patrón que
  // `FormatoExcelResumen.cantidadReglas`.
  cantidadCargas: number;
  // RF-17 (alertas por email): ambos nulos a la vez o ninguno (regla de `application/`). `null`
  // desactiva el envío automático de esta ventana; el envío manual sigue disponible igual.
  diasAnticipacionInicio: number | null;
  intervaloRepeticionDias: number | null;
  // HTML sanitizado (ver `PlantillaAlerta.ts`). NUNCA nulo: nace como copia de
  // `PLANTILLA_ALERTA_POR_DEFECTO_HTML` al crearse la ventana, editable después.
  plantillaAlerta: string;
};

export type DatosNuevaVentanaCarga = {
  anio: number;
  fechaApertura: Date;
  fechaVencimiento: Date;
  formatoExcelId: string;
  creadoPorId: string;
};

// `anio` no viaja aquí: es inmutable y se resuelve leyendo la ventana existente. `publicada`
// tampoco: nunca se edita junto a fechas/formato, tiene su propio endpoint PATCH dedicado.
export type DatosEdicionVentanaCarga = {
  fechaApertura: Date;
  fechaVencimiento: Date;
  formatoExcelId: string;
};

// Estado calculado, nunca persistido: una ventana está abierta si no fue eliminada y `ahora` cae
// dentro de `[fechaApertura, fechaVencimiento]`, ambos extremos inclusive. Una ventana eliminada
// (lógicamente) nunca vuelve a habilitar subidas, sin importar sus fechas.
export function estaAbierta(
  ventana: Pick<VentanaCarga, "fechaApertura" | "fechaVencimiento" | "eliminadaEn">,
  ahora: Date,
): boolean {
  return ventana.eliminadaEn === null && ventana.fechaApertura <= ahora && ahora <= ventana.fechaVencimiento;
}

// RF-15 (ampliación): una ventana solo debe ofrecerse a un notificador si, además de estar
// abierta, fue publicada explícitamente por un ADMIN/REVISOR_REPOSITORIO. Una ventana en borrador
// (`publicada: false`) nunca debe llegar al notificador, sin importar sus fechas.
export function disponibleParaNotificador(
  ventana: Pick<VentanaCarga, "fechaApertura" | "fechaVencimiento" | "eliminadaEn" | "publicada">,
  ahora: Date,
): boolean {
  return estaAbierta(ventana, ahora) && ventana.publicada;
}

// Vista de listado: misma forma que `VentanaCarga`, con el estado ya calculado para pintar la
// tabla de `/dashboard` y `/revisor` sin que la vista tenga que importar `estaAbierta()`.
export type VentanaCargaConEstado = VentanaCarga & { abierta: boolean };

// Archivar una ventana apaga siempre su publicación en la misma operación (decisión explícita),
// para que nunca quede disponible para el NOTIFICADOR_RPC estando fuera de la vista por defecto.
// Desarchivar NO la vuelve a publicar automáticamente: queda como borrador hasta que alguien la
// publique manualmente, igual que una ventana recién creada.
export function publicacionResultanteAlArchivar(publicadaActual: boolean, archivada: boolean): boolean {
  return archivada ? false : publicadaActual;
}

// No se puede publicar una ventana archivada ni una ya eliminada (esta segunda condición ya
// existía, verificada en línea dentro del caso de uso de publicación; se extrae aquí para nombrar
// la regla completa en un solo lugar).
export function puedePublicarse(ventana: Pick<VentanaCarga, "eliminadaEn" | "archivada">): boolean {
  return ventana.eliminadaEn === null && !ventana.archivada;
}

// RF-16 (tablero de seguimiento): umbral, en días, bajo el cual una ventana abierta se considera
// "por vencer" y la barra de progreso de tiempo cambia a color de alerta. Constante de dominio en
// código, no en BD, mismo patrón que `TOPE_FILAS_DATOS`/`TOPE_ERRORES_PERSISTIDOS`
// (`modules/reporte-excel/domain/entities/CargaArchivo.ts`).
export const UMBRAL_DIAS_ALERTA_VENCIMIENTO_VENTANA = 45;

const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

// Días restantes hasta el vencimiento, redondeados hacia arriba (un vencimiento a mitad de día
// cuenta como un día completo restante). `Math.max(0, ...)` es una defensa adicional: al venir ya
// filtrada por `listarDisponibles()`/`disponibleParaNotificador()`, `fechaVencimiento >= ahora`
// siempre debería cumplirse, pero no cuesta nada blindarlo contra un `ahora` inconsistente.
export function calcularDiasRestantes(fechaVencimiento: Date, ahora: Date): number {
  const diferenciaMs = fechaVencimiento.getTime() - ahora.getTime();
  return Math.max(0, Math.ceil(diferenciaMs / MILISEGUNDOS_POR_DIA));
}

// Fracción de tiempo transcurrido entre apertura y vencimiento, acotada a `[0, 1]`. Es la base de
// la barra de progreso "de tiempo": se LLENA a medida que pasa el tiempo, al revés de una barra de
// avance de tareas completadas.
export function calcularFraccionTiempoTranscurrido(
  fechaApertura: Date,
  fechaVencimiento: Date,
  ahora: Date,
): number {
  const duracionTotalMs = fechaVencimiento.getTime() - fechaApertura.getTime();

  // Ventana con fechas degeneradas (vencimiento <= apertura): no debería ocurrir (el formulario de
  // creación lo valida), pero de darse se trata como "ya consumida" en vez de dividir por cero.
  if (duracionTotalMs <= 0) return 1;

  const transcurridoMs = ahora.getTime() - fechaApertura.getTime();
  return Math.min(1, Math.max(0, transcurridoMs / duracionTotalMs));
}

// RF-17 (alertas por email): una ventana con `diasAnticipacionInicio`/`intervaloRepeticionDias`
// configurados (ambos, nunca solo uno, ver `application/ConfigurarAlertasVentanaCargaSchema`)
// empieza a enviar alertas automáticas `diasAnticipacionInicio` días antes de
// `fechaVencimiento`, y repite cada `intervaloRepeticionDias` días desde ese punto (incluyendo el
// propio día de inicio, día 0). `false` si cualquiera de los dos campos es `null`: sin
// configuración, esta ventana nunca dispara envío automático.
export function esDiaDeEnvioAutomatico(
  ventana: Pick<VentanaCarga, "fechaVencimiento" | "diasAnticipacionInicio" | "intervaloRepeticionDias">,
  ahora: Date,
): boolean {
  if (ventana.diasAnticipacionInicio === null || ventana.intervaloRepeticionDias === null) {
    return false;
  }

  const fechaInicioAlertas = new Date(
    ventana.fechaVencimiento.getTime() - ventana.diasAnticipacionInicio * MILISEGUNDOS_POR_DIA,
  );

  if (ahora < fechaInicioAlertas) {
    return false;
  }

  const diasTranscurridosDesdeInicio = Math.floor(
    (ahora.getTime() - fechaInicioAlertas.getTime()) / MILISEGUNDOS_POR_DIA,
  );

  return diasTranscurridosDesdeInicio % ventana.intervaloRepeticionDias === 0;
}
