const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// 获取地址列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [addresses] = await pool.query(
      'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
      [req.user.id]
    );

    res.json({
      success: true,
      data: { addresses }
    });

  } catch (error) {
    console.error('获取地址列表错误:', error);
    res.status(500).json({
      success: false,
      message: '获取地址列表失败',
      error: error.message
    });
  }
});

// 获取默认地址
router.get('/default', authMiddleware, async (req, res) => {
  try {
    const [addresses] = await pool.query(
      'SELECT * FROM addresses WHERE user_id = ? AND is_default = 1 LIMIT 1',
      [req.user.id]
    );

    if (addresses.length === 0) {
      return res.json({
        success: true,
        data: { address: null }
      });
    }

    res.json({
      success: true,
      data: { address: addresses[0] }
    });

  } catch (error) {
    console.error('获取默认地址错误:', error);
    res.status(500).json({
      success: false,
      message: '获取默认地址失败',
      error: error.message
    });
  }
});

// 添加地址
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, phone, province, city, district, detail, is_default } = req.body;

    if (!name || !phone || !province || !detail) {
      return res.status(400).json({
        success: false,
        message: '请填写完整地址信息'
      });
    }

    // 如果是默认地址，先取消其他默认
    if (is_default) {
      await pool.query(
        'UPDATE addresses SET is_default = 0 WHERE user_id = ?',
        [req.user.id]
      );
    }

    const [result] = await pool.query(
      `INSERT INTO addresses (user_id, name, phone, province, city, district, detail, is_default) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, name, phone, province, city || '', district || '', detail, is_default ? 1 : 0]
    );

    res.status(201).json({
      success: true,
      message: '地址添加成功',
      data: {
        address: {
          id: result.insertId,
          name,
          phone,
          province,
          city,
          district,
          detail,
          is_default: is_default ? 1 : 0
        }
      }
    });

  } catch (error) {
    console.error('添加地址错误:', error);
    res.status(500).json({
      success: false,
      message: '添加地址失败',
      error: error.message
    });
  }
});

// 更新地址
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, province, city, district, detail, is_default } = req.body;

    // 检查地址所有权
    const [addresses] = await pool.query(
      'SELECT user_id FROM addresses WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (addresses.length === 0) {
      return res.status(404).json({
        success: false,
        message: '地址不存在'
      });
    }

    // 如果是默认地址，先取消其他默认
    if (is_default) {
      await pool.query(
        'UPDATE addresses SET is_default = 0 WHERE user_id = ? AND id != ?',
        [req.user.id, id]
      );
    }

    await pool.query(
      `UPDATE addresses 
       SET name = ?, phone = ?, province = ?, city = ?, district = ?, detail = ?, is_default = ? 
       WHERE id = ?`,
      [name, phone, province, city || '', district || '', detail, is_default ? 1 : 0, id]
    );

    res.json({
      success: true,
      message: '地址更新成功'
    });

  } catch (error) {
    console.error('更新地址错误:', error);
    res.status(500).json({
      success: false,
      message: '更新地址失败',
      error: error.message
    });
  }
});

// 删除地址
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // 检查地址所有权
    const [addresses] = await pool.query(
      'SELECT user_id FROM addresses WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (addresses.length === 0) {
      return res.status(404).json({
        success: false,
        message: '地址不存在'
      });
    }

    await pool.query('DELETE FROM addresses WHERE id = ?', [id]);

    res.json({
      success: true,
      message: '地址删除成功'
    });

  } catch (error) {
    console.error('删除地址错误:', error);
    res.status(500).json({
      success: false,
      message: '删除地址失败',
      error: error.message
    });
  }
});

module.exports = router;
