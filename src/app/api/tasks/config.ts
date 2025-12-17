import { createClient } from '@supabase/supabase-js';

// 服务端 Supabase 客户端
const supabaseUrl = 'https://qqpzpssitsucgelawysk.supabase.co';
// 使用 anon/public key（与客户端相同）
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxcHpwc3NpdHN1Y2dlbGF3eXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwMTMxMjUsImV4cCI6MjA4MDU4OTEyNX0.i_6_sE53ARmlRlfBqVTdDC-3rq68bxeVMgUvhC2gO2M';

export const supabaseServer = createClient(supabaseUrl, supabaseKey);

// API 配置
export const API_BASE_URL = 'https://gptproto.com';

export const GEMINI_IMAGE_API = {
  TEXT_TO_IMAGE: {
    url: `${API_BASE_URL}/api/v3/google/gemini-3-pro-image-preview/text-to-image`,
  },
  IMAGE_TO_EDIT: {
    url: `${API_BASE_URL}/api/v3/google/gemini-3-pro-image-preview/image-to-edit`,
  },
};

export const TASK_API = {
  getResultUrl: (taskId: string) => `${API_BASE_URL}/api/v3/predictions/${taskId}/result`,
};

// 哈希 API Key（与客户端一致）
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
