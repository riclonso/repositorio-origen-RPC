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
