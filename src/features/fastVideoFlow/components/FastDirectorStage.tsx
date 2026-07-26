import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

import type { VisualAspectRatio } from '../../../types.ts';
import type {
  FastDirectorCamera,
  FastDirectorBodyType,
  FastDirectorCharacter,
  FastDirectorObject,
  FastDirectorObjectPlacement,
  FastDirectorPlacement,
  FastDirectorPose,
} from '../types/fastTypes.ts';
import {
  applyUeMannequinPose,
  createUeMannequin,
  getUeMannequinLabelY,
} from '../services/fastDirectorUeMannequin.ts';

export type FastDirectorViewMode = 'director' | 'camera';
export type FastDirectorTransformMode = 'translate' | 'rotate' | 'scale';

export type FastDirectorStageHandle = {
  captureCameraView: () => string | null;
  focusCharacter: (characterId: string) => void;
  focusObject: (objectId: string) => void;
  useDirectorViewAsCamera: () => FastDirectorCamera | null;
};

type Props = {
  aspectRatio: VisualAspectRatio;
  camera: FastDirectorCamera;
  characters: FastDirectorCharacter[];
  objects: FastDirectorObject[];
  placements: FastDirectorPlacement[];
  objectPlacements: FastDirectorObjectPlacement[];
  selectedCharacterId: string | null;
  selectedObjectId: string | null;
  transformMode: FastDirectorTransformMode;
  viewMode: FastDirectorViewMode;
  onPlacementChange: (placement: FastDirectorPlacement) => void;
  onObjectPlacementChange: (placement: FastDirectorObjectPlacement) => void;
  onSelectCharacter: (characterId: string | null) => void;
  onSelectObject: (objectId: string | null) => void;
};

type Runtime = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  directorCamera: THREE.PerspectiveCamera;
  shotCamera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  transformControls: TransformControls;
  transformHelper: THREE.Object3D;
  grid: THREE.GridHelper;
  characterGroups: Map<string, THREE.Group>;
  objectGroups: Map<string, THREE.Group>;
  resizeObserver: ResizeObserver;
  animationFrame: number;
};

const ASPECT_VALUES: Record<VisualAspectRatio, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '21:9': 21 / 9,
};

const CAPTURE_SIZES: Record<VisualAspectRatio, [number, number]> = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1536, 1536],
  '4:3': [1600, 1200],
  '3:4': [1200, 1600],
  '21:9': [2100, 900],
};

function setMeshSelection(group: THREE.Group, selected: boolean) {
  const baseColor = typeof group.userData.color === 'string' ? group.userData.color : '#d8dde5';
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial) {
        // Selection must not replace the role color. The previous white
        // selection color made it look as if color was bound to another role.
        material.color.set(baseColor);
        material.emissive.set(selected ? '#244764' : '#000000');
        material.emissiveIntensity = selected ? 0.42 : 0;
      }
    });
  });
}

function setObjectSelection(group: THREE.Group, selected: boolean) {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) {
      return;
    }
    object.material.emissive.set(selected ? '#244764' : '#000000');
    object.material.emissiveIntensity = selected ? 0.42 : 0;
  });
}

const BODY_PRESETS: Record<FastDirectorBodyType, {
  scale: [number, number, number];
  torsoWidth: number;
  pelvisWidth: number;
  limbThickness: number;
  headScale: number;
}> = {
  mannequin: { scale: [1, 1, 1], torsoWidth: 1, pelvisWidth: 1, limbThickness: 1, headScale: 1 },
  female: { scale: [0.94, 0.97, 0.94], torsoWidth: 0.88, pelvisWidth: 1.08, limbThickness: 0.86, headScale: 0.98 },
  broad: { scale: [1.08, 1.04, 1.06], torsoWidth: 1.3, pelvisWidth: 1.16, limbThickness: 1.18, headScale: 1.04 },
  muscular: { scale: [1.04, 1.02, 1.02], torsoWidth: 1.24, pelvisWidth: 0.96, limbThickness: 1.28, headScale: 1 },
  slim: { scale: [0.9, 1.02, 0.92], torsoWidth: 0.78, pelvisWidth: 0.86, limbThickness: 0.72, headScale: 0.94 },
  teen: { scale: [0.86, 0.86, 0.88], torsoWidth: 0.88, pelvisWidth: 0.9, limbThickness: 0.82, headScale: 1.08 },
  child: { scale: [0.72, 0.69, 0.76], torsoWidth: 0.88, pelvisWidth: 0.9, limbThickness: 0.8, headScale: 1.32 },
  chibi: { scale: [0.62, 0.52, 0.68], torsoWidth: 0.94, pelvisWidth: 0.94, limbThickness: 0.78, headScale: 1.75 },
};

