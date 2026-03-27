const axios = require('axios');

async function testAdmin() {
  try {
    console.log('测试管理员接口...\n');
    
    // 1. 登录
    console.log('1. 登录...');
    const loginRes = await axios.post('http://localhost:3000/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    const token = loginRes.data.data.token;
    console.log('✅ Token:', token.substring(0, 50) + '...\n');
    
    // 2. 测试仪表盘
    console.log('2. 测试仪表盘接口...');
    const dashboardRes = await axios.get('http://localhost:3000/api/admin/dashboard/stats', {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000
    });
    console.log('✅ 仪表盘数据:', JSON.stringify(dashboardRes.data.data, null, 2));
    
    // 3. 测试错误密码
    console.log('\n3. 测试错误密码...');
    try {
      await axios.post('http://localhost:3000/api/auth/login', {
        username: 'admin',
        password: 'wrongpassword'
      });
    } catch (error) {
      console.log('✅ 错误提示:', error.response.data.message);
    }
    
    console.log('\n✅ 所有测试通过！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
  }
}

testAdmin();
