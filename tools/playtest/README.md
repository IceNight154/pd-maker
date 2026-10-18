# 자동 플레이 테스트 (개발용)

PDMaker 런타임이 실제 게임에서 제대로 도는지 **사람 없이** 확인하는 도구입니다.
Linux, Java 17, xvfb, ImageMagick(`import`), node가 필요합니다. 윈도우에서 일반 제작을 할 때는 쓸 일이 없습니다.
에디터의 ▶ 테스트 플레이를 쓰면 됩니다.

| 파일 | 하는 일 |
|---|---|
| `build.sh <게임 저장소> <작업 폴더> [프로젝트]` | 저장소를 `<작업 폴더>/src`로 복사하고 pdmaker 런타임을 설치한 뒤, javac로 `<작업 폴더>/out`에 컴파일 |
| `run.sh <작업 폴더> <프로젝트> 단계…` | xvfb 화면에서 게임을 켜고, 단계대로 조작하면서 `<작업 폴더>/shots/*.png`에 스크린샷을 남김 |
| `PlayTest.java` | 단계 실행기 |
| `Hooks.java` | `eval:` 단계에서 쓰는 검사·조작 모음 |
| `scenarios.js` · `platform-matrix.sh <작업 폴더> <프로젝트> [환경…]` | 화면 환경별(PC · 휴대폰 가로/세로 비율 · 안전 영역 · 화면 돌림) 연출 시나리오를 돌리고 배치 문제 · 이벤트 종료를 판정 (4차) |

환경 변수:

- `JARS`: libGDX·lwjgl jar가 있는 폴더입니다. 기본값은 `/tmp/jars`이고, 하위 폴더 `lw`도 포함합니다.
- `NOMP3=1`: mp3 디코더가 없는 환경에서 mod-2 타이틀 곡을 theme_1.ogg로 바꿉니다.
- `TIMEOUT`: 최대 실행 시간(초)입니다.
- `XVFB_SCREEN`: 가상 화면 크기 (기본 `1280x800x24`). 세로 비율 창을 띄우려면 `1800x1800x24` 처럼 크게.

## 단계

