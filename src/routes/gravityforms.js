const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const gfController = require('../controllers/gfController');

// GET /api/gf/form — get form fields (any logged in user)
router.get('/form', auth, gfController.getForm);

// POST /api/gf/submit — submit form (CEO only)
router.post('/submit', auth, rbac('CEO'), gfController.submitForm);

// GET /api/gf/entry/:entryId — view entry (admin only)
router.get('/entry/:entryId', auth, rbac('ADMIN'), gfController.getEntry);

module.exports = router;