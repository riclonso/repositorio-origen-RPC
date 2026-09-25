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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-7 pb-8">
        <header className="border-b border-[#cbd9e7] pb-6">
          <Link
            href={rutaVolver}
            className="inline-flex text-sm font-semibold text-gob-primary underline-offset-2 transition-colors hover:text-gob-primary-oscuro hover:underline"
          >
            {textoVolver}
          </Link>

          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-gob-primary">Ventana de carga</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gob-tertiary md:text-4xl">Carga {ventana.anio}</h1>
          <p className="mt-2 text-base text-gob-gray-a">Revisa las cargas recibidas y gestiona las alertas de esta ventana.</p>
        </header>

        <section aria-label="Contexto de la ventana" className="grid gap-3 md:grid-cols-3">
          <div className="flex gap-3 rounded-xl border border-[#d8e4f0] bg-white p-4"><span className="flex size-9 items-center justify-center rounded-lg bg-[#e8f2fb] text-gob-primary"><IconoDocumento /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[#58738e]">Formato</p><p className="mt-1 truncate text-sm font-bold text-gob-tertiary">{ventana.formatoExcelNombre}</p></div></div>
          <div className="flex gap-3 rounded-xl border border-[#d8e4f0] bg-white p-4"><span className="flex size-9 items-center justify-center rounded-lg bg-[#e8f2fb] text-gob-primary"><IconoCalendario /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-[#58738e]">Vigencia</p><p className="mt-1 text-sm font-bold text-gob-tertiary">{formatearFechaCalendario(ventana.fechaApertura)} — {formatearFechaCalendario(ventana.fechaVencimiento)}</p></div></div>
          <div className="flex gap-3 rounded-xl border border-[#d8e4f0] bg-white p-4"><span className="flex size-9 items-center justify-center rounded-lg bg-[#eaf5ef] text-gob-success"><IconoAdvertencia /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-[#58738e]">Alertas por email</p><p className="mt-1 text-sm font-bold text-gob-tertiary">{ventana.diasAnticipacionInicio === null ? "Sin programación" : "Programadas"}</p></div></div>
        </section>

        <section aria-labelledby="titulo-cargas" className="overflow-hidden rounded-xl border border-[#d8e4f0] bg-white shadow-[0_8px_22px_rgba(23,59,105,0.05)]">
          <div className="border-b border-[#e6edf5] px-5 py-4"><p className="text-xs font-semibold uppercase tracking-wide text-gob-primary">Revisión de archivos</p><h2 id="titulo-cargas" className="mt-1 text-xl font-bold text-gob-tertiary">Cargas de la ventana</h2></div>
          <div className="p-3 md:p-5">
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
          </div>
        </section>

        <section
          aria-labelledby="titulo-alertas-ventana"
          className="flex flex-col gap-6 rounded-xl border border-[#d8e4f0] bg-white p-5 shadow-[0_8px_22px_rgba(23,59,105,0.05)]"
        >
          <div className="border-b border-[#dbe8f3] bg-[#eff7fc] -mx-5 -mt-5 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-gob-primary">Notificaciones</p>
            <h2 id="titulo-alertas-ventana" className="text-2xl font-bold text-gob-black">
              Alertas por email
            </h2>
            <p className="mt-1 text-sm text-gob-gray-a">Configura recordatorios y consulta el historial de envíos.</p>
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