- `titlescene`: 타이틀 화면으로 이동
- `scene:RankingsScene`: 해당 메뉴 화면으로 이동. 다른 이름도 같은 방식입니다(Journal·Changes·About·News·Supporter·Start…).
- `start:WARRIOR`: 새 게임 시작. PDMaker 영웅이면 `start:ARIA`처럼 씁니다.
- `continue`: 이어하기
- `reload`: 저장 후 다시 불러오기
- `down` / `up` / `side` / `sideback` / `to:<노드>`: 층 이동
- `shot:<이름>`: 스크린샷
- `info`: 현재 상태 출력
- `close` / `hide`: 창 닫기
- `wait:<초>`: 기다리기
- `eval:<명령>`: Hooks 명령 실행
  - `adv` / `pick,<n>`: 대사창 넘기기 / 선택지 고르기
  - `click,<x>,<y>` / `click,<캐릭터id>`: 맵 칸 누르기(사람이 누른 것처럼) · `tp,<칸>`: 순간이동
  - `press,<글자>` / `slot,<n>` / `buttons`: 화면 버튼 누르기 / 저장 슬롯 누르기 / 버튼 목록 · `savetitle`: 저장하고 타이틀로
  - `touch,<x>,<y>`: 진짜 마우스 입력처럼 창 좌표 누르기 · `drag,<x1>,<y1>,<x2>,<y2>`: 누른 채 끌기 (프레임에 걸쳐) · `wnds`: 떠 있는 창·카메라·화면 목록 순서
  - `winsize,<가로>,<세로>`: 창 크기 바꾸기 (최소 크기 제한을 풀어 세로 비율도 됨 · 실행 중에 바꾸면 = 화면 돌림 · 창 크기 조절)
  - `uisize,<0|1|2>`: 인터페이스 크기 (0 = 휴대폰 기본 — 세로 창이면 세로 배치)
  - `insets,<왼>,<위>,<오른>,<아래>`: 안전 영역 흉내 (노치 · 상태 줄 · 내비게이션 바, 화면 px)
  - `layout`: 대사창 · 글 · 이름표 · 선택지 · 일러스트가 화면 · 안전 영역 밖으로 나가는지 (`LAYOUT-PROBLEM` 줄)
  - `cutinfo`: 이벤트 실행 중 · 페이드 · 일러스트 · 떠 있는 창
  - `wshot,<이름>`: 게임 창만 캡처
  - 5차 · 테스트 실행 환경(`TESTENV`)과 함께: `testenv`(환경 · 배속 · 창 · UI · 안전 영역 상태) · `speed,<1|2|4|16>` · `skip`(켜기/끄기) · `complete`(대사 완성) · `next`(다음 대사) · `rotate`(F9 화면 돌리기)
  - `typing`: 떠 있는 대사창의 글자 진행(`shown`) · 실제 시간(`real`) · 실제 1초당 글자(`perRealSec`) · 연출 · 자간 · 글 크기 · 선택지 열림
  - `layercells`: 레이어별 칸 → 사용자 타일 id · 칸 지형 (게임이 만든 타일맵 기준 — `compare-layers.js` 로 편집기 저장 배열과 비교)
  - `interact,<캐릭터id>[,menu]`: 다른 스레드에서 말 걸기 · `leavetalk`: 층을 떠나는 순간 대사
  - `tap`: 타이틀 "화면을 누르세요"
  - `title`: 타이틀 구성 출력
  - `music`: 지금 음악 출력
  - `herowin`: 영웅 창
  - `spells`: 주문 창 · `cast,<n>`: n번째 주문 (가까운 적에게)
  - `codex,<아이템id>`: 코덱스 사용 · `gauge[,n]`: 게이지 보기/더하기 · `element,<id>` · `elemwin`: 원소 창 · `rest`: 한 턴 쉬기
  - `subwin` / `subclass,<id>`: 전직 창 / 바로 전직 · `abiwin` / `ability,<id>` / `useab` / `abinfo`: 직업 능력
  - `event:[{"cmd":…;…}]`: 이벤트 명령 실행 (쉼표 대신 ;)
  - `tal` / `talup`: 특성
  - `lvl`: 레벨
  - `inv`: 가방
  - `eat`: 먹기
  - `heart`: 마음
  - `talk`: 대화
  - `fight,<n>`: 싸움
  - …

## 5차 — 테스트 실행 환경 · 배속 · 스킵 · 대사 연출 검사

- `TESTENV="$(node tools/playtest/testenv.js phone-port '{"safeArea":"notch"}')" tools/playtest/run.sh …` — 편집기 ▶ 테스트 플레이와 같은 실행 환경으로 켬 (`testenv.js <환경> [JSON 덮어쓰기]` = `PDM.testEnv.resolve` 결과). 세로 창은 `XVFB_SCREEN=1800x1800x24`.
- `tools/playtest/testenv-check.sh <게임 저장소> <작업 폴더>` — 검사용 프로젝트(`testenv-project.js`)를 만들어 빌드하고 11항목을 검사(12): 배속 1 · 2 · 4 · 16 (실제 시간당 글자 수) · 화면 단추 · 스킵(선택지 · 입력 기다리기에서 멈춤, 끝나면 원래 배속) · 화면 돌리기(세로 ↔ 가로 논리 화면 · 안전 영역 · 나온 글자 이어받기) · 배치 문제 0 · 줄마다 글꼴. 기록 · 캡처 = `<작업 폴더>/testenv-check/`.
- `node tools/playtest/compare-layers.js <expected-layers.json> <run.sh 출력 로그>` — `tools/tests/ui-layers.js <폴더>` 가 남긴 편집기 배열과 게임의 `eval:layercells` 출력을 비교.
- 모두 **PC 화면 시뮬레이션**입니다 (에뮬레이터 · 실제 기기 아님).

## 예

```bash
NOMP3=1 tools/playtest/build.sh ../git-hub/shattered-pixel-dungeon-mod-2 /tmp/play2
tools/playtest/run.sh /tmp/play2 sample-project titlescene wait:3 shot:title eval:tap wait:2 shot:menu scene:RankingsScene wait:2 shot:rank
```
