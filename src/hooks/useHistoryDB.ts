'use client';

import { getApiKey } from '@/config/api';
import { hashApiKey, supabase, type DbWorkflowHistory, type TaskItem, type CharacterData, type SceneData, type VideoData } from '@/lib/supabase';
import { useCallback, useRef } from 'react';

// 前端使用的 History 类型
export interface WorkflowHistory {
  id: number;
  title: string;
  type: string;
  mode: string;
  aspectRatio: string;
  imageSize: string;
  tasks: TaskItem[];
  totalCount: number;
  successCount: number;
  errorCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  // 兼容旧字段
  imageGenMode?: string;
  imageGenTotalCount?: number;
  imageGenSuccessCount?: number;
  imageGenErrorCount?: number;
  imageGenImages?: string;
  // Workflow 相关字段
  videoUrl?: string;
  scriptResult?: string;
  characters?: CharacterData[];
  scenes?: SceneData[];
  videos?: VideoData[];
  mergedVideoUrl?: string;
  chatMessages?: ChatMessageData[];
}

// Chat message 数据类型
export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
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
  // 阶段完成通知
  stageNotification?: {
    stage: 'script_done' | 'characters_done' | 'scenes_done' | 'videos_done';
    title: string;
    description: string;
    actionLabel: string;
  };
  // 建议的 prompt 修改
  suggestedPrompt?: {
    type: 'character' | 'scene';
    index: number;
    name: string;
    prompt: string;
    videoPrompt?: string;
    isCreate?: boolean;
  };
}

// 获取当前用户的 API Key 哈希
function getUserApiKeyHash(): string {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API Key not set');
  }
  return hashApiKey(apiKey);
}

// 格式化时间戳
function formatTimestamp(date: string): string {
  return new Date(date).toISOString().replace('T', ' ').substring(0, 19);
}

// DB 记录转前端格式
function dbHistoryToFrontend(record: DbWorkflowHistory): WorkflowHistory {
  const tasks = record.tasks || [];

  // 构建 imageGenImages 字段（兼容旧代码）
  const completedImages = tasks
    .filter(t => t.status === 'done' && t.generatedUrl)
    .map(t => ({
      id: t.index,
      prompt: t.prompt,
      imageUrl: t.generatedUrl,
    }));

  return {
    id: record.id,
    title: record.title,
    type: record.type,
    mode: record.mode,
    aspectRatio: record.aspect_ratio,
    imageSize: record.image_size,
    tasks: tasks,
    totalCount: record.total_count,
    successCount: record.success_count,
    errorCount: record.error_count,
    status: record.status,
    createdAt: formatTimestamp(record.created_at),
    updatedAt: formatTimestamp(record.updated_at),
    // 兼容旧字段
    imageGenMode: record.mode,
    imageGenTotalCount: record.total_count,
    imageGenSuccessCount: record.success_count,
    imageGenErrorCount: record.error_count,
    imageGenImages: JSON.stringify(completedImages),
    // Workflow 相关字段
    videoUrl: record.video_url || undefined,
    scriptResult: record.script_result || undefined,
    characters: record.characters || [],
    scenes: record.scenes || [],
    videos: record.videos || [],
    mergedVideoUrl: record.merged_video_url || undefined,
    chatMessages: (record.chat_messages || []) as ChatMessageData[],
  };
}

// ==================== History CRUD ====================

// 获取所有历史记录
export async function getAllWorkflowHistory(): Promise<WorkflowHistory[]> {
  const userApiKey = getUserApiKeyHash();

  const { data: histories, error } = await supabase
    .from('workflow_histories')
    .select('*')
    .eq('user_api_key', userApiKey)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Fetch histories failed: ${error.message}`);
  }

  if (!histories || histories.length === 0) {
    return [];
  }

  return histories.map(h => dbHistoryToFrontend(h));
}

// 获取单个历史记录
export async function getWorkflowHistoryById(id: number): Promise<WorkflowHistory | null> {
  const userApiKey = getUserApiKeyHash();

  const { data, error } = await supabase
    .from('workflow_histories')
    .select('*')
    .eq('id', id)
    .eq('user_api_key', userApiKey)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Fetch history failed: ${error.message}`);
  }

  return dbHistoryToFrontend(data);
}

// 删除历史记录
export async function deleteWorkflowHistory(id: number): Promise<void> {
  const userApiKey = getUserApiKeyHash();

  const { error } = await supabase
    .from('workflow_histories')
    .delete()
    .eq('id', id)
    .eq('user_api_key', userApiKey);

  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}

