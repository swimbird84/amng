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
  scoreGradeCounts: (excludeId?: number) => api.invoke('actors:scoreGradeCounts', excludeId) as Promise<Record<string, Record<number, { count: number; names: string }>>>,
  workTags: (actorId: number) => api.invoke('actors:workTags', actorId) as Promise<{ category_id: number | null; category_name: string | null; category_sort_order: number | null; tag_id: number; tag_name: string; count: number }[]>,
}

// 배우 추가 사진
export const actorPhotosApi = {
  list: (actorId: number) => api.invoke('actor-photos:list', actorId) as Promise<{ id: number; actor_id: number; photo_path: string; sort_order: number }[]>,
  add: (actorId: number, photoPath: string) => api.invoke('actor-photos:add', actorId, photoPath) as Promise<number>,
  delete: (photoId: number) => api.invoke('actor-photos:delete', photoId) as Promise<boolean>,
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

// 태그 연결
export const workTagLinksApi = {
  list: () => api.invoke('work-tag-links:list') as Promise<{ parent_tag_id: number; child_tag_id: number }[]>,
  set: (parentId: number, childIds: number[]) => api.invoke('work-tag-links:set', parentId, childIds),
}

export const actorTagLinksApi = {
  list: () => api.invoke('actor-tag-links:list') as Promise<{ parent_tag_id: number; child_tag_id: number }[]>,
  set: (parentId: number, childIds: number[]) => api.invoke('actor-tag-links:set', parentId, childIds),
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
  listAll: () => api.invoke('studio-codes:listAll') as Promise<{ id: number; studio_id: number; code: string }[]>,
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
  onProgress: (cb: (count: number) => void) => (window.api as any).onScanProgress(cb),
  offProgress: (handler: unknown) => (window.api as any).offScanProgress(handler),
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
  actorScoreDist: () => api.invoke('dashboard:actor-score-dist'),
  actorPhysicalDist: () => api.invoke('dashboard:actor-physical-dist'),
  ratingWorks: (bucket: number) => api.invoke('dashboard:rating-works', bucket),
  debutAgeDist: () => api.invoke('dashboard:debut-age-dist'),
  debutYears: () => api.invoke('dashboard:debut-years'),
  debutMonths: (year: string) => api.invoke('dashboard:debut-months', year),
  debutMonthActors: (year: string, month: number) => api.invoke('dashboard:debut-month-actors', year, month),
  rankChangeChart: (type: 'actor' | 'work', limit?: number, rankFrom?: number, rankTo?: number) => api.invoke('dashboard:rank-change-chart', { type, limit, rankFrom, rankTo }) as Promise<{
    runs: { runId: number; label: string; completedAt: string }[]
    series: { id: number; name: string; photo_path: string | null; currentRank: number; ranks: (number | null)[]; globalRanks: (number | null)[]; displayRanks: (number | null)[] }[]
  }>,
}

// 이미지
export const imageApi = {
  copy: (src: string, type: 'works' | 'actors', id: number) => api.invoke('image:copy', src, type, id),
  read: (path: string) => api.invoke('image:read', path),
}

// 컵 대회
export const cupApi = {
  list: (params?: { type?: 'actor' | 'work'; isMaster?: boolean; search?: string; sortBy?: string; sortDir?: string; format?: 'tournament' | 'league' | 'worldcup' }) =>
    api.invoke('cup:list', params),
  get: (tournamentId: number) =>
    api.invoke('cup:get', tournamentId),
  create: (params: { type: 'actor' | 'work'; name: string; isMaster: boolean; format: 'tournament' | 'league' | 'worldcup'; divisionRange?: number[] | null; filterJson?: object | null }) =>
    api.invoke('cup:create', params),
  update: (params: { id: number; name?: string; divisionRange?: number[] | null; filterJson?: object | null }) =>
    api.invoke('cup:update', params),
  delete: (id: number) =>
    api.invoke('cup:delete', id),
  standings: (runId: number) =>
    api.invoke('cup:standings', runId),
  itemCount: (tournamentId: number) =>
    api.invoke('cup:item-count', { tournamentId }) as Promise<number>,
  divisionCounts: (type: 'actor' | 'work') =>
    api.invoke('cup:division-counts', { type }) as Promise<{ division: number; count: number }[]>,
  start: (tournamentId: number, roundTotal: number, force?: boolean) =>
    api.invoke('cup:start', { tournamentId, roundTotal, force }),
  clearRun: (tournamentId: number) =>
    api.invoke('cup:clear-run', tournamentId),
  pick: (matchId: number, winnerId: number | null, isDraw?: boolean) =>
    api.invoke('cup:pick', { matchId, winnerId, isDraw }),
  tournamentRankings: (tournamentId: number, params?: { limit?: number; offset?: number; sortBy?: string; sortDir?: string; search?: string }) =>
    api.invoke('cup:tournament-rankings', { tournamentId, ...params }) as Promise<{ rows: unknown[]; total: number }>,
  runProgress: (runId: number) =>
    api.invoke('cup:run-progress', runId) as Promise<{ match: { round: number; match_index: number; phase: string; group_id: number | null } | null; total: number; done: number; groupMatchDone: number | null; groupMatchTotal: number | null; groupsDone: number | null; groupsTotal: number | null; mainRoundDone: number | null; mainRoundTotal: number | null }>,
  lastRunRankings: (tournamentId: number, params?: { limit?: number; offset?: number }) =>
    api.invoke('cup:last-run-rankings', { tournamentId, ...params }) as Promise<{ rows: unknown[]; total: number; runId: number | null; format?: string }>,
  tournamentStats: (tournamentId: number) =>
    api.invoke('cup:tournament-stats', tournamentId) as Promise<{ total_runs: number; completed_runs: number; last_run_at: string | null; participated_items: number; run_dist: { run_count: number; count: number }[] } | null>,
  itemTournamentStats: (tournamentId: number, itemId: number) =>
    api.invoke('cup:item-tournament-stats', { tournamentId, itemId }) as Promise<{ total_runs: number; run_wins: number; total_matches: number; match_wins: number; win_rate: number; match_win_rate: number; rank: number }>,
  rankHistory: (tournamentId: number, itemId: number) =>
    api.invoke('cup:rank-history', { tournamentId, itemId }) as Promise<{ rank: number; recorded_at: string }[]>,
  headToHead: (type: 'actor' | 'work', itemId: number) =>
    api.invoke('cup:head-to-head', { type, itemId }) as Promise<{ opp_id: number; total: number; wins: number; losses: number; draws: number; opp_rank?: number | null; name?: string; title?: string; product_number?: string; photo_path?: string; cover_path?: string }[]>,
}

// 랭킹 설정
export const rankingSettingsApi = {
  get: (type: 'actor' | 'work') =>
    api.invoke('ranking-settings:get', type),
  update: (type: 'actor' | 'work', settings: object) =>
    api.invoke('ranking-settings:update', type, settings),
}

// 마스터 랭킹
export const masterRankingApi = {
  list: (params: { type: 'actor' | 'work'; limit?: number; offset?: number; search?: string; division?: number; sortBy?: string; sortDir?: 'asc' | 'desc' }) =>
    api.invoke('master-ranking:list', params) as Promise<{ rows: unknown[]; total: number }>,
  reset: (type: 'actor' | 'work') =>
    api.invoke('master-ranking:reset', type),
  recalcRun: (runId: number) =>
    api.invoke('master-ranking:recalcRun', runId) as Promise<{ ok: boolean }>,
  rankTrends: (type: 'actor' | 'work') =>
    api.invoke('master-ranking:rank-trends', type) as Promise<{ item_id: number; prev_rank: number | null }[]>,
  itemFormatStats: (type: 'actor' | 'work', itemId: number) =>
    api.invoke('master-ranking:item-format-stats', { type, itemId }) as Promise<{ format: 'worldcup' | 'tournament' | 'league'; total_cups: number; cup_wins: number; total_matches: number; match_wins: number }[]>,
  rankHistory: (type: 'actor' | 'work', itemId: number, limit?: number) =>
    api.invoke('master-ranking:rank-history', { type, itemId, limit: limit ?? 0 }) as Promise<{ rank: number; recorded_at: string; tournament_name: string }[]>,
  divisionHistory: (type: 'actor' | 'work', itemId: number) =>
    api.invoke('master-ranking:division-history', { type, itemId }) as Promise<{ recorded_at: string; rank: number; total_points: number }[]>,
  itemStats: (type: 'actor' | 'work', itemId: number) =>
    api.invoke('master-ranking:item-stats', { type, itemId }) as Promise<{ rank: number; total_points: number; total_cups: number; cup_wins: number; total_matches: number; match_wins: number; win_rate: number; match_win_rate: number }>,
  workActorDistribution: () =>
    api.invoke('master-ranking:work-actor-distribution') as Promise<{
      divisions: { division: number; actors: { id: number; name: string; photo_path: string | null; work_count: number; avg_rank: number; best_rank: number; worst_rank: number; actor_rank: number | null }[] }[]
      allActors: { id: number; name: string; photo_path: string | null; work_count: number; avg_rank: number; best_rank: number; worst_rank: number; actor_rank: number | null }[]
    }>,
  workLabelDistribution: () =>
    api.invoke('master-ranking:work-label-distribution') as Promise<{
      divisions: { division: number; labels: { id: number; name: string; color: string | null; maker_name: string | null; maker_color: string | null; work_count: number; avg_rank: number; best_rank: number; worst_rank: number }[] }[]
      allLabels: { id: number; name: string; color: string | null; maker_name: string | null; maker_color: string | null; work_count: number; avg_rank: number; best_rank: number; worst_rank: number }[]
    }>,
  workMakerDistribution: () =>
    api.invoke('master-ranking:work-maker-distribution') as Promise<{
      divisions: { division: number; makers: { id: number; name: string; color: string | null; work_count: number; label_count: number; avg_rank: number; best_rank: number; worst_rank: number }[] }[]
      allMakers: { id: number; name: string; color: string | null; work_count: number; label_count: number; avg_rank: number; best_rank: number; worst_rank: number }[]
    }>,
}
