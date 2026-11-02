
import { json } from "@sveltejs/kit";
import { prisma } from "../../../../lib/server/prisma.js";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 100;
const MAX_FILTER_LENGTH = 191;

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
 * Parse a bounded positive integer query parameter.
 *
 * @param {string | null} value
 * @param {number} defaultValue
 * @param {number} maximum
 * @returns {number | null}
 */
function parsePositiveInteger(value, defaultValue, maximum) {
  if (value === null) {
    return defaultValue;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed > maximum
  ) {
    return null;
  }

  return parsed;
}

/**
 * @typedef {{
 *   name: string,
 *   slug: string
 * }} PublicClassificationOption
 */

/**
 * @typedef {{
 *   languages: PublicClassificationOption[],
 *   genres: PublicClassificationOption[],
 *   moods: PublicClassificationOption[],
 *   categories: PublicClassificationOption[]
 * }} PublicClassificationOptions
 */
/**
 * Get available public classification options.
 *
 * Only classifications attached to eligible published songs
 * are returned.
 *
 * @returns {Promise<PublicClassificationOptions>}
 */
async function getPublicClassificationOptions() {
  const classifications = await prisma.classification.findMany({
    where: {
      songs: {
        some: {
          song: {
            is: {
              isPublished: true,
              deletionPending: false
            }
          }
        }
      }
    },
    orderBy: [
      { name: "asc" }
    ],
    select: {
      type: true,
      name: true,
      slug: true
    }
  });

  /** @type {PublicClassificationOptions} */
  const options = {
    languages: [],
    genres: [],
    moods: [],
    categories: []
  };

  // Keep your existing for loop and switch statement unchanged.

  for (const classification of classifications) {
    const option = {
      name: classification.name,
      slug: classification.slug
    };

    switch (classification.type) {
      case "LANGUAGE":
        options.languages.push(option);
        break;

      case "GENRE":
        options.genres.push(option);
        break;

      case "MOOD":
        options.moods.push(option);
        break;

      case "CATEGORY":
        options.categories.push(option);
        break;
    }
  }

  return options;
}

/**
 * GET /api/public/songs
 *
 * Returns only published songs that are not pending deletion.
 *
 * Supports pagination, text search and classification filters.
 *
 * @param {import("@sveltejs/kit").RequestEvent} event
 * @returns {Promise<Response>}
 */
export async function GET({ url }) {
  // -------------------------------------------------------
  // 1. Read and validate pagination parameters
  // -------------------------------------------------------

  const page = parsePositiveInteger(
    url.searchParams.get("page"),
    1,
    1_000_000
  );

  const limit = parsePositiveInteger(
    url.searchParams.get("limit"),
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  );

  if (page === null || limit === null) {
    return noStoreJson(
      { error: "Invalid pagination parameters." },
      { status: 400 }
    );
  }

  const skip = (page - 1) * limit;

  if (!Number.isSafeInteger(skip)) {
    return noStoreJson(
      { error: "Requested page is outside the supported range." },
      { status: 400 }
    );
  }

  // -------------------------------------------------------
  // 2. Read search and classification filters
  // -------------------------------------------------------

  const searchTerm = (
    url.searchParams.get("q") ?? ""
  ).trim();

  const language = (
    url.searchParams.get("language") ?? ""
  ).trim();

  const genre = (
    url.searchParams.get("genre") ?? ""
  ).trim();

  const mood = (
    url.searchParams.get("mood") ?? ""
  ).trim();

  const category = (
    url.searchParams.get("category") ?? ""
  ).trim();

  if (
    searchTerm.length > MAX_SEARCH_LENGTH ||
    language.length > MAX_FILTER_LENGTH ||
    genre.length > MAX_FILTER_LENGTH ||
    mood.length > MAX_FILTER_LENGTH ||
    category.length > MAX_FILTER_LENGTH
  ) {
    return noStoreJson(
      { error: "One or more search filters exceed the allowed length." },
      { status: 400 }
    );
  }

  // -------------------------------------------------------
  // 3. Establish mandatory public eligibility
  // -------------------------------------------------------

  const additionalFilters = [];

  if (searchTerm) {
    additionalFilters.push({
      OR: [
        { title: { contains: searchTerm } },
        { artist: { contains: searchTerm } },
        { album: { contains: searchTerm } }
      ]
    });
  }

  // Apply each classification filter independently.
  // A song must satisfy every supplied classification filter.

  const classificationFilters = [
    { type: "LANGUAGE", slug: language },
    { type: "GENRE", slug: genre },
    { type: "MOOD", slug: mood },
    { type: "CATEGORY", slug: category }
  ];

  for (const filter of classificationFilters) {
    if (!filter.slug) {
      continue;
    }

    additionalFilters.push({
      classifications: {
        some: {
          classification: {
            is: {
              type: filter.type,
              slug: filter.slug
            }
          }
        }
      }
    });
  }

  const where = {
    isPublished: true,
    deletionPending: false,
    ...(additionalFilters.length > 0
      ? { AND: additionalFilters }
      : {})
  };

  // -------------------------------------------------------
  // 4. Retrieve eligible songs and public filter options
  // -------------------------------------------------------

  try {
    const [
      songs,
      totalSongs,
      filters
    ] = await Promise.all([
      prisma.song.findMany({
        where,
        orderBy: [
          { displayOrder: "asc" },
          { createdAt: "desc" }
        ],
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          artist: true,
          album: true,
          year: true,
          durationSeconds: true,

          // Used internally only.
          // Never include coverKey in the response.
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
      }),

      prisma.song.count({
        where
      }),

      getPublicClassificationOptions()
    ]);

    // -------------------------------------------------------
    // 5. Construct safe public song objects
    // -------------------------------------------------------

    const publicSongs = songs.map((song) => {
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

      return {
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
      };
    });

    // -------------------------------------------------------
    // 6. Return the public catalogue response
    // -------------------------------------------------------

    return noStoreJson({
      songs: publicSongs,

      filters,

      pagination: {
        page,
        limit,
        totalSongs,
        totalPages: Math.ceil(totalSongs / limit)
      }
    });

  } catch (error) {
    console.error(
      "Public song listing failed:",
      error
    );

    return noStoreJson(
      { error: "Unable to load published songs right now." },
      { status: 500 }
    );
  }
}
