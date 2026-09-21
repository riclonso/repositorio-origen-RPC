import type { Metadata } from "next";
import { connection } from "next/server";
import { listarPerfiles } from "@/modules/perfiles/application/use-cases/ListarPerfiles";
import { prismaPerfilRepository } from "@/modules/perfiles/infrastructure/repositories/PrismaPerfilRepository";
import { esPerfilAdministrador } from "@/modules/perfiles/domain/entities/Perfil";
import { listarFormatosExcel } from "@/modules/formatos-excel/application/use-cases/ListarFormatosExcel";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import type { OpcionSelect } from "@/shared/components/CampoSelect";
import { aOpcionesPerfil } from "@/shared/components/opciones-perfil";
import { aOpcionesFormatoExcel } from "@/shared/components/opciones-formato-excel";
import { UsuarioForm } from "@/shared/components/UsuarioForm";
import { RUTA_USUARIOS_REVISOR } from "../ruta-usuarios";

export const metadata: Metadata = {
  title: "Nuevo usuario - Repositorio RPC - SEREMI de Salud Biobío",
};

// Sin perfil preseleccionado: el esquema rechaza el valor vacío, así que el operador está
// obligado a elegir. Preseleccionar la primera opción tampoco serviría, porque al venir
// ordenadas "Administrador" quedaría primera y el alta jamás debe caer por defecto en el
// perfil privilegiado.
const OPCION_SIN_ELEGIR: OpcionSelect = { valor: "", etiqueta: "Selecciona un perfil" };

export default async function NuevoUsuarioRevisorPage() {
  // Esta pantalla no lee cookies ni parámetros, así que Next la prerenderizaría en el build y
  // dejaría el catálogo congelado en esa foto (y obligaría a la base a estar disponible al
  // compilar). `connection()` la ancla al momento de la petición.
  await connection();

  // Solo perfiles vigentes: dar de alta a alguien en un perfil dado de baja no tiene sentido.
  const [perfiles, formatosExcel] = await Promise.all([
    listarPerfiles({ soloActivos: true }, { repositorio: prismaPerfilRepository }),
    listarFormatosExcel({ repositorio: prismaFormatoExcelRepository }),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Nuevo usuario</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        El RUT queda como nombre de usuario de ingreso. La persona recibirá un enlace en su
        correo para crear su contraseña y activar la cuenta.
      </p>

      <UsuarioForm
        modo="crear"
        endpoint="/api/usuarios"
        metodo="POST"
        rutaBase={RUTA_USUARIOS_REVISOR}
        valoresIniciales={{
          nombres: "",
          apellidos: "",
          rut: "",
          email: "",
          perfilCodigo: "",
          formatosExcelIds: [],
        }}
        opcionesPerfil={[
          OPCION_SIN_ELEGIR,
          // Un actor REVISOR_REPOSITORIO no puede otorgar el perfil ADMIN (regla en
          // `application/`, ver CrearUsuario): se oculta la opción para no mostrar una acción
          // que el servidor rechazará igual.
          ...aOpcionesPerfil(perfiles.filter((perfil) => !esPerfilAdministrador(perfil.codigo))),
        ]}
        opcionesFormatoExcel={aOpcionesFormatoExcel(formatosExcel)}
      />
    </div>
  );
}
