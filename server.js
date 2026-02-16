const express = require('express');
const path = require('path');
const cors = require('cors');
const { initDatabases } = require('./db/init');

async function startServer() {
    // DB初期化
    await initDatabases();

    const app = express();
    const PORT = process.env.PORT || 3000;

    // ミドルウェア
    app.use(cors());
    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));

    // ルート
    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/vote', require('./routes/vote'));
    app.use('/api/reception', require('./routes/reception'));
    app.use('/api/admin', require('./routes/admin'));

    // SPA フォールバック
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // エラーハンドリング
    app.use((err, req, res, next) => {
        console.error('サーバーエラー:', err);
        res.status(500).json({ error: 'サーバー内部エラーが発生しました。' });
    });

    app.listen(PORT, () => {
        console.log(`\n🗳️  電子投票システム起動中...`);
        console.log(`📡 サーバーアドレス: http://localhost:${PORT}`);
        console.log(`\n[テストアカウント]`);
        console.log(`  管理者: ID=ADMIN001 / PW=19800101`);
        console.log(`  受付:   ID=STAFF001 / PW=19850515`);
        console.log(`  組合員: ID=EMP0001 / PW=19900607\n`);
    });
}

startServer().catch(err => {
    console.error('サーバー起動エラー:', err);
    process.exit(1);
});
