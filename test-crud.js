const axios = require('axios');

const API = 'http://localhost:3000/api';
let token = '';

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.log(`❌ ${name}: ${error.response?.data?.message || error.message}`);
  }
}

async function runTests() {
  console.log('\n🧪 管理后台 CRUD 测试\n');
  
  // 登录
  const loginRes = await axios.post(`${API}/auth/login`, { username: 'admin', password: 'admin123' });
  token = loginRes.data.data.token;
  console.log('✅ 登录成功\n');
  
  const headers = { Authorization: `Bearer ${token}` };
  
  // 商品 CRUD
  await test('商品 - 获取列表', async () => {
    const res = await axios.get(`${API}/admin/products`, { headers });
    if (!res.data.success) throw new Error('失败');
  });
  
  await test('商品 - 创建', async () => {
    const res = await axios.post(`${API}/admin/products`, {
      name: '测试商品',
      description: '测试描述',
      price: 9.99,
      original_price: 19.99,
      category: 'bead',
      stock: 100,
      image_url: 'https://via.placeholder.com/200',
      is_on_sale: true
    }, { headers });
    if (!res.data.success) throw new Error('失败');
    return res.data.data.id;
  });
  
  let productId = null;
  const productsRes = await axios.get(`${API}/admin/products`, { headers });
  if (productsRes.data.data.products.length > 0) {
    productId = productsRes.data.data.products[0].id;
  }
  
  await test('商品 - 更新', async () => {
    if (!productId) throw new Error('无商品');
    const res = await axios.put(`${API}/admin/products/${productId}`, {
      name: '测试商品 - 已更新',
      price: 12.99,
      stock: 150
    }, { headers });
    if (!res.data.success) throw new Error('失败');
  });
  
  await test('商品 - 删除', async () => {
    if (!productId) throw new Error('无商品');
    const res = await axios.delete(`${API}/admin/products/${productId}`, { headers });
    if (!res.data.success) throw new Error('失败');
  });
  
  // 订单 CRUD
  await test('订单 - 获取列表', async () => {
    const res = await axios.get(`${API}/admin/orders`, { headers });
    if (!res.data.success) throw new Error('失败');
  });
  
  // 用户 CRUD
  await test('用户 - 获取列表', async () => {
    const res = await axios.get(`${API}/admin/users`, { headers });
    if (!res.data.success) throw new Error('失败');
  });
  
  // 作品 CRUD
  await test('作品 - 获取列表', async () => {
    const res = await axios.get(`${API}/admin/artworks`, { headers });
    if (!res.data.success) throw new Error('失败');
  });
  
  // 模板 CRUD
  await test('模板 - 获取列表', async () => {
    const res = await axios.get(`${API}/admin/templates`, { headers });
    if (!res.data.success) throw new Error('失败');
  });
  
  await test('模板 - 创建', async () => {
    const res = await axios.post(`${API}/admin/templates`, {
      name: '测试模板',
      description: '测试描述',
      width: 32,
      height: 32,
      bead_data: { cells: [{ row: 0, col: 0, color: 'red' }] },
      is_official: false
    }, { headers });
    if (!res.data.success) throw new Error('失败');
    return res.data.data.id;
  });
  
  let templateId = null;
  const templatesRes = await axios.get(`${API}/admin/templates`, { headers });
  if (templatesRes.data.data.templates.length > 0) {
    templateId = templatesRes.data.data.templates[0].id;
  }
  
  await test('模板 - 更新', async () => {
    if (!templateId) throw new Error('无模板');
    const res = await axios.put(`${API}/admin/templates/${templateId}`, {
      name: '测试模板 - 已更新',
      width: 16,
      height: 16
    }, { headers });
    if (!res.data.success) throw new Error('失败');
  });
  
  await test('模板 - 删除', async () => {
    if (!templateId) throw new Error('无模板');
    const res = await axios.delete(`${API}/admin/templates/${templateId}`, { headers });
    if (!res.data.success) throw new Error('失败');
  });
  
  // 仪表盘
  await test('仪表盘 - 统计数据', async () => {
    const res = await axios.get(`${API}/admin/dashboard/stats`, { headers });
    if (!res.data.success) throw new Error('失败');
  });
  
  await test('仪表盘 - 最近订单', async () => {
    const res = await axios.get(`${API}/admin/dashboard/recent-orders`, { headers });
    if (!res.data.success) throw new Error('失败');
  });
  
  console.log('\n✅ 所有 CRUD 测试完成！\n');
}

runTests();
