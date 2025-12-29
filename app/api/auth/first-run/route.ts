import { NextResponse } from "next/server";
import { getUserCount } from "@/app/lib/auth/check-access";

export async function GET() {
  try {
    const userCount = getUserCount();
    return NextResponse.json({
      isFirstRun: userCount === 0,
    });
  } catch (error) {
    console.error("Error checking first run status:", error);
    return NextResponse.json(
      { error: "Failed to check first run status" },
      { status: 500 }
    );
  }
}
