const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const rc = require('../controllers/resourcesController');

const adminOnly = [auth, rbac('ADMIN')];
const anyUser = [auth];

// ── RESOURCES
router.get('/resources',        anyUser,   rc.getAllResources);
router.post('/resources',       adminOnly, rc.createResource);
router.delete('/resources/:id', adminOnly, rc.deleteResource);

// ── GLIMPSES
router.get('/glimpses',         anyUser,   rc.getAllGlimpses);
router.post('/glimpses',        adminOnly, rc.createGlimpse);
router.delete('/glimpses/:id',  adminOnly, rc.deleteGlimpse);

module.exports = router;