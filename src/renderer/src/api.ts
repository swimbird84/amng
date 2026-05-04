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
  physicalData: () => api.invoke('actors:physical-data'),
  findOrCreate: (name: string, birthday?: string) => api.invoke('actors:findOrCreate', name, birthday) as Promise<number>,
}

// 태그 카테고리
export const workTagCategoriesApi = {
  list: () => api.invoke('work-tag-categories:list'),
  create: (name: string) => api.invoke('work-tag-categories:create', name),
  update: (id: number, name: string) => api.invoke('work-tag-categories:update', id, name),
  delete: (id: number) => api.invoke('work-tag-categories:delete', id),
  reorder: (ids: number[]) => api.invoke('work-tag-categories:reorder', ids),
  setTagCategory: (tagId: number, categoryId: number | null) => api.invoke('work-tag-categories:setTagCategory', tagId, categoryId),
}

export const actorTagCategoriesApi = {
  list: () => api.invoke('actor-tag-categories:list'),
  create: (name: string) => api.invoke('actor-tag-categories:create', name),
  update: (id: number, name: string) => api.invoke('actor-tag-categories:update', id, name),
  delete: (id: number) => api.invoke('actor-tag-categories:delete', id),
  reorder: (ids: number[]) => api.invoke('actor-tag-categories:reorder', ids),
  setTagCategory: (tagId: number, categoryId: number | null) => api.invoke('actor-tag-categories:setTagCategory', tagId, categoryId),
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
  create: (name: string, makerId?: number | null, color?: string | null) => api.invoke('studios:create', name, makerId, color),
  update: (id: number, name: string, color?: string | null) => api.invoke('studios:update', id, name, color),
  delete: (id: number) => api.invoke('studios:delete', id),
}

// 제작사
export const makersApi = {
  list: (withCount?: boolean) => api.invoke('makers:list', withCount),
  create: (name: string, color?: string | null) => api.invoke('makers:create', name, color) as Promise<number>,
  update: (id: number, name: string, color?: string | null) => api.invoke('makers:update', id, name, color),
  delete: (id: number) => api.invoke('makers:delete', id),
  assignStudio: (studioId: number, makerId: number | null) => api.invoke('makers:assignStudio', studioId, makerId),
}

// 레이블 코드
export const studioCodesApi = {
  list: (studioId: number) => api.invoke('studio-codes:list', studioId) as Promise<{ id: number; studio_id: number; code: string }[]>,
  create: (studioId: number, code: string) => api.invoke('studio-codes:create', studioId, code) as Promise<number>,
  update: (id: number, code: string) => api.invoke('studio-codes:update', id, code) as Promise<boolean>,
  delete: (id: number) => api.invoke('studio-codes:delete', id) as Promise<boolean>,
  lookup: (code: string) => api.invoke('studio-codes:lookup', code) as Promise<number | null>,
  applyToWorks: (studioId: number, code: string) => api.invoke('studio-codes:applyToWorks', studioId, code) as Promise<number>,
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
  showItemInFolder: (filePath: string) => api.invoke('shell:showItemInFolder', filePath) as Promise<void>,
  fileExists: (filePath: string) => api.invoke('shell:fileExists', filePath) as Promise<boolean>,
  deleteFiles: (paths: string[]) => api.invoke('shell:deleteFiles', paths) as Promise<number>,
  trashFolders: (filePaths: string[]) => api.invoke('shell:trashFolders', filePaths) as Promise<number>,
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
  actorScoreRanking: (limit?: number, reverse?: boolean) => api.invoke('dashboard:actor-score-ranking', limit, reverse),
  actorWorkCountRanking: (limit?: number, reverse?: boolean) => api.invoke('dashboard:actor-workcount-ranking', limit, reverse),
  actorBustRanking: (limit?: number, reverse?: boolean) => api.invoke('dashboard:actor-bust-ranking', limit, reverse),
  actorHipRanking: (limit?: number, reverse?: boolean) => api.invoke('dashboard:actor-hip-ranking', limit, reverse),
  actorWaistRanking: (limit?: number, reverse?: boolean) => api.invoke('dashboard:actor-waist-ranking', limit, reverse),
  actorHeightRanking: (limit?: number, reverse?: boolean) => api.invoke('dashboard:actor-height-ranking', limit, reverse),
  actorRatioRanking: (limit?: number, reverse?: boolean) => api.invoke('dashboard:actor-ratio-ranking', limit, reverse),
  actorFavoriteRanking: (limit?: number, reverse?: boolean) => api.invoke('dashboard:actor-favorite-ranking', limit, reverse),
  workTagDist: () => api.invoke('dashboard:work-tag-dist'),
  actorTagDist: () => api.invoke('dashboard:actor-tag-dist'),
  actorScoreDist: () => api.invoke('dashboard:actor-score-dist'),
  actorCupDist: () => api.invoke('dashboard:actor-cup-dist'),
  ratingWorks: (bucket: number) => api.invoke('dashboard:rating-works', bucket),
  debutYears: () => api.invoke('dashboard:debut-years'),
  debutMonths: (year: string) => api.invoke('dashboard:debut-months', year),
  debutMonthActors: (year: string, month: number) => api.invoke('dashboard:debut-month-actors', year, month),
  studioDist: () => api.invoke('dashboard:studio-dist'),
}

// 이미지
export const imageApi = {
  copy: (src: string, type: 'works' | 'actors', id: number) => api.invoke('image:copy', src, type, id),
  read: (path: string) => api.invoke('image:read', path),
}
