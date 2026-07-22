const EFFECTIVE_DATE = "2026년 7월 20일";

export function PrivacyPolicyPage() {
  return (
    <article className="mx-auto max-w-3xl text-slate-300">
      <header className="border-b border-white/10 pb-8">
        <p className="text-sm font-medium text-emerald-300">Pawn Lab</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          개인정보 처리방침
        </h1>
        <p className="mt-3 text-sm text-slate-400">시행일: {EFFECTIVE_DATE}</p>
      </header>

      <PolicySection title="1. 개인정보 처리 목적">
        <p>
          Pawn Lab(이하 "운영자")은 EloBadge의 치지직 로그인, 스트리머
          채팅 연결, 방송용 오버레이 제공, Chess.com·Lichess 계정 소유 확인과 레이팅
          표시, 문의 대응 및 서비스 보안·장애 대응을 위해 개인정보를
          처리합니다. 수집한 정보는 이 목적 외로 이용하지 않습니다.
        </p>
      </PolicySection>

      <PolicySection title="2. 처리하는 개인정보">
        <PolicyTable
          headers={["구분", "처리 항목", "수집 방법"]}
          rows={[
            [
              "치지직 로그인",
              "채널 ID, 채널명, 로그인 유형, Firebase UID와 인증 메타데이터",
              "치지직 OAuth 및 Firebase Authentication"
            ],
            [
              "스트리머 연결",
              "치지직 OAuth 토큰, 권한 범위, 만료 시각, 채팅 세션 상태",
              "스트리머가 치지직 연결 시 수집"
            ],
            [
              "Chess.com 연동",
              "사용자명, 플레이어 ID, 프로필 URL·이미지·상태, Bullet·Blitz·Rapid 레이팅, 인증 및 갱신 상태",
              "사용자 입력 및 Chess.com 공개 API"
            ],
            [
              "Lichess 연동",
              "사용자명, 계정 ID, 프로필 URL·상태, Bullet·Blitz·Rapid·Classical 레이팅과 게임 수·임시 레이팅 여부",
              "Lichess OAuth 및 공개 API"
            ],
            [
              "채팅 오버레이",
              "발신자 채널 ID, 닉네임, 메시지, 역할, 치지직 배지·이모지 URL",
              "치지직 실시간 채팅 이벤트"
            ],
            [
              "방송 설정",
              "오버레이 접근 토큰, 화면 표시 설정",
              "스트리머가 직접 설정"
            ],
            [
              "서비스 이용 기록",
              "요청 경로, 응답 상태·시간, 오류 정보, 스트리머 채널 ID, 채팅 길이·배지 수·역할 등 비원문 진단 정보",
              "서비스 이용 과정에서 자동 생성"
            ],
            [
              "브라우저 저장 정보",
              "로그인 상태 및 설정 화면의 펼침 상태",
              "Firebase SDK 및 브라우저 localStorage"
            ]
          ]}
        />
        <p className="mt-4">
          시청자의 치지직 OAuth 토큰과 채팅 메시지 원문은 서버 데이터베이스에
          저장하지 않습니다. 스트리머의 치지직 OAuth 토큰은 채팅 세션 유지와
          자동 갱신을 위해 암호화하여 저장합니다. Lichess OAuth 토큰은 계정
          확인 직후 폐기하며 저장하지 않습니다.
        </p>
      </PolicySection>

      <PolicySection title="3. 보유 및 이용 기간">
        <PolicyTable
          headers={["정보", "보유 기간"]}
          rows={[
            ["계정 및 치지직 연결 정보", "EloBadge 계정 삭제 시까지"],
            ["스트리머 OAuth 토큰", "치지직 연결 해제 또는 계정 삭제 시까지"],
            ["Chess.com 계정·레이팅", "Chess.com 연동 해제 또는 계정 삭제 시까지"],
            ["Chess.com 인증 도전 정보", "인증 완료·연동 해제 시까지 또는 만료 후 정기 정리 시까지"],
            ["Lichess 계정·레이팅", "Lichess 연동 해제 또는 계정 삭제 시까지"],
            ["오버레이 설정", "오버레이 토큰 교체·계정 삭제 시까지"],
            ["채팅 원문", "메모리에서 오버레이 표시 시간 동안만 처리하며 서버에 저장하지 않음"],
            ["운영 로그", "최대 14일. 저장 공간 제한에 따라 더 일찍 삭제될 수 있음"]
          ]}
        />
        <p className="mt-4">
          관계 법령에 따라 별도 보존 의무가 발생하는 경우 해당 법령에서 정한
          기간 동안 분리하여 보관할 수 있습니다. Firebase Authentication은
          계정 삭제 요청 이후 자체 백업 시스템에서 정보를 제거하는 데 최대
          180일이 걸릴 수 있습니다.
        </p>
      </PolicySection>

      <PolicySection title="4. 개인정보의 제3자 제공">
        <p>
          운영자는 원칙적으로 개인정보를 제3자에게 판매하거나 제공하지
          않습니다. 다만 정보주체가 사전에 동의했거나 법령상 의무를 이행하기
          위해 필요한 경우에는 예외로 합니다. 아래 서비스 제공업체를 통한
          처리는 서비스 운영을 위한 위탁 또는 국외 이전에 해당할 수 있습니다.
        </p>
      </PolicySection>

      <PolicySection title="5. 처리 위탁 및 국외 이전">
        <PolicyTable
          headers={["업체·서비스", "목적과 항목", "처리 위치·기간"]}
          rows={[
            [
              "Google Firebase",
              "사용자 인증 및 데이터베이스 운영: UID, 채널명·ID, 인증 메타데이터와 서비스 계정 정보",
              "Authentication은 미국, Firestore는 서울(asia-northeast3). 계정 삭제 시까지 및 제공업체의 삭제·백업 정책에 따른 기간"
            ],
            [
              "Amazon Web Services Lightsail",
              "서버 호스팅 및 운영 로그 처리",
              "대한민국 서울(ap-northeast-2). 운영 로그는 최대 14일, 자동 스냅샷 사용 안 함"
            ],
            [
              "Chess.com LLC",
              "Chess.com 계정 확인 및 레이팅 조회: 사용자명과 공개 프로필 조회 요청",
              "미국 등 Chess.com의 처리 시설. 사용자가 연동·인증·갱신할 때 HTTPS API로 전송되며 제공업체 정책에 따라 처리"
            ],
            [
              "Lichess.org",
              "Lichess 계정 소유 확인 및 레이팅 조회: OAuth 코드·임시 토큰, 사용자명과 공개 프로필 조회 요청",
              "Lichess의 처리 시설. 사용자가 연동·갱신할 때 HTTPS API로 전송되며 임시 토큰은 확인 직후 폐기"
            ],
            [
              "Google Fonts 및 jsDelivr",
              "웹폰트 제공: IP 주소, 요청 URL, 브라우저·운영체제 정보와 리퍼러",
              "미국 등 제공업체의 처리 시설. 폰트를 불러올 때 전송되며 제공업체 정책에 따라 처리"
            ],
            [
              "Cloudflare",
              "도메인 등록 및 DNS 운영: DNS 요청 관련 정보",
              "Cloudflare의 글로벌 인프라. HTTP 프록시와 Analytics는 사용하지 않음"
            ]
          ]}
        />
        <p className="mt-4">
          사용자는 Chess.com·Lichess 연동을 하지 않거나 브라우저에서 외부 폰트 요청을
          차단할 수 있습니다. 다만 Firebase 인증 처리를 거부하면 EloBadge 계정
          기능을 이용할 수 없습니다.
        </p>
      </PolicySection>

      <PolicySection title="6. 개인정보의 파기">
        <p>
          보유 기간이 끝나거나 처리 목적이 달성된 개인정보는 지체 없이
          삭제합니다. 전자적 파일과 데이터베이스 문서는 복구하기 어렵도록
          삭제하고, 암호화된 OAuth 토큰 문서도 함께 삭제합니다. 계정 삭제 시
          활성 채팅 세션과 오버레이 연결을 종료하고 Firebase Authentication
          사용자와 관련 Firestore 문서를 삭제합니다.
        </p>
      </PolicySection>

      <PolicySection title="7. 정보주체의 권리와 행사 방법">
        <p>
          이용자는 자신의 개인정보에 대해 열람, 정정, 삭제, 처리정지 및 동의
          철회를 요청할 수 있습니다. Chess.com·Lichess 연동 해제, 치지직 연결 해제와
          EloBadge 계정 삭제는 로그인 후 각 설정 화면에서 직접 수행할 수
          있습니다. 그 밖의 요청은 아래 이메일로 접수합니다.
        </p>
        <ContactLink />
        <p className="mt-3">
          운영자는 요청자의 권리와 다른 이용자의 개인정보를 보호하기 위해
          치지직 계정 재로그인 등 합리적인 본인 확인을 요구할 수 있으며,
          비밀번호·OAuth 토큰·신분증 제출을 요구하지 않습니다.
        </p>
      </PolicySection>

      <PolicySection title="8. 만 14세 미만 아동">
        <p>
          EloBadge는 만 14세 미만 아동을 대상으로 서비스를 제공하지 않습니다.
          만 14세 미만인 경우 서비스를 이용하거나 계정을 연결하지 마세요.
          만 14세 미만 아동의 정보가 처리된 사실을 알게 된 경우
          support@elobadge.com으로 알려주시면 확인 후 필요한 조치를 합니다.
        </p>
      </PolicySection>

      <PolicySection title="9. 안전성 확보 조치">
        <ul className="list-disc space-y-2 pl-5">
          <li>Firestore를 서버의 Firebase Admin SDK로만 접근하도록 제한</li>
          <li>스트리머 OAuth 토큰의 AES-256-GCM 암호화 저장</li>
          <li>HTTPS 통신과 인증된 API 접근 적용</li>
          <li>오버레이 접근 토큰의 로그 마스킹과 교체 기능 제공</li>
          <li>운영 로그 보존 기간과 저장 용량 제한 적용</li>
        </ul>
      </PolicySection>

      <PolicySection title="10. 자동 수집 장치와 외부 자원">
        <p>
          EloBadge는 맞춤형 광고를 위한 쿠키를 직접 사용하지 않습니다.
          Firebase Authentication은 로그인 상태를 브라우저에 저장하며, 설정
          화면은 펼침 상태를 localStorage에 저장합니다. 브라우저가 외부 웹폰트
          또는 치지직 배지·이모지 이미지를 요청할 때 해당 제공업체에 IP 주소와
          HTTP 헤더가 전달될 수 있습니다. 브라우저 저장 정보는 브라우저 설정에서
          삭제할 수 있으나 로그인 유지나 화면 표시에 영향을 줄 수 있습니다.
        </p>
      </PolicySection>

      <PolicySection title="11. 개인정보 보호책임자">
        <dl className="grid grid-cols-[7rem_1fr] gap-y-2">
          <dt className="text-slate-400">개인정보처리자</dt>
          <dd>Pawn Lab</dd>
          <dt className="text-slate-400">책임자</dt>
          <dd>황윤기</dd>
          <dt className="text-slate-400">문의</dt>
          <dd><ContactLink /></dd>
        </dl>
      </PolicySection>

      <PolicySection title="12. 권익침해 구제와 방침 변경">
        <p>
          개인정보 침해 상담은 개인정보침해 신고센터(국번 없이 118) 또는
          개인정보분쟁조정위원회(1833-6972)에 문의할 수 있습니다. 이 처리방침을
          변경하는 경우 시행 전에 EloBadge 웹사이트를 통해 알립니다.
        </p>
      </PolicySection>
    </article>
  );
}

function PolicySection({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-white/10 py-8 last:border-b-0">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-4 text-sm leading-7">{children}</div>
    </section>
  );
}

function PolicyTable({
  headers,
  rows
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto border-y border-white/10">
      <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
        <thead className="bg-white/5 text-slate-200">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-3 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {rows.map((row) => (
            <tr key={row.join(":")}>
              {row.map((cell, index) => (
                <td
                  key={`${index}:${cell}`}
                  className="px-3 py-3 align-top text-slate-300"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContactLink() {
  return (
    <a
      href="mailto:support@elobadge.com"
      className="font-medium text-emerald-300 underline decoration-emerald-300/40 underline-offset-4 hover:text-emerald-200"
    >
      support@elobadge.com
    </a>
  );
}
