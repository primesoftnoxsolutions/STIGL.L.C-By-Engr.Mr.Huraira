const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 5000,
  path: '/api/reports/cash-paper?startDate=2026-01-02&endDate=2026-02-01',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('BODY:');
    console.log(data);
    process.exit(0);
  });
});

req.on('timeout', () => {
  console.error('Request timeout');
  req.destroy();
  process.exit(1);
});

req.on('error', (e) => {
  console.error(`Problem with request:`, e);
  process.exit(1);
});

req.end();
