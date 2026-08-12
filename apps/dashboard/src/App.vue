<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import QrcodeVue from 'qrcode.vue';

interface Session {
  id: string;
  name: string;
  status: 'DISCONNECTED' | 'PAIRING_REQUIRED' | 'CONNECTING' | 'CONNECTED';
  webhookUrl: string | null;
  qrCode?: string | null;
  isConnected?: boolean;
}

// Configuração da URL da API (lendo da porta padrão 3000)
const API_BASE = 'http://localhost:3000';

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

let pollInterval: ReturnType<typeof setInterval> | null = null;

// Buscar todas as sessões
const fetchSessions = async () => {
  try {
    const res = await fetch(`${API_BASE}/sessions`);
    if (!res.ok) throw new Error('Falha ao obter lista de sessões.');
    sessions.value = await res.json();
  } catch (err: any) {
    console.error('Erro ao buscar sessões:', err.message);
  }
};

// Buscar status de uma sessão específica
const fetchSessionStatus = async (id: string) => {
  try {
    const res = await fetch(`${API_BASE}/sessions/${id}/status`);
    if (res.status === 444) {
      // Sessão removida no banco
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

    // Atualizar status na lista principal
    const idx = sessions.value.findIndex(s => s.id === id);
    if (idx !== -1) {
      sessions.value[idx].status = details.status;
    }
  } catch (err: any) {
    console.error(`Erro ao buscar status da sessão ${id}:`, err.message);
  }
};

// Selecionar uma sessão
const selectSession = (id: string) => {
  selectedSessionId.value = id;
  const found = sessions.value.find(s => s.id === id);
  if (found) {
    selectedSession.value = found;
  }
  fetchSessionStatus(id);
  // Resetar formulário de envio de teste
  testMessage.value = {
    to: '',
    text: '',
    sending: false,
    status: null,
    message: '',
  };
};

// Criar nova sessão
const handleCreateSession = async () => {
  if (!newSession.value.name.trim()) return;
  creatingSession.value = true;
  try {
    const res = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newSession.value.id.trim() || undefined,
        name: newSession.value.name.trim(),
        webhookUrl: newSession.value.webhookUrl.trim() || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao criar sessão.');
    }

    // Limpar formulário e atualizar lista
    newSession.value = { id: '', name: '', webhookUrl: '' };
    await fetchSessions();
    selectSession(data.id);
  } catch (err: any) {
    alert(err.message);
  } finally {
    creatingSession.value = false;
  }
};

