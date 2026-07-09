# Cup Season (시즌제 마스터 랭킹)

## 개요
마스터 랭킹 리셋 시 데이터를 삭제하지 않고, 리셋 시점까지를 하나의 **시즌**으로 묶어 보관한다. 새 시즌이 시작되면 랭킹은 0부터 다시 시작하며, 과거 시즌의 랭킹/추이를 언제든 조회할 수 있다. 시즌은 배우/작품 독립 관리.

## 현재 구조 (변경 전)

### 리셋 동작
- `master-ranking:reset` → `DELETE FROM master_ranking_history WHERE type = ?`
- 히스토리 전체 삭제 → 포인트, 추이, 차트 모두 소실

### 관련 테이블
| 테이블 | 역할 |
|--------|------|
| `master_ranking_history` | run_id, type, item_id, points, recorded_at |
| `ranking_settings` | type, settings_json |

### 관련 IPC 핸들러 (모두 `master_ranking_history` 직접 참조)
| 핸들러 | 설명 |
|--------|------|
| `master-ranking:list` | 마스터 랭킹 목록 (buildPointsCte 사용) |
| `master-ranking:reset` | 마스터 포인트 리셋 (DELETE) |
| `master-ranking:recalcRun` | 특정 run 재계산 |
| `master-ranking:rank-trends` | 순위 변동 (직전 run 대비) |
| `master-ranking:rank-history` | 아이템 순위 이력 차트 |
| `master-ranking:division-history` | 아이템 부별 이력 |
| `master-ranking:item-stats` | 아이템 종합 통계 |
| `master-ranking:item-format-stats` | 포맷별 전적 |
| `master-ranking:work-actor-distribution` | 작품 배우 분포 |
| `master-ranking:work-label-distribution` | 작품 레이블 분포 |
| `master-ranking:work-maker-distribution` | 작품 제작사 분포 |

### 관련 공통 함수 (ipc-cup.ts 상단)
| 함수 | 설명 |
|------|------|
| `buildPointsCte(type, limit, alias, masterOnly)` | 포인트 집계 CTE SQL 생성 |
| `buildPointsAtTimeSql(type, limit)` | 특정 시점까지 포인트 집계 SQL |
| `getRecentRunLimit(db, type)` | ranking_settings에서 recentRunLimit 조회 |

## 변경 계획

### 1. DB 변경 (`db.ts`)

#### 신규 테이블: `master_ranking_seasons`
```sql
CREATE TABLE IF NOT EXISTS master_ranking_seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('actor', 'work')),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### 기존 테이블 변경: `master_ranking_history`
```sql
ALTER TABLE master_ranking_history ADD COLUMN season_id INTEGER REFERENCES master_ranking_seasons(id) ON DELETE CASCADE;
```
- `season_id = NULL` → 현재 시즌 (진행 중)
- `season_id = N` → 과거 시즌 (종료됨)

#### 인덱스 추가
```sql
CREATE INDEX idx_master_ranking_history_season ON master_ranking_history(season_id);
```

### 2. IPC 변경 (`ipc-cup.ts`)

#### `master-ranking:reset` 동작 변경
변경 전: `DELETE FROM master_ranking_history WHERE type = ?`
변경 후:
1. 진행 중 대회 체크 (기존 유지)
2. `master_ranking_seasons` INSERT (type, name, ended_at)
3. `master_ranking_history` UPDATE: `season_id IS NULL AND type = ?` → 해당 season_id로 갱신
4. 결과: 현재 시즌(season_id IS NULL)이 비워지고, 과거 시즌에 데이터 보관

시즌명: 서버에서 자동 부여 (해당 type의 기존 시즌 수 + 1, 예: "1", "2", "3")

#### 기존 핸들러 수정 — 현재 시즌 필터 추가
모든 `master_ranking_history` 조회에 `AND season_id IS NULL` 조건 추가:
- `buildPointsCte()` — WHERE절에 `mh2.season_id IS NULL` 추가
- `buildPointsAtTimeSql()` — WHERE절에 `mh.season_id IS NULL` 추가
- `master-ranking:list` — last_run_points 서브쿼리
- `master-ranking:rank-trends` — prevPtsSql
- `master-ranking:rank-history` — runs 조회 + atTimeSql
- `master-ranking:division-history` — itemHistory 조회 + atTimeSql
- `master-ranking:item-stats` — ptsCte
- `master-ranking:recalcRun` — 영향 없음 (run_id 기반이라 시즌 무관)

#### 신규 핸들러 추가
| 핸들러 | 파라미터 | 설명 |
|--------|----------|------|
| `master-ranking:seasons` | `type` | 해당 type의 시즌 목록 반환 (id, name, created_at, ended_at) |
| `master-ranking:season-delete` | `seasonId` | 과거 시즌 삭제 (seasons row + 해당 history CASCADE 삭제) |

#### 기존 핸들러 seasonId 파라미터 추가
과거 시즌 조회를 별도 핸들러로 분리하지 않고, 기존 핸들러에 `seasonId` 옵션 파라미터를 추가하여 통합 처리:
- `seasonId` 생략 또는 `null` → `season_id IS NULL` (현재 시즌)
- `seasonId` 지정 → `season_id = ?` (해당 과거 시즌)

대상 핸들러:
| 핸들러 | 추가 파라미터 |
|--------|---------------|
| `master-ranking:list` | `seasonId?: number` |
| `master-ranking:rank-trends` | `seasonId?: number` |
| `master-ranking:rank-history` | `seasonId?: number` |
| `master-ranking:division-history` | `seasonId?: number` |
| `master-ranking:item-stats` | `seasonId?: number` |
| `master-ranking:item-format-stats` | `seasonId?: number` |
| `cup:head-to-head` | `seasonId?: number` |
| `cup:division-counts` | `seasonId?: number` |

#### 과거 시즌 조회 방식
- `buildPointsCte`, `buildPointsAtTimeSql` 함수에 `seasonId` 파라미터 추가
- `seasonId == null` → `AND mh.season_id IS NULL`
- `seasonId != null` → `AND mh.season_id = ?`
- 과거 시즌은 읽기 전용 (설정 변경/재계산 불가)

### 3. API 변경 (`api.ts`)

```typescript
// masterRankingApi에 추가
seasons: (type: 'actor' | 'work') =>
  api.invoke('master-ranking:seasons', type),
