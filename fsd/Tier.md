# 티어메이커 — 작품/배우 등급 평가

## 개요

작품/배우에 티어(등급)를 부여하여 평가하는 시스템.
월드컵/마스터랭킹과 독립적으로 운영되며, 마스터 티어는 상세 모달에서 공식 등급으로 표시.
탭 위치: 파일 다음, 월드컵 앞 (대시보드 / 작품 / 배우 / 파일 / 랭킹 / **티어** / 월드컵 / 레이블 / 태그)

---

## 핵심 구조

### 티어 세트 (Tier Set)
- 하나의 평가 단위 (예: "종합 티어", "장르별 티어")
- `type`: 'actor' | 'work'
- `is_master`: 마스터 티어 여부 (타입별 1개만 가능)
- 마스터 티어 = 작품/배우 상세 모달에서 공식 등급으로 표시

### 티어 등급 (Tier Level)
- 세트별로 자유 생성 (예: S, A, B, C, D)
- 사용자 정의: 이름, 색상
- `sort_order`로 상하 순서 명확 (낮을수록 상위)
- ID 값으로 관리 → 상세 정보에서 참조

### 배치 (Tier Item)
- 작품/배우를 특정 세트의 특정 등급에 배치
- 미배치 항목은 상세 모달에서 `-` 또는 `#` 표시

---

## DB 스키마

```sql
CREATE TABLE tier_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('actor', 'work')),
  is_master INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE tier_levels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id INTEGER NOT NULL REFERENCES tier_sets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tier_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id INTEGER NOT NULL REFERENCES tier_sets(id) ON DELETE CASCADE,
  level_id INTEGER NOT NULL REFERENCES tier_levels(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL,
  UNIQUE(set_id, item_id)
);
```

### 제약 조건
- `tier_sets`: 타입별 `is_master = 1`은 1개만 허용
- `tier_items`: 같은 세트에 같은 아이템은 1번만 배치 가능
- `tier_levels.sort_order`: 낮을수록 상위 (S=0, A=1, B=2...)

---

## 기능

### 1. 티어 세트 관리
- 생성: 이름, 타입(작품/배우), 마스터 여부
- 수정: 이름 변경
- 삭제: 세트 삭제 시 등급+배치 전부 CASCADE 삭제
- 마스터 지정: 타입별 1개만, 기존 마스터 해제 후 지정

### 2. 티어 등급 관리
- 세트 내에서 등급 생성: 이름, 색상, 순서
- 등급 수정: 이름, 색상 변경
- 등급 삭제: 해당 등급의 배치 항목도 삭제
- 순서 변경: 드래그로 상하 이동

### 3. 아이템 배치
- 작품/배우를 등급에 배치 (드래그 앤 드롭)
- 등급 간 이동
- 배치 해제 (미배치로 되돌리기)
- 미배치 항목 목록 표시

### 4. 상세 모달 연동
- 작품/배우 상세 모달에서 마스터 티어 등급 표시
- 미배치 시 `-` 또는 `#` 표시
- 등급명 + 색상으로 시각적 표시

### 5. 대시보드 연동 (추후)
- 마스터 티어 기반 분포 차트 등

---

## IPC 핸들러 (예정)

| 핸들러 | 동작 |
|--------|------|
| `tier:listSets` | 세트 목록 조회 |
| `tier:createSet` | 세트 생성 |
| `tier:updateSet` | 세트 수정 |
| `tier:deleteSet` | 세트 삭제 |
| `tier:setMaster` | 마스터 지정 |
| `tier:listLevels` | 세트의 등급 목록 |
| `tier:createLevel` | 등급 생성 |
| `tier:updateLevel` | 등급 수정/순서 변경 |
| `tier:deleteLevel` | 등급 삭제 |
| `tier:listItems` | 세트의 배치 목록 |
| `tier:setItem` | 아이템 등급 배치/이동 |
| `tier:removeItem` | 아이템 배치 해제 |
| `tier:getMasterTier` | 특정 아이템의 마스터 티어 등급 조회 |

---

## UI (추후 설계)

- 탭 구성, 레이아웃, 드래그 앤 드롭 인터랙션 등은 추후 상세 설계
- 참고: 일반적인 티어메이커 UI (좌측 등급 행 + 우측 미배치 풀)

---

## 고려 사항

- 마스터 티어는 타입별 1개만 → DB 레벨에서 트리거 또는 앱 레벨에서 체크
- 기존 월드컵/마스터랭킹과 독립 운영 — 데이터 충돌 없음
- 작품이 많을 경우 미배치 풀에서 검색/필터 필요
- 배우 soft delete된 항목은 티어에서도 숨김 처리
