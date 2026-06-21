# Deployment Guide (Easy + Production)

This file is updated for the current codebase in this repository.

## 1) Current System Reality (Important)

- Backend: Node.js + Express + Sequelize
- Frontend: React (build folder served by Nginx/static hosting)
- Database (default): SQLite file at `backend/database.sqlite`
- Database (optional): PostgreSQL (supported via env vars)
- MongoDB: config file exists (`backend/config/mongo.js`) but it is **not used by server startup right now**

If you want fastest deployment, use SQLite first.  
If you want scalable production DB, use PostgreSQL.

### Project Deploy Kaise Hoga (Short Answer - Roman Urdu)

1. Server par code clone hoga aur dependencies install hongi (`npm run install-all`).
2. Backend `.env` set hoga (default `DB_DIALECT=sqlite`), phir backend PM2 par `:5000` port par run karega.
3. Frontend ka production build banega (`frontend/build`).
4. Nginx frontend static files serve karega aur `/api` ko backend `127.0.0.1:5000` par proxy karega.
5. Domain Nginx se bind hoga, SSL (Let's Encrypt) enable hogi.
6. Is tarah user browser se frontend open karega, aur sari API calls `/api/...` route se backend tak jayengi.

## 2) Fastest Production Deployment (Single Ubuntu VPS)

Use this when you want quick and stable deployment with minimum setup.

### Prerequisites

- Ubuntu 22.04/24.04 VPS
- Domain (optional but recommended)
- Ports open: `80`, `443`, `22`

### Step 1: Install system packages

```bash
sudo apt update
sudo apt install -y nginx git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

### Step 2: Clone project and install deps

```bash
git clone <YOUR_REPO_URL> app
cd app
npm run install-all
```

### Step 3: Backend environment (SQLite default)

Create `backend/.env`:

```env
PORT=5000
NODE_ENV=production

# Default DB mode (SQLite)
DB_DIALECT=sqlite
# Optional custom file path:
# DB_STORAGE=/var/www/cylinder-erp/database.sqlite

JWT_SECRET=replace_with_long_random_secret_min_32_chars
JWT_EXPIRE=30d

UPLOAD_PATH=./uploads
MAX_FILE_SIZE=5242880
DB_SYNC_ALTER=false
DB_SYNC_FORCE=false
```

### Step 4: Run backend with PM2

```bash
cd backend
pm2 start server.js --name cylinder-erp-backend
pm2 save
pm2 startup
```

Health check:

```bash
curl http://127.0.0.1:5000/api/health
```

### Step 5: Build frontend

```bash
cd ../frontend
REACT_APP_API_URL=/api npm run build
```

### Step 6: Configure Nginx

Create `/etc/nginx/sites-available/cylinder-erp`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    root /path/to/app/frontend/build;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri /index.html;
    }
}
```

Enable config:

```bash
sudo ln -s /etc/nginx/sites-available/cylinder-erp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 3) Enable HTTPS (Recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## 4) PostgreSQL Deployment (Optional)

If you do not want SQLite in production, use PostgreSQL.

### PostgreSQL env example

```env
PORT=5000
NODE_ENV=production

DB_DIALECT=postgres
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=cylinder_erp
DB_USER=postgres
DB_PASSWORD=strong_password_here

JWT_SECRET=replace_with_long_random_secret_min_32_chars
JWT_EXPIRE=30d

UPLOAD_PATH=./uploads
MAX_FILE_SIZE=5242880
DB_SYNC_ALTER=false
DB_SYNC_FORCE=false
```

Install postgres client/server as needed and create DB/user before starting backend.

## 5) MongoDB Note (Clear Status)

Current backend startup (`backend/server.js`) authenticates only Sequelize DB.
It does not call `connectMongo()`.

So:
- MongoDB is **not required** for current system deployment.
- If you want MongoDB integration, you must add it in server startup and implement models/routes that actually use it.

If you still want a Mongo URI in env for future use:

```env
MONGO_URI=mongodb://127.0.0.1:27017/cylinder_erp
```

## 6) First Time Admin Setup

After backend is running:

```bash
cd backend
npm run create-admin
```

Or seed sample data:

```bash
cd backend
npm run seed
```

## 7) Update / Redeploy Flow

```bash
cd /path/to/app
git pull
npm run install-all
cd frontend && REACT_APP_API_URL=/api npm run build
cd ../backend && pm2 restart cylinder-erp-backend
sudo systemctl reload nginx
```

## 8) Backups

### SQLite backup

```bash
cp /path/to/app/backend/database.sqlite /path/to/backups/database_$(date +%F_%H-%M).sqlite
```

### PostgreSQL backup

```bash
pg_dump -h 127.0.0.1 -U postgres cylinder_erp > /path/to/backups/cylinder_erp_$(date +%F_%H-%M).sql
```

## 9) Useful Ops Commands

```bash
pm2 status
pm2 logs cylinder-erp-backend --lines 200
sudo systemctl status nginx
curl http://127.0.0.1:5000/api/health
```

## 10) Common Issues

- `502 Bad Gateway`:
  backend not running or wrong `proxy_pass` in Nginx
- Frontend loads but API fails:
  build with `REACT_APP_API_URL=/api` and verify Nginx `/api/` proxy
- DB connection error:
  check `backend/.env` values and restart PM2
- JWT login problems after env change:
  restart backend and clear browser local storage token
