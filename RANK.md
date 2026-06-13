# 마스터 랭킹 & 컵 대회 시스템 기획

## 개요

FIFA 랭킹 시스템에 빗댄 배우/작품 통합 랭킹 시스템.
배우와 작품 각각 독립적인 마스터 랭킹이 존재하며, 컵 대회 결과에 따라 승점이 부여된다.

---

## 마스터 랭킹

- 배우/작품 각각 독립 존재
- **승점제** 기반 (우승률/승률 방식 폐기)
- 초기값: **전원 0점 시작** (기존 데이터 초기화)
- 승점 집계: **최근 10회 참가 랭킹 대회** 합산
- 리셋: 수동 리셋 버튼 제공 — 진행 중인 대회가 없을 때만 실행 가능

### 부 구조 (배우/작품 공통)

마스터 랭킹 순위 기준으로 자동 배정. 인원 증가 시 하위 부 자동 생성.

| 부 | 인원 | 누적 인원 | 활성화 조건 |
|----|------|----------|------------|
| 1부 | 32명 | 32명 | 항상 |
| 2부 | 64명 | 96명 | 항상 |
| 3부 | 128명 | 224명 | 항상 |
| 4부 | 256명 | 480명 | 전체 225명 초과 시 |
| 5부 | 512명 | 992명 | 전체 481명 초과 시 |
| 6부 | 1024명 | 2016명 | 전체 993명 초과 시 |
| 미분류 | 나머지 | - | 부 기준 초과분 + 0점 신규 |

- 각 부 인원: 32, 64, 128, 256, 512, 1024... (2배씩 확장)
- 승강제 별도 없음 — 마스터 랭킹 순위가 부를 자동 결정

---

## 컵 대회 종류

### 1. 일반 대회 (마스터 랭킹 비영향)
- 대회 내부 승점(승3 무1 패0)으로 내부 순위만 산출
- 마스터 랭킹에 영향 없음
- 전 배우/작품 대상, 필터 적용 가능

### 2. 마스터 대회 (마스터 랭킹 영향)
- 대회 결과가 마스터 랭킹 승점에 반영됨
- 최소 참가 인원: 32명
- 월드컵 방식도 마스터 대회로 설정 가능

---

## 대회 규약 (생성 시 결정)

대회 생성 시 아래 규약을 설정하며, **시작 후에는 변경 불가**.
생성 후 ~ 시작 전 사이에는 수정 가능.

| 항목 | 선택지 |
|------|--------|
| 대회 유형 | 일반 \| 마스터 |
| 대회 방식 | 토너먼트 \| 리그전 \| 월드컵 |
| 참가 부 범위 | 단일 부 / 복수 부 / 전체 |
| 필터 조건 | 태그, 날짜 등 |

### 부별 대회 vs 섞인 대회 (자동 분류)

- **단일 부 선택** → 부별 대회
- **복수 부 또는 전체 선택** → 섞인 대회

이 분류에 따라 승점 계산 방식이 자동 결정됨.

---

## 대회 방식 (3가지)

### 1. 토너먼트
- 풀에서 랜덤 세션 구성 → 1:1 매치 → 탈락제
- 강 수: 시작 전 설정 (시작 버튼 클릭 시 확정)
- 개별 배우/작품 제외 기능 없음 (부 범위 + 필터 조건으로만 참가자 결정)
- 일반/랭킹 대회 모두 사용 가능

### 2. 리그전
- 풀 안에서 모든 참가자가 서로 1번씩 대결 (단판)
- 참가 N명 시 N×(N-1)/2 경기
- 강 수: 시작 전 설정
- 개별 배우/작품 제외 기능 없음
- 무승부 버튼: 좌우 카드 위에 별도 버튼으로 처리
- 최종 순위 산출 기준:
  1. 승점 (승3 무1 패0)
  2. 승자승 (동률자 간 직접대결 결과)
  3. 승수
  4. 추첨
- 일반/랭킹 대회 모두 사용 가능

### 3. 월드컵
- **전체 배우/작품 대상, 필터 없음** (고정) → 자동으로 섞인 대회
- 일반/랭킹 대회 모두 사용 가능
- 조건: 조당 최소 4명 이상

