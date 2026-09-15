import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { prismaUserRepository } from "@/modules/auth/infrastructure/repositories/PrismaUserRepository";

export default async function DashboardPage() {
  // El proxy ya garantiza una sesión de perfil administrador antes de llegar aquí; estas
  // comprobaciones son la red de seguridad para el caso borde de una cuenta borrada con el token
  // aún vigente (mismo criterio que la página del panel notificador).
  const sesion = await obtenerSesionActual();

  if (!sesion) {
    redirect("/login");
  }

  const usuario = await prismaUserRepository.buscarPorId(sesion.sub);

  if (!usuario) {
    redirect("/login");
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gob-black">Bienvenido/a, {usuario.nombres}</h1>
      <p className="mt-2 text-sm text-gob-gray-a">Panel de administración del Repositorio RPC.</p>
    </div>
  );
}
