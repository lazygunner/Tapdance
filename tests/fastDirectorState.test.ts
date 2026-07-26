import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createFastDirectorCharacters,
  createPromptBasedDirectorPlacements,
  inferPromptCharacterLayout,
  normalizeFastDirectorState,
} from '../src/features/fastVideoFlow/services/fastDirectorState.ts';
import {
  createDefaultFastSeedanceDraft,
  createEmptyFastVideoProject,
  normalizeFastVideoProject,
  syncFastFlowSeedanceDraft,
} from '../src/features/fastVideoFlow/services/fastFlowMappers.ts';

test('createFastDirectorCharacters maps confirmed person references to stable white models', () => {
  const characters = createFastDirectorCharacters([
    {
      id: 'person-a',
      imageUrl: 'https://example.com/a.png',
      referenceType: 'person',
      description: '主角',
    },
    {
      id: 'scene-a',
      imageUrl: 'https://example.com/scene.png',
      referenceType: 'scene',
    },
  ]);

  assert.deepEqual(characters, [{
    id: 'director-character-person-a',
    roleId: '角色1',
      bodyType: 'mannequin',
      color: '#4f8cff',
    sourceReferenceId: 'person-a',
    name: '主角',
    referenceImageUrl: 'https://example.com/a.png',
  }]);
});

test('normalizeFastDirectorState preserves all 8 body types and 20 pose presets', () => {
  const bodyTypes = ['mannequin', 'female', 'broad', 'muscular', 'slim', 'teen', 'child', 'chibi'] as const;
  const poses = [
    'stand', 't-pose', 'walk', 'run', 'sit', 'crouch', 'kneel-one', 'kneel-two',
    'hands-on-hips', 'lean', 'bow', 'think', 'fight', 'kick', 'throw', 'push',
    'wave', 'reach', 'cross-arms', 'phone',
  ] as const;
  const scene = {
    id: 'scene-1',
    title: '群像',
    summary: '',
    imagePrompt: '',
    continuityAnchors: [],
  };
  const characters = poses.map((_, index) => ({
    id: `character-${index + 1}`,
    roleId: `角色${index + 1}`,
    bodyType: bodyTypes[index % bodyTypes.length],
    name: bodyTypes[index % bodyTypes.length],
  }));
  const director = normalizeFastDirectorState({
    characters,
    scenes: [{
      sceneId: scene.id,
      placements: poses.map((pose, index) => ({
        characterId: characters[index].id,
        position: [index, 0, 0],
        rotationY: 0,
        scale: 1,
        pose,
      })),
    }],
  }, [], [scene]);

  assert.deepEqual(director.characters.slice(0, bodyTypes.length).map((character) => character.bodyType), bodyTypes);
  assert.deepEqual(
    new Set(director.scenes[0].placements.map((placement) => placement.pose)),
    new Set(poses),
  );
});

test('normalizeFastDirectorState creates one default white model without person references', () => {
  const scenes = [{
    id: 'scene-1',
    title: '分镜 1',
    summary: '',
    imagePrompt: '',
    continuityAnchors: [],
  }];
  const director = normalizeFastDirectorState(null, [], scenes);

  assert.equal(director.activeSceneId, 'scene-1');
  assert.equal(director.characters.length, 1);
  assert.equal(director.scenes.length, 1);
  assert.equal(director.scenes[0].placements[0].characterId, director.characters[0].id);
});

