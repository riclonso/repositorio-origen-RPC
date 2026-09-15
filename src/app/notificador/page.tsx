import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { prismaUserRepository } from "@/modules/auth/infrastructure/repositories/PrismaUserRepository";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { listarCargasPropias } from "@/modules/reporte-excel/application/use-cases/ListarCargasPropias";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { listarVentanasDisponiblesParaNotificador } from "@/modules/ventanas-carga/application/use-cases/ListarVentanasDisponiblesParaNotificador";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { PanelCargaArchivo, type CargaResumenVista, type CombinacionCargaVista } from "./panel-carga-archivo";

export default async function NotificadorPage() {
  // El proxy ya garantiza una sesión de perfil notificador antes de llegar aquí; estas comprobaciones
  // son la red de seguridad para el caso borde de una cuenta borrada con el token aún vigente.
  const sesion = await obtenerSesionActual();

  if (!sesion) {
    redirect("/login");
  }

  const usuario = await prismaUserRepository.buscarPorId(sesion.sub);

  // Cuenta borrada con sesión vigente: se fuerza el reingreso en vez de saludar a una identidad que
  // ya no existe. Es el camino más robusto porque no deja renderizar un panel sin dueño. (El sistema
  // solo hace baja lógica, no borrado físico, así que es un escenario verdaderamente excepcional.)
  if (!usuario) {
    redirect("/login");
  }

  // Sin un formato asignado, el notificador no puede subir nada (RF-14). Sin ninguna ventana de
  // carga publicada y abierta ahora mismo (RF-15 ampliación), tampoco. `PanelCargaArchivo` muestra
  // un único mensaje genérico cuando el arreglo de combinaciones viene vacío, sin distinguir la
  // causa.
  const [formatos, cargasPropias, ventanasDisponibles] = await Promise.all([
    prismaFormatoExcelRepository.listarAsignadosAUsuario(sesion.sub),
    listarCargasPropias(
      { usuarioId: sesion.sub, pagina: 1, tamano: 25 },
      { repositorio: prismaCargaArchivoRepository },
    ),
    listarVentanasDisponiblesParaNotificador({ repositorio: prismaVentanaCargaRepository }),
  ]);

  // Una entrada por cada par (formato asignado, ventana disponible) cuyo formato coincide
  // exactamente: el notificador solo debe ver la ventana para subir el archivo que le corresponde
  // (RF-15 ampliación; corrección posterior reemplaza la comparación por tipo de archivo genérico
  // por una comparación de id exacta).
  const combinaciones: CombinacionCargaVista[] = formatos.flatMap((formato) =>
    ventanasDisponibles
      .filter((ventana) => ventana.formatoExcelId === formato.id)
      .map((ventana) => ({
        formatoExcelId: formato.id,
        formatoNombre: formato.nombre,
        anio: ventana.anio,
        ventanaCargaId: ventana.id,
      })),
  );

  const cargasIniciales: CargaResumenVista[] = cargasPropias.filas.map((carga) => ({
    ...carga,
    createdAt: carga.createdAt.toISOString(),
    vistoBuenoEn: carga.vistoBuenoEn ? carga.vistoBuenoEn.toISOString() : null,
  }));

  // Mismo filtro que `PanelCargaArchivo` aplica en el cliente tras un visto bueno: se repite aquí
  // para que una combinación ya aprobada en una sesión anterior tampoco aparezca en el primer
  // render (sin este filtro, se vería un instante hasta que el cliente vuelva a pedir "Mis
  // cargas").
  const combinacionesVisibles = combinaciones.filter(
    (combinacion) =>
      !cargasIniciales.some(
        (carga) => carga.ventanaCargaId === combinacion.ventanaCargaId && carga.estado === "APROBADA",
      ),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-gob-black">
          Bienvenido/a, {usuario.nombres}
        </h1>
        <p className="mt-2 text-sm text-gob-gray-a">
          Panel de notificación del Registro Poblacional de Cáncer.
        </p>
      </div>

      <PanelCargaArchivo combinaciones={combinacionesVisibles} cargasIniciales={cargasIniciales} />
    </div>
  );
}
