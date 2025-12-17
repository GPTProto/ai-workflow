import { NextRequest, NextResponse } from 'next/server';
import { hashApiKey, supabaseServer } from '../../tasks/config';

// 视频模型配置
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

// POST /api/workflow/continue - 继续执行下一步
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

    // 获取当前工作流状态
    const { data: workflow, error: fetchError } = await supabaseServer
      .from('workflow_histories')
      .select('*')
      .eq('id', historyId)
      .eq('user_api_key', userApiKey)
      .single();

    if (fetchError || !workflow) {
      return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 });
    }

    // 检查是否处于等待继续状态
    if (workflow.status !== 'waiting') {
      return NextResponse.json({
        success: false,
        error: `Workflow is not waiting for continue. Current status: ${workflow.status}`
      }, { status: 400 });
    }

    // 更新状态为 running，触发后台继续执行
    const { error: updateError } = await supabaseServer
      .from('workflow_histories')
      .update({ status: 'running' })
      .eq('id', historyId);

    if (updateError) {
      throw new Error('Failed to update workflow status');
    }

    // Get base URL from request headers
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const baseUrl = `${protocol}://${host}`;

    // 触发后台继续处理
    continueWorkflowInBackground(historyId, apiKey, workflow, baseUrl).catch(err =>
      console.error('[Workflow] Continue background error:', err)
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as Error;
    console.error('Continue workflow error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// 后台继续处理工作流
async function continueWorkflowInBackground(
  historyId: number,
  apiKey: string,
  workflow: {
    workflow_stage: string;
    workflow_config: {
      scriptPrompt?: string;
      selectedModel?: string;
      videoGenerationMode?: string;
      imageSize?: string;
    };
    video_url?: string;
    script_result?: string;
    characters: Array<{
      id: string;
      name: string;
      description: string;
      imagePrompt: string;
      status: string;
      imageUrl?: string;
      error?: string;
    }>;
    scenes: Array<{
      id: number;
      imagePrompt: string;
      videoPrompt: string;
      imageStatus: string;
      imageUrl?: string;
      error?: string;
    }>;
    videos: Array<{
      id: string;
      index: number;
      prompt: string;
      firstFrame: string;
      lastFrame?: string; // 收尾帧（可选）
      status: string;
      taskId?: string;
      videoUrl?: string;
      error?: string;
    }>;
  },
  baseUrl: string
) {
  const API_BASE_URL = 'https://gptproto.com';
  const config = workflow.workflow_config;

  try {
    console.log(`[Workflow ${historyId}] Continuing from stage: ${workflow.workflow_stage}`);

    const checkStopped = async () => {
      const { data } = await supabaseServer
        .from('workflow_histories')
        .select('status')
        .eq('id', historyId)
        .single();
      return data?.status === 'stopped';
    };

    const updateStage = async (stage: string, data?: Record<string, unknown>) => {
      await supabaseServer
        .from('workflow_histories')
        .update({ workflow_stage: stage, ...data })
        .eq('id', historyId);
    };

    const setWaiting = async (stage: string, data?: Record<string, unknown>) => {
      await supabaseServer
        .from('workflow_histories')
        .update({ status: 'waiting', workflow_stage: stage, ...data })
        .eq('id', historyId);
    };

    let { characters, scenes, videos } = workflow;
    const currentStage = workflow.workflow_stage;

    // 根据当前阶段继续执行
    if (currentStage === 'script_done' || currentStage === 'parsing_done') {
      // 继续到生成角色图片 - 并行批量生成
      console.log(`[Workflow ${historyId}] Stage: characters (parallel)`);
      await updateStage('characters');

      // 先标记所有待生成的为 generating 状态
      const pendingChars = characters.filter(c => c.status !== 'done');
      pendingChars.forEach(c => { c.status = 'generating'; });
      await updateStage('characters', { characters });

      // 并行生成所有角色图片
      const generateCharacter = async (char: typeof characters[0], index: number) => {
        if (await checkStopped()) {
          char.status = 'error';
          char.error = 'Stopped';
          // 立即更新数据库
          await supabaseServer
            .from('workflow_histories')
            .update({ characters })
            .eq('id', historyId);
          return;
        }

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
              aspect_ratio: '1:1',
              size: config.imageSize || '1K',
            }),
          });

          const imgData = await imgResponse.json();

          if (imgData.id || imgData.data?.id) {
            const taskId = imgData.id || imgData.data?.id;
            const pollResult = await pollTaskResult(taskId, apiKey, API_BASE_URL);
            if (pollResult.imageUrl) {
              char.imageUrl = pollResult.imageUrl;
              char.status = 'done';
            } else {
              char.status = 'error';
              char.error = pollResult.error;
            }
          } else {
            char.imageUrl = imgData.data?.image_url || imgData.image_url;
            char.status = char.imageUrl ? 'done' : 'error';
          }
        } catch (err) {
          char.status = 'error';
          char.error = (err as Error).message;
        }

        // 每张图片生成完成后立即更新数据库
        await supabaseServer
          .from('workflow_histories')
          .update({ characters })
          .eq('id', historyId);
        console.log(`[Workflow ${historyId}] Character ${char.name} ${char.status}, updated database`);
      };

      // 使用 Promise.all 并行执行所有角色图片生成
      await Promise.all(
        characters.map((char, index) =>
          char.status === 'generating' ? generateCharacter(char, index) : Promise.resolve()
        )
      );

      // 角色图片完成，等待用户继续
      await setWaiting('characters_done', { characters });
      console.log(`[Workflow ${historyId}] Characters done (${characters.filter(c => c.status === 'done').length}/${characters.length}), waiting for continue`);
      return;
    }

    if (currentStage === 'characters_done') {
      // 继续到生成场景图片 - 并行批量生成
      console.log(`[Workflow ${historyId}] Stage: scenes (parallel)`);
      await updateStage('scenes');

      // 收集所有已完成角色的参考图 URL
      const characterImageUrls = characters
        .filter(c => c.status === 'done' && c.imageUrl)
        .map(c => c.imageUrl!);

      console.log(`[Workflow ${historyId}] Using ${characterImageUrls.length} character reference images for scene generation`);

      // 先标记所有待生成的为 generating 状态
      const pendingScenes = scenes.filter(s => s.imageStatus !== 'done');
      pendingScenes.forEach(s => { s.imageStatus = 'generating'; });
      await updateStage('scenes', { scenes });

      // 并行生成所有场景图片
      const generateScene = async (scene: typeof scenes[0], index: number) => {
        if (await checkStopped()) {
          scene.imageStatus = 'error';
          scene.error = 'Stopped';
          // 立即更新数据库
          await supabaseServer
            .from('workflow_histories')
            .update({ scenes })
            .eq('id', historyId);
          return;
        }

        try {
          console.log(`[Workflow ${historyId}] Generating scene ${index}: ${scene.id}`);

          // 使用 image-edit API 并带上角色参考图
          const imgResponse = await fetch(`${API_BASE_URL}/api/v3/google/gemini-3-pro-image-preview/image-edit`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              prompt: scene.imagePrompt,
              image: characterImageUrls, // 角色参考图作为输入
              aspect_ratio: '9:16',
              size: config.imageSize || '1080p',
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
          }
        } catch (err) {
          scene.imageStatus = 'error';
          scene.error = (err as Error).message;
        }

        // 每张图片生成完成后立即更新数据库
        await supabaseServer
          .from('workflow_histories')
          .update({ scenes })
          .eq('id', historyId);
        console.log(`[Workflow ${historyId}] Scene ${scene.id} ${scene.imageStatus}, updated database`);
      };

      // 使用 Promise.all 并行执行所有场景图片生成
      await Promise.all(
        scenes.map((scene, index) =>
          scene.imageStatus === 'generating' ? generateScene(scene, index) : Promise.resolve()
        )
      );

      // 场景图片完成，等待用户继续
      await setWaiting('scenes_done', { scenes });
      console.log(`[Workflow ${historyId}] Scenes done (${scenes.filter(s => s.imageStatus === 'done').length}/${scenes.length}), waiting for continue`);
      return;
    }

    if (currentStage === 'scenes_done') {
      // 继续到生成视频 - 并行批量生成
      console.log(`[Workflow ${historyId}] Stage: videos (parallel)`);
      await updateStage('videos');

      // 获取视频模型配置
      const selectedModel = config.selectedModel || DEFAULT_VIDEO_MODEL;
      const modelConfig = VIDEO_MODELS[selectedModel] || VIDEO_MODELS[DEFAULT_VIDEO_MODEL];
      const videoGenerationMode = config.videoGenerationMode || 'single-image';
      console.log(`[Workflow ${historyId}] Using video model: ${selectedModel}, mode: ${videoGenerationMode}`);

      // 创建视频任务（如果还没有）
      if (!videos || videos.length === 0) {
        const completedScenes = scenes.filter((s) => s.imageUrl);
        videos = completedScenes.map((s, i) => {
          const nextScene = completedScenes[i + 1];
          return {
            id: `video-${i}`,
            index: i,
            prompt: s.videoPrompt,
            firstFrame: s.imageUrl!,
            // 根据视频生成模式决定是否使用收尾帧
            lastFrame: videoGenerationMode === 'first-last-frame' ? nextScene?.imageUrl : undefined,
            status: 'pending',
          };
        });
        await updateStage('videos', { videos });
      }

      // 先标记所有待生成的为 submitting 状态
      const pendingVideos = videos.filter(v => v.status !== 'done');
      pendingVideos.forEach(v => { v.status = 'submitting'; });
      await updateStage('videos', { videos });

      // 并行生成所有视频
      const generateSingleVideo = async (video: typeof videos[0], index: number) => {
        if (await checkStopped()) {
          video.status = 'error';
          video.error = 'Stopped';
          return;
        }

        try {
          // 构建请求体 - 使用正确的参数名 'image' 而不是 'image_url'
          const requestBody: Record<string, unknown> = {
            prompt: video.prompt,
            image: video.firstFrame,
            ...modelConfig.defaultParams,
          };

          // 添加收尾帧（如果存在且模型支持）
          if (video.lastFrame && modelConfig.lastFrameKey) {
            requestBody[modelConfig.lastFrameKey] = video.lastFrame;
            console.log(`[Workflow ${historyId}] Video ${video.id} using last frame with key: ${modelConfig.lastFrameKey}`);
          }

          console.log(`[Workflow ${historyId}] Submitting video ${video.id} to ${modelConfig.url}`);
          console.log(`[Workflow ${historyId}] Video ${video.id} request body:`, JSON.stringify(requestBody).substring(0, 500));

          const videoResponse = await fetch(modelConfig.url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          const videoData = await videoResponse.json();
          console.log(`[Workflow ${historyId}] Video ${video.id} response:`, JSON.stringify(videoData).substring(0, 200));

          // 检查响应状态
          if (!videoResponse.ok || (videoData.code && videoData.code !== 200)) {
            throw new Error(videoData.error?.message || videoData.message || `Request failed: ${videoResponse.status}`);
          }

          const taskId = videoData.data?.id || videoData.id || null;

          if (taskId) {
            video.taskId = taskId;
            video.status = 'polling';

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
          console.error(`[Workflow ${historyId}] Video ${video.id} error:`, err);
        }
      };

      // 使用 Promise.all 并行执行所有视频生成
      await Promise.all(
        videos.map((video, index) =>
          video.status === 'submitting' ? generateSingleVideo(video, index) : Promise.resolve()
        )
      );

      // 更新最终状态
      await updateStage('videos', { videos });

      // 检查是否所有视频都生成成功
      const successVideos = videos.filter((v) => v.status === 'done');
      console.log(`[Workflow ${historyId}] Videos generation completed: ${successVideos.length}/${videos.length} success`);

      if (successVideos.length === 0) {
        // 没有成功的视频，标记为失败
        await supabaseServer
          .from('workflow_histories')
          .update({
            status: 'failed',
            workflow_stage: 'error',
            videos,
          })
          .eq('id', historyId);
        console.log(`[Workflow ${historyId}] No videos generated successfully, marking as failed`);
        return;
      }

      // ========== 合成视频 ==========
      console.log(`[Workflow ${historyId}] Stage: merging videos`);
      await updateStage('merging', { videos });

      try {
        // IMPORTANT: Re-fetch the latest videos from database before merging
        // This ensures we use the most recent video URLs if any videos were retried
        const { data: latestWorkflow, error: refetchError } = await supabaseServer
          .from('workflow_histories')
          .select('videos')
          .eq('id', historyId)
          .single();

        if (refetchError || !latestWorkflow) {
          throw new Error('Failed to fetch latest video data before merge');
        }

        const latestVideos = latestWorkflow.videos || [];

        // 收集所有成功生成的视频 URL，按 index 排序
        const latestSuccessVideos = latestVideos.filter((v: { status: string; videoUrl?: string }) => v.status === 'done' && v.videoUrl);
        const videoUrls = latestSuccessVideos
          .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
          .map((v: { videoUrl: string }) => v.videoUrl!)
          .filter((url: string) => url);

        if (videoUrls.length === 0) {
          throw new Error('No valid video URLs to merge');
        }

        console.log(`[Workflow ${historyId}] Merging ${videoUrls.length} videos...`);

        // 调用合成视频 API（本地 API）
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

        // 完成
        await supabaseServer
          .from('workflow_histories')
          .update({
            status: 'completed',
            workflow_stage: 'completed',
            videos,
            merged_video_url: mergedVideoUrl,
          })
          .eq('id', historyId);

        console.log(`[Workflow ${historyId}] Workflow completed with merged video`);

      } catch (mergeError) {
        console.error(`[Workflow ${historyId}] Video merge failed:`, mergeError);

        // 合成失败，但视频已生成，标记为 partial
        const finalStatus = successVideos.length < videos.length ? 'partial' : 'completed';
        await supabaseServer
          .from('workflow_histories')
          .update({
            status: finalStatus,
            workflow_stage: 'completed',
            videos,
          })
          .eq('id', historyId);

        console.log(`[Workflow ${historyId}] Completed with status: ${finalStatus} (merge failed)`);
      }

      return;
    }

  } catch (error) {
    console.error(`[Workflow ${historyId}] Continue error:`, error);

    await supabaseServer
      .from('workflow_histories')
      .update({
        status: 'failed',
        workflow_stage: 'error',
      })
      .eq('id', historyId);
  }
}

