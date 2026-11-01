import {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME
} from "$app/env/private";

import { S3Client } from "@aws-sdk/client-s3";

// This validates the required R2 configuration without exposing its values.
const requiredSettings = [
  ["R2_ACCOUNT_ID", R2_ACCOUNT_ID],
  ["R2_ACCESS_KEY_ID", R2_ACCESS_KEY_ID],
  ["R2_SECRET_ACCESS_KEY", R2_SECRET_ACCESS_KEY],
  ["R2_BUCKET_NAME", R2_BUCKET_NAME]
];

for (const [name, value] of requiredSettings) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is not configured.`);
  }
}

/**
 * This is the configured private R2 bucket for music audio objects.
 */
export const r2BucketName = R2_BUCKET_NAME;

/**
 * Server-side S3-compatible client for Cloudflare R2.
 */
export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  }
});