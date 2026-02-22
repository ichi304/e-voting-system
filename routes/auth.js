const express = require('express');
const router = express.Router();
const { dbGet } = require('../db/init');
const { generateToken } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { employee_id, password } = req.body;

        if (!employee_id || !password) {
            return res.status(400).json({ error: '職員番号とログインパスワードを入力してください。' });
        }

        const trimmedId = String(employee_id).trim();

        const pinPattern = /^\d{5}$/;
        if (!pinPattern.test(password)) {
            return res.status(400).json({ error: 'ログインパスワードは半角数字5桁で入力してください。' });
        }

        const member = await dbGet('SELECT * FROM members WHERE employee_id = ?', [trimmedId]);

        if (!member) {
            return res.status(401).json({ error: '職員番号またはログインパスワードが正しくありません。' });
        }

        if (member.login_pin !== password) {
            return res.status(401).json({ error: '職員番号またはログインパスワードが正しくありません。' });
        }

        const token = generateToken({
            employee_id: member.employee_id,
            name: member.name,
            role: member.role
        });

        res.json({
            token,
            user: {
                employee_id: member.employee_id,
                name: member.name,
                role: member.role
            }
        });
    } catch (err) {
        console.error('ログインエラー:', err);
        res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
});

module.exports = router;
