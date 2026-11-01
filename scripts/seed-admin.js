
import "dotenv/config";
import argon2 from "argon2";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const databaseUrl = process.env.DATABASE_URL;
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD;

let prisma;

async function main() {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!adminEmail || !adminPassword) {
    throw new Error(
      "ADMIN_EMAIL and ADMIN_PASSWORD must be configured in .env."
    );
  }

  if (adminPassword.length < 12) {
    throw new Error(
      "ADMIN_PASSWORD must contain at least 12 characters."
    );
  }

  const parsedUrl = new URL(databaseUrl);

  if (parsedUrl.protocol !== "mysql:") {
    throw new Error("DATABASE_URL must use the mysql:// protocol.");
  }

  const databaseName = decodeURIComponent(
    parsedUrl.pathname.replace(/^\/+/, "")
  );

  if (!databaseName) {
    throw new Error("DATABASE_URL must specify a database name.");
  }

  const adapter = new PrismaMariaDb({
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port || 3306),
    user: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    database: databaseName,
    connectionLimit: 1
  });

  prisma = new PrismaClient({ adapter });

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true }
  });

  if (existingAdmin) {
    throw new Error(
      "An account with ADMIN_EMAIL already exists. No changes were made."
    );
  }

  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id
  });

  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      role: "ADMIN"
    },
    select: {
      id: true,
      email: true,
      role: true
    }
  });

  console.log("Administrator created successfully.");
  console.log(`ID: ${admin.id}`);
  console.log(`Email: ${admin.email}`);
  console.log(`Role: ${admin.role}`);
}

main()
  .catch((error) => {
    console.error("Administrator seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