function makeJointedLimb(
  upperRadius: number,
  upperLength: number,
  lowerRadius: number,
  lowerLength: number,
  material: THREE.MeshStandardMaterial,
  endType: 'hand' | 'foot',
) {
  const root = new THREE.Group();
  const upper = new THREE.Mesh(
    new THREE.CapsuleGeometry(upperRadius, Math.max(0.05, upperLength - upperRadius * 2), 6, 12),
    material.clone(),
  );
  upper.position.y = -upperLength / 2;
  upper.castShadow = true;
  upper.receiveShadow = true;
  root.add(upper);

  const hinge = new THREE.Group();
  hinge.position.y = -upperLength;
  const joint = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(upperRadius, lowerRadius) * 1.03, 14, 10),
    material.clone(),
  );
  joint.castShadow = true;
  hinge.add(joint);
  const lower = new THREE.Mesh(
    new THREE.CapsuleGeometry(lowerRadius, Math.max(0.05, lowerLength - lowerRadius * 2), 6, 12),
    material.clone(),
  );
  lower.position.y = -lowerLength / 2;
  lower.castShadow = true;
  lower.receiveShadow = true;
  hinge.add(lower);
  const end = new THREE.Mesh(
    new THREE.SphereGeometry(endType === 'hand' ? lowerRadius * 1.18 : lowerRadius * 1.25, 14, 10),
    material.clone(),
  );
  end.position.set(0, -lowerLength, endType === 'foot' ? lowerRadius * 0.75 : 0);
  end.scale.set(
    endType === 'hand' ? 0.8 : 0.95,
    endType === 'hand' ? 1.25 : 0.62,
    endType === 'hand' ? 0.92 : 1.65,
  );
  end.castShadow = true;
  hinge.add(end);
  root.add(hinge);
  return { root, hinge };
}

function createCharacterLabel(text: string, y: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(12, 17, 24, 0.88)';
    context.beginPath();
    context.roundRect(18, 14, 476, 100, 34);
    context.fill();
    context.strokeStyle = 'rgba(148, 163, 184, 0.55)';
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = '#f8fafc';
    context.font = '600 42px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const clippedText = text.length > 18 ? `${text.slice(0, 17)}…` : text;
    context.fillText(clippedText, canvas.width / 2, canvas.height / 2 + 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }));
  sprite.position.y = y;
  sprite.scale.set(1.55, 0.39, 1);
  sprite.renderOrder = 30;
  return sprite;
}

