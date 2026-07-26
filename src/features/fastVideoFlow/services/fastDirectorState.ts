import type {
  FastDirectorCamera,
  FastDirectorBodyType,
  FastDirectorCharacter,
  FastDirectorObject,
  FastDirectorObjectPlacement,
  FastDirectorPlacement,
  FastDirectorPose,
  FastDirectorPrimitiveType,
  FastDirectorScene,
  FastDirectorState,
  FastPlanCharacter,
  FastReferenceImage,
  FastSceneDraft,
} from '../types/fastTypes.ts';

const DEFAULT_CAMERA: FastDirectorCamera = {
  position: [0, 1.8, 5.5],
  target: [0, 0.95, 0],
  fov: 40,
};

const POSES = new Set<FastDirectorPose>([
  'stand', 't-pose', 'walk', 'run', 'sit', 'crouch', 'kneel-one', 'kneel-two',
  'hands-on-hips', 'lean', 'bow', 'think', 'fight', 'kick', 'throw', 'push',
  'wave', 'reach', 'cross-arms', 'phone',
]);
const BODY_TYPES = new Set<FastDirectorBodyType>([
  'mannequin', 'female', 'broad', 'muscular', 'slim', 'teen', 'child', 'chibi',
]);
const CHARACTER_COLORS = ['#4f8cff', '#ef5b5b', '#14b8a6', '#f59e0b', '#a855f7', '#ec4899', '#84cc16', '#06b6d4'];

function characterColor(index: number) {
  return CHARACTER_COLORS[index % CHARACTER_COLORS.length];
}

function normalizeTuple(
  value: unknown,
  fallback: [number, number, number],
): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    return [...fallback];
  }

  return value.map((item, index) => (
    Number.isFinite(item) ? Number(item) : fallback[index]
  )) as [number, number, number];
}

function clamp(value: unknown, minimum: number, maximum: number, fallback: number) {
  return Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, Number(value)))
    : fallback;
}

export function createFastDirectorCharacters(
  referenceImages: FastReferenceImage[],
  plannedCharacters: FastPlanCharacter[] = [],
): FastDirectorCharacter[] {
  const personReferences = referenceImages.filter((reference) => (
    reference.referenceType === 'person' && reference.imageUrl.trim()
  ));

  if (plannedCharacters.length > 0) {
    return plannedCharacters.map((character, index) => {
      const reference = personReferences[index];
      return {
        id: `director-character-plan-${character.id}`,
        roleId: character.id,
        bodyType: 'mannequin',
        sourcePlanId: character.id,
        sourceReferenceId: reference?.id,
        name: character.name || character.id,
        color: characterColor(index),
        description: character.description,
        referenceImageUrl: reference?.imageUrl,
      };
    });
  }

  if (personReferences.length === 0) {
    return [{
      id: 'director-character-default',
      roleId: '角色1',
      bodyType: 'mannequin',
      name: '角色 1',
      color: characterColor(0),
    }];
  }

  return personReferences.map((reference, index) => ({
    id: `director-character-${reference.id}`,
    roleId: `角色${index + 1}`,
    bodyType: 'mannequin',
    sourceReferenceId: reference.id,
    name: reference.description?.trim() || `角色 ${index + 1}`,
    color: characterColor(index),
    referenceImageUrl: reference.imageUrl,
  }));
}

export function createFastDirectorPlacements(characters: FastDirectorCharacter[]): FastDirectorPlacement[] {
  const centerOffset = (characters.length - 1) / 2;

  return characters.map((character, index) => ({
    characterId: character.id,
    position: [(index - centerOffset) * 1.35, 0, 0],
    rotationY: 0,
    scale: 1,
    pose: 'stand',
  }));
}

