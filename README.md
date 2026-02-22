# ZeroGravity Web Admin

Uma interface administrativa moderna e intuitiva para gerenciar o proxy LLM **ZeroGravity**. Desenvolvido com Next.js 16 e React 19, este dashboard permite o controle total do container Docker, gerenciamento de contas e monitoramento de logs em tempo real.

## 🚀 Funcionalidades

-   **Dashboard em Tempo Real**: Visualize o status do container e métricas de saúde do proxy.
-   **Controle de Container**: Inicie, pare ou reinicie o container `zerogravity` diretamente pela interface.
-   **Gerenciamento de Contas**: Adicione ou remova contas do ZeroGravity de forma simplificada.
-   **Visualizador de Logs**: Acompanhe os logs do container com suporte a parsing automático de estatísticas e limpeza de caracteres ANSI.
-   **Listagem de Modelos**: Visualize os modelos disponíveis no proxy.
-   **Design Premium**: Interface escura com estética moderna, tipografia refinada (Sora e DM Sans) e efeitos de glassmorphism.

## 🛠️ Tecnologias

-   **Frontend**: Next.js 16 (App Router), React 19, Vanilla CSS.
-   **Backend**: API Routes do Next.js.
-   **Integração**: [Dockerode](https://github.com/apocas/dockerode) para comunicação com o Docker Socket.
-   **Estilização**: Variáveis CSS personalizadas (`--zg-*`) para um design system consistente.

## 📋 Pré-requisitos

Para rodar este projeto, você precisa ter:

1.  **Node.js 18+** instalado.
2.  **Docker** rodando localmente.
3.  Permissão de leitura/escrita no socket do Docker (`/var/run/docker.sock`).
4.  O container do ZeroGravity deve estar nomeado como `zerogravity`.

## ⚙️ Como Rodar

1.  **Instale as dependências:**
    ```bash
    npm install
    ```

2.  **Inicie o servidor de desenvolvimento:**
    ```bash
    npm run dev
    ```

3.  **Acesse no navegador:**
    Abra [http://localhost:3000](http://localhost:3000).

## 📂 Estrutura do Projeto

-   `src/app/api/`: Endpoints para status, logs, ações de container e gerenciamento de contas.
-   `src/lib/docker.js`: Lógica de integração com o Dockerode.
-   `src/lib/accounts.js`: Manipulação do arquivo `accounts.json` do ZeroGravity.
-   `src/components/Dashboard.js`: Componente principal da interface.

## 🔒 Segurança

O projeto acessa o socket do Docker localmente. Certifique-se de rodar em um ambiente seguro e controlado.

---
Desenvolvido para facilitar a orquestração do ecossistema ZeroGravity.
