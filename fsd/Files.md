# 파일 탭 — 작품 폴더/파일 관리

## 개요

DB에 등록된 작품 파일 경로(DB 기반)를 트리 구조로 시각화하고, 폴더명/파일명 변경 및 삭제를 할 수 있는 기능.
실제 드라이브를 탐색하지 않고, DB에 저장된 경로만으로 트리를 구성한다.
탭 위치: 대회 다음 (홈 / 대시보드 / 작품 / 배우 / 레이블 / 대회 / **파일**)

**레이아웃**: 좌우 반분할
- 왼쪽: 폴더 트리
- 오른쪽: 임시 폴더 영역

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

## 구현 완료 기능 (왼쪽 — 폴더 트리)

### 1. 폴더 트리 보기 (DB 기반)
- `work_files` 테이블에서 `type = 'local'`인 `file_path` 전체 조회
- 폴더 경로를 추출하여 드라이브별/폴더별 계층 트리 구조로 표시
- 괄호 안 숫자: 직계 하위 폴더 수 + 직접 파일 수
- 폴더 펼침/접기 가능

### 2. 파일 목록 보기 (DB 등록 파일만)
- 폴더 펼침 시 해당 폴더에 직접 속한 DB 등록 파일 표시
- 표시 정보: 파일명, 연결된 작품 (product_number 또는 title)

### 3. 폴더/파일 이름 변경 (인라인)
- [수정] 클릭 → 같은 행에서 이름이 input으로 변경, 버튼이 [변경][취소]로 교체
- `fs.renameSync` → 성공 시 DB 경로 일괄 업데이트

### 4. 폴더 삭제 (레벨별 동작)
- 작품 폴더 삭제: 휴지통 이동 + works/work_files 삭제 + 대회 연관 데이터 정리
- 배우 폴더 삭제: 휴지통 이동 + 하위 작품 전체 삭제 + 배우 soft delete
- 진행 중 대회 참가 여부 체크 (blocked 판단)

### 5. 배우/작품 매칭
- 폴더명에서 배우(`배우명 YYYY-MM-DD`) / 작품(`YYYY-MM-DD 품번`) 패턴 추출
- 배우 매칭: `actors.name` + `actors.aliases` 모두 검색 → 현재 이름으로 표시
- 작품 매칭: `works.product_number`로 검색 (전체 works Map 일괄 로딩)
- 매칭 텍스트: `cursor-pointer hover:underline`, 클릭 시 상세 모달 표시

### 6. 호버 툴팁
- 매칭 텍스트 위에 400ms 호버 시 `CardTooltip` 표시 (showCover 포함)
- 툴팁 범위 = 클릭 범위 (매칭 텍스트에만 적용)

### 7. 존재하지 않는 폴더/파일 체크 (지연 로딩)
- 초기 로딩 시 존재 여부 체크 안 함 (성능)
- 폴더 펼칠 때 해당 폴더 + 파일 경로만 `folder:checkExists`로 체크
- 없는 항목은 빨간 텍스트 + ⚠️ 표시, 수정/삭제 비활성화

### 8. 검색
- 검색 조건 셀렉트박스: **배우** / **폴더** 두 가지
- **배우 검색**: `matchedActorName` 매칭 → 해당 배우 폴더의 하위 작품/파일 전체 보존
- **폴더 검색**: `node.name` 매칭 (품번이 폴더명에 포함되어 커버)
- 프론트에서 트리 데이터 필터링 (백엔드 호출 불필요)
- 검색 조건은 `localStorage`에 저장 (`files:searchField`)

### 9. 정렬
- 셀렉트 박스 (이름 / 항목 수) + ↑↓ 방향 버튼
- 프론트에서 `FolderNode.children` 재정렬
- `localStorage` 저장 (`files:sortBy`, `files:sortDir`)

### 10. 상태 유지 (localStorage)
- 열린 폴더 목록: `files:openFolders`
- 스크롤 위치: `files:scrollTop` (200ms 디바운스)
- 정렬: `files:sortBy`, `files:sortDir`
- 검색 조건: `files:searchField`

