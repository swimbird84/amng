# 대회 시스템 & 마스터 랭킹

## 대회 시스템

### 대회 포맷

| 포맷 | 이름 | 설명 |
|------|------|------|
| `worldcup` | 월드컵 | 토너먼트 방식. 각 라운드에서 1:1 매치 진행, 패자 탈락 |
| `tournament` | 토너먼트 | 예선(그룹 스테이지) + 본선(토너먼트) 혼합 방식 |
| `league` | 리그전 | 라운드 로빈. 모든 참가자가 서로 1:1 매치 진행, 합산 승점으로 순위 결정 |

### 대회 타입

- `actor` — 배우 대회
- `work` — 작품 대회

### 대회 생성 옵션

- **이름**: 대회 이름
- **포맷**: worldcup / tournament / league
- **마스터 여부**: 마스터 랭킹 반영 여부
- **부 범위**: 참가 대상 부(Division) 필터 (마스터 대회 전용)
- **필터**: 태그/레이블 등 참가 조건 필터

### DB 테이블 구조

```
cup_tournaments      — 대회 정의 (type, name, format, is_master, division_range, filter_json)
cup_runs             — 대회 실행 기록 (tournament_id, round_total, status)
cup_run_items        — 실행별 참가 아이템 (run_id, item_id, group_id, pts, rank)
cup_matches          — 매치 기록 (run_id, round, match_index, phase, group_id, item_a/b_id, winner_id, is_draw)
cup_stats            — 누적 통계 (tournament_id, item_id, total_cups, cup_wins, total_matches, match_wins)
master_ranking       — 마스터 랭킹 현재 순위 (type, item_id, total_points, division)
master_ranking_history — 마스터 랭킹 포인트 이력 (run_id, type, item_id, pts, recorded_at)
```

### 매치 진행 흐름

1. `cup:start` — 참가 아이템 선정, 매치 생성, run 시작
2. `cup:pick` — 매치별 승자 선택 (winnerId 또는 isDraw)
3. 모든 매치 완료 시 자동으로 `cup_stats` 업데이트 + 마스터 대회는 `calcAndStoreMasterPoints()` 호출

### 라운드 구조

- **월드컵/토너먼트**: `phase = 'main'` 또는 `'group'`/`'knockout'`
- **리그전**: `phase = 'league'`, 단일 그룹 또는 다중 그룹
- 라운드 총수(`round_total`)는 대회 시작 시 참가 인원 기준으로 결정

---

## 마스터 랭킹

### 개념

여러 마스터 대회 결과를 누적 집계해 배우/작품의 전체 순위를 산출하는 시스템.
각 아이템의 최근 10개 마스터 런 포인트 합산이 `total_points`.

### 부(Division) 시스템

포인트 누적 합산 기준으로 부를 배정:

| 부 | 기준 포인트 (total_points) |
|----|--------------------------|
| 1부 | 32 이상 |
| 2부 | 96 이상 |
| 3부 | 224 이상 |
| 4부 | 480 이상 |
| 5부 | 992 이상 |
| 6부 | 2016 이상 |
| 미분류 | 기준 미달 (0) |

경계값: `[32, 96, 224, 480, 992, 2016]`

### 포인트 계산 (`calcAndStoreMasterPoints`)

마스터 대회 완료 시 자동 호출. 랭킹 설정(`ranking-settings`)에 따라 포인트 산출:

- **기본 승점**: 마스터 대회에서 받는 기본 포인트
- **부별 가중치**: 같은 부끼리 진행 시 적용
- **섞인 가중치**: 여러 부가 섞인 대회 시 적용
- **순위 보너스**: 우승/준우승 등 상위 순위 추가 포인트

### 순위 계산

- `RANK() OVER (ORDER BY total_points DESC)` — 동점자는 동일 순위 (1, 2, 3, 3, 5...)
- 동점 2차 정렬: `name/title ASC`

### 추이(Rank Trend)

- **배지**: 이전 순위 대비 현재 순위 변동 표시
  - `▲N` (초록) — 순위 상승
  - `▼N` (빨강) — 순위 하락
  - `—` (회색) — 변동 없음
  - `NEW` (파랑) — 신규 진입
- **차트 모달**: 클릭 시 최근 15개 런 기준 순위 변화 SVG 라인 차트

### 마스터 랭킹 테이블 컬럼

| 컬럼 | 설명 | 정렬 |
|------|------|------|
| `#` | 행 번호 | — |
| `순위` | RANK() 동률 처리 순위 | — |
| `리그` | 부 배지 (1부~6부, 미분류) | — |
| `썸네일` | 배우/작품 이미지 (hover: 확대 표시) | — |
| `이름` | 배우명/작품명 (hover: 상세 툴팁) | — |
| `마스터점수` | 최근 10런 누적 포인트 합산 | total_points DESC |
| `우승률` | 대회 우승 횟수 / 참가 대회 수 (hover: 포맷별 상세) | win_rate DESC, match_win_rate DESC |
| `승률` | 매치 승리 수 / 전체 매치 수 (hover: 포맷별 상세) | match_win_rate DESC, win_rate DESC |
| `추이` | 순위 변동 배지 + 클릭 시 히스토리 차트 | — |

### 우승률/승률 툴팁

hover 시 포맷별(월드컵/토너먼트/리그전) 세부 수치 표시:
```
월드컵     NN.N% (N/N)
토너먼트   NN.N% (N/N)
리그전     NN.N% (N/N)
```

### IPC 채널

| 채널 | 설명 |
|------|------|
| `cup:list` | 대회 목록 조회 |
| `cup:get` | 대회 상세 조회 |
| `cup:create` | 대회 생성 |
| `cup:update` | 대회 수정 |
| `cup:delete` | 대회 삭제 |
| `cup:start` | 대회 런 시작 |
| `cup:pick` | 매치 승자 선택 |
| `cup:standings` | 런 현황 조회 |
| `cup:item-count` | 대회 참가 가능 아이템 수 |
| `cup:division-counts` | 부별 아이템 수 |
| `cup:run-progress` | 런 진행률 |
| `cup:run-live-scores` | 런 실시간 점수 |
| `cup:tournament-rankings` | 개별 대회 누적 순위 |
| `cup:last-run-rankings` | 마지막 런 순위 |
| `cup:tournament-stats` | 대회 통계 |
| `cup:item-tournament-stats` | 아이템별 대회 통계 |
| `cup:rank-history` | 아이템 순위 이력 |
| `ranking-settings:get` | 랭킹 설정 조회 |
| `ranking-settings:update` | 랭킹 설정 수정 |
| `master-ranking:list` | 마스터 랭킹 목록 (division, sortBy, sortDir 필터 지원) |
| `master-ranking:reset` | 마스터 랭킹 초기화 |
| `master-ranking:rank-trends` | 전체 아이템 순위 추이 |
| `master-ranking:rank-history` | 아이템 순위 히스토리 (최근 15런) |
| `master-ranking:item-format-stats` | 아이템 포맷별 통계 |
