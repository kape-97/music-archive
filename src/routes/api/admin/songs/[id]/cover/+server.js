import { json } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand
} from "@aws-sdk/client-s3";

import { prisma } from "../../../../../../lib/server/prisma.js";
import {
  r2BucketName,
  r2Client
} from "../../../../../../lib/server/r2.js";

const MAX_COVER_BYTES = 5 * 1024 * 1024;

const COVER_TYPES = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

const COVER_OBJECT_KEY_PATTERN =
  /^covers\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|jpeg|png|webp)$/i;

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
 * Detect supported cover image formats using file signatures.
 *
 * @param {Uint8Array} bytes
 * @returns {{ extension: "jpg" | "png" | "webp", contentType: string } | null}
 */
function detectCoverImageFormat(bytes) {
  // JPEG
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return {
      extension: "jpg",
      contentType: "image/jpeg"
    };
  }

  // PNG
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return {
      extension: "png",
      contentType: "image/png"
    };
  }

  // WebP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return {
      extension: "webp",
      contentType: "image/webp"
    };
  }

  return null;
}

/**
 * Check administrator authentication.
 *
 * @param {import("@sveltejs/kit").RequestEvent["locals"]} locals
 * @returns {boolean}
 */
function isAdministrator(locals) {
  return Boolean(
    locals.admin &&
    locals.admin.role === "ADMIN"
  );
}

/**
 * Attempt to remove an exact cover object from R2.
 *
 * @param {string} coverKey
 * @param {string} operation
 * @returns {Promise<boolean>}
 */
async function cleanupCoverObject(coverKey, operation) {
  try {
    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: r2BucketName,
        Key: coverKey
      })
    );

    return true;
  } catch (error) {
    console.error(
      `Cover artwork cleanup failed during ${operation}:`,
      error
    );

    return false;
  }
}

/**
 * Stream song cover artwork from private Cloudflare R2.
 *
 * Route:
 * GET /api/admin/songs/:id/cover
 *
 * @param {import("@sveltejs/kit").RequestEvent} event
 * @returns {Promise<Response>}
 */
export async function GET({ locals, params }) {
  if (!isAdministrator(locals)) {
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

  let song;

  try {
    song = await prisma.song.findUnique({
      where: { id: songId },
      select: {
        coverKey: true,
        deletionPending: true
      }
    });
  } catch (error) {
    console.error("Cover image song lookup failed:", error);

    return json(
      { error: "Unable to load the requested cover image." },
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
      { error: "This song is pending deletion." },
      { status: 409 }
    );
  }

  if (!song.coverKey) {
    return json(
      { error: "No cover artwork is available for this song." },
      { status: 404 }
    );
  }

  const coverKey = song.coverKey;

  const keyMatch = coverKey.match(
    /^covers\/[0-9a-f-]{36}\.(jpg|png|webp)$/i
  );

  if (!keyMatch) {
    console.error(
      "Song has an invalid cover storage reference.",
      { songId }
    );

    return json(
      { error: "Cover artwork is not available." },
      { status: 404 }
    );
  }

  const extension = keyMatch[1].toLowerCase();

  let contentType;

  switch (extension) {
    case "jpg":
      contentType = COVER_TYPES.jpg;
      break;

    case "png":
      contentType = COVER_TYPES.png;
      break;

    case "webp":
      contentType = COVER_TYPES.webp;
      break;

    default:
      return json(
        { error: "Unsupported cover image format." },
        { status: 404 }
      );
  }

  let coverObject;

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
      return json(
        { error: "Cover image was not found in storage." },
        { status: 404 }
      );
    }

    console.error("R2 cover image retrieval failed:", error);

    return json(
      { error: "Unable to retrieve cover artwork right now." },
      { status: 502 }
    );
  }

  if (!coverObject.Body) {
    console.error(
      "R2 returned no cover image stream.",
      { songId }
    );

    return json(
      { error: "Cover image stream is unavailable." },
      { status: 502 }
    );
  }

  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "private, no-store",
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

/**
 * Add or replace song cover artwork.
 *
 * Route:
 * PUT /api/admin/songs/:id/cover
 *
 * Expected multipart field:
 * coverFile
 *
 * @param {import("@sveltejs/kit").RequestEvent} event
 * @returns {Promise<Response>}
 */
