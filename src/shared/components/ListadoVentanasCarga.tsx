import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { esPerfilAdministrador } from "@/modules/perfiles/domain/entities/Perfil";
import { listarVentanasCarga } from "@/modules/ventanas-carga/application/use-cases/ListarVentanasCarga";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { listarFormatosExcel } from "@/modules/formatos-excel/application/use-cases/ListarFormatosExcel";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { TablaVentanasCarga, type VentanaCargaVista } from "@/shared/components/TablaVentanasCarga";
import type { OpcionSelect } from "@/shared/components/CampoSelect";

// Server Component compartido entre `/dashboard/ventanas-carga` (ADMIN) y
// `/revisor/ventanas-carga` (REVISOR_REPOSITORIO): mismo listado y mismo formulario de creación,
// ambos perfiles pueden crear y editar ventanas de carga (RF-15). Se resuelve la sesión aquí
// (no en la página) para decidir en el cliente qué filas muestran "Eliminar": ADMIN puede
// eliminar cualquiera, REVISOR_REPOSITORIO solo las que él mismo creó. Esto es solo para no
// mostrar un botón que el servidor de todas formas rechazaría (`EliminarVentanaCarga.ts` aplica
// la misma regla); la autorización real vive ahí, no aquí.
type ListadoVentanasCargaProps = {
  // Base de la ruta de detalle de cargas aprobadas; cada área aporta la suya
  // (`/dashboard/ventanas-carga` o `/revisor/ventanas-carga`), mismo criterio que `rutaBase` en
  // `ListadoCargasAprobadas`.
  rutaBase: string;
};

export async function ListadoVentanasCarga({ rutaBase }: ListadoVentanasCargaProps) {
  const [ventanas, sesion, formatos] = await Promise.all([
    listarVentanasCarga({ repositorio: prismaVentanaCargaRepository }),
    obtenerSesionActual(),
    listarFormatosExcel({ repositorio: prismaFormatoExcelRepository }),
  ]);

  // Formatos activos + los que alguna ventana ya tuviera asignados, aunque hayan sido dados de
  // baja mientras tanto. Mismo criterio que `aOpcionesFormatoExcel`
  // (`app/dashboard/usuarios/opciones-formato-excel.ts`): sin esto, editar una ventana con un
  // formato inactivo lo quitaría en silencio al guardar (nunca aparecería en el `<select>`).
  const idsFormatoEnUso = new Set(ventanas.map((ventana) => ventana.formatoExcelId));
  const opcionesFormatoExcel: OpcionSelect[] = formatos
    .filter((formato) => formato.activo || idsFormatoEnUso.has(formato.id))
    .map((formato) => ({ valor: formato.id, etiqueta: formato.nombre }));

  const ventanasIniciales: VentanaCargaVista[] = ventanas.map((ventana) => ({
    id: ventana.id,
    anio: ventana.anio,
    fechaApertura: ventana.fechaApertura.toISOString(),
    fechaVencimiento: ventana.fechaVencimiento.toISOString(),
    formatoExcelId: ventana.formatoExcelId,
    formatoExcelNombre: ventana.formatoExcelNombre,
    publicada: ventana.publicada,
    archivada: ventana.archivada,
    creadoPorId: ventana.creadoPorId,
    creadoPorNombre: ventana.creadoPorNombre,
    eliminadaEn: ventana.eliminadaEn ? ventana.eliminadaEn.toISOString() : null,
    abierta: ventana.abierta,
    cantidadCargas: ventana.cantidadCargas,
    // Resuelta aquí, como string: `TablaVentanasCarga` es un Client Component ("use client", por
    // sus formularios/diálogos) y no puede recibir una función como prop desde este Server
    // Component.
    rutaDetalle: `${rutaBase}/${ventana.id}`,
  }));

  return (
    <TablaVentanasCarga
      ventanas={ventanasIniciales}
      actorId={sesion?.sub ?? ""}
      esAdmin={sesion ? esPerfilAdministrador(sesion.perfil) : false}
      opcionesFormatoExcel={opcionesFormatoExcel}
    />
  );
}
