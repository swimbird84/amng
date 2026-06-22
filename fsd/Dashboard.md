# Dashboard 탭

## 개요
작품/배우 데이터를 다양한 분포 차트, 랭킹, 통계로 시각화하는 대시보드.

## 파일 구조
- **페이지**: `src/renderer/src/pages/Dashboard.tsx`
- **API**: `src/renderer/src/api.ts` (dashboardApi)
- **IPC 핸들러**: `src/main/ipc-dashboard.ts`
- **관련 컴포넌트**: ImagePreview, Rating, CardTooltip, PhysicalCorrectionModal (calcPhysicalScore, computeStats, loadSettings)

## 주요 기능 (섹션별)

### 0. 순위 변동 차트 (rankChangeChart)
1부 리그(rank 1~32) 마스터 랭킹 순위 변동을 SVG 멀티라인 차트로 표시.
- [차트 보기] 버튼 → 95vw x 95vh 전체화면 모달
- 배우/작품 타입 전환, 최근 N회(5/10/20/전체) 선택
- 32개 라인 (HSL 색상환 균등 배분), 호버 시 하이라이트
- 클릭 시 해당 배우/작품 상세 이동

### 1. 신작 (newWorks)
최근 2개월 내 발매 작품 목록. 확장/축소 가능.

### 2. 신인 (newActors)
최근 3년 내 데뷔 배우 목록. 확장/축소 가능.

### 3. 배우 분포 차트 (distBins)
17가지 항목(평점평균, 피지컬점수, 얼굴~비율, 키/바스트/웨이스트/힙/컵)별 히스토그램 차트.
- 제외 모드(포함/제외) 토글
- 클릭 시 해당 구간 배우 팝업

### 4. 발매일 분포
연도별 → 월별 → 해당 월 작품 카드 드릴다운.

### 5. 데뷔일 분포
연도별 → 월별 → 해당 월 데뷔 배우 카드 드릴다운.

### 6. 별점 분포
0.5~5.0 별점 구간별 작품 수. 클릭 시 해당 별점 작품 목록 모달.

### 7. 나이대별 분포
생년월일 기반 나이대(초/중/후반) 그룹핑. 클릭 시 해당 그룹 배우 표시.

### 8. 데뷔 나이대별 분포
데뷔 시 나이별 배우 수. 클릭 시 해당 나이 배우 표시.

## 사용 API 함수

| API 함수 | IPC 채널 | 설명 |
|----------|----------|------|
| `dashboardApi.newWorks()` | `dashboard:new-works` | 최근 2개월 신작 |
| `dashboardApi.newActors()` | `dashboard:new-actors` | 최근 3년 신인 |
| `dashboardApi.releaseYears()` | `dashboard:release-years` | 발매 연도별 작품 수 |
| `dashboardApi.releaseMonths(year)` | `dashboard:release-months` | 특정 연도 월별 작품 수 |
| `dashboardApi.releaseWorks(year, month)` | `dashboard:release-works` | 특정 연월 작품 목록 |
| `dashboardApi.ratingDist()` | `dashboard:rating-dist` | 별점 분포 |
| `dashboardApi.ratingWorks(bucket)` | `dashboard:rating-works` | 특정 별점 작품 목록 |
| `dashboardApi.ageDist()` | `dashboard:age-dist` | 나이대별 배우 분포 |
| `dashboardApi.debutAgeDist()` | `dashboard:debut-age-dist` | 데뷔 나이별 배우 분포 |
| `dashboardApi.debutYears()` | `dashboard:debut-years` | 데뷔 연도별 배우 수 |
| `dashboardApi.debutMonths(year)` | `dashboard:debut-months` | 특정 연도 월별 데뷔 수 |
| `dashboardApi.debutMonthActors(year, month)` | `dashboard:debut-month-actors` | 특정 연월 데뷔 배우 |
| `dashboardApi.actorScoreDist()` | `dashboard:actor-score-dist` | 배우 점수 분포 |
| `dashboardApi.actorPhysicalDist()` | `dashboard:actor-physical-dist` | 배우 피지컬 분포 |
| `dashboardApi.rankChangeChart(type, limit)` | `dashboard:rank-change-chart` | 1부 순위 변동 시계열 |


## 관련 DB 테이블

| 테이블 | 역할 |
|--------|------|
| `works` | 작품 데이터 (release_date, rating 기준 분포) |
| `actors` | 배우 데이터 (birthday, debut_date 기준 분포) |
| `actor_scores` | 배우 점수 10개 항목 (avg_score 계산) |
| `work_tags` / `work_tags_master` | 대표 태그 JOIN |
| `work_actors` | 작품-배우 연결 |
| `studios` / `makers` | 작품 스튜디오 정보 |
| `master_ranking_history` | 대회별 마스터 포인트 이력 (순위 변동 차트) |
| `cup_runs` / `cup_tournaments` | 완료된 마스터 대회 정보 (X축 라벨) |

## 주요 쿼리 패턴

### dashboard:new-works
```sql
SELECT w.* FROM works w
WHERE w.release_date >= date('now', '-2 months')
ORDER BY w.release_date DESC, w.rating DESC
```

### dashboard:age-dist
```sql
SELECT a.*, CAST((julianday('now') - julianday(a.birthday)) / 365.25 AS INTEGER) AS age,
  COALESCE((s.face + s.bust + ...) / 13.0, 0) AS avg_score
FROM actors a LEFT JOIN actor_scores s ON s.actor_id = a.id
WHERE a.birthday IS NOT NULL
```

### dashboard:rating-dist
```sql
SELECT ROUND(rating * 2) / 2.0 AS bucket, COUNT(*) AS count
FROM works GROUP BY bucket
```

## localStorage 키
| 키 | 용도 |
|----|------|
| `dashboard:distItem` | 분포 차트 선택 항목 |
| `dashboard:distExcludeMode` | 제외 모드 (include/exclude) |
