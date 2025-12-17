/**
 * Unified AI API Configuration
 * All AI-related API addresses and configurations are managed here
 */

// ============================================
// API Key Management
// ============================================
const API_KEY_STORAGE_KEY = 'video-workflow-api-key';
const DEFAULT_VIDEO_MODEL_STORAGE_KEY = 'video-workflow-default-video-model';
const DEFAULT_VIDEO_DURATION_STORAGE_KEY = 'video-workflow-default-video-duration';
const DEFAULT_IMAGE_MODEL_STORAGE_KEY = 'video-workflow-default-image-model';
const DEFAULT_IMAGE_SIZE_STORAGE_KEY = 'video-workflow-default-image-size';
const DEFAULT_ASPECT_RATIO_STORAGE_KEY = 'video-workflow-default-aspect-ratio';

export function getApiKey(): string {
  if (typeof window !== 'undefined') {
    const key = localStorage.getItem(API_KEY_STORAGE_KEY) || '';
    // Remove any non-ASCII characters and trim whitespace
    return key.replace(/[^\x00-\x7F]/g, '').trim();
  }
  return '';
}

export function setApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    // Clean the key before storing: remove non-ASCII characters and trim
    const cleanKey = key.replace(/[^\x00-\x7F]/g, '').trim();
    localStorage.setItem(API_KEY_STORAGE_KEY, cleanKey);
  }
}

// ============================================
// Default Model Settings Management
// ============================================
export function getDefaultVideoModel(): VideoModelId {
  if (typeof window !== 'undefined') {
    const model = localStorage.getItem(DEFAULT_VIDEO_MODEL_STORAGE_KEY);
    if (model && ['seedance', 'hailuo', 'wan', 'sora-2-pro'].includes(model)) {
      return model as VideoModelId;
    }
  }
  return 'sora-2-pro'; // Default fallback
}

export function setDefaultVideoModel(model: VideoModelId): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(DEFAULT_VIDEO_MODEL_STORAGE_KEY, model);
  }
}

export function getDefaultVideoDuration(): number {
  if (typeof window !== 'undefined') {
    const duration = localStorage.getItem(DEFAULT_VIDEO_DURATION_STORAGE_KEY);
    if (duration) {
      const parsed = parseInt(duration, 10);
      if ([10, 15].includes(parsed)) {
        return parsed;
      }
    }
  }
  return 10; // Default fallback
}

export function setDefaultVideoDuration(duration: number): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(DEFAULT_VIDEO_DURATION_STORAGE_KEY, duration.toString());
  }
}

export function getDefaultImageModel(): ImageTextToImageModelId {
  if (typeof window !== 'undefined') {
    const model = localStorage.getItem(DEFAULT_IMAGE_MODEL_STORAGE_KEY);
    console.log('[Config] getDefaultImageModel - localStorage value:', model, 'key:', DEFAULT_IMAGE_MODEL_STORAGE_KEY);
    if (model && ['gemini', 'seedream', 'wan-t2i'].includes(model)) {
      return model as ImageTextToImageModelId;
    }
  }
  return 'gemini'; // Default fallback
}

export function setDefaultImageModel(model: ImageTextToImageModelId): void {
  if (typeof window !== 'undefined') {
    console.log('[Config] setDefaultImageModel - saving:', model, 'to key:', DEFAULT_IMAGE_MODEL_STORAGE_KEY);
    localStorage.setItem(DEFAULT_IMAGE_MODEL_STORAGE_KEY, model);
  }
}

export function getDefaultImageSize(): string {
  if (typeof window !== 'undefined') {
    const storedSize = localStorage.getItem(DEFAULT_IMAGE_SIZE_STORAGE_KEY);
    // Validate stored size - if it contains ':' it's likely an aspect ratio, not a size
    // Valid sizes are like '1K', '2K', '4K', '1024*1024', etc.
    if (storedSize && !storedSize.includes(':')) {
      return storedSize;
    }
    // Clear invalid value and return default
    localStorage.removeItem(DEFAULT_IMAGE_SIZE_STORAGE_KEY);
  }
  return '1K';
}

export function setDefaultImageSize(size: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(DEFAULT_IMAGE_SIZE_STORAGE_KEY, size);
  }
}

