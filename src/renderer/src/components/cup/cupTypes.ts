export type CupTournament = {
  id: number
  type: 'actor' | 'work'
  name: string
  is_master: number
  format: 'tournament' | 'league' | 'worldcup'
  division_range: string | null
  filter_json: string | null
  created_at: string
  // latest run (LEFT JOIN)
  latest_run_id: number | null
  latest_run_status: 'in_progress' | 'completed' | null
  round_total: number | null
  winner_id: number | null
  started_at: string | null
  completed_at: string | null
  winner_name: string | null
  winner_photo: string | null
}

export type CupRun = {
  id: number
  tournament_id: number
  status: 'in_progress' | 'completed'
  round_total: number | null
  winner_id: number | null
  settings_snapshot: string | null
  started_at: string
  completed_at: string | null
}

export type CupMatch = {
  id: number
  tournament_id: number
  phase: 'group' | 'tiebreak' | 'main'
  group_id: number | null
  block_id: number | null
  round: number
  match_index: number
  item1_id: number
  item2_id: number | null
  winner_id: number | null
  is_bye: number
  is_draw: number
}

export type ItemInfo = {
  id: number
  name?: string
  photo_path?: string | null
  title?: string | null
  product_number?: string | null
  cover_path?: string | null
  rating?: number | null
  release_date?: string | null
  is_favorite?: number | null
  delete_pending?: number | null
  comment?: string | null
  files?: { id: number; file_path: string; type: string }[]
  actors?: { id: number; name: string }[]
  rep_actors?: { id: number; name: string }[]
}

export type StandingsRow = { item_id: number; pts: number; w: number; d: number; l: number }

export type TournamentRankRow = {
  item_id: number
  total_runs: number
  run_wins: number
  total_matches: number
  match_wins: number
  win_rate: number
  match_win_rate: number
  total_pts: number
  name?: string
  photo_path?: string | null
  title?: string | null
  product_number?: string | null
  cover_path?: string | null
}

export type LastRunRankRow = {
  rank: number
  item_id: number
  elim_round: number | null
  pts: number | null
  run_pts: number | null
  name?: string
  photo_path?: string | null
  title?: string | null
  product_number?: string | null
  cover_path?: string | null
}

export type RankingSettings = {
  basePoints: { win: number; draw: number; loss: number }
  divisionWeights: number[]
  opponentWeights: number[]
  rankBonus: Record<string, Record<string, number>>
  worldcupMainMultiplier?: number
  recentRunLimit?: number
  h2hMinMatches?: number
}

export type MasterRankRow = {
  rank: number
  id: number
  name?: string
  photo_path?: string | null
  title?: string | null
  product_number?: string | null
  cover_path?: string | null
  total_points: number
  master_run_count: number
  total_cups: number
  cup_wins: number
  total_matches: number
  match_wins: number
  last_run_points?: number | null
}

export type FormatStat = {
  format: 'worldcup' | 'tournament' | 'league'
  total_cups: number
  cup_wins: number
  total_matches: number
  match_wins: number
}

export type H2HRow = {
  opp_id: number; total: number; wins: number; losses: number; draws: number; opp_rank?: number | null
  name?: string; title?: string; product_number?: string; photo_path?: string; cover_path?: string
}

export type DivHistEntry = { recorded_at: string; rank: number; total_points: number }

export type RateTooltip = {
  item_id: number
  x: number
  y: number
  name: string
  wins: number
  total: number
}
