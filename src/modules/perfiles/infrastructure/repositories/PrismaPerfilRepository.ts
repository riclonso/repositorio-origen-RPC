import type { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import type { Perfil } from "@/modules/perfiles/domain/entities/Perfil";
import type {
  OpcionesListadoPerfiles,
  PerfilRepository,
} from "@/modules/perfiles/domain/repositories/PerfilRepository";

const SELECCION_PERFIL = {
  codigo: true,
  nombre: true,
  descripcion: true,
  orden: true,
  activo: true,
} as const;

// `orden` gobierna la presentación y `nombre` desempata, para que dos perfiles con el mismo
// orden no aparezcan alternados entre una carga y otra.
const ORDEN_PERFIL = [{ orden: "asc" }, { nombre: "asc" }] as const;

// Un solo predicado: los activos MÁS los códigos que se pidan explícitamente. Resolverlo con dos
// consultas y unir en memoria sería una consulta de más por cada pantalla que muestre el select.
function construirFiltro(opciones: OpcionesListadoPerfiles): Prisma.PerfilWhereInput {
  const codigosIncluidos = opciones.incluirCodigos?.filter((codigo) => codigo.length > 0) ?? [];

  if (!opciones.soloActivos) {
    return {};
  }

  if (codigosIncluidos.length === 0) {
    return { activo: true };
  }

  return { OR: [{ activo: true }, { codigo: { in: codigosIncluidos } }] };
}

export const prismaPerfilRepository: PerfilRepository = {
  async listar(opciones = {}): Promise<Perfil[]> {
    return prisma.perfil.findMany({
      where: construirFiltro(opciones),
      select: SELECCION_PERFIL,
      orderBy: [...ORDEN_PERFIL],
    });
  },

  async existeActivo(codigo): Promise<boolean> {
    const registro = await prisma.perfil.findFirst({
      where: { codigo, activo: true },
      select: { codigo: true },
    });

    return registro !== null;
  },
};
