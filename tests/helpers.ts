import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { signQrToken } from "../src/lib/qr-token.js";
import { hashPassword } from "../src/services/auth.service.js";

const MINUTE = 60 * 1000;
const PASSWORD = "password123";

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "AttendanceRecord", "Session", "PasswordResetToken", "User", "Player", "Match", "Tournament" CASCADE`,
  );
}

/** Returns a supertest agent that keeps the auth cookie. */
export async function loginAs(email: string) {
  const agent = request.agent(app);
  const res = await agent.post("/auth/login").send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export async function createAdmin(email = "admin@test.lk") {
  await prisma.user.create({ data: { email, role: "ADMIN", passwordHash: await hashPassword(PASSWORD) } });
  return loginAs(email);
}

export async function createPlayer(overrides: { name?: string; joinedAt?: Date; isActive?: boolean } = {}) {
  const n = Math.floor(Math.random() * 1e8);
  return prisma.player.create({
    data: { name: overrides.name ?? `Player ${n}`, indexNo: `IDX${n}`, joinedAt: overrides.joinedAt ?? new Date(Date.now() - 30 * 24 * 60 * MINUTE), isActive: overrides.isActive ?? true },
  });
}

/** A player with a confirmed login, returned with a logged-in agent. */
export async function createPlayerUser(opts: { confirmed?: boolean } = {}) {
  const player = await createPlayer();
  const email = `${player.indexNo.toLowerCase()}@test.lk`;
  await prisma.user.create({
    data: {
      email,
      role: "PLAYER",
      passwordHash: await hashPassword(PASSWORD),
      playerId: player.id,
      playerConfirmedAt: opts.confirmed === false ? null : new Date(),
    },
  });
  return { player, agent: await loginAs(email) };
}

/** Creates a session starting `startsInMinutes` from now (negative = already started). */
export async function createSession(startsInMinutes: number, durationMinutes = 90) {
  const startTime = new Date(Date.now() + startsInMinutes * MINUTE);
  const endTime = new Date(startTime.getTime() + durationMinutes * MINUTE);
  const session = await prisma.session.create({
    data: { date: new Date(startTime.toISOString().slice(0, 10)), startTime, endTime, type: "PRACTICE" },
  });
  const qrToken = signQrToken(session.id, endTime);
  return prisma.session.update({ where: { id: session.id }, data: { qrToken } });
}

export { prisma };
