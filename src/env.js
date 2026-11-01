import { defineEnvVars } from "@sveltejs/kit/env";

export const variables = defineEnvVars({
  DATABASE_URL: {},

  // Cloudflare R2 configuration
  R2_ACCOUNT_ID: {},
  R2_ACCESS_KEY_ID: {},
  R2_SECRET_ACCESS_KEY: {},
  R2_BUCKET_NAME: {}
});