import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hashApiKey } from '../../tasks/config';

interface ScriptCharacter {
  name: string;
  description?: string;
  imagePrompt?: string;
  RoleimagePrompt?: string;
}

interface ScriptScene {
  id: number;
  imagePrompt: string;
  videoPrompt: string;
}

interface ScriptJson {
  characters: ScriptCharacter[];
  scenes: ScriptScene[];
}

// POST /api/workflow/update-script - Update script for a running workflow
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { historyId, scriptData } = body as { historyId: number; scriptData: ScriptJson };

    const authHeader = request.headers.get('authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API Key is required' }, { status: 401 });
    }

    if (!historyId) {
      return NextResponse.json({ success: false, error: 'History ID is required' }, { status: 400 });
    }

    if (!scriptData || !scriptData.characters || !scriptData.scenes) {
      return NextResponse.json({ success: false, error: 'Script data is required' }, { status: 400 });
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

    // Get current characters and scenes
    const currentCharacters = workflow.characters || [];
    const currentScenes = workflow.scenes || [];

    // Update characters: keep existing imageUrl if character exists, update prompts
    const updatedCharacters = scriptData.characters.map((newChar, index) => {
      const existingChar = currentCharacters.find(
        (c: { name: string }) => c.name === newChar.name
      ) || currentCharacters[index];

      const imagePrompt = newChar.imagePrompt || newChar.RoleimagePrompt || '';

      if (existingChar) {
        // Keep existing imageUrl and status, update prompt
        return {
          ...existingChar,
          name: newChar.name,
          description: newChar.description || existingChar.description || '',
          imagePrompt: imagePrompt,
          // If prompt changed significantly, mark for regeneration (keep pending or error status)
          // If already done and prompt changed, keep as done but allow user to regenerate
        };
      } else {
        // New character
        return {
          id: `char-${Date.now()}-${index}`,
          name: newChar.name,
          description: newChar.description || '',
          imagePrompt: imagePrompt,
          status: 'pending',
        };
      }
    });

    // Update scenes: keep existing imageUrl if scene exists, update prompts
    const updatedScenes = scriptData.scenes.map((newScene, index) => {
      const existingScene = currentScenes.find(
        (s: { id: number }) => s.id === newScene.id
      ) || currentScenes[index];

      if (existingScene) {
        // Keep existing imageUrl and status, update prompts
        return {
          ...existingScene,
          id: newScene.id,
          imagePrompt: newScene.imagePrompt,
          videoPrompt: newScene.videoPrompt,
        };
      } else {
        // New scene
        return {
          id: newScene.id,
          imagePrompt: newScene.imagePrompt,
          videoPrompt: newScene.videoPrompt,
          imageStatus: 'pending',
        };
      }
    });

    // Save script_result JSON for reference
    const scriptResultJson = JSON.stringify(scriptData);

    // Update the workflow
    const { error: updateError } = await supabaseServer
      .from('workflow_histories')
      .update({
        characters: updatedCharacters,
        scenes: updatedScenes,
        script_result: scriptResultJson,
      })
      .eq('id', historyId);

    if (updateError) {
      console.error('[UpdateScript] Database update error:', updateError);
      return NextResponse.json({ success: false, error: 'Failed to update workflow' }, { status: 500 });
    }

    console.log(`[Workflow ${historyId}] Script updated: ${updatedCharacters.length} characters, ${updatedScenes.length} scenes`);

    return NextResponse.json({
      success: true,
      message: 'Script updated successfully',
      data: {
        charactersCount: updatedCharacters.length,
        scenesCount: updatedScenes.length,
      },
    });
  } catch (error) {
    const err = error as Error;
    console.error('Update script error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
