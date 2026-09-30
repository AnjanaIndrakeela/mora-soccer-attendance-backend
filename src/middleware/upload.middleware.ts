import multer from "multer";
import { badRequest } from "../lib/http-error.js";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const uploadProfilePic = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(badRequest("Profile picture must be a JPEG, PNG or WebP image"));
  },
}).single("profilePic");
