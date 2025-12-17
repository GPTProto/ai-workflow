'use client';

import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Check, X, Loader2, Eye, RefreshCw, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowNodeData, NodeStatus } from '@/types/workflow';

// Modern dark theme status configuration
const statusConfig: Record<NodeStatus, {
  bg: string;
  border: string;
  glow: string;
  iconBg: string;
  text: string;
  handleColor: string;
}> = {
  pending: {
    bg: 'bg-[#222222]',
    border: 'border-[#4A90E2]/30',
    glow: 'glow-subtle',
    iconBg: 'bg-[#3a3a3a]',
    text: 'text-[#888888]',
    handleColor: '#4A90E2',
  },
  running: {
    bg: 'bg-[#1e3a5f]',
    border: 'border-[#4A90E2]/70',
    glow: 'glow-blue animate-pulse-glow',
    iconBg: 'bg-[#4A90E2]',
    text: 'text-[#60a5fa]',
    handleColor: '#4A90E2',
  },
  success: {
    bg: 'bg-[#1a4d2e]',
    border: 'border-[#34d399]/70',
    glow: 'glow-green',
    iconBg: 'bg-[#34d399]',
    text: 'text-[#34d399]',
    handleColor: '#34d399',
  },
  error: {
    bg: 'bg-[#4d1a1a]',
    border: 'border-[#ef4444]/70',
    glow: 'glow-red',
    iconBg: 'bg-[#ef4444]',
    text: 'text-[#ef4444]',
    handleColor: '#ef4444',
  },
};

const StatusIcon = ({ status }: { status: NodeStatus }) => {
  switch (status) {
    case 'success':
      return <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />;
    case 'error':
      return <X className="w-3.5 h-3.5 text-white" strokeWidth={3} />;
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />;
    default:
      return <div className="w-2 h-2 rounded-full bg-[#4A90E2]/50" />;
  }
};

function WorkflowNode({ data }: NodeProps<WorkflowNodeData>) {
  const { label, icon, description, status, onPreview, previewData, onBatchRegenerate, onAddScene } = data;
  const config = statusConfig[status];
  const hasPreview = status === 'success' && previewData && onPreview;
  const canBatchRegenerate = status === 'success' && onBatchRegenerate;
  const canAddScene = status === 'success' && onAddScene;
  const [isHovering, setIsHovering] = useState(false);

  const handleClick = () => {
    if (hasPreview && previewData) {
      onPreview({
        type: previewData.type,
        text: previewData.text,
        title: previewData.title,
        editable: previewData.editable,
        onSaveText: previewData.onSaveText,
      });
    }
  };

  const handleBatchRegenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onBatchRegenerate) {
      onBatchRegenerate();
    }
  };

  const handleAddScene = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAddScene) {
      onAddScene();
    }
  };

  return (
    <div
      className={cn(
        'relative px-4 py-3 rounded-2xl border-2 min-w-[200px]',
        'backdrop-blur-sm transition-all duration-300 node-hover-effect',
        config.bg,
        config.border,
        config.glow,
        hasPreview && 'cursor-pointer hover:border-[#34d399]'
      )}
      onClick={handleClick}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Left connection point */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-[#2a2a2a] !border-2 hover:!scale-125 transition-all duration-200"
        style={{ borderColor: config.handleColor }}
      />

      <div className="flex items-center gap-3">
        {/* Icon container with gradient */}
        {icon && (
          <div className={cn(
            'flex items-center justify-center w-11 h-11 rounded-xl',
            'bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a]',
            'border border-[#4A90E2]/20',
            'shadow-inner',
            config.text
          )}>
            {icon}
          </div>
        )}

        {/* Text content */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-[#e0e0e0] flex items-center gap-2">
            {label}
            {hasPreview && (
              <Eye className="w-3.5 h-3.5 text-[#34d399]" />
            )}
          </div>
          {description && (
            <div className={cn(
              'text-xs mt-0.5 truncate max-w-[130px]',
              config.text
            )}>
              {description}
            </div>
          )}
        </div>

        {/* Status indicator with glow */}
        <div
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-full',
            'transition-all duration-300',
            config.iconBg
          )}
          style={{
            boxShadow: status !== 'pending' ? `0 0 10px ${config.handleColor}40` : 'none'
          }}
        >
          <StatusIcon status={status} />
        </div>

        {/* Batch regenerate button - shown on hover */}
        {canBatchRegenerate && isHovering && (
          <button
            onClick={handleBatchRegenerate}
            className="absolute -top-2 -right-2 p-1.5 rounded-full bg-[#4A90E2] hover:bg-[#60a5fa] text-white transition-all shadow-lg z-10"
            style={{
              boxShadow: '0 0 15px rgba(74, 144, 226, 0.5)'
            }}
            title="Regenerate all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Add scene button - shown on hover for scenes node */}
        {canAddScene && isHovering && (
          <button
            onClick={handleAddScene}
            className={cn(
              "absolute -top-2 p-1.5 rounded-full bg-[#34d399] hover:bg-[#4ade80] text-white transition-all shadow-lg z-10",
              canBatchRegenerate ? "-right-10" : "-right-2"
            )}
            style={{
              boxShadow: '0 0 15px rgba(52, 211, 153, 0.5)'
            }}
            title="Add new scene"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Right connection point */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-[#2a2a2a] !border-2 hover:!scale-125 transition-all duration-200"
        style={{ borderColor: config.handleColor }}
      />
    </div>
  );
}

export default memo(WorkflowNode);
