import bcrypt from "bcrypt";
import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { badRequest, conflict, unauthorized } from "../lib/http-error.js";
import { sendMail } from "../lib/mailer.js";
import { prisma } from "../lib/prisma.js";

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_TTL_MINUTES = 45;
// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

const userSelect = {
  id: true,
  email: true,
  role: true,
  playerId: true,
  playerConfirmedAt: true,
  createdAt: true,
  player: { select: { id: true, name: true, indexNo: true, jerseyNumber: true, profilePicUrl: true } },
} as const;

export type PublicUser = Awaited<ReturnType<typeof getUser>>;

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function getUser(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId }, select: userSelect });
}

/** Sign-up is limited to players already on the roster; the claim waits for admin confirmation. */
export async function register(input: { email: string; password: string; indexNo: string }) {
  const player = await prisma.player.findUnique({
    where: { indexNo: input.indexNo },
    select: { id: true, isActive: true, user: { select: { id: true } } },
  });
  if (!player || !player.isActive) {
    throw badRequest("No active roster entry with this index number. Ask your admin to add you first.");
  }
  if (player.user) throw conflict("This index number has already been claimed");

  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw conflict("An account with this email already exists");

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: "PLAYER",
      playerId: player.id,
    },
    select: userSelect,
  });
  return user;
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true, passwordHash: true } });
  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) throw unauthorized("Invalid email or password");
  return getUser(user.id);
}

/** Always resolves the same way, whether or not the email exists. */
export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) return;

  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
    },
  });

  const link = `${env.clientUrl}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: "Reset your Mora Soccer password",
    text: `Someone requested a password reset for your Mora Soccer account.\n\nReset it here (valid for ${RESET_TOKEN_TTL_MINUTES} minutes):\n${link}\n\nIf this wasn't you, ignore this email.`,
    html: `<p>Someone requested a password reset for your Mora Soccer account.</p><p><a href="${link}">Reset your password</a> (valid for ${RESET_TOKEN_TTL_MINUTES} minutes).</p><p>If this wasn't you, ignore this email.</p>`,
  });
}

export async function resetPassword(input: { token: string; password: string }) {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(input.token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw badRequest("This reset link is invalid or has expired");
  }

  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    // Invalidate this and any other outstanding tokens for the user.
    prisma.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
}
