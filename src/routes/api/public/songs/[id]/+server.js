
import { json } from "@sveltejs/kit";
import { prisma } from "../../../../../lib/server/prisma.js";

/**
 * Return JSON with caching disabled.
 *
 * @param {unknown} data
 * @param {ResponseInit} [init]
 * @returns {Response}
 */
function noStoreJson(data, init = {}) {
  const headers = new Headers(init.headers);

  headers.set("Cache-Control", "no-store");

  return json(data, {
    ...init,
    headers
  });
}

/**
 * Validate a positive song ID.
 *
 * @param {string | undefined} value
 * @returns {number | null}
 */
function parseSongId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id) ? id : null;
}

/**
 * GET /api/public/songs/:id
 *
 * Retrieve one eligible published song.
 *
 * Unpublished, pending-deletion and nonexistent songs
 * are all treated as unavailable.
 *
 * @param {import("@sveltejs/kit").RequestEvent} event
 * @returns {Promise<Response>}
 */
export async function GET({ params }) {
  // -------------------------------------------------------
  // 1. Validate the requested song ID
  // -------------------------------------------------------

  const songId = parseSongId(params.id);

  if (songId === null) {
    return noStoreJson(
      { error: "Song not found." },
      { status: 404 }
    );
  }

  try {

    // 2. Retrieve only publicly eligible songs


    const song = await prisma.song.findFirst({
      where: {                              //This is the central security condition
        id: songId,
        isPublished: true,
        deletionPending: false
      },

      select: {
        id: true,
        title: true,
        artist: true,
        album: true,
        year: true,
        durationSeconds: true,

        // Selected internally to determine artwork availability.
        // Never expose the actual R2 object key.
        coverKey: true,

        classifications: {
          select: {
            classification: {
              select: {
                type: true,
                name: true,
                slug: true
              }
            }
          }
        }
      }
    });

    // -----------------------------------------------------
    // 3. Hide unavailable songs
    // -----------------------------------------------------

    if (!song) {
      return noStoreJson(
        { error: "Song not found." },
        { status: 404 }
      );
    }

    // -----------------------------------------------------
    // 4. Prepare safe public metadata
    // -----------------------------------------------------

    const classifications = song.classifications
      .map((entry) => ({
        type: entry.classification.type,
        name: entry.classification.name,
        slug: entry.classification.slug
      }))
      .sort((a, b) =>
        a.type.localeCompare(b.type) ||
        a.name.localeCompare(b.name)
      );

    // -----------------------------------------------------
    // 5. Return the public song detail
    // -----------------------------------------------------

    return noStoreJson({
      song: {
        id: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        year: song.year,
        durationSeconds: song.durationSeconds,

        hasCover: Boolean(song.coverKey),

        audioUrl: `/api/public/songs/${song.id}/audio`,

        coverUrl: song.coverKey
          ? `/api/public/songs/${song.id}/cover`
          : null,

        classifications
      }
    });

  } catch (error) {
    console.error(
      "Public song detail lookup failed:",
      { songId, error }
    );

    return noStoreJson(
      { error: "Unable to load this song right now." },
      { status: 500 }
    );
  }
}
