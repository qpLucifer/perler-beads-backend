const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// 获取购物车列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [cartItems] = await pool.query(`
      SELECT 
        c.id,
        c.user_id,
        c.artwork_id,
        c.product_id,
        c.quantity,
        c.created_at,
        a.title as artwork_title,
        a.width as artwork_width,
        a.height as artwork_height,
        a.bead_data,
        a.bead_count,
        p.name as product_name,
        p.description as product_description,
        p.price as product_price,
        p.category,
        p.stock
      FROM cart c
      LEFT JOIN artworks a ON c.artwork_id = a.id
      LEFT JOIN products p ON c.product_id = p.id
      WHERE c.user_id = ?
      ORDER BY c.created_at DESC
    `, [req.user.id]);

    // 格式化数据
    const formattedItems = cartItems.map(item => ({
      id: item.id,
      quantity: item.quantity,
      createdAt: item.created_at,
      type: item.artwork_id ? 'artwork' : 'product',
      artwork: item.artwork_id ? {
        id: item.artwork_id,
        name: item.artwork_title,
        width: item.artwork_width,
        height: item.artwork_height,
        beadData: item.bead_data,
        beadCount: item.bead_count,
        price: 23.00 + (item.bead_count || 0) * 0.1
      } : null,
      product: item.product_id ? {
        id: item.product_id,
        name: item.product_name,
        description: item.product_description,
        price: parseFloat(item.product_price),
        category: item.category,
        stock: item.stock
      } : null
    }));

    res.json({
      success: true,
      data: {
        cartItems: formattedItems,
        total: formattedItems.length
      }
    });

  } catch (error) {
    console.error('获取购物车失败:', error);
    res.status(500).json({
      success: false,
      message: '获取购物车失败',
      error: error.message
    });
  }
});

// 添加商品到购物车
router.post('/items', authMiddleware, async (req, res) => {
  try {
    const { artwork_id, product_id, quantity = 1 } = req.body;

    if (!artwork_id && !product_id) {
      return res.status(400).json({
        success: false,
        message: '必须指定作品 ID 或商品 ID'
      });
    }

    // 检查是否已存在
    let whereClause = 'user_id = ?';
    let params = [req.user.id];
    
    if (artwork_id) {
      whereClause += ' AND artwork_id = ?';
      params.push(artwork_id);
    } else if (product_id) {
      whereClause += ' AND product_id = ?';
      params.push(product_id);
    }

    const [existing] = await pool.query(`SELECT id FROM cart WHERE ${whereClause}`, params);

    if (existing.length > 0) {
      // 已存在，增加数量
      await pool.query(`
        UPDATE cart SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [quantity, existing[0].id]);

      return res.json({
        success: true,
        message: '购物车数量已更新',
        data: { cartItemId: existing[0].id }
      });
    }

    // 不存在，插入新记录
    const [result] = await pool.query(`
      INSERT INTO cart (user_id, artwork_id, product_id, quantity) 
      VALUES (?, ?, ?, ?)
    `, [req.user.id, artwork_id || null, product_id || null, quantity]);

    res.status(201).json({
      success: true,
      message: '已添加到购物车',
      data: { cartItemId: result.insertId }
    });

  } catch (error) {
    console.error('添加到购物车失败:', error);
    res.status(500).json({
      success: false,
      message: '添加到购物车失败',
      error: error.message
    });
  }
});

// 更新购物车商品数量
router.put('/items/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: '数量必须大于 0'
      });
    }

    // 检查所有权
    const [items] = await pool.query(
      'SELECT id FROM cart WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (items.length === 0) {
      return res.status(404).json({
        success: false,
        message: '购物车项目不存在'
      });
    }

    await pool.query(
      'UPDATE cart SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [quantity, id]
    );

    res.json({
      success: true,
      message: '数量已更新'
    });

  } catch (error) {
    console.error('更新购物车失败:', error);
    res.status(500).json({
      success: false,
      message: '更新购物车失败',
      error: error.message
    });
  }
});

// 删除购物车项目
router.delete('/items/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // 检查所有权
    const [items] = await pool.query(
      'SELECT id FROM cart WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (items.length === 0) {
      return res.status(404).json({
        success: false,
        message: '购物车项目不存在'
      });
    }

    await pool.query('DELETE FROM cart WHERE id = ?', [id]);

    res.json({
      success: true,
      message: '已删除'
    });

  } catch (error) {
    console.error('删除购物车失败:', error);
    res.status(500).json({
      success: false,
      message: '删除购物车失败',
      error: error.message
    });
  }
});

// 清空购物车
router.delete('/', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM cart WHERE user_id = ?', [req.user.id]);

    res.json({
      success: true,
      message: '购物车已清空'
    });

  } catch (error) {
    console.error('清空购物车失败:', error);
    res.status(500).json({
      success: false,
      message: '清空购物车失败',
      error: error.message
    });
  }
});

module.exports = router;
