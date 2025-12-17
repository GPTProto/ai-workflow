'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowNodeData, NodeStatus } from '@/types/workflow';

const statusStyles: Record<NodeStatus, string> = {
  pending: 'bg-gray-50 border-gray-300 text-gray-500',
  running: 'bg-blue-50 border-blue-500 text-blue-500 shadow-md shadow-blue-200',
  success: 'bg-green-50 border-green-500 text-green-500',
  error: 'bg-red-50 border-red-500 text-red-500',
};

const StatusIcon = ({ status }: { status: NodeStatus }) => {
  switch (status) {
    case 'success':
      return <Check className="w-2.5 h-2.5" />;
    case 'error':
      return <X className="w-2.5 h-2.5" />;
    case 'running':
      return <Loader2 className="w-2.5 h-2.5 animate-spin" />;
    default:
      return null;
  }
};

function SmallNode({ data }: NodeProps<WorkflowNodeData>) {
  const { label, icon, status } = data;

  return (
    <div
      className={cn(
        'px-3 py-2 rounded-md border-2 min-w-[100px] cursor-pointer transition-all duration-200',
        statusStyles[status]
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-400 !w-1.5 !h-1.5" />

      <div className="flex items-center gap-1.5">
        {icon && <div className="text-sm">{icon}</div>}
        <div className="font-medium text-xs text-gray-700">{label}</div>
        <div className={cn('flex items-center justify-center ml-auto', statusStyles[status])}>
          <StatusIcon status={status} />
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-gray-400 !w-1.5 !h-1.5" />
    </div>
  );
}

export default memo(SmallNode);
