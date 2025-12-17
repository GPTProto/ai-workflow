import type { ImageEditModelId, ImageTextToImageModelId, VideoModelId } from '@/config/api';
import { getDefaultVideoModel } from '@/config/api';
import {
  imageToEditWithModelAPI,
  pollImageResultAPI,
  pollVideoResultAPI,
  submitVideoTaskAPI,
  textToImageWithModelAPI,
} from '@/services/api';
import type { VideoItem } from '@/types/workflow';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiKey } from './useApiKey';

export interface WorkflowProgress {
  stage: string;
  percent: number;
  charactersTotal: number;
  charactersDone: number;
  scenesTotal: number;
  scenesDone: number;
  videosTotal: number;
  videosDone: number;
}

export interface WorkflowData {
  id: number;
  title: string;
  status: string;
  stage: string;
  videoUrl?: string;
  scriptResult?: string;
  characters: Array<{
    id: string;
    name: string;
    description?: string;
    imagePrompt: string;
    status: string;
    imageUrl?: string;
    taskId?: string;
    error?: string;
  }>;
  scenes: Array<{
    id: number;
    imagePrompt: string;
    videoPrompt?: string;
    imageStatus: string;
    imageUrl?: string;
    taskId?: string;
    error?: string;
  }>;
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
  mergedVideoUrl?: string;
  chatMessages?: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    scriptData?: unknown;
    stageNotification?: {
      stage: 'characters_done' | 'scenes_done' | 'videos_done';
      title: string;
      description: string;
      actionLabel: string;
    };
    suggestedPrompt?: {
      type: 'character' | 'scene';
      index: number;
      name: string;
      prompt: string;
      videoPrompt?: string;
      isCreate?: boolean;
    };
  }>;
  // 工作流配置
  videoGenerationMode?: string;
  selectedModel?: string;
  imageSize?: string;
}

