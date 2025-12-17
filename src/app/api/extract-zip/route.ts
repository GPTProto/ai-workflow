import JSZip from 'jszip';
import { NextRequest, NextResponse } from 'next/server';
import { getOSSClient, OSS_UPLOAD_PREFIX } from '@/lib/oss';

export const maxDuration = 300; // 5 minutes

// Check if it's an image file
const isImageFile = (filename: string): boolean => {
  const ext = filename.toLowerCase().split('.').pop();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext || '');
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Check if it's a ZIP file
    if (!file.name.toLowerCase().endsWith('.zip')) {
      return NextResponse.json(
        { success: false, error: 'Please upload a ZIP file' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const client = getOSSClient();

    const images: { filename: string; url: string }[] = [];
    const timestamp = Date.now();

    // Iterate through files in ZIP
    const entries = Object.entries(zip.files);
    for (const [relativePath, zipEntry] of entries) {
      // Skip directories and hidden files
      if (zipEntry.dir || relativePath.startsWith('__MACOSX') || relativePath.startsWith('.')) {
        continue;
      }

      // Only process image files
      const filename = relativePath.split('/').pop() || '';
      if (!isImageFile(filename)) {
        continue;
      }

      try {
        const content = await zipEntry.async('nodebuffer');
        const ossPath = `${OSS_UPLOAD_PREFIX}/batch-${timestamp}/${filename}`;

        const result = await client.put(ossPath, content);
        images.push({
          filename,
          url: result.url,
        });
      } catch (err) {
        console.error(`Failed to upload file: ${filename}`, err);
      }
    }

    if (images.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid image files found in ZIP' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      images,
      count: images.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('ZIP extract error:', error);
    return NextResponse.json(
      { success: false, error: `Extraction failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
