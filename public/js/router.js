// ===== Simple SPA Router =====
const Router = {
    currentPage: null,

    navigate(page, params = {}) {
        this.currentPage = page;
        this.params = params;
        this.render();
    },

    render() {
        const user = API.getUser();
        const app = document.getElementById('app');

        // 未認証の場合はログインページへ
        if (!user && this.currentPage !== 'login') {
            this.currentPage = 'login';
        }

        // ロール別のデフォルトページ
        if (user && this.currentPage === 'login') {
            switch (user.role) {
                case 'admin':
                    this.currentPage = 'admin';
                    break;
                case 'reception':
                    this.currentPage = 'reception';
                    break;
                default:
                    this.currentPage = 'voter';
            }
        }

        // ページレンダリング
        switch (this.currentPage) {
            case 'login':
                LoginPage.render(app);
                break;
            case 'voter':
                VoterPage.render(app);
                break;
            case 'voter-vote':
                VoterPage.renderVoting(app, this.params);
                break;
            case 'reception':
                ReceptionPage.render(app);
                break;
            case 'admin':
                AdminPage.render(app);
                break;
            default:
                this.currentPage = 'login';
                LoginPage.render(app);
        }
    }
};
