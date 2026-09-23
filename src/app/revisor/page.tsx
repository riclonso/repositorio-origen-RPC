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
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold text-gob-black">Bienvenido/a, {usuario.nombres}</h1>
        <p className="text-base text-gob-gray-a max-w-2xl leading-relaxed">
          Panel de revisión de cargas del Registro Poblacional de Cáncer.
        </p>
      </div>

      <TableroSeguimientoVentanas rutaBase="/revisor/ventanas-carga" />
    </div>
  );
}
