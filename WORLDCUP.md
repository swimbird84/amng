# 월드컵 포맷 설계 문서

## 개요

월드컵 포맷은 실제 FIFA 월드컵 방식을 모티브로 한 토너먼트 포맷이다.
조별 예선 → 블럭 내 토너먼트 → 크로스 블럭 토너먼트(결승 토너먼트) 순으로 진행된다.

- 대회 유형(type): actor 또는 work 전체가 참가 (필터 미적용)
- format: `worldcup`
- 마스터 대회 전용: 부(division) 필터로 특정 부만 대회 참가 가능

---

## 블럭 구조

### 핵심 원칙
- **블럭 하나당 무조건 32명**
- 블럭 수 = round_total / 32
  - 예: round_total = 64 → 2블럭, 128 → 4블럭, 256 → 8블럭

### 조 구성
- 블럭 1개 = 조 16개 (각 조 2명)
  - 그룹 A~P (16개 조)
  - 각 조 2명이 1경기 진행
  - 조 1위(승자) 1명 → 블럭 내 토너먼트 진출

### 조별 시딩 방식 (FIFA 방식 참고)
- 조 배정: 참가자 랜덤 셔플 후 순서대로 배정
  - 슬롯 0 → A조 1번, 슬롯 1 → B조 1번, ..., 슬롯 15 → P조 1번
  - 슬롯 16 → A조 2번, 슬롯 17 → B조 2번, ..., 슬롯 31 → P조 2번

---

## 블럭 내 토너먼트 구조

### 매치 생성 방식
- 조별 예선이 끝나면 16명이 블럭 내 토너먼트에 진출
- **16강 → 8강 → 4강 → 결승** (4라운드)
- **전체 대진표를 대회 시작 시 미리 생성** (NULL 슬롯으로 채움)
- 조 결과가 나올 때마다 해당 슬롯을 업데이트

### 조 → 토너먼트 슬롯 매핑
홀수 조 1위 vs 짝수 조 1위 방식으로 16강 대진 구성:

```
16강 대진 (블럭 내):
  Match 0:  A조 1위  vs  B조 1위
  Match 1:  C조 1위  vs  D조 1위
  Match 2:  E조 1위  vs  F조 1위
  Match 3:  G조 1위  vs  H조 1위
  Match 4:  I조 1위  vs  J조 1위
  Match 5:  K조 1위  vs  L조 1위
  Match 6:  M조 1위  vs  N조 1위
  Match 7:  O조 1위  vs  P조 1위

8강:
  Match 8:  Winner(0) vs Winner(1)
  Match 9:  Winner(2) vs Winner(3)
  Match 10: Winner(4) vs Winner(5)
  Match 11: Winner(6) vs Winner(7)

4강:
  Match 12: Winner(8)  vs Winner(9)
  Match 13: Winner(10) vs Winner(11)

결승:
  Match 14: Winner(12) vs Winner(13)
```

### 대진표 인덱스 계산 공식
- 16강: match_index = 0~7 (조 인덱스 / 2)
- 8강: match_index = 8~11 (16강 match_index / 2 + 8)
- 4강: match_index = 12~13 (8강 match_index / 2 + 12)
- 결승: match_index = 14

부모 매치 인덱스: floor(child_match_index / 2) + offset(다음 라운드 시작 인덱스)

---

## 크로스 블럭 토너먼트 (결승 토너먼트)

- 각 블럭의 우승자 1명씩 최종 토너먼트 진출
- 블럭 수에 따른 크로스 토너먼트 구조:
  - 2블럭 → 결승 1경기
  - 4블럭 → 준결승 2경기 + 결승 1경기
  - 8블럭 → 8강 4경기 + 4강 2경기 + 결승 1경기
- 크로스 블럭 대진도 대회 시작 시 미리 생성 (NULL 슬롯)

### 블럭 → 크로스 슬롯 매핑
```
블럭 0 우승 → 크로스 매치 0의 item1
블럭 1 우승 → 크로스 매치 0의 item2
블럭 2 우승 → 크로스 매치 1의 item1
블럭 3 우승 → 크로스 매치 1의 item2
...
```

크로스 토너먼트 내부 대진은 블럭 내 토너먼트와 동일한 이진 트리 구조로 구성.

---

## DB 설계 변경

### cup_matches 테이블 변경
현재 컬럼에 `block_id` 추가:
```sql
ALTER TABLE cup_matches ADD COLUMN block_id INTEGER DEFAULT NULL;
```

- `block_id = NULL` → 크로스 블럭 매치 (phase='cross')
- `block_id = 0, 1, 2, ...` → 해당 블럭 내 매치

### phase 구분

| phase   | 설명                        | block_id   |
|---------|-----------------------------|------------|
| group   | 조별 예선 (각 조 1경기)      | 0, 1, ...  |
| main    | 블럭 내 토너먼트 (16강~결승) | 0, 1, ...  |
| cross   | 크로스 블럭 토너먼트         | NULL       |

기존 `main` phase를 블럭 내 토너먼트에 재사용하고, 크로스용 `cross` phase 추가.

### cup_groups 테이블 변경
`block_id` 컬럼 추가:
```sql
ALTER TABLE cup_groups ADD COLUMN block_id INTEGER DEFAULT 0;
```

---

## IPC 변경

