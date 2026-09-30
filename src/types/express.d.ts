import type { Role } from "../generated/prisma/client.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: Role;
        playerId: string | null;
        playerConfirmedAt: Date | null;
      };
    }
  }
}

export {};
