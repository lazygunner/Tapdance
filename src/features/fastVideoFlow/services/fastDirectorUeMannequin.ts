import {
  Box3,
  Color,
  Euler,
  Group,
  MathUtils,
  MeshStandardMaterial,
  Quaternion,
  type Material,
  type Object3D,
  type SkinnedMesh,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

import type {
  FastDirectorBodyType,
  FastDirectorPose,
} from '../types/fastTypes.ts';

// Adapted from storyai-3d-director-desk at commit
// 8c8bd361790be4d37158a7430365e65546e358fe (MIT).
const BONE = {
  body: 'Bip001_Pelvis_03',
  torso: 'Bip001_Spine1_05',
  head: 'Bip001_Head_055',
  leftShoulder: 'Bip001_L_UpperArm_08',
  rightShoulder: 'Bip001_R_UpperArm_032',
  leftElbow: 'Bip001_L_Forearm_09',
  rightElbow: 'Bip001_R_Forearm_033',
  leftHand: 'Bip001_L_Hand_010',
  rightHand: 'Bip001_R_Hand_034',
  leftHip: 'Bip001_L_Thigh_057',
  rightHip: 'Bip001_R_Thigh_061',
  leftKnee: 'Bip001_L_Calf_058',
  rightKnee: 'Bip001_R_Calf_062',
  leftFoot: 'Bip001_L_Foot_059',
  rightFoot: 'Bip001_R_Foot_063',
} as const;

type RestTransform = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
};
type RestPose = Record<string, RestTransform>;
type Tuple = [number, number, number];

