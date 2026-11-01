import "dotenv/config";

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand
} from "@aws-sdk/client-s3";

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME
} = process.env;

const requiredSettings = {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME
};

for (const [name, value] of Object.entries(requiredSettings)) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is missing from .env.`);
  }
}

const localFile = process.argv[2];

if (!localFile) {
  console.error(
    'Usage: node scripts/test-r2-upload.js "C:\\path\\to\\test.mp3"'
  );
  process.exit(1);
}

const filePath = path.resolve(localFile);
const fileInfo = await stat(filePath);

if (!fileInfo.isFile()) {
  throw new Error("The supplied path is not a file.");
}

if (path.extname(filePath).toLowerCase() !== ".mp3") {
  throw new Error("Please provide an MP3 file.");
}

const MAX_TEST_SIZE = 10 * 1024 * 1024;

if (fileInfo.size === 0 || fileInfo.size > MAX_TEST_SIZE) {
  throw new Error("Choose a non-empty MP3 file no larger than 10 MB.");
}

const objectKey =
  `test-uploads/r2-connection-test-${Date.now()}-${randomUUID()}.mp3`;

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  }
});

function redact(value) {
  let message = String(value ?? "");

  for (const secret of [
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY
  ]) {
    if (typeof secret === "string" && secret.length > 0) {
      message = message.split(secret).join("[REDACTED]");
    }
  }

  return message;
}

try {
  console.log("Uploading test MP3 to Cloudflare R2...");

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey,
      Body: createReadStream(filePath),
      ContentLength: fileInfo.size,
      ContentType: "audio/mpeg",
      Metadata: {
        purpose: "r2-upload-verification"
      }
    })
  );

  console.log("Upload request completed. Checking object metadata...");

  const metadata = await client.send(
    new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey
    })
  );

  const sizeMatches = metadata.ContentLength === fileInfo.size;
  const contentTypeMatches = metadata.ContentType === "audio/mpeg";

  console.log("\n--- R2 UPLOAD VERIFICATION ---");
  console.log(`Bucket: ${R2_BUCKET_NAME}`);
  console.log(`Object key: ${objectKey}`);
  console.log(`Local file size: ${fileInfo.size} bytes`);
  console.log(`R2 object size: ${metadata.ContentLength} bytes`);
  console.log(`Content type: ${metadata.ContentType}`);
  console.log(`Size matches: ${sizeMatches}`);
  console.log(`Content type matches: ${contentTypeMatches}`);

  if (!sizeMatches || !contentTypeMatches) {
    throw new Error("The uploaded object metadata did not match.");
  }

  console.log("\nSUCCESS: The test MP3 was uploaded and verified.");
  console.log("The test object remains in your private bucket.");
} catch (error) {
  console.error("\nR2 upload or verification failed.");
  console.error(`Error type: ${error?.name ?? "UnknownError"}`);

  if (error?.message) {
    console.error(`Error message: ${redact(error.message)}`);
  }

  if (error?.$metadata?.httpStatusCode) {
    console.error(`HTTP status: ${error.$metadata.httpStatusCode}`);
  }

  process.exitCode = 1;
} finally {
  client.destroy();
}