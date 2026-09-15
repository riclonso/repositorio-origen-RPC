import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import type { VentanaCarga } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";

// Wrapper fino sobre `listarDisponibles`, usado por `app/notificador/page.tsx` para construir las
// combinaciones (formato, ventana) que se ofrecen para subir un archivo (RF-15 ampliación). Solo
// ventanas publicadas, ni eliminadas ni fuera de rango de fechas, AHORA MISMO.
export async function listarVentanasDisponiblesParaNotificador(
  dependencias: { repositorio: VentanaCargaRepository },
  ahora: Date = new Date(),
): Promise<VentanaCarga[]> {
  return dependencias.repositorio.listarDisponibles(ahora);
}
