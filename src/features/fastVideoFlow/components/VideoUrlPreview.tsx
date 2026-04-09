import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, AlertCircle, CheckCircle2 } from 'lucide-react';

/** Validation constraints from Seedance API spec */
export const VIDEO_REFERENCE_CONSTRAINTS = {
  minDurationSec: 2,
  maxDurationSec: 15,
  maxTotalDurationSec: 15,
  minAspectRatio: 0.4,
  maxAspectRatio: 2.5,
  minPixelSide: 300,
  maxPixelSide: 6000,
  minTotalPixels: 409_600,  // 640×640
  maxTotalPixels: 927_408,  // 834×1112
  maxFileSizeMb: 50,
  minFps: 24,
  maxFps: 60,
  allowedExtensions: ['mp4', 'mov'],
} as const;

export type VideoValidationError = {
  field: string;
  message: string;
};

export type VideoMetaInfo = {
  durationSec: number;
  width: number;
  height: number;
};

/** Run client-side validation on a loaded <video> element */
export function validateVideoElement(video: HTMLVideoElement): VideoValidationError[] {
  const errors: VideoValidationError[] = [];
  const c = VIDEO_REFERENCE_CONSTRAINTS;

  const { duration, videoWidth, videoHeight } = video;

  if (duration < c.minDurationSec || duration > c.maxDurationSec) {
    errors.push({
      field: 'duration',
      message: `视频时长 ${duration.toFixed(1)}s 不在允许区间 [${c.minDurationSec}s, ${c.maxDurationSec}s] 内`,
    });
  }

  if (videoWidth > 0 && videoHeight > 0) {
    const ratio = videoWidth / videoHeight;
    if (ratio < c.minAspectRatio || ratio > c.maxAspectRatio) {
      errors.push({
        field: 'aspectRatio',
        message: `宽高比 ${ratio.toFixed(2)} 不在允许区间 [${c.minAspectRatio}, ${c.maxAspectRatio}] 内`,
      });
    }

    if (videoWidth < c.minPixelSide || videoWidth > c.maxPixelSide) {
      errors.push({
        field: 'width',
        message: `视频宽度 ${videoWidth}px 不在允许区间 [${c.minPixelSide}px, ${c.maxPixelSide}px] 内`,
      });
    }

    if (videoHeight < c.minPixelSide || videoHeight > c.maxPixelSide) {
      errors.push({
        field: 'height',
        message: `视频高度 ${videoHeight}px 不在允许区间 [${c.minPixelSide}px, ${c.maxPixelSide}px] 内`,
      });
    }

    const totalPixels = videoWidth * videoHeight;
    if (totalPixels < c.minTotalPixels || totalPixels > c.maxTotalPixels) {
      errors.push({
        field: 'totalPixels',
        message: `总像素 ${(totalPixels / 1000).toFixed(0)}K (${videoWidth}×${videoHeight}) 不在允许区间 [${(c.minTotalPixels / 1000).toFixed(0)}K, ${(c.maxTotalPixels / 1000).toFixed(0)}K] 内`,
      });
    }
  }

  return errors;
}

/** Validate URL extension (best-effort, only for URLs ending in .mp4/.mov) */
export function validateVideoUrl(url: string): VideoValidationError[] {
  const errors: VideoValidationError[] = [];
  if (!url.trim()) return errors;

  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const ext = pathname.split('.').pop() || '';
    const allowed = VIDEO_REFERENCE_CONSTRAINTS.allowedExtensions as readonly string[];
    if (ext && !allowed.includes(ext)) {
      errors.push({
        field: 'format',
        message: `URL 扩展名 .${ext} 不在允许格式中（mp4、mov）`,
      });
    }
  } catch {
    // ignore, URL may not be parseable
  }

  return errors;
}

interface VideoUrlPreviewProps {
  url: string;
  className?: string;
  /** Called after video metadata loads or load fails */
  onValidated?: (errors: VideoValidationError[], meta: VideoMetaInfo | null) => void;
}

export function VideoUrlPreview({ url, className = '', onValidated }: VideoUrlPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isError, setIsError] = useState(false);
  const [validationErrors, setValidationErrors] = useState<VideoValidationError[]>([]);
  const [metaInfo, setMetaInfo] = useState<VideoMetaInfo | null>(null);

  useEffect(() => {
    setIsError(false);
    setValidationErrors([]);
    setMetaInfo(null);
    if (videoRef.current) {
      videoRef.current.load();
    }
  }, [url]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const meta: VideoMetaInfo = {
      durationSec: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
    };
    setMetaInfo(meta);

    // URL extension check + element-based checks
    const urlErrors = validateVideoUrl(url);
    const elementErrors = validateVideoElement(video);
    const allErrors = [...urlErrors, ...elementErrors];
    setValidationErrors(allErrors);
    onValidated?.(allErrors, meta);
  }, [url, onValidated]);

  const handleError = useCallback(() => {
    setIsError(true);
    const errors: VideoValidationError[] = [{ field: 'load', message: '无法加载视频，请检查 URL 是否有效且允许跨域访问' }];
    setValidationErrors(errors);
    onValidated?.(errors, null);
  }, [onValidated]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        const promise = videoRef.current.play();
        if (promise !== undefined) {
          promise.catch(() => {
            console.error('Video play failed');
          });
        }
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  if (!url) return null;

  if (isError) {
    return (
      <div className={`relative flex items-center justify-center bg-black/20 rounded-xl ${className}`}>
        <div className="flex flex-col items-center gap-2 text-rose-400">
          <AlertCircle className="w-8 h-8" />
          <span className="text-xs">无法加载视频预览</span>
        </div>
      </div>
    );
  }

  const hasErrors = validationErrors.length > 0;

  return (
    <div className="space-y-2">
      <div className={`relative group bg-black rounded-xl overflow-hidden ${className}`}>
        <video
          ref={videoRef}
          src={url}
          muted={isMuted}
          loop
          playsInline
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onError={handleError}
          onEnded={() => setIsPlaying(false)}
          className="w-full h-full object-contain"
        />
        {/* Hover controls overlay */}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-auto">
          <button
            type="button"
            onClick={togglePlay}
            className="p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
          </button>
        </div>
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={toggleMute}
            className="p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
        {/* Validation status badge (top-left) */}
        {metaInfo !== null && (
          <div className={`absolute top-2 left-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${hasErrors ? 'bg-rose-500/80 text-white' : 'bg-emerald-500/80 text-white'}`}>
            {hasErrors
              ? <><AlertCircle className="w-3 h-3" /> 不符合要求</>
              : <><CheckCircle2 className="w-3 h-3" /> 格式有效</>
            }
          </div>
        )}
        {/* Duration badge (bottom-left) */}
        {metaInfo !== null && (
          <div className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-200 font-mono">
            {metaInfo.durationSec.toFixed(1)}s · {metaInfo.width}×{metaInfo.height}
          </div>
        )}
      </div>

      {/* Validation error list */}
      {hasErrors && (
        <div className="space-y-1">
          {validationErrors.map((err, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-rose-400">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{err.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
