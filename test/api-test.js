const http = require('http');

const BASE_URL = 'http://localhost:3000';
let authToken = null;

// 封装 HTTP 请求
function request(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(body)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: body
          });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// 测试健康检查
async function testHealth() {
  console.log('\n📊 测试健康检查...');
  const res = await request('GET', '/health');
  console.log(`状态：${res.status === 200 ? '✅' : '❌'}`);
  console.log(res.data);
  return res.status === 200;
}

// 测试用户注册
async function testRegister() {
  console.log('\n👤 测试用户注册...');
  const username = `testuser_${Date.now()}`;
  const res = await request('POST', '/api/auth/register', {
    username: username,
    email: `${username}@test.com`,
    password: '123456',
    nickname: '测试用户'
  });
  
  console.log(`状态：${res.status === 201 ? '✅' : '❌'}`);
  
  if (res.data.success) {
    authToken = res.data.data.token;
    console.log('✅ 注册成功，Token 已保存');
  } else {
    console.log('响应:', res.data);
  }
  
  return res.status === 201;
}

// 测试获取用户信息
async function testGetUser() {
  console.log('\n👤 测试获取用户信息...');
  const res = await request('GET', '/api/auth/me', null, authToken);
  console.log(`状态：${res.status === 200 ? '✅' : '❌'}`);
  if (res.data.success) {
    console.log('用户:', res.data.data.user.username);
  }
  return res.status === 200;
}

// 测试获取商品列表
async function testGetProducts() {
  console.log('\n🛍️  测试获取商品列表...');
  const res = await request('GET', '/api/products?status=1');
  console.log(`状态：${res.status === 200 ? '✅' : '❌'}`);
  if (res.data.success) {
    console.log(`商品数量：${res.data.data.products.length}`);
  }
  return res.status === 200;
}

// 测试添加到购物车
async function testAddToCart() {
  console.log('\n🛒 测试添加到购物车...');
  const res = await request('POST', '/api/cart/items', {
    product_id: 1,
    product_type: 'product',
    price: 39.90,
    quantity: 1
  }, authToken);
  
  console.log(`状态：${res.status === 200 || res.status === 201 ? '✅' : '❌'}`);
  console.log('响应:', res.data.message || res.data);
  return res.status === 200 || res.status === 201;
}

// 测试获取购物车
async function testGetCart() {
  console.log('\n🛒 测试获取购物车...');
  const res = await request('GET', '/api/cart', null, authToken);
  console.log(`状态：${res.status === 200 ? '✅' : '❌'}`);
  if (res.data.success) {
    console.log(`购物车商品数：${res.data.data.items.length}`);
    console.log(`总金额：¥${res.data.data.total}`);
  }
  return res.status === 200;
}

// 测试创建作品
async function testCreateArtwork() {
  console.log('\n🎨 测试创建作品...');
  const res = await request('POST', '/api/artworks', {
    name: '测试作品',
    canvas_size: 16,
    canvas_data: [
      [null, {hex: '#FF0000'}, null],
      [{hex: '#FF0000'}, {hex: '#FF0000'}, {hex: '#FF0000'}],
      [null, {hex: '#FF0000'}, null]
    ],
    bead_count: 5,
    price: 23.50,
    is_public: 1
  }, authToken);
  
  console.log(`状态：${res.status === 201 ? '✅' : '❌'}`);
  if (res.data.success) {
    console.log('作品 ID:', res.data.data.artwork.id);
    return res.data.data.artwork.id;
  }
  return null;
}

// 测试获取作品列表
async function testGetArtworks() {
  console.log('\n🎨 测试获取作品列表...');
  const res = await request('GET', '/api/artworks?is_public=1');
  console.log(`状态：${res.status === 200 ? '✅' : '❌'}`);
  if (res.data.success) {
    console.log(`作品数量：${res.data.data.artworks.length}`);
  }
  return res.status === 200;
}

// 测试创建订单
async function testCreateOrder() {
  console.log('\n📦 测试创建订单...');
  const res = await request('POST', '/api/orders', {
    items: [
      {
        product_id: 1,
        name: '基础拼豆套装',
        type: 'product',
        price: 39.90,
        quantity: 1
      }
    ],
    total: 39.90,
    payment_method: 'wechat'
  }, authToken);
  
  console.log(`状态：${res.status === 201 ? '✅' : '❌'}`);
  if (res.data.success) {
    console.log('订单 ID:', res.data.data.order.id);
    console.log('总金额：¥' + res.data.data.order.total_amount);
    return res.data.data.order.id;
  }
  return null;
}

// 测试支付订单
async function testPayOrder(orderId) {
  if (!orderId) return false;
  
  console.log('\n💳 测试支付订单...');
  const res = await request('POST', `/api/orders/${orderId}/pay`, null, authToken);
  console.log(`状态：${res.status === 200 ? '✅' : '❌'}`);
  console.log('响应:', res.data);
  return res.status === 200;
}

// 测试获取订单列表
async function testGetOrders() {
  console.log('\n📦 测试获取订单列表...');
  const res = await request('GET', '/api/orders', null, authToken);
  console.log(`状态：${res.status === 200 ? '✅' : '❌'}`);
  if (res.data.success) {
    console.log(`订单数量：${res.data.data.orders.length}`);
  }
  return res.status === 200;
}

// 主测试流程
async function runTests() {
  console.log(`
╔════════════════════════════════════════════════╗
║       🧪 拼豆 DIY API 测试                     ║
╠════════════════════════════════════════════════╣
║  测试服务器：${BASE_URL}                          ║
╚════════════════════════════════════════════════╝
  `);

  const results = [];

  // 1. 健康检查
  results.push(await testHealth());

  // 2. 用户注册
  results.push(await testRegister());

  // 3. 获取用户信息
  results.push(await testGetUser());

  // 4. 获取商品列表
  results.push(await testGetProducts());

  // 5. 添加到购物车
  results.push(await testAddToCart());

  // 6. 获取购物车
  results.push(await testGetCart());

  // 7. 创建作品
  const artworkId = await testCreateArtwork();
  results.push(!!artworkId);

  // 8. 获取作品列表
  results.push(await testGetArtworks());

  // 9. 创建订单
  const orderId = await testCreateOrder();
  results.push(!!orderId);

  // 10. 支付订单
  results.push(await testPayOrder(orderId));

  // 11. 获取订单列表
  results.push(await testGetOrders());

  // 统计结果
  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`
╔════════════════════════════════════════════════╗
║              📊 测试结果统计                    ║
╠════════════════════════════════════════════════╣
║  通过：${passed}/${total}                                    ║
║  成功率：${((passed/total)*100).toFixed(1)}%                              ║
╚════════════════════════════════════════════════╝
  `);

  return passed === total;
}

// 运行测试
runTests()
  .then(success => {
    console.log(success ? '\n✅ 所有测试通过！' : '\n❌ 部分测试失败');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ 测试执行错误:', error);
    process.exit(1);
  });
