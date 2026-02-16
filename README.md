# 電子投票システム (E-Voting System)

労働組合向けの電子投票システムです。

## 機能

- 🗳️ **電子投票**: 役員選挙・ストライキ批准投票・信任投票（複数選択可）に対応
- 🔐 **認証・認可**: JWT認証、ロールベースアクセス制御（管理者・受付・組合員）
- 📄 **紙投票対応**: 電子投票と紙投票のハイブリッド運用
- 🛡️ **セキュリティ**: 2フェーズコミット、二重投票防止、監査ログ
- 📱 **モバイル対応**: レスポンシブデザイン、ダークテーマUI

## セットアップ

```bash
npm install
npm run seed   # テストデータ投入
npm run dev    # サーバー起動 (http://localhost:3000)
```

## テストアカウント

| ロール | ID | パスワード |
|--------|-----|-----------|
| 管理者 | ADMIN001 | 19800101 |
| 受付担当 | STAFF001 | 19850515 |
| 組合員 | EMP0001 | 19900607 |

## 技術スタック

- **Backend**: Node.js, Express.js
- **Database**: SQLite (sql.js)
- **Authentication**: JWT
- **Frontend**: Vanilla JS SPA, Glassmorphism UI
