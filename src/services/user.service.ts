import { badRequest, notFound } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";

/** Sign-ups whose roster claim still needs admin confirmation. */
export function listPendingClaims() {
  return prisma.user.findMany({
    where: { playerId: { not: null }, playerConfirmedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      createdAt: true,
      player: { select: { id: true, name: true, indexNo: true, jerseyNumber: true, profilePicUrl: true } },
    },
  });
}

export async function confirmClaim(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { playerId: true } });
  if (!user) throw notFound("User");
  if (!user.playerId) throw badRequest("This user has not claimed a roster entry");
  await prisma.user.update({ where: { id: userId }, data: { playerConfirmedAt: new Date() } });
}

/** Rejecting a claim deletes the account so the roster entry can be claimed again. */
export async function rejectClaim(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, playerConfirmedAt: true } });
  if (!user) throw notFound("User");
  if (user.role === "ADMIN" || user.playerConfirmedAt) throw badRequest("Only pending sign-ups can be rejected");
  await prisma.user.delete({ where: { id: userId } });
}
