type EncabezadoPanelProps = {
  // Identidad de la sesión. Opcional: si no llega (caso borde de cuenta sin dueño), el encabezado
  // se dibuja solo con el branding, sin romper.
  nombreCompleto?: string;
  perfil?: string;
};

// Iniciales para el avatar: primera letra del primer y del último token del nombre. Con un solo
// token, una sola letra. Es puramente decorativo (el nombre completo ya va como texto en sm+).
function calcularIniciales(nombreCompleto: string): string {
  const partes = nombreCompleto.trim().split(/\s+/).filter(Boolean);

  if (partes.length === 0) {
    return "";
  }

  const primera = partes[0]!.charAt(0);
  const ultima = partes.length > 1 ? partes[partes.length - 1]!.charAt(0) : "";

  return (primera + ultima).toUpperCase();
}

// Encabezado común a los paneles (administración y notificador): branding + identidad de la sesión
// (nombre y perfil). Es presentacional; la identidad la resuelve la capa `app/` y se inyecta por
// props, para no acoplar un componente de `shared/` a los repositorios de `modules/`. El cierre de
// sesión no vive aquí: se movió al pie de la barra lateral (`BarraLateralPanel`).
export function EncabezadoPanel({ nombreCompleto, perfil }: EncabezadoPanelProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-[#dce5ef] bg-white px-4 py-3.5 md:px-7">
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-wide text-[#173b69]">Repositorio RPC</p>
        <p className="text-xs text-[#6c8197]">SEREMI de Salud Biobío</p>
      </div>

      {nombreCompleto ? (
        // Clúster de identidad: bloque de texto (nombre + perfil) junto a un avatar de iniciales.
        // El nombre se oculta bajo `sm` para no competir con el branding en pantallas angostas; el
        // avatar y la chip de perfil se mantienen siempre, porque el perfil es el dato que debe
        // quedar visible en todo momento.
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 flex-col items-end leading-tight">
            <p className="hidden max-w-[45vw] truncate text-sm font-medium text-[#243c58] sm:block lg:max-w-xs">
              {nombreCompleto}
            </p>
            {perfil ? (
              <span className="mt-0.5 inline-flex items-center rounded-full bg-[#edf4fa] px-2 py-0.5 text-xs font-medium text-[#3973a6]">
                {perfil}
              </span>
            ) : null}
          </div>

          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#173b69] text-sm font-semibold text-white"
          >
            {calcularIniciales(nombreCompleto)}
          </span>
        </div>
      ) : null}
    </header>
  );
}
