# Electron → 웹 전환 가이드

## 현재 구조 vs 웹

| 영역 | 현재 (Electron) | 웹 전환 시 |
|------|----------------|-----------|
| **프론트엔드** | React + Tailwind | 거의 그대로 재사용 가능 |
| **백엔드** | Main process IPC 핸들러 | REST API 서버로 변환 |
| **DB** | SQLite (better-sqlite3, 로컬 파일) | 개인 PC: 그대로 / 클라우드: PostgreSQL 등 |
| **이미지** | 로컬 파일 복사 → base64 전달 | 개인 PC: static 서빙 / 클라우드: S3 + CDN |
| **동영상 재생** | `shell:openPath` (로컬 플레이어) | `<video>` 태그 또는 스트리밍 |
| **폴더 스캔** | 로컬 파일시스템 직접 접근 | 개인 PC: 서버에서 직접 스캔 / 클라우드: 불가 |
| **인증** | 없음 (싱글 유저) | 내부망: 생략 가능 / 외부: 로그인 필요 |

---

## 개인 PC 서버 구축 (권장)

로컬 파일시스템을 그대로 쓸 수 있어서 가장 간단한 전환 경로.

### 필요한 작업

#### 1. 백엔드 서버 (Express + better-sqlite3)

IPC 핸들러를 REST 라우트로 기계적 변환:

```
src/main/ipc-works.ts     → src/server/routes/works.ts
src/main/ipc-actors.ts    → src/server/routes/actors.ts
src/main/ipc-dashboard.ts → src/server/routes/dashboard.ts
src/main/ipc-studios.ts   → src/server/routes/studios.ts
src/main/ipc-tags.ts      → src/server/routes/tags.ts
src/main/ipc-cup.ts       → src/server/routes/cup.ts
```

변환 예시:
```ts
// 현재 (Electron IPC)
ipcMain.handle('works:list', (_e, params) => { ... })

// 변환 후 (Express REST)
router.post('/api/works/list', (req, res) => {
  const params = req.body
  // ... 동일한 로직
  res.json(result)
})
```

DB 코드, 쿼리 로직 전부 복사해서 그대로 사용 가능.

#### 2. 프론트엔드 api.ts 교체

```ts
// 현재 (Electron IPC)
const { api } = window as unknown as { api: { invoke: ... } }
export const worksApi = {
  list: (params) => api.invoke('works:list', params),
}

// 변환 후 (fetch)
async function call(endpoint: string, body?: unknown) {
  const res = await fetch(`/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}
export const worksApi = {
  list: (params) => call('works/list', params),
}
```

#### 3. 이미지/파일 서빙

```ts
// Express에서 로컬 이미지 폴더를 static으로 서빙
app.use('/images', express.static('C:/Users/.../userData/images'))

// 프론트에서 image:read IPC 대신
// <img src="/images/actors/123.jpg">
```

#### 4. 동영상 재생

```ts
// 로컬 동영상 폴더도 static 서빙
app.use('/videos', express.static('D:/Videos'))

// 프론트에서 <video src="/videos/..."> 또는 링크 클릭으로 재생
```

### Electron 기능 제거/대체 목록

| 현재 기능 | 웹 대체 |
|----------|---------|
| `shell:openPath` | `<video>` 태그 또는 다운로드 링크 |
| `shell:openExternal` | `window.open(url)` |
| `shell:showItemInFolder` | 제거 (웹에서 불가) |
| `shell:trashFolders` | 서버 API로 대체 가능 |
| `shell:fileExists` | 서버 API로 확인 |
| `dialog:open-files` | `<input type="file">` + 서버 업로드 |
| `dialog:open-image` | `<input type="file" accept="image/*">` |
| `dialog:open-folder` | 서버 API에서 경로 입력 → 직접 스캔 |
| `scan:folder` | 서버 API에서 직접 스캔 (동일 로직) |
| `image:copy` | 서버에서 직접 복사 (동일 로직) |
| `image:read` | static 파일 서빙으로 대체 |
| Electron preload/contextBridge | 제거 |
| `BrowserWindow` | 제거 (브라우저에서 접속) |

### 변환 후 프로젝트 구조

```
프로젝트/
├── src/server/
│   ├── index.ts            ← Express 서버 진입점
│   ├── db.ts               ← 현재 그대로
│   ├── routes/
│   │   ├── works.ts        ← ipc-works.ts 변환
│   │   ├── actors.ts       ← ipc-actors.ts 변환
│   │   ├── dashboard.ts    ← ipc-dashboard.ts 변환
│   │   ├── studios.ts      ← ipc-studios.ts 변환
│   │   ├── tags.ts         ← ipc-tags.ts 변환
│   │   └── cup.ts          ← ipc-cup.ts 변환
│   └── scan.ts             ← 폴더 스캔 (현재 그대로)
├── src/renderer/           ← React 앱 (거의 그대로)
│   └── src/api.ts          ← invoke → fetch 변환
└── package.json
```

### 작업량 추정

| 작업 | 난이도 | 비고 |
|------|:------:|------|
| Express 서버 세팅 | 낮음 | 기본 설정 |
| IPC → REST 변환 (6파일) | 낮음 | 기계적 변환 |
| api.ts 교체 | 낮음 | 1개 파일 |
| 이미지/파일 static 서빙 | 낮음 | Express static 미들웨어 |
| 동영상 재생 UI | 중 | `<video>` 태그 연동 |
| Electron 의존성 제거 | 낮음 | import 정리 |

---

## 클라우드 웹 배포 시 추가 작업

개인 PC가 아닌 외부 서버/클라우드에 배포할 경우 추가로 필요한 것:

| 작업 | 설명 |
|------|------|
| DB 전환 | SQLite → PostgreSQL/MySQL (스키마 거의 동일, SQLite 특수 문법만 변경) |
| 이미지 스토리지 | 로컬 → S3/CloudFlare R2 등 클라우드 스토리지 |
| 동영상 | 로컬 재생 불가 → 스트리밍 서버 또는 외부 호스팅 |
| 폴더 스캔 | 불가능 → 파일 드래그앤드롭 업로드로 대체 |
| 인증 | 로그인/회원가입, 사용자별 데이터 분리 (DB에 user_id 추가) |
| 배포 | VPS, Vercel, Railway, Docker 등 |

### 기술 선택지

| 옵션 | 장점 | 단점 |
|------|------|------|
| Express/Fastify + better-sqlite3 | 현재 코드 최소 변경 | 멀티유저 시 SQLite 한계 |
| Next.js API Routes | 프론트/백 통합, 배포 쉬움 | 구조 변경 필요 |
| NestJS | 구조적, 타입 안전 | 학습 곡선, 작업량 큼 |

---

## 핵심 요약

- 개인 PC 서버: **IPC → REST 변환 + api.ts 교체**가 거의 전부. SQLite, 로컬 파일, 폴더 스캔 전부 그대로 유지 가능.
- 클라우드 웹: 파일/이미지/동영상 처리 방식 변경이 가장 큰 과제. DB 전환, 인증 추가 필요.
- 프론트엔드 컴포넌트는 두 경우 모두 거의 그대로 재사용 가능.
