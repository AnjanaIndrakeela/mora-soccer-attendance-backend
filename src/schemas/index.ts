import { z } from "zod";

// Multipart forms send everything as strings; empty fields mean "not set".
const emptyToNull = (v: unknown) => (v === "" || v === "null" ? null : v);
const optionalText = z.preprocess(emptyToNull, z.string().trim().max(200).nullish());
const optionalInt = z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(999).nullish());
const optionalDate = z.preprocess(emptyToNull, z.coerce.date().nullish());
const boolString = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean());

const password = z.string().min(8, "Password must be at least 8 characters").max(128);
const email = z.email("Enter a valid email").trim().toLowerCase();

// ---- Auth ----
export const registerSchema = z.object({
  email,
  password,
  indexNo: z.string().trim().min(1, "Index number is required").toUpperCase(),
});
export const loginSchema = z.object({ email, password: z.string().min(1, "Password is required") });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: z.string().min(1), password });

// ---- Players ----
export const playerCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  indexNo: z.string().trim().min(1, "Index number is required").max(40).toUpperCase(),
  jerseyNumber: optionalInt,
  position: optionalText,
  birthday: optionalDate,
  batch: optionalText,
  department: optionalText,
  faculty: optionalText,
  contactNo: optionalText,
  joinedAt: z.preprocess(emptyToNull, z.coerce.date().optional()),
});
export const playerUpdateSchema = playerCreateSchema.partial().extend({
  isActive: boolString.optional(),
  removeProfilePic: boolString.optional(),
});
export const playerListQuery = z.object({
  sort: z.enum(["attendance", "points", "name", "number"]).default("name"),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  includeInactive: boolString.default(false),
  search: z.string().trim().optional(),
});

// ---- Sessions & attendance ----
const sessionType = z.enum(["PRACTICE", "FITNESS", "MATCH_PREP", "OTHER"]);
export const sessionCreateSchema = z.object({
  date: z.iso.date().transform((d) => new Date(`${d}T00:00:00.000Z`)),
  startTime: z.iso.datetime({ offset: true }).transform((d) => new Date(d)),
  endTime: z.iso.datetime({ offset: true }).transform((d) => new Date(d)),
  type: sessionType,
});
export const sessionUpdateSchema = sessionCreateSchema.partial();
export const sessionListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(10),
  status: z.enum(["SCHEDULED", "ACTIVE", "ENDED", "FINALIZED"]).optional(),
});
export const attendPreviewQuery = z.object({ t: z.string().min(1, "This QR code is missing its check-in code") });
export const attendSchema = z.object({ sessionId: z.string().min(1), token: z.string().min(1) });
export const reviewSchema = z.object({ status: z.enum(["APPROVED", "REJECTED", "ABSENT"]) });
export const manualAttendanceSchema = z.object({
  playerId: z.string().min(1),
  status: z.enum(["APPROVED", "REJECTED", "ABSENT"]),
});

// ---- Tournaments & matches ----
export const tournamentCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  venue: optionalText,
  startDate: z.coerce.date(),
  endDate: optionalDate,
  description: z.preprocess(emptyToNull, z.string().trim().max(2000).nullish()),
});
export const tournamentUpdateSchema = tournamentCreateSchema.partial();
export const tournamentListQuery = z.object({ upcoming: boolString.optional() });

const result = z.preprocess(emptyToNull, z.enum(["WIN", "DRAW", "LOSS"]).nullish());
export const matchCreateSchema = z.object({
  opponent: z.string().trim().min(1, "Opponent is required").max(120),
  date: z.coerce.date(),
  result,
  scoreFor: optionalInt,
  scoreAgainst: optionalInt,
  tournamentId: z.preprocess(emptyToNull, z.string().nullish()),
});
export const matchUpdateSchema = matchCreateSchema.partial();
export const matchReportSchema = z
  .object({
    appearances: z
      .array(
        z.object({
          playerId: z.string().min(1),
          yellowCards: z.coerce.number().int().min(0, "Cards can't be negative").max(2, "A player can get at most 2 yellow cards"),
          redCards: z.coerce.number().int().min(0, "Cards can't be negative").max(1, "A player can get at most 1 red card"),
        }),
      )
      .max(60),
    manOfTheMatchId: z.string().min(1).nullable(),
  })
  .refine((v) => new Set(v.appearances.map((a) => a.playerId)).size === v.appearances.length, {
    message: "A player is listed twice",
    path: ["appearances"],
  })
  .refine((v) => !v.manOfTheMatchId || v.appearances.some((a) => a.playerId === v.manOfTheMatchId), {
    message: "The man of the match must be one of the players who played",
    path: ["manOfTheMatchId"],
  });
export const matchListQuery = z.object({ tournamentId: z.string().optional(), friendlies: boolString.default(false) });

// ---- Stats ----
const range = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};
export const trendQuery = z.object({
  groupBy: z.enum(["session", "week"]).default("session"),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  ...range,
});
export const progressQuery = z.object({
  ...range,
  atRiskThreshold: z.coerce.number().min(0).max(100).default(60),
});
