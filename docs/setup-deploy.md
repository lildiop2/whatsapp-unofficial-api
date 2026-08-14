# Instalação e Deploy - Zap-Zap

Este documento orienta sobre a configuração do ambiente de desenvolvimento local e a implantação do sistema em produção utilizando Docker Swarm.

---

## 🛠️ 1. Instalação e Configuração Local (Desenvolvimento)

### Pré-requisitos
* **Node.js**: Versão 18 ou superior.
* **PostgreSQL**: Rodando localmente ou em contêiner com suporte a `pgvector`.
* **Redis**: Para armazenamento de cache e credenciais.
* **RabbitMQ**: Message broker ativo nas portas `5672` (filas) e `15672` (painel de controle).

> [!IMPORTANT]
> **Aviso sobre o RabbitMQ**: Se você possui o RabbitMQ rodando nativamente no sistema host, **nunca execute o contêiner `zap-rabbitmq` do docker-compose local** para evitar conflitos de porta.

### Configuração do Ambiente
1. Copie o arquivo de variáveis de ambiente de exemplo:
   ```bash
   cp .env.example .env
   ```
2. Abra o `.env` e configure as chaves de acesso correspondentes (como chaves de banco de dados, Redis, RabbitMQ e tokens do Gemini/OpenAI).

### Rodando o Monorepo
Instale as dependências a partir do diretório raiz:
```bash
npm install
```

Inicie todos os serviços em modo de desenvolvimento simultaneamente:
```bash
npm run dev
```

Este comando inicia:
* **API Principal (`apps/api`)** na porta `3002`.
* **Worker de Mensageria (`apps/worker`)** que consome as filas do RabbitMQ.
* **Dashboard Frontend (`apps/dashboard`)** rodando no Vite na porta `5173`.

---

## 🐳 2. Deploy em Produção (Docker Swarm & Traefik)

O projeto está preparado para rodar em alta disponibilidade utilizando **Docker Swarm** com roteamento automático via **Traefik**.

### Arquivos de Deploy Disponíveis:
* `Dockerfile.api.prod`: Constrói a imagem Docker otimizada para o serviço de API.
* `Dockerfile.worker.prod`: Constrói a imagem Docker para o Worker em produção.
* `Dockerfile.dashboard.prod`: Build estático do frontend Vue 3 servido por um servidor Nginx leve.
* `docker-compose.swarm.yml`: Definição de stack do Docker Swarm.

### Executando o Deploy no Cluster Swarm
1. Certifique-se de que o Docker Swarm está iniciado no nó gerenciador:
   ```bash
   docker swarm init
   ```
2. Realize o deploy da stack utilizando o arquivo de compose do Swarm:
   ```bash
   docker stack deploy -c docker-compose.swarm.yml zap-zap
   ```
3. O painel administrativo do **Portainer** pode ser utilizado para monitorar a saúde dos contêineres e escalar as réplicas dos workers de acordo com a carga de envio de mensagens do Tenant.