// 获取正在运行的任务（用于页面刷新恢复）
export async function getRunningHistories(): Promise<WorkflowHistory[]> {
  const userApiKey = getUserApiKeyHash();

  const { data, error } = await supabase
    .from('workflow_histories')
    .select('*')
    .eq('user_api_key', userApiKey)
    .eq('status', 'running')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Fetch running histories failed: ${error.message}`);
  }

  return (data || []).map(h => dbHistoryToFrontend(h));
}

// 停止历史记录的所有任务
export async function stopHistoryTasks(historyId: number): Promise<void> {
  const userApiKey = getUserApiKeyHash();

  // 验证权限
  const { data: history, error: historyError } = await supabase
    .from('workflow_histories')
    .select('id, tasks')
    .eq('id', historyId)
    .eq('user_api_key', userApiKey)
    .single();

  if (historyError || !history) {
    throw new Error('History not found or access denied');
  }

  // 更新任务状态
  const tasks = (history.tasks as TaskItem[]) || [];
  const updatedTasks = tasks.map(t => {
    if (t.status === 'pending' || t.status === 'processing') {
      return { ...t, status: 'error' as const, error: 'Stopped by user' };
    }
    return t;
  });

  const errorCount = updatedTasks.filter(t => t.status === 'error').length;

  await supabase
    .from('workflow_histories')
    .update({
      status: 'stopped',
      tasks: updatedTasks,
      error_count: errorCount,
    })
    .eq('id', historyId);
}

// ==================== Workflow History Functions ====================

// 创建 workflow 类型的历史记录
export async function createWorkflowHistory(data: {
  title: string;
  videoUrl?: string;
  scriptResult?: string;
  status?: string;
}): Promise<number> {
  const userApiKey = getUserApiKeyHash();

  const { data: result, error } = await supabase
    .from('workflow_histories')
    .insert({
      user_api_key: userApiKey,
      title: data.title,
      type: 'workflow',
      mode: 'workflow',
      aspect_ratio: '16:9',
      image_size: '1K',
      tasks: [],
      total_count: 0,
      status: data.status || 'running',
      video_url: data.videoUrl || null,
      script_result: data.scriptResult || null,
      characters: [],
      scenes: [],
      videos: [],
      merged_video_url: null,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Create workflow history failed: ${error.message}`);
  }

  return result.id;
}

// 更新 workflow 历史记录
export async function updateWorkflowHistoryFull(id: number, data: {
  status?: string;
  videoUrl?: string;
  scriptResult?: string;
  characters?: CharacterData[];
  scenes?: SceneData[];
  videos?: VideoData[];
  mergedVideoUrl?: string | null;
  chatMessages?: ChatMessageData[];
}): Promise<void> {
  const userApiKey = getUserApiKeyHash();

  const updateData: Record<string, unknown> = {};

  if (data.status !== undefined) updateData.status = data.status;
  if (data.videoUrl !== undefined) updateData.video_url = data.videoUrl;
  if (data.scriptResult !== undefined) updateData.script_result = data.scriptResult;
  if (data.characters !== undefined) updateData.characters = data.characters;
  if (data.scenes !== undefined) updateData.scenes = data.scenes;
  if (data.videos !== undefined) updateData.videos = data.videos;
  if (data.mergedVideoUrl !== undefined) updateData.merged_video_url = data.mergedVideoUrl;
  if (data.chatMessages !== undefined) updateData.chat_messages = data.chatMessages;

  if (Object.keys(updateData).length === 0) return;

  const { error } = await supabase
    .from('workflow_histories')
    .update(updateData)
    .eq('id', id)
    .eq('user_api_key', userApiKey);

  if (error) {
    throw new Error(`Update workflow history failed: ${error.message}`);
  }
}

// ==================== 兼容旧接口 ====================

