const http = require('http');

const data = JSON.stringify({
  username: 'testuser',
  password: '123456',
  email: 'test@test.com'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  console.log(`状态码：${res.statusCode}`);
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('响应:', JSON.parse(body));
  });
});

req.on('error', (e) => {
  console.error('错误:', e.message);
});

req.write(data);
req.end();
