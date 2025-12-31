import type { Adapter, AdapterUser, AdapterAccount, AdapterSession, VerificationToken } from "next-auth/adapters";
import db from "../db/database";
import { randomUUID } from "crypto";

export const sqliteAdapter: Adapter = {
  async createUser(user: Omit<AdapterUser, "id">) {
    const id = randomUUID();
    const stmt = db.prepare(`
      INSERT INTO users (id, name, email, email_verified, image)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, user.name ?? null, user.email, user.emailVerified?.toISOString() ?? null, user.image ?? null);

    return {
      id,
      name: user.name ?? null,
      email: user.email,
      emailVerified: user.emailVerified ?? null,
      image: user.image ?? null,
    };
  },

  async getUser(id) {
    const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
    const user = stmt.get(id) as any;
    if (!user) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.email_verified ? new Date(user.email_verified) : null,
      image: user.image,
    };
  },

  async getUserByEmail(email) {
    const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
    const user = stmt.get(email) as any;
    if (!user) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.email_verified ? new Date(user.email_verified) : null,
      image: user.image,
    };
  },

  async getUserByAccount({ providerAccountId, provider }) {
    const stmt = db.prepare(`
      SELECT u.* FROM users u
      JOIN accounts a ON u.id = a.user_id
      WHERE a.provider = ? AND a.provider_account_id = ?
    `);
    const user = stmt.get(provider, providerAccountId) as any;
    if (!user) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.email_verified ? new Date(user.email_verified) : null,
      image: user.image,
    };
  },

  async updateUser(user) {
    const stmt = db.prepare(`
      UPDATE users
      SET name = ?, email = ?, email_verified = ?, image = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(user.name ?? null, user.email, user.emailVerified?.toISOString() ?? null, user.image ?? null, user.id);

    const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as any;
    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      emailVerified: updated.email_verified ? new Date(updated.email_verified) : null,
      image: updated.image,
    };
  },

  async deleteUser(userId) {
    const stmt = db.prepare("DELETE FROM users WHERE id = ?");
    stmt.run(userId);
  },

  async linkAccount(account: AdapterAccount) {
    const id = randomUUID();
    const stmt = db.prepare(`
      INSERT INTO accounts (id, user_id, type, provider, provider_account_id, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      account.userId,
      account.type,
      account.provider,
      account.providerAccountId,
      account.refresh_token ?? null,
      account.access_token ?? null,
      account.expires_at ?? null,
      account.token_type ?? null,
      account.scope ?? null,
      account.id_token ?? null,
      account.session_state ?? null
    );

    return {
      id,
      userId: account.userId,
      type: account.type,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      refresh_token: account.refresh_token ?? null,
      access_token: account.access_token ?? null,
      expires_at: account.expires_at ?? null,
      token_type: account.token_type ?? null,
      scope: account.scope ?? null,
      id_token: account.id_token ?? null,
      session_state: account.session_state ?? null,
    } as AdapterAccount;
  },

  async unlinkAccount({ providerAccountId, provider }: Pick<AdapterAccount, "provider" | "providerAccountId">) {
    const stmt = db.prepare("DELETE FROM accounts WHERE provider = ? AND provider_account_id = ?");
    stmt.run(provider, providerAccountId);
  },

  async createSession({ sessionToken, userId, expires }) {
    const id = randomUUID();
    const stmt = db.prepare(`
      INSERT INTO sessions (id, session_token, user_id, expires)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, sessionToken, userId, expires.toISOString());

    return {
      id,
      sessionToken,
      userId,
      expires,
    };
  },

  async getSessionAndUser(sessionToken) {
    const stmt = db.prepare(`
      SELECT s.*, u.id as user_id, u.name, u.email, u.email_verified, u.image
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.session_token = ?
    `);
    const result = stmt.get(sessionToken) as any;
    if (!result) return null;

    return {
      session: {
        id: result.id,
        sessionToken: result.session_token,
        userId: result.user_id,
        expires: new Date(result.expires),
      },
      user: {
        id: result.user_id,
        name: result.name,
        email: result.email,
        emailVerified: result.email_verified ? new Date(result.email_verified) : null,
        image: result.image,
      },
    };
  },

  async updateSession({ sessionToken, expires }) {
    const stmt = db.prepare(`
      UPDATE sessions
      SET expires = ?, updated_at = CURRENT_TIMESTAMP
      WHERE session_token = ?
    `);
    stmt.run(expires?.toISOString(), sessionToken);

    const session = db.prepare("SELECT * FROM sessions WHERE session_token = ?").get(sessionToken) as any;
    if (!session) return null;

    return {
      id: session.id,
      sessionToken: session.session_token,
      userId: session.user_id,
      expires: new Date(session.expires),
    };
  },

  async deleteSession(sessionToken) {
    const stmt = db.prepare("DELETE FROM sessions WHERE session_token = ?");
    stmt.run(sessionToken);
  },

  async createVerificationToken({ identifier, expires, token }) {
    const stmt = db.prepare(`
      INSERT INTO verification_tokens (identifier, token, expires)
      VALUES (?, ?, ?)
    `);
    stmt.run(identifier, token, expires.toISOString());

    return {
      identifier,
      token,
      expires,
    };
  },

  async useVerificationToken({ identifier, token }) {
    const stmt = db.prepare("SELECT * FROM verification_tokens WHERE identifier = ? AND token = ?");
    const result = stmt.get(identifier, token) as any;
    if (!result) return null;

    const deleteStmt = db.prepare("DELETE FROM verification_tokens WHERE identifier = ? AND token = ?");
    deleteStmt.run(identifier, token);

    return {
      identifier: result.identifier,
      token: result.token,
      expires: new Date(result.expires),
    };
  },
};
