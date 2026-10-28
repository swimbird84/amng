# 배우 Soft Delete 구현 계획

## 개요

배우 삭제 시 실제 DB 레코드를 삭제하지 않고 `is_deleted` 플래그로 비활성화 처리.
삭제된 배우는 모든 UI에서 완전히 숨김 — 목록, 랭킹, 통계, 대회 어디에서도 노출하지 않음.
복구 시 DB에서 직접 `UPDATE actors SET is_deleted = 0 WHERE id = ?` 실행하면 복원됨.

> 참고: 기존 `delete_pending` 컬럼(삭제 예정 표시)과 별개 기능. `is_deleted`는 실제 삭제 처리 플래그.

---

## 작업 진행 계획

### Phase 1: DB 마이그레이션 (`db.ts`) — 1곳

- `actors` 테이블에 `is_deleted INTEGER NOT NULL DEFAULT 0` 컬럼 추가
- 기존 `delete_pending` 마이그레이션 블록(213번 라인) 근처에 동일 패턴으로 추가:
  ```ts
  if (!actorCols.includes('is_deleted')) {
    db.prepare('ALTER TABLE actors ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0').run()
  }
  ```

---

### Phase 2: 삭제 핸들러 변경 (`ipc-actors.ts`) — 핵심 1곳

**`actors:delete`** (438번 라인)

변경 전:
- 추가 사진 파일 삭제 (`actor_photos` 조회 → `deleteImageFile`)
- 메인 사진 파일 삭제 (`deleteImagesByPattern`)
- `DELETE FROM actors WHERE id = ?`
- `DELETE FROM master_ranking_history` (type='actor')
- `DELETE FROM cup_entries` (type='actor')
- `DELETE FROM cup_stats` (type='actor')
- `DELETE FROM cup_rank_snapshots` (type='actor')

변경 후:
- 진행 중 대회 참가 여부 체크 (기존 blocked 로직 유지)
- `UPDATE actors SET is_deleted = 1 WHERE id = ?` **한 줄만 실행**
- 사진 삭제, 연관 데이터 삭제 로직 전부 제거

---

### Phase 3: 배우 조회 필터링 (`ipc-actors.ts`) — 7곳

| 핸들러 | 라인 | 변경 내용 |
|--------|------|----------|
| `actors:list` | 58 | stats CTE `FROM actors WHERE height IS NOT NULL...` → `AND is_deleted = 0` 추가 |
| `actors:list` | 76 | 메인 `FROM actors a` 이후 conditions에 `a.is_deleted = 0` 기본 조건 추가 |
| `actors:get` | 223 | stats CTE `FROM actors WHERE height IS NOT NULL...` → `AND is_deleted = 0` 추가 |
| `actors:get` | 244 | `WHERE a.id = ?` → `WHERE a.id = ? AND a.is_deleted = 0` |
| `actors:findOrCreate` | 355 | `SELECT id FROM actors WHERE name = ?` 쿼리 2개에 `AND is_deleted = 0` 추가 |
| `actors:score-distribution` | 483 | `JOIN actors a ON a.id = s.actor_id` → `AND a.is_deleted = 0` 추가 |
| `actors:physical-data` | 524 | `FROM actors a` 뒤에 `WHERE a.is_deleted = 0` 추가 |

---

### Phase 4: 작품 탭 (`ipc-works.ts`) — 4곳

| 라인 | 쿼리 용도 | 변경 내용 |
|------|----------|----------|
| 144 | 작품 목록 정렬 시 배우 점수 서브쿼리 | `JOIN actors a` → `AND a.is_deleted = 0` 추가 |
| 191 | 작품별 출연 배우 조회 | `JOIN actors a ON a.id = wa.actor_id` → `AND a.is_deleted = 0` 추가 |
| 215 | 작품 상세 - 배우 전체 정보 조회 | `SELECT a.* FROM actors a` → `AND a.is_deleted = 0` 추가 |
| 239 | 작품 상세 - 배우 id/name 조회 | `SELECT a.id, a.name FROM actors a` → `AND a.is_deleted = 0` 추가 |

참고: 45, 129번 라인 (배우 없는 작품 필터)은 work_actors 서브쿼리라 변경 불필요.

---