function applyPose(group: THREE.Group, pose: FastDirectorPose) {
  if (group.userData.rigKind === 'ue4') {
    applyUeMannequinPose(
      group,
      (group.userData.bodyType || 'mannequin') as FastDirectorBodyType,
      pose,
    );
    group.userData.poseOffsetY = 0;
    return;
  }
  const joints = group.userData.joints as Record<string, THREE.Group> | undefined;
  if (!joints) {
    return;
  }

  Object.values(joints).forEach((joint) => joint.rotation.set(0, 0, 0));
  const torso = group.userData.torso as THREE.Group | undefined;
  const body = group.userData.body as THREE.Group | undefined;
  torso?.rotation.set(0, 0, 0);
  body?.rotation.set(0, 0, 0);
  group.userData.poseOffsetY = 0;
  const deg = THREE.MathUtils.degToRad;

  switch (pose) {
    case 't-pose':
      joints.leftArm.rotation.z = deg(-90);
      joints.rightArm.rotation.z = deg(90);
      break;
    case 'walk':
      joints.leftArm.rotation.x = deg(28);
      joints.rightArm.rotation.x = deg(-28);
      joints.leftLeg.rotation.x = deg(-26);
      joints.rightLeg.rotation.x = deg(26);
      joints.leftKnee.rotation.x = deg(12);
      torso?.rotation.set(deg(5), 0, deg(-2));
      break;
    case 'run':
      joints.leftArm.rotation.x = deg(48);
      joints.rightArm.rotation.x = deg(-48);
      joints.leftElbow.rotation.x = deg(-55);
      joints.rightElbow.rotation.x = deg(-55);
      joints.leftLeg.rotation.x = deg(-38);
      joints.rightLeg.rotation.x = deg(45);
      joints.leftKnee.rotation.x = deg(35);
      joints.rightKnee.rotation.x = deg(18);
      body?.rotation.set(deg(8), 0, 0);
      break;
    case 'sit':
      joints.leftLeg.rotation.x = deg(-82);
      joints.rightLeg.rotation.x = deg(-82);
      joints.leftKnee.rotation.x = deg(90);
      joints.rightKnee.rotation.x = deg(90);
      joints.leftArm.rotation.x = deg(-16);
      joints.rightArm.rotation.x = deg(-16);
      group.userData.poseOffsetY = -0.42;
      break;
    case 'crouch':
      body?.rotation.set(deg(18), 0, 0);
      joints.leftLeg.rotation.x = deg(-76);
      joints.rightLeg.rotation.x = deg(-76);
      joints.leftKnee.rotation.x = deg(112);
      joints.rightKnee.rotation.x = deg(112);
      joints.leftArm.rotation.x = deg(45);
      joints.rightArm.rotation.x = deg(45);
      joints.leftElbow.rotation.x = deg(-70);
      joints.rightElbow.rotation.x = deg(-70);
      group.userData.poseOffsetY = -0.45;
      break;
    case 'kneel-one':
      body?.rotation.set(deg(10), 0, 0);
      joints.leftLeg.rotation.x = deg(-62);
      joints.leftKnee.rotation.x = deg(88);
      joints.rightLeg.rotation.x = deg(12);
      joints.rightKnee.rotation.x = deg(92);
      group.userData.poseOffsetY = -0.4;
      break;
    case 'kneel-two':
      joints.leftLeg.rotation.x = deg(8);
      joints.rightLeg.rotation.x = deg(8);
      joints.leftKnee.rotation.x = deg(126);
      joints.rightKnee.rotation.x = deg(126);
      group.userData.poseOffsetY = -0.42;
      break;
    case 'hands-on-hips':
      joints.leftArm.rotation.set(deg(-30), 0, deg(-35));
      joints.rightArm.rotation.set(deg(-30), 0, deg(35));
      joints.leftElbow.rotation.x = deg(-92);
      joints.rightElbow.rotation.x = deg(-92);
      break;
    case 'lean':
      body?.rotation.set(0, 0, deg(-11));
      joints.leftLeg.rotation.z = deg(-7);
      joints.rightLeg.rotation.z = deg(7);
      break;
    case 'bow':
      body?.rotation.set(deg(46), 0, 0);
      joints.leftLeg.rotation.x = deg(-18);
      joints.rightLeg.rotation.x = deg(-18);
      break;
    case 'think':
      joints.rightArm.rotation.set(deg(42), 0, deg(18));
      joints.rightElbow.rotation.x = deg(-105);
      joints.leftArm.rotation.set(deg(-10), 0, deg(-22));
      joints.leftElbow.rotation.x = deg(-78);
      break;
    case 'fight':
      body?.rotation.set(deg(-5), deg(-10), 0);
      joints.leftArm.rotation.set(deg(55), 0, deg(-22));
      joints.rightArm.rotation.set(deg(38), 0, deg(18));
      joints.leftElbow.rotation.x = deg(-90);
      joints.rightElbow.rotation.x = deg(-88);
      joints.leftLeg.rotation.z = deg(-16);
      joints.rightLeg.rotation.z = deg(20);
      joints.rightKnee.rotation.x = deg(16);
      break;
    case 'kick':
      joints.rightLeg.rotation.x = deg(-74);
      joints.rightKnee.rotation.x = deg(28);
      joints.leftArm.rotation.x = deg(22);
      joints.rightArm.rotation.x = deg(-30);
      body?.rotation.set(0, 0, deg(-8));
      break;
    case 'throw':
      body?.rotation.set(deg(-5), deg(15), 0);
      joints.rightArm.rotation.set(deg(-115), 0, deg(18));
      joints.rightElbow.rotation.x = deg(-88);
      joints.leftArm.rotation.set(deg(34), 0, deg(-15));
      joints.leftElbow.rotation.x = deg(-48);
      joints.leftLeg.rotation.x = deg(-22);
      break;
    case 'push':
      body?.rotation.set(deg(12), deg(25), 0);
      joints.leftArm.rotation.set(deg(88), 0, deg(-10));
      joints.rightArm.rotation.set(deg(88), 0, deg(10));
      joints.leftLeg.rotation.x = deg(-35);
      joints.leftKnee.rotation.x = deg(38);
      joints.rightLeg.rotation.x = deg(18);
      group.userData.poseOffsetY = -0.12;
      break;
    case 'wave':
      joints.rightArm.rotation.set(deg(-52), 0, deg(35));
      joints.rightElbow.rotation.x = deg(-96);
      joints.leftArm.rotation.z = deg(-10);
      break;
    case 'reach':
      joints.rightArm.rotation.x = deg(88);
      joints.rightArm.rotation.z = deg(8);
      joints.rightElbow.rotation.x = deg(-12);
      torso?.rotation.set(0, deg(7), 0);
      break;
    case 'cross-arms':
      joints.leftArm.rotation.set(deg(64), deg(-18), deg(-38));
      joints.rightArm.rotation.set(deg(64), deg(18), deg(38));
      joints.leftElbow.rotation.x = deg(-80);
      joints.rightElbow.rotation.x = deg(-80);
      break;
    case 'phone':
      joints.rightArm.rotation.set(deg(38), 0, deg(18));
      joints.rightElbow.rotation.x = deg(-108);
      joints.leftArm.rotation.z = deg(-10);
      torso?.rotation.set(deg(4), 0, 0);
      break;
    default:
      break;
  }
}

