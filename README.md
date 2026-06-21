# Cylinder Management ERP System

A comprehensive Enterprise Resource Planning (ERP) system designed specifically for cylinder management businesses. This system provides role-based access control, inventory tracking, sales management, rental operations, and financial reporting.

## Features

### User Roles & Permissions

#### Super Admin
- Full system access
- Create and manage employees
- Assign roles and permissions
- Create sales/purchases with past dates
- Manage company settings
- Save signature

#### Admin
- View-only access to analytics and reports
- Cannot create, edit, or delete data
- Save signature

#### Employee
- View assigned cylinders and stock
- Manage sales and customer interactions
- Cannot delete sales invoices
- Cannot create records with past dates
- View profile and signature

### Core Modules

1. **Dashboard**
   - Key metrics overview
   - Cylinder stock status
   - Sales analytics
   - Employee performance tracking
   - Signature management

2. **Employee Management** (Super Admin Only)
   - Create/edit employee profiles
   - Role assignment
   - Performance tracking
   - Attendance management

3. **Inventory Management**
   - Cylinder tracking by status (available, filled, empty, damaged, rented)
   - Stock movement tracking
   - Cylinder assignment to employees

4. **Sales & Distribution**
   - Customer order management
   - Sales invoices with dual signatures
   - Draft invoice support (no stock deduction)
   - Payment tracking
   - Credit limit management
   - Automatic stock reversal on deletion

5. **Rental Collection**
   - Rental agreements
   - Payment tracking
   - Overdue rental alerts

6. **Quotation Management**
   - Generate quotations
   - Track status and conversions
   - Convert to invoices

7. **Collection Page**
   - Payment collection
   - Invoice history
   - Outstanding balance tracking

## Technology Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Sequelize
- **Authentication**: JWT (JSON Web Tokens)
- **Password Hashing**: bcryptjs

### Frontend
- **Framework**: React 18
- **Routing**: React Router v6
- **Styling**: Tailwind CSS
- **Icons**: Heroicons
- **HTTP Client**: Axios
- **Notifications**: React Hot Toast
- **Signatures**: React Signature Canvas
- **Charts**: Recharts

## Installation

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### Database Setup

1. Install PostgreSQL and create a database:
```sql
CREATE DATABASE cylinder_erp;
```

2. Create a user (optional):
```sql
CREATE USER your_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE cylinder_erp TO your_user;
```

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file from the example:
```bash
cp .env.example .env
```

4. Update the `.env` file with your database credentials:
```env
PORT=5000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cylinder_erp
DB_USER=your_user
DB_PASSWORD=your_password

# JWT Secret
JWT_SECRET=your_jwt_secret_key_change_this_in_production
JWT_EXPIRE=30d
```

5. Start the backend server:
```bash
npm run dev
```

The backend will start on `http://localhost:5000` and automatically create database tables.

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Install Tailwind CSS:
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init
```

4. Start the frontend development server:
```bash
npm start
```

The frontend will start on `http://localhost:3000`

### Running Both Servers

From the root directory:
```bash
npm run install-all  # Install all dependencies
npm run dev          # Run both servers concurrently
```

## Default Users

After the first run, create a super admin user via API or database:

```javascript
// Super Admin
POST /api/auth/register
{
  "username": "admin",
  "email": "admin@example.com",
  "password": "password123",
  "fullName": "System Administrator",
  "role": "super_admin"
}
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - Register new user (Super Admin only)
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/signature` - Update user signature

### Users (Super Admin Only)
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Deactivate user
- `PUT /api/users/:id/reset-password` - Reset user password

### Cylinders
- `GET /api/cylinders` - Get all cylinders
- `GET /api/cylinders/:id` - Get cylinder by ID
- `POST /api/cylinders` - Create cylinder (Super Admin)
- `PUT /api/cylinders/:id` - Update cylinder (Super Admin)
- `DELETE /api/cylinders/:id` - Delete cylinder (Super Admin)
- `GET /api/cylinders/stats` - Get cylinder statistics

### Customers
- `GET /api/customers` - Get all customers
- `GET /api/customers/:id` - Get customer by ID
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Deactivate customer (Super Admin)

### Sales Invoices
- `GET /api/sales-invoices` - Get all invoices
- `GET /api/sales-invoices/:id` - Get invoice by ID
- `POST /api/sales-invoices` - Create invoice
- `PUT /api/sales-invoices/:id` - Update invoice
- `DELETE /api/sales-invoices/:id` - Delete invoice (Super Admin/Admin)
- `GET /api/sales-invoices/stats` - Get sales statistics

### Rentals
- `GET /api/rentals` - Get all rentals
- `GET /api/rentals/:id` - Get rental by ID
- `POST /api/rentals` - Create rental
- `PUT /api/rentals/:id` - Update rental
- `DELETE /api/rentals/:id` - Delete rental (Super Admin)
- `GET /api/rentals/stats` - Get rental statistics

### Quotations
- `GET /api/quotations` - Get all quotations
- `GET /api/quotations/:id` - Get quotation by ID
- `POST /api/quotations` - Create quotation
- `PUT /api/quotations/:id` - Update quotation
- `DELETE /api/quotations/:id` - Delete quotation (Super Admin)
- `GET /api/quotations/stats` - Get quotation statistics

### Payments
- `GET /api/payments` - Get all payments
- `GET /api/payments/:id` - Get payment by ID
- `POST /api/payments` - Create payment
- `PUT /api/payments/:id` - Update payment (Super Admin)
- `DELETE /api/payments/:id` - Delete payment (Super Admin)
- `GET /api/payments/stats` - Get payment statistics

### Dashboard
- `GET /api/dashboard/overview` - Get dashboard overview
- `GET /api/dashboard/sales-chart` - Get sales chart data

## Business Logic

### Sales Invoice Management
1. **Draft Invoices**: Invoices created with status "draft" do not affect stock levels
2. **Active Invoices**: Automatically deduct from stock when created or when status changes from draft to active
3. **Stock Reversal**: Deleting an invoice automatically restores stock levels
4. **Employee Restrictions**: Employees cannot delete invoices
5. **Date Restrictions**: Only Super Admin can create invoices with past dates

### Signature Management
- Super Admin and Employees can save signatures
- Sales invoices include both employee signature and received-by signature
- Signatures are stored as base64 encoded images

### Role-Based Permissions
- All API endpoints enforce role-based access control
- Middleware validates user permissions before processing requests
- Employees can only view their assigned cylinders

## Deployment

### PostgreSQL Setup
1. Install PostgreSQL on your server
2. Create production database
3. Update connection string in production `.env`

### Backend Deployment (AWS/Azure)
1. Set up Node.js environment
2. Install dependencies
3. Set environment variables
4. Run database migrations
5. Start the server with PM2 or similar process manager

### Frontend Deployment
1. Build the production bundle:
```bash
npm run build
```
2. Deploy the `build` folder to your hosting service (Netlify, Vercel, AWS S3, etc.)
3. Configure environment variables for API URL

## Security Considerations

1. Change default JWT secret in production
2. Use strong passwords for database users
3. Enable HTTPS for production
4. Implement rate limiting on API endpoints
5. Regular security audits and updates
6. Proper backup strategies for database

## Support & Maintenance

For ongoing support and maintenance:
- Monitor error logs
- Regular database backups
- Keep dependencies updated
- Performance monitoring
- User training and documentation

## License

MIT License - See LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Contact

For questions or support, please contact the development team.
