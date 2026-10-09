import type { BandejaRevision } from "@/modules/notificaciones/domain/NotificacionRevision";
import { MenuConfiguracionUsuario } from "@/shared/components/MenuConfiguracionUsuario";
import { MenuNotificacionesRevisor } from "@/shared/components/MenuNotificacionesRevisor";
import { obtenerSesionAdministradorOrigen } from "@/modules/auth/infrastructure/auth/SesionDelegada";
import { VolverSesionAdministrador } from "@/shared/components/VolverSesionAdministrador";

type EncabezadoPanelProps = {
  // Base de ruta del área actual, para que el menú de configuración enlace a
  // `${rutaBase}/perfil` y `${rutaBase}/perfil/contrasena` sin que este componente conozca las
  // tres áreas del sistema. Mismo patrón `rutaBase` ya usado por `TablaUsuarios`/`TablaFormatosExcel`.
  rutaBase: "/dashboard" | "/notificador" | "/revisor" | "/bioestadistica";
  // Solo el revisor recibe la bandeja de trabajo de solicitudes pendientes; los demás perfiles
  // conservan el encabezado actual sin un control que no les corresponde.
  bandejaNotificaciones?: BandejaRevision;
};

// Color de fondo de cada área: distingue de un vistazo en qué panel se está.
const COLOR_FONDO_AREA: Record<EncabezadoPanelProps["rutaBase"], string> = {
  "/dashboard": "bg-[#173b69]",
  "/notificador": "bg-[#678d6c]",
  "/revisor": "bg-[#3f84d8]",
  // RF-37: área del perfil Bioestadística.
  "/bioestadistica": "bg-[#5b4f8f]",
};

// Encabezado común a los paneles: branding institucional a la izquierda y el menú de
// configuración de la cuenta ("Mi perfil"/"Cambiar contraseña") a la derecha. La identidad de la
// sesión (nombre, avatar de iniciales y perfil) no vive aquí: está al tope de la barra lateral
// (`BarraLateralPanel`).
export async function EncabezadoPanel({ rutaBase, bandejaNotificaciones }: EncabezadoPanelProps) {
  const sesionAdministradorOrigen = await obtenerSesionAdministradorOrigen();
  const colorFondo = COLOR_FONDO_AREA[rutaBase];
  const colorSubtitulo = rutaBase === "/notificador" || rutaBase === "/bioestadistica" ? "text-white" : "text-white/60";

  return (
    <header className={`flex items-center justify-between gap-4 border-b border-transparent px-4 py-3.5 md:px-7 ${colorFondo}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-wide text-white">Repositorio RPC</p>
        <p className={`text-xs ${colorSubtitulo}`}>SEREMI de Salud Biobío</p>
      </div>

      <div className="flex items-center gap-3">
        {sesionAdministradorOrigen ? <VolverSesionAdministrador altoContraste /> : null}
        {rutaBase === "/revisor" && bandejaNotificaciones !== undefined ? (
          <MenuNotificacionesRevisor bandeja={bandejaNotificaciones} />
        ) : null}
        <MenuConfiguracionUsuario rutaBase={rutaBase} altoContraste />
      </div>
    </header>
  );
}
