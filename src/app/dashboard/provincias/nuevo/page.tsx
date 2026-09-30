import type { Metadata } from "next";
import { connection } from "next/server";
import { listarRegiones } from "@/modules/regiones/application/use-cases/ListarRegiones";
import { prismaRegionRepository } from "@/modules/regiones/infrastructure/repositories/PrismaRegionRepository";
import { aOpcionesRegion } from "@/shared/components/opciones-territorio";
import { ProvinciaForm } from "../provincia-form";

export const metadata: Metadata = {
  title: "Nueva provincia - Repositorio RPC - SEREMI de Salud Biobío",
};

const VALORES_VACIOS = { nombre: "", codigo: "", regionId: "" };

export default async function NuevaProvinciaPage() {
  // Esta pantalla no lee cookies ni parámetros, así que Next la prerenderizaría en el build y
  // dejaría el catálogo de regiones congelado en esa foto. `connection()` la ancla al momento de
  // la petición.
  await connection();

  const regiones = await listarRegiones({ repositorio: prismaRegionRepository });

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Nueva provincia</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        El código debe ser único y el nombre no puede repetirse dentro de la región.
      </p>

      <ProvinciaForm
        modo="crear"
        endpoint="/api/provincias"
        metodo="POST"
        valoresIniciales={VALORES_VACIOS}
        opcionesRegion={aOpcionesRegion(regiones)}
      />
    </div>
  );
}
