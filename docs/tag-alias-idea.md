# 태그 별칭(Alias) 기능

## 개요
태그 자동 매칭 시 태그 이름뿐 아니라 등록된 별칭(동의어)도 함께 검색하여 매칭하는 기능.

예: 태그 `NTR` → 별칭 `寝取られ`, `네토라레` → 텍스트에 `寝取られ`가 있으면 `NTR` 태그 자동 매칭

## DB 설계

```sql
CREATE TABLE work_tag_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag_id INTEGER REFERENCES work_tags_master(id) ON DELETE CASCADE,
  alias TEXT NOT NULL
);

CREATE TABLE actor_tag_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag_id INTEGER REFERENCES actor_tags_master(id) ON DELETE CASCADE,
  alias TEXT NOT NULL
);
```

## UI 계획

### TagAliasModal — TagLinkModal과 동일한 2패널 구조

Tags 페이지의 태그 연결 버튼 옆에 **태그 별칭** 버튼 추가.
클릭 시 TagAliasModal 오픈.

```
┌─ 좌측: 태그 목록 (뱃지) ─────┐ ┌─ 우측: 선택된 태그의 별칭 ────┐
│ [카테고리명]                  │ │ 별칭 추가: [입력창] [추가]    │
│ [NTR●] [근친] [여교사]       │ │                              │
│ [카테고리명]                  │ │ ┌───────────┬──┐             │
│ [태그A] [태그B] [태그C]      │ │ │ 寝取られ   │ ✕│             │
│ ...                          │ │ │ 네토라레   │ ✕│             │
│                              │ │ │ netorare  │ ✕│             │
└──────────────────────────────┘ └──────────────────────────────┘
```

- 좌측: 태그 목록 (카테고리별 그룹, **뱃지 형태** flex-wrap)
  - 별칭이 있는 태그는 ● 표시
  - 클릭으로 태그 선택
- 우측: 선택된 태그의 별칭 CRUD
  - 입력창 + 추가 버튼 (쉼표/엔터로 여러 개 동시 추가 가능)
  - 각 별칭: 텍스트 표시 + ✕ 삭제
- work/actor 타입 구분 (TagLinkModal과 동일하게 type prop)

### TagLinkModal 좌측 UI 변경

기존 한 줄 리스트 형태 → **뱃지 형태** (flex-wrap)로 변경.
TagAliasModal과 동일한 좌측 태그 목록 스타일 통일.

## 자동 매칭 로직 변경

### 현재
```js
allTags.filter(t => comment.includes(t.name))
```

### 변경 후
```js
allTags.filter(t =>
  comment.includes(t.name) ||
  t.aliases?.some(alias => comment.includes(alias))
)
```

## 적용 대상
- WorkForm: 타이틀 태그 자동 매칭 버튼 (828줄)
- WorkForm: 코멘트 태그 자동 매칭 버튼 (855줄)
- WorkForm: 타이틀 onPaste 시 태그 자동 매칭 (835~839줄)
- WorkForm: 코멘트 onPaste 시 태그 자동 매칭 (862~866줄)
- ActorForm: 코멘트 태그 자동 매칭 버튼 (501줄)
- ActorForm: 코멘트 onPaste 시 태그 자동 매칭 (508~514줄)

## IPC 추가 필요
- `work-tag-aliases:list(tagId)` / `actor-tag-aliases:list(tagId)`
- `work-tag-aliases:create(tagId, alias)` / `actor-tag-aliases:create(tagId, alias)`
- `work-tag-aliases:delete(id)` / `actor-tag-aliases:delete(id)`
- 태그 목록 조회 시 aliases 포함 옵션 (자동 매칭용)

---

## 상세 작업 계획

### Step 1: DB 마이그레이션
**파일**: `src/main/db.ts`
- `CREATE TABLE IF NOT EXISTS work_tag_aliases (...)` 추가
- `CREATE TABLE IF NOT EXISTS actor_tag_aliases (...)` 추가

### Step 2: IPC 핸들러
**파일**: `src/main/ipc.ts` (또는 별도 파일)

