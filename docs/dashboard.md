# Painel Administrativo (Dashboard) - Zap-Zap

O painel administrativo do **Zap-Zap** é uma aplicação web de alta densidade desenvolvida em **Vue 3**, **Vite** e **TypeScript**, voltada para gerenciamento corporativo de múltiplas instâncias.

---

## 🎨 Design System e Estética Premium

A interface segue uma estética minimalista e escura (dark theme) baseada em tokens de cores HSL, priorizando a usabilidade e a densidade de informações em cenários corporativos reais.

### Principais Elementos de UI/UX Premium Implementados:

1. **Visualização em Grade Expandida (Grid View)**:
   - Permite alternar entre o **Painel Lateral** (split view, ideal para pareamento rápido e configuração de instâncias específicas) e a **Grade Expandida** (grid de cartões responsivos, ideal para gerenciar 100+ instâncias simultaneamente).
   - O Grid View exibe cartões com métricas rápidas (número de telefone, status do chatbot, eventos ativos de webhook) e botões de atalho como desconectar e resetar, aproveitando 100% da largura da tela em desktops.
2. **Indicadores de Status Pulsantes (Pulsing Rings)**:
   - Substituímos badges rígidos por luzes de estado dinâmicas com animações de pulso em CSS:
     - 🟢 **Online** (Verde pulsante): Instância conectada e pronta para operações.
     - 🟡 **Aparelho Desconectado** (Laranja pulsante): Ação requerida (leitura de QR Code ou inserção de Pairing Code).
     - 🔵 **Conectando** (Azul pulsante): Instância negociando o handshake com o servidor.
     - ⚫ **Offline** (Cinza estático): Sessão inativa ou parada.
3. **Máscara de Tokens de API Segura**:
   - As chaves de API do Tenant são ocultadas por padrão na tabela de chaves (`zap_••••••••••••••••••••••••`).
   - Adicionamos botões de revelar/ocultar baseados em ícones SVGs de olho aberto/fechado, impedindo a exposição acidental de tokens em transmissões de tela ou fotos de monitor.
4. **Cópia Rápida com Feedback Visual (Click-to-Copy)**:
   *IDs de instâncias e Códigos de Pareamento de 8 dígitos possuem botões de cópia rápida. Ao clicar, o ícone de prancheta muda temporariamente para o texto verde `"Copiado!"`, oferecendo confirmação imediata ao operador.
5. **Barra de Filtro e Busca Global**:
   - Uma barra de busca em tempo real filtra instâncias por nome, ID ou telefone.
   - Botões de abas com contadores mostram quantas instâncias estão conectadas, aguardando pareamento ou offline no momento. Os filtros e buscas operam simultaneamente nas visualizações em lista e grade.
