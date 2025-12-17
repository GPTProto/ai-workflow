'use client';

import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  Node,
  OnEdgesChange,
  OnNodesChange,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { nodeTypes } from '@/components/nodes';
import { cn } from '@/lib/utils';
import { SkipForward } from 'lucide-react';

interface WorkflowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  waitingForContinue?: boolean;
  onContinue?: () => void;
}

export function WorkflowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  waitingForContinue,
  onContinue,
}: WorkflowCanvasProps) {
  return (
    <div className="h-full rounded-2xl border border-[#4A90E2]/20 bg-[#1a1a1a] backdrop-blur-sm overflow-hidden flex flex-col shadow-lg shadow-[#4A90E2]/5">

      {/* Canvas area */}
      <div className="flex-1 bg-[#121212] relative">
        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(74, 144, 226, 0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(74, 144, 226, 0.03) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px'
          }}
        />
        {/* Radial gradient for depth */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 0%, #121212 70%)'
          }}
        />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          defaultEdgeOptions={{
            type: 'smoothstep',
            style: {
              stroke: '#4A90E2',
              strokeWidth: 2,
            },
            animated: true,
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Controls
            position="bottom-right"
            className="!bg-[#222222]/90 !border !border-[#4A90E2]/30 !rounded-xl !shadow-lg !shadow-[#4A90E2]/10 [&>button]:!bg-[#2a2a2a] [&>button]:!border-[#4A90E2]/20 [&>button]:!text-[#aaaaaa] [&>button:hover]:!bg-[#3a3a3a] [&>button:hover]:!text-white [&>button:hover]:!border-[#4A90E2]/50"
          />
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.5}
            color="rgba(74, 144, 226, 0.15)"
          />
        </ReactFlow>

        {/* Continue button - top right circular button with glow */}
        {waitingForContinue && onContinue && (
          <div className="absolute top-4 right-4 z-10">
            <button
              onClick={onContinue}
              className={cn(
                'flex items-center justify-center w-14 h-14 rounded-full',
                'bg-gradient-to-br from-[#4A90E2] to-[#7c3aed]',
                'hover:from-[#60a5fa] hover:to-[#8b5cf6]',
                'shadow-lg shadow-[#4A90E2]/40',
                'text-white transition-all duration-300',
                'animate-pulse',
                'border border-white/20'
              )}
              style={{
                boxShadow: '0 0 20px rgba(74, 144, 226, 0.5), 0 0 40px rgba(74, 144, 226, 0.3)'
              }}
              title="Continue"
            >
              <SkipForward className="w-6 h-6" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
