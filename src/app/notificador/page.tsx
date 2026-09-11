import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { prismaUserRepository } from "@/modules/auth/infrastructure/repositories/PrismaUserRepository";

export default async function NotificadorPage() {
  // El proxy ya garantiza una sesión de perfil notificador antes de llegar aquí; estas comprobaciones
  // son la red de seguridad para el caso borde de una cuenta borrada con el token aún vigente.
  const sesion = await obtenerSesionActual();

  if (!sesion) {
    redirect("/login");
  }

  const usuario = await prismaUserRepository.buscarPorId(sesion.sub);

  // Cuenta borrada con sesión vigente: se fuerza el reingreso en vez de saludar a una identidad que
  // ya no existe. Es el camino más robusto porque no deja renderizar un panel sin dueño. (El sistema
  // solo hace baja lógica, no borrado físico, así que es un escenario verdaderamente excepcional.)
  if (!usuario) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-gob-black">
          Bienvenido/a, {usuario.nombres}
        </h1>
        <p className="mt-2 text-sm text-gob-gray-a">
          Panel de notificación del Registro Poblacional de Cáncer.
        </p>
      </div>

      <section
        aria-labelledby="titulo-reporte"
        className="rounded-lg border border-dashed border-gob-accent bg-white p-6"
      >
        <h2 id="titulo-reporte" className="text-base font-semibold text-gob-tertiary">
          Reporte de datos (Excel/CSV)
        </h2>
        <p className="mt-2 text-sm text-gob-gray-a">
          Próximamente: aquí podrá cargar y reportar los datos del Registro Poblacional de Cáncer.
        </p>
      </section>
    </div>
  );
}
