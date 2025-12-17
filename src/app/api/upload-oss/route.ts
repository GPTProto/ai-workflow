import { NextRequest, NextResponse } from 'next/server';
import { getOSSClient, generateOSSPath } from '@/lib/oss';

// Set max duration (for large file uploads)
export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const filename = formData.get('filename') as string || 'file';

      if (!file) {
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400 }
        );
      }

      const client = getOSSClient();
      const ext = file.name.split('.').pop() || 'bin';
      const path = generateOSSPath(`${filename}.${ext}`);

      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await client.put(path, buffer);

      return NextResponse.json({
        success: true,
        url: result.url,
      });
    } else {
      // Handle JSON request (base64 or URL)
      const body = await request.json();
      const { data, filename, type } = body;

      if (!data) {
        return NextResponse.json(
          { error: 'No data provided' },
          { status: 400 }
        );
      }

      // If it's a regular URL, return directly
      if (typeof data === 'string' && data.startsWith('http') && !data.startsWith('data:')) {
        return NextResponse.json({
          success: true,
          url: data,
        });
      }

      const client = getOSSClient();
      const path = generateOSSPath(filename || 'file');

      if (typeof data === 'string' && data.startsWith('data:')) {
        // Base64 data
        const base64Data = data.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const result = await client.put(path, buffer);

        return NextResponse.json({
          success: true,
          url: result.url,
        });
      }

      return NextResponse.json({
        success: true,
        url: data,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('OSS upload error:', error);
    return NextResponse.json(
      { error: `Upload failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
