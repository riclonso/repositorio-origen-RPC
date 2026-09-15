type EncabezadoPanelProps = {
  // Identidad de la sesión. Opcional: si no llega (caso borde de cuenta sin dueño), el encabezado
  // se dibuja solo con el branding, sin romper.
  nombreCompleto?: string;
  perfil?: string;
};

// Encabezado común a los paneles (administración y notificador): branding + identidad de la sesión
// (nombre y perfil). Es presentacional; la identidad la resuelve la capa `app/` y se inyecta por
// props, para no acoplar un componente de `shared/` a los repositorios de `modules/`. El cierre de
// sesión ya no vive aquí: se movió al pie de la barra lateral (`BarraLateralPanel`).
export function EncabezadoPanel({ nombreCompleto, perfil }: EncabezadoPanelProps) {
  return (
    <header className="flex items-center justify-between gap-4 bg-gob-tertiary px-4 py-3 md:px-6">
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-wide text-white">Repositorio RPC</p>
        <p className="text-xs text-gob-accent">SEREMI de Salud Biobío</p>
      </div>

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
    </header>
  );
}
