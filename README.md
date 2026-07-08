<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:0D47A1,100:00BCD4&height=200&section=header&text=NexusTrade&fontSize=60&fontColor=ffffff&animation=fadeIn&desc=Production-Grade%20Cryptocurrency%20Exchange%20Platform&descSize=18&descAlignY=75" alt="NexusTrade Banner"/>
</p>

<div align="center">

  <a href="#"><img src="https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React Native"/></a>
  <a href="#"><img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js"/></a>
  <a href="#"><img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/></a>
  <a href="#"><img src="https://img.shields.io/badge/Apache%20Kafka-231F20?style=for-the-badge&logo=apachekafka&logoColor=white" alt="Kafka"/></a>
  <a href="#"><img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/></a>
  <a href="#"><img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis"/></a>
  <a href="#"><img src="https://img.shields.io/badge/Drizzle%20ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black" alt="Drizzle ORM"/></a>
  <a href="#"><img src="https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white" alt="Socket.IO"/></a>
  <a href="#"><img src="https://img.shields.io/badge/Stripe-635BFF?style=for-the-badge&logo=stripe&logoColor=white" alt="Stripe"/></a>

  <br/><br/>

  <img src="https://img.shields.io/github/stars/ahsan/nexustrade?style=social" alt="Stars"/>
  <img src="https://img.shields.io/github/forks/ahsan/nexustrade?style=social" alt="Forks"/>

</div>

---

## Overview

**NexusTrade** is a full-stack, production-grade cryptocurrency trading platform built with a distributed microservices architecture and a native mobile trading application. It simulates a real-world exchange end-to-end — from user onboarding and wallet funding to order placement, order matching, ledger settlement, and live market data streaming.

Designed as a portfolio project to demonstrate expertise in distributed systems, the platform showcases service isolation, event-driven consistency, gateway-level authentication, cache-backed low-latency reads, and a polished mobile client experience.

### Core Capabilities

| Domain | Description |
|--------|-------------|
| 🔐 **Authentication** | Secure email/password auth with JWT issuance and gateway-level validation |
| 💰 **Wallet Management** | Redis-backed balances with PostgreSQL ledger as the source of truth |
| 💳 **Fiat Operations** | Stripe-powered deposits and withdrawals, reconciled via Kafka workers |
| 📈 **Order Execution** | Limit order placement, cancellation, and in-memory order book matching |
| 📡 **Live Market Data** | Real-time price streaming over WebSockets (Socket.IO) |
| 🤖 **Liquidity Engine** | Automated bot service maintaining realistic buy/sell pressure |
| 📱 **Mobile Trading** | Live charts, portfolio P&L, trade execution, and wallet management |

---

## 🏗️ Architecture

NexusTrade follows a **microservices architecture** with an **API Gateway** as the single entry point for all external traffic. Services communicate asynchronously through **Apache Kafka** for event-driven consistency across service boundaries.

<h2 align="center">🏗️ System Architecture</h2>


<p align="center">
  <img src="screenshots/architecture.png" alt="NexusTrade Architecture" width="900"/>
</p>


### Service Registry

| Service | Responsibility | Port | Visibility |
|---------|---------------|------|------------|
| `api-gateway` | Entry point for all client traffic; JWT auth and request proxying | `:3000` | Public |
| `auth-service` | User registration, login, and JWT issuance | `:3007` | Internal |
| `order-service` | Order placement, cancellation, and lifecycle management | `:3001` | Internal |
| `market-data-service` | Live price streaming to clients via WebSocket | `:3003` | Internal |
| `wallet-service` | Wallet balances, transfers, and portfolio snapshots | `:3004` | Internal |
| `funding-service` | Stripe-based deposits and withdrawals | `:3005` | Internal |
| `matching-engine` | In-memory order book and trade matching | — | Internal |
| `ledger-service` | Durable, append-only record of balance-affecting transactions | — | Internal |
| `liquidity-bot-service` | Automated bot accounts placing orders to simulate market liquidity | — | Internal |
| `shared` | Common Kafka topic bootstrap and gateway-trust middleware | — | Library |


##  Features

