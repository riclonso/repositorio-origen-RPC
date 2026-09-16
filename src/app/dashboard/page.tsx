import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ActivityIcon as Activity,
  ArrowUpRight,
  CheckCircle,
  Clock,
  FileText,
  ShieldCheck,
  UserCheck,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { prismaUserRepository } from "@/modules/auth/infrastructure/repositories/PrismaUserRepository";
import { prisma } from "@/infrastructure/database/prisma";
import { TableroSeguimientoVentanas } from "@/shared/components/TableroSeguimientoVentanas";

// El tablero de seguimiento (`TableroSeguimientoVentanas`) consulta la BD en cada render y su barra
// de tiempo depende de `ahora`; además esta página lee la sesión y cuenta usuarios/perfiles. Se
// fuerza render dinámico para que nunca quede prerenderizada en el build.
export const dynamic = "force-dynamic";

const formatoNumero = new Intl.NumberFormat("es-CL");

type TarjetaMetricaProps = {
  etiqueta: string;
  valor: number;
  detalle: string;
  icono: ReactNode;
  tono: "azul" | "verde" | "ambar" | "violeta";
};

function TarjetaMetrica({ etiqueta, valor, detalle, icono, tono }: TarjetaMetricaProps) {
  const tonos = {
    azul: "bg-[#e9f3fb] text-[#17699d]",
    verde: "bg-[#eaf6ef] text-[#28764d]",
    ambar: "bg-[#fff5e3] text-[#a36316]",
    violeta: "bg-[#f1edfb] text-[#6551a0]",
  };

  return (
    <article className="card-sistema p-5">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex size-10 items-center justify-center rounded-xl ${tonos[tono]}`}>
          {icono}
        </span>
        <ArrowUpRight size={18} weight="bold" aria-hidden="true" className="text-[#9aabbc]" />
      </div>
      <p className="mt-5 text-sm font-medium text-[#617388]">{etiqueta}</p>
      <p className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-[#172b4d]">{formatoNumero.format(valor)}</p>
      <p className="mt-2 text-xs font-medium text-[#71849a]">{detalle}</p>
    </article>
  );
}

export default async function DashboardPage() {
  // El proxy ya garantiza una sesión de perfil administrador antes de llegar aquí; estas
  // comprobaciones son la red de seguridad para el caso borde de una cuenta borrada con el token
  // aún vigente (mismo criterio que la página del panel notificador).
  const sesion = await obtenerSesionActual();

  if (!sesion) {
    redirect("/login");
  }

  const usuario = await prismaUserRepository.buscarPorId(sesion.sub);

  if (!usuario) {
    redirect("/login");
  }

  const [usuariosTotal, usuariosActivos, usuariosPendientes, perfilesActivos] = await Promise.all([
    prisma.usuario.count(),
    prisma.usuario.count({ where: { activo: true, contrasenaHash: { not: null } } }),
    prisma.usuario.count({ where: { contrasenaHash: null } }),
    prisma.perfil.count({ where: { activo: true } }),
  ]);

  const porcentajeActivos = usuariosTotal > 0 ? Math.round((usuariosActivos / usuariosTotal) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-7xl pb-8">
      <section className="flex flex-col justify-between gap-5 border-b border-[#dce5ef] pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-[#3973a6]">Administración del repositorio</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.045em] text-[#172b4d]">
            Buenos días, {usuario.nombres}
          </h1>
          <p className="mt-2 text-sm text-[#617388]">Resumen operativo de cuentas y accesos del sistema.</p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-xl border border-[#dce5ef] bg-white px-3 py-2 text-sm font-medium text-[#496176] sm:self-auto">
          <Clock size={17} weight="bold" aria-hidden="true" className="text-[#3973a6]" />
          Actualizado ahora
        </div>
      </section>

      <section aria-label="Indicadores principales" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaMetrica etiqueta="Usuarios registrados" valor={usuariosTotal} detalle="Cuentas creadas en el sistema" tono="azul" icono={<UsersThree size={21} weight="duotone" aria-hidden="true" />} />
        <TarjetaMetrica etiqueta="Cuentas activas" valor={usuariosActivos} detalle="Con acceso habilitado" tono="verde" icono={<UserCheck size={21} weight="duotone" aria-hidden="true" />} />
        <TarjetaMetrica etiqueta="Activaciones pendientes" valor={usuariosPendientes} detalle="Esperando definir contraseña" tono="ambar" icono={<Clock size={21} weight="duotone" aria-hidden="true" />} />
        <TarjetaMetrica etiqueta="Perfiles disponibles" valor={perfilesActivos} detalle="Roles habilitados actualmente" tono="violeta" icono={<ShieldCheck size={21} weight="duotone" aria-hidden="true" />} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.85fr)]">
        <article className="card-sistema p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-[#1d3657]">Estado de accesos</h2>
              <p className="mt-1 text-sm text-[#71849a]">Distribución de las cuentas registradas.</p>
            </div>
            <Activity size={21} weight="duotone" aria-hidden="true" className="text-[#3973a6]" />
          </div>
          <div className="mt-8 grid items-center gap-8 sm:grid-cols-[11rem_1fr]">
            <div className="relative mx-auto grid size-40 place-items-center rounded-full" style={{ background: `conic-gradient(#1f78c8 0 ${porcentajeActivos}%, #e8eff6 ${porcentajeActivos}% 100%)` }}>
              <div className="grid size-[7.4rem] place-items-center rounded-full bg-white text-center">
                <strong className="text-3xl font-semibold tracking-[-0.05em] text-[#172b4d]">{porcentajeActivos}%</strong>
                <span className="text-xs text-[#71849a]">habilitadas</span>
              </div>
            </div>
            <dl className="grid gap-4">
              <div className="flex items-center justify-between border-b border-[#edf1f5] pb-3">
                <dt className="flex items-center gap-2 text-sm text-[#536a80]"><span className="size-2.5 rounded-full bg-[#1f78c8]" />Activas</dt>
                <dd className="text-sm font-semibold text-[#1d3657]">{formatoNumero.format(usuariosActivos)}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-[#edf1f5] pb-3">
                <dt className="flex items-center gap-2 text-sm text-[#536a80]"><span className="size-2.5 rounded-full bg-[#d8a343]" />Pendientes</dt>
                <dd className="text-sm font-semibold text-[#1d3657]">{formatoNumero.format(usuariosPendientes)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-sm text-[#536a80]"><span className="size-2.5 rounded-full bg-[#e8eff6]" />Restantes</dt>
                <dd className="text-sm font-semibold text-[#1d3657]">{formatoNumero.format(Math.max(usuariosTotal - usuariosActivos - usuariosPendientes, 0))}</dd>
              </div>
            </dl>
          </div>
        </article>

        <article className="card-sistema p-5 sm:p-6">
          <FileText size={22} weight="duotone" aria-hidden="true" className="text-[#3973a6]" />
          <h2 className="mt-5 text-lg font-semibold text-[#1d3657]">Actividad administrativa</h2>
          <p className="mt-2 text-sm leading-6 text-[#617388]">Consulta los registros de auditoría para revisar las acciones realizadas en el repositorio.</p>
          <Link href="/dashboard/logs" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#1d4778] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#14375f] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d4778]">
            Ver registros
            <ArrowUpRight size={17} weight="bold" aria-hidden="true" />
          </Link>
          <div className="mt-6 flex items-center gap-2 rounded-xl bg-[#eef6f1] px-3 py-3 text-sm text-[#286948]">
            <CheckCircle size={19} weight="fill" aria-hidden="true" />
            La información se actualiza desde la base de datos.
          </div>
        </article>
      </section>

      {/* Tablero de seguimiento de ventanas de carga (del módulo de reporte): estado de las
          ventanas abiertas y avance de los notificadores. */}
      <section className="mt-6">
        <TableroSeguimientoVentanas rutaBase="/dashboard/ventanas-carga" />
      </section>
    </div>
  );
}
