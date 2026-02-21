'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import CustomControls from './custom-controls';

// ─── YouTube IFrame API 최소 타입 선언 ────────────────────────────────────────
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setPlaybackRate(rate: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

interface YTPlayerOptions {
  videoId: string;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: () => void;
    onStateChange?: (e: { data: number }) => void;
  };
}

declare global {
  interface Window {
    YT: {
      Player: new (el: HTMLElement, options: YTPlayerOptions) => YTPlayer;
      PlayerState: { PLAYING: 1; PAUSED: 2; ENDED: 0 };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

const YT_PLAYING = 1;

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────
export default function VideoPlayer({ youtubeId }: { youtubeId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const divRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrentTime(playerRef.current?.getCurrentTime() ?? 0);
    }, 500);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 전체화면 상태 감지
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    let destroyed = false;

    function initPlayer() {
      if (!divRef.current || destroyed) return;
      playerRef.current = new window.YT.Player(divRef.current, {
        videoId: youtubeId,
        playerVars: {
          controls: 0,        // 기본 컨트롤 숨김
          rel: 0,
          modestbranding: 1,
          disablekb: 1,       // 키보드 단축키 차단
          iv_load_policy: 3,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            if (!destroyed) {
              setDuration(playerRef.current?.getDuration() ?? 0);
              setReady(true);
            }
          },
          onStateChange: (e) => {
            if (destroyed) return;
            if (e.data === YT_PLAYING) {
              setPlaying(true);
              setDuration(playerRef.current?.getDuration() ?? 0);
              startTimer();
            } else {
              setPlaying(false);
              stopTimer();
              setCurrentTime(playerRef.current?.getCurrentTime() ?? 0);
            }
          },
        },
      });
    }

    if (window.YT?.Player) {
      initPlayer();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        initPlayer();
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }

    return () => {
      destroyed = true;
      stopTimer();
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [youtubeId, startTimer, stopTimer]);

  // ─── 컨트롤 핸들러 ──────────────────────────────────────────────────────────
  function handlePlayPause() {
    if (!playerRef.current) return;
    playing ? playerRef.current.pauseVideo() : playerRef.current.playVideo();
  }

  function handleSeek(delta: number) {
    if (!playerRef.current) return;
    const next = (playerRef.current.getCurrentTime() ?? 0) + delta;
    playerRef.current.seekTo(Math.max(0, next), true);
  }

  function handleScrub(time: number) {
    if (!playerRef.current) return;
    playerRef.current.seekTo(time, true);
    setCurrentTime(time);
  }

  function handleSpeedChange(rate: number) {
    if (!playerRef.current) return;
    playerRef.current.setPlaybackRate(rate);
    setSpeed(rate);
  }

  function handleFullscreen() {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }

  return (
    <div ref={containerRef} className={`w-full select-none ${isFullscreen ? 'flex flex-col h-screen bg-black' : ''}`}>
      {/* ── 영상 영역 ─────────────────────────────────────────────────── */}
      <div className={`relative w-full bg-black overflow-hidden ${isFullscreen ? 'flex-1 rounded-none' : 'aspect-video rounded-t-lg'}`}>
        {/* YT 플레이어가 마운트될 div */}
        <div ref={divRef} className="absolute inset-0 w-full h-full" />

        {/* 투명 오버레이: iframe 직접 클릭 차단 + 클릭으로 재생/일시정지 (z-10) */}
        <div
          className="absolute inset-0 z-10 cursor-pointer"
          onClick={handlePlayPause}
          onDoubleClick={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* 로딩 스피너 */}
        {!ready && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* ── 커스텀 컨트롤 (영상 아래) ─────────────────────────────────── */}
      <CustomControls
        playing={playing}
        ready={ready}
        currentTime={currentTime}
        duration={duration}
        speed={speed}
        isFullscreen={isFullscreen}
        onPlayPause={handlePlayPause}
        onSeek={handleSeek}
        onScrub={handleScrub}
        onSpeedChange={handleSpeedChange}
        onFullscreen={handleFullscreen}
      />
    </div>
  );
}
