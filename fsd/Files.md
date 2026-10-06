# 파일 탭 — 작품 폴더/파일 관리

## 개요

DB에 등록된 작품 파일 경로(DB 기반)를 트리 구조로 시각화하고, 폴더명/파일명 변경 및 삭제를 할 수 있는 기능.
실제 드라이브를 탐색하지 않고, DB에 저장된 경로만으로 트리를 구성한다.
탭 위치: 대회 다음 (홈 / 대시보드 / 작품 / 배우 / 레이블 / 대회 / **파일**)

**레이아웃**: 좌우 반분할
- 왼쪽: 폴더 트리 (기존 기능)
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
- 전체 펼치기 / 전체 접기 버튼

### 2. 파일 목록 보기 (DB 등록 파일만)
- 폴더 펼침 시 해당 폴더에 직접 속한 DB 등록 파일 표시
- 표시 정보: 파일명, 연결된 작품 (product_number 또는 title)

### 3. 폴더/파일 이름 변경
- 폴더/파일 행의 [수정] 버튼 → 인라인 입력 → Enter/변경 버튼으로 실행
- `fs.renameSync` → 성공 시 DB 경로 일괄 업데이트

### 4. 폴더 삭제 (레벨별 동작)
- 작품 폴더 삭제: 휴지통 이동 + works/work_files 삭제 + 대회 연관 데이터 정리
- 배우 폴더 삭제: 휴지통 이동 + 하위 작품 전체 삭제 + 배우 soft delete
- 진행 중 대회 참가 여부 체크 (blocked 판단)

### 5. 배우/작품 매칭
- 폴더명에서 배우(`배우명 YYYY-MM-DD`) / 작품(`YYYY-MM-DD 품번`) 패턴 추출
- 배우 매칭: `actors.name` + `actors.aliases` 모두 검색 → 현재 이름으로 표시
- 작품 매칭: `works.product_number`로 검색
- 매칭 텍스트에 `cursor-pointer hover:underline` 적용
- 클릭 시 해당 배우/작품 상세 모달 표시

### 6. 호버 툴팁
- 매칭된 배우/작품 텍스트 위에 400ms 호버 시 `CardTooltip` 표시 (showCover 포함)
- 툴팁 범위 = 클릭 범위 (매칭 텍스트에만 적용)

### 7. 존재하지 않는 폴더/파일 체크 (지연 로딩)
- 초기 로딩 시 존재 여부 체크 안 함 (성능)
- 폴더 펼칠 때 해당 폴더 + 파일 경로만 `folder:checkExists`로 체크
- 없는 항목은 빨간 텍스트 + ⚠️ 표시, 수정/삭제 비활성화

### 8. 상태 유지 (localStorage)
- 열린 폴더 목록: `files:openFolders`
- 스크롤 위치: `files:scrollTop`
- 정렬 기준/방향: `files:sortBy`, `files:sortDir`

### 9. UI 기본 설정
- 전체 `cursor-default`, 매칭 텍스트만 `cursor-pointer`
- [수정] / [삭제] 텍스트 버튼 (아이콘 사용 안 함)
- 파일에는 [삭제] 버튼 없음 — 폴더 단위로만 삭제
- 상단 1줄: 새로고침 / 전체 펼치기 / 전체 접기 / 총 N개 폴더
- 상단 2줄: 검색 입력 / 정렬 셀렉트+↑↓ 버튼

### 10. 검색
- 프론트에서 트리 데이터 필터링 (백엔드 호출 불필요)
- 검색 대상: 폴더명, 파일명, 매칭된 배우명, 매칭된 작품 품번/제목
- 매칭된 노드 + 상위 경로 유지하여 트리 구조 보존

### 11. 정렬
- 셀렉트 박스 (이름 / 항목 수) + ↑↓ 방향 버튼 (다른 탭과 동일 패턴)
- 프론트에서 `FolderNode.children` 재정렬 (같은 depth의 형제 노드끼리)

---

## 구현 예정 기능 (오른쪽 — 임시 폴더)

### 12. 임시 폴더 지정
- 임시 폴더 경로를 사용자가 선택 (폴더 선택 다이얼로그)
- 선택된 경로는 `localStorage`에 저장 (`files:tempFolder`)
- 탭 재진입/프로그램 재시작 시 유지

### 13. 임시 폴더 파일 목록 보기
- 지정된 임시 폴더에서 동영상 파일을 스캔하여 아이콘으로 표시
- 같은 파일명의 이미지 파일이 있으면 아이콘의 썸네일로 사용
  - 예: `ABF-991.mp4` + `ABF-991.jpg` → 썸네일은 `ABF-991.jpg`
- 이미지가 없으면 기본 동영상 아이콘 표시

