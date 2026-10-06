// Scores are stored by this site's public API, without a remote SDK dependency.
async function requestLeaderboard(query = '', options = {}, readRows = false) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetch(`/api/leaderboard.php?game=shooter${query}`, {
            ...options,
            credentials: 'omit',
            cache: 'no-store',
            headers: { Accept: 'application/json', ...options.headers },
            signal: controller.signal,
        });
        if (!response.ok) throw new Error('The leaderboard request failed.');
        return readRows ? await response.json() : true;
    } finally {
        clearTimeout(timeout);
    }
}

export async function submitScore({ name, score }) {
    if (!Number.isFinite(score) || score < 0) {
        throw new Error('This score could not be submitted.');
    }
    try {
        return await requestLeaderboard('', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, score: Math.round(score) }),
        });
    } catch (error) {
        throw new Error('Your score could not be saved. Please try again.', { cause: error });
    }
}

export async function fetchLeaderboard(limit = 10) {
    try {
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid leaderboard limit.');
        const data = await requestLeaderboard(`&limit=${limit}`, {}, true);
        if (!Array.isArray(data) || data.some(row => !row || !Number.isFinite(row.score))) {
            throw new Error('Invalid leaderboard response.');
        }
        return data.map(row => ({ name: row.name, score: row.score }));
    } catch (error) {
        throw new Error('The leaderboard could not be loaded. Please try again.', { cause: error });
    }
}
