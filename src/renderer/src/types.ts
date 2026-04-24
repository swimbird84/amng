export interface Studio {
  id: number
  name: string
  color: string | null
  work_count?: number
}

export interface WorkFile {
  id: number
  work_id: number
  file_path: string
  type: 'local' | 'url'
  sort_order: number
}

export interface Work {
  id: number
  file_path: string
  cover_path: string | null
  product_number: string | null
  title: string | null
  release_date: string | null
  rating: number
  is_favorite: number
  comment: string | null
  studio_id: number | null
  studio_name: string | null
  studio_color: string | null
  created_at: string
  actors?: Actor[]
  tags?: Tag[]
  rep_tags?: Tag[]
  files?: WorkFile[]
}

export interface ActorScores {
  face: number
  bust: number
  hip: number
  physical: number
  skin: number
  acting: number
  sexy: number
  charm: number
  technique: number
  proportions: number
}

export interface Actor {
  id: number
  photo_path: string | null
  name: string
  birthday: string | null
  debut_date: string | null
  is_favorite: number
  height: number | null
  bust: number | null
  waist: number | null
  hip: number | null
  cup: string | null
  comment: string | null
  avg_score?: number
  work_count?: number
  ratio_score?: number
  created_at: string
  works?: Work[]
  tags?: Tag[]
  rep_tags?: Tag[]
  scores?: ActorScores
}

export interface Tag {
  id: number
  name: string
}
