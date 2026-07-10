# Cup (대회) 탭

## 개요
배우/작품 대상 대회(토너먼트/리그/월드컵) 시스템. 대회 생성, 진행(매치 플레이), 랭킹(개별 대회/마스터), 랭킹 설정을 제공.

## 파일 구조
- **메인 페이지**: `src/renderer/src/pages/Worldcup.tsx`
- **컴포넌트 디렉터리**: `src/renderer/src/components/cup/`
  - `cupTypes.ts` — 타입 정의
  - `cupConstants.tsx` — 상수/유틸 (RunDistChart 등)
  - `CreateModal.tsx` — 대회 생성 모달
  - `TournamentCard.tsx` — 대회 목록 카드
  - `PlayView.tsx` — 매치 진행 화면
  - `MatchCard.tsx` — 매치 카드 (배우/작품 비교 UI)
  - `TournamentRankingsView.tsx` — 개별 대회 랭킹 뷰
  - `MasterRankingView.tsx` — 마스터 랭킹 뷰
  - `RankingSettingsModal.tsx` — 랭킹 설정 모달
  - `MasterRecordModal.tsx` — 마스터 전적 모달 (배우/작품별 시즌 전적 대시보드)
  - `TournamentStatsModal.tsx` — 대회통계 모달 (마스터 대회 전체 통계)
- **API**: `src/renderer/src/api.ts` (cupApi, rankingSettingsApi, masterRankingApi)
- **IPC 핸들러**: `src/main/ipc-cup.ts`

## 주요 기능

### 1. 대회 목록 (Worldcup.tsx)
- 필터: 타입(배우/작품), 포맷(토너먼트/리그/월드컵), 마스터/일반
- 검색, 정렬(등록일/이름)
- 대회 카드: 이름, 타입, 포맷, 마스터 여부, 통계 표시

### 2. 대회 생성 (CreateModal)
- 타입(배우/작품), 이름, 포맷(토너먼트/리그/월드컵), 마스터 여부
- 부별 범위 설정, 필터 JSON

### 3. 매치 진행 (PlayView)
- 대회 시작 → 매치 카드 표시
- 승자 선택 (클릭) → 다음 매치 자동 진행
- 월드컵: 그룹 스테이지 → 타이브레이크 → 블록 토너먼트 → 결승
- 리그: 그룹 리그 → 토너먼트 본선
- 토너먼트: 직접 토너먼트
- 진행률 표시, 현황(standings) 탭

### 4. 개별 대회 랭킹 (TournamentRankingsView)
- 해당 대회 전체 참가자 종합 랭킹
- 검색, 페이지네이션

### 5. 마스터 랭킹 (MasterRankingView)
- 배우/작품 전체 마스터 포인트 랭킹
- 시즌 선택 드롭다운 (현재/과거/전체), 부별 필터, 검색, 페이지네이션
- 미등록자(master_run_count=0)는 순위 `-`, 미등록 표시
- 썸네일 클릭 → 마스터 전적 모달 바로 진입
- 아이템 클릭 시 상세 통계 (포맷별 전적, 순위 이력, 상대전적)
- 시즌 종료 버튼: "배우 시즌 종료" / "작품 시즌 종료" 분리
- 대회통계 버튼 → TournamentStatsModal

### 6. 랭킹 설정 (RankingSettingsModal)
- 기본 승점, 부별/섞인 가중치
- 순위별 보너스 포인트

### 7. 마스터 전적 모달 (MasterRecordModal)
- 배우/작품 상세 모달의 ☆전적 버튼 또는 마스터 랭킹 썸네일 클릭으로 진입
- 시즌 선택 드롭다운 (현재/과거/전체)
- 요약 카드 6개: 포인트, 순위, 최고순위, 리그, 우승률, 승률
- 포맷별 전적 테이블 (토너먼트/리그/월드컵)
- 성적 추이 SVG 꺾은선 차트
- 상대전적 테이블 (정렬 가능, ▼/▲ 토글)

### 8. 대회통계 모달 (TournamentStatsModal)
- 마스터 랭킹의 대회통계 버튼으로 진입
- 시즌 선택 드롭다운
- 요약 카드: 총 대회, 총 참가연인원, 평균 참가자, 총 매치
- 포맷별 대회 현황 테이블
- 우승 랭킹 Top 10
- 대회 히스토리 타임라인

## 사용 API 함수

