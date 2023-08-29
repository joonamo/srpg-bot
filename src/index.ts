import { splitEvery } from 'ramda'

export interface Env {
  apiKey: string
  webhook: string
  customEmoji?: { up?: string; down?: string; new?: string }
  messageTitle?: string
  ignorePlayers: string[]
  regions: string[]

  scoreHistory: KVNamespace
}

const listApi =
  'https://srpg7.groovestats.com/api/get-ranking.php?type=tplp&gender=all&superregion=all&country=all'
const scoreKey = 'last-scores'

const medals: string[] = ['0', '🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']

const doIt = async (env: Env) => {
  const lastScoreData = await env.scoreHistory.get(scoreKey)

  const lastScores: RankedPlayer[] = (lastScoreData && JSON.parse(lastScoreData ?? '')) ?? []

  console.log('Calling SRPG API')
  const data = await fetch(listApi)
  console.log(`Api call succesful: ${data.ok}, status: ${data.status}`)
  const leaderboardData = await data.json<LeaderboardResponse>()
  console.log(`Leaderboard data loaded. Records: ${leaderboardData.records}`)

  const players = leaderboardData.data
    .map<Player>((rawPlayer) => ({
      id: rawPlayer[8],
      name: rawPlayer[1],
      region: rawPlayer[4],
      score: parseInt(rawPlayer[5], 10),
    }))
    .sort((a, b) => b.score - a.score)

  let localPlacement = 1
  const interestingPlayers = players.flatMap<RankedPlayer>((player, index) => {
    if (
      env.ignorePlayers.includes(player.name.toLocaleLowerCase()) ||
      !env.regions.includes(player.region.toLocaleLowerCase())
    )
      return []

    return [
      {
        ...player,
        worldRank: index + 1,
        localRank: localPlacement++,
      },
    ]
  })

  await env.scoreHistory.put(scoreKey, JSON.stringify(interestingPlayers))

  const outputLines: string[] = []

  const scorePadding = interestingPlayers[interestingPlayers.length - 1].worldRank.toString().length

  for (const player of interestingPlayers) {
    const lastScore: RankedPlayer | undefined = lastScores.find(
      (lastScore) => lastScore.id === player.id
    )
    const localPlacementDiff = lastScore && lastScore.localRank - player.localRank
    const changeLabel =
      localPlacementDiff === undefined
        ? env.customEmoji?.new ?? '🆕'
        : localPlacementDiff > 0
        ? env.customEmoji?.up ?? '🔼'
        : localPlacementDiff < 0
        ? env.customEmoji?.down ?? '🔻'
        : '`--`'

    const rpDiff = player.score - (lastScore?.score ?? 0)
    const rpDiffString =
      rpDiff > 0 && localPlacementDiff !== undefined
        ? `(${env.customEmoji?.up ?? '🔼'} +*${rpDiff.toLocaleString('fi')}*)`
        : ''

    outputLines.push(
      `${medals[player.localRank] ?? `\`${player.localRank}\``} \`#${player.worldRank
        .toString()
        .padEnd(scorePadding)}\` ${changeLabel} **${player.name}** - ${player.score.toLocaleString('fi')} ${rpDiffString}`
    )
  }

  console.log('Sending title...')
  const webhookResult = await fetch(env.webhook, {
    method: 'POST',
    body: JSON.stringify({ content: env.messageTitle ?? '🛡️ SRPG VII scores (TP+LP) ⚔️' }),
    headers: { 'content-type': 'application/json;charset=UTF-8' },
  })
  console.log(`Webhook call succesful: ${webhookResult.ok}, status: ${webhookResult.status}`)

  for (const lines of splitEvery(20, outputLines)) {
    const content = lines.join('\n')
    console.log(content)

    console.log('Sending webhook...')

    const webhookResult = await fetch(env.webhook, {
      method: 'POST',
      body: JSON.stringify({ content }),
      headers: { 'content-type': 'application/json;charset=UTF-8' },
    })
    console.log(`Webhook call succesful: ${webhookResult.ok}, status: ${webhookResult.status}`)
  }

  return { outputLines, interestingPlayers }
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    await doIt(env)
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const auth = request.headers.get('authentication')
    if (env.apiKey === '' || auth !== env.apiKey) {
      return new Response(null, { status: 403 })
    }

    const result = await doIt(env)

    return new Response(JSON.stringify({ result }), {
      headers: {
        'content-type': 'application/json;charset=UTF-8',
      },
    })
  },
}
