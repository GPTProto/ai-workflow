'use client';

import { cn } from '@/lib/utils';
import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import type { WorkflowProgress } from '@/hooks/useBackgroundWorkflow';

interface WorkflowProgressBarProps {
  progress: WorkflowProgress | null;
  status: string;
}

const stageLabels: Record<string, string> = {
  idle: '准备中',
  script: '生成脚本',
  script_done: '脚本完成',
  parsing: '解析脚本',
  parsing_done: '解析完成',
  characters: '生成角色',
  scenes: '生成分镜',
  videos: '生成视频',
  completed: '已完成',
  error: '发生错误',
};

export function WorkflowProgressBar({ progress, status }: WorkflowProgressBarProps) {
  if (!progress) return null;

  const isCompleted = status === 'completed';
  const isFailed = status === 'failed' || status === 'error';
  const isStopped = status === 'stopped';
  const isRunning = status === 'running';

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 p-4 space-y-3">
      {/* 标题和状态 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
          {isCompleted && <CheckCircle className="w-4 h-4 text-emerald-400" />}
          {isFailed && <XCircle className="w-4 h-4 text-red-400" />}
          {isStopped && <Clock className="w-4 h-4 text-amber-400" />}
          <span className="text-sm font-medium text-slate-200">
            {stageLabels[progress.stage] || progress.stage}
          </span>
        </div>
        <span className="text-sm text-slate-400">{progress.percent}%</span>
      </div>

      {/* 进度条 */}
      <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isCompleted ? 'bg-emerald-500' :
            isFailed ? 'bg-red-500' :
            isStopped ? 'bg-amber-500' :
            'bg-blue-500'
          )}
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      {/* 详细进度 */}
      <div className="grid grid-cols-3 gap-2 text-xs text-slate-400">
        <div className="flex items-center justify-between bg-slate-700/30 rounded px-2 py-1">
          <span>角色</span>
          <span className="text-slate-300">{progress.charactersDone}/{progress.charactersTotal}</span>
        </div>
        <div className="flex items-center justify-between bg-slate-700/30 rounded px-2 py-1">
          <span>分镜</span>
          <span className="text-slate-300">{progress.scenesDone}/{progress.scenesTotal}</span>
        </div>
        <div className="flex items-center justify-between bg-slate-700/30 rounded px-2 py-1">
          <span>视频</span>
          <span className="text-slate-300">{progress.videosDone}/{progress.videosTotal}</span>
        </div>
      </div>
    </div>
  );
}
