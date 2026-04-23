# 동영상 파일 관리 프로그램 - 기술 리서치

> 목표: JavaScript/TypeScript 단일 언어로 빠르게 개발 가능한 구성

---

## 1. 앱 프레임워크: Electron

| 항목 | 내용 |
|---|---|
| 언어 | JavaScript/TypeScript (프론트 + 백엔드 모두) |
| 구조 | Main 프로세스(Node.js) + Renderer 프로세스(웹) |
| 장점 | 웹 개발 경험만으로 데스크톱 앱 제작 가능, 생태계 최대 |
| 단점 | 바이너리 크기 ~150MB, 메모리 300MB+ |

Rust 학습 없이 JS/TS만으로 파일 시스템 접근, DB 조작, UI 모두 구현 가능.
`electron-builder`로 패키징/배포도 간단.

---

## 2. 프론트엔드: React + Tailwind CSS

| 도구 | 역할 |
|---|---|
| React | UI 컴포넌트 구성 |
| Tailwind CSS | 빠른 스타일링 (CSS 작성 최소화) |
| TanStack Table | 데이터 테이블 (정렬, 필터) |
| react-virtuoso | 대량 썸네일 가상 스크롤 |

별도 UI 프레임워크(Ant Design 등) 대신 Tailwind로 가볍게 구성.

---

## 3. 데이터베이스: SQLite (better-sqlite3)

| 항목 | 내용 |
|---|---|
| 라이브러리 | `better-sqlite3` |
| 특징 | 동기식 API, 빠른 속도, Node.js 네이티브 바인딩 |
| ORM | 사용하지 않음 (SQL 직접 작성) |

- 단일 파일 DB, 설정 불필요
- 동기식 API라 코드가 단순 (`db.prepare(sql).all()`)
- ORM 없이 SQL 직접 작성이 이 규모에서는 가장 간단

---

## 4. 이미지 관리

- 작품 표지, 배우 사진은 사용자가 직접 등록
- 이미지 파일은 앱 데이터 폴더에 저장, DB에는 경로만 기록
- 저장 경로: `data/images/works/`, `data/images/actors/`

---

## 5. 파일 관리: 수동 스캔 방식

파일 시스템 감시(watcher)는 복잡도가 높으므로 **수동 스캔** 방식 채택:
- 사용자가 폴더를 지정하면 해당 폴더의 동영상 파일 목록을 스캔
- Node.js `fs.readdir`로 구현 (간단)
- 필요 시 나중에 `chokidar` 워처 추가 가능

---

## 6. 검색: SQL WHERE + LIKE

이 규모(수천~수만 건)에서는 FTS5 없이 충분:
- 텍스트: `WHERE title LIKE '%keyword%'` 또는 `product_number LIKE '%keyword%'`
- 범위: `WHERE release_date BETWEEN ? AND ?`
- 태그: JOIN으로 필터링
- 인덱스만 잘 걸면 충분한 성능

---

## 7. 권장 기술 스택 요약

| 레이어 | 선택 | 근거 |
|---|---|---|
| **앱 프레임워크** | Electron | JS만으로 개발, 생태계 최대 |
| **프론트엔드** | React + Tailwind CSS | 빠른 UI 개발, 컴포넌트 풍부 |
| **데이터베이스** | SQLite (better-sqlite3) | 단일 파일, 동기 API, ORM 불필요 |
| **이미지** | 사용자 직접 등록 | 작품 표지, 배우 사진 |
| **파일 관리** | 수동 스캔 (fs.readdir) | 단순, 안정적 |
| **검색** | SQL WHERE + LIKE + 인덱스 | 이 규모에서 충분 |

---

## 8. 프로젝트 구조안

```
amng/
├── package.json
├── electron/
│   ├── main.ts          # Electron 메인 프로세스
│   ├── preload.ts       # IPC 브릿지
│   └── db.ts            # SQLite DB 접근 (better-sqlite3)
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── WorkList.tsx      # 작품 목록 (썸네일 그리드)
│   │   ├── WorkDetail.tsx    # 작품 상세
│   │   ├── ActorList.tsx     # 배우 목록
│   │   ├── ActorDetail.tsx   # 배우 상세
│   │   ├── SearchBar.tsx     # 검색
│   │   └── TagManager.tsx    # 태그 관리
│   └── pages/
│       ├── Works.tsx
│       └── Actors.tsx
└── data/
    ├── app.db            # SQLite DB 파일
    └── images/
        ├── works/        # 작품 표지 이미지
        └── actors/       # 배우 사진
```

---

## 9. 데이터베이스 스키마

```sql
-- 작품
CREATE TABLE works (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    cover_path TEXT,
    product_number TEXT UNIQUE,
    title TEXT,
    release_date DATE,
    rating REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 배우
CREATE TABLE actors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_path TEXT,
    name TEXT NOT NULL,
    birthday DATE,
    rating REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 작품 태그 마스터
CREATE TABLE work_tags_master (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- 배우 태그 마스터
CREATE TABLE actor_tags_master (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- 작품-배우 (다대다)
CREATE TABLE work_actors (
    work_id INTEGER REFERENCES works(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES actors(id) ON DELETE CASCADE,
    PRIMARY KEY (work_id, actor_id)
);

-- 작품-태그 (다대다)
CREATE TABLE work_tags (
    work_id INTEGER REFERENCES works(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES work_tags_master(id) ON DELETE CASCADE,
    PRIMARY KEY (work_id, tag_id)
);

-- 배우-태그 (다대다)
CREATE TABLE actor_tags (
    actor_id INTEGER REFERENCES actors(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES actor_tags_master(id) ON DELETE CASCADE,
    PRIMARY KEY (actor_id, tag_id)
);

-- 인덱스
CREATE INDEX idx_works_release_date ON works(release_date);
CREATE INDEX idx_works_rating ON works(rating);
CREATE INDEX idx_works_product_number ON works(product_number);
CREATE INDEX idx_actors_birthday ON actors(birthday);
CREATE INDEX idx_actors_rating ON actors(rating);
```

---

## 10. 개발 순서 (권장)

1. Electron + React + Tailwind 프로젝트 초기 세팅
2. SQLite DB 스키마 생성 및 CRUD 함수 작성
3. 작품 목록/상세 화면 (썸네일 그리드)
4. 배우 목록/상세 화면
5. 검색 기능
6. 태그 관리
7. 폴더 스캔 + 이미지 등록 기능
8. 별점 기능
