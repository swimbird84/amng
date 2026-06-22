# Home 탭

## 개요
앱 진입 화면. 작품/배우 총 수량과 찜(favorite) 수를 보여주고, Works/Actors 탭으로 이동하는 네비게이션 허브.

## 파일 구조
- **페이지**: `src/renderer/src/pages/Home.tsx`
- **API**: `src/renderer/src/api.ts` (worksApi, actorsApi)
- **IPC 핸들러**: `src/main/ipc-works.ts`, `src/main/ipc-actors.ts`

## 주요 기능

### 통계 카드 표시
- 작품 총 수, 찜 작품 수, 배우 총 수, 찜 배우 수

### 탭 네비게이션
- 작품 카드 클릭 → Works 탭 이동
- 배우 카드 클릭 → Actors 탭 이동

## 사용 API 함수

| API 함수 | IPC 채널 | 설명 |
|----------|----------|------|
| `worksApi.list()` | `works:list` | 작품 전체 목록 → 개수 계산 |
| `worksApi.list({ favoriteOnly: true })` | `works:list` | 찜 작품 목록 → 개수 계산 |
| `actorsApi.list()` | `actors:list` | 배우 전체 목록 → 개수 계산 |
| `actorsApi.list({ favoriteOnly: true })` | `actors:list` | 찜 배우 목록 → 개수 계산 |

## 관련 DB 테이블

| 테이블 | 역할 |
|--------|------|
| `works` | 작품 목록 (is_favorite 필터) |
| `actors` | 배우 목록 (is_favorite 필터) |

## 관련 쿼리
- `works:list`: works 테이블에서 조건부 SELECT (favoriteOnly 시 `WHERE w.is_favorite = 1`)
- `actors:list`: actors + actor_scores JOIN SELECT (favoriteOnly 시 `WHERE a.is_favorite = 1`)
