import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hashApiKey, GEMINI_IMAGE_API, TASK_API } from '../config';

// 轮询间隔
const POLL_INTERVAL = 3000;
// 最大轮询次数
const MAX_POLL_ATTEMPTS = 60;

// 任务结构
interface TaskItem {
  index: number;
  filename: string;
  originalUrl: string | null;
  prompt: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  generatedUrl: string | null;
  error: string | null;
}

// 执行单个图像生成任务
async function executeImageTask(
  task: TaskItem,
  apiKey: string,
  mode: string,
  aspectRatio: string,
  imageSize: string
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  try {
    const isTextToImage = mode === 'text-to-image';
    const url = isTextToImage ? GEMINI_IMAGE_API.TEXT_TO_IMAGE.url : GEMINI_IMAGE_API.IMAGE_TO_EDIT.url;

    const requestBody: Record<string, unknown> = {
      prompt: task.prompt,
      aspect_ratio: aspectRatio,
      size: imageSize,
      enable_base64_output: false,
      enable_sync_mode: false,
      output_format: 'png',
    };

    if (!isTextToImage && task.originalUrl) {
      requestBody.images = [task.originalUrl];
      requestBody.n = 1;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || `Request failed: ${response.status}`);
    }

    // 检查是否是异步任务
    const taskId = data.id || data.data?.id;
    if (taskId) {
      const pollResult = await pollTaskResult(taskId, apiKey);
      if (pollResult.imageUrl) {
        return { success: true, imageUrl: pollResult.imageUrl };
      } else {
        return { success: false, error: pollResult.error || 'Polling failed' };
      }
    }

    // 同步返回结果
    const imageUrl = data.data?.image_url || data.image_url || data.output?.image_url || '';
    if (!imageUrl) {
      throw new Error('Failed to get image URL');
    }

    return { success: true, imageUrl };

  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

// 轮询任务结果
async function pollTaskResult(
  taskId: string,
  apiKey: string
): Promise<{ imageUrl?: string; error?: string }> {
  let attempts = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    try {
      const response = await fetch(TASK_API.getResultUrl(taskId), {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      const data = await response.json();
      const result = data.data || data;
      const status = result.status;

      if (status === 'succeeded' || status === 'completed') {
        const imageUrl = result.output?.image_url || result.image_url || result.outputs?.[0];
        return { imageUrl };
      } else if (status === 'failed' || status === 'error') {
        return { error: result.error || 'Task failed' };
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      attempts++;

    } catch {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      attempts++;
    }
  }

  return { error: 'Polling timeout' };
}

// 更新 history 中的任务状态
async function updateTaskInHistory(
  historyId: number,
  taskIndex: number,
  update: Partial<TaskItem>
) {
  // 获取当前 history
  const { data: history, error: fetchError } = await supabaseServer
    .from('workflow_histories')
    .select('tasks, success_count, error_count')
    .eq('id', historyId)
    .single();

  if (fetchError || !history) return;

  // 更新任务
  const tasks = (history.tasks as TaskItem[]) || [];
  const taskToUpdate = tasks.find(t => t.index === taskIndex);
  if (taskToUpdate) {
    Object.assign(taskToUpdate, update);
  }

  // 统计
  const successCount = tasks.filter(t => t.status === 'done').length;
  const errorCount = tasks.filter(t => t.status === 'error').length;

  await supabaseServer
    .from('workflow_histories')
    .update({
      tasks,
      success_count: successCount,
      error_count: errorCount,
    })
    .eq('id', historyId);
}

// 后台执行所有任务（不阻塞响应）
async function processTasksInBackground(
  historyId: number,
  apiKey: string,
  mode: string,
  aspectRatio: string,
  imageSize: string
) {
  const MAX_CONCURRENT = 5;

  try {
    // 获取 history
    const { data: history, error: fetchError } = await supabaseServer
      .from('workflow_histories')
      .select('*')
      .eq('id', historyId)
      .single();

    if (fetchError || !history) {
      console.log('[Background] History not found');
      return;
    }

    const tasks = (history.tasks as TaskItem[]) || [];
    const pendingTasks = tasks.filter(t => t.status === 'pending');

    if (pendingTasks.length === 0) {
      console.log('[Background] No tasks to process');
      return;
    }

    console.log(`[Background] Processing ${pendingTasks.length} tasks for history ${historyId}`);

    // 分批处理
    for (let i = 0; i < pendingTasks.length; i += MAX_CONCURRENT) {
      // 检查是否被停止
      const { data: currentHistory } = await supabaseServer
        .from('workflow_histories')
        .select('status')
        .eq('id', historyId)
        .single();

      if (currentHistory?.status === 'stopped') {
        console.log('[Background] Task stopped by user');
        break;
      }

      const batch = pendingTasks.slice(i, i + MAX_CONCURRENT);

      // 标记为 processing
      for (const task of batch) {
        await updateTaskInHistory(historyId, task.index, { status: 'processing' });
      }

      // 并发执行
      await Promise.all(
        batch.map(async (task) => {
          const result = await executeImageTask(task, apiKey, mode, aspectRatio, imageSize);

          if (result.success && result.imageUrl) {
            await updateTaskInHistory(historyId, task.index, {
              status: 'done',
              generatedUrl: result.imageUrl,
              error: null,
            });
          } else {
            await updateTaskInHistory(historyId, task.index, {
              status: 'error',
              error: result.error || 'Unknown error',
            });
          }
        })
      );

      console.log(`[Background] Batch ${Math.floor(i / MAX_CONCURRENT) + 1} completed`);
    }

    // 获取最终状态
    const { data: finalHistory } = await supabaseServer
      .from('workflow_histories')
      .select('tasks, total_count')
      .eq('id', historyId)
      .single();

    if (finalHistory) {
      const finalTasks = (finalHistory.tasks as TaskItem[]) || [];
      const successCount = finalTasks.filter(t => t.status === 'done').length;
      const errorCount = finalTasks.filter(t => t.status === 'error').length;
      const totalCount = finalHistory.total_count;

      const finalStatus = errorCount === totalCount ? 'failed' : (errorCount > 0 ? 'partial' : 'completed');

      await supabaseServer
        .from('workflow_histories')
        .update({
          status: finalStatus,
          success_count: successCount,
          error_count: errorCount,
        })
        .eq('id', historyId);

      console.log(`[Background] History ${historyId} completed: ${successCount} success, ${errorCount} error`);
    }

  } catch (error) {
    console.error('[Background] Error:', error);

    // 发生错误时更新状态为 failed
    await supabaseServer
      .from('workflow_histories')
      .update({ status: 'failed' })
      .eq('id', historyId);
  }
}

// POST /api/tasks/start - 启动新任务
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      apiKey,
      title,
      mode,
      tasks: inputTasks,
      aspectRatio = '9:16',
      imageSize = '1K'
    } = body;

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API Key is required' }, { status: 401 });
    }

    if (!title || !mode || !inputTasks || !Array.isArray(inputTasks) || inputTasks.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid request parameters' }, { status: 400 });
    }

    const userApiKey = hashApiKey(apiKey);

    // 构建任务列表 (JSONB 格式)
    const tasks: TaskItem[] = inputTasks.map((task: {
      filename?: string;
      originalUrl?: string;
      prompt: string
    }, index: number) => ({
      index,
      filename: task.filename || `Generated ${index + 1}`,
      originalUrl: task.originalUrl || null,
      prompt: task.prompt,
      status: 'pending' as const,
      generatedUrl: null,
      error: null,
    }));

    // 创建历史记录（包含任务列表）
    const { data: history, error: historyError } = await supabaseServer
      .from('workflow_histories')
      .insert({
        user_api_key: userApiKey,
        title,
        type: 'image-gen',
        mode,
        aspect_ratio: aspectRatio,
        image_size: imageSize,
        tasks,
        total_count: tasks.length,
        success_count: 0,
        error_count: 0,
        status: 'running',
      })
      .select('id')
      .single();

    if (historyError || !history) {
      throw new Error(`Failed to create history: ${historyError?.message}`);
    }

    // 启动后台任务（不等待完成）
    processTasksInBackground(history.id, apiKey, mode, aspectRatio, imageSize)
      .catch(err => console.error('[Start API] Background task error:', err));

    return NextResponse.json({
      success: true,
      historyId: history.id,
      totalTasks: tasks.length,
    });

  } catch (error) {
    const err = error as Error;
    console.error('Start task error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
