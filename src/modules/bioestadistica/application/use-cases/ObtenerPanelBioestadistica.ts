import {
  procesamientoExpirado,
  type CargaBioestadistica,
  type MotivoFalloCargaBioestadistica,
} from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";
import { resolverAniosDisponibles } from "@/modules/bioestadistica/domain/entities/DisponibilidadAnio";
import {
  derivarEstadoTarjetaBioestadistica,
  ultimoFalloVisible,
  type EstadoTarjetaBioestadistica,
  type UltimoFalloTarjeta,
} from "@/modules/bioestadistica/domain/entities/EstadoTarjetaBioestadistica";
import {
  fechaVencimientoSolicitudBioestadistica,
  indexarResumenesPorAnio,
  solicitudBioestadisticaUtilizable,
  type SolicitudReemplazoBioestadistica,
} from "@/modules/bioestadistica/domain/entities/SolicitudReemplazoBioestadistica";
import {
  TIPOS_ARCHIVO_BIOESTADISTICA,
  type TipoArchivoBioestadistica,
} from "@/modules/bioestadistica/domain/entities/TipoArchivoBioestadistica";
import type { CargaBioestadisticaRepository } from "@/modules/bioestadistica/domain/repositories/CargaBioestadisticaRepository";
import type { SolicitudReemplazoBioestadisticaRepository } from "@/modules/bioestadistica/domain/repositories/SolicitudReemplazoBioestadisticaRepository";
import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";

export type TarjetaPanelBioestadistica = {
  anio: number;
  tipoArchivo: TipoArchivoBioestadistica;
  // Cierre del año (hora de pared de Chile escrita en UTC) si está disponible; `null` si el año ya
  // cerró y la tarjeta aparece solo por una solicitud en curso o un procesamiento.
  cierraEl: Date | null;
  estado: EstadoTarjetaBioestadistica;
  cargaActiva: Pick<CargaBioestadistica, "id" | "nombreArchivoOriginal" | "createdAt" | "cantidadFilasDatos"> | null;
  // Instante real hasta el cual la autorización habilita subir el reemplazo.
  venceElAutorizacion: Date | null;
  ultimoFallo: UltimoFalloTarjeta | null;
};

function clave(anio: number, tipoArchivo: TipoArchivoBioestadistica): string {
  return `${anio}::${tipoArchivo}`;
}

type IndicesPanel = {
  activas: Map<string, CargaBioestadistica>;
  procesando: Set<string>;
  ultimosFallos: Map<string, UltimoFalloTarjeta>;
};

// Ya vienen ordenadas de la más reciente a la más antigua: el primer fallo de cada combinación es el
// último ocurrido. Un PROCESANDO expirado no cuenta como en curso (respaldo de los huérfanos).
function indexarCargas(cargas: CargaBioestadistica[], ahora: Date): IndicesPanel {
  const indices: IndicesPanel = { activas: new Map(), procesando: new Set(), ultimosFallos: new Map() };

  for (const carga of cargas) {
    const llave = clave(carga.anio, carga.tipoArchivo);

    if (carga.estado === "ACTIVA") indices.activas.set(llave, carga);
    if (carga.estado === "PROCESANDO" && !procesamientoExpirado(carga, ahora)) indices.procesando.add(llave);
    if (carga.estado === "FALLIDA" && carga.motivoFallo && !indices.ultimosFallos.has(llave)) {
      indices.ultimosFallos.set(llave, {
        motivo: carga.motivoFallo as MotivoFalloCargaBioestadistica,
        nombreArchivoOriginal: carga.nombreArchivoOriginal,
        fecha: carga.createdAt,
      });
    }
  }

  return indices;
}

