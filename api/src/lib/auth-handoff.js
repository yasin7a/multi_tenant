import { randomBytes } from "node:crypto";

const authHandoffs = new Map();

export function createAuthHandoff(userId) {
  const token = randomBytes(24).toString("hex");
  authHandoffs.set(token, { userId, expires: Date.now() + 2 * 60 * 1000 });
  return token;
}

export function consumeAuthHandoff(token) {
  const entry = authHandoffs.get(token);
  if (!entry || entry.expires < Date.now()) {
    authHandoffs.delete(token);
    return null;
  }
  authHandoffs.delete(token);
  return entry.userId;
}
