export type EditorAssetType = "video" | "image" | "audio" | "text";
export type EditorTrackType = "video" | "image" | "text" | "audio" | "captions";

export interface EditorAsset {
  id: string;
  name: string;
  type: EditorAssetType;
  /** URL de runtime. Para arquivos locais, é recriada a partir do IndexedDB. */
  url: string;
  durationInSeconds: number;
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
  storage: "indexeddb" | "remote";
  /** Caminho estável no Umbra Assets; permite renovar a URL assinada. */
  storagePath?: string;
  storageBucket?: string;
  production?: { projectId: string; sceneId: string; sceneNumber: number; variationNumber: number; selected: boolean };
  /** Amostras normalizadas usadas para desenhar a waveform sem reler o arquivo. */
  waveform?: number[];
  audioCategory?: "music" | "narration" | "sfx" | "original";
  musicGenre?: "electronic" | "cinematic" | "ambient" | "anime" | "indie" | "instrumental" | "folk" | "classical";
  sfxCategory?: "impact" | "transition" | "notification" | "ambience" | "other";
  sfxLibraryCategory?: "foley" | "ambient" | "effects";
  audioAnalysis?: {
    peak: number;
    rms: number;
    clipped: boolean;
    beatTimes: number[];
  };
  transcript?: {
    text: string;
    words: Array<{ text: string; startSeconds: number; endSeconds: number }>;
    segments: Array<{ startSeconds: number; endSeconds: number; text: string; role: "hook" | "problem" | "demo" | "proof" | "cta" | "other"; repeated: boolean }>;
  };
  sceneAnalysis?: {
    analyzedAt: string;
    qualityScore: number;
    samples: Array<{ timeSeconds: number; brightness: number; sharpness: number; motion: number; labels: string[]; qualityScore: number }>;
    summary: string;
  };
  thumbnail?: string;
  validation?: {
    engine: "mediabunny" | "browser";
    status: "compatible" | "warning" | "incompatible";
    container: string | null;
    videoCodec: string | null;
    audioCodec: string | null;
    fps: number | null;
    hasAudio: boolean;
    videoDecodable: boolean | null;
    audioDecodable: boolean | null;
    checkedAt: string;
    messages: string[];
  };
}

export interface EditorClip {
  id: string;
  assetId: string;
  trackId: string;
  from: number;
  durationInFrames: number;
  sourceStartFrame: number;
  volume: number;
  muted: boolean;
  /** Impede seleção e edição acidental deste elemento na timeline. */
  locked?: boolean;
  compoundId?: string;
  audioOnly?: boolean;
  audioRole?: "music" | "narration" | "sfx" | "original";
  ducking?: { enabled: boolean; level: number };
  normalizationGain?: number;
  playbackRate: number;
  speedCurve?: "constant" | "ease-in" | "ease-out" | "pulse";
  reversed?: boolean;
  opacity: number;
  transform: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
  };
  crop: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  fit: "contain" | "cover";
  freezeFrame: boolean;
  keyframes?: Array<{
    id: string;
    frame: number;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    opacity: number;
  }>;
  videoEffects?: {
    brightness: number;
    contrast: number;
    saturation: number;
    blur: number;
    backgroundBlur: number;
    hue: number;
    grayscale: number;
    sepia: number;
    preset: "none" | "cinematic" | "vibrant" | "warm" | "cold" | "noir";
    borderRadius: number;
    shadow: number;
    stabilization: number;
    chromaKey: { enabled: boolean; color: string; similarity: number; smoothness: number };
    backgroundRemoval: "off" | "chroma";
    mask: "none" | "circle" | "ellipse" | "rounded" | "portrait" | "diagonal";
    maskFeather: number;
    layout: "free" | "pip-top-right" | "pip-bottom-right" | "split-left" | "split-right";
  };
  transition: {
    fadeInFrames: number;
    fadeOutFrames: number;
    id?: string;
    type?: "cut" | "fade" | "cross-dissolve" | "push" | "whip" | "zoom" | "spin" | "flash" | "mask" | "glitch" | "luma" | "blur" | "elastic" | "camera" | "slide";
    durationInFrames?: number;
    easing?: "linear" | "ease" | "ease-in" | "ease-out" | "bounce" | "elastic";
    direction?: "left" | "right" | "up" | "down";
    intensity?: number;
    overlap?: number;
    audio?: boolean;
    enabled?: boolean;
    mode?: "in" | "out" | "both";
  };
  audioFade?: {
    fadeInFrames: number;
    fadeOutFrames: number;
  };
  text?: {
    content: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    color: string;
    backgroundColor: string;
    outlineColor: string;
    outlineWidth: number;
    borderRadius: number;
    padding: number;
    textAlign: "left" | "center" | "right";
  };
  animation?: {
    in: "none" | "fade" | "slide-up" | "zoom";
    out: "none" | "fade" | "slide-down" | "zoom";
    durationInFrames: number;
    /** Preset reutilizável aplicado pela Biblioteca de animações. */
    motion?: "fade" | "zoom" | "push" | "bounce" | "shake" | "slide" | "blur" | "pop" | "elastic";
    motionMode?: "in" | "out" | "both" | "loop";
    motionIntensity?: number;
    motionCurve?: "linear" | "smooth" | "fast" | "slow" | "bounce" | "elastic" | "overshoot";
  };
  /** Clipes com o mesmo grupo movem e podem ser selecionados juntos. */
  groupId?: string;
  /** Vincula, por exemplo, um vídeo ao seu áudio separado. */
  linkId?: string;
  caption?: {
    words: Array<{ id: string; text: string; startFrame: number; endFrame: number }>;
    preset: "umbra-bold" | "umbra-neon" | "umbra-clean";
    highlightColor: string;
  };
  commercial?: {
    kind: "cta" | "price" | "countdown" | "free-shipping" | "limited" | "rating" | "comment" | "before-after" | "bar" | "arrow" | "circle" | "logo";
    title: string;
    subtitle: string;
    price: string;
    oldPrice: string;
    discount: string;
    rating: number;
    commentAuthor: string;
    primaryColor: string;
    secondaryColor: string;
  };
}