#### 예선 (조별 리그)
- 강 수 설정 → 조 수 자동 결정 (강 수 / 2 = 조 수, 각 조 상위 2명 진출)
- 조 편성: 마스터 랭킹 순위 기준 포트 구성, 포트별 각 조에 1명씩 랜덤 배정
- 0점(신규) 항목은 최하위 포트로 묶어 배정 (다크호스)
- 조별 단판 리그전 방식으로 진행

#### 본선 (토너먼트)
- 각 조 1위 그룹 vs 조 2위 그룹 교차 매치
- 첫 라운드(N강)에서는 같은 조 출신끼리 대결 안 함
- 2라운드부터는 제한 없이 일반 토너먼트 진행

---

## 승점 계산 (마스터 대회)

### 기본 승점
| 결과 | 승점 |
|------|------|
| 승 | 3점 |
| 무 | 1점 (리그전만) |
| 패 | 0점 |

### 부별 대회 승점 계산

같은 부 참가자끼리만 경쟁하므로 단일 가중치 적용.

**최종 승점** = `(승무패 승점 합계 + 순위 보너스) × 해당 부 가중치`

| 부 | 가중치 |
|----|--------|
| 1부 | × 5.0 |
| 2부 | × 3.5 |
| 3부 | × 2.5 |
| 4부 | × 1.5 |
| 5부 | × 1.0 |
| 미분류 | × 0.5 |

### 섞인 대회 승점 계산

복수 부가 혼합되므로 매치별·보너스별로 다른 가중치 적용.

**매치 승점** = `기본 승점 × 상대방 부 가중치`
- 강한 상대(상위 부)를 이길수록 더 많은 승점 획득
- 패배 시 0점이므로 상대 부 가중치 무관

**순위 보너스** = `보너스 점수 × 참가자 부 가중치 평균`
- 참가자 부 가중치 평균 = 전체 참가자의 부별 가중치 합산 / 참가 인원
- 예: 1부 8명(×5.0) + 2부 16명(×3.5) + 3부 8명(×2.5) → 평균 ×3.625

**최종 승점** = `매치 승점 합계 + 순위 보너스`

### 순위 보너스 (참가 인원 기준, 32명 미만은 보너스 없음)

| 참가 인원 | 우승 | 준우승 | 4강 | 8강 | 16강 | 32강 |
|----------|------|--------|-----|-----|------|------|
| 32명 | 15 | 8 | 4 | 2 | - | - |
| 64명 | 20 | 10 | 5 | 3 | 1 | - |
| 128명 | 25 | 13 | 6 | 3 | 1 | - |
| 256명 | 30 | 15 | 8 | 4 | 2 | 1 |
| 512명 | 35 | 18 | 9 | 5 | 2 | 1 |

- 참가 인원은 가장 가까운 2의 거듭제곱 기준 적용
- 대회 방식별(토너먼트/리그전/월드컵) 가중치 차등 없음 — 인원수 기준만 적용

---

## UI 설계

### 대회 목록 페이지

**상단바**
- 대회명 검색 인풋
- 셀렉트 박스 2개: `전체/배우/작품` · `전체/마스터/일반`
- 정렬: 대회명 / 등록순
- `[+ 대회 추가]` 버튼
- `[마스터 랭킹]` 버튼 (`[+ 대회 추가]` 오른쪽)

**대회 카드 (5단 grid)**
- 지난 대회 승자 썸네일
- 마스터 대회: 썸네일 좌상단에 `[MASTER]` 칩, 일반 대회는 없음
- M · F · X 버튼 (위치 기존과 동일)
- F 버튼:
  - 일반 대회 → 기존 필터 그대로
  - 마스터 대회 → 부 선택 or 풀 선택 (참가 수 보정 유지)
- 통계보기 제거 (추후 재설계)

### 대회 진행 화면

| 대회 방식 | 매치 탭 | 현황 탭 |
|-----------|---------|---------|
| 토너먼트 | O (1:1 카드) | X |
| 풀 리그전 | O (1:1 카드 + 무승부 버튼) | O (순위표 + 매치 목록) |
| 월드컵 | O (1:1 카드, 자동 매치 제공) | O (조별 순위표 + 본선 대진표) |

