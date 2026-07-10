# Ranking (랭킹) 탭

## 개요
배우를 20가지 기준(마스터랭킹, 작품수, 찜, 평점, 피지컬, 신체 수치, 점수 항목별)으로 랭킹하여 카드 형태로 표시하는 페이지. 탭 진입 시 랭킹 기준이 자동으로 순환(rotate)된다.

## 파일 구조
- **페이지**: `src/renderer/src/pages/Ranking.tsx`
- **API**: `src/renderer/src/api.ts` (actorsApi, masterRankingApi)
- **IPC 핸들러**: `src/main/ipc-actors.ts` (actors:physical-data), `src/main/ipc-cup.ts` (master-ranking:list, master-ranking:rank-trends)
- **관련 컴포넌트**: ImagePreview, CardTooltip, PhysicalCorrectionModal (calcPhysicalScore, computeStats, loadSettings)

## 주요 기능

### 1. 랭킹 기준 선택 (RankBy)
20가지 기준 중 선택:

| 카테고리 | 기준 | 값 키 |
|----------|------|-------|
| 대회 | 마스터랭킹 | `masterRanking` |
| 작품 | 작품수 | `work_count` |
| 작품 | 찜 | `fav_work_count` |
| 점수 | 평점 | `avg_score` |
| 점수 | 피지컬 | `physScore` |
| 신체 | 키 | `height` |
| 신체 | 바스트 | `bust` |
| 신체 | 웨이스트 | `waist` |
| 신체 | 힙 | `hip` |
| 신체 | 컵 | `cup` |
| 점수항목 | 얼굴 | `face` |
| 점수항목 | 가슴 | `score_bust` |
| 점수항목 | 엉덩이 | `score_hip` |
| 점수항목 | 몸매 | `physical` |
| 점수항목 | 피부 | `skin` |
| 점수항목 | 연기력 | `acting` |
| 점수항목 | 섹기 | `sexy` |
| 점수항목 | 매력 | `charm` |
| 점수항목 | 테크닉 | `technique` |
| 점수항목 | 비율 | `proportions` |

### 2. 자동 순환 (Rotate)
- 탭 진입 시 `sessionStorage`에 저장된 인덱스 기반으로 다음 랭킹 기준 자동 선택
- 매번 탭 전환할 때마다 다른 랭킹이 표시됨

### 3. 제외 모드
- 포함: 모든 배우 표시
- 제외: `score_excluded` 플래그가 설정된 배우 제외

### 4. 정렬 방향
- 정순(desc): 높은 값 우선
- 역순(asc): 낮은 값 우선
- 피지컬 설정의 `dir` 속성(N=역방향)에 따라 실제 정렬 방향 반전 (예: 웨이스트는 낮을수록 좋음)

### 5. 마스터 랭킹 모드
- `masterRanking` 선택 시 대회 시스템의 마스터 포인트 기반 랭킹
- 순위 변동 표시 (NEW, 상승, 하락, 유지)
- 시즌 선택 드롭다운 (타이틀 인원수 뒤, 현재/과거/전체)
- 타이틀: "마스터 랭킹 N명" (드롭다운 기준명 "마스터랭킹"은 유지, 표시만 "마스터"로 치환)

### 6. 카드 레이아웃
- 1~5위: 5열 그리드 (큰 카드, h-40)
- 6위~: 10열 그리드 (작은 카드, h-20)
- 순위 배지, 이름, 해당 기준 값 표시

## 사용 API 함수

| API 함수 | IPC 채널 | 설명 |
|----------|----------|------|
| `actorsApi.physicalData()` | `actors:physical-data` | 전체 배우 피지컬 데이터 (점수, 신체, 작품수, 찜작품수 포함) |
| `masterRankingApi.list({ type: 'actor', limit: 9999, seasonId? })` | `master-ranking:list` | 마스터 랭킹 포인트 (마스터랭킹 모드 시, 시즌 지원) |
| `masterRankingApi.rankTrends('actor', seasonId?)` | `master-ranking:rank-trends` | 순위 변동 (이전 순위 대비, 시즌 지원) |
| `masterRankingApi.seasons('actor')` | `master-ranking:seasons` | 시즌 목록 조회 |

## 클라이언트 사이드 로직

### 데이터 흐름
1. `actors:physical-data`로 전체 배우 데이터 로드 (DB 쿼리 1회)
2. `calcPhysicalScore()`로 각 배우의 피지컬 점수 계산 (클라이언트)
3. 선택된 `rankBy` 기준으로 클라이언트 정렬
4. 마스터랭킹 모드 시에만 추가 API 호출

### avgScore 계산
```
(face + score_bust + score_hip + physical + skin + acting + sexy + charm + technique + proportions) / 13
```

### 정렬 우선순위
1. 선택된 기준 값 (primary)
2. 평점 avg_score (secondary)
3. 작품수 work_count (tertiary)

## 관련 DB 테이블

| 테이블 | 역할 |
|--------|------|
| `actors` | 배우 신체 데이터 (height, bust, waist, hip, cup) |
| `actor_scores` | 점수 10개 항목 |
| `work_actors` | 작품수 계산 (work_count) |
| `works` | 찜 작품수 계산 (fav_work_count, is_favorite) |
| `master_ranking` | 마스터 랭킹 포인트 |
| `master_ranking_history` | 순위 변동 이력 |

## 주요 쿼리

### actors:physical-data (ipc-actors.ts)
```sql
SELECT a.id, a.name, a.photo_path,
  a.height, a.bust, a.waist, a.hip, a.cup, a.phys_arbitrary, a.score_excluded,
  COALESCE(s.face, 0) AS face,
  COALESCE(s.bust, 0) AS score_bust,
  COALESCE(s.hip, 0) AS score_hip,
  COALESCE(s.physical, 0) AS physical,
  COALESCE(s.skin, 0) AS skin,
  COALESCE(s.acting, 0) AS acting,
  COALESCE(s.sexy, 0) AS sexy,
  COALESCE(s.charm, 0) AS charm,
  COALESCE(s.technique, 0) AS technique,
  COALESCE(s.proportions, 0) AS proportions,
  (SELECT COUNT(*) FROM work_actors wa WHERE wa.actor_id = a.id) AS work_count,
  (SELECT COUNT(*) FROM work_actors wa2 JOIN works w2 ON w2.id = wa2.work_id AND w2.is_favorite = 1 WHERE wa2.actor_id = a.id) AS fav_work_count
FROM actors a
LEFT JOIN actor_scores s ON s.actor_id = a.id
```

## sessionStorage / localStorage 키

| 키 | 저장소 | 용도 |
|----|--------|------|
| `ranking:rotateIndex` | sessionStorage | 자동 순환 인덱스 |
| `ranking:rankBy` | localStorage | 수동 선택 시 기준 저장 |
| `ranking:sortDir` | localStorage | 정렬 방향 |
| `ranking:excludeMode` | localStorage | 제외 모드 |
