
import { redirect } from "@sveltejs/kit";
import { prisma } from "../../../lib/server/prisma.js";

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  // Only authenticated administrators may access Publishing.
  if (!locals.admin || locals.admin.role !== "ADMIN") {
    redirect(303, "/");
  }

  // Load songs with their associated classifications.
  const songs = await prisma.song.findMany({
    orderBy: [
      { displayOrder: "asc" },
      { createdAt: "desc" }
    ],
    select: {
      id: true,
      title: true,
      artist: true,
      album: true,
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
  });

  // Do not expose private R2 object keys to the browser.
  return {
    songs: songs.map(({ coverKey, ...song }) => ({
      ...song,
      hasCover: Boolean(coverKey)
    }))
  };
}
