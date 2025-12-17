'use client';

import { useCallback, useRef } from 'react';
import type {
  CharacterItem,
  SceneItem,
  VideoItem,
  WorkflowLog,
  VideoModelId,
  ImageTextToImageModelId,
  ImageEditModelId,
  VideoGenerationMode,
  NodeStatus,
} from '@/types/workflow';
import {
  textToImageWithModelAPI,
  imageToEditWithModelAPI,
  pollImageResultAPI,
  submitVideoTaskAPI,
  pollVideoResultAPI,
  uploadToOSS,
  parseScriptResult,
} from '@/services/api';
import { VIDEO_MODELS } from '@/constants/workflow';
import {
  getDefaultImageModel,
  getDefaultImageSize,
  getDefaultAspectRatio,
} from '@/config/api';

export interface WorkflowGenerationParams {
  // State refs
  charactersRef: React.MutableRefObject<CharacterItem[]>;
  scenesRef: React.MutableRefObject<SceneItem[]>;
  videoItemsRef: React.MutableRefObject<VideoItem[]>;
  scriptResultRef: React.MutableRefObject<string>;
  pollingRef: React.MutableRefObject<Record<string, boolean>>;
  abortRef: React.MutableRefObject<boolean>;

  // State setters
  setCharacters: React.Dispatch<React.SetStateAction<CharacterItem[]>>;
  setScenes: React.Dispatch<React.SetStateAction<SceneItem[]>>;
  setVideoItems: React.Dispatch<React.SetStateAction<VideoItem[]>>;

  // Config
  selectedModel: VideoModelId;
  videoGenerationMode: VideoGenerationMode;
  imageSize: string;

  // Node operations
  addCharacterNode: (char: CharacterItem, index: number) => void;
  addSceneNode: (scene: SceneItem, index: number) => void;
  addVideoNode: (video: VideoItem, index: number) => void;
  updateNodeStatus: (nodeId: string, status: NodeStatus, description?: string) => void;

  // Utils
  addLog: (type: WorkflowLog['type'], msg: string) => void;
  updateHistory: (data: Record<string, unknown>) => Promise<void>;
}

export interface WorkflowGenerationReturn {
  // Core generation functions
  generateTextToImage: (prompt: string, aspectRatio: string, useAbortRef?: boolean) => Promise<string>;
  generateImageToEdit: (referenceUrls: string[], prompt: string, aspectRatio: string, useAbortRef?: boolean) => Promise<string>;

  // Character generation
  regenerateCharacterImage: (charIndex: number, newPrompt?: string) => Promise<void>;
  regenerateCharacterImageWithModel: (charIndex: number, modelId: ImageTextToImageModelId, size?: string, aspectRatio?: string) => Promise<void>;
  uploadCharacterImage: (charIndex: number, file: File) => Promise<void>;

  // Scene generation
  regenerateSceneImage: (sceneIndex: number, newPrompt?: string) => Promise<void>;
  regenerateSceneImageWithModel: (sceneIndex: number, modelId: ImageEditModelId, size?: string, aspectRatio?: string) => Promise<void>;
  uploadSceneImage: (sceneIndex: number, file: File) => Promise<void>;

  // Video generation
  regenerateVideo: (videoIndex: number, newPrompt?: string) => Promise<void>;
  regenerateVideoWithModel: (videoIndex: number, modelId: VideoModelId, mode?: VideoGenerationMode, duration?: number) => Promise<void>;

  // Batch operations
  batchRegenerateCharacters: () => Promise<void>;
  batchRegenerateScenes: () => Promise<void>;

  // Refs for node callbacks
  regenerateCharacterRef: React.MutableRefObject<((index: number, newPrompt?: string) => void) | undefined>;
  regenerateCharacterWithModelRef: React.MutableRefObject<((index: number, modelId: ImageTextToImageModelId, size?: string, aspectRatio?: string, newPrompt?: string) => void) | undefined>;
  uploadCharacterRef: React.MutableRefObject<((index: number, file: File) => void) | undefined>;
  regenerateSceneRef: React.MutableRefObject<((index: number, newPrompt?: string) => void) | undefined>;
  regenerateSceneWithModelRef: React.MutableRefObject<((index: number, modelId: ImageEditModelId, size?: string, aspectRatio?: string) => void) | undefined>;
  uploadSceneRef: React.MutableRefObject<((index: number, file: File) => void) | undefined>;
  regenerateVideoRef: React.MutableRefObject<((index: number, newPrompt?: string) => void) | undefined>;
  regenerateVideoWithModelRef: React.MutableRefObject<((index: number, modelId: VideoModelId, mode?: VideoGenerationMode, duration?: number, newPrompt?: string) => void) | undefined>;
}

