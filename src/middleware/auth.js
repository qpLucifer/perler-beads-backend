const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
  try {
    // 从 Header 获取 token
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: '未提供认证令牌'
      });
    }

    const token = authHeader.split(' ')[1];

    // 验证 token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 将用户信息附加到请求对象
    req.user = {
      id: decoded.userId,
      username: decoded.username
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: '认证令牌已过期'
      });
    }

    return res.status(401).json({
      success: false,
      message: '无效的认证令牌'
    });
  }
};

// 可选认证（有 token 则验证，没有也继续）
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = {
        id: decoded.userId,
        username: decoded.username
      };
    }
  } catch (error) {
    // 忽略错误，继续执行
  }
  next();
};

module.exports = { authMiddleware, optionalAuth };
