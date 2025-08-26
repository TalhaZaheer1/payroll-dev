
// routes/auditTrail.routes.js
const express = require("express");
const router = express.Router();
const { listAuditTrail } = require("../controllers/auditTrail");

router.get("/", listAuditTrail);

module.exports = router;
