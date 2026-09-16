import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { obtenerTipoEstablecimiento } from "@/modules/tipoEstablecimiento/application/use-cases/ObtenerTipoEstablecimiento";
import { prismaTipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/infrastructure/repositories/PrismaTipoEstablecimientoRepository";
import { TipoForm } from "../../tipo-form";

export const metadata: Metadata = {
  title: "Editar tipo de establecimiento - Repositorio RPC - SEREMI de Salud Biobío",
};

const idSchema = z.uuid();

type EditarTipoPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarTipoPage({ params }: EditarTipoPageProps) {
  const { id } = await params;
  const idValido = idSchema.safeParse(id);

  if (!idValido.success) {
    notFound();
  }

  const tipo = await obtenerTipoEstablecimiento(idValido.data, {
    repositorio: prismaTipoEstablecimientoRepository,
  });

  if (!tipo) {
    notFound();
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Editar tipo de establecimiento</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        Actualiza el nombre del tipo. El cambio se refleja en los establecimientos que lo usan.
      </p>

      <TipoForm
        modo="editar"
        endpoint={`/api/tipos-establecimiento/${tipo.id}`}
        metodo="PUT"
        nombreInicial={tipo.nombre}
      />
    </div>
  );
}
