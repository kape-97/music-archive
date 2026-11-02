
import { json } from "@sveltejs/kit";
import { prisma } from "../../../../../../lib/server/prisma.js";

/**
 * Validate a positive integer song ID.
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
 * Publish or unpublish a song.
 *
 * Only authenticated ADMIN users may change publication state.
 * Songs pending deletion cannot be published or unpublished.
 *
 * Expected JSON:
 * { "isPublished": true }
 *
 * @param {import("@sveltejs/kit").RequestEvent} event
 */
export async function PATCH({ locals, params, request }) {

  // 1. Administrator authorization.
  if (!locals.admin || locals.admin.role !== "ADMIN") {
    return json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  // 2. Validate song ID.
  const id = parseSongId(params.id);

  if (id === null) {
    return json(
      { error: "A valid song ID is required." },
      { status: 400 }
    );
  }

  // 3. Read JSON request body.
  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      { error: "Request body must contain valid JSON." },
      { status: 400 }
    );
  }

  // 4. Accept exactly one strict boolean field.
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(body, "isPublished") ||
    typeof body.isPublished !== "boolean"
  ) {
    return json(
      {
        error:
          'Request must contain only a boolean "isPublished" field.'
      },
      { status: 400 }
    );
  }

  const requestedState = body.isPublished;

  try {
    // 5. Update only if deletion has not started.
    // The condition is enforced by MySQL during the update,
    // protecting against a concurrent deletion request.
    const updateResult = await prisma.song.updateMany({
  where: {
    id,
    deletionPending: false,
    isPublished: {
      not: requestedState
    }
  },
  data: {
    isPublished: requestedState
  }
});

    // 6. Read the authoritative persisted state.
    const song = await prisma.song.findUnique({
      where: { id },
      select: {
        id: true,
        isPublished: true,
        deletionPending: true
      }
    });

    // 7. Distinguish missing songs from deletion conflicts.
    if (!song) {
      return json(
        { error: "Song not found." },
        { status: 404 }
      );
    }

    if (song.deletionPending) {
      return json(
        {
          error:
            "This song is pending deletion and cannot change publication state."
        },
        { status: 409 }
      );
    }

    // 8. Handle concurrent publication changes.
    // A zero update count can also mean the requested state
    // was already present, which is a valid idempotent request.
    if (song.isPublished !== requestedState) {
      return json(
        {
          error:
            "The publication state changed during this request. Refresh and try again."
        },
        { status: 409 }
      );
    }

    // 9. Return the confirmed database state.
    return json({
      song: {
        id: song.id,
        isPublished: song.isPublished
      },
      unchanged: updateResult.count === 0
    });

  } catch (error) {
    console.error("Song publication update failed:", {
      songId: id,
      error
    });

    return json(
      { error: "Unable to update publication status right now." },
      { status: 500 }
    );
  }
}
