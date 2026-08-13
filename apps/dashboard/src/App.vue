<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import QrcodeVue from 'qrcode.vue';

interface Session {
  id: string;
  name: string;
  status: 'DISCONNECTED' | 'PAIRING_REQUIRED' | 'CONNECTING' | 'CONNECTED';
  webhookUrl: string | null;
  qrCode?: string | null;
  isConnected?: boolean;
}

interface ApiKey {
  id: string;
  key: string;
  name: string;
  createdAt: string;
}

interface SentMessage {
  id: string;
  recipient: string;
  content: string;
  status: string;
  createdAt: string;
}

interface WebhookLog {
  id: string;
  event: string;
  payload: any;
  statusCode: number | null;
  success: boolean;
  createdAt: string;
}

// Configurações do Servidor
const API_BASE = 'http://localhost:3000';

// Estados de Autenticação
const token = ref<string | null>(localStorage.getItem('token'));
const authMode = ref<'login' | 'register'>('login');
const authForm = ref({
  email: '',
  password: '',
  name: '',
  tenantName: '',
});
const authError = ref('');
const authLoading = ref(false);

// Perfil do Usuário
const userProfile = ref<{
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER';
  tenantId?: string | null;
} | null>(null);

const tenantName = ref('Carregando...');

// Navegação por Abas
const activeTab = ref<'sessions' | 'ai' | 'keys' | 'logs'>('sessions');

// Estados das Instâncias
const sessions = ref<Session[]>([]);
const selectedSessionId = ref<string | null>(null);
const selectedSession = ref<Session | null>(null);
const creatingSession = ref(false);
const newSession = ref({
  id: '',
  name: '',
  webhookUrl: '',
});
const testMessage = ref({
  to: '',
  text: '',
  sending: false,
  status: null as 'success' | 'error' | null,
  message: '',
});

// Estados de Configuração de IA
const aiConfig = ref({
  aiProvider: 'gemini',
  aiApiKey: '',
  aiBaseUrl: '',
  aiChatModel: '',
  aiEmbeddingModel: '',
});
const aiConfigLoading = ref(false);
const aiConfigSuccess = ref(false);

// Estados das Chaves de API
const apiKeys = ref<ApiKey[]>([]);
const newKeyName = ref('');
const creatingKey = ref(false);

// Estados de Histórico & Logs
const sentMessages = ref<SentMessage[]>([]);
const webhookLogs = ref<WebhookLog[]>([]);
const logsLoading = ref(false);

let pollInterval: ReturnType<typeof setInterval> | null = null;

