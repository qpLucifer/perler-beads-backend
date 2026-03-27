const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { parsePageLimit, parseEnum, parseSort } = require('../utils/query');

// 生成订单号
function generateOrderId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `ORD${timestamp}${random}`;
}

// 获取订单列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, sort_by = 'created_at', sort_order = 'desc', page = 1, limit = 20 } = req.query;
    const { pageNum, limitNum, offset } = parsePageLimit(page, limit);
    const normalizedStatus = parseEnum(status, ['pending', 'paid', 'shipped', 'completed', 'cancelled']);
    const { sortColumn, sortDir, sortByKey, sortOrderValue } = parseSort(
      sort_by,
      sort_order,
      { created_at: 'created_at', total_amount: 'total_amount', id: 'id' },
      'created_at'
    );
    
    let sql = 'SELECT * FROM orders WHERE user_id = ?';
    const params = [req.user.id];

    if (normalizedStatus) {
      sql += ' AND status = ?';
      params.push(normalizedStatus);
    }

    sql += ` ORDER BY ${sortColumn} ${sortDir} LIMIT ? OFFSET ?`;
    params.push(limitNum, offset);

    const [orders] = await pool.query(sql, params);

    // 获取每个订单的商品
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const [items] = await pool.query(
          'SELECT * FROM order_items WHERE order_id = ?',
          [order.id]
        );
        return { ...order, items };
      })
    );

    // 获取总数
    let countSql = 'SELECT COUNT(*) as total FROM orders WHERE user_id = ?';
    const countParams = [req.user.id];
    if (normalizedStatus) {
      countSql += ' AND status = ?';
      countParams.push(normalizedStatus);
    }
    const [countResult] = await pool.query(countSql, countParams);

    res.json({
      success: true,
      data: { 
        orders: ordersWithItems,
        applied_filters: {
          status: normalizedStatus,
          sort_by: sortByKey,
          sort_order: sortOrderValue
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limitNum)
        }
      }
    });

  } catch (error) {
    console.error('获取订单列表错误:', error);
    res.status(500).json({
      success: false,
      message: '获取订单列表失败',
      error: error.message
    });
  }
});

// 获取订单详情
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: '订单不存在'
      });
    }

    const [items] = await pool.query(
      'SELECT * FROM order_items WHERE order_id = ?',
      [req.params.id]
    );

    // 获取收货地址
    const [addresses] = await pool.query(
      'SELECT * FROM addresses WHERE id = ?',
      [orders[0].address_id]
    );

    res.json({
      success: true,
      data: { 
        order: { 
          ...orders[0], 
          items,
          address: addresses[0] || null
        } 
      }
    });

  } catch (error) {
    console.error('获取订单详情错误:', error);
    res.status(500).json({
      success: false,
      message: '获取订单详情失败',
      error: error.message
    });
  }
});

