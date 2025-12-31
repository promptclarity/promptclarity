import { getServerSession } from "next-auth";
import { authOptions } from "./auth-options";
import { dbHelpers } from "@/app/lib/db/database";

export interface AccessCheckResult {
  authorized: boolean;
  userId?: string;
  error?: string;
  status?: number;
}

/**
 * Check if the current user has access to a specific business
 * Returns { authorized: true, userId } if access granted
 * Returns { authorized: false, error, status } if access denied
 */
export async function checkBusinessAccess(
  businessId: string | number
): Promise<AccessCheckResult> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      authorized: false,
      error: "Unauthorized - Please sign in",
      status: 401,
    };
  }

  const userId = session.user.id;
  const hasAccess = dbHelpers.userHasBusinessAccess.get(businessId, userId);

  if (!hasAccess) {
    return {
      authorized: false,
      error: "Forbidden - You don't have access to this business",
      status: 403,
    };
  }

  return {
    authorized: true,
    userId,
  };
}

/**
 * Get the current session user ID, or null if not authenticated
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id || null;
}

/**
 * Check if any users exist in the database (for first-run detection)
 */
export function isFirstRun(): boolean {
  const result = dbHelpers.getUserByEmail.get("__check__") as any;
  // If the query runs without error, check if any users exist
  const countResult = require("@/app/lib/db/database").default.prepare(
    "SELECT COUNT(*) as count FROM users"
  ).get() as { count: number };
  return countResult.count === 0;
}

/**
 * Count total users in the database
 */
export function getUserCount(): number {
  const db = require("@/app/lib/db/database").default;
  const result = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  return result.count;
}
