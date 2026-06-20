# 월드컵 포맷 설계 문서

## 개요

월드컵 포맷은 FIFA 월드컵 방식을 모티브로 한 토너먼트 포맷입니다.
**조별 예선 전체 완료 → 블록 토너먼트 순차 진행 → 결승 라운드** 순으로 진행됩니다.

- 대회 유형(type): actor 또는 work 전체가 참가 (필터 미적용)
- format: `worldcup`
- 마스터 대회 전용: 부(division) 필터로 특정 부만 대회 참가 가능

### 블록 구조의 본질

블록은 **UI 분산 목적**입니다. 128명 전체 대진표를 한 화면에 표시하면 가독성이 떨어지기 때문에
블록 단위로 나눠서 표시합니다. 실제 진행 구조는 **조별리그 → 하나의 연속된 토너먼트**이며,
블록 경계는 UI에서만 의미가 있습니다.

---

## 진행 순서

```
1. 조별 예선 (모든 블록의 모든 조 순차 진행, 기존과 동일)
   ↓ 전체 완료
2. 블록 A 토너먼트 (32명, 4라운드, 최종 2인 진출)
   ↓ 완료
3. 블록 B 토너먼트
   ↓ 완료
4. 블록 C 토너먼트
   ...
   ↓ 마지막 블록 완료
5. 결승 라운드 (전 블록 진출자 합산 → 끝까지)
   ↓ 완료
6. 결승 라운드 우승자 = 대회 최종 우승자
```

---

## 조별 예선

기존 월드컵 포맷과 완전히 동일합니다.

- `groupCount = round_total / 2`
- 전체 참가자를 부(division) + 승점 기준 **포트 방식**으로 조에 배정
  - 참가자 전원을 부 오름차순 / 부 내 승점 내림차순 정렬
  - groupCount씩 묶어 셔플 → 각 조에 1명씩 순서대로 배정
  - 결과: 조당 총원/groupCount 명 (가변적)
- 조원 전원이 서로 경기 (C(n,2) 경기)
- **조당 2명 진출** (1위, 2위)
- 편성 시 `block_id = floor(gIdx / 16)` 부여 (0=A, 1=B, 2=C, ...)

---

## 블록 구조

### 핵심 원칙
- **블록 1개 = 조 16개, 진출자 32명 (2명 × 16조)**
- `blockCount = groupCount / 16 = round_total / 32`
  - 예: round_total = 64  → groupCount=32  → 2블록 (A, B)
  - 예: round_total = 128 → groupCount=64  → 4블록 (A, B, C, D)
  - 예: round_total = 256 → groupCount=128 → 8블록 (A~H)

### 블록 토너먼트 진행
- 조별 예선 **전체** 완료 후 블록 A부터 순서대로 시작
- 블록 A 완료 → 블록 B 시작, 블록 B 완료 → 블록 C 시작, ...
- 각 블록 소속 16개 조의 진출자(조당 2명) 32명 수집 후 랜덤 셔플
- **4라운드 진행 후 2명 생존** → 결승 라운드로 진출 (블록 내 결승 없음)

### 블록 라운드 레이블 (UI)

| 라운드 | round_total=64 | round_total=128 | round_total=256 |
|--------|---------------|-----------------|-----------------|
| 1라운드 | 64강(32인)   | 128강(32인)     | 256강(32인)     |
| 2라운드 | 32강(16인)   | 64강(16인)      | 128강(16인)     |
| 3라운드 | 16강(8인)    | 32강(8인)       | 64강(8인)       |
| 4라운드 | 8강(4인)     | 16강(4인)       | 32강(4인)       |
| 진출표시 | 4강(2인)    | 8강(2인)        | 16강(2인)       |

> 라운드 레이블 계산: `{round_total / 2^(r-1)}강({32 / 2^(r-1)}인)` (r=라운드 번호)
> 진출 표시(마지막 행)는 경기 없이 2인 표시만

### 결승 라운드 레이블 (UI)

블록 토너먼트에서 이어지는 형태이므로 별도 구분 없이 라운드명만 표기 (n인 없음)

| 블록 수 | 결승 라운드 진출 인원 | 라운드 구성          |
|--------|---------------------|---------------------|
| 2블록  | 4명                 | 준결승 → 결승        |
| 4블록  | 8명                 | 8강 → 준결승 → 결승  |
| 8블록  | 16명                | 16강 → 준결승 → 결승 |

---

## DB 설계 변경

### cup_matches 테이블 변경
`block_id` 컬럼 추가:
```sql
ALTER TABLE cup_matches ADD COLUMN block_id INTEGER DEFAULT NULL;
```

| phase    | 설명                         | block_id        | UI 표시      |
|----------|------------------------------|-----------------|--------------|
| group    | 조별 예선 경기               | 0, 1, 2, ...    | A, B, C, ... |
| tiebreak | 조 동점처리 경기             | 0, 1, 2, ...    | A, B, C, ... |
| main     | 블록 토너먼트 (4라운드)      | 0, 1, 2, ...    | A, B, C, ... |
| main     | 결승 라운드                  | NULL            | 결승 라운드  |

