const axios = require('axios');

async function testLogin() {
  try {
    console.log('测试登录接口...\n');
    
    // 测试管理员登录
    console.log('1. 管理员登录 (admin/admin123)');
    const adminRes = await axios.post('http://localhost:3000/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    console.log('✅ 管理员登录成功');
    console.log('Token:', adminRes.data.data.token.substring(0, 50) + '...\n');
    
    // 测试用户登录
    console.log('2. 用户登录 (testuser/user123)');
    const userRes = await axios.post('http://localhost:3000/api/auth/login', {
      username: 'testuser',
      password: 'user123'
    });
    console.log('✅ 用户登录成功');
    console.log('Token:', userRes.data.data.token.substring(0, 50) + '...\n');
    
    // 测试获取商品列表
    console.log('3. 获取商品列表');
    const productsRes = await axios.get('http://localhost:3000/api/products');
    console.log(`✅ 获取成功，共 ${productsRes.data.data.products.length} 个商品`);
    productsRes.data.data.products.forEach(p => {
      console.log(`   - ${p.name} (¥${p.price})`);
    });
    
  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
  }
}

testLogin();
