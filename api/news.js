// /api/news.js - Bio/Pharma/Medical/AI News Aggregator
// Deploy to Vercel alongside api/dooray.js

const FEEDS = [
  // Korean news (today)
  {url:"https://news.google.com/rss/search?q=바이오+제약+신약+when:1d&hl=ko&gl=KR&ceid=KR:ko",category:"bio",region:"kr"},
  {url:"https://news.google.com/rss/search?q=의료+디지털헬스케어+when:1d&hl=ko&gl=KR&ceid=KR:ko",category:"medical",region:"kr"},
  {url:"https://news.google.com/rss/search?q=인공지능+AI+헬스케어+when:1d&hl=ko&gl=KR&ceid=KR:ko",category:"ai",region:"kr"},
  {url:"https://news.google.com/rss/search?q=제약+임상시험+FDA+when:1d&hl=ko&gl=KR&ceid=KR:ko",category:"pharma",region:"kr"},
  // International news (today)
  {url:"https://news.google.com/rss/search?q=biotech+drug+discovery+when:1d&hl=en&gl=US&ceid=US:en",category:"bio",region:"intl"},
  {url:"https://news.google.com/rss/search?q=pharmaceutical+clinical+trial+FDA+when:1d&hl=en&gl=US&ceid=US:en",category:"pharma",region:"intl"},
  {url:"https://news.google.com/rss/search?q=medical+device+digital+health+when:1d&hl=en&gl=US&ceid=US:en",category:"medical",region:"intl"},
  {url:"https://news.google.com/rss/search?q=artificial+intelligence+healthcare+drug+when:1d&hl=en&gl=US&ceid=US:en",category:"ai",region:"intl"},
];

function parseRSS(xml, category, region) {
  const articles = [];
  const items = xml.split('<item>').slice(1);
  for (const item of items.slice(0, 8)) {
    const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/) || [])[1] || (item.match(/<title>(.*?)<\/title>/) || [])[1] || '';
    const link = (item.match(/<link>(.*?)<\/link>/) || [])[1] || '';
    const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
    const source = (item.match(/<source.*?>(.*?)<\/source>/) || [])[1] || '';
    const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/) || [])[1] || '';
    
    if (title && link) {
      articles.push({
        title: title.replace(/<[^>]*>/g, '').trim(),
        link: link.trim(),
        description: desc.replace(/<[^>]*>/g, '').trim().substring(0, 200),
        pubDate: pubDate ? new Date(pubDate).toLocaleDateString('ko-KR') : '',
        source: source.replace(/<[^>]*>/g, '').trim(),
        category,
        region,
      });
    }
  }
  return articles;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  // Cache for 30 minutes, serve stale for 1 hour
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

  const requestDate = req.query.date || new Date().toISOString().split('T')[0];

  try {
    const allArticles = [];
    
    const results = await Promise.allSettled(
      FEEDS.map(async (feed) => {
        try {
          const r = await fetch(feed.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 BizPlanner/1.0' }
          });
          if (!r.ok) return [];
          const xml = await r.text();
          return parseRSS(xml, feed.category, feed.region);
        } catch (e) {
          return [];
        }
      })
    );

    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        allArticles.push(...r.value);
      }
    });

    // Sort by date, deduplicate by title
    const seen = new Set();
    const unique = allArticles.filter(a => {
      const key = a.title.substring(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Shuffle slightly for variety, but keep recency
    unique.sort(() => Math.random() - 0.5);

    res.status(200).json({ 
      articles: unique.slice(0, 40),
      fetchedAt: new Date().toISOString(),
      requestDate,
      total: unique.length
    });
  } catch (e) {
    res.status(500).json({ error: e.message, articles: [] });
  }
}
