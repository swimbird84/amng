# 파일트리 cover images 폴더 표시

## 개요

파일트리에서 배우 폴더 하위의 `cover images/` 폴더와 그 안의 이미지를 표시하고, 각 이미지를 해당 작품과 연결하는 기능.

## 현재 상태

- `folder:tree`는 `work_files` (type='local')만 조회해서 트리 구조 빌드
- `cover images/` 폴더는 트리에서 완전히 무시됨
- 아카이빙/링크 등록 시 cover_path가 `cover images/` 경로를 가리키는 작품이 DB에 존재

## 접근 방식: DB 기반 (works.cover_path 조회)

파일시스템 스캔 없이 DB에서 cover_path가 `cover images/`를 포함하는 작품을 조회.
기존 work_files 기반 트리 빌드와 동일한 패턴으로 일관성 유지.

## 변경 계획

### 1. ipc-files.ts — folder:tree (buildTree) 수정

cover_path 조회 추가:
```sql
SELECT id, cover_path, product_number, title
FROM works
WHERE cover_path IS NOT NULL
  AND REPLACE(cover_path, '\', '/') LIKE '%/cover images/%'
```

buildTree에서:
- cover_path에서 디렉토리 추출 → `cover images/` 폴더 노드 생성
- 상위 폴더(배우 폴더)를 기존 트리 노드와 매칭
- 이미지 파일을 children으로 추가 (작품 ID, 품번, 파일명)

### 2. FolderNode 인터페이스 확장

cover images 노드 구분을 위한 플래그:
- `isCoverImagesFolder?: boolean` — cover images 폴더 여부
- cover images 하위 파일에는 `matchedWorkId`, `matchedWorkLabel` 설정

### 3. Files.tsx — FolderItem 표시

cover images 폴더:
- 별도 아이콘/색상으로 구분 (예: 주황/보라 폴더 아이콘)
- 드래그 이동 대상에서 제외 (이동 불가, 드롭 불가)
- 삭제/수정 버튼 비표시 또는 비활성

cover images 하위 이미지 파일:
- 파일명 표시 + 매칭된 작품 라벨 (기존 work_files 파일과 동일 패턴)
- 클릭 시 작품 상세로 이동 (onNavigateToWork)
- 이미지 프리뷰 가능

## 트리 구조 예시

```
배우명 생년월일/                    ← matchedActorId
  cover images/                    ← isCoverImagesFolder = true
    2024-01-01 AAA-001.jpg         ← matchedWorkId (품번 매칭)
    2024-02-01 BBB-002.jpg
  2024-01-01 AAA-001/              ← matchedWorkId (기존)
    AAA-001.mp4
  2024-02-01 BBB-002/
    BBB-002.mp4
```

## 변경 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| ipc-files.ts | buildTree에 cover_path 기반 cover images 노드 추가 |
| Files.tsx | FolderItem에 cover images 폴더 구분 표시, 이미지→작품 연결 |
