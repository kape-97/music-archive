import "dotenv/config";

import {
  HeadObjectCommand,
  S3Client
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

const objectKey = process.argv[2];

if (!objectKey || !objectKey.startsWith("songs/")) {
  throw new Error("Provide the expected song object key.");
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  }
});

try {
  const result = await client.send(
    new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey
    })
  );

  console.log("R2 OBJECT VERIFICATION SUCCESSFUL");
  console.log(`Bucket: ${R2_BUCKET_NAME}`);
  console.log(`Object key: ${objectKey}`);
  console.log(`Stored size: ${result.ContentLength} bytes`);
  console.log(`Content type: ${result.ContentType}`);
  console.log(`Last modified: ${result.LastModified?.toISOString()}`);
} catch (error) {
  console.error("R2 object verification failed.");
  console.error(`Error type: ${error?.name ?? "UnknownError"}`);

  if (error?.$metadata?.httpStatusCode) {
    console.error(`HTTP status: ${error.$metadata.httpStatusCode}`);
  }

  console.error(
    "Check the object key, bucket configuration, and token permissions."
  );

  process.exitCode = 1;
} finally {
  client.destroy();
}