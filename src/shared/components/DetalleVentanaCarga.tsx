import Link from "next/link";
import { ViewTransition } from "react";
import type { VentanaCargaConEstado } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import { formatearFechaCalendario } from "@/shared/utils/fecha";
import { ListadoCargasVentana } from "@/shared/components/ListadoCargasVentana";
import { ListadoCargasRechazadasVentana } from "@/shared/components/ListadoCargasRechazadasVentana";
import { PestanasNotificacionesVentana } from "@/shared/components/PestanasNotificacionesVentana";
import { PestanasEnviosAlertaVentana } from "@/shared/components/PestanasEnviosAlertaVentana";
import { listarCargasAprobadas } from "@/modules/reporte-excel/application/use-cases/ListarCargasAprobadas";
import { listarCargasRechazadas } from "@/modules/reporte-excel/application/use-cases/ListarCargasRechazadas";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { FormularioAlertasVentana } from "@/shared/components/FormularioAlertasVentana";
import { FormularioPlantillaAlertaVentana } from "@/shared/components/FormularioPlantillaAlertaVentana";
import { TablaNotificadoresPendientesVentana } from "@/shared/components/TablaNotificadoresPendientesVentana";
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
import { tituloVentanaMensajes } from "@/modules/mensajeria/schemas/vistas-mensajeria";
import { IconoAdvertencia, IconoCalendario, IconoDocumento } from "@/shared/components/iconos";

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
  // RF-31: `true` solo en `/revisor/ventanas-carga/[id]`. ADMIN no participa de la mensajería con
  // los notificadores, así que `/dashboard` pasa `false`.
  permiteMensajes: boolean;
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
  permiteMensajes,
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
    // Solo para el contador de la pestaña: `ListadoCargasVentana` hace su propio fetch (con la paginación real)
    // para renderizar las filas. Aquí solo contamos las cargas APROBADAS.
    listarCargasAprobadas(
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
      <div id="inicio-detalle-ventana" className="mx-auto flex w-full max-w-7xl flex-col gap-8 pb-8 pt-6 px-4 md:px-6">
        <Link
          href={rutaVolver}
          className="inline-flex w-fit items-center gap-2 rounded-lg bg-gob-primary px-4 py-2.5 text-base font-bold text-white transition-all hover:bg-gob-primary-oscuro"
        >
          {textoVolver}
        </Link>

        <header className="space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-gob-primary/70">Ventana de carga</p>
            <h1 className="mt-2 text-4xl md:text-5xl font-extrabold tracking-tight text-gob-black">
              Carga {ventana.anio}
            </h1>
          </div>
          <p className="max-w-2xl text-lg text-gob-gray-a">Revisa las cargas recibidas y gestiona las alertas de esta ventana.</p>
        </header>

        <section aria-label="Contexto de la ventana" className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border border-gob-primary/10 bg-linear-to-br from-gob-primary/5 to-transparent p-5 backdrop-blur-sm hover:border-gob-primary/20 transition-colors">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gob-primary/10 text-gob-primary"><IconoDocumento /></div>
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-gob-primary/70">Formato</p>
                <p className="truncate text-sm font-bold text-gob-tertiary">{ventana.formatoExcelNombre}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gob-primary/10 bg-linear-to-br from-gob-primary/5 to-transparent p-5 backdrop-blur-sm hover:border-gob-primary/20 transition-colors">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gob-primary/10 text-gob-primary"><IconoCalendario /></div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-gob-primary/70">Vigencia</p>
                <p className="text-sm font-bold text-gob-tertiary">{formatearFechaCalendario(ventana.fechaApertura)} — {formatearFechaCalendario(ventana.fechaVencimiento)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gob-primary/10 bg-linear-to-br from-gob-primary/5 to-transparent p-5 backdrop-blur-sm hover:border-gob-primary/20 transition-colors">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gob-primary/10 text-gob-primary"><IconoCalendario /></div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-gob-primary/70">Creada el</p>
                <p className="text-sm font-bold text-gob-tertiary">{formatearFechaCalendario(ventana.createdAt)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gob-primary/10 bg-linear-to-br from-gob-primary/5 to-transparent p-5 backdrop-blur-sm hover:border-gob-primary/20 transition-colors">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gob-primary/10 text-gob-primary"><IconoCalendario /></div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-gob-primary/70">Días para reemplazar</p>
                <p className="text-sm font-bold text-gob-tertiary">{ventana.diasVigenciaReemplazo} {ventana.diasVigenciaReemplazo === 1 ? "día" : "días"} tras aprobar</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gob-success/20 bg-linear-to-br from-gob-success/10 to-transparent p-5 backdrop-blur-sm hover:border-gob-success/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gob-success/10 text-gob-success"><IconoAdvertencia /></div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-gob-success/70">Alertas por email</p>
                <p className="text-sm font-bold text-gob-tertiary">{ventana.diasAnticipacionInicio === null ? "Sin programación" : "Programadas"}</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="titulo-cargas" className="overflow-hidden rounded-3xl border border-gob-primary/10 bg-white shadow-[0_8px_16px_rgba(23,59,105,0.08)]">
          <div className="border-b border-gob-primary/5 bg-linear-to-r from-gob-primary/2 to-transparent px-6 py-5">
            <p className="text-xs font-bold uppercase tracking-widest text-gob-primary/60">Revisión de archivos</p>
            <h2 id="titulo-cargas" className="mt-2 text-2xl font-bold text-gob-black">Cargas de la ventana</h2>
          </div>
          <div className="p-5 md:p-6">
        <PestanasNotificacionesVentana
          notificacionesArchivo={
            <ListadoCargasVentana
              ventanaCargaId={ventana.id}
              tituloVentana={tituloVentanaMensajes(ventana.formatoExcelNombre, ventana.anio)}
              permiteMensajes={permiteMensajes}
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
          </div>
        </section>

        <section
          aria-labelledby="titulo-alertas-ventana"
          className="flex flex-col gap-6 rounded-3xl border border-gob-primary/10 bg-white p-6 md:p-8 shadow-[0_8px_16px_rgba(23,59,105,0.08)]"
        >
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gob-primary/60">Notificaciones</p>
            <h2 id="titulo-alertas-ventana" className="text-3xl font-bold text-gob-black">
              Alertas por email
            </h2>
            <p className="text-base text-gob-gray-a">Configura recordatorios y consulta el historial de envíos.</p>
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
