// ===== Login Page =====
const LoginPage = {
  render(container) {
    container.innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div class="login-header">
            <div class="login-icon">🗳️</div>
            <h1>電子投票システム</h1>
            <p>職員番号とログインパスワードでログイン</p>
          </div>
          <form id="login-form" onsubmit="LoginPage.handleLogin(event)">
            <div class="form-group">
              <label class="form-label" for="employee-id">職員番号</label>
              <input 
                type="text"
                id="employee-id"
                class="form-input"
                placeholder="例: EMP0001"
                autocomplete="username"
                required
              >
            </div>
            <div class="form-group">
              <label class="form-label" for="password">ログインパスワード</label>
              <input 
                type="password"
                id="password"
                class="form-input"
                placeholder="5桁の数字"
                pattern="\\d{5}"
                maxlength="5"
                inputmode="numeric"
                autocomplete="current-password"
                required
              >
              <div class="form-hint">管理者から割り振られた半角数字5桁のパスワード</div>
            </div>
            <div id="login-error" class="hidden" style="color: var(--color-danger); font-size: 0.85rem; margin-bottom: 1rem; text-align: center;"></div>
            <button type="submit" id="login-btn" class="btn btn-primary btn-lg btn-block">
              ログイン
            </button>
          </form>
          <div class="login-contact-info">
            <div class="login-contact-title">📞 お問い合わせ</div>
            <p>
              職員番号またはログインパスワードをお忘れの場合は、下記までお電話にてお問い合わせください。
            </p>
            <div class="login-contact-org">那覇市職員労働組合</div>
            <div class="login-contact-tel">
              <a href="tel:098-867-0230">☎ 098-867-0230</a>
            </div>
            <p class="login-contact-note">
              ※ セキュリティ上の理由により、メールでのお問い合わせには対応しておりません。お電話のみでの受付となります。
            </p>
          </div>
          <div style="margin-top: 1.5rem; text-align: center; font-size: 0.75rem; color: var(--color-text-muted);">
            セキュリティ保護された接続
          </div>
        </div>
      </div>
    `;

    // オートフォーカス
    setTimeout(() => {
      const input = document.getElementById('employee-id');
      if (input) input.focus();
    }, 100);
  },

  async handleLogin(event) {
    event.preventDefault();

    const employeeId = document.getElementById('employee-id').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorDiv = document.getElementById('login-error');
    const loginBtn = document.getElementById('login-btn');

    errorDiv.classList.add('hidden');
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner"></span> ログイン中...';

    try {
      const result = await API.post('/auth/login', {
        employee_id: employeeId,
        password: password
      });

      API.setToken(result.token);
      API.setUser(result.user);

      Components.showToast(`ようこそ、${result.user.name}さん`, 'success');
      Router.navigate('login'); // ロールに応じたリダイレクト
    } catch (err) {
      errorDiv.textContent = err.message;
      errorDiv.classList.remove('hidden');
      loginBtn.disabled = false;
      loginBtn.innerHTML = 'ログイン';
    }
  }
};
