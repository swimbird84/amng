# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude 행동 규칙

### 계획 승인 규칙

**모든 계획은 사용자가 검토하고 승인하기 전까지 절대로 코드 작성을 시작하지 않는다.**

- 작업 요청을 받으면 먼저 계획을 수립하고 사용자에게 제시한다.
- 사용자가 명시적으로 승인(예: "승인", "진행해", "ok" 등)을 해야만 코드 작성을 시작한다.
- 어떤 형태의 소스 수정도 무조건 계획부터 설명하고 승인을 받아야 한다.
- 승인 없이는 단 한 자의 소스 변경도 절대 불가능하다.
- 버그 수정, 긴급 상황, 명백한 오류 등 어떤 예외적인 상황에서도 승인 절차는 생략할 수 없다.
- "급하다", "명백하다", "작은 수정이다" 같은 이유로 승인을 건너뛰는 것은 절대 허용되지 않는다.
- 사용자가 계획 제시 없이 직접 지시한 경우에도 반드시 계획을 먼저 제시하고 승인을 받아야 한다. "진행해"는 계획을 제시한 이후의 명시적 승인으로 인정한다.
- "~로 바꿔줘", "~를 추가해", "~를 삭제해" 등 단순해 보이는 지시도 예외 없이 계획을 먼저 제시해야 한다. 변경 범위가 작거나 명백해 보여도 승인 절차는 생략할 수 없다.

### 답변 검증 규칙

**사용자의 질문에 답변하기 전에 반드시 내용을 검증한다.**

- 이전 답변이 있더라도 재질문을 받으면 반드시 이전 답변을 그대로 반복하지 않고 다시 검증한다.
- 명령어, 옵션, 플래그 등 기술적 사실은 반드시 확인 후 답변하며, 확신이 없으면 모른다고 말한다.
- 잘못된 답변을 한 번 했다고 해서 그것이 맞다는 전제로 재확인하지 않으며, 반드시 원점에서 다시 검증한다.

## Commands

```bash
npm run dev        # 개발 서버 실행 (electron-vite dev)
npm run build      # 빌드
npm run package    # Windows 배포 패키지 생성 (release/ 폴더)
```

테스트 없음. 린터 별도 설정 없음 (TypeScript 컴파일러가 타입 검사 역할).

## Architecture

Electron + React + SQLite 앱. 동영상/배우 관리 데스크탑 앱 (electron-vite 기반).

### 프로세스 구조

```
main process (src/main/)
  ├── index.ts        — 앱 진입점, BrowserWindow 생성
  ├── db.ts           — SQLite 초기화 + 마이그레이션 (better-sqlite3)
  └── ipc.ts          — 모든 IPC 핸들러 등록

preload (src/preload/index.ts)
  └── contextBridge로 window.api.invoke(channel, ...args) 하나만 노출

renderer (src/renderer/src/)
  ├── api.ts          — IPC 채널을 감싼 API 함수 모음
  ├── types.ts        — 공유 TypeScript 인터페이스
  ├── App.tsx         — 탭 라우팅 (home / dashboard / works / actors)
  ├── pages/          — Home, Dashboard, Works, Actors
  └── components/     — WorkForm, ActorForm, TagSelector, Rating, ImagePreview, RadarChart 등
```

### IPC 통신 패턴

renderer → main 방향만 존재. 모든 호출은 `api.invoke(channel, ...args)` 한 경로로만 통과.

채널 네이밍: `works:*`, `actors:*`, `work-tags:*`, `actor-tags:*`, `dialog:*`, `shell:*`, `image:*`, `scan:*`, `dashboard:*`

### DB 스키마 핵심

- **works** — 작품 (cover_path, product_number, title, release_date, rating, is_favorite, comment)
- **work_files** — 작품별 재생 경로 목록 (file_path, type: 'local'|'url', sort_order)
- **actors** — 배우 (height, bust, waist, hip, comment, birthday, debut_date, is_favorite). `ratio_score`는 저장 컬럼이 아닌 `actors:list` / `actors:get` 조회 시 WITH stats CTE로 실시간 계산되는 파생 컬럼
- **actor_scores** — 배우 점수 10개 항목 (face, bust, hip, physical, skin, acting, sexy, charm, technique, proportions), avg_score = 합계 / 10.0
- **work_tags_master / actor_tags_master** — 태그 마스터
- **work_tags / actor_tags** — 작품·배우-태그 연결 (is_rep: 대표태그 여부)
- **work_actors** — 작품-배우 연결

**마이그레이션 방식**: `db.ts`에서 `PRAGMA table_info`로 컬럼 존재 여부를 확인한 후 `ALTER TABLE`로 추가. 새 테이블은 `CREATE TABLE IF NOT EXISTS` 이후 별도 블록에서 처리.

### actor_scores 항목 추가 시 주의사항

항목을 추가할 때 반드시 아래 모든 곳을 동시에 수정해야 한다. 누락 시 저장 오류 발생.

1. `db.ts` — 마이그레이션 추가
2. `types.ts` — `ActorScores` 인터페이스
3. `ActorForm.tsx` — SCORE_FIELDS, 기본값(신규/기존 배우 모두)
4. `WorkForm.tsx` — 신규 배우 생성 시 scores 기본값
5. `RadarChart.tsx` — LABELS, KEYS, `n` 값
6. `ipc.ts` — avg_score 계산식(`/ N`) 전체 교체 (replace_all 가능), `actors:get` SELECT + ratio_score CTE, `actors:list` SELECT + ratio_score CTE, `actors:create` INSERT/run, `actors:update` INSERT/run (create와 update 두 곳 모두)
7. `Actors.tsx` — 평점 평균 fallback 계산식(`/ N`)

### 이미지 처리

- 이미지는 `app.getPath('userData')/images/{works|actors}/{id}.{ext}` 에 복사해서 저장
- renderer에서 로컬 파일을 직접 로드할 수 없으므로 `image:read` IPC로 base64 변환 후 전달

### UI 규칙

- `window.confirm()` 사용 금지 — 인라인 확인 UI 사용
- 다크 테마 (bg-gray-900 기반), Tailwind CSS v4
- 모달은 `fixed inset-0 bg-black/60` 오버레이 패턴
