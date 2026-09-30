import type { EnlacePanel } from "@/shared/components/NavegacionPanel";

export const ENLACES_ADMIN: readonly EnlacePanel[] = [
  { href: "/dashboard", etiqueta: "Panel" },
  { href: "/dashboard/usuarios", etiqueta: "Usuarios" },
  { href: "/dashboard/formatos-excel", etiqueta: "Formatos de archivo" },
  { href: "/dashboard/ventanas-carga", etiqueta: "Ventanas de carga" },
  { href: "/dashboard/solicitudes", etiqueta: "Solicitudes" },
  {
    etiqueta: "Administración",
    subenlaces: [
      { href: "/dashboard/establecimientos", etiqueta: "Establecimientos" },
      { href: "/dashboard/tipos-establecimiento", etiqueta: "Tipos de establecimiento" },
      { href: "/dashboard/regiones", etiqueta: "Regiones" },
      { href: "/dashboard/provincias", etiqueta: "Provincias" },
      { href: "/dashboard/comunas", etiqueta: "Comunas" },
      { href: "/dashboard/logs", etiqueta: "Logs" },
    ],
  },
];
