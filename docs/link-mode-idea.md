# 임시폴더 링크 등록 모드

## 개요

임시폴더에서 영상 파일은 삭제하고 이미지(커버)만 남긴 뒤, 이미지만 있는 품번을 트리에 드롭하면 자동으로 링크 등록 인라인 UI가 뜨는 구조.

## 현재 플로우

1. 임시폴더: 비디오 파일 목록 표시 (매칭 이미지를 썸네일로)
2. 드래그 → 트리 폴더에 드롭 → 날짜 입력 → 생성
3. `moveFilesToActorFolder`: 비디오+이미지를 트리 폴더로 이동, work 생성, work_files(type='local') 등록

## 문제

- 삭제 시 비디오+이미지 무조건 함께 삭제 (분리 불가)
- 이미지만 있는 품번은 목록에 표시되지 않음 (비디오 기준 스캔)
- 로컬 파일 없이 URL 링크만으로 작품 등록하는 경로가 없음

## 구현 순서

1단계: 이미지 전용 항목 표시 (listFiles + TempFolder)
2단계: 삭제 3분기 (deleteFile mode + TempFolder 삭제 UI)
3단계: 링크 등록 드롭 (moveToTreeAsLink + LinkDropInlineRow)

## 변경 계획

### 1단계. 이미지 전용 항목 표시 (ipc-files + TempFolder)

`temp:listFiles` (ipc-files.ts 326~361행) 수정:
- 비디오 매칭 루프에서 매칭된 이미지 baseName을 Set에 기록
- 루프 종료 후, imageMap에서 매칭되지 않은 이미지를 별도 항목으로 추가
  - fileName: 이미지파일명, baseName: 확장자 제거
  - videoPath: null, thumbPath: 이미지경로
  - fileSize: 이미지크기, mtime: 이미지mtime

TempFolder.tsx 수정:
- TempFile 인터페이스 (27~34행): videoPath를 string | null로 변경
- handleDoubleClick (163~165행): videoPath 없으면 이미지 프리뷰로 분기
- 드래그: videoPath null 항목도 정상 동작

상태 구분 표시:
- 아이콘 모드: 썸네일 좌상단에 타입 뱃지
  - 영상+이미지: 필름 아이콘 뱃지 (초록)
  - 이미지만: 사진 아이콘 뱃지 (보라/주황)
  - 영상만 (썸네일 없음): 기존 비디오 아이콘 그대로
- 리스트 모드: 기존 썸네일 유무 표시 (녹색/회색 원) 컬럼을 타입 표시로 변경
  - 영상+이미지: 녹색 원 (기존과 동일)
  - 이미지만: 보라/주황 원 또는 별도 아이콘
  - 영상만: 회색 원 (기존과 동일)

자동 등록(배치) 기능과의 관계:
- 일괄 자동 배치 버튼 (상단 > 아이콘): 이미지만 있는 항목은 제외하고 영상+이미지 품번만 대상
- 개별 자동 배치 버튼 (카드/행 미니버튼): 이미지만 항목이면 disabled (아이콘 보이되 회색, 클릭 무반응)
- 일괄 커버 다운로드 버튼: 이미지만 항목은 이미 이미지가 있으므로 기존과 동일하게 제외 (noThumb 필터)

### 2단계. 삭제 3분기 (TempFolder + ipc-files)

`temp:deleteFile`에 mode 파라미터 추가:
- `'all'` (기본): 비디오 + 이미지 삭제 (기존)
- `'videoOnly'`: 비디오만 삭제, 이미지 보존
- `'imageOnly'`: 이미지만 삭제, 비디오 보존

TempFolder 삭제 UI 변경:
- 선택 항목이 영상+이미지 혼재 시: 삭제 모드 선택 모달
  - [1] 이미지 삭제 (imageOnly)
  - [2] 파일 삭제 (videoOnly)
  - [3] 전체 삭제 (all)
  - 버튼 클릭 또는 단축키(1/2/3) -> confirm alert -> 삭제
  - 마지막 선택 모드를 localStorage('files:deleteMode')에 저장
  - 모달 열릴 때 저장된 모드 버튼 하이라이트 (기본값: 'all')
  - Enter 또는 Delete 키 입력 시 하이라이트된 버튼 실행
  - ESC로 모달 닫기
