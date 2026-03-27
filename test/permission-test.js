const http = require('http');

const BASE_URL = 'http://localhost:3000';

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

async function runTests() {
  console.log(`
╔════════════════════════════════════════════════╗
║       🔍 拼豆 DIY 权限和安全性测试             ║
╠════════════════════════════════════════════════╣
║  测试服务器：${BASE_URL}                          ║
╚════════════════════════════════════════════════╝
  `);

  const results = [];
  let authToken = null;

  // ========== 测试 1: 未登录访问作品接口（应该允许，只看到公开作品） ==========
  console.log('\n📋 测试 1: 未登录获取作品列表（应该成功，只看公开）');
  try {
    const res = await request('GET', '/api/artworks?is_public=1');
    console.log(`状态：${res.status === 200 ? '✅' : '❌'}`);
    console.log('响应:', res.data);
    results.push(res.status === 200);
  } catch (error) {
    console.log('❌ 错误:', error.message);
    results.push(false);
  }

  // ========== 测试 2: 未登录创建作品（应该失败） ==========
  console.log('\n🔒 测试 2: 未登录创建作品（应该失败，返回 401）');
  try {
    const res = await request('POST', '/api/artworks', {
      name: '测试作品',
      canvas_size: 16,
      canvas_data: [],
      bead_count: 0,
      is_public: 1
    });
    console.log(`状态：${res.status === 401 ? '✅' : '❌'} (期望 401，实际${res.status})`);
    console.log('响应:', res.data);
    results.push(res.status === 401);
  } catch (error) {
    console.log('❌ 错误:', error.message);
    results.push(false);
  }

  // ========== 测试 3: 未登录删除作品（应该失败） ==========
  console.log('\n🔒 测试 3: 未登录删除作品（应该失败，返回 401）');
  try {
    const res = await request('DELETE', '/api/artworks/1');
    console.log(`状态：${res.status === 401 ? '✅' : '❌'} (期望 401，实际${res.status})`);
    console.log('响应:', res.data);
    results.push(res.status === 401);
  } catch (error) {
    console.log('❌ 错误:', error.message);
    results.push(false);
  }

  // ========== 测试 4: 未登录访问购物车（应该失败） ==========
  console.log('\n🔒 测试 4: 未登录获取购物车（应该失败，返回 401）');
  try {
    const res = await request('GET', '/api/cart');
    console.log(`状态：${res.status === 401 ? '✅' : '❌'} (期望 401，实际${res.status})`);
    console.log('响应:', res.data);
    results.push(res.status === 401);
  } catch (error) {
    console.log('❌ 错误:', error.message);
    results.push(false);
  }

  // ========== 测试 5: 未登录添加到购物车（应该失败） ==========
  console.log('\n🔒 测试 5: 未登录添加到购物车（应该失败，返回 401）');
  try {
    const res = await request('POST', '/api/cart/items', {
      product_id: 1,
      price: 39.90
    });
    console.log(`状态：${res.status === 401 ? '✅' : '❌'} (期望 401，实际${res.status})`);
    console.log('响应:', res.data);
    results.push(res.status === 401);
  } catch (error) {
    console.log('❌ 错误:', error.message);
    results.push(false);
  }

  // ========== 测试 6: 未登录创建订单（应该失败） ==========
  console.log('\n🔒 测试 6: 未登录创建订单（应该失败，返回 401）');
  try {
    const res = await request('POST', '/api/orders', {
      items: [{ product_id: 1, name: '测试', price: 39.90 }],
      total: 39.90
    });
    console.log(`状态：${res.status === 401 ? '✅' : '❌'} (期望 401，实际${res.status})`);
    console.log('响应:', res.data);
    results.push(res.status === 401);
  } catch (error) {
    console.log('❌ 错误:', error.message);
    results.push(false);
  }

  // ========== 测试 7: 未登录获取订单列表（应该失败） ==========
  console.log('\n🔒 测试 7: 未登录获取订单列表（应该失败，返回 401）');
  try {
    const res = await request('GET', '/api/orders');
    console.log(`状态：${res.status === 401 ? '✅' : '❌'} (期望 401，实际${res.status})`);
    console.log('响应:', res.data);
    results.push(res.status === 401);
  } catch (error) {
    console.log('❌ 错误:', error.message);
    results.push(false);
  }

  // ========== 测试 8: 注册新用户 ==========
  console.log('\n👤 测试 8: 注册新用户');
  try {
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
    }
    results.push(res.status === 201);
  } catch (error) {
    console.log('❌ 错误:', error.message);
    results.push(false);
  }

  // ========== 测试 9: 登录后创建作品（应该成功） ==========
  console.log('\n🎨 测试 9: 登录后创建作品（应该成功）');
  try {
    const res = await request('POST', '/api/artworks', {
      name: '测试作品',
      canvas_size: 16,
      canvas_data: [[{hex: '#FF0000'}]],
      bead_count: 1,
      price: 23.00,
      is_public: 1
    }, authToken);
    console.log(`状态：${res.status === 201 ? '✅' : '❌'}`);
    console.log('响应:', res.data);
    results.push(res.status === 201);
  } catch (error) {
    console.log('❌ 错误:', error.message);
    results.push(false);
  }

  // ========== 测试 10: 登录后获取购物车（应该成功） ==========
  console.log('\n🛒 测试 10: 登录后获取购物车（应该成功）');
  try {
    const res = await request('GET', '/api/cart', null, authToken);
    console.log(`状态：${res.status === 200 ? '✅' : '❌'}`);
    console.log('响应:', res.data);
    results.push(res.status === 200);
  } catch (error) {
    console.log('❌ 错误:', error.message);
    results.push(false);
  }

  // ========== 测试 11: 登录后添加到购物车（应该成功） ==========
  console.log('\n🛒 测试 11: 登录后添加到购物车（应该成功）');
  try {
    const res = await request('POST', '/api/cart/items', {
      product_id: 1,
      product_type: 'product',
      price: 39.90,
      quantity: 1
    }, authToken);
    console.log(`状态：${res.status === 200 || res.status === 201 ? '✅' : '❌'}`);
    console.log('响应:', res.data);
    results.push(res.status === 200 || res.status === 201);
  } catch (error) {
    console.log('❌ 错误:', error.message);
    results.push(false);
  }

  // ========== 测试 12: 登录后创建订单（应该成功） ==========
  console.log('\n📦 测试 12: 登录后创建订单（应该成功）');
  try {
    const res = await request('POST', '/api/orders', {
      items: [{ product_id: 1, name: '测试', price: 39.90, quantity: 1 }],
      total: 39.90
    }, authToken);
    console.log(`状态：${res.status === 201 ? '✅' : '❌'}`);
    console.log('响应:', res.data);
    results.push(res.status === 201);
  } catch (error) {
    console.log('❌ 错误:', error.message);
    results.push(false);
  }

  // ========== 统计结果 ==========
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

  // 显示问题总结
  if (passed < total) {
    console.log('\n❌ 发现的问题：');
    console.log('1. 未登录用户可以访问某些应该保护的接口');
    console.log('2. 权限控制需要加强');
    console.log('3. 需要检查所有需要认证的接口');
  } else {
    console.log('\n✅ 所有权限测试通过！');
  }

  return passed === total;
}

// 运行测试
runTests()
  .then(success => {
    console.log(success ? '\n✅ 所有测试通过！' : '\n❌ 部分测试失败，需要修复');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ 测试执行错误:', error);
    process.exit(1);
  });
