export function toggleSelectionOrder(selectedIds: string[], targetId: string) {
  return selectedIds.includes(targetId)
    ? selectedIds.filter((selectedId) => selectedId !== targetId)
    : [...selectedIds, targetId];
}

export function resolveMaterialsInSelectionOrder<T extends { id: string }>(materials: T[], selectedIds: string[]) {
  const materialsById = new Map(materials.map((material) => [material.id, material]));
  return selectedIds
    .map((materialId) => materialsById.get(materialId))
    .filter((material): material is T => Boolean(material));
}
