import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAdmin, createPlayer, createPlayerUser, createSession, prisma, resetDatabase } from "./helpers.js";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const scan = (agent: Awaited<ReturnType<typeof createPlayerUser>>["agent"], sessionId: string, token: string) =>
  agent.post("/attend").send({ sessionId, token });

describe("POST /attend", () => {
  it("creates a PENDING record for a confirmed player inside the session window", async () => {
    const { agent, player } = await createPlayerUser();
    const session = await createSession(-10);

    const res = await scan(agent, session.id, session.qrToken!);

    expect(res.status).toBe(201);
    expect(res.body.record.status).toBe("PENDING");
    const record = await prisma.attendanceRecord.findUniqueOrThrow({
      where: { sessionId_playerId: { sessionId: session.id, playerId: player.id } },
    });
    expect(record.scannedAt).not.toBeNull();
    expect((await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).status).toBe("ACTIVE");
  });

  it("rejects a duplicate scan", async () => {
    const { agent } = await createPlayerUser();
    const session = await createSession(-10);

    await scan(agent, session.id, session.qrToken!);
    const res = await scan(agent, session.id, session.qrToken!);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already checked in/);
  });

  it("accepts scans within the grace period before the start", async () => {
    const { agent } = await createPlayerUser();
    const session = await createSession(10);

    expect((await scan(agent, session.id, session.qrToken!)).status).toBe(201);
  });

  it("rejects scans before the window opens", async () => {
    const { agent } = await createPlayerUser();
    const session = await createSession(60);

    const res = await scan(agent, session.id, session.qrToken!);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/hasn't opened/);
  });

  it("rejects scans after the window closes", async () => {
    const { agent } = await createPlayerUser();
    // Ended 20 minutes ago, beyond the 15-minute grace period. The token itself has expired too.
    const session = await createSession(-110, 90);

    const res = await scan(agent, session.id, session.qrToken!);

    expect(res.status).toBe(400);
  });

  it("rejects scans once an admin has ended the session", async () => {
    const admin = await createAdmin();
    const { agent } = await createPlayerUser();
    const session = await createSession(-10);

    await admin.post(`/sessions/${session.id}/end`).expect(200);
    const res = await scan(agent, session.id, session.qrToken!);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/ended/);
  });

  it("rejects an invalid or mismatched token", async () => {
    const { agent } = await createPlayerUser();
    const session = await createSession(-10);
    const other = await createSession(-10);

    expect((await scan(agent, session.id, "garbage")).status).toBe(400);
    expect((await scan(agent, session.id, other.qrToken!)).status).toBe(400);
  });

  it("rejects players whose account is not confirmed yet", async () => {
    const { agent } = await createPlayerUser({ confirmed: false });
    const session = await createSession(-10);

    const res = await scan(agent, session.id, session.qrToken!);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/confirmation/);
  });

  it("requires login", async () => {
    const { agent } = await createPlayerUser();
    await agent.post("/auth/logout").expect(204);
    const session = await createSession(-10);

    expect((await scan(agent, session.id, session.qrToken!)).status).toBe(401);
  });
});

describe("GET /attend/:sessionId (scan preview)", () => {
  it("shows the session without checking in, then reflects the confirmed check-in", async () => {
    const { agent, player } = await createPlayerUser();
    const session = await createSession(-10);
    const preview = () => agent.get(`/attend/${session.id}`).query({ t: session.qrToken! });

    const before = await preview().expect(200);
    expect(before.body).toMatchObject({ canCheckIn: true, reason: null, record: null, player: { name: player.name } });
    expect(before.body.session.status).toBe("ACTIVE");
    expect(await prisma.attendanceRecord.count()).toBe(0);

    await scan(agent, session.id, session.qrToken!).expect(201);

    const after = await preview().expect(200);
    expect(after.body.canCheckIn).toBe(false);
    expect(after.body.record.status).toBe("PENDING");
  });

  it("explains why check-in isn't possible", async () => {
    const { agent } = await createPlayerUser({ confirmed: false });
    const session = await createSession(-10);

    const { body } = await agent.get(`/attend/${session.id}`).query({ t: session.qrToken! }).expect(200);

    expect(body.canCheckIn).toBe(false);
    expect(body.reason).toMatch(/confirmation/);
  });

  it("rejects an invalid token", async () => {
    const { agent } = await createPlayerUser();
    const session = await createSession(-10);

    await agent.get(`/attend/${session.id}`).query({ t: "garbage" }).expect(400);
  });
});

