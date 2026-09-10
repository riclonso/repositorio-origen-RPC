import type { CampoUnico, Usuario } from "@/modules/usuarios/domain/entities/Usuario";
import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";
import type { PerfilRepository } from "@/modules/perfiles/domain/repositories/PerfilRepository";
import { UsuarioDuplicadoError } from "@/modules/usuarios/domain/errors/UsuarioDuplicadoError";
import { PerfilInvalidoError } from "@/modules/usuarios/domain/errors/PerfilInvalidoError";
import type { HasheadorContrasena } from "@/modules/usuarios/application/ports";
import { derivarUsername } from "@/modules/usuarios/schemas/usuario.schema";

export type DatosCreacionUsuario = {
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  perfilCodigo: string;
  contrasena: string;
};

export type ResultadoCrearUsuario =
  | { ok: true; usuario: Usuario }
  | { ok: false; motivo: "DUPLICADO"; campo: CampoUnico; rut: string }
  | { ok: false; motivo: "PERFIL_INVALIDO" };

export async function crearUsuario(
  datos: DatosCreacionUsuario,
  dependencias: {
    repositorio: UsuarioRepository;
    repositorioPerfiles: PerfilRepository;
    hasheadorContrasena: HasheadorContrasena;
  },
): Promise<ResultadoCrearUsuario> {
  // El esquema solo valida la FORMA del código: que el perfil exista y esté vigente se
  // comprueba aquí, para responder un 400 de validación y no un 500 por clave foránea.
  if (!(await dependencias.repositorioPerfiles.existeActivo(datos.perfilCodigo))) {
    return { ok: false, motivo: "PERFIL_INVALIDO" };
  }

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
      perfilCodigo: datos.perfilCodigo,
      activo: true,
      contrasenaHash,
    });

    return { ok: true, usuario };
  } catch (error) {
    // Cierra la ventana de carrera entre `buscarConflicto` y el INSERT.
    if (error instanceof UsuarioDuplicadoError) {
      return { ok: false, motivo: "DUPLICADO", campo: error.campo, rut: datos.rut };
    }

    // Misma ventana, para el perfil: pudo eliminarse entre la comprobación y el INSERT.
    if (error instanceof PerfilInvalidoError) {
      return { ok: false, motivo: "PERFIL_INVALIDO" };
    }

    throw error;
  }
}