### cupApi
| API 함수 | IPC 채널 | 설명 |
|----------|----------|------|
| `cupApi.list(params)` | `cup:list` | 대회 목록 |
| `cupApi.get(id)` | `cup:get` | 대회 상세 |
| `cupApi.create(params)` | `cup:create` | 대회 생성 |
| `cupApi.update(params)` | `cup:update` | 대회 수정 |
| `cupApi.delete(id)` | `cup:delete` | 대회 삭제 |
| `cupApi.standings(runId)` | `cup:standings` | 진행 중 현황 |
| `cupApi.itemCount(tournamentId)` | `cup:item-count` | 참가 아이템 수 |
| `cupApi.divisionCounts(type, seasonId?)` | `cup:division-counts` | 부별 인원 수 |
| `cupApi.start(tournamentId, roundTotal, force)` | `cup:start` | 대회 시작 |
| `cupApi.clearRun(tournamentId)` | `cup:clear-run` | 진행 중인 런 초기화 |
| `cupApi.pick(matchId, winnerId, isDraw)` | `cup:pick` | 매치 결과 입력 |
| `cupApi.tournamentRankings(tournamentId, params)` | `cup:tournament-rankings` | 대회 랭킹 |
| `cupApi.runProgress(runId)` | `cup:run-progress` | 런 진행률 |
| `cupApi.lastRunRankings(tournamentId, params)` | `cup:last-run-rankings` | 마지막 런 결과 |
| `cupApi.tournamentStats(tournamentId)` | `cup:tournament-stats` | 대회 통계 |
| `cupApi.itemTournamentStats(tournamentId, itemId)` | `cup:item-tournament-stats` | 아이템별 대회 통계 |
| `cupApi.rankHistory(tournamentId, itemId)` | `cup:rank-history` | 순위 이력 |
| `cupApi.headToHead(type, itemId, seasonId?)` | `cup:head-to-head` | 상대전적 |

### rankingSettingsApi
| API 함수 | IPC 채널 | 설명 |
|----------|----------|------|
| `rankingSettingsApi.get(type)` | `ranking-settings:get` | 랭킹 설정 조회 |
| `rankingSettingsApi.update(type, settings)` | `ranking-settings:update` | 랭킹 설정 저장 |

### masterRankingApi
| API 함수 | IPC 채널 | 설명 |
|----------|----------|------|
| `masterRankingApi.list(params)` | `master-ranking:list` | 마스터 랭킹 목록 (seasonId 지원) |
| `masterRankingApi.reset(type)` | `master-ranking:reset` | 시즌 종료 (데이터 보관 후 새 시즌 시작) |
| `masterRankingApi.rankTrends(type, seasonId?)` | `master-ranking:rank-trends` | 순위 변동 |
| `masterRankingApi.itemFormatStats(type, itemId, seasonId?)` | `master-ranking:item-format-stats` | 포맷별 전적 |
| `masterRankingApi.rankHistory(type, itemId, limit?, seasonId?)` | `master-ranking:rank-history` | 순위 이력 |
| `masterRankingApi.divisionHistory(type, itemId, seasonId?)` | `master-ranking:division-history` | 부별 이력 |
| `masterRankingApi.itemStats(type, itemId, seasonId?)` | `master-ranking:item-stats` | 아이템 종합 통계 |
| `masterRankingApi.seasons(type)` | `master-ranking:seasons` | 시즌 목록 조회 |
| `masterRankingApi.seasonDelete(seasonId)` | `master-ranking:season-delete` | 과거 시즌 삭제 |
| `masterRankingApi.tournamentStats(type, seasonId?)` | `master-ranking:tournament-stats` | 마스터 대회 통계 |

## 관련 DB 테이블

| 테이블 | 역할 |
|--------|------|
| `cup_tournaments` | 대회 정의 (type, name, is_master, format, division_range, filter_json) |
| `cup_runs` | 대회 회차 (tournament_id, round_total, status, started_at, completed_at, season_id) |
| `cup_entries` | 회차별 참가자 (run_id, item_id, division, seed) |
| `cup_matches` | 매치 결과 (run_id, phase, group_id, round, match_index, item1_id, item2_id, winner_id, is_draw, block_id) |
| `cup_run_points` | 회차별 포인트 (run_id, item_id, points, rank, match_wins, match_total) |
| `master_ranking_history` | 마스터 랭킹 이력 (run_id, type, item_id, points, recorded_at, season_id) |
| `master_ranking_seasons` | 시즌 관리 (type, name, created_at, ended_at) |
| `ranking_settings` | 랭킹 설정 (type, settings_json) |

## 대회 포맷별 진행 방식

### tournament (토너먼트)
- 참가자 셔플 → 직접 대전 토너먼트
- 라운드별 승자 진출, 패자 탈락

### league (리그)
- 참가자를 4인 그룹으로 나눔
- 그룹 리그 (풀 라운드 로빈) → 각 그룹 상위 2명 진출
- 진출자로 토너먼트 본선 진행

### worldcup (월드컵)
- 참가자를 4인 그룹 16개 = 1블록으로 나눔
- 그룹 스테이지 (풀 라운드 로빈, 승점제 3/1/0)
- 동점 시 가운틀렛 타이브레이크
- 블록 토너먼트 (크로스 시딩)
- 전체 블록 결승 토너먼트

## localStorage 키
| 키 | 용도 |
|----|------|
| `cup:typeFilter` | 타입 필터 (all/actor/work) |
| `cup:formatFilter` | 포맷 필터 (all/tournament/league/worldcup) |
| `cup:masterFilter` | 마스터 필터 (all/master/normal) |
| `cup:sortBy` | 정렬 기준 |
| `cup:sortDir` | 정렬 방향 |
