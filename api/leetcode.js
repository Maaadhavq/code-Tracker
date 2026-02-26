module.exports = async function handler(req, res) {
    // Set CORS headers first so any early returns still have them
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { username } = req.body || {};
    if (!username) {
        return res.status(400).json({ error: 'Username required' });
    }

    const query = `{
    matchedUser(username: "${username.replace(/[^a-zA-Z0-9_-]/g, '')}") {
      username
      submitStatsGlobal {
        acSubmissionNum { difficulty count }
      }
    }
  }`;

    try {
        const resp = await fetch('https://leetcode.com/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Referer': 'https://leetcode.com/madhav/',
                'Origin': 'https://leetcode.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: JSON.stringify({ query })
        });

        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`LeetCode HTTP error ${resp.status}: ${errText.slice(0, 100)}`);
        }

        const data = await resp.json();
        return res.status(200).json(data);
    } catch (err) {
        console.error("Leetcode API Error:", err);
        return res.status(500).json({ error: 'Failed to fetch from LeetCode', details: err.message });
    }
}
