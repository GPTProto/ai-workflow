'use client';

import { useCallback, useRef } from 'react';
import { Node, Edge } from 'reactflow';
import type {
  NodeStatus,
  WorkflowNodeData,
  ImageNodeData,
  VideoNodeData,
  CharacterNodeData,
  CharacterItem,
  SceneItem,
  VideoItem,
  PreviewContent,
  VideoModelId,
  ImageTextToImageModelId,
  ImageEditModelId,
  VideoGenerationMode,
} from '@/types/workflow';
import { LAYOUT, AnyNodeData } from './workflowConstants';

export interface WorkflowNodesParams {
  nodes: Node<AnyNodeData>[];
  setNodes: React.Dispatch<React.SetStateAction<Node<AnyNodeData>[]>>;
  edges: Edge[];
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  handlePreview: (content: PreviewContent) => void;
}

export interface WorkflowNodesReturn {
  // Node update methods
  updateNodeStatus: (nodeId: string, status: NodeStatus, description?: string) => void;
  clearDynamicNodes: () => void;
  relayoutNodes: () => void;

  // Node add methods
  addCharacterNode: (char: CharacterItem, index: number) => void;
  addSceneNode: (scene: SceneItem, index: number) => void;
  addVideoNode: (video: VideoItem, index: number) => void;

  // Node add with retry methods
  addCharacterNodeWithRetry: (
    char: CharacterItem,
    index: number,
    onRetry?: () => void,
    onUpload?: (file: File) => void,
    onEditPrompt?: (newPrompt: string) => void
  ) => void;
  addSceneNodeWithRetry: (scene: SceneItem, index: number, onRetry?: () => void) => void;
  addVideoNodeWithRetry: (video: VideoItem, index: number, onRetry?: () => void) => void;

  // Output node methods
  updateOutputNodeWithVideo: (videoUrl: string, onRetryMerge?: () => Promise<boolean>) => void;
  updateOutputNodeWithError: (errorMessage: string, onRetryMerge?: () => Promise<boolean>) => void;
  updateInputNodeWithVideo: (url: string) => void;

  // Edge methods
  updateEdgeAnimation: (sourceNodeId: string, animated: boolean) => void;

  // Refs for regenerate callbacks
  regenerateCharacterRef: React.MutableRefObject<((index: number, newPrompt?: string) => void) | undefined>;
  regenerateCharacterWithModelRef: React.MutableRefObject<((index: number, modelId: ImageTextToImageModelId, size?: string, aspectRatio?: string, newPrompt?: string) => void) | undefined>;
  uploadCharacterRef: React.MutableRefObject<((index: number, file: File) => void) | undefined>;
  regenerateSceneRef: React.MutableRefObject<((index: number, newPrompt?: string) => void) | undefined>;
  regenerateSceneWithModelRef: React.MutableRefObject<((index: number, modelId: ImageEditModelId, size?: string, aspectRatio?: string) => void) | undefined>;
  uploadSceneRef: React.MutableRefObject<((index: number, file: File) => void) | undefined>;
  regenerateVideoRef: React.MutableRefObject<((index: number, newPrompt?: string) => void) | undefined>;
  regenerateVideoWithModelRef: React.MutableRefObject<((index: number, modelId: VideoModelId, mode?: VideoGenerationMode, duration?: number, newPrompt?: string) => void) | undefined>;

  // Batch regenerate refs
  batchRegenerateCharactersRef: React.MutableRefObject<(() => void) | null>;
  batchRegenerateScenesRef: React.MutableRefObject<(() => void) | null>;
  retryMergeVideosRef: React.MutableRefObject<(() => void) | null>;

  // Add scene ref
  addSceneRef: React.MutableRefObject<(() => void) | null>;
}

