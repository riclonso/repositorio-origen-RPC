import type {
  FiltroListadoUsuarios,
  Usuario,
} from "@/modules/usuarios/domain/entities/Usuario";
import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";

export type PaginacionUsuarios = {
  pagina: number;
  tamano: number;
  total: number;
  totalPaginas: number;
};

export type ResultadoListarUsuarios = {
  ok: true;
  filas: Usuario[];
  paginacion: PaginacionUsuarios;
};

// Pedir una página fuera de rango no es un error: se devuelven filas vacías con el total real
// para que la interfaz pueda ofrecer volver a la página 1 conservando los filtros.
export async function listarUsuarios(
  filtro: FiltroListadoUsuarios,
  dependencias: { repositorio: UsuarioRepository },
): Promise<ResultadoListarUsuarios> {
  const { filas, total } = await dependencias.repositorio.listar(filtro);
  const totalPaginas = Math.max(1, Math.ceil(total / filtro.tamano));

  return {
    ok: true,
    filas,
    paginacion: {
      pagina: filtro.pagina,
      tamano: filtro.tamano,
      total,
      totalPaginas,
    },
  };
}
