import { NextRequest, NextResponse } from 'next/server';
import { hashApiKey, supabaseServer } from '../../tasks/config';

const API_BASE_URL = 'https://gptproto.com';

// POST /api/workflow/generate-characters - Generate character images only
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

    // Start generating characters in background
    generateCharactersInBackground(historyId, apiKey, workflow).catch(err =>
      console.error('[Workflow] Generate characters background error:', err)
    );

    return NextResponse.json({ success: true, message: 'Character generation started' });
  } catch (error) {
    const err = error as Error;
    console.error('Generate characters error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// Generate character images in background
async function generateCharactersInBackground(
  historyId: number,
  apiKey: string,
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
  }
) {
  try {
    const characters = [...workflow.characters];
    const imageSize = workflow.workflow_config?.imageSize || '1080p';

    // Find characters that need generation (pending or error status)
    const pendingChars = characters.filter(c => c.status === 'pending' || c.status === 'error');

    if (pendingChars.length === 0) {
      console.log(`[Workflow ${historyId}] No characters to generate`);
      return;
    }

    console.log(`[Workflow ${historyId}] Generating ${pendingChars.length} characters...`);

    // Mark all pending characters as generating
    pendingChars.forEach(c => { c.status = 'generating'; });
    await supabaseServer
      .from('workflow_histories')
      .update({ characters })
      .eq('id', historyId);

    // Generate each character in parallel
    const generateCharacter = async (char: typeof characters[0], index: number) => {
      const charIndex = characters.findIndex(c => c.id === char.id);

      try {
        console.log(`[Workflow ${historyId}] Generating character ${index}: ${char.name}`);

        const imgResponse = await fetch(`${API_BASE_URL}/api/v3/google/gemini-3-pro-image-preview/text-to-image`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: char.imagePrompt,
            aspect_ratio: '9:16',
            size: imageSize,
          }),
        });

        const imgData = await imgResponse.json();

        if (imgData.id || imgData.data?.id) {
          const taskId = imgData.id || imgData.data?.id;
          const pollResult = await pollTaskResult(taskId, apiKey);
          if (pollResult.imageUrl) {
            characters[charIndex].imageUrl = pollResult.imageUrl;
            characters[charIndex].status = 'done';
            characters[charIndex].error = undefined;
          } else {
            characters[charIndex].status = 'error';
            characters[charIndex].error = pollResult.error;
          }
        } else {
          const imageUrl = imgData.data?.image_url || imgData.image_url;
          if (imageUrl) {
            characters[charIndex].imageUrl = imageUrl;
            characters[charIndex].status = 'done';
            characters[charIndex].error = undefined;
          } else {
            characters[charIndex].status = 'error';
            characters[charIndex].error = 'No image returned';
          }
        }
      } catch (err) {
        characters[charIndex].status = 'error';
        characters[charIndex].error = (err as Error).message;
        console.error(`[Workflow ${historyId}] Character ${char.name} generation error:`, err);
      }

      // Update database after each character completes
      await supabaseServer
        .from('workflow_histories')
        .update({ characters })
        .eq('id', historyId);
    };

    // Generate all characters in parallel
    await Promise.all(
      pendingChars.map((char, index) => generateCharacter(char, index))
    );

    console.log(`[Workflow ${historyId}] Character generation completed: ${characters.filter(c => c.status === 'done').length}/${characters.length} done`);

  } catch (error) {
    console.error(`[Workflow ${historyId}] Generate characters error:`, error);
  }
}

// Poll image task result
async function pollTaskResult(
  taskId: string,
  apiKey: string
): Promise<{ imageUrl?: string; error?: string }> {
  const MAX_ATTEMPTS = 120;
  const POLL_INTERVAL = 3000;

  console.log(`[Poll] Starting to poll task ${taskId}`);

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v3/predictions/${taskId}/result`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      const data = await response.json();
      const result = data.data || data;

      if (i % 10 === 0) {
        console.log(`[Poll] Attempt ${i + 1}/${MAX_ATTEMPTS} - Status: ${result.status}`);
      }

      if (result.status === 'succeeded' || result.status === 'completed') {
        const imageUrl = result.output?.image_url || result.image_url || result.outputs?.[0];
        console.log(`[Poll] Task ${taskId} succeeded`);
        return { imageUrl };
      } else if (result.status === 'failed' || result.status === 'error') {
        console.log(`[Poll] Task ${taskId} failed: ${result.error}`);
        return { error: result.error || 'Task failed' };
      }
    } catch (err) {
      if (i % 10 === 0) {
        console.log(`[Poll] Attempt ${i + 1} error: ${(err as Error).message}`);
      }
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }

  console.log(`[Poll] Task ${taskId} polling timeout after ${MAX_ATTEMPTS} attempts`);
  return { error: 'Polling timeout' };
}
