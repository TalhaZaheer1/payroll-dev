const { createNewPayPeriod, getAllPayPeriods, getCurrentPayPeriodId, getPayPeriodDetails, getPayPeriodDays } = require("../controllers/payPeriod")

const router = require("express").Router()

router.get("/",getAllPayPeriods);
router.post("/",createNewPayPeriod);
router.get("/current-id",getCurrentPayPeriodId);
router.get("/details/:payPeriodId",getPayPeriodDetails);
router.get("/days/:payPeriodId",getPayPeriodDays)

module.exports = router
