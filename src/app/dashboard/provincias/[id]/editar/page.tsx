import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { obtenerProvincia } from "@/modules/provincias/application/use-cases/ObtenerProvincia";
import { prismaProvinciaRepository } from "@/modules/provincias/infrastructure/repositories/PrismaProvinciaRepository";
import { listarRegiones } from "@/modules/regiones/application/use-cases/ListarRegiones";
import { prismaRegionRepository } from "@/modules/regiones/infrastructure/repositories/PrismaRegionRepository";
import { aOpcionesRegion } from "@/shared/components/opciones-territorio";
import { ProvinciaForm } from "../../provincia-form";

export const metadata: Metadata = {
  title: "Editar provincia - Repositorio RPC - SEREMI de Salud Biobío",
};

const idSchema = z.uuid();

type EditarProvinciaPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarProvinciaPage({ params }: EditarProvinciaPageProps) {
  const { id } = await params;
  const idValido = idSchema.safeParse(id);

  if (!idValido.success) {
    notFound();
  }

  const [provincia, regiones] = await Promise.all([
    obtenerProvincia(idValido.data, { repositorio: prismaProvinciaRepository }),
    listarRegiones({ repositorio: prismaRegionRepository }),
  ]);

  if (!provincia) {
    notFound();
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Editar provincia</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        Puedes moverla a otra región si ajustas el código para que empiece con el de la nueva
        región.
      </p>

      <ProvinciaForm
        modo="editar"
        endpoint={`/api/provincias/${provincia.id}`}
        metodo="PUT"
        valoresIniciales={{
          nombre: provincia.nombre,
          codigo: provincia.codigo,
          regionId: provincia.region.id,
        }}
        opcionesRegion={aOpcionesRegion(regiones)}
      />
    </div>
  );
}
