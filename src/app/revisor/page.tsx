import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { prismaUserRepository } from "@/modules/auth/infrastructure/repositories/PrismaUserRepository";

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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-gob-black">Bienvenido/a, {usuario.nombres}</h1>
        <p className="mt-2 text-sm text-gob-gray-a">
          Panel de revisión de cargas del Registro Poblacional de Cáncer.
        </p>
      </div>

      <section
        aria-labelledby="titulo-cargas"
        className="rounded-lg border border-dashed border-gob-accent bg-white p-6"
      >
        <h2 id="titulo-cargas" className="text-base font-semibold text-gob-tertiary">
          Cargas aprobadas
        </h2>
        <p className="mt-2 text-sm text-gob-gray-a">
          Revisa en &quot;Cargas aprobadas&quot; los archivos a los que un notificador ya dio
          visto bueno.
        </p>
      </section>
    </div>
  );
}