export async function PUT({ locals, params, request }) {
  if (!isAdministrator(locals)) {
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

  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return json(
      { error: "Request must use multipart/form-data." },
      { status: 415 }
    );
  }

  let formData;

  try {
    formData = await request.formData();
  } catch {
    return json(
      { error: "Unable to read the uploaded form data." },
      { status: 400 }
    );
  }

  // Only the coverFile field is accepted.
  if (
    [...formData.keys()].some((key) => key !== "coverFile") ||
    formData.getAll("coverFile").length !== 1
  ) {
    return json(
      { error: "Provide exactly one coverFile field." },
      { status: 400 }
    );
  }

  const coverFileValue = formData.get("coverFile");

  if (
    typeof File === "undefined" ||
    !(coverFileValue instanceof File) ||
    coverFileValue.size === 0
  ) {
    return json(
      { error: "A non-empty cover image is required." },
      { status: 400 }
    );
  }

  const coverFile = coverFileValue;

  if (coverFile.size > MAX_COVER_BYTES) {
    return json(
      { error: "Cover image must not exceed 5 MiB." },
      { status: 413 }
    );
  }

  const fileName = coverFile.name.toLowerCase();
  const declaredType = coverFile.type.trim().toLowerCase();

  const allowedImageTypes = new Set([
    "",
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);

  if (!allowedImageTypes.has(declaredType)) {
    return json(
      { error: "Only JPEG, PNG and WebP cover images are accepted." },
      { status: 400 }
    );
  }

  /** @type {Buffer} */
  let coverBytes;

  /** @type {{ extension: "jpg" | "png" | "webp", contentType: string } | null} */
  let coverFormat;

  try {
    const headerBytes = new Uint8Array(
      await coverFile.slice(0, 12).arrayBuffer()
    );

    coverFormat = detectCoverImageFormat(headerBytes);

    if (!coverFormat) {
      return json(
        { error: "The uploaded cover does not have a supported image signature." },
        { status: 400 }
      );
    }

    const extensionMatches =
      coverFormat.extension === "jpg"
        ? fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")
        : fileName.endsWith(`.${coverFormat.extension}`);

    if (!extensionMatches) {
      return json(
        { error: "Cover image extension does not match its actual format." },
        { status: 400 }
      );
    }

    if (
      declaredType !== "" &&
      declaredType !== coverFormat.contentType
    ) {
      return json(
        { error: "Cover image MIME type does not match its actual format." },
        { status: 400 }
      );
    }

    coverBytes = Buffer.from(await coverFile.arrayBuffer());
  } catch (error) {
    console.error("Cover image reading failed:", error);

    return json(
      { error: "Unable to read the cover image." },
      { status: 400 }
    );
  }

  // Retrieve the existing song and cover reference.
  let existingSong;

  try {
    existingSong = await prisma.song.findUnique({
      where: { id: songId },
      select: {
        id: true,
        coverKey: true,
        deletionPending: true
      }
    });
  } catch (error) {
    console.error("Cover replacement song lookup failed:", error);

    return json(
      { error: "Unable to load the song." },
      { status: 500 }
    );
  }

  if (!existingSong) {
    return json(
      { error: "Song not found." },
      { status: 404 }
    );
  }

  if (existingSong.deletionPending) {
    return json(
      { error: "This song is pending deletion and cannot be edited." },
      { status: 409 }
    );
  }

  // Never replace or delete an unrecognised existing storage reference.
  if (
    existingSong.coverKey !== null &&
    !COVER_OBJECT_KEY_PATTERN.test(existingSong.coverKey)
  ) {
    return json(
      {
        error:
          "The existing cover storage reference is not in the supported format. No changes were made."
      },
      { status: 409 }
    );
  }

  const oldCoverKey = existingSong.coverKey;

  const newCoverKey =
    `covers/${randomUUID()}.${coverFormat.extension}`;

  // Upload the new image before changing the database reference.
  // This ensures the existing cover remains available if upload fails.
  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: r2BucketName,
        Key: newCoverKey,
        Body: coverBytes,
        ContentLength: coverBytes.length,
        ContentType: coverFormat.contentType,
        Metadata: {
          purpose: "music-archive-cover"
        }
      })
    );
  } catch (error) {
    console.error("R2 cover image upload failed:", error);

    const cleaned = await cleanupCoverObject(
      newCoverKey,
      "failed replacement upload"
    );

    return json(
      {
        error: cleaned
          ? "Unable to upload the cover image."
          : "Cover upload failed and storage cleanup could not be confirmed. Check R2 before retrying."
      },
      { status: 502 }
    );
  }

  // Change the database reference only if the song has not started
  // deletion and its cover reference has not changed concurrently.
  let updateResult;

  try {
    updateResult = await prisma.song.updateMany({
      where: {
        id: songId,
        deletionPending: false,
        coverKey: oldCoverKey
      },
      data: {
        coverKey: newCoverKey
      }
    });
  } catch (error) {
    // The database result may be uncertain after a failed request.
    // Keep the newly uploaded object rather than risk deleting an
    // object that the database may already reference.
    console.error(
      "Cover reference update failed. New object requires reconciliation:",
      { songId, newCoverKey, error }
    );

    return json(
      {
        error:
          "The cover was uploaded, but the database update could not be confirmed. Refresh the song before retrying."
      },
      { status: 500 }
    );
  }

  if (updateResult.count !== 1) {
    const cleaned = await cleanupCoverObject(
      newCoverKey,
      "unsuccessful database update"
    );

    return json(
      {
        error: cleaned
          ? "The song changed or became pending deletion. Refresh the library and try again."
          : "The song changed and the new cover could not be cleaned up. Check R2 before retrying."
      },
      { status: 409 }
    );
  }

  // The database now references the new image.
  // Remove the previous object only after the reference is updated.
  let cleanupWarning = false;

  if (oldCoverKey) {
    const cleaned = await cleanupCoverObject(
      oldCoverKey,
      "cover replacement"
    );

    cleanupWarning = !cleaned;
  }

  return json({
    updated: true,
    coverKey: newCoverKey,
    cleanupWarning
  });
}