const POSE_CONTROLS: Record<FastDirectorPose, Record<string, number>> = {
  stand: {},
  't-pose': { 'leftShoulder.spread': -70, 'rightShoulder.spread': 70, 'leftShoulder.pitch': 15, 'rightShoulder.pitch': 15, 'leftElbow.bend': 10, 'rightElbow.bend': 10 },
  walk: { 'leftShoulder.pitch': 20, 'rightShoulder.pitch': -20, 'leftHip.pitch': -20, 'rightHip.pitch': 20, 'leftKnee.bend': 12, 'rightKnee.bend': 4 },
  run: { 'leftShoulder.pitch': 42, 'rightShoulder.pitch': -42, 'leftHip.pitch': -35, 'rightHip.pitch': 40, 'leftKnee.bend': 28, 'rightKnee.bend': 18 },
  sit: { 'torso.pitch': -10, 'leftHip.pitch': 80, 'rightHip.pitch': 80, 'leftKnee.bend': 90, 'rightKnee.bend': 90 },
  crouch: { 'body.offsetY': -0.43, 'body.pitch': -26, 'torso.pitch': -24, 'head.pitch': 22, 'leftHip.pitch': 92, 'rightHip.pitch': 92, 'leftKnee.bend': 112, 'rightKnee.bend': 112, 'leftShoulder.pitch': 52, 'rightShoulder.pitch': 50, 'leftElbow.bend': 80, 'rightElbow.bend': 76 },
  'kneel-one': { 'body.offsetY': -0.42, 'body.pitch': -16, 'torso.pitch': -10, 'head.pitch': 12, 'leftHip.pitch': 68, 'leftKnee.bend': 86, 'leftFoot.pitch': 20, 'rightHip.pitch': -15, 'rightKnee.bend': 80, 'rightFoot.pitch': 60, 'leftElbow.bend': 30, 'rightShoulder.pitch': -18 },
  'kneel-two': { 'body.offsetY': -0.4, 'body.pitch': 2, 'torso.pitch': 8, 'leftShoulder.pitch': -10, 'rightShoulder.pitch': -10, 'leftHip.pitch': -8, 'rightHip.pitch': -8, 'leftKnee.bend': 126, 'rightKnee.bend': 126, 'leftFoot.pitch': -20, 'rightFoot.pitch': -20 },
  'hands-on-hips': { 'leftShoulder.pitch': -36, 'rightShoulder.pitch': -36, 'leftShoulder.twist': 80, 'rightShoulder.twist': -80, 'leftElbow.bend': 86, 'rightElbow.bend': 86, 'leftHand.roll': -35, 'rightHand.roll': 35 },
  lean: { 'body.roll': -10, 'leftHip.spread': -8, 'rightHip.spread': 8, 'head.roll': 6 },
  bow: { 'body.pitch': -46, 'torso.pitch': -10, 'head.pitch': 20, 'leftHip.pitch': 49, 'rightHip.pitch': 49, 'leftShoulder.spread': 10, 'rightShoulder.spread': -10, 'leftElbow.bend': 12, 'rightElbow.bend': 12 },
  think: { 'rightShoulder.pitch': 8, 'rightShoulder.twist': -40, 'rightElbow.bend': 90, 'rightHand.roll': -40, 'rightHand.pitch': 15, 'leftShoulder.pitch': 8, 'leftShoulder.twist': 40, 'leftElbow.bend': 90 },
  fight: { 'body.yaw': -10, 'body.pitch': 5, 'torso.yaw': 8, 'head.yaw': 8, 'leftShoulder.pitch': 48, 'leftShoulder.spread': -16, 'leftShoulder.twist': 22, 'rightShoulder.pitch': 30, 'rightShoulder.twist': -22, 'leftElbow.bend': 86, 'rightElbow.bend': 84, 'leftHip.spread': -18, 'rightHip.spread': 22, 'leftKnee.bend': 12, 'rightKnee.bend': 18 },
  kick: { 'leftHip.pitch': -8, 'rightHip.pitch': 58, 'rightKnee.bend': 35, 'leftShoulder.pitch': 18, 'rightShoulder.pitch': -24 },
  throw: { 'body.offsetY': -0.12, 'body.pitch': 5, 'body.yaw': 14, 'torso.yaw': -10, 'head.yaw': 8, 'rightShoulder.pitch': 76, 'rightShoulder.spread': -14, 'rightShoulder.twist': 28, 'rightElbow.bend': 86, 'leftShoulder.pitch': 34, 'leftElbow.bend': 54, 'leftHip.pitch': 24, 'rightHip.pitch': -10, 'leftKnee.bend': 30, 'rightKnee.bend': 14 },
  push: { 'body.offsetY': -0.16, 'body.pitch': 5, 'body.yaw': 38, 'torso.pitch': -4, 'head.pitch': 6, 'leftShoulder.pitch': 92, 'rightShoulder.pitch': 92, 'leftShoulder.spread': -11, 'rightShoulder.spread': 11, 'leftElbow.bend': 6, 'rightElbow.bend': 6, 'leftHip.pitch': 38, 'rightHip.pitch': -20, 'leftKnee.bend': 42, 'rightKnee.bend': 20 },
  wave: { 'rightShoulder.pitch': 60, 'rightShoulder.twist': 30, 'rightElbow.bend': 90, 'rightHand.roll': -20, 'rightHand.pitch': 12, 'leftShoulder.pitch': -10, 'leftElbow.bend': 18 },
  reach: { 'rightShoulder.pitch': 50, 'rightElbow.bend': 12 },
  'cross-arms': { 'leftShoulder.pitch': 50, 'leftShoulder.spread': -55, 'leftShoulder.twist': 75, 'leftElbow.bend': 50, 'rightShoulder.pitch': 90, 'rightShoulder.spread': 55, 'rightShoulder.twist': -45, 'rightElbow.bend': 50 },
  phone: { 'head.pitch': 18, 'rightShoulder.pitch': 20, 'rightShoulder.spread': -4, 'rightShoulder.twist': -30, 'rightElbow.bend': 82, 'rightHand.roll': -30, 'rightHand.pitch': 14, 'rightHand.twist': 60, 'leftShoulder.pitch': -10, 'leftElbow.bend': 16 },
};

let templatePromise: Promise<Group> | null = null;

function modelUrl() {
  return new URL('./models/ue-mannequin-retopology.glb', window.location.href).toString();
}

function isSkinnedMesh(object: Object3D): object is SkinnedMesh {
  return 'isSkinnedMesh' in object && object.isSkinnedMesh === true;
}

function cloneMaterial(material: Material | Material[]) {
  return Array.isArray(material) ? material.map((item) => item.clone()) : material.clone();
}

function prepareMaterials(scene: Object3D, color: string) {
  scene.traverse((object) => {
    object.frustumCulled = false;
    if (!isSkinnedMesh(object)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.material = cloneMaterial(object.material);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material instanceof MeshStandardMaterial && material.name !== 'SK_Mannequin_M_UE4Man_ChestLogo') {
        material.color.copy(new Color(color));
        material.roughness = 0.68;
        material.metalness = 0.04;
      }
    });
  });
}

function loadTemplate() {
  if (!templatePromise) {
    templatePromise = new Promise<Group>((resolve, reject) => {
      const loader = new GLTFLoader();
      if (window.electronAPI?.isElectron && typeof window.electronAPI.readBundledModel === 'function') {
        window.electronAPI.readBundledModel('ue-mannequin-retopology.glb')
          .then((base64) => {
            const binary = window.atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) {
              bytes[index] = binary.charCodeAt(index);
            }
            loader.parse(bytes.buffer, '', (gltf) => resolve(gltf.scene), reject);
          })
          .catch(reject);
        return;
      }
      loader.load(modelUrl(), (gltf) => resolve(gltf.scene), undefined, reject);
    });
    void templatePromise.catch(() => {
      templatePromise = null;
    });
  }
  return templatePromise;
}

