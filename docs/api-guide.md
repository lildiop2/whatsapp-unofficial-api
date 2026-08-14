# Guia da API REST - Zap-Zap

A API REST do Zap-Zap é protegida contra acessos não autorizados e implementa regras estritas de isolamento de dados de nível organizacional (multi-tenant).

---

## 🔒 Autenticação

A API aceita duas formas de autenticação no header das requisições:

1. **Token JWT de Usuário (`Authorization: Bearer <TOKEN>`)**: Obtido através do login da interface administrativa (Dashboard).
2. **Chave de API do Tenant (`x-api-key: zap_<CHAVE>`)**: Gerada via dashboard para integrações externas de sistemas terceiros (ERP, CRM, Webhooks).

---

## 🚀 Endpoints Principais

Abaixo estão descritos os principais endpoints organizados por grupos. Para visualizar a documentação interativa completa com payloads de exemplo e testes integrados, acesse a rota `/docs` (Swagger UI) do servidor da API.

### 🔑 1. Autenticação e Conta
* `POST /auth/register`: Registra um novo Tenant (empresa) e usuário administrador associado.
* `POST /auth/login`: Autentica o administrador do dashboard e retorna um token JWT.
* `GET /auth/me`: Retorna os dados do usuário autenticado no momento.

### ⚙️ 2. Configurações do Tenant (Organização)
* `GET /tenant/ai-config`: Retorna as credenciais e modelos configurados para a IA RAG.
* `PUT /tenant/ai-config`: Atualiza as credenciais de provedores de IA (Gemini, OpenAI ou Ollama).
* `GET /tenant/api-keys`: Lista as chaves de API cadastradas pelo Tenant.
* `POST /tenant/api-keys`: Gera uma nova chave de API integrada.
* `DELETE /tenant/api-keys/{id}`: Revoga o acesso de uma chave de API.
* `GET /tenant/logs`: Consulta logs de auditoria e webhooks recentes disparados pela organização.

### 📱 3. Gerenciamento de Sessões do WhatsApp
* `GET /sessions`: Lista todas as conexões criadas pelo Tenant.
* `POST /sessions`: Cria uma nova instância do WhatsApp.
  * Suporta conexão via **QR Code** (padrão) ou via **Pairing Code** (passando o parâmetro `phone`).
* `PATCH /sessions/{id}`: Atualiza parâmetros do webhook de callback, eventos assinados e configurações do chatbot.
* `GET /sessions/{id}/status`: Consulta o status atual de conexão da instância (`CONNECTED`, `PAIRING_REQUIRED`, `CONNECTING`, `DISCONNECTED`). Retorna a imagem em Base64 do QR Code ou o Pairing Code gerado para exibição.
* `POST /sessions/{id}/disconnect`: Encerra a conexão da instância com os servidores do WhatsApp temporariamente.
* `POST /sessions/{id}/logout`: Desvincula as credenciais e exclui a instância do banco de dados permanentemente.

---

## 💬 Envio de Mensagens (`POST /messages/send`)

Permite enviar texto, arquivos baixados automaticamente e simular comportamento humano.

* **Payload com Simulação Humana**:
  ```json
  {
    "sessionId": "financeiro-bot",
    "to": "5511999999999",
    "text": "Olá! Estou gravando um áudio para você.",
    "presenceDelay": 3000,
    "presenceType": "recording"
  }
  ```
* **Payload com Envio de Mídia**:
  ```json
  {
    "sessionId": "financeiro-bot",
    "to": "5511999999999",
    "mediaUrl": "https://exemplo.com/fatura.pdf",
    "mediaType": "document",
    "fileName": "Fatura_Fevereiro.pdf",
    "mimetype": "application/pdf"
  }
  ```

---

## 👥 Gerenciamento de Grupos, Canais e Contatos

### 4. Gestão de Grupos
* `POST /sessions/{sessionId}/groups`: Cria um grupo.
* `GET /sessions/{sessionId}/groups`: Lista todos os grupos.
* `GET /sessions/{sessionId}/groups/{jid}`: Retorna metadados e participantes.
* `PATCH /sessions/{sessionId}/groups/{jid}`: Atualiza assunto ou descrição do grupo.
* `POST /sessions/{sessionId}/groups/{jid}/participants`: Executa ações nos participantes (`add`, `remove`, `promote`, `demote`).
* `POST /sessions/{sessionId}/groups/{jid}/leave`: Abandona o grupo.
* `GET /sessions/{sessionId}/groups/{jid}/invite`: Retorna o link de convite.
* `POST /sessions/{sessionId}/groups/{jid}/invite/revoke`: Rotaciona o link de convite.
* `POST /sessions/{sessionId}/groups/join`: Entra em um grupo via link de convite.

### 📢 5. Gestão de Canais (Newsletters)
* `POST /sessions/{sessionId}/newsletters`: Cria um canal oficial do WhatsApp.
* `GET /sessions/{sessionId}/newsletters`: Lista canais seguidos/criados.
* `DELETE /sessions/{sessionId}/newsletters/{jid}`: Exclui permanentemente o canal.
* `POST /sessions/{sessionId}/newsletters/{jid}/follow` e `unfollow`: Segue ou deixa de seguir.
* `POST /sessions/{sessionId}/newsletters/{jid}/mute`: Silencia ou ativa notificações do canal.

### 🏢 6. Gestão de Comunidades
* `POST /sessions/{sessionId}/communities`: Cria uma comunidade.
* `POST /sessions/{sessionId}/communities/{jid}/link` e `unlink`: Vincula ou desvincula grupos como subgrupos da comunidade.
* `DELETE /sessions/{sessionId}/communities/{jid}`: Desativa a comunidade.

### 🔍 7. Validação de Contatos
* `POST /sessions/{sessionId}/contacts/check`: Verifica se uma lista de números possui WhatsApp ativo. Retorna o JID com o formato de ID interno `LID`.
* `GET /sessions/{sessionId}/contacts/{jid}/profile`: Retorna a foto do perfil e a mensagem do status "Sobre" do contato.
