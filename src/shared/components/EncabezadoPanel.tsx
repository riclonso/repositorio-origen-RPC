import { cerrarSesionAction } from "@/shared/acciones/cerrarSesion";

// Encabezado común a los paneles (administración y notificador): branding + cerrar sesión. Se
// extrajo verbatim del layout del dashboard para que la salida visual sea idéntica entre paneles y
// no se dupliquen el branding ni el formulario de cierre de sesión.
export function EncabezadoPanel() {
  return (
    // Cerrar sesión es una acción secundaria: rellenarla (antes bg-orange-600, además fuera
    // de la paleta gob-*) la volvía el elemento más llamativo de la pantalla, compitiendo con
    // la acción primaria de cada página.
    <header className="flex items-center justify-between gap-4 bg-gob-tertiary px-4 py-3 md:px-6">
      <div>
        <p className="text-sm font-semibold tracking-wide text-white">Repositorio RPC</p>
        <p className="text-xs text-gob-accent">SEREMI de Salud Biobío</p>
      </div>

      <form action={cerrarSesionAction}>
        <button
          type="submit"
          className="rounded-md border border-white/40 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10 active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Cerrar sesión
        </button>
      </form>
    </header>
  );
}