export function getDefaultAspectRatio(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(DEFAULT_ASPECT_RATIO_STORAGE_KEY) || '9:16';
  }
  return '9:16';
}

export function setDefaultAspectRatio(ratio: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(DEFAULT_ASPECT_RATIO_STORAGE_KEY, ratio);
  }
}

// ============================================
// API Base Configuration
// ============================================
export const API_BASE_URL = 'https://gptproto.com';

// ============================================
// Gemini Text Model API
// ============================================
export const GEMINI_API = {
  // Gemini Pro Multimodal Model (Video/Image Understanding)
  PRO: {
    url: `${API_BASE_URL}/v1beta/models/gemini-3-pro-preview:generateContent`,
    description: 'Multimodal understanding model, supports video and image analysis',
  },
} as const;

// ============================================
// Gemini Image Generation API
// ============================================
export const GEMINI_IMAGE_API = {
  // Text to Image
  TEXT_TO_IMAGE: {
    url: `${API_BASE_URL}/api/v3/google/gemini-3-pro-image-preview/text-to-image`,
    description: 'Generate images from text',
    defaultParams: {
      size: '1K',
      enable_base64_output: false,
      enable_sync_mode: false,
      output_format: 'png',
    },
  },
  // Image to Edit (Image Generation)
  IMAGE_TO_EDIT: {
    url: `${API_BASE_URL}/api/v3/google/gemini-3-pro-image-preview/image-to-edit`,
    description: 'Image editing/Image generation',
    defaultParams: {
      n: 1,
      enable_base64_output: false,
      enable_sync_mode: false,
      output_format: 'png',
      size: '1K',
    },
  },
} as const;

// ============================================
// Video Generation Model API
// ============================================
export type VideoModelId = 'seedance' | 'hailuo' | 'wan' | 'sora-2-pro';

export interface VideoDurationOption {
  value: number;
  label: string;
}

export interface VideoModelConfig {
  id: VideoModelId;
  name: string;
  url: string;
  description: string;
  defaultParams: Record<string, unknown>;
  lastFrameKey?: string; // Last frame parameter name, varies by model
  durationOptions?: VideoDurationOption[];  // Duration options for models that support it
  defaultDuration?: number;  // Default duration
}

export const VIDEO_MODELS: Record<VideoModelId, VideoModelConfig> = {
  seedance: {
    id: 'seedance',
    name: 'Seedance 1.0 Pro',
    url: `${API_BASE_URL}/api/v3/doubao/seedance-1-0-pro-250528/image-to-video`,
    description: 'Bytedance Seedance Video Generation Model',
    defaultParams: {
      resolution: '720p',
      duration: 5,
      aspect_ratio: '9:16',
      seed: -1,
    },  
    lastFrameKey: 'last_image',
  },
  hailuo: {
    id: 'hailuo',
    name: 'Hailuo 02 Standard',
    url: `${API_BASE_URL}/api/v3/minimax/hailuo-02-standard/image-to-video`,
    description: 'MiniMax Hailuo Video Generation Model',
    defaultParams: {
      duration: '5',
    },
    lastFrameKey: 'end_image',
  },
  wan: {
    id: 'wan',
    name: 'Wan 2.2 Plus',
    url: `${API_BASE_URL}/api/v3/alibaba/wan-2.2-plus/image-to-video`,
    description: 'Alibaba Wan Video Generation Model',
    defaultParams: {
      resolution: '480p',
      duration: 5,
      seed: -1,
    },
    // Wan model does not support last frame
  },
  'sora-2-pro': {
    id: 'sora-2-pro',
    name: 'Sora 2 Pro',
    url: `${API_BASE_URL}/api/v3/openai/reverse/sora-2-pro/image-to-video`,
    description: 'OpenAI Sora 2 Pro Video Generation Model',
    defaultParams: {
      model: 'sora-2-pro',
      orientation: 'portrait',
      size: 'large',
      duration: 10,
    },
    durationOptions: [
      { value: 10, label: '10s' },
      { value: 15, label: '15s' },
    ],
    defaultDuration: 10,
    // Sora Pro does not support last frame
  },
} as const;

export const DEFAULT_VIDEO_MODEL: VideoModelId = 'sora-2-pro';

