import {
  DEFAULT_VIDEO_MODEL,
  GEMINI_API,
  GEMINI_IMAGE_API,
  getApiKey,
  getDefaultVideoModel,
  getDefaultVideoDuration,
  getDefaultImageModel,
  getDefaultImageSize,
  getDefaultAspectRatio,
  IMAGE_EDIT_MODELS,
  IMAGE_TEXT_TO_IMAGE_MODELS,
  POLLING_CONFIG,
  RETRY_CONFIG,
  TASK_API,
  VIDEO_MODELS,
  type ImageEditModelId,
  type ImageTextToImageModelId,
  type VideoModelId,
} from '@/config/api';
import type { CharacterItem, SceneItem, ScriptResult, VideoItem } from '@/types/workflow';

// ============================================
// Utility Functions
// ============================================

// Get MIME type for file extension
export const getMimeType = (url: string): string => {
  const ext = url.toLowerCase().split('.').pop()?.split('?')[0];
  const mimeTypes: Record<string, string> = {
    mp4: 'video/mp4',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    webm: 'video/webm',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
  };
  return mimeTypes[ext || ''] || 'video/mp4';
};

// Clean markdown code block markers
export const cleanMarkdownCodeBlock = (text: string): string => {
  return text
    .replace(/^```(?:json)?\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '')
    .trim();
};

// Format time
export const formatTime = () =>
  new Date().toLocaleTimeString('en-US', { hour12: false });

// ============================================
// Retry Utility
// ============================================

// Generic retry wrapper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    delay?: number;
    onRetry?: (attempt: number, error: Error) => void;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? RETRY_CONFIG.MAX_RETRIES;
  const baseDelay = options?.delay ?? RETRY_CONFIG.DELAY;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff: delay * 2^(attempt-1)
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`[Retry] Attempt ${attempt}/${maxRetries} failed: ${lastError.message}. Retrying in ${delay}ms...`);

      if (options?.onRetry) {
        options.onRetry(attempt, lastError);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// Parse script result - new JSON format
export const parseScriptResult = (text: string): ScriptResult => {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON format output found');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const characters: CharacterItem[] = (parsed.characters || []).map(
      (c: { name: string; description?: string; imagePrompt?: string; RoleimagePrompt?: string }, idx: number) => ({
        id: `char-${idx}`,
        name: c.name || `Character ${idx + 1}`,
        description: c.description || '',
        imagePrompt: c.imagePrompt || c.RoleimagePrompt || '',
        status: 'pending' as const,
      })
    );

    const scenes: SceneItem[] = (parsed.scenes || []).map(
      (s: { id: number; imagePrompt: string; videoPrompt: string }, idx: number) => ({
        id: s.id || idx + 1,
        imagePrompt: s.imagePrompt || '',
        videoPrompt: s.videoPrompt || '',
        imageStatus: 'pending' as const,
        videoStatus: 'pending' as const,
      })
    );

    return { characters, scenes };
  } catch {
    // Compatible with legacy format
    const images: { id: string; prompt: string }[] = [];
    const videos: { id: string; prompt: string }[] = [];

    const imageRegex = /[Ii]mage\s*(\d+)\s*[|｜:：]\s*([^|\n]+)/g;
    let match;
    while ((match = imageRegex.exec(text)) !== null) {
      images.push({ id: `image${match[1]}`, prompt: match[2].trim() });
    }

    const videoRegex = /[Vv]ideo\s*(\d+)\s*[|｜:：]\s*([^|\n]+)/g;
    while ((match = videoRegex.exec(text)) !== null) {
      videos.push({ id: `video${match[1]}`, prompt: match[2].trim() });
    }

    const scenes: SceneItem[] = images.map((img, idx) => ({
      id: idx + 1,
      imagePrompt: img.prompt,
      videoPrompt: videos[idx]?.prompt || '',
      imageStatus: 'pending' as const,
      videoStatus: 'pending' as const,
    }));

    return { characters: [], scenes };
  }
};

// ============================================
// Gemini Text/Multimodal API
// ============================================

// Fixed output format requirement (appended to user prompt)
const SCRIPT_OUTPUT_FORMAT = `

---

# Output Format Requirements (Must Follow Strictly)

Please output the result strictly in the following JSON format:

\`\`\`json
{
  "characters": [
    {
      "name": "Character Name",
      "RoleimagePrompt": "Reference Image Prompt"
    }
  ],
  "scenes": [
    {
      "id": 1,
      "imagePrompt": "Image Prompt",
      "videoPrompt": "Video Prompt"
    }
  ]
}
\`\`\`

**Important**: Output must be valid JSON format.
`;

// Generate script (video analysis)
export const generateScriptAPI = async (
  videoUrl: string,
  scriptPrompt: string
): Promise<string> => {
  const mimeType = getMimeType(videoUrl);
  // Append fixed output format requirement to user prompt
  const fullPrompt = scriptPrompt + SCRIPT_OUTPUT_FORMAT;
  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: fullPrompt },
          { file_data: { mime_type: mimeType, file_uri: videoUrl } },
        ],
      },
    ],
  };

  const response = await fetch(GEMINI_API.PRO.url, {
    method: 'POST',
    headers: { Authorization: getApiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Request failed: ${response.status}`);
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

// ============================================
// Gemini Image Generation API
// ============================================

export interface TextToImageOptions {
  prompt: string;
  aspectRatio?: string;
  outputFormat?: string;
  size?: string;
}

// Text to Image
export const textToImageAPI = async (
  prompt: string,
  aspectRatio: string = '16:9',
  options?: Partial<TextToImageOptions>
): Promise<{ imageUrl: string; taskId?: string }> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API Key is not configured');
  }

  const requestBody = {
    prompt,
    aspect_ratio: aspectRatio,
    ...GEMINI_IMAGE_API.TEXT_TO_IMAGE.defaultParams,
    ...options,
  };

  console.log('[API] textToImageAPI request:', { url: GEMINI_IMAGE_API.TEXT_TO_IMAGE.url, body: requestBody });

  const response = await fetch(GEMINI_IMAGE_API.TEXT_TO_IMAGE.url, {
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

  // Async mode returns taskId
  if (data.id || data.data?.id) {
    return { imageUrl: '', taskId: data.id || data.data?.id };
  }

  // Sync mode returns image URL directly
  const imageUrl = data.data?.image_url || data.image_url || data.output?.image_url || '';
  if (!imageUrl) throw new Error('Failed to get image');

  return { imageUrl };
};

export interface ImageToEditOptions {
  imageUrls: string[];
  prompt: string;
  aspectRatio?: string;
  n?: number;
  size?: string;
}

// Image to Edit (Image Generation)
export const imageToEditAPI = async (
  imageUrls: string[],
  prompt: string,
  aspectRatio: string = '16:9',
  options?: { size?: string }
): Promise<{ imageUrl: string; taskId?: string }> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API Key is not configured');
  }

  const requestBody = {
    images: imageUrls,
    prompt,
    aspect_ratio: aspectRatio,
    ...GEMINI_IMAGE_API.IMAGE_TO_EDIT.defaultParams,
    ...(options?.size && { size: options.size }),
  };

  console.log('[API] imageToEditAPI request:', { url: GEMINI_IMAGE_API.IMAGE_TO_EDIT.url, body: requestBody });

  const response = await fetch(GEMINI_IMAGE_API.IMAGE_TO_EDIT.url, {
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

  // Async mode returns taskId
  if (data.id || data.data?.id) {
    return { imageUrl: '', taskId: data.id || data.data?.id };
  }

  // Sync mode returns image URL directly
  const imageUrl = data.data?.image_url || data.image_url || data.output?.image_url || '';
  if (!imageUrl) throw new Error('Failed to get image');

  return { imageUrl };
};

// ============================================
// Multi-Model Image Generation API
// ============================================

// Text to Image with model selection
export const textToImageWithModelAPI = async (
  prompt: string,
  modelId?: ImageTextToImageModelId,
  size?: string,
  aspectRatio?: string
): Promise<{ imageUrl: string; taskId?: string }> => {
  return withRetry(async () => {
    // Use provided modelId, or user's default setting, or system default
    const defaultModel = getDefaultImageModel();
    console.log('[API] textToImageWithModelAPI - passed modelId:', modelId, 'defaultModel from config:', defaultModel);
    const effectiveModelId = modelId || defaultModel || 'gemini';
    const model = IMAGE_TEXT_TO_IMAGE_MODELS[effectiveModelId];

    const hasAspectRatio = model.aspectRatioOptions && model.aspectRatioOptions.length > 0;

    const requestBody: Record<string, unknown> = {
      prompt,
      ...model.defaultParams,
    };

    // For Gemini models, use both size and aspect_ratio; for others, use size only
    if (hasAspectRatio) {
      // Gemini models use both size and aspect_ratio
      requestBody.size = size || getDefaultImageSize() || model.defaultSize;
      requestBody.aspect_ratio = aspectRatio || getDefaultAspectRatio() || model.defaultAspectRatio || '9:16';
    } else {
      // Non-Gemini models use size only
      requestBody.size = size || getDefaultImageSize() || model.defaultSize;
      // Ensure aspect_ratio is not included for non-Gemini
      delete requestBody.aspect_ratio;
    }

    console.log('[API] textToImageWithModelAPI request:', { url: model.url, modelId: effectiveModelId, body: requestBody });

    const response = await fetch(model.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.log('[API] textToImageWithModelAPI response:', data);
    console.log('[API] textToImageWithModelAPI response.data:', data.data);
    console.log('[API] textToImageWithModelAPI checking taskId:', { 'data.id': data.id, 'data.data?.id': data.data?.id });
    if (!response.ok) {
      throw new Error(data.error?.message || `Request failed: ${response.status}`);
    }

    // Async mode returns taskId
    if (data.id || data.data?.id) {
      const taskId = data.id || data.data?.id;
      console.log('[API] textToImageWithModelAPI returning taskId:', taskId);
      return { imageUrl: '', taskId };
    }

    // Sync mode returns image URL directly
    const imageUrl = data.data?.image_url || data.image_url || data.output?.image_url || '';
    console.log('[API] textToImageWithModelAPI returning imageUrl:', imageUrl);
    if (!imageUrl) throw new Error('Failed to get image');

    return { imageUrl };
  });
};

// Image to Edit with model selection
export const imageToEditWithModelAPI = async (
  imageUrls: string[],
  prompt: string,
  modelId?: ImageEditModelId,
  size?: string,
  aspectRatio?: string
): Promise<{ imageUrl: string; taskId?: string }> => {
  return withRetry(async () => {
    // Use provided modelId, or derive from default image model, or system default
    // Map text-to-image model to corresponding edit model
    const defaultImageModel = getDefaultImageModel();
    console.log('[API] imageToEditWithModelAPI - passed modelId:', modelId, 'defaultImageModel from config:', defaultImageModel);
    const defaultEditModelMap: Record<string, ImageEditModelId> = {
      'gemini': 'gemini-edit',
      'seedream': 'seedream-edit',
      'wan-t2i': 'wan-edit',
    };
    const effectiveModelId = modelId || defaultEditModelMap[defaultImageModel] || 'gemini-edit';
    console.log('[API] imageToEditWithModelAPI - effectiveModelId:', effectiveModelId);
    const model = IMAGE_EDIT_MODELS[effectiveModelId];

    const hasAspectRatio = model.aspectRatioOptions && model.aspectRatioOptions.length > 0;

    const requestBody: Record<string, unknown> = {
      prompt,
      images: imageUrls,
      ...model.defaultParams,
    };

    // For Gemini models, use both size and aspect_ratio; for others, use size only
    if (hasAspectRatio) {
      // Gemini models use both size and aspect_ratio
      requestBody.size = size || getDefaultImageSize() || model.defaultSize;
      requestBody.aspect_ratio = aspectRatio || getDefaultAspectRatio() || model.defaultAspectRatio || '9:16';
    } else {
      // Non-Gemini models use size only
      requestBody.size = size || getDefaultImageSize() || model.defaultSize;
      // Ensure aspect_ratio is not included for non-Gemini
      delete requestBody.aspect_ratio;
    }

    console.log('[API] imageToEditWithModelAPI request:', { url: model.url, modelId: effectiveModelId, body: requestBody });

    const response = await fetch(model.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.log('[API] imageToEditWithModelAPI response:', data);
    if (!response.ok) {
      throw new Error(data.error?.message || `Request failed: ${response.status}`);
    }

    // Async mode returns taskId
    if (data.id || data.data?.id) {
      return { imageUrl: '', taskId: data.id || data.data?.id };
    }

    // Sync mode returns image URL directly
    const imageUrl = data.data?.image_url || data.image_url || data.output?.image_url || '';
    if (!imageUrl) throw new Error('Failed to get image');

    return { imageUrl };
  });
};

// ============================================
// Task Polling API
// ============================================

// Poll image generation results
export const pollImageResultAPI = async (
  taskId: string,
  shouldContinue: () => boolean
): Promise<{ imageUrl?: string; error?: string }> => {
  let attempts = 0;

  console.log(`[Poll] Starting poll for taskId: ${taskId}, maxAttempts: ${POLLING_CONFIG.IMAGE_MAX_ATTEMPTS}`);

  // Always check once first before entering the loop
  // This handles the case where the task might already be completed
  // (e.g., when resuming after page refresh)
  try {
    const initialResponse = await fetch(TASK_API.RESULT.getResultUrl(taskId), {
      method: 'GET',
      headers: { Authorization: `Bearer ${getApiKey()}` },
    });

    const initialData = await initialResponse.json();
    const initialResult = initialData.data || initialData;
    const initialStatus = initialResult.status;

    console.log(`[Poll] taskId: ${taskId}, initial check status: ${initialStatus}`);

    if (initialStatus === 'succeeded' || initialStatus === 'completed') {
      const imageUrl = initialResult.output?.image_url || initialResult.image_url || initialResult.outputs?.[0];
      console.log(`[Poll] taskId: ${taskId} already succeeded, imageUrl: ${!!imageUrl}`);
      return { imageUrl };
    } else if (initialStatus === 'failed' || initialStatus === 'error') {
      console.log(`[Poll] taskId: ${taskId} already failed:`, initialResult.error);
      return { error: initialResult.error || 'Image generation failed' };
    }
  } catch (err) {
    console.error(`[Poll] taskId: ${taskId} initial check error:`, err);
    // Continue to polling loop even if initial check fails
  }

  // If shouldContinue is already false after initial check, return timeout
  if (!shouldContinue()) {
    console.log(`[Poll] taskId: ${taskId} stopped by user after initial check`);
    return { error: 'Polling timeout (stopped by user)' };
  }

  while (attempts < POLLING_CONFIG.IMAGE_MAX_ATTEMPTS && shouldContinue()) {
    try {
      const response = await fetch(TASK_API.RESULT.getResultUrl(taskId), {
        method: 'GET',
        headers: { Authorization: `Bearer ${getApiKey()}` },
      });

      const data = await response.json();
      const result = data.data || data;
      const status = result.status;

      console.log(`[Poll] taskId: ${taskId}, attempt: ${attempts + 1}, status: ${status}`);

      if (status === 'succeeded' || status === 'completed') {
        const imageUrl = result.output?.image_url || result.image_url || result.outputs?.[0];
        console.log(`[Poll] taskId: ${taskId} succeeded, imageUrl: ${!!imageUrl}`);
        return { imageUrl };
      } else if (status === 'failed' || status === 'error') {
        console.log(`[Poll] taskId: ${taskId} failed:`, result.error);
        return { error: result.error || 'Image generation failed' };
      }

      await new Promise((resolve) => setTimeout(resolve, POLLING_CONFIG.INTERVAL));
      attempts++;
    } catch (err) {
      console.error(`[Poll] taskId: ${taskId} fetch error:`, err);
      await new Promise((resolve) => setTimeout(resolve, POLLING_CONFIG.INTERVAL));
      attempts++;
    }
  }

  const reason = !shouldContinue() ? 'stopped by user' : 'max attempts reached';
  console.log(`[Poll] taskId: ${taskId} ended: ${reason}, attempts: ${attempts}`);
  return { error: `Polling timeout (${reason})` };
};

// Poll video results
export const pollVideoResultAPI = async (
  taskId: string,
  shouldContinue: () => boolean
): Promise<{ videoUrl?: string; error?: string }> => {
  let attempts = 0;

  console.log(`[Poll] Starting video poll for taskId: ${taskId}, maxAttempts: ${POLLING_CONFIG.VIDEO_MAX_ATTEMPTS}`);

  // Always check once first before entering the loop
  // This handles the case where the task might already be completed
  // (e.g., when resuming after page refresh)
  try {
    const initialResponse = await fetch(TASK_API.RESULT.getResultUrl(taskId), {
      method: 'GET',
      headers: { Authorization: `Bearer ${getApiKey()}` },
    });

    const initialData = await initialResponse.json();
    const initialResult = initialData.data || initialData;
    const initialStatus = initialResult.status;

    console.log(`[Poll] taskId: ${taskId}, initial check status: ${initialStatus}`);

    if (initialStatus === 'succeeded' || initialStatus === 'completed') {
      const videoUrl = initialResult.outputs?.[0] || initialResult.output?.video_url || initialResult.video_url;
      console.log(`[Poll] taskId: ${taskId} already succeeded, videoUrl: ${!!videoUrl}`);
      return { videoUrl };
    } else if (initialStatus === 'failed' || initialStatus === 'error' || initialStatus === 'no_resource') {
      const errorMessage = initialStatus === 'no_resource'
        ? 'No resource available (server busy, please try again later)'
        : (initialResult.error || 'Video generation failed');
      console.log(`[Poll] taskId: ${taskId} already failed:`, errorMessage);
      return { error: errorMessage };
    }
  } catch (err) {
    console.error(`[Poll] taskId: ${taskId} initial check error:`, err);
    // Continue to polling loop even if initial check fails
  }

  // If shouldContinue is already false after initial check, return timeout
  if (!shouldContinue()) {
    console.log(`[Poll] taskId: ${taskId} stopped by user after initial check`);
    return { error: 'Polling timeout (stopped by user)' };
  }

  while (attempts < POLLING_CONFIG.VIDEO_MAX_ATTEMPTS && shouldContinue()) {
    try {
      const response = await fetch(TASK_API.RESULT.getResultUrl(taskId), {
        method: 'GET',
        headers: { Authorization: `Bearer ${getApiKey()}` },
      });

      const data = await response.json();
      const result = data.data || data;
      const status = result.status;

      console.log(`[Poll] taskId: ${taskId}, attempt: ${attempts + 1}, status: ${status}`);

      if (status === 'succeeded' || status === 'completed') {
        const videoUrl = result.outputs?.[0] || result.output?.video_url || result.video_url;
        return { videoUrl };
      } else if (status === 'failed' || status === 'error' || status === 'no_resource') {
        const errorMessage = status === 'no_resource'
          ? 'No resource available (server busy, please try again later)'
          : (result.error || 'Video generation failed');
        return { error: errorMessage };
      }

      await new Promise((resolve) => setTimeout(resolve, POLLING_CONFIG.INTERVAL));
      attempts++;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, POLLING_CONFIG.INTERVAL));
      attempts++;
    }
  }

  const reason = !shouldContinue() ? 'stopped by user' : 'max attempts reached';
  console.log(`[Poll] taskId: ${taskId} ended: ${reason}, attempts: ${attempts}`);
  return { error: `Polling timeout (${reason})` };
};

// ============================================
// Video Generation API
// ============================================

// Submit video task - supports multiple models
export const submitVideoTaskAPI = async (
  item: VideoItem,
  modelId?: VideoModelId,
  duration?: number
): Promise<{ taskId: string | null; error?: string }> => {
  // Use provided modelId, or item's model, or user's default setting, or system default
  const effectiveModelId = modelId || item.model || getDefaultVideoModel() || DEFAULT_VIDEO_MODEL;
  const model = VIDEO_MODELS[effectiveModelId];

  const requestBody: Record<string, unknown> = {
    prompt: item.prompt,
    ...model.defaultParams,
  };

  // Override duration if provided, or use global default for models that support it
  if (model.durationOptions) {
    const effectiveDuration = duration !== undefined ? duration : getDefaultVideoDuration();
    requestBody.duration = effectiveDuration;
  }

  // Different models use different parameter names for the first frame
  // sora-2-pro uses 'images' array, others use 'image'
  if (effectiveModelId === 'sora-2-pro') {
    requestBody.images = [item.firstFrame];
  } else {
    requestBody.image = item.firstFrame;
  }

  // Only add last frame when it exists and model supports it
  if (item.lastFrame && model.lastFrameKey) {
    requestBody[model.lastFrameKey] = item.lastFrame;
  }

  console.log('[API] submitVideoTaskAPI request:', {
    url: model.url,
    modelId: effectiveModelId,
    prompt: item.prompt,
    hasFirstFrame: !!item.firstFrame,
    hasLastFrame: !!item.lastFrame,
  });

  try {
    const result = await withRetry(async () => {
      const response = await fetch(model.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getApiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      console.log('[API] submitVideoTaskAPI response:', data);

      // 不同的API可能返回不同的结构，更灵活地处理
      if (!response.ok) {
        throw new Error(data.error?.message || data.message || `Request failed: ${response.status}`);
      }

      // 如果返回了错误码（非200），也视为失败
      if (data.code && data.code !== 200) {
        throw new Error(data.error?.message || data.message || `API error: ${data.code}`);
      }

      // 尝试多种方式获取 taskId
      const taskId = data.data?.id || data.id || data.task_id || data.taskId || null;
      console.log('[API] submitVideoTaskAPI extracted taskId:', taskId);

      if (!taskId) {
        console.error('[API] submitVideoTaskAPI: No taskId found in response:', data);
        throw new Error('No task ID returned from API');
      }

      return { taskId };
    });

    return result;
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[API] submitVideoTaskAPI error after retries:', err.message);
    return { taskId: null, error: err.message };
  }
};

// ============================================
// File Upload API
// ============================================

// Upload file to OSS (via API route)
export const uploadToOSS = async (
  fileOrUrl: File | string,
  filename: string
): Promise<string> => {
  try {
    if (typeof fileOrUrl === 'string') {
      // If it's a regular URL, return directly
      if (fileOrUrl.startsWith('http') && !fileOrUrl.startsWith('data:')) {
        return fileOrUrl;
      }

      // Base64 data or other strings, upload via API
      const response = await fetch('/api/upload-oss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: fileOrUrl, filename }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Upload failed');
      }
      return result.url;
    } else {
      // File object, use FormData upload
      const formData = new FormData();
      formData.append('file', fileOrUrl);
      formData.append('filename', filename);

      const response = await fetch('/api/upload-oss', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Upload failed');
      }
      return result.url;
    }
  } catch (error) {
    console.error('OSS upload error:', error);
    if (typeof fileOrUrl === 'string' && fileOrUrl.startsWith('http')) {
      return fileOrUrl;
    }
    throw error;
  }
};

// Upload video to OSS
export const uploadVideoToOSS = async (file: File): Promise<string> => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', `video-${Date.now()}`);

    const response = await fetch('/api/upload-oss', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Video upload failed');
    }
    return result.url;
  } catch (error) {
    console.error('OSS video upload error:', error);
    throw new Error('Video upload failed');
  }
};

// ============================================
// Video Merge API
// ============================================

// Merge videos
export const mergeVideosAPI = async (
  videoUrls: string[]
): Promise<{ success: boolean; videoUrl?: string; error?: string }> => {
  try {
    const response = await fetch('/api/merge-videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrls }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Merge failed' };
    }

    return { success: true, videoUrl: data.videoUrl };
  } catch (error: unknown) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
};
