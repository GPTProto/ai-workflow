import { exec } from 'child_process';
import fs from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { getOSSClient, OSS_UPLOAD_PREFIX } from '@/lib/oss';

const execAsync = promisify(exec);

// Upload video to OSS
async function uploadVideoToOSS(filePath: string, filename: string): Promise<string> {
  const client = getOSSClient();
  const ossPath = `${OSS_UPLOAD_PREFIX}/merged/${Date.now()}-${filename}`;
  const result = await client.put(ossPath, filePath);
  return result.url;
}

interface MergeRequest {
  videoUrls: string[];
}

// Download video to temp file
async function downloadVideo(url: string, outputPath: string): Promise<void> {
  console.log(`Downloading video from: ${url.substring(0, 100)}...`);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(120000) // 2 minutes timeout
  });
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  console.log(`Downloaded ${buffer.byteLength} bytes, writing to: ${outputPath}`);
  await fs.writeFile(outputPath, Buffer.from(buffer));
}

// Create ffmpeg concat file list
async function createFileList(videoPaths: string[], listPath: string): Promise<void> {
  const content = videoPaths.map(p => `file '${p}'`).join('\n');
  await fs.writeFile(listPath, content);
}

export async function POST(request: NextRequest) {
  const tempDir = path.join(os.tmpdir(), `video-merge-${Date.now()}`);

  try {
    const body: MergeRequest = await request.json();
    const { videoUrls } = body;

    if (!videoUrls || videoUrls.length === 0) {
      return NextResponse.json(
        { error: 'No video URLs provided' },
        { status: 400 }
      );
    }

    if (videoUrls.length === 1) {
      return NextResponse.json({
        success: true,
        videoUrl: videoUrls[0],
        message: 'Only one video, no merge needed'
      });
    }

    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });

    // Download all videos
    console.log(`Starting to download ${videoUrls.length} videos`);
    const videoPaths: string[] = [];
    for (let i = 0; i < videoUrls.length; i++) {
      const videoPath = path.join(tempDir, `video_${i}.mp4`);
      try {
        await downloadVideo(videoUrls[i], videoPath);
        videoPaths.push(videoPath);
        console.log(`Video ${i + 1}/${videoUrls.length} downloaded successfully`);
      } catch (downloadError) {
        console.error(`Failed to download video ${i + 1}:`, (downloadError as Error).message);
        throw new Error(`Failed to download video ${i + 1}: ${(downloadError as Error).message}`);
      }
    }

    // Create file list
    const listPath = path.join(tempDir, 'videos.txt');
    await createFileList(videoPaths, listPath);

    // Output file path
    const outputPath = path.join(tempDir, 'merged.mp4');

    // Use ffmpeg to merge videos
    // Using concat demuxer, suitable for same encoding videos
    const ffmpegCmd = `ffmpeg -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}" -y`;

    try {
      await execAsync(ffmpegCmd, { timeout: 300000 }); // 5 minutes timeout
    } catch (concatError) {
      console.log('Concat demuxer failed, trying filter_complex:', (concatError as Error).message);
      // If concat fails, try filter_complex method to re-encode
      const inputArgs = videoPaths.map((p, i) => `-i "${p}"`).join(' ');
      const filterInputs = videoPaths.map((_, i) => `[${i}:v][${i}:a]`).join('');
      const ffmpegCmdAlt = `ffmpeg ${inputArgs} -filter_complex "${filterInputs}concat=n=${videoPaths.length}:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" "${outputPath}" -y`;

      try {
        await execAsync(ffmpegCmdAlt, { timeout: 600000 }); // 10 minutes timeout
      } catch (altError) {
        console.log('Filter complex with audio failed, trying video only:', (altError as Error).message);
        // If still fails, try merging video stream only (no audio)
        const filterInputsVideo = videoPaths.map((_, i) => `[${i}:v]`).join('');
        const ffmpegCmdVideoOnly = `ffmpeg ${inputArgs} -filter_complex "${filterInputsVideo}concat=n=${videoPaths.length}:v=1:a=0[outv]" -map "[outv]" "${outputPath}" -y`;
        await execAsync(ffmpegCmdVideoOnly, { timeout: 600000 }); // 10 minutes timeout
      }
    }

    // Upload merged video to OSS
    const ossUrl = await uploadVideoToOSS(outputPath, 'merged.mp4');

    // Cleanup temp files
    await fs.rm(tempDir, { recursive: true, force: true });

    return NextResponse.json({
      success: true,
      videoUrl: ossUrl,
      message: `Successfully merged ${videoUrls.length} videos`
    });

  } catch (error) {
    // Cleanup temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Video merge failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
