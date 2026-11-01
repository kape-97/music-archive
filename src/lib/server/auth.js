

import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { prisma } from "./prisma.js";

/**
 * Generate a cryptographically random session token.
 * The raw token is intended for the browser cookie.
 *
 * @returns {{ token: string, tokenHash: string }}
 */
export function createSessionToken() {
  const token = randomBytes(32).toString("base64url");

  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  return { token, tokenHash };
}

/**
 * Hash a session token before looking it up in the database.
 *
 * @param {string} token
 * @returns {string}
 */
export function hashSessionToken(token) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}


/**
 * Find an administrator by email and verify the supplied password.
 *
 * Returns the user ID and role on success, or null on failure.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ id: number, email: string, role: string } | null>}
 */
export async function verifyAdminCredentials(email, password) {
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      role: true
    }
  });

  if (!user || user.role !== "ADMIN") {
    return null;
  }

  let passwordMatches = false;

  try {
    passwordMatches = await argon2.verify(
      user.passwordHash,
      password
    );
  } catch {
    return null;
  }

  if (!passwordMatches) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role
  };
}


/**
 * Create a database-backed administrator session.
 *
 * @param {number} userId
 * @returns {Promise<{ token: string, expiresAt: Date }>}
 */
export async function createAdminSession(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("A valid administrator ID is required.");
  }

  const { token, tokenHash } = createSessionToken();

  // Eight-hour session lifetime.
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt
    }
  });

  return { token, expiresAt };
}

/**
 * Validate a session token and return its administrator.
 *
 * @param {string | undefined} token
 * @returns {Promise<{ id: number, email: string, role: string } | null>}
 */
export async function validateAdminSession(token) {
  if (typeof token !== "string" || !token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          role: true
        }
      }
    }
  });

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.session.deleteMany({
        where: { tokenHash }
      });
    }

    return null;
  }

  if (session.user.role !== "ADMIN") {
    return null;
  }

  return session.user;
}


/**
 * Revoke a session using its raw token.
 *
 * @param {string | undefined} token
 * @returns {Promise<void>}
 */
export async function revokeAdminSession(token) {
  if (typeof token !== "string" || !token) {
    return;
  }

  const tokenHash = hashSessionToken(token);

  await prisma.session.deleteMany({
    where: { tokenHash }
  });
}
