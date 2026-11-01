import { validateAdminSession } from "./lib/server/auth.js";

const COOKIE_NAME = "music_archive_session";

/** @type {import('@sveltejs/kit/hooks').Handle} */
export async function handle({ event, resolve }) {
  const token = event.cookies.get(COOKIE_NAME);

  try {
    event.locals.admin = await validateAdminSession(token);
  } catch (error) {
    console.error("Administrator session validation failed:", error);
    event.locals.admin = null;
  }

  return resolve(event);
}