import { TableroSeguimientoVentanas } from "@/shared/components/TableroSeguimientoVentanas";

// Antes de RF-16 esta página no leía nada dinámico (ni cookies ni BD), así que Next la congelaba
// como HTML estático en el build. `TableroSeguimientoVentanas` sí consulta la BD en cada render
// (ventanas abiertas, conteos de notificadores) y su barra de tiempo depende de `ahora`; sin este
// flag quedaría prerenderizada una sola vez en build y nunca se actualizaría en producción
// (`/revisor` no necesita el flag porque `obtenerSesionActual()` ya lee la cookie de sesión, lo
// que fuerza render dinámico por sí solo).
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-gob-black">Panel de administración</h1>
        <p className="mt-2 text-sm text-gob-gray-a">Bienvenido al dashboard.</p>
      </div>

      <TableroSeguimientoVentanas />
    </div>
  );
}