// ============================================
// Image Generation Model API (Text to Image)
// ============================================
export type ImageTextToImageModelId = 'gemini' | 'seedream' | 'wan-t2i';

export interface ImageSizeOption {
  value: string;
  label: string;
}

export interface AspectRatioOption {
  value: string;
  label: string;
}

export interface ImageTextToImageModelConfig {
  id: ImageTextToImageModelId;
  name: string;
  url: string;
  description: string;
  defaultParams: Record<string, unknown>;
  sizeOptions: ImageSizeOption[];
  defaultSize: string;
  aspectRatioOptions?: AspectRatioOption[];  // Only for Gemini
  defaultAspectRatio?: string;  // Only for Gemini
}

export const IMAGE_TEXT_TO_IMAGE_MODELS: Record<ImageTextToImageModelId, ImageTextToImageModelConfig> = {
  gemini: {
    id: 'gemini',
    name: 'Gemini Pro Image',
    url: `${API_BASE_URL}/api/v3/google/gemini-3-pro-image-preview/text-to-image`,
    description: 'Google Gemini Pro Image Generation',
    defaultParams: {
      enable_base64_output: false,
      enable_sync_mode: false,
      output_format: 'png',
    },
    sizeOptions: [
      { value: '1K', label: '1K (1024px)' },
      { value: '2K', label: '2K (2048px)' },
      { value: '4K', label: '4K (4096px)' },
    ],
    defaultSize: '1K',
    aspectRatioOptions: [
      { value: '1:1', label: '1:1' },
      { value: '16:9', label: '16:9' },
      { value: '9:16', label: '9:16' },
      { value: '4:3', label: '4:3' },
      { value: '3:4', label: '3:4' },
    ],
    defaultAspectRatio: '9:16',
  },
  seedream: {
    id: 'seedream',
    name: 'Seedream 4.5',
    url: `${API_BASE_URL}/api/v3/doubao/seedream-4-5-251128/text-to-image`,
    description: 'Bytedance Seedream Text to Image',
    defaultParams: {},
    sizeOptions: [
      { value: '1024*1024', label: '1024×1024' },
      { value: '1024*1792', label: '1024×1792' },
      { value: '1792*1024', label: '1792×1024' },
      { value: '1280*1280', label: '1280×1280' },
      { value: '1536*1536', label: '1536×1536' },
      { value: '2048*2048', label: '2048×2048' },
    ],
    defaultSize: '1024*1024',
  },
  'wan-t2i': {
    id: 'wan-t2i',
    name: 'Wan 2.5',
    url: `${API_BASE_URL}/api/v3/alibaba/wan-2.5/text-to-image`,
    description: 'Alibaba Wan Text to Image',
    defaultParams: {
      seed: -1,
    },
    sizeOptions: [
      { value: '512*512', label: '512×512' },
      { value: '768*768', label: '768×768' },
      { value: '1024*1024', label: '1024×1024' },
    ],
    defaultSize: '1024*1024',
  },
} as const;

export const DEFAULT_IMAGE_TEXT_TO_IMAGE_MODEL: ImageTextToImageModelId = 'gemini';

// ============================================
// Image Edit Model API (Image to Edit)
// ============================================
export type ImageEditModelId = 'gemini-edit' | 'seedream-edit' | 'wan-edit';

export interface ImageEditModelConfig {
  id: ImageEditModelId;
  name: string;
  url: string;
  description: string;
  defaultParams: Record<string, unknown>;
  sizeOptions: ImageSizeOption[];
  defaultSize: string;
  aspectRatioOptions?: AspectRatioOption[];  // Only for Gemini
  defaultAspectRatio?: string;  // Only for Gemini
}

