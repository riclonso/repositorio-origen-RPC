import Link from "next/link";
import { ViewTransition } from "react";
import type { VentanaCargaConEstado } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import { formatearFechaCalendario } from "@/shared/utils/fecha";
import { ListadoCargasVentana } from "@/shared/components/ListadoCargasVentana";
import { ListadoCargasRechazadasVentana } from "@/shared/components/ListadoCargasRechazadasVentana";
import { PestanasNotificacionesVentana } from "@/shared/components/PestanasNotificacionesVentana";
import { PestanasEnviosAlertaVentana } from "@/shared/components/PestanasEnviosAlertaVentana";
import { listarCargasPendientesODecididas } from "@/modules/reporte-excel/application/use-cases/ListarCargasPendientesODecididas";
import { listarCargasRechazadas } from "@/modules/reporte-excel/application/use-cases/ListarCargasRechazadas";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { FormularioAlertasVentana } from "@/shared/components/FormularioAlertasVentana";
import { FormularioPlantillaAlertaVentana } from "@/shared/components/FormularioPlantillaAlertaVentana";
import { TablaNotificadoresPendientesVentana } from "@/shared/components/TablaNotificadoresPendientesVentana";
import { ResumenTotalesAlertasVentana } from "@/shared/components/ResumenTotalesAlertasVentana";
import { TablaLotesAlertaVentana, type LoteAlertaVista } from "@/shared/components/TablaLotesAlertaVentana";
import { obtenerVistaAlertasVentana } from "@/modules/ventanas-carga/application/use-cases/ObtenerVistaAlertasVentana";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { prismaAlertaNotificacionRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaAlertaNotificacionRepository";
import { alertaVentanaMailer } from "@/modules/ventanas-carga/infrastructure/email/AlertaVentanaMailer";
import type {
  DestinatarioAlertaVista,
  PaginaLotesAlerta,
} from "@/modules/ventanas-carga/domain/entities/AlertaNotificacion";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";

const TAMANO_PAGINA_ALERTAS = 10;

type DetalleVentanaCargaProps = {
  ventana: VentanaCargaConEstado;
  rutaVolver: string;
  // Texto del enlace de volver: depende de por dónde entró la persona (tabla de ventanas o tarjeta
  // del tablero de seguimiento en el inicio), así que no puede quedar fijo en este componente.
  textoVolver: string;
  pagina: number;
  tamano: number;
  construirHref: (pagina: number) => string;
  // RF-17: página actual de cada una de las dos tablas del historial de alertas.
  paginaAlertasAutomaticas: number;
  paginaAlertasManuales: number;
};

function aDestinatariosVista(destinatarios: DestinatarioAlertaVista[]): LoteAlertaVista["destinatarios"] {
  return destinatarios.map((destinatario) => ({
    usuarioId: destinatario.usuarioId,
    nombreCompleto: destinatario.nombreCompleto,
    email: destinatario.email,
    resultado: destinatario.resultado,
    detalleError: destinatario.detalleError,
    createdAt: destinatario.createdAt.toISOString(),
  }));
}

function aPaginaVista(pagina: PaginaLotesAlerta, destinatariosPorLote: Record<string, DestinatarioAlertaVista[]>) {
  const lotes: LoteAlertaVista[] = pagina.filas.map((lote) => ({
    loteId: lote.loteId,
    tipo: lote.tipo,
    disparadoPorNombre: lote.disparadoPorNombre,
    creadoEn: lote.creadoEn.toISOString(),
    cantidadExitos: lote.cantidadExitos,
    cantidadErrores: lote.cantidadErrores,
    destinatarios: aDestinatariosVista(destinatariosPorLote[lote.loteId] ?? []),
  }));

  return { lotes, total: pagina.total };
}

// Compartido entre `/dashboard/ventanas-carga/[id]` (ADMIN) y `/revisor/ventanas-carga/[id]`
// (REVISOR_REPOSITORIO): detalle de una ventana con sus cargas ya APROBADAS y, desde RF-17, la
// sección "Alertas por email" (configuración, plantilla, pendientes e historial de envíos).
// `async` porque orquesta la carga de esa sección aquí mismo (`obtenerVistaAlertasVentana`), igual
// que `ListadoVentanasCarga` hace su propia carga de datos. Envuelto en `<ViewTransition>` porque
// es el contenido principal de cada `page.tsx`.
export async function DetalleVentanaCarga({
  ventana,
  rutaVolver,
  textoVolver,
  pagina,
  tamano,
  construirHref,
  paginaAlertasAutomaticas,
  paginaAlertasManuales,
}: DetalleVentanaCargaProps) {
  const [vistaAlertas, resultadoArchivo, resultadoRechazadas] = await Promise.all([
    obtenerVistaAlertasVentana(
      ventana,
      { paginaAutomatica: paginaAlertasAutomaticas, paginaManual: paginaAlertasManuales, tamano: TAMANO_PAGINA_ALERTAS },
      {
        repositorioVentanas: prismaVentanaCargaRepository,
        repositorioAlertas: prismaAlertaNotificacionRepository,
        enviadorCorreo: alertaVentanaMailer,
      },
    ),
    // Solo para el contador de la pestaña: `ListadoCargasVentana`/`ListadoCargasRechazadasVentana`
    // hacen su propio fetch (con la paginación real) para renderizar las filas.
    listarCargasPendientesODecididas(
      { ventanaCargaId: ventana.id, pagina: 1, tamano: 1 },
      { repositorio: prismaCargaArchivoRepository },
    ),
    listarCargasRechazadas(
      { ventanaCargaId: ventana.id, pagina: 1, tamano: 1 },
      { repositorio: prismaCargaArchivoRepository },
    ),
  ]);

  const automaticas = aPaginaVista(vistaAlertas.lotesAutomaticos, vistaAlertas.destinatariosPorLote);
  const manuales = aPaginaVista(vistaAlertas.lotesManuales, vistaAlertas.destinatariosPorLote);

  const pendientesVista = vistaAlertas.pendientes.map((pendiente) => ({
    id: pendiente.id,
    nombreCompleto: nombreCompleto(pendiente),
    email: pendiente.email,
    mensajePrevio: pendiente.mensajePrevio,
  }));

  return (
    <ViewTransition>
      <div className="flex flex-col gap-8">
        <div className="rounded-2xl border border-gob-accent bg-white p-6 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.35)]">
          <Link
            href={rutaVolver}
            className="text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
          >
            {textoVolver}
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gob-primary">
                Ventana de carga
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-gob-black">
                Cargas aprobadas — Ventana {ventana.anio}
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-gob-accent bg-gob-tertiary/10 px-3 py-1 text-xs font-semibold text-gob-black">
                {ventana.formatoExcelNombre}
              </span>
              <span className="rounded-full border border-gob-accent bg-gob-tertiary/10 px-3 py-1 text-xs font-semibold text-gob-black">
                Vigencia {formatearFechaCalendario(ventana.fechaApertura)} al{" "}
                {formatearFechaCalendario(ventana.fechaVencimiento)}
              </span>
            </div>
          </div>
        </div>

        <PestanasNotificacionesVentana
          notificacionesArchivo={
            <ListadoCargasVentana
              ventanaCargaId={ventana.id}
              pagina={pagina}
              tamano={tamano}
              construirHref={construirHref}
            />
          }
          totalArchivo={resultadoArchivo.paginacion.total}
          notificacionesRechazadas={<ListadoCargasRechazadasVentana ventanaCargaId={ventana.id} />}
          totalRechazadas={resultadoRechazadas.paginacion.total}
          notificadoresPendientes={
            <TablaNotificadoresPendientesVentana
              ventanaCargaId={ventana.id}
              pendientes={pendientesVista}
              correoDisponible={vistaAlertas.correoDisponible}
            />
          }
          totalNotificadoresPendientes={pendientesVista.length}
        />

        <section
          aria-labelledby="titulo-alertas-ventana"
          className="flex flex-col gap-4 border-t border-gob-accent pt-8"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gob-gray-a">Notificaciones</p>
            <h2 id="titulo-alertas-ventana" className="mt-1 text-lg font-bold text-gob-black">
              Alertas por email
            </h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <FormularioAlertasVentana
              ventanaCargaId={ventana.id}
              diasAnticipacionInicio={ventana.diasAnticipacionInicio}
              intervaloRepeticionDias={ventana.intervaloRepeticionDias}
            />
            <FormularioPlantillaAlertaVentana ventanaCargaId={ventana.id} plantillaAlerta={ventana.plantillaAlerta} />
          </div>


          <PestanasEnviosAlertaVentana
            enviosAutomaticos={
              <TablaLotesAlertaVentana
                titulo="Envíos automáticos"
                lotes={automaticas.lotes}
                pagina={paginaAlertasAutomaticas}
                tamano={TAMANO_PAGINA_ALERTAS}
                total={automaticas.total}
                parametroPagina="paginaAutomatica"
                mensajeVacio="Todavía no se ha enviado ninguna alerta automática en esta ventana."
              />
            }
            totalAutomaticos={automaticas.total}
            enviosManuales={
              <TablaLotesAlertaVentana
                titulo="Envíos manuales"
                lotes={manuales.lotes}
                pagina={paginaAlertasManuales}
                tamano={TAMANO_PAGINA_ALERTAS}
                total={manuales.total}
                parametroPagina="paginaManual"
                mensajeVacio="Todavía no se ha enviado ninguna alerta manual en esta ventana."
              />
            }
            totalManuales={manuales.total}
          />
        </section>
      </div>
    </ViewTransition>
  );
}
