const BASE = "https://api.oddspapi.io/v4";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export class OddsPapiClient {
  constructor(keys) {
    this.keys = [...new Set((keys || []).map(value => String(value || "").trim()).filter(Boolean))];
    this.cursor = 0;
    this.lastRequestAt = new Map();
    this.requestCount = 0;
    if (!this.keys.length) throw new Error("No PREMIUM_FOOTBALL_KEY credentials were supplied.");
  }

  async get(path, params = {}, cooldownMs = 0) {
    let lastError;
    const startCursor = this.cursor;
    for (let attempt = 0; attempt < this.keys.length; attempt++) {
      const index = (startCursor + attempt) % this.keys.length;
      const scheduledAt = Math.max(Date.now(), this.lastRequestAt.get(path) || 0);
      this.lastRequestAt.set(path, scheduledAt + cooldownMs);
      if (scheduledAt > Date.now()) await sleep(scheduledAt - Date.now());
      const url = new URL(BASE + path);
      for (const [name, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) url.searchParams.set(name, String(value));
      }
      url.searchParams.set("apiKey", this.keys[index]);
      try {
        this.requestCount++;
        const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (response.status === 429 || response.status >= 500) {
          const body = await response.json().catch(() => ({}));
          const retryMs = Math.max(cooldownMs, Number(body?.error?.retryMs || 0), 1200);
          lastError = new Error("OddsPapi temporarily rate-limited or unavailable (" + response.status + ").");
          if (attempt + 1 < this.keys.length) await sleep(retryMs);
          continue;
        }
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          const error = new Error("OddsPapi request rejected (" + response.status + "): " + body.slice(0, 180));
          error.status = response.status;
          try { error.code = JSON.parse(body)?.error?.code || null; } catch { error.code = null; }
          lastError = error;
          if (error.status === 404 && error.code === "FIXTURE_NOT_FOUND") throw error;
          continue;
        }
        this.cursor = (index + 1) % this.keys.length;
        return await response.json();
      } catch (error) {
        lastError = error;
        this.cursor = (index + 1) % this.keys.length;
      }
    }
    throw lastError || new Error("All OddsPapi keys failed.");
  }

  async getTournaments() {
    const rows = await this.get("/tournaments", { sportId: 10 }, 200);
    return Array.isArray(rows) ? rows : [];
  }

  async getFixturesForDate(date, tournaments) {
    const from = new Date(date + "T00:00:00+03:00").toISOString();
    const to = new Date(new Date(date + "T00:00:00+03:00").getTime() + 86400000).toISOString();
    const results = [];
    for (const tournament of tournaments) {
      let rows;
      try {
        rows = await this.get("/fixtures", {
          tournamentId: tournament.tournamentId, from, to, statusId: 0, hasOdds: true
        }, 2000);
      } catch (error) {
        // OddsPapi uses 404/FIXTURE_NOT_FOUND when a tournament has no fixtures
        // in the requested date window. That is an empty result, not a pipeline failure.
        if (error?.status === 404 && error?.code === "FIXTURE_NOT_FOUND") continue;
        throw error;
      }
      for (const item of Array.isArray(rows) ? rows : []) {
        results.push({
          fixture: { id: item.fixtureId, date: item.startTime, status: { short: Number(item.statusId) === 0 ? "NS" : "UNK" } },
          league: { id: item.tournamentId, slug: item.tournamentSlug || tournament.tournamentSlug, name: item.tournamentName || tournament.tournamentName, type: "League", country: item.categoryName },
          teams: {
            home: { id: item.participant1Id, name: item.participant1Name },
            away: { id: item.participant2Id, name: item.participant2Name }
          },
          raw: item
        });
      }
    }
    return results;
  }

  async getMarketCatalog() {
    const rows = await this.get("/markets", { language: "en" }, 200);
    return new Map((Array.isArray(rows) ? rows : []).map(row => [String(row.marketId), row]));
  }

  async getOddsPayload(fixtureId, marketCatalog) {
    const payload = await this.get("/odds", { fixtureId, language: "en", verbosity: 3 }, 500);
    const bookmakers = [];
    for (const [bookmakerName, bookmaker] of Object.entries(payload?.bookmakerOdds || {})) {
      const bets = [];
      if (bookmaker?.bookmakerIsActive === false || bookmaker?.suspended === true) continue;
      for (const [marketId, marketData] of Object.entries(bookmaker?.markets || {})) {
        const market = marketCatalog.get(String(marketId));
        if (marketData?.marketActive === false) continue;
        if (!market || market.playerProp || !market.outcomes?.length) continue;
        const values = [];
        for (const [outcomeId, outcomeData] of Object.entries(marketData?.outcomes || {})) {
          const outcomeMeta = market.outcomes.find(row => String(row.outcomeId) === String(outcomeId));
          if (!outcomeMeta) continue;
          for (const player of Object.values(outcomeData?.players || {})) {
            const odd = Number(player?.price);
            if (player?.active === false || !Number.isFinite(odd) || odd <= 1) continue;
            const line = market.handicap !== undefined && market.handicap !== null && Number(market.handicap) !== 0
              ? " " + String(Math.abs(Number(market.handicap))) : "";
            const outcomeName = String(outcomeMeta.outcomeName || "");
            const marketName = String(market.marketName || "");
            const value = /over|under/i.test(outcomeName) && line && !/\d/.test(outcomeName) ? outcomeName + line : outcomeName;
            values.push({ value, odd: String(odd) });
          }
        }
        if (values.length) bets.push({ name: market.marketName, values });
      }
      if (bets.length) bookmakers.push({ name: bookmakerName, bets });
    }
    return { response: [{ bookmakers }] };
  }

  async getTeamForm(participantId) {
    const fixtures = await this.get("/fixtures", { participantId, statusId: 2 }, 2000);
    const recent = (Array.isArray(fixtures) ? fixtures : [])
      .sort((a, b) => String(b.startTime).localeCompare(String(a.startTime))).slice(0, 5);
    const response = [];
    for (const fixture of recent) {
      const scorePayload = await this.get("/scores", { fixtureId: fixture.fixtureId }, 1000);
      const periods = scorePayload?.scores?.periods || scorePayload?.scores || {};
      const final = periods.result || periods.fulltime || periods["3"] || periods["2"];
      if (!final) continue;
      response.push({
        fixture: { id: fixture.fixtureId, status: { short: "FT" } },
        teams: { home: { id: fixture.participant1Id }, away: { id: fixture.participant2Id } },
        goals: { home: Number(final.participant1Score), away: Number(final.participant2Score) }
      });
    }
    return { response };
  }

  async getFixture(fixtureId) {
    return this.get("/fixture", { fixtureId }, 200);
  }

  async getScore(fixtureId) {
    return this.get("/scores", { fixtureId }, 1000);
  }
}