### 14. 파일 다중 선택
- **클릭**: 단일 선택 (기존 선택 해제)
- **Ctrl + 클릭**: 개별 토글 (기존 선택 유지하면서 추가/해제)
- **Shift + 클릭**: 범위 선택 (마지막 클릭~현재 클릭 사이 전체 선택)
- **마우스 드래그**: 드래그 영역에 걸친 파일 전체 선택 (영역 선택)
- 선택된 파일은 시각적으로 하이라이트 표시

### 15. 임시 폴더 파일 조작
- **더블클릭**: 동영상 재생 (`shell.openPath`)
- **우클릭**: 컨텍스트 메뉴 표시 (다중 선택 시 선택된 파일 전체에 적용)
  - **수정**: 파일명 변경 — 단일 선택 시에만 활성화 (동일 파일명 이미지도 함께 변경)
  - **삭제**: 파일 삭제 — 다중 선택 가능 (동일 파일명 이미지도 함께 삭제)

### 16. 드래그 앤 드롭 — 임시 폴더 → 트리 배우 폴더
- 선택된 파일(단일 또는 다중)을 드래그하여 왼쪽 트리의 **배우 폴더**에 드롭
- 드롭 시 발매일 입력 모달 표시:
  - datepicker로 날짜 선택 또는 YYYYMMDD 형식 직접 입력
- 새 폴더 생성: `YYYY-MM-DD 파일명(품번)` 형식으로 배우 폴더 아래에 작품 폴더 생성
- 동영상 파일 + 동일 파일명 이미지를 새 폴더로 이동

**단일 파일 드롭 흐름:**
```
1. ABF-991.mp4 를 "스즈무라 아이리 1996-01-01" 폴더에 드롭
2. 발매일 입력 모달: [2026-10-05] 또는 datepicker
3. 폴더 생성: 스즈무라 아이리 1996-01-01\2026-10-05 ABF-991\
4. 파일 이동: ABF-991.mp4, ABF-991.jpg → 새 폴더
```

**다중 파일 드롭 흐름:**
```
1. ABF-991.mp4, CDE-123.mp4 를 선택하여 "스즈무라 아이리 1996-01-01" 폴더에 드롭
2. 각 파일별 발매일 입력 모달 표시 (또는 일괄 발매일 입력)
3. 각 파일별 작품 폴더 생성 + 파일 이동
```

---

## UI 구조

```
┌──────────────────────────────────┬──────────────────────────────────┐
│         왼쪽: 폴더 트리           │       오른쪽: 임시 폴더          │
│                                  │                                  │
│  새로고침  전체펼치기  전체접기    │  [폴더 선택]  D:\Temp\Videos     │
│  총 48개 폴더                    │                                  │
│  [검색________] [이름 v] [↑]     │  ┌──────┐ ┌──────┐ ┌──────┐    │
│                                  │  │ 썸네일 │ │ 썸네일 │ │  📹  │    │
│  ▼ 📁 D:\Videos                 │  │      │ │      │ │      │    │
│    ▼ 📁 스즈무라.. 배우: 스즈..  │  │ABF-  │ │CDE-  │ │GHI-  │    │
│      ▶ 📁 2026-10.. 작품: AB..  │  │991   │ │123   │ │456   │    │
│      ▶ 📁 2026-09.. 작품: CD..  │  └──────┘ └──────┘ └──────┘    │
│    ▶ 📁 다른배우..              │                                  │
│                                  │  ┌──────┐ ┌──────┐              │
│         ← 드롭 대상 →           │  │ 썸네일 │ │  📹  │  ← 드래그   │
│                                  │  │JKL-  │ │MNO-  │              │
│                                  │  │789   │ │012   │              │
│                                  │  └──────┘ └──────┘              │
│                                  │                                  │
│                                  │  우클릭 → [수정] [삭제]          │
│                                  │  더블클릭 → 재생                 │
└──────────────────────────────────┴──────────────────────────────────┘
```

**드롭 시 인라인 발매일 입력 (배우 폴더 아래에 표시):**
```
  ▼ 📁 스즈무라 아이리 1996-01-01  배우: 스즈무라 아이리
    [YYYY-MM-DD][📅] ABF-991                    [생성] [취소]
    ┌──────────┐
    │ datepicker│  ← 📅 클릭 시 input 아래에 표시
    └──────────┘
    ▶ 📁 2026-10-05 ABF-991  작품: ABF-991
    ▶ 📁 2026-09-01 CDE-123  작품: CDE-123
```

- 기존 작품 폴더와 동일한 순서: 날짜 → 품번
- 숫자 입력 시 자동 포맷: `20261005` → `2026-10-05`
- [📅] 버튼 클릭 → input box 아래에 datepicker 표시
- [생성] 클릭 → 폴더 생성 + 파일 이동
- [취소] 클릭 → 인라인 닫기
- 다중 파일 드롭 시 파일별로 행이 나열됨

