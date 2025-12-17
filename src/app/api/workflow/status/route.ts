import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hashApiKey } from '../../tasks/config';

// GET /api/workflow/status?historyId=xxx - 查询工作流状态
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const historyId = searchParams.get('historyId');
    const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!apiKey || !historyId) {
      return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
    }

    const userApiKey = hashApiKey(apiKey);
    const id = parseInt(historyId);

    // 获取工作流历史记录
    const { data: history, error: historyError } = await supabaseServer
      .from('workflow_histories')
      .select('*')
      .eq('id', id)
      .eq('user_api_key', userApiKey)
      .single();

    if (historyError || !history) {
      return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 });
    }

    // 检查是否需要自动更新 stage
    const currentStage = history.workflow_stage || 'idle';
    const currentStatus = history.status;
    const characters = (history.characters as Array<{ status?: string }>) || [];
    const scenes = (history.scenes as Array<{ imageStatus?: string }>) || [];
    const videos = (history.videos as Array<{ status?: string }>) || [];

    let needsUpdate = false;
    let newStage = currentStage;
    let newStatus = currentStatus;

    // 当处于 characters 阶段且所有 characters 都完成时，自动更新到 characters_done
    if (currentStage === 'characters' && characters.length > 0) {
      // 检查是否还有正在生成中或待生成的
      const hasGenerating = characters.some(c => c.status === 'generating');
      const hasPending = characters.some(c => c.status === 'pending');

      // 只有当没有 generating 和 pending 时才更新
      if (!hasGenerating && !hasPending) {
        newStage = 'characters_done';
        newStatus = 'waiting';
        needsUpdate = true;
        const doneCount = characters.filter(c => c.status === 'done').length;
        const errorCount = characters.filter(c => c.status === 'error').length;
        console.log(`[Workflow ${id}] Characters generation finished (done: ${doneCount}, error: ${errorCount}), updating to characters_done`);
      }
    }

    // 当处于 scenes 阶段且所有 scenes 都完成时，自动更新到 scenes_done
    if (currentStage === 'scenes' && scenes.length > 0) {
      // 检查是否还有正在生成中或待生成的
      const hasGenerating = scenes.some(s => s.imageStatus === 'generating');
      const hasPending = scenes.some(s => s.imageStatus === 'pending');

      // 只有当没有 generating 和 pending 时才更新
      if (!hasGenerating && !hasPending) {
        newStage = 'scenes_done';
        newStatus = 'waiting';
        needsUpdate = true;
        const doneCount = scenes.filter(s => s.imageStatus === 'done').length;
        const errorCount = scenes.filter(s => s.imageStatus === 'error').length;
        console.log(`[Workflow ${id}] Scenes generation finished (done: ${doneCount}, error: ${errorCount}), updating to scenes_done`);
      }
    }

    // 当处于 videos 阶段且所有 videos 都完成时，自动更新到 videos_done
    if (currentStage === 'videos' && videos.length > 0) {
      // 检查是否还有正在生成中或待生成的
      const hasGenerating = videos.some(v => v.status === 'submitting' || v.status === 'polling');
      const hasPending = videos.some(v => v.status === 'pending');

      // 只有当没有 generating 和 pending 时才更新
      if (!hasGenerating && !hasPending) {
        newStage = 'videos_done';
        newStatus = 'waiting';
        needsUpdate = true;
        const doneCount = videos.filter(v => v.status === 'done').length;
        const errorCount = videos.filter(v => v.status === 'error').length;
        console.log(`[Workflow ${id}] Videos generation finished (done: ${doneCount}, error: ${errorCount}), updating to videos_done`);
      }
    }

    // 如果需要更新，执行更新
    if (needsUpdate) {
      const { error: updateError } = await supabaseServer
        .from('workflow_histories')
        .update({
          workflow_stage: newStage,
          status: newStatus,
        })
        .eq('id', id);

      if (updateError) {
        console.error(`[Workflow ${id}] Failed to auto-update stage:`, updateError);
      } else {
        // 更新本地 history 对象以返回最新状态
        history.workflow_stage = newStage;
        history.status = newStatus;
      }
    }

    // 从 workflow_config 中提取配置
    const workflowConfig = (history.workflow_config as Record<string, unknown>) || {};

    // 构建响应
    return NextResponse.json({
      success: true,
      workflow: {
        id: history.id,
        title: history.title,
        status: history.status,
        stage: history.workflow_stage || 'idle',
        videoUrl: history.video_url,
        scriptResult: history.script_result,
        characters: history.characters || [],
        scenes: history.scenes || [],
        videos: history.videos || [],
        mergedVideoUrl: history.merged_video_url,
        chatMessages: history.chat_messages || [],
        createdAt: history.created_at,
        updatedAt: history.updated_at,
        // 工作流配置
        videoGenerationMode: workflowConfig.videoGenerationMode as string || 'first-last-frame',
        selectedModel: workflowConfig.selectedModel as string || 'seedance',
        imageSize: workflowConfig.imageSize as string || '1K',
      },
      // 进度统计
      progress: calculateProgress(history),
    });

  } catch (error) {
    const err = error as Error;
    console.error('Workflow status error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// 计算工作流进度
function calculateProgress(history: Record<string, unknown>) {
  const stage = history.workflow_stage as string || 'idle';
  const characters = (history.characters as Array<{ status?: string }>) || [];
  const scenes = (history.scenes as Array<{ imageStatus?: string }>) || [];
  const videos = (history.videos as Array<{ status?: string }>) || [];

  const stageProgress: Record<string, number> = {
    'idle': 0,
    'script': 10,
    'script_done': 20,
    'parsing': 25,
    'parsing_done': 30,
    'characters': 40,
    'scenes': 60,
    'videos': 80,
    'completed': 100,
    'error': 0,
  };

  let progress = stageProgress[stage] || 0;

  // 细化进度
  if (stage === 'characters' && characters.length > 0) {
    const done = characters.filter(c => c.status === 'done').length;
    progress = 30 + (done / characters.length) * 20;
  } else if (stage === 'scenes' && scenes.length > 0) {
    const done = scenes.filter(s => s.imageStatus === 'done').length;
    progress = 50 + (done / scenes.length) * 20;
  } else if (stage === 'videos' && videos.length > 0) {
    const done = videos.filter(v => v.status === 'done').length;
    progress = 70 + (done / videos.length) * 30;
  }

  return {
    stage,
    percent: Math.round(progress),
    charactersTotal: characters.length,
    charactersDone: characters.filter(c => c.status === 'done').length,
    scenesTotal: scenes.length,
    scenesDone: scenes.filter(s => s.imageStatus === 'done').length,
    videosTotal: videos.length,
    videosDone: videos.filter(v => v.status === 'done').length,
  };
}