### Phase 5: 대시보드 탭 (`ipc-dashboard.ts`) — ~17곳

| 라인 | 핸들러 | 쿼리 용도 | 변경 방식 |
|------|--------|----------|----------|
| 36 | `dashboard:new-works` | 작품별 대표 배우 이름 조회 | `JOIN actors a` → `AND a.is_deleted = 0` |
| 76 | `dashboard:recent-works` | 작품별 대표 배우 이름 조회 | `JOIN actors a` → `AND a.is_deleted = 0` |
| 136 | `dashboard:release-works` | 작품별 대표 배우 이름 조회 | `JOIN actors a` → `AND a.is_deleted = 0` |
| 163 | `dashboard:new-actors` | 신규 배우 랭킹 (work_count) | `FROM actors a LEFT JOIN` → `WHERE a.is_deleted = 0 AND` 추가 |
| 175 | `dashboard:age-dist` | 배우 나이 분포 | `FROM actors a LEFT JOIN` → `WHERE a.is_deleted = 0 AND` 추가 |
| 186 | `dashboard:debut-age-dist` | 배우 데뷔 나이 분포 | `FROM actors a LEFT JOIN` → `WHERE a.is_deleted = 0 AND` 추가 |
| 196 | `dashboard:debut-years` | 데뷔 연도별 배우 수 | `FROM actors WHERE` → `AND is_deleted = 0` |
| 204 | `dashboard:debut-months` | 데뷔 월별 배우 수 | `FROM actors WHERE` → `AND is_deleted = 0` |
| 222 | `dashboard:debut-month-actors` | stats CTE `FROM actors WHERE` | `AND is_deleted = 0` 추가 |
| 240 | `dashboard:debut-month-actors` | 메인 `FROM actors a` | `WHERE a.is_deleted = 0 AND` 추가 |
| 276 | `dashboard:actor-score-dist` | stats CTE `FROM actors WHERE` | `AND is_deleted = 0` 추가 |
| 294 | `dashboard:actor-score-dist` | 메인 `FROM actors a` | `WHERE a.is_deleted = 0` 추가 (현재 WHERE 없음, 추가 필요) |
| 319 | `dashboard:actor-physical-dist` | 배우 신체 분포 | `FROM actors a` → `WHERE a.is_deleted = 0 AND` 추가 |
| 340/367 | `dashboard:rank-change-chart` | 순위 변동 차트 `FROM ${fromClause}` (= `actors a`) | type === 'actor'일 때 `WHERE a.is_deleted = 0` 조건 추가 |
| 473 | `dashboard:rating-works` | 작품별 대표 배우 이름 조회 | `JOIN actors a` → `AND a.is_deleted = 0` |

참고: 12-13, 52-53번 라인 (작품 배우 평균 점수 서브쿼리)은 actor_scores 기반 서브쿼리라 변경 불필요.

---

### Phase 6: 대회 탭 (`ipc-cup.ts`) — ~14곳

| 라인 | 용도 | 변경 내용 |
|------|------|----------|
| 668 | 필터 기반 후보 추출 (`FROM actors a WHERE 1=1`) | `AND a.is_deleted = 0` 추가 |
| 711 | 대회 목록 최근 우승자 (`LEFT JOIN actors a`) | `AND a.is_deleted = 0` 추가 |
| 957 | 마스터 랭킹 전체 배우 (`FROM actors a`) | `WHERE a.is_deleted = 0` 추가 |
| 1303 | 대회 진행 중 배우 정보 (`FROM actors WHERE id IN`) | `AND is_deleted = 0` 추가 |
| 1423 | 우승 랭킹 Top 10 (`JOIN actors a ON a.id = r.winner_id`) | `AND a.is_deleted = 0` 추가 |
| 1442 | 대회 히스토리 우승자 (`LEFT JOIN actors a`) | `AND a.is_deleted = 0` 추가 |
| 1554 | 대회 시작 시 참가자 선발 (`FROM actors a WHERE 1=1`) | `AND a.is_deleted = 0` 추가 |
| 1726 | 월드컵 전체 항목 (`SELECT id FROM actors`) | `WHERE is_deleted = 0` 추가 |
| 2129 | 대회 전적 통계 (`LEFT JOIN actors a`) | `AND a.is_deleted = 0` 추가 |
| 2135 | 대회 전적 통계 카운트 (`LEFT JOIN actors a`) | `AND a.is_deleted = 0` 추가 |
| 2232 | 대회 결과 배우 정보 (`FROM actors WHERE id IN`) | `AND is_deleted = 0` 추가 |
| 2310 | 대회 통계 참가 아이템 검증 (`JOIN actors a`) | `AND a.is_deleted = 0` 추가 |
| 2432 | 부별 배우 목록 (`JOIN actors a ON a.id = wa.actor_id`) | `AND a.is_deleted = 0` 추가 |
| 2442 | 부별 배우 랭킹 (`FROM actors a`) | `WHERE a.is_deleted = 0` 추가 |

