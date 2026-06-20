export type TagMode = 'and' | 'or'

export interface WorkSearchParams {
  keyword: string
  tagIds: number[]
  tagMode: TagMode
  actorId: number | ''
  studioId: number | ''
  releaseDateFrom: string
  releaseDateTo: string
  releaseDateNull: boolean
  ratingFrom: number | ''
  ratingTo: number | ''
  titleSearch: string
  titleNull: boolean
  commentSearch: string
  commentNull: boolean
  actorCountFrom: number | ''
  actorCountTo: number | ''
  actorCountNull: boolean
  favoriteOnly: boolean
  deletePending: boolean
}

export interface ActorSearchParams {
  keyword: string
  tagIds: number[]
  tagMode: TagMode
  ageFrom: number | ''
  ageTo: number | ''
  debutDateFrom: string
  debutDateTo: string
  workCountFrom: number | ''
  workCountTo: number | ''
  avgRatingFrom: number | ''
  avgRatingTo: number | ''
  faceFrom: number | ''; faceTo: number | ''
  bustScoreFrom: number | ''; bustScoreTo: number | ''
  hipScoreFrom: number | ''; hipScoreTo: number | ''
  physicalScoreFrom: number | ''; physicalScoreTo: number | ''
  skinFrom: number | ''; skinTo: number | ''
  actingFrom: number | ''; actingTo: number | ''
  sexyFrom: number | ''; sexyTo: number | ''
  charmFrom: number | ''; charmTo: number | ''
  techniqueFrom: number | ''; techniqueTo: number | ''
  proportionsFrom: number | ''; proportionsTo: number | ''
  ratioScoreFrom: number | ''; ratioScoreTo: number | ''
  heightFrom: number | ''; heightTo: number | ''
  bustFrom: number | ''; bustTo: number | ''
  waistFrom: number | ''; waistTo: number | ''
  hipFrom: number | ''; hipTo: number | ''
  cupFrom: string; cupTo: string
  ageNull: boolean
  debutDateNull: boolean
  workCountNull: boolean
  heightNull: boolean
  bustNull: boolean
  waistNull: boolean
  hipNull: boolean
  cupNull: boolean
  scoreExcluded: boolean
  favoriteOnly: boolean
  commentSearch: string
  commentNull: boolean
  deletePending: boolean
}

export const DEFAULT_WORK_SEARCH: WorkSearchParams = {
  keyword: '', tagIds: [], tagMode: 'and', actorId: '', studioId: '',
  releaseDateFrom: '', releaseDateTo: '', releaseDateNull: false, ratingFrom: '', ratingTo: '',
  titleSearch: '', titleNull: false, commentSearch: '', commentNull: false,
  actorCountFrom: '', actorCountTo: '', actorCountNull: false,
  favoriteOnly: false,
  deletePending: false,
}

export const DEFAULT_ACTOR_SEARCH: ActorSearchParams = {
  keyword: '', tagIds: [], tagMode: 'and',
  ageFrom: '', ageTo: '', ageNull: false, debutDateFrom: '', debutDateTo: '', debutDateNull: false,
  workCountFrom: '', workCountTo: '', workCountNull: false, avgRatingFrom: '', avgRatingTo: '',
  faceFrom: '', faceTo: '', bustScoreFrom: '', bustScoreTo: '',
  hipScoreFrom: '', hipScoreTo: '', physicalScoreFrom: '', physicalScoreTo: '',
  skinFrom: '', skinTo: '', actingFrom: '', actingTo: '',
  sexyFrom: '', sexyTo: '', charmFrom: '', charmTo: '',
  techniqueFrom: '', techniqueTo: '', proportionsFrom: '', proportionsTo: '',
  ratioScoreFrom: '', ratioScoreTo: '',
  heightFrom: '', heightTo: '', bustFrom: '', bustTo: '',
  waistFrom: '', waistTo: '', hipFrom: '', hipTo: '',
  cupFrom: '', cupTo: '',
  heightNull: false, bustNull: false, waistNull: false, hipNull: false, cupNull: false,
  scoreExcluded: false,
  favoriteOnly: false,
  commentSearch: '', commentNull: false,
  deletePending: false,
}
