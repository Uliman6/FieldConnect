const authService = require('../services/auth.service');

// Password validation helper
const validatePassword = (password) => {
  const errors = [];

  if (password.length < 12) {
    errors.push('at least 12 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('an uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('a lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('a number');
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('a special character (!@#$%^&*(),.?":{}|<>)');
  }

  if (errors.length > 0) {
    return { valid: false, message: 'Password must contain ' + errors.join(', ') };
  }
  return { valid: true };
};

// POST /api/auth/register
const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.message });
    }

    // New registrations are VIEWER by default (admin can upgrade later)
    const result = await authService.register({ email, password, name });

    res.status(201).json(result);
  } catch (error) {
    if (error.message === 'Email already registered') {
      return res.status(409).json({ error: error.message });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await authService.login({ email, password });

    res.json(result);
  } catch (error) {
    if (error.message === 'Invalid email or password' || error.message === 'Account is deactivated') {
      return res.status(401).json({ error: error.message });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

// GET /api/auth/me
const getCurrentUser = async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

// GET /api/auth/users (Admin only)
const getAllUsers = async (req, res) => {
  try {
    const users = await authService.getAllUsers();
    res.json({ users });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
};

// PATCH /api/auth/users/:id (Admin only)
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, isActive, password } = req.body;

    // Prevent admin from demoting themselves
    if (id === req.user.id && role && role !== req.user.role) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const user = await authService.updateUser(id, { name, role, isActive, password });
    res.json({ user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

// DELETE /api/auth/users/:id (Admin only)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await authService.deleteUser(id);
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// POST /api/auth/setup - One-time admin setup
const setupFirstAdmin = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.message });
    }

    const result = await authService.setupFirstAdmin({ email, password, name });
    res.status(201).json(result);
  } catch (error) {
    if (error.message === 'Setup already completed') {
      return res.status(403).json({ error: error.message });
    }
    console.error('Setup error:', error);
    res.status(500).json({ error: 'Setup failed' });
  }
};

// POST /api/auth/reset-admin - Emergency admin reset using server secret
const resetAdmin = async (req, res) => {
  try {
    const { secret } = req.body;
    const resetSecret = process.env.ADMIN_RESET_SECRET;

    if (!resetSecret) {
      return res.status(403).json({ error: 'Reset not configured' });
    }

    if (secret !== resetSecret) {
      return res.status(403).json({ error: 'Invalid secret' });
    }

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      return res.status(403).json({ error: 'Admin credentials not configured in environment' });
    }

    const result = await authService.resetAdmin({ email, password });
    res.json({ message: 'Admin reset successfully', email: result.user.email });
  } catch (error) {
    console.error('Reset admin error:', error);
    res.status(500).json({ error: 'Reset failed' });
  }
};

module.exports = {
  register,
  login,
  getCurrentUser,
  getAllUsers,
  updateUser,
  deleteUser,
  setupFirstAdmin,
  resetAdmin,
};
