'use client';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface CustomControlsProps {
  playing: boolean;
  ready: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  isFullscreen: boolean;
  onPlayPause: () => void;
  onSeek: (delta: number) => void;
  onScrub: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onFullscreen: () => void;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function IconPause() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}
function IconSeekBack() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
    </svg>
  );
}
function IconSeekForward() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12.01 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
    </svg>
  );
}
function IconFullscreen() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
  );
}
function IconFullscreenExit() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
    </svg>
  );
}

export default function CustomControls({
  playing,
  ready,
  currentTime,
  duration,
  speed,
  isFullscreen,
  onPlayPause,
  onSeek,
  onScrub,
  onSpeedChange,
  onFullscreen,
}: CustomControlsProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="w-full bg-gray-900 rounded-b-lg px-4 py-3 space-y-2">
      {/* 프로그레스 바 */}
      <div className="relative h-2 bg-white/20 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-white rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
        <input
          type="range"
          min={0}
          max={Math.floor(duration) || 100}
          value={Math.floor(currentTime)}
          onChange={(e) => onScrub(Number(e.target.value))}
          disabled={!ready}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
        />
      </div>

      {/* 버튼 영역 */}
      <div className="flex items-center gap-2">
        {/* -10초 */}
        <button
          onClick={() => onSeek(-10)}
          disabled={!ready}
          className="flex items-center gap-1 text-white/80 hover:text-white disabled:opacity-40 transition-colors px-1"
          title="-10초"
        >
          <IconSeekBack />
          <span className="text-xs">10</span>
        </button>

        {/* 재생/일시정지 */}
        <button
          onClick={onPlayPause}
          disabled={!ready}
          className="text-white hover:text-white/80 disabled:opacity-40 transition-colors px-1"
          title={playing ? '일시정지' : '재생'}
        >
          {playing ? <IconPause /> : <IconPlay />}
        </button>

        {/* +10초 */}
        <button
          onClick={() => onSeek(10)}
          disabled={!ready}
          className="flex items-center gap-1 text-white/80 hover:text-white disabled:opacity-40 transition-colors px-1"
          title="+10초"
        >
          <span className="text-xs">10</span>
          <IconSeekForward />
        </button>

        {/* 시간 표시 */}
        <span className="text-white/60 text-xs ml-1 tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <div className="flex-1" />

        {/* 배속 선택 */}
        <div className="flex items-center gap-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              disabled={!ready}
              className={`text-xs px-1.5 py-1 rounded transition-colors disabled:opacity-40 ${
                speed === s
                  ? 'bg-white text-gray-900 font-semibold'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {s === 1 ? '1x' : `${s}x`}
            </button>
          ))}
        </div>

        {/* 전체화면 */}
        <button
          onClick={onFullscreen}
          disabled={!ready}
          className="text-white/80 hover:text-white disabled:opacity-40 transition-colors px-1"
          title={isFullscreen ? '전체화면 종료' : '전체화면'}
        >
          {isFullscreen ? <IconFullscreenExit /> : <IconFullscreen />}
        </button>
      </div>
    </div>
  );
}
