
import { json } from "@sveltejs/kit";
import {
  createAdminSession,
  verifyAdminCredentials
} from "../../../../lib/server/auth.js";

const COOKIE_NAME = "music_archive_session";

export async function POST({ request, cookies }) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, { status: 400 });
  }

  const { email, password } = body ?? {};

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    return json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  try {
    const admin = await verifyAdminCredentials(email, password);

    if (!admin) {
      return json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const { token, expiresAt } = await createAdminSession(admin.id);

    cookies.set(COOKIE_NAME, token, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      expires: expiresAt
    });

    return json({
      message: "Login successful.",
      user: {
        id: admin.id,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error("Administrator login failed:", error);
    return json(
      { error: "Unable to complete login right now." },
      { status: 500 }
    );
  }
}
