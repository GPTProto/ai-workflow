import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hashApiKey } from '../../tasks/config';

const API_BASE_URL = 'https://gptproto.com';
const VIDEO_MODELS: Record<string, { url: string; defaultParams: Record<string, unknown>; lastFrameKey?: string }> = {
  seedance: {
    url: `${API_BASE_URL}/api/v3/doubao/seedance-1-0-pro-250528/image-to-video`,
    defaultParams: {
      resolution: '720p',
      duration: 5,
      aspect_ratio: '9:16',
      seed: -1,
    },
    lastFrameKey: 'last_image',
  },
  hailuo: {
    url: `${API_BASE_URL}/api/v3/minimax/hailuo-02-standard/image-to-video`,
    defaultParams: {
      duration: '5',
    },
    lastFrameKey: 'end_image',
  },
  wan: {
    url: `${API_BASE_URL}/api/v3/alibaba/wan-2.2-plus/image-to-video`,
    defaultParams: {
      resolution: '480p',
      duration: 5,
      seed: -1,
    },
  },
};
const DEFAULT_VIDEO_MODEL = 'seedance';

// POST /api/workflow/retry-video - Retry failed video generation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { historyId, videoIndex, modelId, mode } = body;

    const authHeader = request.headers.get('authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API Key is required' }, { status: 401 });
    }

    if (!historyId) {
      return NextResponse.json({ success: false, error: 'History ID is required' }, { status: 400 });
    }

    if (videoIndex === undefined || videoIndex === null) {
      return NextResponse.json({ success: false, error: 'Video index is required' }, { status: 400 });
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

    // Check if videos array exists and the index is valid
    const videos = workflow.videos || [];
    console.log(`[Workflow ${historyId}] Retry video request: videoIndex=${videoIndex}, videos.length=${videos.length}, videos=${JSON.stringify(videos.map((v: { id: string; status: string }) => ({ id: v.id, status: v.status })))}`);
    if (videoIndex < 0 || videoIndex >= videos.length) {
      console.error(`[Workflow ${historyId}] Invalid video index: ${videoIndex}, videos.length=${videos.length}`);
      return NextResponse.json({ success: false, error: `Invalid video index: ${videoIndex}, only ${videos.length} videos exist` }, { status: 400 });
    }

    const video = videos[videoIndex];
    // Allow regenerating completed videos (user may want to try different model/mode)
    if (video.status === 'submitting' || video.status === 'polling') {
      return NextResponse.json({ success: false, error: 'Video generation already in progress' }, { status: 400 });
    }

    // Start retry in background
    retryVideoInBackground(historyId, apiKey, videoIndex, workflow, modelId, mode).catch(err =>
      console.error('[Workflow] Retry video background error:', err)
    );

    return NextResponse.json({ success: true, message: 'Video retry started' });
  } catch (error) {
    const err = error as Error;
    console.error('Retry video error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// Retry video generation in background
async function retryVideoInBackground(
  historyId: number,
  apiKey: string,
  videoIndex: number,
  workflow: {
    workflow_config: {
      selectedModel?: string;
      videoGenerationMode?: string;
    };
    videos: Array<{
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
    scenes?: Array<{
      id: number;
      imageUrl?: string;
      imageStatus?: string;
    }>;
  },
  requestModelId?: string,  // Model ID from request (overrides workflow config)
  requestMode?: string      // Generation mode from request (overrides workflow config)
) {
  try {
    const videos = [...workflow.videos];
    const video = videos[videoIndex];
    // Use request model if provided, otherwise use workflow config
    const selectedModel = requestModelId || workflow.workflow_config?.selectedModel || DEFAULT_VIDEO_MODEL;
    const modelConfig = VIDEO_MODELS[selectedModel] || VIDEO_MODELS[DEFAULT_VIDEO_MODEL];
    // Use request mode if provided, otherwise use workflow config
    const videoGenerationMode = requestMode || workflow.workflow_config?.videoGenerationMode || 'first-last-frame';

    // Recalculate lastFrame based on current videoGenerationMode setting
    // This ensures that if user switches from single-image to first-last-frame mode,
    // the retry will use the correct lastFrame
    let effectiveLastFrame = video.lastFrame;
    if (videoGenerationMode === 'first-last-frame' && !video.lastFrame) {
      // Try to get lastFrame from scenes array (next scene's imageUrl)
      // Note: video.index is the video index, which corresponds to completed scene order
      // We need to find the next completed scene after this video's scene
      const scenes = workflow.scenes || [];

      // Find all completed scenes in order
      const completedScenes = scenes
        .map((s, idx) => ({ ...s, originalIndex: idx }))
        .filter(s => s.imageStatus === 'done' && s.imageUrl);

      // video.index is the position in completed scenes array
      // So the next scene is at video.index + 1 in completedScenes
      const nextSceneIndex = video.index + 1;
      if (nextSceneIndex < completedScenes.length) {
        effectiveLastFrame = completedScenes[nextSceneIndex].imageUrl;
        console.log(`[Workflow ${historyId}] Recalculated lastFrame from completed scene at position ${nextSceneIndex} (original index: ${completedScenes[nextSceneIndex].originalIndex}): ${effectiveLastFrame?.substring(0, 50)}...`);
      } else {
        console.log(`[Workflow ${historyId}] No next scene available for lastFrame (video.index=${video.index}, completedScenes.length=${completedScenes.length})`);
      }
    } else if (videoGenerationMode === 'single-image') {
      // Explicitly clear lastFrame for single-image mode
      effectiveLastFrame = undefined;
    }

    console.log(`[Workflow ${historyId}] Retrying video ${videoIndex} with model ${selectedModel}, mode: ${videoGenerationMode}`);
    console.log(`[Workflow ${historyId}] Video data:`, {
      id: video.id,
      prompt: video.prompt?.substring(0, 50),
      hasFirstFrame: !!video.firstFrame,
      hasLastFrame: !!effectiveLastFrame,
      originalLastFrame: video.lastFrame?.substring(0, 50),
      effectiveLastFrame: effectiveLastFrame?.substring(0, 50),
      modelLastFrameKey: modelConfig.lastFrameKey,
      videoGenerationMode,
    });

    // Update video status to submitting
    video.status = 'submitting';
    video.error = undefined;
    video.videoUrl = undefined;
    video.taskId = undefined;

    await supabaseServer
      .from('workflow_histories')
      .update({ videos })
      .eq('id', historyId);

    try {
      // Build request body
      const requestBody: Record<string, unknown> = {
        prompt: video.prompt,
        image: video.firstFrame,
        ...modelConfig.defaultParams,
      };

      // Add last frame if available and model supports it
      if (effectiveLastFrame && modelConfig.lastFrameKey) {
        requestBody[modelConfig.lastFrameKey] = effectiveLastFrame;
        console.log(`[Workflow ${historyId}] Adding lastFrame with key '${modelConfig.lastFrameKey}'`);
      }

      console.log(`[Workflow ${historyId}] Submitting video ${video.id} to ${modelConfig.url}`);
      console.log(`[Workflow ${historyId}] Request body keys:`, Object.keys(requestBody));

      const videoResponse = await fetch(modelConfig.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const videoData = await videoResponse.json();
      console.log(`[Workflow ${historyId}] Video response:`, JSON.stringify(videoData).substring(0, 200));

      if (!videoResponse.ok || (videoData.code && videoData.code !== 200)) {
        throw new Error(videoData.error?.message || videoData.message || `Request failed: ${videoResponse.status}`);
      }

      const taskId = videoData.data?.id || videoData.id || null;

      if (taskId) {
        video.taskId = taskId;
        video.status = 'polling';
        await supabaseServer
          .from('workflow_histories')
          .update({ videos })
          .eq('id', historyId);

        const pollResult = await pollVideoResult(taskId, apiKey, API_BASE_URL);
        if (pollResult.videoUrl) {
          video.videoUrl = pollResult.videoUrl;
          video.status = 'done';
        } else {
          video.status = 'error';
          video.error = pollResult.error;
        }
      } else {
        video.status = 'error';
        video.error = 'No task ID returned from API';
        console.error(`[Workflow ${historyId}] No task ID in response:`, videoData);
      }
    } catch (err) {
      video.status = 'error';
      video.error = (err as Error).message;
      console.error(`[Workflow ${historyId}] Video ${video.id} retry error:`, err);
    }

    // Update final video status
    await supabaseServer
      .from('workflow_histories')
      .update({ videos })
      .eq('id', historyId);

    console.log(`[Workflow ${historyId}] Video ${videoIndex} retry completed with status: ${video.status}`);

    // Check if all videos are now done (or error) and update stage to videos_done
    const allVideosFinished = videos.every(v => v.status === 'done' || v.status === 'error');
    const hasSuccessVideos = videos.some(v => v.status === 'done');

    if (allVideosFinished && hasSuccessVideos) {
      console.log(`[Workflow ${historyId}] All videos finished after retry, updating stage to videos_done`);
      await supabaseServer
        .from('workflow_histories')
        .update({ workflow_stage: 'videos_done', status: 'waiting' })
        .eq('id', historyId);
    }

  } catch (error) {
    console.error(`[Workflow ${historyId}] Retry video error:`, error);
  }
}

// Poll video task result
async function pollVideoResult(
  taskId: string,
  apiKey: string,
  apiBaseUrl: string
): Promise<{ videoUrl?: string; error?: string }> {
  const MAX_ATTEMPTS = 120;
  const POLL_INTERVAL = 5000;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v3/predictions/${taskId}/result`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      const data = await response.json();
      const result = data.data || data;

      if (result.status === 'succeeded' || result.status === 'completed') {
        return { videoUrl: result.output?.video_url || result.video_url || result.outputs?.[0] };
      } else if (result.status === 'failed' || result.status === 'error') {
        return { error: result.error || 'Task failed' };
      }
    } catch {
      // Continue polling
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }

  return { error: 'Video polling timeout' };
}
