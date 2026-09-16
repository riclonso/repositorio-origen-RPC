import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { obtenerEstablecimiento } from "@/modules/establecimiento/application/use-cases/ObtenerEstablecimiento";
import { prismaEstablecimientoRepository } from "@/modules/establecimiento/infrastructure/repositories/PrismaEstablecimientoRepository";
import { listarTiposEstablecimiento } from "@/modules/tipoEstablecimiento/application/use-cases/ListarTiposEstablecimiento";
import { prismaTipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/infrastructure/repositories/PrismaTipoEstablecimientoRepository";
import { aOpcionesTipo } from "../../opciones-tipo";
import { EstablecimientoForm } from "../../establecimiento-form";

export const metadata: Metadata = {
  title: "Editar establecimiento - Repositorio RPC - SEREMI de Salud Biobío",
};

const idSchema = z.uuid();

type EditarEstablecimientoPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarEstablecimientoPage({
  params,
}: EditarEstablecimientoPageProps) {
  const { id } = await params;
  const idValido = idSchema.safeParse(id);

  if (!idValido.success) {
    notFound();
  }

  const establecimiento = await obtenerEstablecimiento(idValido.data, {
    repositorio: prismaEstablecimientoRepository,
  });

  if (!establecimiento) {
    notFound();
  }

  // El tipo vigente del establecimiento se incluye aunque esté dado de baja. Sin esto, editar un
  // establecimiento cuyo tipo fue desactivado mostraría un select sin su valor actual: el navegador
  // elegiría otra opción y guardar le cambiaría el tipo en silencio.
  const tipos = await listarTiposEstablecimiento(
    { soloActivos: true, incluirIds: [establecimiento.tipoId] },
    { repositorio: prismaTipoEstablecimientoRepository },
  );

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Editar establecimiento</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        Actualiza los datos del establecimiento.
      </p>

      <EstablecimientoForm
        modo="editar"
        endpoint={`/api/establecimientos/${establecimiento.id}`}
        metodo="PUT"
        valoresIniciales={{
          rut: establecimiento.rut,
          nombre: establecimiento.nombre,
          direccion: establecimiento.direccion,
          tipoId: establecimiento.tipoId,
        }}
        opcionesTipo={aOpcionesTipo(tipos)}
      />
    </div>
  );
}
