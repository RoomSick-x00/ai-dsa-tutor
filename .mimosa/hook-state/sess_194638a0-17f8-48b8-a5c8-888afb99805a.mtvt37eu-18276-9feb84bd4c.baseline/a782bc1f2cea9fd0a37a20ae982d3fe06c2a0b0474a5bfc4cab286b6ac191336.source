// test-fetch.js
const http = require('http');

http.get('http://localhost:3001', (res) => {
  console.log('Status code:', res.statusCode);
  res.on('data', () => {});
  res.on('end', () => console.log('Response finished.'));
}).on('error', (e) => {
  console.error('Error:', e.message);
});