export function createFastDirectorScene(
  sceneId: string,
  characters: FastDirectorCharacter[],
): FastDirectorScene {
  return {
    sceneId,
    placements: createFastDirectorPlacements(characters),
    objectPlacements: [],
    camera: {
      ...DEFAULT_CAMERA,
      position: [...DEFAULT_CAMERA.position],
      target: [...DEFAULT_CAMERA.target],
    },
    captures: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createPromptBasedDirectorPlacements(
  scene: FastSceneDraft,
  characters: FastDirectorCharacter[],
): FastDirectorPlacement[] {
  if (scene.directorLayout?.characters.length) {
    const placements = scene.directorLayout.characters.flatMap((entry) => {
      const character = characters.find((candidate) => (
        candidate.roleId === entry.roleId
        || candidate.sourcePlanId === entry.roleId
        || candidate.id === entry.roleId
      ));
      if (!character) return [];
      return [{
        characterId: character.id,
        position: [...entry.position] as [number, number, number],
        rotationY: entry.rotationY,
        scale: entry.scale || 1,
        pose: entry.pose,
      }];
    });
    if (placements.length > 0) {
      return placements;
    }
  }
  const layout = inferPromptCharacterLayout(scene);
  const requestedIds = new Set(scene.characterIds || []);
  let cast = requestedIds.size > 0
    ? characters.filter((character) => (
      requestedIds.has(character.id)
      || requestedIds.has(character.sourcePlanId || '')
      || requestedIds.has(character.roleId)
    ))
    : characters;
  const prompt = `${scene.summary} ${scene.imagePromptZh || ''} ${scene.imagePrompt || ''}`;
  if (layout.mainName) {
    cast = [...cast].sort((left, right) => {
      const leftMatch = `${left.name} ${left.description || ''}`.includes(layout.mainName!) ? 1 : 0;
      const rightMatch = `${right.name} ${right.description || ''}`.includes(layout.mainName!) ? 1 : 0;
      return rightMatch - leftMatch;
    });
  }
  if (layout.count > cast.length) {
    const castIds = new Set(cast.map((character) => character.id));
    cast = [
      ...cast,
      ...characters.filter((character) => !castIds.has(character.id)),
    ];
  }
  cast = cast.slice(0, layout.count || cast.length);
  const confrontation = /对峙|对面|面对|交锋|谈判|争执/u.test(prompt);
  const pose: FastDirectorPose = /奔跑|追逐|冲刺/u.test(prompt)
    ? 'run'
    : /行走|走向|步行/u.test(prompt)
      ? 'walk'
      : /坐着|坐在|落座/u.test(prompt)
        ? 'sit'
        : /格斗|战斗|打斗|搏斗/u.test(prompt)
          ? 'fight'
          : 'stand';

  if (layout.mainName && layout.groupCount > 0 && cast.length > 1) {
    return cast.map((character, index) => {
      if (index === 0) {
        return {
          characterId: character.id,
          position: [0, 0, 0.65],
          rotationY: 0,
          scale: 1.08,
          pose: /拔出|持剑|兵器|战斗|动态姿势/u.test(prompt) ? 'fight' : pose,
        };
      }
      const backgroundIndex = index - 1;
      const firstRowCount = Math.min(4, layout.groupCount);
      const row = backgroundIndex < firstRowCount ? 0 : 1;
      const rowIndex = row === 0 ? backgroundIndex : backgroundIndex - firstRowCount;
      const rowCount = row === 0 ? firstRowCount : Math.max(1, layout.groupCount - firstRowCount);
      return {
        characterId: character.id,
        position: [(rowIndex - (rowCount - 1) / 2) * 0.95, 0, -0.9 - row * 0.9],
        rotationY: 0,
        scale: row === 0 ? 0.94 : 0.88,
        pose: /兵器|战斗|动态姿势/u.test(prompt) ? 'fight' : pose,
      };
    });
  }

  if (confrontation && cast.length > 1) {
    const leftCount = Math.ceil(cast.length / 2);
    return cast.map((character, index) => {
      const left = index < leftCount;
      const groupIndex = left ? index : index - leftCount;
      const groupSize = left ? leftCount : cast.length - leftCount;
      return {
        characterId: character.id,
        position: [left ? -1.35 : 1.35, 0, (groupIndex - (groupSize - 1) / 2) * 0.9],
        rotationY: left ? -Math.PI / 2 : Math.PI / 2,
        scale: 1,
        pose,
      };
    });
  }

  const columns = Math.min(4, Math.max(1, cast.length));
  return cast.map((character, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCount = Math.min(columns, cast.length - row * columns);
    return {
      characterId: character.id,
      position: [(column - (rowCount - 1) / 2) * 1.05, 0, row * 1.05],
      rotationY: 0,
      scale: 1,
      pose,
    };
  });
}

const CHINESE_NUMBER_VALUES: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

function parseCharacterCount(value: string) {
  if (/^\d+$/u.test(value)) return Number(value);
  return CHINESE_NUMBER_VALUES[value] || 0;
}

export function inferPromptCharacterLayout(scene: FastSceneDraft) {
  const prompt = `${scene.summary} ${scene.imagePromptZh || ''} ${scene.imagePrompt || ''}`.trim();
  const mainMatch = prompt.match(/(?:^|[。；，,\s])([\u4e00-\u9fa5]{2,6}?)(?:中景|近景|远景|全景|特写|镜头)/u);
  const namedGroupMatch = prompt.match(/([\u4e00-\u9fa5]{1,8}?)([一二两三四五六七八九十])怪/u);
  const explicitGroupMatch = prompt.match(/([一二两三四五六七八九十]|\d+)(?:名|位|个)(?:年龄|装束|人物|角色|武林|身影)?/u);
  const groupCount = namedGroupMatch
    ? parseCharacterCount(namedGroupMatch[2])
    : explicitGroupMatch
      ? parseCharacterCount(explicitGroupMatch[1])
      : 0;
  const mainName = mainMatch?.[1] || '';
  return {
    mainName,
    groupName: namedGroupMatch?.[0] || '',
    groupCount,
    count: Math.max(1, groupCount + (mainName ? 1 : 0)),
  };
}

export function createEmptyFastDirectorState(): FastDirectorState {
  return {
    activeSceneId: '',
    characters: [],
    objects: [],
    deletedCharacterIds: [],
    scenes: [],
  };
}

function normalizeCharacter(value: unknown, index: number): FastDirectorCharacter | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<FastDirectorCharacter>;
  const id = typeof candidate.id === 'string' && candidate.id.trim()
    ? candidate.id
    : `director-character-${index + 1}`;

  return {
    id,
    roleId: typeof candidate.roleId === 'string' && candidate.roleId.trim()
      ? candidate.roleId
      : `角色${index + 1}`,
    bodyType: BODY_TYPES.has(candidate.bodyType as FastDirectorBodyType)
      ? candidate.bodyType as FastDirectorBodyType
      : 'mannequin',
    sourcePlanId: typeof candidate.sourcePlanId === 'string' ? candidate.sourcePlanId : undefined,
    sourceReferenceId: typeof candidate.sourceReferenceId === 'string' ? candidate.sourceReferenceId : undefined,
    name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name : `角色 ${index + 1}`,
    color: typeof candidate.color === 'string' && /^#[0-9a-f]{6}$/iu.test(candidate.color)
      ? candidate.color
      : characterColor(index),
    description: typeof candidate.description === 'string' ? candidate.description : undefined,
    referenceImageUrl: typeof candidate.referenceImageUrl === 'string' ? candidate.referenceImageUrl : undefined,
  };
}

const PRIMITIVE_TYPES = new Set<FastDirectorPrimitiveType>(['box', 'sphere', 'cylinder', 'cone', 'plane']);

function normalizeObject(value: unknown, index: number): FastDirectorObject | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<FastDirectorObject>;
  return {
    id: typeof candidate.id === 'string' && candidate.id.trim()
      ? candidate.id
      : `director-object-${index + 1}`,
    name: typeof candidate.name === 'string' && candidate.name.trim()
      ? candidate.name
      : `物体 ${index + 1}`,
    primitiveType: PRIMITIVE_TYPES.has(candidate.primitiveType as FastDirectorPrimitiveType)
      ? candidate.primitiveType as FastDirectorPrimitiveType
      : 'box',
    color: typeof candidate.color === 'string' && candidate.color.trim()
      ? candidate.color
      : '#d7e7ff',
  };
}

