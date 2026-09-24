import { MenuConfiguracionUsuario } from "@/shared/components/MenuConfiguracionUsuario";

type EncabezadoPanelProps = {
  // Base de ruta del área actual, para que el menú de configuración enlace a
  // `${rutaBase}/perfil` y `${rutaBase}/perfil/contrasena` sin que este componente conozca las
  // tres áreas del sistema. Mismo patrón `rutaBase` ya usado por `TablaUsuarios`/`TablaFormatosExcel`.
  rutaBase: "/dashboard" | "/notificador" | "/revisor";
};

// Encabezado común a los tres paneles: branding institucional a la izquierda y el menú de
// configuración de la cuenta ("Mi perfil"/"Cambiar contraseña") a la derecha. La identidad de la
// sesión (nombre, avatar de iniciales y perfil) no vive aquí: está al tope de la barra lateral
// (`BarraLateralPanel`).
export function EncabezadoPanel({ rutaBase }: EncabezadoPanelProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-[#dce5ef] bg-white px-4 py-3.5 md:px-7">
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-wide text-[#173b69]">Repositorio RPC</p>
        <p className="text-xs text-[#6c8197]">SEREMI de Salud Biobío</p>
      </div>

      <MenuConfiguracionUsuario rutaBase={rutaBase} />
    </header>
  );
}
