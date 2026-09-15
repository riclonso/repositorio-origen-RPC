import { cerrarSesionAction } from "@/shared/acciones/cerrarSesion";
import { NavegacionPanel, type EnlacePanel } from "@/shared/components/NavegacionPanel";

type BarraLateralPanelProps = {
  enlaces: readonly EnlacePanel[];
  titulo: string;
};

// Contenido de la barra lateral común a los paneles: navegación arriba y "Cerrar sesión" al pie.
// Es una columna de altura completa; en desktop `mt-auto` empuja el cierre de sesión al fondo de la
// barra, y en móvil (donde la barra es horizontal y de alto automático) queda como una fila al final
// de esa zona, separada por un borde. Se encapsula aquí para no duplicar el pie en cada layout.
//
// Server Component: renderiza `NavegacionPanel` (cliente, usa `usePathname`) y el formulario de
// cierre de sesión, que dispara la Server Action `cerrarSesionAction`. Cerrar sesión sigue siendo
// una acción secundaria, así que se estiliza como un botón neutro coherente con la barra (no un
// botón relleno que compita con la acción primaria de cada página).
export function BarraLateralPanel({ enlaces, titulo }: BarraLateralPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <NavegacionPanel enlaces={enlaces} titulo={titulo} />

      <div className="mt-auto border-t border-gob-accent p-2 md:p-4">
        <form action={cerrarSesionAction}>
          <button
            type="submit"
            className="w-full rounded-md border border-gob-accent px-3 py-2 text-sm font-medium text-gob-gray-a transition-colors hover:bg-gob-neutral active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
