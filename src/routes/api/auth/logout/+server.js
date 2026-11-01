
import { json } from "@sveltejs/kit";
import { revokeAdminSession } from "../../../../lib/server/auth.js";

const COOKIE_NAME = "music_archive_session";

export async function POST({ cookies }) {
  const token = cookies.get(COOKIE_NAME);

  try {
    await revokeAdminSession(token);

    cookies.delete(COOKIE_NAME, {
      path: "/"
    });

    return json({ message: "Logout successful." });
  } catch (error) {
    console.error("Administrator logout failed:", error);

    return json(
      { error: "Unable to complete logout right now." },
      { status: 500 }
    );
  }
}
