// Encabezado común a los paneles (administración y notificador): solo el branding institucional.
// La identidad de la sesión (nombre, avatar de iniciales y perfil) ya no vive aquí: se movió al
// tope de la barra lateral (`BarraLateralPanel`). Sigue siendo presentacional.
export function EncabezadoPanel() {
  return (
    <header className="flex items-center gap-4 border-b border-[#dce5ef] bg-white px-4 py-3.5 md:px-7">
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-wide text-[#173b69]">Repositorio RPC</p>
        <p className="text-xs text-[#6c8197]">SEREMI de Salud Biobío</p>
      </div>
    </header>
  );
}
