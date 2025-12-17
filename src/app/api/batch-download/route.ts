import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';

interface ImageItem {
  url: string;
  filename: string;
}

export async function POST(request: NextRequest) {
  try {
    const { images } = await request.json() as { images: ImageItem[] };

    if (!images || images.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No images provided' },
        { status: 400 }
      );
    }

    const zip = new JSZip();

    // Download and add each image to the ZIP
    const downloadPromises = images.map(async (item, index) => {
      try {
        const response = await fetch(item.url);
        if (!response.ok) {
          console.error(`Failed to fetch image: ${item.url}`);
          return;
        }

        const arrayBuffer = await response.arrayBuffer();
        const extension = getExtensionFromUrl(item.url) || 'png';
        const filename = sanitizeFilename(item.filename || `image-${index + 1}`) + '.' + extension;

        zip.file(filename, arrayBuffer);
      } catch (error) {
        console.error(`Error downloading image ${item.url}:`, error);
      }
    });

    await Promise.all(downloadPromises);

    // Generate ZIP file
    const zipBuffer = await zip.generateAsync({
      type: 'arraybuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // Return the ZIP file
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="generated-images.zip"`,
      },
    });
  } catch (error) {
    console.error('Batch download error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create ZIP file' },
      { status: 500 }
    );
  }
}

function getExtensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase();
    if (ext && ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
      return ext;
    }
  } catch {
    // Ignore URL parsing errors
  }
  return 'png';
}

function sanitizeFilename(filename: string): string {
  // Remove file extension if present
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  // Remove invalid characters
  return nameWithoutExt.replace(/[<>:"/\\|?*]/g, '_').substring(0, 200);
}
