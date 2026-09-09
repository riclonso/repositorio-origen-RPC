import path from "node:path";
import { createLogger, format, transports } from "winston";

export const logger = createLogger({
  level: "error",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.File({ filename: path.join(process.cwd(), "logs", "errores.txt") })],
});
