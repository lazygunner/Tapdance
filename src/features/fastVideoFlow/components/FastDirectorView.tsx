import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Aperture,
  AlertTriangle,
  Box,
  Camera,
  Check,
  Focus,
  Move3D,
  Rotate3D,
  ScanLine,
  Scaling,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
  Video,
  X,
} from 'lucide-react';

import type {
  FastDirectorCamera,
  FastDirectorBodyType,
  FastDirectorObjectPlacement,
  FastDirectorPrimitiveType,
  FastDirectorPlacement,
  FastDirectorScene,
  FastDirectorState,
  FastVideoInput,
  FastSceneDraft,
} from '../types/fastTypes.ts';
import {
  FastDirectorStage,
  type FastDirectorStageHandle,
  type FastDirectorTransformMode,
  type FastDirectorViewMode,
} from './FastDirectorStage.tsx';
import { StudioModal, StudioPage, StudioPanel } from '../../../components/studio/StudioPrimitives.tsx';

type CaptureInput = {
  sceneId: string;
  dataUrl: string;
  camera: FastDirectorCamera;
  aspectRatio: FastVideoInput['aspectRatio'];
};

type Props = {
  director: FastDirectorState;
  input: FastVideoInput;
  scenes: FastSceneDraft[];
  onCapture: (input: CaptureInput) => Promise<void>;
  onDeleteCapture: (sceneId: string, captureId: string) => void;
  onRegenerateScene: (sceneId: string) => Promise<void>;
  onNextVideo: () => void;
  onSyncDirector: () => void;
  onUpdateDirector: (updater: (current: FastDirectorState) => FastDirectorState) => void;
  onPreviewImage: (url: string) => void;
};

const POSE_OPTIONS = [
  { id: 'stand', label: '站立' },
  { id: 't-pose', label: 'T型' },
  { id: 'walk', label: '行走' },
  { id: 'run', label: '跑步' },
  { id: 'sit', label: '坐姿' },
  { id: 'crouch', label: '蹲下' },
  { id: 'kneel-one', label: '单膝跪' },
  { id: 'kneel-two', label: '双膝跪' },
  { id: 'hands-on-hips', label: '叉腰' },
  { id: 'lean', label: '倚靠' },
  { id: 'bow', label: '鞠躬' },
  { id: 'think', label: '思考' },
  { id: 'fight', label: '格斗' },
  { id: 'kick', label: '踢球' },
  { id: 'throw', label: '投掷' },
  { id: 'push', label: '推进' },
  { id: 'wave', label: '招手' },
  { id: 'reach', label: '伸手' },
  { id: 'cross-arms', label: '抱臂' },
  { id: 'phone', label: '看手机' },
] as const;

const BODY_TYPE_OPTIONS: Array<{ id: FastDirectorBodyType; label: string }> = [
  { id: 'mannequin', label: '男性素体' },
  { id: 'female', label: '女性素体' },
  { id: 'broad', label: '宽厚素体' },
  { id: 'muscular', label: '健壮素体' },
  { id: 'slim', label: '纤细素体' },
  { id: 'teen', label: '少年素体' },
  { id: 'child', label: '儿童素体' },
  { id: 'chibi', label: '二头身' },
];

const TRANSFORM_OPTIONS: Array<{
  id: FastDirectorTransformMode;
  label: string;
  icon: typeof Move3D;
}> = [
  { id: 'translate', label: '移动', icon: Move3D },
  { id: 'rotate', label: '旋转', icon: Rotate3D },
  { id: 'scale', label: '缩放', icon: Scaling },
];

const PRIMITIVE_OPTIONS: Array<{ id: FastDirectorPrimitiveType; label: string }> = [
  { id: 'box', label: '方块' },
  { id: 'sphere', label: '球体' },
  { id: 'cylinder', label: '圆柱' },
  { id: 'cone', label: '圆锥' },
  { id: 'plane', label: '平面' },
];

const CAMERA_ASPECT_RATIO_OPTIONS: FastVideoInput['aspectRatio'][] = [
  '16:9',
  '9:16',
  '1:1',
  '4:3',
  '3:4',
  '21:9',
];
const CHARACTER_COLOR_OPTIONS = ['#4f8cff', '#ef5b5b', '#14b8a6', '#f59e0b', '#a855f7', '#ec4899', '#84cc16', '#06b6d4'];

