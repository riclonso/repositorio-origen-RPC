import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { SolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/domain/repositories/SolicitudReemplazoCargaRepository";
import type {
  OrigenSolicitudReemplazoCarga,
  SolicitudReemplazoCarga,
} from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { SolicitudReemplazoDuplicadaError } from "@/modules/solicitudes-reemplazo/domain/errors/SolicitudReemplazoDuplicadaError";

export type DatosSolicitarReemplazoCarga = {
  cargaArchivoId: string;
  usuarioId: string;
  motivo: string;
};

export type ResultadoSolicitarReemplazoCarga =
  | { ok: true; solicitud: SolicitudReemplazoCarga }
  // Cubre "no existe", "no es del actor" y "no está APROBADA": indistinguibles desde este
  // endpoint, mismo criterio de no revelar detalle interno que el resto del módulo de cargas.
  | { ok: false; motivo: "NO_ENCONTRADO" }
  // La carga existe, es del actor y está APROBADA, pero ya fue reemplazada por una carga posterior
  // (no es la vigente de su combinación formato/ventana): no tiene sentido pedir reemplazarla.
  | { ok: false; motivo: "NO_ES_VIGENTE" }
  | { ok: false; motivo: "SOLICITUD_DUPLICADA" }
  | { ok: false; motivo: "SOLICITUD_YA_APROBADA_VIGENTE" };

// Un notificador solicita reemplazar una de sus propias cargas: ya `APROBADA` (origen
// `CARGA_APROBADA`, camino original) o `PENDIENTE_VISTO_BUENO` ya finalizada y todavía sin decisión
// (origen `CARGA_PENDIENTE_DECISION`, ampliación). La aprobación de un ADMIN o REVISOR_REPOSITORIO
// (`RevisarSolicitudReemplazo`) es lo que habilita la subida real (o, para el segundo origen,
// rechaza la carga original y libera la combinación).
export async function solicitarReemplazoCarga(
  datos: DatosSolicitarReemplazoCarga,
  dependencias: {
    repositorio: SolicitudReemplazoCargaRepository;
    repositorioCargas: CargaArchivoRepository;
  },
): Promise<ResultadoSolicitarReemplazoCarga> {
  // Ownership explícito por `usuarioId`, filtrado en el `WHERE` de `obtenerPropiaPorId`: una carga
  // que no es del actor se trata como si no existiera.
  const carga = await dependencias.repositorioCargas.obtenerPropiaPorId(datos.cargaArchivoId, datos.usuarioId);

  if (!carga) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  let origen: OrigenSolicitudReemplazoCarga;

  if (carga.estado === "APROBADA") {
    const vigente = await dependencias.repositorioCargas.obtenerAprobadaVigentePorUsuarioYVentana(
      datos.usuarioId,
      carga.ventanaCargaId,
    );

    if (!vigente || vigente.id !== carga.id) {
      return { ok: false, motivo: "NO_ES_VIGENTE" };
    }

    origen = "CARGA_APROBADA";
  } else if (carga.estado === "PENDIENTE_VISTO_BUENO" && carga.finalizadaEn !== null) {
    // Defensa de coherencia (análoga al chequeo de "vigente" del camino `APROBADA`): la carga debe
    // seguir siendo la pendiente-finalizada de su combinación (usuario, ventana) al momento de
    // solicitar el reemplazo.
    const pendienteFinalizada = await dependencias.repositorioCargas.obtenerPendienteFinalizadaPorUsuarioYVentana(
      datos.usuarioId,
      carga.ventanaCargaId,
    );

    if (!pendienteFinalizada || pendienteFinalizada.id !== carga.id) {
      return { ok: false, motivo: "NO_ENCONTRADO" };
    }

    origen = "CARGA_PENDIENTE_DECISION";
  } else {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  const ahora = new Date();

  const pendiente = await dependencias.repositorio.obtenerPendientePorCarga(carga.id);
  if (pendiente) {
    return { ok: false, motivo: "SOLICITUD_DUPLICADA" };
  }

  const aprobadaUtilizable = await dependencias.repositorio.obtenerAprobadaUtilizablePorCarga(carga.id, ahora);
  if (aprobadaUtilizable) {
    return { ok: false, motivo: "SOLICITUD_YA_APROBADA_VIGENTE" };
  }

  try {
    const solicitud = await dependencias.repositorio.crear({
      cargaArchivoId: carga.id,
      solicitadoPorId: datos.usuarioId,
      motivo: datos.motivo,
      origen,
    });

    return { ok: true, solicitud };
  } catch (error) {
    // Cierra la ventana de carrera de dos peticiones concurrentes pasando el chequeo de arriba a
    // la vez: el índice único parcial rechaza la segunda escritura.
    if (error instanceof SolicitudReemplazoDuplicadaError) {
      return { ok: false, motivo: "SOLICITUD_DUPLICADA" };
    }
    throw error;
  }
}