function createWhiteMannequin(character: FastDirectorCharacter) {
  const root = new THREE.Group();
  root.name = character.name;
  root.userData.characterId = character.id;
  root.userData.bodyType = character.bodyType || 'mannequin';
  root.userData.color = character.color || '#d8dde5';
  root.userData.labelText = `${character.roleId} · ${character.name}`;
  const preset = BODY_PRESETS[character.bodyType || 'mannequin'];
  const body = new THREE.Group();
  body.scale.set(...preset.scale);
  root.add(body);
  root.userData.body = body;

  const material = new THREE.MeshStandardMaterial({
    color: character.color || '#d8dde5',
    roughness: 0.82,
    metalness: 0.02,
  });
  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = 1.23;
  body.add(torsoGroup);
  root.userData.torso = torsoGroup;

  const upperTorso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.24, 0.3, 8, 16),
    material.clone(),
  );
  upperTorso.position.y = 0.14;
  upperTorso.scale.set(1.22 * preset.torsoWidth, 1, 0.72);
  upperTorso.castShadow = true;
  upperTorso.receiveShadow = true;
  torsoGroup.add(upperTorso);
  const lowerTorso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.2, 0.22, 8, 16),
    material.clone(),
  );
  lowerTorso.position.y = -0.2;
  lowerTorso.scale.set(0.94 * preset.torsoWidth, 1, 0.7);
  lowerTorso.castShadow = true;
  lowerTorso.receiveShadow = true;
  torsoGroup.add(lowerTorso);

  const pelvis = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 20, 14),
    material.clone(),
  );
  pelvis.position.y = 0.83;
  pelvis.scale.set(preset.pelvisWidth, 0.72, 0.72);
  pelvis.castShadow = true;
  body.add(pelvis);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.095, 0.14, 14),
    material.clone(),
  );
  neck.position.y = 1.65;
  neck.castShadow = true;
  body.add(neck);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 24, 18),
    material.clone(),
  );
  head.position.set(0, 1.84, 0);
  head.scale.set(0.84 * preset.headScale, 1.08 * preset.headScale, 0.9 * preset.headScale);
  head.castShadow = true;
  body.add(head);
  const facePlate = new THREE.Mesh(
    new THREE.SphereGeometry(0.202, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.58),
    new THREE.MeshStandardMaterial({
      color: '#b8c0ca',
      roughness: 0.72,
      metalness: 0.02,
    }),
  );
  facePlate.position.set(0, 1.84, 0.025);
  facePlate.rotation.x = Math.PI / 2;
  facePlate.scale.set(0.7 * preset.headScale, 0.82 * preset.headScale, 0.42 * preset.headScale);
  facePlate.castShadow = true;
  body.add(facePlate);

  const joints: Record<string, THREE.Group> = {
    leftArm: new THREE.Group(),
    rightArm: new THREE.Group(),
    leftLeg: new THREE.Group(),
    rightLeg: new THREE.Group(),
    leftElbow: new THREE.Group(),
    rightElbow: new THREE.Group(),
    leftKnee: new THREE.Group(),
    rightKnee: new THREE.Group(),
  };

  joints.leftArm.position.set(-0.37 * preset.torsoWidth, 1.48, 0);
  joints.rightArm.position.set(0.37 * preset.torsoWidth, 1.48, 0);
  joints.leftLeg.position.set(-0.14, 0.78, 0);
  joints.rightLeg.position.set(0.14, 0.78, 0);
  const leftArm = makeJointedLimb(0.085 * preset.limbThickness, 0.36, 0.073 * preset.limbThickness, 0.34, material, 'hand');
  const rightArm = makeJointedLimb(0.085 * preset.limbThickness, 0.36, 0.073 * preset.limbThickness, 0.34, material, 'hand');
  const leftLeg = makeJointedLimb(0.105 * preset.limbThickness, 0.42, 0.092 * preset.limbThickness, 0.38, material, 'foot');
  const rightLeg = makeJointedLimb(0.105 * preset.limbThickness, 0.42, 0.092 * preset.limbThickness, 0.38, material, 'foot');
  [joints.leftArm, joints.rightArm].forEach((shoulder) => {
    const shoulderJoint = new THREE.Mesh(
      new THREE.SphereGeometry(0.105 * preset.limbThickness, 16, 12),
      material.clone(),
    );
    shoulderJoint.castShadow = true;
    shoulder.add(shoulderJoint);
  });
  joints.leftArm.add(leftArm.root);
  joints.rightArm.add(rightArm.root);
  joints.leftLeg.add(leftLeg.root);
  joints.rightLeg.add(rightLeg.root);
  joints.leftElbow = leftArm.hinge;
  joints.rightElbow = rightArm.hinge;
  joints.leftKnee = leftLeg.hinge;
  joints.rightKnee = rightLeg.hinge;
  body.add(joints.leftArm, joints.rightArm, joints.leftLeg, joints.rightLeg);
  root.userData.joints = joints;
  const label = createCharacterLabel(
    root.userData.labelText,
    Math.max(1.15, 2.26 * preset.scale[1] + (preset.headScale - 1) * 0.2),
  );
  label.userData.characterId = character.id;
  root.add(label);

  root.traverse((object) => {
    object.userData.characterId = character.id;
  });
  return root;
}