// Helpers de Cabeçalhos HTTP
const getHeaders = () => {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token.value}`,
  };
};

// Carregar Informações do Usuário Autenticado
const fetchMe = async () => {
  if (!token.value) return;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: getHeaders() });
    if (!res.ok) {
      handleLogout();
      return;
    }
    const data = await res.json();
    userProfile.value = data.user;

    // Se for admin de tenant, carregar as configurações do tenant
    if (data.user.role !== 'SUPER_ADMIN') {
      await fetchAiConfig();
    } else {
      tenantName.value = 'Plataforma Global (Super Admin)';
    }
  } catch (err) {
    console.error('Erro ao buscar dados do perfil:', err);
  }
};

// Autenticação: Login
const handleLogin = async () => {
  authError.value = '';
  authLoading.value = true;
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: authForm.value.email.trim(),
        password: authForm.value.password,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha no login.');

    token.value = data.token;
    localStorage.setItem('token', data.token);
    userProfile.value = data.user;

    // Resetar formulário e carregar dados
    authForm.value = { email: '', password: '', name: '', tenantName: '' };
    await fetchMe();
    await fetchSessions();
  } catch (err: any) {
    authError.value = err.message;
  } finally {
    authLoading.value = false;
  }
};

// Autenticação: Registro
const handleRegister = async () => {
  authError.value = '';
  authLoading.value = true;
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: authForm.value.email.trim(),
        password: authForm.value.password,
        name: authForm.value.name.trim(),
        tenantName: authForm.value.tenantName.trim(),
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha no registro.');

    token.value = data.token;
    localStorage.setItem('token', data.token);
    userProfile.value = data.user;

    authForm.value = { email: '', password: '', name: '', tenantName: '' };
    await fetchMe();
    await fetchSessions();
  } catch (err: any) {
    authError.value = err.message;
  } finally {
    authLoading.value = false;
  }
};

// Autenticação: Logout
const handleLogout = () => {
  token.value = null;
  userProfile.value = null;
  localStorage.removeItem('token');
  sessions.value = [];
  selectedSessionId.value = null;
  selectedSession.value = null;
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
};

// Instâncias: Buscar Lista
const fetchSessions = async () => {
  if (!token.value) return;
  try {
    const res = await fetch(`${API_BASE}/sessions`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Falha ao obter lista de sessões.');
    sessions.value = await res.json();
  } catch (err: any) {
    console.error('Erro ao buscar sessões:', err.message);
  }
};

// Instâncias: Buscar Status Único
const fetchSessionStatus = async (id: string) => {
  if (!token.value) return;
  try {
    const res = await fetch(`${API_BASE}/sessions/${id}/status`, { headers: getHeaders() });
    if (res.status === 444) {
      if (selectedSessionId.value === id) {
        selectedSessionId.value = null;
        selectedSession.value = null;
      }
      await fetchSessions();
      return;
    }
    if (!res.ok) throw new Error('Falha ao obter status.');

    const details = await res.json();
    if (selectedSessionId.value === id) {
      selectedSession.value = details;
    }

    const idx = sessions.value.findIndex(s => s.id === id);
    if (idx !== -1) {
      sessions.value[idx].status = details.status;
    }
  } catch (err: any) {
    console.error(`Erro ao buscar status da sessão ${id}:`, err.message);
  }
};

// Instâncias: Selecionar
const selectSession = (id: string) => {
  selectedSessionId.value = id;
  const found = sessions.value.find(s => s.id === id);
  if (found) {
    selectedSession.value = found;
  }
  fetchSessionStatus(id);
  testMessage.value = { to: '', text: '', sending: false, status: null, message: '' };
};

// Instâncias: Criar
const handleCreateSession = async () => {
  if (!newSession.value.name.trim()) return;
  creatingSession.value = true;
  try {
    const res = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        id: newSession.value.id.trim() || undefined,
        name: newSession.value.name.trim(),
        webhookUrl: newSession.value.webhookUrl.trim() || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao criar sessão.');

    newSession.value = { id: '', name: '', webhookUrl: '' };
    await fetchSessions();
    selectSession(data.id);
  } catch (err: any) {
    alert(err.message);
  } finally {
    creatingSession.value = false;
  }
};

// Instâncias: Desconectar
const handleDisconnect = async (id: string) => {
  if (!confirm('Deseja desconectar esta sessão temporariamente?')) return;
  try {
    const res = await fetch(`${API_BASE}/sessions/${id}/disconnect`, {
      method: 'POST',
      headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao desconectar.');
    await fetchSessionStatus(id);
  } catch (err: any) {
    alert(err.message);
  }
};

// Instâncias: Logout Criptográfico/Remoção
const handleSessionLogout = async (id: string) => {
  if (!confirm('Deseja desvincular e excluir definitivamente esta sessão do banco?')) return;
  try {
    const res = await fetch(`${API_BASE}/sessions/${id}/logout`, {
      method: 'POST',
      headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao realizar logout.');

    selectedSessionId.value = null;
    selectedSession.value = null;
    await fetchSessions();
  } catch (err: any) {
    alert(err.message);
  }
};

// Instâncias: Enviar Mensagem de Teste
const handleSendTestMessage = async () => {
  if (!selectedSessionId.value || !testMessage.value.to || !testMessage.value.text) return;
  testMessage.value.sending = true;
  testMessage.value.status = null;
  testMessage.value.message = '';

  try {
    const res = await fetch(`${API_BASE}/messages/send`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        sessionId: selectedSessionId.value,
        to: testMessage.value.to.trim(),
        text: testMessage.value.text.trim(),
      }),
    });

    const data = await res.json();
    if (res.ok) {
      testMessage.value.status = 'success';
      testMessage.value.message = `Mensagem enviada com sucesso! ID: ${data.messageId}`;
      testMessage.value.text = '';
    } else {
      throw new Error(data.error || 'Erro desconhecido.');
    }
  } catch (err: any) {
    testMessage.value.status = 'error';
    testMessage.value.message = `Erro ao enviar: ${err.message}`;
  } finally {
    testMessage.value.sending = false;
  }
};

// IA Config: Buscar do Tenant
const fetchAiConfig = async () => {
  if (!token.value) return;
  try {
    const res = await fetch(`${API_BASE}/tenant/ai-config`, { headers: getHeaders() });
    if (res.ok) {
      const data = await res.json();
      aiConfig.value = {
        aiProvider: data.aiProvider || 'gemini',
        aiApiKey: data.aiApiKey || '',
        aiBaseUrl: data.aiBaseUrl || '',
        aiChatModel: data.aiChatModel || '',
        aiEmbeddingModel: data.aiEmbeddingModel || '',
      };
      if (userProfile.value && userProfile.value.role !== 'SUPER_ADMIN') {
        tenantName.value = 'Painel do Tenant'; // Pode ser melhorado se salvarmos o nome da org
      }
    }
  } catch (err) {
    console.error('Erro ao obter AI Config:', err);
  }
};

// IA Config: Atualizar
const handleUpdateAiConfig = async () => {
  aiConfigLoading.value = true;
  aiConfigSuccess.value = false;
  try {
    const res = await fetch(`${API_BASE}/tenant/ai-config`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({
        aiProvider: aiConfig.value.aiProvider,
        aiApiKey: aiConfig.value.aiApiKey.trim() || null,
        aiBaseUrl: aiConfig.value.aiBaseUrl.trim() || null,
        aiChatModel: aiConfig.value.aiChatModel.trim() || null,
        aiEmbeddingModel: aiConfig.value.aiEmbeddingModel.trim() || null,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar configuração.');

    aiConfigSuccess.value = true;
    setTimeout(() => {
      aiConfigSuccess.value = false;
    }, 4000);
  } catch (err: any) {
    alert(err.message);
  } finally {
    aiConfigLoading.value = false;
  }
};

// API Keys: Buscar Lista
const fetchApiKeys = async () => {
  if (!token.value) return;
  try {
    const res = await fetch(`${API_BASE}/tenant/api-keys`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Falha ao obter chaves.');
    apiKeys.value = await res.json();
  } catch (err: any) {
    console.error(err);
  }
};

// API Keys: Criar Chave
const handleCreateApiKey = async () => {
  if (!newKeyName.value.trim()) return;
  creatingKey.value = true;
  try {
    const res = await fetch(`${API_BASE}/tenant/api-keys`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name: newKeyName.value.trim() }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao gerar chave.');

    newKeyName.value = '';
    await fetchApiKeys();
  } catch (err: any) {
    alert(err.message);
  } finally {
    creatingKey.value = false;
  }
};

// API Keys: Excluir/Revogar
const handleDeleteApiKey = async (id: string) => {
  if (!confirm('Deseja revogar esta chave de API definitivamente?')) return;
  try {
    const res = await fetch(`${API_BASE}/tenant/api-keys/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Erro ao revogar chave.');
    await fetchApiKeys();
  } catch (err: any) {
    alert(err.message);
  }
};