### 11. UI
- 전체 `cursor-default`, 매칭 텍스트만 `cursor-pointer`
- [수정] / [삭제] 텍스트 버튼 (아이콘 사용 안 함), 인라인 수정
- 파일에는 [삭제] 버튼 없음 — 폴더 단위로만 삭제
- 상단 1줄: [전체 펼치기][전체 접기][🔄 새로고침] 총 N개 폴더
- 상단 2줄: [정렬▽][↑] [검색조건▽][검색어]
- 새로고침: SVG 리프레시 아이콘 (p-1.5)

---

## 구현 완료 기능 (오른쪽 — 임시 폴더)

### 12. 임시 폴더 지정
- 폴더 선택 다이얼로그로 경로 지정
- `localStorage` 저장 (`files:tempFolder`)

### 13. 임시 폴더 파일 목록 보기
- 동영상 파일을 아이콘 그리드로 표시 (4열)
- 같은 파일명 이미지 → 썸네일로 사용, 없으면 📹 아이콘
- 썸네일 비동기 점진적 로딩 (파일 목록 먼저 표시, 썸네일은 백그라운드)
- 비동기 폴더 스캔 (`fs.promises.readdir`) — 외장 HDD 미로드 시 멈추지 않음

### 14. 파일 다중 선택
- **클릭**: 단일 선택
- **Ctrl + 클릭**: 개별 토글
- **Shift + 클릭**: 범위 선택
- **마우스 드래그**: 영역 선택
- 미선택 파일 드래그 시 자동 선택

### 15. 파일 조작
- **더블클릭**: 동영상 재생 (`shell.openPath`)
- **우클릭 컨텍스트 메뉴**:
  - 복사 (N개) — 파일명(확장자 제외) 클립보드 복사, 다중 시 줄바꿈
  - 수정 — 단일 선택 시만 활성화, 동일 이미지 함께 변경
  - 삭제 — 다중 가능, 동일 이미지 함께 삭제
- **아이콘 좌측 상단**: 클립보드 복사 SVG 아이콘 (호버 시 표시)
- **아이콘 좌측 하단**: 웹 검색 SVG 돋보기 아이콘 (호버 시 표시) → `shell.openExternal(url + baseName)`

### 16. 웹 검색 URL
- 🔗 링크 아이콘 버튼 클릭 → URL 입력 모달 (즐겨찾기 저장/선택/삭제)
- URL 즐겨찾기는 DB 저장 (`search_urls` 테이블)
- 활성 URL은 `localStorage` 저장 (`files:searchUrl`)

### 17. 파일명 문자열 일괄 제거
- 상단 문자열 input에 제거할 문자열 입력 → [제거] 버튼 클릭
- 임시 폴더 내 모든 파일(동영상+이미지)에서 해당 문자열을 파일명에서 제거
- 입력값 `localStorage` 저장 (`files:removeString`)
- 제거 완료 후 파일 목록 새로고침

### 18. 임시 폴더 탐색기 열기
- 📁 폴더 아이콘 버튼 (🔄 새로고침과 폴더선택 사이)
- 클릭 시 `shell.openPath(folderPath)` → Windows 탐색기에서 현재 임시 폴더 열기

### 19. 커버 이미지 자동 다운로드
- 검색 URL 사이트에서 품번 페이지를 파싱하여 커버 이미지를 자동 다운로드
- 대상: `<a class="bigImage"><img src="...">` 요소의 이미지
- 다운로드된 이미지는 임시 폴더에 `품번.jpg`로 저장

**일괄 다운로드:**
- 상단 아이콘 버튼: 🔗 버튼과 🔄 버튼 사이에 다운로드 SVG 아이콘 (↓ + 받침대)
- 클릭 시 이미지 없는 전체 파일에 대해 순차 다운로드
- 완료 후 파일 목록 새로고침

**개별 다운로드 (아이콘 모드):**
- 이미지 없는 파일의 썸네일 우측 상단에 다운로드 아이콘 (📋 복사 버튼 오른쪽)
- 클릭 시 해당 파일만 다운로드

**개별 다운로드 (목록 모드):**
- 용량 컬럼 뒤에 기능 컬럼 추가
- 기능 컬럼에 아이콘 3개: 복사 | 다운로드 | 브라우저이동
- 복사: 품번 클립보드 복사
- 다운로드: 해당 품번 커버 이미지 다운로드
- 브라우저이동: `shell.openExternal(searchUrl + baseName)`

