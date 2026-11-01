
import { json } from "@sveltejs/kit";
import {
  GetObjectCommand,
  HeadObjectCommand
} from "@aws-sdk/client-s3";

import { prisma } from "../../../../../../lib/server/prisma.js";
import {
  r2BucketName,
  r2Client
} from "../../../../../../lib/server/r2.js";

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
 * Extract a useful error name from an AWS SDK error.
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
 * Return HTTP 416 for a valid but unsatisfiable byte range.
 *
 * The object size is retrieved from R2 so the response can
 * include the required Content-Range header.
 *
 * @param {string} fileKey
 * @returns {Promise<Response>}
 */
async function rangeNotSatisfiable(fileKey) {
  try {
    const metadata = await r2Client.send(
      new HeadObjectCommand({
        Bucket: r2BucketName,
        Key: fileKey
      })
    );

    const size = metadata.ContentLength;

    if (
      typeof size !== "number" ||
      !Number.isSafeInteger(size) ||
      size < 0
    ) {
      throw new Error("R2 returned an invalid object size.");
    }

    return new Response(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
        "Content-Range": `bytes */${size}`
      }
    });
  } catch (error) {
    console.error(
      "Unable to inspect the R2 object for an invalid audio range:",
      error
    );

    return json(
      { error: "Unable to validate the requested audio range." },
      { status: 502 }
    );
  }
}

/**
 * Stream an existing song from the private R2 bucket.
 *
 * Route:
 * GET /api/admin/songs/:id/audio
 *
 * Supports single HTTP byte ranges for browser playback
 * and seeking. Does not expose the R2 object key to the client.
 *
 * @param {import("@sveltejs/kit").RequestEvent} event
 * @returns {Promise<Response>}
 */
export async function GET({ locals, params, request }) {
  // Keep audio access restricted to authenticated administrators
  // during this initial playback milestone.
  if (!locals.admin || locals.admin.role !== "ADMIN") {
    return json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const songId = parseSongId(params.id);

  if (songId === null) {
    return json(
      { error: "Invalid song ID." },
      { status: 400 }
    );
  }

  // Get the authoritative R2 object key from MySQL.
  let song;

  try {
    song = await prisma.song.findUnique({
    where: { id: songId },
    select: {
    fileKey: true,
    deletionPending: true
  }
});
  } catch (error) {
    console.error("Audio song lookup failed:", error);

    return json(
      { error: "Unable to load the requested audio." },
      { status: 500 }
    );
  }

  if (!song) {
    return json(
      { error: "Song not found." },
      { status: 404 }
    );
  }

  if (song.deletionPending) {
  return json(
    { error: "This song is pending deletion and cannot be played." },
    { status: 409 }
  );
}

  // The current upload workflow stores MP3 files under songs/.
  // Never accept an object key from a URL parameter or query string.
  const fileKey = song.fileKey;

  if (
    typeof fileKey !== "string" ||
    !fileKey.startsWith("songs/") ||
    !fileKey.toLowerCase().endsWith(".mp3")
  ) {
    console.error(
      "Song has an invalid audio storage reference.",
      { songId }
    );

    return json(
      { error: "Audio file is not available for this song." },
      { status: 404 }
    );
  }

  // Accept a single byte range, including open-ended and suffix ranges.
  // These cover normal browser audio playback and seeking requests.
  const requestedRange = request.headers.get("range");
  const range = requestedRange?.trim() || null;

  if (
    range !== null &&
    !/^bytes=(?:\d+-\d*|-\d+)$/i.test(range)
  ) {
    return json(
      { error: "Only a single valid byte range is supported." },
      { status: 400 }
    );
  }

  // Fetch the audio stream directly from the private R2 bucket.
  let audioObject;

  try {
    audioObject = await r2Client.send(
      new GetObjectCommand({
        Bucket: r2BucketName,
        Key: fileKey,
        ...(range ? { Range: range } : {})
      })
    );
  } catch (error) {
    const errorName = getErrorName(error);

    if (range && errorName === "InvalidRange") {
      return rangeNotSatisfiable(fileKey);
    }

    if (
      errorName === "NoSuchKey" ||
      errorName === "NotFound" ||
      errorName === "NoSuchObject"
    ) {
      return json(
        { error: "Audio file was not found in storage." },
        { status: 404 }
      );
    }

    console.error("R2 audio streaming failed:", error);

    return json(
      { error: "Unable to stream this audio right now." },
      { status: 502 }
    );
  }

  if (!audioObject.Body) {
    console.error(
      "R2 returned no audio stream.",
      { songId }
    );

    return json(
      { error: "The audio stream is unavailable." },
      { status: 502 }
    );
  }

  // Preserve the storage response's streaming metadata.
  const headers = new Headers({
    "Content-Type": audioObject.ContentType || "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff"
  });

  if (typeof audioObject.ContentLength === "number") {
    headers.set(
      "Content-Length",
      String(audioObject.ContentLength)
    );
  }

  if (audioObject.ContentRange) {
    headers.set("Content-Range", audioObject.ContentRange);
  }

  if (audioObject.ETag) {
    headers.set("ETag", audioObject.ETag);
  }

  if (audioObject.LastModified instanceof Date) {
    headers.set(
      "Last-Modified",
      audioObject.LastModified.toUTCString()
    );
  }

  // Convert the AWS SDK stream to a Web ReadableStream.
  // Do not call transformToByteArray() or buffer the complete MP3.
  const responseBody = audioObject.Body.transformToWebStream();

  return new Response(responseBody, {
    status: audioObject.ContentRange ? 206 : 200,
    headers
  });
}
