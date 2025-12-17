import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '@/config/services';

// Create Supabase client
export const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// Re-export config for convenience
export { SUPABASE_CONFIG } from '@/config/services';

// 任务结构 (用于 image-gen 类型)
export interface TaskItem {
  index: number;
  filename: string;
  originalUrl: string | null;
  prompt: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  generatedUrl: string | null;
  error: string | null;
}

// 角色结构 (用于 workflow 类型)
export interface CharacterData {
  id?: string;
  name: string;
  description?: string;
  imagePrompt: string;
  status?: 'pending' | 'generating' | 'uploading' | 'done' | 'error';
  imageUrl?: string;
  ossUrl?: string;
  error?: string;
}

// 场景结构 (用于 workflow 类型)
export interface SceneData {
  id: number;
  imagePrompt: string;
  videoPrompt?: string;
  imageStatus?: 'pending' | 'generating' | 'done' | 'error';
  imageUrl?: string;
  ossUrl?: string;
  error?: string;
}

// 视频结构 (用于 workflow 类型)
export interface VideoData {
  id: string;
  index: number;
  prompt: string;
  firstFrame?: string;
  lastFrame?: string;
  status: 'pending' | 'submitting' | 'polling' | 'done' | 'error';
  taskId?: string;
  videoUrl?: string;
  model?: string;
  error?: string;
}

// 数据库类型定义 - 单表设计
export interface DbWorkflowHistory {
  id: number;
  user_api_key: string;
  title: string;
  type: string;  // 'image-gen' | 'workflow'
  mode: string;
  aspect_ratio: string;
  image_size: string;
  tasks: TaskItem[];  // JSONB 存储任务列表 (用于 image-gen)
  total_count: number;
  success_count: number;
  error_count: number;
  status: string;
  // Workflow 相关字段
  video_url: string | null;
  script_result: string | null;
  characters: CharacterData[];
  scenes: SceneData[];
  videos: VideoData[];
  merged_video_url: string | null;
  chat_messages: ChatMessageDbData[];  // AI Script Refine 聊天记录
  // 时间戳
  created_at: string;
  updated_at: string;
}

// Chat message 数据库类型
export interface ChatMessageDbData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  scriptData?: unknown;
}

// 将 API Key 哈希化用于存储
export function hashApiKey(apiKey: string): string {
  if (apiKey.length <= 20) {
    return apiKey;
  }
  const prefix = apiKey.substring(0, 8);
  const suffix = apiKey.substring(apiKey.length - 8);
  let hash = 0;
  for (let i = 0; i < apiKey.length; i++) {
    const char = apiKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hashStr = Math.abs(hash).toString(36);
  return `${prefix}...${hashStr}...${suffix}`;
}
