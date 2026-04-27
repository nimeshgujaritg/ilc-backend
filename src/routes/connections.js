const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { getConnections, sendRequest, acceptRequest, rejectRequest } = require('../controllers/connectionsController');

const ceoOnly = [auth, rbac('CEO')];

router.get('/',                      ceoOnly, getConnections);
router.post('/request/:userId',      ceoOnly, sendRequest);
router.patch('/accept/:userId',      ceoOnly, acceptRequest);
router.patch('/reject/:userId',      ceoOnly, rejectRequest);

module.exports = router;