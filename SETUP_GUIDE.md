# Quick Setup Guide

This guide will help you get the Cylinder Management ERP system up and running in minutes.

## Prerequisites Check

Before starting, ensure you have:
- ✅ Node.js (v16+): Run `node --version`
- ✅ PostgreSQL (v12+): Run `psql --version`
- ✅ npm or yarn: Run `npm --version`

## Quick Start (5 Minutes)

### Step 1: Database Setup (2 minutes)

1. Start PostgreSQL service:
```bash
# Windows
net start postgresql-x64-13

# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql
```

2. Create database:
```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE cylinder_erp;

# Exit
\q
```

### Step 2: Backend Setup (2 minutes)

1. Open terminal in project root and navigate to backend:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
# Windows
copy .env.example .env

# macOS/Linux
cp .env.example .env
```

4. Edit `.env` file with your database credentials:
```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=cylinder_erp
DB_USER=postgres
DB_PASSWORD=your_postgres_password

JWT_SECRET=my_super_secret_jwt_key_change_in_production
JWT_EXPIRE=30d
```

5. Start backend server:
```bash
npm run dev
```

You should see:
```
Database connected successfully
Database synced successfully
Server running on port 5000
```

### Step 3: Frontend Setup (1 minute)

1. Open a NEW terminal window and navigate to frontend:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start frontend server:
```bash
npm start
```

The browser will automatically open `http://localhost:3000`

### Step 4: Create First Super Admin User

With the backend running, open a new terminal and run:

```bash
curl -X POST http://localhost:5000/api/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"admin\",\"email\":\"admin@example.com\",\"password\":\"admin123\",\"fullName\":\"System Administrator\",\"role\":\"super_admin\"}"
```

Or use Postman/Thunder Client with:
- URL: `POST http://localhost:5000/api/auth/register`
- Body (JSON):
```json
{
  "username": "admin",
  "email": "admin@example.com",
  "password": "admin123",
  "fullName": "System Administrator",
  "role": "super_admin"
}
```

### Step 5: Login

1. Go to `http://localhost:3000/login`
2. Enter credentials:
   - Email: `admin@example.com`
   - Password: `admin123`
3. Click "Sign In"

🎉 **Success!** You're now logged into the Cylinder Management ERP system.

## What's Next?

### Create More Users

1. Go to "Employees" in the sidebar
2. Click "Add Employee"
3. Fill in the form:
   - Full Name
   - Username
   - Email
   - Password
   - Role (Employee, Admin, or Super Admin)
4. Click "Create"

### Add Cylinders

Navigate to "Cylinders" and add your cylinder inventory.

### Add Customers

Navigate to "Customers" and add your customer database.

### Create Sales Invoices

Navigate to "Sales Invoices" to start creating invoices.

## Common Issues & Solutions

### Issue: "Database connection error"

**Solution:**
1. Check PostgreSQL is running
2. Verify database credentials in `.env`
3. Ensure database `cylinder_erp` exists

### Issue: "Port 5000 already in use"

**Solution:**
1. Change PORT in backend `.env` to 5001
2. Update frontend proxy in `frontend/package.json`:
```json
"proxy": "http://localhost:5001"
```

### Issue: "npm install fails"

**Solution:**
1. Clear npm cache: `npm cache clean --force`
2. Delete `node_modules` folder
3. Run `npm install` again

### Issue: Frontend won't connect to backend

**Solution:**
1. Check both servers are running
2. Verify backend is on port 5000
3. Check browser console for errors

## Testing the System

### Test User Roles

1. **Super Admin Test:**
   - Login as super admin
   - Create an employee
   - Verify you can access all modules

2. **Admin Test:**
   - Create an admin user
   - Login as admin
   - Verify you can only view data (no create/edit/delete)

3. **Employee Test:**
   - Create an employee user
   - Login as employee
   - Verify limited access

### Test Sales Invoice Workflow

1. Create a customer
2. Add cylinders to inventory
3. Create a sales invoice (draft mode)
4. Verify stock is NOT deducted
5. Change invoice to "active"
6. Verify stock IS deducted
7. Delete the invoice
8. Verify stock is restored

### Test Date Restrictions

1. Login as employee
2. Try to create invoice with past date
3. Should see error message
4. Login as super admin
5. Create invoice with past date
6. Should succeed

## Development Workflow

### Running Both Servers Together

From root directory:
```bash
npm run install-all  # First time only
npm run dev          # Runs both servers
```

### Database Reset (Development Only)

```bash
# Drop and recreate database
psql -U postgres
DROP DATABASE cylinder_erp;
CREATE DATABASE cylinder_erp;
\q

# Restart backend - tables will be auto-created
```

### View API Documentation

Visit `http://localhost:5000/api/health` to verify backend is running.

## Production Deployment

See `DEPLOYMENT.md` for detailed deployment instructions.

## Support

If you encounter issues:
1. Check this guide first
2. Review `README.md` for detailed documentation
3. Check console/terminal for error messages
4. Verify all prerequisites are installed

## System Requirements

### Minimum:
- CPU: 2 cores
- RAM: 4GB
- Storage: 10GB
- Internet: Required for npm packages

### Recommended:
- CPU: 4 cores
- RAM: 8GB
- Storage: 50GB
- Internet: Stable connection

## Next Steps

1. ✅ System is running
2. ✅ First admin created
3. ⬜ Add employees
4. ⬜ Configure company settings
5. ⬜ Import/add cylinder inventory
6. ⬜ Add customer database
7. ⬜ Start creating invoices
8. ⬜ Train your team
9. ⬜ Go live!

## Quick Reference

### URLs
- Frontend: http://localhost:3000
- Backend: http://localhost:5000
- API Health: http://localhost:5000/api/health

### Default Credentials
- Super Admin: admin@example.com / admin123

### Important Files
- Backend config: `backend/.env`
- Frontend config: `frontend/package.json`
- Database: PostgreSQL `cylinder_erp`

### Useful Commands
```bash
# Start backend
cd backend && npm run dev

# Start frontend
cd frontend && npm start

# View backend logs
cd backend && npm run dev

# Build frontend for production
cd frontend && npm run build

# Database backup
pg_dump -U postgres cylinder_erp > backup.sql

# Database restore
psql -U postgres cylinder_erp < backup.sql
```

Happy managing! 🚀
