# 태그 별칭(Alias) 기능

## 개요
태그 자동 매칭 시 태그 이름뿐 아니라 등록된 별칭(동의어)도 함께 검색하여 매칭하는 기능.

예: 태그 `NTR` → 별칭 `寝取られ`, `네토라레` → 텍스트에 `寝取られ`가 있으면 `NTR` 태그 자동 매칭

## DB 설계 (방법 1: 별칭 테이블)

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

### Tags 페이지 — 태그 선택 시 우측 상세 영역에 별칭 관리

```
┌─ 좌측: 태그 목록 ──────────┐ ┌─ 우측: 선택된 태그 상세 ──────┐
│ [NTR]  (12)                │ │ 별칭: 寝取られ, 네토라레  [+]  │
│ [근친]  (5)                │ │                              │
│ [여교사] (8)               │ │ 작품 목록...                  │
└────────────────────────────┘ └──────────────────────────────┘
```

- 태그 선택 시 별칭 목록 표시
- `+` 버튼 또는 입력창으로 별칭 추가 (쉼표/엔터로 여러 개 동시 추가)
- 각 별칭 옆 `✕`로 삭제

### 대안: 별도 모달 또는 우클릭 메뉴 — 미정

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
- WorkForm: 타이틀 태그 자동 매칭 버튼
- WorkForm: 코멘트 태그 자동 매칭 버튼
- ActorForm: 코멘트 태그 자동 매칭 버튼
- WorkForm: onPaste 시 태그 자동 매칭

## IPC 추가 필요
- `work-tag-aliases:list(tagId)` / `actor-tag-aliases:list(tagId)`
- `work-tag-aliases:create(tagId, alias)` / `actor-tag-aliases:create(tagId, alias)`
- `work-tag-aliases:delete(id)` / `actor-tag-aliases:delete(id)`
- 태그 목록 조회 시 aliases 포함 옵션 (자동 매칭용)