---

### Phase 7: 태그/시스템 — 2곳

**ipc-tags.ts** (133번 라인)
- 현재: `LEFT JOIN actor_tags at2 ON at2.tag_id = t.id`
- 변경: `LEFT JOIN (actor_tags at2 JOIN actors a ON a.id = at2.actor_id AND a.is_deleted = 0) ON at2.tag_id = t.id`
- 또는 서브쿼리로 삭제 배우 제외

**ipc-system.ts** (56번 라인)
- `SELECT id FROM actors` → `SELECT id FROM actors WHERE is_deleted = 0`

---

### Phase 8: 동작 검증

1. `npm run dev`로 실행
2. 각 탭 정상 동작 확인:
   - **홈**: 배우 수 카운트
   - **배우 탭**: 목록 조회, 상세 보기, 필터/정렬
   - **작품 탭**: 출연 배우 표시, 배우 필터
   - **대시보드**: 배우 관련 통계/랭킹/카드, 순위 변동 차트
   - **대회**: 마스터 랭킹, 대회 생성/진행, 우승 랭킹, 히스토리
   - **태그**: 배우 태그 사용 횟수
3. 배우 삭제 실행 → 모든 탭에서 숨김 확인
4. DB에서 `UPDATE actors SET is_deleted = 0 WHERE id = ?` → 복구 확인

---

## 수정 규모 요약

| Phase | 파일 | 수정 지점 수 | 난이도 |
|-------|------|------------|--------|
| 1 | db.ts | 1 | 쉬움 |
| 2 | ipc-actors.ts (delete) | 1 | 로직 변경 |
| 3 | ipc-actors.ts (조회) | 7 | 쉬움 |
| 4 | ipc-works.ts | 4 | 단순 반복 |
| 5 | ipc-dashboard.ts | ~17 | 단순 반복 |
| 6 | ipc-cup.ts | ~14 | 단순 반복 |
| 7 | ipc-tags.ts + ipc-system.ts | 2 | JOIN 수정 1건 |
| **합계** | **7개 파일** | **~46곳** | Phase 2만 로직 변경, 나머지 WHERE 조건 추가 |

---

## 핵심 원칙

- **삭제 배우는 모든 UI에서 완전히 숨김** — 예외 없음
- 복구는 DB에서 직접 `UPDATE actors SET is_deleted = 0 WHERE id = ?` 실행
- 복구 시 랭킹, 통계, 대회 등 모든 곳에 자동으로 다시 노출됨
- 프론트엔드 수정 없음 — 백엔드 필터링만으로 처리
- 기존 `delete_pending`(삭제 예정 표시)과는 별개 기능

---

# 배우 제외 (is_excluded) 기능

## 개요

배우를 삭제하지 않고 주요 기능에서 제외 처리하는 기능.
대시보드, 랭킹, 평점 계산, 월드컵, 티어에서 `is_deleted`와 동일하게 조회되지 않음.
단, 배우 탭에서 "제외 배우 보기"로 목록 확인 가능하고, 작품 출연 정보에는 이름이 표시됨.

> `is_deleted`(완전 숨김)와 `is_excluded`(제외)는 별개. 삭제 배우는 어디에서도 안 보이지만, 제외 배우는 배우 탭 + 작품 출연 정보에서 확인 가능.

---

## DB 마이그레이션

- `score_excluded` 컬럼 → `is_excluded`로 rename (`ALTER TABLE actors RENAME COLUMN`)
- `is_retired` 컬럼 제거 (`ALTER TABLE actors DROP COLUMN`)
- 신규 컬럼 추가 없음 — 기존 컬럼 재활용