// RF-37: arma las tarjetas del inicio de Bioestadística. Un año aparece si está DISPONIBLE (alguna
// ventana publicada y abierta, `resolverAniosDisponibles`) con sus dos tipos; además, un (año, tipo)
// ya cerrado aparece si tiene un procesamiento en curso o una solicitud de reemplazo pendiente o
// utilizable (RF-36: la aprobación habilita subir fuera de plazo). Consultas acotadas, sin N+1.
export async function obtenerPanelBioestadistica(
  usuarioId: string,
  ahora: Date,
  dependencias: {
    repositorioCargas: CargaBioestadisticaRepository;
    repositorioSolicitudes: SolicitudReemplazoBioestadisticaRepository;
    repositorioVentanas: VentanaCargaRepository;
  },
): Promise<TarjetaPanelBioestadistica[]> {
  const [cargas, solicitudes, ventanasDisponibles] = await Promise.all([
    dependencias.repositorioCargas.listarParaPanel(usuarioId),
    dependencias.repositorioSolicitudes.listarPropias(usuarioId),
    dependencias.repositorioVentanas.listarDisponibles(ahora),
  ]);

  const aniosDisponibles = resolverAniosDisponibles(ventanasDisponibles);
  const indices = indexarCargas(cargas, ahora);

  const aniosConSolicitud = solicitudes.map((solicitud) => solicitud.anio);
  const resumenes = indexarResumenesPorAnio(
    await dependencias.repositorioVentanas.listarDiasVigenciaPorAnio(aniosConSolicitud),
  );

  // Solicitudes sobre la ACTIVA vigente de cada combinación (las de cargas ya reemplazadas no
  // cuentan).
  const solicitudesPorCombinacion = new Map<string, SolicitudReemplazoBioestadistica[]>();
  for (const solicitud of solicitudes) {
    const llave = clave(solicitud.anio, solicitud.tipoArchivo);
    if (indices.activas.get(llave)?.id !== solicitud.cargaBioestadisticaId) continue;
    solicitudesPorCombinacion.set(llave, [...(solicitudesPorCombinacion.get(llave) ?? []), solicitud]);
  }

  const cierrePorAnio = new Map(aniosDisponibles.map((disponible) => [disponible.anio, disponible.cierraEl]));
  const combinaciones = new Set<string>();

  for (const { anio } of aniosDisponibles) {
    for (const tipo of TIPOS_ARCHIVO_BIOESTADISTICA) combinaciones.add(clave(anio, tipo));
  }

  const tarjetas: TarjetaPanelBioestadistica[] = [];
  const candidatas = new Map<string, { anio: number; tipoArchivo: TipoArchivoBioestadistica }>();

  for (const solicitud of solicitudes) candidatas.set(clave(solicitud.anio, solicitud.tipoArchivo), solicitud);
  for (const carga of cargas) candidatas.set(clave(carga.anio, carga.tipoArchivo), carga);
  for (const { anio } of aniosDisponibles) {
    for (const tipoArchivo of TIPOS_ARCHIVO_BIOESTADISTICA) candidatas.set(clave(anio, tipoArchivo), { anio, tipoArchivo });
  }

  for (const [llave, { anio, tipoArchivo }] of candidatas) {
    const activa = indices.activas.get(llave) ?? null;
    const solicitudesActiva = solicitudesPorCombinacion.get(llave) ?? [];
    const resumenAnio = resumenes.get(anio) ?? null;
    const utilizable = solicitudesActiva.find((solicitud) => solicitudBioestadisticaUtilizable(solicitud, resumenAnio, ahora));
    const pendiente = solicitudesActiva.some((solicitud) => solicitud.estado === "PENDIENTE");
    const procesando = indices.procesando.has(llave);

    // Un año cerrado solo muestra la combinación si hay algo en curso que seguir.
    if (!combinaciones.has(llave) && !procesando && !pendiente && !utilizable) continue;

    tarjetas.push({
      anio,
      tipoArchivo,
      cierraEl: cierrePorAnio.get(anio) ?? null,
      estado: derivarEstadoTarjetaBioestadistica({
        hayActiva: activa !== null,
        hayProcesando: procesando,
        haySolicitudPendiente: pendiente,
        haySolicitudUtilizable: utilizable !== undefined,
      }),
      cargaActiva: activa
        ? {
            id: activa.id,
            nombreArchivoOriginal: activa.nombreArchivoOriginal,
            createdAt: activa.createdAt,
            cantidadFilasDatos: activa.cantidadFilasDatos,
          }
        : null,
      venceElAutorizacion: utilizable ? fechaVencimientoSolicitudBioestadistica(utilizable, resumenAnio) : null,
      ultimoFallo: ultimoFalloVisible(indices.ultimosFallos.get(llave) ?? null, activa?.createdAt ?? null),
    });
  }

  const ordenTipo = (tipo: TipoArchivoBioestadistica) => TIPOS_ARCHIVO_BIOESTADISTICA.indexOf(tipo);
  return tarjetas.toSorted((a, b) => b.anio - a.anio || ordenTipo(a.tipoArchivo) - ordenTipo(b.tipoArchivo));
}
