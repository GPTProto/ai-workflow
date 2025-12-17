import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hashApiKey } from '../../tasks/config';

const API_BASE_URL = 'https://gptproto.com';

// POST /api/workflow/retry-scene - Retry failed scene image generation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { historyId, sceneIndex } = body;

    const authHeader = request.headers.get('authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API Key is required' }, { status: 401 });
    }

    if (!historyId) {
      return NextResponse.json({ success: false, error: 'History ID is required' }, { status: 400 });
    }

    if (sceneIndex === undefined || sceneIndex === null) {
      return NextResponse.json({ success: false, error: 'Scene index is required' }, { status: 400 });
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

    // Check if scenes array exists and the index is valid
    const scenes = workflow.scenes || [];
    if (sceneIndex < 0 || sceneIndex >= scenes.length) {
      return NextResponse.json({ success: false, error: 'Invalid scene index' }, { status: 400 });
    }

    const scene = scenes[sceneIndex];
    if (scene.imageStatus === 'done') {
      return NextResponse.json({ success: false, error: 'Scene image already completed' }, { status: 400 });
    }

    // Start retry in background
    retrySceneInBackground(historyId, apiKey, sceneIndex, workflow).catch(err =>
      console.error('[Workflow] Retry scene background error:', err)
    );

    return NextResponse.json({ success: true, message: 'Scene image retry started' });
  } catch (error) {
    const err = error as Error;
    console.error('Retry scene error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// Retry scene image generation in background
async function retrySceneInBackground(
  historyId: number,
  apiKey: string,
  sceneIndex: number,
  workflow: {
    workflow_config: {
      imageSize?: string;
    };
    scenes: Array<{
      id: number;
      imagePrompt: string;
      videoPrompt: string;
      imageStatus: string;
      imageUrl?: string;
      error?: string;
    }>;
  }
) {
  try {
    const scenes = [...workflow.scenes];
    const scene = scenes[sceneIndex];
    const imageSize = workflow.workflow_config?.imageSize || '1080p';

    console.log(`[Workflow ${historyId}] Retrying scene ${sceneIndex}: ${scene.id}`);

    // Update scene status to generating
    scene.imageStatus = 'generating';
    scene.error = undefined;
    scene.imageUrl = undefined;

    await supabaseServer
      .from('workflow_histories')
      .update({ scenes })
      .eq('id', historyId);

    try {
      const imgResponse = await fetch(`${API_BASE_URL}/api/v3/google/gemini-3-pro-image-preview/text-to-image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: scene.imagePrompt,
          aspect_ratio: '16:9',
          size: imageSize,
        }),
      });

      const imgData = await imgResponse.json();

      if (imgData.id || imgData.data?.id) {
        const taskId = imgData.id || imgData.data?.id;
        const pollResult = await pollTaskResult(taskId, apiKey, API_BASE_URL);
        if (pollResult.imageUrl) {
          scene.imageUrl = pollResult.imageUrl;
          scene.imageStatus = 'done';
        } else {
          scene.imageStatus = 'error';
          scene.error = pollResult.error;
        }
      } else {
        scene.imageUrl = imgData.data?.image_url || imgData.image_url;
        scene.imageStatus = scene.imageUrl ? 'done' : 'error';
        if (!scene.imageUrl) {
          scene.error = 'No image returned';
        }
      }
    } catch (err) {
      scene.imageStatus = 'error';
      scene.error = (err as Error).message;
      console.error(`[Workflow ${historyId}] Scene ${scene.id} retry error:`, err);
    }

    // Update final scene status
    await supabaseServer
      .from('workflow_histories')
      .update({ scenes })
      .eq('id', historyId);

    console.log(`[Workflow ${historyId}] Scene ${sceneIndex} retry completed with status: ${scene.imageStatus}`);

  } catch (error) {
    console.error(`[Workflow ${historyId}] Retry scene error:`, error);
  }
}

// Poll image task result
async function pollTaskResult(
  taskId: string,
  apiKey: string,
  apiBaseUrl: string
): Promise<{ imageUrl?: string; error?: string }> {
  const MAX_ATTEMPTS = 120; // Increased from 60 to 120 (6 minutes total)
  const POLL_INTERVAL = 3000;

  console.log(`[Poll] Starting to poll task ${taskId}`);

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v3/predictions/${taskId}/result`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      const data = await response.json();
      const result = data.data || data;

      console.log(`[Poll] Attempt ${i + 1}/${MAX_ATTEMPTS} - Status: ${result.status}`);

      if (result.status === 'succeeded' || result.status === 'completed') {
        const imageUrl = result.output?.image_url || result.image_url || result.outputs?.[0];
        console.log(`[Poll] Task ${taskId} succeeded, imageUrl: ${imageUrl?.substring(0, 50)}...`);
        return { imageUrl };
      } else if (result.status === 'failed' || result.status === 'error') {
        console.log(`[Poll] Task ${taskId} failed: ${result.error}`);
        return { error: result.error || 'Task failed' };
      }
    } catch (err) {
      console.log(`[Poll] Attempt ${i + 1} error: ${(err as Error).message}`);
      // Continue polling
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }

  console.log(`[Poll] Task ${taskId} polling timeout after ${MAX_ATTEMPTS} attempts`);
  return { error: 'Polling timeout' };
}
