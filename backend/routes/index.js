const express = require('express');
const ledgerRoutes = require('./ledger.routes');
const reportsRoutes = require('./reports.routes');

const router = express.Router();

router.use(ledgerRoutes);
router.use(reportsRoutes);

module.exports = router;