export interface EditorTrack {
  id: string;
  name: string;
  type: EditorTrackType;
  clipIds: string[];
  locked: boolean;
  hidden: boolean;
  height?: number;
}

export interface EditorMarker {
  id: string;
  frame: number;
  label: string;
  color: string;
}

export interface EditorCompound {
  id: string;
  name: string;
  clipIds: string[];
  version: number;
  finalized: boolean;
  savedAsTemplate: boolean;
  createdAt: string;
}

export interface EditorSettings {
  width: number;
  height: number;
  fps: number;
  backgroundColor: string;
}

export interface EditorProject {
  id: string;
  name: string;
  settings: EditorSettings;
  assets: EditorAsset[];
  tracks: EditorTrack[];
  clips: EditorClip[];
  productionSource?: { projectId: string; jobId: string; generationId: string; productionVersion?: number };
  markers?: EditorMarker[];
  compounds?: EditorCompound[];
  brandKit?: {
    name: string;
    primaryColor: string;
    secondaryColor: string;
    logoAssetId: string | null;
  };
  appliedStyle?: {
    id: string;
    name: string;
    intensity: number;
    targets: import("./styleEngine").StyleApplyTargets;
    appliedAt: string;
    preferredCutSeconds: number;
  };
  autopilotAnalysis?: {
    generatedAt: string;
    model?: "shop-fast" | "ugc" | "demo" | "review" | "before-after" | "narracao-livre";
    targetSeconds: number;
    variant: number;
    retentionScore: number;
    brollSuggestions: string[];
    keywords: string[];
    selectedShotIds?: string[];
    removedShotIds?: string[];
    cleanScript?: string;
    sections?: Array<{ type: "hook" | "problem" | "demo" | "proof" | "cta"; text: string }>;
    hookVariants?: string[];
    rhythm?: "natural" | "balanced" | "fast";
    retentionCurve?: Array<{ frame: number; score: number; reasons: string[] }>;
    qualityReport?: { checkedAt: string; warnings: string[]; passed: string[] };
    dynamicConfig?: import("./dynamicEditingTypes").DynamicEditingConfig;
  };
  createdAt: string;
  updatedAt: string;
}

export interface EditorSelection {
  assetIds: string[];
  clipIds: string[];
  primaryAssetId: string | null;
  primaryClipId: string | null;
}

export interface EditorClipboard {
  clips: EditorClip[];
}

export interface EditorStoreState {
  past: EditorProject[];
  present: EditorProject;
  future: EditorProject[];
  selection: EditorSelection;
  clipboard: EditorClipboard | null;
  dirty: boolean;
  savedAt: string | null;
  restored: boolean;
}

export type ImportedEditorAsset = EditorAsset & { blob?: Blob };

