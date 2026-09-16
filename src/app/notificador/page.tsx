import { redirect } from "next/navigation";
import { ChartBar, FileArrowUp, FileCsv, FileXls, Info, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { prismaUserRepository } from "@/modules/auth/infrastructure/repositories/PrismaUserRepository";

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

  return (
    <div className="mx-auto w-full max-w-7xl pb-8">
      <section className="flex flex-col justify-between gap-5 border-b border-[#dce5ef] pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-[#3973a6]">Registro Poblacional de Cáncer</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.045em] text-[#172b4d]">Hola, {usuario.nombres}</h1>
          <p className="mt-2 text-sm text-[#617388]">Centro de notificación y reporte de información del RPC.</p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-xl border border-[#dce5ef] bg-white px-3 py-2 text-sm font-medium text-[#496176] sm:self-auto">
          <ShieldCheck size={17} weight="duotone" aria-hidden="true" className="text-[#3973a6]" />
          Acceso autorizado
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.85fr)]">
        <article aria-labelledby="titulo-reporte" className="card-sistema p-6 sm:p-8">
          <div className="flex size-12 items-center justify-center rounded-xl bg-[#e9f3fb] text-[#17699d]">
            <FileArrowUp size={25} weight="duotone" aria-hidden="true" />
          </div>
          <h2 id="titulo-reporte" className="mt-6 text-xl font-semibold tracking-[-0.025em] text-[#1d3657]">Reporte de datos</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#617388]">Prepare y envíe información del Registro Poblacional de Cáncer mediante archivos Excel o CSV.</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[#e1eaf3] bg-[#f9fbfd] p-4">
              <FileXls size={23} weight="duotone" aria-hidden="true" className="text-[#3973a6]" />
              <p className="mt-3 text-sm font-semibold text-[#28445f]">Formato Excel</p>
              <p className="mt-1 text-xs leading-5 text-[#71849a]">Archivos de planilla para carga estructurada.</p>
            </div>
            <div className="rounded-xl border border-[#e1eaf3] bg-[#f9fbfd] p-4">
              <FileCsv size={23} weight="duotone" aria-hidden="true" className="text-[#3973a6]" />
              <p className="mt-3 text-sm font-semibold text-[#28445f]">Formato CSV</p>
              <p className="mt-1 text-xs leading-5 text-[#71849a]">Datos separados por comas para procesamiento.</p>
            </div>
          </div>
          <div className="mt-7 rounded-xl border border-dashed border-[#b6c8da] bg-[#f7fbff] px-5 py-6 text-center">
            <p className="text-sm font-semibold text-[#28445f]">Módulo de carga en preparación</p>
            <p className="mt-1 text-sm text-[#617388]">La carga y envío de reportes estará disponible próximamente.</p>
          </div>
        </article>

        <aside className="card-sistema p-6">
          <ChartBar size={23} weight="duotone" aria-hidden="true" className="text-[#3973a6]" />
          <h2 className="mt-5 text-lg font-semibold text-[#1d3657]">Estado del servicio</h2>
          <p className="mt-2 text-sm leading-6 text-[#617388]">Este perfil está habilitado para trabajar con reportes del Registro Poblacional de Cáncer.</p>
          <div className="mt-6 rounded-xl bg-[#eef6f1] p-4">
            <p className="text-sm font-semibold text-[#286948]">Perfil notificador activo</p>
            <p className="mt-1 text-xs leading-5 text-[#477b60]">Los permisos se validan automáticamente al iniciar sesión.</p>
          </div>
          <div className="mt-5 flex gap-3 rounded-xl bg-[#f5f8fb] p-4 text-sm leading-6 text-[#536a80]">
            <Info size={20} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0 text-[#3973a6]" />
            <p>Cuando el módulo esté disponible, podrá adjuntar archivos y revisar el resultado de cada envío.</p>
          </div>
        </aside>
      </section>
    </div>
  );
}
