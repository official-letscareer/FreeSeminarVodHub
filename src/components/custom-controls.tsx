'use client';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface CustomControlsProps {
  playing: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  onPlayPause: () => void;
  onSeek: (delta: number) => void;
  onScrub: (time: number) => void;
  onSpeedChange: (speed: number) => void;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// SVG 아이콘 (재생/일시정지/되감기/빨리감기)
function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function IconPause() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}
function IconSeekBack() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
      <text x="12" y="15.5" fontSize="5" textAnchor="middle" fill="currentColor" fontWeight="bold">10</text>
    </svg>
  );
}
function IconSeekForward() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12.01 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
      <text x="12" y="15.5" fontSize="5" textAnchor="middle" fill="currentColor" fontWeight="bold">10</text>
    </svg>
  );
}

export default function CustomControls({
  playing,
  currentTime,
  duration,
  speed,
  onPlayPause,
  onSeek,
  onScrub,
  onSpeedChange,
}: CustomControlsProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-3 pt-8">
      {/* 프로그레스 바 */}
      <div className="mb-2 relative group/bar">
        <div className="w-full h-1 bg-white/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={Math.floor(duration) || 100}
          value={Math.floor(currentTime)}
          onChange={(e) => onScrub(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-1"
        />
      </div>

      {/* 컨트롤 버튼 */}
      <div className="flex items-center gap-2">
        {/* -10초 */}
        <button
          onClick={() => onSeek(-10)}
          className="text-white/90 hover:text-white transition-colors p-1"
          title="-10초"
        >
          <IconSeekBack />
        </button>

        {/* 재생/일시정지 */}
        <button
          onClick={onPlayPause}
          className="text-white hover:text-white/80 transition-colors p-1"
          title={playing ? '일시정지' : '재생'}
        >
          {playing ? <IconPause /> : <IconPlay />}
        </button>

        {/* +10초 */}
        <button
          onClick={() => onSeek(10)}
          className="text-white/90 hover:text-white transition-colors p-1"
          title="+10초"
        >
          <IconSeekForward />
        </button>

        {/* 시간 표시 */}
        <span className="text-white/80 text-xs ml-1 tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <div className="flex-1" />

        {/* 배속 선택 */}
        <div className="flex items-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                speed === s
                  ? 'bg-white text-black font-semibold'
                  : 'text-white/80 hover:text-white hover:bg-white/20'
              }`}
            >
              {s === 1 ? '1x' : `${s}x`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
