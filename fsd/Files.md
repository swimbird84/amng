# 파일 탭 — 작품 폴더/파일 관리

## 개요

DB에 등록된 작품 파일 경로(DB 기반)를 트리 구조로 시각화하고, 폴더명/파일명 변경 및 삭제를 할 수 있는 기능.
실제 드라이브를 탐색하지 않고, DB에 저장된 경로만으로 트리를 구성한다.
탭 위치: 대회 다음 (홈 / 대시보드 / 작품 / 배우 / 레이블 / 대회 / **파일**)

---

## 폴더 구성 기준

### 필수 구조 (고정)

```
[배우명 배우생일]\[발매일 품번]\작품파일 + 썸네일
```

예시:
```
스즈무라 아이리 1996-01-01\
  └─ 2026-10-05 ABF-991\
       ├─ ABF-991.mp4
       └─ ABF-991.jpg
```

- **배우 폴더** (Level 1): `배우명 배우생일` 형식 → actors 레코드와 1:1 매핑
- **작품 폴더** (Level 2): `발매일 품번` 형식 → works 레코드와 1:1 매핑
- 작품파일과 썸네일은 같은 파일명으로 작품 폴더에 위치

### 선택 구조 (가끔 있음)

```
[컨셉/레이블명]\[배우명 배우생일]\[발매일 품번]\파일들
```

- 상위에 컨셉/레이블로 묶는 폴더가 추가되는 경우. 필수 아님.

---

## 기능

### 1. 폴더 트리 보기 (DB 기반)
- `work_files` 테이블에서 `type = 'local'`인 `file_path` 전체 조회
- 폴더 경로를 추출하여 드라이브별/폴더별 계층 트리 구조로 표시
- 각 폴더 노드에 하위 파일 수 표시
- 폴더 펼침/접기 가능

### 2. 파일 목록 보기 (DB 등록 파일만)
- 폴더 클릭(또는 펼침) 시 해당 폴더에 직접 속한 DB 등록 파일 표시
- 표시 정보: 파일명, 연결된 작품 (product_number 또는 title)
- DB에 등록되지 않은 실제 디스크 파일은 표시하지 않음

### 3. 폴더명 변경
- 트리에서 폴더 선택 → 새 이름 입력 → 변경 실행
- 실제 파일시스템의 폴더명 변경 (`fs.renameSync`)
- DB의 관련 경로 일괄 업데이트:
  - `work_files.file_path` — `REPLACE(file_path, oldPrefix, newPrefix)`
  - `works.file_path` — 동일 패턴
  - `works.cover_path` — 해당 경로 포함 시 동일 패턴

### 4. 파일명 변경
- 파일 목록에서 파일 선택 → 새 이름 입력 → 변경 실행
- 실제 파일시스템의 파일명 변경 (`fs.renameSync`)
- DB 업데이트:
  - `work_files.file_path` — 해당 행의 경로를 새 경로로 UPDATE
  - `works.file_path` — 해당 작품의 대표 경로가 변경된 파일이면 함께 UPDATE

### 5. 존재하지 않는 폴더/파일 체크
- 트리 구성 시 각 폴더 경로의 실제 존재 여부를 `fs.existsSync`로 확인
- 파일 목록에서도 각 파일의 존재 여부 확인
- 존재하지 않는 항목은 시각적으로 구분 (빨간 텍스트 또는 경고 아이콘)
- 없는 폴더/파일은 이름 변경/삭제 불가 (버튼 비활성화)

### 6. 폴더 삭제 (폴더 레벨별 동작)

폴더 구조가 데이터 모델과 1:1 매핑되므로, 삭제도 레벨별로 동작이 다름.
개별 파일 삭제 버튼은 없음 — 폴더 단위로만 삭제.

**작품 폴더 삭제** (Level 2 — `발매일 품번`):
- 디스크: 해당 폴더를 휴지통으로 이동 (`shell.trashItem`)
- DB: `works` 삭제 + `work_files` 삭제 + 대회 연관 데이터 정리
- 기존 `works:delete` + `shell:trashFolders` 로직 통합

**배우 폴더 삭제** (Level 1 — `배우명 배우생일`):
- 디스크: 배우 폴더 전체를 휴지통으로 이동 (하위 작품 폴더 포함)
- DB: 하위 모든 작품 삭제 + 배우 soft delete (`is_deleted = 1`)
- 영향 범위가 크므로 확인 모달 필수