---

## is_excluded 적용 범위

### 제외되는 곳 (is_deleted와 동일 취급)

| 영역 | 적용 방식 |
|------|----------|
| 대시보드 — 신작/신인/신규등록/마스터랭킹/마스터티어 | `AND a.is_excluded = 0` 추가 |
| 랭킹 탭 | `AND a.is_excluded = 0` 추가 |
| 월드컵 — 참가자 선발, 마스터 랭킹, 순위 계산 | `AND a.is_excluded = 0` 추가 |
| 티어 — 미배치 풀, 배치 목록 | `AND a.is_excluded = 0` 추가 |
| 배우 탭 기본 목록 | `AND a.is_excluded = 0` (기본) |
| 태그 카운트 | `AND a.is_excluded = 0` 추가 |
| 홈 카운트 | `AND a.is_excluded = 0` 추가 |
| 신체 점수 계산 (physical-data) | `AND a.is_excluded = 0` 추가 |
| 점수 분포 (score-distribution) | `AND a.is_excluded = 0` 추가 |

### 제외되지 않는 곳 (정상 표시)

| 영역 | 동작 |
|------|------|
| 배우 탭 — "제외 배우 보기" 모드 | `is_excluded = 1`인 배우만 조회 |
| 배우 상세 모달 | is_excluded 상관없이 정상 조회 |
| 작품 출연 배우 목록 | is_excluded 상관없이 이름 표시 |
| 작품 상세 — 출연 배우 | is_excluded 상관없이 표시, 클릭 시 상세 모달 |

---

## 프론트엔드 수정

### ActorForm
- 제외 체크박스 추가 (삭제예정 체크박스 앞, 오렌지색)
- 제외 시 진행 중 대회 참가 여부 체크 → blocked alert

### 상세검색 (SearchBar)
- 삭제예정 아래에 "제외 배우" 버튼 추가 (오렌지색)
- 검색 조건 뱃지에 "제외배우" 표시

### ActorDetailModal
- 이름 옆에 "제외됨" 뱃지 (오렌지 배경)

### CardTooltip
- 이름 옆에 "제외됨" 빨간 글씨

---

## 제외 배우 동작 정리

### 제외 후에도 유지되는 것
- 배우 상세 모달 정상 조회
- 작품 출연 배우 이름 표시 + 클릭 시 상세 모달
- 과거 전적 기록 조회 (순위는 현재 기준 재계산)
- 티어 배치 기록 유지 (제외 해제 시 복원)
- 마스터 티어 뱃지 표시 유지

### 제외 후 안 되는 것
- 배우 탭 기본 목록에서 숨김 (상세검색 "제외 배우"로만 조회)
- 대시보드/랭킹/월드컵/티어에서 조회 불가
- 새 대회 참가 불가
- 태그 카운트/홈 카운트에서 제외
- 신체 점수 계산/점수 분포에서 제외

---

## 수정 범위 요약

| 파일 | 수정 내용 |
|------|----------|
| db.ts | `score_excluded` → `is_excluded` rename, `is_retired` 제거 |
| ipc-actors.ts | `actors:list`에 `showExcluded`, `actors:update`에 `is_excluded` + 대회 참가 체크 |
| ipc-works.ts | 변경 없음 (작품 출연 배우는 is_excluded 무시) |
| ipc-dashboard.ts | `AND is_excluded = 0` 추가 |
| ipc-cup.ts | `AND is_excluded = 0` 추가 |
| ipc-tier.ts | `AND is_excluded = 0` 추가 |
| ipc-tags.ts | `AND is_excluded = 0` 추가 |
| ipc-files.ts | 변경 없음 (파일 트리 배우 매칭은 제외 배우도 매칭) |
| types.ts | Actor 인터페이스에 `is_excluded` 추가 |
| searchTypes.ts | ActorSearchParams에 `showExcluded` 추가 |
| SearchBar.tsx | 상세검색에 "제외 배우" 버튼 + 뱃지 |
| ActorForm.tsx | 제외 체크박스 + blocked alert |
| ActorDetailModal.tsx | "제외됨" 뱃지 |
| CardTooltip.tsx | "제외됨" 빨간 글씨 |
