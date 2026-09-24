import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { esPerfilNotificador } from "@/modules/perfiles/domain/entities/Perfil";
import { DetalleMiPerfil } from "@/shared/components/DetalleMiPerfil";

export const metadata: Metadata = {
  title: "Mi perfil - Repositorio RPC - SEREMI de Salud Biobío",
};

// Lectura trivial directa desde `app/`, sin caso de uso propio: mismo criterio ya usado para el
// saludo de `/inicio`. Sin auditoría: el proyecto no audita lecturas.
export default async function PerfilDashboardPage() {
  const sesion = await obtenerSesionActual();

  if (!sesion) {
    redirect("/login");
  }

  const usuario = await prismaUsuarioRepository.obtenerPorId(sesion.sub);

  if (!usuario) {
    redirect("/login");
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gob-black">Mi perfil</h1>
      <p className="mt-2 text-sm text-gob-gray-a">Datos de tu cuenta en el sistema.</p>

      <DetalleMiPerfil
        nombres={usuario.nombres}
        apellidos={usuario.apellidos}
        rut={usuario.rut}
        email={usuario.email}
        username={usuario.username}
        perfilNombre={usuario.perfilNombre}
        {...(esPerfilNotificador(usuario.perfilCodigo)
          ? { formatosExcel: usuario.formatosExcel }
          : {})}
      />
    </div>
  );
}
