<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import QrcodeVue from 'qrcode.vue';

interface Session {
  id: string;
  name: string;
  status: 'DISCONNECTED' | 'PAIRING_REQUIRED' | 'CONNECTING' | 'CONNECTED';
  phone?: string | null;
  meJid?: string | null;
  pairingCode?: string | null;
  webhookUrl: string | null;
  webhookEvents?: string[];
  botEnabled?: boolean;
  botConfig?: any;
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

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

// Configurações do Servidor
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';

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
const searchQuery = ref('');
const statusFilter = ref<'all' | 'CONNECTED' | 'PAIRING_REQUIRED' | 'DISCONNECTED'>('all');

const filteredSessions = computed(() => {
  return sessions.value.filter(session => {
    const matchesSearch = session.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
                          session.id.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
                          (session.phone && session.phone.includes(searchQuery.value.trim()));
                          
    const matchesStatus = statusFilter.value === 'all' || 
                          (statusFilter.value === 'DISCONNECTED' 
                            ? (session.status === 'DISCONNECTED' || session.status === 'CONNECTING') 
                            : session.status === statusFilter.value);
    
    return matchesSearch && matchesStatus;
  });
});

const viewMode = ref<'split' | 'grid'>('split');
const copiedId = ref<string | null>(null);

const copyToClipboard = async (text: string, id: string) => {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copiedId.value = id;
    showToast('Copiado para a área de transferência!', 'success');
    setTimeout(() => {
      if (copiedId.value === id) {
        copiedId.value = null;
      }
    }, 2000);
  } catch (err) {
    showToast('Falha ao copiar texto.', 'error');
  }
};

const newSession = ref({
  id: '',
  name: '',
  webhookUrl: '',
});

const webhookEventsInput = ref('');
const botConfigInput = ref<{ type: string; prompt?: string }>({ type: 'simple', prompt: '' });
const botRulesJsonInput = ref('');
const updatingSession = ref(false);
const connectionMode = ref<'qr' | 'pairing'>('qr');
const pairingPhone = ref('');
const testMessage = ref({
  to: '',
  text: '',
  sending: false,
  status: null as 'success' | 'error' | null,
  message: '',
});

