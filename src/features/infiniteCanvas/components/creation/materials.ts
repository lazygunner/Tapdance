/** Canvas node IDs replace NiegeIP cloud material IDs; token semantics are unchanged. */
export const CREATION_PROMPT_MAX_CHARACTERS = 10_000;
export type CreationMaterial = {
  id: string | number;
  kind: 'image' | 'video' | 'audio';
  name: string;
  url?: string;
  displayUrl?: string;
  available?: boolean;
};
