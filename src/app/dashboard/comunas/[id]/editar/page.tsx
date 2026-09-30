import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { obtenerComuna } from "@/modules/comunas/application/use-cases/ObtenerComuna";
import { prismaComunaRepository } from "@/modules/comunas/infrastructure/repositories/PrismaComunaRepository";
import { listarProvincias } from "@/modules/provincias/application/use-cases/ListarProvincias";
import { prismaProvinciaRepository } from "@/modules/provincias/infrastructure/repositories/PrismaProvinciaRepository";
import { aGruposProvinciaPorRegion } from "@/shared/components/opciones-territorio";
import { ComunaForm } from "../../comuna-form";

export const metadata: Metadata = {
  title: "Editar comuna - Repositorio RPC - SEREMI de Salud Biobío",
};

const idSchema = z.uuid();

type EditarComunaPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarComunaPage({ params }: EditarComunaPageProps) {
  const { id } = await params;
  const idValido = idSchema.safeParse(id);

  if (!idValido.success) {
    notFound();
  }

  const [comuna, provincias] = await Promise.all([
    obtenerComuna(idValido.data, { repositorio: prismaComunaRepository }),
    listarProvincias({}, { repositorio: prismaProvinciaRepository }),
  ]);

  if (!comuna) {
    notFound();
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Editar comuna</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        Puedes moverla a otra provincia si ajustas el código para que empiece con el de la nueva
        provincia.
      </p>

      <ComunaForm
        modo="editar"
        endpoint={`/api/comunas/${comuna.id}`}
        metodo="PUT"
        valoresIniciales={{
          nombre: comuna.nombre,
          codigo: comuna.codigo,
          provinciaId: comuna.provincia.id,
        }}
        gruposProvincia={aGruposProvinciaPorRegion(provincias)}
      />
    </div>
  );
}
