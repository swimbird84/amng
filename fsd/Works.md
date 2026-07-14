# Works 탭

## 개요
작품(동영상) CRUD, 검색/필터/정렬, 폴더 스캔 자동 등록, 상세 모달, 대량 삭제를 제공하는 메인 작품 관리 페이지.

## 파일 구조
- **페이지**: `src/renderer/src/pages/Works.tsx`
- **폼 컴포넌트**: `src/renderer/src/components/WorkForm.tsx`
- **검색바**: `src/renderer/src/components/SearchBar.tsx` (WorkSearchParams)
- **API**: `src/renderer/src/api.ts` (worksApi, workTagsApi, actorsApi, studiosApi, studioCodesApi, dialogApi, scanApi, shellApi, imageApi, workFilesApi, masterRankingApi)
- **IPC 핸들러**: `src/main/ipc-works.ts`
- **관련 컴포넌트**: ImagePreview, Rating, CardTooltip

## 주요 기능

### 1. 작품 목록 (무한 스크롤)
- IntersectionObserver 기반 무한 스크롤 (BATCH_SIZE=100)
- 정렬: 등록일/품번/마스터랭킹/별점/발매일/타이틀/배우/레이블
- 마스터랭킹 정렬: 서버 사이드 (현재 시즌 마스터포인트 합산 DESC → 품번 ASC)
- 검색: 품번 키워드, 태그(AND/OR), 배우, 스튜디오, 발매일 범위, 별점 범위, 타이틀, 코멘트, 배우수, 찜/삭제예정 필터

### 2. 작품 등록 (WorkForm)
- 수동 등록: 파일경로, 표지, 품번, 타이틀, 발매일, 별점, 스튜디오, 배우, 태그 입력

### 3. 폴더 스캔 (handleScan)
- 폴더 선택 → 동영상 파일 자동 검출
- 파일명에서 품번 추출, 폴더명에서 발매일/배우명 추출
- 품번 코드로 스튜디오 자동 매칭 (studioCodesApi.lookup)
- 표지 이미지 자동 복사

### 4. 작품 상세 모달
- 표지, 품번, 스튜디오, 별점, 발매일, 배우, 코멘트, 태그 표시
- 재생 버튼 (파일 존재 여부 확인)
- 대표 태그/대표 배우 토글
- 수정/삭제/폴더 삭제
- ☆전적 버튼 (품번 라인 우측): 마스터 전적 모달 (MasterRecordModal) 진입

### 5. 대량 삭제 모드
- 드래그 선택으로 다수 작품 일괄 삭제

### 6. 찜 토글
- 작품 카드에서 하트 버튼으로 즐겨찾기 토글

### 7. 카드 마스터랭킹 표시
- 품번 라인 아래에 현재 시즌 마스터랭킹 정보 표시
- 형식: `[리그태그] #순위위    포인트pt`
- 리그 태그: `DIV_COLOR` 스타일 적용, 순위/포인트: `text-green-400`
- 미분류 (master_run_count=0): `[미분류] #-    -pt` (text-gray-500)
- 데이터: `masterRankingApi.list({ type: 'work', limit: 99999 })` → masterPointsMap
- 삭제 시 masterPointsMap 갱신

## 사용 API 함수

