-- Supabase 数据库迁移脚本
-- 添加 chat_messages 字段用于保存 AI Script Refine 聊天记录
-- 请在 Supabase SQL Editor 中执行此脚本

-- 添加 chat_messages 列（如果不存在）
ALTER TABLE workflow_histories
ADD COLUMN IF NOT EXISTS chat_messages JSONB DEFAULT '[]'::jsonb;

-- 添加注释
COMMENT ON COLUMN workflow_histories.chat_messages IS 'AI Script Refine 聊天记录';