function captureRestPose(scene: Object3D) {
  const restPose: RestPose = {};
  scene.traverse((object) => {
    if (!('isBone' in object) || object.isBone !== true) return;
    restPose[object.name] = {
      position: object.position.toArray() as Tuple,
      quaternion: object.quaternion.toArray() as [number, number, number, number],
      scale: object.scale.toArray() as Tuple,
    };
  });
  return restPose;
}

function bodyModelScale(bodyType: FastDirectorBodyType): Tuple {
  if (bodyType === 'teen') return [0.88, 0.88, 0.88];
  if (bodyType === 'child') return [0.72, 0.72, 0.72];
  if (bodyType === 'chibi') return [0.56, 0.56, 0.56];
  return [1, 1, 1];
}

export function getUeMannequinLabelY(bodyType: FastDirectorBodyType) {
  if (bodyType === 'female' || bodyType === 'slim') return 2.18;
  if (bodyType === 'broad' || bodyType === 'muscular') return 2.28;
  if (bodyType === 'teen') return 1.98;
  if (bodyType === 'child') return 1.66;
  if (bodyType === 'chibi') return 1.38;
  return 2.24;
}

function bodyBoneScales(bodyType: FastDirectorBodyType): Record<string, Tuple> {
  const scales: Record<string, Tuple> = {};
  if (bodyType === 'female') {
    scales[BONE.body] = [1, 1.04, 1.04];
    scales[BONE.torso] = [0.98, 1, 1];
    scales[BONE.leftShoulder] = [0.9, 0.9, 0.9];
    scales[BONE.rightShoulder] = [0.9, 0.9, 0.9];
    scales[BONE.leftHip] = [1, 0.96, 0.96];
    scales[BONE.rightHip] = [1, 0.96, 0.96];
  } else if (bodyType === 'broad') {
    scales[BONE.body] = [1.02, 1.12, 1.08];
    scales[BONE.torso] = [1.02, 1.22, 1.1];
    scales[BONE.leftShoulder] = [1, 1.12, 1.12];
    scales[BONE.rightShoulder] = [1, 1.12, 1.12];
  } else if (bodyType === 'muscular') {
    scales[BONE.torso] = [1.02, 1.26, 1.1];
    scales[BONE.leftShoulder] = [1, 1.18, 1.18];
    scales[BONE.rightShoulder] = [1, 1.18, 1.18];
    scales[BONE.leftHip] = [1, 1.12, 1.12];
    scales[BONE.rightHip] = [1, 1.12, 1.12];
  } else if (bodyType === 'slim') {
    scales[BONE.body] = [0.98, 0.75, 0.9];
    scales[BONE.leftShoulder] = [0.96, 0.82, 0.82];
    scales[BONE.rightShoulder] = [0.96, 0.82, 0.82];
    scales[BONE.leftHip] = [1, 0.84, 0.84];
    scales[BONE.rightHip] = [1, 0.84, 0.84];
  } else if (bodyType === 'teen') {
    scales[BONE.head] = [1.12, 1.12, 1.12];
  } else if (bodyType === 'child') {
    scales[BONE.head] = [1.34, 1.34, 1.34];
    scales[BONE.torso] = [0.84, 0.86, 0.86];
  } else if (bodyType === 'chibi') {
    scales[BONE.head] = [4, 4, 4];
    scales[BONE.body] = [0.92, 1.22, 1.22];
    scales[BONE.torso] = [1, 0.9, 0.9];
    scales[BONE.leftShoulder] = [1.2, 1.3, 1.3];
    scales[BONE.rightShoulder] = [1.2, 1.3, 1.3];
    scales[BONE.leftHip] = [0.62, 0.8, 0.8];
    scales[BONE.rightHip] = [0.62, 0.8, 0.8];
  }
  return scales;
}

function radians(value: number) {
  return MathUtils.degToRad(Math.max(-180, Math.min(180, value)));
}