/**
 * Remove song cover artwork.
 *
 * Route:
 * DELETE /api/admin/songs/:id/cover
 *
 * @param {import("@sveltejs/kit").RequestEvent} event
 * @returns {Promise<Response>}
 */
export async function DELETE({ locals, params }) {
  if (!isAdministrator(locals)) {
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

  // Retrieve the authoritative cover key.
  let song;

  try {
    song = await prisma.song.findUnique({
      where: { id: songId },
      select: {
        id: true,
        coverKey: true,
        deletionPending: true
      }
    });
  } catch (error) {
    console.error("Cover removal song lookup failed:", error);

    return json(
      { error: "Unable to load the song." },
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
      { error: "This song is pending deletion and cannot be edited." },
      { status: 409 }
    );
  }

  // Removing an already absent cover is safe and idempotent.
  if (!song.coverKey) {
    return json({
      removed: true,
      alreadyRemoved: true
    });
  }

  const oldCoverKey = song.coverKey;

  if (!COVER_OBJECT_KEY_PATTERN.test(oldCoverKey)) {
    return json(
      {
        error:
          "The cover storage reference is not in the supported format. No storage object was deleted."
      },
      { status: 409 }
    );
  }

  // Clear the database reference conditionally before deleting the
  // object. This avoids leaving the song pointing to a missing image.
  let updateResult;

  try {
    updateResult = await prisma.song.updateMany({
      where: {
        id: songId,
        deletionPending: false,
        coverKey: oldCoverKey
      },
      data: {
        coverKey: null
      }
    });
  } catch (error) {
    console.error("Cover reference removal failed:", error);

    return json(
      {
        error:
          "Unable to confirm the cover removal. Refresh the library before retrying."
      },
      { status: 500 }
    );
  }

  if (updateResult.count !== 1) {
    return json(
      {
        error:
          "The song changed or became pending deletion. Refresh the library and try again."
      },
      { status: 409 }
    );
  }

  // The database no longer references this image.
  const cleaned = await cleanupCoverObject(
    oldCoverKey,
    "cover removal"
  );

  return json({
    removed: true,
    cleanupWarning: !cleaned
  });
}