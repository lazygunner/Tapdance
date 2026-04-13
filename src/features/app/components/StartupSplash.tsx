import {
  useRef,
  useState,
  useEffect,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { motion } from 'motion/react';
import { Volume2, VolumeX } from 'lucide-react';

type StartupSplashProps = {
  onEnter: () => void;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
const STARTUP_TITLE = 'Tapdance';
const TYPEWRITER_START_DELAY_MS = 320;
const TYPEWRITER_INTERVAL_MS = 130;
const TITLE_COMPANION_REVEAL_DELAY_MS = 260;
const ENTER_BUTTON_REVEAL_DELAY_MS = 1150;
const EXIT_ANIMATION_MS = 950;

export function StartupSplash({ onEnter }: StartupSplashProps) {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [titleCharCount, setTitleCharCount] = useState(0);
  const [showTitleCompanions, setShowTitleCompanions] = useState(false);
  const [showEnterButton, setShowEnterButton] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [pointerGlow, setPointerGlow] = useState({ x: 50, y: 50, active: false });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const interactionRef = useRef<HTMLDivElement | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = interactionRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    setPointerGlow({
      x: clampPercent(((event.clientX - bounds.left) / bounds.width) * 100),
      y: clampPercent(((event.clientY - bounds.top) / bounds.height) * 100),
      active: true,
    });
  };

  const handlePointerLeave = () => {
    setPointerGlow((prev) => ({
      ...prev,
      x: 50,
      y: 50,
      active: false,
    }));
  };

  const pointerX = pointerGlow.x;
  const pointerY = pointerGlow.y;

  const ambientGlowStyle: CSSProperties = {
    backgroundImage: [
      `radial-gradient(circle at ${pointerX}% ${Math.max(pointerY - 18, 0)}%, rgba(34, 211, 238, ${pointerGlow.active ? 0.24 : 0.16}), transparent 24%)`,
      `radial-gradient(circle at ${100 - pointerX}% ${Math.min(pointerY + 26, 100)}%, rgba(244, 114, 182, ${pointerGlow.active ? 0.18 : 0.12}), transparent 28%)`,
      'linear-gradient(180deg, rgba(2, 6, 23, 0.34) 0%, rgba(2, 6, 23, 0.52) 54%, rgba(2, 6, 23, 0.84) 100%)',
    ].join(','),
  };

  const buttonStyle: CSSProperties = {
    backgroundImage: [
      `radial-gradient(circle at ${pointerX}% ${pointerY}%, rgba(255, 255, 255, 0.42), transparent 34%)`,
      'linear-gradient(135deg, rgba(103, 232, 249, 0.96) 0%, rgba(34, 211, 238, 0.9) 32%, rgba(96, 165, 250, 0.9) 66%, rgba(244, 114, 182, 0.84) 100%)',
    ].join(','),
    boxShadow: pointerGlow.active
      ? 'inset 0 1px 0 rgba(255,255,255,0.42), inset 0 0 0 1px rgba(255,255,255,0.16), 0 28px 90px rgba(14, 165, 233, 0.36), 0 10px 30px rgba(15, 23, 42, 0.4)'
      : 'inset 0 1px 0 rgba(255,255,255,0.3), inset 0 0 0 1px rgba(255,255,255,0.12), 0 22px 72px rgba(15, 23, 42, 0.52)',
    transform: `translate3d(${(pointerX - 50) * 0.035}px, ${(pointerY - 50) * 0.035}px, 0)`,
  };
  const titleText = STARTUP_TITLE.slice(0, titleCharCount);
  const hasFinishedTitle = titleCharCount >= STARTUP_TITLE.length;
  const splashStyle: CSSProperties = {
    clipPath: isExiting ? 'circle(0% at 50% 50%)' : 'circle(150vmax at 50% 50%)',
    WebkitClipPath: isExiting ? 'circle(0% at 50% 50%)' : 'circle(150vmax at 50% 50%)',
    transition: `clip-path ${EXIT_ANIMATION_MS}ms cubic-bezier(0.76, 0, 0.24, 1), -webkit-clip-path ${EXIT_ANIMATION_MS}ms cubic-bezier(0.76, 0, 0.24, 1)`,
  };

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    for (let index = 1; index <= STARTUP_TITLE.length; index += 1) {
      timers.push(setTimeout(() => {
        setTitleCharCount(index);
      }, TYPEWRITER_START_DELAY_MS + index * TYPEWRITER_INTERVAL_MS));
    }

    const typewriterCompleteMs = TYPEWRITER_START_DELAY_MS + STARTUP_TITLE.length * TYPEWRITER_INTERVAL_MS;
    timers.push(setTimeout(() => {
      setShowTitleCompanions(true);
    }, typewriterCompleteMs + TITLE_COMPANION_REVEAL_DELAY_MS));
    timers.push(setTimeout(() => {
      setShowEnterButton(true);
    }, typewriterCompleteMs + ENTER_BUTTON_REVEAL_DELAY_MS));

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = isMuted;
    video.volume = isMuted ? 0 : 1;
  }, [isMuted]);

  const handleToggleMuted = async () => {
    if (isExiting) {
      return;
    }

    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (!nextMuted) {
      try {
        await videoRef.current?.play();
      } catch {
        setIsMuted(true);
      }
    }
  };

  const handleEnterClick = () => {
    if (!showEnterButton || isExiting) {
      return;
    }

    setIsExiting(true);
    setIsMuted(true);
    exitTimerRef.current = setTimeout(() => {
      onEnter();
    }, EXIT_ANIMATION_MS);
  };

  return (
    <div className="fixed inset-0 z-50 min-h-screen overflow-hidden bg-[#040816] text-white" style={splashStyle}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.2),transparent_30%),linear-gradient(180deg,#040816_0%,#02050f_100%)]" />
      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${isVideoReady ? 'opacity-100' : 'opacity-0'}`}
        src="./assets/temp.mp4"
        autoPlay
        loop
        muted={isMuted}
        playsInline
        preload="auto"
        onLoadedData={() => setIsVideoReady(true)}
        aria-hidden="true"
      />
      <div className="absolute inset-0" style={ambientGlowStyle} />
      <motion.div
        className="absolute left-[10%] top-[12%] h-56 w-56 rounded-full bg-cyan-300/16 blur-3xl"
        animate={{ x: [0, 36, -12, 0], y: [0, -18, 22, 0], scale: [1, 1.12, 0.96, 1] }}
        transition={{ duration: 18, ease: 'easeInOut', repeat: Infinity }}
        aria-hidden="true"
      />
      <motion.div
        className="absolute right-[8%] top-[18%] h-64 w-64 rounded-full bg-fuchsia-400/12 blur-3xl"
        animate={{ x: [0, -32, 14, 0], y: [0, 24, -16, 0], scale: [0.96, 1.08, 1, 0.96] }}
        transition={{ duration: 20, ease: 'easeInOut', repeat: Infinity }}
        aria-hidden="true"
      />
      <motion.div
        className="absolute bottom-[18%] left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-sky-400/12 blur-3xl"
        animate={{ y: [0, -24, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 14, ease: 'easeInOut', repeat: Infinity }}
        aria-hidden="true"
      />

      <div className="absolute right-6 top-6 z-10 sm:right-10 sm:top-8">
        <button
          type="button"
          onClick={() => void handleToggleMuted()}
          disabled={isExiting}
          className="inline-flex items-center gap-3 rounded-full border border-white/14 bg-white/10 px-4 py-2.5 text-sm font-medium text-white/88 shadow-[0_18px_50px_rgba(2,6,23,0.28)] backdrop-blur-xl transition duration-300 hover:bg-white/14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          aria-pressed={!isMuted}
          aria-label={isMuted ? '开启视频声音' : '关闭视频声音'}
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          <span>{isMuted ? '声音关闭' : '声音开启'}</span>
        </button>
      </div>

      <div className="relative flex min-h-screen justify-center px-6 sm:px-10">
        <div
          ref={interactionRef}
          className="flex min-h-screen w-full max-w-4xl flex-col"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          <div className="mt-[12vh] text-center sm:mt-[13vh] lg:mt-[11vh]">
            <div className={`text-[0.72rem] font-medium uppercase tracking-[0.48em] text-white/54 transition-all duration-700 sm:text-[0.82rem] ${showTitleCompanions ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'}`}>
              Dance with your imagination
            </div>
            <h1
              className="mt-4 min-h-[1.05em] scale-x-[0.78] whitespace-nowrap text-[clamp(3rem,9vw,8.25rem)] font-semibold leading-none tracking-[0.06em] text-white/92 sm:scale-x-100 sm:tracking-[0.12em]"
              aria-label={STARTUP_TITLE}
            >
              <span aria-hidden="true">{titleText}</span>
              <span
                aria-hidden="true"
                className={`ml-2 inline-block h-[0.76em] w-[0.045em] translate-y-[0.08em] bg-white/80 transition-opacity duration-300 ${hasFinishedTitle ? 'opacity-0' : 'opacity-100 animate-pulse'}`}
              />
            </h1>
            <div className={`mt-5 text-sm font-medium tracking-[0.18em] text-white/68 transition-all duration-700 sm:text-lg ${showTitleCompanions ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}>
              集成 Seedance 2.0 的 AI 导演工作台
            </div>
          </div>

          <div className={`mb-[10vh] mt-auto transition-all duration-700 ease-out ${showEnterButton ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-20 opacity-0'}`}>
            <button
              type="button"
              onClick={handleEnterClick}
              disabled={!showEnterButton || isExiting}
              style={buttonStyle}
              className="group relative w-full appearance-none overflow-hidden rounded-[2rem] px-8 py-5 text-lg font-semibold tracking-[0.08em] text-slate-950 transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:px-10 sm:py-6 sm:text-xl"
              aria-label="进入 Tapdance"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-[inherit] bg-[linear-gradient(180deg,rgba(255,255,255,0.26)_0%,rgba(255,255,255,0.12)_14%,rgba(255,255,255,0)_34%)] opacity-80"
              />
              <span className="relative block drop-shadow-[0_1px_0_rgba(255,255,255,0.25)]">
                开始创作
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
