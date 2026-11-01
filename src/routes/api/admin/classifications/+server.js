import { json } from "@sveltejs/kit";
import { prisma } from "../../../../lib/server/prisma.js";

const MANAGEABLE_TYPES = new Set([
  "GENRE",
  "MOOD",
  "CATEGORY"
]);

/**
 * Generate a URL-friendly slug from a classification name.
 * Supports letters and numbers from different writing systems.
 *
 * @param {string} value
 */
function createSlug(value) {
  return value
    .normalize("NFC")
    .toLocaleLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Return classifications for an authenticated administrator.
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
    const classifications = await prisma.classification.findMany({
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
    });

    return json({ classifications });
  } catch (error) {
    console.error(
      "Administrator classification list failed:",
      error
    );

    return json(
      { error: "Unable to load classifications right now." },
      { status: 500 }
    );
  }
}

/**
 * Create a classification option.
 * Languages are intentionally not managed through this endpoint.
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

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      { error: "Request body must contain valid JSON." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json(
      { error: "Request body must be a JSON object." },
      { status: 400 }
    );
  }

  const type =
    typeof body.type === "string"
      ? body.type.trim().toUpperCase()
      : "";

  const name =
    typeof body.name === "string"
      ? body.name.trim()
      : "";

  if (!MANAGEABLE_TYPES.has(type)) {
    return json(
      {
        error:
          "Type must be GENRE, MOOD, or CATEGORY. Languages are fixed."
      },
      { status: 400 }
    );
  }

  if (!name || name.length > 191) {
    return json(
      {
        error:
          "Name is required and must not exceed 191 characters."
      },
      { status: 400 }
    );
  }

  const slug = createSlug(name);

  if (!slug || slug.length > 191) {
    return json(
      {
        error:
          "A valid slug could not be generated from the classification name."
      },
      { status: 400 }
    );
  }

  try {
    const classification = await prisma.classification.create({
      data: {
        type,
        name,
        slug
      },
      select: {
        id: true,
        type: true,
        name: true,
        slug: true
      }
    });

    return json(
      { classification },
      { status: 201 }
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return json(
        {
          error:
            "A classification with this name or slug already exists for this type."
        },
        { status: 409 }
      );
    }

    console.error(
      "Administrator classification creation failed:",
      error
    );

    return json(
      { error: "Unable to create classification right now." },
      { status: 500 }
    );
  }
}