export function useBackgroundWorkflow() {
  const { apiKey } = useApiKey();
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);
  const [progress, setProgress] = useState<WorkflowProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const POLL_INTERVAL = 2000;

  // Reference for stopping generation
  const isGeneratingRef = useRef(false);

  // Track active generation task count to prevent premature stopping
  const activeTaskCountRef = useRef(0);

  // Track if we're already resuming to prevent duplicate resume calls
  const isResumingRef = useRef(false);

  // Track if client-side generation is in progress to prevent fetchStatus from overwriting local state
  const isClientGeneratingRef = useRef(false);

  // 停止轮询
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Resume polling for tasks based on workflow data
  const resumePendingTasksFromData = useCallback(async (
    workflowData: WorkflowData,
    currentHistoryId: number
  ) => {
    // Prevent duplicate resume calls
    if (isResumingRef.current) {
      console.log('[Resume] Already resuming, skipping...');
      return false;
    }

    const characters = workflowData.characters || [];
    const scenes = workflowData.scenes || [];
    const videos = workflowData.videos || [];

    // Find items with taskId that are still generating
    const pendingCharacters = characters.filter(c => c.status === 'generating' && c.taskId);
    const pendingScenes = scenes.filter(s => s.imageStatus === 'generating' && s.taskId);
    const pendingVideos = videos.filter(v => (v.status === 'submitting' || v.status === 'polling') && v.taskId);

    if (pendingCharacters.length === 0 && pendingScenes.length === 0 && pendingVideos.length === 0) {
      return false;
    }

    console.log('[Resume] Auto-resuming pending tasks from fetched data:', {
      characters: pendingCharacters.length,
      scenes: pendingScenes.length,
      videos: pendingVideos.length,
    });

    isResumingRef.current = true;
    isGeneratingRef.current = true;

    // Resume character polling
    const resumeCharacterPolling = async (charIndex: number, taskId: string) => {
      console.log(`[Resume] Resuming character ${charIndex} polling for taskId: ${taskId}`);
      try {
        const result = await pollImageResultAPI(taskId, () => isGeneratingRef.current);
        if (result.imageUrl) {
          await fetch('/api/workflow/update-item', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              historyId: currentHistoryId,
              type: 'character',
              index: charIndex,
              data: { status: 'done', imageUrl: result.imageUrl },
            }),
          });
        } else {
          await fetch('/api/workflow/update-item', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              historyId: currentHistoryId,
              type: 'character',
              index: charIndex,
              data: { status: 'error', error: result.error || 'Generation failed' },
            }),
          });
        }
      } catch (err) {
        console.error(`[Resume] Character ${charIndex} polling error:`, err);
        await fetch('/api/workflow/update-item', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            historyId: currentHistoryId,
            type: 'character',
            index: charIndex,
            data: { status: 'error', error: (err as Error).message },
          }),
        });
      }
    };

    // Resume scene polling
    const resumeScenePolling = async (sceneIndex: number, taskId: string) => {
      console.log(`[Resume] Resuming scene ${sceneIndex} polling for taskId: ${taskId}`);
      try {
        const result = await pollImageResultAPI(taskId, () => isGeneratingRef.current);
        if (result.imageUrl) {
          await fetch('/api/workflow/update-item', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              historyId: currentHistoryId,
              type: 'scene',
              index: sceneIndex,
              data: { status: 'done', imageUrl: result.imageUrl },
            }),
          });
        } else {
          await fetch('/api/workflow/update-item', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              historyId: currentHistoryId,
              type: 'scene',
              index: sceneIndex,
              data: { status: 'error', error: result.error || 'Generation failed' },
            }),
          });
        }
      } catch (err) {
        console.error(`[Resume] Scene ${sceneIndex} polling error:`, err);
        await fetch('/api/workflow/update-item', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            historyId: currentHistoryId,
            type: 'scene',
            index: sceneIndex,
            data: { status: 'error', error: (err as Error).message },
          }),
        });
      }
    };

    // Resume video polling
    const resumeVideoPolling = async (videoIndex: number, taskId: string) => {
      console.log(`[Resume] Resuming video ${videoIndex} polling for taskId: ${taskId}`);
      try {
        const result = await pollVideoResultAPI(taskId, () => isGeneratingRef.current);
        if (result.videoUrl) {
          await fetch('/api/workflow/update-item', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              historyId: currentHistoryId,
              type: 'video',
              index: videoIndex,
              data: { status: 'done', videoUrl: result.videoUrl },
            }),
          });
        } else {
          await fetch('/api/workflow/update-item', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              historyId: currentHistoryId,
              type: 'video',
              index: videoIndex,
              data: { status: 'error', error: result.error || 'Generation failed' },
            }),
          });
        }
      } catch (err) {
        console.error(`[Resume] Video ${videoIndex} polling error:`, err);
        await fetch('/api/workflow/update-item', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            historyId: currentHistoryId,
            type: 'video',
            index: videoIndex,
            data: { status: 'error', error: (err as Error).message },
          }),
        });
      }
    };

    // Run all resumptions in parallel
    const promises: Promise<void>[] = [];

    pendingCharacters.forEach((char) => {
      if (!char.taskId) return;
      const originalIndex = characters.findIndex((c) => c.taskId === char.taskId);
      if (originalIndex !== -1) {
        promises.push(resumeCharacterPolling(originalIndex, char.taskId));
      }
    });

    pendingScenes.forEach((scene) => {
      if (!scene.taskId) return;
      const originalIndex = scenes.findIndex((s) => s.taskId === scene.taskId);
      if (originalIndex !== -1) {
        promises.push(resumeScenePolling(originalIndex, scene.taskId));
      }
    });

    pendingVideos.forEach((video) => {
      if (!video.taskId) return;
      const originalIndex = videos.findIndex((v) => v.taskId === video.taskId);
      if (originalIndex !== -1) {
        promises.push(resumeVideoPolling(originalIndex, video.taskId));
      }
    });

    await Promise.all(promises);

    // Cleanup - only reset isResumingRef, don't touch isGeneratingRef
    // because other generation processes might be running
    isResumingRef.current = false;
    // Note: We intentionally do NOT set isGeneratingRef.current = false here
    // because generateCharacters/generateScenes might be running in parallel
    // The caller should manage isGeneratingRef based on their own lifecycle

    console.log('[Resume] All pending tasks from data completed');
    return true;
  }, [apiKey]);

  // 查询工作流状态
  const fetchStatus = useCallback(async (id: number, autoResume = true) => {
    if (!apiKey) return null;

    try {
      const response = await fetch(`/api/workflow/status?historyId=${id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[FetchStatus] API error:', response.status, errorData);
        throw new Error(errorData.error || `Failed to fetch workflow status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        // 记录角色状态变化
        const charStatuses = data.workflow.characters?.map((c: { name: string; status: string; imageUrl?: string }) => ({
          name: c.name,
          status: c.status,
          hasImageUrl: !!c.imageUrl,
        })) || [];
        console.log('[FetchStatus] Characters status from API:', charStatuses);

        // 记录场景状态变化
        const sceneStatuses = data.workflow.scenes?.map((s: { id: number; imageStatus: string; imageUrl?: string }) => ({
          id: s.id,
          imageStatus: s.imageStatus,
          hasImageUrl: !!s.imageUrl,
        })) || [];
        console.log('[FetchStatus] Scenes status from API:', sceneStatuses);

        console.log('[FetchStatus] Calling setWorkflow with updated data, isClientGenerating:', isClientGeneratingRef.current);

        // IMPORTANT: Skip overwriting local state if client-side generation is in progress
        // This prevents stale server data from overwriting local state updates from updateItemStatus
        if (isClientGeneratingRef.current) {
          console.log('[FetchStatus] Skipping setWorkflow - client-side generation in progress');
        } else {
          setWorkflow(data.workflow);
        }
        setProgress(data.progress);

        console.log('[FetchStatus] Workflow status:', data.workflow.status, 'stage:', data.workflow.stage, 'autoResume:', autoResume);

        // 检查是否完成
        if (['completed', 'partial', 'failed', 'stopped'].includes(data.workflow.status)) {
          console.log('[FetchStatus] Workflow completed/failed/stopped, setting isRunning=false');
          setIsRunning(false);
          stopPolling();
          // 清除 localStorage
          localStorage.removeItem('running_workflow_id');
        } else if (data.workflow.status === 'waiting' || data.workflow.status === 'running') {
          // running 或 waiting 状态都需要检查是否有需要恢复的任务
          if (data.workflow.status === 'waiting') {
            // 等待用户继续状态 - 停止轮询
            console.log('[FetchStatus] Workflow waiting, setting isRunning=false');
            setIsRunning(false);
            stopPolling();
          }

          // 检查是否有正在生成中的任务需要恢复
          if (autoResume) {
            // 有 taskId 的 generating 状态 → 恢复轮询
            const hasPendingTasksWithId =
              data.workflow.characters?.some((c: { status: string; taskId?: string }) => c.status === 'generating' && c.taskId) ||
              data.workflow.scenes?.some((s: { imageStatus: string; taskId?: string }) => s.imageStatus === 'generating' && s.taskId) ||
              data.workflow.videos?.some((v: { status: string; taskId?: string }) => (v.status === 'submitting' || v.status === 'polling') && v.taskId);

            // 没有 taskId 的 generating 状态 → 需要重置为 pending
            const stuckCharacters = data.workflow.characters?.filter((c: { status: string; taskId?: string }) => c.status === 'generating' && !c.taskId) || [];
            const stuckScenes = data.workflow.scenes?.filter((s: { imageStatus: string; taskId?: string }) => s.imageStatus === 'generating' && !s.taskId) || [];
            const stuckVideos = data.workflow.videos?.filter((v: { status: string; taskId?: string }) => (v.status === 'submitting' || v.status === 'polling') && !v.taskId) || [];

            // 先重置没有 taskId 的 stuck 任务为 error（让用户手动重试）
            if (stuckCharacters.length > 0 || stuckScenes.length > 0 || stuckVideos.length > 0) {
              console.log('[FetchStatus] Found stuck tasks without taskId, resetting to error:', {
                characters: stuckCharacters.length,
                scenes: stuckScenes.length,
                videos: stuckVideos.length,
              });

              // 先立即更新本地状态，让 UI 立即渲染 error 状态
              const updatedWorkflow = { ...data.workflow };

              // 更新 characters
              if (stuckCharacters.length > 0) {
                updatedWorkflow.characters = data.workflow.characters.map((c: { status: string; taskId?: string }) => {
                  if (c.status === 'generating' && !c.taskId) {
                    return { ...c, status: 'error', error: 'Generation interrupted, please retry' };
                  }
                  return c;
                });
              }

              // 更新 scenes
              if (stuckScenes.length > 0) {
                updatedWorkflow.scenes = data.workflow.scenes.map((s: { imageStatus: string; taskId?: string }) => {
                  if (s.imageStatus === 'generating' && !s.taskId) {
                    return { ...s, imageStatus: 'error', error: 'Generation interrupted, please retry' };
                  }
                  return s;
                });
              }

              // 更新 videos
              if (stuckVideos.length > 0) {
                updatedWorkflow.videos = data.workflow.videos.map((v: { status: string; taskId?: string }) => {
                  if ((v.status === 'submitting' || v.status === 'polling') && !v.taskId) {
                    return { ...v, status: 'error', error: 'Generation interrupted, please retry' };
                  }
                  return v;
                });
              }

              // 立即更新本地状态
              setWorkflow(updatedWorkflow);

              // 然后异步更新服务器状态
              const resetPromises: Promise<Response>[] = [];
              stuckCharacters.forEach((char: { status: string }) => {
                const charIndex = data.workflow.characters.findIndex((c: { status: string; taskId?: string }) => c === char);
                if (charIndex !== -1) {
                  resetPromises.push(fetch('/api/workflow/update-item', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${apiKey}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      historyId: id,
                      type: 'character',
                      index: charIndex,
                      data: { status: 'error', error: 'Generation interrupted, please retry' },
                    }),
                  }));
                }
              });
              stuckScenes.forEach((scene: { imageStatus: string }) => {
                const sceneIndex = data.workflow.scenes.findIndex((s: { imageStatus: string; taskId?: string }) => s === scene);
                if (sceneIndex !== -1) {
                  resetPromises.push(fetch('/api/workflow/update-item', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${apiKey}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      historyId: id,
                      type: 'scene',
                      index: sceneIndex,
                      data: { status: 'error', error: 'Generation interrupted, please retry' },
                    }),
                  }));
                }
              });
              stuckVideos.forEach((video: { status: string }) => {
                const videoIndex = data.workflow.videos.findIndex((v: { status: string; taskId?: string }) => v === video);
                if (videoIndex !== -1) {
                  resetPromises.push(fetch('/api/workflow/update-item', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${apiKey}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      historyId: id,
                      type: 'video',
                      index: videoIndex,
                      data: { status: 'error', error: 'Generation interrupted, please retry' },
                    }),
                  }));
                }
              });

              // 异步更新服务器，不阻塞，也不需要再刷新本地状态
              Promise.all(resetPromises).catch(err => {
                console.error('[FetchStatus] Failed to update stuck tasks on server:', err);
              });
            }

            // 恢复有 taskId 的任务
            if (hasPendingTasksWithId && !isResumingRef.current) {
              console.log('[FetchStatus] Detected pending tasks with taskId, auto-resuming... (workflow status:', data.workflow.status, ')');
              console.log('[FetchStatus] Counter before resume:', activeTaskCountRef.current);
              setIsRunning(true);
              isGeneratingRef.current = true;
              activeTaskCountRef.current += 1; // Increment for resume operation
              console.log('[FetchStatus] Counter after increment:', activeTaskCountRef.current);
              // 异步恢复，不阻塞当前函数返回
              resumePendingTasksFromData(data.workflow, id).then(async (resumed) => {
                if (resumed) {
                  // 恢复完成后刷新状态
                  const latestResponse = await fetch(`/api/workflow/status?historyId=${id}`, {
                    headers: { 'Authorization': `Bearer ${apiKey}` },
                  });
                  if (latestResponse.ok) {
                    const latestData = await latestResponse.json();
                    if (latestData.success) {
                      setWorkflow(latestData.workflow);
                      setProgress(latestData.progress);
                    }
                  }
                  // Resume completed, decrement counter and check if safe to reset
                  console.log('[FetchStatus] Resume completed, counter before decrement:', activeTaskCountRef.current);
                  activeTaskCountRef.current -= 1;
                  console.log('[FetchStatus] Counter after decrement:', activeTaskCountRef.current);
                  if (activeTaskCountRef.current <= 0) {
                    activeTaskCountRef.current = 0;
                    console.log('[FetchStatus] Counter is 0, setting isGeneratingRef.current = false');
                    isGeneratingRef.current = false;
                    setIsRunning(false);
                  }
                }
              });
            }
          }
        }

        return data;
      }
    } catch (err) {
      console.error('Fetch status error:', err);
      setError((err as Error).message);
    }

    return null;
  }, [apiKey, stopPolling, resumePendingTasksFromData]);

  // 启动工作流
  const startWorkflow = useCallback(async (params: {
    videoUrl?: string; // 可选，如果提供了 scriptData 则不需要
    title?: string;
    scriptPrompt?: string;
    selectedModel?: string;
    videoGenerationMode?: string;
    imageSize?: string;
    scriptData?: {
      characters: Array<{
        name: string;
        description?: string;
        imagePrompt?: string;
        RoleimagePrompt?: string;
      }>;
      scenes: Array<{
        id: number;
        imagePrompt: string;
        videoPrompt: string;
      }>;
    };
    chatMessages?: Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      timestamp: string;
      scriptData?: unknown;
      stageNotification?: unknown;
      suggestedPrompt?: unknown;
    }>;
  }) => {
    if (!apiKey) {
      setError('API Key is required');
      return null;
    }

    try {
      // 清空之前的工作流数据
      stopPolling();
      setHistoryId(null);
      setWorkflow(null);
      setProgress(null);
      setError(null);
      setIsRunning(true);
      localStorage.removeItem('running_workflow_id');

      const response = await fetch('/api/workflow/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey,
          ...params,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to start workflow');
      }

      const id = data.historyId;
      setHistoryId(id);

      // 保存到 localStorage
      localStorage.setItem('running_workflow_id', String(id));

      // 开始轮询
      // IMPORTANT: 使用 autoResume = false，避免周期性轮询触发 resumePendingTasksFromData
      // 从而导致正在进行的生成任务被意外停止
      pollingRef.current = setInterval(() => {
        fetchStatus(id, false);
      }, POLL_INTERVAL);

      // 立即获取一次状态（这里可以使用 autoResume = true，因为是首次加载）
      await fetchStatus(id);

      return id;

    } catch (err) {
      setError((err as Error).message);
      setIsRunning(false);
      return null;
    }
  }, [apiKey, fetchStatus]);

  // 停止工作流
  const stopWorkflow = useCallback(async () => {
    if (!historyId || !apiKey) return;

    // 立即停止所有正在进行的生成任务
    isGeneratingRef.current = false;
    activeTaskCountRef.current = 0; // Reset task count

    try {
      const response = await fetch('/api/workflow/stop', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ historyId }),
      });

      const data = await response.json();
      if (data.success) {
        setIsRunning(false);
        stopPolling();
        localStorage.removeItem('running_workflow_id');
        // 彻底清空工作流状态，防止旧数据同步到画布
        setHistoryId(null);
        setWorkflow(null);
        setProgress(null);
        setError(null);
      }
    } catch (err) {
      console.error('Stop workflow error:', err);
    }
  }, [historyId, apiKey, stopPolling]);

  // 继续执行下一步
  const continueWorkflow = useCallback(async () => {
    if (!historyId || !apiKey) return false;

    try {
      const response = await fetch('/api/workflow/continue', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ historyId }),
      });

      const data = await response.json();
      if (data.success) {
        setIsRunning(true);
        // 开始轮询
        if (!pollingRef.current) {
          pollingRef.current = setInterval(() => {
            fetchStatus(historyId, false); // 轮询时不触发 autoResume
          }, POLL_INTERVAL);
        }
        // 立即获取一次状态
        await fetchStatus(historyId);
        return true;
      } else {
        setError(data.error || 'Failed to continue workflow');
        return false;
      }
    } catch (err) {
      console.error('Continue workflow error:', err);
      setError((err as Error).message);
      return false;
    }
  }, [historyId, apiKey, fetchStatus]);

  // Reference to auto-resume generation
  const autoResumeRef = useRef<{
    characters: boolean;
    scenes: boolean;
    videos: boolean;
  } | null>(null);

  // 恢复运行中的工作流
  const restoreWorkflow = useCallback(async (): Promise<{
    success: boolean;
    needsResume?: { characters: boolean; scenes: boolean; videos: boolean };
  }> => {
    const savedId = localStorage.getItem('running_workflow_id');
    if (!savedId || !apiKey) return { success: false };

    const id = parseInt(savedId, 10);
    if (isNaN(id)) {
      localStorage.removeItem('running_workflow_id');
      return { success: false };
    }

    setHistoryId(id);

    // fetchStatus 会自动检测并恢复正在生成的任务（autoResume = true）
    const status = await fetchStatus(id);

    // Handle case when workflow is not found (API error, deleted, etc.)
    if (!status) {
      console.log('[RestoreWorkflow] Workflow not found or API error, clearing localStorage');
      localStorage.removeItem('running_workflow_id');
      setHistoryId(null);
      return { success: false };
    }

    if (status.workflow.status === 'running') {
      setIsRunning(true);
      // 开始定时轮询状态（用于 UI 更新）
      pollingRef.current = setInterval(() => {
        fetchStatus(id, false); // 轮询时不重复触发 autoResume
      }, POLL_INTERVAL);

      return { success: true };
    } else if (status.workflow.status === 'waiting') {
      // 等待继续状态 - 不需要轮询，但需要显示继续按钮
      setIsRunning(false);
      return { success: true };
    } else if (['completed', 'partial', 'failed', 'stopped'].includes(status.workflow.status)) {
      // 已完成/失败的工作流 - 仍然恢复数据以显示结果和聊天记录
      setIsRunning(false);
      // 清除 localStorage，因为工作流已结束
      localStorage.removeItem('running_workflow_id');
      return { success: true }; // 返回 true 以便显示数据
    } else {
      // 其他状态，清除
      localStorage.removeItem('running_workflow_id');
      return { success: false };
    }
  }, [apiKey, fetchStatus]);

  // Check if auto-resume is needed and return the flag
  const needsAutoResume = useCallback(() => {
    const result = autoResumeRef.current;
    autoResumeRef.current = null; // Reset after reading
    return result;
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // Retry video merge
  const retryMerge = useCallback(async () => {
    if (!historyId || !apiKey) return false;

    try {
      const response = await fetch('/api/workflow/retry-merge', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ historyId }),
      });

      const data = await response.json();
      if (data.success) {
        setIsRunning(true);
        // Start polling to track retry progress
        if (!pollingRef.current) {
          pollingRef.current = setInterval(() => {
            fetchStatus(historyId, false); // 轮询时不触发 autoResume
          }, POLL_INTERVAL);
        }
        // Immediately fetch status
        await fetchStatus(historyId);
        return true;
      } else {
        setError(data.error || 'Failed to retry merge');
        return false;
      }
    } catch (err) {
      console.error('Retry merge error:', err);
      setError((err as Error).message);
      return false;
    }
  }, [historyId, apiKey, fetchStatus]);

  // Upload character image
  const uploadCharacter = useCallback(async (characterIndex: number, file: File) => {
    if (!historyId || !apiKey) return false;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('historyId', String(historyId));
      formData.append('characterIndex', String(characterIndex));

      const response = await fetch('/api/workflow/upload-character', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        // Immediately fetch status to update UI
        await fetchStatus(historyId, false);
        return true;
      } else {
        setError(data.error || 'Failed to upload character image');
        return false;
      }
    } catch (err) {
      console.error('Upload character error:', err);
      setError((err as Error).message);
      return false;
    }
  }, [historyId, apiKey, fetchStatus]);

  // Update script for running workflow
  const updateScript = useCallback(async (scriptData: {
    characters: Array<{
      name: string;
      description?: string;
      imagePrompt?: string;
      RoleimagePrompt?: string;
    }>;
    scenes: Array<{
      id: number;
      imagePrompt: string;
      videoPrompt: string;
    }>;
  }) => {
    if (!historyId || !apiKey) return false;

    try {
      const response = await fetch('/api/workflow/update-script', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ historyId, scriptData }),
      });

      const data = await response.json();
      if (data.success) {
        // Immediately fetch status to update UI
        await fetchStatus(historyId, false);
        return true;
      } else {
        setError(data.error || 'Failed to update script');
        return false;
      }
    } catch (err) {
      console.error('Update script error:', err);
      setError((err as Error).message);
      return false;
    }
  }, [historyId, apiKey, fetchStatus]);

  // Helper: Update single item status to server
  const updateItemStatus = useCallback(async (
    type: 'character' | 'scene' | 'video',
    index: number,
    data: {
      status: string;
      imageUrl?: string | null;  // null to clear the field
      videoUrl?: string | null;
      taskId?: string | null;
      error?: string | null;
    },
    stage?: string,
    workflowStatus?: string
  ) => {
    if (!historyId || !apiKey) return false;

    console.log(`[UpdateItemStatus] ${type} ${index}:`, data);

    try {
      const response = await fetch('/api/workflow/update-item', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ historyId, type, index, data, stage, workflowStatus }),
      });

      const result = await response.json();
      console.log(`[UpdateItemStatus] ${type} ${index} result:`, result.success);

      // Immediately update local workflow state for instant UI feedback
      if (result.success) {
        console.log(`[UpdateItemStatus] API success, updating local state for ${type} ${index} with status:`, data.status);
        setWorkflow(prevWorkflow => {
          if (!prevWorkflow) {
            console.log(`[UpdateItemStatus] prevWorkflow is null, skipping update`);
            return prevWorkflow;
          }

          const updated = { ...prevWorkflow };

          if (type === 'character' && updated.characters) {
            const characters = [...updated.characters];
            if (index >= 0 && index < characters.length) {
              const oldStatus = characters[index].status;
              characters[index] = {
                ...characters[index],
                status: data.status,
                ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl ?? undefined }),
                ...(data.taskId !== undefined && { taskId: data.taskId ?? undefined }),
                ...(data.error !== undefined && { error: data.error ?? undefined }),
              };
              updated.characters = characters;
              console.log(`[UpdateItemStatus] Character ${index} status: ${oldStatus} -> ${data.status}`);
            }
          } else if (type === 'scene' && updated.scenes) {
            const scenes = [...updated.scenes];
            if (index >= 0 && index < scenes.length) {
              const oldStatus = scenes[index].imageStatus;
              scenes[index] = {
                ...scenes[index],
                imageStatus: data.status,
                ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl ?? undefined }),
                ...(data.taskId !== undefined && { taskId: data.taskId ?? undefined }),
                ...(data.error !== undefined && { error: data.error ?? undefined }),
              };
              updated.scenes = scenes;
              console.log(`[UpdateItemStatus] Scene ${index} imageStatus: ${oldStatus} -> ${data.status}`);
            }
          } else if (type === 'video' && updated.videos) {
            const videos = [...updated.videos];
            if (index >= 0 && index < videos.length) {
              const oldStatus = videos[index].status;
              videos[index] = {
                ...videos[index],
                status: data.status,
                ...(data.videoUrl !== undefined && { videoUrl: data.videoUrl ?? undefined }),
                ...(data.taskId !== undefined && { taskId: data.taskId ?? undefined }),
                ...(data.error !== undefined && { error: data.error ?? undefined }),
              };
              updated.videos = videos;
              console.log(`[UpdateItemStatus] Video ${index} status: ${oldStatus} -> ${data.status}`);
            }
          }

          // Update stage and status if provided
          if (stage) {
            updated.stage = stage;
          }
          if (workflowStatus) {
            updated.status = workflowStatus;
          }

          console.log(`[UpdateItemStatus] Local state updated for ${type} ${index}, returning new workflow object`);
          return updated;
        });
      } else {
        console.log(`[UpdateItemStatus] API failed for ${type} ${index}`);
      }

      return result.success;
    } catch (err) {
      console.error('Update item status error:', err);
      return false;
    }
  }, [historyId, apiKey]);

  // Add a new character and generate its image
  const addCharacter = useCallback(async (name: string, imagePrompt: string, insertAfter?: number) => {
    if (!historyId || !apiKey || !workflow) return false;

    // IMPORTANT: Stop global polling during client-side generation
    // This prevents fetchStatus from overwriting local state with potentially stale server data
    stopPolling();

    try {
      // Get current characters
      const currentCharacters = workflow.characters || [];

      // Create new character
      const newCharacter = {
        id: `char-${Date.now()}`,
        name,
        description: '',
        imagePrompt,
        status: 'pending',
      };

      // Insert at the correct position
      let updatedCharacters: typeof currentCharacters;
      let newIndex: number;

      if (insertAfter === -1) {
        // Insert at beginning
        updatedCharacters = [newCharacter, ...currentCharacters];
        newIndex = 0;
      } else if (insertAfter === undefined || insertAfter >= currentCharacters.length - 1) {
        // Append to end (default behavior or insertAfter last item)
        updatedCharacters = [...currentCharacters, newCharacter];
        newIndex = updatedCharacters.length - 1;
      } else {
        // Insert after specific index
        updatedCharacters = [
          ...currentCharacters.slice(0, insertAfter + 1),
          newCharacter,
          ...currentCharacters.slice(insertAfter + 1),
        ];
        newIndex = insertAfter + 1;
      }

      // Update script with new character
      const currentScenes = workflow.scenes || [];
      await fetch('/api/workflow/update-script', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          historyId,
          scriptData: {
            characters: updatedCharacters.map(c => ({
              name: c.name,
              description: c.description,
              imagePrompt: c.imagePrompt,
            })),
            scenes: currentScenes.map(s => ({
              id: s.id,
              imagePrompt: s.imagePrompt,
              videoPrompt: s.videoPrompt || '',
            })),
          },
        }),
      });

      // Note: Server returns updated data, we should update local state from response if available

      // Use retryCharacter to generate the image
      setIsRunning(true);
      isGeneratingRef.current = true;
      isClientGeneratingRef.current = true; // Prevent fetchStatus from overwriting local state
      activeTaskCountRef.current += 1; // Increment active task count

      await updateItemStatus('character', newIndex, { status: 'generating', error: null, imageUrl: null, taskId: null });
      // Note: Don't call fetchStatus here - updateItemStatus already updates local state

      const { imageUrl, taskId } = await textToImageWithModelAPI(imagePrompt);

      if (taskId) {
        await updateItemStatus('character', newIndex, { status: 'generating', taskId });
        const result = await pollImageResultAPI(taskId, () => isGeneratingRef.current);
        if (result.imageUrl) {
          await updateItemStatus('character', newIndex, { status: 'done', imageUrl: result.imageUrl });
        } else {
          await updateItemStatus('character', newIndex, { status: 'error', error: result.error || 'Generation failed' });
        }
      } else if (imageUrl) {
        await updateItemStatus('character', newIndex, { status: 'done', imageUrl });
      }

      // Note: Don't call fetchStatus here - updateItemStatus already updates local state
      activeTaskCountRef.current -= 1;
      if (activeTaskCountRef.current <= 0) {
        activeTaskCountRef.current = 0;
        setIsRunning(false);
        isGeneratingRef.current = false;
        isClientGeneratingRef.current = false; // Allow fetchStatus to update state again
      }

      return true;
    } catch (err) {
      console.error('Add character error:', err);
      setError((err as Error).message);
      activeTaskCountRef.current -= 1;
      if (activeTaskCountRef.current <= 0) {
        activeTaskCountRef.current = 0;
        setIsRunning(false);
        isGeneratingRef.current = false;
        isClientGeneratingRef.current = false; // Allow fetchStatus to update state again
      }
      return false;
    }
  }, [historyId, apiKey, workflow, updateItemStatus, stopPolling]);

  // Add a new scene and generate its image
  const addScene = useCallback(async (imagePrompt: string, videoPrompt?: string, insertAfter?: number) => {
    if (!historyId || !apiKey || !workflow) return false;

    // IMPORTANT: Stop global polling during client-side generation
    // This prevents fetchStatus from overwriting local state with potentially stale server data
    stopPolling();

    try {
      // Get current scenes
      const currentScenes = workflow.scenes || [];
      const currentCharacters = workflow.characters || [];

      // Create new scene with next ID
      const maxId = currentScenes.reduce((max, s) => Math.max(max, s.id), 0);
      const newScene = {
        id: maxId + 1,
        imagePrompt,
        videoPrompt: videoPrompt || imagePrompt, // 使用单独的 videoPrompt 或 imagePrompt
        imageStatus: 'pending',
      };

      // Insert at the correct position
      let updatedScenes: typeof currentScenes;
      let newIndex: number;

      if (insertAfter === undefined || insertAfter >= currentScenes.length - 1) {
        // Append to end (default behavior or insertAfter last item)
        updatedScenes = [...currentScenes, newScene];
        newIndex = updatedScenes.length - 1;
      } else if (insertAfter === -1) {
        // Insert at beginning
        updatedScenes = [newScene, ...currentScenes];
        newIndex = 0;
      } else {
        // Insert after specific index
        updatedScenes = [
          ...currentScenes.slice(0, insertAfter + 1),
          newScene,
          ...currentScenes.slice(insertAfter + 1),
        ];
        newIndex = insertAfter + 1;
      }

      // Update script with new scene
      await fetch('/api/workflow/update-script', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          historyId,
          scriptData: {
            characters: currentCharacters.map(c => ({
              name: c.name,
              description: c.description,
              imagePrompt: c.imagePrompt,
            })),
            scenes: updatedScenes.map(s => ({
              id: s.id,
              imagePrompt: s.imagePrompt,
              videoPrompt: s.videoPrompt || '',
            })),
          },
        }),
      });

      // Note: Server returns updated data, we should update local state from response if available

      // Generate the image
      setIsRunning(true);
      isGeneratingRef.current = true;
      isClientGeneratingRef.current = true; // Prevent fetchStatus from overwriting local state
      activeTaskCountRef.current += 1; // Increment active task count

      await updateItemStatus('scene', newIndex, { status: 'generating', error: null, imageUrl: null, taskId: null });
      // Note: Don't call fetchStatus here - updateItemStatus already updates local state

      const { imageUrl, taskId } = await textToImageWithModelAPI(imagePrompt);

      if (taskId) {
        await updateItemStatus('scene', newIndex, { status: 'generating', taskId });
        const result = await pollImageResultAPI(taskId, () => isGeneratingRef.current);
        if (result.imageUrl) {
          await updateItemStatus('scene', newIndex, { status: 'done', imageUrl: result.imageUrl });
        } else {
          await updateItemStatus('scene', newIndex, { status: 'error', error: result.error || 'Generation failed' });
        }
      } else if (imageUrl) {
        await updateItemStatus('scene', newIndex, { status: 'done', imageUrl });
      }

      // Note: Don't call fetchStatus here - updateItemStatus already updates local state
      activeTaskCountRef.current -= 1;
      if (activeTaskCountRef.current <= 0) {
        activeTaskCountRef.current = 0;
        setIsRunning(false);
        isGeneratingRef.current = false;
        isClientGeneratingRef.current = false; // Allow fetchStatus to update state again
      }

      return true;
    } catch (err) {
      console.error('Add scene error:', err);
      setError((err as Error).message);
      activeTaskCountRef.current -= 1;
      if (activeTaskCountRef.current <= 0) {
        activeTaskCountRef.current = 0;
        setIsRunning(false);
        isGeneratingRef.current = false;
        isClientGeneratingRef.current = false; // Allow fetchStatus to update state again
      }
      return false;
    }
  }, [historyId, apiKey, workflow, updateItemStatus, stopPolling]);

  // Reorder a character (move from one position to another)
  const reorderCharacter = useCallback(async (fromIndex: number, toIndex: number) => {
    if (!historyId || !apiKey || !workflow) return false;

    try {
      const currentCharacters = [...(workflow.characters || [])];
      const currentScenes = workflow.scenes || [];

      if (fromIndex < 0 || fromIndex >= currentCharacters.length) return false;
      if (toIndex < 0 || toIndex >= currentCharacters.length) return false;
      if (fromIndex === toIndex) return false;

      // Remove from old position and insert at new position
      const [movedChar] = currentCharacters.splice(fromIndex, 1);
      currentCharacters.splice(toIndex, 0, movedChar);

      // Update script with reordered characters
      await fetch('/api/workflow/update-script', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          historyId,
          scriptData: {
            characters: currentCharacters.map(c => ({
              name: c.name,
              description: c.description,
              imagePrompt: c.imagePrompt,
            })),
            scenes: currentScenes.map(s => ({
              id: s.id,
              imagePrompt: s.imagePrompt,
              videoPrompt: s.videoPrompt || '',
            })),
          },
        }),
      });

      // Fetch updated status
      await fetchStatus(historyId, false);
      return true;
    } catch (err) {
      console.error('Reorder character error:', err);
      setError((err as Error).message);
      return false;
    }
  }, [historyId, apiKey, workflow, fetchStatus]);

  // Reorder a scene (move from one position to another)
  const reorderScene = useCallback(async (fromIndex: number, toIndex: number) => {
    if (!historyId || !apiKey || !workflow) return false;

    try {
      const currentCharacters = workflow.characters || [];
      const currentScenes = [...(workflow.scenes || [])];

      if (fromIndex < 0 || fromIndex >= currentScenes.length) return false;
      if (toIndex < 0 || toIndex >= currentScenes.length) return false;
      if (fromIndex === toIndex) return false;

      // Remove from old position and insert at new position
      const [movedScene] = currentScenes.splice(fromIndex, 1);
      currentScenes.splice(toIndex, 0, movedScene);

      // Update scene IDs to reflect new order
      const reorderedScenes = currentScenes.map((s, idx) => ({
        ...s,
        id: idx + 1,
      }));

      // Update script with reordered scenes
      await fetch('/api/workflow/update-script', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          historyId,
          scriptData: {
            characters: currentCharacters.map(c => ({
              name: c.name,
              description: c.description,
              imagePrompt: c.imagePrompt,
            })),
            scenes: reorderedScenes.map(s => ({
              id: s.id,
              imagePrompt: s.imagePrompt,
              videoPrompt: s.videoPrompt || '',
            })),
          },
        }),
      });

      // Fetch updated status
      await fetchStatus(historyId, false);
      return true;
    } catch (err) {
      console.error('Reorder scene error:', err);
      setError((err as Error).message);
      return false;
    }
  }, [historyId, apiKey, workflow, fetchStatus]);

  // Delete a character
  const deleteCharacter = useCallback(async (index: number) => {
    if (!historyId || !apiKey || !workflow) return false;

    try {
      const currentCharacters = [...(workflow.characters || [])];
      const currentScenes = workflow.scenes || [];

      if (index < 0 || index >= currentCharacters.length) {
        console.error('[Client] Invalid character index:', index);
        return false;
      }

      // Remove the character
      currentCharacters.splice(index, 1);

      // Update the script via API
      const response = await fetch('/api/workflow/update-script', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          historyId,
          scriptData: {
            characters: currentCharacters.map(c => ({
              name: c.name,
              description: c.description,
              imagePrompt: c.imagePrompt,
            })),
            scenes: currentScenes.map(s => ({
              id: s.id,
              imagePrompt: s.imagePrompt,
              videoPrompt: s.videoPrompt || '',
            })),
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update script');
      }

      // Fetch updated status
      await fetchStatus(historyId, false);
      return true;
    } catch (err) {
      console.error('Delete character error:', err);
      setError((err as Error).message);
      return false;
    }
  }, [historyId, apiKey, workflow, fetchStatus]);

  // Delete a scene
  const deleteScene = useCallback(async (index: number) => {
    if (!historyId || !apiKey || !workflow) return false;

    try {
      const currentCharacters = workflow.characters || [];
      const currentScenes = [...(workflow.scenes || [])];

      if (index < 0 || index >= currentScenes.length) {
        console.error('[Client] Invalid scene index:', index);
        return false;
      }

      // Remove the scene
      currentScenes.splice(index, 1);

      // Re-number the scene IDs
      const renumberedScenes = currentScenes.map((s, idx) => ({
        ...s,
        id: idx + 1,
      }));

      // Update the script via API
      const response = await fetch('/api/workflow/update-script', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          historyId,
          scriptData: {
            characters: currentCharacters.map(c => ({
              name: c.name,
              description: c.description,
              imagePrompt: c.imagePrompt,
            })),
            scenes: renumberedScenes.map(s => ({
              id: s.id,
              imagePrompt: s.imagePrompt,
              videoPrompt: s.videoPrompt || '',
            })),
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update script');
      }

      // Fetch updated status
      await fetchStatus(historyId, false);
      return true;
    } catch (err) {
      console.error('Delete scene error:', err);
      setError((err as Error).message);
      return false;
    }
  }, [historyId, apiKey, workflow, fetchStatus]);

  // Helper: Update workflow stage
  const updateWorkflowStage = useCallback(async (
    stage: string,
    status?: string,
    extraData?: Record<string, unknown>
  ) => {
    if (!historyId || !apiKey) return false;

    try {
      const response = await fetch('/api/workflow/update-stage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ historyId, stage, status, ...extraData }),
      });

      const result = await response.json();

      // IMPORTANT: Also update local workflow state immediately
      // This ensures page.tsx's useEffect can detect the stage change
      if (result.success) {
        setWorkflow(prevWorkflow => {
          if (!prevWorkflow) return prevWorkflow;
          return {
            ...prevWorkflow,
            stage,
            ...(status && { status }),
          };
        });
        console.log(`[UpdateWorkflowStage] Local state updated: stage=${stage}, status=${status}`);
      }

      return result.success;
    } catch (err) {
      console.error('Update stage error:', err);
      return false;
    }
  }, [historyId, apiKey]);

  // Helper: Sync current workflow data to global script_result
  // 接受可选的本地数据参数，避免从服务器获取可能未更新的数据
  const syncGlobalScript = useCallback(async (localData?: {
    characters?: Array<{ name: string; description?: string; imagePrompt: string }>;
    scenes?: Array<{ id: number; imagePrompt: string; videoPrompt?: string }>;
  }) => {
    if (!historyId || !apiKey) return false;

    try {
      let characters: Array<{ name: string; description?: string; imagePrompt: string }>;
      let scenes: Array<{ id: number; imagePrompt: string; videoPrompt?: string }>;

      // 如果提供了本地数据，直接使用；否则从服务器获取
      if (localData?.characters && localData?.scenes) {
        characters = localData.characters;
        scenes = localData.scenes;
        console.log('[Client] Using provided local data for script sync');
      } else {
        // Fetch the latest workflow data
        const statusData = await fetchStatus(historyId, false);
        if (!statusData?.workflow) {
          console.error('[Client] Failed to fetch latest workflow status for script sync');
          return false;
        }
        characters = (statusData.workflow.characters || []).map((c: { name: string; description?: string; imagePrompt: string }) => ({
          name: c.name,
          description: c.description || '',
          imagePrompt: c.imagePrompt,
        }));
        scenes = (statusData.workflow.scenes || []).map((s: { id: number; imagePrompt: string; videoPrompt?: string }) => ({
          id: s.id,
          imagePrompt: s.imagePrompt,
          videoPrompt: s.videoPrompt || '',
        }));
      }

      // Build script data from workflow state
      const scriptData = {
        characters: characters.map((c) => ({
          name: c.name,
          description: c.description || '',
          imagePrompt: c.imagePrompt,
        })),
        scenes: scenes.map((s) => ({
          id: s.id,
          imagePrompt: s.imagePrompt,
          videoPrompt: s.videoPrompt || '',
        })),
      };

      console.log('[Client] Syncing global script with workflow data:', {
        characters: scriptData.characters.length,
        scenes: scriptData.scenes.length,
      });

      // Update script_result via update-script API
      const response = await fetch('/api/workflow/update-script', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ historyId, scriptData }),
      });

      const result = await response.json();
      if (result.success) {
        console.log('[Client] Global script synced successfully');
      } else {
        console.error('[Client] Failed to sync global script:', result.error);
      }
      return result.success;
    } catch (err) {
      console.error('[Client] Sync global script error:', err);
      return false;
    }
  }, [historyId, apiKey, fetchStatus]);

  // Retry failed video generation (client-side)
  const retryVideo = useCallback(async (videoIndex: number, modelId?: string, mode?: string) => {
    if (!historyId || !apiKey || !workflow) return false;

    // IMPORTANT: Stop global polling during client-side generation
    stopPolling();

    // Fetch the latest workflow status
    const statusData = await fetchStatus(historyId, false);
    if (!statusData?.workflow) {
      console.error('[Client] Failed to fetch latest workflow status for retry video');
      return false;
    }

    const videos = statusData.workflow.videos || [];
    const scenes = statusData.workflow.scenes || [];

    if (videoIndex < 0 || videoIndex >= videos.length) {
      console.error(`[Client] Invalid video index: ${videoIndex}, videos.length=${videos.length}`);
      setError(`Invalid video index: ${videoIndex}`);
      return false;
    }

    const video = videos[videoIndex];

    // Check if video generation is already in progress
    if (video.status === 'submitting' || video.status === 'polling') {
      console.log(`[Client] Video ${videoIndex} generation already in progress`);
      setError('Video generation already in progress');
      return false;
    }

    // Get video generation mode (from request or workflow config)
    const videoGenerationMode = mode || statusData.workflow.videoGenerationMode || 'first-last-frame';
    // Use modelId from parameter, or read from global config (settings panel)
    const selectedModel = (modelId || getDefaultVideoModel()) as VideoModelId;

    // Get completed scenes - always read from latest scene images
    const completedScenes = scenes.filter(
      (s: { imageStatus: string; imageUrl?: string }) => s.imageStatus === 'done' && s.imageUrl
    );

    // IMPORTANT: Always read firstFrame from the latest scene image
    // video.index corresponds to the position in completedScenes array
    const effectiveFirstFrame = completedScenes[video.index]?.imageUrl || video.firstFrame;

    // Calculate lastFrame based on current videoGenerationMode
    // Always read from the latest scene image (next scene)
    let effectiveLastFrame: string | undefined;
    if (videoGenerationMode === 'first-last-frame') {
      const nextSceneIndex = video.index + 1;
      if (nextSceneIndex < completedScenes.length) {
        effectiveLastFrame = completedScenes[nextSceneIndex].imageUrl;
        console.log(`[Client] Reading lastFrame from scene ${nextSceneIndex}: ${effectiveLastFrame?.substring(0, 50)}...`);
      }
    }
    // single-image mode: no lastFrame

    console.log(`[Client] Retrying video ${videoIndex} with model: ${selectedModel}, mode: ${videoGenerationMode}`);
    console.log(`[Client] Video data:`, {
      id: video.id,
      prompt: video.prompt?.substring(0, 50),
      originalFirstFrame: video.firstFrame?.substring(0, 50),
      effectiveFirstFrame: effectiveFirstFrame?.substring(0, 50),
      effectiveLastFrame: effectiveLastFrame?.substring(0, 50),
      videoGenerationMode,
    });

    try {
      setIsRunning(true);
      isGeneratingRef.current = true;
      isClientGeneratingRef.current = true;
      activeTaskCountRef.current += 1;

      // Update video status to submitting
      await updateItemStatus('video', videoIndex, {
        status: 'submitting',
        error: null,
        videoUrl: null,
        taskId: null,
      });

      // Build video item for API - use latest scene images
      const videoItem: VideoItem = {
        id: video.id,
        index: video.index,
        prompt: video.prompt,
        firstFrame: effectiveFirstFrame,  // Use latest scene image
        lastFrame: effectiveLastFrame,    // Use latest next scene image
        status: 'pending',
      };

      // Submit video task
      const { taskId, error: submitError } = await submitVideoTaskAPI(videoItem, selectedModel);

      if (!taskId) {
        console.error(`[Client] Video ${videoIndex} submit failed:`, submitError);
        await updateItemStatus('video', videoIndex, {
          status: 'error',
          error: submitError || 'Failed to submit video task',
        });
        throw new Error(submitError || 'Failed to submit video task');
      }

      console.log(`[Client] Video ${videoIndex} submitted, taskId:`, taskId);

      // Update with taskId and polling status
      await updateItemStatus('video', videoIndex, {
        status: 'polling',
        taskId,
      });

      // Poll for result
      console.log(`[Client] Video ${videoIndex} polling started...`);
      const result = await pollVideoResultAPI(taskId, () => isGeneratingRef.current);
      console.log(`[Client] Video ${videoIndex} poll result:`, { hasVideoUrl: !!result.videoUrl, error: result.error });

      if (result.videoUrl) {
        await updateItemStatus('video', videoIndex, {
          status: 'done',
          videoUrl: result.videoUrl,
        });
      } else {
        await updateItemStatus('video', videoIndex, {
          status: 'error',
          error: result.error || 'Video generation failed',
        });
      }

      // Decrement active task count
      activeTaskCountRef.current -= 1;
      if (activeTaskCountRef.current <= 0) {
        activeTaskCountRef.current = 0;
        setIsRunning(false);
        isGeneratingRef.current = false;
        isClientGeneratingRef.current = false;
      }

      // Check if all videos are now done and update stage to videos_done
      const latestStatus = await fetchStatus(historyId, false);
      const latestVideos = latestStatus?.workflow?.videos || [];
      const allFinished = latestVideos.length > 0 && latestVideos.every(
        (v: { status: string }) => v.status === 'done' || v.status === 'error'
      );
      const hasSuccessVideos = latestVideos.some((v: { status: string }) => v.status === 'done');

      if (allFinished && hasSuccessVideos) {
        console.log(`[Client] All videos finished after retry, updating stage to videos_done`);
        // IMPORTANT: First set to intermediate stage, then to videos_done
        // This triggers the stage change detection in page.tsx even if already at videos_done
        const currentStage = latestStatus?.workflow?.stage;
        if (currentStage === 'videos_done') {
          // Force stage change by going through intermediate state
          await updateWorkflowStage('videos', 'running');
        }
        await updateWorkflowStage('videos_done', 'waiting');
      }

      console.log(`[Client] Video ${videoIndex} retry completed with status: ${result.videoUrl ? 'done' : 'error'}`);
      return !!result.videoUrl;

    } catch (err) {
      console.error(`[Client] Retry video ${videoIndex} error:`, err);
      setError((err as Error).message);
      activeTaskCountRef.current -= 1;
      if (activeTaskCountRef.current <= 0) {
        activeTaskCountRef.current = 0;
        setIsRunning(false);
        isGeneratingRef.current = false;
        isClientGeneratingRef.current = false;
      }
      return false;
    }
  }, [historyId, apiKey, workflow, fetchStatus, updateItemStatus, updateWorkflowStage, stopPolling]);

  // Retry failed scene image generation (client-side with model selection)
  const retryScene = useCallback(async (
    sceneIndex: number,
    newPrompt?: string,
    newVideoPrompt?: string, // 新的视频提示词，如果不提供则使用 newPrompt
    modelId?: string,
    size?: string,
    aspectRatio?: string
  ) => {
    if (!historyId || !apiKey) return false;

    // IMPORTANT: Stop global polling during client-side generation
    // This prevents fetchStatus from overwriting local state with potentially stale server data
    stopPolling();

    try {
      // Fetch latest workflow data
      const statusData = await fetchStatus(historyId, false);
      if (!statusData?.workflow) {
        console.error('[Client] Failed to fetch latest workflow status for scene retry');
        return false;
      }

      type CharacterType = { id: string; name: string; description?: string; imagePrompt: string; status: string; imageUrl?: string; taskId?: string; error?: string };
      type SceneType = { id: number; imagePrompt: string; videoPrompt?: string; imageStatus: string; imageUrl?: string; taskId?: string; error?: string };

      const characters: CharacterType[] = statusData.workflow.characters || [];
      const scenes: SceneType[] = statusData.workflow.scenes || [];

      if (sceneIndex < 0 || sceneIndex >= scenes.length) {
        console.error('[Client] Invalid scene index:', sceneIndex);
        return false;
      }

      const scene = scenes[sceneIndex];
      const promptToUse = newPrompt || scene.imagePrompt;

      // Collect character reference images
      const characterImageUrls = characters
        .filter(c => c.status === 'done' && c.imageUrl)
        .map(c => c.imageUrl!);

      console.log(`[Client] Retrying scene ${sceneIndex} with model: ${modelId || 'default'}, size: ${size || 'default'}, aspectRatio: ${aspectRatio || 'default'}, ${characterImageUrls.length} character reference images`);

      setIsRunning(true);
      isGeneratingRef.current = true;
      isClientGeneratingRef.current = true; // Prevent fetchStatus from overwriting local state
      activeTaskCountRef.current += 1; // Increment active task count

      // Update prompt if new prompt provided - also update videoPrompt
      if (newPrompt) {
        // 如果提供了单独的 videoPrompt 则使用它，否则使用 newPrompt 作为 videoPrompt
        const videoPromptToUse = newVideoPrompt || newPrompt;
        // Update scene's imagePrompt and videoPrompt in database first
        const updatedScenes = [...scenes];
        updatedScenes[sceneIndex] = {
          ...scene,
          imagePrompt: newPrompt,
          videoPrompt: videoPromptToUse, // 使用单独的 videoPrompt 或 imagePrompt
        };
        console.log(`[Client] Updating scene ${sceneIndex} prompts:`, { imagePrompt: newPrompt, videoPrompt: videoPromptToUse });
        await fetch('/api/workflow/update-stage', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            historyId,
            scenes: updatedScenes,
          }),
        });

        // 立即同步全局脚本（使用本地已更新的数据，不从服务器获取）
        await syncGlobalScript({
          characters: characters.map(c => ({
            name: c.name,
            description: c.description || '',
            imagePrompt: c.imagePrompt,
          })),
          scenes: updatedScenes.map(s => ({
            id: s.id,
            imagePrompt: s.imagePrompt,
            videoPrompt: s.videoPrompt || '',
          })),
        });
      }

      // Mark scene as generating
      await updateItemStatus('scene', sceneIndex, { status: 'generating', error: null, imageUrl: null, taskId: null });
      // Note: Don't call fetchStatus here - updateItemStatus already updates local state

      try {
        const { imageUrl, taskId } = await imageToEditWithModelAPI(
          characterImageUrls,
          promptToUse,
          modelId as ImageEditModelId | undefined,
          size || '1K',
          aspectRatio || '9:16'
        );

        console.log(`[Client] Scene ${sceneIndex} retry API response:`, { imageUrl: !!imageUrl, taskId });

        if (taskId) {
          // Save taskId to database immediately for recovery
          await updateItemStatus('scene', sceneIndex, { status: 'generating', taskId });

          // Async mode - poll for result
          const result = await pollImageResultAPI(taskId, () => isGeneratingRef.current);
          if (result.imageUrl) {
            await updateItemStatus('scene', sceneIndex, { status: 'done', imageUrl: result.imageUrl });
          } else {
            await updateItemStatus('scene', sceneIndex, { status: 'error', error: result.error || 'Generation failed' });
          }
        } else if (imageUrl) {
          // Sync mode
          await updateItemStatus('scene', sceneIndex, { status: 'done', imageUrl });
        } else {
          await updateItemStatus('scene', sceneIndex, { status: 'error', error: 'No image returned' });
        }
      } catch (err) {
        console.error(`[Client] Scene ${sceneIndex} retry error:`, err);
        await updateItemStatus('scene', sceneIndex, { status: 'error', error: (err as Error).message });
      }

      activeTaskCountRef.current -= 1; // Decrement active task count
      // Only stop generating when no active tasks remain
      if (activeTaskCountRef.current <= 0) {
        activeTaskCountRef.current = 0;
        setIsRunning(false);
        isGeneratingRef.current = false;
        isClientGeneratingRef.current = false; // Allow fetchStatus to update state again
      }

      // Fetch latest status and check if all scenes are done
      const latestStatus = await fetchStatus(historyId, false);
      const latestScenes = latestStatus?.workflow?.scenes || [];
      const allFinished = latestScenes.length > 0 && latestScenes.every(
        (s: { imageStatus: string }) => s.imageStatus === 'done' || s.imageStatus === 'error'
      );

      console.log(`[Client] Scene ${sceneIndex} retry - checking completion:`, {
        scenesCount: latestScenes.length,
        sceneStatuses: latestScenes.map((s: { id: number; imageStatus: string }) => ({ id: s.id, status: s.imageStatus })),
        allFinished,
        currentStage: latestStatus?.workflow?.stage,
        currentStatus: latestStatus?.workflow?.status,
      });

      // Update to scenes_done if all scenes finished
      if (allFinished) {
        console.log('[Client] All scenes finished after retry, updating workflow stage to scenes_done, waiting...');
        const updateResult = await updateWorkflowStage('scenes_done', 'waiting');
        console.log('[Client] updateWorkflowStage result:', updateResult);
        await fetchStatus(historyId, false);
      }

      console.log(`[Client] Scene ${sceneIndex} retry completed`);
      return true;

    } catch (err) {
      console.error('Retry scene error:', err);
      setError((err as Error).message);
      activeTaskCountRef.current -= 1;
      if (activeTaskCountRef.current <= 0) {
        activeTaskCountRef.current = 0;
        setIsRunning(false);
        isGeneratingRef.current = false;
        isClientGeneratingRef.current = false; // Allow fetchStatus to update state again
      }
      return false;
    }
  }, [historyId, apiKey, fetchStatus, updateItemStatus, updateWorkflowStage, syncGlobalScript, stopPolling]);

  // Retry failed character image generation (client-side with model selection)
  const retryCharacter = useCallback(async (
    characterIndex: number,
    newPrompt?: string,
    modelId?: string,
    size?: string,
    aspectRatio?: string
  ) => {
    if (!historyId || !apiKey) return false;

    // IMPORTANT: Stop global polling during client-side generation
    // This prevents fetchStatus from overwriting local state with potentially stale server data
    stopPolling();

    try {
      // Fetch latest workflow data
      const statusData = await fetchStatus(historyId, false);
      if (!statusData?.workflow) {
        console.error('[Client] Failed to fetch latest workflow status for character retry');
        return false;
      }

      type CharacterType = { id: string; name: string; description?: string; imagePrompt: string; status: string; imageUrl?: string; taskId?: string; error?: string };
      type SceneType = { id: number; imagePrompt: string; videoPrompt?: string; imageStatus: string; imageUrl?: string; taskId?: string; error?: string };
      const characters: CharacterType[] = statusData.workflow.characters || [];
      const scenes: SceneType[] = statusData.workflow.scenes || [];

      if (characterIndex < 0 || characterIndex >= characters.length) {
        console.error('[Client] Invalid character index:', characterIndex);
        return false;
      }

      const character = characters[characterIndex];
      const promptToUse = newPrompt || character.imagePrompt;

      console.log(`[Client] Retrying character ${characterIndex} with model: ${modelId || 'default'}, size: ${size || 'default'}, aspectRatio: ${aspectRatio || 'default'}`);

      setIsRunning(true);
      isGeneratingRef.current = true;
      isClientGeneratingRef.current = true; // Prevent fetchStatus from overwriting local state
      activeTaskCountRef.current += 1; // Increment active task count

      // Update prompt if new prompt provided
      if (newPrompt) {
        // Update character's imagePrompt in database first
        const updatedCharacters = [...characters];
        updatedCharacters[characterIndex] = { ...character, imagePrompt: newPrompt };
        await fetch('/api/workflow/update-stage', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            historyId,
            characters: updatedCharacters,
          }),
        });

        // 立即同步全局脚本（使用本地已更新的数据，不从服务器获取）
        await syncGlobalScript({
          characters: updatedCharacters.map(c => ({
            name: c.name,
            description: c.description || '',
            imagePrompt: c.imagePrompt,
          })),
          scenes: scenes.map(s => ({
            id: s.id,
            imagePrompt: s.imagePrompt,
            videoPrompt: s.videoPrompt || '',
          })),
        });
      }

      // Mark character as generating
      await updateItemStatus('character', characterIndex, { status: 'generating', error: null, imageUrl: null, taskId: null });
      // Note: Don't call fetchStatus here - updateItemStatus already updates local state

      try {
        const { imageUrl, taskId } = await textToImageWithModelAPI(
          promptToUse,
          modelId as ImageTextToImageModelId | undefined,
          size || '1K',
          aspectRatio || '1:1'
        );

        console.log(`[Client] Character ${characterIndex} retry API response:`, { imageUrl: !!imageUrl, taskId });

        if (taskId) {
          // Save taskId to database immediately for recovery
          await updateItemStatus('character', characterIndex, { status: 'generating', taskId });

          // Async mode - poll for result
          const result = await pollImageResultAPI(taskId, () => isGeneratingRef.current);
          if (result.imageUrl) {
            await updateItemStatus('character', characterIndex, { status: 'done', imageUrl: result.imageUrl });
          } else {
            await updateItemStatus('character', characterIndex, { status: 'error', error: result.error || 'Generation failed' });
          }
        } else if (imageUrl) {
          // Sync mode
          await updateItemStatus('character', characterIndex, { status: 'done', imageUrl });
        } else {
          await updateItemStatus('character', characterIndex, { status: 'error', error: 'No image returned' });
        }
      } catch (err) {
        console.error(`[Client] Character ${characterIndex} retry error:`, err);
        await updateItemStatus('character', characterIndex, { status: 'error', error: (err as Error).message });
      }

      activeTaskCountRef.current -= 1; // Decrement active task count
      // Only stop generating when no active tasks remain
      if (activeTaskCountRef.current <= 0) {
        activeTaskCountRef.current = 0;
        setIsRunning(false);
        isGeneratingRef.current = false;
        isClientGeneratingRef.current = false; // Allow fetchStatus to update state again
      }

      console.log(`[Client] Character ${characterIndex} retry completed`);
      return true;

    } catch (err) {
      console.error('Retry character error:', err);
      setError((err as Error).message);
      activeTaskCountRef.current -= 1;
      if (activeTaskCountRef.current <= 0) {
        activeTaskCountRef.current = 0;
        setIsRunning(false);
        isGeneratingRef.current = false;
        isClientGeneratingRef.current = false; // Allow fetchStatus to update state again
      }
      return false;
    }
  }, [historyId, apiKey, fetchStatus, updateItemStatus, syncGlobalScript, stopPolling]);

  // Generate character images on client side
  const generateCharacters = useCallback(async () => {
    if (!historyId || !apiKey) return false;

    // IMPORTANT: Stop global polling during client-side generation
    // This prevents fetchStatus from overwriting local state with potentially stale server data
    stopPolling();

    // Always fetch the latest status before generating to ensure we have the latest data
    // IMPORTANT: Disable autoResume to prevent resumePendingTasksFromData from interfering
    // with the current generation process by setting isGeneratingRef.current = false
    const statusData = await fetchStatus(historyId, false);
    if (!statusData?.workflow) {
      console.error('[Client] Failed to fetch latest workflow status');
      return false;
    }

    type CharacterType = { id: string; name: string; description?: string; imagePrompt: string; status: string; imageUrl?: string; taskId?: string; error?: string };
    const characters: CharacterType[] = statusData.workflow.characters || [];
    console.log(`[Client] Total characters in workflow: ${characters.length}`, characters.map((c) => ({ name: c.name, status: c.status })));

    const pendingChars = characters.filter((c) => c.status !== 'done');

    if (pendingChars.length === 0) {
      console.log('[Client] No characters to generate');
      return true;
    }

    try {
      setIsRunning(true);
      isGeneratingRef.current = true;
      isClientGeneratingRef.current = true; // Prevent fetchStatus from overwriting local state
      activeTaskCountRef.current += 1; // Increment for the batch operation

      // Update stage to characters
      await updateWorkflowStage('characters', 'running');

      // Mark all pending as generating
      for (let i = 0; i < characters.length; i++) {
        if (characters[i].status !== 'done') {
          await updateItemStatus('character', i, { status: 'generating' });
        }
      }
      // Note: Don't call fetchStatus here - updateItemStatus already updates local state
      // Calling fetchStatus would overwrite local state with potentially stale server data

      console.log(`[Client] Generating ${pendingChars.length} characters...`);

      // Generate each character in parallel
      const generateSingleCharacter = async (charIndex: number) => {
        const char = characters[charIndex];
        if (char.status === 'done' || !isGeneratingRef.current) return;

        try {
          console.log(`[Client] Generating character ${charIndex}: ${char.name}`);

          const { imageUrl, taskId } = await textToImageWithModelAPI(
            char.imagePrompt
          );

          if (taskId) {
            // Save taskId to database immediately for recovery
            console.log(`[Client] Character ${charIndex} got taskId: ${taskId}`);
            await updateItemStatus('character', charIndex, {
              status: 'generating',
              taskId,
            });

            // Async mode - poll for result
            const result = await pollImageResultAPI(taskId, () => isGeneratingRef.current);
            console.log(`[Client] Character ${charIndex} poll result:`, { hasImageUrl: !!result.imageUrl, error: result.error });
            if (result.imageUrl) {
              console.log(`[Client] Character ${charIndex} updating status to done with imageUrl:`, result.imageUrl.substring(0, 50));
              const updateSuccess = await updateItemStatus('character', charIndex, {
                status: 'done',
                imageUrl: result.imageUrl,
              });
              console.log(`[Client] Character ${charIndex} updateItemStatus success:`, updateSuccess);
            } else {
              await updateItemStatus('character', charIndex, {
                status: 'error',
                error: result.error || 'Generation failed',
              });
            }
          } else if (imageUrl) {
            // Sync mode - got URL directly
            await updateItemStatus('character', charIndex, {
              status: 'done',
              imageUrl,
            });
          } else {
            await updateItemStatus('character', charIndex, {
              status: 'error',
              error: 'No image returned',
            });
          }
        } catch (err) {
          console.error(`[Client] Character ${char.name} error:`, err);
          await updateItemStatus('character', charIndex, {
            status: 'error',
            error: (err as Error).message,
          });
        }

        // Note: Don't call fetchStatus here as updateItemStatus already updates local state
        // Calling fetchStatus might overwrite our local state with stale data from server
        console.log(`[Client] Character ${charIndex} generation completed`);
      };

      // Run all in parallel
      await Promise.all(
        characters.map((_, index) =>
          characters[index].status !== 'done' ? generateSingleCharacter(index) : Promise.resolve()
        )
      );

      // After all parallel tasks complete, check completion status using LOCAL workflow state
      // Don't rely on fetchStatus here as server data may still be syncing due to optimistic locking
      // Instead, we'll add a small delay and then check the current workflow state

      // Give server time to process all optimistic locking retries
      await new Promise(resolve => setTimeout(resolve, 500));

      // Now fetch with a fresh read - but only use it for stage update decision
      // NOTE: This fetchStatus is called while isClientGeneratingRef is still true,
      // so it won't overwrite local state (per the check in fetchStatus)
      const latestStatus = await fetchStatus(historyId, false);
      const latestCharacters = latestStatus?.workflow?.characters || [];

      // Check if any characters are still in progress
      const hasGenerating = latestCharacters.some((c: { status: string }) => c.status === 'generating');
      const hasPending = latestCharacters.some((c: { status: string }) => c.status === 'pending');

      // Only update to characters_done state if all characters have finished (done or error)
      if (!hasGenerating && !hasPending) {
        console.log('[Client] All characters finished, updating workflow stage to characters_done, auto-continuing to scenes...');
        const updateResult = await updateWorkflowStage('characters_done', 'running');
        console.log('[Client] updateWorkflowStage result:', updateResult);
      } else {
        console.log('[Client] Some characters still generating/pending, NOT updating to waiting state', {
          generating: latestCharacters.filter((c: { status: string }) => c.status === 'generating').length,
          pending: latestCharacters.filter((c: { status: string }) => c.status === 'pending').length,
        });
      }

      // Decrement active task counter
      activeTaskCountRef.current -= 1;
      if (activeTaskCountRef.current <= 0) {
        activeTaskCountRef.current = 0;
        setIsRunning(false);
        isGeneratingRef.current = false;
        isClientGeneratingRef.current = false; // Allow fetchStatus to update state again
      }

      console.log('[Client] Character generation completed');
      return true;

    } catch (err) {
      console.error('[Client] Generate characters error:', err);
      setError((err as Error).message);
      activeTaskCountRef.current -= 1;
      if (activeTaskCountRef.current <= 0) {
        activeTaskCountRef.current = 0;
        setIsRunning(false);
        isGeneratingRef.current = false;
        isClientGeneratingRef.current = false; // Allow fetchStatus to update state again
      }
      // Refresh status to update UI
      if (historyId) {
        await fetchStatus(historyId, false);
      }
      return false;
    }
  }, [historyId, apiKey, workflow, fetchStatus, updateItemStatus, updateWorkflowStage, stopPolling]);

  // Generate scene images on client side
  const generateScenes = useCallback(async () => {
    if (!historyId || !apiKey) return false;

    // IMPORTANT: Stop global polling during client-side generation
    // This prevents fetchStatus from overwriting local state with potentially stale server data
    stopPolling();

    // Always fetch the latest status before generating to ensure we have the latest data
    // IMPORTANT: Disable autoResume to prevent resumePendingTasksFromData from interfering
    // with the current generation process by setting isGeneratingRef.current = false
    const statusData = await fetchStatus(historyId, false);
    if (!statusData?.workflow) {
      console.error('[Client] Failed to fetch latest workflow status');
      return false;
    }

    type CharacterType = { id: string; name: string; description?: string; imagePrompt: string; status: string; imageUrl?: string; taskId?: string; error?: string };
    type SceneType = { id: number; imagePrompt: string; videoPrompt?: string; imageStatus: string; imageUrl?: string; taskId?: string; error?: string };

    const characters: CharacterType[] = statusData.workflow.characters || [];
    const scenes: SceneType[] = statusData.workflow.scenes || [];
    const pendingScenes = scenes.filter(s => s.imageStatus !== 'done');

    console.log(`[Client] Total scenes in workflow: ${scenes.length}`, scenes.map((s) => ({ id: s.id, imageStatus: s.imageStatus })));

    if (pendingScenes.length === 0) {
      console.log('[Client] No scenes to generate');
      return true;
    }

    // Collect character reference images
    const characterImageUrls = characters
      .filter(c => c.status === 'done' && c.imageUrl)
      .map(c => c.imageUrl!);

    try {
      console.log('[Client] generateScenes starting, counter before:', activeTaskCountRef.current);
      setIsRunning(true);
      isGeneratingRef.current = true;
      isClientGeneratingRef.current = true; // Prevent fetchStatus from overwriting local state
      activeTaskCountRef.current += 1; // Increment for the batch operation
      console.log('[Client] generateScenes counter after increment:', activeTaskCountRef.current);

      // Update stage to scenes
      await updateWorkflowStage('scenes', 'running');

      // Mark all pending as generating
      for (let i = 0; i < scenes.length; i++) {
        if (scenes[i].imageStatus !== 'done') {
          await updateItemStatus('scene', i, { status: 'generating' });
        }
      }
      // Note: Don't call fetchStatus here - updateItemStatus already updates local state
      // Calling fetchStatus would overwrite local state with potentially stale server data

      console.log(`[Client] Generating ${pendingScenes.length} scenes with ${characterImageUrls.length} reference images...`);

      // Generate each scene in parallel
      const generateSingleScene = async (sceneIndex: number) => {
        const scene = scenes[sceneIndex];
        if (scene.imageStatus === 'done' || !isGeneratingRef.current) return;

        try {
          console.log(`[Client] Generating scene ${sceneIndex}: ${scene.id}`);

          const { imageUrl, taskId } = await imageToEditWithModelAPI(
            characterImageUrls,
            scene.imagePrompt
          );

          console.log(`[Client] Scene ${sceneIndex} API response:`, { imageUrl: !!imageUrl, taskId });

          if (taskId) {
            // Save taskId to database immediately for recovery
            console.log(`[Client] Scene ${sceneIndex} got taskId: ${taskId}`);
            await updateItemStatus('scene', sceneIndex, {
              status: 'generating',
              taskId,
            });

            // Async mode - poll for result
            console.log(`[Client] Scene ${sceneIndex} polling for taskId: ${taskId}`);
            const result = await pollImageResultAPI(taskId, () => isGeneratingRef.current);
            console.log(`[Client] Scene ${sceneIndex} poll result:`, { imageUrl: !!result.imageUrl, error: result.error });
            if (result.imageUrl) {
              await updateItemStatus('scene', sceneIndex, {
                status: 'done',
                imageUrl: result.imageUrl,
              });
            } else {
              await updateItemStatus('scene', sceneIndex, {
                status: 'error',
                error: result.error || 'Generation failed',
              });
            }
          } else if (imageUrl) {
            // Sync mode
            await updateItemStatus('scene', sceneIndex, {
              status: 'done',
              imageUrl,
            });
          } else {
            console.error(`[Client] Scene ${sceneIndex} no image or taskId returned`);
            await updateItemStatus('scene', sceneIndex, {
              status: 'error',
              error: 'No image returned',
            });
          }
        } catch (err) {
          console.error(`[Client] Scene ${scene.id} error:`, err);
          await updateItemStatus('scene', sceneIndex, {
            status: 'error',
            error: (err as Error).message,
          });
        }

        // Note: Don't call fetchStatus here as updateItemStatus already updates local state
        // Calling fetchStatus might overwrite our local state with stale data from server
        console.log(`[Client] Scene ${sceneIndex} generation completed`);
      };

      // Run all in parallel
      await Promise.all(
        scenes.map((_, index) =>
          scenes[index].imageStatus !== 'done' ? generateSingleScene(index) : Promise.resolve()
        )
      );

      // Give server time to process all optimistic locking retries before checking status
      await new Promise(resolve => setTimeout(resolve, 500));

      // Fetch latest status and verify all scenes are done before updating stage
      // NOTE: This fetchStatus is called while isClientGeneratingRef is still true,
      // so it won't overwrite local state (per the check in fetchStatus)
      const latestStatus = await fetchStatus(historyId, false);
      const latestScenes = latestStatus?.workflow?.scenes || [];
      const hasGenerating = latestScenes.some((s: { imageStatus: string }) => s.imageStatus === 'generating');
      const hasPending = latestScenes.some((s: { imageStatus: string }) => s.imageStatus === 'pending');
      // 检查是否所有分镜都完成（包括成功和失败的都算完成）
      const allFinished = latestScenes.length > 0 && latestScenes.every(
        (s: { imageStatus: string }) => s.imageStatus === 'done' || s.imageStatus === 'error'
      );

      // Only update to waiting state if all scenes are finished (done or error)
      if (allFinished || (!hasGenerating && !hasPending)) {
        console.log('[Client] All scenes finished, updating workflow stage to scenes_done, waiting...');
        const updateResult = await updateWorkflowStage('scenes_done', 'waiting');
        console.log('[Client] updateWorkflowStage result:', updateResult);
      } else {
        console.log('[Client] Some scenes still generating/pending, NOT updating to waiting state', {
          generating: latestScenes.filter((s: { imageStatus: string }) => s.imageStatus === 'generating').length,
          pending: latestScenes.filter((s: { imageStatus: string }) => s.imageStatus === 'pending').length,
        });
      }

      // Set local state BEFORE fetching status to ensure UI updates
      console.log('[Client] generateScenes finishing, counter before decrement:', activeTaskCountRef.current);
      activeTaskCountRef.current -= 1;
      console.log('[Client] generateScenes counter after decrement:', activeTaskCountRef.current);
      if (activeTaskCountRef.current <= 0) {
        activeTaskCountRef.current = 0;
        console.log('[Client] generateScenes counter is 0, setting isGeneratingRef.current = false');
        setIsRunning(false);
        isGeneratingRef.current = false;
        isClientGeneratingRef.current = false; // Allow fetchStatus to update state again
      }

      // NOTE: Don't call fetchStatus here immediately after generation completes
      // The server database updates may still be in flight due to optimistic locking retries
      // Let the updateItemStatus calls' local state updates take effect
      // The next scheduled poll (if any) will sync with server data after a delay
      console.log('[Client] Scene generation completed, skipping immediate fetchStatus to preserve local state');

      console.log('[Client] Scene generation completed');
      return true;

    } catch (err) {
      console.error('[Client] Generate scenes error:', err);
      setError((err as Error).message);
      console.log('[Client] generateScenes error, counter before decrement:', activeTaskCountRef.current);
      activeTaskCountRef.current -= 1;
      console.log('[Client] generateScenes error, counter after decrement:', activeTaskCountRef.current);
      if (activeTaskCountRef.current <= 0) {
        activeTaskCountRef.current = 0;
        console.log('[Client] generateScenes error, counter is 0, setting isGeneratingRef.current = false');
        setIsRunning(false);
        isGeneratingRef.current = false;
        isClientGeneratingRef.current = false; // Allow fetchStatus to update state again
      }
      // Refresh status to update UI
      if (historyId) {
        await fetchStatus(historyId, false);
      }
      return false;
    }
  }, [historyId, apiKey, workflow, fetchStatus, updateItemStatus, updateWorkflowStage, stopPolling]);

  // Generate videos on client side
  const generateVideos = useCallback(async (videoModel?: VideoModelId) => {
    if (!historyId || !apiKey) return false;

    // IMPORTANT: Stop global polling during client-side generation
    // This prevents fetchStatus from overwriting local state with potentially stale server data
    stopPolling();

    // Always fetch the latest status before generating to ensure we have the latest data
    // IMPORTANT: Disable autoResume to prevent resumePendingTasksFromData from interfering
    // with the current generation process by setting isGeneratingRef.current = false
    const statusData = await fetchStatus(historyId, false);
    if (!statusData?.workflow) {
      console.error('[Client] Failed to fetch latest workflow status');
      return false;
    }

    type SceneType = { id: number; imagePrompt: string; videoPrompt?: string; imageStatus: string; imageUrl?: string; taskId?: string; error?: string };
    type VideoType = { id: string; index: number; prompt: string; firstFrame: string; lastFrame?: string; status: string; taskId?: string; videoUrl?: string; error?: string };

    const scenes: SceneType[] = statusData.workflow.scenes || [];
    let videos: VideoType[] = statusData.workflow.videos || [];

    // 详细日志：查看 scenes 的数据结构
    console.log(`[Client] Scenes data from workflow:`, scenes.map((s, i) => ({
      index: i,
      id: s.id,
      imageStatus: s.imageStatus,
      hasImageUrl: !!s.imageUrl,
      imagePrompt: s.imagePrompt?.substring(0, 50) + ((s.imagePrompt?.length ?? 0) > 50 ? '...' : ''),
      videoPrompt: s.videoPrompt?.substring(0, 50) + ((s.videoPrompt?.length ?? 0) > 50 ? '...' : ''),
    })));

    console.log(`[Client] Total videos in workflow: ${videos.length}`, videos.map((v) => ({ id: v.id, status: v.status })));

    // 获取视频生成模式，默认为 first-last-frame
    const videoMode = statusData.workflow.videoGenerationMode || 'first-last-frame';
    console.log(`[Client] Video generation mode: ${videoMode}`);

    // Create video tasks if not exist
    if (videos.length === 0) {
      const completedScenes = scenes.filter(s => s.imageStatus === 'done' && s.imageUrl);
      console.log(`[Client] Creating videos from ${completedScenes.length} completed scenes`);

      videos = completedScenes.map((s, i) => {
        const nextScene = completedScenes[i + 1];
        // 优先使用 videoPrompt，如果为空则使用 imagePrompt 作为备选
        const prompt = s.videoPrompt || s.imagePrompt || '';
        const lastFrameUrl = videoMode === 'first-last-frame' ? nextScene?.imageUrl : undefined;
        console.log(`[Client] Creating video ${i}:`, {
          sceneId: s.id,
          videoPrompt: s.videoPrompt || '(empty)',
          imagePrompt: s.imagePrompt || '(empty)',
          usingPrompt: prompt || '(empty)',
          hasFirstFrame: !!s.imageUrl,
          hasLastFrame: !!lastFrameUrl,
          nextSceneIndex: i + 1,
          nextSceneExists: !!nextScene,
          nextSceneImageUrl: nextScene?.imageUrl ? 'has url' : '(none)',
          videoMode,
        });
        return {
          id: `video-${i}`,
          index: i,
          prompt,
          firstFrame: s.imageUrl!,
          // 根据视频生成模式决定是否使用尾帧
          lastFrame: lastFrameUrl,
          status: 'pending',
        };
      });

      console.log(`[Client] Created ${videos.length} video items, saving to server...`);
      // Save videos array first
      await updateWorkflowStage('videos', 'running', { videos });
      console.log(`[Client] Videos array saved to server, fetching status...`);
      await fetchStatus(historyId, false);
    }

    const pendingVideos = videos.filter(v => v.status !== 'done');
    if (pendingVideos.length === 0) {
      console.log('[Client] No videos to generate, all videos are done');
      // All videos are already done, update stage to videos_done
      const hasSuccessVideos = videos.some(v => v.status === 'done');
      if (hasSuccessVideos) {
        console.log('[Client] Updating workflow stage to videos_done');
        await updateWorkflowStage('videos_done', 'waiting');
        await fetchStatus(historyId, false);
      }
      return true;
    }

    try {
      setIsRunning(true);
      isGeneratingRef.current = true;
      isClientGeneratingRef.current = true; // Prevent fetchStatus from overwriting local state

      // Update stage to videos
      await updateWorkflowStage('videos', 'running');

      // Mark all pending as submitting
      for (let i = 0; i < videos.length; i++) {
        if (videos[i].status !== 'done') {
          await updateItemStatus('video', i, { status: 'submitting' });
        }
      }
      // Note: Don't call fetchStatus here - updateItemStatus already updates local state
      // Calling fetchStatus would overwrite local state with potentially stale server data

      console.log(`[Client] Generating ${pendingVideos.length} videos...`);

      // Get completed scenes for lastFrame calculation
      const completedScenes = scenes.filter(s => s.imageStatus === 'done' && s.imageUrl);

      // Generate each video in parallel
      const generateSingleVideo = async (videoIndex: number) => {
        const video = videos[videoIndex];
        if (video.status === 'done' || !isGeneratingRef.current) return;

        // IMPORTANT: Always read firstFrame from the latest scene image
        // video.index corresponds to the position in completedScenes array
        const effectiveFirstFrame = completedScenes[video.index]?.imageUrl || video.firstFrame;

        // Recalculate lastFrame based on current videoGenerationMode
        let effectiveLastFrame = video.lastFrame;
        if (videoMode === 'first-last-frame' && !video.lastFrame) {
          // Get next scene's imageUrl as lastFrame
          const nextSceneIndex = video.index + 1;
          if (nextSceneIndex < completedScenes.length) {
            effectiveLastFrame = completedScenes[nextSceneIndex].imageUrl;
            console.log(`[Client] Recalculated lastFrame for video ${videoIndex} from scene ${nextSceneIndex}`);
          }
        } else if (videoMode === 'single-image') {
          effectiveLastFrame = undefined;
        }

        try {
          console.log(`[Client] Generating video ${videoIndex}:`, {
            id: video.id,
            prompt: video.prompt?.substring(0, 100) + (video.prompt?.length > 100 ? '...' : ''),
            hasFirstFrame: !!effectiveFirstFrame,
            hasLastFrame: !!effectiveLastFrame,
            videoMode,
            originalFirstFrame: video.firstFrame?.substring(0, 50),
            effectiveFirstFrame: effectiveFirstFrame?.substring(0, 50),
          });

          const videoItem: VideoItem = {
            id: video.id,
            index: video.index,
            prompt: video.prompt,
            firstFrame: effectiveFirstFrame,
            lastFrame: effectiveLastFrame,
            status: 'pending',
          };

          const { taskId, error: submitError } = await submitVideoTaskAPI(videoItem, videoModel);

          if (!taskId) {
            console.error(`[Client] Video ${videoIndex} submit failed:`, submitError);
            await updateItemStatus('video', videoIndex, {
              status: 'error',
              error: submitError || 'Failed to submit video task',
            });
            return;
          }

          console.log(`[Client] Video ${videoIndex} submitted, taskId:`, taskId);

          // Update with taskId and polling status
          await updateItemStatus('video', videoIndex, {
            status: 'polling',
            taskId,
          });

          // Poll for result
          console.log(`[Client] Video ${videoIndex} polling started...`);
          const result = await pollVideoResultAPI(taskId, () => isGeneratingRef.current);
          console.log(`[Client] Video ${videoIndex} poll result:`, { hasVideoUrl: !!result.videoUrl, error: result.error });

          if (result.videoUrl) {
            await updateItemStatus('video', videoIndex, {
              status: 'done',
              videoUrl: result.videoUrl,
            });
          } else {
            await updateItemStatus('video', videoIndex, {
              status: 'error',
              error: result.error || 'Video generation failed',
            });
          }
        } catch (err) {
          console.error(`[Client] Video ${video.id} error:`, err);
          await updateItemStatus('video', videoIndex, {
            status: 'error',
            error: (err as Error).message,
          });
        }

        // Note: Don't call fetchStatus here as updateItemStatus already updates local state
        // Calling fetchStatus might overwrite our local state with stale data from server
        console.log(`[Client] Video ${videoIndex} generation completed`);
      };

      // Run all in parallel
      await Promise.all(
        videos.map((_, index) =>
          videos[index].status !== 'done' ? generateSingleVideo(index) : Promise.resolve()
        )
      );

      // Give server time to process all optimistic locking retries before checking status
      await new Promise(resolve => setTimeout(resolve, 500));

      // Fetch latest status and verify all videos are done before updating stage
      // NOTE: This fetchStatus is called while isClientGeneratingRef is still true,
      // so it won't overwrite local state (per the check in fetchStatus)
      const latestStatus = await fetchStatus(historyId, false);
      const finalVideos = latestStatus?.workflow?.videos || [];
      const hasGenerating = finalVideos.some((v: { status: string }) => v.status === 'submitting' || v.status === 'polling');
      const hasPending = finalVideos.some((v: { status: string }) => v.status === 'pending');
      const successVideos = finalVideos.filter((v: { status: string }) => v.status === 'done');

      // Only update to waiting state if no videos are still generating or pending
      if (!hasGenerating && !hasPending) {
        if (successVideos.length > 0) {
          // Set to waiting state - user will manually trigger merge
          console.log(`[Client] All videos finished, ${successVideos.length} done, waiting for user to merge...`);
          console.log('[Client] Updating workflow stage to videos_done, waiting...');
          const updateResult = await updateWorkflowStage('videos_done', 'waiting');
          console.log('[Client] updateWorkflowStage result:', updateResult);
        } else {
          // No successful videos
          await updateWorkflowStage('error', 'failed');
        }
      } else {
        console.log('[Client] Some videos still generating/pending, NOT updating to waiting state', {
          generating: finalVideos.filter((v: { status: string }) => v.status === 'submitting' || v.status === 'polling').length,
          pending: finalVideos.filter((v: { status: string }) => v.status === 'pending').length,
        });
      }

      // Set local state - don't call fetchStatus again to preserve local state
      setIsRunning(false);
      isGeneratingRef.current = false;
      isClientGeneratingRef.current = false; // Allow fetchStatus to update state again

      // NOTE: Don't call fetchStatus here immediately after generation completes
      // The server database updates may still be in flight due to optimistic locking retries
      // Let the updateItemStatus calls' local state updates take effect
      console.log('[Client] Video generation completed, skipping immediate fetchStatus to preserve local state');

      console.log('[Client] Video generation completed');
      return true;

    } catch (err) {
      console.error('[Client] Generate videos error:', err);
      setError((err as Error).message);
      setIsRunning(false);
      isGeneratingRef.current = false;
      isClientGeneratingRef.current = false; // Allow fetchStatus to update state again
      // Refresh status to update UI
      if (historyId) {
        await fetchStatus(historyId, false);
      }
      return false;
    }
  }, [historyId, apiKey, workflow, fetchStatus, updateItemStatus, updateWorkflowStage, stopPolling]);

  // Batch regenerate ALL character images (reset all to pending first)
  const batchRegenerateCharacters = useCallback(async () => {
    console.log('[Client] batchRegenerateCharacters called', { historyId, hasApiKey: !!apiKey });

    if (!historyId || !apiKey) {
      console.log('[Client] batchRegenerateCharacters: missing historyId or apiKey');
      return false;
    }

    // Always fetch the latest status before regenerating
    // IMPORTANT: Disable autoResume to prevent interference with the generation process
    const statusData = await fetchStatus(historyId, false);
    if (!statusData?.workflow) {
      console.error('[Client] Failed to fetch latest workflow status');
      return false;
    }

    type CharacterType = { id: string; name: string; description?: string; imagePrompt: string; status: string; imageUrl?: string; taskId?: string; error?: string };
    const characters: CharacterType[] = statusData.workflow.characters || [];

    if (characters.length === 0) {
      console.log('[Client] No characters to regenerate');
      return false;
    }

    console.log(`[Client] Batch regenerating ALL ${characters.length} characters...`);

    try {
      setIsRunning(true);
      isGeneratingRef.current = true;
      isClientGeneratingRef.current = true; // Prevent fetchStatus from overwriting local state

      // Update stage to characters
      await updateWorkflowStage('characters', 'running');

      // Reset ALL characters to pending first
      for (let i = 0; i < characters.length; i++) {
        await updateItemStatus('character', i, {
          status: 'pending',
          imageUrl: null,  // Use null instead of undefined to preserve key in JSON
          taskId: null,
          error: null,
        });
      }
      // Note: Don't call fetchStatus here - updateItemStatus already updates local state

      // Now call generateCharacters which will generate all pending characters
      const result = await generateCharacters();
      return result;

    } catch (err) {
      console.error('[Client] Batch regenerate characters error:', err);
      setError((err as Error).message);
      setIsRunning(false);
      isGeneratingRef.current = false;
      isClientGeneratingRef.current = false; // Allow fetchStatus to update state again
      if (historyId) {
        await fetchStatus(historyId, false);
      }
      return false;
    }
  }, [historyId, apiKey, fetchStatus, updateItemStatus, updateWorkflowStage, generateCharacters]);

  // Batch regenerate ALL scene images (reset all to pending first)
  const batchRegenerateScenes = useCallback(async () => {
    console.log('[Client] batchRegenerateScenes called', { historyId, hasApiKey: !!apiKey });

    if (!historyId || !apiKey) {
      console.log('[Client] batchRegenerateScenes: missing historyId or apiKey');
      return false;
    }

    // Always fetch the latest status before regenerating
    const statusData = await fetchStatus(historyId, false);
    if (!statusData?.workflow) {
      console.error('[Client] Failed to fetch latest workflow status');
      return false;
    }

    type SceneType = { id: number; imagePrompt: string; videoPrompt?: string; imageStatus: string; imageUrl?: string; taskId?: string; error?: string };
    const scenes: SceneType[] = statusData.workflow.scenes || [];

    if (scenes.length === 0) {
      console.log('[Client] No scenes to regenerate');
      return false;
    }

    console.log(`[Client] Batch regenerating ALL ${scenes.length} scenes...`);

    try {
      setIsRunning(true);
      isGeneratingRef.current = true;
      isClientGeneratingRef.current = true; // Prevent fetchStatus from overwriting local state

      // Update stage to scenes
      await updateWorkflowStage('scenes', 'running');

      // Reset ALL scenes to pending first
      for (let i = 0; i < scenes.length; i++) {
        await updateItemStatus('scene', i, {
          status: 'pending',
          imageUrl: null,  // Use null instead of undefined to preserve key in JSON
          taskId: null,
          error: null,
        });
      }
      // Note: Don't call fetchStatus here - updateItemStatus already updates local state

      // Now call generateScenes which will generate all pending scenes
      const result = await generateScenes();
      return result;

    } catch (err) {
      console.error('[Client] Batch regenerate scenes error:', err);
      setError((err as Error).message);
      setIsRunning(false);
      isGeneratingRef.current = false;
      isClientGeneratingRef.current = false; // Allow fetchStatus to update state again
      if (historyId) {
        await fetchStatus(historyId, false);
      }
      return false;
    }
  }, [historyId, apiKey, fetchStatus, updateItemStatus, updateWorkflowStage, generateScenes]);

  // Resume polling for tasks that have taskId but are still in generating state
  const resumePendingTasks = useCallback(async () => {
    if (!historyId || !apiKey || !workflow) return false;

    const characters = workflow.characters || [];
    const scenes = workflow.scenes || [];
    const videos = workflow.videos || [];

    // Find items with taskId that are still generating
    const pendingCharacters = characters.filter((c: { status: string; taskId?: string }) =>
      c.status === 'generating' && c.taskId
    );
    const pendingScenes = scenes.filter((s: { imageStatus: string; taskId?: string }) =>
      s.imageStatus === 'generating' && s.taskId
    );
    const pendingVideos = videos.filter((v: { status: string; taskId?: string }) =>
      (v.status === 'submitting' || v.status === 'polling') && v.taskId
    );

    if (pendingCharacters.length === 0 && pendingScenes.length === 0 && pendingVideos.length === 0) {
      console.log('[Resume] No pending tasks with taskId to resume');
      return false;
    }

    console.log('[Resume] Found pending tasks:', {
      characters: pendingCharacters.length,
      scenes: pendingScenes.length,
      videos: pendingVideos.length,
    });

    setIsRunning(true);
    isGeneratingRef.current = true;
    activeTaskCountRef.current += 1; // Increment for resume operation

    // Resume character polling
    const resumeCharacterPolling = async (charIndex: number, taskId: string) => {
      console.log(`[Resume] Resuming character ${charIndex} polling for taskId: ${taskId}`);
      try {
        const result = await pollImageResultAPI(taskId, () => isGeneratingRef.current);
        if (result.imageUrl) {
          await updateItemStatus('character', charIndex, {
            status: 'done',
            imageUrl: result.imageUrl,
          });
        } else {
          await updateItemStatus('character', charIndex, {
            status: 'error',
            error: result.error || 'Generation failed',
          });
        }
      } catch (err) {
        console.error(`[Resume] Character ${charIndex} polling error:`, err);
        await updateItemStatus('character', charIndex, {
          status: 'error',
          error: (err as Error).message,
        });
      }
      await fetchStatus(historyId, false);
    };

    // Resume scene polling
    const resumeScenePolling = async (sceneIndex: number, taskId: string) => {
      console.log(`[Resume] Resuming scene ${sceneIndex} polling for taskId: ${taskId}`);
      try {
        const result = await pollImageResultAPI(taskId, () => isGeneratingRef.current);
        if (result.imageUrl) {
          await updateItemStatus('scene', sceneIndex, {
            status: 'done',
            imageUrl: result.imageUrl,
          });
        } else {
          await updateItemStatus('scene', sceneIndex, {
            status: 'error',
            error: result.error || 'Generation failed',
          });
        }
      } catch (err) {
        console.error(`[Resume] Scene ${sceneIndex} polling error:`, err);
        await updateItemStatus('scene', sceneIndex, {
          status: 'error',
          error: (err as Error).message,
        });
      }
      await fetchStatus(historyId, false);
    };

    // Resume video polling
    const resumeVideoPolling = async (videoIndex: number, taskId: string) => {
      console.log(`[Resume] Resuming video ${videoIndex} polling for taskId: ${taskId}`);
      try {
        const result = await pollVideoResultAPI(taskId, () => isGeneratingRef.current);
        if (result.videoUrl) {
          await updateItemStatus('video', videoIndex, {
            status: 'done',
            videoUrl: result.videoUrl,
          });
        } else {
          await updateItemStatus('video', videoIndex, {
            status: 'error',
            error: result.error || 'Generation failed',
          });
        }
      } catch (err) {
        console.error(`[Resume] Video ${videoIndex} polling error:`, err);
        await updateItemStatus('video', videoIndex, {
          status: 'error',
          error: (err as Error).message,
        });
      }
      await fetchStatus(historyId, false);
    };

    // Run all resumptions in parallel
    const promises: Promise<void>[] = [];

    pendingCharacters.forEach((char) => {
      if (!char.taskId) return;
      const originalIndex = characters.findIndex((c) => c.taskId === char.taskId);
      if (originalIndex !== -1) {
        promises.push(resumeCharacterPolling(originalIndex, char.taskId));
      }
    });

    pendingScenes.forEach((scene) => {
      if (!scene.taskId) return;
      const originalIndex = scenes.findIndex((s) => s.taskId === scene.taskId);
      if (originalIndex !== -1) {
        promises.push(resumeScenePolling(originalIndex, scene.taskId));
      }
    });

    pendingVideos.forEach((video) => {
      if (!video.taskId) return;
      const originalIndex = videos.findIndex((v) => v.taskId === video.taskId);
      if (originalIndex !== -1) {
        promises.push(resumeVideoPolling(originalIndex, video.taskId));
      }
    });

    await Promise.all(promises);

    // Check if all tasks completed and update workflow stage
    await fetchStatus(historyId, false);

    // Decrement counter and check if safe to reset
    activeTaskCountRef.current -= 1;
    if (activeTaskCountRef.current <= 0) {
      activeTaskCountRef.current = 0;
      setIsRunning(false);
      isGeneratingRef.current = false;
    }

    console.log('[Resume] All pending tasks completed');
    return true;
  }, [historyId, apiKey, workflow, fetchStatus, updateItemStatus]);

  // 判断是否正在等待用户继续
  const isWaiting = workflow?.status === 'waiting';

  return {
    // 状态
    historyId,
    isRunning,
    isWaiting,
    workflow,
    progress,
    error,

    // 方法
    startWorkflow,
    stopWorkflow,
    continueWorkflow,
    restoreWorkflow,
    fetchStatus,
    retryVideo,
    retryCharacter,
    retryScene,
    retryMerge,
    uploadCharacter,
    updateScript,
    addCharacter,
    addScene,
    reorderCharacter,
    reorderScene,
    deleteCharacter,
    deleteScene,
    // Client-side generation methods
    generateCharacters,
    generateScenes,
    generateVideos,
    // Batch regenerate methods
    batchRegenerateCharacters,
    batchRegenerateScenes,
    // Auto-resume
    needsAutoResume,
    resumePendingTasks,
  };
}