describe("review and finalize", () => {
  it("blocks finalizing while records are pending, then marks everyone else ABSENT", async () => {
    const admin = await createAdmin();
    const present = await createPlayerUser();
    const rejected = await createPlayerUser();
    const noShow = await createPlayer();
    await createPlayer({ isActive: false });
    const session = await createSession(-10);

    await scan(present.agent, session.id, session.qrToken!).expect(201);
    await scan(rejected.agent, session.id, session.qrToken!).expect(201);
    // Joined after the session ended: not expected to attend.
    await createPlayer({ joinedAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });

    await admin.post(`/sessions/${session.id}/finalize`).expect(409);
    await admin.post(`/sessions/${session.id}/end`).expect(200);
    await admin.post(`/sessions/${session.id}/finalize`).expect(409);

    const { body } = await admin.get(`/sessions/${session.id}/attendance`).expect(200);
    const rejectedRecord = body.records.find((r: { player: { id: string } }) => r.player.id === rejected.player.id);
    await admin.patch(`/attendance/${rejectedRecord.id}`).send({ status: "REJECTED" }).expect(200);
    await admin.post(`/sessions/${session.id}/approve-all`).expect(200, { approved: 1 });

    const finalized = await admin.post(`/sessions/${session.id}/finalize`).expect(200);
    expect(finalized.body.status).toBe("FINALIZED");
    expect(finalized.body.counts).toEqual({ PENDING: 0, APPROVED: 1, REJECTED: 1, ABSENT: 1 });
    expect(finalized.body.attendancePercent).toBeCloseTo(33.3);

    const absent = await prisma.attendanceRecord.findMany({ where: { sessionId: session.id, status: "ABSENT" } });
    expect(absent.map((r) => r.playerId)).toEqual([noShow.id]);
  });

  it("computes player attendance % over finalized sessions since they joined", async () => {
    const admin = await createAdmin();
    const { agent, player } = await createPlayerUser();

    for (const attend of [true, true, false]) {
      const session = await createSession(-10);
      if (attend) await scan(agent, session.id, session.qrToken!).expect(201);
      await admin.post(`/sessions/${session.id}/end`).expect(200);
      await admin.post(`/sessions/${session.id}/approve-all`).expect(200);
      await admin.post(`/sessions/${session.id}/finalize`).expect(200);
    }
    // Not finalized, so it doesn't count.
    await createSession(-10);

    const { body } = await admin.get(`/players/${player.id}`).expect(200);
    expect(body.attendance).toEqual({ approved: 2, total: 3, percent: 66.7 });
  });
});

describe("access control", () => {
  it("prevents players from managing sessions and hides other players' private data", async () => {
    const { agent } = await createPlayerUser();
    const other = await createPlayer();
    const session = await createSession(-10);

    await agent.get(`/sessions/${session.id}/qr`).expect(403);
    await agent.post(`/sessions/${session.id}/end`).expect(403);

    const { body } = await agent.get(`/players/${other.id}`).expect(200);
    expect(body).not.toHaveProperty("contactNo");
    expect(body).not.toHaveProperty("birthday");
  });
});

