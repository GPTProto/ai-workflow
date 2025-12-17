'use client';

import { useState, useCallback, useRef } from 'react';
import { Node, Edge, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange } from 'reactflow';
import type {
  WorkflowStage,
  VideoItem,
  WorkflowLog,
  PreviewContent,
  CharacterItem,
  SceneItem,
  VideoModelId,
  ImageSizeId,
} from '@/types/workflow';
import { DEFAULT_SCRIPT_PROMPT, DEFAULT_VIDEO_MODEL } from '@/constants/workflow';
import { formatTime } from '@/services/api';
import { createInitialNodes, createInitialEdges, AnyNodeData } from './workflowConstants';

export interface WorkflowStateReturn {
  // Core state
  stage: WorkflowStage;
  setStage: React.Dispatch<React.SetStateAction<WorkflowStage>>;
  isRunning: boolean;
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>;
  isAutoMode: boolean;
  setIsAutoMode: React.Dispatch<React.SetStateAction<boolean>>;
  waitingForContinue: boolean;
  setWaitingForContinue: React.Dispatch<React.SetStateAction<boolean>>;

  // Configuration
  selectedModel: VideoModelId;
  setSelectedModel: React.Dispatch<React.SetStateAction<VideoModelId>>;
  videoGenerationMode: 'first-last-frame' | 'single-image';
  setVideoGenerationMode: React.Dispatch<React.SetStateAction<'first-last-frame' | 'single-image'>>;
  imageSize: ImageSizeId;
  setImageSize: React.Dispatch<React.SetStateAction<ImageSizeId>>;
  videoUrl: string;
  setVideoUrl: React.Dispatch<React.SetStateAction<string>>;
  scriptPrompt: string;
  setScriptPrompt: React.Dispatch<React.SetStateAction<string>>;

  // Data state
  scriptResult: string;
  setScriptResult: React.Dispatch<React.SetStateAction<string>>;
  characters: CharacterItem[];
  setCharacters: React.Dispatch<React.SetStateAction<CharacterItem[]>>;
  scenes: SceneItem[];
  setScenes: React.Dispatch<React.SetStateAction<SceneItem[]>>;
  videoItems: VideoItem[];
  setVideoItems: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  mergedVideoUrl: string;
  setMergedVideoUrl: React.Dispatch<React.SetStateAction<string>>;

  // Logs
  logs: WorkflowLog[];
  setLogs: React.Dispatch<React.SetStateAction<WorkflowLog[]>>;
  addLog: (type: WorkflowLog['type'], msg: string) => void;

  // React Flow state
  nodes: Node<AnyNodeData>[];
  setNodes: React.Dispatch<React.SetStateAction<Node<AnyNodeData>[]>>;
  edges: Edge[];
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;

  // Preview
  previewContent: PreviewContent | null;
  setPreviewContent: React.Dispatch<React.SetStateAction<PreviewContent | null>>;
  handlePreview: (content: PreviewContent) => void;
  closePreview: () => void;

  // Refs for latest state
  scenesRef: React.MutableRefObject<SceneItem[]>;
  charactersRef: React.MutableRefObject<CharacterItem[]>;
  scriptResultRef: React.MutableRefObject<string>;
  videoItemsRef: React.MutableRefObject<VideoItem[]>;
  pollingRef: React.MutableRefObject<Record<string, boolean>>;
  abortRef: React.MutableRefObject<boolean>;
  continueResolveRef: React.MutableRefObject<(() => void) | null>;

  // Continue workflow
  waitForContinue: (stageName: string) => Promise<void>;
  continueWorkflow: () => void;
}