export function useWorkflowNodes({
  setNodes,
  setEdges,
  handlePreview,
}: WorkflowNodesParams): WorkflowNodesReturn {
  // Refs for regenerate callbacks
  const regenerateCharacterRef = useRef<((index: number, newPrompt?: string) => void) | undefined>(undefined);
  const regenerateCharacterWithModelRef = useRef<((index: number, modelId: ImageTextToImageModelId, size?: string, aspectRatio?: string, newPrompt?: string) => void) | undefined>(undefined);
  const uploadCharacterRef = useRef<((index: number, file: File) => void) | undefined>(undefined);
  const regenerateSceneRef = useRef<((index: number, newPrompt?: string) => void) | undefined>(undefined);
  const regenerateSceneWithModelRef = useRef<((index: number, modelId: ImageEditModelId, size?: string, aspectRatio?: string) => void) | undefined>(undefined);
  const uploadSceneRef = useRef<((index: number, file: File) => void) | undefined>(undefined);
  const regenerateVideoRef = useRef<((index: number, newPrompt?: string) => void) | undefined>(undefined);
  const regenerateVideoWithModelRef = useRef<((index: number, modelId: VideoModelId, mode?: VideoGenerationMode, duration?: number, newPrompt?: string) => void) | undefined>(undefined);

  // Batch regenerate refs
  const batchRegenerateCharactersRef = useRef<(() => void) | null>(null);
  const batchRegenerateScenesRef = useRef<(() => void) | null>(null);
  const retryMergeVideosRef = useRef<(() => void) | null>(null);

  // Add scene ref
  const addSceneRef = useRef<(() => void) | null>(null);

  // Update edge animation
  const updateEdgeAnimation = useCallback(
    (sourceNodeId: string, animated: boolean) => {
      setEdges((eds) =>
        eds.map((edge) => {
          if (edge.source === sourceNodeId || edge.target === sourceNodeId) {
            return {
              ...edge,
              animated,
              style: animated
                ? { stroke: '#4A90E2', strokeWidth: 2 }
                : { stroke: '#475569', strokeWidth: 2 },
            };
          }
          return edge;
        })
      );
    },
    [setEdges]
  );

  // Update node status
  const updateNodeStatus = useCallback(
    (nodeId: string, status: NodeStatus, description?: string) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            const currentData = node.data as WorkflowNodeData;

            // Add batch regenerate callback for characters and scenes main nodes
            let onBatchRegenerate: (() => void) | undefined = undefined;
            let onAddScene: (() => void) | undefined = undefined;
            if (status === 'success') {
              if (nodeId === 'characters') {
                onBatchRegenerate = () => {
                  batchRegenerateCharactersRef.current?.();
                };
              } else if (nodeId === 'scenes') {
                onBatchRegenerate = () => {
                  batchRegenerateScenesRef.current?.();
                };
                onAddScene = () => {
                  addSceneRef.current?.();
                };
              }
            }

            return {
              ...node,
              data: {
                ...currentData,
                status,
                description: description ?? currentData.description,
                onBatchRegenerate,
                onAddScene,
              } as WorkflowNodeData,
            };
          }
          return node;
        })
      );
      updateEdgeAnimation(nodeId, status === 'running');
    },
    [setNodes, updateEdgeAnimation]
  );

  // Clear dynamic nodes
  const clearDynamicNodes = useCallback(() => {
    setNodes((nds) =>
      nds.filter((node) =>
        !node.id.startsWith('char-') &&
        !node.id.startsWith('scene-') &&
        !node.id.startsWith('vid-') &&
        node.id !== 'merge'
      )
    );
    setEdges((eds) =>
      eds.filter(
        (edge) =>
          !edge.source.startsWith('char-') &&
          !edge.source.startsWith('scene-') &&
          !edge.source.startsWith('vid-') &&
          !edge.target.startsWith('char-') &&
          !edge.target.startsWith('scene-') &&
          !edge.target.startsWith('vid-') &&
          edge.source !== 'merge' &&
          edge.target !== 'merge'
      )
    );
  }, [setNodes, setEdges]);

  // Auto relayout all nodes
  const relayoutNodes = useCallback(() => {
    setNodes((nds) => {
      const mainPositions: Record<string, { x: number; y: number }> = {
        input: { x: LAYOUT.INPUT_X, y: LAYOUT.MAIN_Y },
        script: { x: LAYOUT.SCRIPT_X, y: LAYOUT.MAIN_Y },
        characters: { x: LAYOUT.CHARACTERS_X, y: LAYOUT.MAIN_Y },
        scenes: { x: LAYOUT.SCENES_X, y: LAYOUT.MAIN_Y },
        videos: { x: LAYOUT.VIDEOS_X, y: LAYOUT.MAIN_Y },
        output: { x: LAYOUT.OUTPUT_X, y: LAYOUT.MAIN_Y },
      };

      return nds.map((node) => {
        if (mainPositions[node.id]) {
          return { ...node, position: mainPositions[node.id] };
        }

        if (node.id.startsWith('char-')) {
          const index = parseInt(node.id.replace('char-', ''));
          return {
            ...node,
            position: { x: LAYOUT.CHARACTERS_X, y: LAYOUT.SUB_START_Y + index * LAYOUT.SUB_SPACING_Y },
          };
        }

        if (node.id.startsWith('scene-')) {
          const index = parseInt(node.id.replace('scene-', ''));
          return {
            ...node,
            position: { x: LAYOUT.SCENES_X, y: LAYOUT.SUB_START_Y + index * LAYOUT.SUB_SPACING_Y },
          };
        }

        if (node.id.startsWith('vid-')) {
          const index = parseInt(node.id.replace('vid-', ''));
          return {
            ...node,
            position: { x: LAYOUT.VIDEOS_X, y: LAYOUT.SUB_START_Y + index * LAYOUT.SUB_SPACING_Y },
          };
        }

        return node;
      });
    });
  }, [setNodes]);

  // Add character node
  const addCharacterNode = useCallback((char: CharacterItem, index: number) => {
    const nodeId = `char-${index}`;
    const x = LAYOUT.CHARACTERS_X;
    const y = LAYOUT.SUB_START_Y + index * LAYOUT.SUB_SPACING_Y;

    const nodeStatus = char.status === 'generating' || char.status === 'uploading'
      ? 'running'
      : char.status === 'done'
        ? 'success'
        : char.status === 'error'
          ? 'error'
          : 'pending';

    const newNode: Node<CharacterNodeData> = {
      id: nodeId,
      type: 'characterNode',
      position: { x, y },
      data: {
        label: char.name,
        characterName: char.name,
        description: char.description,
        prompt: char.imagePrompt,
        status: nodeStatus,
        imageUrl: char.imageUrl || char.ossUrl,
        error: char.error,
        onPreview: handlePreview,
        onRegenerate: () => regenerateCharacterRef.current?.(index),
        onEditPrompt: (newPrompt: string) => regenerateCharacterRef.current?.(index, newPrompt),
        onUpload: (file: File) => uploadCharacterRef.current?.(index, file),
        onRegenerateWithModel: (modelId: ImageTextToImageModelId, size?: string, aspectRatio?: string, newPrompt?: string) => {
          regenerateCharacterWithModelRef.current?.(index, modelId, size, aspectRatio, newPrompt);
        },
      },
    };

    setNodes((nds) => {
      const existing = nds.find((n) => n.id === nodeId);
      if (existing) {
        return nds.map((n) => (n.id === nodeId ? newNode : n));
      }
      return [...nds, newNode];
    });

    // Add edge
    const edgeId = index === 0 ? `e-characters-${nodeId}` : `e-char-${index - 1}-${nodeId}`;
    const sourceId = index === 0 ? 'characters' : `char-${index - 1}`;
    setEdges((eds) => {
      const existing = eds.find((e) => e.id === edgeId);
      if (!existing) {
        return [...eds, {
          id: edgeId,
          source: sourceId,
          target: nodeId,
          type: 'smoothstep',
          animated: char.status === 'generating',
          style: { stroke: char.status === 'generating' ? '#8b5cf6' : '#475569', strokeWidth: 2 },
        }];
      }
      return eds.map((e) =>
        e.id === edgeId
          ? { ...e, animated: char.status === 'generating', style: { stroke: char.status === 'generating' ? '#8b5cf6' : '#475569', strokeWidth: 2 } }
          : e
      );
    });
  }, [setNodes, setEdges, handlePreview]);

  // Add scene node
  const addSceneNode = useCallback((scene: SceneItem, index: number) => {
    const nodeId = `scene-${index}`;
    const x = LAYOUT.SCENES_X;
    const y = LAYOUT.SUB_START_Y + index * LAYOUT.SUB_SPACING_Y;

    const nodeStatus = scene.imageStatus === 'generating'
      ? 'running'
      : scene.imageStatus === 'done'
        ? 'success'
        : scene.imageStatus === 'error'
          ? 'error'
          : 'pending';

    const newNode: Node<ImageNodeData> = {
      id: nodeId,
      type: 'sceneNode',
      position: { x, y },
      data: {
        label: `Scene ${scene.id}`,
        prompt: scene.imagePrompt,
        status: nodeStatus,
        imageUrl: scene.imageUrl,
        error: scene.error,
        onPreview: handlePreview,
        onRegenerate: () => regenerateSceneRef.current?.(index),
        onEditPrompt: (newPrompt: string) => regenerateSceneRef.current?.(index, newPrompt),
        onUpload: (file: File) => uploadSceneRef.current?.(index, file),
        onRegenerateWithModel: (modelId: ImageEditModelId, size?: string, aspectRatio?: string) => {
          regenerateSceneWithModelRef.current?.(index, modelId, size, aspectRatio);
        },
      },
    };

    setNodes((nds) => {
      const existing = nds.find((n) => n.id === nodeId);
      if (existing) {
        return nds.map((n) => (n.id === nodeId ? newNode : n));
      }
      return [...nds, newNode];
    });

    // Add edge
    const edgeId = index === 0 ? `e-scenes-${nodeId}` : `e-scene-${index - 1}-${nodeId}`;
    const sourceId = index === 0 ? 'scenes' : `scene-${index - 1}`;
    setEdges((eds) => {
      const existing = eds.find((e) => e.id === edgeId);
      if (!existing) {
        return [...eds, {
          id: edgeId,
          source: sourceId,
          target: nodeId,
          type: 'smoothstep',
          animated: scene.imageStatus === 'generating',
          style: { stroke: scene.imageStatus === 'generating' ? '#22d3ee' : '#475569', strokeWidth: 2 },
        }];
      }
      return eds.map((e) =>
        e.id === edgeId
          ? { ...e, animated: scene.imageStatus === 'generating', style: { stroke: scene.imageStatus === 'generating' ? '#22d3ee' : '#475569', strokeWidth: 2 } }
          : e
      );
    });
  }, [setNodes, setEdges, handlePreview]);

  // Add video node
  const addVideoNode = useCallback((video: VideoItem, index: number) => {
    const nodeId = `vid-${index}`;
    const x = LAYOUT.VIDEOS_X;
    const y = LAYOUT.SUB_START_Y + index * LAYOUT.SUB_SPACING_Y;

    const nodeStatus = (video.status === 'submitting' || video.status === 'polling')
      ? 'running'
      : video.status === 'done'
        ? 'success'
        : video.status === 'error'
          ? 'error'
          : 'pending';

    const newNode: Node<VideoNodeData> = {
      id: nodeId,
      type: 'videoNode',
      position: { x, y },
      data: {
        label: `Video ${index + 1}`,
        prompt: video.prompt,
        status: nodeStatus,
        videoUrl: video.videoUrl,
        thumbnailUrl: video.firstFrame,
        error: video.error,
        onPreview: handlePreview,
        onRegenerate: () => regenerateVideoRef.current?.(index),
        onEditPrompt: (newPrompt: string) => regenerateVideoRef.current?.(index, newPrompt),
        onRegenerateWithModel: (modelId: VideoModelId, mode?: VideoGenerationMode, duration?: number, newPrompt?: string) => {
          regenerateVideoWithModelRef.current?.(index, modelId, mode, duration, newPrompt);
        },
      },
    };

    setNodes((nds) => {
      const existing = nds.find((n) => n.id === nodeId);
      if (existing) {
        return nds.map((n) => (n.id === nodeId ? newNode : n));
      }
      return [...nds, newNode];
    });

    // Add edge
    const edgeId = index === 0 ? `e-videos-${nodeId}` : `e-vid-${index - 1}-${nodeId}`;
    const sourceId = index === 0 ? 'videos' : `vid-${index - 1}`;
    setEdges((eds) => {
      const existing = eds.find((e) => e.id === edgeId);
      if (!existing) {
        return [...eds, {
          id: edgeId,
          source: sourceId,
          target: nodeId,
          type: 'smoothstep',
          animated: video.status === 'submitting' || video.status === 'polling',
          style: { stroke: (video.status === 'submitting' || video.status === 'polling') ? '#4A90E2' : '#475569', strokeWidth: 2 },
        }];
      }
      return eds.map((e) =>
        e.id === edgeId
          ? { ...e, animated: video.status === 'submitting' || video.status === 'polling', style: { stroke: (video.status === 'submitting' || video.status === 'polling') ? '#4A90E2' : '#475569', strokeWidth: 2 } }
          : e
      );
    });
  }, [setNodes, setEdges, handlePreview]);

  // Add character node with retry
  const addCharacterNodeWithRetry = useCallback((
    char: CharacterItem,
    index: number,
    onRetry?: () => void,
    onUpload?: (file: File) => void,
    onEditPrompt?: (newPrompt: string) => void
  ) => {
    const nodeId = `char-${index}`;
    const x = LAYOUT.CHARACTERS_X;
    const y = LAYOUT.SUB_START_Y + index * LAYOUT.SUB_SPACING_Y;

    const nodeStatus = char.status === 'generating' || char.status === 'uploading'
      ? 'running'
      : char.status === 'done'
        ? 'success'
        : char.status === 'error'
          ? 'error'
          : 'pending';

    const newNode: Node<CharacterNodeData> = {
      id: nodeId,
      type: 'characterNode',
      position: { x, y },
      data: {
        label: char.name,
        characterName: char.name,
        description: char.description,
        prompt: char.imagePrompt,
        status: nodeStatus,
        imageUrl: char.imageUrl || char.ossUrl,
        error: char.error,
        onPreview: handlePreview,
        onRegenerate: onRetry,
        onUpload,
        onEditPrompt,
      },
    };

    setNodes((nds) => {
      const existing = nds.find((n) => n.id === nodeId);
      if (existing) {
        return nds.map((n) => (n.id === nodeId ? newNode : n));
      }
      return [...nds, newNode];
    });

    // Add edge
    const edgeId = index === 0 ? `e-characters-${nodeId}` : `e-char-${index - 1}-${nodeId}`;
    const sourceId = index === 0 ? 'characters' : `char-${index - 1}`;
    setEdges((eds) => {
      const existing = eds.find((e) => e.id === edgeId);
      if (!existing) {
        return [...eds, {
          id: edgeId,
          source: sourceId,
          target: nodeId,
          type: 'smoothstep',
          animated: char.status === 'generating',
          style: { stroke: char.status === 'generating' ? '#8b5cf6' : '#475569', strokeWidth: 2 },
        }];
      }
      return eds;
    });
  }, [setNodes, setEdges, handlePreview]);

  // Add scene node with retry
  const addSceneNodeWithRetry = useCallback((scene: SceneItem, index: number, onRetry?: () => void) => {
    const nodeId = `scene-${index}`;
    const x = LAYOUT.SCENES_X;
    const y = LAYOUT.SUB_START_Y + index * LAYOUT.SUB_SPACING_Y;

    const nodeStatus = scene.imageStatus === 'generating'
      ? 'running'
      : scene.imageStatus === 'done'
        ? 'success'
        : scene.imageStatus === 'error'
          ? 'error'
          : 'pending';

    const newNode: Node<ImageNodeData> = {
      id: nodeId,
      type: 'sceneNode',
      position: { x, y },
      data: {
        label: `Scene ${scene.id}`,
        prompt: scene.imagePrompt,
        status: nodeStatus,
        imageUrl: scene.imageUrl,
        error: scene.error,
        onPreview: handlePreview,
        onRegenerate: onRetry,
      },
    };

    setNodes((nds) => {
      const existing = nds.find((n) => n.id === nodeId);
      if (existing) {
        return nds.map((n) => (n.id === nodeId ? newNode : n));
      }
      return [...nds, newNode];
    });

    // Add edge
    const edgeId = index === 0 ? `e-scenes-${nodeId}` : `e-scene-${index - 1}-${nodeId}`;
    const sourceId = index === 0 ? 'scenes' : `scene-${index - 1}`;
    setEdges((eds) => {
      const existing = eds.find((e) => e.id === edgeId);
      if (!existing) {
        return [...eds, {
          id: edgeId,
          source: sourceId,
          target: nodeId,
          type: 'smoothstep',
          animated: scene.imageStatus === 'generating',
          style: { stroke: scene.imageStatus === 'generating' ? '#22d3ee' : '#475569', strokeWidth: 2 },
        }];
      }
      return eds;
    });
  }, [setNodes, setEdges, handlePreview]);

  // Add video node with retry
  const addVideoNodeWithRetry = useCallback((video: VideoItem, index: number, onRetry?: () => void) => {
    const nodeId = `vid-${index}`;
    const x = LAYOUT.VIDEOS_X;
    const y = LAYOUT.SUB_START_Y + index * LAYOUT.SUB_SPACING_Y;

    const nodeStatus = (video.status === 'submitting' || video.status === 'polling')
      ? 'running'
      : video.status === 'done'
        ? 'success'
        : video.status === 'error'
          ? 'error'
          : 'pending';

    const newNode: Node<VideoNodeData> = {
      id: nodeId,
      type: 'videoNode',
      position: { x, y },
      data: {
        label: `Video ${index + 1}`,
        prompt: video.prompt,
        status: nodeStatus,
        videoUrl: video.videoUrl,
        thumbnailUrl: video.firstFrame,
        error: video.error,
        onPreview: handlePreview,
        onRegenerate: onRetry,
      },
    };

    setNodes((nds) => {
      const existing = nds.find((n) => n.id === nodeId);
      if (existing) {
        return nds.map((n) => (n.id === nodeId ? newNode : n));
      }
      return [...nds, newNode];
    });

    // Add edge
    const edgeId = index === 0 ? `e-videos-${nodeId}` : `e-vid-${index - 1}-${nodeId}`;
    const sourceId = index === 0 ? 'videos' : `vid-${index - 1}`;
    setEdges((eds) => {
      const existing = eds.find((e) => e.id === edgeId);
      if (!existing) {
        return [...eds, {
          id: edgeId,
          source: sourceId,
          target: nodeId,
          type: 'smoothstep',
          animated: video.status === 'submitting' || video.status === 'polling',
          style: { stroke: (video.status === 'submitting' || video.status === 'polling') ? '#4A90E2' : '#475569', strokeWidth: 2 },
        }];
      }
      return eds;
    });
  }, [setNodes, setEdges, handlePreview]);

  // Update output node with video
  const updateOutputNodeWithVideo = useCallback((videoUrl: string, onRetryMerge?: () => Promise<boolean>) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === 'output') {
          return {
            ...node,
            type: 'videoNode',
            data: {
              label: 'Merged Video',
              status: 'success' as NodeStatus,
              videoUrl,
              isMergedVideo: true,
              onPreview: handlePreview,
              onRegenerate: onRetryMerge,
            } as VideoNodeData,
          };
        }
        return node;
      })
    );
    updateEdgeAnimation('output', false);
  }, [setNodes, handlePreview, updateEdgeAnimation]);

  // Update output node with error
  const updateOutputNodeWithError = useCallback((errorMessage: string, onRetryMerge?: () => Promise<boolean>) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === 'output') {
          return {
            ...node,
            type: 'videoNode',
            data: {
              label: 'Merge Failed',
              status: 'error' as NodeStatus,
              error: errorMessage,
              isMergedVideo: true,
              onPreview: handlePreview,
              onRegenerate: onRetryMerge,
            } as VideoNodeData,
          };
        }
        return node;
      })
    );
    updateEdgeAnimation('output', false);
  }, [setNodes, handlePreview, updateEdgeAnimation]);

  // Update input node with video
  const updateInputNodeWithVideo = useCallback((url: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === 'input') {
          return {
            ...node,
            type: 'videoNode',
            data: {
              label: 'Input Video',
              status: 'success' as NodeStatus,
              videoUrl: url,
              isInputVideo: true,
              onPreview: handlePreview,
            } as VideoNodeData,
          };
        }
        return node;
      })
    );
    updateEdgeAnimation('input', false);
  }, [setNodes, handlePreview, updateEdgeAnimation]);

  return {
    updateNodeStatus,
    clearDynamicNodes,
    relayoutNodes,
    addCharacterNode,
    addSceneNode,
    addVideoNode,
    addCharacterNodeWithRetry,
    addSceneNodeWithRetry,
    addVideoNodeWithRetry,
    updateOutputNodeWithVideo,
    updateOutputNodeWithError,
    updateInputNodeWithVideo,
    updateEdgeAnimation,
    regenerateCharacterRef,
    regenerateCharacterWithModelRef,
    uploadCharacterRef,
    regenerateSceneRef,
    regenerateSceneWithModelRef,
    uploadSceneRef,
    regenerateVideoRef,
    regenerateVideoWithModelRef,
    batchRegenerateCharactersRef,
    batchRegenerateScenesRef,
    retryMergeVideosRef,
    addSceneRef,
  };
}
