const router = require("express").Router();
const { createEmployeesBulk,  getAllEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  deleteEmployeesBulk
 } = require("../controllers/employee");


router.get("/", getAllEmployees);
router.post("/add", createEmployee);
router.post("/bulk",createEmployeesBulk)
router.put("/:id", updateEmployee);
router.delete("/:id",deleteEmployee)
router.post("/bulk-delete", deleteEmployeesBulk);
module.exports = router;
