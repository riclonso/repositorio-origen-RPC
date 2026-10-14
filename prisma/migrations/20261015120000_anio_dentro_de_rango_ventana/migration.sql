-- Regla `ANIO_DENTRO_DE_RANGO_VENTANA`: el año de cada fecha con valor debe caer en
-- [año de la ventana − aniosAntes, año de la ventana + aniosDespues]. La configuración vive en la
-- columna JSON `configuracion` existente; solo se agrega el valor al enum.
ALTER TYPE "TipoReglaValidacionFormatoExcel" ADD VALUE IF NOT EXISTS 'ANIO_DENTRO_DE_RANGO_VENTANA';