### 20. 드래그 앤 드롭 — 임시 폴더 → 트리 배우 폴더
- 파일을 드래그하여 왼쪽 트리의 **배우 폴더**에 드롭
- 배우 폴더 아래에 인라인 발매일 입력 표시:
  - `[YYYY-MM-DD][📅] 품번 [생성][취소]`
  - 숫자 입력 시 자동 `YYYY-MM-DD` 포맷
  - 📅 클릭 → 네이티브 datepicker 즉시 열림
  - 마지막 입력 날짜 `localStorage` 저장 (`files:lastReleaseDate`)
- 다중 파일 드롭 시 파일별 독립 행 (개별 날짜/생성/취소)
- 생성 시: 폴더 생성 + 파일 이동 + 작품 DB 등록 (works, work_files, work_actors, studio_codes 매칭)
- 이동 완료 후 좌우 양쪽 새로고침

---

## UI 구조

```
┌──────────────────────────────────┬──────────────────────────────────┐
│         왼쪽: 폴더 트리           │       오른쪽: 임시 폴더          │
│                                  │                                  │
│  [전체펼치기][전체접기][🔄]       │  [🔗][폴더선택][🔄] E:\..       │
│  총 1821개 폴더                  │              [문자열____][제거]  │
│  [이름▽][↑] [배우▽][검색__]     │                                  │
│                                  │  ┌──────┐ ┌──────┐ ┌──────┐    │
│  ▼ 📁 D:\Videos                 │  │📋    │ │📋    │ │📋    │    │
│    ▼ 📁 스즈무라.. 배우: 스즈..  │  │ 썸네일 │ │ 썸네일 │ │  📹  │    │
│      ▶ 📁 2026-10.. 작품: AB..  │  │🔍    │ │🔍    │ │🔍    │    │
│      ▶ 📁 2026-09.. 작품: CD..  │  │ABF-  │ │CDE-  │ │GHI-  │    │
│    ▶ 📁 다른배우..              │  │991   │ │123   │ │456   │    │
│                                  │  └──────┘ └──────┘ └──────┘    │
│         ← 드롭 대상 →           │                   ← 드래그 →    │
│                                  │  우클릭 → [복사][수정][삭제]     │
│                                  │  더블클릭 → 재생                 │
└──────────────────────────────────┴──────────────────────────────────┘
```

**드롭 시 인라인 발매일 입력:**
```
  ▼ 📁 스즈무라 아이리 1996-01-01  배우: 스즈무라 아이리
    [YYYY-MM-DD][📅] ABF-991                    [생성] [취소]
    [YYYY-MM-DD][📅] CDE-123                    [생성] [취소]
    ▶ 📁 2026-10-05 ABF-991  작품: ABF-991
```

---

## 수정 범위

### 백엔드 — IPC 핸들러 (`ipc-files.ts`)

| 핸들러 | 파라미터 | 동작 |
|--------|---------|------|
| `folder:tree` | 없음 | DB 조회 → 트리 구조 반환 (배우/작품 매칭 포함) |
| `folder:checkExists` | `paths: string[]` | 경로 배열 존재 여부 체크 |
| `folder:rename` | `oldPath`, `newPath` | `fs.renameSync` → DB 경로 일괄 REPLACE |
| `folder:delete` | `folderPath` | 하위 작품 삭제 + 배우 soft delete + 휴지통 |
| `file:rename` | `oldPath`, `newPath` | `fs.renameSync` → work_files/works UPDATE |
| `temp:listFiles` | `folderPath` | 비동기 폴더 스캔 → 동영상+이미지 매칭 목록 |
| `temp:renameFile` | `folderPath`, `oldName`, `newName` | 동영상+이미지 함께 변경 |
| `temp:deleteFile` | `folderPath`, `fileNames[]` | 동영상+이미지 함께 삭제 (다중) |
| `temp:moveToTree` | `srcFolder`, `fileNames[]`, `targetActorFolder`, `releaseDate` | 폴더 생성 + 파일 이동 + 작품 DB 등록 |
| `temp:removeString` | `folderPath`, `str` | 전체 파일명에서 문자열 일괄 제거 |
| `temp:fetchCover` | `baseUrl`, `productNumber`, `savePath` | 웹 페이지 파싱 → 커버 이미지 다운로드 → 저장 |

