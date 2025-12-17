import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hashApiKey } from '../../tasks/config';

interface UpdateItemRequest {
  historyId: number;
  type: 'character' | 'scene' | 'video';
  index: number;
  data: {
    status: string;
    imageUrl?: string | null;  // null means clear the field
    videoUrl?: string | null;  // null means clear the field
    taskId?: string | null;    // null means clear the field
    error?: string | null;     // null means clear the field
  };
  stage?: string;
  workflowStatus?: string;
}

// POST /api/workflow/update-item - Update a single item's status from client
// Uses optimistic locking with retry to prevent race conditions when multiple items are updated in parallel
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UpdateItemRequest;
    const { historyId, type, index, data, stage, workflowStatus } = body;

    const authHeader = request.headers.get('authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API Key is required' }, { status: 401 });
    }

    if (!historyId || type === undefined || index === undefined || !data) {
      return NextResponse.json({ success: false, error: 'Missing required parameters' }, { status: 400 });
    }

    const userApiKey = hashApiKey(apiKey);

    // Use optimistic locking with retry to handle concurrent updates
    // This prevents race conditions when multiple scenes/characters are updated in parallel
    let retryCount = 0;
    const maxRetries = 5;
    const baseDelay = 100; // Base delay in ms

    while (retryCount < maxRetries) {
      // Fetch current workflow data
      const { data: currentWorkflow, error: fetchError } = await supabaseServer
        .from('workflow_histories')
        .select('*')
        .eq('id', historyId)
        .eq('user_api_key', userApiKey)
        .single();

      if (fetchError || !currentWorkflow) {
        return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 });
      }

      // Update the specific item in the array
      const updateData: Record<string, unknown> = {};

      if (type === 'character') {
        const characters = [...(currentWorkflow.characters || [])];
        if (index >= 0 && index < characters.length) {
          const updatedChar = {
            ...characters[index],
            status: data.status,
          };
          if ('imageUrl' in data) {
            updatedChar.imageUrl = data.imageUrl ?? undefined;
          }
          if ('taskId' in data) {
            updatedChar.taskId = data.taskId ?? undefined;
          }
          if ('error' in data) {
            updatedChar.error = data.error ?? undefined;
          }
          characters[index] = updatedChar;
          updateData.characters = characters;
        } else {
          return NextResponse.json({ success: false, error: `Invalid character index: ${index}` }, { status: 400 });
        }
      } else if (type === 'scene') {
        const scenes = [...(currentWorkflow.scenes || [])];
        if (index >= 0 && index < scenes.length) {
          const updatedScene = {
            ...scenes[index],
            imageStatus: data.status,
          };
          if ('imageUrl' in data) {
            updatedScene.imageUrl = data.imageUrl ?? undefined;
          }
          if ('taskId' in data) {
            updatedScene.taskId = data.taskId ?? undefined;
          }
          if ('error' in data) {
            updatedScene.error = data.error ?? undefined;
          }
          scenes[index] = updatedScene;
          updateData.scenes = scenes;
        } else {
          return NextResponse.json({ success: false, error: `Invalid scene index: ${index}` }, { status: 400 });
        }
      } else if (type === 'video') {
        const videos = [...(currentWorkflow.videos || [])];
        if (index >= 0 && index < videos.length) {
          const updatedVideo = {
            ...videos[index],
            status: data.status,
          };
          if ('videoUrl' in data) {
            updatedVideo.videoUrl = data.videoUrl ?? undefined;
          }
          if ('taskId' in data) {
            updatedVideo.taskId = data.taskId ?? undefined;
          }
          if ('error' in data) {
            updatedVideo.error = data.error ?? undefined;
          }
          videos[index] = updatedVideo;
          updateData.videos = videos;
        } else {
          return NextResponse.json({ success: false, error: `Invalid video index: ${index}` }, { status: 400 });
        }
      }

      if (stage) {
        updateData.workflow_stage = stage;
      }
      if (workflowStatus) {
        updateData.status = workflowStatus;
      }

      // Use optimistic locking: only update if the updated_at timestamp hasn't changed
      // This ensures we don't overwrite concurrent updates
      const { data: updateResult, error: updateError } = await supabaseServer
        .from('workflow_histories')
        .update(updateData)
        .eq('id', historyId)
        .eq('updated_at', currentWorkflow.updated_at)
        .select('id');

      if (updateError) {
        console.error(`[UpdateItem] Update error for ${type} ${index}:`, updateError);
        return NextResponse.json({ success: false, error: 'Database update failed' }, { status: 500 });
      }

      // Check if update was successful (row was affected)
      if (updateResult && updateResult.length > 0) {
        // Success!
        if (retryCount > 0) {
          console.log(`[UpdateItem] ${type} ${index} updated successfully after ${retryCount} retries`);
        }
        return NextResponse.json({ success: true });
      }

      // No rows affected - another concurrent update happened
      // Wait with exponential backoff and retry
      retryCount++;
      if (retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount - 1) + Math.random() * 50;
        console.log(`[UpdateItem] Concurrent update detected for ${type} ${index}, retry ${retryCount}/${maxRetries} after ${Math.round(delay)}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.error(`[UpdateItem] Max retries (${maxRetries}) exceeded for ${type} ${index}`);
    return NextResponse.json({ success: false, error: 'Update conflict, please retry' }, { status: 409 });

  } catch (error) {
    const err = error as Error;
    console.error('Update item error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
