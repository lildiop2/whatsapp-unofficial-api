# Robôs de Auto-Resposta e Inteligência Artificial (RAG) - Zap-Zap

O Zap-Zap possui suporte nativo para automação de atendimento em dois níveis: **Respostas Simples (Baseadas em Palavras-chave)** ou **Assistentes Avançados de IA (Baseados em RAG e Langgraph)**.

---

## 🤖 1. Chatbot de Respostas Simples (Keywords)

Ideal para triagem de contatos e criação de fluxos direcionados (Uras numéricas).
* **Como funciona**: A mensagem recebida pelo WhatsApp é convertida em caixa baixa e comparada com as triggers (gatilhos) cadastradas na instância. Se houver correspondência exata, a resposta programada é enviada de volta imediatamente pelo Worker.
* **Exemplo de Regra**:
  ```json
  [
    { "trigger": "financeiro", "response": "Acesse nosso portal de fatura em: fatura.empresa.com" },
    { "trigger": "suporte", "response": "Descreva seu problema ou aguarde um atendente." }
  ]
  ```

---

## 🧠 2. Assistente Inteligente com IA RAG (Langgraph)

Para conversas complexas e naturais baseadas na base de conhecimento da empresa.
* **Modelo RAG (Retrieval-Augmented Generation)**: Em vez de confiar exclusivamente no conhecimento estático da IA, o sistema consulta documentos indexados no banco de dados com extensão **pgvector** para encontrar informações contextuais sobre a empresa, enriquecendo o prompt enviado ao modelo de linguagem.
* **Customização por Organização**: Cada Tenant pode definir seu próprio **System Prompt** corporativo e configurar o modelo preferido no dashboard.

### Provedores de Modelos de Linguagem (LLMs) Suportados:

1. **Google Gemini** (Ex: `gemini-1.5-flash`): Recomendado por possuir alta performance e latência extremamente baixa.
2. **OpenAI** (Ex: `gpt-4o-mini`): Suporte completo a APIs padrão da OpenAI.
3. **Ollama (Self-Hosted / Local)** (Ex: `llama3`): Ideal para organizações que possuem restrições rígidas de privacidade e preferem processar mensagens localmente na infraestrutura própria sem enviar dados para a nuvem.

### Como a Resposta de IA é Gerada:

```text
Mensagem Recebida ➡️ Consulta pgvector (Documentos Relacionados) ➡️ Montagem do Prompt Enriquecido ➡️ LLM (Gemini/Ollama) ➡️ Envio da Resposta ao WhatsApp
```
O System Prompt personalizado do Tenant atua como a personalidade da IA, orientando-a a agir como suporte de vendas, assistente de TI ou recepcionista virtual.
