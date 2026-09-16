import { cerrarSesionAction } from "@/shared/acciones/cerrarSesion";
import { NavegacionPanel, type EnlacePanel } from "@/shared/components/NavegacionPanel";

type BarraLateralPanelProps = {
  enlaces: readonly EnlacePanel[];
  titulo: string;
  // Identidad de la sesión, mostrada en el tope de la barra. Opcional: si no llega (caso borde de
  // una cuenta sin dueño), la barra se dibuja sin cabecera de usuario, sin romper.
  nombreCompleto?: string;
  perfil?: string;
};

// Iniciales para el avatar: primera letra del primer y del último token del nombre. Con un solo
// token, una sola letra. Es puramente decorativo (el nombre completo va como texto debajo).
function calcularIniciales(nombreCompleto: string): string {
  const partes = nombreCompleto.trim().split(/\s+/).filter(Boolean);

  if (partes.length === 0) {
    return "";
  }

  const primera = partes[0]!.charAt(0);
  const ultima = partes.length > 1 ? partes[partes.length - 1]!.charAt(0) : "";

  return (primera + ultima).toUpperCase();
}

// Contenido de la barra lateral común a los paneles: cabecera de usuario (avatar + nombre + perfil)
// en el tope, navegación en medio y "Cerrar sesión" al pie. Es una columna de altura completa; en
// desktop `mt-auto` empuja el cierre de sesión al fondo de la barra, y en móvil (barra horizontal de
// alto automático) queda como una fila al final. Se encapsula aquí para no duplicar en cada layout.
//
// Server Component: renderiza `NavegacionPanel` (cliente, usa `usePathname`) y el formulario de
// cierre de sesión, que dispara la Server Action `cerrarSesionAction`. Cerrar sesión sigue siendo
// una acción secundaria, así que se estiliza como un botón neutro coherente con la barra.
export function BarraLateralPanel({ enlaces, titulo, nombreCompleto, perfil }: BarraLateralPanelProps) {
  return (
    <div className="flex flex-1 flex-col">
      {nombreCompleto ? (
        // Cabecera de usuario: avatar de iniciales centrado, con el nombre y el perfil debajo,
        // sobre el fondo oscuro de la barra.
        <div className="flex flex-col items-center gap-3 border-b border-white/15 px-4 py-6 text-center">
          <span
            aria-hidden="true"
            className="flex size-16 items-center justify-center rounded-full border border-white/25 bg-white/10 text-lg font-semibold text-white"
          >
            {calcularIniciales(nombreCompleto)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{nombreCompleto}</p>
            {perfil ? <p className="mt-0.5 text-xs text-white/60">{perfil}</p> : null}
          </div>
        </div>
      ) : null}

      <NavegacionPanel enlaces={enlaces} titulo={titulo} />

      <div className="mt-auto border-t border-white/15 p-2 md:p-4">
        <form action={cerrarSesionAction}>
          <button
            type="submit"
            className="w-full rounded-lg border border-white/25 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
