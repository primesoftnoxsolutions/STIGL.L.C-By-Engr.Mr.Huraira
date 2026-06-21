const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  MANAGER: 'manager',
  EMPLOYEE: 'employee'
});

const MANAGEMENT_ROLES = [ROLES.SUPER_ADMIN, ROLES.MANAGER];

const ROLE_ALIASES = {
  'super administrator': ROLES.SUPER_ADMIN,
  super_admin: ROLES.SUPER_ADMIN,
  superadmin: ROLES.SUPER_ADMIN,
  administrator: ROLES.MANAGER,
  admin: ROLES.MANAGER,
  manager: ROLES.MANAGER,
  employee: ROLES.EMPLOYEE
};

const normalizeRole = (role) => {
  if (!role) return '';
  const key = String(role).trim().toLowerCase();
  return ROLE_ALIASES[key] || key;
};

const isManagementRole = (role) => MANAGEMENT_ROLES.includes(normalizeRole(role));

const isSuperAdminRole = (role) => normalizeRole(role) === ROLES.SUPER_ADMIN;

const isManagerRole = (role) => normalizeRole(role) === ROLES.MANAGER;

const isEmployeeRole = (role) => normalizeRole(role) === ROLES.EMPLOYEE;

module.exports = {
  ROLES,
  MANAGEMENT_ROLES,
  ROLE_ALIASES,
  normalizeRole,
  isManagementRole,
  isSuperAdminRole,
  isManagerRole,
  isEmployeeRole
};