function normalizeObjectPlacement(
  value: unknown,
  fallback: FastDirectorObjectPlacement,
): FastDirectorObjectPlacement {
  const candidate = value && typeof value === 'object'
    ? value as Partial<FastDirectorObjectPlacement>
    : {};
  return {
    objectId: typeof candidate.objectId === 'string' && candidate.objectId.trim()
      ? candidate.objectId
      : fallback.objectId,
    position: normalizeTuple(candidate.position, fallback.position),
    rotation: normalizeTuple(candidate.rotation, fallback.rotation),
    scale: normalizeTuple(candidate.scale, fallback.scale).map((item) => (
      Math.max(0.05, Math.min(20, item))
    )) as [number, number, number],
  };
}

function normalizePlacement(
  value: unknown,
  fallback: FastDirectorPlacement,
): FastDirectorPlacement {
  const candidate = value && typeof value === 'object'
    ? value as Partial<FastDirectorPlacement>
    : {};

  return {
    characterId: typeof candidate.characterId === 'string' && candidate.characterId.trim()
      ? candidate.characterId
      : fallback.characterId,
    position: normalizeTuple(candidate.position, fallback.position),
    rotationY: Number.isFinite(candidate.rotationY) ? Number(candidate.rotationY) : fallback.rotationY,
    scale: clamp(candidate.scale, 0.45, 2.5, fallback.scale),
    pose: (candidate as { pose?: string }).pose === 'talk'
      ? 'wave'
      : POSES.has(candidate.pose as FastDirectorPose)
      ? candidate.pose as FastDirectorPose
      : fallback.pose,
  };
}

