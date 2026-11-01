import "dotenv/config";

import {
  ListObjectsV2Command,
  S3Client
} from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;

const requiredSettings = {
  R2_ACCOUNT_ID: accountId,
  R2_ACCESS_KEY_ID: accessKeyId,
  R2_SECRET_ACCESS_KEY: secretAccessKey,
  R2_BUCKET_NAME: bucketName
};

for (const [name, value] of Object.entries(requiredSettings)) {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.startsWith("YOUR_")
  ) {
    console.error(`${name} is missing or still contains a placeholder.`);
    process.exitCode = 1;
    process.exit();
  }
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
});

try {
  const result = await client.send(
    new ListObjectsV2Command({
      Bucket: bucketName,
      MaxKeys: 1
    })
  );

  console.log("R2 authentication successful.");
  console.log(`Bucket: ${bucketName}`);
  console.log(`Objects returned: ${result.KeyCount ?? 0}`);
} catch (error) {
  console.error("R2 connection test failed.");
  console.error(`Error type: ${error?.name ?? "UnknownError"}`);

  // Redact credential values before printing diagnostic messages.
  function redact(value) {
    let message = String(value ?? "");

    for (const secret of [
      secretAccessKey,
      accessKeyId,
      accountId
    ]) {
      if (typeof secret === "string" && secret.length > 0) {
        message = message.split(secret).join("[REDACTED]");
      }
    }

    return message;
  }

  if (error?.message) {
    console.error(`Error message: ${redact(error.message)}`);
  }

  if (error?.code) {
    console.error(`Error code: ${redact(error.code)}`);
  }

  if (error?.cause?.message) {
    console.error(
      `Underlying cause: ${redact(error.cause.message)}`
    );
  }

  if (error?.$metadata?.httpStatusCode) {
    console.error(`HTTP status: ${error.$metadata.httpStatusCode}`);
  }

  console.error("Diagnostic complete. No credentials displayed.");
  process.exitCode = 1;
} finally {
  client.destroy();
}