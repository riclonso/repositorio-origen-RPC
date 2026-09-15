import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { obtenerCargaPropia } from "@/modules/reporte-excel/application/use-cases/ObtenerCargaPropia";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { DetalleCargaPropia } from "@/shared/components/DetalleCargaPropia";

export const metadata: Metadata = {
  title: "Detalle de carga - Repositorio RPC - SEREMI de Salud Biobío",
};

type DetalleCargaPropiaPageProps = { params: Promise<{ id: string }> };

// Ownership explícito por `usuarioId` de sesión, mismo criterio que `/api/notificador/cargas/[id]`:
// una carga que no existe o no es del actor es indistinguible (404 en ambos casos), nunca se
// distingue "no existe" de "no es tuya".
export default async function DetalleCargaPropiaPage({ params }: DetalleCargaPropiaPageProps) {
  const [{ id }, sesion] = await Promise.all([params, obtenerSesionActual()]);

  // El proxy ya garantiza una sesión de perfil notificador antes de llegar aquí; esta comprobación
  // es la red de seguridad para el caso borde de una cuenta borrada con el token aún vigente.
  if (!sesion) {
    redirect("/login");
  }

  const carga = await obtenerCargaPropia(id, sesion.sub, { repositorio: prismaCargaArchivoRepository });

  if (!carga) {
    notFound();
  }

  return <DetalleCargaPropia carga={carga} />;
}
