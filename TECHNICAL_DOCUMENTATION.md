# Technical Documentation

## System Architecture

### Overview

The Cylinder Management ERP is built using a modern three-tier architecture:

1. **Presentation Layer**: React-based SPA (Single Page Application)
2. **Application Layer**: Node.js/Express REST API
3. **Data Layer**: PostgreSQL relational database

```
┌─────────────────────────────────────────┐
│         Frontend (React)                │
│  - Components                           │
│  - Context API (State Management)       │
│  - Routing (React Router)               │
└─────────────────┬───────────────────────┘
                  │ HTTP/HTTPS
                  │ REST API
┌─────────────────▼───────────────────────┐
│      Backend (Node.js/Express)          │
│  - Controllers                          │
│  - Models (Sequelize ORM)               │
│  - Middleware (Auth, Validation)        │
│  - Routes                               │
└─────────────────┬───────────────────────┘
                  │ SQL
                  │
┌─────────────────▼───────────────────────┐
│       Database (PostgreSQL)             │
│  - Tables                               │
│  - Relationships                        │
│  - Constraints                          │
└─────────────────────────────────────────┘
```

## Database Schema

### Entity Relationship Diagram

```
┌──────────────┐         ┌──────────────┐
│    Users     │────┐    │  Customers   │
│              │    │    │              │
│ - id (PK)    │    │    │ - id (PK)    │
│ - username   │    │    │ - name       │
│ - email      │    │    │ - email      │
│ - password   │    │    │ - phone      │
│ - role       │    │    │ - balance    │
│ - signature  │    │    └──────┬───────┘
└──────┬───────┘    │           │
       │            │           │
       │            │           │
       │      ┌─────▼───────────▼──────┐
       │      │   SalesInvoices        │
       │      │                        │
       │      │ - id (PK)              │
       │      │ - invoiceNumber        │
       │      │ - customerId (FK)      │
       │      │ - employeeId (FK)      │
       │      │ - total                │
       │      │ - status               │
       │      │ - signatures           │
       │      └────────┬───────────────┘
       │               │
       │               │
┌──────▼───────┐  ┌───▼──────────────┐
│  Cylinders   │  │ InvoiceItems     │
│              │  │                  │
│ - id (PK)    │  │ - id (PK)        │
│ - number     │  │ - invoiceId (FK) │
│ - type       │◄─┤ - cylinderId(FK) │
│ - status     │  │ - quantity       │
│ - assigned   │  │ - price          │
└──────────────┘  └──────────────────┘
```

### Tables

#### users
- **Primary Key**: id (UUID)
- **Unique**: email, username
- **Indexes**: email, role
- **Relationships**: Has many cylinders, invoices, rentals, quotations, payments

#### cylinders
- **Primary Key**: id (UUID)
- **Unique**: cylinderNumber
- **Foreign Keys**: assignedToId → users(id)
- **Indexes**: status, cylinderType, assignedToId
- **Relationships**: Belongs to user, has many invoice items, rentals

#### customers
- **Primary Key**: id (UUID)
- **Unique**: customerCode, email
- **Indexes**: customerCode, email
- **Relationships**: Has many invoices, rentals, quotations, payments

#### sales_invoices
- **Primary Key**: id (UUID)
- **Unique**: invoiceNumber
- **Foreign Keys**: customerId → customers(id), employeeId → users(id)
- **Indexes**: invoiceDate, status, customerId
- **Relationships**: Belongs to customer and user, has many items and payments

#### sales_invoice_items
- **Primary Key**: id (UUID)
- **Foreign Keys**: invoiceId → sales_invoices(id), cylinderId → cylinders(id)
- **Relationships**: Belongs to invoice and cylinder

#### rentals
- **Primary Key**: id (UUID)
- **Unique**: rentalNumber
- **Foreign Keys**: customerId, cylinderId, employeeId
- **Indexes**: status, startDate, endDate
- **Relationships**: Belongs to customer, cylinder, and user

#### quotations
- **Primary Key**: id (UUID)
- **Unique**: quotationNumber
- **Foreign Keys**: customerId, employeeId
- **Indexes**: quotationDate, status
- **Relationships**: Belongs to customer and user, has many items

#### payments
- **Primary Key**: id (UUID)
- **Unique**: paymentNumber
- **Foreign Keys**: customerId, invoiceId, rentalId, employeeId
- **Indexes**: paymentDate, status
- **Relationships**: Belongs to customer, invoice/rental, and user

## API Design

### RESTful Principles

All endpoints follow REST conventions:
- **GET**: Retrieve resources
- **POST**: Create new resources
- **PUT**: Update existing resources
- **DELETE**: Remove resources

### Authentication

JWT (JSON Web Tokens) based authentication:

```javascript
// Login flow
POST /api/auth/login
Request: { email, password }
Response: { token, user }

// Protected endpoints
Headers: { Authorization: "Bearer <token>" }
```

### Authorization Middleware

```javascript
// Role-based access control
router.get('/resource', protect, authorize('super_admin'), handler);

// Date restriction middleware
router.post('/invoice', protect, checkDateRestriction, handler);
```

### Response Format

Standard response structure:

```javascript
// Success
{
  "success": true,
  "data": { ... },
  "count": 10 // for list endpoints
}

// Error
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error" // development only
}
```

## Frontend Architecture

### Component Structure

