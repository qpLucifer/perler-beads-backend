const axios = require('axios');

const API = 'http://localhost:3000/api';
let token = '';
let userId = 0;

console.log('\n🧪 拼豆 DIY - 完整 API 测试\n');
console.log('='.repeat(60));

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (error) {
    console.log(`❌ ${name}: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function runTests() {
  let passed = 0;
  let total = 0;
  
  // ========== 1. 拼豆配置 ==========
  console.log('\n【1. 拼豆配置接口】');
  
  total++; if (await test('获取拼豆颜色列表', async () => {
    const res = await axios.get(`${API}/beads/colors`);
    const colors = res.data.data?.colors || res.data.colors || [];
    if (colors.length === 0) {
      throw new Error('颜色数据错误');
    }
    console.log(`   📊 ${colors.length} 种颜色`);
  })) passed++;
  
  total++; if (await test('获取画布尺寸列表', async () => {
    const res = await axios.get(`${API}/beads/canvas-sizes`);
    const sizes = res.data.data?.sizes || res.data.sizes || [];
    if (sizes.length === 0) {
      throw new Error('尺寸数据错误');
    }
    console.log(`   📊 ${sizes.length} 种尺寸`);
  })) passed++;
  
  // ========== 2. 认证接口 ==========
  console.log('\n【2. 认证接口】');
  
  total++; if (await test('管理员登录', async () => {
    const res = await axios.post(`${API}/auth/login`, {
      username: 'admin',
      password: 'admin123'
    });
    if (!res.data.success || !res.data.data.token) {
      throw new Error('登录失败');
    }
    token = res.data.data.token;
    userId = res.data.data.user.id;
    console.log(`   👤 用户 ID: ${userId}`);
  })) passed++;
  
  total++; if (await test('获取当前用户信息', async () => {
    const res = await axios.get(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.data.success || !res.data.data.user) {
      throw new Error('获取用户信息失败');
    }
  })) passed++;
  
  // ========== 3. 模板接口 ==========
  console.log('\n【3. 模板接口】');
  
  total++; if (await test('获取模板列表', async () => {
    const res = await axios.get(`${API}/templates`);
    const templates = res.data.data?.templates || res.data.templates || [];
    if (templates.length === 0) {
      throw new Error('获取模板失败');
    }
    console.log(`   📊 ${templates.length} 个模板`);
  })) passed++;
  
  total++; if (await test('获取管理模板列表', async () => {
    const res = await axios.get(`${API}/admin/templates`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const templates = res.data.data?.templates || res.data.templates || [];
    if (templates.length === 0) {
      throw new Error('获取管理模板失败');
    }
    console.log(`   📊 ${templates.length} 个模板`);
  })) passed++;
  
  // ========== 4. 商品接口 ==========
  console.log('\n【4. 商品接口】');
  
  total++; if (await test('获取商品列表', async () => {
    const res = await axios.get(`${API}/products`);
    const products = res.data.data?.products || res.data.products || [];
    if (products.length === 0) {
      throw new Error('获取商品失败');
    }
    console.log(`   📊 ${products.length} 个商品`);
  })) passed++;
  
  total++; if (await test('获取管理商品列表', async () => {
    const res = await axios.get(`${API}/admin/products`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const products = res.data.data?.products || res.data.products || [];
    if (products.length === 0) {
      throw new Error('获取管理商品失败');
    }
    console.log(`   📊 ${products.length} 个商品`);
  })) passed++;
  
  // ========== 5. 购物车接口 ==========
  console.log('\n【5. 购物车接口】');
  
  total++; if (await test('获取购物车', async () => {
    const res = await axios.get(`${API}/cart`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.data.success) {
      throw new Error('获取购物车失败');
    }
  })) passed++;
  
  // ========== 6. 订单接口 ==========
  console.log('\n【6. 订单接口】');
  
  total++; if (await test('获取订单列表', async () => {
    const res = await axios.get(`${API}/orders`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.data.success) {
      throw new Error('获取订单失败');
    }
  })) passed++;
  
  total++; if (await test('获取管理订单列表', async () => {
    const res = await axios.get(`${API}/admin/orders`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.data.success) {
      throw new Error('获取管理订单失败');
    }
  })) passed++;
  
  // ========== 7. 用户管理 ==========
  console.log('\n【7. 用户管理】');
  
  total++; if (await test('获取用户列表', async () => {
    const res = await axios.get(`${API}/admin/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const users = res.data.data?.users || res.data.users || [];
    if (users.length === 0) {
      throw new Error('获取用户列表失败');
    }
    console.log(`   📊 ${users.length} 个用户`);
  })) passed++;
  
  // ========== 8. 作品管理 ==========
  console.log('\n【8. 作品管理】');
  
  total++; if (await test('获取作品列表', async () => {
    const res = await axios.get(`${API}/admin/artworks`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.data.success) {
      throw new Error('获取作品列表失败');
    }
  })) passed++;
  
  // ========== 9. 仪表盘 ==========
  console.log('\n【9. 管理仪表盘】');
  
  total++; if (await test('获取仪表盘统计', async () => {
    const res = await axios.get(`${API}/admin/dashboard/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.data.success || !res.data.data) {
      throw new Error('获取仪表盘失败');
    }
    const d = res.data.data;
    console.log(`   👥 用户：${d.users?.total || 0}`);
    console.log(`   📦 订单：${d.orders?.total || 0}`);
    console.log(`   🛒 商品：${d.products?.total || 0}`);
    console.log(`   🎨 作品：${d.artworks?.total || 0}`);
  })) passed++;
  
  // ========== 测试结果 ==========
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果');
  console.log('='.repeat(60));
  console.log(`✅ 通过：${passed}/${total}`);
  console.log(`📈 通过率：${((passed / total) * 100).toFixed(1)}%`);
  console.log('='.repeat(60));
  
  if (passed === total) {
    console.log('\n🎉 所有 API 测试通过！三端数据同步完成！\n');
  } else {
    console.log(`\n⚠️ 有 ${total - passed} 个测试失败\n`);
  }
  
  process.exit(passed === total ? 0 : 1);
}

runTests();
