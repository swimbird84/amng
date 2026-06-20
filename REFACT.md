# 리팩토링 계획

## 개요

전체 코드베이스 분석 결과, 파일 크기 비대화와 코드 중복이 주요 개선 대상으로 확인됨.

| 파일 | 줄 수 | 상태 |
|------|-------|------|
| Worldcup.tsx | 4,094 | 분할 필수 |
| ipc.ts | 4,032 | 분할 필수 |
| SearchBar.tsx | 1,158 | 분할 권장 |
| Dashboard.tsx | 917 | 관리 가능 |
| PhysicalCorrectionModal.tsx | 847 | 관리 가능 |
| WorkForm.tsx | 808 | 관리 가능 |

---

## Phase 1: ipc.ts 분할 (4,032줄 -> 8개 파일)

### 현재 구조
- 줄 1-442: 헬퍼 함수 9개 (registerIpcHandlers 바깥)
- 줄 444-4032: `registerIpcHandlers()` 하나에 62개 핸들러 전부

### 분할 파일 목록

| 새 파일 | 원본 줄 범위 | 핸들러 수 | 내용 |
|---------|------------|----------|------|
| `ipc.ts` (메인) | - | 0개 | import + registerIpcHandlers()에서 각 모듈 호출 |
| `ipc-works.ts` | 447-822 | 7개 | works:*, work-files:* |
| `ipc-actors.ts` | 823-1305 + 2258-2278 | 9개 | actors:* (physical-data 포함) |
| `ipc-tags.ts` | 1306-1501 | 24개 | tag-categories, tags, tag-links |
| `ipc-studios.ts` | 1502-1628 | 15개 | studios:*, makers:*, studio-codes:* |
| `ipc-system.ts` | 1629-1745, 2280-2289 | 11개 | dialog:*, scan:*, shell:*, image:* |
| `ipc-dashboard.ts` | 1746-2257 | 27개 | dashboard:* |
| `ipc-cup.ts` | 7-442, 2290-4031 | 31개 | cup:*, ranking-settings:*, master-ranking:* + 헬퍼 함수 9개 |

### 각 파일 패턴

```typescript
// ipc-works.ts
import { ipcMain } from 'electron'
import { getDatabase } from './db'

export function registerWorksHandlers(): void {
  const db = () => getDatabase()
  // works:list, works:get, ... 핸들러들
}
```

```typescript
// ipc.ts (메인)
import { registerWorksHandlers } from './ipc-works'
import { registerActorsHandlers } from './ipc-actors'
// ...

export function registerIpcHandlers(): void {
  registerWorksHandlers()
  registerActorsHandlers()
  registerTagsHandlers()
  registerStudiosHandlers()
  registerSystemHandlers()
  registerDashboardHandlers()
  registerCupHandlers()
}
```

### 주의사항
- `image:read`(줄 2282-2288)는 현재 dashboard 뒤에 끼어있음 -> ipc-system.ts로 이동
- `actors:physical-data`(줄 2258-2278)는 현재 dashboard 뒤에 끼어있음 -> ipc-actors.ts로 이동
- 헬퍼 함수 9개(줄 7-442)는 cup 전용이므로 ipc-cup.ts로 이동
- 각 파일에서 필요한 import만 가져감

---

## Phase 2: Worldcup.tsx 분할 (4,094줄 -> 10개 파일)

### 현재 구조
- 32개 컴포넌트/함수가 한 파일에 정의
- 116개 useState, 42개 Hook 사용
- 주요 뷰 5개 + 모달 2개 + 차트 2개 + 유틸 7개

### 분할 파일 목록

| 새 파일 | 원본 줄 범위 | 예상 크기 | 내용 |
|---------|------------|----------|------|
| `cupTypes.ts` | 산재 (12-99, 2291-2965) | ~100줄 | 모든 타입 정의 (CupTournament, CupRun, CupMatch 등 13개) |
| `cupConstants.ts` | 산재 | ~200줄 | 상수 + 헬퍼 함수 (roundLabel, getDivision, Pagination 등) |
| `CreateModal.tsx` | 189-313 | ~150줄 | 대회 생성 모달 |
| `TournamentCard.tsx` | 362-771 | ~400줄 | 대회 카드 (시작/통계/순위/삭제/편집 액션) |
| `MatchCard.tsx` | 774-1080 | ~350줄 | 매치 카드 (배우/작품 정보, 점수, 메모) |
| `PlayView.tsx` | 1083-2288 | ~1,200줄 | 대회 진행 화면 (Match/Standings/Rank 탭) |
| `RankingSettingsModal.tsx` | 2318-2529 | ~250줄 | 랭킹 설정 모달 (승점/가중치/보너스) |
| `TournamentRankingsView.tsx` | 2558-2927 | ~400줄 | 대회별 순위 뷰 |
| `MasterRankingView.tsx` | 2994-3809 | ~900줄 | 마스터 랭킹 뷰 (순위/통계/1:1 대전/히스토리) |
| `Worldcup.tsx` (메인) | 3812-4094 | ~300줄 | 대회 목록 + 뷰 라우팅 |

