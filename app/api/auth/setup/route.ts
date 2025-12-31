import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import db from "@/app/lib/db/database";
import { hashPassword } from "@/app/lib/auth/password";
import { getUserCount } from "@/app/lib/auth/check-access";

export async function POST(request: Request) {
  try {
    // Only allow setup if no users exist
    const userCount = getUserCount();
    if (userCount > 0) {
      return NextResponse.json(
        { error: "Setup already completed. Please sign in." },
        { status: 403 }
      );
    }

    const { firstName, lastName, email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (!firstName) {
      return NextResponse.json(
        { error: "First name is required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user with combined name
    const name = lastName ? `${firstName} ${lastName}` : firstName;
    const userId = randomUUID();
    const stmt = db.prepare(`
      INSERT INTO users (id, name, email, password)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(userId, name, email, hashedPassword);

    return NextResponse.json(
      { message: "Admin account created successfully", userId },
      { status: 201 }
    );
  } catch (error) {
    console.error("Setup error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