### API 함수 (`api.ts`)

```ts
export const folderApi = {
  tree: () => api.invoke('folder:tree'),
  checkExists: (paths: string[]) => api.invoke('folder:checkExists', paths),
  renameFolder: (oldPath: string, newPath: string) => api.invoke('folder:rename', oldPath, newPath),
  renameFile: (oldPath: string, newPath: string) => api.invoke('file:rename', oldPath, newPath),
  deleteFolder: (folderPath: string) => api.invoke('folder:delete', folderPath),
}

export const tempApi = {
  listFiles: (folderPath: string) => api.invoke('temp:listFiles', folderPath),
  renameFile: (folderPath: string, oldName: string, newName: string) => api.invoke('temp:renameFile', folderPath, oldName, newName),
  deleteFile: (folderPath: string, fileNames: string[]) => api.invoke('temp:deleteFile', folderPath, fileNames),
  moveToTree: (srcFolder: string, fileNames: string[], targetActorFolder: string, releaseDate: string) => api.invoke('temp:moveToTree', ...),
  removeString: (folderPath: string, str: string) => api.invoke('temp:removeString', folderPath, str),
}
```

### 프론트엔드

| 파일 | 용도 |
|------|------|
| `Files.tsx` | 좌우 반분할, 트리 + 검색/정렬 + 드롭 인라인 UI |
| `TempFolder.tsx` | 임시 폴더 — 파일 그리드, 선택, 조작, 드래그, URL/문자열 제거 |

### 기존 파일 수정

| 파일 | 변경 내용 |
|------|----------|
| `App.tsx` | `files` 탭 추가, `onNavigateToActor/Work` 전달 |
| `ipc.ts` | `registerFilesHandlers()` 호출 추가 |

---

## 트리 데이터 구조

```ts
interface FileInfo {
  id: number
  workId: number
  fileName: string
  filePath: string
  workLabel: string
  exists: boolean
}

interface FolderNode {
  name: string
  path: string
  fileCount: number
  exists: boolean
  files: FileInfo[]
  children: FolderNode[]
  matchedActorId?: number
  matchedActorName?: string
  matchedWorkId?: number
  matchedWorkLabel?: string
}

interface TempFile {
  fileName: string
  baseName: string
  videoPath: string
  thumbPath: string | null
}
```

---

## localStorage 키 목록

| 키 | 용도 |
|----|------|
| `files:openFolders` | 열린 폴더 path 목록 |
| `files:scrollTop` | 트리 스크롤 위치 |
| `files:sortBy` | 정렬 기준 (name/count) |
| `files:sortDir` | 정렬 방향 (asc/desc) |
| `files:searchField` | 검색 조건 (actor/folder) |
| `files:tempFolder` | 임시 폴더 경로 |
| `files:searchUrl` | 웹 검색 URL |
| `files:removeString` | 문자열 제거 input 값 |
| `files:lastReleaseDate` | 마지막 입력 발매일 |

---

## 고려 사항

- **DB 기반 트리**: DB에 저장된 경로만으로 트리 구성
- **존재 여부 지연 체크**: 폴더 펼칠 때만 `folder:checkExists` 호출
- **작품 매칭 일괄 로딩**: 전체 works를 Map으로 한 번에 로딩
- **중간 경로 생성 제한**: 공통 접두사 기준으로 제한
- **폴더 레벨별 삭제**: 배우 폴더 = 일괄 삭제, 작품 폴더 = 작품 삭제
- **임시 폴더 비동기**: `fs.promises.readdir`, 썸네일 점진적 로딩
- **파일시스템 먼저 → 성공 시 DB 업데이트**
- **경로 구분자 정규화**: `\` → `/`
- **문자열 제거 시 동영상+이미지 함께 처리**
- **드래그 앤 드롭 시 작품 자동 등록**: works, work_files, work_actors, studio_codes 매칭
