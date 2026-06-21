# Security Rules & Role Hierarchy

## Role Hierarchy

The system implements a strict three-tier role hierarchy:

```
Super Admin (Highest Authority)
    ↓
Admin (View Only)
    ↓
Employee (Operational)
```

## Access Control Rules

### 1. Super Admin Role

**Creation & Management:**
- ✅ **ONLY** Super Admin can create other Super Admin accounts
- ✅ Super Admin can create Admin and Employee accounts
- ✅ Super Admin can edit/delete all user types
- ✅ Super Admin has full system access
- ❌ Super Admin cannot delete their own account

**Special Permissions:**
- Can create records with past dates
- Can delete sales invoices
- Can access all modules
- Can manage company settings
- Full CRUD on all resources

### 2. Admin Role

**Restrictions:**
- ❌ **CANNOT** create Super Admin accounts
- ❌ **CANNOT** see Super Admin users in the list
- ❌ **CANNOT** edit or delete any data
- ❌ **CANNOT** access Super Admin panel
- ✅ Can view analytics and reports only
- ✅ Can save signature

### 3. Employee Role

**Restrictions:**
- ❌ **CANNOT** create Super Admin accounts
- ❌ **CANNOT** see Super Admin users
- ❌ **CANNOT** delete sales invoices
- ❌ **CANNOT** create past-dated records
- ✅ Can view assigned cylinders
- ✅ Can manage sales and customers
- ✅ Can save signature

## Backend Security Implementation

### User Registration Endpoint
```javascript
POST /api/auth/register
- Checks if requester is Super Admin before allowing user creation
- Prevents non-Super Admins from creating Super Admin accounts
- Automatically downgrades role if unauthorized
```

### User Listing Endpoint
```javascript
GET /api/users
- Filters out Super Admin users for non-Super Admin requesters
- Prevents querying Super Admin role by non-Super Admins
```

### User Update Endpoint
```javascript
PUT /api/users/:id
- Only Super Admin can update Super Admin accounts
- Prevents role escalation to Super Admin by non-Super Admins
- Blocks modification of Super Admin accounts by lower roles
```

### User Delete Endpoint
```javascript
DELETE /api/users/:id
- Only Super Admin can delete Super Admin accounts
- Prevents users from deleting themselves
- Soft delete (sets isActive = false)
```

## Frontend Security Features

### Employee Management Page
- Super Admin badge (⭐) shown for Super Admin users
- Clear role descriptions in dropdown
- Warning messages for permission requirements
- Only Super Admin can access this module

### Role Selection
- Employee: Basic operational access
- Admin (View Only): Analytics and reports only
- Super Admin (Full Access): Complete system control

## Security Validations

### ✅ Implemented Protections:

1. **Role Creation**
   - Non-Super Admins cannot create Super Admin accounts
   - Automatic role downgrade for unauthorized attempts

2. **Role Visibility**
   - Super Admin users hidden from non-Super Admin views
   - Separate user lists based on requester role

3. **Role Modification**
   - Cannot escalate privileges to Super Admin
   - Cannot modify Super Admin accounts without permission

4. **Role Deletion**
   - Cannot delete Super Admin accounts without permission
   - Self-deletion prevention

5. **API Protection**
   - All endpoints check user role
   - Unauthorized attempts return 403 Forbidden
   - Detailed error messages for security violations

## Testing Security

### Test Cases:

1. **Login as Employee**
   - Try to access /employees → Should be blocked
   - Check if Super Admin users visible → Should not see them

2. **Login as Admin**
   - Try to create/edit data → Should be blocked
   - Can only view analytics → Should work

3. **Login as Super Admin**
   - Create another Super Admin → Should work
   - Edit all user types → Should work
   - Delete own account → Should be blocked

## Error Messages

- `"Only Super Admin can create Super Admin accounts"`
- `"Unauthorized: Cannot create Super Admin accounts"`
- `"Unauthorized: Cannot modify Super Admin accounts"`
- `"Unauthorized: Cannot assign Super Admin role"`
- `"Unauthorized: Cannot delete Super Admin accounts"`
- `"Cannot delete your own account"`
- `"Unauthorized access"`

## Best Practices

1. **Always verify role before operations**
2. **Filter sensitive data based on requester role**
3. **Log security-related actions**
4. **Prevent privilege escalation**
5. **Use soft deletes for audit trails**
6. **Never expose Super Admin data to unauthorized users**

## Audit Trail

All security-related actions should be logged:
- User creation (especially Super Admin)
- Role changes
- Permission violations
- Failed authorization attempts
- User deletions

---

**Last Updated:** 2026-01-29
**Security Level:** Enterprise Grade
**Compliance:** Role-Based Access Control (RBAC)