### cup:start (월드컵 포맷)
```
1. 참가자 수 계산 → round_total 결정 (32의 배수)
2. 블럭 수 = round_total / 32
3. 참가자를 랜덤 셔플
4. 블럭별 32명씩 배정:
   for b in 0..blockCount:
     block_participants = shuffled[b*32 .. b*32+32]
     → 16개 조 생성 (cup_groups, block_id=b)
     → 조별 예선 매치 생성 (phase='group', block_id=b)
     → 블럭 내 15경기 미리 생성 (phase='main', block_id=b, item1/2=NULL)
       match_index: 0~14
5. 크로스 블럭 매치 미리 생성 (phase='cross', block_id=NULL, item1/2=NULL)
   경기 수: blockCount - 1
```

### cup:pick (결과 반영 및 슬롯 업데이트)
```
조별 경기(phase='group') winner 확정 시:
  group_index = group 내 순서 (A=0, B=1, ...)
  블럭 내 16강 match_index = floor(group_index / 2)
  슬롯 위치: group_index가 짝수 → item1, 홀수 → item2
  → UPDATE cup_matches SET item{1or2}_id = winner_id WHERE block_id=b AND phase='main' AND match_index=target

블럭 내 매치(phase='main') winner 확정 시:
  다음 라운드 match_index 계산
  슬롯 업데이트 (위와 동일 방식)
  블럭 결승(match_index=14) winner 확정 시:
    → 크로스 슬롯 업데이트 (block_id 기반으로 슬롯 위치 계산)

크로스 매치(phase='cross') winner 확정 시:
  다음 라운드 슬롯 업데이트
  최종 결승 winner → cup 완료 처리
```

### cup:standings (블럭별 대진표 반환)
```json
{
  "phase": "main",
  "blocks": [
    {
      "block_id": 0,
      "groups": [...],
      "bracket": [
        { "round": 16, "matches": [...] },
        { "round": 8,  "matches": [...] },
        { "round": 4,  "matches": [...] },
        { "round": 1,  "matches": [...] }
      ]
    }
  ],
  "crossBracket": [
    { "round": ..., "matches": [...] }
  ]
}
```

---

## UI 설계

### 현황 탭

#### 조별 예선 중 (phase='group')
- 현재 방식과 동일
- 블럭 번호로 섹션 구분 (Block 1, Block 2, ...)
- 각 블럭 내 16개 조 카드 그리드
- 현재 진행중인 조 카드가 해당 블럭 내에서 맨 앞으로

#### 본선 중 (phase='main')
- 블럭별 토너먼트 브래킷 표시
- 블럭 탭 (Block 1, Block 2, ...) 또는 세로 스크롤
- 브래킷 레이아웃 (가로):
  ```
  [16강]       [8강]     [4강]   [결승]
  A1 ┐
     ├→ W ┐
  B1 ┘   |
         ├→ W ┐
  C1 ┐   |   |
     ├→ W ┘  ├→ W ┐
  D1 ┘       |   |
             |   ├→ 우승
  E1 ┐       |   |
     ├→ W ┐  |   |
  F1 ┘   |  ├→ W ┘
         ├→ W ┘
  G1 ┐   |
     ├→ W ┘
  H1 ┘
  ...
  ```

#### 크로스 토너먼트 중 (phase='cross')
- 단일 토너먼트 브래킷
- 각 슬롯에 블럭 우승자 이름/썸네일 표시

### 브래킷 컴포넌트 구조
```
WorldcupBracket (현황 탭 내 조건부 렌더링)
  ├── GroupPhaseView (phase='group')
  │   └── BlockSection (per block)
  │       └── GroupCard Grid
  ├── MainPhaseView (phase='main')
  │   ├── BlockTabs
  │   └── BlockBracket (per block)
  │       └── BracketColumn (per round: 16강/8강/4강/결승)
  │           └── BracketMatch
  └── CrossPhaseView (phase='cross')
      └── CrossBracket
          └── BracketColumn (per round)
              └── BracketMatch
```

---

## 구현 순서

### Phase A: DB 마이그레이션
1. `db.ts`: `cup_matches`에 `block_id` 컬럼 추가
2. `db.ts`: `cup_groups`에 `block_id` 컬럼 추가

### Phase B: IPC 재설계
3. `ipc.ts`: `cup:start` (worldcup 분기) 재작성
4. `ipc.ts`: `cup:pick` 슬롯 업데이트 로직 추가
5. `ipc.ts`: `cup:standings` 블럭별 대진표 데이터 반환

### Phase C: UI 신규 작성
6. 브래킷 공통 컴포넌트 (`BracketMatch`, `BracketColumn`)
7. `BlockBracket` 컴포넌트
8. `CrossBracket` 컴포넌트
9. `Worldcup.tsx` 현황 탭에 조건부 렌더링 통합

---

## 미결 사항

- [x] 참가자 수 < round_total 케이스: round_total이 항상 참가자 수 이하의 최대 32배수로 결정되므로 발생 불가 (해결 불필요)
- [x] 크로스 블럭 시딩: 블럭 번호 순 그대로 배정 (시딩 없음)
- [x] 블럭 1개 케이스: 작품 1400명, 배우 400명으로 실질적으로 발생 불가 (해결 불필요)
- [x] 조별 동점: 1v1 단판이므로 무승부 없음, 기존 타이브레이커 로직으로 처리 가능
- [ ] 월드컵 포맷에서 현재 진행 단계(group/main/cross) 판단 로직