function normalizeCamera(value: unknown): FastDirectorCamera {
  const candidate = value && typeof value === 'object'
    ? value as Partial<FastDirectorCamera>
    : {};

  return {
    position: normalizeTuple(candidate.position, DEFAULT_CAMERA.position),
    target: normalizeTuple(candidate.target, DEFAULT_CAMERA.target),
    fov: clamp(candidate.fov, 18, 90, DEFAULT_CAMERA.fov),
    aspectRatio: candidate.aspectRatio === '9:16'
      || candidate.aspectRatio === '1:1'
      || candidate.aspectRatio === '4:3'
      || candidate.aspectRatio === '3:4'
      || candidate.aspectRatio === '21:9'
      || candidate.aspectRatio === '16:9'
      ? candidate.aspectRatio
      : undefined,
  };
}

export function normalizeFastDirectorState(
  value: unknown,
  referenceImages: FastReferenceImage[],
  storyboardScenes: FastSceneDraft[],
  plannedCharacters: FastPlanCharacter[] = [],
): FastDirectorState {
  const candidate = value && typeof value === 'object'
    ? value as Partial<FastDirectorState>
    : {};
  const persistedCharacters = Array.isArray(candidate.characters)
    ? candidate.characters
      .map(normalizeCharacter)
      .filter((item): item is FastDirectorCharacter => Boolean(item))
    : [];
  const deletedCharacterIds = Array.isArray(candidate.deletedCharacterIds)
    ? candidate.deletedCharacterIds.filter((item): item is string => typeof item === 'string')
    : [];
  const deletedIdSet = new Set(deletedCharacterIds);
  const derivedCharacters = createFastDirectorCharacters(referenceImages, plannedCharacters)
    .filter((character) => !deletedIdSet.has(character.id));
  const derivedById = new Map(
    derivedCharacters.map((character) => [character.id, character]),
  );
  const hasPlannedCharacters = plannedCharacters.length > 0;
  const retainedCharacters = persistedCharacters
    .filter((character) => !deletedIdSet.has(character.id))
    // Once the text model has returned an explicit cast, replace temporary
    // auto-created placeholders. Keeping them produced duplicate roleIds
    // (most visibly two "角色1" entries), so directorLayout role matching
    // could attach a generated placement to the stale placeholder.
    .filter((character) => !hasPlannedCharacters || (
      character.id !== 'director-character-default'
      && !character.id.startsWith('director-character-preview-')
    ))
    .map((character) => {
      const derived = derivedById.get(character.id);
      return derived ? {
        ...derived,
        ...character,
        referenceImageUrl: derived.referenceImageUrl || character.referenceImageUrl,
      } : character;
    });
  const retainedIds = new Set(retainedCharacters.map((character) => character.id));
  const characters = [
    ...retainedCharacters,
    ...derivedCharacters.filter((character) => !retainedIds.has(character.id)),
  ];
  const normalizedCharacters = characters.length > 0 ? characters : derivedCharacters;
  const objects = Array.isArray(candidate.objects)
    ? candidate.objects.map(normalizeObject).filter((item): item is FastDirectorObject => Boolean(item))
    : [];
  const objectIdSet = new Set(objects.map((object) => object.id));
  const characterIdSet = new Set(normalizedCharacters.map((character) => character.id));
  const sceneIds = new Set(storyboardScenes.map((scene) => scene.id));
  const persistedScenes = Array.isArray(candidate.scenes) ? candidate.scenes : [];
  const scenes = storyboardScenes.map((storyboardScene) => {
    const persisted = persistedScenes.find((item) => (
      item && typeof item === 'object' && (item as Partial<FastDirectorScene>).sceneId === storyboardScene.id
    )) as Partial<FastDirectorScene> | undefined;
    const sceneCharacterIds = storyboardScene.characterIds || [];
    const sceneCharacters = sceneCharacterIds.length > 0
      ? normalizedCharacters.filter((character) => (
        sceneCharacterIds.includes(character.sourcePlanId || character.roleId)
      ))
      : normalizedCharacters;
    const fallback = createFastDirectorScene(storyboardScene.id, sceneCharacters);
    const placementByCharacterId = new Map(
      Array.isArray(persisted?.placements)
        ? persisted.placements.map((placement) => [
          placement.characterId,
          placement,
        ])
        : [],
    );

    const persistedPlacements = Array.isArray(persisted?.placements)
      ? persisted.placements.filter((placement) => characterIdSet.has(placement.characterId))
      : [];
    const normalizedPersistedPlacements = persistedPlacements.map((placement) => normalizePlacement(
      placement,
      createFastDirectorPlacements([
        normalizedCharacters.find((character) => character.id === placement.characterId)!,
      ])[0],
    ));
    const fallbackPlacementIds = new Set(normalizedPersistedPlacements.map((placement) => placement.characterId));
    const objectPlacements = Array.isArray(persisted?.objectPlacements)
      ? persisted.objectPlacements
        .filter((placement) => objectIdSet.has(placement.objectId))
        .map((placement) => normalizeObjectPlacement(placement, {
          objectId: placement.objectId,
          position: [0, 0.5, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        }))
      : [];

    return {
      sceneId: storyboardScene.id,
      placements: [
        ...normalizedPersistedPlacements,
        ...fallback.placements
          .filter((placement) => !fallbackPlacementIds.has(placement.characterId))
          .map((placement) => normalizePlacement(placementByCharacterId.get(placement.characterId), placement)),
      ],
      objectPlacements,
      camera: normalizeCamera(persisted?.camera),
      captures: Array.isArray(persisted?.captures)
        ? persisted.captures.filter((capture) => (
          capture
          && typeof capture.id === 'string'
          && typeof capture.imageUrl === 'string'
          && typeof capture.referenceImageId === 'string'
        )).map((capture) => ({
          ...capture,
          camera: normalizeCamera(capture.camera),
        }))
        : [],
      updatedAt: typeof persisted?.updatedAt === 'string'
        ? persisted.updatedAt
        : fallback.updatedAt,
    };
  });
  const activeSceneId = typeof candidate.activeSceneId === 'string' && sceneIds.has(candidate.activeSceneId)
    ? candidate.activeSceneId
    : storyboardScenes[0]?.id || '';

  return {
    activeSceneId,
    characters: normalizedCharacters,
    objects,
    deletedCharacterIds,
    scenes,
  };
}
