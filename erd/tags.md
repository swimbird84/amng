# 태그 도메인 ERD

```mermaid
erDiagram
    work_tag_categories["work_tag_categories - 작품 태그 카테고리"] {
        int id PK "카테고리 ID"
        text name UK "카테고리명"
        int sort_order "정렬 순서"
    }
    actor_tag_categories["actor_tag_categories - 배우 태그 카테고리"] {
        int id PK "카테고리 ID"
        text name UK "카테고리명"
        int sort_order "정렬 순서"
    }
    work_tags_master["work_tags_master - 작품 태그 마스터"] {
        int id PK "태그 ID"
        text name UK "태그명"
        int category_id FK "카테고리 ID"
        text created_at "등록일시"
    }
    actor_tags_master["actor_tags_master - 배우 태그 마스터"] {
        int id PK "태그 ID"
        text name UK "태그명"
        int category_id FK "카테고리 ID"
        text created_at "등록일시"
    }
    work_tags["work_tags - 작품-태그 연결"] {
        int work_id PK,FK "작품 ID"
        int tag_id PK,FK "태그 ID"
        int is_rep "대표 태그 여부 (0/1)"
    }
    actor_tags["actor_tags - 배우-태그 연결"] {
        int actor_id PK,FK "배우 ID"
        int tag_id PK,FK "태그 ID"
        int is_rep "대표 태그 여부 (0/1)"
    }
    work_tag_links["work_tag_links - 작품 태그 연결"] {
        int id PK "링크 ID"
        int parent_tag_id FK "부모 태그 ID"
        int child_tag_id FK "자식 태그 ID"
    }
    actor_tag_links["actor_tag_links - 배우 태그 연결"] {
        int id PK "링크 ID"
        int parent_tag_id FK "부모 태그 ID"
        int child_tag_id FK "자식 태그 ID"
    }
    works["works - 작품"] {
        int id PK "작품 ID"
        text title "제목"
    }
    actors["actors - 배우"] {
        int id PK "배우 ID"
        text name "이름"
    }

    work_tag_categories ||--o{ work_tags_master : "소속 태그"
    actor_tag_categories ||--o{ actor_tags_master : "소속 태그"
    works ||--o{ work_tags : "태그 부여"
    work_tags_master ||--o{ work_tags : "사용처"
    actors ||--o{ actor_tags : "태그 부여"
    actor_tags_master ||--o{ actor_tags : "사용처"
    work_tags_master ||--o{ work_tag_links : "부모-자식"
    actor_tags_master ||--o{ actor_tag_links : "부모-자식"
```