---

## 수정 범위

### 백엔드 — IPC 핸들러 (`ipc-files.ts`)

| 핸들러 | 파라미터 | 동작 |
|--------|---------|------|
| `folder:tree` | 없음 | DB 조회 → 트리 구조 반환 (배우/작품 매칭 포함, 존재 여부는 기본 true) |
| `folder:checkExists` | `paths: string[]` | 전달받은 경로 배열의 존재 여부 체크 반환 |
| `folder:rename` | `oldPath`, `newPath` | `fs.renameSync` → 성공 시 DB 경로 일괄 REPLACE |
| `folder:delete` | `folderPath` | 하위 작품 삭제 + 배우 폴더면 soft delete + 휴지통 이동 |
| `file:rename` | `oldPath`, `newPath` | `fs.renameSync` → 성공 시 해당 work_files/works UPDATE |
| `temp:listFiles` | `folderPath` | 임시 폴더 스캔 → 동영상+이미지 매칭 목록 반환 |
| `temp:renameFile` | `folderPath`, `oldName`, `newName` | 동영상+이미지 파일명 함께 변경 |
| `temp:deleteFile` | `folderPath`, `fileName` | 동영상+이미지 파일 함께 삭제 |
| `temp:moveToTree` | `srcFolder`, `fileName`, `targetActorFolder`, `releaseDate` | 새 작품 폴더 생성 + 파일 이동 |

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
  deleteFile: (folderPath: string, fileName: string) => api.invoke('temp:deleteFile', folderPath, fileName),
  moveToTree: (srcFolder: string, fileName: string, targetActorFolder: string, releaseDate: string) => api.invoke('temp:moveToTree', srcFolder, fileName, targetActorFolder, releaseDate),
}
```

### 프론트엔드

| 파일 | 용도 |
|------|------|
| `Files.tsx` | 좌우 반분할 레이아웃으로 변경, 왼쪽 트리 유지 |
| `TempFolder.tsx` (신규) | 오른쪽 임시 폴더 영역 — 파일 목록, 우클릭 메뉴, 드래그 |
| `ReleaseDateModal.tsx` (신규) | 드롭 시 발매일 입력 모달 |

### 기존 파일 수정

| 파일 | 변경 내용 |
|------|----------|
| `App.tsx` | `files` 탭 추가 (대회 다음), `onNavigateToActor/Work` 전달 |
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

// 임시 폴더 파일
interface TempFile {
  fileName: string       // 동영상 파일명 (확장자 포함)
  baseName: string       // 확장자 제외 파일명 (= 품번)
  videoPath: string      // 동영상 전체 경로
  thumbPath: string | null  // 동일 파일명 이미지 경로 (없으면 null)
}
```

---

## 고려 사항

- **DB 기반 트리**: 실제 드라이브를 탐색하지 않고 DB에 저장된 경로만으로 트리 구성
- **조회는 DB 등록 파일만**: 디스크에 있지만 DB에 없는 파일은 표시하지 않음
- **존재 여부 지연 체크**: 초기 로딩 시 체크 안 함, 폴더 펼칠 때만 `folder:checkExists` 호출 (성능)
- **작품 매칭 일괄 로딩**: 개별 DB 쿼리 대신 전체 works를 Map으로 한 번에 로딩 (성능)
- **중간 경로 생성 제한**: 공통 접두사 기준으로 상위 폴더 생성 범위 제한 (성능)
- **폴더 레벨별 삭제**: 배우 폴더 = 배우+작품 일괄 삭제, 작품 폴더 = 작품 삭제. 개별 파일 삭제 없음
- 파일시스템 변경 실패 시 DB는 변경하지 않음 (파일시스템 먼저 → 성공 시 DB)
- 경로 구분자: `\` → `/` 정규화 처리
- 삭제 시 진행 중 대회 참가 여부 체크 필수 (blocked 판단)
- 검색/정렬은 프론트에서 처리 (백엔드 추가 호출 불필요)
- **임시 폴더 파일 수정/삭제 시 동일 파일명 이미지 연동 처리**
- **드래그 앤 드롭**: 임시 폴더 → 배우 폴더 드롭 시 발매일 입력 후 작품 폴더 자동 생성
- **임시 폴더 비동기 로딩**: `temp:listFiles`는 `fs.promises.readdir` 사용. 외장 HDD 미로드 등으로 폴더 접근 지연/실패 시 프로그램이 멈추지 않도록 비동기 처리. 프론트에서 로딩 상태 표시, 실패 시 에러 메시지 표시.
