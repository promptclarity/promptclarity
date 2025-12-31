import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side favicon fetching API
 * Downloads logo/favicon and converts to base64 for storage in database
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain');

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain parameter is required' },
        { status: 400 }
      );
    }

    // Clean the domain
    let cleanDomain = domain.trim();
    cleanDomain = cleanDomain.replace(/^https?:\/\//i, '');
    cleanDomain = cleanDomain.replace(/^www\./i, '');
    cleanDomain = cleanDomain.split('/')[0];

    if (!cleanDomain) {
      return NextResponse.json(
        { error: 'Invalid domain' },
        { status: 400 }
      );
    }

    // Try multiple sources in order of preference
    const sources = [
      {
        name: 'favicon_direct',
        url: `https://${cleanDomain}/favicon.ico`,
        quality: 'high'
      },
      {
        name: 'clearbit',
        url: `https://logo.clearbit.com/${cleanDomain}`,
        quality: 'medium'
      },
      {
        name: 'google_favicon_128',
        url: `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=128`,
        quality: 'medium'
      },
      {
        name: 'google_favicon_64',
        url: `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=64`,
        quality: 'low'
      }
    ];

    // Try each source in order
    for (const source of sources) {
      try {
        const response = await fetch(source.url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; FaviconFetcher/1.0)',
          },
          // Add timeout to prevent hanging
          signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type');

          // Verify it's an image
          if (contentType && contentType.startsWith('image/')) {
            // Download the image and convert to base64
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64 = buffer.toString('base64');

            // Create data URI
            const dataUri = `data:${contentType};base64,${base64}`;

            return NextResponse.json({
              success: true,
              logo: dataUri,
              source: source.name,
              quality: source.quality,
              size: buffer.length
            });
          }
        }
      } catch (error) {
        // Try next source
        console.log(`Failed to fetch from ${source.name}:`, error);
        continue;
      }
    }

    // If all sources fail, try to download Google's favicon as fallback
    try {
      const fallbackUrl = `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=128`;
      const fallbackResponse = await fetch(fallbackUrl, {
        signal: AbortSignal.timeout(5000)
      });

      if (fallbackResponse.ok) {
        const contentType = fallbackResponse.headers.get('content-type') || 'image/png';
        const arrayBuffer = await fallbackResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        const dataUri = `data:${contentType};base64,${base64}`;

        return NextResponse.json({
          success: true,
          logo: dataUri,
          source: 'google_fallback',
          quality: 'low',
          size: buffer.length
        });
      }
    } catch (error) {
      console.error('Fallback favicon fetch failed:', error);
    }

    // If everything fails, return error
    return NextResponse.json(
      {
        success: false,
        error: 'Could not fetch logo from any source'
      },
      { status: 404 }
    );

  } catch (error) {
    console.error('Error fetching favicon:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}