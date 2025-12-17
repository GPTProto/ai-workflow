'use client';

import { useCallback } from 'react';
import { Node, Edge } from 'reactflow';
import type {
  CharacterItem,
  SceneItem,
  VideoItem,
  NodeStatus,
  PreviewContent,
  VideoModelId,
  VideoGenerationMode,
  WorkflowLog,
} from '@/types/workflow';
import { parseScriptResult } from '@/services/api';
import { LAYOUT, AnyNodeData, getCharacterNodeStatus, getSceneNodeStatus, getVideoNodeStatus } from './workflowConstants';

export interface HistoryData {
  historyId?: number;
  videoUrl?: string;
  scriptResult?: string;
  characters?: CharacterItem[];
  scenes?: SceneItem[];
  videos?: VideoItem[];
  mergedVideoUrl?: string | null;
  workflowStatus?: string;
  workflowStage?: string;
  // External callbacks
  onRetryVideo?: (videoIndex: number) => Promise<boolean>;
  onRetryVideoWithModel?: (videoIndex: number, modelId?: string, mode?: string) => Promise<boolean>;
  onRetryCharacter?: (characterIndex: number, newPrompt?: string) => Promise<boolean>;
  onRetryCharacterWithModel?: (characterIndex: number, newPrompt?: string, modelId?: string, size?: string, aspectRatio?: string) => Promise<boolean>;
  onRetryScene?: (sceneIndex: number) => Promise<boolean>;
  onRetrySceneWithModel?: (sceneIndex: number, newPrompt?: string, newVideoPrompt?: string, modelId?: string, size?: string, aspectRatio?: string) => Promise<boolean>;
  onRetryMerge?: () => Promise<boolean>;
  onUploadCharacter?: (characterIndex: number, file: File) => Promise<boolean>;
  onSaveScript?: (scriptData: { characters: Array<{ name: string; description?: string; imagePrompt?: string; RoleimagePrompt?: string }>; scenes: Array<{ id: number; imagePrompt: string; videoPrompt: string }> }) => Promise<boolean>;
  onBatchRegenerateCharacters?: () => Promise<boolean>;
  onBatchRegenerateScenes?: () => Promise<boolean>;
}

export interface WorkflowHistoryParams {
  // State setters
  setVideoUrl: React.Dispatch<React.SetStateAction<string>>;
  setScriptResult: React.Dispatch<React.SetStateAction<string>>;
  setCharacters: React.Dispatch<React.SetStateAction<CharacterItem[]>>;
  setScenes: React.Dispatch<React.SetStateAction<SceneItem[]>>;
  setVideoItems: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  setMergedVideoUrl: React.Dispatch<React.SetStateAction<string>>;
  setNodes: React.Dispatch<React.SetStateAction<Node<AnyNodeData>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>;
  setWaitingForContinue: React.Dispatch<React.SetStateAction<boolean>>;
  setLogs: React.Dispatch<React.SetStateAction<WorkflowLog[]>>;

  // Refs
  abortRef: React.MutableRefObject<boolean>;
  pollingRef: React.MutableRefObject<Record<string, boolean>>;
  continueResolveRef: React.MutableRefObject<(() => void) | null>;
  batchRegenerateCharactersRef: React.MutableRefObject<(() => void) | null>;
  batchRegenerateScenesRef: React.MutableRefObject<(() => void) | null>;
  hasExternalBatchRegenerateRef: React.MutableRefObject<boolean>;

  // Callback refs for node operations
  regenerateCharacterRef: React.MutableRefObject<((index: number, newPrompt?: string) => void) | undefined>;
  uploadCharacterRef: React.MutableRefObject<((index: number, file: File) => void) | undefined>;
  regenerateSceneRef: React.MutableRefObject<((index: number, newPrompt?: string) => void) | undefined>;
  uploadSceneRef: React.MutableRefObject<((index: number, file: File) => void) | undefined>;
  regenerateVideoRef: React.MutableRefObject<((index: number, newPrompt?: string) => void) | undefined>;
  regenerateVideoWithModelRef: React.MutableRefObject<((index: number, modelId: VideoModelId, mode?: VideoGenerationMode) => void) | undefined>;
  addSceneRef: React.MutableRefObject<(() => void) | null>;

