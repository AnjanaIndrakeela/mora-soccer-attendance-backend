/**
 * Development seed: wipes all data, then creates an admin, a roster, ~8 weeks of finalized sessions,
 * a session happening right now (for QR testing), tournaments and matches.
 *
 * Run with `npm run db:seed`. Refuses to run when NODE_ENV=production.
 */
import { env } from "../src/config/env.js";
import type { AttendanceStatus, SessionType } from "../src/generated/prisma/client.js";
import { signQrToken } from "../src/lib/qr-token.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/services/auth.service.js";

if (env.isProduction) {
  console.error("Refusing to seed a production database.");
  process.exit(1);
}

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@morasoccer.lk";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin12345";
const PLAYER_PASSWORD = "player12345";

// Deterministic PRNG so every seed produces the same data.
let state = 42;
const random = () => ((state = (state * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** Team timezone is Sri Lanka (UTC+05:30); build UTC instants from local wall-clock times. */
function colombo(dayOffset: number, hour: number, minute = 0) {
  const now = new Date();
  const local = new Date(now.getTime() + 5.5 * HOUR);
  const utcMidnightOfLocalDay = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset);
  return new Date(utcMidnightOfLocalDay + (hour * 60 + minute) * 60 * 1000 - 5.5 * HOUR);
}
function localDate(instant: Date) {
  const local = new Date(instant.getTime() + 5.5 * HOUR);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

const PLAYERS = [
  ["Kasun Perera", "Goalkeeper"], ["Nuwan Fernando", "Defender"], ["Tharindu Silva", "Defender"],
  ["Dilshan Jayasuriya", "Defender"], ["Chamika Bandara", "Defender"], ["Isuru Wijesinghe", "Midfielder"],
  ["Sahan Dissanayake", "Midfielder"], ["Ravindu Herath", "Midfielder"], ["Pasindu Gunawardena", "Midfielder"],
  ["Akila Rathnayake", "Midfielder"], ["Hasitha Karunaratne", "Forward"], ["Janith Mendis", "Forward"],
  ["Lahiru Samarakoon", "Forward"], ["Minura Weerasinghe", "Forward"], ["Sachin Abeysekara", "Goalkeeper"],
  ["Yasiru Ekanayake", "Defender"], ["Kavindu Senanayake", "Midfielder"], ["Oshada Liyanage", "Forward"],
  ["Dinuka Premaratne", "Defender"], ["Supun Kodithuwakku", "Midfielder"],
] as const;
const BATCHES = ["21", "22", "23", "24"] as const;
const FACULTIES = [
  ["Faculty of Engineering", ["Computer Science & Engineering", "Electrical Engineering", "Mechanical Engineering", "Civil Engineering"]],
  ["Faculty of Information Technology", ["Information Technology", "Interdisciplinary Studies"]],
  ["Faculty of Architecture", ["Architecture", "Town & Country Planning"]],
] as const;
const SESSION_TYPES: SessionType[] = ["PRACTICE", "PRACTICE", "FITNESS", "PRACTICE", "MATCH_PREP"];

async function main() {
  console.log("Clearing existing data…");
  await prisma.$transaction([
    prisma.attendanceRecord.deleteMany(),
    prisma.session.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.user.deleteMany(),
    prisma.player.deleteMany(),
    prisma.match.deleteMany(),
    prisma.tournament.deleteMany(),
  ]);

  const admin = await prisma.user.create({
    data: { email: ADMIN_EMAIL, passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN" },
  });

  // ---- Players: most joined 10 weeks ago, a few joined recently ----
  const players = [];
  for (const [i, [name, position]] of PLAYERS.entries()) {
    const [faculty, departments] = pick(FACULTIES);
    const batch = pick(BATCHES);
    players.push(
      await prisma.player.create({
        data: {
          name,
          position,
          indexNo: `${batch}${String(1000 + i * 37).padStart(4, "0")}${"ABCDEFGHJK"[i % 10]}`,
          jerseyNumber: i + 1,
          batch,
          faculty,
          department: pick(departments),
          birthday: new Date(Date.UTC(1999 + Math.floor(random() * 6), Math.floor(random() * 12), 1 + Math.floor(random() * 28))),
          contactNo: `07${Math.floor(10000000 + random() * 89999999)}`,
          joinedAt: i >= 17 ? colombo(-20 + i - 17, 8) : colombo(-70, 8),
        },
      }),
    );
  }

  // Player accounts: two confirmed, one waiting for admin confirmation.
  const [p1, p2, p3] = players;
  await prisma.user.createMany({
    data: [
      { email: "kasun@morasoccer.lk", role: "PLAYER", playerId: p1!.id, playerConfirmedAt: new Date(), passwordHash: await hashPassword(PLAYER_PASSWORD) },
      { email: "nuwan@morasoccer.lk", role: "PLAYER", playerId: p2!.id, playerConfirmedAt: new Date(), passwordHash: await hashPassword(PLAYER_PASSWORD) },
      { email: "tharindu@morasoccer.lk", role: "PLAYER", playerId: p3!.id, passwordHash: await hashPassword(PLAYER_PASSWORD) },
    ],
  });

  // ---- Past sessions: Tue/Thu/Sat for 8 weeks, all finalized ----
  const reliability = new Map(players.map((p) => [p.id, 0.45 + random() * 0.5]));
  let sessionCount = 0;
  for (let day = -56; day < 0; day++) {
    const start = colombo(day, 16, 30);
    const weekday = new Date(start.getTime() + 5.5 * HOUR).getUTCDay();
    if (![2, 4, 6].includes(weekday)) continue;

    const end = new Date(start.getTime() + 2 * HOUR);
    const session = await prisma.session.create({
      data: { date: localDate(start), startTime: start, endTime: end, type: pick(SESSION_TYPES), status: "FINALIZED", createdById: admin.id },
    });

    const records = players
      .filter((p) => p.joinedAt <= end)
      .map((p) => {
        const roll = random();
        const status: AttendanceStatus = roll < reliability.get(p.id)! ? "APPROVED" : roll < reliability.get(p.id)! + 0.05 ? "REJECTED" : "ABSENT";
        const scanned = status !== "ABSENT";
        return {
          sessionId: session.id,
          playerId: p.id,
          status,
          scannedAt: scanned ? new Date(start.getTime() + random() * 40 * 60 * 1000) : null,
          reviewedAt: scanned ? end : null,
          reviewedById: scanned ? admin.id : null,
        };
      });
    await prisma.attendanceRecord.createMany({ data: records });
    sessionCount++;
  }

  // ---- A session running now (QR check-in open) with a few pending scans ----
  const now = new Date();
  const live = await prisma.session.create({
    data: {
      date: localDate(now),
      startTime: new Date(now.getTime() - 30 * 60 * 1000),
      endTime: new Date(now.getTime() + 90 * 60 * 1000),
      type: "PRACTICE",
      status: "ACTIVE",
      createdById: admin.id,
    },
  });
  await prisma.session.update({ where: { id: live.id }, data: { qrToken: signQrToken(live.id, live.endTime) } });
  await prisma.attendanceRecord.createMany({
    data: players.slice(3, 9).map((p, i) => ({
      sessionId: live.id,
      playerId: p.id,
      status: "PENDING" as const,
      scannedAt: new Date(live.startTime.getTime() + (i + 1) * 3 * 60 * 1000),
    })),
  });

  // ---- An upcoming session ----
  const nextStart = colombo(2, 16, 30);
  const upcoming = await prisma.session.create({
    data: { date: localDate(nextStart), startTime: nextStart, endTime: new Date(nextStart.getTime() + 2 * HOUR), type: "FITNESS", createdById: admin.id },
  });
  await prisma.session.update({ where: { id: upcoming.id }, data: { qrToken: signQrToken(upcoming.id, upcoming.endTime) } });

  // ---- Tournaments and matches ----
  const past = await prisma.tournament.create({
    data: {
      name: "Inter-University Freshers' Cup",
      venue: "University of Moratuwa Ground",
      startDate: colombo(-40, 8),
      endDate: colombo(-38, 18),
      description: "Three-day knockout tournament.",
    },
  });
  await prisma.match.createMany({
    data: [
      { tournamentId: past.id, opponent: "University of Colombo", date: colombo(-40, 10), scoreFor: 2, scoreAgainst: 0, result: "WIN" },
      { tournamentId: past.id, opponent: "University of Peradeniya", date: colombo(-39, 10), scoreFor: 1, scoreAgainst: 1, result: "DRAW" },
      { tournamentId: past.id, opponent: "University of Sri Jayewardenepura", date: colombo(-38, 15), scoreFor: 0, scoreAgainst: 2, result: "LOSS" },
      { opponent: "SLIIT", date: colombo(-25, 16), scoreFor: 3, scoreAgainst: 1, result: "WIN" },
      { opponent: "NSBM Green University", date: colombo(-12, 16), scoreFor: 2, scoreAgainst: 2, result: "DRAW" },
    ],
  });

  // Match reports: a 14-player squad per match, a few cards, and a man of the match (drives the points table).
  for (const match of await prisma.match.findMany({ orderBy: { date: "asc" } })) {
    const squad = players.filter((p) => p.joinedAt <= match.date).sort(() => random() - 0.5).slice(0, 14);
    await prisma.matchAppearance.createMany({
      data: squad.map((p) => {
        const roll = random();
        return { matchId: match.id, playerId: p.id, yellowCards: roll < 0.15 ? 1 : 0, redCards: roll > 0.97 ? 1 : 0 };
      }),
    });
    await prisma.match.update({ where: { id: match.id }, data: { manOfTheMatchId: pick(squad).id } });
  }
  await prisma.tournament.createMany({
    data: [
      {
        name: "SLUG Football Championship",
        venue: "Racecourse Ground, Colombo",
        startDate: colombo(18, 8),
        endDate: colombo(22, 18),
        description: "Sri Lanka University Games — group stage followed by knockouts.",
      },
      { name: "Engineering Faculties Invitational", venue: "University of Moratuwa Ground", startDate: colombo(45, 8), endDate: colombo(46, 18) },
    ],
  });

  console.log(`Seeded ${players.length} players, ${sessionCount} finalized sessions, 1 live and 1 upcoming session, 3 tournaments.`);
  console.log(`\nAdmin login:  ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`Player login: kasun@morasoccer.lk / ${PLAYER_PASSWORD}  (tharindu@… is pending confirmation)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