- 선택 항목이 이미지만: 모달 없이 바로 confirm alert ("N개 이미지를 삭제하시겠습니까?") -> 삭제
- 선택 항목이 영상만 (썸네일 없음): 모달 없이 바로 confirm alert ("N개 파일을 삭제하시겠습니까?") -> 삭제

### 3단계. 링크 등록 드롭 (Files + ipc-files)

드롭 시 자동 분기 (videoPath 유무로 판단, 별도 토글 없음):
- 영상+이미지 (videoPath 있음) -> 기존 DropInlineRow 그대로 (날짜 입력 -> moveToTree)
- 이미지만 (videoPath 없음) -> LinkDropInlineRow (URL + 날짜 입력 -> moveToTreeAsLink)
- 혼재 드롭 시 각 항목별로 해당 인라인 표시 (영상 있는 건 기존, 이미지만인 건 링크)

LinkDropInlineRow (배우 폴더에 드롭):
  [YYYY-MM-DD][달력] [https://...(placeholder)] AAA-001 [생성][취소]

LinkNewActorDropInlineRow (비배우 폴더에 드롭):
  [배우명    ][생년월일  ][달력]
  ㄴ[YYYY-MM-DD][달력] [https://...(placeholder)] AAA-001 [생성][취소]

- 기존 DropInlineRow/NewActorDropInlineRow와 동일 레이아웃에 URL 입력만 추가
- URL은 flex-1로 남은 공간 채움

`temp:moveToTreeAsLink` 신규 핸들러:
- 이미지를 targetFolder/cover images/{releaseDate} {productNumber}.ext로 복사 -> cover_path (원본 경로 패턴 유지)
- work 생성 (file_path = '')
- URL -> work_files에 type='url'로 등록
- 임시폴더에서 이미지 삭제
- 배우 연결, 레이블 자동매칭은 기존 로직 재사용

### 4단계. api.ts

- tempApi.deleteFile 시그니처에 mode 추가
- tempApi.moveToTreeAsLink(...) 추가

## 사용 시나리오

1. 임시폴더에 비디오+커버 이미지가 있는 상태
2. 커버 다운로드 완료 후, 영상만 삭제 (deleteMode: 'videoOnly')
3. 이미지만 남은 품번이 목록에 표시됨
4. 이미지 항목을 트리 배우 폴더에 드롭
5. URL + 날짜 입력 후 생성
6. 작품 등록: 커버 이미지 + URL 링크만으로 완성

## 상세 구현 시나리오

### 1단계. 이미지 전용 항목 표시

#### 1-1. ipc-files.ts — temp:listFiles 수정 (326~361행)

현재 로직:
```
fileNames 순회 → IMAGE_EXTS → imageMap(baseName → path) 구축
fileNames 순회 → VIDEO_EXTS만 → 매칭 이미지를 thumbPath로 설정
```

변경:
```
(기존과 동일) imageMap 구축
(기존과 동일) 비디오 순회, 매칭 이미지 thumbPath 설정
+ matchedImageBases: Set<string> 에 매칭된 이미지 baseName 기록
  - exact match: base.toLowerCase()
  - prefix match: prefixMatch[1].toLowerCase()
(추가) imageMap 순회 → matchedImageBases에 없는 이미지를 result에 추가
  - fileName: 이미지파일명 (확장자 포함)
  - baseName: path.basename(이미지파일명, ext)
  - videoPath: null
  - thumbPath: 이미지 풀경로
  - fileSize: fs.promises.stat → size
  - mtime: fs.promises.stat → mtimeMs
```

#### 1-2. api.ts — tempApi.listFiles 반환 타입 수정 (147행)

변경: videoPath 타입을 `string` → `string | null`로 변경

#### 1-3. TempFolder.tsx — TempFile 인터페이스 수정 (27~34행)

변경: `videoPath: string` → `videoPath: string | null`

#### 1-4. TempFolder.tsx — handleDoubleClick 수정 (163~165행)

현재: `shellApi.openPath(file.videoPath)`
변경:
```ts
if (file.videoPath) {
  shellApi.openPath(file.videoPath)
} else if (file.thumbPath) {
  setPreviewImage({ path: file.thumbPath, fileName: file.fileName })
}
```

#### 1-5. TempFolder.tsx — 아이콘 모드 타입 뱃지 (427~432행 부근)

썸네일 영역 좌상단에 타입 뱃지 추가:
- videoPath 있음 + thumbPath 있음: 초록 필름 뱃지 (영상+이미지)
- videoPath 없음 + thumbPath 있음: 주황/보라 사진 뱃지 (이미지만)
- videoPath 있음 + thumbPath 없음: 기존 비디오 아이콘 그대로 (영상만)

썸네일 없을 때 (videoPath 있고 thumbPath 없음): 기존 비디오 아이콘 유지
썸네일 없을 때 (videoPath 없고 thumbPath 있음): 불가능한 케이스 (이미지 전용은 항상 thumbPath 있음)

#### 1-6. TempFolder.tsx — 리스트 모드 타입 표시 (482행 부근)

현재: 녹색 원(●) / 회색 원(○)으로 썸네일 유무 표시
변경: 3상태로 확장
- 영상+이미지 (videoPath + thumbPath): 녹색 원 ●
- 이미지만 (videoPath 없음): 주황/보라 원 ●
- 영상만 (thumbPath 없음): 회색 원 ○

#### 1-7. TempFolder.tsx — 자동 배치 버튼 disabled 처리

일괄 자동 배치 (321~338행, 상단 > 버튼):
- 현재: `const hasThumb = files.filter(f => f.thumbPath)`
- 변경: `const hasThumb = files.filter(f => f.thumbPath && f.videoPath)` (이미지만 항목 제외)

개별 자동 배치 (카드 미니버튼 444~448행, 리스트 미니버튼 489행):
- 현재: thumbPath 있으면 활성
- 변경: `thumbPath && videoPath` 둘 다 있을 때만 활성, 이미지만이면 disabled (회색, 클릭 무반응)

일괄 커버 다운로드 (304~320행):
- 현재: `const noThumb = files.filter(f => !f.thumbPath)` → 변경 불필요 (이미지만 항목은 thumbPath 있으므로 자동 제외)

#### 1-8. TempFolder.tsx — 드래그 동작 확인

handleDragStart (238~248행):
- dragItems에 videoPath null 항목 포함 → onDragFiles로 전달
- Files.tsx에서 받는 TempFileRef에 videoPath 포함되어야 함 (1-9에서 처리)

#### 1-9. Files.tsx — TempFileRef 인터페이스 수정 (168~173행)

현재:
```ts
interface TempFileRef {
  fileName: string
  baseName: string
  videoPath: string
  thumbPath: string | null
}
```
변경: `videoPath: string` → `videoPath: string | null`

---

### 2단계. 삭제 3분기

#### 2-1. ipc-files.ts — temp:deleteFile 수정 (384~404행)

현재 시그니처: `(folderPath, fileNames)`
변경 시그니처: `(folderPath, fileNames, mode: 'all' | 'videoOnly' | 'imageOnly')`

mode별 동작:
- `'all'` (기본): 기존과 동일 — 비디오 삭제 + 매칭 이미지 삭제
- `'videoOnly'`: 비디오만 삭제, 이미지 건드리지 않음
  - 이미지 전용 항목(videoPath null)이면 아무것도 안 함
- `'imageOnly'`: 매칭 이미지만 삭제, 비디오 건드리지 않음
  - 이미지 전용 항목이면 해당 이미지 파일 삭제

주의: 이미지 전용 항목의 fileName은 이미지 파일명 (예: AAA-001.jpg)
- mode='all' 또는 'imageOnly': 해당 이미지 파일 삭제
- mode='videoOnly': 삭제할 비디오 없으므로 skip

#### 2-2. api.ts — tempApi.deleteFile 시그니처 변경 (149행)

현재: `deleteFile: (folderPath, fileNames)`
변경: `deleteFile: (folderPath, fileNames, mode?: 'all' | 'videoOnly' | 'imageOnly')`
- mode 생략 시 'all' (하위호환)

#### 2-3. TempFolder.tsx — 삭제 모달 state 추가

새 state:
- `const [deleteModal, setDeleteModal] = useState(false)`
- 하이라이트 모드: `localStorage.getItem('files:deleteMode') || 'all'`

#### 2-4. TempFolder.tsx — handleDelete 수정 (192~199행)

현재: confirm → deleteFile 호출
변경:
```
선택 항목 분석:
  hasVideo = 선택 중 videoPath 있는 항목 존재 여부
  hasImageOnly = 선택 중 videoPath 없는 항목 존재 여부
  hasThumb = 선택 중 thumbPath 있는 항목 존재 여부

if (hasVideo && hasThumb):
  → 삭제 모달 표시 (3개 선택지)
else if (hasImageOnly && !hasVideo):
  → 바로 confirm ("N개 이미지를 삭제하시겠습니까?") → deleteFile(mode='imageOnly')
else:
  → 바로 confirm ("N개 파일을 삭제하시겠습니까?") → deleteFile(mode='all')
```

#### 2-5. TempFolder.tsx — 삭제 모달 UI (신규 JSX)

위치: 기존 renaming 모달 근처 (537~554행 부근)
```
fixed inset-0 bg-black/60 모달
  "N개 항목 삭제"
  [1] 이미지 삭제 — imageOnly
  [2] 파일 삭제 — videoOnly
  [3] 전체 삭제 — all
  (마지막 선택 모드 버튼에 ring-2 ring-blue-500 하이라이트)
```
- 각 버튼 클릭 → confirm alert → tempApi.deleteFile(mode) → loadFiles()
- 선택 실행 시 localStorage('files:deleteMode')에 해당 mode 저장
- 키보드 이벤트:
  - 1/2/3 → 해당 버튼 즉시 실행 (confirm → 삭제)
  - Enter 또는 Delete → 하이라이트된 버튼 실행 (confirm → 삭제)
  - ESC → 모달 닫기

#### 2-6. TempFolder.tsx — Delete 키 핸들러 수정 (88~94행)

현재: Delete 키 → handleDelete() 직접 호출
변경: Delete 키 → handleDelete() (내부에서 모달/바로삭제 분기)

---

### 3단계. 링크 등록 드롭

#### 3-1. ipc-files.ts — temp:moveToTreeAsLink 신규 핸들러

시그니처: `(srcFolder, imageFileName, targetActorFolder, releaseDate, url)`

동작:
1. 이미지 파일에서 품번 추출: `path.basename(imageFileName, ext)` → getProductNumber
2. 레이블 자동매칭 (기존 moveFilesToActorFolder의 460~468행 로직 재사용)
   - productNumber에서 studioCode 추출 → studio_codes 조회 → studioId
3. 배우 매칭 (기존 temp:moveToTree의 498~514행 로직 재사용)
   - 폴더명에서 배우명+생년월일 파싱 → actors 테이블 조회 → actorId
4. 이미지를 targetFolder/cover images/{releaseDate} {productNumber}.ext 로 복사
5. work INSERT:
   - file_path: '' (로컬 파일 없음)
   - cover_path: 복사된 cover images 경로 (원본 경로 패턴 유지)
   - product_number: 추출한 품번
   - release_date: 입력받은 날짜
   - studio_id: 매칭된 값
6. work_files INSERT:
   - file_path: url, type: 'url', sort_order: 0
7. work_actors INSERT:
   - actorId가 있으면 연결
8. 임시폴더에서 이미지 파일 삭제 (shell.trashItem)
9. 반환: { ok: true, workId }

#### 3-2. ipc-files.ts — temp:moveToTreeAsLinkNewActor 신규 핸들러

시그니처: `(srcFolder, imageFileName, parentFolder, actorName, actorBirthday, releaseDate, url)`

동작:
1. 배우 생성/조회 (기존 temp:moveWithNewActor 538~547행 로직 재사용)
   - 기존 배우 있으면 재사용, 없으면 INSERT + actor_scores 초기화
2. 배우 폴더 경로 결정 (기존 temp:moveWithNewActor 549~568행 로직 재사용)
3. 이후 3-1과 동일 (work 생성, 이미지 복사, URL 등록, 배우 연결)

#### 3-3. api.ts — 신규 함수 추가

```ts
tempApi.moveToTreeAsLink: (srcFolder, imageFileName, targetActorFolder, releaseDate, url)
  → Promise<{ ok: boolean; workId?: number }>

tempApi.moveToTreeAsLinkNewActor: (srcFolder, imageFileName, parentFolder, actorName, actorBirthday, releaseDate, url)
  → Promise<{ ok: boolean; workId?: number; actorId?: number }>
```

#### 3-4. Files.tsx — LinkDropInlineRow 컴포넌트 (신규)

기존 DropInlineRow (61~95행) 참고하여 작성.
Props: `{ file, depth, onConfirm, onCancel }`
onConfirm 시그니처: `(fileName, date, url) => void`

레이아웃:
```
[YYYY-MM-DD 입력][달력 버튼] [URL 입력 (flex-1, placeholder="https://...")] {baseName} [생성][취소]
```

- dateValue: localStorage 'files:lastReleaseDate' 초기값
- urlValue: '' 초기값
- Enter 키 → onConfirm, ESC → onCancel
- URL 입력은 flex-1로 남은 공간 채움

#### 3-5. Files.tsx — LinkNewActorDropInlineRow 컴포넌트 (신규)

기존 NewActorDropInlineRow (107~156행) 참고하여 작성.
Props: `{ file, depth, onConfirm, onCancel }`
onConfirm 시그니처: `(fileName, actorName, actorBirthday, releaseDate, url) => void`

레이아웃:
```
[배우명 입력][생년월일 입력][달력]
ㄴ[YYYY-MM-DD 입력][달력] [URL 입력 (flex-1)] {baseName} [생성][취소]
```

#### 3-6. Files.tsx — DropInline/NewActorDropInline 래퍼에 분기 추가

기존 DropInline (97~105행): files를 순회하며 DropInlineRow 렌더링
변경: file.videoPath 유무로 분기
```tsx
{files.map(file => (
  file.videoPath
    ? <DropInlineRow ... />          // 기존: 영상+이미지
    : <LinkDropInlineRow ... />      // 신규: 이미지만
))}
```

기존 NewActorDropInline (158~166행): 동일 패턴으로 분기
```tsx
{files.map(file => (
  file.videoPath
    ? <NewActorDropInlineRow ... />       // 기존
    : <LinkNewActorDropInlineRow ... />   // 신규
))}
```

#### 3-7. Files.tsx — handleLinkConfirmOne 추가 (530행 부근)

```ts
const handleLinkConfirmOne = async (fileName: string, releaseDate: string, url: string) => {
  if (!dropTarget) return
  // 날짜 검증 (기존 handleMoveConfirmOne과 동일)
  // URL 빈값 체크
  const srcFolder = localStorage.getItem('files:tempFolder') || ''
  const res = await tempApi.moveToTreeAsLink(srcFolder, fileName, dropTarget.folderPath, date, url)
  if (res.ok) {
    localStorage.setItem('files:lastReleaseDate', date)
    loadTree()
    tempRefreshRef.current?.()
  }
  // dragFiles에서 제거 (기존과 동일 패턴)
}
```

#### 3-8. Files.tsx — handleLinkNewActorConfirmOne 추가

```ts
const handleLinkNewActorConfirmOne = async (fileName: string, actorName: string, actorBirthday: string, releaseDate: string, url: string) => {
  if (!dropTarget) return
  // 검증 (기존 handleNewActorConfirmOne과 동일)
  const srcFolder = localStorage.getItem('files:tempFolder') || ''
  const res = await tempApi.moveToTreeAsLinkNewActor(srcFolder, fileName, dropTarget.folderPath, actorName, bd, rd, url)
  if (res.ok) {
    localStorage.setItem('files:lastReleaseDate', rd)
    loadTree()
    tempRefreshRef.current?.()
  }
  // dragFiles에서 제거
}
```

#### 3-9. Files.tsx — FolderItem의 인라인 드롭 영역에 새 핸들러 전달

FolderItem props에 추가:
- `onLinkConfirmOne`
- `onLinkNewActorConfirmOne`

DropInline/NewActorDropInline에 새 핸들러를 전달하여 내부 분기에서 사용.

---

## 변경 파일 요약

| 파일             | 변경 내용                                                                     |
|------------------|-------------------------------------------------------------------------------|
| ipc-files.ts     | listFiles 이미지전용 포함, deleteFile mode 추가, moveToTreeAsLink 신규, moveToTreeAsLinkNewActor 신규 |
| TempFolder.tsx   | TempFile.videoPath nullable, 타입 뱃지, 삭제 3분기 모달, 자동배치 disabled, 더블클릭 분기 |
| Files.tsx        | TempFileRef 수정, LinkDropInlineRow/LinkNewActorDropInlineRow 신규, DropInline 분기, handleLink*ConfirmOne 추가 |
| api.ts           | listFiles 반환타입, deleteFile mode, moveToTreeAsLink, moveToTreeAsLinkNewActor 추가 |