describe("match reports and points", () => {
  it("scores +3 per match, +7 per man of the match, -1 per yellow and -2 per red", async () => {
    const admin = await createAdmin();
    const [a, b, c] = [await createPlayer({ name: "A" }), await createPlayer({ name: "B" }), await createPlayer({ name: "C" })];
    const match1 = await prisma.match.create({ data: { opponent: "X", date: new Date() } });
    const match2 = await prisma.match.create({ data: { opponent: "Y", date: new Date() } });

    await admin
      .put(`/matches/${match1.id}/report`)
      .send({
        manOfTheMatchId: a.id,
        appearances: [
          { playerId: a.id, yellowCards: 0, redCards: 0 },
          { playerId: b.id, yellowCards: 1, redCards: 0 },
          { playerId: c.id, yellowCards: 2, redCards: 1 },
        ],
      })
      .expect(200);
    await admin
      .put(`/matches/${match2.id}/report`)
      .send({ manOfTheMatchId: b.id, appearances: [{ playerId: a.id, yellowCards: 1, redCards: 0 }, { playerId: b.id, yellowCards: 0, redCards: 0 }] })
      .expect(200);

    const { body } = await admin.get("/stats/points").expect(200);
    const points = Object.fromEntries(body.players.map((p: { name: string; points: number }) => [p.name, p.points]));
    // A: 2 apps (6) + 1 MOTM (7) + 1 yellow (-1) = 12. B: 2 apps (6) + MOTM (7) + 1 yellow (-1) = 12. C: 3 - 2 - 2 = -1.
    expect(points).toEqual({ A: 12, B: 12, C: -1 });
    expect(body.rules).toEqual({ appearance: 3, manOfTheMatch: 7, yellowCard: -1, redCard: -2 });

    const player = await admin.get(`/players/${a.id}`).expect(200);
    expect(player.body.points).toMatchObject({ appearances: 2, manOfTheMatch: 1, yellowCards: 1, redCards: 0, points: 12 });
    expect(player.body.matchHistory).toHaveLength(2);
  });

  it("replaces the report on save, so corrections update the points", async () => {
    const admin = await createAdmin();
    const a = await createPlayer({ name: "A" });
    const match = await prisma.match.create({ data: { opponent: "X", date: new Date() } });

    await admin.put(`/matches/${match.id}/report`).send({ manOfTheMatchId: a.id, appearances: [{ playerId: a.id, yellowCards: 0, redCards: 0 }] }).expect(200);
    await admin.put(`/matches/${match.id}/report`).send({ manOfTheMatchId: null, appearances: [] }).expect(200);

    const { body } = await admin.get(`/players/${a.id}`).expect(200);
    expect(body.points.points).toBe(0);
  });

  it("rejects a man of the match who didn't play, and invalid card counts", async () => {
    const admin = await createAdmin();
    const [a, b] = [await createPlayer(), await createPlayer()];
    const match = await prisma.match.create({ data: { opponent: "X", date: new Date() } });

    await admin.put(`/matches/${match.id}/report`).send({ manOfTheMatchId: b.id, appearances: [{ playerId: a.id, yellowCards: 0, redCards: 0 }] }).expect(400);
    await admin.put(`/matches/${match.id}/report`).send({ manOfTheMatchId: null, appearances: [{ playerId: a.id, yellowCards: 3, redCards: 0 }] }).expect(400);
  });

  it("only lets admins record reports", async () => {
    const { agent } = await createPlayerUser();
    const match = await prisma.match.create({ data: { opponent: "X", date: new Date() } });

    await agent.put(`/matches/${match.id}/report`).send({ manOfTheMatchId: null, appearances: [] }).expect(403);
  });
});

describe("ordering by points, then attendance", () => {
  it("breaks ties on points with attendance % on the team list and the leaderboard", async () => {
    const admin = await createAdmin();
    const top = await createPlayer({ name: "Top scorer" });
    const regular = await createPlayer({ name: "Regular" }); // same points as `rare`, better attendance
    const rare = await createPlayer({ name: "Rare" });

    // Points: top 13 (played + MOTM), regular 3, rare 3.
    const match = await prisma.match.create({ data: { opponent: "X", date: new Date() } });
    await admin
      .put(`/matches/${match.id}/report`)
      .send({
        manOfTheMatchId: top.id,
        appearances: [top, regular, rare].map((p) => ({ playerId: p.id, yellowCards: 0, redCards: 0 })),
      })
      .expect(200);

    // Attendance: one finalized session that only `regular` attended.
    const session = await createSession(-10);
    await admin.post(`/sessions/${session.id}/attendance`).send({ playerId: regular.id, status: "APPROVED" }).expect(200);
    await admin.post(`/sessions/${session.id}/end`).expect(200);
    await admin.post(`/sessions/${session.id}/finalize`).expect(200);

    const list = await admin.get("/players").query({ sort: "points" }).expect(200);
    expect(list.body.items.map((p: { name: string }) => p.name)).toEqual(["Top scorer", "Regular", "Rare"]);

    const board = await admin.get("/stats/points").expect(200);
    expect(board.body.players.map((p: { name: string }) => p.name)).toEqual(["Top scorer", "Regular", "Rare"]);
    expect(board.body.players[1].attendance).toEqual({ approved: 1, total: 1, percent: 100 });
  });
});
