'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { PreviewContent } from '@/types/workflow';
import { uploadToOSS } from '@/services/api';
import { getApiKey } from '@/config/api';
import { getRunningHistories } from '@/hooks/useHistoryDB';

export type GenerationMode = 'text-to-image' | 'image-to-edit';

export interface ImageTask {
  id: string;
  index: number;
  filename?: string;
  originalUrl?: string;
  prompt: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  generatedUrl?: string;
  error?: string;
}

export interface LogItem {
  id: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  time: string;
}

// 任务轮询间隔
const POLL_INTERVAL = 3000;

const formatTime = () =>
  new Date().toLocaleTimeString('en-US', { hour12: false });

export function useImageWorkflow() {
  const [mode, setMode] = useState<GenerationMode>('text-to-image');
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [tasks, setTasks] = useState<ImageTask[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [previewContent, setPreviewContent] = useState<PreviewContent | null>(null);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);
  const [currentHistoryId, setCurrentHistoryId] = useState<number | null>(null);

  // Generation parameters
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');

  // Image-to-edit mode: uploaded images
  const [uploadedImages, setUploadedImages] = useState<{ filename: string; url: string }[]>([]);

  const abortRef = useRef(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initializedRef = useRef(false);

  const addLog = useCallback((type: LogItem['type'], message: string) => {
    setLogs((prev) => [
      ...prev,
      { id: `log-${Date.now()}-${Math.random()}`, type, message, time: formatTime() },
    ]);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewContent(null);
  }, []);

  // Switch mode
  const switchMode = useCallback((newMode: GenerationMode) => {
    setMode(newMode);
    setTasks([]);
    setUploadedImages([]);
    setLogs([]);
  }, []);

  // Handle file upload (image-to-edit mode)
  const handleFilesUpload = useCallback(async (files: File[], replace: boolean = true) => {
    addLog('info', `Starting upload of ${files.length} files...`);

    const newImages: { filename: string; url: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (!file.type.startsWith('image/')) {
        addLog('warning', `Skipping non-image file: ${file.name}`);
        continue;
      }

      try {
        addLog('info', `Uploading: ${file.name}`);
        const ossUrl = await uploadToOSS(file, `batch-${Date.now()}-${file.name}`);
        newImages.push({ filename: file.name, url: ossUrl });
      } catch (error) {
        const err = error as Error;
        addLog('error', `Upload failed ${file.name}: ${err.message}`);
      }
    }

    setUploadedImages(replace ? newImages : (prev) => [...prev, ...newImages]);

    if (newImages.length > 0) {
      addLog('success', `Successfully uploaded ${newImages.length} images`);
    } else {
      addLog('error', 'No valid image files found');
    }
  }, [addLog]);

  // Handle ZIP file
  const handleZipUpload = useCallback(async (file: File, replace: boolean = true) => {
    addLog('info', `Extracting ZIP file: ${file.name}`);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/extract-zip', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Extraction failed');
      }

      setUploadedImages(replace ? result.images : (prev: { filename: string; url: string }[]) => [...prev, ...result.images]);
      addLog('success', `Successfully extracted and uploaded ${result.images.length} images`);
    } catch (error) {
      const err = error as Error;
      addLog('error', `Extraction failed: ${err.message}`);
    }
  }, [addLog]);

  // 轮询任务状态（只查询状态，不触发执行）
  const pollTaskStatus = useCallback(async (historyId: number) => {
    const apiKey = getApiKey();
    if (!apiKey) return;

    try {
      // 获取最新状态
      const statusResponse = await fetch(`/api/tasks/status?historyId=${historyId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      const statusResult = await statusResponse.json();

      if (statusResult.success) {
        // 更新任务列表
        setTasks(statusResult.tasks.map((t: {
          id: number;
          taskIndex: number;
          filename: string;
          prompt: string;
          status: string;
          generatedUrl: string;
          errorMessage: string;
        }) => ({
          id: `task-${t.id}`,
          index: t.taskIndex,
          filename: t.filename,
          prompt: t.prompt,
          status: t.status,
          generatedUrl: t.generatedUrl,
          error: t.errorMessage,
        })));

        // 触发历史刷新
        setHistoryRefreshTrigger((prev) => prev + 1);

        // 检查是否完成
        if (statusResult.completed) {
          setIsRunning(false);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }

          const stats = statusResult.stats;
          if (stats.successCount > 0) {
            addLog('success', `Generation completed: ${stats.successCount} succeeded, ${stats.errorCount} failed`);
          } else {
            addLog('error', 'All generations failed');
          }
        }
      }

    } catch (error) {
      const err = error as Error;
      addLog('error', `Status check failed: ${err.message}`);
    }
  }, [addLog]);

  // 恢复正在运行的任务（页面刷新后调用）
  const resumeRunningTask = useCallback(async () => {
    try {
      const runningHistories = await getRunningHistories();

      if (runningHistories.length > 0) {
        // 加载第一个运行中的任务
        const firstRunning = runningHistories[0];
        setCurrentHistoryId(firstRunning.id);
        setIsRunning(true);
        setMode(firstRunning.mode as GenerationMode);

        // 从 tasks 中恢复任务列表
        if (firstRunning.tasks && firstRunning.tasks.length > 0) {
          setTasks(firstRunning.tasks.map((t) => ({
            id: `task-${t.index}`,
            index: t.index,
            filename: t.filename,
            originalUrl: t.originalUrl || undefined,
            prompt: t.prompt,
            status: t.status,
            generatedUrl: t.generatedUrl || undefined,
            error: t.error || undefined,
          })));
        }

        addLog('info', `Resumed running task: #${firstRunning.id} (${firstRunning.title})`);

        // 开始轮询
        pollIntervalRef.current = setInterval(() => {
          if (!abortRef.current) {
            pollTaskStatus(firstRunning.id);
          }
        }, POLL_INTERVAL);

        // 立即执行一次
        pollTaskStatus(firstRunning.id);
      }
    } catch (error) {
      console.error('Failed to resume running tasks:', error);
    }
  }, [addLog, pollTaskStatus]);

  // 页面加载时检查是否有运行中的任务
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      resumeRunningTask();
    }
  }, [resumeRunningTask]);

  // Start generation (后端执行版本) - 支持连续启动
  const startGeneration = useCallback(async (excelPrompts?: string[]) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      addLog('error', 'API Key not set');
      return;
    }

    const hasExcelPrompts = excelPrompts && excelPrompts.length > 0;

    if (!hasExcelPrompts && !prompt.trim()) {
      addLog('error', 'Please enter a prompt');
      return;
    }

    if (mode === 'image-to-edit' && uploadedImages.length === 0) {
      addLog('error', 'Please upload images first');
      return;
    }

    // 如果有正在运行的任务，先停止轮询
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    setIsRunning(true);
    abortRef.current = false;

    // 构建任务列表
    let taskList: { filename?: string; originalUrl?: string; prompt: string }[];

    if (mode === 'text-to-image') {
      if (hasExcelPrompts) {
        taskList = excelPrompts.map((p, i) => ({
          filename: `Generated ${i + 1}`,
          prompt: p,
        }));
        addLog('info', `Starting batch generation with ${excelPrompts.length} prompts...`);
      } else {
        taskList = [{
          filename: `Generated 1`,
          prompt,
        }];
        addLog('info', `Starting generation...`);
      }
    } else {
      taskList = uploadedImages.map((img) => ({
        filename: img.filename,
        originalUrl: img.url,
        prompt,
      }));
      addLog('info', `Starting image editing with ${taskList.length} images...`);
    }

    // 设置初始任务状态（前端显示用）
    setTasks(taskList.map((t, i) => ({
      id: `task-${Date.now()}-${i}`,
      index: i,
      filename: t.filename,
      originalUrl: t.originalUrl,
      prompt: t.prompt,
      status: 'pending' as const,
    })));

    // 构建标题
    const firstPrompt = hasExcelPrompts
      ? (excelPrompts[0] || 'Image Generation')
      : (mode === 'text-to-image' ? prompt : 'Image Edit');
    const historyTitle = taskList.length > 1
      ? `${firstPrompt.substring(0, 30)}... (${taskList.length} images)`
      : firstPrompt.substring(0, 50);

    try {
      // 调用后端启动任务
      const response = await fetch('/api/tasks/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          title: historyTitle,
          mode,
          tasks: taskList,
          aspectRatio,
          imageSize,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to start task');
      }

      const historyId = result.historyId;
      setCurrentHistoryId(historyId);
      setHistoryRefreshTrigger((prev) => prev + 1);

      addLog('info', `Task created: #${historyId}, starting background processing...`);

      // 开始轮询任务状态
      pollIntervalRef.current = setInterval(() => {
        if (!abortRef.current) {
          pollTaskStatus(historyId);
        }
      }, POLL_INTERVAL);

      // 立即执行一次
      pollTaskStatus(historyId);

      return historyId;

    } catch (error) {
      const err = error as Error;
      addLog('error', `Failed to start: ${err.message}`);
      setIsRunning(false);
      return null;
    }
  }, [prompt, aspectRatio, imageSize, mode, uploadedImages, addLog, pollTaskStatus]);

  // Retry single task (仍然在前端执行，用于手动重试)
  const retryTask = useCallback(async (taskId: string, newPrompt?: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // 暂时保留原有前端重试逻辑
    addLog('info', `Retrying: ${task.filename || `Task ${task.index + 1}`}`);
    addLog('warning', 'Retry not implemented for backend tasks yet');
  }, [tasks, addLog]);

  // Download single image
  const downloadImage = useCallback(async (taskId: string, imageUrl: string) => {
    const task = tasks.find((t) => t.id === taskId);
    const filename = task?.filename || `image-${taskId}`;

    try {
      const proxyUrl = `/api/download-image?url=${encodeURIComponent(imageUrl)}&filename=${encodeURIComponent(filename)}`;
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addLog('success', `Downloaded: ${filename}`);
    } catch (error) {
      addLog('error', `Download failed: ${filename}`);
    }
  }, [tasks, addLog]);

  // Batch download as ZIP
  const batchDownload = useCallback(async () => {
    const completedTasks = tasks.filter((t) => t.status === 'done' && t.generatedUrl);
    if (completedTasks.length === 0) {
      addLog('warning', 'No completed images to download');
      return;
    }

    addLog('info', `Packing ${completedTasks.length} images...`);

    try {
      const response = await fetch('/api/batch-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: completedTasks.map((t) => ({
            url: t.generatedUrl,
            filename: t.filename || `image-${t.index + 1}`,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create ZIP');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated-images-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addLog('success', `Downloaded ${completedTasks.length} images as ZIP`);
    } catch (error) {
      const err = error as Error;
      addLog('error', `Batch download failed: ${err.message}`);
    }
  }, [tasks, addLog]);

  // Stop generation (后端停止)
  const stopGeneration = useCallback(async () => {
    abortRef.current = true;

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (currentHistoryId) {
      const apiKey = getApiKey();
      if (apiKey) {
        try {
          await fetch('/api/tasks/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey, historyId: currentHistoryId }),
          });
        } catch (error) {
          console.error('Failed to stop task:', error);
        }
      }
    }

    setIsRunning(false);
    addLog('warning', 'Stopped');
    setHistoryRefreshTrigger((prev) => prev + 1);
  }, [currentHistoryId, addLog]);

  // Reset
  const reset = useCallback(() => {
    abortRef.current = true;
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsRunning(false);
    setTasks([]);
    setUploadedImages([]);
    setLogs([]);
    setPreviewContent(null);
    setCurrentHistoryId(null);
  }, []);

  // Clear uploaded images
  const clearUploadedImages = useCallback(() => {
    setUploadedImages([]);
  }, []);

  // Preview image
  const openPreview = useCallback((imageUrl: string, imagePrompt: string) => {
    setPreviewContent({
      type: 'image',
      url: imageUrl,
      title: 'Preview',
      prompt: imagePrompt,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  return {
    mode,
    switchMode,
    tasks,
    isRunning,
    previewContent,
    closePreview,
    openPreview,
    prompt,
    setPrompt,
    aspectRatio,
    setAspectRatio,
    imageSize,
    setImageSize,
    uploadedImages,
    handleFilesUpload,
    handleZipUpload,
    clearUploadedImages,
    startGeneration,
    stopGeneration,
    reset,
    retryTask,
    downloadImage,
    batchDownload,
    historyRefreshTrigger,
    currentHistoryId,
  };
}