### Backend
-  Secure email/password authentication with JWT tokens
-  Redis-backed wallet balances with PostgreSQL ledger reconciliation
-  Stripe-integrated fiat funding and withdrawals
-  Limit order placement, cancellation, and lifecycle tracking
-  In-memory order book matching engine
-  Real-time market price streaming via WebSocket (Socket.IO)
-  Automated liquidity bot for realistic market simulation
-  Event-driven architecture with Apache Kafka
-  Gateway-level authentication and request routing

### Mobile App
- Live interactive price charts
-  Real-time portfolio P&L tracking
-  Limit order execution interface
-  Wallet balance and transaction history
-  Deposit & withdrawal flows with Stripe
-  User profile and settings management
-  Onboarding experience
-  Glassmorphism UI with Expo BlurView

---

## Tech Stack

### Backend

| Technology | Purpose |
|------------|---------|
| ![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white) | Runtime environment |
| ![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white) | Type-safe development |
| ![Express](https://img.shields.io/badge/Express-000000?style=flat&logo=express&logoColor=white) | Web framework |
| ![Apache Kafka](https://img.shields.io/badge/Apache%20Kafka-231F20?style=flat&logo=apachekafka&logoColor=white) | Event streaming |
| ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white) | Primary database |
| ![Drizzle ORM](https://img.shields.io/badge/Drizzle%20ORM-C5F74F?style=flat&logo=drizzle&logoColor=black) | Database ORM |
| ![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white) | Caching & pub/sub |
| ![Socket.IO](https://img.shields.io/badge/Socket.io-010101?style=flat&logo=socketdotio&logoColor=white) | Real-time communication |
| ![Stripe](https://img.shields.io/badge/Stripe-635BFF?style=flat&logo=stripe&logoColor=white) | Payment processing |
| ![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white) | Infrastructure orchestration |

### Frontend (Mobile)

| Technology | Purpose |
|------------|---------|
| ![React Native](https://img.shields.io/badge/React_Native-20232A?style=flat&logo=react&logoColor=61DAFB) | Cross-platform mobile framework |
| ![Expo](https://img.shields.io/badge/Expo-000020?style=flat&logo=expo&logoColor=white) | Development platform & router |
| ![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white) | Type-safe development |
| ![Zustand](https://img.shields.io/badge/Zustand-443E38?style=flat&logo=zustand&logoColor=white) | State management |
| ![TanStack Query](https://img.shields.io/badge/TanStack%20Query-FF4154?style=flat&logo=reactquery&logoColor=white) | Server state & caching |
| ![Reanimated](https://img.shields.io/badge/Reanimated-3-FF6B6B?style=flat) | Animations |
| ![Axios](https://img.shields.io/badge/Axios-5A29E4?style=flat&logo=axios&logoColor=white) | HTTP client |

---

## Screenshots

### Authentication

<p align="center">
  <table>
    <tr>
      <td align="center" width="33%">
        <img src="screenshots/login.png" width="220" alt="Login Screen"/>
        <br/>
        <sub><b>Login</b></sub>
      </td>
      <td align="center" width="33%">
        <img src="screenshots/register.png" width="220" alt="Register Screen"/>
        <br/>
        <sub><b>Register</b></sub>
      </td>
    </tr>
  </table>
</p>

### Dashboard & Portfolio

<p align="center">
  <table>
    <tr>
      <td align="center" width="33%">
        <img src="screenshots/dashboard-1.png" width="220" alt="Dashboard"/>
        <br/>
        <sub><b>Dashboard</b></sub>
      </td>
      <td align="center" width="33%">
        <img src="screenshots/dashboard-2.png" width="220" alt="Portfolio Overview"/>
        <br/>
        <sub><b>Portfolio Overview</b></sub>
      </td>
      <td align="center" width="33%">
        <img src="screenshots/market.png" width="220" alt="Market Screen"/>
        <br/>
        <sub><b>Market</b></sub>
      </td>
    </tr>
  </table>
</p>

### Trading & Charts

<p align="center">
  <table>
    <tr>
      <td align="center" width="33%">
        <img src="screenshots/crypto-graph.png" width="220" alt="Crypto Chart"/>
        <br/>
        <sub><b>Crypto Chart</b></sub>
      </td>
      <td align="center" width="33%">
        <img src="screenshots/trade.png" width="220" alt="Trade Screen"/>
        <br/>
        <sub><b>Trade Execution</b></sub>
      </td>
      <td align="center" width="33%">
        <img src="screenshots/orderbook.png" width="220" alt="Placeholder"/>
        <br/>
        <sub><b>Order History</b></sub>
      </td>
    </tr>
  </table>
</p>

### Wallet & Profile

<p align="center">
  <table>
    <tr>
      <td align="center" width="33%">
        <img src="screenshots/wallet-1.png" width="220" alt="Wallet Screen"/>
        <br/>
        <sub><b>Wallet</b></sub>
      </td>
      <td align="center" width="33%">
        <img src="screenshots/wallet-2.png" width="220" alt="Deposit / Withdraw"/>
        <br/>
        <sub><b>Deposit / Withdraw</b></sub>
      </td>
      <td align="center" width="33%">
        <img src="screenshots/profile-1.png" width="220" alt="Profile Screen"/>
        <br/>
        <sub><b>Profile</b></sub>
      </td>
    </tr>
    <tr>
      <td align="center" width="33%">
        <img src="screenshots/profile-2.png" width="220" alt="Settings Screen"/>
        <br/>
        <sub><b>Settings</b></sub>
      </td>
      <td align="center" width="33%">
        <!-- Add more screenshots here -->
        <img src="screenshots/placeholder.png" width="220" alt="Placeholder"/>
        <br/>
        <sub><b>Notifications</b></sub>
      </td>
      <td align="center" width="33%">
        <!-- Add more screenshots here -->
        <img src="screenshots/placeholder.png" width="220" alt="Placeholder"/>
        <br/>
        <sub><b>Analytics</b></sub>
      </td>
    </tr>
  </table>
</p>



## 🚀 Installation

```bash
git clone https://github.com/<your-username>/nexustrade.git
cd nexustrade
npm install
cp .env.example .env
docker compose up -d
npm run dev
```

**Requirements**

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL
- Stripe test keys


## 📂 Project Structure

```
NexusTrade/
├── 📁 backend/
│   ├── 📁 gateway/                  # Nginx config (optional reverse proxy)
│   ├── 📁 scripts/                  # Operational scripts (e.g. seeding bot accounts)
│   ├── 📁 services/
│   │   ├── 📁 api-gateway/          # API Gateway (:3000)
│   │   ├── 📁 auth-service/         # Authentication (:3007)
│   │   ├── 📁 funding-service/      # Stripe funding (:3005)
│   │   ├── 📁 ledger-service/       # Transaction ledger
│   │   ├── 📁 liquidity-bot-service/# Market maker bot
│   │   ├── 📁 market-data-service/  # Live price streaming (:3003)
│   │   ├── 📁 matching-engine/      # Order book matching
│   │   ├── 📁 order-service/        # Order management (:3001)
│   │   └── 📁 wallet-service/       # Wallet & balances (:3004)
│   ├── 📁 shared/                   # Shared Kafka + middleware library
│   └── 🐳 docker-compose.yml        # Postgres, Redis, Kafka
│
└── 📁 frontend/
    ├── 📁 app/                      # Expo Router screens
    │   ├── 📁 (auth)/               # Login, Register
    │   └── 📁 (tabs)/               # Dashboard, Market, Wallet, Trade, Profile, Chart
    ├── 📁 constants/                # Colors, typography, API config
    ├── 📁 hooks/                    # React Query hooks per domain
    ├── 📁 lib/                      # Axios client, query client
    └── 📁 stores/                   # Zustand stores (auth, wallet, orders, market, funding)
```

---



##  Author

<div align="center">

  <b>Built by Ehsan ul haq</b>
  <br/>
  BSE Student | Backend & Mobile Developer
  <br/><br/>

  <a href="https://github.com/ahsan"><img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white" alt="GitHub"/></a>
  <a href="www.linkedin.com/in/ehsan-ul-haq-rind"><img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn"/></a>

</div>

---

## 📄 License

This project is currently **unlicensed** and intended for **portfolio and educational purposes** only.

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:0D47A1,100:00BCD4&height=100&section=footer" alt="Footer"/>
</p>
