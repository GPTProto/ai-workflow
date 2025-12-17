import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hashApiKey } from '../../tasks/config';

interface UpdateStageRequest {
  historyId: number;
  stage: string;
  status?: string;
  videos?: Array<{
    id: string;
    index: number;
    prompt: string;
    firstFrame: string;
    lastFrame?: string;
    status: string;
    taskId?: string;
    videoUrl?: string;
    error?: string;
  }>;
  characters?: Array<{
    id?: string;
    name: string;
    description?: string;
    imagePrompt: string;
    status?: string;
    imageUrl?: string;
    taskId?: string;
    error?: string;
  }>;
  scenes?: Array<{
    id: number;
    imagePrompt: string;
    videoPrompt?: string;
    imageStatus?: string;
    imageUrl?: string;
    taskId?: string;
    error?: string;
  }>;
  mergedVideoUrl?: string;
}

// POST /api/workflow/update-stage - Update workflow stage and status from client
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UpdateStageRequest;
    const { historyId, stage, status, videos, characters, scenes, mergedVideoUrl } = body;

    const authHeader = request.headers.get('authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API Key is required' }, { status: 401 });
    }

    if (!historyId || !stage) {
      return NextResponse.json({ success: false, error: 'Missing required parameters' }, { status: 400 });
    }

    const userApiKey = hashApiKey(apiKey);

    // Verify workflow ownership
    const { data: workflow, error: fetchError } = await supabaseServer
      .from('workflow_histories')
      .select('id')
      .eq('id', historyId)
      .eq('user_api_key', userApiKey)
      .single();

    if (fetchError || !workflow) {
      return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      workflow_stage: stage,
    };

    if (status) {
      updateData.status = status;
    }

    if (videos) {
      updateData.videos = videos;
    }

    if (characters) {
      updateData.characters = characters;
    }

    if (scenes) {
      updateData.scenes = scenes;
    }

    if (mergedVideoUrl !== undefined) {
      updateData.merged_video_url = mergedVideoUrl;
    }

    // Apply update
    const { error: updateError } = await supabaseServer
      .from('workflow_histories')
      .update(updateData)
      .eq('id', historyId);

    if (updateError) {
      console.error('[UpdateStage] Database update error:', updateError);
      return NextResponse.json({ success: false, error: 'Failed to update stage' }, { status: 500 });
    }

    console.log(`[Workflow ${historyId}] Stage updated to: ${stage}${status ? `, status: ${status}` : ''}${videos ? `, videos: ${videos.length}` : ''}${characters ? `, characters: ${characters.length}` : ''}${scenes ? `, scenes: ${scenes.length}` : ''}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as Error;
    console.error('Update stage error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
