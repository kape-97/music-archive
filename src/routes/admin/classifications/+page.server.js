import { redirect } from "@sveltejs/kit";
import { prisma } from "../../../lib/server/prisma.js";

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  // Only authenticated administrators may access this page.
  if (!locals.admin || locals.admin.role !== "ADMIN") {
    redirect(303, "/");
  }

  const classifications = await prisma.classification.findMany({
    orderBy: [
      { type: "asc" },
      { name: "asc" }
    ],
    select: {
      id: true,
      type: true,
      name: true,
      slug: true
    }
  });

  return { classifications };
}