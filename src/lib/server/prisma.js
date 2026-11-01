
import { DATABASE_URL } from "$app/env/private";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../../generated/prisma/client";

const connectionString = DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const databaseUrl = new URL(connectionString);

if (databaseUrl.protocol !== "mysql:") {
  throw new Error("DATABASE_URL must use the mysql:// protocol.");
}

const databaseName = decodeURIComponent(
  databaseUrl.pathname.replace(/^\/+/, "")
);

if (!databaseName) {
  throw new Error("DATABASE_URL must specify a database name.");
}

const adapter = new PrismaMariaDb({
  host: databaseUrl.hostname,
  port: Number(databaseUrl.port || 3306),
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: databaseName,
  connectionLimit: 5
});

/**
 * @type {typeof globalThis & {
 *   __musicArchivePrisma?: import("../../generated/prisma/client").PrismaClient
 * }}
 */
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__musicArchivePrisma ??
  new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__musicArchivePrisma = prisma;
}
