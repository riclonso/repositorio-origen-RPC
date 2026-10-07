import type { CargaBioestadistica } from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";
import { solicitudBioestadisticaUtilizable } from "@/modules/bioestadistica/domain/entities/SolicitudReemplazoBioestadistica";
import type { TipoArchivoBioestadistica } from "@/modules/bioestadistica/domain/entities/TipoArchivoBioestadistica";
import type { CargaBioestadisticaRepository } from "@/modules/bioestadistica/domain/repositories/CargaBioestadisticaRepository";
import type { SolicitudReemplazoBioestadisticaRepository } from "@/modules/bioestadistica/domain/repositories/SolicitudReemplazoBioestadisticaRepository";
import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";

export type AutorizacionSubidaBioestadistica =
  // Primera subida del (año, tipo): el año está disponible.
  | { ok: true; reemplazo: null }
  // Reemplazo de la ACTIVA, autorizado por una solicitud aprobada y utilizable.
  | { ok: true; reemplazo: { cargaAnterior: CargaBioestadistica; solicitudId: string } }
  // Sin ACTIVA y el año no tiene ninguna ventana publicada y abierta.
  | { ok: false; motivo: "SIN_ANIO_DISPONIBLE" }
  // Con ACTIVA y sin ninguna solicitud aprobada pendiente de usar.
  | { ok: false; motivo: "YA_REPORTADO" }
  // Con ACTIVA y una solicitud aprobada que ya no es utilizable (vencida, o el año ya no tiene
  // ninguna ventana publicada y no archivada).
  | { ok: false; motivo: "REEMPLAZO_NO_AUTORIZADO" };

// RF-37: decide si la persona puede subir un archivo para (año, tipo) en `ahora`.
//  - Sin ACTIVA: el año debe estar DISPONIBLE (alguna ventana publicada, no eliminada y abierta).
//  - Con ACTIVA: hace falta una solicitud de reemplazo aprobada y utilizable sobre ella; que el año
//    esté abierto no importa (la aprobación habilita fuera de plazo), pero sí que tenga al menos una
//    ventana publicada y no archivada (ajuste aprobado de RF-36: archivar o despublicar bloquea).
// La vigencia por fecha cuenta al RECIBIR el archivo: el consumo al activar es solo condicional.
export async function resolverAutorizacionSubidaBioestadistica(
  entrada: { usuarioId: string; anio: number; tipoArchivo: TipoArchivoBioestadistica; ahora: Date },
  dependencias: {
    repositorioCargas: CargaBioestadisticaRepository;
    repositorioSolicitudes: SolicitudReemplazoBioestadisticaRepository;
    repositorioVentanas: VentanaCargaRepository;
  },
): Promise<AutorizacionSubidaBioestadistica> {
  const activa = await dependencias.repositorioCargas.obtenerActiva(entrada.usuarioId, entrada.anio, entrada.tipoArchivo);

  if (!activa) {
    const disponibles = await dependencias.repositorioVentanas.listarDisponibles(entrada.ahora);
    return disponibles.some((ventana) => ventana.anio === entrada.anio)
      ? { ok: true, reemplazo: null }
      : { ok: false, motivo: "SIN_ANIO_DISPONIBLE" };
  }

  const [solicitud, resumenes] = await Promise.all([
    dependencias.repositorioSolicitudes.obtenerAprobadaSinUsarPorCarga(activa.id),
    dependencias.repositorioVentanas.listarDiasVigenciaPorAnio([entrada.anio]),
  ]);

  if (!solicitud) return { ok: false, motivo: "YA_REPORTADO" };

  const resumenAnio = resumenes.find((resumen) => resumen.anio === entrada.anio) ?? null;

  return solicitudBioestadisticaUtilizable(solicitud, resumenAnio, entrada.ahora)
    ? { ok: true, reemplazo: { cargaAnterior: activa, solicitudId: solicitud.id } }
    : { ok: false, motivo: "REEMPLAZO_NO_AUTORIZADO" };
}
