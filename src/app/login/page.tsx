'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { verifyChallenge, setSession } from '@/lib/auth';
import FloatingBackdrop from '@/components/floating-backdrop';
import { navigateTo, openPopup } from '@/lib/navigate';
import { SSO_POPUP_MESSAGE_TYPE } from '@/lib/sso';

// 구글 OAuth 동의 창과 비슷한 크기. 렛커 SSO 로그인 카드가 360px 폭이라 여유 있게 들어간다.
const POPUP_WIDTH = 500;
const POPUP_HEIGHT = 650;
const POPUP_NAME = 'letscareer-sso';

// 모바일 브라우저에서 window.open 은 새 탭으로 열리고 크기 지정이 무시되며 window.close()가
// 동작하지 않는 경우가 있다. 구글도 모바일에서는 리다이렉트로 폴백한다.
const MOBILE_MAX_WIDTH = 768;

function formatPhoneNum(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phoneNum, setPhoneNum] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 팝업을 열기 직전의 로그인 상태. 닫힘 감지에서 "이 팝업으로 새로 로그인된 것"과
  // "원래부터 로그인돼 있던 것"을 구분하는 데 쓴다. null 은 아직 확인 전.
  const wasAuthorizedRef = useRef<boolean | null>(null);

  useEffect(() => {
    // useSearchParams()는 Suspense 경계가 필요한데 이 페이지는 이미 완전히
    // 클라이언트 렌더링이라 굳이 경계를 새로 만들지 않고 window.location에서 읽는다.
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'sso_failed') {
      setError('렛츠커리어 로그인에 실패했습니다. 다시 시도해주세요.');
    }
  }, []);

  /**
   * 지금 이 브라우저가 VOD 를 볼 수 있는 상태인지 서버에 묻는다.
   *
   * `/vod` 로 그냥 이동해 보고 미들웨어가 판정하게 하면 안 된다 — 그 미들웨어는 쿠키가
   * **있는지만** 보는 1차 게이트라, 예전에 로그인해 남아 있는 쿠키만으로도 통과한다.
   * 만료·서명까지 실제로 검증하는 곳은 `/api/vod` 다.
   */
  async function isAuthorized(): Promise<boolean> {
    try {
      const res = await fetch('/api/vod', { cache: 'no-store' });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * 팝업이 닫히는 것을 감시한다.
   *
   * postMessage 가 오지 않는 경우가 두 가지다 — 사용자가 로그인하지 않고 창을 닫았을 때,
   * 그리고 COOP 로 opener 연결이 끊겨 메시지를 보낼 수 없을 때다. 둘을 구분하지 않고
   * `/vod` 로 밀면 **취소가 로그인처럼 처리된다**(이미 유효한 쿠키를 들고 있으면 그대로
   * 통과해버린다). 그래서 닫힌 뒤 서버에 다시 묻고, 이 팝업으로 **새로 로그인된 경우에만**
   * 이동한다. 팝업을 열기 전 상태를 같이 비교하는 이유가 그것이다.
   */
  function watchPopupClose() {
    if (closeTimerRef.current) clearInterval(closeTimerRef.current);
    closeTimerRef.current = setInterval(() => {
      if (popupRef.current && !popupRef.current.closed) return;
      clearPopupWatch();
      void isAuthorized().then((authorizedNow) => {
        // 열기 전 판정이 아직 안 끝났으면(null) 이동하지 않는다. 확신 없이 이동하는 것보다
        // 사용자가 버튼을 한 번 더 누르는 쪽이 낫다.
        if (authorizedNow && wasAuthorizedRef.current === false) {
          router.replace('/vod');
        }
      });
    }, 500);
  }

  function clearPopupWatch() {
    if (closeTimerRef.current) {
      clearInterval(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    popupRef.current = null;
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // 오리진과 발신 창을 모두 확인한다. 오리진만 보면 같은 사이트의 다른 iframe 도 통과한다.
      if (event.origin !== window.location.origin) return;
      if (popupRef.current && event.source !== popupRef.current) return;
      if (event.data?.type !== SSO_POPUP_MESSAGE_TYPE) return;

      const ok = event.data.ok === true;
      popupRef.current?.close();
      clearPopupWatch();

      if (ok) router.replace('/vod');
      else setError('렛츠커리어 로그인에 실패했습니다. 다시 시도해주세요.');
    }

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      clearPopupWatch();
    };
    // router 는 안정적인 참조다. 이 리스너는 마운트 동안 한 번만 걸면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPhoneNum(formatPhoneNum(e.target.value));
  }

  function buildSsoUrl(ssoUrl: string, callbackPath: string) {
    const redirectUri = `${window.location.origin}${callbackPath}`;
    return `${ssoUrl}/sso/login?redirect_uri=${encodeURIComponent(redirectUri)}&service_name=${encodeURIComponent('VOD')}`;
  }

  function handleSsoLogin() {
    const ssoUrl = process.env.NEXT_PUBLIC_LETSCAREER_SSO_URL;
    if (!ssoUrl) {
      setError('SSO 로그인이 아직 설정되지 않았습니다.');
      return;
    }

    if (window.innerWidth < MOBILE_MAX_WIDTH) {
      navigateTo(buildSsoUrl(ssoUrl, '/auth/callback'));
      return;
    }

    // 클릭 핸들러 안에서 동기적으로 연다. 앞에 await 이 끼면 사용자 제스처가 소실돼 차단된다.
    const popup = openPopup(
      buildSsoUrl(ssoUrl, '/auth/callback/popup'),
      POPUP_NAME,
      POPUP_WIDTH,
      POPUP_HEIGHT,
    );

    if (!popup) {
      // 팝업 차단. 조용히 실패하면 버튼이 고장난 것처럼 보이므로 전체 이동으로 폴백한다.
      navigateTo(buildSsoUrl(ssoUrl, '/auth/callback'));
      return;
    }

    setError('');
    popupRef.current = popup;
    // 팝업을 연 뒤에 띄운다 — 앞에 await 이 끼면 사용자 제스처가 소실돼 팝업이 차단된다.
    wasAuthorizedRef.current = null;
    void isAuthorized().then((v) => {
      wasAuthorizedRef.current = v;
    });
    watchPopupClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const isChallenge = await verifyChallenge(name.trim(), phoneNum.trim());
      if (isChallenge) {
        setSession({ name: name.trim(), phoneNum: phoneNum.trim() });
        router.push('/vod');
      } else {
        setError('현재 참여 중인 챌린지가 없습니다.');
      }
    } catch {
      setError('서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    /*
      배경은 중립 회색이 아니라 브랜드 인디고(#4D55F5)를 아주 옅게 섞은 톤이다. 중립 회색은
      "정하지 않은 색"으로 읽히는데, 같은 계열의 옅은 배경은 아래 CTA 버튼과 화면이 한 몸으로
      보이게 한다. 폼은 흰 카드로 띄워 넓은 창에서 허공에 뜨지 않게 붙잡는다 — 팝업(SSO 화면)은
      창 자체가 경계라 카드를 뺐지만, 여기는 경계를 만들어줄 창틀이 없다.
    */
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4 py-10">
      <FloatingBackdrop />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-gray-200/80 bg-white p-8 shadow-sm">
        <div className="mb-9 text-center">
          {/*
            로그인 화면은 문(門)이지 소개 페이지가 아니다. 제목 하나를 크고 단단하게 세우고
            (Pretendard 는 굵은 웨이트에서 자간이 벌어져 보이므로 tracking 을 좁힌다),
            설명은 한 줄로 조용히 둔다. 무엇을 입력해야 하는지는 아래 라벨이 이미 말한다.
          */}
          {/*
            무엇이 들어 있는지를 먼저 말하고, 그 다음에 이름을 밝힌다. 설명을 제목 아래
            작게 두면 정작 의미를 담은 문장이 곁다리로 밀린다 — 읽는 순서가 곧 위계다.

            "누가 들어올 수 있는가"는 여기서 말하지 않는다. 못 들어오는 경우는 확인 버튼을
            눌렀을 때 안내가 따로 나간다.
          */}
          <p className="text-sm leading-relaxed text-gray-500">
            먼저 지나온 사람들의 취업 준비 기록
          </p>
          {/*
            font-semibold 를 명시해야 한다. 등록한 웨이트가 600 하나뿐이라 다른 굵기를
            지정하면 브라우저가 없는 굵기를 흉내 내는 합성 볼드를 얹어 획이 뭉개진다.
            text-balance 는 줄을 고르게 나눈다 — 없으면 "기" 한 글자가 둘째 줄에 홀로 남는다.
          */}
          <h1 className="font-title mt-2 text-4xl font-semibold leading-tight text-balance tracking-tight text-gray-900">
            세미나 VOD 다시보기
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              이름
            </label>
            <Input
              id="name"
              type="text"
              placeholder="홍길동"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div>
            <label
              htmlFor="phoneNum"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              전화번호
            </label>
            <Input
              id="phoneNum"
              type="tel"
              placeholder="010-1234-5678"
              value={phoneNum}
              onChange={handlePhoneChange}
              disabled={loading}
              required
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="h-12 w-full" disabled={loading}>
            {loading ? '확인 중...' : '확인'}
          </Button>
        </form>

        <div className="my-7 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs text-gray-400">또는</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        {/*
          기존 이름+전화번호 폼은 그대로 둔다 — 렛커 계정이 없는 예외/프리미엄 유저는
          이 폼으로만 들어올 수 있다(LC-3208 확정 사항 2·4). SSO는 선택지 추가일 뿐이다.
        */}
        {/*
          구글·카카오 등 표준 OAuth 로그인 버튼과 같은 형태로 맞춘다 — 흰 배경에 옅은 테두리,
          로고는 왼쪽 끝에 고정하고 문구는 버튼 가운데에 둔다. 로고와 문구를 함께 가운데
          정렬하면 문구 길이에 따라 로고 위치가 흔들려 서비스마다 버튼이 달라 보인다.
        */}
        <Button
          type="button"
          variant="outline"
          className="relative h-12 w-full border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          onClick={handleSsoLogin}
        >
          <img
            src="/logo/logo-simple.svg"
            alt=""
            className="absolute left-4 h-5 w-5"
          />
          렛츠커리어로 로그인하기
        </Button>
      </div>
    </div>
  );
}
