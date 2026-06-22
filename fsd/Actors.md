# Actors 탭

## 개요
배우 CRUD, 검색/필터/정렬, 상세 모달(출연작/레이더차트/태그클라우드), 피지컬 점수 계산, 대량 삭제를 제공하는 배우 관리 페이지.

## 파일 구조
- **페이지**: `src/renderer/src/pages/Actors.tsx`
- **폼 컴포넌트**: `src/renderer/src/components/ActorForm.tsx`
- **검색바**: `src/renderer/src/components/SearchBar.tsx` (ActorSearchParams)
- **레이더 차트**: `src/renderer/src/components/RadarChart.tsx`
- **피지컬 보정**: `src/renderer/src/components/PhysicalCorrectionModal.tsx`
- **API**: `src/renderer/src/api.ts` (actorsApi, actorTagsApi, shellApi)
- **IPC 핸들러**: `src/main/ipc-actors.ts`

## 주요 기능

### 1. 배우 목록
- 정렬: 등록일/이름/평점/피지컬/생년월일/데뷔일/작품수/작품발매일/작품등록일
- 검색: 이름 키워드, 태그(AND/OR), 나이 범위, 데뷔일 범위, 작품수 범위, 평점 범위, 각 점수 항목별 범위, 피지컬 범위, 신체 수치(키/바스트/웨이스트/힙/컵) 범위, NULL 필터, 제외 필터, 코멘트, 삭제예정

### 2. 배우 등록/수정 (ActorForm)
- 이름, 사진, 생년월일, 데뷔일, 신체 정보(키/BWH/컵), 코멘트
- 10개 점수 항목 (face, bust, hip, physical, skin, acting, sexy, charm, technique, proportions)
- 태그 선택, 대표 태그 지정
- 제외 플래그, 삭제예정 플래그

### 3. 배우 상세 모달
- **좌측**: 프로필 사진, 기본 정보, 신체 정보, 레이더 차트(RadarChart), 코멘트, 태그(대표태그 토글)
- **우측**: 출연작 목록 (발매일/평점 정렬), 재생 버튼, 태그 클라우드 버튼

### 4. 태그 클라우드
- 해당 배우 출연작의 모든 태그를 카테고리별로 빈도 표시
- `actors:workTags` IPC로 조회

### 5. 피지컬 점수 계산기 (PhysicalCorrectionModal)
- 신체 수치 + 점수 항목 기반 피지컬 점수 계산
- ratio_score 공식: `(물리수치 정규화 평균 * 0.3 + 점수항목 가중 평균 * 0.7)`

### 6. 대량 삭제 모드
- 드래그 선택으로 다수 배우 일괄 삭제

### 7. 찜 토글
- 배우 카드에서 하트 버튼으로 즐겨찾기 토글

## 사용 API 함수

| API 함수 | IPC 채널 | 설명 |
|----------|----------|------|
| `actorsApi.list(params)` | `actors:list` | 배우 목록 (검색/정렬) |
| `actorsApi.get(id)` | `actors:get` | 배우 상세 (출연작/태그/점수 포함) |
| `actorsApi.create(data)` | `actors:create` | 배우 생성 |
| `actorsApi.update(id, data)` | `actors:update` | 배우 수정 |
| `actorsApi.delete(id)` | `actors:delete` | 배우 삭제 (대회 참가 시 차단) |
| `actorsApi.physicalData()` | `actors:physical-data` | 피지컬 계산용 전체 배우 데이터 |
| `actorsApi.workTags(actorId)` | `actors:workTags` | 출연작 태그 클라우드 |
| `actorsApi.scoreGradeCounts(excludeId)` | `actors:scoreGradeCounts` | 11점 이상 점수 현황 |
| `actorTagsApi.list()` | `actor-tags:list` | 배우 태그 마스터 목록 |
| `shellApi.openPath(path)` | `shell:openPath` | 파일 재생 |
| `shellApi.fileExists(path)` | `shell:fileExists` | 파일 존재 확인 |

## 관련 DB 테이블

| 테이블 | 역할 |
|--------|------|
| `actors` | 배우 메인 테이블 (name, birthday, debut_date, height, bust, waist, hip, cup, phys_arbitrary, comment, score_excluded, delete_pending) |
| `actor_scores` | 배우 점수 10개 항목 (face, bust, hip, physical, skin, acting, sexy, charm, technique, proportions) |
| `actor_tags` | 배우-태그 연결 (is_rep: 대표태그) |
| `actor_tags_master` | 배우 태그 마스터 |
| `actor_tag_categories` | 배우 태그 카테고리 |
| `work_actors` | 작품-배우 연결 (출연작 조회용) |
| `works` | 출연작 데이터 |
| `work_tags` / `work_tags_master` | 출연작 태그 (태그 클라우드용) |
| `cup_entries` / `cup_runs` | 삭제 시 대회 참가 여부 확인용 |

## 주요 쿼리

### actors:list
```sql
WITH stats AS (
  SELECT MIN(height) AS min_h, MAX(height) AS max_h, ... FROM actors
  WHERE height IS NOT NULL AND bust IS NOT NULL AND waist IS NOT NULL AND hip IS NOT NULL
)
SELECT DISTINCT a.*,
  (SELECT COUNT(*) FROM work_actors wa WHERE wa.actor_id = a.id) AS work_count,
  COALESCE((s.face + s.bust + ... + s.proportions) / 13.0, 0) AS avg_score,
  CASE WHEN ... THEN ROUND(ratio_score 계산식, 2) ELSE NULL END AS ratio_score
FROM actors a
CROSS JOIN stats
LEFT JOIN actor_scores s ON s.actor_id = a.id
-- 동적 WHERE 조건
ORDER BY {sortCol} {sortDir}
```
- avg_score: 10개 점수 합계 / 13.0
- ratio_score: 물리수치 정규화 (0~10) * 0.3 + 점수 가중평균 * 0.7

### actors:get
```sql
-- actors:list와 동일한 CTE + SELECT (단일 배우)
-- + 출연작 (works JOIN work_actors)
-- + 출연작별 대표태그, 첫번째 파일
-- + 배우 태그, 대표 태그
-- + 배우 점수
```

### actors:workTags
```sql
SELECT c.name AS category_name, m.name AS tag_name, COUNT(*) AS count
FROM work_actors wa
JOIN work_tags wt ON wt.work_id = wa.work_id
JOIN work_tags_master m ON m.id = wt.tag_id
LEFT JOIN work_tag_categories c ON c.id = m.category_id
WHERE wa.actor_id = ?
GROUP BY m.id
ORDER BY COALESCE(c.sort_order, 999999) ASC, count DESC
```

### actors:physical-data
```sql
SELECT a.id, a.name, a.photo_path, a.height, a.bust, a.waist, a.hip, a.cup,
  COALESCE(s.face, 0) AS face, ...,
  (SELECT COUNT(*) FROM work_actors wa WHERE wa.actor_id = a.id) AS work_count,
  (SELECT COUNT(*) FROM work_actors wa2 JOIN works w2 ... WHERE w2.is_favorite = 1) AS fav_work_count
FROM actors a LEFT JOIN actor_scores s ON s.actor_id = a.id
```

## localStorage 키
| 키 | 용도 |
|----|------|
| `actors:search` | 검색 조건 JSON |
| `actors:sortBy` | 정렬 기준 |
| `actors:sortDir` | 정렬 방향 |
