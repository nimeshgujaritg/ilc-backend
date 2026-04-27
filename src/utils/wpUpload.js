const https = require('https');
const url = require('url');

const uploadToWordPress = (fileBuffer, filename, mimeType) => {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(
      `${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`
    ).toString('base64');

    const wpUrl = new URL(
      `${process.env.GF_URL}/wp-json/wp/v2/media`
    );

    const options = {
      hostname: wpUrl.hostname,
      path: wpUrl.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': mimeType,
        'Content-Length': fileBuffer.length,
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.source_url) {
            resolve(parsed.source_url);
          } else {
            console.error('WP upload response:', parsed);
            reject(new Error('No source_url in response'));
          }
        } catch (err) {
          reject(new Error('Failed to parse WP response'));
        }
      });
    });

    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });
};

module.exports = { uploadToWordPress };