export function useWorkflowState(): WorkflowStateReturn {
  // Core workflow state
  const [stage, setStage] = useState<WorkflowStage>('idle');
  const [isRunning, setIsRunning] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [waitingForContinue, setWaitingForContinue] = useState(false);

  // Configuration state
  const [selectedModel, setSelectedModel] = useState<VideoModelId>(DEFAULT_VIDEO_MODEL);
  const [videoGenerationMode, setVideoGenerationMode] = useState<'first-last-frame' | 'single-image'>('first-last-frame');
  const [imageSize, setImageSize] = useState<ImageSizeId>('1K');
  const [videoUrl, setVideoUrl] = useState('');
  const [scriptPrompt, setScriptPrompt] = useState(DEFAULT_SCRIPT_PROMPT);

  // Data state
  const [scriptResult, setScriptResult] = useState('');
  const [characters, setCharacters] = useState<CharacterItem[]>([]);
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [videoItems, setVideoItems] = useState<VideoItem[]>([]);
  const [mergedVideoUrl, setMergedVideoUrl] = useState('');

  // Logs state
  const [logs, setLogs] = useState<WorkflowLog[]>([]);

  // React Flow state
  const [nodes, setNodes] = useState<Node<AnyNodeData>[]>(createInitialNodes);
  const [edges, setEdges] = useState<Edge[]>(createInitialEdges);

  // Preview state
  const [previewContent, setPreviewContent] = useState<PreviewContent | null>(null);

  // Refs for latest state (avoid stale closures)
  const scenesRef = useRef<SceneItem[]>([]);
  const charactersRef = useRef<CharacterItem[]>([]);
  const scriptResultRef = useRef<string>('');
  const videoItemsRef = useRef<VideoItem[]>([]);
  const pollingRef = useRef<Record<string, boolean>>({});
  const abortRef = useRef(false);
  const continueResolveRef = useRef<(() => void) | null>(null);

  // Preview handlers
  const handlePreview = useCallback((content: PreviewContent) => {
    setPreviewContent(content);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewContent(null);
  }, []);

  // Log handler
  const addLog = useCallback((type: WorkflowLog['type'], msg: string) => {
    setLogs((prev) => [...prev, { time: formatTime(), type, message: msg }]);
  }, []);

  // Wait for manual continue (manual mode)
  const waitForContinue = useCallback(async (stageName: string) => {
    if (isAutoMode) return;
    setWaitingForContinue(true);
    addLog('info', `${stageName} - Waiting for continue...`);
    return new Promise<void>((resolve) => {
      continueResolveRef.current = resolve;
    });
  }, [isAutoMode, addLog]);

  // Continue workflow (manual mode)
  const continueWorkflow = useCallback(() => {
    if (continueResolveRef.current) {
      continueResolveRef.current();
      continueResolveRef.current = null;
    }
    setWaitingForContinue(false);
  }, []);

  // Node change handler
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    []
  );

  // Edge change handler
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    []
  );

  return {
    // Core state
    stage,
    setStage,
    isRunning,
    setIsRunning,
    isAutoMode,
    setIsAutoMode,
    waitingForContinue,
    setWaitingForContinue,

    // Configuration
    selectedModel,
    setSelectedModel,
    videoGenerationMode,
    setVideoGenerationMode,
    imageSize,
    setImageSize,
    videoUrl,
    setVideoUrl,
    scriptPrompt,
    setScriptPrompt,

    // Data state
    scriptResult,
    setScriptResult,
    characters,
    setCharacters,
    scenes,
    setScenes,
    videoItems,
    setVideoItems,
    mergedVideoUrl,
    setMergedVideoUrl,

    // Logs
    logs,
    setLogs,
    addLog,

    // React Flow state
    nodes,
    setNodes,
    edges,
    setEdges,
    onNodesChange,
    onEdgesChange,

    // Preview
    previewContent,
    setPreviewContent,
    handlePreview,
    closePreview,

    // Refs
    scenesRef,
    charactersRef,
    scriptResultRef,
    videoItemsRef,
    pollingRef,
    abortRef,
    continueResolveRef,

    // Continue workflow
    waitForContinue,
    continueWorkflow,
  };
}
