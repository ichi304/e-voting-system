// ===== App Initialization =====
const App = {
    init() {
        const user = API.getUser();
        const token = API.getToken();

        if (user && token) {
            // ロールに基づいてデフォルトページへ
            switch (user.role) {
                case 'admin':
                    Router.navigate('admin');
                    break;
                case 'reception':
                    Router.navigate('reception');
                    break;
                default:
                    Router.navigate('voter');
            }
        } else {
            Router.navigate('login');
        }
    },

    logout() {
        API.removeToken();
        Components.showToast('ログアウトしました', 'info');
        Router.navigate('login');
    }
};

// DOMContentLoaded で初期化
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