> group/tiebreak의 block_id는 `floor(group_id / 16)`으로 역산 가능하지만
> main 경기 구분을 위해 명시적으로 저장

> UI 변환: `String.fromCharCode(65 + block_id)` (0→A, 1→B, 2→C)

---

## IPC 변경

### cup:start (월드컵 포맷)
```
1. groupCount = round_total / 2
2. blockCount = groupCount / 16
3. 포트 방식으로 조 구성 및 그룹 매치 생성 (기존과 동일)
   - group match INSERT 시 block_id = floor(gIdx / 16) 추가
```

### cup:pick 처리 흐름
```
조별/동점처리 경기 완료 시:
  - processGroupPick(blockId 포함) 호출
  - 전체 group/tiebreak 경기 완료 여부 체크
  - 완료 시 → 블록 A(block_id=0)의 32명 수집 → 블록 A 1라운드 생성

블록 본선 경기(phase='main', block_id=N) 완료 시:
  - 해당 block_id 기준 라운드 완료 체크
  - 남은 인원 > 2명 → 다음 라운드 매치 생성 (block_id 유지)
  - 남은 인원 = 2명 (4라운드 완료):
    - 다음 블록이 있으면 → startNextBlock(runId, N+1)
    - 마지막 블록이면 → 전 블록 진출자 수집 → 결승 라운드 1라운드 생성 (block_id=NULL)

결승 라운드 경기(phase='main', block_id=NULL) 완료 시:
  - 라운드 완료 체크
  - 남은 인원 > 1명 → 다음 라운드 매치 생성
  - 남은 인원 = 1명 → cup 완료 처리 (winner_id 저장)
```

### cup:standings (월드컵 포맷) 반환 구조
```typescript
{
  type: 'worldcup',
  groupPhase: {
    completed: boolean,
    blocks: Array<{
      block_id: number,           // 0, 1, 2, ...
      label: string,              // 'A', 'B', 'C', ...
      groups: GroupStanding[]     // 기존 조별 standings 구조
    }>
  },
  blockTournaments: Array<{
    block_id: number,
    label: string,
    status: 'pending' | 'in_progress' | 'completed',
    rounds: RoundMatches[],       // phase='main', block_id=N
    finalists: number[]           // 최종 2인 item_id (completed일 때)
  }>,
  finalRound: {
    status: 'pending' | 'in_progress' | 'completed',
    rounds: RoundMatches[]        // phase='main', block_id=NULL
  } | null
}
```

---

## UI 설계

### 현황 탭 — 조별 예선 중
- 블록 레이블로 섹션 구분 (블록 A, 블록 B, ...)
- 각 블록 내 16개 조 카드 그리드 (기존 조 카드 UI 재사용)
- 현재 진행 중인 조 카드가 해당 블록 내에서 맨 앞으로

### 현황 탭 — 블록 토너먼트 / 결승 라운드 중

각 블록 = 카드 1개, 진행 중인 블록이 최상단

| 상태        | 표시                                              |
|-------------|---------------------------------------------------|
| 진행 중     | 라운드별 대진표 (왼쪽=첫 라운드, 오른쪽=최신 라운드) |
| 완료        | 진출자 2인 표시, 클릭 시 전체 대진 펼침            |
| 대기 중     | "대기 중" 플레이스홀더                             |

결승 라운드는 별도 섹션으로 블록 카드 아래에 표시 (블록 전체 완료 후 활성화)

대진표 방향: 왼쪽(첫 라운드 / 많은 인원) → 오른쪽(결승 / 적은 인원)

---

## 구현 순서

### Phase A: DB 마이그레이션
1. `db.ts`: `cup_matches`에 `block_id` 컬럼 추가

### Phase B: IPC 재설계
2. `ipc.ts`: `processGroupPick`에 `blockId` 파라미터 추가
3. `ipc.ts`: `startNextBlock(runId, blockId)` 함수 추가
4. `ipc.ts`: `startFinalRound(runId)` 함수 추가
5. `ipc.ts`: `cup:start` worldcup — 포트 방식 그룹 생성 + block_id 추가
6. `ipc.ts`: `cup:pick` worldcup — 블록 순차 진행 + 결승 라운드 연결
7. `ipc.ts`: `cup:standings` worldcup — 블록별 + 결승 라운드 구조 반환

### Phase C: UI
8. `Worldcup.tsx` 현황 탭 worldcup — 블록 카드 대진표 + 결승 라운드 섹션

---

## 미결 사항

- [x] 참가자 수 < round_total 케이스: 발생 불가 (해결 불필요)
- [x] 크로스 블록 토너먼트: 설계에서 제외
- [x] 블록 구조 본질: UI 분산 목적, 실제는 연속된 하나의 토너먼트
- [ ] 블록 토너먼트 4라운드 완료 시 정확히 2인 보장 로직 확인 (32명 → 4라운드 → 2명: 32→16→8→4→2 ✓)
