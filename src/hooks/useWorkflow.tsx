'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Video, CheckCircle } from 'lucide-react';
import type {
  VideoItem,
  NodeStatus,
  WorkflowNodeData,
  VideoNodeData,
  PreviewContent,
  CharacterItem,
  SceneItem,
  ScriptResult,
  VideoModelId,
  VideoGenerationMode,
} from '@/types/workflow';
import { MAX_RETRIES, RETRY_DELAY } from '@/constants/workflow';
import {
  generateScriptAPI,
  parseScriptResult,
  cleanMarkdownCodeBlock,
  uploadVideoToOSS,
  submitVideoTaskAPI,
  pollVideoResultAPI,
  mergeVideosAPI,
  uploadToOSS,
} from '@/services/api';
import { useHistoryDB } from './useHistoryDB';
import {
  useWorkflowState,
  useWorkflowNodes,
  useWorkflowGeneration,
  useWorkflowHistory,
  createInitialNodes,
  createInitialEdges,
  LAYOUT,
  type HistoryData,
} from './workflow';

export function useWorkflow() {
  // Use modular state hook
  const state = useWorkflowState();

  const {
    stage,
    setStage,
    isRunning,
    setIsRunning,
    isAutoMode,
    setIsAutoMode,
    waitingForContinue,
    setWaitingForContinue,
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
    logs,
    setLogs,
    nodes,
    setNodes,
    edges,
    setEdges,
    onNodesChange,
    onEdgesChange,
    previewContent,
    handlePreview,
    closePreview,
    addLog,
    scenesRef,
    charactersRef,
    scriptResultRef,
    videoItemsRef,
    pollingRef,
    abortRef,
    continueResolveRef,
    waitForContinue,
    continueWorkflow,
  } = state;

  // Sync refs
  scenesRef.current = scenes;
  charactersRef.current = characters;
  scriptResultRef.current = scriptResult;
  videoItemsRef.current = videoItems;

  // History DB hook
  const { saveHistory, updateHistory, clearRunningHistory, getRunningHistory, setCurrentHistoryId } = useHistoryDB();

  // Use modular nodes hook
  const nodesHook = useWorkflowNodes({
    nodes,
    setNodes,
    edges,
    setEdges,
    handlePreview,
  });

  const {
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
  } = nodesHook;

  // Use modular generation hook
  const generationHook = useWorkflowGeneration({
    charactersRef,
    scenesRef,
    videoItemsRef,
    scriptResultRef,
    pollingRef,
    abortRef,
    setCharacters,
    setScenes,
    setVideoItems,
    selectedModel,
    videoGenerationMode,
    imageSize,
    addCharacterNode,
    addSceneNode,
    addVideoNode,
    updateNodeStatus,
    addLog,
    updateHistory,
  });

  const {
    generateTextToImage,
    generateImageToEdit,
    regenerateCharacterImage,
    regenerateCharacterImageWithModel,
    uploadCharacterImage,
    regenerateSceneImage,
    regenerateSceneImageWithModel,
    uploadSceneImage,
    regenerateVideo,
    regenerateVideoWithModel,
    batchRegenerateCharacters,
    batchRegenerateScenes,
  } = generationHook;

  // Set generation refs to node callbacks
  regenerateCharacterRef.current = regenerateCharacterImage;
  regenerateCharacterWithModelRef.current = regenerateCharacterImageWithModel;
  uploadCharacterRef.current = uploadCharacterImage;
  regenerateSceneRef.current = regenerateSceneImage;
  regenerateSceneWithModelRef.current = regenerateSceneImageWithModel;
  uploadSceneRef.current = uploadSceneImage;
  regenerateVideoRef.current = regenerateVideo;
  regenerateVideoWithModelRef.current = regenerateVideoWithModel;

  // External callback flag
  const hasExternalBatchRegenerateRef = useRef(false);

  // Set batch regenerate refs
  useEffect(() => {
    if (!hasExternalBatchRegenerateRef.current) {
      batchRegenerateCharactersRef.current = batchRegenerateCharacters;
      batchRegenerateScenesRef.current = batchRegenerateScenes;
    }
  }, [batchRegenerateCharacters, batchRegenerateScenes, batchRegenerateCharactersRef, batchRegenerateScenesRef]);

  // Add new scene function
  const addNewScene = useCallback(() => {
    const currentScenes = scenesRef.current;
    const newId = currentScenes.length > 0 ? Math.max(...currentScenes.map(s => s.id)) + 1 : 1;

    const newScene: SceneItem = {
      id: newId,
      imagePrompt: '',
      videoPrompt: '',
      imageStatus: 'pending',
      videoStatus: 'pending',
    };

    const newIndex = currentScenes.length;

    setScenes((prev) => {
      const updated = [...prev, newScene];
      // Update history
      updateHistory({ scenes: updated });
      return updated;
    });

    // Add the new scene node
    addSceneNode(newScene, newIndex);

    // Relayout nodes to accommodate new scene
    relayoutNodes();

    addLog('info', `Added new scene ${newId}`);
  }, [setScenes, addSceneNode, relayoutNodes, addLog, updateHistory]);

  // Set addSceneRef
  addSceneRef.current = addNewScene;

  // Use modular history hook
  const historyHook = useWorkflowHistory({
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
    handleSaveScript: (text: string) => handleSaveScript(text),
    relayoutNodes,
    addLog,
    setCurrentHistoryId,
  });

  const { loadFromHistory: loadFromHistoryInternal } = historyHook;

  // Delay function
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Save edited script
  const handleSaveScript = useCallback((newText: string) => {
    try {
      const parsed = parseScriptResult(newText);
      if (parsed.scenes.length === 0) {
        addLog('warning', 'Edited script could not be parsed, keeping original data');
        return;
      }

      setScriptResult(newText);
      setCharacters(parsed.characters);
      setScenes(parsed.scenes);

      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === 'script') {
            const currentData = node.data as WorkflowNodeData;
            return {
              ...node,
              data: {
                ...currentData,
                description: `${parsed.scenes.length} storyboards`,
                previewData: {
                  type: 'text' as const,
                  text: newText,
                  title: 'Script Analysis Result',
                  editable: true,
                  onSaveText: (text: string) => handleSaveScript(text),
                },
              },
            };
          }
          return node;
        })
      );

      updateHistory({ scriptResult: newText });
      addLog('success', `Script updated, parsed ${parsed.characters.length} characters and ${parsed.scenes.length} storyboards`);
    } catch (error) {
      const err = error as Error;
      addLog('error', `Script parsing failed: ${err.message}`);
    }
  }, [addLog, updateHistory, setScriptResult, setCharacters, setScenes, setNodes]);

  // Upload video to OSS
  const handleVideoUpload = useCallback(async (file: File): Promise<string> => {
    addLog('info', 'Uploading video to OSS...');
    try {
      const url = await uploadVideoToOSS(file);
      addLog('success', 'Video uploaded successfully');
      return url;
    } catch (error) {
      const err = error as Error;
      addLog('error', `Video upload failed: ${err.message}`);
      throw error;
    }
  }, [addLog]);

  // Generate script
  const generateScript = async (): Promise<ScriptResult | null> => {
    addLog('info', 'Starting video analysis, generating script...');
    setStage('script');
    updateNodeStatus('script', 'running', 'Analyzing video...');

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (abortRef.current) return null;

      try {
        if (attempt > 1) {
          addLog('info', `Retry attempt ${attempt}...`);
          updateNodeStatus('script', 'running', `Retrying (${attempt}/${MAX_RETRIES})`);
        }

        const textContent = await generateScriptAPI(videoUrl, scriptPrompt);
        const cleanedContent = cleanMarkdownCodeBlock(textContent);
        setScriptResult(cleanedContent);

        const parsed = parseScriptResult(cleanedContent);
        if (parsed.scenes.length === 0) {
          lastError = new Error('Failed to parse storyboard prompts');
          addLog('warning', `Attempt ${attempt}: Failed to parse storyboard prompts`);
          if (attempt < MAX_RETRIES) {
            await delay(RETRY_DELAY);
            continue;
          }
        } else {
          setCharacters(parsed.characters);
          setScenes(parsed.scenes);

          addLog('success', `Script generated, parsed ${parsed.characters.length} characters and ${parsed.scenes.length} storyboards`);
          await updateHistory({ scriptResult: cleanedContent });

          setNodes((nds) =>
            nds.map((node) => {
              if (node.id === 'script') {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    status: 'success' as NodeStatus,
                    description: `${parsed.scenes.length} storyboards`,
                    onPreview: handlePreview,
                    previewData: {
                      type: 'text' as const,
                      text: cleanedContent,
                      title: 'Script Analysis Result',
                      editable: true,
                      onSaveText: handleSaveScript,
                    },
                  },
                };
              }
              return node;
            })
          );
          updateEdgeAnimation('script', false);

          return parsed;
        }
      } catch (error: unknown) {
        const err = error as Error;
        lastError = err;
        addLog('warning', `Attempt ${attempt} failed: ${err.message}`);

        if (attempt < MAX_RETRIES) {
          await delay(RETRY_DELAY);
        }
      }
    }

    addLog('error', `Script generation failed (retried ${MAX_RETRIES} times): ${lastError?.message}`);
    updateNodeStatus('script', 'error', lastError?.message || 'Generation failed');
    return null;
  };

  // Generate character reference images
  const generateCharacterImages = async (chars: CharacterItem[]): Promise<CharacterItem[]> => {
    if (chars.length === 0) {
      addLog('info', 'No characters need reference images');
      updateNodeStatus('characters', 'success', 'No characters');
      return [];
    }

    addLog('info', `Starting parallel generation of ${chars.length} character reference images`);
    setStage('characters');
    updateNodeStatus('characters', 'running', 'Generating character references...');

    const updatingChars = chars.map((char) => ({
      ...char,
      status: 'generating' as const,
    }));
    setCharacters(updatingChars);
    updatingChars.forEach((char, i) => {
      addCharacterNode(char, i);
    });

    const generateSingleCharacter = async (char: CharacterItem, index: number): Promise<CharacterItem> => {
      if (abortRef.current) {
        return { ...char, status: 'error' as const, error: 'Cancelled' };
      }

      addLog('info', `Generating reference image for character ${char.name}...`);

      try {
        const imageUrl = await generateTextToImage(char.imagePrompt, '1:1');
        const ossUrl = await uploadToOSS(imageUrl, `char-${index}.png`);

        const updatedChar = { ...char, status: 'done' as const, imageUrl, ossUrl };

        setCharacters((prev) => {
          const newChars = [...prev];
          newChars[index] = updatedChar;
          return newChars;
        });
        addCharacterNode(updatedChar, index);

        addLog('success', `Character ${char.name} reference image generated`);
        return updatedChar;
      } catch (error) {
        const err = error as Error;
        const errorChar = { ...char, status: 'error' as const, error: err.message };

        setCharacters((prev) => {
          const newChars = [...prev];
          newChars[index] = errorChar;
          return newChars;
        });
        addCharacterNode(errorChar, index);

        addLog('error', `Character ${char.name} reference image generation failed: ${err.message}`);
        return errorChar;
      }
    };

    const results = await Promise.all(
      chars.map((char, index) => generateSingleCharacter(char, index))
    );

    const successCount = results.filter((c) => c.status === 'done').length;
    updateNodeStatus('characters', successCount > 0 ? 'success' : 'error', `${successCount}/${chars.length} completed`);

    return results.filter((c) => c.status === 'done');
  };

  // Generate storyboard images
  const generateSceneImages = async (
    sceneList: SceneItem[],
    characterImages: CharacterItem[]
  ): Promise<SceneItem[]> => {
    addLog('info', `Starting parallel generation of ${sceneList.length} storyboard images`);
    setStage('images');
    updateNodeStatus('scenes', 'running', 'Generating storyboards...');

    const charImageUrls = charactersRef.current
      .filter((c) => c.ossUrl)
      .map((c) => c.ossUrl!);

    if (charImageUrls.length > 0) {
      addLog('info', `Using ${charImageUrls.length} latest character reference images`);
    } else {
      addLog('info', 'No character references found, will use text-to-image');
    }

    const updatingScenes = sceneList.map((scene) => ({
      ...scene,
      imageStatus: 'generating' as const,
    }));
    setScenes(updatingScenes);
    updatingScenes.forEach((scene, i) => {
      addSceneNode(scene, i);
    });

    const generateSingleScene = async (scene: SceneItem, index: number): Promise<SceneItem> => {
      if (abortRef.current) {
        return { ...scene, imageStatus: 'error' as const, error: 'Cancelled' };
      }

      addLog('info', `Generating storyboard ${scene.id}...`);

      try {
        let imageUrl: string;

        if (charImageUrls.length > 0) {
          imageUrl = await generateImageToEdit(charImageUrls, scene.imagePrompt, '9:16');
        } else {
          imageUrl = await generateTextToImage(scene.imagePrompt, '9:16');
        }

        const ossUrl = await uploadToOSS(imageUrl, `scene-${index}.png`);

        const updatedScene = { ...scene, imageStatus: 'done' as const, imageUrl, ossUrl };

        setScenes((prev) => {
          const newScenes = [...prev];
          newScenes[index] = updatedScene;
          return newScenes;
        });
        addSceneNode(updatedScene, index);

        addLog('success', `Storyboard ${scene.id} generated`);
        return updatedScene;
      } catch (error) {
        const err = error as Error;
        const errorScene = { ...scene, imageStatus: 'error' as const, error: err.message };

        setScenes((prev) => {
          const newScenes = [...prev];
          newScenes[index] = errorScene;
          return newScenes;
        });
        addSceneNode(errorScene, index);

        addLog('error', `Storyboard ${scene.id} generation failed: ${err.message}`);
        return errorScene;
      }
    };

    const results = await Promise.all(
      sceneList.map((scene, index) => generateSingleScene(scene, index))
    );

    const successCount = results.filter((s) => s.imageStatus === 'done').length;
    updateNodeStatus('scenes', successCount >= 2 ? 'success' : 'error', `${successCount}/${sceneList.length} completed`);

    return results.filter((s) => s.imageStatus === 'done');
  };

  // Generate videos
  const generateVideos = async (): Promise<VideoItem[]> => {
    const latestScenes = scenesRef.current.filter(s => s.imageStatus === 'done' && s.ossUrl);

    if (latestScenes.length < 1) {
      addLog('error', 'At least 1 image required to generate videos');
      updateNodeStatus('videos', 'error', 'Insufficient images');
      return [];
    }

    let latestVideoPrompts: string[] = [];
    if (scriptResultRef.current) {
      try {
        const parsed = parseScriptResult(scriptResultRef.current);
        latestVideoPrompts = parsed.scenes.map(s => s.videoPrompt);
        addLog('info', 'Got latest video prompts from script analysis result');
      } catch {
        addLog('warning', 'Failed to parse script for video prompts, using storyboard data prompts');
      }
    }

    addLog('info', `Starting parallel generation of ${latestScenes.length} video segments`);
    addLog('info', `Video generation mode: ${videoGenerationMode === 'first-last-frame' ? 'first-last frame' : 'single image'}`);
    setStage('videos');
    updateNodeStatus('videos', 'running', 'Generating videos...');

    const videos: VideoItem[] = [];
    for (let i = 0; i < latestScenes.length; i++) {
      const scene = latestScenes[i];
      const nextScene = latestScenes[i + 1];
      const videoPrompt = latestVideoPrompts[i] || scene.videoPrompt || `Scene ${i + 1} animation`;

      videos.push({
        id: `video${i + 1}`,
        index: i,
        prompt: videoPrompt,
        firstFrame: scene.ossUrl!,
        lastFrame: videoGenerationMode === 'first-last-frame' ? nextScene?.ossUrl : undefined,
        status: 'submitting',
      });
    }

    setVideoItems(videos);
    videos.forEach((video, i) => {
      addVideoNode(video, i);
    });

    const generateSingleVideo = async (video: VideoItem, index: number): Promise<VideoItem> => {
      if (abortRef.current) {
        return { ...video, status: 'error' as const, error: 'Cancelled' };
      }

      addLog('info', `Generating video ${video.id}...`);

      try {
        const { taskId, error: submitError } = await submitVideoTaskAPI(video, selectedModel);

        if (!taskId) {
          throw new Error(submitError || 'Submit failed');
        }

        const pollingVideo = { ...video, status: 'polling' as const, taskId };
        setVideoItems((prev) => {
          const newVideos = [...prev];
          newVideos[index] = pollingVideo;
          return newVideos;
        });
        addVideoNode(pollingVideo, index);

        pollingRef.current[taskId] = true;
        const { videoUrl, error: pollError } = await pollVideoResultAPI(
          taskId,
          () => pollingRef.current[taskId] && !abortRef.current
        );
        delete pollingRef.current[taskId];

        if (!videoUrl) {
          throw new Error(pollError || 'Video generation failed');
        }

        const updatedVideo = { ...video, status: 'done' as const, taskId, videoUrl };
        setVideoItems((prev) => {
          const newVideos = [...prev];
          newVideos[index] = updatedVideo;
          return newVideos;
        });
        addVideoNode(updatedVideo, index);

        addLog('success', `Video ${video.id} generated`);
        return updatedVideo;
      } catch (error) {
        const err = error as Error;
        const errorVideo = { ...video, status: 'error' as const, error: err.message };
        setVideoItems((prev) => {
          const newVideos = [...prev];
          newVideos[index] = errorVideo;
          return newVideos;
        });
        addVideoNode(errorVideo, index);

        addLog('error', `Video ${video.id} generation failed: ${err.message}`);
        return errorVideo;
      }
    };

    const results = await Promise.all(
      videos.map((video, index) => generateSingleVideo(video, index))
    );

    const successCount = results.filter((v) => v.status === 'done').length;
    updateNodeStatus('videos', successCount > 0 ? 'success' : 'error', `${successCount}/${videos.length} completed`);

    return results.filter((v) => v.status === 'done');
  };

  // Merge videos
  const mergeVideos = async (): Promise<string | null> => {
    const completedVideos = videoItemsRef.current.filter((v) => v.status === 'done' && v.videoUrl);

    if (completedVideos.length === 0) {
      addLog('error', 'No videos available for merging');
      return null;
    }

    addLog('info', `Starting to merge ${completedVideos.length} videos...`);
    setStage('merging');
    updateNodeStatus('output', 'running', 'Merging videos...');

    const videoUrls = completedVideos
      .sort((a, b) => a.index - b.index)
      .map((v) => v.videoUrl!)
      .filter(Boolean);

    if (videoUrls.length === 0) {
      addLog('error', 'No valid video URLs');
      updateNodeStatus('output', 'error', 'Merge failed');
      return null;
    }

    let lastError: string | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (abortRef.current) {
        updateNodeStatus('output', 'error', 'Cancelled');
        return null;
      }

      try {
        if (attempt > 1) {
          addLog('info', `Retry merge attempt ${attempt}...`);
        }

        const result = await mergeVideosAPI(videoUrls);

        if (result.success && result.videoUrl) {
          setMergedVideoUrl(result.videoUrl);
          updateOutputNodeWithVideo(result.videoUrl);
          addLog('success', 'Video merge complete');
          return result.videoUrl;
        } else {
          lastError = result.error || 'Merge failed';
          if (attempt < MAX_RETRIES) {
            addLog('warning', `Merge failed, retry attempt ${attempt}...`);
            await delay(RETRY_DELAY);
          }
        }
      } catch (error) {
        const err = error as Error;
        lastError = err.message;
        if (attempt < MAX_RETRIES) {
          addLog('warning', `Merge error, retry attempt ${attempt}...`);
          await delay(RETRY_DELAY);
        }
      }
    }

    addLog('error', `Video merge failed (retried ${MAX_RETRIES} times): ${lastError}`);
    updateOutputNodeWithError(lastError || 'Merge failed');
    return null;
  };

  // Retry merge videos
  const retryMergeVideos = useCallback(async () => {
    const completedVideos = videoItemsRef.current.filter((v) => v.status === 'done' && v.videoUrl);
    if (completedVideos.length === 0) {
      addLog('warning', 'No completed videos available for merging');
      return;
    }

    addLog('info', `Re-merging ${completedVideos.length} videos...`);
    setStage('merging');
    updateNodeStatus('output', 'running', 'Re-merging...');

    const videoUrls = completedVideos
      .sort((a, b) => a.index - b.index)
      .map((v) => v.videoUrl!)
      .filter(Boolean);

    if (videoUrls.length === 0) {
      addLog('error', 'No valid video URLs');
      updateNodeStatus('output', 'error', 'Merge failed');
      return;
    }

    try {
      const result = await mergeVideosAPI(videoUrls);

      if (result.success && result.videoUrl) {
        setMergedVideoUrl(result.videoUrl);
        updateOutputNodeWithVideo(result.videoUrl);
        addLog('success', 'Video re-merge complete');
        setStage('completed');
        await updateHistory({
          mergedVideoUrl: result.videoUrl,
          status: 'completed',
        });
      } else {
        addLog('error', `Video merge failed: ${result.error || 'Unknown error'}`);
        updateOutputNodeWithError(result.error || 'Merge failed');
      }
    } catch (error) {
      const err = error as Error;
      addLog('error', `Video merge error: ${err.message}`);
      updateOutputNodeWithError(err.message);
    }
  }, [addLog, updateNodeStatus, updateOutputNodeWithVideo, updateOutputNodeWithError, updateHistory, setStage, setMergedVideoUrl]);

  // Set retry merge videos ref
  retryMergeVideosRef.current = retryMergeVideos;

  // Main workflow
  const runWorkflow = async () => {
    if (!videoUrl.trim()) {
      addLog('warning', 'Please enter video URL or upload a video');
      return;
    }

    setIsRunning(true);
    abortRef.current = false;
    setLogs([]);
    setScriptResult('');
    setCharacters([]);
    setScenes([]);
    setVideoItems([]);
    setMergedVideoUrl('');

    clearDynamicNodes();

    updateNodeStatus('input', 'success', 'Video input');
    updateNodeStatus('script', 'pending', 'Generate storyboard prompts');
    updateNodeStatus('characters', 'pending', 'Generate character references');
    updateNodeStatus('scenes', 'pending', 'Generate storyboards');
    updateNodeStatus('videos', 'pending', 'Generate videos from frames');
    updateNodeStatus('output', 'pending', 'Workflow complete');

    addLog('info', 'Workflow started');
    addLog('info', isAutoMode ? '[Auto mode] Will complete all steps automatically' : '[Manual mode] Manual continue required after each step');

    const title = `Workflow ${new Date().toLocaleString('en-US')}`;
    await saveHistory(title, {
      videoUrl,
      status: 'partial',
    });

    try {
      // 1. Generate script
      const parsed = await generateScript();
      if (!parsed || parsed.scenes.length === 0 || abortRef.current) {
        throw new Error('Script generation failed or no storyboards parsed');
      }
      await updateHistory({ scriptResult: scriptResultRef.current });
      await waitForContinue('Script analysis');
      if (abortRef.current) return;

      // 2. Generate character reference images
      const completedCharacters = await generateCharacterImages(parsed.characters);
      relayoutNodes();
      await updateHistory({ characters: completedCharacters });
      await waitForContinue('Character reference generation');
      if (abortRef.current) return;

      // 3. Generate storyboard images
      const completedScenes = await generateSceneImages(parsed.scenes, completedCharacters);
      if (completedScenes.length < 1 || abortRef.current) {
        throw new Error('Storyboard image generation failed or insufficient count');
      }
      relayoutNodes();
      await updateHistory({ scenes: completedScenes });
      await waitForContinue('Storyboard image generation');
      if (abortRef.current) return;

      // 4. Generate videos
      const completedVideos = await generateVideos();
      if (completedVideos.length === 0 || abortRef.current) {
        throw new Error('Video generation failed');
      }
      relayoutNodes();
      await updateHistory({ videos: completedVideos });
      await waitForContinue('Video segment generation');
      if (abortRef.current) return;

      // 5. Merge videos
      const mergedUrl = await mergeVideos();
      if (!mergedUrl || abortRef.current) {
        throw new Error('Video merge failed');
      }

      relayoutNodes();
      setStage('completed');
      await updateHistory({
        mergedVideoUrl: mergedUrl,
        status: 'completed',
      });
      addLog('success', 'Workflow complete!');
    } catch (error) {
      if (!abortRef.current) {
        const err = error as Error;
        setStage('error');
        if (err.message !== 'Video merge failed') {
          updateNodeStatus('output', 'error', err.message);
        }
        addLog('error', `Workflow interrupted: ${err.message}`);
        await updateHistory({ status: 'failed' });
      }
    } finally {
      setIsRunning(false);
      setWaitingForContinue(false);
      continueResolveRef.current = null;
    }
  };

  // Start workflow from JSON
  const runWorkflowFromJson = async (jsonStr: string) => {
    let parsed: ScriptResult;
    try {
      const data = JSON.parse(jsonStr);
      const chars: CharacterItem[] = (data.characters || []).map((c: Record<string, unknown>, i: number) => ({
        id: (c.id as string) || `char-${i}`,
        name: (c.name as string) || `Character ${i + 1}`,
        description: (c.description as string) || '',
        imagePrompt: (c.imagePrompt || c.RoleimagePrompt || c.roleImagePrompt || c.prompt || '') as string,
        status: 'pending' as const,
      }));
      const scns: SceneItem[] = (data.scenes || []).map((s: Partial<SceneItem>, i: number) => ({
        id: s.id || i + 1,
        imagePrompt: s.imagePrompt || '',
        videoPrompt: s.videoPrompt || '',
        imageStatus: 'pending' as const,
        videoStatus: 'pending' as const,
      }));
      parsed = { characters: chars, scenes: scns };
    } catch {
      addLog('error', 'JSON parsing failed, please check format');
      return;
    }

    if (parsed.scenes.length === 0) {
      addLog('error', 'No storyboard data found in JSON');
      return;
    }

    setIsRunning(true);
    abortRef.current = false;
    setLogs([]);
    setScriptResult(jsonStr);
    setCharacters([]);
    setScenes([]);
    setVideoItems([]);
    setMergedVideoUrl('');

    clearDynamicNodes();

    updateNodeStatus('input', 'success', 'JSON input');
    updateNodeStatus('script', 'success', `${parsed.scenes.length} storyboards (JSON)`);
    updateNodeStatus('characters', 'pending', 'Generate character references');
    updateNodeStatus('scenes', 'pending', 'Generate storyboards');
    updateNodeStatus('videos', 'pending', 'Generate videos from frames');
    updateNodeStatus('output', 'pending', 'Workflow complete');

    addLog('info', 'Starting workflow from JSON (skipping video analysis)');
    addLog('info', `Parsed ${parsed.characters.length} characters, ${parsed.scenes.length} storyboards`);
    addLog('info', isAutoMode ? '[Auto mode] Will complete all steps automatically' : '[Manual mode] Manual continue required after each step');

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === 'script') {
          return {
            ...node,
            data: {
              ...node.data,
              status: 'success' as NodeStatus,
              description: `${parsed.scenes.length} storyboards (JSON)`,
              onPreview: handlePreview,
              previewData: {
                type: 'text' as const,
                text: jsonStr,
                title: 'JSON Script Data',
                editable: true,
                onSaveText: handleSaveScript,
              },
            },
          };
        }
        return node;
      })
    );

    const title = `Workflow (JSON) ${new Date().toLocaleString('en-US')}`;
    await saveHistory(title, {
      scriptResult: jsonStr,
      status: 'partial',
    });

    try {
      const completedCharacters = await generateCharacterImages(parsed.characters);
      relayoutNodes();
      await updateHistory({ characters: completedCharacters });
      await waitForContinue('Character reference generation');
      if (abortRef.current) return;

      const completedScenes = await generateSceneImages(parsed.scenes, completedCharacters);
      if (completedScenes.length < 1 || abortRef.current) {
        throw new Error('Storyboard image generation failed or insufficient count');
      }
      relayoutNodes();
      await updateHistory({ scenes: completedScenes });
      await waitForContinue('Storyboard image generation');
      if (abortRef.current) return;

      const completedVideos = await generateVideos();
      if (completedVideos.length === 0 || abortRef.current) {
        throw new Error('Video generation failed');
      }
      relayoutNodes();
      await updateHistory({ videos: completedVideos });
      await waitForContinue('Video segment generation');
      if (abortRef.current) return;

      const mergedUrl = await mergeVideos();
      if (!mergedUrl || abortRef.current) {
        throw new Error('Video merge failed');
      }

      relayoutNodes();
      setStage('completed');
      await updateHistory({
        mergedVideoUrl: mergedUrl,
        status: 'completed',
      });
      addLog('success', 'Workflow complete!');
    } catch (error) {
      if (!abortRef.current) {
        const err = error as Error;
        setStage('error');
        if (err.message !== 'Video merge failed') {
          updateNodeStatus('output', 'error', err.message);
        }
        addLog('error', `Workflow interrupted: ${err.message}`);
        await updateHistory({ status: 'failed' });
      }
    } finally {
      setIsRunning(false);
      setWaitingForContinue(false);
      continueResolveRef.current = null;
    }
  };

  // Stop workflow
  const stopWorkflow = useCallback(async () => {
    abortRef.current = true;
    Object.keys(pollingRef.current).forEach((key) => {
      pollingRef.current[key] = false;
    });
    if (continueResolveRef.current) {
      continueResolveRef.current();
      continueResolveRef.current = null;
    }
    setWaitingForContinue(false);
    addLog('warning', 'Workflow stopped');
    setIsRunning(false);
    clearRunningHistory();
    await updateHistory({ status: 'stopped' });
  }, [addLog, clearRunningHistory, updateHistory, setWaitingForContinue, setIsRunning]);

  // Update script from JSON data
  const updateScriptFromJson = useCallback((scriptData: {
    characters: Array<{
      name: string;
      description?: string;
      imagePrompt?: string;
      RoleimagePrompt?: string;
    }>;
    scenes: Array<{
      id: number;
      imagePrompt: string;
      videoPrompt: string;
    }>;
  }) => {
    const scriptJson = JSON.stringify(scriptData, null, 2);
    setScriptResult(scriptJson);

    const existingChars = charactersRef.current;
    const chars: CharacterItem[] = scriptData.characters.map((c, i) => {
      const existing = existingChars[i];
      return {
        id: `char-${i}`,
        name: c.name,
        description: c.description || '',
        imagePrompt: c.imagePrompt || c.RoleimagePrompt || '',
        status: existing?.status || 'pending' as const,
        imageUrl: existing?.imageUrl,
        ossUrl: existing?.ossUrl,
      };
    });
    setCharacters(chars);

    const charNodeIds = chars.map((_, i) => `char-${i}`);
    setNodes((nds) => nds.filter((n) => !n.id.startsWith('char-') || charNodeIds.includes(n.id)));
    setEdges((eds) => eds.filter((e) =>
      (!e.source.startsWith('char-') && !e.target.startsWith('char-')) ||
      charNodeIds.includes(e.source) || charNodeIds.includes(e.target)
    ));

    chars.forEach((char, index) => {
      addCharacterNode(char, index);
    });

    const doneCount = chars.filter(c => c.status === 'done').length;
    if (chars.length > 0) {
      updateNodeStatus('characters', doneCount === chars.length ? 'success' : 'pending', `${doneCount}/${chars.length} completed`);
    }

    const existingScenes = scenesRef.current;
    const scns: SceneItem[] = scriptData.scenes.map((s, i) => {
      const existing = existingScenes[i];
      return {
        id: s.id,
        imagePrompt: s.imagePrompt,
        videoPrompt: s.videoPrompt,
        imageStatus: existing?.imageStatus || 'pending' as const,
        videoStatus: existing?.videoStatus || 'pending' as const,
        imageUrl: existing?.imageUrl,
        ossUrl: existing?.ossUrl,
      };
    });
    setScenes(scns);

    scns.forEach((scene, index) => {
      addSceneNode(scene, index);
    });

    const sceneDoneCount = scns.filter(s => s.imageStatus === 'done').length;
    if (scns.length > 0) {
      updateNodeStatus('scenes', sceneDoneCount === scns.length ? 'success' : 'pending', `${sceneDoneCount}/${scns.length} completed`);
    }

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === 'script') {
          const currentData = node.data as WorkflowNodeData;
          return {
            ...node,
            data: {
              ...currentData,
              status: 'success' as NodeStatus,
              description: `${scns.length} storyboards`,
              onPreview: handlePreview,
              previewData: {
                type: 'text' as const,
                text: scriptJson,
                title: 'AI Generated Script',
                editable: true,
                onSaveText: handleSaveScript,
              },
            },
          };
        }
        return node;
      })
    );

    addLog('info', `Script updated from AI: ${chars.length} characters, ${scns.length} scenes`);
  }, [addLog, handlePreview, handleSaveScript, addCharacterNode, addSceneNode, updateNodeStatus, setScriptResult, setCharacters, setScenes, setNodes, setEdges]);

  // Reset workflow
  const resetWorkflow = () => {
    stopWorkflow();
    setStage('idle');
    setScriptResult('');
    setCharacters([]);
    setScenes([]);
    setVideoItems([]);
    setMergedVideoUrl('');
    setLogs([]);

    hasExternalBatchRegenerateRef.current = false;

    clearDynamicNodes();

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === 'output') {
          return {
            ...node,
            type: 'workflowNode',
            data: {
              label: 'Final Output',
              icon: <CheckCircle className="w-5 h-5" />,
              description: 'Merged video',
              status: 'pending' as NodeStatus,
              nodeType: 'main',
            } as WorkflowNodeData,
          };
        }
        return node;
      })
    );

    updateNodeStatus('script', 'pending', 'Generate storyboard prompts');
    updateNodeStatus('characters', 'pending', 'Generate character references');
    updateNodeStatus('scenes', 'pending', 'Generate storyboards');
    updateNodeStatus('videos', 'pending', 'Generate videos from frames');
  };

  // Load from history (wrapper for external use)
  const loadFromHistory = useCallback((historyData: HistoryData) => {
    loadFromHistoryInternal(historyData);
  }, [loadFromHistoryInternal]);

  // Check and restore running workflow
  const checkAndRestoreRunningWorkflow = useCallback(async (): Promise<boolean> => {
    try {
      const runningHistory = await getRunningHistory();
      if (!runningHistory) return false;

      addLog('info', 'Found running workflow, restoring state...');

      const characters: CharacterItem[] = (runningHistory.characters || []).map((c, i) => ({
        id: c.id || `char-${i}`,
        name: c.name,
        description: c.description || '',
        imagePrompt: c.imagePrompt,
        status: c.status || 'pending',
        imageUrl: c.imageUrl,
        ossUrl: c.ossUrl,
        error: c.error,
      }));

      const scenes: SceneItem[] = (runningHistory.scenes || []).map((s) => ({
        id: s.id,
        imagePrompt: s.imagePrompt,
        videoPrompt: s.videoPrompt || '',
        imageStatus: s.imageStatus || 'pending',
        videoStatus: 'pending' as const,
        imageUrl: s.imageUrl,
        ossUrl: s.ossUrl,
        error: s.error,
      }));

      const videos: VideoItem[] = (runningHistory.videos || []).map((v) => ({
        id: v.id,
        index: v.index,
        prompt: v.prompt,
        firstFrame: v.firstFrame || '',
        lastFrame: v.lastFrame,
        status: v.status,
        taskId: v.taskId,
        videoUrl: v.videoUrl,
        model: v.model as VideoModelId | undefined,
        error: v.error,
      }));

      loadFromHistory({
        videoUrl: runningHistory.videoUrl,
        scriptResult: runningHistory.scriptResult,
        characters,
        scenes,
        videos,
        mergedVideoUrl: runningHistory.mergedVideoUrl,
      });

      addLog('info', `Restored workflow: ${runningHistory.title}`);
      addLog('warning', 'Previous workflow was interrupted. You can continue or reset.');

      return true;
    } catch (error) {
      console.error('Failed to restore running workflow:', error);
      return false;
    }
  }, [getRunningHistory, loadFromHistory, addLog]);

  return {
    // State
    stage,
    isRunning,
    isAutoMode,
    setIsAutoMode,
    waitingForContinue,
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
    scriptResult,
    characters,
    scenes,
    videoItems,
    mergedVideoUrl,
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    // Preview
    previewContent,
    closePreview,
    handlePreview,
    // Methods
    runWorkflow,
    runWorkflowFromJson,
    stopWorkflow,
    resetWorkflow,
    continueWorkflow,
    updateNodeStatus,
    handleVideoUpload,
    regenerateSceneImage,
    regenerateCharacterImage,
    loadFromHistory,
    updateInputNodeWithVideo,
    checkAndRestoreRunningWorkflow,
    updateScriptFromJson,
  };
}
