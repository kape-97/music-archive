
import { redirect } from "@sveltejs/kit";
import { prisma } from "../../../lib/server/prisma.js";

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  // Only authenticated administrators may access the Music Library.
  if (!locals.admin || locals.admin.role !== "ADMIN") {
    redirect(303, "/");
  }

  // Load the existing songs and the available classifications.
  const [songs, classifications] = await Promise.all([
    prisma.song.findMany({
      orderBy: [
        { displayOrder: "asc" },
        { createdAt: "desc" }
      ],
      select: {
        id: true,
        title: true,
        artist: true,
        album: true,
        year: true,
        durationSeconds: true,
        coverKey: true,
        isPublished: true,
        deletionPending: true,
        classifications: {
          select: {
            classification: {
              select: {
                id: true,
                type: true,
                name: true,
                slug: true
              }
            }
          }
        }
      }
    }),

    prisma.classification.findMany({
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
    })
  ]);

  return {
    songs,
    classifications
  };
}
