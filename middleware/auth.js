const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'e-voting-system-secret-key-change-in-production';

function generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '4h' });
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: '認証が必要です。ログインしてください。' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(401).json({ error: 'セッションが無効、または期限切れです。再ログインしてください。' });
        }
        req.user = user;
        next();
    });
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'この操作に対する権限がありません。' });
        }
        next();
    };
}

module.exports = {
    JWT_SECRET,
    generateToken,
    authenticateToken,
    requireRole
};
