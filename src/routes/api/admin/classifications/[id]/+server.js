
import { json } from "@sveltejs/kit";
import { prisma } from "../../../../../lib/server/prisma.js";

/**
 * Generate a URL-friendly slug from a classification name.
 *
 * @param {string} value
 * @returns {string}
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
 * Validate a classification ID from the route.
 *
 * @param {string | undefined} value
 * @returns {number | null}
 */
function parseClassificationId(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0
    ? id
    : null;
}

/**
 * Update a classification's name.
 *
 * Classification types cannot be changed.
 * Language classifications are fixed and cannot be edited.
 *
 * @param {import("@sveltejs/kit").RequestEvent} event
 */
export async function PATCH({ locals, params, request }) {
  if (!locals.admin || locals.admin.role !== "ADMIN") {
    return json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const id = parseClassificationId(params.id);

  if (id === null) {
    return json(
      { error: "A valid classification ID is required." },
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

  // Only the name may be edited. Type and slug are server-controlled.
  if (Object.keys(body).some((key) => key !== "name")) {
    return json(
      { error: "Only the classification name can be changed." },
      { status: 400 }
    );
  }

  if (typeof body.name !== "string") {
    return json(
      { error: "Classification name must be a string." },
      { status: 400 }
    );
  }

  const name = body.name.trim();

  if (!name || name.length > 191) {
    return json(
      {
        error:
          "Classification name is required and must not exceed 191 characters."
      },
      { status: 400 }
    );
  }

  const slug = createSlug(name);

  if (!slug || slug.length > 191) {
    return json(
      { error: "A valid slug could not be generated from the name." },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.classification.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        name: true,
        slug: true
      }
    });

    if (!existing) {
      return json(
        { error: "Classification not found." },
        { status: 404 }
      );
    }

    if (existing.type === "LANGUAGE") {
      return json(
        {
          error:
            "Language classifications are fixed and cannot be edited."
        },
        { status: 403 }
      );
    }

    const classification = await prisma.classification.update({
      where: { id },
      data: {
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

    return json({ classification });
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
      "Administrator classification update failed:",
      error
    );

    return json(
      { error: "Unable to update classification right now." },
      { status: 500 }
    );
  }
}

/**
 * Delete a classification that is not assigned to any song.
 *
 * Language classifications cannot be deleted.
 *
 * @param {import("@sveltejs/kit").RequestEvent} event
 */
export async function DELETE({ locals, params }) {
  if (!locals.admin || locals.admin.role !== "ADMIN") {
    return json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const id = parseClassificationId(params.id);

  if (id === null) {
    return json(
      { error: "A valid classification ID is required." },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.classification.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        name: true,
        slug: true
      }
    });

    if (!existing) {
      return json(
        { error: "Classification not found." },
        { status: 404 }
      );
    }

    if (existing.type === "LANGUAGE") {
      return json(
        {
          error:
            "Language classifications are fixed and cannot be deleted."
        },
        { status: 403 }
      );
    }

    const usageCount = await prisma.songClassification.count({
      where: {
        classificationId: id
      }
    });

    if (usageCount > 0) {
      return json(
        {
          error:
            "Cannot delete a classification that is assigned to one or more songs."
        },
        { status: 409 }
      );
    }

    await prisma.classification.delete({
      where: { id }
    });

    return json({
      message: "Classification deleted successfully.",
      classification: existing
    });
  } catch (error) {
    console.error(
      "Administrator classification deletion failed:",
      error
    );

    return json(
      { error: "Unable to delete classification right now." },
      { status: 500 }
    );
  }
}
