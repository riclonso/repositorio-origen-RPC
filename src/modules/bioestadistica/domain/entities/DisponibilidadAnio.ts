import type { VentanaCarga } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";

// RF-37: un año está disponible para Bioestadística si AL MENOS UNA `ventana_carga` de ese año está
// publicada, no eliminada y abierta (`listarDisponibles(ahora)` ya las filtra así). La fecha de
// cierre que se muestra es el MÁXIMO vencimiento entre esas ventanas. "Alguna" en vez de un rango
// [mín. apertura, máx. vencimiento]: la unión es exacta (dos ventanas del año que no se traslapan no
// abren el hueco entre ambas). Función pura.
export type AnioDisponibleBioestadistica = {
  anio: number;
  // Hora de pared de Chile escrita en UTC (convenio de las ventanas).
  cierraEl: Date;
};

export function resolverAniosDisponibles(
  ventanasDisponibles: Pick<VentanaCarga, "anio" | "fechaVencimiento">[],
): AnioDisponibleBioestadistica[] {
  const cierrePorAnio = new Map<number, Date>();

  for (const ventana of ventanasDisponibles) {
    const actual = cierrePorAnio.get(ventana.anio);
    if (!actual || ventana.fechaVencimiento.getTime() > actual.getTime()) {
      cierrePorAnio.set(ventana.anio, ventana.fechaVencimiento);
    }
  }

  return [...cierrePorAnio]
    .map(([anio, cierraEl]) => ({ anio, cierraEl }))
    .toSorted((a, b) => b.anio - a.anio);
}