seasonDelete: (seasonId: number) =>
  api.invoke('master-ranking:season-delete', seasonId),

// 기존 함수 params에 seasonId 옵션 추가 (list, rankTrends, rankHistory, divisionHistory, itemStats, itemFormatStats 등)
// 예시:
list: (params: { type; limit?; offset?; search?; division?; sortBy?; sortDir?; seasonId?: number }) => ...
rankHistory: (params: { type; itemId; limit?; seasonId?: number }) => ...
```

### 4. UI 변경 (`MasterRankingView.tsx`)

#### 시즌 종료 버튼 (기존 "리셋" 버튼 대체)
- 기존 "리셋" 버튼 1개 → **"배우 시즌 종료"** / **"작품 시즌 종료"** 2개로 분리
- 현재 선택된 type과 무관하게 항상 두 버튼 모두 표시
- 각 버튼은 해당 type의 시즌만 독립적으로 종료
- 혼동 방지: 버튼 라벨에 대상(배우/작품)을 명시하여 어떤 시즌이 종료되는지 명확히 전달

#### 시즌 종료 확인 모달
- 기존: "이력을 전부 삭제합니다" 경고
- 변경:
  - 모달 제목: "{배우/작품} 시즌 종료"
  - 시즌 번호 자동 표시 (예: "시즌 3으로 보관됩니다")
  - 안내 문구: "현재까지의 {배우/작품} 랭킹 데이터를 시즌으로 보관하고 새 시즌을 시작합니다"
  - 확인 버튼 라벨: "시즌 종료"
  - 취소 버튼

#### 시즌 선택 UI 추가
- 위치: 마스터 랭킹 상단, 부별 필터 좌측에 드롭다운 배치
- 레이아웃: `[N시즌(현재) ▼] [전체][1부 32(32)][2부 ...][3부 ...]`
- 기본값: 현재 시즌 (가장 높은 번호, `season_id IS NULL`)
- 배우/작품 각각 시즌 목록이 독립적 (배우 시즌 3개, 작품 시즌 1개 등 가능)
- type 전환 시 시즌 드롭다운도 해당 type의 시즌 목록으로 갱신
- 과거 시즌 선택 시: 해당 시즌의 랭킹 목록 표시 (읽기 전용)
- 과거 시즌에서는 설정/시즌 종료 버튼 숨김

#### 시즌 연동 범위 — 선택된 시즌 기준으로 모든 조회 연동
- **랭킹 목록**: 해당 시즌의 포인트/순위로 표시
- **랭킹 차트 모달** (아이템 클릭 → 순위 이력 차트): 해당 시즌 한정 데이터
- **추이 모달** (순위 변동, 부별 이력): 해당 시즌 한정 데이터
- **포맷별 전적**: 해당 시즌 내 대회만 집계
- **상대전적**: 해당 시즌 내 매치만 집계
- **부별 인원수**: 해당 시즌 기준으로 재계산

#### 매치카드 (`MatchCard.tsx`, `PlayView.tsx`)
- 매치카드에 표시되는 마스터 랭킹 정보(순위, 포인트 등)는 **항상 현재 시즌 기준**으로만 표시
- 시즌 선택 드롭다운의 영향을 받지 않음 (대회 진행은 항상 현재 시즌 컨텍스트)

### 5. 랭킹 탭 변경 (`Ranking.tsx`)

#### 시즌 선택 드롭다운
- 위치: 타이틀 우측 (인원수 뒤)
- 마스터 랭킹 기준 선택 시에만 드롭다운 표시
- 선택된 시즌 기준으로 마스터 랭킹 데이터 조회
- 과거 시즌 선택 시에도 랭킹 카드 동일하게 표시 (읽기 전용)

## 수정 대상 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `src/main/db.ts` | master_ranking_seasons 테이블 생성, season_id 컬럼 마이그레이션 |
| `src/main/ipc-cup.ts` | reset 로직 변경, 공통 함수 season 필터, 신규 핸들러 추가 |
| `src/renderer/src/api.ts` | masterRankingApi에 seasons/seasonDelete 추가, 기존 함수 seasonId 파라미터 추가 |
| `src/renderer/src/components/cup/MasterRankingView.tsx` | 시즌 선택 드롭다운, 리셋→시즌 종료 모달 변경, 과거 시즌 읽기 전용 모드 |
| `src/renderer/src/pages/Ranking.tsx` | 마스터 기준명 변경, 시즌 드롭다운 추가 |

## 데이터 흐름

```
리셋 실행
  1. master_ranking_seasons INSERT (type, name, ended_at=now)
  2. master_ranking_history UPDATE SET season_id = 새 시즌 id WHERE type = ? AND season_id IS NULL
  3. 현재 시즌 → 빈 상태로 시작

시즌 조회
  현재 시즌: WHERE season_id IS NULL
  과거 시즌: WHERE season_id = ?
```