async function createGlbMannequin(character: FastDirectorCharacter) {
  const bodyType = character.bodyType || 'mannequin';
  const root = await createUeMannequin(bodyType, character.color || '#d8dde5');
  root.name = character.name;
  root.userData.characterId = character.id;
  root.userData.bodyType = bodyType;
  root.userData.color = character.color || '#d8dde5';
  root.userData.labelText = `${character.roleId} · ${character.name}`;
  const label = createCharacterLabel(root.userData.labelText, getUeMannequinLabelY(bodyType));
  label.userData.characterId = character.id;
  root.add(label);
  root.traverse((object) => {
    object.userData.characterId = character.id;
  });
  return root;
}

function createPrimitiveObject(object: FastDirectorObject) {
  const root = new THREE.Group();
  root.name = object.name;
  root.userData.objectId = object.id;
  const geometry = object.primitiveType === 'sphere'
    ? new THREE.SphereGeometry(0.5, 32, 20)
    : object.primitiveType === 'cylinder'
      ? new THREE.CylinderGeometry(0.45, 0.45, 1, 24)
      : object.primitiveType === 'cone'
        ? new THREE.ConeGeometry(0.5, 1, 24)
        : object.primitiveType === 'plane'
          ? new THREE.BoxGeometry(1.4, 0.08, 1.4)
          : new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: object.color,
      roughness: 0.78,
      metalness: 0.02,
    }),
  );
  mesh.position.y = object.primitiveType === 'plane' ? 0.04 : 0.5;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.objectId = object.id;
  root.add(mesh);
  return root;
}

