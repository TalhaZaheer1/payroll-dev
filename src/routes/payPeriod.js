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
const { requireAuth } = require("../middlewares/auth");

const router = require("express").Router();

router.get("/",requireAuth, getAllPayPeriods);
router.post("/",requireAuth, createNewPayPeriod);

router.get("/current-id",requireAuth, getCurrentPayPeriodId);
router.get("/details/:payPeriodId",requireAuth, getPayPeriodDetails);
router.get("/days/:payPeriodId",requireAuth, getPayPeriodDays);

// NEW: auto-creation controls
router.get("/auto-creation",requireAuth, getAutoCreation);
router.put("/auto-creation",requireAuth, setAutoCreation);

// NEW: safe manual trigger to ensure current period exists (can be called on boot/crons)
router.post("/ensure", ensureCurrentPayPeriod);

module.exports = router;
