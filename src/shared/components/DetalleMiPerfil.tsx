import type { FormatoExcelAsignado } from "@/modules/usuarios/domain/entities/Usuario";

type DetalleMiPerfilProps = {
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  username: string;
  perfilNombre: string;
  // Solo se pasa para el perfil NOTIFICADOR_RPC: para ADMIN/REVISOR_REPOSITORIO esta prop no se
  // envía, así la sección "Formatos de archivo asignados" no se renderiza (en vez de renderizarse
  // vacía condicionada en el cliente).
  formatosExcel?: FormatoExcelAsignado[];
};

function CampoSoloLectura({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gob-gray-a">{etiqueta}</dt>
      <dd className="mt-1 text-sm text-gob-black">{valor}</dd>
    </div>
  );
}

// Pantalla "Mi perfil": solo lectura, sin edición (ver diseño aprobado). Compartida por los tres
// paneles (ADMIN, NOTIFICADOR_RPC, REVISOR_REPOSITORIO); cada `page.tsx` de área resuelve los
// datos y decide si pasa `formatosExcel`.
export function DetalleMiPerfil({
  nombres,
  apellidos,
  rut,
  email,
  username,
  perfilNombre,
  formatosExcel,
}: DetalleMiPerfilProps) {
  return (
    <div className="card-sistema mt-6 p-6">
      <dl className="grid gap-5 sm:grid-cols-2">
        <CampoSoloLectura etiqueta="Nombre completo" valor={`${nombres} ${apellidos}`.trim()} />
        <CampoSoloLectura etiqueta="RUT" valor={rut} />
        <CampoSoloLectura etiqueta="Email" valor={email} />
        <CampoSoloLectura etiqueta="Nombre de usuario" valor={username} />
        <CampoSoloLectura etiqueta="Perfil" valor={perfilNombre} />
      </dl>

      {formatosExcel ? (
        <div className="mt-6 border-t border-gob-accent/60 pt-5">
          <h2 className="text-sm font-semibold text-gob-black">Formatos de archivo asignados</h2>

          {formatosExcel.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {formatosExcel.map((formato) => (
                <li
                  key={formato.id}
                  className="rounded-md border border-gob-accent bg-gob-neutral px-3 py-2 text-sm text-gob-black"
                >
                  {formato.nombre}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-gob-gray-a">
              No tienes formatos de archivo asignados todavía.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
