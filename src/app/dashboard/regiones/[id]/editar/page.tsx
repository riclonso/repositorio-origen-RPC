import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { obtenerRegion } from "@/modules/regiones/application/use-cases/ObtenerRegion";
import { prismaRegionRepository } from "@/modules/regiones/infrastructure/repositories/PrismaRegionRepository";
import { RegionForm } from "../../region-form";

export const metadata: Metadata = {
  title: "Editar región - Repositorio RPC - SEREMI de Salud Biobío",
};

const idSchema = z.uuid();

type EditarRegionPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarRegionPage({ params }: EditarRegionPageProps) {
  const { id } = await params;
  const idValido = idSchema.safeParse(id);

  if (!idValido.success) {
    notFound();
  }

  const region = await obtenerRegion(idValido.data, { repositorio: prismaRegionRepository });

  if (!region) {
    notFound();
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Editar región</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        El número, el código y el nombre deben seguir siendo únicos en el catálogo.
      </p>

      <RegionForm
        modo="editar"
        endpoint={`/api/regiones/${region.id}`}
        metodo="PUT"
        valoresIniciales={{
          nombre: region.nombre,
          codigo: region.codigo,
          numero: String(region.numero),
        }}
      />
    </div>
  );
}