export function useWorkflowGeneration({
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
}: WorkflowGenerationParams): WorkflowGenerationReturn {
  // Refs for regenerate callbacks
  const regenerateCharacterRef = useRef<((index: number, newPrompt?: string) => void) | undefined>(undefined);
  const regenerateCharacterWithModelRef = useRef<((index: number, modelId: ImageTextToImageModelId, size?: string, aspectRatio?: string, newPrompt?: string) => void) | undefined>(undefined);
  const uploadCharacterRef = useRef<((index: number, file: File) => void) | undefined>(undefined);
  const regenerateSceneRef = useRef<((index: number, newPrompt?: string) => void) | undefined>(undefined);
  const regenerateSceneWithModelRef = useRef<((index: number, modelId: ImageEditModelId, size?: string, aspectRatio?: string) => void) | undefined>(undefined);
  const uploadSceneRef = useRef<((index: number, file: File) => void) | undefined>(undefined);
  const regenerateVideoRef = useRef<((index: number, newPrompt?: string) => void) | undefined>(undefined);
  const regenerateVideoWithModelRef = useRef<((index: number, modelId: VideoModelId, mode?: VideoGenerationMode, duration?: number) => void) | undefined>(undefined);

  // Generate text-to-image (uses default model settings from config)
  const generateTextToImage = useCallback(async (
    prompt: string,
    _aspectRatio: string, // Ignored - uses default from settings
    useAbortRef = true
  ): Promise<string> => {
    // Use textToImageWithModelAPI which reads ALL default settings from localStorage
    // Do not pass any parameters to let it use the configured defaults
    const { imageUrl, taskId } = await textToImageWithModelAPI(prompt);

    if (taskId && !imageUrl) {
      addLog('info', 'Image generation started, polling...');
      const shouldContinue = useAbortRef ? () => !abortRef.current : () => true;
      const result = await pollImageResultAPI(taskId, shouldContinue);
      if (result.error) throw new Error(result.error);
      return result.imageUrl || '';
    }

    return imageUrl;
  }, [abortRef, addLog]);

  // Generate image-to-edit (uses default model settings from config)
  const generateImageToEdit = useCallback(async (
    referenceUrls: string[],
    prompt: string,
    _aspectRatio: string, // Ignored - uses default from settings
    useAbortRef = true
  ): Promise<string> => {
    // Use imageToEditWithModelAPI which reads ALL default settings from localStorage
    // Do not pass any parameters to let it use the configured defaults
    const { imageUrl, taskId } = await imageToEditWithModelAPI(referenceUrls, prompt);

    if (taskId && !imageUrl) {
      addLog('info', 'Image editing started, polling...');
      const shouldContinue = useAbortRef ? () => !abortRef.current : () => true;
      const result = await pollImageResultAPI(taskId, shouldContinue);
      if (result.error) throw new Error(result.error);
      return result.imageUrl || '';
    }

    return imageUrl;
  }, [abortRef, addLog]);

  // Regenerate character image
  const regenerateCharacterImage = useCallback(async (charIndex: number, newPrompt?: string) => {
    const char = charactersRef.current[charIndex];
    if (!char) return;

    addLog('info', `Regenerating reference image for character ${char.name}...`);
    updateNodeStatus('characters', 'running', 'Regenerating...');

    try {
      // Get latest prompt from script if no new prompt provided
      let prompt = newPrompt || char.imagePrompt;
      if (!newPrompt && scriptResultRef.current) {
        try {
          const parsed = parseScriptResult(scriptResultRef.current);
          const latestChar = parsed.characters[charIndex];
          if (latestChar?.imagePrompt) {
            prompt = latestChar.imagePrompt;
            addLog('info', `Using latest character prompt from script`);
          }
        } catch {
          // Keep original prompt if parsing fails
        }
      }

      const updatingChar = {
        ...char,
        status: 'generating' as const,
        imagePrompt: prompt,
        imageUrl: undefined,
        ossUrl: undefined,
      };
      setCharacters((prev) => {
        const newChars = [...prev];
        newChars[charIndex] = updatingChar;
        return newChars;
      });
      addCharacterNode(updatingChar, charIndex);

      const imageUrl = await generateTextToImage(prompt, '1:1', false);
      const ossUrl = await uploadToOSS(imageUrl, `char-${charIndex}-${Date.now()}.png`);

      const updatedChar = {
        ...char,
        status: 'done' as const,
        imageUrl,
        ossUrl,
        imagePrompt: prompt,
        error: undefined
      };
      setCharacters((prev) => {
        const newChars = [...prev];
        newChars[charIndex] = updatedChar;
        updateHistory({ characters: newChars });
        const doneCount = newChars.filter(c => c.status === 'done').length;
        updateNodeStatus('characters', 'success', `${doneCount}/${newChars.length} completed`);
        return newChars;
      });
      addCharacterNode(updatedChar, charIndex);

      addLog('success', `Character ${char.name} reference image regenerated`);
    } catch (error) {
      const err = error as Error;
      const errorChar = { ...char, status: 'error' as const, error: err.message };
      setCharacters((prev) => {
        const newChars = [...prev];
        newChars[charIndex] = errorChar;
        const doneCount = newChars.filter(c => c.status === 'done').length;
        const errorCount = newChars.filter(c => c.status === 'error').length;
        if (errorCount === newChars.length) {
          updateNodeStatus('characters', 'error', 'All failed');
        } else {
          updateNodeStatus('characters', 'success', `${doneCount}/${newChars.length} completed`);
        }
        return newChars;
      });
      addCharacterNode(errorChar, charIndex);
      addLog('error', `Character ${char.name} reference image regeneration failed: ${err.message}`);
    }
  }, [charactersRef, scriptResultRef, setCharacters, addCharacterNode, updateNodeStatus, addLog, updateHistory, generateTextToImage]);

  // Regenerate character image with specific model
  const regenerateCharacterImageWithModel = useCallback(async (
    charIndex: number,
    modelId: ImageTextToImageModelId,
    size?: string,
    aspectRatio?: string,
    newPrompt?: string
  ) => {
    const char = charactersRef.current[charIndex];
    if (!char) return;

    addLog('info', `Regenerating character ${char.name} with model ${modelId}...`);
    updateNodeStatus('characters', 'running', 'Regenerating...');

    try {
      // Use newPrompt if provided, otherwise use existing prompt
      let prompt = newPrompt || char.imagePrompt;
      if (!newPrompt && scriptResultRef.current) {
        try {
          const parsed = parseScriptResult(scriptResultRef.current);
          const latestChar = parsed.characters[charIndex];
          if (latestChar?.imagePrompt) {
            prompt = latestChar.imagePrompt;
            addLog('info', `Using latest character prompt from script`);
          }
        } catch {
          // Keep original prompt
        }
      }

      const updatingChar = {
        ...char,
        status: 'generating' as const,
        imagePrompt: prompt,
        imageUrl: undefined,
        ossUrl: undefined,
      };
      setCharacters((prev) => {
        const newChars = [...prev];
        newChars[charIndex] = updatingChar;
        return newChars;
      });
      addCharacterNode(updatingChar, charIndex);

      const { imageUrl, taskId } = await textToImageWithModelAPI(prompt, modelId, size, aspectRatio);

      let finalImageUrl = imageUrl;
      if (taskId && !imageUrl) {
        addLog('info', `Character ${char.name} image generation started, polling...`);
        const result = await pollImageResultAPI(taskId, () => true);
        if (result.error) throw new Error(result.error);
        finalImageUrl = result.imageUrl || '';
      }

      if (!finalImageUrl) throw new Error('Failed to get image');

      const ossUrl = await uploadToOSS(finalImageUrl, `char-${charIndex}-${modelId}-${Date.now()}.png`);

      const updatedChar = {
        ...char,
        status: 'done' as const,
        imageUrl: finalImageUrl,
        ossUrl,
        imagePrompt: prompt,  // Save the prompt used for generation
        error: undefined,
      };
      setCharacters((prev) => {
        const newChars = [...prev];
        newChars[charIndex] = updatedChar;
        updateHistory({ characters: newChars });
        const doneCount = newChars.filter(c => c.status === 'done').length;
        updateNodeStatus('characters', 'success', `${doneCount}/${newChars.length} completed`);
        return newChars;
      });
      addCharacterNode(updatedChar, charIndex);

      addLog('success', `Character ${char.name} regenerated with ${modelId}`);
    } catch (error) {
      const err = error as Error;
      const errorChar = { ...char, status: 'error' as const, error: err.message };
      setCharacters((prev) => {
        const newChars = [...prev];
        newChars[charIndex] = errorChar;
        const doneCount = newChars.filter(c => c.status === 'done').length;
        const errorCount = newChars.filter(c => c.status === 'error').length;
        if (errorCount === newChars.length) {
          updateNodeStatus('characters', 'error', 'All failed');
        } else {
          updateNodeStatus('characters', 'success', `${doneCount}/${newChars.length} completed`);
        }
        return newChars;
      });
      addCharacterNode(errorChar, charIndex);
      addLog('error', `Character ${char.name} regeneration with ${modelId} failed: ${err.message}`);
    }
  }, [charactersRef, scriptResultRef, setCharacters, addCharacterNode, updateNodeStatus, addLog, updateHistory]);

  // Upload character image
  const uploadCharacterImage = useCallback(async (charIndex: number, file: File) => {
    const char = charactersRef.current[charIndex];
    if (!char) return;

    addLog('info', `Uploading local image for character ${char.name}...`);

    try {
      const updatingChar = {
        ...char,
        status: 'uploading' as const,
        imageUrl: undefined,
        ossUrl: undefined,
      };
      setCharacters((prev) => {
        const newChars = [...prev];
        newChars[charIndex] = updatingChar;
        return newChars;
      });
      addCharacterNode(updatingChar, charIndex);

      const ossUrl = await uploadToOSS(file, `char-${charIndex}-upload-${Date.now()}.png`);

      const updatedChar = {
        ...char,
        status: 'done' as const,
        imageUrl: ossUrl,
        ossUrl,
        error: undefined,
      };
      setCharacters((prev) => {
        const newChars = [...prev];
        newChars[charIndex] = updatedChar;
        updateHistory({ characters: newChars });
        return newChars;
      });
      addCharacterNode(updatedChar, charIndex);

      addLog('success', `Character ${char.name} image uploaded`);
    } catch (error) {
      const err = error as Error;
      const errorChar = { ...char, status: 'error' as const, error: err.message };
      setCharacters((prev) => {
        const newChars = [...prev];
        newChars[charIndex] = errorChar;
        return newChars;
      });
      addCharacterNode(errorChar, charIndex);
      addLog('error', `Character ${char.name} image upload failed: ${err.message}`);
    }
  }, [charactersRef, setCharacters, addCharacterNode, addLog, updateHistory]);

  // Upload scene image
  const uploadSceneImage = useCallback(async (sceneIndex: number, file: File) => {
    const scene = scenesRef.current[sceneIndex];
    if (!scene) return;

    addLog('info', `Uploading local image for scene ${scene.id}...`);

    try {
      const updatingScene = {
        ...scene,
        imageStatus: 'generating' as const,
        imageUrl: undefined,
        ossUrl: undefined,
      };
      setScenes((prev) => {
        const newScenes = [...prev];
        newScenes[sceneIndex] = updatingScene;
        return newScenes;
      });
      addSceneNode(updatingScene, sceneIndex);

      const ossUrl = await uploadToOSS(file, `scene-${sceneIndex}-upload-${Date.now()}.png`);

      const updatedScene = {
        ...scene,
        imageStatus: 'done' as const,
        imageUrl: ossUrl,
        ossUrl,
        error: undefined,
      };
      setScenes((prev) => {
        const newScenes = [...prev];
        newScenes[sceneIndex] = updatedScene;
        updateHistory({ scenes: newScenes });
        return newScenes;
      });
      addSceneNode(updatedScene, sceneIndex);

      addLog('success', `Scene ${scene.id} image uploaded`);
    } catch (error) {
      const err = error as Error;
      const errorScene = { ...scene, imageStatus: 'error' as const, error: err.message };
      setScenes((prev) => {
        const newScenes = [...prev];
        newScenes[sceneIndex] = errorScene;
        return newScenes;
      });
      addSceneNode(errorScene, sceneIndex);
      addLog('error', `Scene ${scene.id} image upload failed: ${err.message}`);
    }
  }, [scenesRef, setScenes, addSceneNode, addLog, updateHistory]);

  // Regenerate scene image
  const regenerateSceneImage = useCallback(async (sceneIndex: number, newPrompt?: string) => {
    const scene = scenesRef.current[sceneIndex];
    if (!scene) return;

    addLog('info', `Regenerating storyboard ${scene.id}...`);
    updateNodeStatus('scenes', 'running', 'Regenerating...');

    try {
      const updatingScene = {
        ...scene,
        imageStatus: 'generating' as const,
        imagePrompt: newPrompt || scene.imagePrompt,
        imageUrl: undefined,
        ossUrl: undefined,
      };
      setScenes((prev) => {
        const newScenes = [...prev];
        newScenes[sceneIndex] = updatingScene;
        return newScenes;
      });
      addSceneNode(updatingScene, sceneIndex);

      const prompt = newPrompt || scene.imagePrompt;
      let imageUrl: string;

      const charImageUrls = charactersRef.current
        .filter((c) => c.ossUrl)
        .map((c) => c.ossUrl!);

      if (charImageUrls.length > 0) {
        addLog('info', `Using ${charImageUrls.length} character reference images for scene ${scene.id}`);
        imageUrl = await generateImageToEdit(charImageUrls, prompt, '9:16', false);
      } else {
        addLog('info', `No character references, using text-to-image for scene ${scene.id}`);
        imageUrl = await generateTextToImage(prompt, '9:16', false);
      }

      const ossUrl = await uploadToOSS(imageUrl, `scene-${sceneIndex}-${Date.now()}.png`);

      const updatedScene = {
        ...scene,
        imageStatus: 'done' as const,
        imageUrl,
        ossUrl,
        imagePrompt: prompt,
        error: undefined
      };
      setScenes((prev) => {
        const newScenes = [...prev];
        newScenes[sceneIndex] = updatedScene;
        updateHistory({ scenes: newScenes });
        const doneCount = newScenes.filter(s => s.imageStatus === 'done').length;
        updateNodeStatus('scenes', 'success', `${doneCount}/${newScenes.length} completed`);
        return newScenes;
      });
      addSceneNode(updatedScene, sceneIndex);

      addLog('success', `Storyboard ${scene.id} regenerated`);
    } catch (error) {
      const err = error as Error;
      const errorScene = { ...scene, imageStatus: 'error' as const, error: err.message };
      setScenes((prev) => {
        const newScenes = [...prev];
        newScenes[sceneIndex] = errorScene;
        const doneCount = newScenes.filter(s => s.imageStatus === 'done').length;
        const errorCount = newScenes.filter(s => s.imageStatus === 'error').length;
        if (errorCount === newScenes.length) {
          updateNodeStatus('scenes', 'error', 'All failed');
        } else {
          updateNodeStatus('scenes', 'success', `${doneCount}/${newScenes.length} completed`);
        }
        return newScenes;
      });
      addSceneNode(errorScene, sceneIndex);
      addLog('error', `Storyboard ${scene.id} regeneration failed: ${err.message}`);
    }
  }, [scenesRef, charactersRef, setScenes, addSceneNode, updateNodeStatus, addLog, updateHistory, generateTextToImage, generateImageToEdit]);

  // Regenerate scene image with specific model
  const regenerateSceneImageWithModel = useCallback(async (
    sceneIndex: number,
    modelId: ImageEditModelId,
    size?: string,
    aspectRatio?: string
  ) => {
    const scene = scenesRef.current[sceneIndex];
    if (!scene) return;

    addLog('info', `Regenerating storyboard ${scene.id} with model ${modelId}...`);
    updateNodeStatus('scenes', 'running', 'Regenerating...');

    try {
      const updatingScene = {
        ...scene,
        imageStatus: 'generating' as const,
        imageUrl: undefined,
        ossUrl: undefined,
      };
      setScenes((prev) => {
        const newScenes = [...prev];
        newScenes[sceneIndex] = updatingScene;
        return newScenes;
      });
      addSceneNode(updatingScene, sceneIndex);

      const prompt = scene.imagePrompt;
      const charImageUrls = charactersRef.current
        .filter((c) => c.ossUrl)
        .map((c) => c.ossUrl!);

      let finalImageUrl: string;

      const referenceImages = charImageUrls.length > 0
        ? charImageUrls
        : (scene.ossUrl ? [scene.ossUrl] : []);

      if (referenceImages.length > 0) {
        addLog('info', `Using ${referenceImages.length} reference images for scene ${scene.id} with ${modelId}`);
        const { imageUrl, taskId } = await imageToEditWithModelAPI(referenceImages, prompt, modelId, size, aspectRatio);

        finalImageUrl = imageUrl;
        if (taskId && !imageUrl) {
          addLog('info', `Scene ${scene.id} image generation started, polling...`);
          const result = await pollImageResultAPI(taskId, () => true);
          if (result.error) throw new Error(result.error);
          finalImageUrl = result.imageUrl || '';
        }
      } else {
        addLog('info', `No reference images, using text-to-image with ${modelId} for scene ${scene.id}`);
        const textModel = modelId === 'gemini-edit' ? 'gemini' : modelId === 'seedream-edit' ? 'seedream' : 'wan-t2i';
        const { imageUrl, taskId } = await textToImageWithModelAPI(prompt, textModel, size, aspectRatio);

        finalImageUrl = imageUrl;
        if (taskId && !imageUrl) {
          addLog('info', `Scene ${scene.id} image generation started, polling...`);
          const result = await pollImageResultAPI(taskId, () => true);
          if (result.error) throw new Error(result.error);
          finalImageUrl = result.imageUrl || '';
        }
      }

      if (!finalImageUrl) throw new Error('Failed to get image');

      const ossUrl = await uploadToOSS(finalImageUrl, `scene-${sceneIndex}-${modelId}-${Date.now()}.png`);

      const updatedScene = {
        ...scene,
        imageStatus: 'done' as const,
        imageUrl: finalImageUrl,
        ossUrl,
        error: undefined,
      };
      setScenes((prev) => {
        const newScenes = [...prev];
        newScenes[sceneIndex] = updatedScene;
        updateHistory({ scenes: newScenes });
        const doneCount = newScenes.filter(s => s.imageStatus === 'done').length;
        updateNodeStatus('scenes', 'success', `${doneCount}/${newScenes.length} completed`);
        return newScenes;
      });
      addSceneNode(updatedScene, sceneIndex);

      addLog('success', `Storyboard ${scene.id} regenerated with ${modelId}`);
    } catch (error) {
      const err = error as Error;
      const errorScene = { ...scene, imageStatus: 'error' as const, error: err.message };
      setScenes((prev) => {
        const newScenes = [...prev];
        newScenes[sceneIndex] = errorScene;
        const doneCount = newScenes.filter(s => s.imageStatus === 'done').length;
        const errorCount = newScenes.filter(s => s.imageStatus === 'error').length;
        if (errorCount === newScenes.length) {
          updateNodeStatus('scenes', 'error', 'All failed');
        } else {
          updateNodeStatus('scenes', 'success', `${doneCount}/${newScenes.length} completed`);
        }
        return newScenes;
      });
      addSceneNode(errorScene, sceneIndex);
      addLog('error', `Storyboard ${scene.id} regeneration with ${modelId} failed: ${err.message}`);
    }
  }, [scenesRef, charactersRef, setScenes, addSceneNode, updateNodeStatus, addLog, updateHistory]);

  // Regenerate video
  const regenerateVideo = useCallback(async (videoIndex: number, newPrompt?: string) => {
    const video = videoItemsRef.current[videoIndex];
    if (!video) return;

    addLog('info', `Regenerating video ${video.id}...`);

    try {
      const latestScenes = scenesRef.current.filter(s => s.imageStatus === 'done' && s.ossUrl);
      const firstFrame = latestScenes[videoIndex]?.ossUrl || video.firstFrame;
      const lastFrame = latestScenes[videoIndex + 1]?.ossUrl;

      let promptToUse = newPrompt;
      if (!promptToUse) {
        if (scriptResultRef.current) {
          try {
            const parsed = parseScriptResult(scriptResultRef.current);
            promptToUse = parsed.scenes[videoIndex]?.videoPrompt || video.prompt;
            addLog('info', `Using latest video prompt from script`);
          } catch {
            promptToUse = video.prompt;
          }
        } else {
          promptToUse = video.prompt;
        }
      }

      const updatingVideo: VideoItem = {
        ...video,
        status: 'submitting',
        prompt: promptToUse,
        firstFrame,
        lastFrame,
        videoUrl: undefined,
        error: undefined,
      };
      setVideoItems((prev) => {
        const newVideos = [...prev];
        newVideos[videoIndex] = updatingVideo;
        return newVideos;
      });
      addVideoNode(updatingVideo, videoIndex);

      const { taskId, error: submitError } = await submitVideoTaskAPI(updatingVideo, selectedModel);

      if (!taskId) {
        throw new Error(submitError || 'Submit failed');
      }

      const pollingVideo: VideoItem = { ...updatingVideo, status: 'polling', taskId };
      setVideoItems((prev) => {
        const newVideos = [...prev];
        newVideos[videoIndex] = pollingVideo;
        return newVideos;
      });
      addVideoNode(pollingVideo, videoIndex);

      pollingRef.current[taskId] = true;
      const { videoUrl, error: pollError } = await pollVideoResultAPI(
        taskId,
        () => pollingRef.current[taskId]
      );
      delete pollingRef.current[taskId];

      if (!videoUrl) {
        throw new Error(pollError || 'Video generation failed');
      }

      const updatedVideo: VideoItem = { ...updatingVideo, status: 'done', taskId, videoUrl };
      setVideoItems((prev) => {
        const newVideos = [...prev];
        newVideos[videoIndex] = updatedVideo;
        updateHistory({ videos: newVideos });
        return newVideos;
      });
      addVideoNode(updatedVideo, videoIndex);

      addLog('success', `Video ${video.id} regenerated`);
    } catch (error) {
      const err = error as Error;
      const errorVideo: VideoItem = { ...video, status: 'error', error: err.message, prompt: newPrompt || video.prompt };
      setVideoItems((prev) => {
        const newVideos = [...prev];
        newVideos[videoIndex] = errorVideo;
        return newVideos;
      });
      addVideoNode(errorVideo, videoIndex);
      addLog('error', `Video ${video.id} regeneration failed: ${err.message}`);
    }
  }, [videoItemsRef, scenesRef, scriptResultRef, pollingRef, setVideoItems, addVideoNode, selectedModel, addLog, updateHistory]);

  // Regenerate video with specific model
  const regenerateVideoWithModel = useCallback(async (
    videoIndex: number,
    modelId: VideoModelId,
    mode?: VideoGenerationMode,
    duration?: number,
    newPrompt?: string
  ) => {
    const video = videoItemsRef.current[videoIndex];
    if (!video) return;

    const modelName = VIDEO_MODELS[modelId]?.name || modelId;
    const modeToUse = mode || videoGenerationMode;
    const durationInfo = duration ? ` (${duration}s)` : '';
    addLog('info', `Regenerating video ${video.id} with ${modelName}${durationInfo} (${modeToUse === 'first-last-frame' ? 'first-last frame' : 'single image'} mode)...`);

    try {
      const latestScenes = scenesRef.current.filter(s => s.imageStatus === 'done' && s.ossUrl);
      const firstFrame = latestScenes[videoIndex]?.ossUrl || video.firstFrame;
      const lastFrame = modeToUse === 'first-last-frame' ? latestScenes[videoIndex + 1]?.ossUrl : undefined;

      // Use newPrompt if provided, otherwise try to get from script or use existing
      let promptToUse = newPrompt || video.prompt;
      if (!newPrompt && scriptResultRef.current) {
        try {
          const parsed = parseScriptResult(scriptResultRef.current);
          promptToUse = parsed.scenes[videoIndex]?.videoPrompt || video.prompt;
          addLog('info', `Using latest video prompt from script`);
        } catch {
          // Keep original prompt
        }
      }

      const updatingVideo: VideoItem = {
        ...video,
        status: 'submitting',
        model: modelId,
        prompt: promptToUse,
        firstFrame,
        lastFrame,
        videoUrl: undefined,
        error: undefined,
      };
      setVideoItems((prev) => {
        const newVideos = [...prev];
        newVideos[videoIndex] = updatingVideo;
        return newVideos;
      });
      addVideoNode(updatingVideo, videoIndex);

      const { taskId, error: submitError } = await submitVideoTaskAPI(updatingVideo, modelId, duration);

      if (!taskId) {
        throw new Error(submitError || 'Submit failed');
      }

      const pollingVideo: VideoItem = { ...updatingVideo, status: 'polling', taskId };
      setVideoItems((prev) => {
        const newVideos = [...prev];
        newVideos[videoIndex] = pollingVideo;
        return newVideos;
      });
      addVideoNode(pollingVideo, videoIndex);

      pollingRef.current[taskId] = true;
      const { videoUrl, error: pollError } = await pollVideoResultAPI(
        taskId,
        () => pollingRef.current[taskId]
      );
      delete pollingRef.current[taskId];

      if (!videoUrl) {
        throw new Error(pollError || 'Video generation failed');
      }

      const updatedVideo: VideoItem = { ...updatingVideo, status: 'done', taskId, videoUrl };
      setVideoItems((prev) => {
        const newVideos = [...prev];
        newVideos[videoIndex] = updatedVideo;
        updateHistory({ videos: newVideos });
        return newVideos;
      });
      addVideoNode(updatedVideo, videoIndex);

      addLog('success', `Video ${video.id} regenerated with ${modelName}`);
    } catch (error) {
      const err = error as Error;
      const errorVideo: VideoItem = { ...video, status: 'error', error: err.message, model: modelId };
      setVideoItems((prev) => {
        const newVideos = [...prev];
        newVideos[videoIndex] = errorVideo;
        return newVideos;
      });
      addVideoNode(errorVideo, videoIndex);
      addLog('error', `Video ${video.id} regeneration failed: ${err.message}`);
    }
  }, [videoItemsRef, scenesRef, scriptResultRef, pollingRef, videoGenerationMode, setVideoItems, addVideoNode, addLog, updateHistory]);

  // Batch regenerate all characters
  const batchRegenerateCharacters = useCallback(async () => {
    if (!scriptResultRef.current) {
      addLog('warning', 'No script analysis result');
      return;
    }

    const parsed = parseScriptResult(scriptResultRef.current);
    if (parsed.characters.length === 0) {
      addLog('warning', 'No character data in script');
      return;
    }

    addLog('info', `Batch regenerating ${parsed.characters.length} character reference images...`);
    updateNodeStatus('characters', 'running', 'Batch regenerating...');

    // Update all characters to generating status
    const updatingChars = parsed.characters.map((char, i) => ({
      ...char,
      id: char.id || `char-${i}`,
      status: 'generating' as const,
      imageUrl: undefined,
      ossUrl: undefined,
    }));
    setCharacters(updatingChars);
    updatingChars.forEach((char, i) => addCharacterNode(char, i));

    // Generate in parallel
    const results = await Promise.all(
      updatingChars.map(async (char, index) => {
        try {
          const imageUrl = await generateTextToImage(char.imagePrompt, '1:1', false);
          const ossUrl = await uploadToOSS(imageUrl, `char-${index}-batch-${Date.now()}.png`);
          return { ...char, status: 'done' as const, imageUrl, ossUrl };
        } catch (error) {
          const err = error as Error;
          return { ...char, status: 'error' as const, error: err.message };
        }
      })
    );

    setCharacters(results);
    results.forEach((char, i) => addCharacterNode(char, i));

    const doneCount = results.filter(c => c.status === 'done').length;
    updateNodeStatus('characters', doneCount > 0 ? 'success' : 'error', `${doneCount}/${results.length} completed`);
    updateHistory({ characters: results });

    addLog('success', `Batch regeneration completed: ${doneCount}/${results.length} successful`);
  }, [scriptResultRef, setCharacters, addCharacterNode, updateNodeStatus, addLog, updateHistory, generateTextToImage]);

  // Batch regenerate all scenes
  const batchRegenerateScenes = useCallback(async () => {
    if (!scriptResultRef.current) {
      addLog('warning', 'No script analysis result');
      return;
    }

    const parsed = parseScriptResult(scriptResultRef.current);
    if (parsed.scenes.length === 0) {
      addLog('warning', 'No scene data in script');
      return;
    }

    addLog('info', `Batch regenerating ${parsed.scenes.length} storyboard images...`);
    updateNodeStatus('scenes', 'running', 'Batch regenerating...');

    const charImageUrls = charactersRef.current
      .filter((c) => c.ossUrl)
      .map((c) => c.ossUrl!);

    // Update all scenes to generating status
    const updatingScenes = parsed.scenes.map((scene) => ({
      ...scene,
      imageStatus: 'generating' as const,
      imageUrl: undefined,
      ossUrl: undefined,
    }));
    setScenes(updatingScenes);
    updatingScenes.forEach((scene, i) => addSceneNode(scene, i));

    // Generate in parallel
    const results = await Promise.all(
      updatingScenes.map(async (scene, index) => {
        try {
          let imageUrl: string;
          if (charImageUrls.length > 0) {
            imageUrl = await generateImageToEdit(charImageUrls, scene.imagePrompt, '9:16', false);
          } else {
            imageUrl = await generateTextToImage(scene.imagePrompt, '9:16', false);
          }
          const ossUrl = await uploadToOSS(imageUrl, `scene-${index}-batch-${Date.now()}.png`);
          return { ...scene, imageStatus: 'done' as const, imageUrl, ossUrl };
        } catch (error) {
          const err = error as Error;
          return { ...scene, imageStatus: 'error' as const, error: err.message };
        }
      })
    );

    setScenes(results);
    results.forEach((scene, i) => addSceneNode(scene, i));

    const doneCount = results.filter(s => s.imageStatus === 'done').length;
    updateNodeStatus('scenes', doneCount > 0 ? 'success' : 'error', `${doneCount}/${results.length} completed`);
    updateHistory({ scenes: results });

    addLog('success', `Batch regeneration completed: ${doneCount}/${results.length} successful`);
  }, [scriptResultRef, charactersRef, setScenes, addSceneNode, updateNodeStatus, addLog, updateHistory, generateTextToImage, generateImageToEdit]);

  // Set refs
  regenerateCharacterRef.current = regenerateCharacterImage;
  regenerateCharacterWithModelRef.current = regenerateCharacterImageWithModel;
  uploadCharacterRef.current = uploadCharacterImage;
  regenerateSceneRef.current = regenerateSceneImage;
  regenerateSceneWithModelRef.current = regenerateSceneImageWithModel;
  uploadSceneRef.current = uploadSceneImage;
  regenerateVideoRef.current = regenerateVideo;
  regenerateVideoWithModelRef.current = regenerateVideoWithModel;

  return {
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
    regenerateCharacterRef,
    regenerateCharacterWithModelRef,
    uploadCharacterRef,
    regenerateSceneRef,
    regenerateSceneWithModelRef,
    uploadSceneRef,
    regenerateVideoRef,
    regenerateVideoWithModelRef,
  };
}
