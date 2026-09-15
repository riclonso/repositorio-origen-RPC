// Regla compartida entre `schemas/ventana-carga.schema.ts` (validación de entrada) y
// `application/use-cases/EditarVentanaCarga.ts` (revalidación de servidor, por si acaso):
// una fecha de la ventana debe caer dentro del año calendario que declara `VentanaCarga.anio`,
// del 1 de enero (00:00:00.000) al 31 de diciembre (23:59:59.999) de ese año.
export function fechaDentroDelAnio(fecha: Date, anio: number): boolean {
  return fecha.getUTCFullYear() === anio;
}
