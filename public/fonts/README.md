# 제목 폰트 서브셋

`Paperlogy-6SemiBold-subset.woff2` — 제품 이름을 그리는 데만 쓰는 디스플레이 폰트다.

원본은 157KB 짜리 전체 글리프 파일인데, 이 사이트가 이 폰트로 그리는 글자는 제품 이름
몇 개뿐이라 그 글자만 남겨 **6.7KB** 로 줄였다.

## 대상 글자

```
세미나 VOD 다시보기프리미엄  +  ASCII 전체  +  일부 기호
```

`세미나 VOD 다시보기` (로그인·목록·상세 헤더), `프리미엄 세미나 VOD` (멤버십) 를 덮는다.

## 제목을 바꾸면 다시 만들어야 한다

서브셋에 없는 글자는 이 폰트에서 빠지고, 그 글자만 다음 폰트(Pretendard)로 그려진다.
깨져 보이지는 않지만 한 제목 안에서 서체가 섞인다. **제품 이름을 바꾸면 아래를 다시 실행한다.**

```bash
npx --yes -p subset-font -p node node -e "
const subsetFont = require('subset-font');
const { readFileSync, writeFileSync } = require('node:fs');
const ASCII = Array.from({length:95},(_,i)=>String.fromCharCode(32+i)).join('');
const PUNCT = '·…“”‘’—–《》〈〉「」%₩';
const TITLE = '세미나 VOD 다시보기프리미엄';   // ← 제목이 바뀌면 여기를 고친다
subsetFont(readFileSync('Paperlogy-6SemiBold.woff2'), TITLE + ASCII + PUNCT, { targetFormat: 'woff2' })
  .then(b => { writeFileSync('Paperlogy-6SemiBold-subset.woff2', b); console.log((b.length/1024).toFixed(1) + ' KB'); });
"
```

원본은 여기서 받는다.
`https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-6SemiBold.woff2`

## 본문 폰트(Pretendard)는 왜 서브셋하지 않나

VOD 제목·설명은 유튜브에서 오는 **임의의 텍스트**다. 상용 한글 2,350자로 잘라 두면
그 밖의 글자가 나왔을 때 그 글자만 시스템 폰트로 떨어져 한 문장 안에서 서체가 섞인다.
Pretendard 는 유니코드 범위별로 쪼갠 동적 서브셋을 쓰므로 어떤 글자가 와도 대응한다 —
요청이 여러 개로 나뉘는 것은 그 정확성의 값이다.
