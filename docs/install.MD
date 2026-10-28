# Windows 설치 프로그램 만들기

이 프로젝트는 **Electron + React + TypeScript** 앱이며, `electron-builder`를 사용해 Windows 설치 프로그램(`.exe`)을 생성할 수 있습니다.

---

## 1. 현재 빌드 설정 상태

`package.json`의 `build` 섹션에서 win 타겟이 현재 `dir`(폴더 출력)로 설정되어 있습니다.
설치 프로그램을 만들려면 타겟을 `nsis`로 변경해야 합니다.

---

## 2. package.json 수정

`package.json`의 `build.win.target` 부분을 아래와 같이 수정합니다:

```json
"win": {
  "target": [
    {
      "target": "nsis",
      "arch": ["x64"]
    }
  ],
  "signAndEditExecutable": false
},
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "AMNG"
}
```

### 주요 NSIS 옵션 설명

| 옵션 | 설명 |
|------|------|
| `oneClick` | `false` = 설치 경로 선택 화면 표시, `true` = 원클릭 자동 설치 |
| `allowToChangeInstallationDirectory` | 사용자가 설치 경로를 변경할 수 있게 허용 |
| `createDesktopShortcut` | 바탕화면에 바로가기 생성 |
| `createStartMenuShortcut` | 시작 메뉴에 바로가기 생성 |
| `shortcutName` | 바로가기 이름 |

---

## 3. 빌드 명령어

### 설치 프로그램 빌드 (`.exe` 생성)

```bash
npm run package
```

`package.json`의 `package` 스크립트가 `electron-vite build && electron-builder --win`을 실행합니다.

빌드가 완료되면 `release/` 폴더에 다음 파일이 생성됩니다:

```
release/
  AMNG Setup 1.0.0.exe      ← 설치 프로그램
  AMNG Setup 1.0.0.exe.blockmap
  builder-debug.yml
  latest.yml
```

---

## 4. 빌드 전 사전 조건

### Node.js & npm
- Node.js 18 이상 권장
- 설치 확인: `node -v`, `npm -v`

### 의존성 설치
```bash
npm install
```

### better-sqlite3 네이티브 모듈
`better-sqlite3`는 네이티브 C++ 모듈이므로 빌드 도구가 필요합니다.

```bash
npm install --global windows-build-tools
```

또는 Visual Studio Build Tools(C++ 워크로드 포함)를 설치합니다.

---

## 5. 빌드 단계 요약

```
1. npm install                  # 의존성 설치
2. package.json 수정 (위 2번 참고)
3. npm run package              # 빌드 + 설치 프로그램 생성
4. release/ 폴더에서 .exe 확인
```

---

## 6. 앱 아이콘 설정 (선택)

설치 프로그램과 앱에 아이콘을 적용하려면:

1. `256x256` 이상의 `.ico` 파일 준비 (예: `build/icon.ico`)
2. `package.json`에 추가:

```json
"win": {
  "icon": "build/icon.ico",
  ...
}
```

---

## 7. 자동 업데이트 (선택)

`electron-updater`를 사용하면 앱 내에서 자동 업데이트를 지원할 수 있습니다.

```bash
npm install electron-updater
```

`package.json`에 `publish` 설정을 추가하고, main 프로세스에서 `autoUpdater`를 초기화합니다.
(자세한 설정은 electron-builder 공식 문서 참고)

---

## 8. 타겟 종류 비교

| 타겟 | 출력 | 특징 |
|------|------|------|
| `dir` | 폴더 | 설치 없이 바로 실행, 배포용 아님 |
| `nsis` | `.exe` | 가장 일반적인 Windows 설치 프로그램 |
| `msi` | `.msi` | 기업 환경(그룹 정책 배포)에 적합 |
| `portable` | `.exe` | 설치 없이 실행되는 단일 실행 파일 |

일반 사용자 배포에는 **nsis**를 권장합니다.