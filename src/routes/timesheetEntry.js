const {  getCurrentPayPeriodTimesheet, updateTimesheetEntry, getTimesheetByPayPeriod } = require("../controllers/timesheetEntry")

const router = require("express").Router()

router.get("/",getCurrentPayPeriodTimesheet);
router.put("/",updateTimesheetEntry);
router.get("/:payPeriodId",getTimesheetByPayPeriod);

module.exports = router;
