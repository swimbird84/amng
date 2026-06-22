# Labels 탭

## 개요
제작사(Makers) → 레이블(Studios) 계층 구조를 관리하는 페이지. 제작사별 레이블 그룹핑, 레이블별 작품 목록, 레이블 코드 관리를 제공.

## 파일 구조
- **페이지**: `src/renderer/src/pages/Labels.tsx`
- **관리 모달**: `src/renderer/src/components/StudioManager.tsx`
- **API**: `src/renderer/src/api.ts` (studiosApi, makersApi, worksApi, studioCodesApi)
- **IPC 핸들러**: `src/main/ipc-studios.ts`

## 주요 기능

### 1. 제작사 버튼 그리드
- 제작사별로 소속 레이블 수, 총 작품 수 표시
- 클릭 시 해당 제작사의 레이블 목록 펼침
- 색상 배지 (제작사 고유 색상 또는 해시 색상)

### 2. 버킷 필터
- **작품 모드**: 제작사를 총 작품 수 구간(1, 2, ..., 5, 10~6, 20~11, ...)으로 그룹핑
- **레이블 모드**: 제작사를 소속 레이블 수로 그룹핑
- 각 버킷별 제작사/레이블/작품 수 표시

### 3. 레이블 목록 (제작사 선택 시)
- 레이블 버튼 클릭 → 해당 레이블 작품 목록 표시

### 4. 레이블별 작품 목록
- 연도별 그룹핑, 연도순 토글 (asc/desc)
- 작품 미니 카드 (표지, 품번, 발매일)

### 5. 검색/정렬
- 제작사 검색, 레이블 검색
- 정렬: 이름/작품수/레이블수/제작사등록일/레이블등록일

### 6. 제작사/레이블 관리 (StudioManager)
- 제작사 CRUD, 레이블 CRUD
- 레이블을 제작사에 배정/해제
- 레이블 코드 관리 (studio_codes)
- 코드 기반 작품 자동 매칭

## 사용 API 함수

| API 함수 | IPC 채널 | 설명 |
|----------|----------|------|
| `studiosApi.list(true)` | `studios:list` | 레이블 목록 (work_count 포함) |
| `studiosApi.create(name, makerId, color)` | `studios:create` | 레이블 생성 |
| `studiosApi.update(id, name, color)` | `studios:update` | 레이블 수정 |
| `studiosApi.delete(id)` | `studios:delete` | 레이블 삭제 |
| `makersApi.list(true)` | `makers:list` | 제작사 목록 (studio_count 포함) |
| `makersApi.create(name, color)` | `makers:create` | 제작사 생성 |
| `makersApi.update(id, name, color)` | `makers:update` | 제작사 수정 |
| `makersApi.delete(id)` | `makers:delete` | 제작사 삭제 |
| `makersApi.assignStudio(studioId, makerId)` | `makers:assignStudio` | 레이블 배정/해제 |
| `worksApi.list({ studioId })` | `works:list` | 레이블별 작품 목록 |
| `studioCodesApi.list(studioId)` | `studio-codes:list` | 레이블 코드 목록 |
| `studioCodesApi.create(studioId, code)` | `studio-codes:create` | 코드 추가 |
| `studioCodesApi.update(id, code)` | `studio-codes:update` | 코드 수정 |
| `studioCodesApi.delete(id)` | `studio-codes:delete` | 코드 삭제 |
| `studioCodesApi.lookup(code)` | `studio-codes:lookup` | 코드로 스튜디오 조회 |
| `studioCodesApi.applyToWorks(studioId, code)` | `studio-codes:applyToWorks` | 코드 기반 작품 자동 매칭 |

## 관련 DB 테이블

| 테이블 | 역할 |
|--------|------|
| `studios` | 레이블 (name, color, maker_id, created_at) |
| `makers` | 제작사 (name, color, created_at) |
| `studio_codes` | 레이블별 품번 접두사 코드 (studio_id, code UNIQUE) |
| `works` | 작품 (studio_id로 레이블 연결) |

## 주요 쿼리

### studios:list (withCount)
```sql
SELECT s.*, COUNT(w.id) AS work_count,
  m.id AS maker_id, m.name AS maker_name, m.color AS maker_color, m.created_at AS maker_created_at
FROM studios s
LEFT JOIN works w ON w.studio_id = s.id
LEFT JOIN makers m ON m.id = s.maker_id
GROUP BY s.id ORDER BY s.name
```

### makers:list (withCount)
```sql
SELECT m.*, COUNT(s.id) AS studio_count
FROM makers m LEFT JOIN studios s ON s.maker_id = m.id
GROUP BY m.id ORDER BY m.name
```

### studios:delete
```sql
UPDATE works SET studio_id = NULL WHERE studio_id = ?
DELETE FROM studios WHERE id = ?
```

### makers:delete
```sql
UPDATE studios SET maker_id = NULL WHERE maker_id = ?
DELETE FROM makers WHERE id = ?
```

### studio-codes:applyToWorks
```sql
SELECT id, product_number FROM works WHERE studio_id IS NULL AND product_number IS NOT NULL
-- 품번에서 코드 매칭 후
UPDATE works SET studio_id = ? WHERE id = ?
```

## localStorage 키
| 키 | 용도 |
|----|------|
| `labels:makerKeyword` | 제작사 검색어 |
| `labels:labelKeyword` | 레이블 검색어 |
| `labels:sortBy` | 정렬 기준 |
| `labels:sortDir` | 정렬 방향 |
| `labels:yearSortDir` | 작품 연도순 방향 |
| `labels:bucketMode` | 버킷 모드 (work/label) |
| `labels:workCountBucket` | 선택된 작품 수 버킷 |
| `labels:labelCountBucket` | 선택된 레이블 수 버킷 |