```
src/
├── components/
│   ├── Layout/
│   │   ├── Sidebar.js
│   │   ├── Header.js
│   │   └── MainLayout.js
│   ├── Common/
│   │   ├── Button.js
│   │   ├── Modal.js
│   │   └── Table.js
│   └── PrivateRoute.js
├── pages/
│   ├── Dashboard.js
│   ├── Employees.js
│   ├── Cylinders.js
│   └── Sales.js
├── context/
│   └── AuthContext.js
├── utils/
│   └── api.js
└── App.js
```

### State Management

Using React Context API for global state:

```javascript
// AuthContext
const AuthContext = createContext();

// Usage
const { user, login, logout } = useAuth();
```

### Routing

Protected routes with role-based access:

```javascript
<Route element={<PrivateRoute requiredRole="super_admin">
  <Employees />
</PrivateRoute>} />
```

## Business Logic Implementation

### Sales Invoice Workflow

```javascript
// Create Invoice
1. Validate customer and items
2. Generate invoice number
3. Calculate totals
4. Create invoice record
5. Create invoice items
6. If status = 'active':
   - Update cylinder status
   - Update customer balance
7. Commit transaction

// Delete Invoice
1. Find invoice
2. Check permissions
3. If status = 'active':
   - Reverse cylinder status
   - Reverse customer balance
4. Mark as deleted
5. Commit transaction
```

### Date Restrictions

```javascript
// Middleware check
if (userRole !== 'super_admin') {
  if (requestedDate < today) {
    return error('Only Super Admin can create past-dated records');
  }
}
```

### Stock Management

```javascript
// Draft invoice: No stock change
// Active invoice: Deduct stock
// Deleted invoice: Restore stock

switch (invoiceStatus) {
  case 'draft':
    // No action
    break;
  case 'active':
    updateCylinderStatus('rented');
    break;
  case 'deleted':
    updateCylinderStatus('available');
    break;
}
```

## Security

### Password Hashing

```javascript
// Using bcryptjs
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash(password, salt);
```

### JWT Configuration

```javascript
const token = jwt.sign(
  { id: user.id },
  process.env.JWT_SECRET,
  { expiresIn: '30d' }
);
```

### SQL Injection Prevention

Using Sequelize ORM with parameterized queries:

```javascript
// Safe from SQL injection
User.findOne({ where: { email: userInput } });
```

### XSS Prevention

- React automatically escapes values
- No innerHTML usage
- Sanitize user input before storage

### CORS Configuration

```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
```

## Performance Optimization

### Database Indexing

```javascript
// Indexes on frequently queried fields
indexes: [
  { fields: ['email'] },
  { fields: ['status'] },
  { fields: ['invoiceDate'] }
]
```

### Query Optimization

```javascript
// Use includes for related data
Invoice.findAll({
  include: [
    { model: Customer, attributes: ['id', 'name'] },
    { model: Items, include: [Cylinder] }
  ]
});
```

### Frontend Optimization

- Code splitting with React.lazy()
- Memoization with useMemo and useCallback
- Debouncing search inputs
- Pagination for large datasets

## Testing Strategy

### Unit Tests

```javascript
// Test individual functions
describe('Invoice Controller', () => {
  test('should create invoice', async () => {
    // Test logic
  });
});
```

### Integration Tests

```javascript
// Test API endpoints
describe('POST /api/sales-invoices', () => {
  test('should create invoice and update stock', async () => {
    // Test flow
  });
});
```

### End-to-End Tests

```javascript
// Test complete user flows
describe('Sales Invoice Flow', () => {
  test('user can create and delete invoice', async () => {
    // Test UI interactions
  });
});
```

## Error Handling

### Backend

```javascript
try {
  // Operation
} catch (error) {
  console.error(error);
  res.status(500).json({
    success: false,
    message: 'Operation failed',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
}
```

### Frontend

```javascript
try {
  await api.post('/endpoint', data);
  toast.success('Success message');
} catch (error) {
  toast.error(error.response?.data?.message || 'Operation failed');
}
```

## Logging

### Backend Logging

```javascript
// Winston or similar
logger.info('User logged in', { userId: user.id });
logger.error('Database error', { error: error.message });
```

### Frontend Logging

```javascript
// Console in development
if (process.env.NODE_ENV === 'development') {
  console.log('Debug info', data);
}
```

## Monitoring

### Health Check

```javascript
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime()
  });
});
```

### Metrics

- Response times
- Error rates
- Database query performance
- User activity

## Backup Strategy

### Database Backups

```bash
# Daily automated backups
pg_dump cylinder_erp > backup_$(date +%Y%m%d).sql

# Retention policy: 30 days
```

### File Backups

```bash
# Backup uploads folder
tar -czf uploads_backup.tar.gz uploads/
```

## Scaling Considerations

### Horizontal Scaling

- Load balancer for backend instances
- Database connection pooling
- Session management with Redis

### Vertical Scaling

- Increase server resources
- Database optimization
- Query caching

### CDN Integration

- Static assets on CDN
- CloudFront or similar
- Cache invalidation strategy

## Version Control

### Git Workflow

```bash
main (production)
  └── develop (staging)
       └── feature/* (feature branches)
```

### Commit Convention

```
feat: Add new feature
fix: Bug fix
docs: Documentation update
refactor: Code refactoring
test: Add tests
```

## API Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

## Maintenance Mode

```javascript
// Middleware to enable maintenance mode
const maintenanceMode = (req, res, next) => {
  if (process.env.MAINTENANCE_MODE === 'true') {
    return res.status(503).json({
      message: 'System under maintenance'
    });
  }
  next();
};
```

## Documentation Tools

- **API**: Swagger/OpenAPI
- **Database**: Schema diagrams
- **Code**: JSDoc comments
- **User**: User manual and training videos
