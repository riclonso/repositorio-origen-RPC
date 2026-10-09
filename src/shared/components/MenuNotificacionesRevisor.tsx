"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import type { BandejaRevision, NotificacionRevision } from "@/modules/notificaciones/domain/NotificacionRevision";
import { registrarLecturaEnBandeja } from "@/modules/notificaciones/application/RegistrarLecturaEnBandeja";
import { formatearFechaHora } from "@/shared/utils/fecha";
import { IconoNotificaciones } from "@/shared/components/iconos";

type MenuNotificacionesRevisorProps = {
  bandeja: BandejaRevision;
};

function useBandejaNotificaciones(bandeja: BandejaRevision) {
  const [ampliacion, setAmpliacion] = useState<{ base: BandejaRevision; datos: BandejaRevision; pagina: number } | null>(null);
  const datos = ampliacion?.base === bandeja ? ampliacion.datos : bandeja;
  const pagina = ampliacion?.base === bandeja ? ampliacion.pagina : 1;
  const cantidad = datos.noLeidas;
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function mostrarMas() {
    if (cargando) return;
    setCargando(true);
    setError(null);
    try {
      const respuesta = await fetch(`/api/revisor/notificaciones?pagina=${pagina + 1}`, { cache: "no-store" });
      if (!respuesta.ok) throw new Error("No se pudieron cargar las notificaciones. Intenta nuevamente.");
      const nuevas: BandejaRevision = await respuesta.json();
      const unicas = new Map([...datos.notificaciones, ...nuevas.notificaciones].map(aviso => [aviso.id, aviso]));
      setAmpliacion({ base: bandeja, datos: { notificaciones: [...unicas.values()], total: nuevas.total, noLeidas: nuevas.noLeidas }, pagina: pagina + 1 });
    } catch {
      setError("No se pudieron cargar las notificaciones. Intenta nuevamente.");
    } finally {
      setCargando(false);
    }
  }

  async function marcarLeida(aviso: NotificacionRevision) {
    if (aviso.leido) return true;
    setError(null);
    try {
      const respuesta = await fetch("/api/revisor/notificaciones", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: aviso.id, fecha: aviso.fecha }),
      });
      if (!respuesta.ok) throw new Error("No se guardó la lectura");
      setAmpliacion(anterior => {
        const actuales = anterior?.base === bandeja ? anterior.datos : bandeja;
        return {
          base: bandeja,
          pagina: anterior?.base === bandeja ? anterior.pagina : 1,
          datos: registrarLecturaEnBandeja(actuales, aviso),
        };
      });
      return true;
    } catch {
      setError("No se pudo guardar la lectura. Intenta nuevamente.");
      return false;
    }
  }

  return { datos, cantidad, cargando, error, mostrarMas, marcarLeida };
}

function useCerrarMenu(abierto: boolean, contenedor: RefObject<HTMLDivElement | null>, alEscape: () => void, alSalir: () => void) {
  useEffect(() => {
    if (!abierto) return;

    function alHacerClicFuera(evento: MouseEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) alSalir();
    }

    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, [abierto, contenedor, alEscape, alSalir]);

  useEffect(() => {
    if (!abierto) return;

    function alPresionarTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") alEscape();
    }

    document.addEventListener("keydown", alPresionarTecla);
    return () => document.removeEventListener("keydown", alPresionarTecla);
  }, [abierto, contenedor, alEscape, alSalir]);

}

