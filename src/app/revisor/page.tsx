import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { prismaUserRepository } from "@/modules/auth/infrastructure/repositories/PrismaUserRepository";
import { TableroSeguimientoVentanas } from "@/shared/components/TableroSeguimientoVentanas";

export default async function RevisorPage() {
  // El proxy ya garantiza una sesión de perfil revisor antes de llegar aquí; estas comprobaciones
  // son la red de seguridad para el caso borde de una cuenta borrada con el token aún vigente
  // (mismo criterio que `app/notificador/page.tsx`).
  const sesion = await obtenerSesionActual();

  if (!sesion) {
    redirect("/login");
  }

  const usuario = await prismaUserRepository.buscarPorId(sesion.sub);

  if (!usuario) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 pb-8">
      <section className="border-b border-gob-accent/30 pb-8">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-gob-primary">Panel de Revisión</p>
          <h1 className="text-4xl font-bold tracking-tight text-gob-tertiary">Bienvenido/a, {usuario.nombres}</h1>
          <p className="text-base text-gob-gray-a max-w-2xl leading-relaxed">
            Revisión y validación de cargas del Registro Poblacional de Cáncer.
          </p>
        </div>
      </section>

      <TableroSeguimientoVentanas rutaBase="/revisor/ventanas-carga" />
    </div>
  );
}