function compactSpawnPosition(count: number): [number, number, number] {
  const columnCount = 4;
  const column = count % columnCount;
  const row = Math.floor(count / columnCount);
  return [(column - 1.5) * 1.05, 0, row * 1.05];
}

function updateScene(
  director: FastDirectorState,
  sceneId: string,
  updater: (scene: FastDirectorScene) => FastDirectorScene,
): FastDirectorState {
  return {
    ...director,
    scenes: director.scenes.map((scene) => (
      scene.sceneId === sceneId
        ? {
          ...updater(scene),
          updatedAt: new Date().toISOString(),
        }
        : scene
    )),
  };
}

function NumberField({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  key?: number;
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="min-w-0">
      <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--studio-dim)]">
        {label}
      </span>
      <input
        type="number"
        value={Number(value.toFixed(3))}
        step={step}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          if (Number.isFinite(nextValue)) {
            onChange(nextValue);
          }
        }}
        className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] px-2.5 py-2 text-sm text-[var(--studio-text)] outline-none transition focus:border-sky-400/70"
      />
    </label>
  );
}

export function FastDirectorView({
  director,
  input,
  scenes,
  onCapture,
  onDeleteCapture,
  onRegenerateScene,
  onNextVideo,
  onSyncDirector,
  onUpdateDirector,
  onPreviewImage,
}: Props) {
  const stageRef = useRef<FastDirectorStageHandle | null>(null);
  const onSyncDirectorRef = useRef(onSyncDirector);
  const [viewMode, setViewMode] = useState<FastDirectorViewMode>('director');
  const [transformMode, setTransformMode] = useState<FastDirectorTransformMode>('translate');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    director.characters[0]?.id || null,
  );
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [showPrimitiveMenu, setShowPrimitiveMenu] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const [isRegeneratingScene, setIsRegeneratingScene] = useState(false);
  const [deletingCaptureId, setDeletingCaptureId] = useState<string | null>(null);

  onSyncDirectorRef.current = onSyncDirector;

  useEffect(() => {
    onSyncDirectorRef.current();
  }, []);

  useEffect(() => {
    if (
      !selectedObjectId
      && (!selectedCharacterId || !director.characters.some((character) => character.id === selectedCharacterId))
    ) {
      setSelectedCharacterId(director.characters[0]?.id || null);
    }
  }, [director.characters, selectedCharacterId, selectedObjectId]);

  const activeSceneId = director.activeSceneId || scenes[0]?.id || '';
  const activeStoryboardScene = scenes.find((scene) => scene.id === activeSceneId) || scenes[0] || null;
  const activeDirectorScene = director.scenes.find((scene) => scene.sceneId === activeSceneId) || null;
  const selectedCharacter = director.characters.find((character) => character.id === selectedCharacterId) || null;
  const selectedPlacement = activeDirectorScene?.placements.find((placement) => (
    placement.characterId === selectedCharacterId
  )) || null;
  const selectedObject = director.objects.find((object) => object.id === selectedObjectId) || null;
  const selectedObjectPlacement = activeDirectorScene?.objectPlacements.find((placement) => (
    placement.objectId === selectedObjectId
  )) || null;
  const activeObjects = director.objects.filter((object) => (
    activeDirectorScene?.objectPlacements.some((placement) => placement.objectId === object.id)
  ));
  const selectedCaptures = useMemo(
    () => activeDirectorScene?.captures.filter((capture) => capture.imageUrl) || [],
    [activeDirectorScene?.captures],
  );

  const applyPlacement = (nextPlacement: FastDirectorPlacement) => {
    if (!activeDirectorScene) {
      return;
    }
    onUpdateDirector((current) => updateScene(current, activeDirectorScene.sceneId, (scene) => ({
      ...scene,
      placements: scene.placements.map((placement) => (
        placement.characterId === nextPlacement.characterId ? nextPlacement : placement
      )),
    })));
  };

  const patchPlacement = (patch: Partial<FastDirectorPlacement>) => {
    if (!selectedPlacement) {
      return;
    }
    applyPlacement({ ...selectedPlacement, ...patch });
  };

  const applyObjectPlacement = (nextPlacement: FastDirectorObjectPlacement) => {
    if (!activeDirectorScene) {
      return;
    }
    onUpdateDirector((current) => updateScene(current, activeDirectorScene.sceneId, (scene) => ({
      ...scene,
      objectPlacements: scene.objectPlacements.map((placement) => (
        placement.objectId === nextPlacement.objectId ? nextPlacement : placement
      )),
    })));
  };

  const patchObjectPlacement = (patch: Partial<FastDirectorObjectPlacement>) => {
    if (selectedObjectPlacement) {
      applyObjectPlacement({ ...selectedObjectPlacement, ...patch });
    }
  };

  const addCharacter = () => {
    const nextIndex = director.characters.reduce((maximum, character) => {
      const match = character.roleId.match(/(\d+)$/);
      return match ? Math.max(maximum, Number(match[1])) : maximum;
    }, 0) + 1;
    const id = crypto.randomUUID?.() || `director-character-custom-${Date.now()}`;
    onUpdateDirector((current) => ({
      ...current,
      characters: [...current.characters, {
        id,
        roleId: `角色${nextIndex}`,
        bodyType: 'mannequin',
        color: CHARACTER_COLOR_OPTIONS[(nextIndex - 1) % CHARACTER_COLOR_OPTIONS.length],
        name: `角色 ${nextIndex}`,
        description: '自定义角色',
      }],
      scenes: current.scenes.map((scene) => scene.sceneId === activeSceneId ? {
        ...scene,
        placements: [...scene.placements, {
          characterId: id,
          position: compactSpawnPosition(scene.placements.length),
          rotationY: 0,
          scale: 1,
          pose: 'stand',
        }],
        updatedAt: new Date().toISOString(),
      } : scene),
    }));
    setSelectedObjectId(null);
    setSelectedCharacterId(id);
  };

  const addCharacterToActiveScene = (characterId: string) => {
    if (!activeDirectorScene || activeDirectorScene.placements.some((item) => item.characterId === characterId)) {
      return;
    }
    onUpdateDirector((current) => updateScene(current, activeDirectorScene.sceneId, (scene) => ({
      ...scene,
      placements: [...scene.placements, {
        characterId,
        position: compactSpawnPosition(scene.placements.length),
        rotationY: 0,
        scale: 1,
        pose: 'stand',
      }],
    })));
  };

  const deleteCharacter = (characterId: string) => {
    onUpdateDirector((current) => ({
      ...current,
      characters: current.characters.filter((character) => character.id !== characterId),
      deletedCharacterIds: current.deletedCharacterIds.includes(characterId)
        ? current.deletedCharacterIds
        : [...current.deletedCharacterIds, characterId],
      scenes: current.scenes.map((scene) => ({
        ...scene,
        placements: scene.placements.filter((placement) => placement.characterId !== characterId),
      })),
    }));
    setSelectedCharacterId(null);
  };

  const patchCharacter = (patch: {
    roleId?: string;
    bodyType?: FastDirectorBodyType;
    name?: string;
    color?: string;
    description?: string;
  }) => {
    if (!selectedCharacter) {
      return;
    }
    onUpdateDirector((current) => ({
      ...current,
      characters: current.characters.map((character) => (
        character.id === selectedCharacter.id ? { ...character, ...patch } : character
      )),
    }));
  };

  const addPrimitive = (primitiveType: FastDirectorPrimitiveType) => {
    const id = crypto.randomUUID?.() || `director-object-${Date.now()}`;
    const label = PRIMITIVE_OPTIONS.find((option) => option.id === primitiveType)?.label || '物体';
    const number = director.objects.filter((object) => object.primitiveType === primitiveType).length + 1;
    onUpdateDirector((current) => ({
      ...current,
      objects: [...current.objects, {
        id,
        name: number === 1 ? label : `${label} ${number}`,
        primitiveType,
        color: '#d7e7ff',
      }],
      scenes: current.scenes.map((scene) => scene.sceneId === activeSceneId ? {
        ...scene,
        objectPlacements: [...scene.objectPlacements, {
          objectId: id,
          position: [scene.objectPlacements.length * 1.15, 0, 1.2],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        }],
        updatedAt: new Date().toISOString(),
      } : scene),
    }));
    setShowPrimitiveMenu(false);
    setSelectedCharacterId(null);
    setSelectedObjectId(id);
  };

  const patchObject = (patch: { name?: string; color?: string }) => {
    if (!selectedObject) {
      return;
    }
    onUpdateDirector((current) => ({
      ...current,
      objects: current.objects.map((object) => (
        object.id === selectedObject.id ? { ...object, ...patch } : object
      )),
    }));
  };

  const deleteObject = (objectId: string) => {
    onUpdateDirector((current) => ({
      ...current,
      objects: current.objects.filter((object) => object.id !== objectId),
      scenes: current.scenes.map((scene) => ({
        ...scene,
        objectPlacements: scene.objectPlacements.filter((placement) => placement.objectId !== objectId),
      })),
    }));
    setSelectedObjectId(null);
  };

  const patchCamera = (patch: Partial<FastDirectorCamera>) => {
    if (!activeDirectorScene) {
      return;
    }
    onUpdateDirector((current) => updateScene(current, activeDirectorScene.sceneId, (scene) => ({
      ...scene,
      camera: {
        ...scene.camera,
        ...patch,
      },
    })));
  };

  const setActiveScene = (sceneId: string) => {
    onUpdateDirector((current) => ({
      ...current,
      activeSceneId: sceneId,
    }));
    setViewMode('director');
    setSelectedCharacterId(null);
    setSelectedObjectId(null);
  };

  const saveDirectorViewAsCamera = () => {
    const nextCamera = stageRef.current?.useDirectorViewAsCamera();
    if (!nextCamera) {
      return;
    }
    patchCamera(nextCamera);
    setViewMode('camera');
  };

  const capture = async () => {
    if (!activeDirectorScene) {
      return;
    }
    setIsCapturing(true);
    setCaptureError('');
    try {
      const dataUrl = stageRef.current?.captureCameraView();
      if (!dataUrl) {
        throw new Error('3D 画布尚未准备好');
      }
      await onCapture({
        sceneId: activeDirectorScene.sceneId,
        dataUrl,
        camera: activeDirectorScene.camera,
        aspectRatio: activeDirectorScene.camera.aspectRatio || input.aspectRatio,
      });
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : '截图保存失败');
    } finally {
      setIsCapturing(false);
    }
  };

  if (!activeDirectorScene || !activeStoryboardScene) {
    return (
      <StudioPage className="studio-page-fluid">
        <StudioPanel className="mt-3 p-8 text-center">
          <div className="text-base font-semibold text-[var(--studio-text)]">还没有可预演的分镜</div>
          <p className="mt-2 text-sm text-[var(--studio-muted)]">请先返回分镜确认并生成至少一个分镜。</p>
        </StudioPanel>
      </StudioPage>
    );
  }

  return (
    <StudioPage className="studio-page-fluid">
      <div className="mt-3 flex h-[calc(100dvh-170px)] min-h-[560px] flex-col overflow-hidden rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface)] shadow-[0_24px_70px_rgba(0,0,0,0.2)]">
        <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--studio-border)] px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--studio-text)]">
              <ScanLine className="h-4 w-4 text-sky-400" />
              {activeStoryboardScene.title}
            </div>
            <div className="mt-1 truncate text-xs text-[var(--studio-dim)]">
              白模只用于站位、姿态、景别与机位构图
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsRegeneratingScene(true);
                setCaptureError('');
                void onRegenerateScene(activeDirectorScene.sceneId)
                  .catch((error: unknown) => {
                    setCaptureError(error instanceof Error ? error.message : '重新生成 3D 场景失败');
                  })
                  .finally(() => setIsRegeneratingScene(false));
              }}
              disabled={isRegeneratingScene}
              className="studio-button studio-button-secondary px-3 py-2 text-xs"
            >
              <RefreshCw className={`h-4 w-4 ${isRegeneratingScene ? 'animate-spin' : ''}`} />
              {isRegeneratingScene ? '生成中…' : '重新生成 3D 场景'}
            </button>
            <div className="inline-flex rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] p-1">
              {(['director', 'camera'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    viewMode === mode
                      ? 'bg-sky-500 text-white shadow-sm'
                      : 'text-[var(--studio-muted)] hover:text-[var(--studio-text)]'
                  }`}
                >
                  {mode === 'director' ? '导演视角' : '机位视角'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={saveDirectorViewAsCamera}
              disabled={viewMode !== 'director'}
              className="studio-button studio-button-secondary px-3 py-2 text-xs"
            >
              <Focus className="h-4 w-4" />
              当前视角设为机位
            </button>
            <button
              type="button"
              onClick={() => void capture()}
              disabled={isCapturing}
              className="studio-button studio-button-primary px-3 py-2 text-xs"
            >
              <Camera className="h-4 w-4" />
              {isCapturing ? '保存中…' : '导出机位截图'}
            </button>
            <button
              type="button"
              onClick={onNextVideo}
              className="studio-button studio-button-secondary px-3 py-2 text-xs"
            >
              <Video className="h-4 w-4" />
              进入视频生成
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[230px_minmax(0,1fr)_270px]">
          <aside className="min-h-0 overflow-y-auto overscroll-contain border-b border-[var(--studio-border)] bg-[var(--studio-surface-soft)] xl:border-b-0 xl:border-r">
            <section className="border-b border-[var(--studio-border)] p-3">
              <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-dim)]">
                分镜
              </div>
              <div className="space-y-1">
                {scenes.map((scene, index) => {
                  const active = scene.id === activeSceneId;
                  const directorScene = director.scenes.find((item) => item.sceneId === scene.id);
                  return (
                    <button
                      key={scene.id}
                      type="button"
                      onClick={() => setActiveScene(scene.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs transition ${
                        active
                          ? 'bg-sky-500/15 text-sky-300'
                          : 'text-[var(--studio-muted)] hover:bg-white/5 hover:text-[var(--studio-text)]'
                      }`}
                    >
                      <span className="min-w-0 truncate">{index + 1}. {scene.title}</span>
                      {directorScene?.captures.length ? (
                        <span className="ml-2 shrink-0 text-[10px]">{directorScene.captures.length} 图</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-dim)]">
                  角色白模
                </span>
                <button
                  type="button"
                  onClick={addCharacter}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-sky-300 hover:bg-sky-500/10"
                >
                  <Plus className="h-3 w-3" /> 添加角色
                </button>
              </div>
              <div className="space-y-1">
                {director.characters.map((character) => {
                  const active = character.id === selectedCharacterId;
                  const inScene = activeDirectorScene.placements.some((placement) => placement.characterId === character.id);
                  return (
                    <button
                      key={character.id}
                      type="button"
                      onClick={() => {
                        setSelectedObjectId(null);
                        setSelectedCharacterId(character.id);
                        if (inScene) {
                          stageRef.current?.focusCharacter(character.id);
                        }
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                        active
                          ? 'bg-white/8 text-[var(--studio-text)]'
                          : 'text-[var(--studio-muted)] hover:bg-white/5'
                      }`}
                    >
                      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)]">
                        {character.referenceImageUrl ? (
                          <img src={character.referenceImageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <UserRound className="h-4 w-4" />
                        )}
                        {active ? <span className="absolute inset-0 border border-sky-400/80" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs">{character.roleId} · {character.name}</span>
                        {!inScene ? <span className="block text-[9px] text-amber-400/80">未加入当前分镜</span> : null}
                      </span>
                      {active ? <Check className="h-3.5 w-3.5 text-sky-400" /> : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="border-t border-[var(--studio-border)] p-3">
              <div className="relative mb-2 flex items-center justify-between px-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-dim)]">
                  场景物体
                </span>
                <button
                  type="button"
                  onClick={() => setShowPrimitiveMenu((current) => !current)}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-sky-300 hover:bg-sky-500/10"
                >
                  <Plus className="h-3 w-3" /> 添加物体
                </button>
                {showPrimitiveMenu ? (
                  <div className="absolute right-0 top-7 z-20 w-36 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface)] p-1.5 shadow-2xl">
                    {PRIMITIVE_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => addPrimitive(option.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-[var(--studio-muted)] hover:bg-white/5 hover:text-[var(--studio-text)]"
                      >
                        <Box className="h-3.5 w-3.5" /> {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {activeObjects.length > 0 ? (
                <div className="space-y-1">
                  {activeObjects.map((object) => {
                    const active = object.id === selectedObjectId;
                    return (
                      <button
                        key={object.id}
                        type="button"
                        onClick={() => {
                          setSelectedCharacterId(null);
                          setSelectedObjectId(object.id);
                          stageRef.current?.focusObject(object.id);
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                          active
                            ? 'bg-white/8 text-[var(--studio-text)]'
                            : 'text-[var(--studio-muted)] hover:bg-white/5'
                        }`}
                      >
                        <Box className="h-4 w-4" style={{ color: object.color }} />
                        <span className="min-w-0 flex-1 truncate">{object.name}</span>
                        {active ? <Check className="h-3.5 w-3.5 text-sky-400" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="px-1 py-2 text-[10px] leading-4 text-[var(--studio-dim)]">添加基础几何体作为桌椅、墙体或空间占位。</p>
              )}
            </section>
          </aside>

          <main className="relative h-full min-h-0 overflow-hidden bg-[#111419]">
            <FastDirectorStage
              ref={stageRef}
              aspectRatio={activeDirectorScene.camera.aspectRatio || input.aspectRatio}
              camera={activeDirectorScene.camera}
              characters={director.characters}
              objects={director.objects}
              placements={activeDirectorScene.placements}
              objectPlacements={activeDirectorScene.objectPlacements}
              selectedCharacterId={selectedCharacterId}
              selectedObjectId={selectedObjectId}
              transformMode={transformMode}
              viewMode={viewMode}
              onPlacementChange={applyPlacement}
              onObjectPlacementChange={applyObjectPlacement}
              onSelectCharacter={(characterId) => {
                setSelectedCharacterId(characterId);
                if (characterId) {
                  setSelectedObjectId(null);
                }
              }}
              onSelectObject={(objectId) => {
                setSelectedObjectId(objectId);
                if (objectId) {
                  setSelectedCharacterId(null);
                }
              }}
            />

            {viewMode === 'director' ? (
              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 rounded-xl border border-white/10 bg-black/55 p-1.5 shadow-xl backdrop-blur-md">
                {TRANSFORM_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setTransformMode(option.id)}
                      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition ${
                        transformMode === option.id
                          ? 'bg-white text-zinc-950'
                          : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="pointer-events-none absolute inset-5 border border-white/25">
                <span className="absolute left-1/3 top-0 h-full border-l border-white/10" />
                <span className="absolute left-2/3 top-0 h-full border-l border-white/10" />
                <span className="absolute left-0 top-1/3 w-full border-t border-white/10" />
                <span className="absolute left-0 top-2/3 w-full border-t border-white/10" />
                <span className="absolute right-2 top-2 rounded bg-black/50 px-2 py-1 text-[10px] text-white/70">
                  {activeDirectorScene.camera.aspectRatio || input.aspectRatio} · FOV {activeDirectorScene.camera.fov}°
                </span>
              </div>
            )}
          </main>

          <aside className="min-h-0 overflow-y-auto overscroll-contain border-t border-[var(--studio-border)] bg-[var(--studio-surface-soft)] xl:border-l xl:border-t-0">
            {selectedCharacter ? (
              <section className="border-b border-[var(--studio-border)] p-4">
                <div className="flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-sky-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[var(--studio-text)]">{selectedCharacter.name}</div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--studio-dim)]">White model</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteCharacter(selectedCharacter.id)}
                    title="删除角色"
                    className="rounded-lg p-2 text-[var(--studio-dim)] hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                  <label>
                    <span className="mb-1.5 block text-[10px] text-[var(--studio-dim)]">角色 ID</span>
                    <input
                      value={selectedCharacter.roleId}
                      onChange={(event) => patchCharacter({ roleId: event.target.value })}
                      className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] px-2.5 py-2 text-xs text-[var(--studio-text)] outline-none focus:border-sky-400/70"
                    />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-[10px] text-[var(--studio-dim)]">角色名称</span>
                    <input
                      value={selectedCharacter.name}
                      onChange={(event) => patchCharacter({ name: event.target.value })}
                      className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] px-2.5 py-2 text-xs text-[var(--studio-text)] outline-none focus:border-sky-400/70"
                    />
                  </label>
                </div>
                <textarea
                  value={selectedCharacter.description || ''}
                  onChange={(event) => patchCharacter({ description: event.target.value })}
                  placeholder="角色说明"
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] px-2.5 py-2 text-xs text-[var(--studio-text)] outline-none focus:border-sky-400/70"
                />
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--studio-dim)]">
                    人物类型
                  </span>
                  <select
                    value={selectedCharacter.bodyType || 'mannequin'}
                    onChange={(event) => patchCharacter({
                      bodyType: event.target.value as FastDirectorBodyType,
                    })}
                    className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] px-2.5 py-2 text-xs text-[var(--studio-text)] outline-none focus:border-sky-400/70"
                  >
                    {BODY_TYPE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <div className="mt-3">
                  <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--studio-dim)]">
                    角色颜色
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {CHARACTER_COLOR_OPTIONS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => patchCharacter({ color })}
                        className={`h-7 w-7 rounded-full border-2 transition ${selectedCharacter.color === color ? 'scale-110 border-white shadow' : 'border-white/25'}`}
                        style={{ backgroundColor: color }}
                        aria-label={`角色颜色 ${color}`}
                      />
                    ))}
                    <input
                      type="color"
                      value={selectedCharacter.color || '#4f8cff'}
                      onChange={(event) => patchCharacter({ color: event.target.value })}
                      className="h-7 w-9 cursor-pointer rounded border border-[var(--studio-border)] bg-transparent p-0.5"
                      title="自定义角色颜色"
                    />
                  </div>
                </div>

                {!selectedPlacement ? (
                  <button
                    type="button"
                    onClick={() => addCharacterToActiveScene(selectedCharacter.id)}
                    className="studio-button studio-button-secondary mt-3 w-full justify-center px-3 py-2 text-xs"
                  >
                    <Plus className="h-4 w-4" /> 加入当前分镜
                  </button>
                ) : (
                  <>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {selectedPlacement.position.map((value, index) => (
                        <NumberField
                          key={index}
                          label={['X', 'Y', 'Z'][index]}
                          value={value}
                          onChange={(nextValue) => {
                            const position = [...selectedPlacement.position] as [number, number, number];
                            position[index] = nextValue;
                            patchPlacement({ position });
                          }}
                        />
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <NumberField
                        label="旋转 °"
                        value={selectedPlacement.rotationY * 180 / Math.PI}
                        step={1}
                        onChange={(value) => patchPlacement({ rotationY: value * Math.PI / 180 })}
                      />
                      <NumberField
                        label="缩放"
                        value={selectedPlacement.scale}
                        step={0.05}
                        onChange={(value) => patchPlacement({ scale: Math.max(0.45, Math.min(2.5, value)) })}
                      />
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--studio-dim)]">姿态</div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {POSE_OPTIONS.map((pose) => (
                          <button
                            key={pose.id}
                            type="button"
                            onClick={() => patchPlacement({ pose: pose.id })}
                            className={`rounded-lg border px-2 py-2 text-xs transition ${
                              selectedPlacement.pose === pose.id
                                ? 'border-sky-400/60 bg-sky-500/15 text-sky-300'
                                : 'border-[var(--studio-border)] text-[var(--studio-muted)] hover:text-[var(--studio-text)]'
                            }`}
                          >
                            {pose.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </section>
            ) : null}

            {selectedObject && selectedObjectPlacement ? (
              <section className="border-b border-[var(--studio-border)] p-4">
                <div className="flex items-center gap-2">
                  <Box className="h-4 w-4 text-sky-400" />
                  <div className="min-w-0 flex-1 text-sm font-semibold text-[var(--studio-text)]">场景物体</div>
                  <button
                    type="button"
                    onClick={() => deleteObject(selectedObject.id)}
                    title="删除物体"
                    className="rounded-lg p-2 text-[var(--studio-dim)] hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_54px] gap-2">
                  <input
                    value={selectedObject.name}
                    onChange={(event) => patchObject({ name: event.target.value })}
                    className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] px-2.5 py-2 text-xs text-[var(--studio-text)] outline-none focus:border-sky-400/70"
                  />
                  <input
                    type="color"
                    value={selectedObject.color}
                    onChange={(event) => patchObject({ color: event.target.value })}
                    className="h-9 w-full rounded-lg border border-[var(--studio-border)] bg-transparent p-1"
                  />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {selectedObjectPlacement.position.map((value, index) => (
                    <NumberField
                      key={index}
                      label={['X', 'Y', 'Z'][index]}
                      value={value}
                      onChange={(nextValue) => {
                        const position = [...selectedObjectPlacement.position] as [number, number, number];
                        position[index] = nextValue;
                        patchObjectPlacement({ position });
                      }}
                    />
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {selectedObjectPlacement.rotation.map((value, index) => (
                    <NumberField
                      key={index}
                      label={`R${['X', 'Y', 'Z'][index]}°`}
                      value={value * 180 / Math.PI}
                      step={1}
                      onChange={(nextValue) => {
                        const rotation = [...selectedObjectPlacement.rotation] as [number, number, number];
                        rotation[index] = nextValue * Math.PI / 180;
                        patchObjectPlacement({ rotation });
                      }}
                    />
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {selectedObjectPlacement.scale.map((value, index) => (
                    <NumberField
                      key={index}
                      label={`S${['X', 'Y', 'Z'][index]}`}
                      value={value}
                      step={0.05}
                      onChange={(nextValue) => {
                        const scale = [...selectedObjectPlacement.scale] as [number, number, number];
                        scale[index] = Math.max(0.05, nextValue);
                        patchObjectPlacement({ scale });
                      }}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="border-b border-[var(--studio-border)] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--studio-text)]">
                <Aperture className="h-4 w-4 text-sky-400" />
                机位
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {activeDirectorScene.camera.position.map((value, index) => (
                  <NumberField
                    key={index}
                    label={`P${['X', 'Y', 'Z'][index]}`}
                    value={value}
                    onChange={(nextValue) => {
                      const position = [...activeDirectorScene.camera.position] as [number, number, number];
                      position[index] = nextValue;
                      patchCamera({ position });
                    }}
                  />
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {activeDirectorScene.camera.target.map((value, index) => (
                  <NumberField
                    key={index}
                    label={`T${['X', 'Y', 'Z'][index]}`}
                    value={value}
                    onChange={(nextValue) => {
                      const target = [...activeDirectorScene.camera.target] as [number, number, number];
                      target[index] = nextValue;
                      patchCamera({ target });
                    }}
                  />
                ))}
              </div>
              <div className="mt-3">
                <label>
                  <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--studio-dim)]">
                    截图比例
                  </span>
                  <select
                    value={activeDirectorScene.camera.aspectRatio || input.aspectRatio}
                    onChange={(event) => patchCamera({
                      aspectRatio: event.target.value as FastVideoInput['aspectRatio'],
                    })}
                    className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-contrast)] px-2.5 py-2 text-sm text-[var(--studio-text)] outline-none transition focus:border-sky-400/70"
                  >
                    {CAMERA_ASPECT_RATIO_OPTIONS.map((ratio) => (
                      <option key={ratio} value={ratio}>{ratio}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3">
                <NumberField
                  label="视场角 FOV"
                  value={activeDirectorScene.camera.fov}
                  step={1}
                  onChange={(fov) => patchCamera({ fov: Math.max(18, Math.min(90, fov)) })}
                />
              </div>
            </section>

            <section className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--studio-text)]">机位截图</span>
                <span className="text-[10px] text-[var(--studio-dim)]">{selectedCaptures.length}</span>
              </div>
              {selectedCaptures.length > 0 ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {selectedCaptures.map((capture, index) => (
                    <div key={capture.id} className="group relative overflow-hidden rounded-lg border border-[var(--studio-border)] bg-black">
                      <button type="button" onClick={() => onPreviewImage(capture.imageUrl)} className="block w-full">
                        <img src={capture.imageUrl} alt={`机位截图 ${index + 1}`} className="aspect-video w-full object-contain" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingCaptureId(capture.id)}
                        className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-400/30 bg-black/75 text-red-200 opacity-0 backdrop-blur transition hover:bg-red-500/30 group-hover:opacity-100 focus:opacity-100"
                        aria-label={`删除机位截图 ${index + 1}`}
                        title="删除机位截图"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs leading-5 text-[var(--studio-dim)]">
                  调整完成后导出机位截图。截图会自动进入极速参考图。
                </p>
              )}
              {captureError ? <p className="mt-3 text-xs text-red-400">{captureError}</p> : null}
            </section>
          </aside>
        </div>
      </div>
      <StudioModal
        open={Boolean(deletingCaptureId)}
        onClose={() => setDeletingCaptureId(null)}
        themeMode="light"
        className="max-w-lg"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10 text-red-500">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-semibold text-stone-950">删除机位截图？</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                截图记录及其极速参考图会一并移除，此操作无法撤销。
              </p>
            </div>
            <button type="button" onClick={() => setDeletingCaptureId(null)} className="text-stone-500" aria-label="关闭">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => setDeletingCaptureId(null)} className="rounded-xl border border-stone-200 px-4 py-2 text-sm text-stone-700">
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeDirectorScene && deletingCaptureId) {
                  onDeleteCapture(activeDirectorScene.sceneId, deletingCaptureId);
                }
                setDeletingCaptureId(null);
              }}
              className="rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2 text-sm text-red-700"
            >
              确认删除
            </button>
          </div>
        </div>
      </StudioModal>
    </StudioPage>
  );
}