- 매치 탭: 매치 카드만, UI 최소화
- 월드컵 현황: 조별 탭 이동 없이 한 화면에 전체 현황 표시

---

## 현재 진행 상황

### 완료
- 기획 전체 확정 (마스터 랭킹, 컵 대회 종류, 승점 계산, UI 설계)
- RANK.md 문서화 완료

### 다음 작업
- **Phase 1 — DB (db.ts) 작업 시작 예정**
  - worldcup_* 테이블 5개 DROP
  - cup_tournaments, cup_stats, cup_entries, cup_matches, cup_match_points, master_ranking_history, ranking_settings 신규 생성

### DB 스키마 확정 (Phase 1 설계 완료)

```
cup_tournaments     — 대회 정의
id, type(actor/work), name, is_master(0/1), format(tournament/league/worldcup)
division_range(JSON), filter_json, status(ready/in_progress/completed)
round_total(시작 시 확정), settings_snapshot(마스터 대회 시작 시 설정 스냅샷)
winner_id, created_at, started_at, completed_at

cup_stats           — 항목별 누적 통계 (풀 보정 로직용)
type, item_id, total_cups, cup_wins, total_matches, match_wins
(기존 worldcup_stats 대체, UNIQUE(type, item_id))

cup_entries         — 대회별 참가자 + 시작 시점 부 스냅샷
tournament_id, item_id, division(null=미분류)
UNIQUE(tournament_id, item_id)

cup_matches         — 매치 결과
tournament_id, phase(group/main), group_id(조별리그 조 번호)
round, match_index, item1_id, item2_id, winner_id, is_bye, is_draw

cup_match_points    — 매치별 승점 (마스터 대회만)
tournament_id, match_id, item_id
base_points, bonus_points, total_points

master_ranking_history — 대회별 획득 점수 기록 (최근 10회 집계용)
tournament_id, type, item_id, points, recorded_at

ranking_settings    — 배우/작품별 설정값
type(actor/work) UNIQUE, settings_json
(기본값: 승점3/1/0, 부별가중치, 순위보너스 테이블)
```
위는 프롬프트에 띄워 준 내용  
아래는 위 내용을 RANK.md 에 정리 해달라고 했을 때 나온 내용  
이 두가지가 약간 내용이 달라 보여서 참고용으로 두개 다 정리  
작업 시작시 확인 필요
```
cup_tournaments     type/name/is_master/format/division_range/filter_json
                    status(ready→in_progress→completed)/round_total
                    settings_snapshot/winner_id/created_at/started_at/completed_at

cup_stats           type/item_id/total_cups/cup_wins/total_matches/match_wins
                    UNIQUE(type, item_id) — 풀 보정 로직용 누적 통계

cup_entries         tournament_id/item_id/division(시작 시점 부 스냅샷)
                    UNIQUE(tournament_id, item_id)

cup_matches         tournament_id/phase(group/main)/group_id/round/match_index
                    item1_id/item2_id/winner_id/is_bye/is_draw

cup_match_points    tournament_id/match_id/item_id
                    base_points/bonus_points/total_points — 마스터 대회만

master_ranking_history  tournament_id/type/item_id/points/recorded_at
                        최근 10회 합산으로 마스터 랭킹 실시간 계산

ranking_settings    type(actor/work) UNIQUE / settings_json
                    기본값: 승점3/1/0, 부별가중치, 순위보너스 테이블
```

---

## 개발 페이즈

### Phase 1 — DB (db.ts)
- `worldcup_*` 테이블 5개 제거 (worldcup_categories, worldcup_sessions, worldcup_matches, worldcup_stats, worldcup_rank_history)
- 신규 테이블 7개 생성:
  - `cup_tournaments` — 대회 정의 (유형/방식/부범위/필터JSON/상태/설정 스냅샷JSON)
  - `cup_stats` — 항목별 누적 통계 (풀 보정 로직용, worldcup_stats 대체)
  - `cup_entries` — 대회별 참가자 + 참가 시점 부 스냅샷
  - `cup_matches` — 매치 결과 (조별리그 조 정보 포함)
  - `cup_match_points` — 매치별 승점 계산 결과 (마스터 대회만)
  - `master_ranking_history` — 대회별 획득 점수 기록 (최근 10회 합산으로 랭킹 계산)
  - `ranking_settings` — 배우/작품별 가중치/보너스 설정값