// Desconectar sessão
const handleDisconnect = async (id: string) => {
  if (!confirm('Deseja desconectar esta sessão do WhatsApp temporariamente?')) return;
  try {
    const res = await fetch(`${API_BASE}/sessions/${id}/disconnect`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao desconectar.');
    await fetchSessionStatus(id);
  } catch (err: any) {
    alert(err.message);
  }
};

// Remover/Logout sessão
const handleLogout = async (id: string) => {
  if (
    !confirm(
      'Deseja desvincular definitivamente esta sessão? Isso excluirá as credenciais e chaves criptográficas do banco.',
    )
  )
    return;
  try {
    const res = await fetch(`${API_BASE}/sessions/${id}/logout`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao realizar logout.');

    selectedSessionId.value = null;
    selectedSession.value = null;
    await fetchSessions();
  } catch (err: any) {
    alert(err.message);
  }
};

// Enviar mensagem de teste
const handleSendTestMessage = async () => {
  if (!selectedSessionId.value || !testMessage.value.to || !testMessage.value.text) return;
  testMessage.value.sending = true;
  testMessage.value.status = null;
  testMessage.value.message = '';

  try {
    const res = await fetch(`${API_BASE}/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      testMessage.value.text = ''; // limpa apenas o texto enviado
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

// Helper para formatar o status da sessão
const getStatusLabel = (status: Session['status']) => {
  switch (status) {
    case 'CONNECTED':
      return 'Conectado';
    case 'PAIRING_REQUIRED':
      return 'Aguardando QR Code';
    case 'CONNECTING':
      return 'Conectando...';
    case 'DISCONNECTED':
      return 'Desconectado';
    default:
      return status;
  }
};

// Polling dinâmico para atualizar status das sessões
onMounted(async () => {
  await fetchSessions();

  pollInterval = setInterval(async () => {
    // Atualizar a lista de sessões de forma geral
    await fetchSessions();

    // Se houver uma sessão ativa selecionada, atualizar seus detalhes
    if (selectedSessionId.value) {
      await fetchSessionStatus(selectedSessionId.value);
    }
  }, 3000);
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
});
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <div class="app-title-group">
        <h1>Zap-Zap Unofficial Panel</h1>
        <p>Console administrativo de instâncias WhatsApp e RAG Engine.</p>
      </div>
      <div>
        <span class="badge badge-connected" style="font-family: var(--font-mono)"
          >REST API ONLINE</span
        >
      </div>
    </header>

    <div class="dashboard-grid">
      <!-- Coluna Esquerda: Cadastro e Lista -->
      <aside class="sidebar">
        <!-- Card de Cadastro -->
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
                placeholder="Ex: Suporte Financeiro"
                required
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="session-id">ID Personalizado (Opcional)</label>
              <input
                id="session-id"
                v-model="newSession.id"
                type="text"
                class="form-input"
                placeholder="UUID ou texto curto"
              />
              <span class="form-help">Se vazio, o sistema gerará um UUID automático.</span>
            </div>

            <div class="form-group">
              <label class="form-label" for="session-webhook">URL de Webhook (Opcional)</label>
              <input
                id="session-webhook"
                v-model="newSession.webhookUrl"
                type="url"
                class="form-input"
                placeholder="https://seu-sistema.com/webhook"
              />
            </div>

            <button type="submit" class="btn btn-primary" :disabled="creatingSession">
              {{ creatingSession ? 'Inicializando...' : 'Criar Instância' }}
            </button>
          </form>
        </div>

        <!-- Card de Lista de Sessões -->
        <div class="card">
          <h2 class="card-title">
            Instâncias Ativas
            <span class="badge badge-secondary" style="font-size: 0.7rem">{{
              sessions.length
            }}</span>
          </h2>

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
              <div>
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
      </aside>

      <!-- Coluna Direita: Detalhes e Operações -->
      <main>
        <!-- Estado Vazio -->
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
              d="M8.625 9.75a.625.625 0 11-1.25 0 .625.625 0 011.25 0zm4.875 0a.625.625 0 11-1.25 0 .625.625 0 011.25 0zm4.875 0a.625.625 0 11-1.25 0 .625.625 0 011.25 0z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 18.75c-3.08 0-5.719-1.47-7.244-3.693L4.5 14.5h15l-.256.557C17.72 17.28 15.08 18.75 12 18.75z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12z"
            />
          </svg>
          <h3 style="font-size: 1.15rem; font-weight: 600; color: var(--text-primary)">
            Nenhuma instância selecionada
          </h3>
          <p style="margin-top: 0.5rem; max-width: 320px">
            Selecione uma instância na lista lateral ou crie uma nova para visualizar status,
            escanear QR Code e enviar mensagens de teste.
          </p>
        </div>

        <!-- Detalhes da Sessão Selecionada -->
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
            <div>
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
          </div>

          <!-- Metadata -->
          <div class="session-metadata-grid">
            <div class="metadata-item">
              <div class="metadata-item-label">Status da Conexão</div>
              <div class="metadata-item-value">{{ selectedSession.status }}</div>
            </div>
            <div class="metadata-item">
              <div class="metadata-item-label">Webhook URL</div>
              <div
                class="metadata-item-value metadata-item-value-mono"
                style="word-break: break-all"
              >
                {{ selectedSession.webhookUrl || '(Não configurado)' }}
              </div>
            </div>
          </div>

          <!-- Sessão precisa de pareamento (Exibir QR Code) -->
          <div v-if="selectedSession.status === 'PAIRING_REQUIRED'" class="qr-container">
            <div v-if="selectedSession.qrCode" class="qr-box">
              <QrcodeVue :value="selectedSession.qrCode" :size="220" level="M" />
            </div>
            <div v-else style="padding: 2rem 0; color: var(--text-muted)">
              Gerando QR Code... Por favor, aguarde alguns instantes.
            </div>
            <h3 style="font-size: 1.05rem; font-weight: 600; margin-bottom: 0.35rem">
              Escaneie o QR Code no seu celular
            </h3>
            <p style="max-width: 400px; font-size: 0.85rem; color: var(--text-secondary)">
              Abra o WhatsApp no seu smartphone, vá em Configurações &gt; Aparelhos conectados &gt;
              Conectar aparelho e escaneie a imagem acima.
            </p>
          </div>

          <!-- Instância Conectada -->
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
              <h3 style="font-size: 0.95rem; font-weight: 600">Conectado ao WhatsApp</h3>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.15rem">
                A instância está ativa e pronta para receber eventos e disparar mensagens da API
                REST.
              </p>
            </div>
          </div>

          <!-- Ações de Gerenciamento -->
          <div style="display: flex; gap: 1rem; margin-top: 1.5rem">
            <button
              v-if="selectedSession.status === 'CONNECTED'"
              class="btn btn-secondary"
              style="width: auto"
              @click="handleDisconnect(selectedSession.id)"
            >
              Desconectar Temporariamente
            </button>
            <button
              class="btn btn-danger"
              style="width: auto; margin-left: auto"
              @click="handleLogout(selectedSession.id)"
            >
              Excluir Instância (Logout)
            </button>
          </div>

          <!-- Envio de Mensagem de Teste (Apenas se conectado) -->
          <div v-if="selectedSession.status === 'CONNECTED'" class="test-send-form">
            <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 1.25rem">
              Enviar Mensagem de Teste
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
                <label class="form-label" for="test-to"
                  >Número do Destinatário (WhatsApp JID ou Dígitos)</label
                >
                <input
                  id="test-to"
                  v-model="testMessage.to"
                  type="text"
                  class="form-input"
                  placeholder="Ex: 5511999999999 ou 5511999999999@s.whatsapp.net"
                  required
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="test-text">Mensagem de Texto</label>
                <textarea
                  id="test-text"
                  v-model="testMessage.text"
                  class="form-input"
                  rows="3"
                  placeholder="Escreva sua mensagem de teste aqui..."
                  required
                ></textarea>
              </div>

              <button
                type="submit"
                class="btn btn-primary"
                :disabled="testMessage.sending"
                style="width: auto"
              >
                {{ testMessage.sending ? 'Enviando...' : 'Enviar Mensagem' }}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
