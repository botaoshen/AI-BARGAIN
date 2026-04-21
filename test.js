import https from 'https';

https.get('https://www.ozbargain.com.au/tag/gift-card', (res) => {
  console.log('Status:', res.statusCode);
  res.on('data', () => {});
  res.on('end', () => console.log('Done'));
}).on('error', (e) => {
  console.error(e);
});