### Phase 2 — IPC (ipc.ts)
- `worldcup:*` 핸들러 14개 제거
- 신규 핸들러:
  - `cup:list` / `cup:create` / `cup:update` / `cup:delete`
  - `cup:start` / `cup:pick` / `cup:complete`
  - `cup:matches` / `cup:standings`
  - `master-ranking:list` / `master-ranking:reset`
  - `ranking-settings:get` / `ranking-settings:update`
- 승점 계산 엔진: 부별/섞인 분기, 최근 10회 집계

#### 항목 조회 및 셔플 순서 (편향 방지, 기존 로직 그대로 이식)

SQLite는 ORDER BY 없이 조회 시 등록순(rowid 순)으로 반환함.
정렬 후 앞에서 slice하면 항상 비슷한 등록 시점 항목끼리 매치 → 편향 발생.
이를 방지하기 위해 **정렬 전 먼저 Fisher-Yates 셔플**하여 동일 기준 항목 간 순서를 무작위화.

```typescript
// 1. items 조회: ORDER BY 없음 → 등록순으로 옴
items = db().prepare(`SELECT DISTINCT a.id FROM actors a ...`).all() as { id: number }[]

// 2. 정렬 전 먼저 셔플 (stable sort 편향 방지 핵심)
//    같은 total_sessions 값을 가진 항목들이 항상 같은 순서로 정렬되는 것을 방지
for (let k = items.length - 1; k > 0; k--) {
  const r = Math.floor(Math.random() * (k + 1))
  ;[items[k], items[r]] = [items[r], items[k]]
}

// 3. 이후 참가 횟수(total_sessions) 기준 오름차순 정렬
//    (셔플 후 정렬이므로 동일값 항목은 랜덤 순서 유지)
items.sort((a, b) => (statsMap.get(a.id) ?? 0) - (statsMap.get(b.id) ?? 0))

// 4. 풀 slice 후 다시 셔플 (풀 내 순서 무작위화)
const pool = items.slice(0, poolSize)
for (let k = pool.length - 1; k > 0; k--) {
  const r = Math.floor(Math.random() * (k + 1))
  ;[pool[k], pool[r]] = [pool[r], pool[k]]
}

// 5. 다음 라운드 매치 생성 시 winners도 셔플 (라운드마다 대진 무작위화)
for (let k = winners.length - 1; k > 0; k--) {
  const r = Math.floor(Math.random() * (k + 1))
  ;[winners[k], winners[r]] = [winners[r], winners[k]]
}
```

**핵심 원칙**: 정렬이 필요한 경우라도 정렬 전 선행 셔플 필수. 슬라이스/페어링 전에도 항상 셔플.

---

#### 풀 구성 참가 수 보정 로직 (cup:start, 기존 로직 그대로 이식)
대회 시작 시 풀 구성 단계에서 참가 횟수가 적은 항목을 강제로 포함시키는 보정 적용.
champion/loser 모드에서는 비활성화 (normal 모드에서만 적용).

