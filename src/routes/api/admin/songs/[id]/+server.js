
import { json } from "@sveltejs/kit";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../../../../../lib/server/prisma.js";
import {
  r2BucketName,
  r2Client
} from "../../../../../lib/server/r2.js";

const MAX_TEXT_LENGTH = 191;

const EDITABLE_FIELDS = [
  "title",
  "artist",
  "album",
  "year",
  "durationSeconds",
  "languageId",
  "genreId",
  "moodIds",
  "categoryIds"
];

// Only delete audio objects created under the application's songs/ namespace.
// The current uploader generates UUID v4 filenames.
const AUDIO_OBJECT_KEY_PATTERN =
  /^songs\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp3$/i;

// Cover deletion is supported only for UUID-named images in covers/.
// The current application does not yet implement cover-art uploads.
const COVER_OBJECT_KEY_PATTERN =
  /^covers\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|jpeg|png|webp)$/i;

/**
 * Validate the exact stored object keys before any destructive operation.
 *
 * @param {{ fileKey: string, coverKey: string | null }} song
 * @returns {boolean}
 */
function hasSupportedR2Keys(song) {
  return (
    AUDIO_OBJECT_KEY_PATTERN.test(song.fileKey) &&
    (
      song.coverKey === null ||
      (
        typeof song.coverKey === "string" &&
        COVER_OBJECT_KEY_PATTERN.test(song.coverKey)
      )
    )
  );
}


/**
 * Validate a song ID from the route.
 *
 * @param {string | undefined} value
 * @returns {number | null}
 */
function parseSongId(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id) ? id : null;
}

/**
 * Validate a positive integer classification ID.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
function readPositiveId(value) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
    ? value
    : null;
}

/**
 * Validate an array of unique positive integer IDs.
 *
 * @param {unknown} value
 * @returns {number[] | null}
 */
function readIdList(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  /** @type {number[]} */
  const ids = [];

  for (const item of value) {
    const id = readPositiveId(item);

    if (id === null) {
      return null;
    }

    ids.push(id);
  }

  if (new Set(ids).size !== ids.length) {
    return null;
  }

  return ids;
}

/**
 * Update song metadata and classification associations.
 *
 * The MP3 file, R2 key, cover-art key, publication status,
 * and display order are deliberately not modified.
 *
 * All editable fields must be supplied in the JSON request body.
 *
 * @param {import("@sveltejs/kit").RequestEvent} event
 */
