import type { Dispatch, SetStateAction } from 'react';

import type { Asset, Project } from '../../../types.ts';
import type { CharacterPrompt, ProductPrompt } from '../utils/creativeFlowHelpers.ts';

type UseAssetDetailActionsArgs = {
  setProject: Dispatch<SetStateAction<Project>>;
  setNewAsset: Dispatch<SetStateAction<Partial<Asset>>>;
};

export function useAssetDetailActions({ setProject, setNewAsset }: UseAssetDetailActionsArgs) {
  const updateNewAssetCharacterDetail = <K extends keyof CharacterPrompt>(key: K, value: CharacterPrompt[K]) => {
    setNewAsset((prev) => ({
      ...prev,
      characterPrompt: {
        ...(prev.characterPrompt || {}),
        [key]: value,
      },
    }));
  };

  const updateAssetCharacterDetail = <K extends keyof CharacterPrompt>(assetId: string, key: K, value: CharacterPrompt[K]) => {
    setProject((prev) => ({
      ...prev,
      assets: prev.assets.map((item) => item.id === assetId
        ? {
          ...item,
          characterPrompt: {
            ...(item.characterPrompt || {}),
            [key]: value,
          },
        }
        : item),
    }));
  };

  const updateNewAssetSceneDetail = (key: keyof NonNullable<Asset['scenePrompt']>, value: string) => {
    setNewAsset((prev) => ({
      ...prev,
      scenePrompt: {
        ...(prev.scenePrompt || {}),
        [key]: value,
      },
    }));
  };

  const updateAssetSceneDetail = (assetId: string, key: keyof NonNullable<Asset['scenePrompt']>, value: string) => {
    setProject((prev) => ({
      ...prev,
      assets: prev.assets.map((item) => item.id === assetId
        ? {
          ...item,
          scenePrompt: {
            ...(item.scenePrompt || {}),
            [key]: value,
          },
        }
        : item),
    }));
  };

  const updateNewAssetProductDetail = <K extends keyof ProductPrompt>(key: K, value: ProductPrompt[K]) => {
    setNewAsset((prev) => ({
      ...prev,
      productPrompt: {
        ...(prev.productPrompt || {}),
        [key]: value,
      },
    }));
  };

  const updateAssetProductDetail = <K extends keyof ProductPrompt>(assetId: string, key: K, value: ProductPrompt[K]) => {
    setProject((prev) => ({
      ...prev,
      assets: prev.assets.map((item) => item.id === assetId
        ? {
          ...item,
          productPrompt: {
            ...(item.productPrompt || {}),
            [key]: value,
          },
        }
        : item),
    }));
  };

  return {
    updateNewAssetCharacterDetail,
    updateAssetCharacterDetail,
    updateNewAssetSceneDetail,
    updateAssetSceneDetail,
    updateNewAssetProductDetail,
    updateAssetProductDetail,
  };
}
