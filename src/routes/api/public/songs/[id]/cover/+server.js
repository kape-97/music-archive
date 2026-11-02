import { json } from "@sveltejs/kit";
import { GetObjectCommand } from "@aws-sdk/client-s3";

import { prisma } from "../../../../../../lib/server/prisma.js";
import {
  r2BucketName,
  r2Client
} from "../../../../../../lib/server/r2.js";

/**
 * Return JSON without allowing browser or intermediary caching.
 *
 * @param {object} body
 * @param {number} status
 * @returns {Response}
 */
function noStoreJson(body, status = 200) {
  return json(body, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

/**
 * Validate a positive song ID from the URL.
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
 * Extract an AWS SDK error name.
 *
 * @param {unknown} error
 * @returns {string}
 */
function getErrorName(error) {
  if (typeof error !== "object" || error === null) {
    return "";
  }

  if ("name" in error && typeof error.name === "string") {
    return error.name;
  }

  if ("Code" in error && typeof error.Code === "string") {
    return error.Code;
  }

  return "";
}

/**
 * Stream published song cover artwork from private Cloudflare R2.
 *
 * Route:
 * GET /api/public/songs/:id/cover
 *
 * @param {import("@sveltejs/kit").RequestEvent} event
 * @returns {Promise<Response>}
 */
export async function GET({ params }) {
  const songId = parseSongId(params.id);

  if (songId === null) {
    return noStoreJson(
      { error: "Song not found." },
      404
    );
  }

  // Only currently published songs that are not pending deletion
  // are eligible for public artwork access.
  let song;

  try {
    song = await prisma.song.findFirst({
      where: {
        id: songId,
        isPublished: true,
        deletionPending: false
      },
      select: {
        coverKey: true
      }
    });
  } catch (error) {
    console.error("Public cover song lookup failed:", error);

    return noStoreJson(
      { error: "Unable to retrieve cover artwork." },
      500
    );
  }

  // Use the same response for unpublished and nonexistent songs.
  if (!song || !song.coverKey) {
    return noStoreJson(
      { error: "Song not found." },
      404
    );
  }

  const coverKey = song.coverKey;

  // Accept only the UUID-based cover object keys generated
  // by the existing Admin cover upload implementation.
  const keyMatch = coverKey.match(
    /^covers\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i
  );

  if (!keyMatch) {
    console.error(
      "Song has an invalid public cover storage reference.",
      { songId }
    );

    return noStoreJson(
      { error: "Song not found." },
      404
    );
  }

  const extension = keyMatch[1].toLowerCase();

  const contentType =
  extension === "jpg"
    ? "image/jpeg"
    : extension === "png"
      ? "image/png"
      : "image/webp";

  let coverObject;

  // Retrieve the image from the private R2 bucket.
  try {
    coverObject = await r2Client.send(
      new GetObjectCommand({
        Bucket: r2BucketName,
        Key: coverKey
      })
    );
  } catch (error) {
    const errorName = getErrorName(error);

    if (
      errorName === "NoSuchKey" ||
      errorName === "NotFound" ||
      errorName === "NoSuchObject"
    ) {
      return noStoreJson(
        { error: "Song not found." },
        404
      );
    }

    console.error(
      "Public R2 cover retrieval failed:",
      error
    );

    return noStoreJson(
      { error: "Unable to retrieve cover artwork." },
      502
    );
  }

  if (!coverObject.Body) {
    console.error(
      "R2 returned no public cover image stream.",
      { songId }
    );

    return noStoreJson(
      { error: "Unable to retrieve cover artwork." },
      502
    );
  }

  // Return the image as a stream instead of buffering
  // the complete object into application memory.
  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline"
  });

  if (typeof coverObject.ContentLength === "number") {
    headers.set(
      "Content-Length",
      String(coverObject.ContentLength)
    );
  }

  if (coverObject.ETag) {
    headers.set("ETag", coverObject.ETag);
  }

  return new Response(
    coverObject.Body.transformToWebStream(),
    {
      status: 200,
      headers
    }
  );
}