// Histórico e Logs: Carregar
const fetchLogs = async () => {
  if (!token.value) return;
  logsLoading.value = true;
  try {
    const res = await fetch(`${API_BASE}/tenant/logs`, { headers: getHeaders() });
    if (res.ok) {
      const data = await res.json();
      sentMessages.value = data.messages || [];
      webhookLogs.value = data.webhookLogs || [];
    }
  } catch (err) {
    console.error(err);
  } finally {
    logsLoading.value = false;
  }
};

// Polling e inicialização
const initApp = async () => {
  if (!token.value) return;
  await fetchMe();
  await fetchSessions();

  pollInterval = setInterval(async () => {
    await fetchSessions();
    if (selectedSessionId.value) {
      await fetchSessionStatus(selectedSessionId.value);
    }
  }, 3000);
};

// Monitorar alterações de abas para carregar dados dinamicamente
watch(activeTab, newTab => {
  if (newTab === 'keys') {
    fetchApiKeys();
  } else if (newTab === 'ai') {
    fetchAiConfig();
  } else if (newTab === 'logs') {
    fetchLogs();
  }
});

// Helper de formatação de datas
const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('pt-BR');
};

const getStatusLabel = (status: Session['status']) => {
  switch (status) {
    case 'CONNECTED':
      return 'Conectado';
    case 'PAIRING_REQUIRED':
      return 'QR Code';
    case 'CONNECTING':
      return 'Conectando...';
    case 'DISCONNECTED':
      return 'Desconectado';
    default:
      return status;
  }
};

onMounted(() => {
  initApp();
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
});
</script>