---

## 수정 범위

### 백엔드 — IPC 핸들러 신규 (`ipc-files.ts`)

| 핸들러 | 파라미터 | 동작 |
|--------|---------|------|
| `folder:tree` | 없음 | DB에서 로컬 파일 경로 전체 조회 → 트리 구조 반환 (폴더별 파일 목록 + 존재 여부 포함) |
| `folder:rename` | `oldPath`, `newPath` | `fs.renameSync` → 성공 시 DB 경로 일괄 REPLACE |
| `folder:delete` | `folderPath`, `level` | level에 따라 작품 폴더 삭제 또는 배우 폴더+작품 일괄 삭제 |
| `file:rename` | `oldPath`, `newPath` | `fs.renameSync` → 성공 시 해당 `work_files` 행 + `works.file_path` UPDATE |

**`folder:tree` 상세 흐름**:
1. `SELECT wf.id, wf.work_id, wf.file_path, w.product_number, w.title FROM work_files wf JOIN works w ON w.id = wf.work_id WHERE wf.type = 'local'` 전체 조회
2. 각 `file_path`에서 디렉토리 부분 추출 (`path.dirname`), 파일명 추출 (`path.basename`)
3. 중복 제거 후 계층 트리 구조로 변환
4. 각 폴더 노드마다 `fs.existsSync(path)`로 존재 여부 체크
5. 각 파일마다 `fs.existsSync(file_path)`로 존재 여부 체크
6. 폴더별 파일 수 집계 + 파일 목록 포함

**`folder:rename` 상세 흐름**:
1. `fs.renameSync(oldPath, newPath)` — 파일시스템 변경
2. 실패 시 에러 반환, DB 변경 없음
3. 성공 시:
   - `UPDATE work_files SET file_path = REPLACE(file_path, ?, ?) WHERE file_path LIKE ?||'%'`
   - `UPDATE works SET file_path = REPLACE(file_path, ?, ?) WHERE file_path LIKE ?||'%'`
   - `UPDATE works SET cover_path = REPLACE(cover_path, ?, ?) WHERE cover_path LIKE ?||'%'`

**`folder:delete` 상세 흐름**:

작품 폴더 삭제 (level 2):
1. 해당 폴더 경로에 매칭되는 `work_files` 조회 → `work_id` 추출
2. 진행 중 대회 참가 여부 체크 (blocked 판단)
3. `shell.trashItem(folderPath)` — 디스크에서 휴지통 이동
4. 성공 시: `works` 삭제 + 연관 데이터 정리 (기존 `works:delete` 로직 재사용)

배우 폴더 삭제 (level 1):
1. 하위 모든 작품 폴더의 `work_id` 추출
2. 각 작품에 대해 진행 중 대회 참가 여부 체크
3. `shell.trashItem(folderPath)` — 배우 폴더 전체 휴지통 이동
4. 성공 시: 하위 모든 `works` 삭제 + 배우 soft delete
5. 확인 모달에서 삭제 대상 작품 수 표시 필수

**`file:rename` 상세 흐름**:
1. `fs.renameSync(oldPath, newPath)` — 파일시스템 변경
2. 실패 시 에러 반환, DB 변경 없음
3. 성공 시:
   - `UPDATE work_files SET file_path = ? WHERE file_path = ?`
   - `UPDATE works SET file_path = ? WHERE file_path = ?` (대표 경로인 경우)

### API 함수 (`api.ts`)

```ts
export const folderApi = {
  tree: () => api.invoke('folder:tree'),
  renameFolder: (oldPath: string, newPath: string) => api.invoke('folder:rename', oldPath, newPath),
  deleteFolder: (folderPath: string, level: 1 | 2) => api.invoke('folder:delete', folderPath, level),
  renameFile: (oldPath: string, newPath: string) => api.invoke('file:rename', oldPath, newPath),
}
```

### 프론트엔드 — 신규 컴포넌트

| 파일 | 용도 |
|------|------|
| `src/renderer/src/pages/Files.tsx` | 파일 탭 메인 페이지 (트리 + 파일 목록 + 이름 변경/삭제 UI) |

### 기존 파일 수정

| 파일 | 변경 내용 |
|------|----------|
| `App.tsx` | 탭 목록에 `files` 추가 (대회 다음 위치) |
| `ipc.ts` | `registerFilesHandlers()` 호출 추가 |