function disposeObject(root: THREE.Object3D) {
  const preserveGeometry = root.userData.rigKind === 'ue4';
  root.traverse((object) => {
    if (object instanceof THREE.Sprite) {
      object.material.map?.dispose();
      object.material.dispose();
      return;
    }
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    if (!preserveGeometry) {
      object.geometry.dispose();
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
}

function applyPlacement(group: THREE.Group, placement: FastDirectorPlacement) {
  applyPose(group, placement.pose);
  const poseOffsetY = Number(group.userData.poseOffsetY || 0);
  group.position.set(
    placement.position[0],
    placement.position[1] + poseOffsetY,
    placement.position[2],
  );
  group.rotation.set(0, placement.rotationY, 0);
  group.scale.setScalar(placement.scale);
}

function applyObjectPlacement(group: THREE.Group, placement: FastDirectorObjectPlacement) {
  group.position.fromArray(placement.position);
  group.rotation.set(...placement.rotation);
  group.scale.fromArray(placement.scale);
}

export const FastDirectorStage = forwardRef<FastDirectorStageHandle, Props>(function FastDirectorStage({
  aspectRatio,
  camera,
  characters,
  objects,
  placements,
  objectPlacements,
  selectedCharacterId,
  selectedObjectId,
  transformMode,
  viewMode,
  onPlacementChange,
  onObjectPlacementChange,
  onSelectCharacter,
  onSelectObject,
}, forwardedRef) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const viewModeRef = useRef(viewMode);
  const aspectRatioRef = useRef(aspectRatio);
  const onPlacementChangeRef = useRef(onPlacementChange);
  const onObjectPlacementChangeRef = useRef(onObjectPlacementChange);
  const onSelectCharacterRef = useRef(onSelectCharacter);
  const onSelectObjectRef = useRef(onSelectObject);
  const charactersRef = useRef(characters);
  const selectedCharacterIdRef = useRef(selectedCharacterId);
  const placementsRef = useRef(placements);
  const objectPlacementsRef = useRef(objectPlacements);
  const glbLoadKeysRef = useRef(new Map<string, {
    key: string;
    runtime: Runtime;
  }>());

  viewModeRef.current = viewMode;
  aspectRatioRef.current = aspectRatio;
  onPlacementChangeRef.current = onPlacementChange;
  onObjectPlacementChangeRef.current = onObjectPlacementChange;
  onSelectCharacterRef.current = onSelectCharacter;
  onSelectObjectRef.current = onSelectObject;
  charactersRef.current = characters;
  selectedCharacterIdRef.current = selectedCharacterId;
  placementsRef.current = placements;
  objectPlacementsRef.current = objectPlacements;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#111419');
    scene.fog = new THREE.Fog('#111419', 13, 26);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    mount.appendChild(renderer.domElement);

    const directorCamera = new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 100);
    directorCamera.position.set(5.2, 3.6, 7.4);
    const shotCamera = new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 100);
    const controls = new OrbitControls(directorCamera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 1, 0);
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 2;
    controls.maxDistance = 22;

    const transformControls = new TransformControls(directorCamera, renderer.domElement);
    const transformHelper = transformControls.getHelper();
    scene.add(transformHelper);
    transformControls.setSize(0.72);
    transformControls.addEventListener('dragging-changed', (event) => {
      controls.enabled = viewModeRef.current === 'director' && !event.value;
    });
    transformControls.addEventListener('mouseUp', () => {
      const object = transformControls.object;
      const characterId = typeof object?.userData.characterId === 'string'
        ? object.userData.characterId
        : '';
      const previous = placementsRef.current.find((placement) => placement.characterId === characterId);
      if (object && previous) {
        onPlacementChangeRef.current({
          ...previous,
          position: [
            Number(object.position.x.toFixed(3)),
            Number((object.position.y - Number(object.userData.poseOffsetY || 0)).toFixed(3)),
            Number(object.position.z.toFixed(3)),
          ],
          rotationY: Number(object.rotation.y.toFixed(4)),
          scale: Number(object.scale.x.toFixed(3)),
        });
        return;
      }
      const objectId = typeof object?.userData.objectId === 'string' ? object.userData.objectId : '';
      const previousObject = objectPlacementsRef.current.find((placement) => placement.objectId === objectId);
      if (!object || !previousObject) {
        return;
      }
      onObjectPlacementChangeRef.current({
        ...previousObject,
        position: [
          Number(object.position.x.toFixed(3)),
          Number(object.position.y.toFixed(3)),
          Number(object.position.z.toFixed(3)),
        ],
        rotation: [
          Number(object.rotation.x.toFixed(4)),
          Number(object.rotation.y.toFixed(4)),
          Number(object.rotation.z.toFixed(4)),
        ],
        scale: [
          Number(object.scale.x.toFixed(3)),
          Number(object.scale.y.toFixed(3)),
          Number(object.scale.z.toFixed(3)),
        ],
      });
    });

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({
        color: '#1b2027',
        roughness: 0.94,
        metalness: 0,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(24, 24, '#52606f', '#29313a');
    grid.position.y = 0.003;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.42;
    });
    scene.add(grid);

    scene.add(new THREE.HemisphereLight('#c9dbf1', '#17191d', 1.75));
    const keyLight = new THREE.DirectionalLight('#fff4e4', 4.2);
    keyLight.position.set(5, 8, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -8;
    keyLight.shadow.camera.right = 8;
    keyLight.shadow.camera.top = 8;
    keyLight.shadow.camera.bottom = -8;
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight('#7fb9ff', 2.1);
    rimLight.position.set(-5, 4, -4);
    scene.add(rimLight);

    const characterGroups = new Map<string, THREE.Group>();
    const objectGroups = new Map<string, THREE.Group>();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown = { x: 0, y: 0 };

    const handlePointerDown = (event: PointerEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY };
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (viewModeRef.current !== 'director') {
        return;
      }
      if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) {
        return;
      }
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, directorCamera);
      const hit = raycaster.intersectObjects([
        ...characterGroups.values(),
        ...objectGroups.values(),
      ], true)[0];
      const characterId = typeof hit?.object.userData.characterId === 'string'
        ? hit.object.userData.characterId
        : null;
      const objectId = typeof hit?.object.userData.objectId === 'string'
        ? hit.object.userData.objectId
        : null;
      onSelectCharacterRef.current(characterId);
      onSelectObjectRef.current(objectId);
    };
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      directorCamera.aspect = width / height;
      directorCamera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const runtime: Runtime = {
      scene,
      renderer,
      directorCamera,
      shotCamera,
      controls,
      transformControls,
      transformHelper,
      grid,
      characterGroups,
      objectGroups,
      resizeObserver,
      animationFrame: 0,
    };
    runtimeRef.current = runtime;

    const animate = () => {
      controls.update();
      const activeCamera = viewModeRef.current === 'camera' ? shotCamera : directorCamera;
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.clear();
      if (viewModeRef.current === 'camera') {
        const targetAspect = ASPECT_VALUES[aspectRatioRef.current];
        const viewportWidth = width / height > targetAspect ? height * targetAspect : width;
        const viewportHeight = width / height > targetAspect ? height : width / targetAspect;
        const viewportX = (width - viewportWidth) / 2;
        const viewportY = (height - viewportHeight) / 2;
        renderer.setViewport(viewportX, viewportY, viewportWidth, viewportHeight);
        renderer.setScissor(viewportX, viewportY, viewportWidth, viewportHeight);
        renderer.setScissorTest(true);
      }
      renderer.render(scene, activeCamera);
      renderer.setScissorTest(false);
      runtime.animationFrame = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(runtime.animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      transformControls.detach();
      transformControls.dispose();
      controls.dispose();
      glbLoadKeysRef.current.forEach((request, characterId) => {
        if (request.runtime === runtime) {
          glbLoadKeysRef.current.delete(characterId);
        }
      });
      characterGroups.forEach((group) => disposeObject(group));
      objectGroups.forEach((group) => disposeObject(group));
      disposeObject(ground);
      renderer.dispose();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    const characterIds = new Set(characters.map((character) => character.id));

    runtime.characterGroups.forEach((group, characterId) => {
      if (characterIds.has(characterId)) {
        return;
      }
      glbLoadKeysRef.current.delete(characterId);
      runtime.scene.remove(group);
      disposeObject(group);
      runtime.characterGroups.delete(characterId);
    });

    characters.forEach((character) => {
      const existing = runtime.characterGroups.get(character.id);
      const labelText = `${character.roleId} · ${character.name}`;
      if (
        existing
        && existing.userData.rigKind === 'ue4'
        && existing.userData.bodyType === (character.bodyType || 'mannequin')
        && existing.userData.color === (character.color || '#d8dde5')
        && existing.userData.labelText === labelText
      ) {
        existing.name = character.name;
        return;
      }
      if (existing) {
        if (runtime.transformControls.object === existing) {
          runtime.transformControls.detach();
        }
        runtime.scene.remove(existing);
        disposeObject(existing);
        runtime.characterGroups.delete(character.id);
      }
      const loadKey = `${character.bodyType || 'mannequin'}|${character.color || '#d8dde5'}|${labelText}`;
      const pendingRequest = glbLoadKeysRef.current.get(character.id);
      if (pendingRequest?.key === loadKey && pendingRequest.runtime === runtime) {
        return;
      }
      const loadRequest = { key: loadKey, runtime };
      glbLoadKeysRef.current.set(character.id, loadRequest);
      void createGlbMannequin(character).then((glbGroup) => {
        const currentRuntime = runtimeRef.current;
        const currentCharacter = charactersRef.current.find((item) => item.id === character.id);
        const currentKey = currentCharacter
          ? `${currentCharacter.bodyType || 'mannequin'}|${currentCharacter.color || '#d8dde5'}|${currentCharacter.roleId} · ${currentCharacter.name}`
          : '';
        if (currentRuntime !== runtime || currentKey !== loadKey) {
          if (glbLoadKeysRef.current.get(character.id) === loadRequest) {
            glbLoadKeysRef.current.delete(character.id);
          }
          disposeObject(glbGroup);
          return;
        }
        const currentGroup = runtime.characterGroups.get(character.id);
        if (currentGroup) {
          if (runtime.transformControls.object === currentGroup) {
            runtime.transformControls.detach();
          }
          runtime.scene.remove(currentGroup);
          disposeObject(currentGroup);
        }
        runtime.characterGroups.set(character.id, glbGroup);
        runtime.scene.add(glbGroup);
        const placement = placementsRef.current.find((item) => item.characterId === character.id);
        glbGroup.visible = Boolean(placement);
        if (placement) {
          applyPlacement(glbGroup, placement);
        }
        const selected = selectedCharacterIdRef.current === character.id;
        setMeshSelection(glbGroup, selected);
        if (selected && viewModeRef.current === 'director') {
          runtime.transformControls.attach(glbGroup);
        }
        if (glbLoadKeysRef.current.get(character.id) === loadRequest) {
          glbLoadKeysRef.current.delete(character.id);
        }
      }).catch((error: unknown) => {
        if (glbLoadKeysRef.current.get(character.id) === loadRequest) {
          glbLoadKeysRef.current.delete(character.id);
        }
        console.warn('Failed to load UE mannequin; using procedural fallback.', error);
      });
    });
  }, [characters]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    const objectIds = new Set(objects.map((object) => object.id));
    runtime.objectGroups.forEach((group, objectId) => {
      if (objectIds.has(objectId)) {
        return;
      }
      runtime.scene.remove(group);
      disposeObject(group);
      runtime.objectGroups.delete(objectId);
    });
    objects.forEach((object) => {
      const existing = runtime.objectGroups.get(object.id);
      if (existing) {
        existing.name = object.name;
        existing.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.color.set(object.color);
          }
        });
        return;
      }
      const group = createPrimitiveObject(object);
      runtime.objectGroups.set(object.id, group);
      runtime.scene.add(group);
    });
  }, [objects]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    runtime.characterGroups.forEach((group) => {
      group.visible = false;
    });
    placements.forEach((placement) => {
      const group = runtime.characterGroups.get(placement.characterId);
      if (group) {
        group.visible = true;
        applyPlacement(group, placement);
      }
    });
  }, [characters, placements]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    runtime.objectGroups.forEach((group) => {
      group.visible = false;
    });
    objectPlacements.forEach((placement) => {
      const group = runtime.objectGroups.get(placement.objectId);
      if (group) {
        group.visible = true;
        applyObjectPlacement(group, placement);
      }
    });
  }, [objectPlacements, objects]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    runtime.characterGroups.forEach((group, characterId) => {
      setMeshSelection(group, characterId === selectedCharacterId);
    });
    runtime.objectGroups.forEach((group, objectId) => {
      setObjectSelection(group, objectId === selectedObjectId);
    });
    const selectedGroup = selectedCharacterId
      ? runtime.characterGroups.get(selectedCharacterId)
      : selectedObjectId
        ? runtime.objectGroups.get(selectedObjectId)
        : null;
    if (selectedGroup && viewMode === 'director') {
      runtime.transformControls.attach(selectedGroup);
    } else {
      runtime.transformControls.detach();
    }
  }, [characters, objects, selectedCharacterId, selectedObjectId, viewMode]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    runtime.transformControls.setMode(transformMode);
  }, [transformMode]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    runtime.shotCamera.position.fromArray(camera.position);
    runtime.shotCamera.fov = camera.fov;
    runtime.shotCamera.aspect = ASPECT_VALUES[aspectRatio];
    runtime.shotCamera.lookAt(new THREE.Vector3(...camera.target));
    runtime.shotCamera.updateProjectionMatrix();
  }, [aspectRatio, camera]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    runtime.controls.enabled = viewMode === 'director';
    runtime.grid.visible = viewMode === 'director';
    runtime.transformHelper.visible = viewMode === 'director' && Boolean(selectedCharacterId || selectedObjectId);
  }, [selectedCharacterId, selectedObjectId, viewMode]);

  useImperativeHandle(forwardedRef, () => ({
    captureCameraView() {
      const runtime = runtimeRef.current;
      const mount = mountRef.current;
      if (!runtime || !mount) {
        return null;
      }

      const [captureWidth, captureHeight] = CAPTURE_SIZES[aspectRatio];
      const helperWasVisible = runtime.transformHelper.visible;
      const gridWasVisible = runtime.grid.visible;
      const originalPixelRatio = runtime.renderer.getPixelRatio();
      runtime.transformHelper.visible = false;
      runtime.grid.visible = false;
      runtime.renderer.setPixelRatio(1);
      runtime.renderer.setSize(captureWidth, captureHeight, false);
      runtime.renderer.setViewport(0, 0, captureWidth, captureHeight);
      runtime.renderer.setScissorTest(false);
      runtime.shotCamera.aspect = captureWidth / captureHeight;
      runtime.shotCamera.updateProjectionMatrix();
      runtime.renderer.render(runtime.scene, runtime.shotCamera);
      const dataUrl = runtime.renderer.domElement.toDataURL('image/png');
      runtime.renderer.setPixelRatio(originalPixelRatio);
      runtime.renderer.setSize(
        Math.max(1, mount.clientWidth),
        Math.max(1, mount.clientHeight),
        false,
      );
      runtime.transformHelper.visible = helperWasVisible;
      runtime.grid.visible = gridWasVisible;
      return dataUrl;
    },
    focusCharacter(characterId) {
      const runtime = runtimeRef.current;
      const group = runtime?.characterGroups.get(characterId);
      if (!runtime || !group) {
        return;
      }
      const target = group.position.clone().add(new THREE.Vector3(0, 1, 0));
      runtime.controls.target.copy(target);
      const direction = runtime.directorCamera.position.clone().sub(runtime.controls.target).normalize();
      runtime.directorCamera.position.copy(target.clone().add(direction.multiplyScalar(4.2)));
      runtime.controls.update();
    },
    focusObject(objectId) {
      const runtime = runtimeRef.current;
      const group = runtime?.objectGroups.get(objectId);
      if (!runtime || !group) {
        return;
      }
      const target = group.position.clone().add(new THREE.Vector3(0, 0.5, 0));
      runtime.controls.target.copy(target);
      const direction = runtime.directorCamera.position.clone().sub(runtime.controls.target).normalize();
      runtime.directorCamera.position.copy(target.clone().add(direction.multiplyScalar(3.6)));
      runtime.controls.update();
    },
    useDirectorViewAsCamera() {
      const runtime = runtimeRef.current;
      if (!runtime) {
        return null;
      }
      return {
        position: runtime.directorCamera.position
          .toArray()
          .map((value) => Number(value.toFixed(4))) as [number, number, number],
        target: runtime.controls.target
          .toArray()
          .map((value) => Number(value.toFixed(4))) as [number, number, number],
        fov: Number(runtime.directorCamera.fov.toFixed(2)),
      };
    },
  }), [aspectRatio]);

  return (
    <div
      ref={mountRef}
      className="h-full min-h-0 w-full overflow-hidden bg-[#111419]"
      aria-label="3D 白模导演台画布"
    />
  );
});