| API 함수 | IPC 채널 | 설명 |
|----------|----------|------|
| `worksApi.list(params)` | `works:list` | 작품 목록 (검색/정렬/페이지네이션) |
| `worksApi.get(id)` | `works:get` | 작품 상세 (배우/태그/파일 포함) |
| `worksApi.create(data)` | `works:create` | 작품 생성 |
| `worksApi.update(id, data)` | `works:update` | 작품 수정 (별점, 찜, 대표태그 등) |
| `worksApi.delete(id)` | `works:delete` | 작품 삭제 (진행 중 대회 참가 시 차단) |
| `masterRankingApi.list({ type: 'work', limit: 99999 })` | `master-ranking:list` | 현재 시즌 마스터랭킹 (카드 표시) |
| `workTagsApi.list()` | `work-tags:list` | 작품 태그 마스터 목록 |
| `actorsApi.list()` | `actors:list` | 배우 목록 (검색바 드롭다운) |
| `actorsApi.findOrCreate()` | `actors:findOrCreate` | 스캔 시 배우 자동 생성 |
| `studiosApi.list()` | `studios:list` | 스튜디오 목록 (검색바 드롭다운) |
| `studioCodesApi.lookup(code)` | `studio-codes:lookup` | 품번 코드로 스튜디오 조회 |
| `dialogApi.openFolder()` | `dialog:open-folder` | 폴더 선택 다이얼로그 |
| `scanApi.folder(path)` | `scan:folder` | 폴더 스캔 실행 |
| `shellApi.openPath(path)` | `shell:openPath` | 파일 재생 |
| `shellApi.openExternal(url)` | `shell:openExternal` | URL 열기 |
| `shellApi.fileExists(path)` | `shell:fileExists` | 파일 존재 확인 |
| `shellApi.showItemInFolder(path)` | `shell:showItemInFolder` | 탐색기에서 파일 표시 |
| `shellApi.trashFolders(paths)` | `shell:trashFolders` | 폴더 휴지통 이동 |
| `imageApi.copy(src, type, id)` | `image:copy` | 이미지 복사 |
| `workFilesApi.add(workId, path)` | `work-files:add` | 재생 경로 추가 |
| `workFilesApi.delete(fileId)` | `work-files:delete` | 재생 경로 삭제 |

## 관련 DB 테이블

| 테이블 | 역할 |
|--------|------|
| `works` | 작품 메인 테이블 |
| `work_files` | 작품별 재생 경로 (file_path, type, sort_order) |
| `work_actors` | 작품-배우 연결 (is_rep: 대표배우) |
| `work_tags` | 작품-태그 연결 (is_rep: 대표태그) |
| `work_tags_master` | 태그 마스터 |
| `work_tag_categories` | 태그 카테고리 |
| `studios` | 레이블 |
| `makers` | 제작사 |
| `studio_codes` | 레이블별 품번 접두사 코드 |
| `cup_entries` / `cup_runs` | 삭제 시 대회 참가 여부 확인용 |

## 주요 쿼리

### works:list
```sql
SELECT DISTINCT w.*, s.name AS studio_name, s.color AS studio_color,
  m.name AS studio_maker_name, m.color AS studio_maker_color
FROM works w
LEFT JOIN studios s ON s.id = w.studio_id
LEFT JOIN makers m ON m.id = s.maker_id
-- 동적 JOIN/WHERE 조건 추가
ORDER BY w.{sortCol} {sortDir}
LIMIT ? OFFSET ?
```
- master_points 정렬 시:
```sql
ORDER BY COALESCE((SELECT SUM(mh.points) FROM master_ranking_history mh
  JOIN cup_runs r ON r.id = mh.run_id
  JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1
  WHERE mh.type = 'work' AND mh.item_id = w.id AND mh.season_id IS NULL), 0) DESC,
  w.product_number ASC
```
- 페이지네이션 시 `COUNT(*) AS cnt`로 총 개수 별도 조회
- 대표 태그/대표 배우는 별도 배치 쿼리로 조회

### works:get
```sql
SELECT w.*, s.name, s.color, m.name, m.color FROM works w
LEFT JOIN studios s, makers m WHERE w.id = ?
-- + actors, tags, rep_tags, rep_actors, files 별도 조회
```

### works:create
```sql
INSERT INTO works (file_path, cover_path, product_number, title, release_date, rating, comment, studio_id)
INSERT INTO work_files (work_id, file_path, type, sort_order)
INSERT INTO work_actors (work_id, actor_id, is_rep)
INSERT INTO work_tags (work_id, tag_id, is_rep)
```

### works:delete
```sql
-- 대회 참가 여부 확인
SELECT 1 FROM cup_entries e JOIN cup_runs r ON r.id = e.run_id
WHERE r.status = 'in_progress' AND e.item_id = ?
-- 삭제
DELETE FROM works WHERE id = ?
DELETE FROM master_ranking_history WHERE type = 'work' AND item_id = ?
```

## localStorage 키
| 키 | 용도 |
|----|------|
| `works:search` | 검색 조건 JSON |
| `works:sortBy` | 정렬 기준 |
| `works:sortDir` | 정렬 방향 |