test('normalizeFastDirectorState preserves scene layout and adds newly confirmed characters', () => {
  const references = [
    {
      id: 'person-a',
      imageUrl: 'https://example.com/a.png',
      referenceType: 'person' as const,
      description: '角色 A',
    },
    {
      id: 'person-b',
      imageUrl: 'https://example.com/b.png',
      referenceType: 'person' as const,
      description: '角色 B',
    },
  ];
  const scenes = [{
    id: 'scene-1',
    title: '分镜 1',
    summary: '',
    imagePrompt: '',
    continuityAnchors: [],
  }];
  const director = normalizeFastDirectorState({
    activeSceneId: 'scene-1',
    characters: [{
      id: 'director-character-person-a',
      roleId: '角色1',
      sourceReferenceId: 'person-a',
      name: '旧名称',
    }],
    scenes: [{
      sceneId: 'scene-1',
      placements: [{
        characterId: 'director-character-person-a',
        position: [2, 0, -1],
        rotationY: 1,
        scale: 1.2,
        pose: 'walk',
      }],
      camera: {
        position: [3, 2, 4],
        target: [0, 1, 0],
        fov: 50,
      },
      captures: [],
      updatedAt: '2026-07-26T00:00:00.000Z',
    }],
  }, references, scenes);

  assert.equal(director.characters.length, 2);
  assert.equal(director.characters[0].name, '旧名称');
  assert.deepEqual(director.scenes[0].placements[0].position, [2, 0, -1]);
  assert.equal(director.scenes[0].placements[1].characterId, 'director-character-person-b');
});

test('planned storyboard characters create stable white models and per-scene cast', () => {
  const plannedCharacters = [
    { id: '角色1', name: '侦探', description: '穿风衣的调查者' },
    { id: '角色2', name: '店员', description: '咖啡店店员' },
  ];
  const scenes = [{
    id: 'scene-1',
    title: '对话',
    summary: '',
    imagePrompt: '',
    continuityAnchors: [],
    characterIds: ['角色2'],
  }];
  const director = normalizeFastDirectorState(null, [], scenes, plannedCharacters);

  assert.deepEqual(director.characters.map((character) => character.roleId), ['角色1', '角色2']);
  assert.deepEqual(director.scenes[0].placements.map((placement) => placement.characterId), [
    'director-character-plan-角色2',
  ]);
});

test('planned storyboard characters replace temporary director placeholders', () => {
  const plannedCharacters = [
    { id: '角色1', name: '郭靖', description: '主角' },
    { id: '角色2', name: '黄蓉', description: '主角同伴' },
  ];
  const scenes = [{
    id: 'scene-1',
    title: '交战',
    summary: '',
    imagePrompt: '',
    continuityAnchors: [],
    characterIds: ['角色1', '角色2'],
    directorLayout: {
      characters: [{
        roleId: '角色1',
        position: [-0.4, 0, 0] as [number, number, number],
        rotationY: 0,
        scale: 1,
        pose: 'fight' as const,
      }, {
        roleId: '角色2',
        position: [0.4, 0, 0] as [number, number, number],
        rotationY: Math.PI,
        scale: 1,
        pose: 'fight' as const,
      }],
      camera: {
        position: [0, 1.6, 5] as [number, number, number],
        target: [0, 1, 0] as [number, number, number],
        fov: 40,
      },
    },
  }];
  const director = normalizeFastDirectorState({
    characters: [{
      id: 'director-character-default',
      roleId: '角色1',
      name: '角色 1',
    }, {
      id: 'director-character-preview-scene-1-2',
      roleId: '角色2',
      name: '临时角色 2',
    }],
    scenes: [{
      sceneId: 'scene-1',
      placements: [{
        characterId: 'director-character-default',
        position: [9, 0, 9],
        rotationY: 0,
        scale: 1,
        pose: 'stand',
      }],
    }],
  }, [], scenes, plannedCharacters);

  assert.deepEqual(director.characters.map((character) => character.name), ['郭靖', '黄蓉']);
  assert.deepEqual(
    director.scenes[0].placements.map((placement) => placement.characterId),
    ['director-character-plan-角色1', 'director-character-plan-角色2'],
  );
  assert.equal(new Set(director.characters.map((character) => character.roleId)).size, 2);
});

test('deleted planned characters stay deleted and primitive objects are normalized', () => {
  const scenes = [{
    id: 'scene-1',
    title: '场景',
    summary: '',
    imagePrompt: '',
    continuityAnchors: [],
    characterIds: ['角色1'],
  }];
  const director = normalizeFastDirectorState({
    deletedCharacterIds: ['director-character-plan-角色1'],
    objects: [{
      id: 'object-1',
      name: '桌子占位',
      primitiveType: 'box',
      color: '#abcdef',
    }],
    scenes: [{
      sceneId: 'scene-1',
      placements: [],
      objectPlacements: [{
        objectId: 'object-1',
        position: [1, 0, 2],
        rotation: [0, 0.5, 0],
        scale: [2, 0.8, 1],
      }],
      camera: {
        position: [0, 2, 6],
        target: [0, 1, 0],
        fov: 45,
        aspectRatio: '9:16',
      },
      captures: [],
    }],
  }, [], scenes, [{ id: '角色1', name: '主角', description: '' }]);

  assert.equal(director.characters.length, 0);
  assert.equal(director.objects[0].name, '桌子占位');
  assert.deepEqual(director.scenes[0].objectPlacements[0].scale, [2, 0.8, 1]);
  assert.equal(director.scenes[0].camera.aspectRatio, '9:16');
});

