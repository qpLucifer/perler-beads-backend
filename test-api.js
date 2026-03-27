/**
 * 拼豆 DIY 后端 API 测试脚本
 * 测试整个业务流程的完整性
 * 
 * 使用方法：node test-api.js
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

// 测试配置
const TEST_USER = {
  username: 'testuser',
  password: 'user123',
  email: 'test@perlerbeads.com'
};

const ADMIN_USER = {
  username: 'admin',
  password: 'admin123'
};

// 测试结果统计
let passed = 0;
let failed = 0;
let tokens = {
  user: null,
  admin: null
};

// 辅助函数
function log(message, type = 'info') {
  const icons = {
    info: '📝',
    success: '✅',
    error: '❌',
    warn: '⚠️'
  };
  console.log(`${icons[type]} ${message}`);
}

function assert(condition, testName) {
  if (condition) {
    passed++;
    log(`✓ ${testName}`, 'success');
  } else {
    failed++;
    log(`✗ ${testName}`, 'error');
  }
}

async function test(name, fn) {
  try {
    await fn();
  } catch (error) {
    log(`${name}: ${error.message}`, 'error');
    failed++;
  }
}

// ============ 测试用例 ============

// 1. 健康检查
async function testHealthCheck() {
  const res = await axios.get(`${API_BASE}/../health`);
  assert(res.data.status === 'ok', '健康检查');
}

// 2. 用户注册
async function testRegister() {
  const randomUsername = `testuser_${Date.now()}`;
  const res = await axios.post(`${API_BASE}/auth/register`, {
    username: randomUsername,
    password: 'test123',
    email: `${randomUsername}@test.com`
  });
  assert(res.data.success === true, '用户注册');
  return { username: randomUsername, password: 'test123' };
}

// 3. 用户登录
async function testLogin() {
  const res = await axios.post(`${API_BASE}/auth/login`, {
    username: TEST_USER.username,
    password: TEST_USER.password
  });
  assert(res.data.success === true, '用户登录');
  assert(!!res.data.data.token, '返回 Token');
  tokens.user = res.data.data.token;
  return res.data.data.token;
}

// 4. 管理员登录
async function testAdminLogin() {
  const res = await axios.post(`${API_BASE}/auth/login`, {
    username: ADMIN_USER.username,
    password: ADMIN_USER.password
  });
  assert(res.data.success === true, '管理员登录');
  tokens.admin = res.data.data.token;
  return res.data.data.token;
}

// 5. 获取用户信息
async function testGetMe(token) {
  const res = await axios.get(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '获取用户信息');
}

// 6. 获取商品列表
async function testGetProducts() {
  try {
    const res = await axios.get(`${API_BASE}/products`);
    assert(res.data.success === true, '获取商品列表');
    assert(Array.isArray(res.data.data.products), '商品列表是数组');
    return res.data.data.products || [];
  } catch (error) {
    console.log('商品列表获取失败:', error.response?.data);
    return [];
  }
}

// 7. 添加到购物车
async function testAddToCart(token, productId) {
  const res = await axios.post(`${API_BASE}/cart/items`, {
    product_id: productId,
    quantity: 1
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '添加到购物车');
  return res.data;
}

// 8. 获取购物车
async function testGetCart(token) {
  const res = await axios.get(`${API_BASE}/cart`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '获取购物车');
  assert(Array.isArray(res.data.data.items), '购物车商品是数组');
  return res.data.data;
}

// 9. 更新购物车数量
async function testUpdateCart(token, cartId) {
  const res = await axios.put(`${API_BASE}/cart/items/${cartId}`, {
    quantity: 2
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '更新购物车数量');
}

// 10. 创建订单
async function testCreateOrder(token, cartItems) {
  const res = await axios.post(`${API_BASE}/orders`, {
    items: cartItems.map(item => ({
      product_id: item.product_id,
      product_name: item.name,
      quantity: item.quantity
    })),
    total: cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '创建订单');
  return res.data.data.order;
}

// 11. 获取订单列表
async function testGetOrders(token) {
  const res = await axios.get(`${API_BASE}/orders`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '获取订单列表');
  return res.data.data.orders;
}

// 12. 支付订单
async function testPayOrder(token, orderId) {
  const res = await axios.post(`${API_BASE}/orders/${orderId}/pay`, {}, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '支付订单');
}

// 13. 添加收藏
async function testAddFavorite(token, productId) {
  const res = await axios.post(`${API_BASE}/favorites`, {
    product_id: productId
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '添加收藏');
}

// 14. 获取收藏列表
async function testGetFavorites(token) {
  const res = await axios.get(`${API_BASE}/favorites`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '获取收藏列表');
}

// 15. 创建评价
async function testCreateReview(token, productId, orderId) {
  const res = await axios.post(`${API_BASE}/reviews`, {
    product_id: productId,
    order_id: orderId,
    rating: 5,
    content: '非常好的商品！'
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '创建评价');
}

// 16. 获取商品评价
async function testGetProductReviews(productId) {
  const res = await axios.get(`${API_BASE}/reviews/product/${productId}`);
  assert(res.data.success === true, '获取商品评价');
}

// 17. 管理员 - 获取仪表盘统计
async function testAdminDashboard(token) {
  const res = await axios.get(`${API_BASE}/admin/dashboard/stats`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '获取仪表盘统计');
  assert(!!res.data.data.users, '包含用户统计');
  assert(!!res.data.data.orders, '包含订单统计');
}

// 18. 管理员 - 获取用户列表
async function testAdminUsers(token) {
  const res = await axios.get(`${API_BASE}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '获取用户列表');
}

// 19. 管理员 - 获取订单列表
async function testAdminOrders(token) {
  const res = await axios.get(`${API_BASE}/admin/orders`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '获取订单列表');
}

// 20. 获取收货地址列表
async function testGetAddresses(token) {
  const res = await axios.get(`${API_BASE}/addresses`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '获取收货地址');
}

// 21. 添加收货地址
async function testAddAddress(token) {
  const res = await axios.post(`${API_BASE}/addresses`, {
    receiver_name: '测试用户',
    receiver_phone: '13800138000',
    province: '湖北省',
    city: '武汉市',
    district: '武昌区',
    detail_address: '测试路 1 号',
    is_default: 1
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '添加收货地址');
  return res.data.data;
}

// 22. 获取优惠券列表
async function testGetCoupons(token) {
  const res = await axios.get(`${API_BASE}/coupons`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '获取优惠券列表');
}

// 23. 领取优惠券
async function testClaimCoupon(token, couponId) {
  const res = await axios.post(`${API_BASE}/coupons/claim/${couponId}`, {}, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '领取优惠券');
}

// 24. 获取我的优惠券
async function testGetMyCoupons(token) {
  const res = await axios.get(`${API_BASE}/coupons/my`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '获取我的优惠券');
}

// 25. 获取模板列表
async function testGetTemplates() {
  const res = await axios.get(`${API_BASE}/templates`);
  assert(res.data.success === true, '获取模板列表');
}

// 26. 保存作品
async function testSaveArtwork(token) {
  const res = await axios.post(`${API_BASE}/artworks`, {
    title: '测试作品',
    width: 32,
    height: 32,
    bead_data: JSON.stringify({ cells: [] }),
    bead_count: 100,
    is_public: 1
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '保存作品');
  return res.data.data;
}

// 27. 获取我的作品
async function testGetMyArtworks(token) {
  const res = await axios.get(`${API_BASE}/artworks/my`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(res.data.success === true, '获取我的作品');
}

// ============ 主测试流程 ============

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🎨 拼豆 DIY 后端 API 测试');
  console.log('='.repeat(60) + '\n');

  try {
    // 基础测试
    log('【基础功能测试】', 'info');
    await test('健康检查', testHealthCheck);
    
    // 认证测试
    log('\n【认证功能测试】', 'info');
    await test('用户登录', testLogin);
    await test('管理员登录', testAdminLogin);
    await test('获取用户信息', () => testGetMe(tokens.user));
    
    // 商品测试
    log('\n【商品功能测试】', 'info');
    const products = await test('获取商品列表', testGetProducts);
    const productId = products[0]?.id || 1;
    
    // 购物车测试
    log('\n【购物车功能测试】', 'info');
    await test('添加到购物车', () => testAddToCart(tokens.user, productId));
    const cart = await test('获取购物车', () => testGetCart(tokens.user));
    
    // 订单测试
    log('\n【订单功能测试】', 'info');
    if (cart.items && cart.items.length > 0) {
      const order = await test('创建订单', () => testCreateOrder(tokens.user, cart.items));
      await test('获取订单列表', () => testGetOrders(tokens.user));
      if (order && order.id) {
        await test('支付订单', () => testPayOrder(tokens.user, order.id));
      }
    }
    
    // 收藏测试
    log('\n【收藏功能测试】', 'info');
    await test('添加收藏', () => testAddFavorite(tokens.user, productId));
    await test('获取收藏列表', () => testGetFavorites(tokens.user));
    
    // 评价测试
    log('\n【评价功能测试】', 'info');
    // 注意：评价需要已完成的订单，这里简化测试
    await test('获取商品评价', () => testGetProductReviews(productId));
    
    // 地址测试
    log('\n【收货地址测试】', 'info');
    await test('获取收货地址', () => testGetAddresses(tokens.user));
    await test('添加收货地址', () => testAddAddress(tokens.user));
    
    // 优惠券测试
    log('\n【优惠券功能测试】', 'info');
    await test('获取优惠券列表', () => testGetCoupons(tokens.user));
    await test('获取我的优惠券', () => testGetMyCoupons(tokens.user));
    
    // 模板测试
    log('\n【模板功能测试】', 'info');
    await test('获取模板列表', testGetTemplates);
    
    // 作品测试
    log('\n【作品功能测试】', 'info');
    await test('保存作品', () => testSaveArtwork(tokens.user));
    await test('获取我的作品', () => testGetMyArtworks(tokens.user));
    
    // 管理员测试
    log('\n【管理功能测试】', 'info');
    await test('获取仪表盘统计', () => testAdminDashboard(tokens.admin));
    await test('获取用户列表', () => testAdminUsers(tokens.admin));
    await test('获取订单列表', () => testAdminOrders(tokens.admin));
    
  } catch (error) {
    log(`测试中断：${error.message}`, 'error');
  }

  // 输出结果
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果');
  console.log('='.repeat(60));
  console.log(`✅ 通过：${passed}`);
  console.log(`❌ 失败：${failed}`);
  console.log(`📈 通过率：${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('='.repeat(60) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

// 运行测试
runTests();
