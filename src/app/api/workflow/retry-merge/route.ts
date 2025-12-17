import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hashApiKey } from '../../tasks/config';

// POST /api/workflow/retry-merge - Retry video merge
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { historyId } = body;

    const authHeader = request.headers.get('authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API Key is required' }, { status: 401 });
    }

    if (!historyId) {
      return NextResponse.json({ success: false, error: 'History ID is required' }, { status: 400 });
    }

    const userApiKey = hashApiKey(apiKey);

    // Get current workflow status
    const { data: workflow, error: fetchError } = await supabaseServer
      .from('workflow_histories')
      .select('*')
      .eq('id', historyId)
      .eq('user_api_key', userApiKey)
      .single();

    if (fetchError || !workflow) {
      return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 });
    }

    // Check if we have completed videos to merge
    const videos = workflow.videos || [];
    const completedVideos = videos.filter((v: { status: string; videoUrl?: string }) => v.status === 'done' && v.videoUrl);

    if (completedVideos.length === 0) {
      return NextResponse.json({ success: false, error: 'No completed videos to merge' }, { status: 400 });
    }

    // Get base URL from request headers
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const baseUrl = `${protocol}://${host}`;

    // Start retry merge in background
    retryMergeInBackground(historyId, baseUrl).catch(err =>
      console.error('[Workflow] Retry merge background error:', err)
    );

    return NextResponse.json({ success: true, message: 'Video merge retry started' });
  } catch (error) {
    const err = error as Error;
    console.error('Retry merge error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// Retry video merge in background
async function retryMergeInBackground(
  historyId: number,
  baseUrl: string
) {
  try {
    console.log(`[Workflow ${historyId}] Retrying video merge with baseUrl: ${baseUrl}`);

    // Update status to merging
    await supabaseServer
      .from('workflow_histories')
      .update({
        workflow_stage: 'merging',
        status: 'running',
        merged_video_url: null,
      })
      .eq('id', historyId);

    // IMPORTANT: Re-fetch the latest workflow data from database
    // This ensures we use the most recent video URLs after any retries
    const { data: latestWorkflow, error: fetchError } = await supabaseServer
      .from('workflow_histories')
      .select('videos')
      .eq('id', historyId)
      .single();

    if (fetchError || !latestWorkflow) {
      throw new Error('Failed to fetch latest workflow data');
    }

    const videos = latestWorkflow.videos || [];

    // Get completed videos sorted by index
    const completedVideos = videos
      .filter((v: { status: string; videoUrl?: string }) => v.status === 'done' && v.videoUrl)
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index);

    const videoUrls = completedVideos.map((v: { videoUrl: string }) => v.videoUrl);

    if (videoUrls.length === 0) {
      throw new Error('No valid video URLs to merge');
    }

    console.log(`[Workflow ${historyId}] Merging ${videoUrls.length} videos...`);

    const mergeResponse = await fetch(`${baseUrl}/api/merge-videos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ videoUrls }),
    });

    const mergeData = await mergeResponse.json();

    if (!mergeResponse.ok || !mergeData.success) {
      throw new Error(mergeData.error || 'Failed to merge videos');
    }

    const mergedVideoUrl = mergeData.videoUrl;
    console.log(`[Workflow ${historyId}] Videos merged successfully: ${mergedVideoUrl}`);

    // Update to completed
    await supabaseServer
      .from('workflow_histories')
      .update({
        status: 'completed',
        workflow_stage: 'completed',
        merged_video_url: mergedVideoUrl,
      })
      .eq('id', historyId);

    console.log(`[Workflow ${historyId}] Merge retry completed successfully`);

  } catch (error) {
    console.error(`[Workflow ${historyId}] Merge retry error:`, error);

    // Update to partial (videos done but merge failed)
    await supabaseServer
      .from('workflow_histories')
      .update({
        status: 'partial',
        workflow_stage: 'completed',
      })
      .eq('id', historyId);
  }
}
