// ===== Reception Page (受付担当) =====
const ReceptionPage = {
    currentElection: null,

    async render(container) {
        const user = API.getUser();
        container.innerHTML = Components.navbar(user) + `
      <div class="main-content">
        <div class="page-header">
          <h1 class="page-title">受付ダッシュボード</h1>
          <p class="page-subtitle">紙投票の受付・組合員ステータス管理</p>
        </div>

        <!-- 投票選択 -->
        <div class="card mb-2" id="election-selector-card">
          <div class="card-header">
            <div class="card-title">📋 対象投票の選択</div>
          </div>
          <div id="election-selector">
            ${Components.loading()}
          </div>
        </div>

        <!-- 投票状況 -->
        <div id="stats-section" class="hidden">
          <div id="stats-grid" class="stats-grid mb-2"></div>
        </div>

        <!-- 検索・受付 -->
        <div class="card" id="search-card" style="display: none;">
          <div class="card-header">
            <div class="card-title">🔍 組合員検索・紙投票受付</div>
          </div>
          <div class="search-box">
            <span class="search-icon">🔎</span>
            <input type="text" id="member-search" placeholder="職員番号または氏名で検索..." oninput="ReceptionPage.debouncedSearch()">
          </div>
          <div id="search-results"></div>
        </div>
      </div>
    `;

        await this.loadElections();
    },

    async loadElections() {
        try {
            const elections = await API.get('/reception/elections');
            const selectorEl = document.getElementById('election-selector');

            if (elections.length === 0) {
                selectorEl.innerHTML = `
          <div class="empty-state" style="padding: 1.5rem;">
            <div class="empty-state-icon">📭</div>
            <div class="empty-state-title">現在アクティブな投票はありません</div>
          </div>
        `;
                return;
            }

            selectorEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${elections.map(e => `
            <div class="election-card" style="margin-bottom: 0; cursor: pointer;" onclick="ReceptionPage.selectElection('${e.id}', '${Components.escapeHtml(e.title).replace(/'/g, "\\'")}')">
              <div class="flex-between">
                <div class="flex gap-2" style="align-items: center;">
                  ${Components.electionTypeIcon(e.type)}
                  <div>
                    <div style="font-weight: 600;">${Components.escapeHtml(e.title)}</div>
                    <div style="font-size: 0.8rem; color: var(--color-text-muted);">
                      ${Components.formatDateTime(e.start_datetime)} ～ ${Components.formatDateTime(e.end_datetime)}
                    </div>
                  </div>
                </div>
                ${Components.statusBadge(e.status)}
              </div>
            </div>
          `).join('')}
        </div>
      `;
        } catch (err) {
            Components.showToast(err.message, 'error');
        }
    },

    async selectElection(electionId, title) {
        this.currentElection = { id: electionId, title };

        document.getElementById('election-selector-card').querySelector('.card-title').innerHTML =
            `📋 対象投票: <span style="color: var(--color-text-accent)">${title}</span>`;

        document.getElementById('search-card').style.display = 'block';
        document.getElementById('stats-section').classList.remove('hidden');

        await this.loadStats();
    },

    async loadStats() {
        if (!this.currentElection) return;

        try {
            const stats = await API.get(`/reception/stats/${this.currentElection.id}`);
            document.getElementById('stats-grid').innerHTML = `
        <div class="stat-card">
          <div class="stat-value accent">${stats.total}</div>
          <div class="stat-label">有権者数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value warning">${stats.not_voted}</div>
          <div class="stat-label">未投票</div>
        </div>
        <div class="stat-card">
          <div class="stat-value success">${stats.voted_electronic}</div>
          <div class="stat-label">電子投票</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.voted_paper}</div>
          <div class="stat-label">紙投票</div>
        </div>
        <div class="stat-card">
          <div class="stat-value accent">${stats.turnout_rate}%</div>
          <div class="stat-label">投票率</div>
        </div>
      `;
        } catch (err) {
            Components.showToast(err.message, 'error');
        }
    },

    // 検索デバウンス
    searchTimeout: null,
    debouncedSearch() {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => this.search(), 300);
    },

    async search() {
        const query = document.getElementById('member-search').value.trim();
        const resultsEl = document.getElementById('search-results');

        if (query.length === 0) {
            resultsEl.innerHTML = '';
            return;
        }

        try {
            const members = await API.get(`/reception/search?q=${encodeURIComponent(query)}`);

            if (members.length === 0) {
                resultsEl.innerHTML = `
          <div class="empty-state" style="padding: 1.5rem;">
            <div class="empty-state-title">該当する組合員が見つかりません</div>
          </div>
        `;
                return;
            }

            // 各メンバーのステータスを取得
            const statusPromises = members.map(m =>
                API.get(`/reception/status/${m.employee_id}/${this.currentElection.id}`)
                    .catch(() => ({ status: 'unknown' }))
            );
            const statuses = await Promise.all(statusPromises);

            resultsEl.innerHTML = `
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>職員番号</th>
                <th>氏名</th>
                <th>ステータス</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${members.map((m, i) => {
                const s = statuses[i];
                const canAccept = s.status === 'not_voted';
                return `
                  <tr>
                    <td style="font-weight: 600;">${Components.escapeHtml(m.employee_id)}</td>
                    <td>${Components.escapeHtml(m.name)}</td>
                    <td>${Components.statusBadge(s.status)}</td>
                    <td>
                      ${canAccept ? `
                        <button class="btn btn-success btn-sm" onclick="ReceptionPage.confirmPaperVote('${m.employee_id}', '${Components.escapeHtml(m.name).replace(/'/g, "\\'")}')">
                          紙投票受付
                        </button>
                      ` : `
                        <span class="text-muted" style="font-size: 0.8rem;">受付不可</span>
                      `}
                    </td>
                  </tr>
                `;
            }).join('')}
            </tbody>
          </table>
        </div>
      `;
        } catch (err) {
            Components.showToast(err.message, 'error');
        }
    },

    confirmPaperVote(employeeId, name) {
        Components.showModal(`
      <div class="modal-header">
        <div class="modal-icon modal-icon-warning">📄</div>
        <div class="modal-title">紙投票受付の確認</div>
      </div>
      <div class="modal-body">
        <div class="confirm-summary">
          <div class="confirm-item">
            <span class="confirm-item-label">対象投票</span>
            <span class="confirm-item-value">${Components.escapeHtml(this.currentElection.title)}</span>
          </div>
          <div class="confirm-item">
            <span class="confirm-item-label">職員番号</span>
            <span class="confirm-item-value">${Components.escapeHtml(employeeId)}</span>
          </div>
          <div class="confirm-item">
            <span class="confirm-item-label">氏名</span>
            <span class="confirm-item-value">${Components.escapeHtml(name)}</span>
          </div>
        </div>
        <p style="font-size: 0.85rem; color: var(--color-text-muted); text-align: center;">
          ステータスを「紙投票受付完了」に変更し、電子投票をロックします。<br>
          変更後は投票用紙を交付してください。
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Components.closeModal(event)">キャンセル</button>
        <button class="btn btn-success" id="paper-vote-btn" onclick="ReceptionPage.registerPaperVote('${employeeId}')">
          受付を確定する
        </button>
      </div>
    `);
    },

    async registerPaperVote(employeeId) {
        const btn = document.getElementById('paper-vote-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> 処理中...';

        try {
            const result = await API.post('/reception/paper-vote', {
                employee_id: employeeId,
                election_id: this.currentElection.id
            });

            Components.closeModal();
            Components.showToast(result.message, 'success');

            // 検索結果とステータスを更新
            await this.search();
            await this.loadStats();
        } catch (err) {
            Components.showToast(err.message, 'error');
            btn.disabled = false;
            btn.innerHTML = '受付を確定する';
        }
    }
};
