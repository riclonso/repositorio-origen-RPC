import type {
  CampoUnico,
  RolUsuario,
  Usuario,
} from "@/modules/usuarios/domain/entities/Usuario";
import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";
import { UsuarioDuplicadoError } from "@/modules/usuarios/domain/errors/UsuarioDuplicadoError";
import type { HasheadorContrasena } from "@/modules/usuarios/application/ports";
import { derivarUsername } from "@/modules/usuarios/schemas/usuario.schema";

export type DatosCreacionUsuario = {
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  rol: RolUsuario;
  contrasena: string;
};

export type ResultadoCrearUsuario =
  | { ok: true; usuario: Usuario }
  | { ok: false; motivo: "DUPLICADO"; campo: CampoUnico; rut: string };

export async function crearUsuario(
  datos: DatosCreacionUsuario,
  dependencias: {
    repositorio: UsuarioRepository;
    hasheadorContrasena: HasheadorContrasena;
  },
): Promise<ResultadoCrearUsuario> {
  const username = derivarUsername(datos.rut);

  const conflicto = await dependencias.repositorio.buscarConflicto({
    rut: datos.rut,
    email: datos.email,
    username,
  });

  if (conflicto) {
    return { ok: false, motivo: "DUPLICADO", campo: conflicto, rut: datos.rut };
  }

  const contrasenaHash = await dependencias.hasheadorContrasena.hashear(datos.contrasena);

  try {
    const usuario = await dependencias.repositorio.crear({
      nombres: datos.nombres,
      apellidos: datos.apellidos,
      rut: datos.rut,
      email: datos.email,
      username,
      rol: datos.rol,
      activo: true,
      contrasenaHash,
    });

    return { ok: true, usuario };
  } catch (error) {
    // Cierra la ventana de carrera entre `buscarConflicto` y el INSERT.
    if (error instanceof UsuarioDuplicadoError) {
      return { ok: false, motivo: "DUPLICADO", campo: error.campo, rut: datos.rut };
    }

    throw error;
  }
}
