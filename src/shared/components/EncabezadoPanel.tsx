import { cerrarSesionAction } from "@/shared/acciones/cerrarSesion";

type EncabezadoPanelProps = {
  // Identidad de la sesión. Opcional: si no llega (caso borde de cuenta sin dueño), el encabezado
  // se dibuja solo con el branding y el cierre de sesión, sin romper.
  nombreCompleto?: string;
  perfil?: string;
};

// Encabezado común a los paneles (administración y notificador): branding + identidad de la sesión
// (nombre y perfil) + cerrar sesión. Es presentacional; la identidad la resuelve la capa `app/` y
// se inyecta por props, para no acoplar un componente de `shared/` a los repositorios de `modules/`.
export function EncabezadoPanel({ nombreCompleto, perfil }: EncabezadoPanelProps) {
  return (
    // Cerrar sesión es una acción secundaria: rellenarla (antes bg-orange-600, además fuera
    // de la paleta gob-*) la volvía el elemento más llamativo de la pantalla, compitiendo con
    // la acción primaria de cada página.
    <header className="flex items-center justify-between gap-4 bg-gob-tertiary px-4 py-3 md:px-6">
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-wide text-white">Repositorio RPC</p>
        <p className="text-xs text-gob-accent">SEREMI de Salud Biobío</p>
      </div>

      <div className="flex items-center gap-3 md:gap-4">
        {nombreCompleto ? (
          // Bloque de identidad de la sesión. El nombre se oculta bajo `sm` para no competir con el
          // branding en pantallas angostas; el perfil (la chip) se mantiene siempre, porque es el
          // dato que el usuario pidió tener visible en todo momento.
          <div className="flex min-w-0 flex-col items-end leading-tight">
            <p className="hidden max-w-[40vw] truncate text-sm font-medium text-white sm:block">
              {nombreCompleto}
            </p>
            {perfil ? (
              <span className="mt-0.5 inline-flex items-center rounded-full border border-white/40 bg-white/10 px-2 py-0.5 text-xs font-medium text-white">
                {perfil}
              </span>
            ) : null}
          </div>
        ) : null}

        <form action={cerrarSesionAction}>
          <button
            type="submit"
            className="rounded-md border border-white/40 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10 active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  );
}
