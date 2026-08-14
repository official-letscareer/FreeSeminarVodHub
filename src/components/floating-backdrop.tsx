/**
 * 로그인 화면 배경에 렛츠커리어 로고와 재생 아이콘을 아주 옅게 깔아둔다.
 *
 * 장식이지 정보가 아니다 — `aria-hidden` 으로 스크린리더에서 빼고 `pointer-events-none`
 * 으로 클릭을 통과시킨다. 폼 위에 얹히면 안 되므로 카드보다 낮은 레이어에 둔다.
 *
 * 배치는 화면 가장자리에 몰아둔다. 가운데는 로그인 카드가 차지하므로, 거기 두면
 * 카드 뒤에 가려 보이지도 않으면서 글자 대비만 떨어뜨린다.
 */

const BRAND = '#4D55F5';

/** 로고 마크(public/logo/logo-simple.svg). 원본이 이미 브랜드 컬러다. */
function LogoMark({ size }: { size: number }) {
  return (
    <img
      src="/logo/logo-simple.svg"
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * 다시보기 화면이라는 것을 말해주는 재생 글리프.
 *
 * 원 테두리 없이 삼각형만 둔다 — 옅은 불투명도에서 얇은 테두리 원은 획이 끊겨 보이고,
 * 면으로 채운 삼각형이 같은 농도에서 형태가 또렷하다. 모서리를 살짝 둥글려 로고의
 * 둥근 획과 결을 맞춘다.
 */
function PlayMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6 4.2L19.5 12L6 19.8V4.2Z"
        fill={BRAND}
        strokeLinejoin="round"
        strokeWidth="2"
        stroke={BRAND}
      />
    </svg>
  );
}

interface Shape {
  kind: 'logo' | 'play';
  size: number;
  /** 화면 기준 위치(%). 가운데(카드 자리)는 비워둔다. */
  top: string;
  left: string;
  opacity: number;
  /** 정지 상태이므로 기울기는 각 도형에 고정값으로 준다. 전부 수직이면 찍어놓은 티가 난다. */
  rotate: number;
}

const SHAPES: Shape[] = [
  { kind: 'logo', size: 92, top: '11%', left: '11%', opacity: 0.1, rotate: -8 },
  { kind: 'play', size: 56, top: '27%', left: '23%', opacity: 0.08, rotate: 6 },
  { kind: 'logo', size: 52, top: '68%', left: '15%', opacity: 0.09, rotate: 12 },
  { kind: 'play', size: 78, top: '81%', left: '29%', opacity: 0.07, rotate: -5 },
  { kind: 'logo', size: 68, top: '15%', left: '77%', opacity: 0.09, rotate: 9 },
  { kind: 'play', size: 46, top: '38%', left: '87%', opacity: 0.1, rotate: -11 },
  { kind: 'logo', size: 104, top: '70%', left: '81%', opacity: 0.07, rotate: 4 },
  { kind: 'play', size: 62, top: '87%', left: '67%', opacity: 0.08, rotate: -7 },
];

export default function FloatingBackdrop() {
  return (
    /*
      모바일(640px 미만)에서는 띄우지 않는다. 좁은 화면에서는 카드가 폭을 거의 다 채워
      도형이 설 자리가 없고, 남는 자리에 억지로 두면 카드 뒤에 겹쳐 글자 대비만 떨어뜨린다.
    */
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden overflow-hidden sm:block"
    >
      {SHAPES.map((shape, i) => (
        <span
          key={i}
          className="absolute block"
          style={{
            top: shape.top,
            left: shape.left,
            opacity: shape.opacity,
            transform: `rotate(${shape.rotate}deg)`,
          }}
        >
          {shape.kind === 'logo' ? (
            <LogoMark size={shape.size} />
          ) : (
            <PlayMark size={shape.size} />
          )}
        </span>
      ))}
    </div>
  );
}
