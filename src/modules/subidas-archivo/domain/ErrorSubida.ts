export class ErrorSubida extends Error {
  constructor(public readonly codigo: string, public readonly estado: number, mensaje: string) { super(mensaje); }
}
