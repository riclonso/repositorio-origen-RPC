import type { CampoUnico, Usuario } from "@/modules/usuarios/domain/entities/Usuario";
import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";
import type { PerfilRepository } from "@/modules/perfiles/domain/repositories/PerfilRepository";
import { UsuarioDuplicadoError } from "@/modules/usuarios/domain/errors/UsuarioDuplicadoError";
import { PerfilInvalidoError } from "@/modules/usuarios/domain/errors/PerfilInvalidoError";
import { derivarUsername } from "@/modules/usuarios/schemas/usuario.schema";

// La creación ya NO recibe contraseña: la cuenta nace pendiente de activación y la persona fija
// su primera contraseña con el enlace de un solo uso que se le envía al correo.
export type DatosCreacionUsuario = {
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  perfilCodigo: string;
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

  try {
    const usuario = await dependencias.repositorio.crear({
      nombres: datos.nombres,
      apellidos: datos.apellidos,
      rut: datos.rut,
      email: datos.email,
      username,
      perfilCodigo: datos.perfilCodigo,
      // Se crea ACTIVA pero PENDIENTE: `contrasenaHash` nulo bloquea el login hasta que la
      // persona fije su contraseña con el enlace. No hay flag paralelo de "pendiente".
      activo: true,
      contrasenaHash: null,
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
