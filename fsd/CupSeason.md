# Cup Season (시즌제 마스터 랭킹)

## 개요
마스터 랭킹을 시즌 단위로 관리한다. 시즌 종료 시 데이터를 삭제하지 않고 시즌으로 보관하며, 새 시즌은 0부터 시작. 과거 시즌 및 전체 시즌 통합 조회 가능. 시즌은 배우/작품 독립 관리.

## DB 구조

### master_ranking_seasons
| 컬럼 | 설명 |
|------|------|
| id | PK |
| type | 'actor' / 'work' |
| name | 시즌 번호 (자동 부여: "1", "2", ...) |
| created_at | 생성일 |
| ended_at | 종료일 |

### master_ranking_history.season_id
- `NULL` → 현재 시즌
- `N` → 과거 시즌 (master_ranking_seasons.id)

### cup_runs.season_id
- `NULL` → 현재 시즌 (또는 비마스터 대회)
- `N` → 과거 시즌
- 시즌 종료 시 해당 type의 완료된 마스터 런에 season_id 부여

## 시즌 종료 흐름
1. 해당 type의 진행 중 마스터 대회 체크 (있으면 거부)
2. 현재 시즌 데이터 존재 여부 체크
3. `master_ranking_seasons` INSERT (type, name=자동번호)
4. `master_ranking_history` UPDATE: `season_id IS NULL AND type = ?` → 새 season_id
5. `cup_runs` UPDATE: 해당 type 마스터 완료 런의 `season_id IS NULL` → 새 season_id
6. 현재 시즌 → 빈 상태로 시작

## seasonId 필터링 규칙
- `null` → 현재 시즌 (`AND season_id IS NULL`)
- `N (양수)` → 해당 과거 시즌 (`AND season_id = N`)
- `-1` → 전체 시즌 (필터 없음)

### 공통 헬퍼 함수 (ipc-cup.ts)
- `buildSeasonFilter(col, seasonId)` → SQL 조건 문자열
- `buildSeasonRunFilter(seasonId)` → `cup_runs.season_id` 기반 SQL 조건
- `buildPointsCte(type, limit, alias, masterOnly, seasonId)` — 포인트 집계 CTE
- `buildPointsAtTimeSql(type, limit, seasonId)` — 시점별 포인트 집계

## seasonId가 적용되는 핸들러

### master_ranking_history 기반
| 핸들러 | 설명 |
|--------|------|
| `master-ranking:list` | 랭킹 목록 (pts, mrc, cs_cup, cs_match, last_run_points 모두 시즌 필터) |
| `master-ranking:rank-trends` | 순위 변동 |
| `master-ranking:rank-history` | 순위 이력 차트 |
| `master-ranking:division-history` | 부별 이력 |
| `master-ranking:item-stats` | 아이템 종합 통계 |
| `master-ranking:item-format-stats` | 포맷별 전적 |
| `master-ranking:tournament-stats` | 마스터 대회 통계 |

### cup_runs 기반
| 핸들러 | 설명 |
|--------|------|
| `cup:division-counts` | 부별 인원수 |
| `cup:head-to-head` | 상대전적 |
| `cup:list` | 마스터 대회 최근 런 (현재 시즌만) |
| `cup:get` | 마스터 대회 런 조회 (현재 시즌만) |
| `cup:start` | 대회 시작 시 division 계산 (현재 시즌 기준) |
| `cup:tournament-stats` | 개별 대회 통계 (현재 시즌만) |
| `dashboard:rank-change-chart` | 랭킹 차트 |

## UI

### 시즌 드롭다운
3곳에 동일한 시즌 드롭다운 배치:
- **MasterRankingView** — 부별 필터 좌측
- **MasterRecordModal** — 헤더
- **Ranking.tsx** — 마스터 기준 선택 시 타이틀 옆

```
[N시즌(현재) ▼]
[N-1시즌]
...
[전체]
```

### 시즌 종료 버튼
- "배우 시즌 종료" / "작품 시즌 종료" 2개 분리
- 현재 시즌에서만 표시 (과거 시즌 조회 시 숨김)

### 미등록 처리
- `master_run_count = 0`인 아이템은 순위 `-`, 미등록 표시
- score_rank 대비 gap 화살표 생략

### 매치카드
- 항상 현재 시즌 기준으로만 표시 (시즌 드롭다운 영향 없음)
