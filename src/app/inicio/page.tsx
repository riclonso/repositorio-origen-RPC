import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import {
  esPerfilAdministrador,
  esPerfilNotificador,
  esPerfilRevisorRepositorio,
} from "@/modules/perfiles/domain/entities/Perfil";

// Despachador de sesión. No está en el matcher del proxy a propósito: se autoguarda leyendo y
// verificando la cookie con `obtenerSesionActual()`. Resuelve a qué panel corresponde cada perfil y
// nunca renderiza contenido propio. Un perfil sin área conocida no tiene dónde ir: se lo trata como
// "sin sesión" y se lo envía a /login, en lugar de dejarlo en una página en blanco.
export default async function InicioPage(): Promise<never> {
  const sesion = await obtenerSesionActual();

  if (!sesion) {
    redirect("/login");
  }

  if (esPerfilAdministrador(sesion.perfil)) {
    redirect("/dashboard");
  }

  if (esPerfilNotificador(sesion.perfil)) {
    redirect("/notificador");
  }

  if (esPerfilRevisorRepositorio(sesion.perfil)) {
    redirect("/revisor");
  }

  redirect("/login");
}