// 创建订单（结算）
router.post('/', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { items, address_id, coupon_id, remark } = req.body;

    if (!items || items.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: '订单商品不能为空'
      });
    }

    if (!address_id) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: '请选择收货地址'
      });
    }

    const [addrCheck] = await connection.query(
      'SELECT id FROM addresses WHERE id = ? AND user_id = ?',
      [address_id, req.user.id]
    );
    if (addrCheck.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: '收货地址无效'
      });
    }

    // 校验行项目并计算总额（实物商品 + 用户作品）
    let totalAmount = 0;
    const resolvedLines = [];

    for (const item of items) {
      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);

      if (item.product_id) {
        const [products] = await connection.query(
          'SELECT id, name, price, stock, is_on_sale FROM products WHERE id = ?',
          [item.product_id]
        );

        if (products.length === 0) {
          await connection.rollback();
          return res.status(404).json({
            success: false,
            message: `商品 ${item.product_id} 不存在`
          });
        }

        const product = products[0];
        if (product.is_on_sale !== 1) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: `商品 ${product.name} 已下架`
          });
        }

        if (product.stock < qty) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: `商品 ${product.name} 库存不足`
          });
        }

        const price = parseFloat(product.price);
        totalAmount += price * qty;
        resolvedLines.push({
          kind: 'product',
          product_id: product.id,
          artwork_id: null,
          product_name: item.product_name || product.name,
          price,
          quantity: qty
        });
      } else if (item.artwork_id) {
        const [artworks] = await connection.query(
          'SELECT id, title, bead_count FROM artworks WHERE id = ? AND user_id = ?',
          [item.artwork_id, req.user.id]
        );

        if (artworks.length === 0) {
          await connection.rollback();
          return res.status(404).json({
            success: false,
            message: '作品不存在或无权购买'
          });
        }

        const aw = artworks[0];
        const price = 23 + (aw.bead_count || 0) * 0.1;
        totalAmount += price * qty;
        resolvedLines.push({
          kind: 'artwork',
          product_id: null,
          artwork_id: aw.id,
          product_name: item.product_name || aw.title || '自定义作品',
          price,
          quantity: qty
        });
      } else {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: '订单行缺少 product_id 或 artwork_id'
        });
      }
    }

    // 处理优惠券
    let discountAmount = 0;
    let appliedUserCouponId = null;
    if (coupon_id) {
      const [coupons] = await connection.query(
        `SELECT c.*, uc.id as user_coupon_id 
         FROM coupons c
         LEFT JOIN user_coupons uc ON c.id = uc.coupon_id AND uc.user_id = ? AND uc.status = 'unused'
         WHERE c.id = ?`,
        [req.user.id, coupon_id]
      );

      if (coupons.length > 0 && coupons[0].user_coupon_id) {
        appliedUserCouponId = coupons[0].user_coupon_id;
        const coupon = coupons[0];
        
        // 检查优惠券有效期
        const now = new Date();
        if (coupon.valid_from > now || (coupon.valid_until && coupon.valid_until < now)) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: '优惠券已过期'
          });
        }

        // 检查最低消费金额
        if (totalAmount < coupon.min_amount) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: `未达到优惠券使用门槛（满${coupon.min_amount}元可用）`
          });
        }

        // 计算优惠金额
        if (coupon.discount_type === 'fixed') {
          discountAmount = coupon.discount_value;
        } else {
          discountAmount = totalAmount * (coupon.discount_value / 100);
          if (coupon.max_discount) {
            discountAmount = Math.min(discountAmount, coupon.max_discount);
          }
        }
        discountAmount = Math.min(Number(discountAmount) || 0, totalAmount);
      }
    }

    const finalAmount = Math.max(0, totalAmount - discountAmount);
    const orderId = generateOrderId();

    // 创建订单
    await connection.query(
      `INSERT INTO orders (order_no, user_id, total_amount, paid_amount, status, address_id, remark) 
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      [orderId, req.user.id, finalAmount, 0, address_id, remark]
    );

    const [orderResult] = await connection.query('SELECT LAST_INSERT_ID() as id');
    const orderIdInt = orderResult[0].id;

    // 创建订单明细 & 扣减库存（仅实物商品）
    for (const line of resolvedLines) {
      const subtotal = line.price * line.quantity;

      await connection.query(
        `INSERT INTO order_items (order_id, product_id, artwork_id, product_name, price, quantity, subtotal) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderIdInt,
          line.product_id,
          line.artwork_id,
          line.product_name,
          line.price,
          line.quantity,
          subtotal
        ]
      );

      if (line.kind === 'product' && line.product_id) {
        await connection.query(
          'UPDATE products SET stock = stock - ? WHERE id = ?',
          [line.quantity, line.product_id]
        );
      }
    }

    // 使用优惠券（更新 user_coupons 主键，不是 coupons.id）
    if (appliedUserCouponId && discountAmount > 0) {
      await connection.query(
        `UPDATE user_coupons 
         SET status = 'used', used_at = CURRENT_TIMESTAMP, order_id = ? 
         WHERE id = ?`,
        [orderIdInt, appliedUserCouponId]
      );
    }

    // 清空购物车
    await connection.query('DELETE FROM cart WHERE user_id = ?', [req.user.id]);

    await connection.commit();

    res.status(201).json({
      success: true,
      message: '订单创建成功',
      data: {
        order: {
          id: orderIdInt,
          order_no: orderId,
          total_amount: finalAmount,
          discount_amount: discountAmount,
          status: 'pending',
          created_at: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('创建订单错误:', error);
    res.status(500).json({
      success: false,
      message: '创建订单失败',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

// 模拟支付订单
router.post('/:id/pay', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: '订单不存在'
      });
    }

    const order = orders[0];

    if (order.status !== 'pending') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: '订单状态不允许支付'
      });
    }

    // 更新订单状态
    await connection.query(
      "UPDATE orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP, paid_amount = total_amount WHERE id = ?",
      [req.params.id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: '支付成功'
    });

  } catch (error) {
    await connection.rollback();
    console.error('支付订单错误:', error);
    res.status(500).json({
      success: false,
      message: '支付失败',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

// 取消订单
router.post('/:id/cancel', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ? AND status = ?',
      [req.params.id, req.user.id, 'pending']
    );

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: '订单不存在或不可取消'
      });
    }

    // 更新订单状态
    await connection.query(
      "UPDATE orders SET status = 'cancelled' WHERE id = ?",
      [req.params.id]
    );

    // 恢复库存
    const [items] = await connection.query(
      'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
      [req.params.id]
    );

    for (const item of items) {
      await connection.query(
        'UPDATE products SET stock = stock + ? WHERE id = ?',
        [item.quantity, item.product_id]
      );
    }

    // 退还优惠券
    await connection.query(
      `UPDATE user_coupons 
       SET status = 'unused', used_at = NULL, order_id = NULL 
       WHERE order_id = ?`,
      [req.params.id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: '订单已取消'
    });

  } catch (error) {
    await connection.rollback();
    console.error('取消订单错误:', error);
    res.status(500).json({
      success: false,
      message: '取消订单失败',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

// 确认收货
router.post('/:id/confirm', authMiddleware, async (req, res) => {
  try {
    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ? AND status = ?',
      [req.params.id, req.user.id, 'shipped']
    );

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: '订单不存在或不可确认'
      });
    }

    await pool.query(
      "UPDATE orders SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
      [req.params.id]
    );

    res.json({
      success: true,
      message: '已确认收货'
    });

  } catch (error) {
    console.error('确认收货错误:', error);
    res.status(500).json({
      success: false,
      message: '确认收货失败',
      error: error.message
    });
  }
});

module.exports = router;
