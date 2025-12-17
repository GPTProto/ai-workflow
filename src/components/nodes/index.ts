import WorkflowNode from './WorkflowNode';
import SmallNode from './SmallNode';
import ImageNode from './ImageNode';
import VideoNode from './VideoNode';
import MergeNode from './MergeNode';
import CharacterNode from './CharacterNode';
import SceneNode from './SceneNode';

export const nodeTypes = {
  workflowNode: WorkflowNode,
  smallNode: SmallNode,
  imageNode: ImageNode,
  videoNode: VideoNode,
  mergeNode: MergeNode,
  characterNode: CharacterNode,
  sceneNode: SceneNode,
};

export { WorkflowNode, SmallNode, ImageNode, VideoNode, MergeNode, CharacterNode, SceneNode };