export const IMAGE_EDIT_MODELS: Record<ImageEditModelId, ImageEditModelConfig> = {
  'gemini-edit': {
    id: 'gemini-edit',
    name: 'Gemini Pro Edit',
    url: `${API_BASE_URL}/api/v3/google/gemini-3-pro-image-preview/image-edit`,
    description: 'Google Gemini Pro Image Edit',
    defaultParams: {
      n: 1,
      enable_base64_output: false,
      enable_sync_mode: false,
      output_format: 'png',
    },
    sizeOptions: [
      { value: '1K', label: '1K (1024px)' },
      { value: '2K', label: '2K (2048px)' },
      { value: '4K', label: '4K (4096px)' },
    ],
    defaultSize: '1K',
    aspectRatioOptions: [
      { value: '1:1', label: '1:1' },
      { value: '16:9', label: '16:9' },
      { value: '9:16', label: '9:16' },
      { value: '4:3', label: '4:3' },
      { value: '3:4', label: '3:4' },
    ],
    defaultAspectRatio: '9:16',
  },
  'seedream-edit': {
    id: 'seedream-edit',
    name: 'Seedream 4.5 Edit',
    url: `${API_BASE_URL}/api/v3/doubao/seedream-4-5-251128/image-edit`,
    description: 'Bytedance Seedream Image Edit',
    defaultParams: {},
    sizeOptions: [
      { value: '1024*1024', label: '1024×1024' },
      { value: '1024*1792', label: '1024×1792' },
      { value: '1792*1024', label: '1792×1024' },
      { value: '1280*1280', label: '1280×1280' },
      { value: '1536*1536', label: '1536×1536' },
      { value: '2048*2048', label: '2048×2048' },
    ],
    defaultSize: '1024*1024',
  },
  'wan-edit': {
    id: 'wan-edit',
    name: 'Wan 2.5 Edit',
    url: `${API_BASE_URL}/api/v3/alibaba/wan-2.5/image-edit`,
    description: 'Alibaba Wan Image Edit',
    defaultParams: {
      seed: -1,
    },
    sizeOptions: [
      { value: '768*768', label: '768×768' },
      { value: '1024*1024', label: '1024×1024' },
      { value: '1280*1280', label: '1280×1280' },
    ],
    defaultSize: '1280*1280',
  },
} as const;

export const DEFAULT_IMAGE_EDIT_MODEL: ImageEditModelId = 'gemini-edit';

// ============================================
// Task Result Query API
// ============================================
export const TASK_API = {
  // Unified task result query interface
  RESULT: {
    url: `${API_BASE_URL}/api/v3/predictions`,
    description: 'Query async task results (image/video generation)',
    getResultUrl: (taskId: string) => `${API_BASE_URL}/api/v3/predictions/${taskId}/result`,
  },
} as const;

// ============================================
// Polling and Concurrency Configuration
// ============================================
export const POLLING_CONFIG = {
  INTERVAL: 5000,           // Polling interval (ms)
  IMAGE_MAX_ATTEMPTS: 60,   // Max polling attempts for image generation
  VIDEO_MAX_ATTEMPTS: 120,  // Max polling attempts for video generation
} as const;

export const CONCURRENCY_CONFIG = {
  MAX_IMAGES: 3,  // Max concurrent image generation
  MAX_VIDEOS: 2,  // Max concurrent video generation
} as const;

// ============================================
// Retry Configuration
// ============================================
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  DELAY: 2000,  // ms
} as const;

// ============================================
// Image Aspect Ratio Options
// ============================================
export const ASPECT_RATIOS = [
  { value: '1:1', label: '1:1 Square' },
  { value: '16:9', label: '16:9 Landscape' },
  { value: '9:16', label: '9:16 Portrait' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
] as const;

// ============================================
// Output Format Options
// ============================================
export const OUTPUT_FORMATS = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
  { value: 'webp', label: 'WebP' },
] as const;

// ============================================
// Legacy Export Compatibility (Easy Migration)
// ============================================
export const GEMINI_PRO_URL = GEMINI_API.PRO.url;
export const GEMINI_IMAGE_TEXT_TO_IMAGE_URL = GEMINI_IMAGE_API.TEXT_TO_IMAGE.url;
export const GEMINI_IMAGE_TO_EDIT_URL = GEMINI_IMAGE_API.IMAGE_TO_EDIT.url;
export const VIDEO_RESULT_URL = TASK_API.RESULT.url;
export const POLL_INTERVAL = POLLING_CONFIG.INTERVAL;
export const MAX_CONCURRENT_IMAGES = CONCURRENCY_CONFIG.MAX_IMAGES;
export const MAX_CONCURRENT_VIDEOS = CONCURRENCY_CONFIG.MAX_VIDEOS;
export const MAX_RETRIES = RETRY_CONFIG.MAX_RETRIES;
export const RETRY_DELAY = RETRY_CONFIG.DELAY;
