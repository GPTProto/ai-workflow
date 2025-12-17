import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');
    const filename = request.nextUrl.searchParams.get('filename') || 'image';

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'No URL provided' },
        { status: 400 }
      );
    }

    // Fetch the image from the remote URL
    const response = await fetch(url);
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch image' },
        { status: 500 }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    // Determine file extension
    let extension = 'png';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) {
      extension = 'jpg';
    } else if (contentType.includes('gif')) {
      extension = 'gif';
    } else if (contentType.includes('webp')) {
      extension = 'webp';
    }

    const sanitizedFilename = filename.replace(/[<>:"/\\|?*]/g, '_').substring(0, 200);

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${sanitizedFilename}.${extension}"`,
      },
    });
  } catch (error) {
    console.error('Download image error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to download image' },
      { status: 500 }
    );
  }
}