  // Callbacks
  handlePreview: (content: PreviewContent) => void;
  handleSaveScript: (text: string) => void;
  relayoutNodes: () => void;
  addLog: (type: WorkflowLog['type'], msg: string) => void;
  setCurrentHistoryId: (id: number | null, type?: 'image-gen' | 'workflow') => void;
}

export interface WorkflowHistoryReturn {
  loadFromHistory: (historyData: HistoryData) => void;
}

export function useWorkflowHistory({
  setVideoUrl,
  setScriptResult,
  setCharacters,
  setScenes,
  setVideoItems,
  setMergedVideoUrl,
  setNodes,
  setEdges,
  setIsRunning,
  setWaitingForContinue,
  setLogs,
  abortRef,
  pollingRef,
  continueResolveRef,
  batchRegenerateCharactersRef,
  batchRegenerateScenesRef,
  hasExternalBatchRegenerateRef,
  regenerateCharacterRef,
  uploadCharacterRef,
  regenerateSceneRef,
  uploadSceneRef,
  regenerateVideoRef,
  regenerateVideoWithModelRef,
  addSceneRef,
  handlePreview,
  handleSaveScript,
  relayoutNodes,
  addLog,
  setCurrentHistoryId,
}: WorkflowHistoryParams): WorkflowHistoryReturn {
  // Load data from history
  const loadFromHistory = useCallback((historyData: HistoryData) => {
    // Set current history ID if provided
    if (historyData.historyId) {
      setCurrentHistoryId(historyData.historyId, 'workflow');
    }

    // Override batch regenerate refs if external callbacks provided
    if (historyData.onBatchRegenerateCharacters) {
      batchRegenerateCharactersRef.current = historyData.onBatchRegenerateCharacters;
      hasExternalBatchRegenerateRef.current = true;
    }
    if (historyData.onBatchRegenerateScenes) {
      batchRegenerateScenesRef.current = historyData.onBatchRegenerateScenes;
      hasExternalBatchRegenerateRef.current = true;
    }

    // Clear current state
    abortRef.current = true;
    Object.keys(pollingRef.current).forEach((key) => {
      pollingRef.current[key] = false;
    });
    if (continueResolveRef.current) {
      continueResolveRef.current();
      continueResolveRef.current = null;
    }
    setWaitingForContinue(false);
    setIsRunning(false);
    setLogs([]);

    // Set video URL
    if (historyData.videoUrl) {
      setVideoUrl(historyData.videoUrl);
    }

    // Set script result
    if (historyData.scriptResult) {
      setScriptResult(historyData.scriptResult);
    }

    // Update state arrays
    if (historyData.characters && historyData.characters.length > 0) {
      setCharacters(historyData.characters);
    }
    if (historyData.scenes && historyData.scenes.length > 0) {
      setScenes(historyData.scenes);
    }
    if (historyData.videos && historyData.videos.length > 0) {
      setVideoItems(historyData.videos);
    }
    if (historyData.mergedVideoUrl) {
      setMergedVideoUrl(historyData.mergedVideoUrl);
    }

    // Parse script for node update
    let parsedScript: { scenes: { id: number; imagePrompt: string; videoPrompt?: string }[] } | null = null;
    if (historyData.scriptResult) {
      try {
        parsedScript = parseScriptResult(historyData.scriptResult);
      } catch {
        // Ignore parse errors
      }
    }

    // Create save handler with backend sync
    const handleSaveScriptWithSync = (newText: string) => {
      handleSaveScript(newText);
      if (historyData.onSaveScript) {
        try {
          const parsedNew = parseScriptResult(newText);
          const scriptData = {
            characters: parsedNew.characters.map(c => ({
              name: c.name,
              description: c.description,
              imagePrompt: c.imagePrompt,
              RoleimagePrompt: c.imagePrompt,
            })),
            scenes: parsedNew.scenes.map(s => ({
              id: s.id,
              imagePrompt: s.imagePrompt,
              videoPrompt: s.videoPrompt || '',
            })),
          };
          historyData.onSaveScript(scriptData);
        } catch (e) {
          console.error('Failed to sync script to backend:', e);
        }
      }
    };

    // Build all nodes in a single setNodes call
    setNodes((currentNodes) => {
      const baseNodes = currentNodes.filter((node) =>
        !node.id.startsWith('char-') &&
        !node.id.startsWith('scene-') &&
        !node.id.startsWith('vid-')
      );

      const updatedBaseNodes = baseNodes.map((node) => {
        // Update input node
        if (node.id === 'input') {
          if (historyData.videoUrl && historyData.videoUrl.trim()) {
            return {
              ...node,
              type: 'videoNode',
              data: {
                ...node.data,
                status: 'success' as NodeStatus,
                description: 'Video input',
                videoUrl: historyData.videoUrl,
                onPreview: handlePreview,
              },
            };
          }
          return {
            ...node,
            data: {
              ...node.data,
              status: historyData.videoUrl ? 'success' as NodeStatus : 'pending' as NodeStatus,
              description: historyData.videoUrl ? 'Video input' : 'Waiting for video',
            },
          };
        }

        // Update script node
        if (node.id === 'script' && historyData.scriptResult && parsedScript) {
          return {
            ...node,
            data: {
              ...node.data,
              status: 'success' as NodeStatus,
              description: `${parsedScript.scenes.length} storyboards`,
              onPreview: handlePreview,
              previewData: {
                type: 'text' as const,
                text: historyData.scriptResult,
                title: 'Script Analysis Result',
                editable: true,
                onSaveText: handleSaveScriptWithSync,
              },
            },
          };
        }

        // Update characters node
        if (node.id === 'characters' && historyData.characters && historyData.characters.length > 0) {
          return {
            ...node,
            data: {
              ...node.data,
              status: 'success' as NodeStatus,
              description: `${historyData.characters.length} characters`,
              onBatchRegenerate: () => batchRegenerateCharactersRef.current?.(),
            },
          };
        }

        // Update scenes node
        if (node.id === 'scenes' && historyData.scenes && historyData.scenes.length > 0) {
          return {
            ...node,
            data: {
              ...node.data,
              status: 'success' as NodeStatus,
              description: `${historyData.scenes.length} storyboards`,
              onBatchRegenerate: () => batchRegenerateScenesRef.current?.(),
              onAddScene: () => addSceneRef.current?.(),
            },
          };
        }

        // Update videos node
        if (node.id === 'videos' && historyData.videos && historyData.videos.length > 0) {
          return {
            ...node,
            data: {
              ...node.data,
              status: 'success' as NodeStatus,
              description: `${historyData.videos.length} videos`,
            },
          };
        }

        // Update output node
        if (node.id === 'output') {
          if (historyData.mergedVideoUrl) {
            return {
              ...node,
              type: 'videoNode',
              data: {
                ...node.data,
                label: 'Final Output',
                status: 'success' as NodeStatus,
                description: 'Merged video',
                videoUrl: historyData.mergedVideoUrl,
                onPreview: handlePreview,
                onRetryMerge: historyData.onRetryMerge,
              },
            };
          } else if (historyData.workflowStage === 'merging' && historyData.workflowStatus === 'running') {
            return {
              ...node,
              data: {
                ...node.data,
                status: 'running' as NodeStatus,
                description: 'Merging videos...',
              },
            };
          } else if (historyData.videos && historyData.videos.some(v => v.status === 'done')) {
            return {
              ...node,
              type: 'workflowNode',
              data: {
                ...node.data,
                label: 'Final Output',
                status: 'error' as NodeStatus,
                description: 'Merge incomplete',
                onRetryMerge: historyData.onRetryMerge,
              },
            };
          }
        }

        return node;
      });

      // Build dynamic nodes
      const dynamicNodes: Node<AnyNodeData>[] = [];

      // Add character nodes
      if (historyData.characters && historyData.characters.length > 0) {
        console.log('[LoadFromHistory] Building character nodes:', historyData.characters.map((c, i) => ({
          index: i,
          name: c.name,
          status: c.status,
          nodeStatus: getCharacterNodeStatus(c.status),
        })));
        historyData.characters.forEach((char, index) => {
          const nodeId = `char-${index}`;
          const onRetry = historyData.onRetryCharacter
            ? () => historyData.onRetryCharacter!(index)
            : () => regenerateCharacterRef.current?.(index);
          const onUpload = historyData.onUploadCharacter
            ? (file: File) => historyData.onUploadCharacter!(index, file)
            : (file: File) => uploadCharacterRef.current?.(index, file);
          const onEditPrompt = historyData.onRetryCharacter
            ? (newPrompt: string) => historyData.onRetryCharacter!(index, newPrompt)
            : (newPrompt: string) => regenerateCharacterRef.current?.(index, newPrompt);
          const onRegenerateWithModel = historyData.onRetryCharacterWithModel
            ? (modelId: string, size?: string, aspectRatio?: string, newPrompt?: string) => historyData.onRetryCharacterWithModel!(index, newPrompt, modelId, size, aspectRatio)
            : undefined;

          dynamicNodes.push({
            id: nodeId,
            type: 'characterNode',
            position: { x: LAYOUT.CHARACTERS_X, y: LAYOUT.SUB_START_Y + index * LAYOUT.SUB_SPACING_Y },
            data: {
              label: char.name,
              status: getCharacterNodeStatus(char.status),
              imageUrl: char.imageUrl,
              prompt: char.imagePrompt,
              error: char.error,
              onPreview: handlePreview,
              onRegenerate: onRetry,
              onUpload,
              onEditPrompt,
              onRegenerateWithModel,
            },
          });
        });
      }

      // Add scene nodes
      if (historyData.scenes && historyData.scenes.length > 0) {
        historyData.scenes.forEach((scene, index) => {
          const nodeId = `scene-${index}`;
          const onRetry = historyData.onRetryScene
            ? () => historyData.onRetryScene!(index)
            : () => regenerateSceneRef.current?.(index);
          const onEditPrompt = historyData.onRetrySceneWithModel
            ? (newPrompt: string) => historyData.onRetrySceneWithModel!(index, newPrompt)
            : undefined;
          const onRegenerateWithModel = historyData.onRetrySceneWithModel
            ? (modelId: string, size?: string, aspectRatio?: string) => historyData.onRetrySceneWithModel!(index, undefined, undefined, modelId, size, aspectRatio)
            : undefined;
          // Upload callback - use ref
          const onUpload = (file: File) => uploadSceneRef.current?.(index, file);

          dynamicNodes.push({
            id: nodeId,
            type: 'sceneNode',
            position: { x: LAYOUT.SCENES_X, y: LAYOUT.SUB_START_Y + index * LAYOUT.SUB_SPACING_Y },
            data: {
              label: `Scene ${scene.id}`,
              status: getSceneNodeStatus(scene.imageStatus),
              imageUrl: scene.imageUrl,
              prompt: scene.imagePrompt,
              error: scene.error,
              onPreview: handlePreview,
              onRegenerate: onRetry,
              onEditPrompt,
              onRegenerateWithModel,
              onUpload,
            },
          });
        });
      }

      // Add video nodes
      if (historyData.videos && historyData.videos.length > 0) {
        historyData.videos.forEach((video, index) => {
          const nodeId = `vid-${index}`;
          const onRetry = historyData.onRetryVideo
            ? () => historyData.onRetryVideo!(index)
            : () => regenerateVideoRef.current?.(index);

          // Use external callback for model selection if available, otherwise use local ref
          const onRegenerateWithModelFn = historyData.onRetryVideoWithModel
            ? (modelId: VideoModelId, mode?: VideoGenerationMode) => historyData.onRetryVideoWithModel!(index, modelId, mode)
            : (modelId: VideoModelId, mode?: VideoGenerationMode) => regenerateVideoWithModelRef.current?.(index, modelId, mode);

          dynamicNodes.push({
            id: nodeId,
            type: 'videoNode',
            position: { x: LAYOUT.VIDEOS_X, y: LAYOUT.SUB_START_Y + index * LAYOUT.SUB_SPACING_Y },
            data: {
              label: `Video ${index + 1}`,
              status: getVideoNodeStatus(video.status),
              videoUrl: video.videoUrl,
              prompt: video.prompt,
              error: video.error,
              onPreview: handlePreview,
              onRegenerate: onRetry,
              onEditPrompt: (newPrompt: string) => regenerateVideoRef.current?.(index, newPrompt),
              onRegenerateWithModel: onRegenerateWithModelFn,
            },
          });
        });
      }

      return [...updatedBaseNodes, ...dynamicNodes];
    });

    // Update edges in a single call
    setEdges((currentEdges) => {
      const baseEdges = currentEdges.filter((edge) =>
        !edge.source.startsWith('char-') &&
        !edge.target.startsWith('char-') &&
        !edge.source.startsWith('scene-') &&
        !edge.target.startsWith('scene-') &&
        !edge.source.startsWith('vid-') &&
        !edge.target.startsWith('vid-')
      );

      const dynamicEdges: Edge[] = [];

      // Add character edges
      if (historyData.characters && historyData.characters.length > 0) {
        historyData.characters.forEach((_, index) => {
          const edgeId = index === 0 ? `e-characters-char-${index}` : `e-char-${index - 1}-char-${index}`;
          const sourceId = index === 0 ? 'characters' : `char-${index - 1}`;
          dynamicEdges.push({
            id: edgeId,
            source: sourceId,
            target: `char-${index}`,
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#475569', strokeWidth: 2 },
          });
        });
      }

      // Add scene edges
      if (historyData.scenes && historyData.scenes.length > 0) {
        historyData.scenes.forEach((_, index) => {
          const edgeId = index === 0 ? `e-scenes-scene-${index}` : `e-scene-${index - 1}-scene-${index}`;
          const sourceId = index === 0 ? 'scenes' : `scene-${index - 1}`;
          dynamicEdges.push({
            id: edgeId,
            source: sourceId,
            target: `scene-${index}`,
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#475569', strokeWidth: 2 },
          });
        });
      }

      // Add video edges
      if (historyData.videos && historyData.videos.length > 0) {
        historyData.videos.forEach((_, index) => {
          const edgeId = index === 0 ? `e-videos-vid-${index}` : `e-vid-${index - 1}-vid-${index}`;
          const sourceId = index === 0 ? 'videos' : `vid-${index - 1}`;
          dynamicEdges.push({
            id: edgeId,
            source: sourceId,
            target: `vid-${index}`,
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#475569', strokeWidth: 2 },
          });
        });
      }

      return [...baseEdges, ...dynamicEdges];
    });

    // Relayout after a short delay
    setTimeout(() => {
      relayoutNodes();
    }, 100);

    addLog('info', 'Data loaded from history');
  }, [
    handlePreview,
    handleSaveScript,
    relayoutNodes,
    addLog,
    setNodes,
    setEdges,
    setVideoUrl,
    setScriptResult,
    setCharacters,
    setScenes,
    setVideoItems,
    setMergedVideoUrl,
    setIsRunning,
    setWaitingForContinue,
    setLogs,
    setCurrentHistoryId,
    abortRef,
    pollingRef,
    continueResolveRef,
    batchRegenerateCharactersRef,
    batchRegenerateScenesRef,
    hasExternalBatchRegenerateRef,
    regenerateCharacterRef,
    uploadCharacterRef,
    regenerateSceneRef,
    uploadSceneRef,
    regenerateVideoRef,
    regenerateVideoWithModelRef,
    addSceneRef,
  ]);

  return {
    loadFromHistory,
  };
}
