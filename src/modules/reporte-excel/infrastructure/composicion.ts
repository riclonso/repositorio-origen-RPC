import { almacenArchivosCargas } from "@/modules/reporte-excel/infrastructure/almacenamiento/almacenArchivosCargas";
import { limitadorDescargasCargas } from "@/modules/reporte-excel/infrastructure/concurrencia/limitadoresCargas";
import {
  conLimitadorDescargas,
  crearGeneradorDescargaCargaExcelJs,
} from "@/modules/reporte-excel/infrastructure/generacion-excel/GeneradorDescargaCargaExcelJs";
import { crearValidadorArchivoReporteStreaming } from "@/modules/reporte-excel/infrastructure/validacion/ValidadorArchivoReporteStreaming";

// RF-38: instancias de la aplicación de las implementaciones de infraestructura del módulo, sobre el
// almacén configurado. Los Route Handlers las inyectan en los casos de uso.
export const validadorArchivoReporte = crearValidadorArchivoReporteStreaming(almacenArchivosCargas);

export const generadorDescargaCarga = conLimitadorDescargas(
  crearGeneradorDescargaCargaExcelJs(almacenArchivosCargas),
  limitadorDescargasCargas,
);
