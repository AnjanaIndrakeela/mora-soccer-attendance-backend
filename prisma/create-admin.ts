/**
 * Creates an admin account, or promotes an existing user and resets their password.
 * Usage: npm run create-admin -- <email> <password>
 */
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/services/auth.service.js";

const [email, password] = process.argv.slice(2);

if (!email || !password || password.length < 8) {
  console.error("Usage: npm run create-admin -- <email> <password (8+ characters)>");
  process.exit(1);
}

const normalized = email.trim().toLowerCase();
const passwordHash = await hashPassword(password);
await prisma.user.upsert({
  where: { email: normalized },
  create: { email: normalized, passwordHash, role: "ADMIN" },
  update: { passwordHash, role: "ADMIN" },
});
console.log(`Admin ready: ${normalized}`);
await prisma.$disconnect();
