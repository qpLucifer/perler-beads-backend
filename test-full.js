/**
 * 拼豆 DIY 后端 API 完整测试脚本
 * 测试整个业务流程的完整性
 * 
 * 使用方法：node test-full.js
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

// 测试结果统计
let passed = 0;
let failed = 0;
let tokens = { user: null, admin: null };
let testData = {
  productId: null,
  cartId: null,
  orderId: null,
  addressId: null,
  artworkId: null
};

function log(message, type = 'info') {
  const icons = { info: '📝', success: '✅', error: '❌', warn: '⚠️' };
  console.log(`${icons[type]} ${message}`);
}

function assert(condition, testName) {
  if (condition) { passed++; log(`✓ ${testName}`, 'success'); } 
  else { failed++; log(`✗ ${testName}`, 'error'); }
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🎨 拼豆 DIY 后端 API 完整测试');
  console.log('='.repeat(60) + '\n');

  try {
    // ========== 认证功能 ==========
    log('【1. 认证功能测试】', 'info');
    
    // 用户登录
    const userRes = await axios.post(`${API_BASE}/auth/login`, {
      username: 'testuser',
      password: 'user123'
    });
    assert(userRes.data.success === true, '用户登录');
    tokens.user = userRes.data.data.token;
    
    // 管理员登录
    const adminRes = await axios.post(`${API_BASE}/auth/login`, {
      username: 'admin',
      password: 'admin123'
    });
    assert(adminRes.data.success === true, '管理员登录');
    tokens.admin = adminRes.data.data.token;
    
    // 获取用户信息
    const meRes = await axios.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${tokens.user}` }
    });
    assert(meRes.data.success === true, '获取用户信息');

    // ========== 商品功能 ==========
    log('\n【2. 商品功能测试】', 'info');
    
    const productsRes = await axios.get(`${API_BASE}/products`);
    assert(productsRes.data.success === true, '获取商品列表');
    const products = productsRes.data.data.products;
    assert(products.length > 0, '商品列表非空');
    testData.productId = products[0]?.id;
    log(`   测试商品 ID: ${testData.productId}`, 'info');

    // ========== 购物车功能 ==========
    log('\n【3. 购物车功能测试】', 'info');
    
    if (testData.productId) {
      const addToCartRes = await axios.post(`${API_BASE}/cart/items`, {
        product_id: testData.productId,
        quantity: 1
      }, { headers: { Authorization: `Bearer ${tokens.user}` } });
      assert(addToCartRes.data.success === true, '添加到购物车');
      
      const cartRes = await axios.get(`${API_BASE}/cart`, {
        headers: { Authorization: `Bearer ${tokens.user}` }
      });
      assert(cartRes.data.success === true, '获取购物车');
      const cart = cartRes.data.data;
      assert(cart.items.length > 0, '购物车非空');
      testData.cartId = cart.items[0]?.id;
      log(`   购物车商品数：${cart.count}, 总价：¥${cart.total}`, 'info');
      
      // 更新数量
      if (testData.cartId) {
        const updateRes = await axios.put(`${API_BASE}/cart/items/${testData.cartId}`, {
          quantity: 2
        }, { headers: { Authorization: `Bearer ${tokens.user}` } });
        assert(updateRes.data.success === true, '更新购物车数量');
      }
    }

    // ========== 收货地址 ==========
    log('\n【4. 收货地址测试】', 'info');
    
    const addressesRes = await axios.get(`${API_BASE}/addresses`, {
      headers: { Authorization: `Bearer ${tokens.user}` }
    });
    assert(addressesRes.data.success === true, '获取收货地址列表');
    
    const addAddressRes = await axios.post(`${API_BASE}/addresses`, {
      receiver_name: '测试用户',
      receiver_phone: '13800138000',
      province: '湖北省',
      city: '武汉市',
      district: '武昌区',
      detail_address: '测试路 1 号',
      is_default: 1
    }, { headers: { Authorization: `Bearer ${tokens.user}` } });
    assert(addAddressRes.data.success === true, '添加收货地址');
    testData.addressId = addAddressRes.data.data.id;

    // ========== 订单功能 ==========
    log('\n【5. 订单功能测试】', 'info');
    
    if (cart && cart.items.length > 0) {
      const createOrderRes = await axios.post(`${API_BASE}/orders`, {
        items: cart.items.map(item => ({
          product_id: item.product_id,
          product_name: item.name,
          quantity: item.quantity
        })),
        address_id: testData.addressId,
        remark: '测试订单'
      }, { headers: { Authorization: `Bearer ${tokens.user}` } });
      assert(createOrderRes.data.success === true, '创建订单');
      testData.orderId = createOrderRes.data.data.order.id;
      log(`   订单号：${createOrderRes.data.data.order.order_no}`, 'info');
      
      // 获取订单列表
      const ordersRes = await axios.get(`${API_BASE}/orders`, {
        headers: { Authorization: `Bearer ${tokens.user}` }
      });
      assert(ordersRes.data.success === true, '获取订单列表');
      
      // 支付订单
      if (testData.orderId) {
        const payRes = await axios.post(`${API_BASE}/orders/${testData.orderId}/pay`, {}, {
          headers: { Authorization: `Bearer ${tokens.user}` }
        });
        assert(payRes.data.success === true, '支付订单');
      }
    }

    // ========== 收藏功能 ==========
    log('\n【6. 收藏功能测试】', 'info');
    
    if (testData.productId) {
      const favRes = await axios.post(`${API_BASE}/favorites`, {
        product_id: testData.productId
      }, { headers: { Authorization: `Bearer ${tokens.user}` } });
      assert(favRes.data.success === true, '添加收藏');
      
      const favListRes = await axios.get(`${API_BASE}/favorites`, {
        headers: { Authorization: `Bearer ${tokens.user}` }
      });
      assert(favListRes.data.success === true, '获取收藏列表');
    }

    // ========== 优惠券功能 ==========
    log('\n【7. 优惠券功能测试】', 'info');
    
    const couponsRes = await axios.get(`${API_BASE}/coupons`);
    assert(couponsRes.data.success === true, '获取优惠券列表');
    log(`   可用优惠券：${couponsRes.data.data.coupons.length} 个`, 'info');
    
    const myCouponsRes = await axios.get(`${API_BASE}/coupons/my`, {
      headers: { Authorization: `Bearer ${tokens.user}` }
    });
    assert(myCouponsRes.data.success === true, '获取我的优惠券');

    // ========== 模板功能 ==========
    log('\n【8. 模板功能测试】', 'info');
    
    const templatesRes = await axios.get(`${API_BASE}/templates`);
    assert(templatesRes.data.success === true, '获取模板列表');
    log(`   官方模板：${templatesRes.data.data.templates.length} 个`, 'info');

    // ========== 作品功能 ==========
    log('\n【9. 作品功能测试】', 'info');
    
    const saveArtworkRes = await axios.post(`${API_BASE}/artworks`, {
      title: '测试作品',
      width: 32,
      height: 32,
      bead_data: JSON.stringify({ cells: [] }),
      bead_count: 100,
      is_public: 1
    }, { headers: { Authorization: `Bearer ${tokens.user}` } });
    assert(saveArtworkRes.data.success === true, '保存作品');
    testData.artworkId = saveArtworkRes.data.data.id;
    
    const artworksRes = await axios.get(`${API_BASE}/artworks/my`, {
      headers: { Authorization: `Bearer ${tokens.user}` }
    });
    assert(artworksRes.data.success === true, '获取我的作品');

    // ========== 管理员功能 ==========
    log('\n【10. 管理功能测试】', 'info');
    
    const dashboardRes = await axios.get(`${API_BASE}/admin/dashboard/stats`, {
      headers: { Authorization: `Bearer ${tokens.admin}` }
    });
    assert(dashboardRes.data.success === true, '获取仪表盘统计');
    log(`   用户数：${dashboardRes.data.data.users.total}, 订单数：${dashboardRes.data.data.orders.total}`, 'info');
    
    const adminUsersRes = await axios.get(`${API_BASE}/admin/users`, {
      headers: { Authorization: `Bearer ${tokens.admin}` }
    });
    assert(adminUsersRes.data.success === true, '获取用户列表');
    
    const adminOrdersRes = await axios.get(`${API_BASE}/admin/orders`, {
      headers: { Authorization: `Bearer ${tokens.admin}` }
    });
    assert(adminOrdersRes.data.success === true, '获取订单列表');
    
    const adminProductsRes = await axios.get(`${API_BASE}/admin/products`, {
      headers: { Authorization: `Bearer ${tokens.admin}` }
    });
    assert(adminProductsRes.data.success === true, '获取商品列表（管理）');

  } catch (error) {
    log(`测试中断：${error.message}`, 'error');
    if (error.response) {
      log(`状态码：${error.response.status}`, 'error');
      log(`响应：${JSON.stringify(error.response.data)}`, 'error');
    }
  }

  // 输出结果
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果');
  console.log('='.repeat(60));
  console.log(`✅ 通过：${passed}`);
  console.log(`❌ 失败：${failed}`);
  console.log(`📈 通过率：${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('='.repeat(60) + '\n');

  if (failed === 0) {
    log('🎉 所有测试通过！后端 API 功能完整！', 'success');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
