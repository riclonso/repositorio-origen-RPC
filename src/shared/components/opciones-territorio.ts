import type { Provincia } from "@/modules/provincias/domain/entities/Provincia";
import type { Region } from "@/modules/regiones/domain/entities/Region";
import type { GrupoOpcionesSelect, OpcionSelect } from "@/shared/components/CampoSelect";

// Etiquetas únicas del catálogo territorial, para que los filtros, el alta, la edición y las
// columnas de las tablas de provincias y comunas las muestren igual. Mismo precedente que
// `opciones-perfil.ts`.

// "08 · Biobío"
export function etiquetaRegion(region: { codigo: string; nombre: string }): string {
  return `${region.codigo} · ${region.nombre}`;
}

// "081 · Concepción"
export function etiquetaProvincia(provincia: { codigo: string; nombre: string }): string {
  return `${provincia.codigo} · ${provincia.nombre}`;
}

// Traduce el catálogo de regiones a opciones de select conservando el orden del repositorio
// (por número de región).
export function aOpcionesRegion(regiones: Region[]): OpcionSelect[] {
  return regiones.map((region) => ({ valor: region.id, etiqueta: etiquetaRegion(region) }));
}

// Agrupa las provincias por región en `<optgroup>` ("08 · Biobío"). El repositorio ya las entrega
// ordenadas por número de región y luego por código, así que basta con cortar cada vez que cambia
// la región: se conserva ese orden sin volver a ordenar.
export function aGruposProvinciaPorRegion(provincias: Provincia[]): GrupoOpcionesSelect[] {
  const grupos: GrupoOpcionesSelect[] = [];
  let regionActualId: string | null = null;

  for (const provincia of provincias) {
    if (provincia.region.id !== regionActualId) {
      regionActualId = provincia.region.id;
      grupos.push({ grupo: etiquetaRegion(provincia.region), opciones: [] });
    }

    grupos[grupos.length - 1].opciones.push({
      valor: provincia.id,
      etiqueta: etiquetaProvincia(provincia),
    });
  }

  return grupos;
}
