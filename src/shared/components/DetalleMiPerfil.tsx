import { IconoDocumento } from "@/shared/components/iconos";
import type { FormatoExcelAsignado } from "@/modules/usuarios/domain/entities/Usuario";

type DetalleMiPerfilProps = {
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  username: string;
  perfilNombre: string;
  formatosExcel?: FormatoExcelAsignado[];
};

function getCodogoPerfilColor(perfilNombre: string): string {
  if (perfilNombre.includes("Administrador")) return "bg-blue-50 text-gob-primary border-gob-primary/20";
  if (perfilNombre.includes("Notificador")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (perfilNombre.includes("Revisor")) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-gob-gray-a border-gob-accent/30";
}

function CampoSoloLectura({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="space-y-1.5">
      <dt className="text-xs font-semibold uppercase tracking-wider text-gob-gray-b">{etiqueta}</dt>
      <dd className="text-base font-medium text-gob-black">{valor}</dd>
    </div>
  );
}

export function DetalleMiPerfil({
  nombres,
  apellidos,
  rut,
  email,
  username,
  perfilNombre,
  formatosExcel,
}: DetalleMiPerfilProps) {
  const nombreCompleto = `${nombres} ${apellidos}`.trim();

  return (
    <div className="space-y-6">
      <div className="card-sistema overflow-hidden p-6 sm:p-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gob-tertiary">Información de la cuenta</h2>
            <p className="mt-1 text-sm text-gob-gray-a">Datos personales y de acceso al sistema</p>
          </div>
          <div
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${getCodogoPerfilColor(perfilNombre)}`}
          >
            {perfilNombre}
          </div>
        </div>

        <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <CampoSoloLectura etiqueta="Nombre completo" valor={nombreCompleto} />
          <CampoSoloLectura etiqueta="RUT" valor={rut} />
          <CampoSoloLectura etiqueta="Email" valor={email} />
          <CampoSoloLectura etiqueta="Nombre de usuario" valor={username} />
        </dl>
      </div>

      {formatosExcel && (
        <div className="card-sistema p-6 sm:p-8">
          <h3 className="mb-1 text-xl font-bold text-gob-tertiary">Formatos de archivo asignados</h3>
          <p className="mb-5 text-sm text-gob-gray-a">Archivos que puedes cargar en el sistema</p>

          {formatosExcel.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {formatosExcel.map((formato) => (
                <div
                  key={formato.id}
                  className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 transition-all hover:border-emerald-300 hover:bg-emerald-100"
                >
                  <IconoDocumento className="h-5 w-5 shrink-0 text-emerald-700" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gob-black">{formato.nombre}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gob-accent bg-slate-50 px-4 py-6 text-center">
              <p className="text-sm text-gob-gray-a">No tienes formatos de archivo asignados todavía.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
