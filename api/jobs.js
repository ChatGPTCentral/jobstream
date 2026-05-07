// api/jobs.js
// Deploy this to Vercel as a serverless function

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const FEED_URL = 'https://production-api.jobstream.co/feed/xdf9h/xml';

  try {
    const response = await fetch(FEED_URL);
    
    if (!response.ok) {
      throw new Error(`Feed returned ${response.status}`);
    }

    const xmlText = await response.text();
    
    res.setHeader('Content-Type', 'application/xml');
    res.status(200).send(xmlText);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ 
      error: 'Failed to fetch jobs',
      message: error.message 
    });
  }
}