export async function PATCH({ locals, params, request }) {
  // Only authenticated administrators may edit songs.
  if (!locals.admin || locals.admin.role !== "ADMIN") {
    return json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const id = parseSongId(params.id);

  if (id === null) {
    return json(
      { error: "A valid song ID is required." },
      { status: 400 }
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      { error: "Request body must contain valid JSON." },
      { status: 400 }
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return json(
      { error: "Request body must be a JSON object." },
      { status: 400 }
    );
  }

  // Prevent clients from modifying protected song fields.
  if (
    Object.keys(body).some(
      (key) => !EDITABLE_FIELDS.includes(key)
    )
  ) {
    return json(
      { error: "The request contains unsupported fields." },
      { status: 400 }
    );
  }

  // Require every editable field so omitted metadata cannot
  // accidentally be interpreted as an intentional deletion.
  if (
    EDITABLE_FIELDS.some(
      (field) =>
        !Object.prototype.hasOwnProperty.call(body, field)
    )
  ) {
    return json(
      { error: "Please provide all editable metadata fields." },
      { status: 400 }
    );
  }

  // Required text fields.
  const title =
    typeof body.title === "string"
      ? body.title.trim()
      : "";

  const artist =
    typeof body.artist === "string"
      ? body.artist.trim()
      : "";

  if (
    !title ||
    !artist ||
    title.length > MAX_TEXT_LENGTH ||
    artist.length > MAX_TEXT_LENGTH
  ) {
    return json(
      {
        error:
          "Title and artist are required and must not exceed 191 characters."
      },
      { status: 400 }
    );
  }

  // Optional album.
  let album = null;

  if (body.album !== null) {
    if (typeof body.album !== "string") {
      return json(
        { error: "Album must be text or null." },
        { status: 400 }
      );
    }

    const normalizedAlbum = body.album.trim();

    if (normalizedAlbum.length > MAX_TEXT_LENGTH) {
      return json(
        { error: "Album must not exceed 191 characters." },
        { status: 400 }
      );
    }

    album = normalizedAlbum || null;
  }

  // Optional four-digit release year.
  let year = null;

  if (body.year !== null) {
    if (
      typeof body.year !== "number" ||
      !Number.isInteger(body.year) ||
      body.year < 1000 ||
      body.year > 9999
    ) {
      return json(
        { error: "Year must be a valid four-digit year or null." },
        { status: 400 }
      );
    }

    year = body.year;
  }

  // Optional duration, stored as a non-negative integer in seconds.
  let durationSeconds = null;

  if (body.durationSeconds !== null) {
    if (
      typeof body.durationSeconds !== "number" ||
      !Number.isSafeInteger(body.durationSeconds) ||
      body.durationSeconds < 0
    ) {
      return json(
        {
          error:
            "Duration must be a non-negative integer or null."
        },
        { status: 400 }
      );
    }

    durationSeconds = body.durationSeconds;
  }

  // Exactly one valid language and genre must be selected.
  const languageId = readPositiveId(body.languageId);
  const genreId = readPositiveId(body.genreId);

  if (languageId === null || genreId === null) {
    return json(
      { error: "Select exactly one valid language and genre." },
      { status: 400 }
    );
  }

  // Moods and categories are optional multi-select fields.
  const moodIds = readIdList(body.moodIds);
  const categoryIds = readIdList(body.categoryIds);

  if (moodIds === null || categoryIds === null) {
    return json(
      {
        error:
          "Mood and category selections must contain unique positive integer IDs."
      },
      { status: 400 }
    );
  }

  const classificationIds = [
    languageId,
    genreId,
    ...moodIds,
    ...categoryIds
  ];

  const uniqueClassificationIds = [
    ...new Set(classificationIds)
  ];

  try {
    // Validate and update the song in one transaction.
    const result = await prisma.$transaction(async (tx) => {
      const existingSong = await tx.song.findUnique({
  where: { id },
  select: {
    id: true,
    deletionPending: true
  }
});

      if (!existingSong) {
  return {
    error: "Song not found.",
    status: 404
  };
      }

      if (existingSong.deletionPending) {
  return {
    error: "This song is pending deletion and cannot be edited.",
    status: 409
  };
      }

      const classifications =
        await tx.classification.findMany({
          where: {
            id: { in: uniqueClassificationIds }
          },
          select: {
            id: true,
            type: true
          }
        });

      if (
        classifications.length !==
        uniqueClassificationIds.length
      ) {
        return {
          error:
            "One or more selected classifications do not exist.",
          status: 400
        };
      }

      const typeById = new Map(
        classifications.map((item) => [
          item.id,
          item.type
        ])
      );

      if (typeById.get(languageId) !== "LANGUAGE") {
        return {
          error: "The selected language is invalid.",
          status: 400
        };
      }

      if (typeById.get(genreId) !== "GENRE") {
        return {
          error: "The selected genre is invalid.",
          status: 400
        };
      }

      if (moodIds.some((moodId) =>
        typeById.get(moodId) !== "MOOD"
      )) {
        return {
          error:
            "Every selected mood must be a MOOD classification.",
          status: 400
        };
      }

      if (categoryIds.some((categoryId) =>
        typeById.get(categoryId) !== "CATEGORY"
      )) {
        return {
          error:
            "Every selected category must be a CATEGORY classification.",
          status: 400
        };
      }

      // Update metadata only if deletion has not started.
// The conditional update also protects against a concurrent
// request marking this song as pending deletion.
        const updateResult = await tx.song.updateMany({
  where: {
    id,
    deletionPending: false
  },
  data: {
    title,
    artist,
    album,
    year,
    durationSeconds
  }
        });

        if (updateResult.count !== 1) {
  return {
    error:
      "This song is pending deletion or no longer exists. Refresh the library and try again.",
    status: 409
  };
        }

      // Replace the classification associations transactionally.
      await tx.songClassification.deleteMany({
        where: { songId: id }
      });

      await tx.songClassification.createMany({
        data: classificationIds.map((classificationId) => ({
          songId: id,
          classificationId
        }))
      });

      // Return the updated song in the Music Library API shape.
      const song = await tx.song.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          artist: true,
          album: true,
          year: true,
          durationSeconds: true,
          isPublished: true,
          displayOrder: true,
          createdAt: true,
          updatedAt: true,
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

      if (!song) {
        return {
          error: "Song not found.",
          status: 404
        };
      }

      return { song };
    });

    if ("error" in result) {
      return json(
        { error: result.error },
        { status: result.status }
      );
    }

    return json({ song: result.song });
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error
        ? error.code
        : null;

    if (code === "P2025") {
      return json(
        { error: "Song not found." },
        { status: 404 }
      );
    }

    if (code === "P2003") {
      return json(
        {
          error:
            "A selected classification changed or no longer exists. Refresh the page and try again."
        },
        { status: 409 }
      );
    }

    console.error(
      "Administrator song update failed:",
      error
    );

    return json(
      { error: "Unable to update the song right now." },
      { status: 500 }
    );
  }
}

/**
 * Delete a song and its exact associated R2 objects.
 *
 * The request body must contain:
 * {
 *   "confirmation": "<exact song title> — <exact artist>"
 * }
 *
 * The song is marked pending before storage cleanup begins.
 * If storage cleanup fails, its database record and storage keys
 * remain available for a later retry.
 *
 * @param {import("@sveltejs/kit").RequestEvent} event
 */
export async function DELETE({ locals, params, request }) {
  // Only authenticated administrators may delete songs.
  if (!locals.admin || locals.admin.role !== "ADMIN") {
    return json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const id = parseSongId(params.id);

  if (id === null) {
    return json(
      { error: "A valid song ID is required." },
      { status: 400 }
    );
  }

  // Require explicit confirmation from the administrator.
  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      { error: "Request body must contain valid JSON." },
      { status: 400 }
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== "confirmation") ||
    typeof body.confirmation !== "string" ||
    body.confirmation.length > 400
  ) {
    return json(
      {
        error:
          'Provide only a "confirmation" field containing the exact song title and artist.'
      },
      { status: 400 }
    );
  }

  // Retrieve the authoritative metadata and storage references.
  let song;

  try {
    song = await prisma.song.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        artist: true,
        fileKey: true,
        coverKey: true,
        deletionPending: true
      }
    });
  } catch (error) {
    console.error("Song deletion lookup failed:", {
      songId: id,
      error
    });

    return json(
      { error: "Unable to load the song for deletion." },
      { status: 500 }
    );
  }

  if (!song) {
    return json(
      { error: "Song not found." },
      { status: 404 }
    );
  }

  // The confirmation must match the current database values exactly.
  const expectedConfirmation = `${song.title} — ${song.artist}`;

  if (body.confirmation !== expectedConfirmation) {
    return json(
      {
        error:
          "Confirmation does not match the song title and artist."
      },
      { status: 400 }
    );
  }

  // Never delete an unrecognised key or a key from another namespace.
  // This check happens before changing the deletion state or touching R2.
  if (!hasSupportedR2Keys(song)) {
    return json(
      {
        error:
          "The stored audio or cover-art key does not match the supported storage format. No storage objects were deleted."
      },
      { status: 409 }
    );
  }

  // Persist the recovery state before deleting anything from storage.
  // A conditional update prevents starting from stale song metadata.
  if (!song.deletionPending) {
    let markResult;

    try {
      markResult = await prisma.song.updateMany({
        where: {
          id,
          deletionPending: false,
          title: song.title,
          artist: song.artist,
          fileKey: song.fileKey,
          coverKey: song.coverKey
        },
        data: {
          deletionPending: true
        }
      });
    } catch (error) {
      console.error("Unable to mark song pending deletion:", {
        songId: id,
        error
      });

      return json(
        {
          error:
            "Unable to start deletion safely. Refresh the library before retrying."
        },
        { status: 500 }
      );
    }

    if (markResult.count !== 1) {
      // Another request may have started deletion or changed the
      // song before the conditional update completed.
      let latestSong;

      try {
        latestSong = await prisma.song.findUnique({
          where: { id },
          select: {
            id: true,
            title: true,
            artist: true,
            fileKey: true,
            coverKey: true,
            deletionPending: true
          }
        });
      } catch (error) {
        console.error("Unable to verify song deletion state:", {
          songId: id,
          error
        });

        return json(
          {
            error:
              "Unable to verify the deletion state. Refresh the library before retrying."
          },
          { status: 500 }
        );
      }

      if (!latestSong) {
        return json(
          { error: "Song no longer exists." },
          { status: 404 }
        );
      }

      if (
        body.confirmation !==
        `${latestSong.title} — ${latestSong.artist}`
      ) {
        return json(
          {
            error:
              "The song details changed before deletion started. Refresh the library and confirm again."
          },
          { status: 409 }
        );
      }

      if (!latestSong.deletionPending) {
        return json(
          {
            error:
              "The song changed while deletion was starting. Refresh the library and try again."
          },
          { status: 409 }
        );
      }

      if (!hasSupportedR2Keys(latestSong)) {
        return json(
          {
            error:
              "The stored object keys do not match the supported storage format. No further storage cleanup was attempted."
          },
          { status: 409 }
        );
      }

      // Reuse the latest authoritative keys when another request
      // has already marked this song pending deletion.
      song = latestSong;
    }
  }

  // Delete individual objects only. DeleteObject is safe to retry:
  // the endpoint does not depend on the object still existing.
  const storageObjects = [
    { key: song.fileKey, type: "audio" },
    ...(song.coverKey === null
      ? []
      : [{ key: song.coverKey, type: "cover art" }])
  ];

  for (const object of storageObjects) {
    try {
      await r2Client.send(
        new DeleteObjectCommand({
          Bucket: r2BucketName,
          Key: object.key
        })
      );
    } catch (error) {
      console.error("Song storage cleanup failed:", {
        songId: id,
        objectType: object.type,
        error
      });

      // Do not remove the database record when any required
      // storage operation fails. Keep the pending state for retry.
      return json(
        {
          error:
            `Deletion is pending, but ${object.type} cleanup failed. The song remains marked for retry.`
        },
        { status: 502 }
      );
    }
  }

  // Storage cleanup succeeded. Delete only the same song that
  // was marked pending, with its original storage references.
  try {
    const deletionResult = await prisma.song.deleteMany({
      where: {
        id,
        deletionPending: true,
        fileKey: song.fileKey,
        coverKey: song.coverKey
      }
    });

    if (deletionResult.count === 1) {
      // MySQL's existing cascading relationship removes the
      // SongClassification rows, not the Classification records.
      return json({
        deleted: true,
        songId: id
      });
    }

    // A concurrent deletion may already have removed this record.
    const remainingSong = await prisma.song.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!remainingSong) {
      return json({
        deleted: true,
        songId: id,
        alreadyDeleted: true
      });
    }

    return json(
      {
        error:
          "Storage cleanup completed, but the song record was not deleted. Refresh the library before retrying."
      },
      { status: 500 }
    );
  } catch (error) {
    console.error("Song database deletion failed:", {
      songId: id,
      error
    });

    return json(
      {
        error:
          "Storage cleanup may have completed, but the database deletion could not be confirmed. Refresh the library before retrying."
      },
      { status: 500 }
    );
  }
}

