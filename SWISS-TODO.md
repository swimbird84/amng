# 스위스 라운드 보완 작업

## 논의 결과 (확정)
- BH(부흐홀츠) 제거 — 직관적이지 않음
- 부전승에 승점 부여
- 진출자 판정: 승점 → 승자승(직접 대결) → 타이브레이커 매치
- 부전승 UI: 카드 클릭으로 처리 (기존 방식 복구)
- 홀수 조 경기 수 차이는 현재 허용
- 마스터 포인트에는 부전승 미반영 유지

---

## 작업 상세

### 백엔드 (ipc-cup.ts)

#### 1. computeGroupStandings — 부전승 승점 반영
- 현재: `is_bye` 필드를 받지 않아서 부전승 매치가 승점에 반영 안 됨
- 변경: 함수 시그니처에 `is_bye` 추가. `is_bye = 1`인 매치의 `item1_id`에 승점(win) 부여
- 이 함수를 호출하는 곳 모두 타입 맞춰서 수정

#### 2. BH 제거 — cup:standings worldcup 섹션
- 현재: isSwiss 블록에서 buchholz 계산 후 standings에 포함, 정렬에 BH 사용
- 변경: buchholz 계산/필드 제거, standings 정렬을 승점 → 승수만으로 변경

#### 3. 진출자 판정 변경 — getGroupQualifiers worldcup
- 현재: 승점 → BH → 승수 순으로 2위 판정
- 변경: 승점 → 승자승(동점자 간 직접 대결 결과) → 직접 대결 없으면 타이브레이커 매치 필요(null 반환)

#### 4. 타이브레이커 생성 변경 — processGroupPick worldcup
- 현재: BH 기반으로 동점 판정 후 타이브레이커 생성
- 변경: 승점 동점 → 승자승 확인 → 직접 대결 없는 동점자끼리 타이브레이커 매치 생성

#### 5. 부전승 UI 복구 — cup:get, cup:pick
- 현재: 두 쿼리 모두 `AND is_bye = 0`으로 부전승 매치를 건너뜀 → 카드 안 나타남
- 변경:
  - `cup:get` current match 쿼리에서 `AND is_bye = 0` 제거
  - `cup:pick` next match 반환 쿼리에서 `AND is_bye = 0` 제거
  - `cup:pick` 조 라운드 완료 체크에서 `AND is_bye = 0` 제거 (부전승 클릭해야 라운드 완료)
  - `cup:pick` 핸들러에서 `match.is_bye`일 때 `cup_stats` 업데이트 스킵 (실제 대결이 아니므로)

#### 6. autoSwissNextRound — BH 제거
- 현재: 다음 라운드 매칭 시 승점 + 승수로 정렬 (BH 미사용이긴 함)
- 변경: 변경 없음 (이미 BH 안 쓰고 있음)

### 프론트엔드 (PlayView.tsx)

#### 7. BH 컬럼 제거
- Swiss group 순위표에서 BH 헤더, 데이터 셀 제거
- `bhMap`, `isSwissGroup`으로 BH 관련 분기하던 코드 제거
- `swissFields.buchholz` 참조 제거

### 마스터 포인트 (calcAndStoreRunPoints)

#### 8. 변경 없음
- 기존대로 `is_bye = 0`으로 부전승 제외 유지 (실제 대결 없이 마스터 포인트 부여는 불공정)

---

## 기타 확인된 문제 (보류)
- 소수 인원(5명 등) 스위스에서 재대결 발생 가능 — 매칭 대상 부족 시 불가피
- 홀수 조 경기 수 차이(2경기 vs 3경기) — 부전승 승점으로 승점 공정성 확보, 경기 수 차이는 허용
