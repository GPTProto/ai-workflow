import { Node, Edge } from 'reactflow';
import { Video, FileText, Users, Image, Film, CheckCircle } from 'lucide-react';
import React from 'react';
import type { WorkflowNodeData, ImageNodeData, VideoNodeData, MergeNodeData, CharacterNodeData, NodeStatus, CharacterItem, SceneItem, VideoItem } from '@/types/workflow';

export type AnyNodeData = WorkflowNodeData | ImageNodeData | VideoNodeData | MergeNodeData | CharacterNodeData;

// Status mapping utilities
export function getCharacterNodeStatus(status: CharacterItem['status']): NodeStatus {
  switch (status) {
    case 'done':
      return 'success';
    case 'generating':
    case 'uploading':
      return 'running';
    case 'error':
      return 'error';
    default:
      return 'pending';
  }
}

export function getSceneNodeStatus(imageStatus: SceneItem['imageStatus']): NodeStatus {
  switch (imageStatus) {
    case 'done':
      return 'success';
    case 'generating':
      return 'running';
    case 'error':
      return 'error';
    default:
      return 'pending';
  }
}

export function getVideoNodeStatus(status: VideoItem['status']): NodeStatus {
  switch (status) {
    case 'done':
      return 'success';
    case 'submitting':
    case 'polling':
      return 'running';
    case 'error':
      return 'error';
    default:
      return 'pending';
  }
}

// Layout constants
export const LAYOUT = {
  // Main node X coordinates (increased spacing to prevent overlap)
  INPUT_X: 100,
  SCRIPT_X: 400,
  CHARACTERS_X: 700,
  SCENES_X: 1000,
  VIDEOS_X: 1300,
  OUTPUT_X: 1600,
  // Main node Y coordinate (horizontal line)
  MAIN_Y: 50,
  // Sub-node starting Y (below main nodes)
  SUB_START_Y: 150,
  // Sub-node vertical spacing (increased to prevent overlap)
  SUB_SPACING_Y: 170,
};

// Initial nodes - horizontal workflow layout with vertical sub-nodes
export const createInitialNodes = (): Node<AnyNodeData>[] => [
  {
    id: 'input',
    type: 'workflowNode',
    position: { x: LAYOUT.INPUT_X, y: LAYOUT.MAIN_Y },
    data: {
      label: 'Input Video',
      icon: React.createElement(Video, { className: 'w-5 h-5' }),
      description: 'Upload or input URL',
      status: 'pending',
      nodeType: 'main',
    } as WorkflowNodeData,
  },
  {
    id: 'script',
    type: 'workflowNode',
    position: { x: LAYOUT.SCRIPT_X, y: LAYOUT.MAIN_Y },
    data: {
      label: 'Analyze Script',
      icon: React.createElement(FileText, { className: 'w-5 h-5' }),
      description: 'Generate storyboard prompts',
      status: 'pending',
      nodeType: 'main',
    } as WorkflowNodeData,
  },
  {
    id: 'characters',
    type: 'workflowNode',
    position: { x: LAYOUT.CHARACTERS_X, y: LAYOUT.MAIN_Y },
    data: {
      label: 'Character References',
      icon: React.createElement(Users, { className: 'w-5 h-5' }),
      description: 'Generate reference images',
      status: 'pending',
      nodeType: 'main',
    } as WorkflowNodeData,
  },
  {
    id: 'scenes',
    type: 'workflowNode',
    position: { x: LAYOUT.SCENES_X, y: LAYOUT.MAIN_Y },
    data: {
      label: 'Storyboard Images',
      icon: React.createElement(Image, { className: 'w-5 h-5' }),
      description: 'Generate scene images',
      status: 'pending',
      nodeType: 'main',
    } as WorkflowNodeData,
  },
  {
    id: 'videos',
    type: 'workflowNode',
    position: { x: LAYOUT.VIDEOS_X, y: LAYOUT.MAIN_Y },
    data: {
      label: 'Video Segments',
      icon: React.createElement(Film, { className: 'w-5 h-5' }),
      description: 'Generate video clips',
      status: 'pending',
      nodeType: 'main',
    } as WorkflowNodeData,
  },
  {
    id: 'output',
    type: 'workflowNode',
    position: { x: LAYOUT.OUTPUT_X, y: LAYOUT.MAIN_Y },
    data: {
      label: 'Final Output',
      icon: React.createElement(CheckCircle, { className: 'w-5 h-5' }),
      description: 'Merged video',
      status: 'pending',
      nodeType: 'main',
    } as WorkflowNodeData,
  },
];

// Initial edges - connecting main nodes horizontally
export const createInitialEdges = (): Edge[] => [
  {
    id: 'e-input-script',
    source: 'input',
    target: 'script',
    animated: false,
    style: { stroke: '#475569', strokeWidth: 2 },
    type: 'smoothstep',
  },
  {
    id: 'e-script-characters',
    source: 'script',
    target: 'characters',
    animated: false,
    style: { stroke: '#475569', strokeWidth: 2 },
    type: 'smoothstep',
  },
  {
    id: 'e-characters-scenes',
    source: 'characters',
    target: 'scenes',
    animated: false,
    style: { stroke: '#475569', strokeWidth: 2 },
    type: 'smoothstep',
  },
  {
    id: 'e-scenes-videos',
    source: 'scenes',
    target: 'videos',
    animated: false,
    style: { stroke: '#475569', strokeWidth: 2 },
    type: 'smoothstep',
  },
  {
    id: 'e-videos-output',
    source: 'videos',
    target: 'output',
    animated: false,
    style: { stroke: '#475569', strokeWidth: 2 },
    type: 'smoothstep',
  },
];

// Edge styles
export const EDGE_STYLES = {
  default: { stroke: '#475569', strokeWidth: 2 },
  active: { stroke: '#4A90E2', strokeWidth: 2 },
  success: { stroke: '#34d399', strokeWidth: 2 },
  error: { stroke: '#ef4444', strokeWidth: 2 },
};
