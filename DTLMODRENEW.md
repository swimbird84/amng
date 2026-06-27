# 상세 모달 통합 리뉴얼 계획

## 배경

현재 배우/작품 정보를 보는 모달이 두 종류 존재한다:

1. **상세 모달** — `Actors.tsx`, `Works.tsx` 페이지 내부에 인라인으로 구현
   - 수정/삭제/즐겨찾기/대표태그 토글 등 모든 기능 포함
   - 해당 페이지의 state(`selected`, `fileStatuses`, `refreshKey` 등)에 의존
   - 수정 버튼 → 같은 페이지 내에서 `ActorForm`/`WorkForm` 모달 열기

2. **뷰 모달** — `ActorViewModal.tsx`, `WorkViewModal.tsx` 독립 컴포넌트
   - 읽기 전용 (즐겨찾기/별점 변경 불가)
   - "수정하기" 버튼 → `App.tsx`의 `handleEditActor`/`handleEditWork` 호출 → 탭 강제 이동 후 수정 모달 열기
   - `App.tsx`의 `viewStack`, `Tags.tsx`의 `viewWorkId`/`viewActorId`에서 사용

**문제**: 뷰 모달은 상세 모달의 열화 버전이며, 수정 시 탭 이동이 강제되는 불필요한 UX 제약이 있다. 수정 모달(`ActorForm`/`WorkForm`)은 독립 컴포넌트라 어디서든 렌더 가능하므로 기술적 제한이 없다.

## 목표

- 어떤 탭에서든 상세 모달(수정 기능 포함)을 열 수 있게 통합
- 뷰 모달 제거
- 수정 시 탭 이동 없이 현재 위치에서 완료

---

## Phase 1: 상세 모달을 독립 컴포넌트로 분리

### ActorDetailModal.tsx 생성

`Actors.tsx` 443~705행의 상세 모달을 독립 컴포넌트로 추출.

**Props**:
```ts
interface Props {
  actorId: number
  onClose: () => void
  onViewWork: (id: number) => void
  zIndex?: number
}
```

**내부에서 처리할 것**:
- `actorsApi.get(actorId)` 호출하여 데이터 로딩 (마운트 시)
- `fileStatuses` 계산 (출연작 파일 존재 여부)
- 즐겨찾기 토글 (`actorsApi.update`)
- 대표 태그 토글 (`actorTagsApi.toggleRep`)
- 수정 버튼 → 내부에서 `ActorForm` 렌더 (showForm state)
- 삭제 버튼 → 삭제 확인 → `actorsApi.delete` → `onClose()`
- 레이더 차트, 추가 사진, 코멘트, 태그, 출연작 목록 등 현재 상세 모달의 모든 UI 유지

**Actors.tsx에서의 변경**:
- 인라인 상세 모달 코드 제거
- `<ActorDetailModal actorId={selected.id} onClose={() => setSelected(null)} onViewWork={onNavigateToWork} />` 로 교체
- 상세 모달이 의존하던 page-level state 정리 (`hoverCover`, `hoverActorPhoto`, `workSort`, `workSortDir` 등 제거 가능)

### WorkDetailModal.tsx 생성

`Works.tsx` 490~735행의 상세 모달을 독립 컴포넌트로 추출.

**Props**:
```ts
interface Props {
  workId: number
  onClose: () => void
  onViewActor: (id: number) => void
  zIndex?: number
}
```

**내부에서 처리할 것**:
- `worksApi.get(workId)` 호출하여 데이터 로딩
- `fileStatuses` 계산
- 즐겨찾기 토글
- 별점 변경 (`worksApi.update`)
- 대표 태그 토글
- 수정 버튼 → 내부에서 `WorkForm` 렌더
- 삭제 버튼 → `worksApi.delete` → `onClose()`
- 폴더 삭제 기능
- 재생 경로, 배우 목록, 태그, 코멘트 등 현재 UI 유지

**Works.tsx에서의 변경**:
- 인라인 상세 모달 코드 제거
- `<WorkDetailModal workId={selected.id} onClose={() => setSelected(null)} onViewActor={onNavigateToActor} />` 로 교체