<template>
  <!-- Tela de Login / Cadastro (Não Autenticado) -->
  <div v-if="!token" class="auth-wrapper">
    <div class="auth-card">
      <div class="auth-header-logo">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8.625 9.75a.625.625 0 11-1.25 0 .625.625 0 011.25 0zm4.875 0a.625.625 0 11-1.25 0 .625.625 0 011.25 0zm4.875 0a.625.625 0 11-1.25 0 .625.625 0 011.25 0z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12z"
          />
        </svg>
        <h2>Zap-Zap SaaS Platform</h2>
        <p>Acesse o painel do seu tenant para controlar conexões e inteligência artificial.</p>
      </div>

      <div v-if="authError" class="alert alert-error" style="margin-bottom: 1.5rem">
        {{ authError }}
      </div>

      <!-- Formulário de Login -->
      <form v-if="authMode === 'login'" @submit.prevent="handleLogin">
        <div class="form-group">
          <label class="form-label" for="login-email">E-mail</label>
          <input
            id="login-email"
            v-model="authForm.email"
            type="email"
            class="form-input"
            placeholder="seuemail@provedor.com"
            required
          />
        </div>
        <div class="form-group">
          <label class="form-label" for="login-password">Senha</label>
          <input
            id="login-password"
            v-model="authForm.password"
            type="password"
            class="form-input"
            placeholder="••••••••"
            required
          />
        </div>
        <button type="submit" class="btn btn-primary" :disabled="authLoading">
          {{ authLoading ? 'Autenticando...' : 'Entrar no Painel' }}
        </button>
        <p class="auth-switch">
          Novo na plataforma?
          <a href="#" @click.prevent="authMode = 'register'">Criar uma conta SaaS</a>
        </p>
      </form>

      <!-- Formulário de Cadastro (Register) -->
      <form v-else @submit.prevent="handleRegister">
        <div class="form-group">
          <label class="form-label" for="register-name">Seu Nome</label>
          <input
            id="register-name"
            v-model="authForm.name"
            type="text"
            class="form-input"
            placeholder="Nome Completo"
            required
          />
        </div>
        <div class="form-group">
          <label class="form-label" for="register-email">E-mail Corporativo</label>
          <input
            id="register-email"
            v-model="authForm.email"
            type="email"
            class="form-input"
            placeholder="email@suaempresa.com"
            required
          />
        </div>
        <div class="form-group">
          <label class="form-label" for="register-tenant">Nome da Organização (SaaS Tenant)</label>
          <input
            id="register-tenant"
            v-model="authForm.tenantName"
            type="text"
            class="form-input"
            placeholder="Ex: Minha Empresa Ltda"
            required
          />
        </div>
        <div class="form-group">
          <label class="form-label" for="register-password">Senha de Acesso</label>
          <input
            id="register-password"
            v-model="authForm.password"
            type="password"
            class="form-input"
            placeholder="Mínimo 6 caracteres"
            required
          />
        </div>
        <button type="submit" class="btn btn-primary" :disabled="authLoading">
          {{ authLoading ? 'Registrando...' : 'Registrar Organização' }}
        </button>
        <p class="auth-switch">
          Já tem conta?
          <a href="#" @click.prevent="authMode = 'login'">Entrar na sua conta</a>
        </p>
      </form>
    </div>
  </div>

  <!-- Tela Principal do Dashboard (Autenticado) -->
  <div v-else class="app-container">
    <header class="app-header">
      <div class="app-title-group">
        <h1>Zap-Zap Dashboard</h1>
        <p>Tenant: {{ tenantName }} | Organização Multi-Tenant SaaS</p>
      </div>
      <div class="user-profile-header" v-if="userProfile">
        <div style="text-align: right">
          <span style="font-weight: 600; display: block">{{ userProfile.name }}</span>
          <span style="font-size: 0.75rem; color: var(--text-muted)">{{ userProfile.role }}</span>
        </div>
        <div class="avatar">
          {{ userProfile.name.charAt(0).toUpperCase() }}
        </div>
      </div>
    </header>

    <div class="dashboard-grid">
      <!-- Barra Lateral de Navegação -->
      <aside class="sidebar">
        <div class="card sidebar-nav">
          <h2 class="card-title">Menu Principal</h2>
          <div class="nav-links">
            <a
              href="#"
              class="nav-link"
              :class="{ active: activeTab === 'sessions' }"
              @click.prevent="activeTab = 'sessions'"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48L4.5 19.5l2.67-.89A9.37 9.37 0 0012 20.25z"
                />
              </svg>
              Instâncias WhatsApp
            </a>
            <a
              href="#"
              class="nav-link"
              :class="{ active: activeTab === 'ai' }"
              @click.prevent="activeTab = 'ai'"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M9.813 15.904L9 21m0-5.096c-2.924-.766-5-3.232-5-6.154a6.223 6.223 0 0110.454-4.5M9 15.904a6.208 6.208 0 006.183-4.096m0 0a6.223 6.223 0 00-6.183-5.808m6.183 9.904L15 21"
                />
              </svg>
              Configurações de IA
            </a>
            <a
              href="#"
              class="nav-link"
              :class="{ active: activeTab === 'keys' }"
              @click.prevent="activeTab = 'keys'"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M15.75 5.25a3 3 0 013 3m3 0a3 3 0 01-3 3m-3-3a3 3 0 00-3-3m-12 11.25V18m0 0h11.25m-11.25 0h-.75m.75 0v3h3v-3m2.25 0h.75m.75 0v-3.75"
                />
              </svg>
              Chaves de API
            </a>
            <a
              href="#"
              class="nav-link"
              :class="{ active: activeTab === 'logs' }"
              @click.prevent="activeTab = 'logs'"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              Auditoria e Logs
            </a>
          </div>
          <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 1.5rem 0" />
          <button
            class="btn btn-danger"
            style="display: flex; align-items: center; justify-content: center; gap: 0.5rem"
            @click="handleLogout"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
              />
            </svg>
            Sair da Conta
          </button>
        </div>
      </aside>

      <!-- Área de Conteúdo Principal -->
      <main>
        <!-- ABA: INSTÂNCIAS (WhatsApp Sessions) -->
        <div v-if="activeTab === 'sessions'" class="tab-content-grid">
          <!-- Coluna Lateral: Cadastro e Lista -->
          <div class="sub-sidebar">
            <!-- Cadastro -->
            <div class="card">
              <h2 class="card-title">Nova Instância</h2>
              <form @submit.prevent="handleCreateSession">
                <div class="form-group">
                  <label class="form-label" for="session-name">Nome da Instância</label>
                  <input
                    id="session-name"
                    v-model="newSession.name"
                    type="text"
                    class="form-input"
                    placeholder="Ex: Suporte de TI"
                    required
                  />
                </div>
                <div class="form-group">
                  <label class="form-label" for="session-id">ID Customizado (Opcional)</label>
                  <input
                    id="session-id"
                    v-model="newSession.id"
                    type="text"
                    class="form-input"
                    placeholder="Auto-gerado se vazio"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label" for="session-webhook">Webhook URL (Opcional)</label>
                  <input
                    id="session-webhook"
                    v-model="newSession.webhookUrl"
                    type="url"
                    class="form-input"
                    placeholder="https://exemplo.com/callback"
                  />
                </div>
                <button type="submit" class="btn btn-primary" :disabled="creatingSession">
                  {{ creatingSession ? 'Criando...' : 'Criar Instância' }}
                </button>
              </form>
            </div>

            <!-- Lista de Conexões -->
            <div class="card">
              <h2 class="card-title">Instâncias WhatsApp</h2>
              <div
                v-if="sessions.length === 0"
                style="
                  color: var(--text-muted);
                  font-size: 0.85rem;
                  text-align: center;
                  padding: 1rem 0;
                "
              >
                Nenhuma instância cadastrada.
              </div>
              <div v-else class="sessions-list">
                <div
                  v-for="session in sessions"
                  :key="session.id"
                  class="session-item"
                  :class="{ active: selectedSessionId === session.id }"
                  @click="selectSession(session.id)"
                >
                  <div class="session-item-info">
                    <h3>{{ session.name }}</h3>
                    <p>{{ session.id.slice(0, 8) }}...</p>
                  </div>
                  <span
                    class="badge"
                    :class="{
                      'badge-connected': session.status === 'CONNECTED',
                      'badge-pairing': session.status === 'PAIRING_REQUIRED',
                      'badge-connecting': session.status === 'CONNECTING',
                      'badge-disconnected': session.status === 'DISCONNECTED',
                    }"
                  >
                    {{ getStatusLabel(session.status) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Coluna Direita: Detalhes -->
          <div class="detail-pane">
            <div v-if="!selectedSession" class="detail-view-empty">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48L4.5 19.5l2.67-.89A9.37 9.37 0 0012 20.25z"
                />
              </svg>
              <h3>Nenhuma instância selecionada</h3>
              <p>
                Selecione uma instância lateral para visualizar informações de pareamento, QR Code e
                enviar mensagens.
              </p>
            </div>

            <div v-else class="card">
              <div class="session-detail-header">
                <div>
                  <h2>{{ selectedSession.name }}</h2>
                  <p
                    style="
                      font-family: var(--font-mono);
                      font-size: 0.8rem;
                      color: var(--text-muted);
                      margin-top: 0.25rem;
                    "
                  >
                    ID: {{ selectedSession.id }}
                  </p>
                </div>
                <span
                  class="badge"
                  :class="{
                    'badge-connected': selectedSession.status === 'CONNECTED',
                    'badge-pairing': selectedSession.status === 'PAIRING_REQUIRED',
                    'badge-connecting': selectedSession.status === 'CONNECTING',
                    'badge-disconnected': selectedSession.status === 'DISCONNECTED',
                  }"
                  style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                >
                  {{ getStatusLabel(selectedSession.status) }}
                </span>
              </div>

              <div class="session-metadata-grid">
                <div class="metadata-item">
                  <div class="metadata-item-label">Webhook URL</div>
                  <div class="metadata-item-value metadata-item-value-mono">
                    {{ selectedSession.webhookUrl || '(Sem webhook)' }}
                  </div>
                </div>
              </div>

              <!-- Pareamento Requerido (QR Code) -->
              <div v-if="selectedSession.status === 'PAIRING_REQUIRED'" class="qr-container">
                <div v-if="selectedSession.qrCode" class="qr-box">
                  <QrcodeVue :value="selectedSession.qrCode" :size="220" level="M" />
                </div>
                <div v-else style="padding: 2rem 0; color: var(--text-muted)">
                  Aguardando geração do QR Code pelo WhatsApp...
                </div>
                <h3 style="font-weight: 600; margin-bottom: 0.25rem">
                  Escaneie o QR Code no seu celular
                </h3>
                <p style="font-size: 0.85rem; color: var(--text-secondary); max-width: 400px">
                  Vá em Aparelhos Conectados no seu WhatsApp e clique em Conectar Aparelho para
                  parear.
                </p>
              </div>

              <!-- Conectado -->
              <div
                v-if="selectedSession.status === 'CONNECTED'"
                style="
                  margin-bottom: 2rem;
                  background-color: hsla(142, 70%, 45%, 0.05);
                  border: 1px solid hsla(142, 70%, 45%, 0.2);
                  padding: 1.5rem;
                  border-radius: 12px;
                  display: flex;
                  align-items: center;
                  gap: 1rem;
                "
              >
                <div
                  style="
                    background-color: var(--status-connected);
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                  "
                ></div>
                <div>
                  <h3 style="font-size: 0.95rem; font-weight: 600">Instância WhatsApp Online</h3>
                  <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.15rem">
                    Esta instância está emparelhada. O bot responderá automaticamente mensagens
                    baseado no motor RAG/LLM do seu tenant.
                  </p>
                </div>
              </div>

              <!-- Ações -->
              <div style="display: flex; gap: 1rem; margin-top: 1rem">
                <button
                  v-if="selectedSession.status === 'CONNECTED'"
                  class="btn btn-secondary"
                  style="width: auto"
                  @click="handleDisconnect(selectedSession.id)"
                >
                  Desconectar Instância
                </button>
                <button
                  class="btn btn-danger"
                  style="width: auto; margin-left: auto"
                  @click="handleSessionLogout(selectedSession.id)"
                >
                  Excluir e Resetar Conexão
                </button>
              </div>

              <!-- Disparo de Mensagem de Teste -->
              <div
                v-if="selectedSession.status === 'CONNECTED'"
                class="test-send-form"
                style="
                  margin-top: 2.5rem;
                  border-top: 1px solid var(--border-color);
                  padding-top: 2rem;
                "
              >
                <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem">
                  Disparar Mensagem de Teste
                </h3>
                <div
                  v-if="testMessage.status"
                  class="alert"
                  :class="testMessage.status === 'success' ? 'alert-success' : 'alert-error'"
                >
                  {{ testMessage.message }}
                </div>
                <form @submit.prevent="handleSendTestMessage">
                  <div class="form-group">
                    <label class="form-label" for="test-to">JID ou Número do Destinatário</label>
                    <input
                      id="test-to"
                      v-model="testMessage.to"
                      type="text"
                      class="form-input"
                      placeholder="Ex: 5511999999999"
                      required
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="test-text">Mensagem</label>
                    <textarea
                      id="test-text"
                      v-model="testMessage.text"
                      class="form-input"
                      rows="3"
                      placeholder="Escreva o texto aqui..."
                      required
                    ></textarea>
                  </div>
                  <button
                    type="submit"
                    class="btn btn-primary"
                    style="width: auto"
                    :disabled="testMessage.sending"
                  >
                    {{ testMessage.sending ? 'Enviando...' : 'Enviar Mensagem' }}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>

        <!-- ABA: CONFIGURAÇÃO DE IA (LLM & RAG settings per Tenant) -->
        <div v-if="activeTab === 'ai'" class="card">
          <h2 class="card-title">Configurações de Inteligência Artificial (RAG)</h2>
          <p style="color: var(--text-secondary); margin-bottom: 2rem; font-size: 0.9rem">
            Personalize o motor de Inteligência Artificial que responde às mensagens recebidas pelas
            suas instâncias WhatsApp.
          </p>

          <div v-if="aiConfigSuccess" class="alert alert-success" style="margin-bottom: 1.5rem">
            Configurações salvas e aplicadas com sucesso para todas as instâncias do seu tenant!
          </div>

          <form @submit.prevent="handleUpdateAiConfig">
            <div class="form-group">
              <label class="form-label" for="ai-provider">Provedor de LLM</label>
              <select id="ai-provider" v-model="aiConfig.aiProvider" class="form-input">
                <option value="gemini">Google Gemini (Nativo / Default)</option>
                <option value="openai">OpenAI (ou Provedor Compatível)</option>
                <option value="ollama">Ollama (Servidor de IA Local)</option>
              </select>
            </div>

            <!-- Campos Condicionais baseados no provedor -->
            <div v-if="aiConfig.aiProvider !== 'ollama'" class="form-group">
              <label class="form-label" for="ai-api-key">Chave de API (API Key)</label>
              <input
                id="ai-api-key"
                v-model="aiConfig.aiApiKey"
                type="password"
                class="form-input"
                placeholder="Insira sua chave de API privada (deixe em branco para usar o padrão do SaaS)"
              />
              <span class="form-help"
                >Seu token é armazenado com criptografia segura no banco de dados.</span
              >
            </div>

            <div v-if="aiConfig.aiProvider !== 'gemini'" class="form-group">
              <label class="form-label" for="ai-base-url">URL Base da API (Base URL)</label>
              <input
                id="ai-base-url"
                v-model="aiConfig.aiBaseUrl"
                type="url"
                class="form-input"
                placeholder="Ex: https://api.openai.com/v1 ou http://localhost:11434/v1"
              />
              <span class="form-help"
                >Requerido se usar provedor compatível como Ollama, Together AI, DeepSeek ou
                Llama.cpp.</span
              >
            </div>

            <div class="form-group">
              <label class="form-label" for="ai-chat-model">Modelo de Chat (Chat Model)</label>
              <input
                id="ai-chat-model"
                v-model="aiConfig.aiChatModel"
                type="text"
                class="form-input"
                placeholder="Ex: gemini-1.5-flash, gpt-4o-mini ou llama3"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="ai-embedding-model"
                >Modelo de Embedding (Embedding Model)</label
              >
              <input
                id="ai-embedding-model"
                v-model="aiConfig.aiEmbeddingModel"
                type="text"
                class="form-input"
                placeholder="Ex: text-embedding-005, text-embedding-3-small ou nomic-embed-text"
              />
              <span class="form-help"
                >Modelo que gera vetores no pgvector. Deve gerar vetores com 768 dimensões (ou
                diminuído nativamente).</span
              >
            </div>

            <button
              type="submit"
              class="btn btn-primary"
              style="width: auto"
              :disabled="aiConfigLoading"
            >
              {{ aiConfigLoading ? 'Salvando...' : 'Salvar Configurações' }}
            </button>
          </form>
        </div>

        <!-- ABA: CHAVES DE API (Tenant API keys) -->
        <div v-if="activeTab === 'keys'" class="card">
          <h2 class="card-title">Chaves de API do Tenant</h2>
          <p style="color: var(--text-secondary); margin-bottom: 2rem; font-size: 0.9rem">
            Gere tokens com prefixo "zap_" para integrar sistemas externos (CRMs, automações) e
            realizar disparos de mensagens automatizados.
          </p>

          <!-- Formulário Criar Chave -->
          <form
            @submit.prevent="handleCreateApiKey"
            style="display: flex; gap: 1rem; margin-bottom: 2rem; align-items: flex-end"
          >
            <div class="form-group" style="flex: 1; margin-bottom: 0">
              <label class="form-label" for="key-name">Nome da Chave</label>
              <input
                id="key-name"
                v-model="newKeyName"
                type="text"
                class="form-input"
                placeholder="Ex: Sistema ERP Financeiro"
                required
              />
            </div>
            <button
              type="submit"
              class="btn btn-primary"
              style="width: auto; height: 42px"
              :disabled="creatingKey"
            >
              {{ creatingKey ? 'Gerando...' : 'Gerar Chave' }}
            </button>
          </form>

          <!-- Tabela de chaves de API -->
          <div
            v-if="apiKeys.length === 0"
            style="text-align: center; color: var(--text-muted); padding: 2rem 0"
          >
            Nenhuma chave de API ativa encontrada.
          </div>
          <table v-else class="logs-table">
            <thead>
              <tr>
                <th>Nome identificador</th>
                <th>Token de Acesso (Chave)</th>
                <th>Criada em</th>
                <th style="text-align: right">Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="key in apiKeys" :key="key.id">
                <td>
                  <strong>{{ key.name }}</strong>
                </td>
                <td>
                  <code style="font-family: var(--font-mono); color: var(--status-connected)">{{
                    key.key
                  }}</code>
                </td>
                <td>{{ formatDate(key.createdAt) }}</td>
                <td style="text-align: right">
                  <button
                    class="btn btn-danger"
                    style="width: auto; padding: 0.25rem 0.5rem; font-size: 0.75rem"
                    @click="handleDeleteApiKey(key.id)"
                  >
                    Revogar
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ABA: AUDITORIA E LOGS (sent message history & webhook log) -->
        <div v-if="activeTab === 'logs'" class="card">
          <h2 class="card-title">Auditoria e Logs de Integração</h2>
          <p style="color: var(--text-secondary); margin-bottom: 2rem; font-size: 0.9rem">
            Acompanhe o tráfego de mensagens e webhooks enviados pelo seu tenant para auditoria e
            depuração de integrações.
          </p>

          <div
            v-if="logsLoading"
            style="text-align: center; padding: 2rem 0; color: var(--text-secondary)"
          >
            Carregando registros...
          </div>

          <div v-else class="logs-container-split">
            <!-- Coluna de Mensagens Enviadas -->
            <div class="logs-section">
              <h3
                style="
                  font-size: 1rem;
                  font-weight: 600;
                  margin-bottom: 1rem;
                  border-left: 3px solid var(--primary-color);
                  padding-left: 0.5rem;
                "
              >
                Últimas Mensagens Disparadas
              </h3>
              <div v-if="sentMessages.length === 0" class="logs-empty">
                Nenhuma mensagem enviada recentemente.
              </div>
              <div v-else class="logs-scroll">
                <div v-for="msg in sentMessages" :key="msg.id" class="log-row-item">
                  <div
                    style="
                      display: flex;
                      justify-content: space-between;
                      font-size: 0.75rem;
                      color: var(--text-muted);
                    "
                  >
                    <span
                      >Para: <strong>{{ msg.recipient.split('@')[0] }}</strong></span
                    >
                    <span>{{ formatDate(msg.createdAt) }}</span>
                  </div>
                  <p style="font-size: 0.85rem; margin-top: 0.25rem; color: var(--text-primary)">
                    {{ msg.content }}
                  </p>
                  <div style="margin-top: 0.35rem">
                    <span
                      class="badge badge-connected"
                      style="font-size: 0.65rem; padding: 0.15rem 0.35rem"
                      >{{ msg.status }}</span
                    >
                  </div>
                </div>
              </div>
            </div>

            <!-- Coluna de Webhook Logs -->
            <div class="logs-section">
              <h3
                style="
                  font-size: 1rem;
                  font-weight: 600;
                  margin-bottom: 1rem;
                  border-left: 3px solid var(--status-disconnected);
                  padding-left: 0.5rem;
                "
              >
                Callbacks e Webhook Logs
              </h3>
              <div v-if="webhookLogs.length === 0" class="logs-empty">
                Nenhum log de webhook registrado recentemente.
              </div>
              <div v-else class="logs-scroll">
                <div v-for="log in webhookLogs" :key="log.id" class="log-row-item">
                  <div
                    style="
                      display: flex;
                      justify-content: space-between;
                      font-size: 0.75rem;
                      color: var(--text-muted);
                    "
                  >
                    <span
                      >Evento: <strong>{{ log.event }}</strong></span
                    >
                    <span>{{ formatDate(log.createdAt) }}</span>
                  </div>
                  <div
                    style="
                      margin-top: 0.35rem;
                      display: flex;
                      justify-content: space-between;
                      align-items: center;
                    "
                  >
                    <span
                      class="badge"
                      :class="log.success ? 'badge-connected' : 'badge-disconnected'"
                      style="font-size: 0.65rem; padding: 0.15rem 0.35rem"
                    >
                      {{ log.success ? 'Sucesso' : 'Falha' }} (HTTP {{ log.statusCode || 'N/A' }})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style>
/* Estilos globais adicionais para autenticação, tabs, tabelas e logs */
.auth-wrapper {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-primary);
  padding: 1.5rem;
}