// 轮询图片任务结果
async function pollTaskResult(
  taskId: string,
  apiKey: string,
  apiBaseUrl: string
): Promise<{ imageUrl?: string; error?: string }> {
  const MAX_ATTEMPTS = 120; // Increased from 60 to 120 (6 minutes total)
  const POLL_INTERVAL = 3000;

  console.log(`[Poll] Starting to poll image task ${taskId}`);

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v3/predictions/${taskId}/result`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      const data = await response.json();
      const result = data.data || data;

      if (i % 10 === 0) {
        console.log(`[Poll] Image task ${taskId} attempt ${i + 1}/${MAX_ATTEMPTS} - Status: ${result.status}`);
      }

      if (result.status === 'succeeded' || result.status === 'completed') {
        const imageUrl = result.output?.image_url || result.image_url || result.outputs?.[0];
        console.log(`[Poll] Image task ${taskId} succeeded`);
        return { imageUrl };
      } else if (result.status === 'failed' || result.status === 'error') {
        console.log(`[Poll] Image task ${taskId} failed: ${result.error}`);
        return { error: result.error || 'Task failed' };
      }
    } catch (err) {
      if (i % 10 === 0) {
        console.log(`[Poll] Image task ${taskId} attempt ${i + 1} error: ${(err as Error).message}`);
      }
      // Continue polling
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }

  console.log(`[Poll] Image task ${taskId} polling timeout after ${MAX_ATTEMPTS} attempts`);
  return { error: 'Polling timeout' };
}

// 轮询视频任务结果
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
