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

## 구현 완료 기능

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
- 열린 폴더 목록: `files:openFolders` — 탭 전환/재시작 후 유지
- 스크롤 위치: `files:scrollTop` — 200ms 디바운스로 저장, 트리 로딩 후 복원

### 9. UI 기본 설정
- 전체 `cursor-default`, 매칭 텍스트만 `cursor-pointer`
- [수정] / [삭제] 텍스트 버튼 (아이콘 사용 안 함)
- 파일에는 [삭제] 버튼 없음 — 폴더 단위로만 삭제

### 10. 검색
- 상단에 검색 입력창
- 프론트에서 트리 데이터 필터링 (백엔드 호출 불필요)
- 검색 대상: 폴더명, 파일명, 매칭된 배우명, 매칭된 작품 품번/제목
- 매칭된 노드 + 상위 경로 유지하여 트리 구조 보존
- 검색 중 매칭된 폴더 자동 펼침

### 11. 정렬
- 상단에 정렬 드롭다운
- 프론트에서 `FolderNode.children` 재정렬 (같은 depth의 형제 노드끼리)
- 정렬 기준: 폴더명 (가나다/역순), 하위 항목 수 (많은/적은 순)

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

### API 함수 (`api.ts`)

```ts
export const folderApi = {
  tree: () => api.invoke('folder:tree'),
  checkExists: (paths: string[]) => api.invoke('folder:checkExists', paths),
  renameFolder: (oldPath: string, newPath: string) => api.invoke('folder:rename', oldPath, newPath),
  renameFile: (oldPath: string, newPath: string) => api.invoke('file:rename', oldPath, newPath),
  deleteFolder: (folderPath: string) => api.invoke('folder:delete', folderPath),
}
```

### 프론트엔드 (`Files.tsx`)

- 트리 UI + 파일 목록 + 이름 변경/삭제 + 검색/정렬
- 배우/작품 매칭 표시 + 클릭 네비게이션 + 호버 툴팁
- localStorage: 열린 폴더, 스크롤 위치
- 전체 펼치기/접기

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
```

---

## 추가 예정 기능

### 12. 임시 폴더 파일 정리 (상세 설계 필요)
- 지정된 임시 폴더에 있는 영상/이미지 파일을 새 폴더를 만들어서 이동하는 기능
- 상세 동작 흐름은 추후 정의 필요

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