// The source rig uses UE bone axes, which differ from the editor's world axes.
function poseRotations(controls: Record<string, number>): Record<string, Tuple> {
  const spine = (prefix: string): Tuple => [
    radians(controls[`${prefix}.yaw`] ?? 0),
    radians(controls[`${prefix}.roll`] ?? 0),
    -radians(controls[`${prefix}.pitch`] ?? 0),
  ];
  const shoulder = (prefix: string): Tuple => [
    radians(controls[`${prefix}.twist`] ?? 0),
    radians(controls[`${prefix}.spread`] ?? 0),
    -radians(controls[`${prefix}.pitch`] ?? 0),
  ];
  const hip = (prefix: string): Tuple => [
    radians(controls[`${prefix}.twist`] ?? 0),
    -radians(controls[`${prefix}.spread`] ?? 0),
    radians(controls[`${prefix}.pitch`] ?? 0),
  ];
  const handOrFoot = (prefix: string): Tuple => [
    radians(controls[`${prefix}.twist`] ?? 0),
    radians(controls[`${prefix}.roll`] ?? 0),
    radians(controls[`${prefix}.pitch`] ?? 0),
  ];
  return {
    [BONE.body]: spine('body'),
    [BONE.torso]: spine('torso'),
    [BONE.head]: [radians(controls['head.yaw'] ?? 0), radians(controls['head.roll'] ?? 0), radians(controls['head.pitch'] ?? 0)],
    [BONE.leftShoulder]: shoulder('leftShoulder'),
    [BONE.rightShoulder]: shoulder('rightShoulder'),
    [BONE.leftElbow]: [0, 0, -radians(controls['leftElbow.bend'] ?? 0)],
    [BONE.rightElbow]: [0, 0, -radians(controls['rightElbow.bend'] ?? 0)],
    [BONE.leftHand]: handOrFoot('leftHand'),
    [BONE.rightHand]: handOrFoot('rightHand'),
    [BONE.leftHip]: hip('leftHip'),
    [BONE.rightHip]: hip('rightHip'),
    [BONE.leftKnee]: [0, 0, -radians(controls['leftKnee.bend'] ?? 0)],
    [BONE.rightKnee]: [0, 0, -radians(controls['rightKnee.bend'] ?? 0)],
    [BONE.leftFoot]: handOrFoot('leftFoot'),
    [BONE.rightFoot]: handOrFoot('rightFoot'),
  };
}

function applyRotation(object: Object3D, rotation: Tuple) {
  object.quaternion.multiply(new Quaternion().setFromEuler(new Euler(...rotation)));
}

export function applyUeMannequinPose(
  group: Group,
  bodyType: FastDirectorBodyType,
  pose: FastDirectorPose,
) {
  const scene = group.userData.ueScene as Group | undefined;
  const restPose = group.userData.ueRestPose as RestPose | undefined;
  if (!scene || !restPose) return;
  const controls = POSE_CONTROLS[pose] || {};
  const scales = bodyBoneScales(bodyType);
  const rotations = poseRotations(controls);
  scene.traverse((object) => {
    const rest = restPose[object.name];
    if (!rest) return;
    object.position.fromArray(rest.position);
    object.quaternion.fromArray(rest.quaternion);
    object.scale.fromArray(rest.scale);
    const scale = scales[object.name];
    if (scale) {
      object.scale.set(rest.scale[0] * scale[0], rest.scale[1] * scale[1], rest.scale[2] * scale[2]);
    }
    if (object.name === BONE.body && controls['body.offsetY']) {
      object.position.z += controls['body.offsetY'] / 0.0254;
    }
    if (object.name === BONE.leftShoulder) applyRotation(object, [0, radians(25), 0]);
    if (object.name === BONE.rightShoulder) applyRotation(object, [0, radians(-25), 0]);
    if (object.name === BONE.leftElbow || object.name === BONE.rightElbow) {
      applyRotation(object, [0, 0, radians(25)]);
    }
    const rotation = rotations[object.name];
    if (rotation) applyRotation(object, rotation);
  });
  const modelScale = bodyModelScale(bodyType);
  // The GLB root is already authored in Three.js world metres (about 1.82 m
  // tall). 0.0254 is only used above when converting world-space pose offsets
  // into this asset's Bip001 bone-local units.
  scene.scale.set(...modelScale);
  scene.updateMatrixWorld(true);
}

export async function createUeMannequin(bodyType: FastDirectorBodyType, color = '#d8dde5') {
  let template: Group;
  try {
    template = await loadTemplate();
  } catch {
    template = await loadTemplate();
  }
  const scene = cloneSkeleton(template) as Group;
  prepareMaterials(scene, color);
  const group = new Group();
  group.userData.rigKind = 'ue4';
  group.userData.ueScene = scene;
  group.userData.ueRestPose = captureRestPose(scene);
  group.add(scene);
  applyUeMannequinPose(group, bodyType, 'stand');
  const bounds = new Box3().setFromObject(scene, true);
  if (!bounds.isEmpty() && Number.isFinite(bounds.min.y)) {
    scene.position.y -= bounds.min.y;
  }
  return group;
}
