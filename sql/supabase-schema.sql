-- Supabase 数据库表结构 (简化版 - 单表设计)
-- 请在 Supabase SQL Editor 中执行此脚本

-- 先删除旧表（如果存在）
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS workflow_histories CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
DROP FUNCTION IF EXISTS update_history_stats CASCADE;

-- 工作流历史记录表（单表设计，任务信息用 JSONB 存储）
CREATE TABLE workflow_histories (
  id BIGSERIAL PRIMARY KEY,
  user_api_key TEXT NOT NULL,  -- 使用 API Key 哈希值作为用户标识
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'image-gen',  -- image-gen | workflow

  -- 图像生成配置
  mode TEXT NOT NULL DEFAULT 'text-to-image',  -- text-to-image | image-to-edit
  aspect_ratio TEXT DEFAULT '1:1',
  image_size TEXT DEFAULT '1K',

  -- 任务列表 (JSONB 格式) - 用于 image-gen 类型
  -- 每个任务结构: { index, filename, originalUrl, prompt, status, generatedUrl, error }
  -- status 可选值: pending | processing | done | error
  tasks JSONB DEFAULT '[]'::jsonb,

  -- 统计信息
  total_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,

  -- 状态: pending | running | completed | partial | failed | stopped
  status TEXT NOT NULL DEFAULT 'pending',

  -- Workflow 相关字段
  video_url TEXT,             -- 输入视频 URL
  script_result TEXT,         -- 脚本分析结果 (JSON 字符串)
  characters JSONB DEFAULT '[]'::jsonb,  -- 角色列表
  scenes JSONB DEFAULT '[]'::jsonb,      -- 场景/分镜列表
  videos JSONB DEFAULT '[]'::jsonb,      -- 生成的视频列表
  merged_video_url TEXT,      -- 合并后的视频 URL
  chat_messages JSONB DEFAULT '[]'::jsonb,  -- AI Script Refine 聊天记录

  -- 工作流后台任务字段
  workflow_stage TEXT DEFAULT 'idle',  -- idle | script | parsing | characters | scenes | videos | completed | error
  workflow_config JSONB,               -- 工作流配置参数

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_histories_user_api_key ON workflow_histories(user_api_key);
CREATE INDEX idx_histories_status ON workflow_histories(status);
CREATE INDEX idx_histories_created_at ON workflow_histories(created_at DESC);

-- 更新 updated_at 触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_histories_updated_at
  BEFORE UPDATE ON workflow_histories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS 策略（允许所有操作，因为我们用 user_api_key 做用户隔离）
ALTER TABLE workflow_histories ENABLE ROW LEVEL SECURITY;

-- 允许所有用户读取和写入（通过 anon key）
-- 实际的用户隔离通过 user_api_key 字段在应用层实现
CREATE POLICY "Allow all operations" ON workflow_histories
  FOR ALL
  USING (true)
  WITH CHECK (true);
