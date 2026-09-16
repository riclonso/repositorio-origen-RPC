import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import type { VentanaCarga } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import {
  contienePlaceholderInvalido,
  sanitizarPlantillaAlertaHtml,
} from "@/modules/ventanas-carga/domain/entities/PlantillaAlerta";

export type ResultadoActualizarPlantillaAlertaVentanaCarga =
  | { ok: true; ventana: VentanaCarga }
  | { ok: false; motivo: "VENTANA_NO_ENCONTRADA" }
  | { ok: false; motivo: "PLACEHOLDER_INVALIDO"; placeholder: string };

// RF-17: guarda la plantilla HTML editada en el editor enriquecido. El HTML crudo del editor
// SIEMPRE pasa por `sanitizarPlantillaAlertaHtml` antes de cualquier otra cosa (nunca se persiste
// el HTML recibido del cliente sin sanear), y solo después se valida que los placeholders
// remanentes sean los permitidos.
export async function actualizarPlantillaAlertaVentanaCarga(
  id: string,
  plantillaAlertaHtml: string,
  dependencias: { repositorio: VentanaCargaRepository },
): Promise<ResultadoActualizarPlantillaAlertaVentanaCarga> {
  const plantillaSanitizada = sanitizarPlantillaAlertaHtml(plantillaAlertaHtml);

  const placeholderInvalido = contienePlaceholderInvalido(plantillaSanitizada);
  if (placeholderInvalido) {
    return { ok: false, motivo: "PLACEHOLDER_INVALIDO", placeholder: placeholderInvalido };
  }

  const actualizada = await dependencias.repositorio.actualizarPlantillaAlerta(id, plantillaSanitizada);

  if (!actualizada) {
    return { ok: false, motivo: "VENTANA_NO_ENCONTRADA" };
  }

  return { ok: true, ventana: actualizada };
}
