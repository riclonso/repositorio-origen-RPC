import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import { estaAbierta, type VentanaCargaConEstado } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";

// Lista todas las ventanas con su estado calculado (`abierta`), para pintar la tabla de
// `/dashboard/ventanas-carga` y `/revisor/ventanas-carga`. `ahora` viaja como parámetro para que
// el cálculo sea determinístico y comprobable, mismo criterio que el resto del módulo.
export async function listarVentanasCarga(
  dependencias: { repositorio: VentanaCargaRepository },
  ahora: Date = new Date(),
): Promise<VentanaCargaConEstado[]> {
  const ventanas = await dependencias.repositorio.listar();
  return ventanas.map((ventana) => ({ ...ventana, abierta: estaAbierta(ventana, ahora) }));
}