---

## 트리 데이터 구조

```ts
interface FileInfo {
  id: number              // work_files.id
  workId: number           // 연결된 작품 ID
  fileName: string         // 파일명 (path.basename)
  filePath: string         // 전체 경로
  workLabel: string        // 작품 표시명 (product_number || title)
  exists: boolean          // 실제 파일시스템에 존재하는지
}

interface FolderNode {
  name: string             // 폴더명
  path: string             // 전체 경로
  fileCount: number        // 이 폴더에 직접 속한 파일 수
  exists: boolean          // 실제 파일시스템에 존재하는지
  files: FileInfo[]        // 이 폴더에 속한 파일 목록
  children: FolderNode[]   // 하위 폴더
}
```

`folder:tree` 반환값: `FolderNode[]` (루트 레벨 = 드라이브 or 최상위 폴더)

---

## UI 구조 (간략)

```
┌───────────────────────────────────────────────────────────────┐
│  🔄 새로고침                                    총 48개 폴더  │
│                                                               │
│  ▼ 📁 D:\Videos                                              │
│    ▼ 📁 스즈무라 아이리 1996-01-01 ─── (3) [수정] [삭제]      │
│      ▼ 📁 2026-10-05 ABF-991 ────── (2) [수정] [삭제]        │
│        │  ABF-991.mp4  ← ABF-991      [수정]                 │
│        │  ABF-991.jpg  ← (썸네일)      [수정]                 │
│      ▶ 📁 2026-09-01 CDE-123 ────── (1) [수정] [삭제]        │
│    ▶ 📁 다른배우 2000-05-15 ───────── (5) [수정] [삭제]       │
│    ▶ 📁⚠️ 삭제된폴더 ──────────────── (3) [경로 없음]        │
│  ▶ 📁 E:\Archive ──────────────────── (5) [수정] [삭제]       │
└───────────────────────────────────────────────────────────────┘
```

- 폴더 펼치면 하위 폴더 + 파일 목록 표시
- 파일 옆에 연결된 작품명 표시
- `[수정]` — 이름 변경 텍스트 버튼 (폴더/파일 공용, 아이콘 사용 안 함)
- `[삭제]` — 폴더 삭제 텍스트 버튼 (폴더에만 표시, 파일에는 없음)
  - 배우 폴더 삭제 시: "하위 N개 작품이 모두 삭제됩니다" 확인 모달
  - 작품 폴더 삭제 시: "작품과 파일이 삭제됩니다" 확인 모달
- `⚠️` — 존재하지 않는 폴더/파일 경고 (수정/삭제 비활성화)

---

## 고려 사항

- **DB 기반 트리**: 실제 드라이브를 탐색하지 않고 DB에 저장된 경로만으로 트리 구성
- **조회는 DB 등록 파일만**: 디스크에 있지만 DB에 없는 파일은 표시하지 않음
- **존재 여부 체크**: `fs.existsSync`로 확인. 없는 항목은 시각적 경고 + 수정/삭제 비활성화
- **폴더 레벨별 삭제**: 배우 폴더(Level 1) = 배우+작품 일괄 삭제, 작품 폴더(Level 2) = 작품 삭제. 개별 파일 삭제는 없음
- 파일시스템 변경 실패 시 DB는 변경하지 않음 (파일시스템 먼저 → 성공 시 DB)
- 경로 구분자: Windows 환경이므로 `\` 또는 `/` 혼용 가능성 고려 (정규화 필요)
- 폴더명 변경 시 하위 모든 경로가 영향받으므로 `LIKE oldPath||'%'` 패턴으로 일괄 처리
- 삭제 시 진행 중 대회 참가 여부 체크 필수 (blocked 판단)

---

## 작업량 요약

| 구분 | 파일 수 | 난이도 |
|------|--------|--------|
| IPC 핸들러 신규 (`ipc-files.ts`) | 1개 (4개 핸들러) | 중간~높음 |
| API 함수 (`api.ts`) | 1곳 추가 | 쉬움 |
| 페이지 컴포넌트 (`Files.tsx`) | 1개 신규 | 중간~높음 (트리 + 파일 목록 + 삭제 UI) |
| 기존 파일 수정 (`App.tsx`, `ipc.ts`) | 2곳 | 쉬움 |