신규 IPC 채널:
- `work-tag-aliases:list(tagId)` — 특정 태그의 별칭 목록 조회
- `work-tag-aliases:create(tagId, alias)` — 별칭 추가
- `work-tag-aliases:delete(id)` — 별칭 삭제
- `actor-tag-aliases:list(tagId)` — 동일
- `actor-tag-aliases:create(tagId, alias)` — 동일
- `actor-tag-aliases:delete(id)` — 동일

기존 IPC 수정:
- `work-tags:list` — `withAliases` 옵션 추가, true면 각 태그에 `aliases: string[]` 포함
- `actor-tags:list` — 동일

### Step 3: API (renderer)
**파일**: `src/renderer/src/api.ts`
- `workTagAliasesApi` 추가: `{ list, create, delete }`
- `actorTagAliasesApi` 추가: `{ list, create, delete }`

### Step 4: TagLinkModal 좌측 UI 변경
**파일**: `src/renderer/src/components/TagLinkModal.tsx`

현재 좌측 (223~240줄):
```tsx
<div className="space-y-0.5">
  {g.tags.map(tag => (
    <button className="w-full text-left px-2 py-1 ...">
      <span className="truncate">{tag.name}</span>
      {hasChildren(tag.id) && <span className="text-yellow-400">●</span>}
    </button>
  ))}
</div>
```

변경 후:
```tsx
<div className="flex flex-wrap gap-1">
  {g.tags.map(tag => (
    <button className="px-2 py-0.5 rounded text-xs ...">
      {tag.name}
      {hasChildren(tag.id) && <span className="text-yellow-400 ml-0.5">●</span>}
    </button>
  ))}
</div>
```

- 기존 카테고리별 인라인 추가 기능은 유지
- 선택 시 `bg-blue-600 text-white`, 비선택 시 `bg-gray-700 text-gray-300`

### Step 5: TagAliasModal 생성
**파일**: `src/renderer/src/components/TagAliasModal.tsx` (신규)

구조:
- Props: `{ type: 'work' | 'actor'; onClose: () => void }`
- 좌측 패널 (w-[280px]):
  - 검색 입력 + 태그 목록 (뱃지 형태, 카테고리별 그룹)
  - 별칭이 있는 태그에 ● 표시 (별칭 개수 조회 필요)
  - 클릭 시 우측에 해당 태그의 별칭 표시
- 우측 패널:
  - 선택된 태그명 표시 + 별칭 개수
  - 별칭 추가: 입력창 + 추가 버튼 (쉼표 구분 다중 입력 지원)
  - 별칭 목록: 각 별칭 텍스트 + ✕ 삭제 버튼

### Step 6: Tags 페이지에 버튼 추가
**파일**: `src/renderer/src/pages/Tags.tsx`
- `import TagAliasModal` 추가
- `showTagAliasModal` 상태 추가
- "태그 연결" 버튼 옆에 "태그 별칭" 버튼 추가 (203줄 근처)
- 모달 렌더링 추가

### Step 7: 자동 매칭 로직 변경
**파일**: `src/renderer/src/components/WorkForm.tsx`

태그 로드 시 aliases 포함:
- 122줄: `workTagsApi.list()` → `workTagsApi.list({ withAliases: true })` 로 변경
- Tag 타입에 `aliases?: string[]` 추가 (`src/renderer/src/types.ts`)

자동 매칭 로직 변경 (4곳):
- 828줄 (타이틀 매칭 버튼): `allTags.filter(t => text.includes(t.name))` → `allTags.filter(t => text.includes(t.name) || t.aliases?.some(a => text.includes(a)))`
- 838줄 (타이틀 onPaste): 동일 패턴 적용
- 855줄 (코멘트 매칭 버튼): 동일
- 865줄 (코멘트 onPaste): 동일

**파일**: `src/renderer/src/components/ActorForm.tsx`
- 태그 로드 시 aliases 포함
- 501줄 (코멘트 매칭 버튼): 동일 패턴 적용
- 512줄 (코멘트 onPaste): 동일 패턴 적용
