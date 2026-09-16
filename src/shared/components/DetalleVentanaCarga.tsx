import Link from "next/link";
import { ViewTransition } from "react";
import type { VentanaCargaConEstado } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import { formatearFechaCalendario } from "@/shared/utils/fecha";
import { ListadoCargasVentana } from "@/shared/components/ListadoCargasVentana";
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
  const vistaAlertas = await obtenerVistaAlertasVentana(
    ventana,
    { paginaAutomatica: paginaAlertasAutomaticas, paginaManual: paginaAlertasManuales, tamano: TAMANO_PAGINA_ALERTAS },
    {
      repositorioVentanas: prismaVentanaCargaRepository,
      repositorioAlertas: prismaAlertaNotificacionRepository,
      enviadorCorreo: alertaVentanaMailer,
    },
  );

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
      <div className="flex flex-col gap-6">
        <div>
          <Link
            href={rutaVolver}
            className="text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
          >
            {textoVolver}
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-gob-black">
            Cargas aprobadas — Ventana {ventana.anio}
          </h1>
          <p className="mt-2 text-sm text-gob-gray-a">
            Formato: {ventana.formatoExcelNombre} · Vigencia {formatearFechaCalendario(ventana.fechaApertura)} al{" "}
            {formatearFechaCalendario(ventana.fechaVencimiento)}
          </p>
        </div>

        <ListadoCargasVentana
          ventanaCargaId={ventana.id}
          pagina={pagina}
          tamano={tamano}
          construirHref={construirHref}
        />

        <section aria-labelledby="titulo-alertas-ventana" className="flex flex-col gap-4">
          <h2 id="titulo-alertas-ventana" className="text-lg font-semibold text-gob-black">
            Alertas por email
          </h2>

          <div className="grid gap-4 lg:grid-cols-2">
            <FormularioAlertasVentana
              ventanaCargaId={ventana.id}
              diasAnticipacionInicio={ventana.diasAnticipacionInicio}
              intervaloRepeticionDias={ventana.intervaloRepeticionDias}
            />
            <FormularioPlantillaAlertaVentana ventanaCargaId={ventana.id} plantillaAlerta={ventana.plantillaAlerta} />
          </div>

          <TablaNotificadoresPendientesVentana
            ventanaCargaId={ventana.id}
            pendientes={pendientesVista}
            correoDisponible={vistaAlertas.correoDisponible}
          />

          <div className="rounded-lg border border-gob-accent bg-white p-4">
            <h3 className="text-sm font-semibold text-gob-black">Totales del historial</h3>
            <div className="mt-3">
              <ResumenTotalesAlertasVentana totales={vistaAlertas.totales} />
            </div>
          </div>

          <TablaLotesAlertaVentana
            titulo="Envíos automáticos"
            lotes={automaticas.lotes}
            pagina={paginaAlertasAutomaticas}
            tamano={TAMANO_PAGINA_ALERTAS}
            total={automaticas.total}
            parametroPagina="paginaAutomatica"
            mensajeVacio="Todavía no se ha enviado ninguna alerta automática en esta ventana."
          />

          <TablaLotesAlertaVentana
            titulo="Envíos manuales"
            lotes={manuales.lotes}
            pagina={paginaAlertasManuales}
            tamano={TAMANO_PAGINA_ALERTAS}
            total={manuales.total}
            parametroPagina="paginaManual"
            mensajeVacio="Todavía no se ha enviado ninguna alerta manual en esta ventana."
          />
        </section>
      </div>
    </ViewTransition>
  );
}
