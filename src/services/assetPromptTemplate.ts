import type { Asset, Brief } from '../types.ts';

function joinNonEmpty(parts: Array<string | undefined>) {
  return parts.map((item) => (item || '').trim()).filter(Boolean).join(', ');
}

function cleanupPlaceholderDescription(description: string) {
  const trimmed = description.trim();
  if (!trimmed) {
    return '';
  }

  const boilerplateMatch = trimmed.match(/^关于\s*(.+?)\s*的详细描述(?:\.\.\.)?[。.!！?？]*$/u);
  if (boilerplateMatch?.[1]) {
    return boilerplateMatch[1].trim();
  }

  return trimmed;
}

function normalizeSentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function buildCharacterCoreDescription(asset: Asset) {
  const details = asset.characterPrompt || {};
  const characterType = details.characterType === 'animal' ? 'animal' : 'human';
  const extra = joinNonEmpty([
    characterType === 'animal' ? 'animal character' : 'human character',
    details.gender ? `gender ${details.gender}` : '',
    details.ageVibe ? `${details.ageVibe} age vibe` : '',
    details.ethnicityOrAppearance ? `${details.ethnicityOrAppearance} appearance` : '',
    details.build ? `${details.build} build` : '',
    details.faceHairstyle ? `face and hairstyle: ${details.faceHairstyle}` : '',
  ]);

  const normalizedDescription = cleanupPlaceholderDescription(asset.description || '');
  const base = normalizedDescription || asset.name.trim() || 'character';
  return joinNonEmpty([base, extra]);
}

function buildClothingAndIdentity(asset: Asset) {
  const details = asset.characterPrompt || {};
  return joinNonEmpty([
    details.topOuterwear ? `top & outerwear: ${details.topOuterwear}` : '',
    details.bottomsFootwear ? `bottoms & footwear: ${details.bottomsFootwear}` : '',
    details.mainColors ? `main colors: ${details.mainColors}` : '',
    details.uniqueMark ? `unique mark: ${details.uniqueMark}` : '',
    details.signatureProp ? `signature prop: ${details.signatureProp}` : '',
  ]);
}

function buildCharacterTypeConstraint(asset: Asset) {
  const characterType = asset.characterPrompt?.characterType === 'animal' ? 'animal' : 'human';
  if (characterType === 'animal') {
    return 'Character type: animal. Preserve true animal anatomy and posture, keep species-accurate limbs and proportions, no anthropomorphic human body, no upright human-like standing.';
  }
  return 'Character type: human.';
}

function buildSceneCoreDescription(asset: Asset) {
  const scene = asset.scenePrompt || {};
  const extra = joinNonEmpty([
    scene.locationType ? `location type: ${scene.locationType}` : '',
    scene.eraOrWorld ? `era/world: ${scene.eraOrWorld}` : '',
    scene.architectureLandscape ? `architecture/landscape: ${scene.architectureLandscape}` : '',
    scene.timeOfDay ? `time of day: ${scene.timeOfDay}` : '',
    scene.weatherAtmosphere ? `weather/atmosphere: ${scene.weatherAtmosphere}` : '',
    scene.lighting ? `lighting: ${scene.lighting}` : '',
    scene.mainColors ? `main colors: ${scene.mainColors}` : '',
    scene.foregroundElements ? `foreground elements: ${scene.foregroundElements}` : '',
    scene.backgroundLandmark ? `background landmark: ${scene.backgroundLandmark}` : '',
  ]);

  const normalizedDescription = cleanupPlaceholderDescription(asset.description || '');
  const base = normalizedDescription || asset.name.trim() || 'scene';
  return joinNonEmpty([base, extra]);
}

function buildSceneNegativeHints(asset: Asset) {
  const scene = asset.scenePrompt || {};
  if (!scene.avoidElements?.trim()) {
    return '';
  }
  return `Avoid: ${scene.avoidElements.trim()}.`;
}

function buildProductCoreDescription(asset: Asset) {
  const product = asset.productPrompt || {};
  const extra = joinNonEmpty([
    product.category ? `category: ${product.category}` : '',
    product.formFactor ? `form factor: ${product.formFactor}` : '',
    product.materialFinish ? `material and finish: ${product.materialFinish}` : '',
    product.mainColors ? `main colors: ${product.mainColors}` : '',
    product.heroFeatures ? `hero features: ${product.heroFeatures}` : '',
    product.logoBranding ? `branding: ${product.logoBranding}` : '',
    product.packagingDetails ? `packaging/accessories: ${product.packagingDetails}` : '',
    product.usageScene ? `usage context: ${product.usageScene}` : '',
  ]);

  const normalizedDescription = cleanupPlaceholderDescription(asset.description || '');
  const base = normalizedDescription || asset.name.trim() || 'product';
  return joinNonEmpty([base, extra]);
}

function buildProductNegativeHints(asset: Asset) {
  const product = asset.productPrompt || {};
  if (!product.avoidElements?.trim()) {
    return '';
  }
  return `Avoid: ${product.avoidElements.trim()}.`;
}

function getStyleKeywords(brief: Brief) {
  return (brief.stylePrompt || brief.style || '').trim();
}

export function buildCharacterReferencePrompt(asset: Asset, brief: Brief) {
  const coreDescription = buildCharacterCoreDescription(asset);
  const clothingAndIdentity = buildClothingAndIdentity(asset);
  const styleKeywords = getStyleKeywords(brief);
  const typeConstraint = buildCharacterTypeConstraint(asset);

  const segments = [
    `Character Reference Sheet of ${coreDescription}${clothingAndIdentity ? `, wearing ${clothingAndIdentity}` : ''}.`,
    'Includes front, true side, and back full-body views.',
    `Style: ${normalizeSentence(styleKeywords)}`,
    typeConstraint,
    'Clean solid white color background, only character no other items. consistent design, high detail, orthographic turnaround, neutral pose, full body visible, no cropping.',
  ].filter(Boolean);

  return segments.join(' ');
}

export function buildSceneReferencePrompt(asset: Asset, brief: Brief) {
  const coreDescription = buildSceneCoreDescription(asset);
  const styleKeywords = getStyleKeywords(brief);
  const negativeHints = buildSceneNegativeHints(asset);

  const segments = [
    `Scene Consistency Reference Sheet of ${coreDescription}.`,
    'Includes wide establishing, medium environmental, and detail close-up views of the same location.',
    normalizeSentence(styleKeywords),
    negativeHints,
    'Clean solid background, consistent environment design, high detail, concept-art sheet quality, no people, no text, no watermark, no cropping.',
  ].filter(Boolean);

  return segments.join(' ');
}

export function buildProductReferencePrompt(asset: Asset, brief: Brief) {
  const coreDescription = buildProductCoreDescription(asset);
  const styleKeywords = getStyleKeywords(brief);
  const negativeHints = buildProductNegativeHints(asset);

  const segments = [
    `Product Consistency Reference Sheet of ${coreDescription}.`,
    'Includes hero packshot, front view, three-quarter view, and close-up detail views of the same product.',
    `Style: ${normalizeSentence(styleKeywords)}`,
    negativeHints,
    'Single product only, clean studio background, centered composition, consistent branding, high detail, no hands, no people, no food clutter, no text overlay, no watermark, no cropping.',
  ].filter(Boolean);

  return segments.join(' ');
}