```typescript
// 풀 크기 계산: roundTotal × max(2, sqrt(총인원/roundTotal))
// → 강 수가 낮을수록 풀을 비례 확장해서 다양성 확보
const multiplier = Math.max(2, Math.sqrt(items.length / roundTotal))
const poolSize = Math.min(items.length, Math.round(roundTotal * multiplier))
const pool = items.slice(0, poolSize) // items는 참가 횟수 오름차순 정렬 상태

// 풀 내에서 셔플 (stable sort 편향 방지)
for (let k = pool.length - 1; k > 0; k--) {
  const r = Math.floor(Math.random() * (k + 1))
  ;[pool[k], pool[r]] = [pool[r], pool[k]]
}

// 최솟값 티어 강제 포함 (일반 모드만, champion/loser는 Infinity로 비활성화)
const minSessions = poolMode === 'normal' && pool.length > 0
  ? Math.min(...pool.map(i => statsMap.get(i.id) ?? 0))
  : Infinity
const minTier = pool.filter(i => (statsMap.get(i.id) ?? 0) === minSessions)

let forcedItems: { id: number }[] = []
if (minTier.length <= poolSize / 20) {
  // 최솟값 티어가 풀의 1/20 이하 → 전체 강제 포함
  forcedItems = [...minTier]
} else if (minTier.length <= poolSize / 10) {
  // 최솟값 티어가 풀의 1/10 이하 → 셔플 후 절반만 강제 포함
  const shuffledMin = [...minTier]
  for (let k = shuffledMin.length - 1; k > 0; k--) {
    const r = Math.floor(Math.random() * (k + 1))
    ;[shuffledMin[k], shuffledMin[r]] = [shuffledMin[r], shuffledMin[k]]
  }
  forcedItems = shuffledMin.slice(0, Math.ceil(minTier.length / 2))
}

if (forcedItems.length > 0) {
  // 강제 포함 항목 확정 후, 나머지 슬롯을 풀에서 랜덤으로 채움
  const forcedSet = new Set(forcedItems.map(i => i.id))
  const rest = pool.filter(i => !forcedSet.has(i.id))
  for (let k = rest.length - 1; k > 0; k--) {
    const r = Math.floor(Math.random() * (k + 1))
    ;[rest[k], rest[r]] = [rest[r], rest[k]]
  }
  const slotsLeft = Math.max(0, roundTotal - forcedItems.length)
  const combined = [...forcedItems, ...rest.slice(0, slotsLeft)]
  // 최종 참가자 셔플 (강제 포함 항목 위치 고정 방지)
  for (let k = combined.length - 1; k > 0; k--) {
    const r = Math.floor(Math.random() * (k + 1))
    ;[combined[k], combined[r]] = [combined[r], combined[k]]
  }
  participants = combined
} else {
  participants = pool.slice(0, roundTotal)
}
```

### Phase 3 — 대회 목록 UI (Worldcup.tsx 재작성)
- 상단바 (검색 / 셀렉트 2개 / 정렬 / 버튼)
- 5단 그리드 카드 (MASTER 칩 / M·F·X 버튼)
- 대회 생성 모달 (규약 설정)
- 마스터 대회 필터 모달 (부/풀 선택)

### Phase 4 — 대회 진행 UI
- 매치 탭 (1:1 카드, 무승부 버튼 조건부)
- 현황 탭:
  - 풀 리그전: 순위표 + 매치 목록
  - 월드컵: 조별 순위표 + 본선 대진표

### Phase 5 — 마스터 랭킹 페이지
- 배우/작품 탭 전환
- 랭킹 목록 (부별 구분 표시)
- 수동 리셋 버튼

### Phase 6 — 랭킹 설정 모달
- 배우/작품 탭
- 기본 승점 / 부별 가중치 / 섞인 대회 상대 가중치 / 규모별 보너스 수정 UI
- 진행 중 대회 있으면 수정 불가 처리

---

## 랭킹 설정 모달

승점 관련 수치를 직접 수정할 수 있는 설정 UI.
**배우 / 작품 탭으로 분리**되어 각각 독립적으로 설정 가능.

### 탭별 수정 가능 항목 (배우 / 작품 각각)

| 항목 | 설명 |
|------|------|
| 기본 승점 | 승/무/패 각 점수 (기본: 3/1/0) |
| 부별 가중치 | 1부 ~ 미분류 각 배수값 (부별 대회 적용) |
| 섞인 대회 상대 가중치 | 상대방 부별 배수값 (섞인 대회 매치 승점 적용) |
| 대회 규모별 순위 보너스 | 인원 구간(32/64/128/256/512) × 순위(우승~32강) 매트릭스 |

### 적용 규칙
- **진행 중인 대회가 있으면 수정 불가**
- 소급 적용 없음 — **다음에 시작되는 대회부터만 반영**
- 수치는 SQLite에 저장, 앱 재시작 후에도 유지

---

## 마스터 랭킹 리셋

- 수동 리셋 버튼 제공 (설정 또는 랭킹 페이지)
- **진행 중인 대회가 있으면 리셋 불가**
- 리셋 시 전체 마스터 랭킹 승점 0으로 초기화
- 소급 대회 기록은 유지, 집계만 초기화
