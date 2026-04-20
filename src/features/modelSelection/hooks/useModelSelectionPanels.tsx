import { useState } from 'react';

import type { WorkspaceThemeMode } from '../../../components/studio/WorkspaceViews.tsx';
import type { ApiSettings, AspectRatio, ModelSourceId, Shot } from '../../../types.ts';
import { TimelineStrip, OperationModelPanel, CompactOperationModelPanel } from '../components/ModelSelectionPanels.tsx';
import { getTimelineStripItems } from '../../creativeFlow/utils/timeline.ts';
import {
  getCompactOperationOptions,
  getEstimatedCost,
  getFlowSelection,
  getOperationOptions,
  getOperationSelection,
  getTransitionVideoConfig as getTransitionVideoConfigForShot,
  getVideoCostUnits as getVideoCostUnitsForShot,
  type ModelCategory,
  type OperationCostUnits,
} from '../utils/modelSelection.ts';

type FlowModelSelection = 'default' | string;
type OperationModelSelection = 'flow' | string;

type UseModelSelectionPanelsArgs = {
  apiSettings: ApiSettings;
  themeMode: WorkspaceThemeMode;
  shots: Shot[];
  defaultAspectRatio: AspectRatio;
};

type RenderTimelineStripOptions = {
  interactive?: boolean;
  onShotClick?: (shotId: string) => void;
  onTransitionClick?: (fromShotId: string) => void;
};

type RenderCompactOperationModelPanelOptions = {
  showCategoryTag?: boolean;
  layout?: 'stacked' | 'inline';
};

export function useModelSelectionPanels({
  apiSettings,
  themeMode,
  shots,
  defaultAspectRatio,
}: UseModelSelectionPanelsArgs) {
  const [flowModelOverrides, setFlowModelOverrides] = useState<Record<ModelCategory, FlowModelSelection>>({
    text: 'default',
    image: 'default',
    video: 'default',
  });
  const [operationModelOverrides, setOperationModelOverrides] = useState<Record<string, OperationModelSelection>>({});

  const getTextModelSourceId = () => getFlowSelection(apiSettings, flowModelOverrides, 'text').sourceId;

  const getTextModelName = () => getFlowSelection(apiSettings, flowModelOverrides, 'text').modelName;

  const getOperationSourceId = (operationKey: string, category: ModelCategory): ModelSourceId => {
    return getOperationSelection(apiSettings, flowModelOverrides, operationModelOverrides, operationKey, category).sourceId;
  };

  const getOperationModelName = (operationKey: string, category: ModelCategory) => {
    return getOperationSelection(apiSettings, flowModelOverrides, operationModelOverrides, operationKey, category).modelName;
  };

  const getVideoCostUnits = (shot?: Shot): OperationCostUnits => {
    return getVideoCostUnitsForShot(shot, defaultAspectRatio);
  };

  const getTransitionVideoConfig = (shot?: Shot) => {
    return getTransitionVideoConfigForShot(shot, defaultAspectRatio);
  };

  const renderTimelineStrip = (options?: RenderTimelineStripOptions) => (
    <TimelineStrip
      themeMode={themeMode}
      items={getTimelineStripItems(shots)}
      interactive={Boolean(options?.interactive)}
      onShotClick={options?.onShotClick}
      onTransitionClick={options?.onTransitionClick}
    />
  );

  const renderOperationModelPanel = (operationKey: string, category: ModelCategory, units?: OperationCostUnits) => {
    const rawSelected = operationModelOverrides[operationKey] || 'flow';
    const resolvedSelection = getOperationSelection(apiSettings, flowModelOverrides, operationModelOverrides, operationKey, category);
    const costEstimate = getEstimatedCost(apiSettings, resolvedSelection.sourceId, category, units, resolvedSelection.modelName);

    return (
      <OperationModelPanel
        themeMode={themeMode}
        operationKey={operationKey}
        category={category}
        options={getOperationOptions(apiSettings, category)}
        rawSelected={rawSelected}
        resolvedSelection={resolvedSelection}
        costEstimate={costEstimate}
        units={units}
        onChange={(value) => setOperationModelOverrides((prev) => ({ ...prev, [operationKey]: value as OperationModelSelection }))}
      />
    );
  };

  const renderCompactOperationModelPanel = (
    operationKey: string,
    category: ModelCategory,
    units?: OperationCostUnits,
    options?: RenderCompactOperationModelPanelOptions,
  ) => {
    const rawSelected = operationModelOverrides[operationKey] || 'flow';
    const resolvedSelection = getOperationSelection(apiSettings, flowModelOverrides, operationModelOverrides, operationKey, category);
    const costEstimate = getEstimatedCost(apiSettings, resolvedSelection.sourceId, category, units, resolvedSelection.modelName);

    return (
      <CompactOperationModelPanel
        themeMode={themeMode}
        category={category}
        options={getCompactOperationOptions(apiSettings, category)}
        rawSelected={rawSelected}
        resolvedSelection={resolvedSelection}
        costEstimate={costEstimate}
        units={units}
        showCategoryTag={options?.showCategoryTag}
        layout={options?.layout}
        onChange={(value) => setOperationModelOverrides((prev) => ({ ...prev, [operationKey]: value as OperationModelSelection }))}
      />
    );
  };

  const resetFlowModelOverrides = () => {
    setFlowModelOverrides({
      text: 'default',
      image: 'default',
      video: 'default',
    });
  };

  return {
    getTextModelSourceId,
    getTextModelName,
    getOperationSourceId,
    getOperationModelName,
    getVideoCostUnits,
    getTransitionVideoConfig,
    renderTimelineStrip,
    renderOperationModelPanel,
    renderCompactOperationModelPanel,
    resetFlowModelOverrides,
  };
}
