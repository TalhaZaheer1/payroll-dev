const {
  createNewPayPeriod,
  getAllPayPeriods,
  getCurrentPayPeriodId,
  getPayPeriodDetails,
  getPayPeriodDays,
  // NEW:
  getAutoCreation,
  setAutoCreation,
  ensureCurrentPayPeriod,
} = require("../controllers/payPeriod");

const router = require("express").Router();

router.get("/", getAllPayPeriods);
router.post("/", createNewPayPeriod);

router.get("/current-id", getCurrentPayPeriodId);
router.get("/details/:payPeriodId", getPayPeriodDetails);
router.get("/days/:payPeriodId", getPayPeriodDays);

// NEW: auto-creation controls
router.get("/auto-creation", getAutoCreation);
router.put("/auto-creation", setAutoCreation);

// NEW: safe manual trigger to ensure current period exists (can be called on boot/crons)
router.post("/ensure", ensureCurrentPayPeriod);

module.exports = router;
