// ELO Updater (Day 4)
// Standard ELO formula with K-factor logic

function computeNewElo(playerElo, aiElo = 1500, score) {
  const K = playerElo < 1200 ? 32 : 16;
  const expected = 1 / (1 + Math.pow(10, (aiElo - playerElo) / 400));
  return Math.round(playerElo + K * (score - expected));
}

module.exports = { computeNewElo };