function ListaAvisos({ notificaciones, referenciaEnlace, alElegir }: {
  notificaciones: BandejaRevision["notificaciones"];
  referenciaEnlace: RefObject<HTMLAnchorElement | null>;
  alElegir: (aviso: NotificacionRevision) => void;
}) {
  return (
            <ul className="mt-3 max-h-80 overflow-y-auto space-y-2">
              {notificaciones.map((aviso, indice) => (
                <li key={aviso.id}>
                  <Link
                    ref={indice === 0 ? referenciaEnlace : undefined}
                    href={`/revisor/ventanas-carga/${aviso.ventanaCargaId}?origen=inicio#inicio-detalle-ventana`}
                    onNavigate={evento => { evento.preventDefault(); alElegir(aviso); }}
                    className={`block rounded-md border px-2 py-3 text-sm text-gob-gray-a focus-visible:outline-2 focus-visible:outline-gob-primary ${aviso.leido ? "border-[#d5e5da] bg-[#edf6ef] hover:bg-[#e2f0e6]" : "border-[#cbdff2] bg-[#eaf3ff] hover:bg-[#dfecfc]"}`}
                  >
                    <span className="font-semibold text-[#173b69]">{aviso.nombre}</span>{" "}
                    {aviso.accion === "ARCHIVO_ENVIADO" ? "subió un archivo para revisión." : "solicitó un reemplazo de archivo."}
                    <span className="mt-1 block text-xs font-semibold text-[#45617d]">{aviso.leido ? "Leído" : "No leído"}</span>
                    <time dateTime={aviso.fecha} className="mt-1 block text-xs text-gob-gray-b">{formatearFechaHora(new Date(aviso.fecha))}</time>
                  </Link>
                </li>
              ))}
            </ul>
  );
}

// Bandeja de archivos enviados y solicitudes de reemplazo pendientes de revisión.
export function MenuNotificacionesRevisor({ bandeja }: MenuNotificacionesRevisorProps) {
  const { datos, cantidad, cargando, error, mostrarMas, marcarLeida } = useBandejaNotificaciones(bandeja);
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const referenciaContenedor = useRef<HTMLDivElement>(null);
  const referenciaBoton = useRef<HTMLButtonElement>(null);
  const referenciaEnlace = useRef<HTMLAnchorElement>(null);
  const idMenu = useId();
  const hayNotificaciones = cantidad > 0;
  const mensaje = hayNotificaciones
    ? `Tienes ${cantidad} ${cantidad === 1 ? "nueva notificación" : "nuevas notificaciones"}.`
    : "No tienes notificaciones nuevas.";

  function cerrarYDevolverFoco() {
    setAbierto(false);
    referenciaBoton.current?.focus();
  }

  useCerrarMenu(abierto, referenciaContenedor, cerrarYDevolverFoco, () => setAbierto(false));

  useEffect(() => {
    if (abierto && datos.notificaciones.length > 0) referenciaEnlace.current?.focus();
  }, [abierto, datos.notificaciones.length]);

  return (
    <div ref={referenciaContenedor} className="relative">
      <button
        ref={referenciaBoton}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={idMenu}
        onClick={() => setAbierto((estabaAbierto) => !estabaAbierto)}
        className="relative inline-flex size-9 items-center justify-center rounded-full border border-white bg-white text-[#173b69] transition-colors hover:bg-[#e8f2fb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <span className={hayNotificaciones ? "animate-campana" : undefined}>
          <IconoNotificaciones />
        </span>
        {hayNotificaciones ? (
          <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-[#c62828] px-1 text-[0.625rem] font-bold leading-4 text-white">
            {cantidad > 99 ? "99+" : cantidad}
          </span>
        ) : null}
        <span className="sr-only">{mensaje}</span>
      </button>

      {abierto ? (
        <div
          id={idMenu}
          role="dialog"
          aria-label="Notificaciones"
          className="absolute right-0 z-10 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-[#d7e2ed] bg-white p-4 shadow-[0_12px_28px_rgba(23,59,105,0.16)]"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#e8f2fb] text-gob-primary">
              <IconoNotificaciones />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#173b69]">Notificaciones</p>
              <p className="mt-1 text-sm leading-5 text-[#526a82]">{mensaje}</p>
            </div>
          </div>

          {datos.total > 0 ? (
            <ListaAvisos notificaciones={datos.notificaciones} referenciaEnlace={referenciaEnlace} alElegir={aviso => { void marcarLeida(aviso).then(ok => { if (ok) { setAbierto(false); router.push(`/revisor/ventanas-carga/${aviso.ventanaCargaId}?origen=inicio#inicio-detalle-ventana`); router.refresh(); } }); }} />
          ) : null}
          {datos.notificaciones.length < datos.total ? (
            <button type="button" disabled={cargando} onClick={() => void mostrarMas()}
              className="mt-3 w-full rounded-lg bg-gob-primary px-3 py-2 text-sm font-semibold text-white hover:bg-[#0f5fa5] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary">
              {cargando ? "Cargando…" : "Mostrar más"}
            </button>
          ) : null}
          {error ? <p role="alert" className="mt-2 text-sm text-gob-danger">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
