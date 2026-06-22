# Tags (태그 시스템)

## 개요
작품 태그, 배우 태그를 각각 독립적으로 관리하는 시스템. 카테고리 분류, 태그 연결(링크) 기능 포함. 별도 탭은 없고 Works/Actors 탭의 폼과 검색에서 사용.

## 파일 구조
- **API**: `src/renderer/src/api.ts` (workTagsApi, actorTagsApi, workTagCategoriesApi, actorTagCategoriesApi, workTagLinksApi, actorTagLinksApi)
- **IPC 핸들러**: `src/main/ipc-tags.ts`
- **컴포넌트**: TagSelector (태그 선택), TagLinkModal (태그 연결 관리)

## 태그 CRUD

### 작품 태그
| API 함수 | IPC 채널 | 설명 |
|----------|----------|------|
| `workTagsApi.list(withCount)` | `work-tags:list` | 태그 목록 (사용횟수 포함 옵션) |
| `workTagsApi.create(name)` | `work-tags:create` | 태그 생성 |
| `workTagsApi.update(id, name)` | `work-tags:update` | 태그 이름 수정 |
| `workTagsApi.delete(id)` | `work-tags:delete` | 태그 삭제 |

### 배우 태그
| API 함수 | IPC 채널 | 설명 |
|----------|----------|------|
| `actorTagsApi.list(withCount)` | `actor-tags:list` | 태그 목록 |
| `actorTagsApi.create(name)` | `actor-tags:create` | 태그 생성 |
| `actorTagsApi.update(id, name)` | `actor-tags:update` | 태그 이름 수정 |
| `actorTagsApi.delete(id)` | `actor-tags:delete` | 태그 삭제 |

## 태그 카테고리 CRUD

### 작품 태그 카테고리
| API 함수 | IPC 채널 | 설명 |
|----------|----------|------|
| `workTagCategoriesApi.list()` | `work-tag-categories:list` | 카테고리 목록 (tag_count 포함) |
| `workTagCategoriesApi.create(name)` | `work-tag-categories:create` | 카테고리 생성 |
| `workTagCategoriesApi.update(id, name)` | `work-tag-categories:update` | 카테고리 수정 |
| `workTagCategoriesApi.delete(id)` | `work-tag-categories:delete` | 카테고리 삭제 (태그는 미분류로) |
| `workTagCategoriesApi.reorder(ids)` | `work-tag-categories:reorder` | 카테고리 순서 변경 |
| `workTagCategoriesApi.setTagCategory(tagId, categoryId)` | `work-tag-categories:setTagCategory` | 태그의 카테고리 변경 |

### 배우 태그 카테고리 (동일 구조)
| API 함수 | IPC 채널 |
|----------|----------|
| `actorTagCategoriesApi.list()` | `actor-tag-categories:list` |
| `actorTagCategoriesApi.create(name)` | `actor-tag-categories:create` |
| `actorTagCategoriesApi.update(id, name)` | `actor-tag-categories:update` |
| `actorTagCategoriesApi.delete(id)` | `actor-tag-categories:delete` |
| `actorTagCategoriesApi.reorder(ids)` | `actor-tag-categories:reorder` |
| `actorTagCategoriesApi.setTagCategory(tagId, categoryId)` | `actor-tag-categories:setTagCategory` |

## 태그 연결 (Links)

부모-자식 태그 연결. 부모 태그 선택 시 자식 태그 자동 추가용.

| API 함수 | IPC 채널 | 설명 |
|----------|----------|------|
| `workTagLinksApi.list()` | `work-tag-links:list` | 작품 태그 연결 목록 |
| `workTagLinksApi.set(parentId, childIds)` | `work-tag-links:set` | 연결 설정 |
| `actorTagLinksApi.list()` | `actor-tag-links:list` | 배우 태그 연결 목록 |
| `actorTagLinksApi.set(parentId, childIds)` | `actor-tag-links:set` | 연결 설정 |

## 관련 DB 테이블

| 테이블 | 역할 |
|--------|------|
| `work_tags_master` | 작품 태그 마스터 (name, category_id) |
| `work_tag_categories` | 작품 태그 카테고리 (name, sort_order) |
| `work_tags` | 작품-태그 연결 (work_id, tag_id, is_rep) |
| `work_tag_links` | 작품 태그 부모-자식 연결 |
| `actor_tags_master` | 배우 태그 마스터 (name, category_id) |
| `actor_tag_categories` | 배우 태그 카테고리 (name, sort_order) |
| `actor_tags` | 배우-태그 연결 (actor_id, tag_id, is_rep) |
| `actor_tag_links` | 배우 태그 부모-자식 연결 |

## 주요 쿼리

### work-tags:list (withCount)
```sql
SELECT t.*,
  COUNT(wt.work_id) AS total_count,
  SUM(CASE WHEN wt.is_rep = 1 THEN 1 ELSE 0 END) AS rep_count,
  c.name AS category_name, COALESCE(c.sort_order, 999999) AS category_sort_order
FROM work_tags_master t
LEFT JOIN work_tags wt ON wt.tag_id = t.id
LEFT JOIN work_tag_categories c ON c.id = t.category_id
GROUP BY t.id ORDER BY t.name
```
