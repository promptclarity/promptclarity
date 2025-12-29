import { NextResponse } from 'next/server';
import { availablePlatforms } from '@/app/lib/config/platforms';

export async function GET() {
  try {
    // Return the available platforms from server config
    return NextResponse.json({
      platforms: availablePlatforms
    });
  } catch (error) {
    console.error('Error fetching available platforms:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available platforms' },
      { status: 500 }
    );
  }
}