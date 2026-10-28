# 개선안

## 추가할 기능

### 정렬

- 각 정렬마다 오름차순, 내림차순 정렬

#### 작품 

- 품번명
- 제목
- 별점
- 발매일

#### 배우
 
- 이름
- 평점평균
- 생년월일
- 작품수

### 태그 관리

- 작품, 배우 각각의 탭에 태그목록 보기 버튼을 두고 클릭하면 태그 모달 오픈
- 태그 생성, 수정, 삭제
- 태그

## 수정할 기능

### 배우 목록

- 전체 작품 수 추가

### 배우 평점

- 배우 별점을 없에고 배우 등록 수정시 아래의 항목별 평점을 1~10점 까지 1점씩 매기는 기능
- 항목은 얼굴, 바스트, 힙, 피지컬, 피부, 연기력
- 점수 등록 방식은 각 항목 타이틀 아래에 셀렉트 박스로 선택
- 배우 목록 화면에서는 평점평균을 소수점 2자리까지 점수로 표시
- 배우 상세 화면에서는 다각형 그래프로 표현
- 별점 검색을 평점평균 between 검색으로 변경

### 작품 별점

- 별점은 0.5점 단위로 0.5 ~ 5점 까지 체크 가능

---

## 작업 계획

### 작업 순서

#### 1단계 - 작품 별점 (0.5점 단위)

**변경 범위:** Rating 컴포넌트, Works 페이지, ipc.ts 검색 조건

- `Rating.tsx`
  - 별 5개 → 각 별을 반반으로 나눠 왼쪽 클릭 = 0.5, 오른쪽 클릭 = 1.0 단위 입력
  - hover/display도 0.5 단위 반별 렌더링 (★ 반쪽은 `clip-path` 또는 두 겹 레이어로 처리)
  - value 범위: 0 ~ 5, 0.5 단위
- `Works.tsx` 검색 SearchBar
  - 별점 검색 입력 범위를 0.5 단위 select 또는 range로 변경
- DB 스키마 변경 없음 (rating REAL 이미 소수 지원)

---

#### 2단계 - 태그 관리 모달

**변경 범위:** 새 컴포넌트 `TagManager.tsx`, Works/Actors 페이지, ipc.ts

- `TagManager.tsx` (모달)
  - 작품 탭 / 배우 탭 전환
  - 태그 목록 표시 (태그명, 사용 중인 작품/배우 수)
  - 태그명 인라인 수정 (클릭 → input 전환 → Enter 저장)
  - 삭제 버튼 (사용 중인 항목 수 표시, 확인 후 삭제)
- `ipc.ts`
  - `work-tags:update` / `actor-tags:update` 핸들러 추가 (이름 수정용)
  - `work-tags:list`, `actor-tags:list`에 사용 횟수(`count`) 포함하도록 쿼리 수정
- `Works.tsx`, `Actors.tsx`
  - 각 페이지 상단에 "태그 관리" 버튼 추가 → 모달 오픈
- `api.ts`
  - `workTagsApi.update`, `actorTagsApi.update` 추가

---

#### 3단계 - 정렬

**변경 범위:** ipc.ts, SearchBar 컴포넌트 또는 Works/Actors 페이지 UI

- `ipc.ts`
  - `works:list` 파라미터에 `sortBy`, `sortDir` 추가
    - sortBy: `product_number` | `title` | `rating` | `release_date` (기본: `created_at`)
    - sortDir: `asc` | `desc` (기본: `desc`)
  - `actors:list` 파라미터에 `sortBy`, `sortDir` 추가
    - sortBy: `name` | `avg_rating` | `birthday` | `work_count`
    - sortDir: `asc` | `desc`
    - `avg_rating`, `work_count`는 서브쿼리로 계산
- UI
  - Works/Actors 목록 상단에 정렬 드롭다운 + 오름차순/내림차순 토글 버튼 추가

---

#### 4단계 - 배우 목록 작품 수 추가

**변경 범위:** ipc.ts `actors:list` 쿼리

- `actors:list` SQL에 `(SELECT COUNT(*) FROM work_actors WHERE actor_id = a.id) AS work_count` 서브쿼리 추가
- 3단계 정렬의 `work_count` 정렬과 동시 처리 가능 → 3단계와 묶어서 작업
- `Actors.tsx` 목록 카드에 작품 수 표시

---

#### 5단계 - 배우 평점 시스템 개편 (가장 복잡, DB 스키마 변경)

**변경 범위:** db.ts, ipc.ts, ActorForm, Actors 페이지, types.ts

- `db.ts`
  - `actors` 테이블의 `rating REAL` 컬럼 유지 (평균 캐시용 또는 제거)
  - 새 테이블 추가:
    ```sql
    CREATE TABLE IF NOT EXISTS actor_scores (
      actor_id INTEGER PRIMARY KEY REFERENCES actors(id) ON DELETE CASCADE,
      face INTEGER DEFAULT 0,
      bust INTEGER DEFAULT 0,
      hip INTEGER DEFAULT 0,
      physical INTEGER DEFAULT 0,
      skin INTEGER DEFAULT 0,
      acting INTEGER DEFAULT 0
    );
    ```
  - 마이그레이션: 기존 `actors` 테이블에 `actor_scores` 행 자동 생성
- `ipc.ts`
  - `actors:get` 응답에 scores 포함
  - `actors:create` / `actors:update`에 scores 저장 로직 추가
  - `actors:list` 평균 점수 계산 서브쿼리 추가: `(face+bust+hip+physical+skin+acting)/6.0 AS avg_score`
  - 검색 파라미터 `ratingFrom/ratingTo` → avg_score 기준으로 변경
- `types.ts`
  - `Actor` 타입에 `scores` 필드 추가
- `ActorForm.tsx`
  - 기존 별점(`<Rating>`) 제거
  - 항목별(얼굴/바스트/힙/피지컬/피부/연기력) select 박스 추가 (1~10, 기본 0)
- `Actors.tsx`
  - 목록 카드: 별점 대신 평균 점수(소수점 2자리) 텍스트로 표시
  - 상세 패널: 레이더(다각형) 그래프 표시 → Canvas API로 직접 구현 또는 `recharts` 라이브러리 사용
  - 검색 필터: 별점 검색 → 평균 점수 범위(숫자 입력) 검색으로 교체