.auth-card {
  width: 100%;
  max-width: 440px;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 2.5rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
}

.auth-header-logo {
  text-align: center;
  margin-bottom: 2rem;
}

.auth-header-logo svg {
  color: var(--primary-color);
  margin-bottom: 1rem;
}

.auth-header-logo h2 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

.auth-header-logo p {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-top: 0.5rem;
  line-height: 1.4;
}

.auth-switch {
  margin-top: 1.5rem;
  font-size: 0.85rem;
  text-align: center;
  color: var(--text-muted);
}

.auth-switch a {
  color: var(--primary-color);
  text-decoration: none;
  font-weight: 500;
}

.auth-switch a:hover {
  text-decoration: underline;
}

/* Header */
.user-profile-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.user-profile-header .avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background-color: var(--primary-color);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1rem;
}

/* Sidebar Nav */
.sidebar-nav {
  padding: 1.5rem !important;
}

.nav-links {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 1rem;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s;
}

.nav-link:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.nav-link.active {
  background-color: var(--primary-color);
  color: #fff;
}

/* Layout Split */
.tab-content-grid {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 1.5rem;
  align-items: start;
}

.sub-sidebar {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

@media (max-width: 1024px) {
  .tab-content-grid {
    grid-template-columns: 1fr;
  }
}

/* Chaves de API e logs tables */
.logs-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
  font-size: 0.85rem;
}

.logs-table th,
.logs-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.logs-table th {
  font-weight: 600;
  color: var(--text-secondary);
  background-color: var(--bg-hover);
}

/* Container Split de Logs */
.logs-container-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

@media (max-width: 768px) {
  .logs-container-split {
    grid-template-columns: 1fr;
  }
}

.logs-section {
  background-color: var(--bg-hover);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
}

.logs-scroll {
  max-height: 480px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.log-row-item {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1rem;
}

.logs-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: 2rem 0;
}
</style>
