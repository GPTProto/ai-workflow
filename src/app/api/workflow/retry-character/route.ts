import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hashApiKey } from '../../tasks/config';

const API_BASE_URL = 'https://gptproto.com';

// POST /api/workflow/retry-character - Retry failed character image generation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { historyId, characterIndex, newPrompt } = body;

    const authHeader = request.headers.get('authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API Key is required' }, { status: 401 });
    }

    if (!historyId) {
      return NextResponse.json({ success: false, error: 'History ID is required' }, { status: 400 });
    }

    if (characterIndex === undefined || characterIndex === null) {
      return NextResponse.json({ success: false, error: 'Character index is required' }, { status: 400 });
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

    // Check if characters array exists and the index is valid
    const characters = workflow.characters || [];
    if (characterIndex < 0 || characterIndex >= characters.length) {
      return NextResponse.json({ success: false, error: 'Invalid character index' }, { status: 400 });
    }

    const character = characters[characterIndex];
    if (character.status === 'done' && !newPrompt) {
      return NextResponse.json({ success: false, error: 'Character image already completed' }, { status: 400 });
    }

    // If newPrompt is provided, update the character's imagePrompt in the database first
    if (newPrompt) {
      character.imagePrompt = newPrompt;
      await supabaseServer
        .from('workflow_histories')
        .update({ characters })
        .eq('id', historyId);
    }

    // Start retry in background
    retryCharacterInBackground(historyId, apiKey, characterIndex, workflow, newPrompt).catch(err =>
      console.error('[Workflow] Retry character background error:', err)
    );

    return NextResponse.json({ success: true, message: 'Character image retry started' });
  } catch (error) {
    const err = error as Error;
    console.error('Retry character error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// Retry character image generation in background
async function retryCharacterInBackground(
  historyId: number,
  apiKey: string,
  characterIndex: number,
  workflow: {
    workflow_config: {
      imageSize?: string;
    };
    characters: Array<{
      id: string;
      name: string;
      description: string;
      imagePrompt: string;
      status: string;
      imageUrl?: string;
      error?: string;
    }>;
  },
  newPrompt?: string
) {
  try {
    const characters = [...workflow.characters];
    const character = characters[characterIndex];
    const imageSize = workflow.workflow_config?.imageSize || '1080p';

    // Use newPrompt if provided
    const promptToUse = newPrompt || character.imagePrompt;

    console.log(`[Workflow ${historyId}] Retrying character ${characterIndex}: ${character.name} with prompt: ${promptToUse.substring(0, 50)}...`);

    // Update character status to generating and update prompt if changed
    character.status = 'generating';
    character.error = undefined;
    character.imageUrl = undefined;
    if (newPrompt) {
      character.imagePrompt = newPrompt;
    }

    await supabaseServer
      .from('workflow_histories')
      .update({ characters })
      .eq('id', historyId);

    try {
      const imgResponse = await fetch(`${API_BASE_URL}/api/v3/google/gemini-3-pro-image-preview/text-to-image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: promptToUse,
          aspect_ratio: '9:16',
          size: imageSize,
        }),
      });

      const imgData = await imgResponse.json();

      if (imgData.id || imgData.data?.id) {
        const taskId = imgData.id || imgData.data?.id;
        const pollResult = await pollTaskResult(taskId, apiKey, API_BASE_URL);
        if (pollResult.imageUrl) {
          character.imageUrl = pollResult.imageUrl;
          character.status = 'done';
        } else {
          character.status = 'error';
          character.error = pollResult.error;
        }
      } else {
        character.imageUrl = imgData.data?.image_url || imgData.image_url;
        character.status = character.imageUrl ? 'done' : 'error';
        if (!character.imageUrl) {
          character.error = 'No image returned';
        }
      }
    } catch (err) {
      character.status = 'error';
      character.error = (err as Error).message;
      console.error(`[Workflow ${historyId}] Character ${character.name} retry error:`, err);
    }

    // Update final character status
    await supabaseServer
      .from('workflow_histories')
      .update({ characters })
      .eq('id', historyId);

    console.log(`[Workflow ${historyId}] Character ${characterIndex} retry completed with status: ${character.status}`);

  } catch (error) {
    console.error(`[Workflow ${historyId}] Retry character error:`, error);
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
