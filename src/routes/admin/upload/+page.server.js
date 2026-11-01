
import { redirect } from "@sveltejs/kit";
import { prisma } from "../../../lib/server/prisma.js";

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  // Only authenticated administrators may access song upload.
  if (!locals.admin || locals.admin.role !== "ADMIN") {
    redirect(303, "/");
  }

  // Load classification options and existing metadata values.
  const [classifications, existingSongs] = await Promise.all([
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
    }),

    prisma.song.findMany({
      select: {
        artist: true,
        album: true
      }
    })
  ]);

  // Keep distinct, non-empty artist suggestions.
  const existingArtists = [
    ...new Set(
      existingSongs
        .map((song) => song.artist.trim())
        .filter(Boolean)
    )
  ].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  // Albums are optional, so exclude null and empty values.
  const existingAlbums = [
    ...new Set(
      existingSongs
        .map((song) => song.album?.trim() ?? "")
        .filter(Boolean)
    )
  ].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  return {
    classifications,
    existingArtists,
    existingAlbums
  };
}
