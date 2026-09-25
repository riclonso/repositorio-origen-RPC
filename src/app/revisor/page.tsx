import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { prismaUserRepository } from "@/modules/auth/infrastructure/repositories/PrismaUserRepository";
import { InicioRevisor } from "@/shared/components/InicioRevisor";

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

  return <InicioRevisor nombres={usuario.nombres} />;
}
