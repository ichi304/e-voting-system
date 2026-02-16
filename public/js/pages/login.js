// ===== Login Page =====
const LoginPage = {
    render(container) {
        container.innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div class="login-header">
            <div class="login-icon">🗳️</div>
            <h1>電子投票システム</h1>
            <p>職員番号と生年月日でログイン</p>
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
              <label class="form-label" for="password">生年月日（パスワード）</label>
              <input 
                type="password"
                id="password"
                class="form-input"
                placeholder="例: 19900607"
                pattern="\\d{8}"
                maxlength="8"
                inputmode="numeric"
                autocomplete="current-password"
                required
              >
              <div class="form-hint">西暦＋月＋日の半角数字8桁（例：19900607）</div>
            </div>
            <div id="login-error" class="hidden" style="color: var(--color-danger); font-size: 0.85rem; margin-bottom: 1rem; text-align: center;"></div>
            <button type="submit" id="login-btn" class="btn btn-primary btn-lg btn-block">
              ログイン
            </button>
          </form>
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