export async function saveWorkflowHistory(data: {
  title: string;
  type?: string;
  imageGenMode?: string;
  imageGenTotalCount?: number;
  status?: string;
}): Promise<number> {
  const userApiKey = getUserApiKeyHash();

  const { data: result, error } = await supabase
    .from('workflow_histories')
    .insert({
      user_api_key: userApiKey,
      title: data.title,
      type: data.type || 'image-gen',
      mode: data.imageGenMode || 'text-to-image',
      aspect_ratio: '1:1',
      image_size: '1K',
      tasks: [],
      total_count: data.imageGenTotalCount || 0,
      status: data.status || 'pending',
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Create history failed: ${error.message}`);
  }

  return result.id;
}

export async function updateWorkflowHistory(id: number, data: {
  status?: string;
}): Promise<void> {
  const userApiKey = getUserApiKeyHash();

  if (data.status) {
    const { error } = await supabase
      .from('workflow_histories')
      .update({ status: data.status })
      .eq('id', id)
      .eq('user_api_key', userApiKey);

    if (error) {
      throw new Error(`Update history failed: ${error.message}`);
    }
  }
}

// ==================== LocalStorage 持久化 ====================

const RUNNING_HISTORY_KEY = 'running_history_id';

// 保存当前运行中的历史 ID 到 localStorage
function saveRunningHistoryId(id: number | null) {
  if (id === null) {
    localStorage.removeItem(RUNNING_HISTORY_KEY);
  } else {
    localStorage.setItem(RUNNING_HISTORY_KEY, String(id));
  }
}

// 从 localStorage 获取当前运行中的历史 ID
function getRunningHistoryId(): number | null {
  const id = localStorage.getItem(RUNNING_HISTORY_KEY);
  return id ? parseInt(id, 10) : null;
}

// ==================== React Hook ====================

export function useHistoryDB() {
  const currentHistoryIdRef = useRef<number | null>(null);
  const historyTypeRef = useRef<'image-gen' | 'workflow'>('image-gen');

  // 保存历史记录（自动判断类型）
  const saveHistory = useCallback(async (title: string, data: {
    type?: 'image-gen' | 'workflow';
    status?: string;
    videoUrl?: string;
    scriptResult?: string;
  }): Promise<number | null> => {
    try {
      const type = data.type || 'workflow';
      historyTypeRef.current = type;

      let id: number;
      if (type === 'workflow') {
        id = await createWorkflowHistory({
          title,
          status: data.status || 'running',
          videoUrl: data.videoUrl,
          scriptResult: data.scriptResult,
        });
      } else {
        id = await saveWorkflowHistory({ title, status: data.status });
      }

      currentHistoryIdRef.current = id;
      // 持久化运行中的历史 ID
      saveRunningHistoryId(id);
      return id;
    } catch (error) {
      console.error('Failed to save history:', error);
      return null;
    }
  }, []);

  // 更新历史记录
  const updateHistory = useCallback(async (data: {
    status?: string;
    scriptResult?: string;
    characters?: unknown[];
    scenes?: unknown[];
    videos?: unknown[];
    mergedVideoUrl?: string | null;
    videoUrl?: string;
    chatMessages?: ChatMessageData[];
  }): Promise<void> => {
    if (!currentHistoryIdRef.current) return;

    try {
      if (historyTypeRef.current === 'workflow') {
        // Workflow 类型：保存完整数据
        await updateWorkflowHistoryFull(currentHistoryIdRef.current, {
          status: data.status,
          videoUrl: data.videoUrl,
          scriptResult: data.scriptResult,
          characters: data.characters as CharacterData[] | undefined,
          scenes: data.scenes as SceneData[] | undefined,
          videos: data.videos as VideoData[] | undefined,
          mergedVideoUrl: data.mergedVideoUrl,
          chatMessages: data.chatMessages,
        });
      } else {
        // Image-gen 类型：只更新 status
        if (data.status) {
          await updateWorkflowHistory(currentHistoryIdRef.current, { status: data.status });
        }
      }

      // 如果状态变为终态，清除 localStorage 中的运行中 ID
      if (data.status && ['completed', 'failed', 'stopped'].includes(data.status)) {
        saveRunningHistoryId(null);
      }
    } catch (error) {
      console.error('Failed to update history:', error);
    }
  }, []);

  const setCurrentHistoryId = useCallback((id: number | null, type?: 'image-gen' | 'workflow') => {
    currentHistoryIdRef.current = id;
    if (type) historyTypeRef.current = type;
    // 同步更新 localStorage
    if (id !== null) {
      saveRunningHistoryId(id);
    }
  }, []);

  const getCurrentHistoryId = useCallback(() => {
    return currentHistoryIdRef.current;
  }, []);

  // 清除运行中的历史 ID（用于停止任务时）
  const clearRunningHistory = useCallback(() => {
    saveRunningHistoryId(null);
  }, []);

  // 获取运行中的历史记录（用于页面刷新恢复）
  const getRunningHistory = useCallback(async (): Promise<WorkflowHistory | null> => {
    const runningId = getRunningHistoryId();
    if (!runningId) return null;

    try {
      const history = await getWorkflowHistoryById(runningId);
      if (history && history.status === 'running') {
        // 设置当前历史 ID
        currentHistoryIdRef.current = runningId;
        historyTypeRef.current = history.type as 'image-gen' | 'workflow';
        return history;
      }
      // 如果历史记录不存在或已完成，清除 localStorage
      saveRunningHistoryId(null);
      return null;
    } catch (error) {
      console.error('Failed to get running history:', error);
      saveRunningHistoryId(null);
      return null;
    }
  }, []);

  return {
    saveHistory,
    updateHistory,
    setCurrentHistoryId,
    getCurrentHistoryId,
    clearRunningHistory,
    getRunningHistory,
    getAllHistory: getAllWorkflowHistory,
    getHistoryById: getWorkflowHistoryById,
    deleteHistory: deleteWorkflowHistory,
  };
}
