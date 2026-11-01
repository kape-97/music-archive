import { json } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  PutObjectCommand
} from "@aws-sdk/client-s3";

import { prisma } from "../../../../lib/server/prisma.js";
import {
  r2BucketName,
  r2Client
} from "../../../../lib/server/r2.js";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_LENGTH = 191;

/**
 * Validate a positive integer ID from form data.
 *
 * @param {FormData} formData
 * @param {string} name
 * @returns {number | null}
 */
function readPositiveId(formData, name) {
  const value = formData.get(name);

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id) ? id : null;
}

/**
 * Read repeated classification IDs.
 *
 * @param {FormData} formData
 * @param {string} name
 * @returns {number[] | null}
 */
function readIdList(formData, name) {
  const values = formData.getAll(name);
  const ids = [];

  for (const value of values) {
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
      return null;
    }

    const id = Number(value);

    if (!Number.isSafeInteger(id)) {
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
 * Read and normalize an optional text field.
 *
 * @param {FormData} formData
 * @param {string} name
 * @returns {string | null}
 */
function readOptionalText(formData, name) {
  const value = formData.get(name);

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized || null;
}

/**
 * Check the beginning of a file for an ID3 tag or MP3 frame sync.
 *
 * This is a basic format check, not a complete audio-file decoder.
 *
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
function looksLikeMp3(bytes) {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33
  ) {
    return true;
  }

  for (let i = 0; i < bytes.length - 1; i += 1) {
    if (
      bytes[i] === 0xff &&
      (bytes[i + 1] & 0xe0) === 0xe0 &&
      (bytes[i + 1] & 0x06) !== 0
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Detect supported cover image formats using file signatures.
 *
 * This checks the file signature, not whether every image structure
 * can be fully decoded by an image-processing library.
 *
 * @param {Uint8Array} bytes
 * @returns {{ extension: string, contentType: string } | null}
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
 * Return the music library for an authenticated administrator.
 *
 * @param {import("@sveltejs/kit").RequestEvent} event
 */
export async function GET({ locals }) {
  if (!locals.admin || locals.admin.role !== "ADMIN") {
    return json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  try {
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

    return json({ songs });
  } catch (error) {
    console.error("Administrator song list failed:", error);

    return json(
      { error: "Unable to load songs right now." },
      { status: 500 }
    );
  }
}

/**
 * Create a song and upload its MP3 to the private R2 bucket.
 *
 * Expected multipart fields:
 * title, artist, album, year, durationSeconds, languageId,
 * genreId, moodIds (repeated), categoryIds (repeated), audioFile,
 * and optional coverFile.
 *
 * @param {import("@sveltejs/kit").RequestEvent} event
 */
export async function POST({ locals, request }) {
  if (!locals.admin || locals.admin.role !== "ADMIN") {
    return json(
      { error: "Authentication required." },
      { status: 401 }
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

  // Required metadata.
  const title = readOptionalText(formData, "title");
  const artist = readOptionalText(formData, "artist");
  const album = readOptionalText(formData, "album");

  if (
    !title ||
    !artist ||
    title.length > MAX_TEXT_LENGTH ||
    artist.length > MAX_TEXT_LENGTH ||
    (album !== null && album.length > MAX_TEXT_LENGTH)
  ) {
    return json(
      {
        error:
          "Title and artist are required and must not exceed 191 characters. Album must not exceed 191 characters."
      },
      { status: 400 }
    );
  }

  // Optional release year.
  const rawYear = formData.get("year");
  let year = null;

  if (rawYear !== null && rawYear !== "") {
    if (
      typeof rawYear !== "string" ||
      !/^\d{4}$/.test(rawYear)
    ) {
      return json(
        { error: "Year must be a valid four-digit year." },
        { status: 400 }
      );
    }

    year = Number(rawYear);
  }

  // Duration is optional. Audio-duration extraction can be added later.
  const rawDuration = formData.get("durationSeconds");
  let durationSeconds = null;

  if (rawDuration !== null && rawDuration !== "") {
    if (
      typeof rawDuration !== "string" ||
      !/^\d+$/.test(rawDuration)
    ) {
      return json(
        { error: "Duration must be a non-negative integer." },
        { status: 400 }
      );
    }

    durationSeconds = Number(rawDuration);

    if (!Number.isSafeInteger(durationSeconds)) {
      return json(
        { error: "Duration is outside the supported range." },
        { status: 400 }
      );
    }
  }

  // Enforce one primary language and one primary genre.
  const languageId = readPositiveId(formData, "languageId");
  const genreId = readPositiveId(formData, "genreId");

  if (languageId === null || genreId === null) {
    return json(
      { error: "Select exactly one valid language and genre." },
      { status: 400 }
    );
  }

  const moodIds = readIdList(formData, "moodIds");
  const categoryIds = readIdList(formData, "categoryIds");

  if (moodIds === null || categoryIds === null) {
    return json(
      {
        error:
          "Mood and category IDs must be valid, unique positive integers."
      },
      { status: 400 }
    );
  }

  // Required MP3 file.
  const audioFile = formData.get("audioFile");

  if (
    typeof File === "undefined" ||
    !(audioFile instanceof File) ||
    audioFile.size === 0
  ) {
    return json(
      { error: "A non-empty MP3 file is required." },
      { status: 400 }
    );
  }

  if (audioFile.size > MAX_AUDIO_BYTES) {
    return json(
      { error: "The MP3 file must not exceed 25 MiB." },
      { status: 413 }
    );
  }

  if (!audioFile.name.toLowerCase().endsWith(".mp3")) {
    return json(
      { error: "Only MP3 files are accepted." },
      { status: 400 }
    );
  }

  const allowedContentTypes = new Set([
    "",
    "audio/mpeg",
    "audio/mp3",
    "application/octet-stream"
  ]);

  if (
    !allowedContentTypes.has(
      audioFile.type.trim().toLowerCase()
    )
  ) {
    return json(
      { error: "The uploaded file must be an MP3." },
      { status: 400 }
    );
  }

  // Optional cover artwork.
  /** @type {File | null} */
  let coverFile = null;

  const coverFileValue = formData.get("coverFile");

  if (coverFileValue !== null) {
    if (
      typeof File === "undefined" ||
      !(coverFileValue instanceof File)
    ) {
      return json(
        { error: "Invalid cover image upload." },
        { status: 400 }
      );
    }

    // An unselected file input produces an empty File with no filename.
    if (coverFileValue.size === 0) {
      if (coverFileValue.name !== "") {
        return json(
          { error: "The selected cover image is empty." },
          { status: 400 }
        );
      }
    } else {
      coverFile = coverFileValue;
    }
  }

  /** @type {Buffer | null} */
  let coverBytes = null;

  /** @type {{ extension: string, contentType: string } | null} */
  let coverFormat = null;

  if (coverFile) {
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
  }

  // Verify the selected IDs and their classification types in MySQL.
  const classificationIds = [
    languageId,
    genreId,
    ...moodIds,
    ...categoryIds
  ];

  const uniqueClassificationIds = [...new Set(classificationIds)];

  let classifications;

  try {
    classifications = await prisma.classification.findMany({
      where: {
        id: { in: uniqueClassificationIds }
      },
      select: {
        id: true,
        type: true
      }
    });
  } catch (error) {
    console.error("Song classification validation failed:", error);

    return json(
      { error: "Unable to validate classifications right now." },
      { status: 500 }
    );
  }

  if (classifications.length !== uniqueClassificationIds.length) {
    return json(
      { error: "One or more classifications do not exist." },
      { status: 400 }
    );
  }

  const typeById = new Map(
    classifications.map((item) => [item.id, item.type])
  );

  if (typeById.get(languageId) !== "LANGUAGE") {
    return json(
      { error: "The selected language is invalid." },
      { status: 400 }
    );
  }

  if (typeById.get(genreId) !== "GENRE") {
    return json(
      { error: "The selected genre is invalid." },
      { status: 400 }
    );
  }

  if (moodIds.some((id) => typeById.get(id) !== "MOOD")) {
    return json(
      { error: "Every selected mood must be a MOOD classification." },
      { status: 400 }
    );
  }

  if (
    categoryIds.some((id) => typeById.get(id) !== "CATEGORY")
  ) {
    return json(
      {
        error:
          "Every selected category must be a CATEGORY classification."
      },
      { status: 400 }
    );
  }

  // Read the MP3 after checking its size and basic format.
  let audioBytes;

  try {
    const headerBytes = new Uint8Array(
      await audioFile.slice(0, 4096).arrayBuffer()
    );

    if (!looksLikeMp3(headerBytes)) {
      return json(
        { error: "The uploaded file does not appear to be a valid MP3." },
        { status: 400 }
      );
    }

    audioBytes = Buffer.from(await audioFile.arrayBuffer());
  } catch {
    return json(
      { error: "Unable to read the MP3 file." },
      { status: 400 }
    );
  }

  const fileKey = `songs/${randomUUID()}.mp3`;

  const coverKey =
    coverFile && coverFormat
      ? `covers/${randomUUID()}.${coverFormat.extension}`
      : null;

  let uploadedToR2 = false;
  let coverUploadAttempted = false;

  try {
    // Upload the audio before creating a song that references it.
    await r2Client.send(
      new PutObjectCommand({
        Bucket: r2BucketName,
        Key: fileKey,
        Body: audioBytes,
        ContentLength: audioBytes.length,
        ContentType: "audio/mpeg",
        Metadata: {
          purpose: "music-archive-audio"
        }
      })
    );

    uploadedToR2 = true;

    // Upload optional cover artwork before creating the database record.
    if (coverKey && coverBytes && coverFormat) {
      // Attempt cleanup even if R2 returns an ambiguous upload failure.
      coverUploadAttempted = true;

      await r2Client.send(
        new PutObjectCommand({
          Bucket: r2BucketName,
          Key: coverKey,
          Body: coverBytes,
          ContentLength: coverBytes.length,
          ContentType: coverFormat.contentType,
          Metadata: {
            purpose: "music-archive-cover"
          }
        })
      );
    }

    const song = await prisma.song.create({
      data: {
        title,
        artist,
        album,
        year,
        durationSeconds,
        fileKey,
        coverKey,
        classifications: {
          create: classificationIds.map((classificationId) => ({
            classification: {
              connect: { id: classificationId }
            }
          }))
        }
      },
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

    return json({ song }, { status: 201 });
  } catch (error) {
    console.error("Administrator song creation failed:", error);

    // Compensate for an unsuccessful database insertion.
    if (uploadedToR2) {
      try {
        await r2Client.send(
          new DeleteObjectCommand({
            Bucket: r2BucketName,
            Key: fileKey
          })
        );
      } catch (cleanupError) {
        console.error(
          "Failed to clean up an unreferenced R2 audio object:",
          cleanupError
        );
      }
    }

    // Clean up the cover object independently if its upload was attempted.
    if (coverUploadAttempted && coverKey) {
      try {
        await r2Client.send(
          new DeleteObjectCommand({
            Bucket: r2BucketName,
            Key: coverKey
          })
        );
      } catch (cleanupError) {
        console.error(
          "Failed to clean up an unreferenced R2 cover object:",
          cleanupError
        );
      }
    }

    return json(
      { error: "Unable to create the song right now." },
      { status: 500 }
    );
  }
}