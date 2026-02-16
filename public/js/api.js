// ===== API Helper =====
const API = {
    baseUrl: '/api',

    getToken() {
        return localStorage.getItem('evote_token');
    },

    setToken(token) {
        localStorage.setItem('evote_token', token);
    },

    removeToken() {
        localStorage.removeItem('evote_token');
        localStorage.removeItem('evote_user');
    },

    getUser() {
        const data = localStorage.getItem('evote_user');
        return data ? JSON.parse(data) : null;
    },

    setUser(user) {
        localStorage.setItem('evote_user', JSON.stringify(user));
    },

    async request(method, endpoint, data = null) {
        const config = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        const token = this.getToken();
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        if (data) {
            config.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, config);
            const result = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    this.removeToken();
                    Router.navigate('login');
                }
                throw new Error(result.error || 'エラーが発生しました');
            }

            return result;
        } catch (err) {
            if (err.message.includes('Failed to fetch')) {
                throw new Error('サーバーに接続できません。ネットワーク接続を確認してください。');
            }
            throw err;
        }
    },

    get(endpoint) {
        return this.request('GET', endpoint);
    },

    post(endpoint, data) {
        return this.request('POST', endpoint, data);
    },

    put(endpoint, data) {
        return this.request('PUT', endpoint, data);
    },

    delete(endpoint) {
        return this.request('DELETE', endpoint);
    }
};
