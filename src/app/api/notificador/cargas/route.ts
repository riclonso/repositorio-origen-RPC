import { recibirCompleto } from "./_lib/recepcion";
export { GET } from "./_lib/recepcion";
export async function POST(request: Request) { return recibirCompleto(request); }