---

## Phase 2: 뷰 모달을 상세 모달로 교체

### App.tsx

현재:
```tsx
// viewStack에서 ActorViewModal / WorkViewModal 렌더
// "수정하기" → handleEditActor/handleEditWork → 탭 이동 + 수정 모달
```

변경:
```tsx
// viewStack에서 ActorDetailModal / WorkDetailModal 렌더
// 수정은 DetailModal 내부에서 완결 (탭 이동 없음)
```

- `import ActorViewModal` → `import ActorDetailModal`
- `import WorkViewModal` → `import WorkDetailModal`
- `handleEditActor`, `handleEditWork`, `pendingEditActor`, `pendingEditWork` 제거
- `ActorDetailModal`의 `onViewWork` → `handleNavigateToWork` 연결 (viewStack 교체)
- `WorkDetailModal`의 `onViewActor` → `handleNavigateToActor` 연결

### Tags.tsx

현재:
```tsx
// viewWorkId / viewActorId state로 WorkViewModal / ActorViewModal 렌더
// "수정하기" → onEditWork / onEditActor prop 호출 → App.tsx 경유 → 탭 이동
```

변경:
```tsx
// WorkDetailModal / ActorDetailModal로 교체
// onEditWork, onEditActor prop 불필요 → 제거
```

### Actors.tsx, Works.tsx

- `openEditId`, `onEditHandled` prop 제거 (외부에서 수정 모달을 열어주는 기능 불필요)
- 관련 useEffect 제거

---

## Phase 3: 정리

### 파일 삭제
- `src/renderer/src/components/ActorViewModal.tsx`
- `src/renderer/src/components/WorkViewModal.tsx`

### App.tsx 정리
- `handleEditActor`, `handleEditWork` 함수 삭제
- `pendingEditActor`, `pendingEditWork` state 삭제
- `setPendingEditWork`, `setPendingEditActor` 관련 코드 삭제

### Tags.tsx 정리
- `onEditWork`, `onEditActor` prop 삭제
- `viewWorkId`, `viewActorId` state는 유지 (DetailModal 열기용)

### Actors.tsx 정리
- `openEditId`, `onEditHandled` prop 삭제
- 외부 수정 트리거 관련 useEffect 삭제

### Works.tsx 정리
- `openEditId`, `onEditHandled` prop 삭제
- 외부 수정 트리거 관련 useEffect 삭제

---

## 영향 범위 요약

| 파일 | 변경 내용 |
|------|-----------|
| `ActorDetailModal.tsx` | **신규** — Actors.tsx에서 상세 모달 추출 |
| `WorkDetailModal.tsx` | **신규** — Works.tsx에서 상세 모달 추출 |
| `ActorViewModal.tsx` | **삭제** |
| `WorkViewModal.tsx` | **삭제** |
| `App.tsx` | ViewModal → DetailModal 교체, handleEdit/pendingEdit 제거 |
| `Actors.tsx` | 인라인 상세 모달 → DetailModal 컴포넌트 호출로 교체, openEditId prop 제거 |
| `Works.tsx` | 인라인 상세 모달 → DetailModal 컴포넌트 호출로 교체, openEditId prop 제거 |
| `Tags.tsx` | ViewModal → DetailModal 교체, onEditWork/onEditActor prop 제거 |

---

## 주의사항

- DetailModal 내부에서 수정/삭제 후 `onClose()`를 호출하면 모달이 닫힌다. 해당 탭의 리스트 갱신은 탭 진입 시 자동으로 최신 DB 데이터를 로드하므로 문제없다.
- `Actors.tsx`/`Works.tsx` 자체 페이지에서 상세 모달을 열 때도 DetailModal 컴포넌트를 사용하므로, 수정 후 리스트 갱신이 필요하면 `onClose` 콜백에서 `loadActors()`/`refreshWorks()`를 호출하면 된다.
- ESC 핸들러: DetailModal 내부에서 `useEscHandler` 사용. App.tsx의 viewStack ESC 핸들러와 충돌하지 않도록 우선순위 관리 필요.
