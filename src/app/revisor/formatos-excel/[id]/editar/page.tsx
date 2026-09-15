import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { obtenerFormatoExcel } from "@/modules/formatos-excel/application/use-cases/ObtenerFormatoExcel";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { FormularioEdicionFormatoExcel } from "@/shared/components/FormularioEdicionFormatoExcel";

export const metadata: Metadata = {
  title: "Editar formato de archivo - Repositorio RPC - SEREMI de Salud Biobío",
};

const idSchema = z.uuid();

type EditarFormatoExcelPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarFormatoExcelRevisorPage({ params }: EditarFormatoExcelPageProps) {
  const { id } = await params;
  const idValido = idSchema.safeParse(id);

  if (!idValido.success) {
    notFound();
  }

  const formato = await obtenerFormatoExcel(idValido.data, { repositorio: prismaFormatoExcelRepository });

  if (!formato) {
    notFound();
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Editar formato de archivo</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        Actualiza el nombre, la descripción y las reglas de las columnas. Para cambiar la
        plantilla original, crea un formato nuevo.
      </p>

      <a
        href={`/api/formatos-excel/${formato.id}/plantilla`}
        className="mt-4 inline-block text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
      >
        Descargar plantilla original ({formato.nombreArchivoPlantilla})
      </a>

      {/* `key={formato.id}` fuerza el remonte del formulario al navegar entre ediciones de
          formatos distintos: su estado interno se inicializa una sola vez desde `formato`
          (ver comentario del inicializador perezoso en el propio componente), así que sin
          esta key una navegación cliente-a-cliente entre dos ids dejaría los campos con los
          valores del formato anterior. */}
      <FormularioEdicionFormatoExcel key={formato.id} formato={formato} rutaBase="/revisor/formatos-excel" />
    </div>
  );
}
