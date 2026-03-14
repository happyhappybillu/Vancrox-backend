# VANCROX Backend

## Setup

```bash
npm install
cp .env.example .env
# Fill in your .env values
npm run dev
```

## .env Variables

| Key | Value |
|-----|-------|
| PORT | 5000 |
| MONGO_URI | MongoDB connection string |
| MONGO_DB_NAME | vancrox |
| JWT_SECRET | your secret key |
| ADMIN_EMAIL | admin@vancrox.com |
| ADMIN_PASS | your admin password |

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register/investor | Register investor |
| POST | /api/auth/register/trader | Register trader |
| POST | /api/auth/login | Login |
| POST | /api/auth/admin/login | Admin login |
| GET  | /api/auth/me | Get current user |
| POST | /api/auth/change-password | Change password |

### Investor
| Method | Path | Description |
|--------|------|-------------|
| GET  | /api/investor/traders | Get active traders |
| POST | /api/investor/deposit/init | Init deposit (semi-auto) |
| POST | /api/investor/withdraw | Request withdrawal |
| POST | /api/investor/hire | Hire a trader |
| GET  | /api/investor/my-trades | My active trades |
| GET  | /api/investor/history | Transaction history |
| POST | /api/investor/wallet | Save wallet addresses |
| POST | /api/investor/profile | Update profile |

### Trader
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/trader/verify | Submit verification |
| GET  | /api/trader/ads | Get my ads |
| POST | /api/trader/ads | Create ad |
| PATCH| /api/trader/ads/:id | Toggle ad active/inactive |
| DELETE | /api/trader/ads/:id | Delete ad |
| GET  | /api/trader/trades | Get trade requests |
| POST | /api/trader/trades/:id/accept | Accept trade |
| POST | /api/trader/trades/:id/reject | Reject trade |
| POST | /api/trader/trades/:id/outcome | Set profit/loss |
| GET  | /api/trader/earnings | Earnings history |
| POST | /api/trader/withdraw | Withdraw earnings |
| POST | /api/trader/wallet | Save wallet addresses |
| POST | /api/trader/profile | Update profile |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| GET  | /api/admin/investors | All investors |
| GET  | /api/admin/traders | All traders |
| POST | /api/admin/users/:id/block | Block/unblock user |
| POST | /api/admin/traders/:id/verify | Approve/reject trader |
| GET  | /api/admin/approvals | All pending approvals |
| POST | /api/admin/approvals/:id/approve | Approve request |
| POST | /api/admin/approvals/:id/reject | Reject request |
| GET  | /api/admin/addresses | Get wallet addresses |
| POST | /api/admin/addresses | Save wallet addresses |
| GET  | /api/admin/reports/deposits | Deposit report |
| GET  | /api/admin/reports/withdrawals | Withdrawal report |
| GET  | /api/admin/tickets | All support tickets |
| POST | /api/admin/tickets/:id/reply | Reply to ticket |
| POST | /api/admin/tickets/:id/close | Close ticket |

### Notifications
| Method | Path | Description |
|--------|------|-------------|
| GET  | /api/notifications | Get all (investors/traders) |
| GET  | /api/notifications/admin | Get all (admin) |
| POST | /api/notifications | Create (admin) |
| PUT  | /api/notifications/:id | Update (admin) |
| DELETE | /api/notifications/:id | Delete (admin) |

### Support
| Method | Path | Description |
|--------|------|-------------|
| GET  | /api/support/my-ticket | Get my ticket |
| POST | /api/support/send | Send message |
| POST | /api/support/resolve | Close ticket |

## Business Logic

- **Deposit**: Semi-auto. Investor sends exact unique amount → Admin approves → balance credited.
- **Hire**: Investor balance deducted → Trader gets 5-min window → Accept/Reject/Auto-reject.
- **Profit**: `profit = amount × returnPct / 100` → Investor gets `amount + profit - 10%` → Trader earns `10% of profit`.
- **Loss**: Investor gets full amount back (100% refund guarantee).
- **Auto-reject**: Cron runs every 30s — auto-rejects trades older than 5 minutes.
