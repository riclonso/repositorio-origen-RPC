import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import { estaAbierta, type VentanaCargaConEstado } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";

// Detalle de una ventana, con el estado calculado, mismo criterio que `ListarVentanasCarga`.
export async function obtenerVentanaCarga(
  id: string,
  dependencias: { repositorio: VentanaCargaRepository },
  ahora: Date = new Date(),
): Promise<VentanaCargaConEstado | null> {
  const ventana = await dependencias.repositorio.obtenerPorId(id);
  if (!ventana) return null;

  return { ...ventana, abierta: estaAbierta(ventana, ahora) };
}
