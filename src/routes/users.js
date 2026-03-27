const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// 获取用户信息
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, username, email, nickname, avatar_url, phone, created_at, last_login_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    res.json({
      success: true,
      data: { user: users[0] }
    });

  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({
      success: false,
      message: '获取用户信息失败',
      error: error.message
    });
  }
});

// 更新用户信息
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const { nickname, avatar_url, phone } = req.body;

    await pool.query(
      'UPDATE users SET nickname = ?, avatar_url = ?, phone = ? WHERE id = ?',
      [nickname, avatar_url, phone, req.user.id]
    );

    res.json({
      success: true,
      message: '更新成功'
    });

  } catch (error) {
    console.error('更新用户信息错误:', error);
    res.status(500).json({
      success: false,
      message: '更新失败',
      error: error.message
    });
  }
});

module.exports = router;