test('normalizeFastVideoProject preserves director capture provenance', () => {
  const project = normalizeFastVideoProject({
    input: {
      ...createEmptyFastVideoProject().input,
      referenceImages: [{
        id: 'director-reference',
        imageUrl: 'https://example.com/director.png',
        referenceType: 'scene',
        description: '3D 白模构图参考',
        origin: {
          kind: 'director-capture',
          sceneId: 'scene-1',
          captureId: 'capture-1',
        },
      }],
    },
  });

  assert.deepEqual(project.input.referenceImages[0].origin, {
    kind: 'director-capture',
    sceneId: 'scene-1',
    captureId: 'capture-1',
  });
});

test('syncFastFlowSeedanceDraft carries director capture guidance into the reference label', () => {
  const project = createEmptyFastVideoProject();
  project.input.referenceImages = [{
    id: 'director-reference',
    imageUrl: 'https://example.com/director.png',
    referenceType: 'scene',
    description: '白模只约束站位和机位，不约束角色外观',
    selectedForVideo: true,
    submitMode: 'reference_image',
    origin: {
      kind: 'director-capture',
      sceneId: 'scene-1',
      captureId: 'capture-1',
    },
  }];
  project.videoPrompt = { prompt: '生成视频' };
  project.seedanceDraft = {
    ...createDefaultFastSeedanceDraft(project.input, project.videoPrompt.prompt),
    baseTemplateId: 'multi_image_reference',
  };

  const draft = syncFastFlowSeedanceDraft(project);

  assert.equal(draft.assets.length, 1);
  assert.match(draft.assets[0].label || '', /白模只约束站位和机位/);
});

test('prompt layout expands 邱处机 and 江南七怪 into one foreground and seven background roles', () => {
  const scene = {
    id: 'scene-qiu',
    title: '拔剑',
    summary: '',
    imagePrompt: '',
    imagePromptZh: '邱处机中景镜头，正拔出青铜剑，背景中江南七怪的身影模糊，各自持兵器摆出战斗姿态',
    continuityAnchors: [],
  };
  const inference = inferPromptCharacterLayout(scene);
  assert.equal(inference.mainName, '邱处机');
  assert.equal(inference.groupCount, 7);
  assert.equal(inference.count, 8);

  const characters = Array.from({ length: 12 }, (_, index) => ({
    id: `director-${index + 1}`,
    roleId: `角色${index + 1}`,
    name: index === 0 ? '邱处机' : `角色 ${index + 1}`,
  }));
  const placements = createPromptBasedDirectorPlacements(scene, characters);
  assert.equal(placements.length, 8);
  assert.deepEqual(placements[0].position, [0, 0, 0.65]);
  assert.equal(placements[0].pose, 'fight');
  assert.ok(placements.slice(1).every((placement) => placement.position[2] < 0));
});

test('normalizeFastVideoProject preserves model-generated director layout JSON', () => {
  const project = createEmptyFastVideoProject();
  project.scenes = [{
    id: 'scene-layout',
    title: '布局',
    summary: '',
    imagePrompt: 'layout',
    continuityAnchors: [],
    directorLayout: {
      reasoning: '主角前景，群像背景',
      characters: [{
        roleId: '角色1',
        position: [0, 0, 0.5],
        rotationY: 0.5,
        scale: 1.1,
        pose: 'fight',
      }],
    },
  }];
  const normalized = normalizeFastVideoProject(project);
  assert.deepEqual(normalized.scenes[0].directorLayout, project.scenes[0].directorLayout);
});
