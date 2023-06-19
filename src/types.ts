/* 
 Reverse-engineered raw player data, all are strings:
 0 unknown
 1 name
 2 gender
 3 super region
 4 region/country
 5 score (for example level or TP/LP)
 6 sub score (for example exp)
 7 unknown
 8 id
 */

type Player = {
  id: string
  name: string
  score: number
  region: string
}

type RankedPlayer = Player & {
  worldRank: number
  localRank: number
}

type LeaderboardResponse = {
  draw: number // Seems to be always 9
  records: number,
  recordsFiltered: number,
  data: string[][]
}
