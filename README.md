# ZeroGravity Web Admin

A high-performance, technical administrative dashboard designed for orchestrating and managing the **ZeroGravity** LLM proxy ecosystem. Built with Next.js 16 (App Router), React 19, and Dockerode for direct container interaction.

## 🚀 Key Features

- **Live Infrastructure Monitoring**: Real-time container status polling and health check verification via proxy internal endpoints.
- **Direct Container Lifecycle Control**: Atomically start, stop, or restart the `zerogravity` container through the Docker Socket.
- **Interactive Account Orchestration**: Management of ZeroGravity identities using `zg` CLI abstraction within the container.
- **Advanced Log Streaming**: Real-time log consumption with automated Docker multiplexed stream demuxing, ANSI code stripping, and statistical analysis.
- **Premium Design System**: Dark-themed UI utilizing glassmorphism, refined typography (Sora/DM Sans), and standard vanilla CSS variables for architectural consistency.

## 🛠️ Technical Stack

- **Frontend**: Next.js 16 (App Router), React 19 (Server/Client Hybrid), Vanilla CSS.
- **Backend**: Node.js/Next.js API Routes.
- **Infrastructure**: [Dockerode](https://github.com/apocas/dockerode) for Unix Socket communication (`/var/run/docker.sock`).
- **Data Persistence**: Local filesystem integration for ZeroGravity account configuration.

## 📋 Prerequisites

- **Node.js 18+**
- **Docker Engine** running locally with accessible unix socket.
- **Permissions**: Read/write access to `/var/run/docker.sock`.
- **Target Container**: A container named `zerogravity` must exist.

## ⚙️ Deployment & Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Launch Development Server**:
   ```bash
   npm run dev
   ```

3. **Compute Production Build**:
   ```bash
   npm run build
   ```

## 🐳 Docker Integration Details

The system communicates directly with the Docker Daemon via the Unix Socket. Below are the technical operations performed by the application logic:

### Container Identification
The application identifies the target container by scanning all local containers for the exact name `/zerogravity`.
- **API Reference**: `GET /api/status` calls `docker.listContainers({ all: true })`.

### Lifecycle Management
Controlled through `POST /api/action`, executing the following `dockerode` primitives:
- **Start**: `container.start()`
- **Stop**: `container.stop()`
- **Restart**: `container.restart()`

### Log Stream Processing
The log viewer (`GET /api/logs`) implements a custom demultiplexer to handle Docker's binary header format (8-byte frames).
- **Format**: `[1 byte stream type][3 bytes padding][4 bytes payload size][payload]`.
- **Processing**: The buffer is parsed manually in `src/lib/docker.js:parseMuxedStream()` to strip headers and ANSI escape sequences before delivering clean UTF-8 strings.

### CLI Command Execution
The system manages accounts by executing commands directly inside the container using the `docker exec` protocol:
- **Set Account**: `docker exec zerogravity zg accounts set <email>`
- **Remove Account**: `docker exec zerogravity zg accounts remove <email>`
- **Extract Tokens**: `docker exec zerogravity zg extract`
- **List Accounts**: `docker exec zerogravity zg accounts`

## 📂 Project Architecture

- **`src/app/api/`**: Technical endpoints for container lifecycle, log streaming, and CLI execution.
- **`src/lib/docker.js`**: Low-level Dockerode abstraction layer, including muxed stream parsing and exec handling.
- **`src/lib/accounts.js`**: I/O handler for the shared `accounts.json` configuration file.
- **`src/components/Dashboard.js`**: Core client-side orchestrator that handles polling, state management, and real-time visualization.

## 🔒 Security Considerations

This dashboard requires direct access to `/var/run/docker.sock`. By design, any user with access to this socket has root-level control over the host. Ensure this application is deployed within a protected network environment and never exposed to the public internet without an authentication/authorization layer.

---
*Optimized for ZeroGravity ecosystem orchestration.*