// Estados de Configuração de IA
const aiConfig = ref({
  aiProvider: 'ollama',
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
const revealedKeys = ref<Record<string, boolean>>({});
const toggleRevealKey = (id: string) => {
  revealedKeys.value[id] = !revealedKeys.value[id];
};
const maskKey = (val: string) => {
  if (!val) return '';
  if (val.startsWith('zap_')) {
    return 'zap_' + '•'.repeat(24);
  }
  return '•'.repeat(24);
};

// Estados de Histórico & Logs
const sentMessages = ref<SentMessage[]>([]);
const webhookLogs = ref<WebhookLog[]>([]);
const logsLoading = ref(false);

// Estados de Toasts (Mensagens Flash)
const toasts = ref<Toast[]>([]);
let nextToastId = 0;

// Estados de Modais de Confirmação e Alerta Customizados
const confirmModal = ref({
  visible: false,
  title: '',
  message: '',
  confirmText: 'Confirmar',
  cancelText: 'Cancelar',
  isDanger: false,
  onConfirm: () => { },
  onCancel: () => { },
});

const alertModal = ref({
  visible: false,
  title: '',
  message: '',
  buttonText: 'Ok',
  onClose: () => { },
});

let pollInterval: ReturnType<typeof setInterval> | null = null;

// Helpers de Cabeçalhos HTTP
const getHeaders = () => {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token.value}`,
  };
};

// Funções Utilitárias de UX (Toasts & Modais Customizados)
const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
  const id = nextToastId++;
  toasts.value.push({ id, message, type });
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, 4000);
};

const showConfirm = (options: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}) => {
  confirmModal.value = {
    visible: true,
    title: options.title,
    message: options.message,
    confirmText: options.confirmText || 'Confirmar',
    cancelText: options.cancelText || 'Cancelar',
    isDanger: !!options.isDanger,
    onConfirm: () => {
      options.onConfirm();
      confirmModal.value.visible = false;
    },
    onCancel: () => {
      if (options.onCancel) options.onCancel();
      confirmModal.value.visible = false;
    },
  };
};

const showAlert = (title: string, message: string, buttonText = 'Entendido') => {
  alertModal.value = {
    visible: true,
    title,
    message,
    buttonText,
    onClose: () => {
      alertModal.value.visible = false;
    },
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

    authForm.value = { email: '', password: '', name: '', tenantName: '' };
    await fetchMe();
    await fetchSessions();
    showToast('Login efetuado com sucesso!', 'success');
  } catch (err: any) {
    authError.value = err.message;
    showAlert('Falha no Login', err.message);
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
    showToast('Organização cadastrada com sucesso!', 'success');
  } catch (err: any) {
    authError.value = err.message;
    showAlert('Erro no Cadastro', err.message);
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
  showToast('Você saiu da sua conta.', 'info');
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

// Instâncias: Selecionar e mudar para visualização de detalhes (split view)
const selectSessionAndSwitch = (id: string) => {
  selectSession(id);
  viewMode.value = 'split';
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
        phone: connectionMode.value === 'pairing' ? pairingPhone.value.trim() : undefined,
        webhookUrl: newSession.value.webhookUrl.trim() || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao criar sessão.');

    newSession.value = { id: '', name: '', webhookUrl: '' };
    pairingPhone.value = '';
    connectionMode.value = 'qr';
    await fetchSessions();
    selectSession(data.id);
    showToast('Instância criada com sucesso.', 'success');
  } catch (err: any) {
    showToast(err.message, 'error');
  } finally {
    creatingSession.value = false;
  }
};

// Monitorar a sessão selecionada para sincronizar inputs
watch(selectedSession, (newVal) => {
  if (newVal) {
    webhookEventsInput.value = newVal.webhookEvents ? newVal.webhookEvents.join(', ') : 'all';
    const config = newVal.botConfig || {};
    botConfigInput.value = {
      type: config.type || 'simple',
      prompt: config.prompt || '',
    };
    botRulesJsonInput.value = config.rules ? JSON.stringify(config.rules, null, 2) : '[]';
  }
});

// Instâncias: Atualizar Configurações (Webhook e Bot)
const handleUpdateSession = async () => {
  if (!selectedSession.value) return;
  updatingSession.value = true;

  let botConfig: any = { type: botConfigInput.value.type };
  if (botConfigInput.value.type === 'simple') {
    try {
      botConfig.rules = JSON.parse(botRulesJsonInput.value || '[]');
    } catch (err) {
      showToast('Formato JSON de regras inválido!', 'error');
      updatingSession.value = false;
      return;
    }
  } else {
    botConfig.prompt = botConfigInput.value.prompt;
  }

  const events = webhookEventsInput.value
    .split(',')
    .map(e => e.trim())
    .filter(e => e.length > 0);

  try {
    const res = await fetch(`${API_BASE}/sessions/${selectedSession.value.id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({
        webhookUrl: selectedSession.value.webhookUrl || null,
        webhookEvents: events,
        botEnabled: selectedSession.value.botEnabled,
        botConfig,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar configurações.');

    showToast('Configurações da instância salvas com sucesso!', 'success');
    await fetchSessionStatus(selectedSession.value.id);
  } catch (err: any) {
    showToast(err.message, 'error');
  } finally {
    updatingSession.value = false;
  }
};

// Instâncias: Desconectar
const handleDisconnect = async (id: string) => {
  showConfirm({
    title: 'Desconectar Instância',
    message:
      'Deseja desconectar esta sessão temporariamente? O motor de IA ficará inativo até que ela seja reconectada.',
    confirmText: 'Desconectar',
    isDanger: true,
    onConfirm: async () => {
      try {
        const res = await fetch(`${API_BASE}/sessions/${id}/disconnect`, {
          method: 'POST',
          headers: getHeaders(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao desconectar.');
        await fetchSessionStatus(id);
        showToast('Instância desconectada com sucesso.', 'success');
      } catch (err: any) {
        showToast(err.message, 'error');
      }
    },
  });
};

// Instâncias: Logout Criptográfico/Remoção
const handleSessionLogout = async (id: string) => {
  showConfirm({
    title: 'Desvincular Instância',
    message:
      'Deseja desvincular e excluir definitivamente esta sessão do banco? Todos os dados de login locais serão apagados do servidor.',
    confirmText: 'Excluir Instância',
    isDanger: true,
    onConfirm: async () => {
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
        showToast('Instância excluída e desconectada.', 'success');
      } catch (err: any) {
        showToast(err.message, 'error');
      }
    },
  });
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
      showToast('Mensagem enviada com sucesso!', 'success');
    } else {
      throw new Error(data.error || 'Erro desconhecido.');
    }
  } catch (err: any) {
    testMessage.value.status = 'error';
    testMessage.value.message = `Erro ao enviar: ${err.message}`;
    showToast(err.message, 'error');
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
        aiProvider: data.aiProvider || 'ollama',
        aiApiKey: data.aiApiKey || '',
        aiBaseUrl: data.aiBaseUrl || '',
        aiChatModel: data.aiChatModel || '',
        aiEmbeddingModel: data.aiEmbeddingModel || '',
      };
      if (userProfile.value && userProfile.value.role !== 'SUPER_ADMIN') {
        tenantName.value = 'Painel do Tenant';
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
    showToast('Configurações de IA salvas com sucesso!', 'success');
    setTimeout(() => {
      aiConfigSuccess.value = false;
    }, 4000);
  } catch (err: any) {
    showToast(err.message, 'error');
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
    showToast('Chave de API gerada com sucesso!', 'success');
  } catch (err: any) {
    showToast(err.message, 'error');
  } finally {
    creatingKey.value = false;
  }
};

// API Keys: Excluir/Revogar
const handleDeleteApiKey = async (id: string) => {
  showConfirm({
    title: 'Revogar Chave de API',
    message:
      'Deseja revogar esta chave de API definitivamente? Qualquer aplicativo em produção usando essa chave perderá o acesso.',
    confirmText: 'Revogar Chave',
    isDanger: true,
    onConfirm: async () => {
      try {
        const res = await fetch(`${API_BASE}/tenant/api-keys/${id}`, {
          method: 'DELETE',
          headers: getHeaders(),
        });
        if (!res.ok) throw new Error('Erro ao revogar chave.');
        await fetchApiKeys();
        showToast('Chave de API revogada com sucesso.', 'success');
      } catch (err: any) {
        showToast(err.message, 'error');
      }
    },
  });
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
  }, 3002);
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
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M8.625 9.75a.625.625 0 11-1.25 0 .625.625 0 011.25 0zm4.875 0a.625.625 0 11-1.25 0 .625.625 0 011.25 0zm4.875 0a.625.625 0 11-1.25 0 .625.625 0 011.25 0z" />
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12z" />
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
          <input id="login-email" v-model="authForm.email" type="email" class="form-input"
            placeholder="seuemail@provedor.com" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="login-password">Senha</label>
          <input id="login-password" v-model="authForm.password" type="password" class="form-input"
            placeholder="••••••••" required />
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
          <input id="register-name" v-model="authForm.name" type="text" class="form-input" placeholder="Nome Completo"
            required />
        </div>
        <div class="form-group">
          <label class="form-label" for="register-email">E-mail Corporativo</label>
          <input id="register-email" v-model="authForm.email" type="email" class="form-input"
            placeholder="email@suaempresa.com" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="register-tenant">Nome da Organização (SaaS Tenant)</label>
          <input id="register-tenant" v-model="authForm.tenantName" type="text" class="form-input"
            placeholder="Ex: Minha Empresa Ltda" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="register-password">Senha de Acesso</label>
          <input id="register-password" v-model="authForm.password" type="password" class="form-input"
            placeholder="Mínimo 6 caracteres" required />
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
            <a href="#" class="nav-link" :class="{ active: activeTab === 'sessions' }"
              @click.prevent="activeTab = 'sessions'">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48L4.5 19.5l2.67-.89A9.37 9.37 0 0012 20.25z" />
              </svg>
              Instâncias WhatsApp
            </a>
            <a href="#" class="nav-link" :class="{ active: activeTab === 'ai' }" @click.prevent="activeTab = 'ai'">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M9.813 15.904L9 21m0-5.096c-2.924-.766-5-3.232-5-6.154a6.223 6.223 0 0110.454-4.5M9 15.904a6.208 6.208 0 006.183-4.096m0 0a6.223 6.223 0 00-6.183-5.808m6.183 9.904L15 21" />
              </svg>
              Configurações de IA
            </a>
            <a href="#" class="nav-link" :class="{ active: activeTab === 'keys' }" @click.prevent="activeTab = 'keys'">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M15.75 5.25a3 3 0 013 3m3 0a3 3 0 01-3 3m-3-3a3 3 0 00-3-3m-12 11.25V18m0 0h11.25m-11.25 0h-.75m.75 0v3h3v-3m2.25 0h.75m.75 0v-3.75" />
              </svg>
              Chaves de API
            </a>
            <a href="#" class="nav-link" :class="{ active: activeTab === 'logs' }" @click.prevent="activeTab = 'logs'">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              Auditoria e Logs
            </a>
          </div>
          <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 1.5rem 0" />
          <button class="btn btn-danger"
            style="display: flex; align-items: center; justify-content: center; gap: 0.5rem" @click="handleLogout">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            Sair da Conta
          </button>
        </div>
      </aside>

      <!-- Área de Conteúdo Principal -->
      <main>
        <div v-if="activeTab === 'sessions'">
          <!-- Menu Superior de Visualização e Grid Switcher -->
          <div style="background-color: var(--bg-card); border: 1px solid var(--border); padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
              <div>
                <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem;">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary-color);">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                    <line x1="6" y1="6" x2="6.01" y2="6"></line>
                    <line x1="6" y1="18" x2="6.01" y2="18"></line>
                  </svg>
                  Gerenciador de Instâncias
                </h2>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.15rem;">Crie, pareie e monitore conexões do WhatsApp e robôs auto-respondedores.</p>
              </div>
              
              <div style="display: flex; gap: 0.25rem; background-color: var(--bg-app); border: 1px solid var(--border); padding: 0.25rem; border-radius: 8px;">
                <button 
                  type="button" 
                  class="btn"
                  :class="viewMode === 'split' ? 'btn-primary' : 'btn-secondary'"
                  style="font-size: 0.75rem; padding: 0.35rem 0.75rem; width: auto; height: 32px; border: none; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.35rem; line-height: 1;"
                  @click="viewMode = 'split'"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="3" x2="9" y2="21"></line>
                  </svg>
                  Painel Lateral
                </button>
                <button 
                  type="button" 
                  class="btn"
                  :class="viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'"
                  style="font-size: 0.75rem; padding: 0.35rem 0.75rem; width: auto; height: 32px; border: none; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.35rem; line-height: 1;"
                  @click="viewMode = 'grid'"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                  </svg>
                  Grade Expandida
                </button>
              </div>
            </div>

            <!-- Filtros Globais (Busca + Status) -->
            <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; margin-top: 0.5rem; border-top: 1px solid var(--border); padding-top: 1rem;">
              <div style="position: relative; display: flex; align-items: center; flex: 1; min-width: 260px;">
                <input 
                  v-model="searchQuery" 
                  type="text" 
                  class="form-input" 
                  placeholder="Buscar por nome, ID ou telefone..." 
                  style="margin-bottom: 0; padding-left: 2.25rem; font-size: 0.85rem; height: 38px; width: 100%;"
                />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position: absolute; left: 0.85rem; color: var(--text-muted); pointer-events: none;">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </div>
              
              <div style="display: flex; gap: 0.35rem; overflow-x: auto; padding-bottom: 0.25rem; -webkit-overflow-scrolling: touch; scrollbar-width: none;">
                <button 
                  type="button"
                  class="btn"
                  :class="statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'"
                  style="font-size: 0.7rem; padding: 0.35rem 0.65rem; width: auto; min-width: auto; height: 32px; border-radius: 6px;"
                  @click="statusFilter = 'all'"
                >
                  Todas ({{ sessions.length }})
                </button>
                <button 
                  type="button"
                  class="btn"
                  :class="statusFilter === 'CONNECTED' ? 'btn-primary' : 'btn-secondary'"
                  style="font-size: 0.7rem; padding: 0.35rem 0.65rem; width: auto; min-width: auto; height: 32px; border-radius: 6px;"
                  @click="statusFilter = 'CONNECTED'"
                >
                  Conectadas ({{ sessions.filter(s => s.status === 'CONNECTED').length }})
                </button>
                <button 
                  type="button"
                  class="btn"
                  :class="statusFilter === 'PAIRING_REQUIRED' ? 'btn-primary' : 'btn-secondary'"
                  style="font-size: 0.7rem; padding: 0.35rem 0.65rem; width: auto; min-width: auto; height: 32px; border-radius: 6px;"
                  @click="statusFilter = 'PAIRING_REQUIRED'"
                >
                  Parear ({{ sessions.filter(s => s.status === 'PAIRING_REQUIRED').length }})
                </button>
                <button 
                  type="button"
                  class="btn"
                  :class="statusFilter === 'DISCONNECTED' ? 'btn-primary' : 'btn-secondary'"
                  style="font-size: 0.7rem; padding: 0.35rem 0.65rem; width: auto; min-width: auto; height: 32px; border-radius: 6px;"
                  @click="statusFilter = 'DISCONNECTED'"
                >
                  Off ({{ sessions.filter(s => s.status === 'DISCONNECTED' || s.status === 'CONNECTING').length }})
                </button>
              </div>
            </div>
          </div>

          <!-- MODO SPLIT VIEW (Visualização de Lista e Detalhes) -->
          <div v-if="viewMode === 'split'" class="tab-content-grid">
            <!-- Coluna Lateral: Cadastro e Lista -->
            <div class="sub-sidebar">
              <!-- Cadastro -->
              <div class="card">
                <h2 class="card-title">Nova Instância</h2>
                <form @submit.prevent="handleCreateSession">
                  <div class="form-group">
                    <label class="form-label" for="session-name">Nome da Instância</label>
                    <input id="session-name" v-model="newSession.name" type="text" class="form-input"
                      placeholder="Ex: Suporte de TI" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="session-id">ID Customizado (Opcional)</label>
                    <input id="session-id" v-model="newSession.id" type="text" class="form-input"
                      placeholder="Auto-gerado se vazio" />
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="session-webhook">Webhook URL (Opcional)</label>
                    <input id="session-webhook" v-model="newSession.webhookUrl" type="url" class="form-input"
                      placeholder="https://exemplo.com/callback" />
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="connection-mode">Método de Conexão</label>
                    <select id="connection-mode" v-model="connectionMode" class="form-input">
                      <option value="qr">QR Code (Escaneamento)</option>
                      <option value="pairing">Pairing Code (Número de Telefone)</option>
                    </select>
                  </div>
                  <div v-if="connectionMode === 'pairing'" class="form-group">
                    <label class="form-label" for="pairing-phone">Telefone (com DDI e DDD, apenas números)</label>
                    <input id="pairing-phone" v-model="pairingPhone" type="text" class="form-input"
                      placeholder="Ex: 5511999999999" required />
                  </div>
                  <button type="submit" class="btn btn-primary" :disabled="creatingSession">
                    {{ creatingSession ? 'Criando...' : 'Criar Instância' }}
                  </button>
                </form>
              </div>

              <!-- Lista de Conexões -->
              <div class="card">
                <h2 class="card-title">Instâncias WhatsApp</h2>
                
                <div v-if="sessions.length === 0" style="
                    color: var(--text-muted);
                    font-size: 0.85rem;
                    text-align: center;
                    padding: 1rem 0;
                  ">
                  Nenhuma instância cadastrada.
                </div>
                
                <div v-else-if="filteredSessions.length === 0" style="
                    color: var(--text-muted);
                    font-size: 0.85rem;
                    text-align: center;
                    padding: 2rem 0;
                  ">
                  Nenhuma instância correspondente.
                </div>
                
                <div v-else class="sessions-list" style="max-height: 480px; overflow-y: auto; padding-right: 0.25rem; display: flex; flex-direction: column; gap: 0.75rem;">
                  <div v-for="session in filteredSessions" :key="session.id" class="session-item"
                    :class="{ active: selectedSessionId === session.id }" @click="selectSession(session.id)">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                      <!-- Pulse Indicator -->
                      <span class="status-dot" :class="session.status.toLowerCase()"></span>
                      <div class="session-item-info">
                        <h3>{{ session.name }}</h3>
                        <p>{{ session.id.slice(0, 8) }}...</p>
                      </div>
                    </div>
                    <span class="badge" :class="{
                      'badge-connected': session.status === 'CONNECTED',
                      'badge-pairing': session.status === 'PAIRING_REQUIRED',
                      'badge-connecting': session.status === 'CONNECTING',
                      'badge-disconnected': session.status === 'DISCONNECTED',
                    }">
                      {{ getStatusLabel(session.status) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Coluna Direita: Detalhes -->
            <div class="detail-pane">
              <div v-if="!selectedSession" class="detail-view-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48L4.5 19.5l2.67-.89A9.37 9.37 0 0012 20.25z" />
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
                    <p style="
                        font-family: var(--font-mono);
                        font-size: 0.8rem;
                        color: var(--text-muted);
                        margin-top: 0.25rem;
                        display: flex;
                        align-items: center;
                        gap: 0.35rem;
                      ">
                      ID: {{ selectedSession.id }}
                      <button type="button" @click="copyToClipboard(selectedSession.id, 'id-' + selectedSession.id)" style="background: none; border: none; padding: 0.15rem; color: var(--text-muted); cursor: pointer; display: inline-flex; align-items: center;" title="Copiar ID">
                        <svg v-if="copiedId !== 'id-' + selectedSession.id" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span v-else style="font-size: 0.65rem; color: var(--status-connected)">Copiado!</span>
                      </button>
                    </p>
                  </div>
                <span class="badge" :class="{
                  'badge-connected': selectedSession.status === 'CONNECTED',
                  'badge-pairing': selectedSession.status === 'PAIRING_REQUIRED',
                  'badge-connecting': selectedSession.status === 'CONNECTING',
                  'badge-disconnected': selectedSession.status === 'DISCONNECTED',
                }" style="padding: 0.4rem 0.8rem; font-size: 0.85rem">
                  {{ getStatusLabel(selectedSession.status) }}
                </span>
              </div>

              <div class="session-metadata-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                <div class="metadata-item">
                  <div class="metadata-item-label">Webhook URL</div>
                  <div class="metadata-item-value metadata-item-value-mono">
                    {{ selectedSession.webhookUrl || '(Sem webhook)' }}
                  </div>
                </div>
                <div class="metadata-item">
                  <div class="metadata-item-label">Número Conectado</div>
                  <div class="metadata-item-value">
                    {{ selectedSession.phone || '(Não pareado)' }}
                  </div>
                </div>
                <div class="metadata-item">
                  <div class="metadata-item-label">Bot de Auto-Resposta</div>
                  <div class="metadata-item-value">
                    <span :style="{ color: selectedSession.botEnabled ? 'var(--status-connected)' : 'var(--text-muted)' }">
                      {{ selectedSession.botEnabled ? 'Ativado' : 'Desativado' }}
                    </span>
                  </div>
                </div>
                <div class="metadata-item">
                  <div class="metadata-item-label">Filtros de Eventos Webhook</div>
                  <div class="metadata-item-value">
                    {{ selectedSession.webhookEvents ? selectedSession.webhookEvents.join(', ') : 'all' }}
                  </div>
                </div>
              </div>

              <!-- Pareamento Requerido (QR Code ou Pairing Code) -->
              <div v-if="selectedSession.status === 'PAIRING_REQUIRED'" class="qr-container">
                <!-- Se for pairing code -->
                <div v-if="selectedSession.pairingCode || selectedSession.phone" style="width: 100%;">
                  <div v-if="selectedSession.pairingCode" class="pairing-code-box" style="margin-top: 1rem; margin-bottom: 2rem; text-align: center; background-color: var(--bg-hover); border: 1px dashed var(--border-color); padding: 1.5rem; border-radius: 12px; position: relative;">
                    <h3 style="font-size: 0.85rem; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.5rem; font-weight: 600;">Código de Pareamento (Pairing Code)</h3>
                    <div style="font-family: var(--font-mono); font-size: 2.25rem; font-weight: 700; letter-spacing: 4px; color: var(--primary-color); display: flex; align-items: center; justify-content: center; gap: 0.75rem;">
                      {{ selectedSession.pairingCode }}
                      <button type="button" @click="copyToClipboard(selectedSession.pairingCode, 'pairing-code')" style="background: none; border: none; padding: 0.25rem; color: var(--text-muted); cursor: pointer; display: inline-flex; align-items: center;" title="Copiar código">
                        <svg v-if="copiedId !== 'pairing-code'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span v-else style="font-size: 0.75rem; color: var(--status-connected); font-weight: 600; letter-spacing: normal;">Copiado!</span>
                      </button>
                    </div>
                    <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem; max-width: 340px; margin-inline: auto;">
                      Insira este código na notificação do seu celular (ou em "Aparelhos Conectados" > "Conectar com número de telefone").
                    </p>
                  </div>
                  <div v-else style="padding: 2rem 0; text-align: center; color: var(--text-muted)">
                    Aguardando geração do Código de Pareamento pelo WhatsApp...
                  </div>
                </div>
                <!-- Se for QR Code -->
                <div v-else style="width: 100%;">
                  <div v-if="selectedSession.qrCode" class="qr-box">
                    <QrcodeVue :value="selectedSession.qrCode" :size="220" level="M" />
                  </div>
                  <div v-else style="padding: 2rem 0; text-align: center; color: var(--text-muted)">
                    Aguardando geração do QR Code pelo WhatsApp...
                  </div>
                  <h3 style="font-weight: 600; margin-bottom: 0.25rem; text-align: center;">
                    Escaneie o QR Code no seu celular
                  </h3>
                  <p style="font-size: 0.85rem; color: var(--text-secondary); max-width: 400px; margin-inline: auto; text-align: center;">
                    Vá em Aparelhos Conectados no seu WhatsApp e clique em Conectar Aparelho para parear.
                  </p>
                </div>
              </div>

              <!-- Conectado -->
              <div v-if="selectedSession.status === 'CONNECTED'" style="
                  margin-bottom: 2rem;
                  background-color: hsla(142, 70%, 45%, 0.05);
                  border: 1px solid hsla(142, 70%, 45%, 0.2);
                  padding: 1.5rem;
                  border-radius: 12px;
                  display: flex;
                  align-items: center;
                  gap: 1rem;
                ">
                <div style="
                    background-color: var(--status-connected);
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                  "></div>
                <div>
                  <h3 style="font-size: 0.95rem; font-weight: 600">Instância WhatsApp Online</h3>
                  <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.15rem">
                    Esta instância está emparelhada com o número <strong>{{ selectedSession.phone }}</strong>.
                    O bot de auto-resposta responderá automaticamente baseado nas configurações configuradas abaixo.
                  </p>
                </div>
              </div>

              <!-- Ações da Instância -->
              <div style="display: flex; gap: 1rem; margin-top: 1rem">
                <button v-if="selectedSession.status === 'CONNECTED'" class="btn btn-secondary" style="width: auto"
                  @click="handleDisconnect(selectedSession.id)">
                  Desconectar Instância
                </button>
                <button class="btn btn-danger" style="width: auto; margin-left: auto"
                  @click="handleSessionLogout(selectedSession.id)">
                  Excluir e Resetar Conexão
                </button>
              </div>

              <!-- CONFIGURAÇÕES DA INSTÂNCIA (Webhook & Bot) -->
              <div style="margin-top: 2.5rem; border-top: 1px solid var(--border-color); padding-top: 2rem;">
                <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem">
                  Configurações da Instância
                </h3>
                <form @submit.prevent="handleUpdateSession">
                  <div class="form-group">
                    <label class="form-label" for="edit-webhook-url">Webhook URL</label>
                    <input id="edit-webhook-url" v-model="selectedSession.webhookUrl" type="url" class="form-input"
                      placeholder="https://exemplo.com/callback" />
                  </div>
                  
                  <div class="form-group">
                    <label class="form-label" for="edit-webhook-events">Eventos do Webhook (separados por vírgula)</label>
                    <input id="edit-webhook-events" v-model="webhookEventsInput" type="text" class="form-input"
                      placeholder="all, message, connection" />
                    <span class="form-help">Use 'all' para todos os eventos ou selecione eventos específicos como 'message', 'connection'.</span>
                  </div>

                  <div class="form-group" style="margin-top: 1.5rem;">
                    <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: 600;">
                      <input type="checkbox" v-model="selectedSession.botEnabled" style="width: 16px; height: 16px;" />
                      Ativar Bot de Auto-Resposta
                    </label>
                  </div>

                  <div v-if="selectedSession.botEnabled" class="bot-config-block" style="background-color: var(--bg-hover); padding: 1.25rem; border-radius: 8px; margin-top: 0.75rem; border: 1px solid var(--border-color);">
                    <div class="form-group">
                      <label class="form-label" for="edit-bot-type">Tipo de Bot</label>
                      <select id="edit-bot-type" v-model="botConfigInput.type" class="form-input">
                        <option value="simple">Simple (Regras de palavras-chave / Keywords)</option>
                        <option value="ai">AI Agent (Motor RAG Langgraph + Prompt de IA)</option>
                      </select>
                    </div>

                    <div v-if="botConfigInput.type === 'simple'" class="form-group">
                      <label class="form-label" for="edit-bot-rules">Regras do Bot (Formato JSON)</label>
                      <textarea id="edit-bot-rules" v-model="botRulesJsonInput" class="form-input" rows="5"
                        style="font-family: var(--font-mono); font-size: 0.8rem;"
                        placeholder='[\n  { "trigger": "oi", "response": "Olá! Como posso ajudar?" },\n  { "trigger": "ajuda", "response": "Por favor, descreva sua dúvida." }\n]'></textarea>
                      <span class="form-help">Insira um array JSON válido de objetos com "trigger" e "response".</span>
                    </div>

                    <div v-if="botConfigInput.type === 'ai'" class="form-group">
                      <label class="form-label" for="edit-bot-prompt">Prompt da IA (Instruções e Regras)</label>
                      <textarea id="edit-bot-prompt" v-model="botConfigInput.prompt" class="form-input" rows="5"
                        placeholder="Ex: Você é um assistente virtual atencioso que trabalha na Empresa X..."></textarea>
                      <span class="form-help">Estas regras guiarão a geração de respostas do assistente inteligente (RAG).</span>
                    </div>
                  </div>

                  <button type="submit" class="btn btn-primary" style="width: auto; margin-top: 1rem;" :disabled="updatingSession">
                    {{ updatingSession ? 'Salvando...' : 'Salvar Configurações' }}
                  </button>
                </form>
              </div>

              <!-- Disparo de Mensagem de Teste -->
              <div v-if="selectedSession.status === 'CONNECTED'" class="test-send-form" style="
                  margin-top: 2.5rem;
                  border-top: 1px solid var(--border-color);
                  padding-top: 2rem;
                ">
                <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem">
                  Disparar Mensagem de Teste
                </h3>
                <div v-if="testMessage.status" class="alert"
                  :class="testMessage.status === 'success' ? 'alert-success' : 'alert-error'">
                  {{ testMessage.message }}
                </div>
                <form @submit.prevent="handleSendTestMessage">
                  <div class="form-group">
                    <label class="form-label" for="test-to">JID ou Número do Destinatário</label>
                    <input id="test-to" v-model="testMessage.to" type="text" class="form-input"
                      placeholder="Ex: 5511999999999" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="test-text">Mensagem</label>
                    <textarea id="test-text" v-model="testMessage.text" class="form-input" rows="3"
                      placeholder="Escreva o texto aqui..." required></textarea>
                  </div>
                  <button type="submit" class="btn btn-primary" style="width: auto" :disabled="testMessage.sending">
                    {{ testMessage.sending ? 'Enviando...' : 'Enviar Mensagem' }}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
        
        <!-- MODO GRID VIEW (Visualização em Grade de Alta Densidade) -->
        <div v-else>
            <div v-if="filteredSessions.length === 0" style="
                background-color: var(--bg-card);
                border: 1px solid var(--border);
                border-radius: 12px;
                text-align: center;
                color: var(--text-muted);
                padding: 4rem 2rem;
              ">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 1rem; color: var(--text-muted); display: inline-block;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48L4.5 19.5l2.67-.89A9.37 9.37 0 0012 20.25z" />
              </svg>
              <h3>Nenhuma instância encontrada</h3>
              <p style="margin-top: 0.5rem; font-size: 0.9rem;">Tente ajustar seus filtros de busca ou status no painel superior.</p>
            </div>
            
            <div v-else style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem; align-items: start;">
              <!-- Card de cada Instância na Grade -->
              <div v-for="session in filteredSessions" :key="session.id" class="card" 
                :style="{
                  borderColor: selectedSessionId === session.id ? 'var(--accent)' : 'var(--border)',
                  cursor: 'pointer'
                }"
                @click="selectSessionAndSwitch(session.id)"
              >
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                  <div>
                    <h3 style="font-size: 1.1rem; font-weight: 600; color: var(--text-primary);">{{ session.name }}</h3>
                    <div style="display: flex; align-items: center; gap: 0.25rem; margin-top: 0.25rem;">
                      <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted);">ID: {{ session.id.slice(0, 8) }}...</span>
                      <button type="button" @click.stop="copyToClipboard(session.id, 'id-' + session.id)" style="background: none; border: none; padding: 0.15rem; color: var(--text-muted); cursor: pointer; display: inline-flex; align-items: center;">
                        <svg v-if="copiedId !== 'id-' + session.id" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span v-else style="font-size: 0.65rem; color: var(--status-connected)">Copiado!</span>
                      </button>
                    </div>
                  </div>
                  
                  <!-- Pulsing Status Ring -->
                  <div style="display: flex; align-items: center; gap: 0.5rem; background-color: var(--bg-app); border: 1px solid var(--border); padding: 0.35rem 0.65rem; border-radius: 20px;">
                    <span class="status-dot" :class="session.status.toLowerCase()"></span>
                    <span style="font-size: 0.75rem; font-weight: 600;">{{ getStatusLabel(session.status) }}</span>
                  </div>
                </div>

                <!-- Detalhes Rápidos -->
                <div style="background-color: var(--bg-app); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.25rem; font-size: 0.85rem; display: flex; flex-direction: column; gap: 0.5rem;">
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary);">Número:</span>
                    <span style="font-weight: 500; font-family: var(--font-mono);">{{ session.phone || '(Não pareado)' }}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary);">Auto-Resposta:</span>
                    <span :style="{ color: session.botEnabled ? 'var(--status-connected)' : 'var(--text-muted)' }" style="font-weight: 600;">
                      {{ session.botEnabled ? 'Ativado' : 'Desativado' }}
                    </span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary);">Filtros Webhook:</span>
                    <span style="font-weight: 500; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" :title="session.webhookEvents ? session.webhookEvents.join(', ') : 'all'">
                      {{ session.webhookEvents ? session.webhookEvents.join(', ') : 'all' }}
                    </span>
                  </div>
                </div>

                <!-- Ações Rápidas (Grid view) -->
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                  <button type="button" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.35rem 0.65rem; width: auto; height: 32px;" @click.stop="selectSessionAndSwitch(session.id)">
                    Gerenciar
                  </button>
                  <button v-if="session.status === 'CONNECTED'" type="button" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.35rem 0.65rem; width: auto; height: 32px; color: var(--status-disconnected); borderColor: hsla(0, 84%, 60%, 0.2);" @click.stop="handleDisconnect(session.id)">
                    Desconectar
                  </button>
                  <button type="button" class="btn btn-danger" style="font-size: 0.75rem; padding: 0.35rem 0.65rem; width: auto; height: 32px;" @click.stop="handleSessionLogout(session.id)">
                    Resetar
                  </button>
                </div>
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
                <option value="ollama">Ollama (Servidor de IA Local)</option>
                <option value="gemini">Google Gemini (Nativo / Default)</option>
                <option value="openai">OpenAI (ou Provedor Compatível)</option>
              </select>
            </div>

            <!-- Campos Condicionais baseados no provedor -->
            <div class="form-group">
              <label class="form-label" for="ai-api-key">Chave de API / Token de Acesso (API Key)</label>
              <input id="ai-api-key" v-model="aiConfig.aiApiKey" type="password" class="form-input"
                placeholder="Chave de API (Opcional - Requerido se usar OpenAI/Gemini ou Ollama-cloud/remoto autenticado)" />
              <span class="form-help">Seu token é armazenado com criptografia segura no banco de dados.</span>
            </div>

            <div v-if="aiConfig.aiProvider !== 'gemini'" class="form-group">
              <label class="form-label" for="ai-base-url">URL Base da API (Base URL)</label>
              <input id="ai-base-url" v-model="aiConfig.aiBaseUrl" type="url" class="form-input"
                placeholder="Ex: https://api.openai.com/v1 ou http://localhost:11434/v1" />
              <span class="form-help">Requerido se usar provedor compatível como Ollama, Together AI, DeepSeek ou
                Llama.cpp.</span>
            </div>

            <div class="form-group">
              <label class="form-label" for="ai-chat-model">Modelo de Chat (Chat Model)</label>
              <input id="ai-chat-model" v-model="aiConfig.aiChatModel" type="text" class="form-input"
                placeholder="Ex: gemini-1.5-flash, gpt-4o-mini ou llama3" />
            </div>

            <div class="form-group">
              <label class="form-label" for="ai-embedding-model">Modelo de Embedding (Embedding Model)</label>
              <input id="ai-embedding-model" v-model="aiConfig.aiEmbeddingModel" type="text" class="form-input"
                placeholder="Ex: text-embedding-005, text-embedding-3-small ou nomic-embed-text" />
              <span class="form-help">Modelo que gera vetores no pgvector. Deve gerar vetores com 768 dimensões (ou
                diminuído nativamente).</span>
            </div>

            <button type="submit" class="btn btn-primary" style="width: auto" :disabled="aiConfigLoading">
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
          <form @submit.prevent="handleCreateApiKey"
            style="display: flex; gap: 1rem; margin-bottom: 2rem; align-items: flex-end">
            <div class="form-group" style="flex: 1; margin-bottom: 0">
              <label class="form-label" for="key-name">Nome da Chave</label>
              <input id="key-name" v-model="newKeyName" type="text" class="form-input"
                placeholder="Ex: Sistema ERP Financeiro" required />
            </div>
            <button type="submit" class="btn btn-primary" style="width: auto; height: 42px" :disabled="creatingKey">
              {{ creatingKey ? 'Gerando...' : 'Gerar Chave' }}
            </button>
          </form>

          <!-- Tabela de chaves de API -->
          <div v-if="apiKeys.length === 0" style="text-align: center; color: var(--text-muted); padding: 2rem 0">
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
                <td style="vertical-align: middle;">
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <code style="font-family: var(--font-mono); color: var(--status-connected)">{{
                      revealedKeys[key.id] ? key.key : maskKey(key.key)
                    }}</code>
                    <button 
                      type="button" 
                      style="background: none; border: none; padding: 0.25rem; color: var(--text-secondary); cursor: pointer; display: inline-flex; align-items: center;"
                      @click="toggleRevealKey(key.id)"
                      :title="revealedKeys[key.id] ? 'Ocultar Chave' : 'Revelar Chave'"
                    >
                      <svg v-if="!revealedKeys[key.id]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                      <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    </button>
                  </div>
                </td>
                <td>{{ formatDate(key.createdAt) }}</td>
                <td style="text-align: right">
                  <button class="btn btn-danger" style="width: auto; padding: 0.25rem 0.5rem; font-size: 0.75rem"
                    @click="handleDeleteApiKey(key.id)">
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

          <div v-if="logsLoading" style="text-align: center; padding: 2rem 0; color: var(--text-secondary)">
            Carregando registros...
          </div>

          <div v-else class="logs-container-split">
            <!-- Coluna de Mensagens Enviadas -->
            <div class="logs-section">
              <h3 style="
                  font-size: 1rem;
                  font-weight: 600;
                  margin-bottom: 1rem;
                  border-left: 3px solid var(--primary-color);
                  padding-left: 0.5rem;
                ">
                Últimas Mensagens Disparadas
              </h3>
              <div v-if="sentMessages.length === 0" class="logs-empty">
                Nenhuma mensagem enviada recentemente.
              </div>
              <div v-else class="logs-scroll">
                <div v-for="msg in sentMessages" :key="msg.id" class="log-row-item">
                  <div style="
                      display: flex;
                      justify-content: space-between;
                      font-size: 0.75rem;
                      color: var(--text-muted);
                    ">
                    <span>Para: <strong>{{ msg.recipient.split('@')[0] }}</strong></span>
                    <span>{{ formatDate(msg.createdAt) }}</span>
                  </div>
                  <p style="font-size: 0.85rem; margin-top: 0.25rem; color: var(--text-primary)">
                    {{ msg.content }}
                  </p>
                  <div style="margin-top: 0.35rem">
                    <span class="badge badge-connected" style="font-size: 0.65rem; padding: 0.15rem 0.35rem">{{
                      msg.status }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Coluna de Webhook Logs -->
            <div class="logs-section">
              <h3 style="
                  font-size: 1rem;
                  font-weight: 600;
                  margin-bottom: 1rem;
                  border-left: 3px solid var(--status-disconnected);
                  padding-left: 0.5rem;
                ">
                Callbacks e Webhook Logs
              </h3>
              <div v-if="webhookLogs.length === 0" class="logs-empty">
                Nenhum log de webhook registrado recentemente.
              </div>
              <div v-else class="logs-scroll">
                <div v-for="log in webhookLogs" :key="log.id" class="log-row-item">
                  <div style="
                      display: flex;
                      justify-content: space-between;
                      font-size: 0.75rem;
                      color: var(--text-muted);
                    ">
                    <span>Evento: <strong>{{ log.event }}</strong></span>
                    <span>{{ formatDate(log.createdAt) }}</span>
                  </div>
                  <div style="
                      margin-top: 0.35rem;
                      display: flex;
                      justify-content: space-between;
                      align-items: center;
                    ">
                    <span class="badge" :class="log.success ? 'badge-connected' : 'badge-disconnected'"
                      style="font-size: 0.65rem; padding: 0.15rem 0.35rem">
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

    <!-- Container de Toasts (Notificações Flutuantes) -->
    <div class="toast-container">
      <div v-for="toast in toasts" :key="toast.id" class="toast-item" :class="'toast-' + toast.type">
        <span class="toast-icon">
          <svg v-if="toast.type === 'success'" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clip-rule="evenodd" />
          </svg>
          <svg v-else-if="toast.type === 'error'" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clip-rule="evenodd" />
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clip-rule="evenodd" />
          </svg>
        </span>
        <span class="toast-message">{{ toast.message }}</span>
      </div>
    </div>

    <!-- Modal de Confirmação Customizado -->
    <div v-if="confirmModal.visible" class="modal-overlay" @click.self="confirmModal.onCancel">
      <div class="modal-card">
        <div class="modal-header">
          <h3>{{ confirmModal.title }}</h3>
          <button class="modal-close-btn" @click="confirmModal.onCancel">&times;</button>
        </div>
        <div class="modal-body">
          <p>{{ confirmModal.message }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" style="width: auto" @click="confirmModal.onCancel">
            {{ confirmModal.cancelText }}
          </button>
          <button class="btn" :class="confirmModal.isDanger ? 'btn-danger' : 'btn-primary'" style="width: auto"
            @click="confirmModal.onConfirm">
            {{ confirmModal.confirmText }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal de Alerta Customizado -->
    <div v-if="alertModal.visible" class="modal-overlay" @click.self="alertModal.onClose">
      <div class="modal-card">
        <div class="modal-header">
          <h3>{{ alertModal.title }}</h3>
          <button class="modal-close-btn" @click="alertModal.onClose">&times;</button>
        </div>
        <div class="modal-body">
          <p>{{ alertModal.message }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" style="width: auto" @click="alertModal.onClose">
            {{ alertModal.buttonText }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Pulsing Indicators */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.status-dot.connected {
  background-color: var(--status-connected);
  box-shadow: 0 0 0 0 hsla(142, 70%, 45%, 0.6);
  animation: pulse-green 2s infinite;
}

.status-dot.pairing_required {
  background-color: var(--status-pairing);
  box-shadow: 0 0 0 0 hsla(35, 92%, 50%, 0.6);
  animation: pulse-yellow 2s infinite;
}

.status-dot.connecting {
  background-color: var(--status-connecting);
  box-shadow: 0 0 0 0 hsla(48, 96%, 53%, 0.6);
  animation: pulse-blue 2s infinite;
}

.status-dot.disconnected {
  background-color: var(--text-muted);
}

@keyframes pulse-green {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 hsla(142, 70%, 45%, 0.6);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px hsla(142, 70%, 45%, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 hsla(142, 70%, 45%, 0);
  }
}

@keyframes pulse-yellow {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 hsla(35, 92%, 50%, 0.6);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px hsla(35, 92%, 50%, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 hsla(35, 92%, 50%, 0);
  }
}

@keyframes pulse-blue {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 hsla(48, 96%, 53%, 0.6);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px hsla(48, 96%, 53%, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 hsla(48, 96%, 53%, 0);
  }
}

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

/* Custom Toasts & Modals UI */
.toast-container {
  position: fixed;
  top: 1.5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  z-index: 9999;
}

.toast-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1.25rem;
  border-radius: 8px;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 280px;
  max-width: 420px;
  animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideIn {
  from {
    transform: translateX(120%);
    opacity: 0;
  }

  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.toast-success {
  border-left: 4px solid var(--status-connected);
}

.toast-success .toast-icon {
  color: var(--status-connected);
}

.toast-error {
  border-left: 4px solid var(--status-disconnected);
}

.toast-error .toast-icon {
  color: var(--status-disconnected);
}

.toast-info {
  border-left: 4px solid var(--primary-color);
}

.toast-info .toast-icon {
  color: var(--primary-color);
}

/* Modals Overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
  padding: 1.5rem;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.modal-card {
  width: 100%;
  max-width: 480px;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  animation: scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes scaleIn {
  from {
    transform: scale(0.95);
    opacity: 0;
  }

  to {
    transform: scale(1);
    opacity: 1;
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.modal-close-btn:hover {
  color: var(--text-primary);
}

.modal-body {
  padding: 1.5rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.5;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background-color: var(--bg-hover);
  border-top: 1px solid var(--border-color);
}
</style>
