export default async function handler(req, res) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { username } = req.body;
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
                'Referer': 'https://leetcode.com',
                'Origin': 'https://leetcode.com',
                'User-Agent': 'Mozilla/5.0'
            },
            body: JSON.stringify({ query })
        });

        const data = await resp.json();

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        return res.status(200).json(data);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch from LeetCode', details: err.message });
    }
}
