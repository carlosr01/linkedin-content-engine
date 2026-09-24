const URL = require('core-js-pure/features/url/index.js');

export function normalizeFeeds(items, sourceFor, maximum = 25) {
  const array = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
  const value = (v) => {
    const x = array(v)[0];
    return typeof x === 'string' ? x : typeof x?._ === 'string' ? x._ : '';
  };
  const text = (v) =>
    value(v)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .normalize('NFC')
      .replace(/\s+/gu, ' ')
      .trim();
  const out = [];
  for (const [index, feed] of items.entries()) {
    const context = sourceFor(index);
    const source = context.source;
    const channel = array(array(feed.json.rss)[0]?.channel)[0];
    const entries = array(channel?.item).slice(0, 25);
    for (const entry of entries) {
      if (out.length >= maximum) break;
      try {
        const sourceUrl = value(entry.link) || value(entry.guid);
        const url = new URL(sourceUrl);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          sourceUrl.length > 4096
        )
          throw Error();
        url.hash = '';
        const tracking = [];
        url.searchParams.forEach((_, key) => {
          if (/^(utm_.*|fbclid|gclid)$/i.test(key)) tracking.push(key);
        });
        for (const key of tracking) url.searchParams.delete(key);
        const title = text(entry.title);
        const extractedText = text(
          entry['content:encoded'] || entry.description || entry.summary,
        );
        if (
          !title ||
          !extractedText ||
          title.length > 2000 ||
          extractedText.length > 100000
        )
          throw Error();
        const rawDate = value(entry.pubDate || entry.published);
        const publishedAt = rawDate ? new Date(rawDate).toISOString() : null;
        out.push({
          json: {
            source,
            correlationId: context.correlationId,
            normalizationStatus: 'VALID',
            sourceUrl,
            canonicalUrl:
              url.href.split(/[?#]/)[0] +
              (tracking.length
                ? String(url.searchParams)
                  ? '?' + String(url.searchParams)
                  : ''
                : url.search),
            title,
            extractedText,
            author: text(entry.author || entry['dc:creator']) || null,
            publishedAt,
            retrievedAt: new Date().toISOString(),
            contentHashMaterial: JSON.stringify([title, extractedText]),
          },
          pairedItem: { item: index },
        });
      } catch {
        out.push({
          json: {
            normalizationStatus: 'INVALID',
            failureCategory: 'invalid_item',
            correlationId: context.correlationId,
            sourceId: source.id,
          },
          pairedItem: { item: index },
        });
      }
    }
  }
  return out;
}
