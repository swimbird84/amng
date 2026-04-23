const { api } = window as unknown as { api: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> } }

// 작품
export const worksApi = {
  list: (params?: object) => api.invoke('works:list', params),
  get: (id: number) => api.invoke('works:get', id),
  create: (data: object) => api.invoke('works:create', data),
  update: (id: number, data: object) => api.invoke('works:update', id, data),
  delete: (id: number) => api.invoke('works:delete', id),
}

// 배우
export const actorsApi = {
  list: (params?: object) => api.invoke('actors:list', params),
  get: (id: number) => api.invoke('actors:get', id),
  create: (data: object) => api.invoke('actors:create', data),
  update: (id: number, data: object) => api.invoke('actors:update', id, data),
  delete: (id: number) => api.invoke('actors:delete', id),
}

// 태그
export const workTagsApi = {
  list: (withCount?: boolean) => api.invoke('work-tags:list', withCount),
  create: (name: string) => api.invoke('work-tags:create', name),
  update: (id: number, name: string) => api.invoke('work-tags:update', id, name),
  delete: (id: number) => api.invoke('work-tags:delete', id),
}

export const actorTagsApi = {
  list: (withCount?: boolean) => api.invoke('actor-tags:list', withCount),
  create: (name: string) => api.invoke('actor-tags:create', name),
  update: (id: number, name: string) => api.invoke('actor-tags:update', id, name),
  delete: (id: number) => api.invoke('actor-tags:delete', id),
}

// 제작사
export const studiosApi = {
  list: (withCount?: boolean) => api.invoke('studios:list', withCount),
  create: (name: string) => api.invoke('studios:create', name),
  update: (id: number, name: string, color?: string | null) => api.invoke('studios:update', id, name, color),
  delete: (id: number) => api.invoke('studios:delete', id),
}

// 다이얼로그
export const dialogApi = {
  openFiles: () => api.invoke('dialog:open-files'),
  openImage: () => api.invoke('dialog:open-image'),
  openFolder: () => api.invoke('dialog:open-folder'),
}

// 스캔
export const scanApi = {
  folder: (path: string) => api.invoke('scan:folder', path),
}

// 작품 파일
export const workFilesApi = {
  add: (workId: number, filePath: string) => api.invoke('work-files:add', workId, filePath),
  delete: (fileId: number) => api.invoke('work-files:delete', fileId),
}

// 셸
export const shellApi = {
  openPath: (filePath: string) => api.invoke('shell:openPath', filePath) as Promise<string>,
  openExternal: (url: string) => api.invoke('shell:openExternal', url) as Promise<boolean>,
  fileExists: (filePath: string) => api.invoke('shell:fileExists', filePath) as Promise<boolean>,
  deleteFiles: (paths: string[]) => api.invoke('shell:deleteFiles', paths) as Promise<number>,
}

// 대시보드
export const dashboardApi = {
  newWorks: () => api.invoke('dashboard:new-works'),
  releaseYears: () => api.invoke('dashboard:release-years'),
  releaseMonths: (year: string) => api.invoke('dashboard:release-months', year),
  releaseWorks: (year: string, month: number) => api.invoke('dashboard:release-works', year, month),
  ratingDist: () => api.invoke('dashboard:rating-dist'),
  newActors: () => api.invoke('dashboard:new-actors'),
  ageDist: () => api.invoke('dashboard:age-dist'),
  actorScoreRanking: (limit?: number) => api.invoke('dashboard:actor-score-ranking', limit),
  actorWorkCountRanking: (limit?: number) => api.invoke('dashboard:actor-workcount-ranking', limit),
  actorBustRanking: (limit?: number) => api.invoke('dashboard:actor-bust-ranking', limit),
  actorHipRanking: (limit?: number) => api.invoke('dashboard:actor-hip-ranking', limit),
  actorWaistRanking: (limit?: number) => api.invoke('dashboard:actor-waist-ranking', limit),
  actorFavoriteRanking: (limit?: number) => api.invoke('dashboard:actor-favorite-ranking', limit),
  workTagDist: () => api.invoke('dashboard:work-tag-dist'),
  actorTagDist: () => api.invoke('dashboard:actor-tag-dist'),
  actorScoreDist: () => api.invoke('dashboard:actor-score-dist'),
  actorCupDist: () => api.invoke('dashboard:actor-cup-dist'),
  ratingWorks: (bucket: number) => api.invoke('dashboard:rating-works', bucket),
  studioDist: () => api.invoke('dashboard:studio-dist'),
}

// 이미지
export const imageApi = {
  copy: (src: string, type: 'works' | 'actors', id: number) => api.invoke('image:copy', src, type, id),
  read: (path: string) => api.invoke('image:read', path),
}