### 디렉토리 구조

```
src/renderer/src/
  pages/
    Worldcup.tsx              (메인, ~300줄)
  components/
    cup/
      cupTypes.ts
      cupConstants.ts
      CreateModal.tsx
      TournamentCard.tsx
      MatchCard.tsx
      PlayView.tsx
      RankingSettingsModal.tsx
      TournamentRankingsView.tsx
      MasterRankingView.tsx
```

---

## Phase 3: 중복 유틸 함수 통합

### 동일 코드 복제 (최우선)

| 중복 함수 | 원본 위치 | 복제 위치 | 해결 |
|-----------|----------|----------|------|
| `hashColor()` + `studioColor()` | Works.tsx:11-19 | WorkViewModal.tsx:16-24 | `utils/colorHelpers.ts` 추출 |
| `getAge()` + `getDebutAge()` | Actors.tsx:13-25 | ActorViewModal.tsx:18-26 | `utils/dateHelpers.ts` 추출 |
| 태그 그룹화 로직 | SearchBar.tsx:753-781 | WorkViewModal.tsx:222-266, ActorViewModal.tsx:144-188 | `utils/tagGrouping.ts` 추출 |

### ipc.ts 내부 중복 (Phase 1과 함께 처리)

| 중복 로직 | 위치 1 | 위치 2 | 해결 |
|-----------|--------|--------|------|
| 부별 가중치 계산 (getDivWeight) | calcAndStoreRunPoints:270-271 | cup:run-live-scores:3801-3802 | 공통 함수 추출 |
| 매치 포인트 계산 | calcAndStoreRunPoints:273-308 | cup:run-live-scores:3804-3831 | 공통 함수 추출 |
| 순위 보너스 테이블 생성 | calcAndStoreRunPoints:336-345 | cup:run-live-scores:3833-3842 | 공통 함수 추출 |

---

## Phase 4: 커스텀 훅 추출

### 반복 패턴 -> 훅 전환

| 패턴 | 사용 파일 수 | 해결 |
|------|-------------|------|
| ESC 핸들러 (pushEscHandler/popEscHandler) | 6개 파일 | `useEscHandler(callback)` 훅 |
| localStorage 동기화 (useState + useEffect) | 4개 파일 | `useLocalStorage<T>(key, default)` 훅 |

---

## Phase 5: SearchBar.tsx 분할 (1,158줄)

### 현재 문제
- 3개 드롭다운(배우/스튜디오/태그)이 거의 동일한 구조로 반복
- 각 드롭다운마다: useState x4, useEffect x3, onKeyDown 핸들러, 필터 리스트 렌더링

### 분할 방안
- `useSearchDropdown` 훅 추출 (드롭다운 공통 로직)
- 서브컴포넌트 분리 (DatePickerInput, StarSelect, NumInput 등)
- 예상 감소: ~600-700줄

---

## 진행 상태

- [x] Phase 1: ipc.ts 분할 (4,032줄 → 8개 파일)
  - `ipc.ts` 17줄 (진입점), `ipc-cup.ts` 2,183줄, `ipc-dashboard.ts` 517줄, `ipc-actors.ts` 510줄, `ipc-works.ts` 382줄, `ipc-tags.ts` 202줄, `ipc-system.ts` 135줄, `ipc-studios.ts` 132줄
- [x] Phase 2: Worldcup.tsx 분할 (4,094줄 → 10개 파일)
  - `Worldcup.tsx` 294줄 (메인), `PlayView.tsx` 1,214줄, `MasterRankingView.tsx` 822줄, `TournamentCard.tsx` 418줄, `TournamentRankingsView.tsx` 376줄, `MatchCard.tsx` 316줄, `RankingSettingsModal.tsx` 232줄, `cupConstants.tsx` 166줄, `cupTypes.ts` 136줄, `CreateModal.tsx` 132줄
- [x] Phase 3: 중복 유틸 함수 통합
  - `utils/colorHelpers.ts` → hashColor/studioColor 중복 제거 (6개 파일: Works, WorkViewModal, Dashboard, Labels, StudioManager, MakerManager)
  - `utils/dateHelpers.ts` → getAge/getDebutAge 중복 제거 (3개 파일: Actors, ActorViewModal, CardTooltip)
  - 태그 그룹화 로직은 각 파일마다 미묘한 차이(타입, 필드명)가 있어 보류
  - ipc-cup.ts 내부 중복(getDivWeight, 매치 포인트 계산 등)은 보류
- [x] Phase 4: 커스텀 훅 추출
  - `escManager.ts`에 `useEscHandler` 훅 추가
  - 6개 파일에서 ESC 보일러플레이트 교체 (WorkViewModal, ActorViewModal, TagLinkModal, TagManager, ActorForm, ScoreDemoteModal)
  - 나머지 파일은 복합 패턴(다중 ESC, 조건부 등)이므로 기존 방식 유지
  - useLocalStorage 훅은 보류 (변경 범위 대비 효과 낮음)
- [ ] Phase 5: SearchBar.tsx 분할
