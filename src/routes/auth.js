const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { pool } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

function buildToken(userId, username) {
  return jwt.sign(
    { userId, username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
}

async function generateWechatUsername() {
  for (let i = 0; i < 6; i++) {
    const suffix = Math.random().toString(36).slice(2, 8);
    const candidate = `wx_${suffix}`;
    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [candidate]);
    if (existing.length === 0) return candidate;
  }
  return `wx_${Date.now()}`;
}

// 用户注册
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, nickname } = req.body;

    // 验证必填字段
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }

    // 检查用户名是否已存在
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: '用户名已存在'
      });
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 10);

    // 创建用户
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password_hash, nickname) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, nickname]
    );

    // 生成 token
    const token = buildToken(result.insertId, username);

    res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        user: {
          id: result.insertId,
          username,
          email,
          nickname: nickname || username
        },
        token
      }
    });

  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({
      success: false,
      message: '注册失败',
      error: error.message
    });
  }
});

// 用户登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 验证必填字段
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }

    // 查找用户
    const [users] = await pool.query(
      'SELECT id, username, email, nickname, password_hash, status FROM users WHERE username = ?',
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    const user = users[0];

    // 检查用户状态
    if (user.status !== 1) {
      return res.status(403).json({
        success: false,
        message: '账号已被禁用'
      });
    }

    // 验证密码
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    // 更新最后登录时间
    await pool.query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
      [user.id]
    );

    // 生成 token
    const token = buildToken(user.id, user.username);

    res.json({
      success: true,
      message: '登录成功',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          nickname: user.nickname || user.username
        },
        token
      }
    });

  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({
      success: false,
      message: '登录失败',
      error: error.message
    });
  }
});

// WeChat mini-program login
router.post('/wechat-login', async (req, res) => {
  try {
    const { code, userInfo } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: '缺少微信登录 code' });
    }

    const appid = process.env.WECHAT_MINI_APPID;
    const secret = process.env.WECHAT_MINI_SECRET;
    if (!appid || !secret) {
      return res.status(500).json({ success: false, message: '微信登录未配置（缺少 appid/secret）' });
    }

    const wxRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
      params: {
        appid,
        secret,
        js_code: code,
        grant_type: 'authorization_code'
      },
      timeout: 10000
    });

    const { openid, unionid, errcode, errmsg } = wxRes.data || {};
    if (errcode || !openid) {
      return res.status(400).json({ success: false, message: errmsg || '微信登录失败' });
    }

    const [users] = await pool.query(
      'SELECT id, username, email, nickname, avatar_url, status FROM users WHERE wechat_openid = ? LIMIT 1',
      [openid]
    );

    let user;
    let isNewUser = false;

    if (users.length > 0) {
      user = users[0];
      if (user.status !== 1) {
        return res.status(403).json({ success: false, message: '账号已被禁用' });
      }
      await pool.query(
        'UPDATE users SET nickname = COALESCE(?, nickname), avatar_url = COALESCE(?, avatar_url), last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
        [userInfo?.nickName || null, userInfo?.avatarUrl || null, user.id]
      );
    } else {
      isNewUser = true;
      const username = await generateWechatUsername();
      const nickname = userInfo?.nickName || username;
      const avatar = userInfo?.avatarUrl || null;
      const email = null;
      const passwordHash = await bcrypt.hash(`wx_${openid}_${Date.now()}`, 10);
      const [result] = await pool.query(
        `INSERT INTO users (username, email, password_hash, nickname, avatar_url, wechat_openid, wechat_unionid, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [username, email, passwordHash, nickname, avatar, openid, unionid || null]
      );
      user = {
        id: result.insertId,
        username,
        email: null,
        nickname,
        avatar_url: avatar
      };
    }

    await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    const token = buildToken(user.id, user.username);

    res.json({
      success: true,
      message: '登录成功',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          nickname: user.nickname || user.username,
          avatar_url: user.avatar_url || null
        },
        token,
        isNewUser
      }
    });
  } catch (error) {
    console.error('微信登录错误:', error);
    res.status(500).json({
      success: false,
      message: '微信登录失败',
      error: error.message
    });
  }
});

// 获取当前用户信息
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
