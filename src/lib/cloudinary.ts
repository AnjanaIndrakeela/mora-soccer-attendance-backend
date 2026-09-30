import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";

const { cloudName, apiKey, apiSecret } = env.cloudinary;
const configured = Boolean(cloudName && apiKey && apiSecret);

if (configured) {
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
}

export async function uploadPlayerImage(file: Express.Multer.File): Promise<string> {
  if (!configured) {
    if (env.isProduction) throw new Error("Cloudinary is not configured");
    // Local dev without Cloudinary: store the image inline so the UI still works.
    return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "team/players",
        resource_type: "image",
        transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
      },
      (error, result) => (error || !result ? reject(error ?? new Error("Upload failed")) : resolve(result.secure_url)),
    );
    stream.end(file.buffer);
  });
}
