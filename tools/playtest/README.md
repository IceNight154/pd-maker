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

환경 변수:

- `JARS`: libGDX·lwjgl jar가 있는 폴더입니다. 기본값은 `/tmp/jars`이고, 하위 폴더 `lw`도 포함합니다.
- `NOMP3=1`: mp3 디코더가 없는 환경에서 mod-2 타이틀 곡을 theme_1.ogg로 바꿉니다.
- `TIMEOUT`: 최대 실행 시간(초)입니다.

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
  - `touch,<x>,<y>`: 진짜 마우스 입력처럼 창 좌표 누르기 · `wnds`: 떠 있는 창·카메라·화면 목록 순서
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

## 예

```bash
NOMP3=1 tools/playtest/build.sh ../git-hub/shattered-pixel-dungeon-mod-2 /tmp/play2
tools/playtest/run.sh /tmp/play2 sample-project titlescene wait:3 shot:title eval:tap wait:2 shot:menu scene:RankingsScene wait:2 shot:rank
```
