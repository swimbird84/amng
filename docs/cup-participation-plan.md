# 마스터 대회 참가 조건 — 작업 계획

상세 설계: [cup-participation-idea.md](cup-participation-idea.md)

## Step 1: DB 마이그레이션
- `tier_levels` 테이블에 `is_cup_excluded INTEGER DEFAULT 0` 컬럼 추가
- `db.ts`에서 `PRAGMA table_info` 확인 후 `ALTER TABLE` 방식

## Step 2: 티어 관련 IPC
- `tier_levels` 조회 시 `is_cup_excluded` 포함
- `tier_levels` 업데이트 시 `is_cup_excluded` 저장 가능하도록

## Step 3: 티어 에디터 UI
- 등급 헤더 클릭 모달에 "대회 제외" 체크박스 추가
- 체크된 등급 헤더에 SVG 금지 아이콘 표시 (currentColor)
- 작품/배우 티어 에디터 양쪽 동일

## Step 4: 마스터 대회 참가자 쿼리 수정
- 대회 시작 시 참가자 조회에 티어 조건 추가
  - 마스터 티어에 등록된 항목만
  - 해당 등급의 `is_cup_excluded = 0`인 것만
- `cup:item-count` — 참가자 숫자 자동 계산에 반영
- 대회 생성/설정 드롭다운 참가자 목록 쿼리에 반영
- 작품/배우 양쪽

## Step 5: 마스터 대회 목록/통계 수정
- `cup:standings` — 대회 통계보기에 티어 조건 반영

## Step 6: 마스터 랭킹 쿼리 수정
- `master-ranking:list` — actor/work 양쪽 WHERE에 티어 필터 추가
  - 마스터 티어 등록 + `is_cup_excluded = 0` 조건
  - `RANK()` 계산 전에 필터링 (순위 공백 없음)
- `master-ranking:rank-trends` — 동일 조건 적용
- `master-ranking:rank-history` — 동일 조건 적용
- `master-ranking:item-stats` — 동일 조건 적용
- `master-ranking:item-format-stats` — 동일 조건 적용

## Step 7: 검증
- 제외 등급 설정 → 대회 시작 시 불참 확인
- 참가자 수 자동 계산 반영 확인
- 랭킹에서 제외 확인, 순위 공백 없는지 확인
- 등급 복귀 시 랭킹 복귀 + 기존 포인트 유지 확인
- 진행 중인 대회에 영향 없는지 확인