export type EditorAction =
  | { type: "RESTORE_PROJECT"; project: EditorProject }
  | { type: "SET_PROJECT_NAME"; name: string }
  | { type: "IMPORT_ASSETS"; assets: ImportedEditorAsset[]; atFrame?: number }
  | { type: "ADD_ASSET_CLIP"; assetId: string; trackId: string; atFrame: number }
  | { type: "REMOVE_ASSET"; assetId: string }
  | { type: "MOVE_CLIP"; clipId: string; direction: -1 | 1 }
  | { type: "SET_CLIP_TIMING"; clipId: string; trackId: string; from: number; durationInFrames: number; sourceStartFrame: number }
  | { type: "SET_CLIPS_TIMING"; edits: Array<{ clipId: string; trackId: string; from: number; durationInFrames: number; sourceStartFrame: number }> }
  | { type: "RIPPLE_SET_CLIP_TIMING"; clipId: string; trackId: string; from: number; durationInFrames: number; sourceStartFrame: number }
  | { type: "SPLIT_CLIP"; clipId: string; frame: number }
  | { type: "ADD_TRACK"; trackType?: EditorTrackType }
  | { type: "TOGGLE_TRACK_LOCK"; trackId: string }
  | { type: "TOGGLE_CLIP_LOCK"; clipId: string }
  | { type: "CREATE_COMPOUND"; name?: string }
  | { type: "UPDATE_COMPOUND"; compoundId: string; changes: Partial<Pick<EditorCompound, "name" | "finalized" | "savedAsTemplate">> }
  | { type: "UNGROUP_COMPOUND"; compoundId: string }
  | { type: "DUPLICATE_COMPOUND"; compoundId: string; asVersion?: boolean }
  | { type: "TOGGLE_TRACK_VISIBILITY"; trackId: string }
  | { type: "SET_TRACK_HEIGHT"; trackId: string; height: number }
  | { type: "REORDER_TRACK"; trackId: string; targetTrackId: string }
  | { type: "ADD_MARKER"; frame: number; color: string; label?: string }
  | { type: "REMOVE_MARKER"; markerId: string }
  | { type: "GROUP_SELECTION" }
  | { type: "UNGROUP_SELECTION" }
  | { type: "LINK_SELECTION" }
  | { type: "UNLINK_SELECTION" }
  | { type: "RIPPLE_DELETE_SELECTION" }
  | { type: "UPDATE_CLIP"; clipId: string; changes: Partial<Pick<EditorClip, "sourceStartFrame" | "playbackRate" | "speedCurve" | "reversed" | "volume" | "muted" | "audioOnly" | "audioRole" | "ducking" | "normalizationGain" | "opacity" | "transform" | "crop" | "fit" | "freezeFrame" | "transition" | "audioFade" | "keyframes" | "videoEffects">> }
  | { type: "APPLY_MOTION"; clipIds: string[]; animation: NonNullable<EditorClip["animation"]> | null }
  | { type: "APPLY_TRANSITION"; clipIds: string[]; transition: EditorClip["transition"] }
  | { type: "SEPARATE_AUDIO"; clipId: string }
  | { type: "ADD_BEAT_MARKERS"; clipId: string }
  | { type: "SYNC_CUTS_TO_BEATS"; clipId: string }
  | { type: "UPDATE_ASSET_INTELLIGENCE"; assetId: string; transcript?: EditorAsset["transcript"]; sceneAnalysis?: EditorAsset["sceneAnalysis"] }
  | { type: "APPLY_PROJECT_CHANGE"; project: EditorProject }
  | { type: "ADD_TEXT_CLIP"; preset: "text" | "title" | "cta"; atFrame: number }
  | { type: "ADD_COMMERCIAL_CLIP"; preset: NonNullable<EditorClip["commercial"]>["kind"]; atFrame: number }
  | { type: "UPDATE_COMMERCIAL_CLIP"; clipId: string; changes: Partial<NonNullable<EditorClip["commercial"]>> }
  | { type: "UPDATE_BRAND_KIT"; changes: Partial<NonNullable<EditorProject["brandKit"]>> }
  | { type: "UPDATE_TEXT_CLIP"; clipId: string; changes: Partial<Pick<EditorClip, "text" | "animation" | "opacity" | "transform">>; applyToCaptionTrack?: boolean }
  | { type: "ADD_CAPTION_CUES"; cues: Array<{ text: string; from: number; durationInFrames: number; words: Array<{ text: string; startFrame: number; endFrame: number }> }> }
  | { type: "UPDATE_CAPTION_CLIP"; clipId: string; text?: string; preset?: "umbra-bold" | "umbra-neon" | "umbra-clean"; highlightColor?: string; applyToTrack?: boolean }
  | { type: "SELECT_ASSET"; assetId: string; additive?: boolean }
  | { type: "SELECT_CLIP"; clipId: string; additive?: boolean }
  | { type: "SET_CLIP_SELECTION"; clipIds: string[]; additive?: boolean }
  | { type: "CLEAR_SELECTION" }
  | { type: "SELECT_ALL_CLIPS" }
  | { type: "COPY_SELECTION" }
  | { type: "PASTE_CLIPBOARD" }
  | { type: "DUPLICATE_SELECTION" }
  | { type: "DUPLICATE_CLIPS_AT"; clipIds: string[]; deltaFrames: number }
  | { type: "DELETE_SELECTION" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "MARK_SAVED"; savedAt: string };
