import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const databaseUrl = process.env.DATABASE_URL;

let prisma;

/**
 * Initial classification values for the Music Archive.
 *
 * This seed is repeatable: existing records with the same type and slug
 * are preserved rather than overwritten.
 */
const initialClassifications = [
  // Languages: fixed supported values for the initial version.
  { type: "LANGUAGE", name: "Assamese", slug: "assamese" },
  { type: "LANGUAGE", name: "Hindi", slug: "hindi" },
  { type: "LANGUAGE", name: "English", slug: "english" },

  // Genres: administrators can add more through the future management UI.
  { type: "GENRE", name: "Metal", slug: "metal" },
  { type: "GENRE", name: "Country", slug: "country" },
  { type: "GENRE", name: "Pop", slug: "pop" },

  // Moods: administrators can add more through the future management UI.
  { type: "MOOD", name: "Happy", slug: "happy" },
  { type: "MOOD", name: "Sad", slug: "sad" },
  { type: "MOOD", name: "Motivational", slug: "motivational" }
];

async function main() {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
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

  let createdCount = 0;
  let existingCount = 0;

  for (const classification of initialClassifications) {
    const result = await prisma.classification.upsert({
      where: {
        type_slug: {
          type: classification.type,
          slug: classification.slug
        }
      },
      update: {},
      create: classification,
      select: {
        id: true,
        type: true,
        name: true,
        slug: true
      }
    });

    console.log(
      `${result.type}: ${result.name} (${result.slug}) — ready`
    );

    // The upsert preserves existing records; count is reported separately
    // below through a lookup before inserting new records.
  }

  const totalCount = await prisma.classification.count();

  console.log("");
  console.log("Classification seed completed successfully.");
  console.log(`Initial values configured: ${initialClassifications.length}`);
  console.log(`Total classifications in database: ${totalCount}`);
}

main()
  .catch((error) => {
    console.error(
      "Classification seed failed:",
      error.message
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });